import { describe, it, expect } from 'vitest';
import { evaluate, createInitialEnvironment, BudgetTracker } from '../core/evaluator';
import { Environment, Value } from '../core/types';

function evalVal(source: string, env: Environment = createInitialEnvironment(), budget?: BudgetTracker): Value {
  return evaluate(source, env, budget).value;
}

describe('C4: Bounded Quantification', () => {
  it('evaluates \\forall over a user-defined set', () => {
    const env = createInitialEnvironment();
    evalVal('S := \\set { 1, 2, 3, 4, 5 }', env);
    const res = evalVal('\\forall x \\in S, x > 0', env);
    expect(res).toEqual({ type: 'boolean', value: true });
  });

  it('evaluates \\forall returning false when predicate fails for an element', () => {
    const env = createInitialEnvironment();
    evalVal('S := \\set { 1, 2, 3, -1, 5 }', env);
    const res = evalVal('\\forall x \\in S, x > 0', env);
    expect(res).toEqual({ type: 'boolean', value: false });
  });

  it('evaluates multi-variable \\forall (e.g. commutativity over a set)', () => {
    const env = createInitialEnvironment();
    evalVal('S := \\set { 1, 2, 3 }', env);
    const res = evalVal('\\forall a, b \\in S, a + b == b + a', env);
    expect(res).toEqual({ type: 'boolean', value: true });
  });

  it('evaluates multi-variable \\forall returning false when commutativity fails', () => {
    const env = createInitialEnvironment();
    evalVal('S := \\set { 1, 2, 3 }', env);
    const res = evalVal('\\forall a, b \\in S, a - b == b - a', env);
    expect(res).toEqual({ type: 'boolean', value: false });
  });

  it('evaluates \\exists over a set and a range', () => {
    const env = createInitialEnvironment();
    evalVal('S := \\set { 10, 20, 30 }', env);
    expect(evalVal('\\exists x \\in S, x == 20', env)).toEqual({ type: 'boolean', value: true });
    expect(evalVal('\\exists x \\in S, x == 25', env)).toEqual({ type: 'boolean', value: false });
    expect(evalVal('\\exists x \\in 1..10, x * x == 49', env)).toEqual({ type: 'boolean', value: true });
  });

  it('evaluates \\exists_unique (and \\exists!) with single vs multiple witnesses', () => {
    const env = createInitialEnvironment();
    evalVal('A := \\set { 2, 4, 6, 8, 9 }', env);
    expect(evalVal('\\exists_unique x \\in A, x % 2 != 0', env)).toEqual({ type: 'boolean', value: true });

    evalVal('B := \\set { 2, 4, 6, 7, 9 }', env);
    expect(evalVal('\\exists_unique x \\in B, x % 2 != 0', env)).toEqual({ type: 'boolean', value: false });

    evalVal('C := \\set { 2, 4, 6, 8, 10 }', env);
    expect(evalVal('\\exists_unique x \\in C, x % 2 != 0', env)).toEqual({ type: 'boolean', value: false });

    expect(evalVal('\\exists! x \\in A, x == 9', env)).toEqual({ type: 'boolean', value: true });
  });

  it('evaluates quantifiers over multisets, tuples, and lists', () => {
    const env = createInitialEnvironment();
    evalVal('M := \\multiset { 1, 1, 2, 3 }', env);
    expect(evalVal('\\forall x \\in M, x >= 1', env)).toEqual({ type: 'boolean', value: true });

    evalVal('T := (2, 4, 6, 8)', env);
    expect(evalVal('\\forall x \\in T, x % 2 == 0', env)).toEqual({ type: 'boolean', value: true });

    evalVal('L := [1, 3, 5, 7]', env);
    expect(evalVal('\\forall x \\in L, x % 2 == 1', env)).toEqual({ type: 'boolean', value: true });
  });

  it('handles fuel exhaustion gracefully during quantifier evaluation', () => {
    const src = '\\forall x \\in 1..10000, x > 0';
    const tracker = new BudgetTracker({
      maxSteps: 5,
      timeoutMs: 5000,
      maxDepth: 100,
      maxBigIntDigits: 1000,
      maxMemoryElements: 1000,
    });
    const res = evalVal(src, undefined, tracker);
    expect(res.type).toBe('unknown');
  });

  it('preserves universal rule / recurrence definitions when domain is not specified', () => {
    const env = createInitialEnvironment();
    evalVal('\\forall x, f(x) = x * 2', env);
    const res = evalVal('f(5)', env);
    expect(res).toEqual({ type: 'rational', n: 10n, d: 1n });
  });
});
