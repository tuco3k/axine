import { describe, it, expect } from 'vitest';
import { parse } from '../core/parser';
import { formatAST } from '../core/formatter';

describe('Parser and Formatter Ambiguity Table', () => {
  it('resolves 2x -> 2 · x', () => {
    const ast = parse('2x');
    expect(formatAST(ast)).toBe('2 · x');
  });

  it('resolves f(x+1) as application when f is defined', () => {
    const ast = parse('f(x+1)', { knownFunctions: new Set(['f']) });
    expect(formatAST(ast)).toBe('f(x + 1)');
  });

  it('resolves f(x+1) as f · (x + 1) when f is NOT defined', () => {
    const ast = parse('f(x+1)');
    expect(formatAST(ast)).toBe('f · (x + 1)');
  });

  it('resolves a / b c -> a / (b · c) due to implicit multiplication binding tighter than /', () => {
    const ast = parse('a / b c');
    expect(formatAST(ast)).toBe('a / (b · c)');
  });

  it('resolves sin x^2 -> sin(x^2)', () => {
    const ast = parse('sin x^2');
    expect(formatAST(ast)).toBe('sin(x^2)');
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
