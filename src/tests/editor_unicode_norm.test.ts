import { describe, it, expect } from 'vitest';
import { UNICODE_MATH_MAP, replaceUnicodeMathSymbols } from '../document/editor';

describe('Editor Unicode Math Normalization', () => {
  it('maps all standard Unicode math operators to canonical backslash spellings', () => {
    expect(UNICODE_MATH_MAP['\u2208']).toBe('\\in');
    expect(UNICODE_MATH_MAP['\u2200']).toBe('\\forall');
    expect(UNICODE_MATH_MAP['\u2203']).toBe('\\exists');
    expect(UNICODE_MATH_MAP['\u222e']).toBe('\\oint');
    expect(UNICODE_MATH_MAP['\u2297']).toBe('\\otimes');
    expect(UNICODE_MATH_MAP['\u230a']).toBe('\\lfloor');
    expect(UNICODE_MATH_MAP['\u230b']).toBe('\\rfloor');
    expect(UNICODE_MATH_MAP['\u2264']).toBe('\\le');
    expect(UNICODE_MATH_MAP['\u2265']).toBe('\\ge');
    expect(UNICODE_MATH_MAP['\u2260']).toBe('\\ne');
    expect(UNICODE_MATH_MAP['\u221a']).toBe('\\sqrt');
    expect(UNICODE_MATH_MAP['\u221e']).toBe('\\' + 'infty');
  });

  it('normalizes strings \\with Unicode math operators into canonical backslash syntax', () => {
    const raw = 'x \u2208 [0, 10] \u2227 y \u2264 5';
    const transformed = replaceUnicodeMathSymbols(raw);
    expect(transformed).toBe('x \\in [0, 10] \\wedge y \\le 5');
  });
});
