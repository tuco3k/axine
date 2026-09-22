/**
 * BlockDocumentEditor — Root editor container for the Block Document Model
 * 
 * Orchestrates:
 * - Document parsing and serialization (parseAxDocument, serializeAxDocument)
 * - Block lifecycle: FigureBlockComponent, EquationBlockComponent, ParagraphBlockComponent
 * - Word's atomic object navigation (single-arrow stepping, selection, focus)
 * - Provenance jump links from figures to defining equations
 * - Reactive dependency state
 */

import { DocumentBlock, DocumentModel, BlockType } from "./block_model";
import { BlockState } from "./block_state";
import { FigureBlockComponent } from "./blocks/figure_block";
import { EquationBlockComponent } from "./blocks/equation_block";
import { ParagraphBlockComponent } from "./blocks/paragraph_block";
import { HeadingBlockComponent } from "./blocks/heading_block";
import { SlotBlockComponent } from "./blocks/slot_block";

export interface BlockEditorOptions {
  onChange?: (fullText: string) => void;
  onSelectBlock?: (blockId: string | null) => void;
  onBlockCountChange?: (count: number) => void;
  readOnly?: boolean;
}

export type BlockComponent =
  | FigureBlockComponent
  | EquationBlockComponent
  | ParagraphBlockComponent
  | HeadingBlockComponent
  | SlotBlockComponent;

export class BlockDocumentEditor {
  public readonly container: HTMLElement;
  public readonly pageSheet: HTMLElement;
  private model: DocumentModel;
  private state: BlockState;
  private blockComponents: Map<string, BlockComponent> = new Map();
  private selectedBlockId: string | null = null;
  private isAllSelected: boolean = false;
  private selectedRange: [number, number] | null = null;
  private isMouseDownOnSheet: boolean = false;
  private dragStartIdx: number | null = null;
  private options: BlockEditorOptions;

  constructor(container: HTMLElement, initialText: string = "", options: BlockEditorOptions = {}) {
    this.container = container;
    this.options = options;
    this.container.classList.add("doc-block-editor");

    this.pageSheet = document.createElement("div");
    this.pageSheet.className = "doc-page-sheet";
    this.container.appendChild(this.pageSheet);

    this.state = new BlockState(initialText);
    this.model = this.state.getModel();
    this.renderAllBlocks();
    this.bindGlobalEvents();

    if (this.model.blocks.length === 1 && this.model.blocks[0].source.trim() === "") {
      const firstComp = this.blockComponents.get(this.model.blocks[0].id);
      if (firstComp && 'enterEditMode' in firstComp && typeof (firstComp as any).enterEditMode === 'function') {
        this.selectBlock(this.model.blocks[0].id);
        (firstComp as any).enterEditMode();
      }
    }
  }

  /**
   * Renders or rebuilds all blocks in the document flow
   */
  private renderAllBlocks(): void {
    // Dispose existing components
    for (const comp of this.blockComponents.values()) {
      comp.dispose();
    }
    this.blockComponents.clear();
    this.pageSheet.innerHTML = "";

    for (let i = 0; i < this.model.blocks.length; i++) {
      const block = this.model.blocks[i];
      const comp = this.createBlockComponent(block);
      if (comp) {
        this.blockComponents.set(block.id, comp);
        this.pageSheet.appendChild(comp.el);
      }
    }

    this.options.onBlockCountChange?.(this.model.blocks.length);
  }

