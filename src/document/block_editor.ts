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

import { DocumentBlock, DocumentModel } from "./block_model";
import { BlockState } from "./block_state";
import { FigureBlockComponent } from "./blocks/figure_block";
import { EquationBlockComponent } from "./blocks/equation_block";
import { ParagraphBlockComponent } from "./blocks/paragraph_block";
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
  | SlotBlockComponent;

export class BlockDocumentEditor {
  public readonly container: HTMLElement;
  private model: DocumentModel;
  private state: BlockState;
  private blockComponents: Map<string, BlockComponent> = new Map();
  private selectedBlockId: string | null = null;
  private options: BlockEditorOptions;

  constructor(container: HTMLElement, initialText: string = "", options: BlockEditorOptions = {}) {
    this.container = container;
    this.options = options;
    this.container.classList.add("doc-block-editor");

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
    this.container.innerHTML = "";

    for (let i = 0; i < this.model.blocks.length; i++) {
      const block = this.model.blocks[i];
      const comp = this.createBlockComponent(block);
      if (comp) {
        this.blockComponents.set(block.id, comp);
        this.container.appendChild(comp.el);
      }
    }

    this.options.onBlockCountChange?.(this.model.blocks.length);
  }

  /**
   * Creates a specialized component for a block based on its type
   */
  private createBlockComponent(block: DocumentBlock): BlockComponent | null {
    if (block.type === "blank") {
      // Blank lines can be lightweight spacer blocks or rendered as empty paragraphs
      const p = new ParagraphBlockComponent(block, {
        onSelect: (id: string) => this.selectBlock(id),
        onStepNext: () => this.stepNext(block.id),
        onStepPrev: () => this.stepPrev(block.id),
        onCommit: (id: string, src: string) => this.handleBlockCommit(id, src),
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
      });
      return fig;
    }

    if (block.type === "equation") {
      const eq = new EquationBlockComponent(block, {
        onSelect: (id: string) => this.selectBlock(id),
        onStepNext: () => this.stepNext(block.id),
        onStepPrev: () => this.stepPrev(block.id),
        onCommit: (id: string, src: string) => this.handleBlockCommit(id, src),
      });
      return eq;
    }

    if (block.type === "slot") {
      const slot = new SlotBlockComponent(block, {
        onSelect: (id: string) => this.selectBlock(id),
        onStepNext: () => this.stepNext(block.id),
        onStepPrev: () => this.stepPrev(block.id),
        onCommit: (id: string, src: string) => this.handleBlockCommit(id, src),
        onDeleteRequest: (id: string) => this.deleteBlock(id),
      });
      return slot;
    }

    // Default: paragraph, heading, derivation, table
    const para = new ParagraphBlockComponent(block, {
      onSelect: (id: string) => this.selectBlock(id),
      onStepNext: () => this.stepNext(block.id),
      onStepPrev: () => this.stepPrev(block.id),
      onCommit: (id: string, src: string) => this.handleBlockCommit(id, src),
    });
    return para;
  }

  /**
   * Handles changes committed from an active editing block
   */
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
   * Sets selection on a single block, deselecting others
   */
  public selectBlock(blockId: string | null): void {
    this.selectedBlockId = blockId;

    for (const [id, comp] of this.blockComponents.entries()) {
      if ("setSelected" in comp && typeof comp.setSelected === "function") {
        comp.setSelected(id === blockId);
      }
    }

    this.options.onSelectBlock?.(blockId);
  }

  /**
   * Steps focus to the next block in the document flow
   */
  public stepNext(currentBlockId: string): void {
    const idx = this.model.blocks.findIndex((b) => b.id === currentBlockId);
    if (idx !== -1 && idx + 1 < this.model.blocks.length) {
      const nextId = this.model.blocks[idx + 1].id;
      this.selectBlock(nextId);
      this.scrollToBlock(nextId);
    }
  }

  /**
   * Steps focus to the previous block in the document flow
   */
  public stepPrev(currentBlockId: string): void {
    const idx = this.model.blocks.findIndex((b) => b.id === currentBlockId);
    if (idx > 0) {
      const prevId = this.model.blocks[idx - 1].id;
      this.selectBlock(prevId);
      this.scrollToBlock(prevId);
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
    // Clicking empty space in container activates the last block into edit mode
    this.container.addEventListener("click", (e) => {
      if (e.target === this.container) {
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

    // Arrow navigation and typing activation when container has focus
    this.container.addEventListener("keydown", (e: KeyboardEvent) => {
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
