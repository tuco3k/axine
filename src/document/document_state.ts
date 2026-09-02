import { LineClassification } from '../core/classifier';
import { Value } from '../core/types';
import { MathDiagnostic } from '../core/errors';
import { LineResultMessage, processDocumentLines, WorkerInMessage, WorkerOutMessage } from '../core/worker';

export interface DocumentLineRecord {
  lineIndex: number;
  text: string;
  classification: LineClassification;
  result?: Value;
  error?: MathDiagnostic;
  isShadowed?: boolean;
  boundName?: string;
  durationMs: number;
  isEvaluating?: boolean;
}

export type DocumentStateListener = (lines: DocumentLineRecord[], isEvaluating: boolean) => void;

export class DocumentState {
  private rawText: string = '';
  private lines: string[] = [];
  private records: DocumentLineRecord[] = [];
  private listeners: Set<DocumentStateListener> = new Set();
  private ambientWorker: Worker | null = null;
  private invokedWorker: Worker | null = null;
  private currentAmbientEvalId: number = 0;
  private currentInvokedEvalId: number = 0;
  private isEvaluating: boolean = false;
  private isInvokedRunning: boolean = false;
  private evaluationStartTime: number = 0;
  private lastEvaluationDuration: number = 0;

  private diskFiles: Record<string, string> = {};
  private baseDir: string = '';

  constructor(initialText: string = '') {
    this.initWorkers();
    this.setText(initialText);
  }

  public setDiskFiles(files: Record<string, string>) {
    this.diskFiles = { ...files };
    if (this.ambientWorker) {
      this.ambientWorker.postMessage({ type: 'SET_DISK_FILES', files });
    }
    if (this.invokedWorker) {
      this.invokedWorker.postMessage({ type: 'SET_DISK_FILES', files });
    }
    this.scheduleEvaluation();
  }

  public clearDiskFiles() {
    this.diskFiles = {};
    if (this.ambientWorker) {
      this.ambientWorker.postMessage({ type: 'SET_DISK_FILES', files: {} });
    }
    if (this.invokedWorker) {
      this.invokedWorker.postMessage({ type: 'SET_DISK_FILES', files: {} });
    }
    this.scheduleEvaluation();
  }

  public setBaseDir(dir: string) {
    this.baseDir = dir;
    this.scheduleEvaluation();
  }

  public initWorkers() {
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        if (this.ambientWorker) this.ambientWorker.terminate();
        this.ambientWorker = new Worker(new URL('../core/worker.ts', import.meta.url), { type: 'module' });
        this.ambientWorker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
          this.handleAmbientWorkerMessage(e.data);
        };
        if (Object.keys(this.diskFiles).length > 0) {
          this.ambientWorker.postMessage({ type: 'SET_DISK_FILES', files: this.diskFiles });
        }

