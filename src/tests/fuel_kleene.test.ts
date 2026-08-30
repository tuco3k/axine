import { describe, expect, it } from 'vitest';
import { evaluate, createInitialEnvironment, BudgetTracker } from '../core/evaluator';
import { Environment } from '../core/types';

function evalVal(source: string, env: Environment = createInitialEnvironment(), budget?: BudgetTracker) {
  return evaluate(source, env, budget).value;
}

describe('Phase 1: Fuel Model, Unknown Value & Kleene Three-Valued Logic', () => {
  describe('Kleene Three-Valued Logic (All 9 Combinations)', () => {
    it('evaluates not operator on booleans and unknown', () => {
      const env = createInitialEnvironment();
      expect(evalVal('not true', env)).toEqual({ type: 'boolean', value: false });
      expect(evalVal('not false', env)).toEqual({ type: 'boolean', value: true });
      expect(evalVal('not unknown(budget-exhausted)', env)).toEqual({
        type: 'unknown',
        reason: 'budget-exhausted',
        detail: undefined,
      });
    });

    it('evaluates all 9 combinations of AND under Kleene logic', () => {
      const env = createInitialEnvironment();
      const u = 'unknown(budget-exhausted)';

      // 1. true and true = true
      expect(evalVal('true and true', env)).toEqual({ type: 'boolean', value: true });
      // 2. true and false = false
      expect(evalVal('true and false', env)).toEqual({ type: 'boolean', value: false });
      // 3. true and unknown = unknown
      expect(evalVal(`true and ${u}`, env)).toMatchObject({ type: 'unknown', reason: 'budget-exhausted' });

      // 4. false and true = false
      expect(evalVal('false and true', env)).toEqual({ type: 'boolean', value: false });
      // 5. false and false = false
      expect(evalVal('false and false', env)).toEqual({ type: 'boolean', value: false });
      // 6. false and unknown = false (short-circuit)
      expect(evalVal(`false and ${u}`, env)).toEqual({ type: 'boolean', value: false });

      // 7. unknown and true = unknown
      expect(evalVal(`${u} and true`, env)).toMatchObject({ type: 'unknown', reason: 'budget-exhausted' });
      // 8. unknown and false = false
      expect(evalVal(`${u} and false`, env)).toEqual({ type: 'boolean', value: false });
      // 9. unknown and unknown = unknown
      expect(evalVal(`${u} and ${u}`, env)).toMatchObject({ type: 'unknown', reason: 'budget-exhausted' });
    });

    it('evaluates all 9 combinations of OR under Kleene logic', () => {
      const env = createInitialEnvironment();
      const u = 'unknown(search-incomplete)';

      // 1. true or true = true
      expect(evalVal('true or true', env)).toEqual({ type: 'boolean', value: true });
      // 2. true or false = true
      expect(evalVal('true or false', env)).toEqual({ type: 'boolean', value: true });
      // 3. true or unknown = true (short-circuit)
      expect(evalVal(`true or ${u}`, env)).toEqual({ type: 'boolean', value: true });

      // 4. false or true = true
      expect(evalVal('false or true', env)).toEqual({ type: 'boolean', value: true });
      // 5. false or false = false
      expect(evalVal('false or false', env)).toEqual({ type: 'boolean', value: false });
      // 6. false or unknown = unknown
      expect(evalVal(`false or ${u}`, env)).toMatchObject({ type: 'unknown', reason: 'search-incomplete' });

      // 7. unknown or true = true
      expect(evalVal(`${u} or true`, env)).toEqual({ type: 'boolean', value: true });
      // 8. unknown or false = unknown
      expect(evalVal(`${u} or false`, env)).toMatchObject({ type: 'unknown', reason: 'search-incomplete' });
      // 9. unknown or unknown = unknown
      expect(evalVal(`${u} or ${u}`, env)).toMatchObject({ type: 'unknown', reason: 'search-incomplete' });
    });

    it('evaluates identity equality on unknown (unknown = unknown is true)', () => {
      const env = createInitialEnvironment();
      expect(evalVal('unknown(no-convergence) == unknown(no-convergence)', env)).toEqual({ type: 'boolean', value: true });
      expect(evalVal('unknown(no-convergence) == 5', env)).toEqual({ type: 'boolean', value: false });
      expect(evalVal('unknown(no-convergence) != 5', env)).toEqual({ type: 'boolean', value: true });
      expect(evalVal('unknown(no-convergence) != unknown(no-convergence)', env)).toEqual({ type: 'boolean', value: false });
    });

    it('verifies load-bearing short-circuiting with recursive loops', () => {
      const env = createInitialEnvironment();
      evaluate('loop(n) := loop(n + 1)', env);

      // false and loop(0) must return false immediately without evaluating loop(0)
      const res1 = evalVal('false and loop(0)', env);
      expect(res1).toEqual({ type: 'boolean', value: false });

      // true or loop(0) must return true immediately without evaluating loop(0)
      const res2 = evalVal('true or loop(0)', env);
      expect(res2).toEqual({ type: 'boolean', value: true });
    });
  });

  describe('Unknown Arithmetic Propagation', () => {
    it('propagates unknown through arithmetic and preserves earliest reason', () => {
      const env = createInitialEnvironment();
      const resAdd = evalVal('unknown(undefined-at-point) + 10', env);
      expect(resAdd).toMatchObject({ type: 'unknown', reason: 'undefined-at-point' });

      const resMul = evalVal('10 * unknown(no-convergence)', env);
      expect(resMul).toMatchObject({ type: 'unknown', reason: 'no-convergence' });

      const resSin = evalVal('sin(unknown(requires-unavailable-theory))', env);
      expect(resSin).toMatchObject({ type: 'unknown', reason: 'requires-unavailable-theory' });
    });
  });

  describe('Quantifiers, Search, and none vs unknown', () => {
    it('distinguishes none (definitively absent) from unknown (did not finish)', () => {
      const env = createInitialEnvironment();

      // Definitive search: no prime between 14 and 16 -> returns none
      const resNone = evalVal('find(x in 14..16, isprime x)', env);
      expect(resNone).toEqual({ type: 'none' });

      // Budget-exhausted search: search with tight step budget -> returns unknown(search-incomplete)
      const tightBudget = new BudgetTracker({
        maxSteps: 5,
        maxDepth: 100,
        maxBigIntDigits: 1000,
        maxMemoryElements: 1000,
        timeoutMs: 100,
      });
      const resUnknown = evalVal('find(x in 1000000..2000000, isprime x)', env, tightBudget);
      expect(resUnknown.type).toBe('unknown');
      expect((resUnknown as any).reason).toBe('search-incomplete');
    });

    it('evaluates all() returning true, false (counterexample), or unknown', () => {
      const env = createInitialEnvironment();
      // True for all in range
      expect(evalVal('all(x >= 1, x in 1..10)', env)).toEqual({ type: 'boolean', value: true });
      // Definite counterexample at x = 5
      expect(evalVal('all(x < 5, x in 1..10)', env)).toEqual({ type: 'boolean', value: false });
    });

    it('evaluates any() returning true (witness), false, or unknown', () => {
      const env = createInitialEnvironment();
      // True witness at x = 7
      expect(evalVal('any(isprime x, x in 6..10)', env)).toEqual({ type: 'boolean', value: true });
      // Definitively false (no evens in 1..1 step 2)
      expect(evalVal('any(x % 2 == 0, x in 1..5 step 2)', env)).toEqual({ type: 'boolean', value: false });
    });

    it('evaluates least() (µ-operator) and unfold()', () => {
      const env = createInitialEnvironment();
      // least prime >= 20 is 23
      const resLeast = evalVal('least(isprime x, from: 20)', env);
      expect(resLeast).toEqual({ type: 'rational', n: 23n, d: 1n });

      // unfold: powers of 2 up to 16
      evaluate('step_pow(n) := if n < 16 then n * 2 else none', env);
      const resUnfold = evalVal('unfold(step_pow, 1)', env);
      expect(resUnfold).toEqual({
        type: 'list',
        elements: [
          { type: 'rational', n: 1n, d: 1n },
          { type: 'rational', n: 2n, d: 1n },
          { type: 'rational', n: 4n, d: 1n },
          { type: 'rational', n: 8n, d: 1n },
          { type: 'rational', n: 16n, d: 1n },
        ],
      });
    });
  });
});
