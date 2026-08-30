import { ASTNode, Environment, Value } from '../core/types';
import { createInitialEnvironment, evaluate } from '../core/evaluator';
import { MathError } from '../core/errors';

export interface NotebookCell {
  id: string;
  source: string;
  ast?: ASTNode;
  value?: Value;
  error?: MathError;
  executedAt?: number;
}

export class NotebookState {
  public cells: NotebookCell[] = [];
  public env: Environment = createInitialEnvironment();
  public title: string = 'Untitled Notebook';
  private listeners: Array<() => void> = [];

  constructor() {
    this.addCell();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public addCell(afterId?: string, source: string = ''): NotebookCell {
    const cell: NotebookCell = {
      id: 'cell_' + Math.random().toString(36).slice(2, 9),
      source,
    };
    if (afterId) {
      const idx = this.cells.findIndex(c => c.id === afterId);
      if (idx !== -1) {
        this.cells.splice(idx + 1, 0, cell);
      } else {
        this.cells.push(cell);
      }
    } else {
      this.cells.push(cell);
    }
    this.notify();
    return cell;
  }

  public removeCell(id: string): void {
    if (this.cells.length <= 1) {
      // Clear last cell instead of removing
      this.cells[0].source = '';
      this.cells[0].ast = undefined;
      this.cells[0].value = undefined;
      this.cells[0].error = undefined;
      this.recomputeAll();
      return;
    }
    this.cells = this.cells.filter(c => c.id !== id);
    this.recomputeAll();
  }

  public moveCell(id: string, direction: 'up' | 'down'): void {
    const idx = this.cells.findIndex(c => c.id === id);
    if (idx === -1) return;
    if (direction === 'up' && idx > 0) {
      const temp = this.cells[idx];
      this.cells[idx] = this.cells[idx - 1];
      this.cells[idx - 1] = temp;
      this.recomputeAll();
    } else if (direction === 'down' && idx < this.cells.length - 1) {
      const temp = this.cells[idx];
      this.cells[idx] = this.cells[idx + 1];
      this.cells[idx + 1] = temp;
      this.recomputeAll();
    }
  }

  public updateCellSource(id: string, source: string): void {
    const cell = this.cells.find(c => c.id === id);
    if (cell) {
      cell.source = source;
    }
  }

  public runCell(id: string): void {
    const startIdx = this.cells.findIndex(c => c.id === id);
    if (startIdx === -1) return;
    this.recomputeFrom(startIdx);
  }

  public recomputeAll(): void {
    this.recomputeFrom(0);
  }

  public recomputeFrom(startIndex: number): void {
    // Reconstruct environment up to startIndex
    const runningEnv = createInitialEnvironment();

    for (let i = 0; i < startIndex; i++) {
      const cell = this.cells[i];
      if (cell.source.trim().length > 0 && !cell.error) {
        try {
          const res = evaluate(cell.source, runningEnv);
          cell.ast = res.ast;
          cell.value = res.value;
          cell.error = undefined;
        } catch (e: any) {
          cell.error = e instanceof MathError ? e : new MathError({
            message: e.message || 'Unknown evaluation error',
            span: { start: 0, end: 0, line: 1, col: 1 },
          });
          cell.value = undefined;
        }
      }
    }

    // Evaluate startIndex and subsequent cells
    for (let i = startIndex; i < this.cells.length; i++) {
      const cell = this.cells[i];
      if (cell.source.trim().length === 0) {
        cell.ast = undefined;
        cell.value = undefined;
        cell.error = undefined;
        continue;
      }

      try {
        const res = evaluate(cell.source, runningEnv);
        cell.ast = res.ast;
        cell.value = res.value;
        cell.error = undefined;
        cell.executedAt = Date.now();
      } catch (e: any) {
        cell.error = e instanceof MathError ? e : new MathError({
          message: e.message || 'Unknown evaluation error',
          span: { start: 0, end: 0, line: 1, col: 1 },
        });
        cell.value = undefined;
      }
    }

    this.env = runningEnv;
    this.notify();
  }

  public serialize(): string {
    return JSON.stringify({
      title: this.title,
      cells: this.cells.map(c => ({ id: c.id, source: c.source })),
    }, null, 2);
  }

  public deserialize(json: string): void {
    try {
      const data = JSON.parse(json);
      this.title = data.title || 'Untitled Notebook';
      this.cells = (data.cells || []).map((c: any) => ({
        id: c.id || 'cell_' + Math.random().toString(36).slice(2, 9),
        source: c.source || '',
      }));
      if (this.cells.length === 0) {
        this.addCell();
      } else {
        this.recomputeAll();
      }
    } catch (e) {
      console.error('Failed to load notebook data', e);
    }
  }
}
