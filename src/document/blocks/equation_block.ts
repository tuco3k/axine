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
import { axineToLatex, latexToAxine } from "../axine_latex_bridge";
import "mathlive";

export interface EquationBlockOptions {
  onSelect?: (blockId: string) => void;
  onCommit?: (blockId: string, newSource: string) => void;
  onStepNext?: () => void;
  onStepPrev?: () => void;
  onDeleteRequest?: (blockId: string) => void;
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

    // 1. MathLive math-field element for structured, seam-aware math editing
    let mfEl: any = null;
    try {
      mfEl = document.createElement("math-field") as any;
      mfEl.className = "doc-block-source-input doc-equation-mathfield";
      mfEl.mathVirtualKeyboardPolicy = "manual";
      this.editorContainer.appendChild(mfEl);
      mfEl.value = axineToLatex(this.block.source);
    } catch {
      mfEl = null;
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
          mfEl.value = axineToLatex(val);
        }
        this.block.source = val;
        this.options.onCommit?.(this.block.id, val);
      }
    });

    const mfTarget: AutocompleteTarget = {
      getValue: () => (mfEl ? latexToAxine(mfEl.value) : ""),
      setValue: (v: string) => {
        if (mfEl) {
          mfEl.value = axineToLatex(v);
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
          mfEl.value = axineToLatex(v);
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
      mfEl.addEventListener("input", () => {
        const latex = mfEl.value;
        const axine = latexToAxine(latex);
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
        } else if (e.key === "Backspace" && (!mfEl.value || mfEl.value.trim() === "")) {
          e.preventDefault();
          e.stopPropagation();
          this.exitEditMode(false);
          if (this.options.onRequestTransform) {
            this.options.onRequestTransform(this.block.id, "paragraph", "", 0);
          } else {
            this.options.onDeleteRequest?.(this.block.id);
          }
        }
      });
    }

    this.textarea.addEventListener("input", () => {
      if (this.textarea) {
        this.textarea.rows = Math.max(1, this.textarea.value.split("\n").length);
        const val = this.textarea.value;
        if (mfEl) {
          mfEl.value = axineToLatex(val);
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
      } else if (e.key === "Enter") {
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
      } else if (e.key === "Backspace" && this.textarea) {
        if (this.textarea.value === "") {
          e.preventDefault();
          this.options.onRequestTransform?.(this.block.id, "paragraph", "", 0);
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
        this.exitEditMode(true);
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

  public exitEditMode(commit: boolean = true) {
    if (this.blurTimer) {
      clearTimeout(this.blurTimer);
      this.blurTimer = null;
    }
    if (!this.isEditing) return;
    this.isEditing = false;

    if (commit) {
      let newSource = this.block.source;
      const mfEl = this.editorContainer.querySelector("math-field") as any;
      if (this.textarea && this.textarea.value !== this.block.source) {
        newSource = this.textarea.value;
      } else if (mfEl && typeof mfEl.value === "string" && mfEl.value.trim() !== "") {
        newSource = latexToAxine(mfEl.value);
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
    this.renderedContainer.classList.remove("hidden");
    this.el.classList.remove("editing");
    this.el.setAttribute("data-atomic", "true");

    this.renderTypesetMath();
    this.setSelected(true);
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
