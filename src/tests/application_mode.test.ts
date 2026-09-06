import { describe, it, expect } from 'vitest';
import { parse } from '../core/parser';
import { formatAST } from '../core/formatter';
import { typesetMath } from '../core/math_typeset';

describe('Gate 1: Revert Application Mode (| \\and |- Reverted)', () => {
  it('f(x) \\and f(2) are always parsed \\as multiplication f · x \\and f · 2', () => {
    // 1. Bare f(x)
    const astFx = parse('f(x)');
    expect(astFx.type).toBe('BinaryOp');
    if (astFx.type === 'BinaryOp') {
      expect(astFx.op).toBe('*');
      expect(astFx.isImplicit).toBe(true);
      expect(astFx.left).toEqual({ type: 'Identifier', name: 'f', span: expect.any(Object) });
      expect(astFx.right).toEqual({ type: 'Identifier', name: 'x', span: expect.any(Object) });
    }
    expect(formatAST(astFx)).toBe('f · x');

    // 2. Bare f(2)
    const astF2 = parse('f(2)');
    expect(astF2.type).toBe('BinaryOp');
    if (astF2.type === 'BinaryOp') {
      expect(astF2.op).toBe('*');
      expect(astF2.isImplicit).toBe(true);
      expect(astF2.left).toEqual({ type: 'Identifier', name: 'f', span: expect.any(Object) });
      expect(astF2.right).toEqual({ type: 'NumberLiteral', raw: '2', span: expect.any(Object) });
    }
    expect(formatAST(astF2)).toBe('f · 2');

    // 3. Typeset HTML
    const htmlF2 = typesetMath(formatAST(astF2));
    const textF2 = htmlF2.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    expect(textF2).toContain('f · 2');
  });

  it('parses |x| \\as absolute value', () => {
    const ast = parse('|x|');
    expect(ast.type).toBe('BracketOp');
    if (ast.type === 'BracketOp') {
      expect(ast.op).toBe('abs');
      expect(ast.operands[0]).toEqual({
        type: 'Identifier',
        name: 'x',
        span: expect.any(Object),
      });
    }
  });

  it('parses ||v|| \\as norm', () => {
    const ast = parse('||v||');
    expect(ast.type).toBe('BracketOp');
    if (ast.type === 'BracketOp') {
      expect(ast.op).toBe('norm');
      expect(ast.operands[0]).toEqual({
        type: 'Identifier',
        name: 'v',
        span: expect.any(Object),
      });
    }
  });

  it('does \\not treat | inside expressions \\as mode switch', () => {
    const astOr = parse('a | b');
    expect(astOr.type).toBe('BinaryOp');
    if (astOr.type === 'BinaryOp') {
      expect(astOr.op).toBe('|');
    }

    const astProb = parse('P(A | B)');
    expect(astProb.type).toBe('Probability');
    if (astProb.type === 'Probability') {
      expect(astProb.op).toBe('prob');
      expect(astProb.event).toEqual({ type: 'Identifier', name: 'A', span: expect.any(Object) });
      expect(astProb.condition).toEqual({ type: 'Identifier', name: 'B', span: expect.any(Object) });
    }
  });
});
