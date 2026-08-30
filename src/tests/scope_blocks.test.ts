import { describe, expect, it } from 'vitest';
import { evaluate, createInitialEnvironment } from '../core/evaluator';
import { Environment } from '../core/types';

function evalVal(source: string, env: Environment = createInitialEnvironment()) {
  return evaluate(source, env).value;
}

describe('Phase 2: Lexical Scopes, Blocks, Global Assignment, and Forward References', () => {
  describe('Block Expressions and Local Scoping', () => {
    it('evaluates block expression and returns the value of the final statement', () => {
      const env = createInitialEnvironment();
      const res = evalVal('{ a := 10; b := 20; a + b }', env);
      expect(res).toEqual({ type: 'rational', n: 30n, d: 1n });

      // Local bindings a and b must NOT leak to outer environment
      expect(env['a']).toBeUndefined();
      expect(env['b']).toBeUndefined();
    });

    it('shadows outer variables without mutating outer bindings', () => {
      const env = createInitialEnvironment();
      evalVal('x := 100', env);
      expect(env['x']).toEqual({ type: 'rational', n: 100n, d: 1n });

      const blockRes = evalVal('{ x := 5; x * 2 }', env);
      expect(blockRes).toEqual({ type: 'rational', n: 10n, d: 1n });

      // Outer x must still be 100
      expect(env['x']).toEqual({ type: 'rational', n: 100n, d: 1n });
      expect(evalVal('x', env)).toEqual({ type: 'rational', n: 100n, d: 1n });
    });

    it('handles nested blocks and lexical hierarchy', () => {
      const env = createInitialEnvironment();
      const res = evalVal('{ a := 10; { b := 20; { c := 30; a + b + c } } }', env);
      expect(res).toEqual({ type: 'rational', n: 60n, d: 1n });
      expect(env['a']).toBeUndefined();
      expect(env['b']).toBeUndefined();
      expect(env['c']).toBeUndefined();
    });
  });

  describe('Global Assignment (:≡ and :==)', () => {
    it('exports global variables from inside a block using :≡', () => {
      const env = createInitialEnvironment();
      const res = evalVal('{ secret := 999; exported :≡ secret * 2; exported + 1 }', env);
      expect(res).toEqual({ type: 'rational', n: 1999n, d: 1n });

      // secret is local
      expect(env['secret']).toBeUndefined();
      // exported is global
      expect(env['exported']).toEqual({ type: 'rational', n: 1998n, d: 1n });
      expect(evalVal('exported', env)).toEqual({ type: 'rational', n: 1998n, d: 1n });
    });

    it('exports global variables using :==', () => {
      const env = createInitialEnvironment();
      evalVal('{ global_val :== 42; 0 }', env);
      expect(env['global_val']).toEqual({ type: 'rational', n: 42n, d: 1n });
    });
  });

  describe('Block Functions & Mutual Recursion', () => {
    it('supports function definitions with local closures in blocks', () => {
      const env = createInitialEnvironment();
      const res = evalVal('{ factor := 3; scale(x) := x * factor; scale(10) }', env);
      expect(res).toEqual({ type: 'rational', n: 30n, d: 1n });
      expect(env['scale']).toBeUndefined();
    });

    it('supports mutual recursion inside a block', () => {
      const env = createInitialEnvironment();
      const code = `
        {
          is_even(n) := if n == 0 then true else is_odd(n - 1);
          is_odd(n) := if n == 0 then false else is_even(n - 1);
          is_even(10)
        }
      `;
      const res = evalVal(code, env);
      expect(res).toEqual({ type: 'boolean', value: true });
    });
  });

  describe('Forward Reference & Dependent Detection', () => {
    it('errors when referencing an unassigned variable', () => {
      const env = createInitialEnvironment();
      expect(() => evalVal('y + 10', env)).toThrowError(/Variable 'y' is not assigned a value/);
    });

    it('evaluates correctly once variable is defined', () => {
      const env = createInitialEnvironment();
      evalVal('y := 5', env);
      expect(evalVal('y + 10', env)).toEqual({ type: 'rational', n: 15n, d: 1n });
    });
  });
});
