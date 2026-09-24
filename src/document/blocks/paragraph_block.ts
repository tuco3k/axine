/**
 * ParagraphBlockComponent — Prose and comment blocks with inline math
 * 
 * Supports inline mathematics enclosed in $ ... $
 * Double-click to edit, Escape to commit and render.
 */

import { DocumentBlock, BlockType, classifyBlockType } from "../block_model";
import { typesetMath } from "../../core/math_typeset";
import { AutocompleteController, AutocompleteTarget } from "../autocomplete";

export interface ParagraphBlockOptions {
  onSelect?: (blockId: string) => void;
  onCommit?: (blockId: string, newSource: string) => void;
  onStepNext?: () => void;
  onStepPrev?: () => void;
  onRequestTransform?: (blockId: string, targetType: BlockType, source: string, caretOffset?: number) => void;
  onDeleteRequest?: (blockId: string, direction?: "prev" | "next") => void;
  onRequestSelectAll?: () => void;
  isOnlyBlock?: boolean;
  // Whether this block is the document's first content; "# " titles it there.
  isFirstContent?: () => boolean;
}

export class ParagraphBlockComponent {
  public readonly el: HTMLElement;
  private block: DocumentBlock;
  private options: ParagraphBlockOptions;
  private renderedContainer: HTMLElement;
  private textarea: HTMLTextAreaElement | null = null;
  private autocomplete: AutocompleteController | null = null;
  private isEditing: boolean = false;
  private isSelected: boolean = false;
  private blurTimer: any = null;

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
    this.el.classList.add("editing");

    this.renderedContainer.classList.add("hidden");
    this.textarea = document.createElement("textarea");
    this.textarea.className = "doc-block-source-input doc-paragraph-input";
    this.textarea.placeholder = "Start typing...";

    let initialOffset: number | undefined = undefined;
    let val = this.block.source;

