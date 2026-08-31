import { BooleanValue, FloatValue, ListValue, MatrixValue, NoneValue, RationalValue, Span, UnknownReason, UnknownValue, Value } from '../types';
import { BigFraction } from './rational';
import { createError } from '../errors';
import {
  matrixAdd,
  matrixDet,
  matrixEigenvalues,
  matrixFromList,
  matrixInverse,
  matrixMul,
  matrixRank,
  matrixScalarMul,
  matrixSub,
  matrixTrace,
  matrixTranspose,
} from './matrix';

export function makeUnknown(reason: UnknownReason, detail?: string): UnknownValue {
  return { type: 'unknown', reason, detail };
}
import {
  floatAcos,
  floatAsin,
  floatAtan,
  floatCos,
  floatCosh,
  floatExp,
  floatLn,
  floatLog,
  floatLog2,
  floatSin,
  floatSinh,
  floatSqrt,
  floatTan,
  floatTanh,
} from './float';

export function makeRational(n: bigint, d: bigint = 1n, span?: Span): RationalValue | FloatValue {
  const frac = new BigFraction(n, d, span);
  if (frac.d.toString().length > 300) {
    return {
      type: 'float',
      value: frac.toNumber(),
      notice: 'exact result exceeded 300 digits; showing float',
    };
  }
  return { type: 'rational', n: frac.n, d: frac.d };
}

export function makeFloat(value: number, notice?: string): FloatValue {
  return { type: 'float', value, notice };
}

export function makeBoolean(value: boolean): BooleanValue {
  return { type: 'boolean', value };
}

export function makeNone(): NoneValue {
  return { type: 'none' };
}

export function valueToNumber(val: Value, span?: Span): number {
  if (val.type === 'rational') {
    const frac = new BigFraction(val.n, val.d, span);
    return frac.toNumber();
  }
  if (val.type === 'float') {
    return val.value;
  }
  if (val.type === 'none') {
    throw createError(`Cannot perform arithmetic on 'none'`, span ?? { start: 0, end: 0, line: 1, col: 1 }, {
      expected: 'a numeric value',
      suggestion: 'Check if search returned none',
    });
  }
  throw createError(`Expected numeric value, got ${val.type}`, span ?? { start: 0, end: 0, line: 1, col: 1 }, {
    expected: 'a number (rational or float)',
    suggestion: 'Provide a numeric expression',
  });
}

export function addValues(a: Value, b: Value, span?: Span): Value {
  if (a.type === 'unknown') return a;
  if (b.type === 'unknown') return b;
  if (a.type === 'none' || b.type === 'none') {
    throw createError(`Cannot perform arithmetic on 'none'`, span ?? { start: 0, end: 0, line: 1, col: 1 });
  }
  if (a.type === 'matrix' && b.type === 'matrix') {
    return matrixAdd(a, b, span);
  }
  if (a.type === 'list' && b.type === 'list') {
    return { type: 'list', elements: [...a.elements, ...b.elements] };
  }
  if (a.type === 'tuple' && b.type === 'tuple') {
    return { type: 'tuple', elements: [...a.elements, ...b.elements] };
  }
  if (a.type === 'rational' && b.type === 'rational') {
    const fA = new BigFraction(a.n, a.d, span);
    const fB = new BigFraction(b.n, b.d, span);
    const res = fA.add(fB, span);
    if (res.d.toString().length > 300) {
      return {
        type: 'float',
        value: res.toNumber(),
        notice: 'exact result exceeded 300 digits; showing float',
      };
    }
    return { type: 'rational', n: res.n, d: res.d };
  }
  const nA = valueToNumber(a, span);
  const nB = valueToNumber(b, span);
  const notice = (a.type === 'float' ? a.notice : undefined) ?? (b.type === 'float' ? b.notice : undefined);
  return { type: 'float', value: nA + nB, notice };
}

export function subValues(a: Value, b: Value, span?: Span): Value {
  if (a.type === 'unknown') return a;
  if (b.type === 'unknown') return b;
  if (a.type === 'none' || b.type === 'none') {
    throw createError(`Cannot perform arithmetic on 'none'`, span ?? { start: 0, end: 0, line: 1, col: 1 });
  }
  if (a.type === 'matrix' && b.type === 'matrix') {
    return matrixSub(a, b, span);
  }
  if (a.type === 'rational' && b.type === 'rational') {
    const fA = new BigFraction(a.n, a.d, span);
    const fB = new BigFraction(b.n, b.d, span);
    const res = fA.sub(fB, span);
    if (res.d.toString().length > 300) {
      return {
        type: 'float',
        value: res.toNumber(),
        notice: 'exact result exceeded 300 digits; showing float',
      };
    }
    return { type: 'rational', n: res.n, d: res.d };
  }
  const nA = valueToNumber(a, span);
  const nB = valueToNumber(b, span);
  const notice = (a.type === 'float' ? a.notice : undefined) ?? (b.type === 'float' ? b.notice : undefined);
  return { type: 'float', value: nA - nB, notice };
}

