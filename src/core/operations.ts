/**
 * Unified Mathematical Operation Table
 *
 * Provides a single source of truth for:
 * 1. Exact reduction on Value representations (Rationals, Floats, Matrices, Booleans, Quantities)
 * 2. Real float evaluation with consistent handling of mathematical domains and negative-base roots
 * 3. JavaScript code generation for compiled closures
 *
 * Eliminates handwritten dispatch divergence between reducer, compiler, and types.
 */

export function findRationalFraction(val: number, maxDenom: number = 99): { p: number; q: number } | null {
  if (!Number.isFinite(val)) return null;
  if (Math.abs(val - Math.round(val)) < 1e-10) {
    return { p: Math.round(val), q: 1 };
  }
  for (let q = 2; q <= maxDenom; q++) {
    const p = Math.round(val * q);
    if (Math.abs(val - p / q) < 1e-7) {
      return { p, q };
    }
  }
  return null;
}

export function realPow(base: number, exp: number): number {
  if (base > 0) return Math.pow(base, exp);
  if (base === 0) {
    if (exp === 0) return NaN; // 0^0 is indeterminate in standard real arithmetic
    return exp > 0 ? 0 : Infinity;
  }
  // base < 0
  const frac = findRationalFraction(exp);
  if (frac) {
    if (frac.q % 2 !== 0) {
      const sign = frac.p % 2 !== 0 ? -1 : 1;
      return sign * Math.pow(-base, frac.p / frac.q);
    }
  }
  return NaN; // Even root of negative number has no real root in R
}

export function realMod(a: number, b: number): number {
  if (b === 0) return NaN;
  const rem = a % b;
  return rem;
}


export interface OperationDef {
  name: string;
  symbol: string;
  kind: 'binary' | 'unary' | 'postfix' | 'function';
  evalFloat: (...args: number[]) => number;
  compileJS: (argExprs: string[]) => string;
}

export const REAL_HELPERS_CODE = `
function __realPow(base, exp) {
  if (base > 0) return Math.pow(base, exp);
  if (base === 0) return exp === 0 ? NaN : (exp > 0 ? 0 : Infinity);
  if (Math.abs(exp - Math.round(exp)) < 1e-10) return Math.pow(base, Math.round(exp));
  for (var q = 2; q <= 99; q++) {
    var p = Math.round(exp * q);
    if (Math.abs(exp - p / q) < 1e-7) {
      if (q % 2 !== 0) {
        return (p % 2 !== 0 ? -1 : 1) * Math.pow(-base, p / q);
      }
      return NaN;
    }
  }
  return NaN;
}
`;

