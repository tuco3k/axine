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

import { DocumentBlock, BlockType, classifyBlockType } from "../block_model";
import { SpaceValue } from "../../core/types";
import { SpaceViewport } from "../../plot/space_viewport";

// Header badge per status; none while the figure shows a current result.
const FIGURE_BADGE: Record<DocumentBlock["status"], string | null> = {
  pending: "Not evaluated",
  incomplete: "Unfinished",
  computed: null,
  unknown: "Unknown",
  error: "Error",
  stale: "Stale",
};

export interface FigureBlockOptions {
  onSelect?: (blockId: string) => void;
  onNavigateToSource?: (symbolName: string) => void;
  // Whether the last evaluation bound the name; the link is shown only then.
  canNavigateToSource?: (symbolName: string) => boolean;
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
  private renderedResult: DocumentBlock["result"] = undefined;
  private renderedStatus: DocumentBlock["status"] | null = null;
  private visibilityObserver: IntersectionObserver | null = null;

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
    // The name the figure binds, or the name \figure(...) shows. Not the first
    // :name in the relation, which is usually an axis.
    const shownSymbol = /^\s*\\figure\b/.test(this.block.source) ? this.block.referencedSymbols?.[0] : undefined;
    const refSymbol = this.block.definedSymbol || shownSymbol || "Figure";
    label.textContent = refSymbol;
    titleLeft.appendChild(label);

    // Provenance Link ("Where it came from" per VOICE.md), to the block that
    // binds a name this figure shows but does not define.
    if (this.options.onNavigateToSource && shownSymbol && refSymbol === shownSymbol && this.options.canNavigateToSource?.(refSymbol)) {
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

    // State badge: only when the figure is not showing a current result.
    const badgeText = FIGURE_BADGE[this.block.status];
    if (badgeText) {
      const badge = document.createElement("span");
      badge.className = "doc-figure-badge badge-" + this.block.status;
      badge.textContent = badgeText;
      this.titleBar.appendChild(badge);
    }
  }

  private mountViewport() {
    this.renderedResult = this.block.result;
    this.renderedStatus = this.block.status;
    if (this.block.result && this.block.result.type === "space") {
      const spaceVal = this.block.result as SpaceValue;
      const width = this.block.metadata?.width || 480;
      const height = this.block.metadata?.height || 320;

      this.canvasContainer.style.width = width + "px";
      this.canvasContainer.style.height = height + "px";

      const create = () => {
        if (this.viewport) return;
        try {
          this.viewport = new SpaceViewport(this.canvasContainer, spaceVal, {
            width,
            height,
          });
          this.viewport.render();
        } catch (err) {
          console.warn("FigureBlock viewport render failed:", err);
        }
      };
      // Sample and draw only once the figure is on screen; a long document
      // holds many figures.
      if (typeof IntersectionObserver === "function") {
        this.visibilityObserver = new IntersectionObserver((entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            this.visibilityObserver?.disconnect();
            this.visibilityObserver = null;
            create();
          }
        });
        this.visibilityObserver.observe(this.canvasContainer);
      } else {
        create();
      }
    } else {
      // No space to draw: say what there is instead.
      const message = document.createElement("div");
      message.className = "doc-figure-message doc-figure-message-" + this.block.status;
      message.textContent = this.figureMessage();
      this.canvasContainer.style.width = "";
      this.canvasContainer.style.height = "";
      this.canvasContainer.appendChild(message);
    }
  }

  private figureMessage(): string {
    const result = this.block.result;
    switch (this.block.status) {
      case "error":
        return this.block.error?.message ?? "Error.";
      case "incomplete":
        return "The expression is unfinished.";
      case "unknown": {
        const detail = (result as any)?.detail ? `: ${(result as any).detail}` : "";
        return `Unknown (${(result as any)?.reason ?? "no reason given"})${detail}.`;
      }
      case "computed": {
        // Type names in the reader's words: check_result is "check result".
        const name = (result?.type ?? "value").replace(/_/g, " ");
        return `The result is ${/^[aeiou]/.test(name) ? "an" : "a"} ${name}, not a space.`;
      }
      default:
        return "No result yet.";
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
      const caret = this.textarea.selectionStart ?? val.length;

      // Text that is no longer a figure becomes whatever the classifier says it is.
      const classified = classifyBlockType(val);
      if (classified !== "figure") {
        this.options.onRequestTransform?.(this.block.id, classified, val, caret);
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
      this.exitEditMode(true, false);
    });

    this.textarea.focus();
    const targetOffset = caretOffset !== undefined ? caretOffset : this.textarea.value.length;
    if (typeof this.textarea.setSelectionRange === "function") {
      this.textarea.setSelectionRange(targetOffset, targetOffset);
    }
  }

  public exitEditMode(commit: boolean = true, refocus: boolean = true) {
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
    // A block closed because focus moved elsewhere leaves focus there.
    if (refocus) this.setSelected(true);
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
    // Rebuilding the viewport resets its camera; only do it for a new result,
    // or for a new status when the figure shows a message instead of a space.
    const showsSpace = newBlock.result?.type === "space";
    if (newBlock.result === this.renderedResult && (showsSpace || newBlock.status === this.renderedStatus)) {
      return;
    }
    this.visibilityObserver?.disconnect();
    this.visibilityObserver = null;
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
    this.visibilityObserver?.disconnect();
    this.visibilityObserver = null;
    if (this.viewport) {
      this.viewport.dispose();
      this.viewport = null;
    }
    if (this.el.parentElement) {
      this.el.parentElement.removeChild(this.el);
    }
  }
}
