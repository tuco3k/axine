/**
 * Axine Block Document State Manager
 * 
 * Manages block collection, reactive symbol dependency graph,
 * and state invalidation (stale/error/verified).
 */

import { DocumentModel, DocumentBlock, BlockType, parseAxDocument, serializeAxDocument, extractDefinedSymbol, extractReferencedSymbols } from "./block_model";

export type BlockStateListener = (model: DocumentModel) => void;

export class BlockState {
  private model: DocumentModel;
  private listeners: BlockStateListener[] = [];
  private symbolDefinitions: Map<string, string> = new Map(); // symbol -> blockId
  private symbolDependencies: Map<string, Set<string>> = new Map(); // symbol -> Set<blockId>

  constructor(initialDocumentOrModel: string | DocumentModel) {
    if (typeof initialDocumentOrModel === "string") {
      this.model = parseAxDocument(initialDocumentOrModel);
    } else {
      this.model = initialDocumentOrModel;
    }
    this.rebuildSymbolGraphs();
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
    this.rebuildSymbolGraphs();
    this.notify();
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

  public rebuildSymbolGraphs() {
    this.symbolDefinitions.clear();
    this.symbolDependencies.clear();

    for (const b of this.model.blocks) {
      if (b.definedSymbol) {
        this.symbolDefinitions.set(b.definedSymbol, b.id);
      }
      if (b.referencedSymbols) {
        for (const ref of b.referencedSymbols) {
          let set = this.symbolDependencies.get(ref);
          if (!set) {
            set = new Set();
            this.symbolDependencies.set(ref, set);
          }
          set.add(b.id);
        }
      }
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

    const oldDef = b.definedSymbol;
    b.source = newSource;
    b.lines = newSource.split("\n");
    b.definedSymbol = extractDefinedSymbol(newSource);
    b.referencedSymbols = extractReferencedSymbols(newSource);

    this.rebuildSymbolGraphs();

    // Mark dependent blocks as stale
    if (b.definedSymbol) {
      const deps = this.symbolDependencies.get(b.definedSymbol);
      if (deps) {
        for (const depId of deps) {
          if (depId !== id) {
            const depBlock = this.getBlock(depId);
            if (depBlock) {
              depBlock.status = "stale";
            }
          }
        }
      }
    }

    if (oldDef && oldDef !== b.definedSymbol) {
      const oldDeps = this.symbolDependencies.get(oldDef);
      if (oldDeps) {
        for (const depId of oldDeps) {
          const depBlock = this.getBlock(depId);
          if (depBlock) {
            depBlock.status = "error";
            depBlock.error = {
              message: "Unresolved symbol " + oldDef,
              severity: "error",
            } as any;
          }
        }
      }
    }

    this.notify();
  }

  public deleteBlock(id: string) {
    const idx = this.model.blocks.findIndex(b => b.id === id);
    if (idx === -1) return;

    const deleted = this.model.blocks[idx];
    this.model.blocks.splice(idx, 1);

    this.rebuildSymbolGraphs();

    // If deleted block defined a symbol, mark referencing blocks as error
    if (deleted.definedSymbol) {
      const deps = this.symbolDependencies.get(deleted.definedSymbol);
      if (deps) {
        for (const depId of deps) {
          const depBlock = this.getBlock(depId);
          if (depBlock) {
            depBlock.status = "error";
            depBlock.error = {
              message: "Unresolved symbol " + deleted.definedSymbol,
              severity: "error",
            } as any;
          }
        }
      }
    }

    this.notify();
  }

  public insertBlock(afterId: string | null, type: BlockType = "paragraph", source: string = ""): DocumentBlock {
    const newBlock: DocumentBlock = {
      id: "block_" + Math.random().toString(36).substring(2, 9),
      type,
      source,
      lines: source.split("\n"),
      startLine: 1,
      endLine: 1,
      status: "verified",
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
    this.rebuildSymbolGraphs();
    this.notify();
    return newBlock;
  }

  public getDependentBlocks(symbol: string): DocumentBlock[] {
    const ids = this.symbolDependencies.get(symbol);
    if (!ids) return [];
    return Array.from(ids).map(id => this.getBlock(id)!).filter(Boolean);
  }

  public getDefiningBlock(symbol: string): DocumentBlock | undefined {
    const id = this.symbolDefinitions.get(symbol);
    if (!id) return undefined;
    return this.getBlock(id);
  }
}