export const OPERATIONS: Record<string, OperationDef> = {
  // Binary Arithmetic
  '+': {
    name: 'add',
    symbol: '+',
    kind: 'binary',
    evalFloat: (a, b) => a + b,
    compileJS: ([a, b]) => `((${a}) + (${b}))`,
  },
  '-': {
    name: 'subtract',
    symbol: '-',
    kind: 'binary',
    evalFloat: (a, b) => a - b,
    compileJS: ([a, b]) => `((${a}) - (${b}))`,
  },
  '*': {
    name: 'multiply',
    symbol: '*',
    kind: 'binary',
    evalFloat: (a, b) => a * b,
    compileJS: ([a, b]) => `((${a}) * (${b}))`,
  },
  '/': {
    name: 'divide',
    symbol: '/',
    kind: 'binary',
    evalFloat: (a, b) => (b === 0 ? NaN : a / b),
    compileJS: ([a, b]) => `((${a}) / (${b}))`,
  },
  '//': {
    name: 'fraction_divide',
    symbol: '//',
    kind: 'binary',
    evalFloat: (a, b) => (b === 0 ? NaN : a / b),
    compileJS: ([a, b]) => `((${a}) / (${b}))`,
  },
  '%': {
    name: 'modulo',
    symbol: '%',
    kind: 'binary',
    evalFloat: (a, b) => (b === 0 ? NaN : a % b),
    compileJS: ([a, b]) => `((${a}) % (${b}))`,
  },
  '^': {
    name: 'power',
    symbol: '^',
    kind: 'binary',
    evalFloat: (a, b) => realPow(a, b),
    compileJS: ([a, b]) => `__realPow(${a}, ${b})`,
  },

  // Binary Comparisons / Equalities
  '==': {
    name: 'equal',
    symbol: '==',
    kind: 'binary',
    evalFloat: (a, b) => (a === b ? 1 : 0),
    compileJS: ([a, b]) => `((${a}) === (${b}) ? 1 : 0)`,
  },
  '=': {
    name: 'relation_equal',
    symbol: '=',
    kind: 'binary',
    evalFloat: (a, b) => (a === b ? 1 : 0),
    compileJS: ([a, b]) => `(((${a}) === (${b})) ? 1 : 0)`,
  },
  '!=': {
    name: 'not_equal',
    symbol: '!=',
    kind: 'binary',
    evalFloat: (a, b) => (a !== b ? 1 : 0),
    compileJS: ([a, b]) => `((${a}) !== (${b}) ? 1 : 0)`,
  },
  '<': {
    name: 'less_than',
    symbol: '<',
    kind: 'binary',
    evalFloat: (a, b) => (a < b ? 1 : 0),
    compileJS: ([a, b]) => `((${a}) < (${b}) ? 1 : 0)`,
  },
  '<=': {
    name: 'less_than_or_equal',
    symbol: '<=',
    kind: 'binary',
    evalFloat: (a, b) => (a <= b ? 1 : 0),
    compileJS: ([a, b]) => `((${a}) <= (${b}) ? 1 : 0)`,
  },
  '>': {
    name: 'greater_than',
    symbol: '>',
    kind: 'binary',
    evalFloat: (a, b) => (a > b ? 1 : 0),
    compileJS: ([a, b]) => `((${a}) > (${b}) ? 1 : 0)`,
  },
  '>=': {
    name: 'greater_than_or_equal',
    symbol: '>=',
    kind: 'binary',
    evalFloat: (a, b) => (a >= b ? 1 : 0),
    compileJS: ([a, b]) => `((${a}) >= (${b}) ? 1 : 0)`,
  },
  'and': {
    name: 'logical_and',
    symbol: 'and',
    kind: 'binary',
    evalFloat: (a, b) => (a !== 0 && b !== 0 ? 1 : 0),
    compileJS: ([a, b]) => `(((${a}) !== 0 && (${b}) !== 0) ? 1 : 0)`,
  },
  'or': {
    name: 'logical_or',
    symbol: 'or',
    kind: 'binary',
    evalFloat: (a, b) => (a !== 0 || b !== 0 ? 1 : 0),
    compileJS: ([a, b]) => `(((${a}) !== 0 || (${b}) !== 0) ? 1 : 0)`,
  },

  // Unary Operators
  'neg': {
    name: 'negate',
    symbol: '-',
    kind: 'unary',
    evalFloat: a => -a,
    compileJS: ([a]) => `(-(${a}))`,
  },
  'pos': {
    name: 'positive',
    symbol: '+',
    kind: 'unary',
    evalFloat: a => +a,
    compileJS: ([a]) => `(+(${a}))`,
  },
  'not': {
    name: 'logical_not',
    symbol: 'not',
    kind: 'unary',
    evalFloat: a => (a === 0 ? 1 : 0),
    compileJS: ([a]) => `((${a}) === 0 ? 1 : 0)`,
  },
  // Postfix Operators
  '!': {
    name: 'factorial',
    symbol: '!',
    kind: 'postfix',
    evalFloat: a => {
      if (a < 0 || !Number.isInteger(a)) return NaN;
      let res = 1;
      for (let i = 2; i <= a; i++) res *= i;
      return res;
    },
    compileJS: ([a]) => {
      return `((() => { var _n = ${a}; if (_n < 0 || !Number.isInteger(_n)) return NaN; var _r = 1; for (var _i = 2; _i <= _n; _i++) _r *= _i; return _r; })())`;
    },
  },

  // Utility functions
  'min': {
    name: 'min',
    symbol: 'min',
    kind: 'function',
    evalFloat: (...args) => Math.min(...args),
    compileJS: (args) => `Math.min(${args.join(', ')})`,
  },
  'max': {
    name: 'max',
    symbol: 'max',
    kind: 'function',
    evalFloat: (...args) => Math.max(...args),
    compileJS: (args) => `Math.max(${args.join(', ')})`,
  },
};
