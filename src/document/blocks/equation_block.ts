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

export interface EquationBlockOptions {
  onSelect?: (blockId: string) => void;
  onCommit?: (blockId: string, newSource: string) => void;
  onStepNext?: () => void;
  onStepPrev?: () => void;
  onDeleteRequest?: (blockId: string) => void;
  onRequestTransform?: (blockId: string, targetType: BlockType, source: string, caretOffset?: number) => void;
  clickToEdit?: boolean;
}

export class EquationBlockComponent {
  public readonly el: HTMLElement;
  private block: DocumentBlock;
  private options: EquationBlockOptions;
  private renderedContainer: HTMLElement;
  private editorContainer: HTMLElement;
  private liveTypesetEl: HTMLElement | null = null;
  private textarea: HTMLTextAreaElement | null = null;
  private autocomplete: AutocompleteController | null = null;
  private isEditing: boolean = false;
  private isSelected: boolean = false;

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

  private calculateCaretOffsetFromClick(e: MouseEvent): number | undefined {
    if (typeof document === "undefined") return undefined;
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (range && this.renderedContainer.contains(range.startContainer)) {
        let charCount = 0;
        const walker = document.createTreeWalker(this.renderedContainer, NodeFilter.SHOW_TEXT);
        let textNode: Node | null;
        while ((textNode = walker.nextNode())) {
          if (textNode === range.startContainer) {
            charCount += range.startOffset;
            break;
          }
          charCount += textNode.textContent?.length || 0;
        }
        return charCount;
      }
    } else if ((document as any).caretPositionFromPoint) {
      const pos = (document as any).caretPositionFromPoint(e.clientX, e.clientY);
      if (pos && this.renderedContainer.contains(pos.offsetNode)) {
        let charCount = 0;
        const walker = document.createTreeWalker(this.renderedContainer, NodeFilter.SHOW_TEXT);
        let textNode: Node | null;
        while ((textNode = walker.nextNode())) {
          if (textNode === pos.offsetNode) {
            charCount += pos.offset;
            break;
          }
          charCount += textNode.textContent?.length || 0;
        }
        return charCount;
      }
    }
    return undefined;
  }

  private renderLiveMath(val: string) {
    if (!this.liveTypesetEl) return;
    if (val.trim() === "") {
      this.liveTypesetEl.innerHTML = '<span class="doc-equation-placeholder" style="color: var(--color-text-muted, #71717a); opacity: 0.5;">y = f(x)</span>';
      return;
    }

    try {
      this.liveTypesetEl.innerHTML = typesetMath(val, { displayMode: true });
    } catch {
      this.liveTypesetEl.textContent = val;
    }
  }

  private bindEvents() {
    // Single Click: Select atomic block, and enter edit mode if clickToEdit is enabled
    this.el.addEventListener("click", (e: MouseEvent) => {
      if (!this.isEditing) {
        this.setSelected(true);
        this.options.onSelect?.(this.block.id);
        if (this.options.clickToEdit) {
          const offset = this.calculateCaretOffsetFromClick(e);
          this.enterEditMode(offset);
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
          this.enterEditMode();
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

  public enterEditMode(caretOffset?: number) {
    if (this.isEditing) return;
    this.isEditing = true;

    this.renderedContainer.classList.add("hidden");
    this.editorContainer.classList.remove("hidden");
    this.el.classList.add("editing");
    this.el.removeAttribute("data-atomic");

    this.editorContainer.innerHTML = "";

    // 1. Live typeset container rendering live mathematical typography as typed
    this.liveTypesetEl = document.createElement("div");
    this.liveTypesetEl.className = "doc-equation-live-typeset doc-equation-typeset-view";
    this.editorContainer.appendChild(this.liveTypesetEl);

    // 2. Input textarea sitting transparently directly above the typeset backdrop
    this.textarea = document.createElement("textarea");
    this.textarea.className = "doc-block-source-input doc-equation-input";
    this.textarea.value = this.block.source;
    this.textarea.style.overflow = "hidden";
    this.textarea.style.resize = "none";
    this.textarea.rows = Math.max(1, this.block.source.split("\n").length);
    this.editorContainer.appendChild(this.textarea);

    this.renderLiveMath(this.block.source);

    this.autocomplete = new AutocompleteController(this.editorContainer, (_accepted) => {
      if (this.textarea) {
        this.renderLiveMath(this.textarea.value);
      }
    });

    const target: AutocompleteTarget = {
      getValue: () => this.textarea?.value || "",
      setValue: (v: string) => {
        if (this.textarea) {
          this.textarea.value = v;
          this.textarea.rows = Math.max(1, v.split("\n").length);
          this.renderLiveMath(v);
        }
      },
      getSelectionStart: () => this.textarea?.selectionStart || 0,
      setSelection: (s: number, e: number) => {
        if (this.textarea) {
          this.textarea.selectionStart = s;
          this.textarea.selectionEnd = e;
        }
      },
      getCaretCoordinates: () => {
        const containerRect = this.editorContainer.getBoundingClientRect();
        const cmdSpan = this.liveTypesetEl?.querySelector(".doc-literal-cmd");
        if (cmdSpan) {
          const spanRect = cmdSpan.getBoundingClientRect();
          return {
            x: Math.max(0, spanRect.left - containerRect.left),
            y: Math.max(0, spanRect.bottom - containerRect.top + 4),
          };
        }
        return { x: 0, y: 28 };
      },
    };

    this.textarea.addEventListener("input", () => {
      if (this.textarea) {
        this.textarea.rows = Math.max(1, this.textarea.value.split("\n").length);
        const val = this.textarea.value;
        const trimmed = val.trim();
        const caret = this.textarea.selectionStart ?? val.length;

        // Check if reverted to plain prose text (no relations or math operators)
        const hasRelationOrMath = /[=:<>+\-*/^\\_]/.test(val);
        if (!hasRelationOrMath && trimmed !== "" && this.options.onRequestTransform) {
          this.options.onRequestTransform(this.block.id, "paragraph", val, caret);
          return;
        }

        // Live math rendering while typing!
        this.renderLiveMath(val);
      }
      this.autocomplete?.checkPrefix(target);
    });

    this.textarea.addEventListener("keydown", (e: KeyboardEvent) => {
      e.stopPropagation();
      if (this.autocomplete && this.autocomplete.handleKeydown(e, target)) {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        this.exitEditMode(true);
      } else if (e.key === "Backspace" && this.textarea) {
        if (this.textarea.value === "") {
          e.preventDefault();
          this.options.onRequestTransform?.(this.block.id, "paragraph", "", 0);
        }
      }
    });

    this.textarea.addEventListener("blur", () => {
      // Delay slightly in case autocomplete item was clicked
      setTimeout(() => {
        if (this.isEditing && !this.autocomplete?.getIsOpen()) {
          this.exitEditMode(true);
        }
      }, 150);
    });

    this.textarea.focus();
    const targetOffset = caretOffset !== undefined ? caretOffset : this.textarea.value.length;
    if (typeof this.textarea.setSelectionRange === "function") {
      this.textarea.setSelectionRange(targetOffset, targetOffset);
    }
  }

  public exitEditMode(commit: boolean = true) {
    if (!this.isEditing) return;
    this.isEditing = false;

    if (commit && this.textarea) {
      const newSource = this.textarea.value;
      if (newSource !== this.block.source) {
        this.block.source = newSource;
        this.options.onCommit?.(this.block.id, newSource);
      }
    }

    if (this.autocomplete) {
      this.autocomplete.dispose();
      this.autocomplete = null;
    }

    this.liveTypesetEl = null;
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
      this.el.focus();
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
    if (this.autocomplete) {
      this.autocomplete.dispose();
      this.autocomplete = null;
    }
    this.liveTypesetEl = null;
    if (this.el.parentElement) {
      this.el.parentElement.removeChild(this.el);
    }
  }
}
