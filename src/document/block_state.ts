/**
 * Axine Block Document State Manager
 * 
 * Manages block collection, reactive symbol dependency graph,
 * and state invalidation (stale/error/verified).
 */

import { DocumentModel, DocumentBlock, parseAxDocument, serializeAxDocument, extractDefinedSymbol, extractReferencedSymbols } from "./block_model";

export type BlockStateListener = (model: DocumentModel) => void;

export class BlockState {
  private model: DocumentModel;
  private listeners: Set<BlockStateListener> = new Set();
  private symbolDefinitions: Map<string, string> = new Map(); // symbol -> blockId
  private symbolDependencies: Map<string, Set<string>> = new Map(); // symbol -> Set<blockId>

  constructor(initialText: string = "") {
    this.model = parseAxDocument(initialText);
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
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const l of this.listeners) {
      l(this.model);
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
        for (const sym of b.referencedSymbols) {
          let set = this.symbolDependencies.get(sym);
          if (!set) {
            set = new Set();
            this.symbolDependencies.set(sym, set);
          }
          set.add(b.id);
        }
      }
    }
  }

  public updateBlock(id: string, newSource: string) {
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
