/**
 * Axine Block Document State Manager
 *
 * Holds the block collection and keeps each block's document line numbers
 * current as blocks change. Block results and status come from evaluation
 * records (applyEvaluation); this class does not work them out itself.
 */

import { DocumentModel, DocumentBlock, BlockType, parseAxDocument, serializeAxDocument, extractDefinedSymbol, extractReferencedSymbols } from "./block_model";
import type { DocumentLineRecord } from "./document_state";

export type BlockStateListener = (model: DocumentModel) => void;

export class BlockState {
  private model: DocumentModel;
  private listeners: BlockStateListener[] = [];
  // Document line where the last evaluation bound each name (no leading colon).
  private bindingLines: Map<string, number> = new Map();

  constructor(initialDocumentOrModel: string | DocumentModel) {
    if (typeof initialDocumentOrModel === "string") {
      this.model = parseAxDocument(initialDocumentOrModel);
    } else {
      this.model = initialDocumentOrModel;
    }
  }

  public getModel(): DocumentModel {
    return this.model;
  }

  public getBlocks(): DocumentBlock[] {
    return this.model.blocks;
  }

  public getBlock(id: string): DocumentBlock | undefined {
    return this.model.blocks.find(b => b.id === id);
  }

  public setText(text: string) {
    this.model = parseAxDocument(text);
    this.bindingLines.clear();
    this.notify();
  }

  /**
   * Gives each math block the evaluation of its unit. The evaluator reports a
   * unit's result on the unit's last line, and blocks cover exactly one unit
   * (both come from core/segments.ts), so a block's result is the record on
   * its last line. A block whose record is missing or still being evaluated
   * is stale if it showed a result, otherwise pending.
   *
   * Records for a text other than this one are ignored and false is returned;
   * the evaluation of the current text follows.
   */
  public applyEvaluation(records: DocumentLineRecord[], evaluatedText: string): boolean {
    if (evaluatedText !== this.toText()) return false;

    this.bindingLines.clear();
    for (const rec of records) {
      if (rec && rec.boundName) {
        this.bindingLines.set(rec.boundName.replace(/^:/, ""), rec.sourceStartLine ?? rec.lineIndex);
      }
    }

    for (const block of this.model.blocks) {
      if (block.type === "paragraph" || block.type === "heading" || block.type === "blank") continue;
      const rec = records[block.endLine];
      if (!rec || rec.isEvaluating || rec.text !== block.lines[block.lines.length - 1]) {
        block.status = block.result !== undefined || block.error !== undefined ? "stale" : "pending";
      } else {
        block.result = rec.result;
        block.error = rec.error;
        if (rec.error) block.status = "error";
        else if (rec.classification.state === "INCOMPLETE") block.status = "incomplete";
        else if (rec.result?.type === "unknown") block.status = "unknown";
        else if (rec.result) block.status = "computed";
        else block.status = "pending";
      }
    }
    return true;
  }

  // The document line where the last evaluation bound `name`, if any.
  public bindingLine(name: string): number | undefined {
    return this.bindingLines.get(name.replace(/^:/, ""));
  }

  public toText(): string {
    return serializeAxDocument(this.model);
  }

  public subscribe(listener: BlockStateListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.model);
      } catch (err) {
        console.error("BlockState listener error:", err);
      }
    }
  }

  // Document line numbers of every block: frontmatter lines first, then each
  // block's lines, in order.
  private renumber() {
    const fm = this.model.rawFrontmatter || "";
    let next = fm ? fm.split("\n").length - 1 : 0;
    for (const b of this.model.blocks) {
      const count = b.source.split("\n").length;
      b.startLine = next;
      b.endLine = next + count - 1;
      next += count;
    }
  }

  public setBlockType(id: string, type: BlockType) {
    const b = this.getBlock(id);
    if (!b) return;
    b.type = type;
    this.notify();
  }

  public updateBlock(id: string, newSource: string): void {
    const b = this.getBlock(id);
    if (!b) return;
    if (b.source !== newSource) {
      // A result computed for the old text no longer describes this block.
      b.status = b.result !== undefined || b.error !== undefined ? "stale" : "pending";
    }
    b.source = newSource;
    b.lines = newSource.split("\n");
    b.definedSymbol = extractDefinedSymbol(newSource);
    b.referencedSymbols = extractReferencedSymbols(newSource);
    this.renumber();
    this.notify();
  }

  public deleteBlock(id: string) {
    const idx = this.model.blocks.findIndex(b => b.id === id);
    if (idx === -1) return;
    this.model.blocks.splice(idx, 1);
    this.renumber();
    this.notify();
  }

  public insertBlock(afterId: string | null, type: BlockType = "paragraph", source: string = ""): DocumentBlock {
    const newBlock: DocumentBlock = {
      id: "block_" + Math.random().toString(36).substring(2, 9),
      type,
      source,
      lines: source.split("\n"),
      startLine: 0,
      endLine: 0,
      status: "pending",
      definedSymbol: extractDefinedSymbol(source),
      referencedSymbols: extractReferencedSymbols(source),
    };
    if (!afterId) {
      this.model.blocks.push(newBlock);
    } else {
      const idx = this.model.blocks.findIndex(b => b.id === afterId);
      if (idx === -1) {
        this.model.blocks.push(newBlock);
      } else {
        this.model.blocks.splice(idx + 1, 0, newBlock);
      }
    }
    this.renumber();
    this.notify();
    return newBlock;
  }
}
