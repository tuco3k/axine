import { describe, it, expect } from 'vitest';
import { parse } from '../core/parser';
import { formatAST } from '../core/formatter';

describe('Parser and Formatter Ambiguity Table', () => {
  it('resolves 2x -> 2 · x', () => {
    const ast = parse('2x');
    expect(formatAST(ast)).toBe('2 · x');
  });

  it('resolves f(x+1) as implicit multiplication f · (x + 1)', () => {
    const ast = parse('f(x+1)');
    expect(formatAST(ast)).toBe('f · (x + 1)');
  });

  it('resolves bare words like sin x^2 as product of variables s · i · n · x^2', () => {
    const ast = parse('sin x^2');
    expect(formatAST(ast)).toBe('s · i · n · x^2');
  });

  it('resolves 2^3^2 -> 2^(3^2)', () => {
    const ast = parse('2^3^2');
    expect(formatAST(ast)).toBe('2^(3^2)');
  });

  it('resolves -x^2 -> -(x^2)', () => {
    const ast = parse('-x^2');
    expect(formatAST(ast)).toBe('-(x^2)');
  });
});
