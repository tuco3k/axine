/**
 * ParagraphBlockComponent — Prose and comment blocks with inline math
 * 
 * Supports inline mathematics enclosed in $ ... $
 * Double-click to edit, Escape to commit and render.
 */

import { DocumentBlock } from "../block_model";
import { typesetMath } from "../../core/math_typeset";

export interface ParagraphBlockOptions {
  onSelect?: (blockId: string) => void;
  onCommit?: (blockId: string, newSource: string) => void;
  onStepNext?: () => void;
  onStepPrev?: () => void;
}

export class ParagraphBlockComponent {
  public readonly el: HTMLElement;
  private block: DocumentBlock;
  private options: ParagraphBlockOptions;
  private renderedContainer: HTMLElement;
  private textarea: HTMLTextAreaElement | null = null;
  private isEditing: boolean = false;
  private isSelected: boolean = false;

  constructor(block: DocumentBlock, options: ParagraphBlockOptions = {}) {
    this.block = block;
    this.options = options;

    this.el = document.createElement("div");
    this.el.className = "doc-block doc-block-paragraph";
    this.el.tabIndex = 0;
    this.el.setAttribute("data-block-id", block.id);

    this.renderedContainer = document.createElement("div");
    this.renderedContainer.className = "doc-paragraph-rendered";
    this.el.appendChild(this.renderedContainer);

    this.renderProse();
    this.bindEvents();
  }

  private renderProse() {
    let text = this.block.source;
    if (text.trim() === "") {
      this.renderedContainer.innerHTML = `<span class="doc-paragraph-placeholder">Write math expressions, definitions (x := 5), claims, or prose...</span>`;
      return;
    }

    // Strip leading # from comment lines for display, or render cleanly
    const lines = text.split("\n").map(l => l.replace(/^#\s?/, ""));
    const rawProse = lines.join("\n");

    // Replace inline $...$ with typeset math
    const rendered = rawProse.replace(/\$([^$]+)\$/g, (_match, math) => {
      try {
        return `<span class="doc-inline-math">${typesetMath(math, { displayMode: false })}</span>`;
      } catch {
        return `$${math}$`;
      }
    });

    this.renderedContainer.innerHTML = rendered;
  }

  private bindEvents() {
    this.el.addEventListener("click", (_e) => {
      if (!this.isEditing) {
        this.setSelected(true);
        this.options.onSelect?.(this.block.id);
        if (this.block.source.trim() === "") {
          this.enterEditMode();
        }
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
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          this.enterEditMode(e.key);
          return;
        }
      } else {
        if (e.key === "Escape") {
          e.preventDefault();
          this.exitEditMode(true);
        }
      }
    });
  }

  public enterEditMode(initialChar?: string) {
    if (this.isEditing) return;
    this.isEditing = true;

    this.renderedContainer.classList.add("hidden");
    this.textarea = document.createElement("textarea");
    this.textarea.className = "doc-block-source-input doc-paragraph-input";
    this.textarea.placeholder = "Write math expressions, definitions (x := 5), claims, or prose...";
    const val = initialChar !== undefined ? (this.block.source ? this.block.source + initialChar : initialChar) : this.block.source;
    this.textarea.value = val;
    this.textarea.rows = Math.max(1, val.split("\n").length);
    this.el.appendChild(this.textarea);

    this.textarea.addEventListener("input", () => {
      if (this.textarea) {
        this.textarea.rows = Math.max(1, this.textarea.value.split("\n").length);
        this.block.source = this.textarea.value;
        this.options.onCommit?.(this.block.id, this.textarea.value);
      }
    });

    this.textarea.addEventListener("blur", () => {
      this.exitEditMode(true);
    });

    if (typeof this.textarea.focus === "function") {
      this.textarea.focus();
    }
    if (typeof this.textarea.setSelectionRange === "function") {
      this.textarea.setSelectionRange(this.textarea.value.length, this.textarea.value.length);
    } else {
      this.textarea.selectionStart = this.textarea.value.length;
      this.textarea.selectionEnd = this.textarea.value.length;
    }

    if (initialChar !== undefined) {
      this.options.onCommit?.(this.block.id, this.textarea.value);
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

    if (this.textarea) {
      this.el.removeChild(this.textarea);
      this.textarea = null;
    }

    this.renderedContainer.classList.remove("hidden");
    this.renderProse();
    this.setSelected(true);
  }

  public setSelected(selected: boolean) {
    this.isSelected = selected;
    if (selected) {
      this.el.classList.add("selected");
      if (typeof this.el.focus === "function") {
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

  public dispose() {
    if (this.el.parentElement) {
      this.el.parentElement.removeChild(this.el);
    }
  }
}