export function mulValues(a: Value, b: Value, span?: Span): Value {
  if (a.type === 'unknown') return a;
  if (b.type === 'unknown') return b;
  if (a.type === 'none' || b.type === 'none') {
    throw createError(`Cannot perform arithmetic on 'none'`, span ?? { start: 0, end: 0, line: 1, col: 1 });
  }
  if (a.type === 'matrix' && b.type === 'matrix') {
    return matrixMul(a, b, span);
  }
  if (a.type === 'matrix' && (b.type === 'rational' || b.type === 'float')) {
    return matrixScalarMul(b, a, span);
  }
  if ((a.type === 'rational' || a.type === 'float') && b.type === 'matrix') {
    return matrixScalarMul(a, b, span);
  }
  if (a.type === 'rational' && b.type === 'rational') {
    const fA = new BigFraction(a.n, a.d, span);
    const fB = new BigFraction(b.n, b.d, span);
    const res = fA.mul(fB, span);
    if (res.d.toString().length > 300) {
      return {
        type: 'float',
        value: res.toNumber(),
        notice: 'exact result exceeded 300 digits; showing float',
      };
    }
    return { type: 'rational', n: res.n, d: res.d };
  }
  const nA = valueToNumber(a, span);
  const nB = valueToNumber(b, span);
  const notice = (a.type === 'float' ? a.notice : undefined) ?? (b.type === 'float' ? b.notice : undefined);
  return { type: 'float', value: nA * nB, notice };
}

export function divValues(a: Value, b: Value, span?: Span): Value {
  if (a.type === 'unknown') return a;
  if (b.type === 'unknown') return b;
  if (a.type === 'none' || b.type === 'none') {
    throw createError(`Cannot perform arithmetic on 'none'`, span ?? { start: 0, end: 0, line: 1, col: 1 });
  }
  if (a.type === 'rational' && b.type === 'rational') {
    const fA = new BigFraction(a.n, a.d, span);
    const fB = new BigFraction(b.n, b.d, span);
    const res = fA.div(fB, span);
    if (res.d.toString().length > 300) {
      return {
        type: 'float',
        value: res.toNumber(),
        notice: 'exact result exceeded 300 digits; showing float',
      };
    }
    return { type: 'rational', n: res.n, d: res.d };
  }
  const nA = valueToNumber(a, span);
  const nB = valueToNumber(b, span);
  if (nB === 0) {
    throw createError('Division by zero', span ?? { start: 0, end: 0, line: 1, col: 1 }, {
      expected: 'a non-zero divisor',
      suggestion: 'Ensure divisor is not zero',
    });
  }
  const notice = (a.type === 'float' ? a.notice : undefined) ?? (b.type === 'float' ? b.notice : undefined);
  return { type: 'float', value: nA / nB, notice };
}

export function modValues(a: Value, b: Value, span?: Span): Value {
  if (a.type === 'unknown') return a;
  if (b.type === 'unknown') return b;
  if (a.type === 'none' || b.type === 'none') {
    throw createError(`Cannot perform arithmetic on 'none'`, span ?? { start: 0, end: 0, line: 1, col: 1 });
  }
  if (a.type === 'rational' && b.type === 'rational') {
    if (b.n === 0n) {
      throw createError('Modulo by zero', span ?? { start: 0, end: 0, line: 1, col: 1 }, {
        expected: 'a non-zero divisor',
        suggestion: 'Check the second argument of modulo',
      });
    }
    const fA = new BigFraction(a.n, a.d, span);
    const fB = new BigFraction(b.n, b.d, span);
    const div = fA.div(fB, span);
    const floorDiv = div.n / div.d;
    const res = fA.sub(fB.mul(new BigFraction(floorDiv, 1n, span), span), span);
    return { type: 'rational', n: res.n, d: res.d };
  }
  const nA = valueToNumber(a, span);
  const nB = valueToNumber(b, span);
  if (nB === 0) {
    throw createError('Modulo by zero', span ?? { start: 0, end: 0, line: 1, col: 1 }, {
      expected: 'a non-zero divisor',
      suggestion: 'Check the second argument of modulo',
    });
  }
  return { type: 'float', value: nA % nB };
}

