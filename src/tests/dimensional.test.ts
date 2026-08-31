import { describe, it, expect } from 'vitest';
import { parse } from '../core/parser';
import { inferExpressionDimensions, checkGeometricQuantity } from '../core/dimensional';
import { evaluate } from '../core/evaluator';

describe('Part 1 — F4: The Dimensional Checker', () => {
  describe('1.2 Dimension Inference', () => {
    it('infers degree 1 for a bare variable', () => {
      const ast = parse('r');
      const res = inferExpressionDimensions(ast);
      expect(res.degrees).toEqual({ r: 1 });
      expect(res.totalDegree).toBe(1);
      expect(res.interpretation).toBe('length');
    });

    it('infers degree 0 for numeric constants and pi, e, tau, phi', () => {
      expect(inferExpressionDimensions(parse('42')).totalDegree).toBe(0);
      expect(inferExpressionDimensions(parse('pi')).totalDegree).toBe(0);
      expect(inferExpressionDimensions(parse('e')).totalDegree).toBe(0);
      expect(inferExpressionDimensions(parse('tau')).totalDegree).toBe(0);
      expect(inferExpressionDimensions(parse('phi')).totalDegree).toBe(0);
    });

    it('adds degrees for products and scales by powers', () => {
      // (4/3) * pi * r^3
      const sphereAst = parse('(4/3) * pi * r^3');
      const sphereRes = inferExpressionDimensions(sphereAst);
      expect(sphereRes.degrees).toEqual({ r: 3 });
      expect(sphereRes.totalDegree).toBe(3);
      expect(sphereRes.interpretation).toBe('volume');

      // (3/4) * pi * r^2
      const fakeAst = parse('(3/4) * pi * r^2');
      const fakeRes = inferExpressionDimensions(fakeAst);
      expect(fakeRes.degrees).toEqual({ r: 2 });
      expect(fakeRes.totalDegree).toBe(2);
      expect(fakeRes.interpretation).toBe('area');
    });

    it('subtracts degrees for quotients', () => {
      const ast = parse('r^3 / r');
      const res = inferExpressionDimensions(ast);
      expect(res.degrees).toEqual({ r: 2 });
      expect(res.totalDegree).toBe(2);
    });

    it('handles multi-variable expressions (e.g. cylinder pi * r^2 * h)', () => {
      const ast = parse('pi * r^2 * h');
      const res = inferExpressionDimensions(ast);
      expect(res.degrees).toEqual({ r: 2, h: 1 });
      expect(res.totalDegree).toBe(3);
      expect(res.interpretation).toBe('volume');
    });

    it('flags transcendental-argument violations when argument has dimension', () => {
      const ast = parse('sin(r)');
      expect(() => inferExpressionDimensions(ast)).toThrow(/sin requires a dimensionless argument; r has dimension of length/);

      const expAst = parse('exp(r^2)');
      expect(() => inferExpressionDimensions(expAst)).toThrow(/exp requires a dimensionless argument/);
    });
  });

  describe('1.3 The dimension() builtin in evaluator', () => {
    it('evaluates dimension((4/3) * pi * r^3) correctly', () => {
      const { value } = evaluate('dimension((4/3) * pi * r^3)');
      expect(value.type).toBe('dimension');
      if (value.type === 'dimension') {
        expect(value.degrees).toEqual({ r: 3 });
        expect(value.totalDegree).toBe(3);
        expect(value.interpretation).toBe('volume');
      }
    });

    it('returns unknown(requires-unavailable-theory) for transcendental violation', () => {
      const { value } = evaluate('dimension(sin(r))');
      expect(value.type).toBe('unknown');
      if (value.type === 'unknown') {
        expect(value.reason).toBe('requires-unavailable-theory');
        expect(value.detail).toContain('sin requires a dimensionless argument; r has dimension of length');
      }
    });
  });

  describe('1.4 & 1.5 The Acceptance Case: check(3/4 * pi * r^2, is: "sphere volume")', () => {
    it('produces all 5 parts in exact specified order', () => {
      const ast = parse('3/4 * pi * r^2');
      const res = checkGeometricQuantity(ast, 'sphere volume');

      expect(res.isValid).toBe(false);
      expect(res.actualDimension).toBe(2);
      expect(res.actualInterpretation).toBe('area');
      expect(res.messageLines.length).toBe(5);

      // Part 1
      expect(res.messageLines[0]).toBe('1. This is not the volume of a sphere.');

      // Part 2
      expect(res.messageLines[1]).toContain('r^2 has dimension 2 (area). A volume requires dimension 3.');

      // Part 3
      expect(res.messageLines[2]).toBe('3. The correct formula is (4/3) * pi * r^3.');

      // Part 4
      expect(res.messageLines[3]).toBe('4. [derivation by shell integration, as steps]');

      // Part 5
      expect(res.messageLines[4]).toBe("5. What (3/4)*pi*r^2 actually is: a scalar multiple of a circle's area, specifically 3/4 of pi*r^2.");

      // Derivation steps present
      expect(res.derivationSteps.length).toBe(4);
      expect(res.derivationSteps[0].title).toBe('Partition into concentric spherical shells');
      expect(res.derivationSteps[1].math).toContain('dV = 4 * pi * r^2 dr');
      expect(res.derivationSteps[2].math).toContain('V = \u222b_0^R 4 * pi * r^2 dr');
      expect(res.derivationSteps[3].math).toContain('V = 4 * pi * [r^3 / 3]_0^R = (4/3) * pi * R^3');
    });

    it('evaluates check(3/4 * pi * r^2, is: "sphere volume") in the evaluator', () => {
      const { value } = evaluate('check(3/4 * pi * r^2, is: "sphere volume")');
      expect(value.type).toBe('check_result');
      if (value.type === 'check_result') {
        expect(value.isValid).toBe(false);
        expect(value.targetQuantity).toBe('Sphere Volume');
        expect(value.actualDimension).toBe(2);
        expect(value.messageLines[0]).toBe('1. This is not the volume of a sphere.');
        expect(value.messageLines[1]).toContain('r^2 has dimension 2 (area). A volume requires dimension 3.');
        expect(value.messageLines[2]).toBe('3. The correct formula is (4/3) * pi * r^3.');
        expect(value.messageLines[3]).toBe('4. [derivation by shell integration, as steps]');
        expect(value.messageLines[4]).toBe("5. What (3/4)*pi*r^2 actually is: a scalar multiple of a circle's area, specifically 3/4 of pi*r^2.");
      }
    });

    it('verifies correct formula check((4/3) * pi * r^3, is: "sphere volume")', () => {
      const { value } = evaluate('check((4/3) * pi * r^3, is: "sphere volume")');
      expect(value.type).toBe('check_result');
      if (value.type === 'check_result') {
        expect(value.isValid).toBe(true);
      }
    });

    it('returns unknown for unrecognized quantities', () => {
      const { value } = evaluate('check(r^2, is: "hyperdimensional flux")');
      expect(value.type).toBe('unknown');
      if (value.type === 'unknown') {
        expect(value.reason).toBe('requires-unavailable-theory');
        expect(value.detail).toContain('Unrecognized geometric quantity');
      }
    });
  });
});