  /**
   * Creates a specialized component for a block based on its type
   */
  private createBlockComponent(block: DocumentBlock): BlockComponent | null {
    if (block.type === "blank") {
      const p = new ParagraphBlockComponent(block, {
        onSelect: (id: string) => this.selectBlock(id),
        onStepNext: () => this.stepNext(block.id),
        onStepPrev: () => this.stepPrev(block.id),
        onCommit: (id: string, src: string) => this.handleBlockCommit(id, src),
        onRequestTransform: (id, targetType, src, caretOffset) => this.transformBlock(id, targetType, src, caretOffset),
        onDeleteRequest: (id: string) => this.deleteBlock(id),
        onRequestSelectAll: () => this.selectAll(),
        isOnlyBlock: this.model.blocks.length === 1,
      });
      return p;
    }

    if (block.type === "figure") {
      const fig = new FigureBlockComponent(block, {
        onSelect: (id: string) => this.selectBlock(id),
        onStepNext: () => this.stepNext(block.id),
        onStepPrev: () => this.stepPrev(block.id),
        onNavigateToSource: (sym: string) => this.navigateToSource(sym),
        onDeleteRequest: (id: string) => this.deleteBlock(id),
        onCommit: (id: string, src: string) => this.handleBlockCommit(id, src),
        onRequestTransform: (id, targetType, src, caretOffset) => this.transformBlock(id, targetType, src, caretOffset),
      });
      return fig;
    }

    if (block.type === "equation") {
      const eq = new EquationBlockComponent(block, {
        onSelect: (id: string) => this.selectBlock(id),
        onStepNext: () => this.stepNext(block.id),
        onStepPrev: () => this.stepPrev(block.id),
        onCommit: (id: string, src: string) => this.handleBlockCommit(id, src),
        onDeleteRequest: (id: string) => this.deleteBlock(id),
        onRequestTransform: (id, targetType, src, caretOffset) => this.transformBlock(id, targetType, src, caretOffset),
        onRequestSelectAll: () => this.selectAll(),
        clickToEdit: true,
      });
      return eq;
    }

    if (block.type === "heading") {
      const heading = new HeadingBlockComponent(block, {
        onSelect: (id: string) => this.selectBlock(id),
        onStepNext: () => this.stepNext(block.id),
        onStepPrev: () => this.stepPrev(block.id),
        onCommit: (id: string, src: string) => this.handleBlockCommit(id, src),
        onDeleteRequest: (id: string) => this.deleteBlock(id),
        onRequestTransform: (id, targetType, src, caretOffset) => this.transformBlock(id, targetType, src, caretOffset),
        onRequestSelectAll: () => this.selectAll(),
        clickToEdit: true,
      });
      return heading;
    }

    if (block.type === "slot") {
      const slot = new SlotBlockComponent(block, {
        onSelect: (id: string) => this.selectBlock(id),
        onStepNext: () => this.stepNext(block.id),
        onStepPrev: () => this.stepPrev(block.id),
        onCommit: (id: string, src: string) => this.handleBlockCommit(id, src),
        onDeleteRequest: (id: string) => this.deleteBlock(id),
        onRequestTransform: (id, targetType, src, caretOffset) => this.transformBlock(id, targetType, src, caretOffset),
        onRequestSelectAll: () => this.selectAll(),
        clickToEdit: true,
      });
      return slot;
    }

    // Default: paragraph
    const para = new ParagraphBlockComponent(block, {
      onSelect: (id: string) => this.selectBlock(id),
      onStepNext: () => this.stepNext(block.id),
      onStepPrev: () => this.stepPrev(block.id),
      onCommit: (id: string, src: string) => this.handleBlockCommit(id, src),
      onRequestTransform: (id, targetType, src, caretOffset) => this.transformBlock(id, targetType, src, caretOffset),
      onDeleteRequest: (id: string) => this.deleteBlock(id),
      onRequestSelectAll: () => this.selectAll(),
      isOnlyBlock: this.model.blocks.length === 1,
    });
    return para;
  }

  /**
   * Transforms a block into another block type preserving content
   */
  public transformBlock(
    blockId: string,
    newType: BlockType,
    newSource: string,
    caretOffset?: number
  ): void {
    const block = this.state.getBlock(blockId);
    if (!block) return;

    block.type = newType;
    block.source = newSource;
    block.lines = newSource.split("\n");
    this.state.setBlockType(blockId, newType);
    this.state.updateBlock(blockId, newSource);
    this.model = this.state.getModel();

    const oldComp = this.blockComponents.get(blockId);
    const newComp = this.createBlockComponent(block);
    if (!newComp) return;

    // Replace in DOM
    if (oldComp && oldComp.el.parentElement) {
      oldComp.el.parentElement.replaceChild(newComp.el, oldComp.el);
      oldComp.dispose();
    } else {
      this.pageSheet.appendChild(newComp.el);
    }

    this.blockComponents.set(blockId, newComp);

    // Route focus & caret based on new block type FIRST to establish editing state
    if (newType === "slot") {
      const slotComp = newComp as SlotBlockComponent;
      const decl = (slotComp as any).decl;
      const data = slotComp.getData();
      const firstSlot = decl ? decl.getSlotIds(data)[0] : "slot_0_0";
      slotComp.enterEditMode(firstSlot, caretOffset ?? 0);
    } else if (newType === "figure") {
      const figComp = newComp as FigureBlockComponent;
      figComp.setSelected(true);
      figComp.el.focus();
    } else if (newType === "heading") {
      const headingComp = newComp as HeadingBlockComponent;
      headingComp.enterEditMode(caretOffset);
    } else if (newType === "equation") {
      const eqComp = newComp as EquationBlockComponent;
      eqComp.enterEditMode(caretOffset);
    } else if (newType === "paragraph") {
      const paraComp = newComp as ParagraphBlockComponent;
      paraComp.enterEditMode(caretOffset ?? newSource.length);
    }

    this.selectBlock(blockId);

    this.options.onChange?.(this.state.toText());
  }

