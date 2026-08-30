import { describe, it, expect } from 'vitest';
import { addValues, divValues, factorialValue, powValues, sqrtValue } from '../core/numeric/tower';
import { makeRational } from '../core/numeric/tower';
import { MathError } from '../core/errors';

describe('Numeric Tower & Exact Rationals', () => {
  it('1/3 + 1/3 + 1/3 equals exactly 1', () => {
    const third = makeRational(1n, 3n);
    const sum2 = addValues(third, third);
    const sum3 = addValues(sum2, third);
    expect(sum3).toEqual({ type: 'rational', n: 1n, d: 1n });
  });

  it('handles division by zero with clear error', () => {
    const one = makeRational(1n, 1n);
    const zero = makeRational(0n, 1n);
    expect(() => divValues(one, zero)).toThrow(MathError);
    try {
      divValues(one, zero);
    } catch (e: any) {
      expect(e.diagnostic.message).toContain('Division by zero');
      expect(e.diagnostic.expected).toBeDefined();
      expect(e.diagnostic.suggestion).toBeDefined();
    }
  });

  it('sqrt(-1) errors clearly and does not return NaN', () => {
    const negOne = makeRational(-1n, 1n);
    expect(() => sqrtValue(negOne)).toThrow(MathError);
    try {
      sqrtValue(negOne);
    } catch (e: any) {
      expect(e.diagnostic.message).toContain('Cannot compute square root of negative number in real mode');
    }
  });

  it('exact square roots return exact rationals', () => {
    const four = makeRational(4n, 1n);
    expect(sqrtValue(four)).toEqual({ type: 'rational', n: 2n, d: 1n });

    const fourNinths = makeRational(4n, 9n);
    expect(sqrtValue(fourNinths)).toEqual({ type: 'rational', n: 2n, d: 3n });
  });

  it('irrational square roots promote to float', () => {
    const two = makeRational(2n, 1n);
    const res = sqrtValue(two);
    expect(res.type).toBe('float');
    if (res.type === 'float') {
      expect(res.value).toBeCloseTo(Math.SQRT2, 10);
    }
  });

  it('0^0 throws indeterminate error', () => {
    const zero = makeRational(0n, 1n);
    expect(() => powValues(zero, zero)).toThrow(MathError);
  });

  it('factorial handles non-negative integers exactly and rejects negatives/non-integers', () => {
    const five = makeRational(5n, 1n);
    expect(factorialValue(five)).toEqual({ type: 'rational', n: 120n, d: 1n });

    const negFive = makeRational(-5n, 1n);
    expect(() => factorialValue(negFive)).toThrow(MathError);

    const half = makeRational(1n, 2n);
    expect(() => factorialValue(half)).toThrow(MathError);
  });
});
