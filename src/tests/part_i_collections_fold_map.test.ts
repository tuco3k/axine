import { describe, it, expect } from 'vitest';
import { evaluate, createInitialEnvironment, BudgetTracker } from '../core/evaluator';
import { Environment, Value, SetValue, MultisetValue } from '../core/types';
import { valueToNumber } from '../core/numeric/tower';

function evalVal(source: string, env: Environment = createInitialEnvironment(), budget?: BudgetTracker): Value {
  return evaluate(source, env, budget).value;
}

describe('Capability C2 & C3: Collections, Folding & Mapping', () => {

  // =========================================================================
  // CAPABILITY C2: Collections as Definable Objects
  // =========================================================================
  describe('Capability C2: User-Defined Sets & Multisets', () => {
    it('constructs sets with extensional definition and membership checking', () => {
      const env = createInitialEnvironment();
      
      // Set creation
      const sVal = evalVal('S := \\set { 1, 2, 3, 4 }', env);
      expect(sVal.type).toBe('set_value');
      const setV = sVal as SetValue;
      expect(setV.elements?.length).toBe(4);

      // Membership \in
      expect(evalVal('1 \\in S', env)).toEqual({ type: 'boolean', value: true });
      expect(evalVal('3 \\in S', env)).toEqual({ type: 'boolean', value: true });
      expect(evalVal('5 \\in S', env)).toEqual({ type: 'boolean', value: false });

      // Non-membership \notin
      expect(evalVal('5 \\notin S', env)).toEqual({ type: 'boolean', value: true });
      expect(evalVal('2 \\notin S', env)).toEqual({ type: 'boolean', value: false });
    });

    it('performs structural deduplication on set elements', () => {
      const env = createInitialEnvironment();
      const sVal = evalVal('\\set { 1, 2, 2, 3, 3, 3, 1 }', env) as SetValue;
      expect(sVal.type).toBe('set_value');
      expect(sVal.elements?.length).toBe(3);
    });

    it('verifies set structural equality irrespective of element ordering', () => {
      const env = createInitialEnvironment();
      expect(evalVal('\\set { 1, 2, 3 } == \\set { 3, 2, 1 }', env)).toEqual({ type: 'boolean', value: true });
      expect(evalVal('\\set { 1, 2, 3 } == \\set { 1, 2, 2, 3 }', env)).toEqual({ type: 'boolean', value: true });
      expect(evalVal('\\set { 1, 2, 3 } == \\set { 1, 2, 4 }', env)).toEqual({ type: 'boolean', value: false });
      expect(evalVal('\\set { 1, 2, 3 } != \\set { 1, 2, 4 }', env)).toEqual({ type: 'boolean', value: true });
    });

    it('constructs user-defined multisets where duplicate elements are distinct', () => {
      const env = createInitialEnvironment();
      
      const mVal = evalVal('M := \\multiset { 1, 1, 2, 3, 3, 3 }', env) as MultisetValue;
      expect(mVal.type).toBe('multiset');
      expect(mVal.elements.length).toBe(6);

      // Multiset equality preserves multiplicity
      expect(evalVal('\\multiset { 1, 1, 2 } == \\multiset { 1, 2, 1 }', env)).toEqual({ type: 'boolean', value: true });
      expect(evalVal('\\multiset { 1, 1, 2 } == \\multiset { 1, 2, 2 }', env)).toEqual({ type: 'boolean', value: false });
      expect(evalVal('\\multiset { 1, 1, 2 } != \\multiset { 1, 2 }', env)).toEqual({ type: 'boolean', value: true });
      expect(evalVal('\\multiset { 1, 2 } != \\set { 1, 2 }', env)).toEqual({ type: 'boolean', value: true });
    });

    it('supports user-defined algebraic structures and carrier tuples/matrices', () => {
      const env = createInitialEnvironment();
      
      // Point / Vector structure
      evalVal('v := (3, 4)', env);
      expect(evalVal('v == (3, 4)', env)).toEqual({ type: 'boolean', value: true });
      expect(evalVal('v == (4, 3)', env)).toEqual({ type: 'boolean', value: false });

      // Matrix representation
      evalVal('I := ((1, 0), (0, 1))', env);
      evalVal('M := ((1, 0), (0, 1))', env);
      expect(evalVal('I == M', env)).toEqual({ type: 'boolean', value: true });
    });

    it('retains built-in list as flat machine-level numerical carrier buffer', () => {
      const env = createInitialEnvironment();
      const listVal = evalVal('[10, 20, 30]', env);
      expect(listVal.type).toBe('list');
      expect(evalVal('[10, 20, 30] == [10, 20, 30]', env)).toEqual({ type: 'boolean', value: true });
      expect(evalVal('[10, 20, 30] == [20, 10, 30]', env)).toEqual({ type: 'boolean', value: false });
    });
  });

  // =========================================================================
  // CAPABILITY C3: Folding and Mapping
  // =========================================================================
  describe('Capability C3: Folding & Mapping Operations', () => {
    it('folds addition (+) over a user-defined set', () => {
      const env = createInitialEnvironment();
      const res = evalVal('\\fold (+) \\over \\set { 1, 2, 3, 4 } \\from 0', env);
      expect(valueToNumber(res)).toBe(10);
    });

    it('folds multiplication (*) over a user-defined set', () => {
      const env = createInitialEnvironment();
      const res = evalVal('\\fold (*) \\over \\set { 1, 2, 3, 4 } \\from 1', env);
      expect(valueToNumber(res)).toBe(24);
    });

    it('folds addition (+) over a user-defined multiset with duplicate elements', () => {
      const env = createInitialEnvironment();
      const res = evalVal('\\fold (+) \\over \\multiset { 1, 1, 2, 3 } \\from 0', env);
      expect(valueToNumber(res)).toBe(7);
    });

    it('folds over lists, tuples, and arithmetic ranges', () => {
      const env = createInitialEnvironment();
      expect(valueToNumber(evalVal('\\fold (+) \\over [1, 2, 3, 4, 5] \\from 0', env))).toBe(15);
      expect(valueToNumber(evalVal('\\fold (+) \\over (2, 4, 6) \\from 0', env))).toBe(12);
      expect(valueToNumber(evalVal('\\fold (+) \\over 1..10 \\from 0', env))).toBe(55);
    });

    it('maps functions over sets with extensional deduplication', () => {
      const env = createInitialEnvironment();
      const res = evalVal('\\map (x -> x^2) \\over \\set { -2, -1, 1, 2 }', env) as SetValue;
      expect(res.type).toBe('set_value');
      expect(res.elements?.length).toBe(2); // {-2, 2}^2 = 4, {-1, 1}^2 = 1
      expect(evalVal('\\set { 1, 4 } == \\map (x -> x^2) \\over \\set { -2, -1, 1, 2 }', env)).toEqual({
        type: 'boolean',
        value: true,
      });
    });

    it('maps functions over multisets preserving multiplicities', () => {
      const env = createInitialEnvironment();
      const res = evalVal('\\map (x -> x^2) \\over \\multiset { -2, -1, 1, 2 }', env) as MultisetValue;
      expect(res.type).toBe('multiset');
      expect(res.elements.length).toBe(4);
      expect(evalVal('\\multiset { 4, 1, 1, 4 } == \\map (x -> x^2) \\over \\multiset { -2, -1, 1, 2 }', env)).toEqual({
        type: 'boolean',
        value: true,
      });
    });

    it('folds with user-defined binary operators and lambdas', () => {
      const env = createInitialEnvironment();
      
      // Lambda with accumulator
      const resLambda = evalVal('\\fold ((a, x) -> a + 2 * x) \\over \\set { 1, 2, 3 } \\from 0', env);
      expect(valueToNumber(resLambda)).toBe(12); // 2*1 + 2*2 + 2*3 = 12

      // Custom infix operator
      evalVal('\\operator \u229b (a, b) := a * b + 1', env);
      const resOp = evalVal('\\fold (\u229b) \\over [2, 3, 4] \\from 1', env);
      // ((1 * 2 + 1) * 3 + 1) * 4 + 1 = (3 * 3 + 1) * 4 + 1 = 10 * 4 + 1 = 41
      expect(valueToNumber(resOp)).toBe(41);
    });

    it('handles non-terminating / large folds with bounded fuel yielding budget-exhausted without stack overflow', () => {
      const env = createInitialEnvironment();
      const tightBudget = new BudgetTracker({
        maxSteps: 50,
        maxDepth: 20,
        timeoutMs: 200,
        maxBigIntDigits: 100_000,
        maxMemoryElements: 10_000_000,
      });

      // Folding over 1..1000 with a step limit of 50
      const res = evalVal('\\fold (+) \\over 1..1000 \\from 0', env, tightBudget);
      expect(res).toMatchObject({
        type: 'unknown',
        reason: 'budget-exhausted',
      });
    });
  });

  // =========================================================================
  // BENCHMARKS: Fold vs Equivalent Recurrence
  // =========================================================================
  describe('Performance Gate: Fold Throughput vs Recurrence', () => {
    it('measures \\fold performance against equivalent Axine recurrence', () => {
      const env = createInitialEnvironment();

      // Define equivalent recursive sum in Axine
      evalVal(':sum_rec(n) = \\if n = 0 \\then 0 \\else n + :sum_rec(n - 1)', env);

      // Warm up
      evalVal('\\fold (+) \\over 1..20 \\from 0', env);
      evalVal(':sum_rec(20)', env);

      const N = 500;
      
      // Measure fold
      const t0 = performance.now();
      for (let i = 0; i < N; i++) {
        evalVal('\\fold (+) \\over 1..20 \\from 0', env);
      }
      const tFold = (performance.now() - t0) / N;

      // Measure recurrence
      const t1 = performance.now();
      for (let i = 0; i < N; i++) {
        evalVal(':sum_rec(20)', env);
      }
      const tRec = (performance.now() - t1) / N;

      console.log(`\n--- CAPABILITY C3 FOLD vs RECURRENCE BENCHMARK ---`);
      console.log(`• \\fold (+) \\over 1..20 \\from 0: ${(tFold * 1000).toFixed(3)} µs/eval`);
      console.log(`• :sum_rec(20) recurrence: ${(tRec * 1000).toFixed(3)} µs/eval`);
      console.log(`• Fold Speedup: ${(tRec / tFold).toFixed(2)}x faster than recurrence`);

      expect(tFold).toBeLessThan(tRec * 2); // Fold is faster or comparable without stack frames
    });
  });
});
