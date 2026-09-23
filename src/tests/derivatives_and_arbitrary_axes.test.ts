import { describe, it, expect } from 'vitest';
import { parse } from '../core/parser';
import { evaluate, createInitialEnvironment } from '../core/evaluator';
import { formatAST } from '../core/formatter';
import { axineToLatex, replaceLatexFractions } from '../document/axine_latex_bridge';
import { SpaceValue } from '../core/types';

describe('Derivatives and Arbitrary Axes Graphing', () => {
  describe('Derivative expressions & notations', () => {
    it('parses and formats Leibniz first-order derivative quotient form (dy/dx, dy//dx)', () => {
      const astSlash = parse('dy/dx = -2*y');
      expect(astSlash.type).toBe('BinaryOp');
      if (astSlash.type === 'BinaryOp') {
        expect(astSlash.left.type).toBe('Diff');
        if (astSlash.left.type === 'Diff') {
          expect(astSlash.left.variable).toBe('x');
          expect(astSlash.left.expr).toEqual(expect.objectContaining({ type: 'Identifier', name: 'y' }));
        }
      }

      const astDouble = parse('dy//dx = -2*y');
      expect(astDouble.type).toBe('BinaryOp');
      const formatted = formatAST(astDouble);
      expect(formatted).toBe('dy//dx = -2 * y');
    });

    it('parses and formats Leibniz higher-order derivatives (d^2y/dx^2, d^2y//dx^2)', () => {
      const ast = parse('d^2y/dx^2 + 4*y = 0');
      expect(ast.type).toBe('BinaryOp');
      if (ast.type === 'BinaryOp') {
        const leftSum = ast.left;
        expect(leftSum.type).toBe('BinaryOp');
        if (leftSum.type === 'BinaryOp') {
          expect(leftSum.left.type).toBe('Diff');
          if (leftSum.left.type === 'Diff') {
            expect(leftSum.left.order).toBe(2);
            expect(leftSum.left.variable).toBe('x');
            expect(leftSum.left.expr).toEqual(expect.objectContaining({ type: 'Identifier', name: 'y' }));
          }
        }
      }
      const formatted = formatAST(ast);
      expect(formatted).toBe('d^2y//dx^2 + 4 * y = 0');
    });

    it('parses and formats operator form with powers: d^2//dx^2 (x^3)', () => {
      const ast = parse('d^2//dx^2 (x^3)');
      expect(ast.type).toBe('Diff');
      if (ast.type === 'Diff') {
        expect(ast.order).toBe(2);
        expect(ast.variable).toBe('x');
      }
      const formatted = formatAST(ast);
      expect(formatted).toBe('d^2//dx^2 x^3');
    });

    it('evaluates higher-order symbolic derivatives', () => {
      const env = createInitialEnvironment();
      const res = evaluate('d^2//dx^2 (x^3)', env);
      expect(res.value.type).toBe('derivation');
      if (res.value.type === 'derivation') {
        expect(res.value.finalExprString).toBe('3 * (2 * x^1)');
      }
    });

    it('evaluates prime function calls like f\'(2) and f\'\'(2)', () => {
      const env = createInitialEnvironment();
      evaluate(':f(x) := x^3', env);
      const res1 = evaluate(':f\'(2)', env);
      expect(res1.value).toEqual({ type: 'rational', n: 12n, d: 1n });

      const res2 = evaluate(':f\'\'(2)', env);
      expect(res2.value).toEqual({ type: 'rational', n: 12n, d: 1n });
    });

    it('round-trips LaTeX fractions of derivatives losslessly', () => {
      const latex = '\\' + 'frac{dy}{dx} = -2*y';
      const axine = replaceLatexFractions(latex);
      expect(axine).toBe('dy//dx = -2*y');

      const latexHigh = '\\' + 'frac{d^2y}{dx^2} + 4*y = 0';
      const axineHigh = replaceLatexFractions(latexHigh);
      expect(axineHigh).toBe('d^2y//dx^2 + 4*y = 0');

      const roundTrip = axineToLatex('dy//dx');
      expect(roundTrip).toContain('{dy}');
      expect(roundTrip).toContain('{dx}');
    });
  });

  describe('Arbitrary axis graphing', () => {
    it('preserves user declared axis order over alphabetical order', () => {
      const env = createInitialEnvironment();
      const res = evaluate('{\\axis v, u; v = u^2}', env);
      expect(res.value.type).toBe('space');
      const sp = res.value as SpaceValue;
      expect(sp.coordinates).toEqual(['v', 'u']);
      expect(sp.declaredAxes).toEqual(['v', 'u']);
      expect(sp.entities.length).toBe(1);
      expect(sp.entities[0].coordinates).toEqual(['v', 'u']);
    });

    it('handles multi-letter axis identifiers without colons: \\axis time, y', () => {
      const env = createInitialEnvironment();
      const res = evaluate('{\\axis time, y; y = time^2}', env);
      expect(res.value.type).toBe('space');
      const sp = res.value as SpaceValue;
      expect(sp.coordinates).toEqual(['time', 'y']);
      expect(sp.entities.length).toBe(1);
    });

    it('matches colon-prefixed axis identifiers with bare variables in expressions', () => {
      const env = createInitialEnvironment();
      const res = evaluate('{\\axis :time, y; y = :time^2}', env);
      expect(res.value.type).toBe('space');
      const sp = res.value as SpaceValue;
      expect(sp.coordinates).toEqual(['time', 'y']);
      expect(sp.entities.length).toBe(1);
    });

    it('preserves bracketed axis notation \\axis[u, v]; v = u^2', () => {
      const env = createInitialEnvironment();
      const res = evaluate('{\\axis[u, v]; v = u^2}', env);
      expect(res.value.type).toBe('space');
      const sp = res.value as SpaceValue;
      expect(sp.coordinates).toEqual(['u', 'v']);
      expect(sp.entities.length).toBe(1);
    });

    it('orders explicit relations as [independent, dependent] when undeclared (p = q^2)', () => {
      const env = createInitialEnvironment();
      const res = evaluate('p = q^2', env);
      expect(res.value.type).toBe('space');
      const sp = res.value as SpaceValue;
      // q is independent, p is dependent
      expect(sp.coordinates).toEqual(['q', 'p']);
    });
  });
});
