import { describe, expect, it } from 'vitest';
import { evaluate, createInitialEnvironment } from '../core/evaluator';
import { Environment } from '../core/types';

function evalVal(source: string, env: Environment = createInitialEnvironment()) {
  return evaluate(source, env).value;
}

describe('Phase 3: Mathematical Notation, Differentials, Big Operators, and Matrices', () => {
  describe('Fractions & Differentials', () => {
    it('evaluates stacked fraction // identical to inline division /', () => {
      const env = createInitialEnvironment();
      const res1 = evalVal('10 // 2', env);
      const res2 = evalVal('10 / 2', env);
      expect(res1).toEqual(res2);
      expect(res1).toEqual({ type: 'rational', n: 5n, d: 1n });
    });

    it('evaluates differential operator d//dx', () => {
      const env = createInitialEnvironment();
      evalVal('x := 2', env);
      // d/dx (x^3) at x=2 is 3*(2^2) = 12
      const res = evalVal('d//dx (x^3)', env);
      expect(res).toEqual({ type: 'rational', n: 12n, d: 1n });
    });
  });

  describe('Big Operators: Σ, Π, \u222b', () => {
    it('evaluates Σ summation', () => {
      const env = createInitialEnvironment();
      // sum of squares 1..10 is 385
      const res = evalVal('Σ(i in 1..10, i^2)', env);
      expect(res).toEqual({ type: 'rational', n: 385n, d: 1n });
    });

    it('evaluates Π product', () => {
      const env = createInitialEnvironment();
      // product 1..5 is 120 (5!)
      const res = evalVal('Π(i in 1..5, i)', env);
      expect(res).toEqual({ type: 'rational', n: 120n, d: 1n });
    });

    it('evaluates \u222b numerical integral', () => {
      const env = createInitialEnvironment();
      // integral of x^2 from 0 to 1 is 1/3 ~ 0.333333
      const res = evalVal('\u222b(x in 0..1, x^2)', env);
      expect(res.type).toBe('float');
      expect((res as any).value).toBeCloseTo(1 / 3, 4);
    });
  });

  describe('Matrices & Linear Algebra', () => {
    it('creates matrices and computes determinant and inverse', () => {
      const env = createInitialEnvironment();
      evalVal('A := matrix([[1, 2], [3, 4]])', env);

      // det(A) = 1*4 - 2*3 = -2
      const resDet = evalVal('det(A)', env);
      expect(resDet).toEqual({ type: 'rational', n: -2n, d: 1n });

      // trace(A) = 1 + 4 = 5
      const resTrace = evalVal('trace(A)', env);
      expect(resTrace).toEqual({ type: 'rational', n: 5n, d: 1n });

      // transpose(A) = [[1, 3], [2, 4]]
      const resT = evalVal('transpose(A)', env);
      expect(resT).toMatchObject({
        type: 'matrix',
        rows: 2,
        cols: 2,
        data: [
          [{ type: 'rational', n: 1n, d: 1n }, { type: 'rational', n: 3n, d: 1n }],
          [{ type: 'rational', n: 2n, d: 1n }, { type: 'rational', n: 4n, d: 1n }],
        ],
      });

      // A * inverse(A) == Identity
      evalVal('A_inv := inverse(A)', env);
      const prod = evalVal('A * A_inv', env);
      expect(prod).toMatchObject({
        type: 'matrix',
        rows: 2,
        cols: 2,
        data: [
          [{ type: 'rational', n: 1n, d: 1n }, { type: 'rational', n: 0n, d: 1n }],
          [{ type: 'rational', n: 0n, d: 1n }, { type: 'rational', n: 1n, d: 1n }],
        ],
      });
    });

    it('computes rank and matrix multiplication', () => {
      const env = createInitialEnvironment();
      evalVal('M := matrix([[1, 2, 3], [2, 4, 6], [0, 1, 1]])', env);
      const rankVal = evalVal('rank(M)', env);
      expect(rankVal).toEqual({ type: 'rational', n: 2n, d: 1n });
    });
  });

  describe('Extended Number Theory Builtins', () => {
    it('computes totient, powmod, and binomial', () => {
      const env = createInitialEnvironment();
      // totient(10) = 4 (1, 3, 7, 9)
      expect(evalVal('totient(10)', env)).toEqual({ type: 'rational', n: 4n, d: 1n });

      // powmod(2, 10, 1000) = 24
      expect(evalVal('powmod(2, 10, 1000)', env)).toEqual({ type: 'rational', n: 24n, d: 1n });

      // binomial(5, 2) = 10
      expect(evalVal('binomial(5, 2)', env)).toEqual({ type: 'rational', n: 10n, d: 1n });
    });
  });
});