  /**
   * Handles changes committed from an active editing block
   */
  private handleBlockCommit(blockId: string, newSource: string): void {
    this.state.updateBlock(blockId, newSource);
    this.model = this.state.getModel();

    // Update status indicators on figure blocks
    for (const [id, comp] of this.blockComponents.entries()) {
      const block = this.model.blocks.find((b) => b.id === id);
      if (block && comp instanceof FigureBlockComponent) {
        comp.updateBlock(block);
      }
    }

    const fullText = this.state.toText();
    this.options.onChange?.(fullText);
  }

  /**
   * Delete a block from the document
   */
  public deleteBlock(blockId: string): void {
    const idx = this.model.blocks.findIndex((b) => b.id === blockId);
    if (idx === -1) return;

    if (this.model.blocks.length === 1) {
      this.transformBlock(blockId, "paragraph", "");
      return;
    }

    const nextSelectId = idx + 1 < this.model.blocks.length
      ? this.model.blocks[idx + 1].id
      : (idx > 0 ? this.model.blocks[idx - 1].id : null);

    this.state.deleteBlock(blockId);
    this.model = this.state.getModel();
    this.renderAllBlocks();

    if (nextSelectId) {
      this.selectBlock(nextSelectId);
    }
    this.options.onChange?.(this.state.toText());
  }

  /**
   * Inserts a new block after the given block and immediately enters edit mode
   */
  public insertBlockAfter(currentBlockId: string, type: BlockType = "paragraph", source: string = ""): DocumentBlock {
    const newBlock = this.state.insertBlock(currentBlockId, type, source);
    this.model = this.state.getModel();
    this.renderAllBlocks();
    this.selectBlock(newBlock.id);
    this.scrollToBlock(newBlock.id);
    const comp = this.blockComponents.get(newBlock.id);
    if (comp && "enterEditMode" in comp && typeof (comp as any).enterEditMode === "function") {
      (comp as any).enterEditMode(0);
    }
    this.options.onChange?.(this.state.toText());
    return newBlock;
  }

  /**
   * Sets selection on a single block, deselecting others
   */
  public selectBlock(blockId: string | null): void {
    if (this.isAllSelected || this.selectedRange) {
      this.deselectAll();
    }
    this.selectedBlockId = blockId;

    for (const [id, comp] of this.blockComponents.entries()) {
      if (id !== blockId) {
        if ("getIsEditing" in comp && typeof (comp as any).getIsEditing === "function" && (comp as any).getIsEditing()) {
          if ("exitEditMode" in comp && typeof (comp as any).exitEditMode === "function") {
            (comp as any).exitEditMode(true);
          }
        }
      }
      if ("setSelected" in comp && typeof comp.setSelected === "function") {
        comp.setSelected(id === blockId);
      }
    }

    this.options.onSelectBlock?.(blockId);
  }

  /**
   * Selects all blocks across the entire document
   */
  public selectAll(): void {
    if (this.selectedBlockId) {
      const comp = this.blockComponents.get(this.selectedBlockId);
      if (comp && "exitEditMode" in comp && typeof (comp as any).exitEditMode === "function") {
        (comp as any).exitEditMode(false);
      }
    }
    this.isAllSelected = true;
    this.selectedRange = [0, Math.max(0, this.model.blocks.length - 1)];
    this.selectedBlockId = null;
    this.pageSheet.classList.add("all-selected");
    for (const comp of this.blockComponents.values()) {
      comp.el.classList.add("doc-block-range-selected");
    }
    this.container.focus();
  }

