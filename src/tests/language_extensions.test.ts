import { describe, expect, it } from 'vitest';
import { evaluate, createInitialEnvironment } from '../core/evaluator';

describe('Core Language Extensions & Problem Corpus Features', () => {
  describe('Conditionals & Boolean Logic', () => {
    it('evaluates if-then-else expressions', () => {
      const env = createInitialEnvironment();
      const res1 = evaluate('if 5 > 2 then 100 else 200', env);
      expect(res1.value).toEqual({ type: 'rational', n: 100n, d: 1n });

      const res2 = evaluate('if 5 < 2 then 100 else 200', env);
      expect(res2.value).toEqual({ type: 'rational', n: 200n, d: 1n });
    });

    it('evaluates and, or, not operators with short-circuiting', () => {
      const env = createInitialEnvironment();
      const res1 = evaluate('true and true', env);
      expect(res1.value).toEqual({ type: 'boolean', value: true });

      const res2 = evaluate('true and false', env);
      expect(res2.value).toEqual({ type: 'boolean', value: false });

      const res3 = evaluate('false or true', env);
      expect(res3.value).toEqual({ type: 'boolean', value: true });

      const res4 = evaluate('not false', env);
      expect(res4.value).toEqual({ type: 'boolean', value: true });
    });
  });

  describe('Recursion & Memoization', () => {
    it('evaluates recursive fibonacci quickly via memoization', () => {
      const env = createInitialEnvironment();
      evaluate('fib(n) := if n <= 1 then n else fib(n-1) + fib(n-2)', env);
      const res = evaluate('fib(50)', env);
      expect(res.value).toEqual({ type: 'rational', n: 12586269025n, d: 1n });
    });

    it('detects infinite recursion and throws recursion depth exceeded error', () => {
      const env = createInitialEnvironment();
      evaluate('bad(x) := bad(x + 1)', env);
      expect(() => evaluate('bad(0)', env)).toThrowError(/recursion depth exceeded in bad/);
    });
  });

  describe('Lists & Sequence Builtins', () => {
    it('creates lists and accesses length, first, last, max, min, sum', () => {
      const env = createInitialEnvironment();
      evaluate('L := [10, 20, 30, 40]', env);
      expect(evaluate('length L', env).value).toEqual({ type: 'rational', n: 4n, d: 1n });
      expect(evaluate('first L', env).value).toEqual({ type: 'rational', n: 10n, d: 1n });
      expect(evaluate('last L', env).value).toEqual({ type: 'rational', n: 40n, d: 1n });
      expect(evaluate('max L', env).value).toEqual({ type: 'rational', n: 40n, d: 1n });
      expect(evaluate('min L', env).value).toEqual({ type: 'rational', n: 10n, d: 1n });
      expect(evaluate('sum L', env).value).toEqual({ type: 'rational', n: 100n, d: 1n });
    });

    it('generates ranges with range(a..b) and range(a..b step c)', () => {
      const env = createInitialEnvironment();
      const r1 = evaluate('range(1..5)', env);
      expect(r1.value.type).toBe('list');
      if (r1.value.type === 'list') {
        expect(r1.value.elements.length).toBe(5);
      }

      const r2 = evaluate('range(0..10 step 2)', env);
      if (r2.value.type === 'list') {
        expect(r2.value.elements.length).toBe(6);
      }
    });

    it('maps functions and lambdas over lists', () => {
      const env = createInitialEnvironment();
      const res = evaluate('map(x -> x^2, [1, 2, 3, 4])', env);
      expect(res.value.type).toBe('list');
      if (res.value.type === 'list') {
        expect(res.value.elements).toEqual([
          { type: 'rational', n: 1n, d: 1n },
          { type: 'rational', n: 4n, d: 1n },
          { type: 'rational', n: 9n, d: 1n },
          { type: 'rational', n: 16n, d: 1n },
        ]);
      }
    });

    it('filters lists using predicates', () => {
      const env = createInitialEnvironment();
      const res = evaluate('filter(x -> isprime x, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])', env);
      expect(res.value.type).toBe('list');
      if (res.value.type === 'list') {
        expect(res.value.elements).toEqual([
          { type: 'rational', n: 2n, d: 1n },
          { type: 'rational', n: 3n, d: 1n },
          { type: 'rational', n: 5n, d: 1n },
          { type: 'rational', n: 7n, d: 1n },
        ]);
      }
    });

    it('computes orbits with iterate(f, x0, n: N) and iterate(f, x0, until: v, max: M)', () => {
      const env = createInitialEnvironment();
      evaluate('collatz(n) := if n % 2 == 0 then n / 2 else 3*n + 1', env);
      const orbit = evaluate('iterate(collatz, 6, until: 1, max: 20)', env);
      expect(orbit.value.type).toBe('list');
      if (orbit.value.type === 'list') {
        expect(orbit.value.elements).toEqual([
          { type: 'rational', n: 6n, d: 1n },
          { type: 'rational', n: 3n, d: 1n },
          { type: 'rational', n: 10n, d: 1n },
          { type: 'rational', n: 5n, d: 1n },
          { type: 'rational', n: 16n, d: 1n },
          { type: 'rational', n: 8n, d: 1n },
          { type: 'rational', n: 4n, d: 1n },
          { type: 'rational', n: 2n, d: 1n },
          { type: 'rational', n: 1n, d: 1n },
        ]);
      }
    });
  });

  describe('Bounded Summation & Products', () => {
    it('evaluates bounded summation sum(1/n^2, n in 1..10)', () => {
      const env = createInitialEnvironment();
      const res = evaluate('sum(1/n^2, n in 1..5)', env);
      // 1 + 1/4 + 1/9 + 1/16 + 1/25 = 5269 / 3600
      expect(res.value).toEqual({ type: 'rational', n: 5269n, d: 3600n });
    });

    it('rejects malformed bounded sum missing binder variable with specific error', () => {
      const env = createInitialEnvironment();
      expect(() => evaluate('sum(1/n^2, 1..1000)', env)).toThrowError(
        /Missing binding variable in bounded sum/
      );
    });

    it('switches to float with notice when denominator exceeds 300 digits (Basel Problem)', () => {
      const env = createInitialEnvironment();
      const res = evaluate('sum(1/n^2, n in 1..1000)', env);
      expect(res.value.type).toBe('float');
      if (res.value.type === 'float') {
        expect(res.value.notice).toBe('exact result exceeded 300 digits; showing float');
        expect(res.value.value).toBeCloseTo(Math.PI * Math.PI / 6, 2);
      }
    });
  });

  describe('Number Theory', () => {
    it('isprime correctly classifies primes', () => {
      const env = createInitialEnvironment();
      expect(evaluate('isprime 2', env).value).toEqual({ type: 'boolean', value: true });
      expect(evaluate('isprime 3', env).value).toEqual({ type: 'boolean', value: true });
      expect(evaluate('isprime 4', env).value).toEqual({ type: 'boolean', value: false });
      expect(evaluate('isprime 97', env).value).toEqual({ type: 'boolean', value: true });
    });

    it('nextprime finds next prime', () => {
      const env = createInitialEnvironment();
      expect(evaluate('nextprime 14', env).value).toEqual({ type: 'rational', n: 17n, d: 1n });
      expect(evaluate('nextprime 97', env).value).toEqual({ type: 'rational', n: 101n, d: 1n });
    });

    it('divisors returns sorted list of divisors', () => {
      const env = createInitialEnvironment();
      const res = evaluate('divisors 12', env);
      expect(res.value.type).toBe('list');
      if (res.value.type === 'list') {
        expect(res.value.elements).toEqual([
          { type: 'rational', n: 1n, d: 1n },
          { type: 'rational', n: 2n, d: 1n },
          { type: 'rational', n: 3n, d: 1n },
          { type: 'rational', n: 4n, d: 1n },
          { type: 'rational', n: 6n, d: 1n },
          { type: 'rational', n: 12n, d: 1n },
        ]);
      }
    });

    it('factorize returns list of (prime, exponent) tuples', () => {
      const env = createInitialEnvironment();
      const res = evaluate('factorize 12', env);
      expect(res.value.type).toBe('list');
      if (res.value.type === 'list') {
        expect(res.value.elements).toEqual([
          {
            type: 'tuple',
            elements: [
              { type: 'rational', n: 2n, d: 1n },
              { type: 'rational', n: 2n, d: 1n },
            ],
          },
          {
            type: 'tuple',
            elements: [
              { type: 'rational', n: 3n, d: 1n },
              { type: 'rational', n: 1n, d: 1n },
            ],
          },
        ]);
      }
    });
  });

  describe('Search & Quantification', () => {
    it('find locates first element or none', () => {
      const env = createInitialEnvironment();
      const res1 = evaluate('find(x in 1..100, isprime x and x > 50)', env);
      expect(res1.value).toEqual({ type: 'rational', n: 53n, d: 1n });

      const res2 = evaluate('find(x in 1..10, x > 100)', env);
      expect(res2.value).toEqual({ type: 'none' });
    });

    it('all and any quantify over ranges', () => {
      const env = createInitialEnvironment();
      const res1 = evaluate('all(x > 0, x in 1..10)', env);
      expect(res1.value).toEqual({ type: 'boolean', value: true });

      const res2 = evaluate('all(isprime x, x in 1..10)', env);
      expect(res2.value).toEqual({ type: 'boolean', value: false });

      const res3 = evaluate('any(x == 5, x in 1..10)', env);
      expect(res3.value).toEqual({ type: 'boolean', value: true });
    });
  });

  describe('Root Finding (solve)', () => {
    it('solve with near: x0 finds root using Newton method', () => {
      const env = createInitialEnvironment();
      const res = evaluate('solve(x -> x^2 - 2, near: 1.5)', env);
      expect(res.value.type).toBe('float');
      if (res.value.type === 'float') {
        expect(res.value.value).toBeCloseTo(Math.SQRT2, 8);
      }
    });

    it('solve with range finds root using Bisection method', () => {
      const env = createInitialEnvironment();
      const res = evaluate('solve(x^2 - 2, x in 1..2)', env);
      expect(res.value.type).toBe('float');
      if (res.value.type === 'float') {
        expect(res.value.value).toBeCloseTo(Math.SQRT2, 8);
      }
    });

    it('throws error when no sign change occurs in bisection interval', () => {
      const env = createInitialEnvironment();
      expect(() => evaluate('solve(x^2 + 1, x in 1..2)', env)).toThrowError(
        /no sign change in interval/
      );
    });

    it('solve with inline expression solve(expr, for: x, near: x0) finds root', () => {
      const env = createInitialEnvironment();
      evaluate('R(th) := sin(2 * th)', env);
      const res = evaluate('solve(d//dth R(th), for: th, near: 0.75)', env);
      expect(res.value.type).toBe('float');
      if (res.value.type === 'float') {
        expect(res.value.value).toBeCloseTo(Math.PI / 4, 5); // 0.785398
      }
    });
  });

  describe('Differential Operator (d//dx) Precedence & Function Application', () => {
    it('d//dx f(x) differentiates the applied expression', () => {
      const env = createInitialEnvironment();
      evaluate('f(x) := x^3', env);
      evaluate('x := 2', env);
      const res = evaluate('d//dx f(x)', env);
      // d/dx(x^3) at x=2 is 3*(2^2) = 12
      expect(res.value).toEqual({ type: 'rational', n: 12n, d: 1n });
    });

    it('d//dx f(x) g(x) parses as (d//dx f(x)) * g(x)', () => {
      const env = createInitialEnvironment();
      evaluate('f(x) := x^2', env);
      evaluate('g(x) := x + 1', env);
      evaluate('x := 3', env);
      // d//dx f(x) at x=3 is 2*3 = 6. g(3) = 4. Product = 24.
      const res = evaluate('d//dx f(x) g(x)', env);
      expect(res.value).toEqual({ type: 'rational', n: 24n, d: 1n });
    });

    it('d//dx (f(x) * g(x)) differentiates the entire product', () => {
      const env = createInitialEnvironment();
      evaluate('f(x) := x^2', env);
      evaluate('g(x) := x + 1', env);
      evaluate('x := 3', env);
      // Product is x^3 + x^2. Derivative is 3x^2 + 2x at x=3 -> 27 + 6 = 33.
      const res = evaluate('d//dx (f(x) * g(x))', env);
      expect(res.value).toEqual({ type: 'rational', n: 33n, d: 1n });
    });

    it('d//dx f differentiates a 1-parameter function value directly without application', () => {
      const env = createInitialEnvironment();
      evaluate('f(x) := x^2', env);
      evaluate('x := 4', env);
      const res = evaluate('d//dx f', env);
      // d/dx(x^2) at x=4 is 8
      expect(res.value).toEqual({ type: 'rational', n: 8n, d: 1n });
    });
  });
});
