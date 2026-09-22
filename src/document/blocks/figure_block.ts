/**
 * FigureBlockComponent — In-flow atomic figure container
 * 
 * Implements Word's atomic object model:
 * 1. Single click selects the figure as an atomic unit (focus border, resize affordances).
 * 2. Caret sits before or after, never inside.
 * 3. Arrow keys step over the figure in one press.
 * 4. Reflows naturally when content above shifts.
 * 5. Scroll-safe click-to-activate: wheel/trackpad scrolling passes through until clicked.
 */

import { DocumentBlock, BlockType } from "../block_model";
import { SpaceValue } from "../../core/types";
import { SpaceViewport } from "../../plot/space_viewport";

export interface FigureBlockOptions {
  onSelect?: (blockId: string) => void;
  onNavigateToSource?: (symbolName: string) => void;
  onDeleteRequest?: (blockId: string, direction?: "prev" | "next") => void;
  onStepNext?: () => void;
  onStepPrev?: () => void;
  onCommit?: (blockId: string, newSource: string) => void;
  onRequestTransform?: (blockId: string, targetType: BlockType, source: string, caretOffset?: number) => void;
}

export class FigureBlockComponent {
  public readonly el: HTMLElement;
  private block: DocumentBlock;
  private options: FigureBlockOptions;
  private viewport: SpaceViewport | null = null;
  private canvasContainer: HTMLElement;
  private editorContainer: HTMLElement;
  private titleBar: HTMLElement;
  private textarea: HTMLTextAreaElement | null = null;
  private isEditing: boolean = false;
  private isSelected: boolean = false;
  private isNavigating: boolean = false;

  constructor(block: DocumentBlock, options: FigureBlockOptions = {}) {
    this.block = block;
    this.options = options;

    this.el = document.createElement("div");
    this.el.className = "doc-block doc-block-figure";
    this.el.tabIndex = 0;
    this.el.setAttribute("data-block-id", block.id);
    this.el.setAttribute("data-atomic", "true");

    // Title / Provenance Header
    this.titleBar = document.createElement("div");
    this.titleBar.className = "doc-figure-header";
    this.renderHeader();
    this.el.appendChild(this.titleBar);

    // Canvas Mount Container
    this.canvasContainer = document.createElement("div");
    this.canvasContainer.className = "doc-figure-viewport-container inert-scroll";
    this.el.appendChild(this.canvasContainer);

    // Editor Container
    this.editorContainer = document.createElement("div");
    this.editorContainer.className = "doc-figure-editor-view hidden";
    this.el.appendChild(this.editorContainer);

    this.bindEvents();
    this.mountViewport();
  }

