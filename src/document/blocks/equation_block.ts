/**
 * EquationBlockComponent — In-flow atomic equation block
 * 
 * Implements Word's equation object model:
 * 1. Default (Idle): Typeset mathematics rendered directly via typesetMath().
 * 2. Single click: Selects block as an atomic unit (focus border). Arrow keys step over in one press.
 * 3. Double-click (or Enter when selected): Enters active text editing mode.
 * 4. In edit mode: Autocomplete active, incomplete commands stay literal.
 * 5. Escape (or blur): Commits changes, compiles AST in worker, returns to atomic typeset view.
 */

import { DocumentBlock, BlockType } from "../block_model";
import { typesetMath } from "../../core/math_typeset";
import { AutocompleteController, AutocompleteTarget } from "../autocomplete";
import { axineToLatex, latexToAxine, mathFieldUnrepresentableReason } from "../axine_latex_bridge";
import "mathlive";

// MathLive rewrites what is typed unless these are off: smart fences add
// invisible delimiters, inline shortcuts turn "pi" and "sin" into commands,
// and a space is otherwise dropped in math mode.
function configureMathField(mf: any) {
  mf.smartFence = false;
  mf.smartSuperscript = false;
  mf.smartMode = false;
  mf.inlineShortcuts = {};
  mf.mathModeSpace = "\\ ";
}

// "_" and "/" are Axine characters, not a subscript and a fraction.
function literalFieldInsert(key: string): string | null {
  if (key === "_") return "\\_";
  if (key === "/") return "/";
  return null;
}


// Navigation and deletion keys applied to the field after it takes focus.
const HELD_KEY_COMMANDS: Record<string, string> = {
  End: "moveToMathfieldEnd",
  Home: "moveToMathfieldStart",
  ArrowLeft: "moveToPreviousChar",
  ArrowRight: "moveToNextChar",
  Backspace: "deleteBackward",
  Delete: "deleteForward",
};

const mathFieldFailures = new Map<string, string | null>();
let scratchField: any = null;
let scratchWarmupScheduled = false;

function ensureScratchField(): any {
  if (!scratchField || !scratchField.isConnected) {
    scratchField = document.createElement("math-field");
    scratchField.setAttribute("aria-hidden", "true");
    scratchField.tabIndex = -1;
    // Fixed, so MathLive scrolling its caret into view never scrolls the page.
    scratchField.style.cssText = "position:fixed;left:-10000px;top:0;visibility:hidden;";
    document.body.appendChild(scratchField);
    configureMathField(scratchField);
  }
  return scratchField;
}

// The first math field on a page takes about 130ms to build. Build the check
// field while the page is idle so opening the first equation does not wait.
function scheduleScratchWarmup() {
  if (scratchWarmupScheduled || typeof window === "undefined") return;
  scratchWarmupScheduled = true;
  const idle = (window as any).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 200));
  idle(() => {
    try {
      ensureScratchField();
    } catch {
      scratchWarmupScheduled = false;
    }
  });
}

/**
 * Why the source cannot be edited in MathLive without changing it, or null.
 * The source is loaded into a hidden field and given a neutral edit, which
 * makes MathLive re-serialize its model exactly as a real edit would; the
 * decoded result must be the source, byte for byte.
 */
function mathFieldFailure(source: string): string | null {
  const structural = mathFieldUnrepresentableReason(source);
  if (structural) return structural;
  const cached = mathFieldFailures.get(source);
  if (cached !== undefined) return cached;

  let failure: string | null = null;
  try {
    const field = ensureScratchField();
    field.value = axineToLatex(source);
    field.executeCommand("moveToMathfieldEnd");
    field.insert("x");
    field.executeCommand("deleteBackward");
    const decoded = latexToAxine(field.value);
    if (decoded !== source) {
      failure = "MathLive stores it as " + JSON.stringify(decoded);
    }
  } catch {
    failure = "MathLive could not load it";
  }
  mathFieldFailures.set(source, failure);
  return failure;
}