  /**
   * Clears document-wide selection
   */
  public deselectAll(): void {
    this.isAllSelected = false;
    this.selectedRange = null;
    this.pageSheet.classList.remove("all-selected");
    for (const comp of this.blockComponents.values()) {
      comp.el.classList.remove("doc-block-range-selected");
    }
  }

  /**
   * Selects a contiguous range of blocks by index
   */
  public selectRange(startIdx: number, endIdx: number): void {
    const min = Math.max(0, Math.min(startIdx, endIdx));
    const max = Math.min(this.model.blocks.length - 1, Math.max(startIdx, endIdx));
    if (min === 0 && max === this.model.blocks.length - 1) {
      this.selectAll();
      return;
    }
    this.deselectAll();
    this.selectedRange = [min, max];
    for (let i = min; i <= max; i++) {
      const b = this.model.blocks[i];
      if (b) {
        const comp = this.blockComponents.get(b.id);
        comp?.el.classList.add("doc-block-range-selected");
      }
    }
  }

  /**
   * Deletes a range of blocks and maintains clean document state
   */
  public deleteRange(startIdx: number, endIdx: number): void {
    const min = Math.max(0, Math.min(startIdx, endIdx));
    const max = Math.min(this.model.blocks.length - 1, Math.max(startIdx, endIdx));
    const remaining = [
      ...this.model.blocks.slice(0, min),
      ...this.model.blocks.slice(max + 1),
    ];
    this.deselectAll();
    if (remaining.length === 0) {
      this.setText("");
      return;
    }
    const newText = remaining.map((b) => b.source).join("\n\n");
    this.setText(newText);
    const targetBlock = this.model.blocks[Math.min(min, this.model.blocks.length - 1)];
    if (targetBlock) {
      this.selectBlock(targetBlock.id);
    }
  }

  /**
   * Replaces a range of blocks with parsed pasted text
   */
  public replaceRangeWithText(startIdx: number, endIdx: number, text: string): void {
    const min = Math.max(0, Math.min(startIdx, endIdx));
    const max = Math.min(this.model.blocks.length - 1, Math.max(startIdx, endIdx));
    const beforeBlocks = this.model.blocks.slice(0, min);
    const afterBlocks = this.model.blocks.slice(max + 1);

    const beforeText = beforeBlocks.map((b) => b.source).join("\n\n");
    const afterText = afterBlocks.map((b) => b.source).join("\n\n");

    const combined = [beforeText, text, afterText].filter((s) => s.trim() !== "").join("\n\n");
    this.deselectAll();
    this.setText(combined);
  }

  /**
   * Steps focus to the next block in the document flow
   */
  public stepNext(currentBlockId: string, position: "start" | "end" = "start"): void {
    const idx = this.model.blocks.findIndex((b) => b.id === currentBlockId);
    if (idx !== -1) {
      if (idx + 1 < this.model.blocks.length) {
        const nextId = this.model.blocks[idx + 1].id;
        this.selectBlock(nextId);
        this.scrollToBlock(nextId);
        const comp = this.blockComponents.get(nextId);
        if (comp && "enterEditMode" in comp && typeof (comp as any).enterEditMode === "function") {
          (comp as any).enterEditMode(position === "start" ? 0 : "end");
        }
      } else {
        // At the bottom: insert a new paragraph block and focus it
        this.insertBlockAfter(currentBlockId);
      }
    }
  }

  /**
   * Steps focus to the previous block in the document flow
   */
  public stepPrev(currentBlockId: string, position: "start" | "end" = "end"): void {
    const idx = this.model.blocks.findIndex((b) => b.id === currentBlockId);
    if (idx > 0) {
      const prevId = this.model.blocks[idx - 1].id;
      this.selectBlock(prevId);
      this.scrollToBlock(prevId);
      const comp = this.blockComponents.get(prevId);
      if (comp && "enterEditMode" in comp && typeof (comp as any).enterEditMode === "function") {
        (comp as any).enterEditMode(position === "end" ? "end" : 0);
      }
    }
  }