export function powValues(a: Value, b: Value, span?: Span): Value {
  if (a.type === 'unknown') return a;
  if (b.type === 'unknown') return b;
  if (a.type === 'none' || b.type === 'none') {
    throw createError(`Cannot perform arithmetic on 'none'`, span ?? { start: 0, end: 0, line: 1, col: 1 });
  }
  if (a.type === 'rational' && b.type === 'rational') {
    const fA = new BigFraction(a.n, a.d, span);
    const fB = new BigFraction(b.n, b.d, span);

    if (fA.n === 0n && fB.n === 0n) {
      throw createError('Indeterminate form: 0^0 is undefined', span ?? { start: 0, end: 0, line: 1, col: 1 }, {
        expected: 'a non-zero base or exponent',
        suggestion: 'Avoid computing 0^0',
      });
    }

    if (fB.d === 1n) {
      const res = fA.powInt(fB.n, span);
      if (res.d.toString().length > 300) {
        return {
          type: 'float',
          value: res.toNumber(),
          notice: 'exact result exceeded 300 digits; showing float',
        };
      }
      return { type: 'rational', n: res.n, d: res.d };
    }

    if (fA.n < 0n) {
      throw createError(
        'Cannot compute fractional power of negative number in real mode (complex numbers deferred to future version)',
        span ?? { start: 0, end: 0, line: 1, col: 1 },
        {
          expected: 'a non-negative base for non-integer powers',
          suggestion: 'Ensure base is >= 0',
        }
      );
    }

    if (fB.n === 1n && fB.d === 2n) {
      const exact = fA.exactSqrt();
      if (exact) {
        return { type: 'rational', n: exact.n, d: exact.d };
      }
    }

    const baseNum = fA.toNumber();
    const expNum = fB.toNumber();
    return { type: 'float', value: Math.pow(baseNum, expNum) };
  }

  const nA = valueToNumber(a, span);
  const nB = valueToNumber(b, span);

  if (nA === 0 && nB === 0) {
    throw createError('Indeterminate form: 0^0 is undefined', span ?? { start: 0, end: 0, line: 1, col: 1 }, {
      expected: 'a non-zero base or exponent',
      suggestion: 'Avoid computing 0^0',
    });
  }

  if (nA < 0 && !Number.isInteger(nB)) {
    throw createError(
      'Cannot compute fractional power of negative number in real mode (complex numbers deferred to future version)',
      span ?? { start: 0, end: 0, line: 1, col: 1 },
      {
        expected: 'a non-negative base for non-integer powers',
        suggestion: 'Ensure base is >= 0',
      }
    );
  }

  return { type: 'float', value: Math.pow(nA, nB) };
}

export function compareValues(op: '=' | '==' | '!=' | '<' | '<=' | '>' | '>=', a: Value, b: Value, span?: Span): BooleanValue | UnknownValue {
  // Handle 'unknown' value equality (identity)
  if (op === '=' || op === '==') {
    if (a.type === 'unknown' && b.type === 'unknown') return { type: 'boolean', value: true };
    if (a.type === 'unknown' || b.type === 'unknown') return { type: 'boolean', value: false };
  }
  if (op === '!=' || (op as any) === '\u2260') {
    if (a.type === 'unknown' && b.type === 'unknown') return { type: 'boolean', value: false };
    if (a.type === 'unknown' || b.type === 'unknown') return { type: 'boolean', value: true };
  }
  if (a.type === 'unknown') return a;
  if (b.type === 'unknown') return b;
  // Handle 'none' value
  if (a.type === 'none' || b.type === 'none') {
    if (op === '=' || op === '==') {
      return { type: 'boolean', value: a.type === 'none' && b.type === 'none' };
    }
    if (op === '!=') {
      return { type: 'boolean', value: !(a.type === 'none' && b.type === 'none') };
    }
    throw createError(`Cannot compare ordering with 'none'`, span ?? { start: 0, end: 0, line: 1, col: 1 }, {
      expected: '= or != comparison with none',
      suggestion: 'Use = none or != none',
    });
  }

  // Handle boolean values
  if (a.type === 'boolean' && b.type === 'boolean') {
    if (op === '=' || op === '==') return { type: 'boolean', value: a.value === b.value };
    if (op === '!=') return { type: 'boolean', value: a.value !== b.value };
  }

  let cmp: number;
  if (a.type === 'rational' && b.type === 'rational') {
    const fA = new BigFraction(a.n, a.d, span);
    const fB = new BigFraction(b.n, b.d, span);
    cmp = fA.compareTo(fB);
  } else {
    const nA = valueToNumber(a, span);
    const nB = valueToNumber(b, span);
    if (nA < nB) cmp = -1;
    else if (nA > nB) cmp = 1;
    else cmp = 0;
  }

  let res = false;
  switch (op) {
    case '=':
    case '==':
      res = cmp === 0;
      break;
    case '!=':
      res = cmp !== 0;
      break;
    case '<':
      res = cmp < 0;
      break;
    case '<=':
      res = cmp <= 0;
      break;
    case '>':
      res = cmp > 0;
      break;
    case '>=':
      res = cmp >= 0;
      break;
  }

  return { type: 'boolean', value: res };
}

