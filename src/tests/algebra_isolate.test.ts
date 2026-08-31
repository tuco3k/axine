import { describe, expect, it } from 'vitest';
import { evaluate, createInitialEnvironment } from '../core/evaluator';
import { DerivationValue, SolveTraceValue, UnknownValue } from '../core/types';
import { AlgebraicVerifier } from '../core/algebra/verifier';
import { parse } from '../core/parser';

describe('Step-by-Step Algebraic Solving (isolate) & Solve Trace', () => {
  describe('1. Linear Equations', () => {
    it('solves simple linear equation 3x + 7 = 22 -> x = 5', () => {
      const env = createInitialEnvironment();
      const res = evaluate('isolate(3*x + 7 == 22, for: x)', env).value as DerivationValue;
      expect(res.type).toBe('derivation');
      expect(res.targetVar).toBe('x');
      expect(res.roots).toEqual([{ type: 'rational', n: 5n, d: 1n }]);
      expect(res.steps.length).toBeGreaterThanOrEqual(2);
      expect(res.steps.some(s => s.rule === 'subtract-both-sides')).toBe(true);
      expect(res.steps.some(s => s.rule === 'divide-both-sides')).toBe(true);
    });

    it('solves distributing and collecting linear equation 2(x - 3) = 4x + 1 -> x = -7/2', () => {
      const env = createInitialEnvironment();
      const res = evaluate('isolate(2*(x - 3) == 4*x + 1, for: x)', env).value as DerivationValue;
      expect(res.type).toBe('derivation');
      expect(res.roots).toEqual([{ type: 'rational', n: -7n, d: 2n }]);
      expect(res.steps.some(s => s.rule === 'distribute')).toBe(true);
      expect(res.steps.some(s => s.rule === 'divide-both-sides' && s.sideCondition?.includes('!= 0'))).toBe(true);
    });

    it('detects contradiction / no solution: 5x = 5x + 1', () => {
      const env = createInitialEnvironment();
      const res = evaluate('isolate(5*x == 5*x + 1, for: x)', env).value as DerivationValue;
      expect(res.type).toBe('derivation');
      expect(res.specialCase).toBe('no-solution');
      expect(res.roots).toEqual([]);
    });

    it('detects identity / all real numbers: 2(x + 1) = 2x + 2', () => {
      const env = createInitialEnvironment();
      const res = evaluate('isolate(2*(x + 1) == 2*x + 2, for: x)', env).value as DerivationValue;
      expect(res.type).toBe('derivation');
      expect(res.specialCase).toBe('all-real');
      expect(res.roots).toEqual([]);
    });
  });

  describe('2. Quadratic Equations', () => {
    it('solves factorable quadratic x^2 - 5x + 6 = 0 -> roots 2 and 3', () => {
      const env = createInitialEnvironment();
      const res = evaluate('isolate(x^2 - 5*x + 6 == 0, for: x)', env).value as DerivationValue;
      expect(res.type).toBe('derivation');
      expect(res.roots).toEqual([
        { type: 'rational', n: 2n, d: 1n },
        { type: 'rational', n: 3n, d: 1n },
      ]);
      expect(res.steps.some(s => s.rule === 'factor')).toBe(true);
    });

    it('solves pure quadratic x^2 - 2 = 0 -> roots ±\u221a2', () => {
      const env = createInitialEnvironment();
      const res = evaluate('isolate(x^2 - 2 == 0, for: x)', env).value as DerivationValue;
      expect(res.type).toBe('derivation');
      expect(res.roots.length).toBe(2);
      const r1 = (res.roots[0] as any).value;
      const r2 = (res.roots[1] as any).value;
      expect(Math.abs(r1 - -Math.SQRT2)).toBeLessThan(1e-9);
      expect(Math.abs(r2 - Math.SQRT2)).toBeLessThan(1e-9);
      expect(res.steps.some(s => s.rule === 'take-root')).toBe(true);
    });

    it('rejects complex quadratic roots x^2 + 1 = 0 with unknown(requires-unavailable-theory)', () => {
      const env = createInitialEnvironment();
      const res = evaluate('isolate(x^2 + 1 == 0, for: x)', env).value as UnknownValue;
      expect(res.type).toBe('unknown');
      expect(res.reason).toBe('requires-unavailable-theory');
      expect(res.detail).toMatch(/complex numbers/i);
    });
  });

  describe('3. Proportion Equations', () => {
    it('solves proportion (x + 1)/3 = 4/2 with side condition', () => {
      const env = createInitialEnvironment();
      const res = evaluate('isolate((x + 1) / 3 == 4 / 2, for: x)', env).value as DerivationValue;
      expect(res.type).toBe('derivation');
      expect(res.roots).toEqual([{ type: 'rational', n: 5n, d: 1n }]);
      expect(res.steps.some(s => s.rule === 'cross-multiply' && s.sideCondition?.includes('!= 0'))).toBe(true);
    });
  });

  describe('4. Power Equations', () => {
    it('solves odd power x^3 = 27 -> x = 3', () => {
      const env = createInitialEnvironment();
      const res = evaluate('isolate(x^3 == 27, for: x)', env).value as DerivationValue;
      expect(res.type).toBe('derivation');
      expect(res.roots).toEqual([{ type: 'rational', n: 3n, d: 1n }]);
    });

    it('solves even power x^2 = 9 returning BOTH roots (-3 and 3)', () => {
      const env = createInitialEnvironment();
      const res = evaluate('isolate(x^2 == 9, for: x)', env).value as DerivationValue;
      expect(res.type).toBe('derivation');
      expect(res.roots).toEqual([
        { type: 'rational', n: -3n, d: 1n },
        { type: 'rational', n: 3n, d: 1n },
      ]);
    });
  });

  describe('5. Strict Scope Classifier & Rejections', () => {
    it('rejects general cubics x^3 - 6x^2 + 11x - 6 = 0 with unknown and suggests solve()', () => {
      const env = createInitialEnvironment();
      const res = evaluate('isolate(x^3 - 6*x^2 + 11*x - 6 == 0, for: x)', env).value as UnknownValue;
      expect(res.type).toBe('unknown');
      expect(res.reason).toBe('requires-unavailable-theory');
      expect(res.detail).toMatch(/cubics.*unsupported.*solve/i);
    });

    it('rejects trigonometric equations sin(x) = 1/2 with unknown and suggests solve()', () => {
      const env = createInitialEnvironment();
      const res = evaluate('isolate(sin(x) == 1 / 2, for: x)', env).value as UnknownValue;
      expect(res.type).toBe('unknown');
      expect(res.reason).toBe('requires-unavailable-theory');
      expect(res.detail).toMatch(/symbolic function application.*solve/i);
    });

    it('rejects multiple rational denominators x/(x+1) + x/(x-1) = 2', () => {
      const env = createInitialEnvironment();
      const res = evaluate('isolate(x / (x + 1) + x / (x - 1) == 2, for: x)', env).value as UnknownValue;
      expect(res.type).toBe('unknown');
      expect(res.reason).toBe('requires-unavailable-theory');
      expect(res.detail).toMatch(/multiple denominators/i);
    });
  });

  describe('6. Derivation Self-Verification & Corruption Harness', () => {
    it('accepts valid derivations through self-verification', () => {
      const env = createInitialEnvironment();
      const res = evaluate('isolate(3*x + 7 == 22, for: x)', env).value as DerivationValue;
      expect(res.type).toBe('derivation');
    });

    it('rejects corrupted step derivations through AlgebraicVerifier', () => {
      const env = createInitialEnvironment();
      const origAst = parse('3*x + 7 == 22') as any;
      const validDeriv = evaluate('isolate(3*x + 7 == 22, for: x)', env).value as DerivationValue;

      // Deliberately corrupt step 1 to an invalid equation: "3x = 99"
      const corruptedDeriv: DerivationValue = {
        ...validDeriv,
        steps: [
          { before: '3*x + 7 = 22', after: '3*x = 99', equation: '3*x = 99', rule: 'subtract-both-sides', justification: 'Corrupted step' },
          ...validDeriv.steps.slice(1),
        ],
      };

      const verifyRes = AlgebraicVerifier.verify(corruptedDeriv, origAst.left, origAst.right, 'x', env);
      expect(verifyRes.type).toBe('unknown');
      expect((verifyRes as any).reason).toBe('no-convergence');
      expect((verifyRes as any).detail).toMatch(/derivation failed self-verification/i);
    });
  });

  describe('7. Solve Convergence Trace Telemetry', () => {
    it('returns structured iteration telemetry for Newton solve(..., trace: true)', () => {
      const env = createInitialEnvironment();
      const res = evaluate('{ f(x) := x^3 - 2*x - 5; solve(f, near: 2, trace: true) }', env).value as SolveTraceValue;
      expect(res.type).toBe('solve_trace');
      expect(res.method).toBe('newton');
      expect(res.iterations.length).toBeGreaterThan(0);
      expect(res.iterations[0].n).toBe(0);
      expect(res.iterations[res.iterations.length - 1].error).toBeLessThan(1e-11);
    });

    it('returns structured iteration telemetry for Bisection solve(..., trace: true)', () => {
      const env = createInitialEnvironment();
      const res = evaluate('solve(x^3 - 2*x - 5, x in 1..3, trace: true)', env).value as SolveTraceValue;
      expect(res.type).toBe('solve_trace');
      expect(res.method).toBe('bisection');
      expect(res.iterations.length).toBeGreaterThan(0);
      expect(res.iterations[res.iterations.length - 1].width).toBeLessThan(1e-11);
    });
  });
});