  /**
   * Provenance navigation: jumps to the block defining the given symbol
   */
  public navigateToSource(symbol: string): boolean {
    const cleanSym = symbol.startsWith(":") ? symbol : ":" + symbol;
    const targetBlock = this.state.getDefiningBlock(cleanSym) || this.state.getDefiningBlock(cleanSym.substring(1));

    if (targetBlock) {
      this.scrollToBlock(targetBlock.id);
      this.selectBlock(targetBlock.id);
      return true;
    }

    // Fallback: substring search across line definitions
    const altTarget = this.model.blocks.find((b) => {
      const lines = b.source.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (
          trimmed.startsWith(cleanSym) ||
          trimmed.startsWith(cleanSym.substring(1) + " :=") ||
          trimmed.startsWith(cleanSym.substring(1) + " =")
        ) {
          return true;
        }
      }
      return false;
    });

    if (altTarget) {
      this.scrollToBlock(altTarget.id);
      this.selectBlock(altTarget.id);
      return true;
    }

    return false;
  }

  /**
   * Smoothly scrolls to a block and pulses a highlight border
   */
  public scrollToBlock(blockId: string): void {
    const comp = this.blockComponents.get(blockId);
    if (comp && comp.el) {
      comp.el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      comp.el.classList.add("highlight-pulse");
      setTimeout(() => {
        comp.el.classList.remove("highlight-pulse");
      }, 1200);
    }
  }

  private bindGlobalEvents(): void {
    // Clicking empty space in container or page sheet activates the last block into edit mode
    this.container.addEventListener("click", (e) => {
      if (this.isAllSelected) {
        this.deselectAll();
      }
      if (e.target === this.container || e.target === this.pageSheet) {
        const lastBlock = this.model.blocks[this.model.blocks.length - 1];
        if (lastBlock) {
          this.selectBlock(lastBlock.id);
          const comp = this.blockComponents.get(lastBlock.id);
          if (comp && 'enterEditMode' in comp && typeof (comp as any).enterEditMode === 'function') {
            (comp as any).enterEditMode();
          }
        }
      }
    });

    // Mouse drag selection across multiple blocks
    this.pageSheet.addEventListener("mousedown", (e) => {
      if (this.isAllSelected) {
        this.deselectAll();
      }
      const blockEl = (e.target as HTMLElement).closest(".doc-block");
      if (blockEl) {
        const blockId = blockEl.getAttribute("data-block-id");
        const idx = this.model.blocks.findIndex((b) => b.id === blockId);
        if (idx !== -1) {
          this.dragStartIdx = idx;
          this.isMouseDownOnSheet = true;
        }
      }
    });

    window.addEventListener("mousemove", (e) => {
      if (!this.isMouseDownOnSheet || this.dragStartIdx === null) return;
      const targetEl = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
      const blockEl = targetEl?.closest?.(".doc-block");
      if (blockEl) {
        const blockId = blockEl.getAttribute("data-block-id");
        const currentIdx = this.model.blocks.findIndex((b) => b.id === blockId);
        if (currentIdx !== -1 && currentIdx !== this.dragStartIdx) {
          // Exit edit mode if any block was active
          if (this.selectedBlockId) {
            const comp = this.blockComponents.get(this.selectedBlockId);
            if (comp && "exitEditMode" in comp && typeof (comp as any).exitEditMode === "function") {
              (comp as any).exitEditMode(false);
            }
          }
          this.selectRange(this.dragStartIdx, currentIdx);
        }
      }
    });

    window.addEventListener("mouseup", () => {
      this.isMouseDownOnSheet = false;
      this.dragStartIdx = null;
    });

    // Global document copy handler (capture phase)
    this.container.addEventListener("copy", (e: ClipboardEvent) => {
      if (this.isAllSelected) {
        e.preventDefault();
        e.stopPropagation();
        const text = this.getText();
        e.clipboardData?.setData("text/plain", text);
        try {
          navigator.clipboard?.writeText(text);
        } catch {}
        return;
      }
      if (this.selectedRange) {
        e.preventDefault();
        e.stopPropagation();
        const [start, end] = this.selectedRange;
        const text = this.model.blocks.slice(start, end + 1).map((b) => b.source).join("\n\n");
        e.clipboardData?.setData("text/plain", text);
        try {
          navigator.clipboard?.writeText(text);
        } catch {}
        return;
      }
      if (this.selectedBlockId) {
        // If an entire block is selected without active text selection inside input
        const comp = this.blockComponents.get(this.selectedBlockId);
        const isEditing = comp && "getIsEditing" in comp && typeof (comp as any).getIsEditing === "function" && (comp as any).getIsEditing();
        if (!isEditing) {
          const block = this.model.blocks.find((b) => b.id === this.selectedBlockId);
          if (block) {
            e.preventDefault();
            e.stopPropagation();
            e.clipboardData?.setData("text/plain", block.source);
            try {
              navigator.clipboard?.writeText(block.source);
            } catch {}
            return;
          }
        }
      }
    }, true);

    // Global document cut handler (capture phase)
    this.container.addEventListener("cut", (e: ClipboardEvent) => {
      if (this.isAllSelected) {
        e.preventDefault();
        e.stopPropagation();
        const text = this.getText();
        e.clipboardData?.setData("text/plain", text);
        try {
          navigator.clipboard?.writeText(text);
        } catch {}
        this.deselectAll();
        this.setText("");
        return;
      }
      if (this.selectedRange) {
        e.preventDefault();
        e.stopPropagation();
        const [start, end] = this.selectedRange;
        const text = this.model.blocks.slice(start, end + 1).map((b) => b.source).join("\n\n");
        e.clipboardData?.setData("text/plain", text);
        try {
          navigator.clipboard?.writeText(text);
        } catch {}
        this.deleteRange(start, end);
        return;
      }
    }, true);

    // Keyboard shortcuts & typing activation
    this.container.addEventListener("keydown", (e: KeyboardEvent) => {
      // Document-wide Cmd+A / Ctrl+A
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        const el = e.target as HTMLElement;
        const isInput =
          el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          el?.tagName?.toLowerCase() === "math-field" ||
          Boolean(el?.closest?.("math-field"));
        if (!isInput) {
          e.preventDefault();
          e.stopPropagation();
          this.selectAll();
          return;
        }
      }

      if (this.isAllSelected) {
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          e.stopPropagation();
          this.deselectAll();
          this.setText("");
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          this.deselectAll();
          return;
        }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
          this.deselectAll();
          const targetId = e.key === "ArrowDown" ? this.model.blocks[0]?.id : this.model.blocks[this.model.blocks.length - 1]?.id;
          if (targetId) this.selectBlock(targetId);
          return;
        }
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          e.stopPropagation();
          this.deselectAll();
          this.setText(e.key);
          const firstBlock = this.model.blocks[0];
          if (firstBlock) {
            this.selectBlock(firstBlock.id);
            const comp = this.blockComponents.get(firstBlock.id);
            if (comp && "enterEditMode" in comp && typeof (comp as any).enterEditMode === "function") {
              (comp as any).enterEditMode();
            }
          }
          return;
        }
      }

      if (this.selectedRange) {
        if (e.key === "Backspace" || e.key === "Delete") {
          e.preventDefault();
          e.stopPropagation();
          const [start, end] = this.selectedRange;
          this.deleteRange(start, end);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          this.deselectAll();
          return;
        }
      }

      const el = e.target as HTMLElement;
      const isInput =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el?.tagName?.toLowerCase() === "math-field" ||
        Boolean(el?.closest?.("math-field")) ||
        Boolean(el?.closest?.(".doc-block-source-input")) ||
        Boolean(el?.closest?.(".editing"));
      if (isInput) return;

      // If any block is currently in edit mode, container level navigation must not interfere
      for (const comp of this.blockComponents.values()) {
        if ("getIsEditing" in comp && typeof (comp as any).getIsEditing === "function" && (comp as any).getIsEditing()) {
          return;
        }
      }

      if (e.key === "ArrowDown") {
        if (this.selectedBlockId) {
          e.preventDefault();
          this.stepNext(this.selectedBlockId);
        }
      } else if (e.key === "ArrowUp") {
        if (this.selectedBlockId) {
          e.preventDefault();
          this.stepPrev(this.selectedBlockId);
        }
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const targetId = this.selectedBlockId || (this.model.blocks.length > 0 ? this.model.blocks[this.model.blocks.length - 1].id : null);
        if (targetId) {
          const comp = this.blockComponents.get(targetId);
          if (comp && 'enterEditMode' in comp && typeof (comp as any).enterEditMode === 'function') {
            e.preventDefault();
            this.selectBlock(targetId);
            (comp as any).enterEditMode(e.key);
          }
        }
      }
    });

    // Paste handler: parse and integrate pasted text into structured blocks or full document
    this.container.addEventListener("paste", (e: ClipboardEvent) => {
      const pasteText = e.clipboardData?.getData("text/plain");
      if (!pasteText) return;

      if (this.isAllSelected) {
        e.preventDefault();
        e.stopPropagation();
        this.deselectAll();
        this.setText(pasteText);
        return;
      }

      if (this.selectedRange) {
        e.preventDefault();
        e.stopPropagation();
        const [start, end] = this.selectedRange;
        this.replaceRangeWithText(start, end, pasteText);
        return;
      }

      // If pasting multi-line or whole .ax document
      if (pasteText.includes("\n") || pasteText.startsWith("---") || pasteText.startsWith("#")) {
        e.preventDefault();
        e.stopPropagation();

        // Exit edit mode on active block
        if (this.selectedBlockId) {
          const comp = this.blockComponents.get(this.selectedBlockId);
          if (comp && "exitEditMode" in comp && typeof (comp as any).exitEditMode === "function") {
            (comp as any).exitEditMode(false);
          }
        }

        const isOnlyBlank = this.model.blocks.length <= 1 && (!this.model.blocks[0] || this.model.blocks[0].source.trim() === "");
        if (isOnlyBlank) {
          this.setText(pasteText);
          return;
        }

        const targetBlockId = this.selectedBlockId || (this.model.blocks.length > 0 ? this.model.blocks[this.model.blocks.length - 1].id : null);
        const targetIdx = this.model.blocks.findIndex((b) => b.id === targetBlockId);
        if (targetIdx !== -1) {
          const targetBlock = this.model.blocks[targetIdx];
          const isTargetEmpty = targetBlock.source.trim() === "";

          const beforeBlocks = this.model.blocks.slice(0, isTargetEmpty ? targetIdx : targetIdx + 1);
          const afterBlocks = this.model.blocks.slice(targetIdx + 1);

          const beforeText = beforeBlocks.map((b) => b.source).join("\n\n");
          const afterText = afterBlocks.map((b) => b.source).join("\n\n");

          const combined = [beforeText, pasteText, afterText].filter((s) => s.trim() !== "").join("\n\n");
          this.setText(combined);
        } else {
          this.setText(pasteText);
        }
      }
    }, true);
  }

  /**
   * Gets the full document text serialized in .ax format
   */
  public getText(): string {
    return this.state.toText();
  }

  /**
   * Replaces document text and rebuilds the block layout
   */
  public setText(text: string): void {
    this.state.setText(text);
    this.model = this.state.getModel();
    this.selectedBlockId = null;
    this.renderAllBlocks();
    this.options.onChange?.(text);
  }

  /**
   * Gets the active DocumentModel
   */
  public getModel(): DocumentModel {
    return this.model;
  }

  /**
   * Gets the list of parsed blocks
   */
  public getBlocks(): DocumentBlock[] {
    return this.model.blocks;
  }

  /**
   * Gets a specific block by ID
   */
  public getBlock(id: string): DocumentBlock | undefined {
    return this.model.blocks.find((b) => b.id === id);
  }

  /**
   * Gets the component for a block by ID
   */
  public getComponent(id: string): BlockComponent | undefined {
    return this.blockComponents.get(id);
  }

  /**
   * Gets the currently selected block ID
   */
  public getSelectedBlockId(): string | null {
    return this.selectedBlockId;
  }

  /**
   * Gets the reactive BlockState
   */
  public getState(): BlockState {
    return this.state;
  }

  public dispose(): void {
    for (const comp of this.blockComponents.values()) {
      comp.dispose();
    }
    this.blockComponents.clear();
    this.container.innerHTML = "";
  }
}