export interface EquationBlockOptions {
  onSelect?: (blockId: string) => void;
  onCommit?: (blockId: string, newSource: string) => void;
  onStepNext?: () => void;
  onStepPrev?: () => void;
  onDeleteRequest?: (blockId: string, direction?: "prev" | "next") => void;
  onRequestTransform?: (blockId: string, targetType: BlockType, source: string, caretOffset?: number) => void;
  onRequestSelectAll?: () => void;
  clickToEdit?: boolean;
}

export class EquationBlockComponent {
  public readonly el: HTMLElement;
  private block: DocumentBlock;
  private options: EquationBlockOptions;
  private renderedContainer: HTMLElement;
  private editorContainer: HTMLElement;
  private textarea: HTMLTextAreaElement | null = null;
  private autocomplete: AutocompleteController | null = null;
  private isEditing: boolean = false;
  private isSelected: boolean = false;
  private blurTimer: any = null;
  // Axine source most recently loaded into the math field, and the field's
  // parsed content at load time. While the field's content is unchanged, the
  // source is returned byte-for-byte; the field's LaTeX is translated back only
  // after the content differs. An edit that restores the starting content also
  // restores the original source.
  private fieldSource: string = "";
  private fieldBaseline: string | null = null;
  private releaseHeldKeys: (() => void) | null = null;
  private applyHeldKeys: (() => string | null) | null = null;

  constructor(block: DocumentBlock, options: EquationBlockOptions = {}) {
    this.block = block;
    this.options = options;

    this.el = document.createElement("div");
    this.el.className = "doc-block doc-block-equation";
    this.el.tabIndex = 0;
    this.el.setAttribute("data-block-id", block.id);
    this.el.setAttribute("data-atomic", "true");

    this.renderedContainer = document.createElement("div");
    this.renderedContainer.className = "doc-equation-typeset-view";
    this.el.appendChild(this.renderedContainer);

    this.editorContainer = document.createElement("div");
    this.editorContainer.className = "doc-equation-editor-view hidden";
    this.el.appendChild(this.editorContainer);

    this.renderTypesetMath();
    this.bindEvents();
    scheduleScratchWarmup();
  }

  // The field's parsed content. `value` returns the assigned string verbatim
  // until the first edit and MathLive's normalization afterwards, so it cannot
  // tell an edit apart; the expanded serialization of the parsed model can.
  private fieldContent(mfEl: any): string {
    return typeof mfEl.getValue === "function" ? mfEl.getValue("latex-expanded") : String(mfEl.value);
  }

  private loadSourceIntoField(mfEl: any, source: string) {
    mfEl.value = axineToLatex(source);
    this.fieldSource = source;
    this.fieldBaseline = this.fieldContent(mfEl);
  }

  private sourceFromField(mfEl: any): string {
    if (this.fieldContent(mfEl) === this.fieldBaseline) {
      return this.fieldSource;
    }
    return latexToAxine(mfEl.value);
  }

  private renderTypesetMath() {
    try {
      this.renderedContainer.innerHTML = typesetMath(this.block.source, { displayMode: true });
    } catch {
      this.renderedContainer.textContent = this.block.source;
    }
  }