    if (typeof initialCharOrOffset === "number") {
      initialOffset = initialCharOrOffset;
    } else if (initialCharOrOffset === "start") {
      initialOffset = 0;
    } else if (initialCharOrOffset === "end") {
      initialOffset = val.length;
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

    this.autocomplete = new AutocompleteController(this.el, (_accepted) => {
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
      this.block.source = this.textarea.value;
      this.options.onCommit?.(this.block.id, this.textarea.value);
    });

    const target: AutocompleteTarget = {
      getValue: () => this.textarea?.value || "",
      setValue: (v: string) => {
        if (this.textarea) {
          this.textarea.value = v;
          autoResize();
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
        if (!this.textarea) return { x: 12, y: 28 };
        const textBefore = this.textarea.value.substring(0, this.textarea.selectionStart || 0);
        const lines = textBefore.split("\n");
        const currentLine = lines[lines.length - 1];
        const lineIdx = lines.length - 1;
        const charWidth = 8.5;
        const lineHeight = 25.6;
        const x = Math.max(12, Math.min(this.textarea.offsetWidth - 280, currentLine.length * charWidth + 12));
        const y = lineIdx * lineHeight + 28;
        return { x, y };
      },
    };

    this.textarea.addEventListener("input", (e: Event) => {
      if (!this.textarea) return;
      autoResize();
      if (this.autocomplete) {
        this.autocomplete.checkPrefix(target, e as InputEvent);
      }
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
      // 4. Heading: # a heading. A heading is one line, so multi-line text
      // stays a paragraph.
      if (classifyBlockType(val, this.options.isFirstContent?.() ?? false) === "heading") {
        if (this.blurTimer) {
          clearTimeout(this.blurTimer);
          this.blurTimer = null;
        }
        this.isEditing = false;
        this.el.classList.remove("editing");
        this.options.onRequestTransform?.(this.block.id, "heading", val, caret);
        return;
      }
      // 5. Explicit equation triggers: \eq or $$
      if (trimmed === "\\eq" || trimmed === "$$") {
        if (this.blurTimer) {
          clearTimeout(this.blurTimer);
          this.blurTimer = null;
        }
        this.isEditing = false;
        this.el.classList.remove("editing");
        this.options.onRequestTransform?.(this.block.id, "equation", "", 0);
        return;
      }
      if (/(:=|=|<=|>=|!=|<|>)/.test(trimmed)) {
        const classified = classifyBlockType(trimmed);
        if (classified === "equation" && trimmed !== "") {
          if (this.blurTimer) {
            clearTimeout(this.blurTimer);
            this.blurTimer = null;
          }
          this.isEditing = false;
          this.el.classList.remove("editing");
          this.options.onRequestTransform?.(this.block.id, "equation", val, caret);
          return;
        }
      }

      this.block.source = this.textarea.value;
      this.options.onCommit?.(this.block.id, this.textarea.value);
    });

    this.textarea.addEventListener("keydown", (e: KeyboardEvent) => {
      if (this.autocomplete && this.autocomplete.handleKeydown(e, target)) {
        e.stopPropagation();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        if (this.textarea && this.textarea.selectionStart === 0 && this.textarea.selectionEnd === this.textarea.value.length) {
          e.preventDefault();
          e.stopPropagation();
          this.exitEditMode(false);
          this.options.onRequestSelectAll?.();
          return;
        }
      }
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        this.exitEditMode(true);
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.stopPropagation();
        if (!this.textarea) return;
        const val = this.textarea.value;
        const trimmed = val.trim();
        const classified = classifyBlockType(val, this.options.isFirstContent?.() ?? false);
        if (classified !== "paragraph" && trimmed !== "") {
          e.preventDefault();
          this.options.onRequestTransform?.(this.block.id, classified, val);
          this.options.onStepNext?.();
          return;
        }
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
        const val = this.textarea.value;
        if (this.textarea.selectionStart === val.length && this.textarea.selectionEnd === val.length) {
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
      } else if (e.key === "Backspace" || e.key === "Delete") {
        if (!this.textarea) return;
        if (this.textarea.value === "") {
          e.stopPropagation();
          e.preventDefault();
          if (!e.shiftKey) {
            this.exitEditMode(false);
            this.options.onDeleteRequest?.(this.block.id, "prev");
          }
        }
      }
    });

    this.textarea.addEventListener("blur", (e: FocusEvent) => {
      if (e.relatedTarget && (e.relatedTarget as HTMLElement).closest(".doc-autocomplete-popover")) {
        return;
      }
      if (this.blurTimer) {
        clearTimeout(this.blurTimer);
      }
      this.blurTimer = setTimeout(() => {
        this.blurTimer = null;
        if (this.isEditing && (!this.autocomplete || !this.autocomplete.getIsOpen())) {
          this.exitEditMode(true, false);
        }
      }, 150);
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

    if (typeof initialCharOrOffset === "string" && initialCharOrOffset !== "start" && initialCharOrOffset !== "end") {
      this.options.onCommit?.(this.block.id, this.textarea.value);
    }
  }

  public exitEditMode(commit: boolean = true, refocus: boolean = true) {
    if (this.blurTimer) {
      clearTimeout(this.blurTimer);
      this.blurTimer = null;
    }
    if (!this.isEditing) return;
    this.isEditing = false;
    this.el.classList.remove("editing");

    if (commit && this.textarea) {
      const newSource = this.textarea.value;
      if (newSource !== this.block.source) {
        this.block.source = newSource;
        // The editor re-types committed text by the classifier.
        this.options.onCommit?.(this.block.id, newSource);
      }
    }

    if (this.textarea) {
      this.el.removeChild(this.textarea);
      this.textarea = null;
    }

    if (this.autocomplete) {
      this.autocomplete.dispose();
      this.autocomplete = null;
    }

    this.renderedContainer.classList.remove("hidden");
    this.renderProse();
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
    this.isEditing = false;
    this.el.classList.remove("editing");
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
