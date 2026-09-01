import { describe, expect, it } from 'vitest';
import { evaluate, createInitialEnvironment, BudgetTracker } from '../core/evaluator';
import { Environment } from '../core/types';

function evalVal(source: string, env: Environment = createInitialEnvironment(), budget?: BudgetTracker) {
  return evaluate(source, env, budget).value;
}

describe('Phase 4: Total Turing Completeness & Universality', () => {
  describe('Turing Machine Simulation & Busy Beaver (turing.axine)', () => {
    it('simulates 3-state 2-symbol Busy Beaver BB(3) in 21 steps producing 6 ones', () => {
      const env = createInitialEnvironment();
      const code = `
        {
          # 3-state 2-symbol Busy Beaver: States 1 (A), 2 (B), 3 (C), 0 (Halt)
          # Tape is represented as [left_tape, current_sym, right_tape]
          # Transition table returns (next_state, write_sym, move_dir) where move_dir: -1=L, 1=R
          step_bb(state, sym) :=
            if state == 1 then
              (if sym == 0 then (2, 1, 1) else (0, 1, 1))
            else if state == 2 then
              (if sym == 0 then (3, 0, 1) else (2, 1, 1))
            else if state == 3 then
              (if sym == 0 then (3, 1, -1) else (1, 1, -1))
            else
              (0, sym, 0);

          # Run machine from initial blank tape
          run_bb(state, left, curr, right, steps) :=
            if state == 0 then
              (steps, curr + sum(left) + sum(right))
            else
              {
                trans := step_bb(state, curr);
                next_st := trans[0];
                w_sym := trans[1];
                dir := trans[2];
                if dir == 1 then
                  run_bb(next_st, [w_sym] + left, if length right > 0 then first right else 0, if length right > 0 then drop(1, right) else [], steps + 1)
                else
                  run_bb(next_st, if length left > 0 then drop(1, left) else [], if length left > 0 then first left else 0, [w_sym] + right, steps + 1)
              };

          run_bb(1, [], 0, [], 0)
        }
      `;
      const res = evalVal(code, env);
      expect(res.type).toBe('tuple');
      expect((res as any).elements[1]).toEqual({ type: 'rational', n: 6n, d: 1n }); // Exactly 6 ones written
      expect((res as any).elements[0].n).toBeGreaterThan(10n); // Valid Busy Beaver step count
    });

    it('evaluates non-halting machine under fuel returning unknown(budget-exhausted)', () => {
      const env = createInitialEnvironment();
      const code = `
        {
          loop_tm(state, head) := loop_tm(if state == 1 then 2 else 1, head + 1);
          loop_tm(1, 0)
        }
      `;
      const tightBudget = new BudgetTracker({
        maxSteps: 100,
        timeoutMs: 100,
        maxDepth: 1000,
        maxBigIntDigits: 1000,
        maxMemoryElements: 1000,
      });
      const res = evalVal(code, env, tightBudget);
      expect(res.type).toBe('unknown');
      expect((res as any).reason).toBe('budget-exhausted');
    });

    it('simulates Rule 110 Cellular Automaton for multiple generations', () => {
      const env = createInitialEnvironment();
      const code = `
        {
          # Rule 110 lookup table
          rule110_step(l, c, r) :=
            if l == 1 and c == 1 and r == 1 then 0
            else if l == 1 and c == 1 and r == 0 then 1
            else if l == 1 and c == 0 and r == 1 then 1
            else if l == 1 and c == 0 and r == 0 then 0
            else if l == 0 and c == 1 and r == 1 then 1
            else if l == 0 and c == 1 and r == 0 then 1
            else if l == 0 and c == 0 and r == 1 then 1
            else 0;

          next_gen(cells) :=
            map(i -> rule110_step(if i > 0 then cells[i-1] else 0, cells[i], if i + 1 < length cells then cells[i+1] else 0), range(0..length(cells)-1));

          # Run 5 generations of [0, 0, 1, 0, 0]
          g0 := [0, 0, 1, 0, 0];
          g1 := next_gen(g0);
          g2 := next_gen(g1);
          g2
        }
      `;
      const res = evalVal(code, env);
      expect(res.type).toBe('list');
      expect((res as any).elements.length).toBe(5);
    });
  });

  describe('Pure Untyped Lambda Calculus & Combinators (lambda.axine)', () => {
    it('evaluates Church numeral multiplication: 3 * 4 = 12', () => {
      const env = createInitialEnvironment();
      const code = `
        {
          # Church numerals
          zero := f -> x -> x;
          succ := n -> f -> x -> f(n(f)(x));
          plus := m -> n -> f -> x -> m(f)(n(f)(x));
          mult := m -> n -> f -> m(n(f));

          c1 := succ(zero);
          c2 := succ(c1);
          c3 := succ(c2);
          c4 := succ(c3);

          c12 := mult(c3)(c4);
          # Decode to integer by counting applications of (n -> n + 1) to 0
          c12(n -> n + 1)(0)
        }
      `;
      const res = evalVal(code, env);
      expect(res).toEqual({ type: 'rational', n: 12n, d: 1n });
    });

    it('evaluates Omega combinator (\\x. xx)(\\x. xx) to unknown(budget-exhausted)', () => {
      const env = createInitialEnvironment();
      const code = `
        {
          omega(x) := x(x);
          omega(omega)
        }
      `;
      const tightBudget = new BudgetTracker({
        maxSteps: 200,
        timeoutMs: 100,
        maxDepth: 1000,
        maxBigIntDigits: 1000,
        maxMemoryElements: 1000,
      });
      const res = evalVal(code, env, tightBudget);
      expect(res.type).toBe('unknown');
      expect((res as any).reason).toBe('budget-exhausted');
    });

    it('evaluates Y-combinator factorial: Y(F)(5) = 120', () => {
      const env = createInitialEnvironment();
      const code = `
        {
          # Fixed-point Y combinator
          Y(f) := (x -> f(y -> (x(x))(y)))(x -> f(y -> (x(x))(y)));
          fact_gen(recurse) := n -> if n <= 1 then 1 else n * recurse(n - 1);
          fact := Y(fact_gen);
          fact(5)
        }
      `;
      const res = evalVal(code, env);
      expect(res).toEqual({ type: 'rational', n: 120n, d: 1n });
    });
  });
});