        if (this.invokedWorker) this.invokedWorker.terminate();
        this.invokedWorker = new Worker(new URL('../core/worker.ts', import.meta.url), { type: 'module' });
        this.invokedWorker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
          this.handleInvokedWorkerMessage(e.data);
        };
        if (Object.keys(this.diskFiles).length > 0) {
          this.invokedWorker.postMessage({ type: 'SET_DISK_FILES', files: this.diskFiles });
        }
      } catch (err) {
        console.warn('Worker initialization failed, falling back to direct synchronous evaluation', err);
        this.ambientWorker = null;
        this.invokedWorker = null;
      }
    }
  }

  public subscribe(listener: DocumentStateListener): () => void {
    this.listeners.add(listener);
    listener(this.records, this.isEvaluating || this.isInvokedRunning);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.records, this.isEvaluating || this.isInvokedRunning);
    }
  }

  public setText(newText: string) {
    if (this.rawText === newText && this.records.length > 0) {
      return;
    }

    this.rawText = newText;
    const splitLines = newText.split('\n');
    this.lines = splitLines;

    // Initialize or resize records array
    this.records = splitLines.map((line, idx) => {
      const prev = this.records[idx];
      if (prev && prev.text === line) {
        return prev;
      }
      return {
        lineIndex: idx,
        text: line,
        classification: { state: 'INCOMPLETE' },
        durationMs: 0,
        isEvaluating: true,
      };
    });

    this.scheduleEvaluation();
  }

  public getText(): string {
    return this.rawText;
  }

  public getLines(): string[] {
    return this.lines;
  }

  public getRecords(): DocumentLineRecord[] {
    return this.records;
  }

  public getLastDurationMs(): number {
    return this.lastEvaluationDuration;
  }

  public getIsEvaluating(): boolean {
    return this.isEvaluating || this.isInvokedRunning;
  }

  public getIsInvokedRunning(): boolean {
    return this.isInvokedRunning;
  }

  private scheduleEvaluation() {
    this.currentAmbientEvalId++;
    const evalId = this.currentAmbientEvalId;
    this.isEvaluating = true;
    this.evaluationStartTime = Date.now();
    this.notify();

    if (this.ambientWorker) {
      // Keystroke cancels in-flight evaluation by dispatching new evalId
      const msg: WorkerInMessage = {
        type: 'EVALUATE',
        id: evalId,
        lines: this.lines,
        diskFiles: this.diskFiles,
        baseDir: this.baseDir,
      };
      this.ambientWorker.postMessage(msg);
    } else {
      // Synchronous fallback (for headless test environments)
      processDocumentLines(
        evalId,
        this.lines,
        (lineRes) => {
          if (this.currentAmbientEvalId === evalId) {
            this.handleLineResult(lineRes);
          }
        },
        () => this.currentAmbientEvalId !== evalId
      );

      if (this.currentAmbientEvalId === evalId) {
        this.isEvaluating = false;
        this.lastEvaluationDuration = Date.now() - this.evaluationStartTime;
        this.notify();
      }
    }
  }

  public runInvoked(budgetLimits: any = { timeoutMs: 10000, maxSteps: 100000000, maxDepth: 2000, maxBigIntDigits: 50000, maxMemoryElements: 500000 }) {
    this.currentInvokedEvalId++;
    const evalId = this.currentInvokedEvalId;
    this.isInvokedRunning = true;
    this.evaluationStartTime = Date.now();
    this.notify();

    if (this.invokedWorker) {
      const msg: WorkerInMessage = {
        type: 'EVALUATE',
        id: evalId,
        lines: this.lines,
        budgetLimits,
        diskFiles: this.diskFiles,
        baseDir: this.baseDir,
      };
      this.invokedWorker.postMessage(msg);
    } else {
      processDocumentLines(
        evalId,
        this.lines,
        (lineRes) => {
          if (this.currentInvokedEvalId === evalId) {
            this.handleLineResult(lineRes);
          }
        },
        () => this.currentInvokedEvalId !== evalId,
        budgetLimits
      );

      if (this.currentInvokedEvalId === evalId) {
        this.isInvokedRunning = false;
        this.lastEvaluationDuration = Date.now() - this.evaluationStartTime;
        this.notify();
      }
    }
  }

  public stop(): { durationMs: number } {
    const t0 = performance.now();
    if (this.ambientWorker) {
      this.ambientWorker.terminate();
      this.ambientWorker = null;
    }
    if (this.invokedWorker) {
      this.invokedWorker.terminate();
      this.invokedWorker = null;
    }
    this.isEvaluating = false;
    this.isInvokedRunning = false;
    this.initWorkers();
    const durationMs = performance.now() - t0;
    this.notify();
    return { durationMs };
  }

  private handleAmbientWorkerMessage(msg: WorkerOutMessage) {
    if (msg.id !== this.currentAmbientEvalId) {
      return; // Stale message from cancelled in-flight ambient evaluation
    }

    if (msg.type === 'LINE_RESULT') {
      this.handleLineResult(msg);
    } else if (msg.type === 'COMPLETE') {
      this.isEvaluating = false;
      this.lastEvaluationDuration = msg.totalDurationMs;
      this.notify();
    }
  }

  private handleInvokedWorkerMessage(msg: WorkerOutMessage) {
    if (msg.id !== this.currentInvokedEvalId) {
      return;
    }

    if (msg.type === 'LINE_RESULT') {
      this.handleLineResult(msg);
    } else if (msg.type === 'COMPLETE') {
      this.isInvokedRunning = false;
      this.lastEvaluationDuration = msg.totalDurationMs;
      this.notify();
    }
  }

  private handleLineResult(msg: LineResultMessage) {
    if (msg.lineIndex < this.records.length) {
      this.records[msg.lineIndex] = {
        lineIndex: msg.lineIndex,
        text: msg.line,
        classification: msg.classification,
        result: msg.result,
        error: msg.error,
        isShadowed: msg.isShadowed,
        boundName: msg.boundName,
        durationMs: msg.durationMs,
        isEvaluating: false,
      };
      this.notify();
    }
  }

  public dispose() {
    this.stop();
    this.listeners.clear();
  }
}