export function factorialValue(val: Value, span?: Span): RationalValue {
  if (val.type === 'rational' && val.d === 1n && val.n >= 0n) {
    const n = val.n;
    if (n > 10000n) {
      throw createError('Factorial operand too large (exceeds 10,000)', span ?? { start: 0, end: 0, line: 1, col: 1 }, {
        expected: 'an integer <= 10000',
        suggestion: 'Reduce the factorial operand',
      });
    }
    let res = 1n;
    for (let i = 2n; i <= n; i++) {
      res *= i;
    }
    return { type: 'rational', n: res, d: 1n };
  }

  throw createError('Factorial is only defined for non-negative integers', span ?? { start: 0, end: 0, line: 1, col: 1 }, {
    expected: 'a non-negative integer (e.g. 5!)',
    suggestion: 'Ensure the operand of ! is an integer >= 0',
  });
}

export function sqrtValue(val: Value, span?: Span): Value {
  if (val.type === 'rational') {
    const frac = new BigFraction(val.n, val.d, span);
    if (frac.n < 0n) {
      throw createError(
        'Cannot compute square root of negative number in real mode (complex numbers deferred to future version)',
        span ?? { start: 0, end: 0, line: 1, col: 1 },
        {
          expected: 'a non-negative real number (x >= 0)',
          suggestion: 'Ensure input to sqrt is >= 0',
        }
      );
    }
    const exact = frac.exactSqrt();
    if (exact) {
      return { type: 'rational', n: exact.n, d: exact.d };
    }
    return { type: 'float', value: floatSqrt(frac.toNumber(), span) };
  }

  const num = valueToNumber(val, span);
  return { type: 'float', value: floatSqrt(num, span) };
}

// -----------------------------------------------------------------------------
// Number Theory Functions
// -----------------------------------------------------------------------------

function requireInteger(val: Value, name: string, span?: Span): bigint {
  if (val.type === 'rational' && val.d === 1n) {
    return val.n;
  }
  if (val.type === 'float' && Number.isInteger(val.value)) {
    return BigInt(val.value);
  }
  throw createError(`${name}() requires an integer argument, got ${val.type}`, span ?? { start: 0, end: 0, line: 1, col: 1 }, {
    expected: 'an integer',
    suggestion: `Provide an integer to ${name}()`,
  });
}

export function isPrimeInt(n: bigint): boolean {
  if (n <= 1n) return false;
  if (n <= 3n) return true;
  if (n % 2n === 0n || n % 3n === 0n) return false;
  let i = 5n;
  while (i * i <= n) {
    if (n % i === 0n || n % (i + 2n) === 0n) return false;
    i += 6n;
  }
  return true;
}

export function nextPrimeInt(n: bigint): bigint {
  let candidate = n <= 1n ? 2n : n + 1n;
  while (!isPrimeInt(candidate)) {
    candidate++;
  }
  return candidate;
}

export function divisorsInt(n: bigint): bigint[] {
  if (n === 0n) return [];
  const absN = n < 0n ? -n : n;
  const small: bigint[] = [];
  const large: bigint[] = [];
  for (let i = 1n; i * i <= absN; i++) {
    if (absN % i === 0n) {
      small.push(i);
      const other = absN / i;
      if (other !== i) {
        large.push(other);
      }
    }
  }
  large.reverse();
  return [...small, ...large];
}

export function factorizeInt(n: bigint): [bigint, bigint][] {
  if (n <= 1n) return [];
  let temp = n;
  const factors: [bigint, bigint][] = [];

  let count2 = 0n;
  while (temp % 2n === 0n) {
    count2++;
    temp /= 2n;
  }
  if (count2 > 0n) factors.push([2n, count2]);

  let p = 3n;
  while (p * p <= temp) {
    let count = 0n;
    while (temp % p === 0n) {
      count++;
      temp /= p;
    }
    if (count > 0n) factors.push([p, count]);
    p += 2n;
  }
  if (temp > 1n) {
    factors.push([temp, 1n]);
  }
  return factors;
}

