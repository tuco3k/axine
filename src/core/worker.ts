import { analyzeMath, LineClassification } from './classifier';
import { segmentDocument } from './segments';
import { createInitialEnvironment, evaluate, BudgetTracker, Evaluator } from './evaluator';
import { BudgetLimits, DEFAULT_BUDGET_LIMITS, Environment, Value } from './types';
import { MathDiagnostic, MathError } from './errors';

export interface EvaluateRequest {
  type: 'EVALUATE';
  id: number;
  lines: string[];
  budgetLimits?: BudgetLimits;
  diskFiles?: Record<string, string>;
  baseDir?: string;
}

export interface SetDiskFilesMessage {
  type: 'SET_DISK_FILES';
  files: Record<string, string>;
}

export interface LineResultMessage {
  type: 'LINE_RESULT';
  id: number;
  lineIndex: number;
  line: string;
  classification: LineClassification;
  result?: Value;
  error?: MathDiagnostic;
  durationMs: number;
  isShadowed?: boolean;
  boundName?: string;
  // Line index of the first line of the evaluated source. A multi-line block
  // is reported on its last line; spans inside it count from this line.
  sourceStartLine?: number;
}

export interface CompleteMessage {
  type: 'COMPLETE';
  id: number;
  totalDurationMs: number;
}

export type WorkerInMessage = EvaluateRequest | SetDiskFilesMessage;
export type WorkerOutMessage = LineResultMessage | CompleteMessage;

let currentEvalId = 0;

export function processDocumentLines(
  id: number,
  lines: string[],
  onLineResult: (res: LineResultMessage) => void,
  isCancelled: () => boolean = () => false,
  budgetLimits: BudgetLimits = DEFAULT_BUDGET_LIMITS
): { totalDurationMs: number } {
  const startTime = Date.now();
  const env: Environment = createInitialEnvironment();
  const definedSymbols = new Set<string>();

  // One unit per segment. Lines outside math units are prose; each line of a
  // multi-line unit but its last is reported as part of an unfinished unit,
  // and the unit's result is reported on its last line.
  const segments = segmentDocument(lines);

  for (const segment of segments) {
    if (isCancelled()) {
      break;
    }

    if (segment.kind !== 'math') {
      for (let l = segment.start; l <= segment.end; l++) {
        onLineResult({
          type: 'LINE_RESULT',
          id,
          lineIndex: l,
          line: lines[l],
          classification: { state: 'PROSE' },
          durationMs: 0,
        });
      }
      continue;
    }

    for (let l = segment.start; l < segment.end; l++) {
      onLineResult({
        type: 'LINE_RESULT',
        id,
        lineIndex: l,
        line: lines[l],
        classification: { state: 'INCOMPLETE' },
        durationMs: 0,
      });
    }

    const i = segment.end;
    const line = lines[i];
    const lineStart = Date.now();
    const sourceToEval = lines.slice(segment.start, segment.end + 1).join('\n');
    const classification = analyzeMath(sourceToEval, env);

    if (classification.state === 'INCOMPLETE') {
      onLineResult({
        type: 'LINE_RESULT',
        id,
        lineIndex: i,
        line,
        classification,
        durationMs: Date.now() - lineStart,
      });
      continue;
    }

    if (classification.state === 'ERROR') {
      let diag = classification.diagnostic;
      if (!diag) {
        try {
          const budget = new BudgetTracker(budgetLimits);
          evaluate(sourceToEval, env, budget);
        } catch (e: any) {
          if (e instanceof MathError) {
            diag = e.diagnostic;
          } else {
            diag = {
              message: e.message || 'Syntax error',
              span: { start: 0, end: sourceToEval.length, line: 1, col: 1 },
              source: sourceToEval,
            };
          }
        }
      }

      onLineResult({
        type: 'LINE_RESULT',
        id,
        lineIndex: i,
        line,
        classification,
        error: diag,
        durationMs: Date.now() - lineStart,
        sourceStartLine: segment.start,
      });
      continue;
    }

    // MATH or DEFINITION
    try {
      const budget = new BudgetTracker(budgetLimits);
      const evalRes = evaluate(sourceToEval, env, budget);
      const isShadowed = classification.boundName ? definedSymbols.has(classification.boundName) : false;
      if (classification.boundName) {
        definedSymbols.add(classification.boundName);
      }

      onLineResult({
        type: 'LINE_RESULT',
        id,
        lineIndex: i,
        line,
        classification,
        result: evalRes.value,
        boundName: classification.boundName,
        isShadowed,
        durationMs: Date.now() - lineStart,
        sourceStartLine: segment.start,
      });
    } catch (e: any) {
      const diag: MathDiagnostic = e instanceof MathError
        ? e.diagnostic
        : {
            message: e.message || 'Evaluation error',
            span: { start: 0, end: sourceToEval.length, line: 1, col: 1 },
            source: sourceToEval,
          };

      onLineResult({
        type: 'LINE_RESULT',
        id,
        lineIndex: i,
        line,
        classification: { state: 'ERROR', diagnostic: diag },
        error: diag,
        durationMs: Date.now() - lineStart,
        sourceStartLine: segment.start,
      });
    }
  }

  return { totalDurationMs: Date.now() - startTime };
}

function sanitizeValueForWorker(val: any): any {
  if (!val || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(sanitizeValueForWorker);
  if (val.type === 'space') {
    return {
      ...val,
      entities: (val.entities || []).map((e: any) => {
        const { compiledFn, ...rest } = e;
        return rest;
      }),
      nestedSpaces: val.nestedSpaces ? sanitizeValueForWorker(val.nestedSpaces) : undefined,
      resultVal: val.resultVal ? sanitizeValueForWorker(val.resultVal) : undefined,
    };
  }
  return val;
}

// In Web Worker context
if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function' && typeof window === 'undefined') {
  self.onmessage = (e: MessageEvent<WorkerInMessage>) => {
    const msg = e.data;
    if (msg.type === 'SET_DISK_FILES') {
      Evaluator.setDiskFiles(msg.files);
    } else if (msg.type === 'EVALUATE') {
      if (msg.diskFiles) {
        Evaluator.setDiskFiles(msg.diskFiles);
      }
      if (msg.baseDir) {
        Evaluator.setBaseDir(msg.baseDir);
      }
      currentEvalId = msg.id;
      const targetId = msg.id;

      const { totalDurationMs } = processDocumentLines(
        targetId,
        msg.lines,
        (lineRes) => {
          if (currentEvalId === targetId) {
            const sanitized: LineResultMessage = {
              ...lineRes,
              result: lineRes.result ? sanitizeValueForWorker(lineRes.result) : undefined,
            };
            self.postMessage(sanitized);
          }
        },
        () => currentEvalId !== targetId,
        msg.budgetLimits
      );

      if (currentEvalId === targetId) {
        self.postMessage({
          type: 'COMPLETE',
          id: targetId,
          totalDurationMs,
        });
      }
    }
  };
}
