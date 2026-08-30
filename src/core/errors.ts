import { Span } from './types';

export interface Diagnostic {
  message: string;
  expected?: string;
  suggestion?: string;
  span: Span;
  source?: string;
}

export type MathDiagnostic = Diagnostic;

export class MathError extends Error {
  public readonly diagnostic: Diagnostic;

  constructor(diagnostic: Diagnostic) {
    super(diagnostic.message);
    this.name = 'MathError';
    this.diagnostic = diagnostic;
    Object.setPrototypeOf(this, MathError.prototype);
  }

  get span(): Span {
    return this.diagnostic.span;
  }

  get expected(): string | undefined {
    return this.diagnostic.expected;
  }

  get suggestion(): string | undefined {
    return this.diagnostic.suggestion;
  }

  public format(source?: string): string {
    const src = source || this.diagnostic.source || '';
    const span = this.diagnostic.span;
    const lines = src.split(/\r?\n/);
    const lineIndex = Math.max(0, Math.min(span.line - 1, lines.length - 1));
    const lineContent = lines[lineIndex] ?? '';
    const colIndex = Math.max(0, span.col - 1);
    const length = Math.max(1, span.end - span.start);

    const lineNumStr = `  ${span.line} | `;
    const indent = ' '.repeat(lineNumStr.length + colIndex);
    const underline = '^'.repeat(Math.min(length, Math.max(1, lineContent.length - colIndex)));

    const parts: string[] = [];
    parts.push(`Error: ${this.diagnostic.message}`);
    if (src.trim().length > 0) {
      parts.push(`${lineNumStr}${lineContent}`);
      parts.push(`${indent}${underline}`);
    }
    if (this.diagnostic.expected) {
      parts.push(`  Expected: ${this.diagnostic.expected}`);
    }
    if (this.diagnostic.suggestion) {
      parts.push(`  Suggestion: ${this.diagnostic.suggestion}`);
    }
    return parts.join('\n');
  }
}

export function createError(
  message: string,
  span: Span,
  options?: { expected?: string; suggestion?: string; source?: string }
): MathError {
  return new MathError({
    message,
    span,
    expected: options?.expected,
    suggestion: options?.suggestion,
    source: options?.source,
  });
}
