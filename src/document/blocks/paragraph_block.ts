/**
 * ParagraphBlockComponent — Prose and comment blocks with inline math
 * 
 * Supports inline mathematics enclosed in $ ... $
 * Double-click to edit, Escape to commit and render.
 */

import { DocumentBlock, BlockType } from "../block_model";
import { typesetMath } from "../../core/math_typeset";

export interface ParagraphBlockOptions {
  onSelect?: (blockId: string) => void;
  onCommit?: (blockId: string, newSource: string) => void;
  onStepNext?: () => void;
  onStepPrev?: () => void;
  onRequestTransform?: (blockId: string, targetType: BlockType, source: string, caretOffset?: number) => void;
  onDeleteRequest?: (blockId: string) => void;
  isOnlyBlock?: boolean;
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
      if (this.options.isOnlyBlock) {
        this.renderedContainer.innerHTML = `<span class="doc-paragraph-placeholder">Start typing...</span>`;
      } else {
        this.renderedContainer.innerHTML = `<br>`;
      }
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
        this.enterEditMode(offset);
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

  public enterEditMode(initialCharOrOffset?: string | number) {
    if (this.isEditing) return;
    this.isEditing = true;

    this.renderedContainer.classList.add("hidden");
    this.textarea = document.createElement("textarea");
    this.textarea.className = "doc-block-source-input doc-paragraph-input";
    this.textarea.placeholder = "Start typing...";

    let initialOffset: number | undefined = undefined;
    let val = this.block.source;

    if (typeof initialCharOrOffset === "number") {
      initialOffset = initialCharOrOffset;
    } else if (typeof initialCharOrOffset === "string") {
      val = val ? val + initialCharOrOffset : initialCharOrOffset;
    }

    this.textarea.value = val;
    this.textarea.style.overflow = "hidden";
    this.textarea.style.resize = "none";
    this.el.appendChild(this.textarea);

    const autoResize = () => {
      if (!this.textarea) return;
      this.textarea.style.height = "auto";
      this.textarea.style.height = `${Math.max(26, this.textarea.scrollHeight)}px`;
    };
    autoResize();

    this.textarea.addEventListener("input", () => {
      if (!this.textarea) return;
      autoResize();
      const val = this.textarea.value;
      const trimmed = val.trim();
      const caret = this.textarea.selectionStart ?? val.length;

      // 1. \table
      if (trimmed === "\\table" || trimmed.startsWith("\\table ") || trimmed.startsWith("\\table(")) {
        this.options.onRequestTransform?.(this.block.id, "slot", val, caret);
        return;
      }
      // 2. \cases
      if (trimmed === "\\cases" || trimmed.startsWith("\\cases ") || trimmed.startsWith("\\cases(")) {
        this.options.onRequestTransform?.(this.block.id, "slot", val, caret);
        return;
      }
      // 3. \figure
      if (trimmed === "\\figure" || trimmed.startsWith("\\figure ") || trimmed.startsWith("\\figure(")) {
        this.options.onRequestTransform?.(this.block.id, "figure", val, caret);
        return;
      }
      // 4. Heading: # a heading
      if (val.startsWith("# ") || val.startsWith("## ") || val.startsWith("### ")) {
        this.options.onRequestTransform?.(this.block.id, "heading", val, caret);
        return;
      }
      // 5. Equation: e.g. "x = 5" or ":var := 10"
      if (/^(:?[a-zA-Z_][a-zA-Z0-9_]*(\([^)]*\))?\s*(:=|=|<=|>=|<|>)\s*.*)$/.test(trimmed)) {
        this.options.onRequestTransform?.(this.block.id, "equation", val, caret);
        return;
      }

      this.block.source = this.textarea.value;
      this.options.onCommit?.(this.block.id, this.textarea.value);
    });

    this.textarea.addEventListener("keydown", (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        this.exitEditMode(true);
      } else if (e.key === "Enter" && !e.shiftKey) {
        if (!this.textarea) return;
        const val = this.textarea.value;
        const trimmed = val.trim();
        if (/^(:?[a-zA-Z_][a-zA-Z0-9_]*(\([^)]*\))?\s*(:=|=|<=|>=|<|>)\s*.+)$/.test(trimmed) ||
            /^[a-zA-Z0-9_]+(\s*[\^+\-*/]\s*[a-zA-Z0-9_]+)+$/.test(trimmed)) {
          e.preventDefault();
          this.options.onRequestTransform?.(this.block.id, "equation", val);
          return;
        }
      }
    });

    this.textarea.addEventListener("blur", () => {
      this.exitEditMode(true);
    });

    if (typeof this.textarea.focus === "function") {
      this.textarea.focus();
    }
    const targetSel = initialOffset !== undefined ? initialOffset : this.textarea.value.length;
    if (typeof this.textarea.setSelectionRange === "function") {
      this.textarea.setSelectionRange(targetSel, targetSel);
    } else {
      this.textarea.selectionStart = targetSel;
      this.textarea.selectionEnd = targetSel;
    }

    if (typeof initialCharOrOffset === "string") {
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

  public getTextarea(): HTMLTextAreaElement | null {
    return this.textarea;
  }

  public dispose() {
    if (this.el.parentElement) {
      this.el.parentElement.removeChild(this.el);
    }
  }
}
