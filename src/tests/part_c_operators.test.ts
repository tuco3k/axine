import { describe, it, expect } from 'vitest';
import { evaluate } from '../core/evaluator';
import { createInitialEnvironment } from '../core/evaluator';
import { parse } from '../core/parser';
import { formatAST } from '../core/formatter';

describe('Part C: User-Defined Operators', () => {
  it('parses, evaluates, renders, and round-trips an infix user-defined operator (Gate C requirement)', () => {
    const env = createInitialEnvironment();
    const declSource = 'operator \u229b (a, b) := a * b - b * a precedence: 45 associativity: left';
    
    // Parse decl
    const ast = parse(declSource);
    expect(ast.type).toBe('OperatorDecl');
    if (ast.type === 'OperatorDecl') {
      expect(ast.op).toBe('\u229b');
      expect(ast.fixity).toBe('infix');
      expect(ast.params).toEqual(['a', 'b']);
      expect(ast.precedence).toBe(45);
      expect(ast.associativity).toBe('left');
    }

    // Formatter round-trip for declaration
    const formattedDecl = formatAST(ast);
    const roundTripAst = parse(formattedDecl);
    expect(formatAST(roundTripAst)).toBe(formattedDecl);

    // Evaluate declaration
    evaluate(declSource, env);

    // Evaluate user-defined operator application
    const exprSource = 'x := 5 \u229b 3';
    const { value: res } = evaluate(exprSource, env);
    // 5*3 - 3*5 = 0
    expect(res.type).toBe('rational');
    if (res.type === 'rational') {
      expect(res.n).toBe(0n);
    }

    // Check expression round-trip formatting
    const exprAst = parse('5 \u229b 3');
    expect(exprAst.type).toBe('BinaryOp');
    if (exprAst.type === 'BinaryOp') {
      expect(exprAst.op).toBe('\u229b');
    }
    const formattedExpr = formatAST(exprAst);
    expect(formattedExpr).toBe('5 \u229b 3');
    expect(formatAST(parse(formattedExpr))).toBe('5 \u229b 3');
  });

  it('parses, evaluates, and round-trips a prefix user-defined operator', () => {
    const env = createInitialEnvironment();
    const declSource = 'operator prefix \u22c4 (f) := f + 10';
    
    const ast = parse(declSource);
    expect(ast.type).toBe('OperatorDecl');
    if (ast.type === 'OperatorDecl') {
      expect(ast.op).toBe('\u22c4');
      expect(ast.fixity).toBe('prefix');
      expect(ast.params).toEqual(['f']);
    }

    // Evaluate declaration
    evaluate(declSource, env);

    // Evaluate prefix application
    const { value: res } = evaluate('\u22c4 5', env);
    expect(res.type).toBe('rational');
    if (res.type === 'rational') {
      expect(res.n).toBe(15n);
    }

    // Round-trip formatting
    const exprAst = parse('\u22c4 5');
    expect(exprAst.type).toBe('UnaryOp');
    const formattedExpr = formatAST(exprAst);
    expect(formatAST(parse(formattedExpr))).toBe(formattedExpr);
  });

  it('parses, evaluates, and round-trips a postfix user-defined operator', () => {
    const env = createInitialEnvironment();
    const declSource = 'operator postfix \u00b0 (x) := x * pi / 180';

    const ast = parse(declSource);
    expect(ast.type).toBe('OperatorDecl');
    if (ast.type === 'OperatorDecl') {
      expect(ast.op).toBe('\u00b0');
      expect(ast.fixity).toBe('postfix');
      expect(ast.params).toEqual(['x']);
    }

    // Evaluate declaration
    evaluate(declSource, env);

    // Evaluate postfix application
    const { value: res } = evaluate('180 \u00b0', env);
    expect(res.type).toBe('float');
    if (res.type === 'float') {
      expect(res.value).toBeCloseTo(Math.PI, 5);
    }

    // Round-trip formatting
    const exprAst = parse('180\u00b0');
    expect(exprAst.type).toBe('PostfixOp');
    const formattedExpr = formatAST(exprAst);
    expect(formatAST(parse(formattedExpr))).toBe(formattedExpr);
  });

  it('errors cleanly on undefined user operators', () => {
    const env = createInitialEnvironment();
    expect(() => evaluate('5 \u22c4 3', env)).toThrowError(/Unknown binary operator '\u22c4'/);
  });
});
