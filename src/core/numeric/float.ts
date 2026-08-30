import { Span } from '../types';
import { createError } from '../errors';

export const FLOAT_CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: 2 * Math.PI,
  phi: (1 + Math.sqrt(5)) / 2,
};

export function floatSin(x: number): number {
  return Math.sin(x);
}

export function floatCos(x: number): number {
  return Math.cos(x);
}

export function floatTan(x: number): number {
  return Math.tan(x);
}

export function floatAsin(x: number, span?: Span): number {
  if (x < -1 || x > 1) {
    throw createError(
      `asin(${x}) is undefined for |x| > 1`,
      span ?? { start: 0, end: 0, line: 1, col: 1 },
      {
        expected: 'an argument in the range [-1, 1]',
        suggestion: 'Ensure the input to asin is between -1 and 1',
      }
    );
  }
  return Math.asin(x);
}

export function floatAcos(x: number, span?: Span): number {
  if (x < -1 || x > 1) {
    throw createError(
      `acos(${x}) is undefined for |x| > 1`,
      span ?? { start: 0, end: 0, line: 1, col: 1 },
      {
        expected: 'an argument in the range [-1, 1]',
        suggestion: 'Ensure the input to acos is between -1 and 1',
      }
    );
  }
  return Math.acos(x);
}

export function floatAtan(x: number): number {
  return Math.atan(x);
}

export function floatSinh(x: number): number {
  return Math.sinh(x);
}

export function floatCosh(x: number): number {
  return Math.cosh(x);
}

export function floatTanh(x: number): number {
  return Math.tanh(x);
}

export function floatLn(x: number, span?: Span): number {
  if (x <= 0) {
    throw createError(
      `ln(${x}) is undefined for non-positive values`,
      span ?? { start: 0, end: 0, line: 1, col: 1 },
      {
        expected: 'a strictly positive number (x > 0)',
        suggestion: 'Ensure input to ln is strictly positive',
      }
    );
  }
  return Math.log(x);
}

export function floatLog(x: number, span?: Span): number {
  if (x <= 0) {
    throw createError(
      `log(${x}) is undefined for non-positive values`,
      span ?? { start: 0, end: 0, line: 1, col: 1 },
      {
        expected: 'a strictly positive number (x > 0)',
        suggestion: 'Ensure input to log (base 10) is strictly positive',
      }
    );
  }
  return Math.log10(x);
}

export function floatLog2(x: number, span?: Span): number {
  if (x <= 0) {
    throw createError(
      `log2(${x}) is undefined for non-positive values`,
      span ?? { start: 0, end: 0, line: 1, col: 1 },
      {
        expected: 'a strictly positive number (x > 0)',
        suggestion: 'Ensure input to log2 is strictly positive',
      }
    );
  }
  return Math.log2(x);
}

export function floatExp(x: number): number {
  return Math.exp(x);
}

export function floatSqrt(x: number, span?: Span): number {
  if (x < 0) {
    throw createError(
      'Cannot compute square root of negative number in real mode (complex numbers deferred to future version)',
      span ?? { start: 0, end: 0, line: 1, col: 1 },
      {
        expected: 'a non-negative real number (x >= 0)',
        suggestion: 'Ensure input to sqrt is >= 0 or simplify expressions to non-negative terms',
      }
    );
  }
  return Math.sqrt(x);
}