  private renderHeader() {
    this.titleBar.innerHTML = "";

    const titleLeft = document.createElement("div");
    titleLeft.className = "doc-figure-title-left";

    const label = document.createElement("span");
    label.className = "doc-figure-label";
    const refSymbol = this.block.referencedSymbols?.[0] || this.block.definedSymbol || "Figure";
    label.textContent = refSymbol;
    titleLeft.appendChild(label);

    // Provenance Link ("Where it came from" per VOICE.md)
    if (this.options.onNavigateToSource && refSymbol.startsWith(":")) {
      const provBtn = document.createElement("button");
      provBtn.className = "doc-figure-prov-btn";
      provBtn.textContent = "Where it came from";
      provBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.options.onNavigateToSource?.(refSymbol);
      });
      titleLeft.appendChild(provBtn);
    }
    this.titleBar.appendChild(titleLeft);

    // State Badge
    const badge = document.createElement("span");
    badge.className = "doc-figure-badge badge-" + this.block.status;
    badge.textContent = this.block.status;
    this.titleBar.appendChild(badge);
  }

  private mountViewport() {
    if (this.block.result && this.block.result.type === "space") {
      const spaceVal = this.block.result as SpaceValue;
      const width = this.block.metadata?.width || 480;
      const height = this.block.metadata?.height || 320;

      this.canvasContainer.style.width = width + "px";
      this.canvasContainer.style.height = height + "px";

      try {
        this.viewport = new SpaceViewport(this.canvasContainer, spaceVal, {
          width,
          height,
        });
        this.viewport.render();
      } catch (err) {
        console.warn("FigureBlock viewport render failed:", err);
      }
    } else if (this.block.status === "error") {
      this.canvasContainer.innerHTML = `<div class="doc-figure-error-msg">${this.block.error?.message || "Unresolved figure"}</div>`;
    }
  }

  private bindEvents() {
    // Single Click selects whole atomic figure
    this.el.addEventListener("click", (_e) => {
      if (!this.isEditing) {
        this.setSelected(true);
        this.options.onSelect?.(this.block.id);
      }
    });

    // Double Click: Enter edit mode
    this.el.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      this.enterEditMode();
    });

    // Keyboard navigation (Word's single-arrow stepping)
    this.el.addEventListener("keydown", (e: KeyboardEvent) => {
      if (this.isNavigating && e.key === "Escape") {
        e.preventDefault();
        this.setNavigating(false);
        return;
      }

      if (!this.isNavigating && !this.isEditing) {
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
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          e.stopPropagation();
          if (!e.shiftKey) {
            this.options.onDeleteRequest?.(this.block.id, "prev");
          }
          return;
        }
      }
    });

    // Canvas click-to-activate interaction
    this.canvasContainer.addEventListener("click", (e) => {
      if (!this.isNavigating && !this.isEditing) {
        e.stopPropagation();
        this.setSelected(true);
        this.setNavigating(true);
      }
    });

    // Clicking outside deactivates navigation
    document.addEventListener("click", (e) => {
      if (!this.el.contains(e.target as Node)) {
        this.setSelected(false);
        this.setNavigating(false);
      }
    });
  }

  public enterEditMode(caretOffset?: number) {
    if (this.isEditing) return;
    this.isEditing = true;

    this.titleBar.classList.add("hidden");
    this.canvasContainer.classList.add("hidden");
    this.editorContainer.classList.remove("hidden");
    this.el.classList.add("editing");
    this.el.removeAttribute("data-atomic");

    this.editorContainer.innerHTML = "";
    this.textarea = document.createElement("textarea");
    this.textarea.className = "doc-block-source-input doc-figure-input";
    this.textarea.value = this.block.source;
    this.textarea.style.overflow = "hidden";
    this.textarea.style.resize = "none";
    this.textarea.rows = Math.max(1, this.block.source.split("\n").length);
    this.editorContainer.appendChild(this.textarea);

    this.textarea.addEventListener("input", () => {
      if (!this.textarea) return;
      this.textarea.rows = Math.max(1, this.textarea.value.split("\n").length);
      const val = this.textarea.value;
      const trimmed = val.trim();
      const caret = this.textarea.selectionStart ?? val.length;

      // If edited away from \figure and doesn't contain {\axis, revert to paragraph
      if (!trimmed.startsWith("\\figure") && !trimmed.includes("{\\axis")) {
        this.options.onRequestTransform?.(this.block.id, "paragraph", val, caret);
        return;
      }

      this.block.source = val;
      this.options.onCommit?.(this.block.id, val);
    });

    this.textarea.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        this.exitEditMode(true);
      }
    });

    this.textarea.addEventListener("blur", () => {
      this.exitEditMode(true);
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

    if (this.textarea) {
      this.editorContainer.innerHTML = "";
      this.textarea = null;
    }

    this.editorContainer.classList.add("hidden");
    this.titleBar.classList.remove("hidden");
    this.canvasContainer.classList.remove("hidden");
    this.el.classList.remove("editing");
    this.el.setAttribute("data-atomic", "true");

    this.updateBlock(this.block);
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

  public setNavigating(navigating: boolean) {
    this.isNavigating = navigating;
    if (navigating) {
      this.canvasContainer.classList.remove("inert-scroll");
      this.canvasContainer.classList.add("navigating");
    } else {
      this.canvasContainer.classList.add("inert-scroll");
      this.canvasContainer.classList.remove("navigating");
    }
  }

  public updateBlock(newBlock: DocumentBlock) {
    this.block = newBlock;
    this.renderHeader();
    if (this.viewport) {
      this.viewport.dispose();
      this.viewport = null;
    }
    this.canvasContainer.innerHTML = "";
    this.mountViewport();
  }

  public getIsSelected(): boolean {
    return this.isSelected;
  }

  public getIsNavigating(): boolean {
    return this.isNavigating;
  }

  public dispose() {
    if (this.viewport) {
      this.viewport.dispose();
      this.viewport = null;
    }
    if (this.el.parentElement) {
      this.el.parentElement.removeChild(this.el);
    }
  }
}
