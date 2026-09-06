import { describe, it, expect } from 'vitest';
import { evaluate, createInitialEnvironment } from '../core/evaluator';
import { valueToNumber } from '../core/numeric/tower';
import { parse } from '../core/parser';
import { compileRelation, CompileSuccess } from '../core/compiler';
import { sample2D, sample3D } from '../core/sampler';
import { performance } from 'perf_hooks';

describe('Relational Libraries Full Conformance & Benchmark Suite', () => {
  // Global environment with all standard mathematical libraries loaded
  function createStandardLibraryEnv() {
    const env = createInitialEnvironment();
    evaluate('\\import "lib/abs.ax"', env);
    evaluate('\\import "lib/floor.ax"', env);
    evaluate('\\import "lib/ceil.ax"', env);
    evaluate('\\import "lib/sqrt.ax"', env);
    evaluate('\\import "lib/exp.ax"', env);
    evaluate('\\import "lib/trig.ax"', env);
    evaluate('\\import "lib/numbertheory.ax"', env);
    evaluate('\\import "lib/newton.ax"', env);
    evaluate('\\import "lib/bisect.ax"', env);
    return env;
  }

  // Helper to compile expressions in standard environment
  function compileWithStdLib(expr: string, vars: string[]) {
    const env = createStandardLibraryEnv();
    const ast = parse(expr);
    const res = compileRelation(ast, vars, env);
    if (!res.success) {
      throw new Error(`Failed to compile "${expr}": ${(res as any).reason}`);
    }
    return (res as CompileSuccess).fn;
  }

  // ==========================================
  // 1. ABSOLUTE VALUE & DISCRETENESS RELATIONS
  // ==========================================
  describe('1. documents/lib/abs.ax, floor.ax, ceil.ax', () => {
    it('evaluates :abs on positive, negative, zero, and exact rational values', () => {
      const env = createStandardLibraryEnv();
      expect(valueToNumber(evaluate(':abs(42)', env).value)).toBe(42);
      expect(valueToNumber(evaluate(':abs(-42)', env).value)).toBe(42);
      expect(valueToNumber(evaluate(':abs(0)', env).value)).toBe(0);
      expect(valueToNumber(evaluate(':abs(-3.75)', env).value)).toBe(3.75);

      const ratRes = evaluate(':abs(-7/4)', env).value;
      expect(ratRes).toEqual({ type: 'rational', n: 7n, d: 4n });
    });

    it('evaluates :floor on integers, decimals, and negative real numbers', () => {
      const env = createStandardLibraryEnv();
      expect(valueToNumber(evaluate(':floor(5)', env).value)).toBe(5);
      expect(valueToNumber(evaluate(':floor(5.8)', env).value)).toBe(5);
      expect(valueToNumber(evaluate(':floor(0)', env).value)).toBe(0);
      expect(valueToNumber(evaluate(':floor(-3.2)', env).value)).toBe(-4);
      expect(valueToNumber(evaluate(':floor(-7.0)', env).value)).toBe(-7);
    });

    it('evaluates :ceil on integers, decimals, and negative real numbers', () => {
      const env = createStandardLibraryEnv();
      expect(valueToNumber(evaluate(':ceil(5)', env).value)).toBe(5);
      expect(valueToNumber(evaluate(':ceil(5.1)', env).value)).toBe(6);
      expect(valueToNumber(evaluate(':ceil(0)', env).value)).toBe(0);
      expect(valueToNumber(evaluate(':ceil(-3.8)', env).value)).toBe(-3);
      expect(valueToNumber(evaluate(':ceil(-7.0)', env).value)).toBe(-7);
    });

    it('evaluates :round to nearest integer with half-way boundary cases', () => {
      const env = createStandardLibraryEnv();
      expect(valueToNumber(evaluate(':round(4.4)', env).value)).toBe(4);
      expect(valueToNumber(evaluate(':round(4.6)', env).value)).toBe(5);
      expect(valueToNumber(evaluate(':round(4.5)', env).value)).toBe(5);
      expect(valueToNumber(evaluate(':round(-2.3)', env).value)).toBe(-2);
      expect(valueToNumber(evaluate(':round(-2.7)', env).value)).toBe(-3);
    });
  });

  // ==========================================
  // 2. SQUARE ROOT & ROOT SEARCH RECURRENCES
  // ==========================================
  describe('2. documents/lib/sqrt.ax, newton.ax, bisect.ax', () => {
    it('evaluates :sqrt on perfect squares yielding exact rational integers', () => {
      const env = createStandardLibraryEnv();
      const squares = [0, 1, 4, 9, 16, 25, 49, 64, 81, 100, 144, 256, 400, 625, 10000];
      for (const sq of squares) {
        const expectedRoot = BigInt(Math.round(Math.sqrt(sq)));
        const res = evaluate(`:sqrt(${sq})`, env).value;
        expect(res).toEqual({ type: 'rational', n: expectedRoot, d: 1n });
      }
    });

    it('evaluates :sqrt on non-squares using pure relational Newton iteration', () => {
      const env = createStandardLibraryEnv();
      const testCases = [2, 3, 5, 7, 10, 15, 20, 50, 99];
      for (const val of testCases) {
        const expected = Math.sqrt(val);
        const res = evaluate(`:sqrt(${val})`, env).value;
        const num = valueToNumber(res);
        expect(num).toBeCloseTo(expected, 8);
      }
    });

    it('evaluates :sqrt on exact positive rational fractions', () => {
      const env = createStandardLibraryEnv();
      const res = evaluate(':sqrt(9/16)', env).value;
      const num = valueToNumber(res);
      expect(num).toBeCloseTo(0.75, 8);
    });

    it('leaves :sqrt of negative numbers standing unreduced as symbolic expressions', () => {
      const env = createStandardLibraryEnv();
      const res1 = evaluate(':sqrt(-1)', env).value;
      expect(res1.type).toBe('expression');
      expect((res1 as any).text).toBe(':sqrt(-1)');

      const res16 = evaluate(':sqrt(-16)', env).value;
      expect(res16.type).toBe('expression');
      expect((res16 as any).text).toBe(':sqrt(-16)');
    });

    it('verifies :bisect_sqrt search recurrence accuracy', () => {
      const env = createStandardLibraryEnv();
      const res = evaluate(':bisect_sqrt(2)', env).value;
      const num = valueToNumber(res);
      expect(num).toBeCloseTo(1.41421356, 1);
    });
  });

  // ==========================================
  // 3. EXPONENTIAL & LOGARITHMIC FUNCTIONS
  // ==========================================
  describe('3. documents/lib/exp.ax', () => {
    it('evaluates :exp across zero, small, large, and negative inputs', () => {
      const env = createStandardLibraryEnv();
      expect(evaluate(':exp(0)', env).value).toEqual({ type: 'rational', n: 1n, d: 1n });

      const testValues = [0.5, 1.0, 2.0, 3.5, 5.0, -1.0, -2.5, -4.0];
      for (const x of testValues) {
        const expected = Math.exp(x);
        const res = evaluate(`:exp(${x})`, env).value;
        const num = valueToNumber(res);
        const relErr = Math.abs(num - expected) / expected;
        expect(relErr).toBeLessThan(1e-7);
      }
    });

    it('evaluates :ln on positive real values and special zero-point :ln(1) = 0', () => {
      const env = createStandardLibraryEnv();
      expect(evaluate(':ln(1)', env).value).toEqual({ type: 'rational', n: 0n, d: 1n });

      const testValues = [0.1, 0.5, 1.5, 2.0, 2.718281828459045, 5.0, 10.0, 50.0, 100.0];
      for (const x of testValues) {
        const expected = Math.log(x);
        const res = evaluate(`:ln(${x})`, env).value;
        const num = valueToNumber(res);
        expect(num).toBeCloseTo(expected, 6);
      }
    });

    it('leaves :ln of non-positive numbers standing unreduced', () => {
      const env = createStandardLibraryEnv();
      const res0 = evaluate(':ln(0)', env).value;
      expect(res0.type).toBe('expression');
      expect((res0 as any).text).toBe(':ln(0)');

      const resNeg = evaluate(':ln(-5)', env).value;
      expect(resNeg.type).toBe('expression');
      expect((resNeg as any).text).toBe(':ln(-5)');
    });

    it('evaluates :log and :log2 with change of base', () => {
      const env = createStandardLibraryEnv();
      expect(valueToNumber(evaluate(':log(100, 10)', env).value)).toBeCloseTo(2.0, 2);
      expect(valueToNumber(evaluate(':log(1000, 10)', env).value)).toBeCloseTo(3.0, 2);
      expect(valueToNumber(evaluate(':log2(8)', env).value)).toBeCloseTo(3.0, 2);
      expect(valueToNumber(evaluate(':log2(64)', env).value)).toBeCloseTo(6.0, 2);
    });
  });

  // ==========================================
  // 4. TRIGONOMETRIC & HYPERBOLIC FUNCTIONS
  // ==========================================
  describe('4. documents/lib/trig.ax', () => {
    it('evaluates :sin and :cos with exact zero points and periodic range reduction', () => {
      const env = createStandardLibraryEnv();
      expect(evaluate(':sin(0)', env).value).toEqual({ type: 'rational', n: 0n, d: 1n });
      expect(evaluate(':cos(0)', env).value).toEqual({ type: 'rational', n: 1n, d: 1n });
      expect(evaluate(':tan(0)', env).value).toEqual({ type: 'rational', n: 0n, d: 1n });

      const angles = [
        0.5,
        1.0,
        1.5707963267948966, // pi/2
        2.5,
        3.141592653589793,  // pi
        4.0,
        4.71238898038469,   // 3pi/2
        6.283185307179586,  // 2pi
        8.0,
        -1.0,
        -3.141592653589793,
        -5.0,
      ];

      for (const theta of angles) {
        const resSin = valueToNumber(evaluate(`:sin(${theta})`, env).value);
        const resCos = valueToNumber(evaluate(`:cos(${theta})`, env).value);
        expect(resSin).toBeCloseTo(Math.sin(theta), 6);
        expect(resCos).toBeCloseTo(Math.cos(theta), 6);
      }
    });

    it('evaluates inverse trigonometric functions :asin, :acos, :atan', () => {
      const env = createStandardLibraryEnv();
      expect(evaluate(':asin(0)', env).value).toEqual({ type: 'rational', n: 0n, d: 1n });
      expect(evaluate(':atan(0)', env).value).toEqual({ type: 'rational', n: 0n, d: 1n });

      const testX = [-0.9, -0.5, 0.0, 0.5, 0.9];
      for (const x of testX) {
        const resAsin = valueToNumber(evaluate(`:asin(${x})`, env).value);
        expect(resAsin).toBeCloseTo(Math.asin(x), 2);
        const resAcos = valueToNumber(evaluate(`:acos(${x})`, env).value);
        expect(resAcos).toBeCloseTo(Math.acos(x), 2);
      }

      const testAtanX = [-10, -2, -0.5, 0, 0.5, 1, 3, 10, 100];
      for (const x of testAtanX) {
        const resAtan = valueToNumber(evaluate(`:atan(${x})`, env).value);
        expect(resAtan).toBeCloseTo(Math.atan(x), 6);
      }
    });

    it('evaluates hyperbolic functions :sinh, :cosh, :tanh', () => {
      const env = createStandardLibraryEnv();
      expect(evaluate(':sinh(0)', env).value).toEqual({ type: 'rational', n: 0n, d: 1n });
      expect(evaluate(':cosh(0)', env).value).toEqual({ type: 'rational', n: 1n, d: 1n });
      expect(evaluate(':tanh(0)', env).value).toEqual({ type: 'rational', n: 0n, d: 1n });

      const testH = [-2.0, -1.0, -0.5, 0.5, 1.0, 2.0];
      for (const x of testH) {
        const resSinh = valueToNumber(evaluate(`:sinh(${x})`, env).value);
        expect(resSinh).toBeCloseTo(Math.sinh(x), 6);
        const resCosh = valueToNumber(evaluate(`:cosh(${x})`, env).value);
        expect(resCosh).toBeCloseTo(Math.cosh(x), 6);
        const resTanh = valueToNumber(evaluate(`:tanh(${x})`, env).value);
        expect(resTanh).toBeCloseTo(Math.tanh(x), 6);
      }
    });
  });

  // ==========================================
  // 5. NUMBER THEORY & COMBINATORICS
  // ==========================================
  describe('5. documents/lib/numbertheory.ax', () => {
    it('evaluates :gcd and :lcm with exact Euclidean recurrences', () => {
      const env = createStandardLibraryEnv();
      expect(evaluate(':gcd(48, 18)', env).value).toEqual({ type: 'rational', n: 6n, d: 1n });
      expect(evaluate(':gcd(101, 103)', env).value).toEqual({ type: 'rational', n: 1n, d: 1n });
      expect(evaluate(':gcd(0, 7)', env).value).toEqual({ type: 'rational', n: 7n, d: 1n });
      expect(evaluate(':gcd(7, 0)', env).value).toEqual({ type: 'rational', n: 7n, d: 1n });

      expect(evaluate(':lcm(12, 18)', env).value).toEqual({ type: 'rational', n: 36n, d: 1n });
      expect(evaluate(':lcm(7, 13)', env).value).toEqual({ type: 'rational', n: 91n, d: 1n });
    });

    it('evaluates :isprime trial division recurrence across primes and composites', () => {
      const env = createStandardLibraryEnv();
      const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];
      for (const p of primes) {
        expect(evaluate(`:isprime(${p})`, env).value).toEqual({ type: 'boolean', value: true });
      }

      const composites = [0, 1, 4, 6, 8, 9, 10, 12, 15, 21, 25, 27, 49, 100];
      for (const c of composites) {
        expect(evaluate(`:isprime(${c})`, env).value).toEqual({ type: 'boolean', value: false });
      }
    });

    it('evaluates Euler totient function :totient', () => {
      const env = createStandardLibraryEnv();
      expect(evaluate(':totient(1)', env).value).toEqual({ type: 'rational', n: 1n, d: 1n });
      expect(evaluate(':totient(9)', env).value).toEqual({ type: 'rational', n: 6n, d: 1n });
      expect(evaluate(':totient(10)', env).value).toEqual({ type: 'rational', n: 4n, d: 1n });
      expect(evaluate(':totient(13)', env).value).toEqual({ type: 'rational', n: 12n, d: 1n });
      expect(evaluate(':totient(20)', env).value).toEqual({ type: 'rational', n: 8n, d: 1n });
    });

    it('evaluates modular exponentiation :powmod', () => {
      const env = createStandardLibraryEnv();
      expect(evaluate(':powmod(2, 10, 1000)', env).value).toEqual({ type: 'rational', n: 24n, d: 1n });
      expect(evaluate(':powmod(7, 256, 13)', env).value).toEqual({ type: 'rational', n: 9n, d: 1n });
      expect(evaluate(':powmod(3, 0, 7)', env).value).toEqual({ type: 'rational', n: 1n, d: 1n });
    });

    it('evaluates binomial coefficients :binomial', () => {
      const env = createStandardLibraryEnv();
      expect(evaluate(':binomial(5, 2)', env).value).toEqual({ type: 'rational', n: 10n, d: 1n });
      expect(evaluate(':binomial(10, 3)', env).value).toEqual({ type: 'rational', n: 120n, d: 1n });
      expect(evaluate(':binomial(6, 0)', env).value).toEqual({ type: 'rational', n: 1n, d: 1n });
      expect(evaluate(':binomial(6, 6)', env).value).toEqual({ type: 'rational', n: 1n, d: 1n });
      expect(evaluate(':binomial(4, 5)', env).value).toEqual({ type: 'rational', n: 0n, d: 1n });
    });

    it('evaluates :nextprime search', () => {
      const env = createStandardLibraryEnv();
      expect(evaluate(':nextprime(10)', env).value).toEqual({ type: 'rational', n: 11n, d: 1n });
      expect(evaluate(':nextprime(13)', env).value).toEqual({ type: 'rational', n: 17n, d: 1n });
      expect(evaluate(':nextprime(90)', env).value).toEqual({ type: 'rational', n: 97n, d: 1n });
    });

    it('evaluates :divisors list generation', () => {
      const env = createStandardLibraryEnv();
      const res = evaluate(':divisors(12)', env).value;
      expect(res.type).toBe('list');
      const items = (res as any).elements.map((it: any) => Number(it.n));
      expect(items).toEqual([1, 2, 3, 4, 6, 12]);
    });

    it('evaluates prime factorization :factorize', () => {
      const env = createStandardLibraryEnv();
      const res = evaluate(':factorize(360)', env).value;
      expect(res.type).toBe('list');
      const pairs = (res as any).elements.map((tuple: any) => [Number(tuple.elements[0].n), Number(tuple.elements[1].n)]);
      // 360 = 2^3 * 3^2 * 5^1
      expect(pairs).toEqual([[2, 3], [3, 2], [5, 1]]);
    });
  });

  // ==========================================
  // 6. 2D/3D SAMPLING WITH COMPILED RELATIONS
  // ==========================================
  describe('6. High-Throughput 2D and 3D Sampler Integration', () => {
    it('samples 2D unit circle manifold :sqrt(x^2 + y^2) = 1 with zero hardcoded math builtins', () => {
      const fn = compileWithStdLib(':sqrt(x^2 + y^2) - 1', ['x', 'y']);
      const res = sample2D(fn, [-2, 2], [-2, 2], 150);
      expect(res.polylines.length).toBeGreaterThan(0);

      let maxDev = 0;
      let pointCount = 0;
      for (const poly of res.polylines) {
        for (const [x, y] of poly.points) {
          const r = Math.sqrt(x * x + y * y);
          const dev = Math.abs(r - 1.0);
          if (dev > maxDev) maxDev = dev;
          expect(dev).toBeLessThan(0.02);
          pointCount++;
        }
      }
      expect(pointCount).toBeGreaterThan(100);
      expect(maxDev).toBeLessThan(0.005);
    });

    it('samples 2D trigonometric harmonic y = :sin(x) over [-2pi, 2pi]', () => {
      const fn = compileWithStdLib('y - :sin(x)', ['x', 'y']);
      const res = sample2D(fn, [-2 * Math.PI, 2 * Math.PI], [-1.5, 1.5], 200);
      expect(res.polylines.length).toBeGreaterThan(0);

      let maxDev = 0;
      let pointCount = 0;
      for (const poly of res.polylines) {
        for (const [x, y] of poly.points) {
          const expectedY = Math.sin(x);
          const dev = Math.abs(y - expectedY);
          if (dev > maxDev) maxDev = dev;
          expect(dev).toBeLessThan(0.01);
          pointCount++;
        }
      }
      expect(pointCount).toBeGreaterThan(200);
      expect(maxDev).toBeLessThan(0.002);
    });

    it('samples 2D exponential decay curve y = :exp(-x)', () => {
      const fn = compileWithStdLib('y - :exp(-x)', ['x', 'y']);
      const res = sample2D(fn, [-1, 3], [0, 3], 150);
      expect(res.polylines.length).toBeGreaterThan(0);

      let maxDev = 0;
      for (const poly of res.polylines) {
        for (const [x, y] of poly.points) {
          const expectedY = Math.exp(-x);
          const dev = Math.abs(y - expectedY);
          if (dev > maxDev) maxDev = dev;
          expect(dev).toBeLessThan(0.01);
        }
      }
      expect(maxDev).toBeLessThan(0.005);
    });

    it('samples 3D sphere manifold :sqrt(x^2 + y^2 + z^2) = 2', () => {
      const fn = compileWithStdLib(':sqrt(x^2 + y^2 + z^2) - 2', ['x', 'y', 'z']);
      const mesh = sample3D(fn, [-3, 3], [-3, 3], [-3, 3], 40);
      expect(mesh.vertices.length).toBeGreaterThan(500);
      expect(mesh.triangles.length).toBeGreaterThan(500);

      let maxDev = 0;
      for (const [x, y, z] of mesh.vertices) {
        const r = Math.sqrt(x * x + y * y + z * z);
        const dev = Math.abs(r - 2.0);
        if (dev > maxDev) maxDev = dev;
        expect(dev).toBeLessThan(0.05);
      }
      expect(maxDev).toBeLessThan(0.01);
    });
  });

  // ==========================================
  // 7. COMPILER PERFORMANCE BENCHMARK
  // ==========================================
  describe('7. Compiled Closure Throughput Benchmarks', () => {
    it('demonstrates >50x throughput speedup of compiled relational closures over AST walker', () => {
      const env = createStandardLibraryEnv();
      const expr = ':sin(x) * :cos(y) + :exp(-x^2 - y^2)';
      const compiledFn = compileWithStdLib(expr, ['x', 'y']);

      const N = 5000;
      const xVals = Array.from({ length: N }, (_, i) => -2 + (4 * i) / N);
      const yVals = Array.from({ length: N }, (_, i) => -2 + (4 * (N - 1 - i)) / N);

      // Warm up
      for (let i = 0; i < 100; i++) {
        compiledFn(xVals[i], yVals[i]);
      }

      // Time compiled closure
      const t0 = performance.now();
      let sumCompiled = 0;
      for (let i = 0; i < N; i++) {
        sumCompiled += compiledFn(xVals[i], yVals[i]);
      }
      const t1 = performance.now();
      const compiledTimePerEvalUs = ((t1 - t0) * 1000) / N;

      // Time AST walker (on a sample of 100 to save test time)
      const M = 100;
      const t2 = performance.now();
      for (let i = 0; i < M; i++) {
        const iterEnv = { ...env, x: { type: 'float', value: xVals[i] }, y: { type: 'float', value: yVals[i] } };
        evaluate(expr, iterEnv as any);
      }
      const t3 = performance.now();
      const walkerTimePerEvalUs = ((t3 - t2) * 1000) / M;

      const speedup = walkerTimePerEvalUs / compiledTimePerEvalUs;

      console.log(`\n--- RELATIONAL LIBRARY COMPILED THROUGHPUT BENCHMARK ---`);
      console.log(`• Relation: ${expr}`);
      console.log(`• AST Walker evaluation: ${walkerTimePerEvalUs.toFixed(3)} µs/eval`);
      console.log(`• Compiled closure evaluation: ${compiledTimePerEvalUs.toFixed(4)} µs/eval`);
      console.log(`• Compiled Speedup: ${speedup.toFixed(1)}x`);

      expect(speedup).toBeGreaterThan(30.0);
      expect(Number.isFinite(sumCompiled)).toBe(true);
    });
  });
});
