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

export function realSqrt(a: number): number {
  if (a < 0) return NaN;
  return Math.sqrt(a);
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
    evalFloat: (a, b) => a - b,
    compileJS: ([a, b]) => `((${a}) - (${b}))`,
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
  'sqrt': {
    name: 'square_root',
    symbol: 'sqrt',
    kind: 'function',
    evalFloat: a => realSqrt(a),
    compileJS: ([a]) => `((${a}) < 0 ? NaN : Math.sqrt(${a}))`,
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

  // Transcendental & Math Builtins
  'sin': { name: 'sin', symbol: 'sin', kind: 'function', evalFloat: a => Math.sin(a), compileJS: ([a]) => `Math.sin(${a})` },
  'cos': { name: 'cos', symbol: 'cos', kind: 'function', evalFloat: a => Math.cos(a), compileJS: ([a]) => `Math.cos(${a})` },
  'tan': { name: 'tan', symbol: 'tan', kind: 'function', evalFloat: a => Math.tan(a), compileJS: ([a]) => `Math.tan(${a})` },
  'asin': { name: 'asin', symbol: 'asin', kind: 'function', evalFloat: a => (a < -1 || a > 1 ? NaN : Math.asin(a)), compileJS: ([a]) => `((${a}) < -1 || (${a}) > 1 ? NaN : Math.asin(${a}))` },
  'acos': { name: 'acos', symbol: 'acos', kind: 'function', evalFloat: a => (a < -1 || a > 1 ? NaN : Math.acos(a)), compileJS: ([a]) => `((${a}) < -1 || (${a}) > 1 ? NaN : Math.acos(${a}))` },
  'atan': { name: 'atan', symbol: 'atan', kind: 'function', evalFloat: a => Math.atan(a), compileJS: ([a]) => `Math.atan(${a})` },
  'sinh': { name: 'sinh', symbol: 'sinh', kind: 'function', evalFloat: a => Math.sinh(a), compileJS: ([a]) => `Math.sinh(${a})` },
  'cosh': { name: 'cosh', symbol: 'cosh', kind: 'function', evalFloat: a => Math.cosh(a), compileJS: ([a]) => `Math.cosh(${a})` },
  'tanh': { name: 'tanh', symbol: 'tanh', kind: 'function', evalFloat: a => Math.tanh(a), compileJS: ([a]) => `Math.tanh(${a})` },
  'exp': { name: 'exp', symbol: 'exp', kind: 'function', evalFloat: a => Math.exp(a), compileJS: ([a]) => `Math.exp(${a})` },
  'ln': { name: 'ln', symbol: 'ln', kind: 'function', evalFloat: a => (a <= 0 ? NaN : Math.log(a)), compileJS: ([a]) => `((${a}) <= 0 ? NaN : Math.log(${a}))` },
  'log': { name: 'log', symbol: 'log', kind: 'function', evalFloat: (a, b) => (a <= 0 ? NaN : (b === undefined ? Math.log10(a) : Math.log(a) / Math.log(b))), compileJS: (args) => args.length === 1 ? `((${args[0]}) <= 0 ? NaN : Math.log10(${args[0]}))` : `Math.log(${args[0]}) / Math.log(${args[1]})` },
  'log2': { name: 'log2', symbol: 'log2', kind: 'function', evalFloat: a => (a <= 0 ? NaN : Math.log2(a)), compileJS: ([a]) => `((${a}) <= 0 ? NaN : Math.log2(${a}))` },
  'abs': { name: 'abs', symbol: 'abs', kind: 'function', evalFloat: a => Math.abs(a), compileJS: ([a]) => `Math.abs(${a})` },
  'floor': { name: 'floor', symbol: 'floor', kind: 'function', evalFloat: a => Math.floor(a), compileJS: ([a]) => `Math.floor(${a})` },
  'ceil': { name: 'ceil', symbol: 'ceil', kind: 'function', evalFloat: a => Math.ceil(a), compileJS: ([a]) => `Math.ceil(${a})` },
  'round': { name: 'round', symbol: 'round', kind: 'function', evalFloat: a => Math.round(a), compileJS: ([a]) => `Math.round(${a})` },
  'min': { name: 'min', symbol: 'min', kind: 'function', evalFloat: (...args) => Math.min(...args), compileJS: (args) => `Math.min(${args.join(', ')})` },
  'max': { name: 'max', symbol: 'max', kind: 'function', evalFloat: (...args) => Math.max(...args), compileJS: (args) => `Math.max(${args.join(', ')})` },
};