// -----------------------------------------------------------------------------
// Builtin Dispatcher
// -----------------------------------------------------------------------------

export function applyBuiltin(name: string, args: Value[], span?: Span): Value {
  for (const a of args) {
    if (a.type === 'unknown') return a;
  }
  switch (name) {
    case 'sin': {
      if (args.length !== 1) throw createError(`sin expects 1 argument, got ${args.length}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
      return { type: 'float', value: floatSin(valueToNumber(args[0], span)) };
    }
    case 'cos': {
      if (args.length !== 1) throw createError(`cos expects 1 argument, got ${args.length}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
      return { type: 'float', value: floatCos(valueToNumber(args[0], span)) };
    }
    case 'tan': {
      if (args.length !== 1) throw createError(`tan expects 1 argument, got ${args.length}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
      return { type: 'float', value: floatTan(valueToNumber(args[0], span)) };
    }
    case 'asin': {
      if (args.length !== 1) throw createError(`asin expects 1 argument, got ${args.length}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
      return { type: 'float', value: floatAsin(valueToNumber(args[0], span), span) };
    }
    case 'acos': {
      if (args.length !== 1) throw createError(`acos expects 1 argument, got ${args.length}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
      return { type: 'float', value: floatAcos(valueToNumber(args[0], span), span) };
    }
    case 'atan': {
      if (args.length !== 1) throw createError(`atan expects 1 argument, got ${args.length}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
      return { type: 'float', value: floatAtan(valueToNumber(args[0], span)) };
    }
    case 'sinh': {
      if (args.length !== 1) throw createError(`sinh expects 1 argument, got ${args.length}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
      return { type: 'float', value: floatSinh(valueToNumber(args[0], span)) };
    }
    case 'cosh': {
      if (args.length !== 1) throw createError(`cosh expects 1 argument, got ${args.length}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
      return { type: 'float', value: floatCosh(valueToNumber(args[0], span)) };
    }
    case 'tanh': {
      if (args.length !== 1) throw createError(`tanh expects 1 argument, got ${args.length}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
      return { type: 'float', value: floatTanh(valueToNumber(args[0], span)) };
    }
    case 'ln': {
      if (args.length !== 1) throw createError(`ln expects 1 argument, got ${args.length}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
      return { type: 'float', value: floatLn(valueToNumber(args[0], span), span) };
    }
    case 'log': {
      if (args.length === 1) {
        return { type: 'float', value: floatLog(valueToNumber(args[0], span), span) };
      }
      if (args.length === 2) {
        const val = valueToNumber(args[0], span);
        const base = valueToNumber(args[1], span);
        return { type: 'float', value: floatLn(val, span) / floatLn(base, span) };
      }
      throw createError(`log expects 1 or 2 arguments, got ${args.length}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
    }
    case 'log2': {
      if (args.length !== 1) throw createError(`log2 expects 1 argument, got ${args.length}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
      return { type: 'float', value: floatLog2(valueToNumber(args[0], span), span) };
    }
    case 'exp': {
      if (args.length !== 1) throw createError(`exp expects 1 argument, got ${args.length}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
      return { type: 'float', value: floatExp(valueToNumber(args[0], span)) };
    }
    case 'sqrt': {
      if (args.length !== 1) throw createError(`sqrt expects 1 argument, got ${args.length}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
      return sqrtValue(args[0], span);
    }
    case 'abs': {
      if (args.length !== 1) throw createError(`abs expects 1 argument, got ${args.length}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
      const a = args[0];
      if (a.type === 'rational') {
        const frac = new BigFraction(a.n, a.d, span).abs(span);
        return { type: 'rational', n: frac.n, d: frac.d };
      }
      return { type: 'float', value: Math.abs(valueToNumber(a, span)) };
    }
    case 'floor': {
      if (args.length !== 1) throw createError(`floor expects 1 argument, got ${args.length}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
      const a = args[0];
      if (a.type === 'rational') {
        let q = a.n / a.d;
        if (a.n < 0n && a.n % a.d !== 0n) {
          q -= 1n;
        }
        return { type: 'rational', n: q, d: 1n };
      }
      return { type: 'rational', n: BigInt(Math.floor(valueToNumber(a, span))), d: 1n };
    }
    case 'ceil': {
      if (args.length !== 1) throw createError(`ceil expects 1 argument, got ${args.length}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
      const a = args[0];
      if (a.type === 'rational') {
        let q = a.n / a.d;
        if (a.n > 0n && a.n % a.d !== 0n) {
          q += 1n;
        }
        return { type: 'rational', n: q, d: 1n };
      }
      return { type: 'rational', n: BigInt(Math.ceil(valueToNumber(a, span))), d: 1n };
    }
    case 'round': {
      if (args.length !== 1) throw createError(`round expects 1 argument, got ${args.length}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
      const num = valueToNumber(args[0], span);
      return { type: 'rational', n: BigInt(Math.round(num)), d: 1n };
    }
    case 'min': {
      if (args.length === 0) throw createError('min requires at least 1 argument', span ?? { start: 0, end: 0, line: 1, col: 1 });
      if (args.length === 1 && args[0].type === 'list') {
        const list = args[0] as ListValue;
        if (list.elements.length === 0) {
          throw createError('Cannot get min of an empty list', span ?? { start: 0, end: 0, line: 1, col: 1 });
        }
        let minVal = list.elements[0];
        for (let i = 1; i < list.elements.length; i++) {
          if ((compareValues('<', list.elements[i], minVal, span) as any).value) minVal = list.elements[i];
        }
        return minVal;
      }
      let minVal = args[0];
      for (let i = 1; i < args.length; i++) {
        if ((compareValues('<', args[i], minVal, span) as any).value) {
          minVal = args[i];
        }
      }
      return minVal;
    }
    case 'max': {
      if (args.length === 0) throw createError('max requires at least 1 argument', span ?? { start: 0, end: 0, line: 1, col: 1 });
      if (args.length === 1 && args[0].type === 'list') {
        const list = args[0] as ListValue;
        if (list.elements.length === 0) {
          throw createError('Cannot get max of an empty list', span ?? { start: 0, end: 0, line: 1, col: 1 });
        }
        let maxVal = list.elements[0];
        for (let i = 1; i < list.elements.length; i++) {
          if ((compareValues('>', list.elements[i], maxVal, span) as any).value) maxVal = list.elements[i];
        }
        return maxVal;
      }
      let maxVal = args[0];
      for (let i = 1; i < args.length; i++) {
        if ((compareValues('>', args[i], maxVal, span) as any).value) {
          maxVal = args[i];
        }
      }
      return maxVal;
    }
    case 'sum': {
      if (args.length === 0) return { type: 'rational', n: 0n, d: 1n };
      if (args.length === 1 && args[0].type === 'list') {
        const list = args[0] as ListValue;
        let acc: Value = { type: 'rational', n: 0n, d: 1n };
        for (const el of list.elements) {
          acc = addValues(acc, el, span);
        }
        return acc;
      }
      let acc = args[0];
      for (let i = 1; i < args.length; i++) {
        acc = addValues(acc, args[i], span);
      }
      return acc;
    }
    case 'prod': {
      if (args.length === 0) return { type: 'rational', n: 1n, d: 1n };
      if (args.length === 1 && args[0].type === 'list') {
        const list = args[0] as ListValue;
        let acc: Value = { type: 'rational', n: 1n, d: 1n };
        for (const el of list.elements) {
          acc = mulValues(acc, el, span);
        }
        return acc;
      }
      let acc = args[0];
      for (let i = 1; i < args.length; i++) {
        acc = mulValues(acc, args[i], span);
      }
      return acc;
    }
    case 'length': {
      if (args.length !== 1) throw createError('length requires 1 argument', span ?? { start: 0, end: 0, line: 1, col: 1 });
      const target = args[0];
      if (target.type === 'list') {
        return { type: 'rational', n: BigInt(target.elements.length), d: 1n };
      }
      if (target.type === 'tuple') {
        return { type: 'rational', n: BigInt(target.elements.length), d: 1n };
      }
      throw createError(`length expects a list or tuple, got ${target.type}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
    }
    case 'first': {
      if (args.length !== 1) throw createError('first requires 1 argument', span ?? { start: 0, end: 0, line: 1, col: 1 });
      const target = args[0];
      if (target.type === 'list') {
        if (target.elements.length === 0) {
          throw createError('Cannot get first element of an empty list', span ?? { start: 0, end: 0, line: 1, col: 1 });
        }
        return target.elements[0];
      }
      if (target.type === 'tuple') {
        if (target.elements.length === 0) {
          throw createError('Cannot get first element of an empty tuple', span ?? { start: 0, end: 0, line: 1, col: 1 });
        }
        return target.elements[0];
      }
      throw createError(`first expects a list or tuple, got ${target.type}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
    }
    case 'last': {
      if (args.length !== 1) throw createError('last requires 1 argument', span ?? { start: 0, end: 0, line: 1, col: 1 });
      const target = args[0];
      if (target.type === 'list') {
        if (target.elements.length === 0) {
          throw createError('Cannot get last element of an empty list', span ?? { start: 0, end: 0, line: 1, col: 1 });
        }
        return target.elements[target.elements.length - 1];
      }
      if (target.type === 'tuple') {
        if (target.elements.length === 0) {
          throw createError('Cannot get last element of an empty tuple', span ?? { start: 0, end: 0, line: 1, col: 1 });
        }
        return target.elements[target.elements.length - 1];
      }
      throw createError(`last expects a list or tuple, got ${target.type}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
    }
    case 'isprime': {
      if (args.length !== 1) throw createError('isprime requires 1 argument', span ?? { start: 0, end: 0, line: 1, col: 1 });
      const n = requireInteger(args[0], 'isprime', span);
      return { type: 'boolean', value: isPrimeInt(n) };
    }
    case 'nextprime': {
      if (args.length !== 1) throw createError('nextprime requires 1 argument', span ?? { start: 0, end: 0, line: 1, col: 1 });
      const n = requireInteger(args[0], 'nextprime', span);
      return { type: 'rational', n: nextPrimeInt(n), d: 1n };
    }
    case 'divisors': {
      if (args.length !== 1) throw createError('divisors requires 1 argument', span ?? { start: 0, end: 0, line: 1, col: 1 });
      const n = requireInteger(args[0], 'divisors', span);
      const divs = divisorsInt(n);
      const elements: Value[] = divs.map(d => ({ type: 'rational', n: d, d: 1n }));
      return { type: 'list', elements };
    }
    case 'factorize': {
      if (args.length !== 1) throw createError('factorize requires 1 argument', span ?? { start: 0, end: 0, line: 1, col: 1 });
      const n = requireInteger(args[0], 'factorize', span);
      const factors = factorizeInt(n);
      const elements: Value[] = factors.map(([p, e]) => ({
        type: 'tuple',
        elements: [
          { type: 'rational', n: p, d: 1n },
          { type: 'rational', n: e, d: 1n },
        ],
      }));
      return { type: 'list', elements };
    }
    case 'gcd': {
      if (args.length < 2) throw createError('gcd requires at least 2 arguments', span ?? { start: 0, end: 0, line: 1, col: 1 });
      let g = 0n;
      for (const arg of args) {
        if (arg.type !== 'rational' || arg.d !== 1n) {
          throw createError('gcd requires integer arguments', span ?? { start: 0, end: 0, line: 1, col: 1 }, {
            expected: 'integers',
            suggestion: 'Ensure all arguments to gcd are integers',
          });
        }
        const val = arg.n < 0n ? -arg.n : arg.n;
        g = BigFraction.gcd(g, val);
      }
      return { type: 'rational', n: g, d: 1n };
    }
    case 'lcm': {
      if (args.length < 2) throw createError('lcm requires at least 2 arguments', span ?? { start: 0, end: 0, line: 1, col: 1 });
      let l = 1n;
      for (const arg of args) {
        if (arg.type !== 'rational' || arg.d !== 1n) {
          throw createError('lcm requires integer arguments', span ?? { start: 0, end: 0, line: 1, col: 1 }, {
            expected: 'integers',
            suggestion: 'Ensure all arguments to lcm are integers',
          });
        }
        const val = arg.n < 0n ? -arg.n : arg.n;
        if (val === 0n) return { type: 'rational', n: 0n, d: 1n };
        l = (l * val) / BigFraction.gcd(l, val);
      }
      return { type: 'rational', n: l, d: 1n };
    }
    case 'mod': {
      if (args.length !== 2) throw createError('mod requires 2 arguments', span ?? { start: 0, end: 0, line: 1, col: 1 });
      return modValues(args[0], args[1], span);
    }
    case 'factorial': {
      if (args.length !== 1) throw createError('factorial requires 1 argument', span ?? { start: 0, end: 0, line: 1, col: 1 });
      return factorialValue(args[0], span);
    }
    case 'float': {
      if (args.length !== 1) throw createError('float requires 1 argument', span ?? { start: 0, end: 0, line: 1, col: 1 });
      return { type: 'float', value: valueToNumber(args[0], span) };
    }
    case 'totient': {
      if (args.length !== 1) throw createError('totient requires 1 argument', span ?? { start: 0, end: 0, line: 1, col: 1 });
      const n = requireInteger(args[0], 'totient', span);
      return { type: 'rational', n: totientInt(n), d: 1n };
    }
    case 'powmod': {
      if (args.length !== 3) throw createError('powmod requires 3 arguments (base, exp, mod)', span ?? { start: 0, end: 0, line: 1, col: 1 });
      const base = requireInteger(args[0], 'powmod base', span);
      const exp = requireInteger(args[1], 'powmod exp', span);
      const mod = requireInteger(args[2], 'powmod mod', span);
      return { type: 'rational', n: powModInt(base, exp, mod), d: 1n };
    }
    case 'binomial': {
      if (args.length !== 2) throw createError('binomial requires 2 arguments (n, k)', span ?? { start: 0, end: 0, line: 1, col: 1 });
      const n = requireInteger(args[0], 'binomial n', span);
      const k = requireInteger(args[1], 'binomial k', span);
      return { type: 'rational', n: binomialInt(n, k), d: 1n };
    }
    case 'random': {
      let seedVal: number | undefined;
      if (args.length >= 1) {
        seedVal = valueToNumber(args[0], span);
      }
      return { type: 'float', value: mulberry32(seedVal) };
    }
    case 'matrix': {
      if (args.length !== 1 || args[0].type !== 'list') throw createError('matrix requires 1 argument (2D list)', span ?? { start: 0, end: 0, line: 1, col: 1 });
      return matrixFromList(args[0] as ListValue, span);
    }
    case 'det': {
      if (args.length !== 1 || args[0].type !== 'matrix') throw createError('det requires a matrix', span ?? { start: 0, end: 0, line: 1, col: 1 });
      return matrixDet(args[0] as MatrixValue, span);
    }
    case 'inverse': {
      if (args.length !== 1 || args[0].type !== 'matrix') throw createError('inverse requires a matrix', span ?? { start: 0, end: 0, line: 1, col: 1 });
      return matrixInverse(args[0] as MatrixValue, span);
    }
    case 'transpose': {
      if (args.length !== 1 || args[0].type !== 'matrix') throw createError('transpose requires a matrix', span ?? { start: 0, end: 0, line: 1, col: 1 });
      return matrixTranspose(args[0] as MatrixValue);
    }
    case 'trace': {
      if (args.length !== 1 || args[0].type !== 'matrix') throw createError('trace requires a matrix', span ?? { start: 0, end: 0, line: 1, col: 1 });
      return matrixTrace(args[0] as MatrixValue, span);
    }
    case 'rank': {
      if (args.length !== 1 || args[0].type !== 'matrix') throw createError('rank requires a matrix', span ?? { start: 0, end: 0, line: 1, col: 1 });
      return matrixRank(args[0] as MatrixValue, span);
    }
    case 'eigenvalues': {
      if (args.length !== 1 || args[0].type !== 'matrix') throw createError('eigenvalues requires a matrix', span ?? { start: 0, end: 0, line: 1, col: 1 });
      return matrixEigenvalues(args[0] as MatrixValue, span);
    }
    default:
      throw createError(`Unknown builtin function '${name}'`, span ?? { start: 0, end: 0, line: 1, col: 1 });
  }
}

function totientInt(n: bigint): bigint {
  if (n <= 0n) return 0n;
  let result = n;
  let p = 2n;
  let temp = n;
  while (p * p <= temp) {
    if (temp % p === 0n) {
      while (temp % p === 0n) temp /= p;
      result -= result / p;
    }
    p++;
  }
  if (temp > 1n) {
    result -= result / temp;
  }
  return result;
}

function powModInt(base: bigint, exp: bigint, mod: bigint): bigint {
  if (mod === 1n) return 0n;
  let res = 1n;
  let b = ((base % mod) + mod) % mod;
  let e = exp;
  while (e > 0n) {
    if (e % 2n === 1n) res = (res * b) % mod;
    e /= 2n;
    b = (b * b) % mod;
  }
  return res;
}

function binomialInt(n: bigint, k: bigint): bigint {
  if (k < 0n || k > n) return 0n;
  if (k === 0n || k === n) return 1n;
  let c = 1n;
  const kEff = k > n - k ? n - k : k;
  for (let i = 1n; i <= kEff; i++) {
    c = (c * (n - i + 1n)) / i;
  }
  return c;
}

let rngState = 123456789;
function mulberry32(seed?: number): number {
  if (seed !== undefined) {
    rngState = Math.floor(seed) >>> 0;
  }
  let t = (rngState += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
