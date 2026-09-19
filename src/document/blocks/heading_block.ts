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

  private bindEvents() {
    this.el.addEventListener("click", (_e) => {
      if (!this.isEditing) {
        this.setSelected(true);
        this.options.onSelect?.(this.block.id);
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
    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.className = "doc-block-source-input doc-heading-input";
    this.input.value = this.block.source;
    this.el.appendChild(this.input);

    this.input.addEventListener("input", () => {
      this.handleInput();
    });

    this.input.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        this.exitEditMode(true);
      } else if (e.key === "Enter") {
        e.preventDefault();
        this.exitEditMode(true);
        this.options.onStepNext?.();
      }
    });

    this.input.addEventListener("blur", () => {
      this.exitEditMode(true);
    });

    this.input.focus();
    const offset = targetCaretOffset !== undefined ? targetCaretOffset : this.input.value.length;
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
      this.el.focus();
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
