import { classifyLine, LineClassification } from './classifier';
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
}

export interface CompleteMessage {
  type: 'COMPLETE';
  id: number;
  totalDurationMs: number;
}

export type WorkerInMessage = EvaluateRequest | SetDiskFilesMessage;
export type WorkerOutMessage = LineResultMessage | CompleteMessage;

let currentEvalId = 0;

function getDelimiterDelta(line: string): number {
  let delta = 0;
  let inString = false;
  let strChar = '';
  for (let idx = 0; idx < line.length; idx++) {
    const ch = line[idx];
    if (inString) {
      if (ch === strChar && line[idx - 1] !== '\\') inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      strChar = ch;
      continue;
    }
    if (ch === '#') break; // rest of line is comment
    if (ch === '(' || ch === '[' || ch === '{') delta++;
    else if (ch === ')' || ch === ']' || ch === '}') delta--;
  }
  return delta;
}

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

  let accumulatedLines: string[] = [];
  let openCount = 0;
  let inFrontmatter = lines.length > 0 && lines[0].trim() === '---';

  for (let i = 0; i < lines.length; i++) {
    if (isCancelled()) {
      break;
    }

    const line = lines[i];
    const lineStart = Date.now();
    const trimmed = line.trim();

    // Handle YAML frontmatter at document start
    if (inFrontmatter) {
      if (i > 0 && trimmed === '---') {
        inFrontmatter = false;
      }
      onLineResult({
        type: 'LINE_RESULT',
        id,
        lineIndex: i,
        line,
        classification: { state: 'PROSE' },
        durationMs: Date.now() - lineStart,
      });
      continue;
    }

    if (trimmed.startsWith('#') || trimmed.length === 0) {
      if (openCount === 0) {
        onLineResult({
          type: 'LINE_RESULT',
          id,
          lineIndex: i,
          line,
          classification: { state: 'PROSE' },
          durationMs: Date.now() - lineStart,
        });
        continue;
      }
    }

    const delta = getDelimiterDelta(line);
    const newOpenCount = Math.max(0, openCount + delta);

    if (openCount > 0 || (newOpenCount > 0 && delta > 0)) {
      accumulatedLines.push(line);
      openCount = newOpenCount;
      if (openCount > 0) {
        onLineResult({
          type: 'LINE_RESULT',
          id,
          lineIndex: i,
          line,
          classification: { state: 'INCOMPLETE' },
          durationMs: Date.now() - lineStart,
        });
        continue;
      }
    }

    const sourceToEval = accumulatedLines.length > 0 ? accumulatedLines.join('\n') : line;
    accumulatedLines = [];
    openCount = 0;

    const classification = classifyLine(sourceToEval, env);

    if (classification.state === 'INCOMPLETE' && i < lines.length - 1) {
      accumulatedLines = [sourceToEval];
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

    if (classification.state === 'PROSE' || classification.state === 'INCOMPLETE') {
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
      });
    }
  }

  return { totalDurationMs: Date.now() - startTime };
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
            self.postMessage(lineRes);
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