  private bindEvents() {
    // Single Click: Select atomic block, and enter edit mode if clickToEdit is enabled
    this.el.addEventListener("click", (e: MouseEvent) => {
      if (!this.isEditing) {
        this.setSelected(true);
        this.options.onSelect?.(this.block.id);
        if (this.options.clickToEdit) {
          this.enterEditMode({ x: e.clientX, y: e.clientY });
        }
      }
    });

    // Double Click: Enter edit mode
    this.el.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      this.enterEditMode();
    });

    // Keyboard navigation and Enter/Escape transitions
    this.el.addEventListener("keydown", (e: KeyboardEvent) => {
      if (!this.isEditing) {
        if (e.key === "Enter") {
          e.preventDefault();
          this.enterEditMode("start");
          return;
        }
        if (e.key === "ArrowDown" || e.key === "ArrowRight") {
          e.preventDefault();
          this.options.onStepNext?.();
          return;
        }
        if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
          e.preventDefault();
          this.options.onStepPrev?.();
          return;
        }
        if (e.key === "Delete") {
          e.preventDefault();
          this.options.onDeleteRequest?.(this.block.id);
          return;
        }
        if (e.key === "Backspace") {
          e.preventDefault();
          if (this.options.onRequestTransform) {
            this.options.onRequestTransform(this.block.id, "paragraph", "", 0);
          } else {
            this.options.onDeleteRequest?.(this.block.id);
          }
          return;
        }
      } else {
        if (e.key === "Escape") {
          e.preventDefault();
          this.exitEditMode(true);
          return;
        }
      }
    });
  }

  public enterEditMode(caretPosition?: number | string | { x: number; y: number }) {
    if (this.isEditing) return;
    this.isEditing = true;

    this.renderedContainer.classList.add("hidden");
    this.editorContainer.classList.remove("hidden");
    this.el.classList.add("editing");
    this.el.removeAttribute("data-atomic");

    this.editorContainer.innerHTML = "";

    // 1. MathLive math-field element for structured, seam-aware math editing,
    // used only when the source survives MathLive unchanged; otherwise the
    // equation is edited as text.
    let mfEl: any = null;
    let fieldFailure = mathFieldFailure(this.block.source);
    if (fieldFailure === null) {
      try {
        mfEl = document.createElement("math-field") as any;
        mfEl.className = "doc-block-source-input doc-equation-mathfield";
        mfEl.mathVirtualKeyboardPolicy = "manual";
        // MathLive accepts these options only once the element is connected.
        this.editorContainer.appendChild(mfEl);
        configureMathField(mfEl);
        this.loadSourceIntoField(mfEl, this.block.source);
      } catch {
        mfEl?.remove();
        mfEl = null;
        fieldFailure = "MathLive could not open it";
      }
    }
    this.el.dataset.editSurface = mfEl ? "math" : "text";
    if (fieldFailure) {
      this.el.dataset.textEditReason = fieldFailure;
    } else {
      delete this.el.dataset.textEditReason;
    }

    // 2. Backing textarea for accessibility, headless tests, and full Axine source synchronization
    this.textarea = document.createElement("textarea");
    this.textarea.className = "doc-block-source-input doc-equation-input";
    this.textarea.value = this.block.source;
    this.textarea.style.overflow = "hidden";
    this.textarea.style.resize = "none";
    this.textarea.rows = Math.max(1, this.block.source.split("\n").length);
    if (mfEl) {
      this.textarea.style.position = "absolute";
      this.textarea.style.top = "0";
      this.textarea.style.left = "0";
      this.textarea.style.width = "100%";
      this.textarea.style.height = "100%";
      this.textarea.style.opacity = "0";
      this.textarea.style.pointerEvents = "none";
    }
    this.editorContainer.appendChild(this.textarea);

    this.autocomplete = new AutocompleteController(this.editorContainer, (_accepted) => {
      if (this.textarea) {
        const val = this.textarea.value;
        if (mfEl) {
          this.loadSourceIntoField(mfEl, val);
        }
        this.block.source = val;
        this.options.onCommit?.(this.block.id, val);
      }
    });

    const mfTarget: AutocompleteTarget = {
      getValue: () => (mfEl ? this.sourceFromField(mfEl) : ""),
      setValue: (v: string) => {
        if (mfEl) {
          this.loadSourceIntoField(mfEl, v);
        }
        if (this.textarea) {
          this.textarea.value = v;
          this.textarea.rows = Math.max(1, v.split("\n").length);
        }
        this.block.source = v;
        this.options.onCommit?.(this.block.id, v);
      },
      getSelectionStart: () => {
        if (mfEl && typeof mfEl.position === "number") {
          return mfEl.position;
        }
        return 0;
      },
      setSelection: (s: number, _e: number) => {
        if (mfEl && typeof mfEl.position === "number") {
          mfEl.position = s;
        }
        if (this.textarea) {
          this.textarea.selectionStart = s;
          this.textarea.selectionEnd = s;
        }
      },
      getCaretCoordinates: () => {
        if (mfEl && typeof mfEl.getBoundingClientRect === "function") {
          const containerRect = this.editorContainer.getBoundingClientRect();
          const mfRect = mfEl.getBoundingClientRect();
          return {
            x: Math.max(0, mfRect.left - containerRect.left),
            y: Math.max(0, mfRect.bottom - containerRect.top + 4),
          };
        }
        return { x: 0, y: 28 };
      },
    };

    const taTarget: AutocompleteTarget = {
      getValue: () => this.textarea?.value || "",
      setValue: (v: string) => {
        if (this.textarea) {
          this.textarea.value = v;
          this.textarea.rows = Math.max(1, v.split("\n").length);
        }
        if (mfEl) {
          this.loadSourceIntoField(mfEl, v);
        }
        this.block.source = v;
        this.options.onCommit?.(this.block.id, v);
      },
      getSelectionStart: () => {
        if (!this.textarea) return 0;
        return this.textarea.selectionStart || this.textarea.value.length;
      },
      setSelection: (s: number, e: number) => {
        if (this.textarea) {
          this.textarea.selectionStart = s;
          this.textarea.selectionEnd = e;
        }
        if (mfEl && typeof mfEl.position === "number") {
          mfEl.position = s;
        }
      },
      getCaretCoordinates: () => {
        const containerRect = this.editorContainer.getBoundingClientRect();
        return { x: 0, y: Math.max(28, containerRect.height) };
      },
    };

    if (mfEl) {
      // "_" and "/" are Axine characters, not a subscript and a fraction.
      // Capture phase on the host runs before MathLive's own handler.
      mfEl.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const literal = literalFieldInsert(e.key);
        if (literal) {
          e.preventDefault();
          e.stopPropagation();
          mfEl.executeCommand(["insert", literal]);
        }
      }, { capture: true });

      // MathLive moves focus into the field asynchronously after focus()
      // returns. Keys pressed in that window arrive at the block element; hold
      // every one of them, in order, and apply them once the field has focus.
      const heldKeys: string[] = [];
      const holdKey = (e: KeyboardEvent) => {
        // hasFocus() reports true once focus is requested; activeElement
        // reports where keys actually go.
        if (!this.isEditing || document.activeElement === mfEl || e.metaKey || e.ctrlKey || e.altKey) return;
        // Only keys that landed on the block itself; keys aimed at an element
        // inside the editor belong to that element.
        if (e.target !== this.el) return;
        if (e.key === "Shift" || e.key === "Alt" || e.key === "Control" || e.key === "Meta") return;
        e.preventDefault();
        e.stopImmediatePropagation();
        heldKeys.push(e.key);
      };
      this.el.addEventListener("keydown", holdKey, true);
      this.releaseHeldKeys = () => {
        this.el.removeEventListener("keydown", holdKey, true);
        this.releaseHeldKeys = null;
      };
      // Applies held keys to the field. Runs of characters are inserted as
      // the Axine text they spell, the same encoding a loaded source gets;
      // MathLive's "typedText" command is not equivalent to typing (it drops
      // spaces and stores ":" as a spacing command). Returns the key that
      // ended editing, if one was held.
      this.applyHeldKeys = (): string | null => {
        this.releaseHeldKeys?.();
        let text = "";
        const insertText = () => {
          if (text) mfEl.executeCommand(["insert", axineToLatex(text)]);
          text = "";
        };
        for (const key of heldKeys.splice(0)) {
          if (key.length === 1) {
            text += key;
            continue;
          }
          insertText();
          if (key === "Escape" || key === "Enter") return key;
          if (HELD_KEY_COMMANDS[key]) mfEl.executeCommand(HELD_KEY_COMMANDS[key]);
        }
        insertText();
        return null;
      };
      mfEl.addEventListener("focusin", () => {
        const ending = this.applyHeldKeys?.();
        this.applyHeldKeys = null;
        if (!this.isEditing) return;
        if (ending === "Escape") {
          this.exitEditMode(true);
        } else if (ending === "Enter") {
          this.exitEditMode(true);
          this.options.onStepNext?.();
        }
      }, { once: true });

      // Pasted text is Axine; encode it rather than letting MathLive read it as LaTeX.
      mfEl.addEventListener("paste", (e: ClipboardEvent) => {
        const text = e.clipboardData?.getData("text/plain");
        if (text === undefined) return;
        e.preventDefault();
        e.stopPropagation();
        mfEl.executeCommand(["insert", axineToLatex(text)]);
      }, { capture: true });

      mfEl.addEventListener("input", () => {
        const axine = this.sourceFromField(mfEl);
        if (this.textarea) {
          this.textarea.value = axine;
          this.textarea.rows = Math.max(1, axine.split("\n").length);
        }
        this.block.source = axine;
        this.options.onCommit?.(this.block.id, axine);
        this.autocomplete?.checkPrefix(mfTarget);
      });

      // Boundary Seam Crossing via MathLive move-out
      mfEl.addEventListener("move-out", (e: any) => {
        if (!this.isEditing) return;
        const dir = e.detail?.direction;
        if (dir === "forward" || dir === "downward") {
          this.exitEditMode(true);
          this.options.onStepNext?.();
        } else if (dir === "backward" || dir === "upward") {
          this.exitEditMode(true);
          this.options.onStepPrev?.();
        }
      });

      mfEl.addEventListener("keydown", (e: KeyboardEvent) => {
        if (!this.isEditing) return;
        if (this.autocomplete && this.autocomplete.handleKeydown(e, mfTarget)) {
          e.stopPropagation();
          return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
          e.preventDefault();
          e.stopPropagation();
          this.exitEditMode(false);
          this.options.onRequestSelectAll?.();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          this.exitEditMode(true);
        } else if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          this.exitEditMode(true);
          this.options.onStepNext?.();
        } else if (e.key === "ArrowDown") {
          const oldPos = mfEl.position;
          if (typeof mfEl.executeCommand === "function") {
            mfEl.executeCommand("moveDown");
          }
          if (this.isEditing && mfEl.position === oldPos) {
            e.preventDefault();
            e.stopPropagation();
            this.exitEditMode(true);
            this.options.onStepNext?.();
          }
        } else if (e.key === "ArrowUp") {
          const oldPos = mfEl.position;
          if (typeof mfEl.executeCommand === "function") {
            mfEl.executeCommand("moveUp");
          }
          if (this.isEditing && mfEl.position === oldPos) {
            e.preventDefault();
            e.stopPropagation();
            this.exitEditMode(true);
            this.options.onStepPrev?.();
          }
        } else if ((e.key === "Backspace" || e.key === "Delete") && (!mfEl.value || mfEl.value.trim() === "" || mfEl.value === "$$" || mfEl.value === "\\placeholder{}")) {
          e.preventDefault();
          e.stopPropagation();
          if (!e.shiftKey) {
            this.exitEditMode(false);
            this.options.onDeleteRequest?.(this.block.id, "prev");
          }
        }
      });
    }

    this.textarea.addEventListener("input", () => {
      if (this.textarea) {
        this.textarea.rows = Math.max(1, this.textarea.value.split("\n").length);
        const val = this.textarea.value;
        if (mfEl) {
          this.loadSourceIntoField(mfEl, val);
        }
        this.block.source = val;
        const trimmed = val.trim();
        if (/\b[a-zA-Z]{2,}\s+[a-zA-Z]{2,}\b/.test(trimmed)) {
          this.options.onRequestTransform?.(this.block.id, "paragraph", val, this.textarea.selectionStart);
          return;
        }
        this.options.onCommit?.(this.block.id, val);
      }
      this.autocomplete?.checkPrefix(taTarget);
    });

    this.textarea.addEventListener("keydown", (e: KeyboardEvent) => {
      e.stopPropagation();
      if (this.autocomplete && this.autocomplete.handleKeydown(e, taTarget)) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        if (this.textarea && this.textarea.selectionStart === 0 && this.textarea.selectionEnd === this.textarea.value.length) {
          e.preventDefault();
          this.exitEditMode(false);
          this.options.onRequestSelectAll?.();
          return;
        }
      }
      if (e.key === "Escape") {
        e.preventDefault();
        this.exitEditMode(true);
      } else if (e.key === "Enter" && !(this.textarea?.value.includes("\n"))) {
        // A multi-line equation is edited as text; Enter adds a line there.
        e.preventDefault();
        this.exitEditMode(true);
        this.options.onStepNext?.();
      } else if (e.key === "ArrowDown") {
        if (!this.textarea) return;
        const val = this.textarea.value;
        const selStart = this.textarea.selectionStart;
        const textAfter = val.substring(selStart);
        if (!textAfter.includes("\n")) {
          e.stopPropagation();
          e.preventDefault();
          this.exitEditMode(true);
          this.options.onStepNext?.();
        }
      } else if (e.key === "ArrowUp") {
        if (!this.textarea) return;
        const val = this.textarea.value;
        const selStart = this.textarea.selectionStart;
        const textBefore = val.substring(0, selStart);
        if (!textBefore.includes("\n")) {
          e.stopPropagation();
          e.preventDefault();
          this.exitEditMode(true);
          this.options.onStepPrev?.();
        }
      } else if (e.key === "ArrowRight") {
        if (!this.textarea) return;
        if (this.textarea.selectionStart === this.textarea.value.length && this.textarea.selectionEnd === this.textarea.value.length) {
          e.stopPropagation();
          e.preventDefault();
          this.exitEditMode(true);
          this.options.onStepNext?.();
        }
      } else if (e.key === "ArrowLeft") {
        if (!this.textarea) return;
        if (this.textarea.selectionStart === 0 && this.textarea.selectionEnd === 0) {
          e.stopPropagation();
          e.preventDefault();
          this.exitEditMode(true);
          this.options.onStepPrev?.();
        }
      } else if ((e.key === "Backspace" || e.key === "Delete") && this.textarea) {
        if (this.textarea.value === "") {
          e.preventDefault();
          e.stopPropagation();
          if (!e.shiftKey) {
            this.exitEditMode(false);
            this.options.onDeleteRequest?.(this.block.id, "prev");
          }
        }
      }
    });

    const blurHandler = (e: FocusEvent) => {
      if (e.relatedTarget && (
        (e.relatedTarget as HTMLElement).closest(".doc-autocomplete-popover") ||
        this.editorContainer.contains(e.relatedTarget as Node)
      )) {
        return;
      }
      if (this.blurTimer) {
        clearTimeout(this.blurTimer);
      }
      this.blurTimer = setTimeout(() => {
        this.blurTimer = null;
        if (!this.isEditing) return;
        if (this.autocomplete?.getIsOpen()) return;
        if (typeof document !== "undefined" && document.activeElement && this.editorContainer.contains(document.activeElement)) {
          return;
        }
        this.exitEditMode(true, false);
      }, 150);
    };

    if (mfEl) {
      mfEl.addEventListener("focusout", blurHandler);
    } else {
      this.textarea.addEventListener("blur", blurHandler);
    }

    // Focus and position caret
    const scrollX = typeof window !== "undefined" ? window.scrollX : 0;
    const scrollY = typeof window !== "undefined" ? window.scrollY : 0;
    if (mfEl && typeof mfEl.focus === "function") {
      mfEl.focus({ preventScroll: true });
      if (typeof caretPosition === "object" && caretPosition !== null && "x" in caretPosition) {
        if (typeof mfEl.getOffsetFromPoint === "function") {
          const offset = mfEl.getOffsetFromPoint(caretPosition.x, caretPosition.y);
          if (offset >= 0 && typeof mfEl.position === "number") {
            mfEl.position = offset;
          }
        }
      } else if (caretPosition === "start" || caretPosition === 0) {
        if (typeof mfEl.executeCommand === "function") {
          mfEl.executeCommand("moveToMathfieldStart");
        }
      } else {
        if (typeof mfEl.executeCommand === "function") {
          mfEl.executeCommand("moveToMathfieldEnd");
        }
      }
    } else if (this.textarea) {
      this.textarea.focus({ preventScroll: true });
      const targetOffset = typeof caretPosition === "number" ? caretPosition : this.textarea.value.length;
      if (typeof this.textarea.setSelectionRange === "function") {
        this.textarea.setSelectionRange(targetOffset, targetOffset);
      }
    }
    if (typeof window !== "undefined" && (window.scrollY !== scrollY || window.scrollX !== scrollX)) {
      window.scrollTo(scrollX, scrollY);
    }
  }

  public exitEditMode(commit: boolean = true, refocus: boolean = true) {
    if (this.blurTimer) {
      clearTimeout(this.blurTimer);
      this.blurTimer = null;
    }
    if (!this.isEditing) return;
    // Keys pressed before the field took focus are part of the edit.
    this.applyHeldKeys?.();
    this.applyHeldKeys = null;
    this.isEditing = false;
    this.releaseHeldKeys?.();

    if (commit) {
      let newSource = this.block.source;
      const mfEl = this.editorContainer.querySelector("math-field") as any;
      if (this.textarea && this.textarea.value !== this.block.source) {
        newSource = this.textarea.value;
      } else if (mfEl && typeof mfEl.value === "string" && mfEl.value.trim() !== "") {
        newSource = this.sourceFromField(mfEl);
      } else if (this.textarea) {
        newSource = this.textarea.value;
      }
      if (newSource !== this.block.source) {
        this.block.source = newSource;
        this.options.onCommit?.(this.block.id, newSource);
      }
    }

    if (this.autocomplete) {
      this.autocomplete.dispose();
      this.autocomplete = null;
    }

    this.editorContainer.innerHTML = "";
    this.editorContainer.classList.add("hidden");
    delete this.el.dataset.editSurface;
    delete this.el.dataset.textEditReason;
    this.renderedContainer.classList.remove("hidden");
    this.el.classList.remove("editing");
    this.el.setAttribute("data-atomic", "true");

    this.renderTypesetMath();
    // A block closed because focus moved elsewhere leaves focus there.
    if (refocus) this.setSelected(true);
  }

  public setSelected(selected: boolean) {
    this.isSelected = selected;
    if (selected) {
      this.el.classList.add("selected");
      if (!this.isEditing && typeof this.el.focus === "function") {
        this.el.focus();
      }
    } else {
      this.el.classList.remove("selected");
    }
  }

  public updateBlock(newBlock: DocumentBlock) {
    this.block = newBlock;
    if (!this.isEditing) {
      this.renderTypesetMath();
    }
  }

  public getIsEditing(): boolean {
    return this.isEditing;
  }

  public getIsSelected(): boolean {
    return this.isSelected;
  }

  public getAutocomplete(): AutocompleteController | null {
    return this.autocomplete;
  }

  public dispose() {
    this.isEditing = false;
    if (this.blurTimer) {
      clearTimeout(this.blurTimer);
      this.blurTimer = null;
    }
    if (this.autocomplete) {
      this.autocomplete.dispose();
      this.autocomplete = null;
    }
    if (this.el.parentElement) {
      this.el.parentElement.removeChild(this.el);
    }
  }
}
