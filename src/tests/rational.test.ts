import { describe, it, expect } from 'vitest';
import { addValues, divValues, factorialValue, powValues, sqrtValue } from '../core/numeric/tower';
import { makeRational } from '../core/numeric/tower';

describe('Numeric Tower & Exact Rationals', () => {
  it('1/3 + 1/3 + 1/3 equals exactly 1', () => {
    const third = makeRational(1n, 3n);
    const sum2 = addValues(third, third);
    const sum3 = addValues(sum2, third);
    expect(sum3).toEqual({ type: 'rational', n: 1n, d: 1n });
  });

  it('handles division by zero as undefined', () => {
    const one = makeRational(1n, 1n);
    const zero = makeRational(0n, 1n);
    expect(divValues(one, zero)).toEqual({ type: 'undefined' });
  });

  it('sqrt(-1) stands unreduced as sqrt(-1) expression', () => {
    const negOne = makeRational(-1n, 1n);
    const res = sqrtValue(negOne);
    expect(res.type).toBe('expression');
    expect((res as any).text).toBe('sqrt(-1)');
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

  it('0^0 reduces to undefined', () => {
    const zero = makeRational(0n, 1n);
    expect(powValues(zero, zero)).toEqual({ type: 'undefined' });
  });

  it('factorial handles non-negative integers exactly and stands unreduced for negatives/non-integers', () => {
    const five = makeRational(5n, 1n);
    expect(factorialValue(five)).toEqual({ type: 'rational', n: 120n, d: 1n });

    const negFive = makeRational(-5n, 1n);
    expect(factorialValue(negFive)).toEqual({
      type: 'expression',
      ast: expect.anything(),
      text: '(-5)!',
    });

    const half = makeRational(1n, 2n);
    expect(factorialValue(half)).toEqual({
      type: 'expression',
      ast: expect.anything(),
      text: '(1 / 2)!',
    });
  });
});
