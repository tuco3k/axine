/**
 * HeadingBlockComponent — In-flow heading block (#, ##, ###)
 * 
 * Renders semantic headings with proper typography and hierarchy.
 * Supports inline editing, keyboard navigation, and dynamic reversion to paragraph.
 */

import { DocumentBlock, BlockType } from "../block_model";

export interface HeadingBlockOptions {
  onSelect?: (blockId: string) => void;
  onCommit?: (blockId: string, newSource: string) => void;
  onStepNext?: () => void;
  onStepPrev?: () => void;
  onRequestTransform?: (blockId: string, targetType: BlockType, source: string, caretOffset?: number) => void;
  onDeleteRequest?: (blockId: string) => void;
  onRequestSelectAll?: () => void;
  clickToEdit?: boolean;
}

export class HeadingBlockComponent {
  public readonly el: HTMLElement;
  private block: DocumentBlock;
  private options: HeadingBlockOptions;
  private renderedContainer: HTMLElement;
  private input: HTMLInputElement | null = null;
  private isEditing: boolean = false;
  private isSelected: boolean = false;

  constructor(block: DocumentBlock, options: HeadingBlockOptions = {}) {
    this.block = block;
    this.options = options;

    this.el = document.createElement("div");
    this.el.className = "doc-block doc-block-heading";
    this.el.tabIndex = 0;
    this.el.setAttribute("data-block-id", block.id);

    this.renderedContainer = document.createElement("div");
    this.renderedContainer.className = "doc-heading-rendered";
    this.el.appendChild(this.renderedContainer);

    this.renderHeading();
    this.bindEvents();
  }

  private getHeadingLevel(): number {
    const trimmed = this.block.source.trim();
    if (trimmed.startsWith("###")) return 3;
    if (trimmed.startsWith("##")) return 2;
    return 1;
  }

  private renderHeading() {
    const level = this.getHeadingLevel();
    const text = this.block.source.replace(/^#{1,6}\s?/, "").trim();
    this.renderedContainer.innerHTML = `<h${level} class="doc-heading-content">${text || '<span class="doc-heading-placeholder">Heading</span>'}</h${level}>`;
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

  private bindEvents() {
    this.el.addEventListener("click", (e: MouseEvent) => {
      if (!this.isEditing) {
        this.setSelected(true);
        this.options.onSelect?.(this.block.id);
        const offset = this.calculateCaretOffsetFromClick(e);
        const prefixLen = this.block.source.startsWith("### ") ? 4 : (this.block.source.startsWith("## ") ? 3 : (this.block.source.startsWith("# ") ? 2 : 0));
        this.enterEditMode(offset !== undefined ? offset + prefixLen : undefined);
      }
    });

    this.el.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      this.enterEditMode();
    });

    this.el.addEventListener("keydown", (e: KeyboardEvent) => {
      if (!this.isEditing) {
        if (e.key === "Enter") {
          e.preventDefault();
          this.enterEditMode();
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          this.options.onStepNext?.();
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          this.options.onStepPrev?.();
          return;
        }
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          this.options.onDeleteRequest?.(this.block.id);
          return;
        }
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          this.enterEditMode(this.block.source.length);
          if (this.input) {
            this.input.value += e.key;
            this.handleInput();
          }
          return;
        }
      }
    });
  }

  public enterEditMode(targetCaretOffset?: number) {
    if (this.isEditing) return;
    this.isEditing = true;

    this.renderedContainer.classList.add("hidden");
    this.el.classList.add("editing");
    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.className = "doc-block-source-input doc-heading-input";
    this.input.placeholder = "Heading...";
    this.input.value = this.block.source;
    this.el.appendChild(this.input);

    this.input.addEventListener("input", () => {
      this.handleInput();
    });

    this.input.addEventListener("keydown", (e: KeyboardEvent) => {
      e.stopPropagation();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        if (this.input && this.input.selectionStart === 0 && this.input.selectionEnd === this.input.value.length) {
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
        e.preventDefault();
        this.exitEditMode(true);
        this.options.onStepNext?.();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        this.exitEditMode(true);
        this.options.onStepPrev?.();
      } else if (e.key === "Backspace" && this.input && this.input.value === "") {
        e.preventDefault();
        this.options.onDeleteRequest?.(this.block.id);
      }
    });

    this.input.addEventListener("blur", () => {
      this.exitEditMode(true);
    });

    this.input.focus();
    let offset = this.input.value.length;
    if (typeof targetCaretOffset === "number") {
      offset = targetCaretOffset;
    } else if (targetCaretOffset === "start") {
      offset = 0;
    } else if (targetCaretOffset === "end") {
      offset = this.input.value.length;
    }
    if (typeof this.input.setSelectionRange === "function") {
      this.input.setSelectionRange(offset, offset);
    }
  }

  private handleInput() {
    if (!this.input) return;
    const val = this.input.value;
    const caret = this.input.selectionStart ?? val.length;

    // Check if reverted to plain text (no longer starts with #)
    const trimmed = val.trim();
    if (!val.startsWith("#") && trimmed !== "") {
      this.options.onRequestTransform?.(this.block.id, "paragraph", val, caret);
      return;
    }

    this.block.source = val;
    this.options.onCommit?.(this.block.id, val);
  }

  public exitEditMode(commit: boolean = true) {
    if (!this.isEditing) return;
    this.isEditing = false;
    this.el.classList.remove("editing");

    if (commit && this.input) {
      const newSource = this.input.value;
      if (newSource !== this.block.source) {
        this.block.source = newSource;
        this.options.onCommit?.(this.block.id, newSource);
      }
    }

    if (this.input) {
      this.el.removeChild(this.input);
      this.input = null;
    }

    this.renderedContainer.classList.remove("hidden");
    this.renderHeading();
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

  public getIsEditing(): boolean {
    return this.isEditing;
  }

  public getIsSelected(): boolean {
    return this.isSelected;
  }

  public getInput(): HTMLInputElement | null {
    return this.input;
  }

  public dispose() {
    if (this.el.parentElement) {
      this.el.parentElement.removeChild(this.el);
    }
  }
}
