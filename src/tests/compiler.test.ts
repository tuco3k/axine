import { describe, it, expect } from 'vitest';
import { parse } from '../core/parser';
import { compileRelation, CompileSuccess, CompileFailure } from '../core/compiler';
import { createInitialEnvironment, Evaluator } from '../core/evaluator';
import { valueToNumber } from '../core/numeric/tower';
import { DEFAULT_INVOKED_FUEL } from '../core/types';
import { BudgetTracker } from '../core/evaluator';
import { performance } from 'perf_hooks';

describe('Phase 1: Relation Compiler', () => {
  // Helper to assert strict numerical agreement between compiled closure and evalNode
  function assertNumericalAgreement(
    expr: string,
    vars: string[],
    envSetup?: (env: any) => void,
    pointCount = 100,
    tolerance = 1e-12
  ) {
    const env = createInitialEnvironment();
    if (envSetup) envSetup(env);

    const knownFuncs = new Set<string>();
    for (const k in env) {
      if (env[k].type === 'function' || env[k].type === 'lambda') knownFuncs.add(k);
    }

    const ast = parse(expr, { knownFunctions: knownFuncs });
    const compRes = compileRelation(ast, vars, env);
    if (!compRes.success) {
      throw new Error(`Compilation failed for "${expr}": ${(compRes as CompileFailure).reason}`);
    }

    for (let i = 0; i < pointCount; i++) {
      // Deterministic pseudo-random points covering [-5, 5] and near-zero values
      const point: number[] = vars.map((_, idx) => {
        const seed = (i + 1) * 0.37 + (idx + 1) * 0.73;
        const raw = ((seed * 1000) % 1000) / 100 - 5;
        // Introduce occasional near-zero points
        if (i % 20 === 0) return raw * 1e-6;
        return raw;
      });

      const testEnv = { ...env };
      vars.forEach((v, idx) => {
        testEnv[v] = { type: 'float', value: point[idx] };
      });

      const evaluator = new Evaluator(testEnv, expr, new BudgetTracker(DEFAULT_INVOKED_FUEL));

      let evalVal: number | null = null;
      let evalThrew = false;
      try {
        const res = evaluator.evaluate(ast);
        if (res.type === 'float' || res.type === 'rational') {
          evalVal = valueToNumber(res);
        } else if (res.type === 'boolean') {
          evalVal = res.value ? 1 : 0;
        }
      } catch {
        evalThrew = true;
      }

      let compVal: number | null = null;
      let compThrew = false;
      try {
        compVal = compRes.fn(...point);
      } catch {
        compThrew = true;
      }

      const evalIsInvalid = evalThrew || evalVal === null || !Number.isFinite(evalVal) || Number.isNaN(evalVal);
      const compIsInvalid = compThrew || compVal === null || !Number.isFinite(compVal) || Number.isNaN(compVal);

      if (evalIsInvalid) {
        // Both must agree that the evaluation is invalid / out of real domain
        expect(compIsInvalid).toBe(true);
      } else {
        expect(compIsInvalid).toBe(false);
        const diff = Math.abs(evalVal! - compVal!);
        const scale = Math.max(1.0, Math.abs(evalVal!), Math.abs(compVal!));
        const relErr = diff / scale;
        if (relErr > tolerance) {
          throw new Error(
            `Numerical disagreement on "${expr}" at point [${point.join(', ')}]: evalNode=${evalVal}, compiled=${compVal}, relErr=${relErr}`
          );
        }
        expect(relErr).toBeLessThanOrEqual(tolerance);
      }
    }
  }

  describe('Uncompilable Nodes & Markers', () => {
    it('returns failure marker for list/tuple literals', () => {
      const ast = parse('[1, 2, 3]');
      const res = compileRelation(ast, ['x']);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.uncompilableNode).toBe('List');
        expect(res.reason).toBeDefined();
      }
    });

    it('returns failure marker for symbolic differentiation', () => {
      const ast = parse('d//dx (x^2)');
      const res = compileRelation(ast, ['x']);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.uncompilableNode).toBe('Diff');
      }
    });

    it('returns failure marker for unbound identifiers', () => {
      const ast = parse('x + unknown_var');
      const res = compileRelation(ast, ['x']);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.uncompilableNode).toBe('Identifier');
        expect(res.reason).toMatch(/unbound/i);
      }
    });

    it('returns failure marker for non-scalar environment variables', () => {
      const env = createInitialEnvironment();
      env.vec = { type: 'tuple', elements: [{ type: 'float', value: 1 }, { type: 'float', value: 2 }] };
      const ast = parse('x + vec');
      const res = compileRelation(ast, ['x'], env);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.uncompilableNode).toBe('Identifier');
        expect(res.reason).toMatch(/non-scalar/i);
      }
    });
  });

  describe('Correctness Gate: 200 Sampled Expressions x 100 Points', () => {
    const expressions: { expr: string; vars: string[]; setup?: (env: any) => void }[] = [];

    // 1. Basic Arithmetic (20 expressions)
    expressions.push(
      { expr: 'x + 5', vars: ['x'] },
      { expr: 'x - 10', vars: ['x'] },
      { expr: '2 * x + 3 * y', vars: ['x', 'y'] },
      { expr: 'x / (y + 10)', vars: ['x', 'y'] },
      { expr: 'x % 3', vars: ['x'] },
      { expr: '-x', vars: ['x'] },
      { expr: '+x', vars: ['x'] },
      { expr: '-(x + y)', vars: ['x', 'y'] },
      { expr: 'x * y * z', vars: ['x', 'y', 'z'] },
      { expr: 'x / 2 + y / 3 - z / 4', vars: ['x', 'y', 'z'] },
      { expr: 'x + y - z + w', vars: ['x', 'y', 'z', 'w'] },
      { expr: '2.5 * x - 1.25 * y', vars: ['x', 'y'] },
      { expr: '0.1 * x + 0.2 * y + 0.3 * z', vars: ['x', 'y', 'z'] },
      { expr: '(x + 1) * (y + 2) * (z + 3)', vars: ['x', 'y', 'z'] },
      { expr: '(x - y) / (x + y + 10)', vars: ['x', 'y'] },
      { expr: '100 - (x + (y - (z + 2)))', vars: ['x', 'y', 'z'] },
      { expr: 'x * (y + z * (w - 1))', vars: ['x', 'y', 'z', 'w'] },
      { expr: '-(-(-x))', vars: ['x'] },
      { expr: '(x + y) % (abs(z) + 1)', vars: ['x', 'y', 'z'] },
      { expr: '1 / (x^2 + y^2 + 1)', vars: ['x', 'y'] }
    );

    // 2. Powers & Polynomials (20 expressions)
    expressions.push(
      { expr: 'x^2', vars: ['x'] },
      { expr: 'x^3 - 2*x^2 + 5*x - 7', vars: ['x'] },
      { expr: 'x^2 + y^2', vars: ['x', 'y'] },
      { expr: 'x^2 - y^2', vars: ['x', 'y'] },
      { expr: '(x + y)^2', vars: ['x', 'y'] },
      { expr: '(x + y)^3', vars: ['x', 'y'] },
      { expr: '(x + y + z)^2', vars: ['x', 'y', 'z'] },
      { expr: 'x^4 - y^4', vars: ['x', 'y'] },
      { expr: '3*x^5 - 2*x^3 + x', vars: ['x'] },
      { expr: 'x^2 * y^3 - y^2 * x^3', vars: ['x', 'y'] },
      { expr: 'x^0.5', vars: ['x'] },
      { expr: '(x^2 + 1)^0.5', vars: ['x'] },
      { expr: '2^x', vars: ['x'] },
      { expr: '3^(x + y)', vars: ['x', 'y'] },
      { expr: 'x^2 + y^2 + z^2', vars: ['x', 'y', 'z'] },
      { expr: 'x^2 + y^2 + z^2 + w^2', vars: ['x', 'y', 'z', 'w'] },
      { expr: '(x^2 - 1) * (y^2 - 1) * (z^2 - 1)', vars: ['x', 'y', 'z'] },
      { expr: 'x^6 / (x^4 + 1)', vars: ['x'] },
      { expr: '(x - 2)^2 + (y - 3)^2', vars: ['x', 'y'] },
      { expr: 'x^3 * y - y^3 * x', vars: ['x', 'y'] }
    );

    // 3. Trigonometric Functions (25 expressions)
    expressions.push(
      { expr: 'sin(x)', vars: ['x'] },
      { expr: 'cos(x)', vars: ['x'] },
      { expr: 'tan(x)', vars: ['x'] },
      { expr: 'sin(x)^2 + cos(x)^2', vars: ['x'] },
      { expr: 'sin(x + y)', vars: ['x', 'y'] },
      { expr: 'cos(x - y)', vars: ['x', 'y'] },
      { expr: 'sin(x) * cos(y)', vars: ['x', 'y'] },
      { expr: 'sin(2*x) * cos(3*y)', vars: ['x', 'y'] },
      { expr: 'tan(x) + tan(y)', vars: ['x', 'y'] },
      { expr: 'sin(x^2 + y^2)', vars: ['x', 'y'] },
      { expr: 'cos(sqrt(abs(x) + abs(y)))', vars: ['x', 'y'] },
      { expr: 'sin(x) * sin(y) * sin(z)', vars: ['x', 'y', 'z'] },
      { expr: 'cos(x + y + z)', vars: ['x', 'y', 'z'] },
      { expr: 'sin(pi * x)', vars: ['x'] },
      { expr: 'cos(tau * y)', vars: ['y'] },
      { expr: 'tan(pi * x / 4)', vars: ['x'] },
      { expr: 'sin(x) / (cos(x)^2 + 1)', vars: ['x'] },
      { expr: 'sin(x)^3 - cos(x)^3', vars: ['x'] },
      { expr: 'sin(x * y) - cos(x + y)', vars: ['x', 'y'] },
      { expr: 'sin(x)^2 * cos(y)^2', vars: ['x', 'y'] },
      { expr: 'sin(exp(x / 5))', vars: ['x'] },
      { expr: 'cos(ln(abs(x) + 1))', vars: ['x'] },
      { expr: 'sin(x + pi/6) + cos(x + pi/3)', vars: ['x'] },
      { expr: 'tan(x/2) * sin(x)', vars: ['x'] },
      { expr: 'sin(x) + sin(2*x)/2 + sin(3*x)/3', vars: ['x'] }
    );

    // 4. Inverse Trigonometric & Hyperbolic (20 expressions)
    expressions.push(
      { expr: 'asin(x / 10)', vars: ['x'] },
      { expr: 'acos(x / 10)', vars: ['x'] },
      { expr: 'atan(x)', vars: ['x'] },
      { expr: 'atan(x + y)', vars: ['x', 'y'] },
      { expr: 'atan(y / (abs(x) + 1))', vars: ['x', 'y'] },
      { expr: 'atan(sin(y) + cos(x))', vars: ['x', 'y'] },
      { expr: 'sinh(x)', vars: ['x'] },
      { expr: 'cosh(x)', vars: ['x'] },
      { expr: 'tanh(x)', vars: ['x'] },
      { expr: 'cosh(x)^2 - sinh(x)^2', vars: ['x'] },
      { expr: 'sinh(x + y)', vars: ['x', 'y'] },
      { expr: 'cosh(x * y)', vars: ['x', 'y'] },
      { expr: 'tanh(x^2 + y^2)', vars: ['x', 'y'] },
      { expr: 'sinh(x) * cosh(y)', vars: ['x', 'y'] },
      { expr: 'atan(sinh(x))', vars: ['x'] },
      { expr: 'tanh(atan(x))', vars: ['x'] },
      { expr: 'asin(sin(x) / 2)', vars: ['x'] },
      { expr: 'acos(cos(x) / 2)', vars: ['x'] },
      { expr: 'sinh(x) / (cosh(x) + 1)', vars: ['x'] },
      { expr: 'atan(x / (abs(y) + 1))', vars: ['x', 'y'] }
    );

    // 5. Exponentials & Logarithms (20 expressions)
    expressions.push(
      { expr: 'exp(x)', vars: ['x'] },
      { expr: 'exp(-x^2)', vars: ['x'] },
      { expr: 'exp(-x^2 - y^2)', vars: ['x', 'y'] },
      { expr: 'exp(x + y)', vars: ['x', 'y'] },
      { expr: 'exp(x) * exp(y)', vars: ['x', 'y'] },
      { expr: 'ln(abs(x) + 1)', vars: ['x'] },
      { expr: 'ln(x^2 + y^2 + 1)', vars: ['x', 'y'] },
      { expr: 'log(abs(x) + 1)', vars: ['x'] },
      { expr: 'log2(abs(x) + 1)', vars: ['x'] },
      { expr: 'log(abs(x) + 2, abs(y) + 2)', vars: ['x', 'y'] },
      { expr: 'exp(sin(x))', vars: ['x'] },
      { expr: 'ln(cosh(x))', vars: ['x'] },
      { expr: 'exp(-abs(x - y))', vars: ['x', 'y'] },
      { expr: 'ln(exp(x) + exp(y))', vars: ['x', 'y'] },
      { expr: 'exp(x) / (1 + exp(x))', vars: ['x'] }, // sigmoid
      { expr: 'x * exp(-x)', vars: ['x'] },
      { expr: 'log2(x^2 + 1) + log(y^2 + 1)', vars: ['x', 'y'] },
      { expr: 'exp(-0.5 * (x^2 + y^2))', vars: ['x', 'y'] },
      { expr: 'ln(1 + exp(-abs(x)))', vars: ['x'] },
      { expr: 'e^x - exp(x)', vars: ['x'] }
    );

    // 6. Roots, Absolutes & Discontinuous Math (20 expressions)
    expressions.push(
      { expr: 'sqrt(x^2 + y^2)', vars: ['x', 'y'] },
      { expr: 'sqrt(abs(x))', vars: ['x'] },
      { expr: 'sqrt(x^4 + 1)', vars: ['x'] },
      { expr: 'abs(x)', vars: ['x'] },
      { expr: 'abs(x - y)', vars: ['x', 'y'] },
      { expr: 'abs(x) + abs(y)', vars: ['x', 'y'] },
      { expr: 'max(abs(x), abs(y))', vars: ['x', 'y'] },
      { expr: 'min(x, y)', vars: ['x', 'y'] },
      { expr: 'max(x, y, z)', vars: ['x', 'y', 'z'] },
      { expr: 'floor(x)', vars: ['x'] },
      { expr: 'ceil(x)', vars: ['x'] },
      { expr: 'round(x)', vars: ['x'] },
      { expr: 'floor(x + y)', vars: ['x', 'y'] },
      { expr: 'ceil(x * y)', vars: ['x', 'y'] },
      { expr: 'abs(sin(x)) + abs(cos(y))', vars: ['x', 'y'] },
      { expr: 'sqrt(abs(sin(x * y)))', vars: ['x', 'y'] },
      { expr: 'round(x - y) * (x - y)', vars: ['x', 'y'] },
      { expr: 'min(abs(x), abs(y), abs(z))', vars: ['x', 'y', 'z'] },
      { expr: 'max(x^2, y^2) - min(x^2, y^2)', vars: ['x', 'y'] },
      { expr: 'floor(x) + ceil(y) - abs(x - y)', vars: ['x', 'y'] }
    );

    // 7. Constants & Inlined Scales (15 expressions)
    expressions.push(
      { expr: 'pi * x^2', vars: ['x'] },
      { expr: '2 * pi * x', vars: ['x'] },
      { expr: 'tau * (x + y)', vars: ['x', 'y'] },
      { expr: 'phi * x - y', vars: ['x', 'y'] },
      { expr: 'e^(pi * x / 10)', vars: ['x'] },
      { expr: 'sin(tau * x) * cos(pi * y)', vars: ['x', 'y'] },
      { expr: 'phi^2 - phi - 1', vars: ['x'] },
      { expr: 'pi / (abs(x) + 1)', vars: ['x'] },
      { expr: 'tau / (y^2 + 2)', vars: ['y'] },
      { expr: '(phi * x + y) / (x + phi * y + 10)', vars: ['x', 'y'] },
      { expr: 'pi * sin(x) + e * cos(y)', vars: ['x', 'y'] },
      { expr: 'tau * exp(-abs(x))', vars: ['x'] },
      { expr: 'phi * sqrt(abs(x) + 1)', vars: ['x'] },
      { expr: 'e * pi * phi * x', vars: ['x'] },
      { expr: 'sin(phi * x) + cos(phi * y)', vars: ['x', 'y'] }
    );

    // 8. Comparisons & Boolean Logic (15 expressions)
    expressions.push(
      { expr: 'x < y', vars: ['x', 'y'] },
      { expr: 'x <= y', vars: ['x', 'y'] },
      { expr: 'x > y', vars: ['x', 'y'] },
      { expr: 'x >= y', vars: ['x', 'y'] },
      { expr: 'x == y', vars: ['x', 'y'] },
      { expr: 'x != y', vars: ['x', 'y'] },
      { expr: '(x > 0) and (y > 0)', vars: ['x', 'y'] },
      { expr: '(x < 0) or (y > 0)', vars: ['x', 'y'] },
      { expr: 'not (x > 0)', vars: ['x'] },
      { expr: '(x^2 + y^2 < 4) and (x > 0)', vars: ['x', 'y'] },
      { expr: '(x < -1) or (x > 1)', vars: ['x'] },
      { expr: 'not ((x > 0) and (y > 0))', vars: ['x', 'y'] },
      { expr: '(x >= 0) and (y >= 0) and (z >= 0)', vars: ['x', 'y', 'z'] },
      { expr: '(x == 0) or (y == 0)', vars: ['x', 'y'] },
      { expr: '(x != 0) and (y != 0)', vars: ['x', 'y'] }
    );

    // 9. Conditionals with Both Branches Taken (15 expressions)
    expressions.push(
      { expr: 'if x > 0 then x^2 else -x', vars: ['x'] },
      { expr: 'if x > y then x - y else y - x', vars: ['x', 'y'] },
      { expr: 'if x^2 + y^2 < 4 then 1 else 0', vars: ['x', 'y'] },
      { expr: 'if sin(x) > 0 then cos(x) else -cos(x)', vars: ['x'] },
      { expr: 'if x > 0 then (if y > 0 then 1 else 2) else (if y > 0 then 3 else 4)', vars: ['x', 'y'] },
      { expr: 'if x == 0 then 1 else sin(x) / x', vars: ['x'] }, // sinc function
      { expr: 'if x > 1 then ln(x) else (if x < -1 then ln(-x) else 0)', vars: ['x'] },
      { expr: 'if x + y > 0 then exp(x) else exp(y)', vars: ['x', 'y'] },
      { expr: 'if abs(x) < 1 then 1 - x^2 else 0', vars: ['x'] },
      { expr: 'if x < 0 then -x^3 else x^3', vars: ['x'] },
      { expr: 'if x * y > 0 then sqrt(abs(x * y)) else -sqrt(abs(x * y))', vars: ['x', 'y'] },
      { expr: 'if (x > 0) and (y > 0) then x + y else x - y', vars: ['x', 'y'] },
      { expr: 'if not (x > 0) then -x else x', vars: ['x'] },
      { expr: 'if x > 2 then x^2 else (if x < -2 then -x^2 else 0)', vars: ['x'] },
      { expr: 'if sin(x) > cos(y) then exp(x / 5) else ln(abs(y) + 1)', vars: ['x', 'y'] }
    );

    // 10. Deeply Nested Arithmetic (10 expressions)
    expressions.push(
      { expr: '((((x + 1) * 2 - 3) * 4 + 5) * 6 - 7) / 100', vars: ['x'] },
      { expr: '((x + 1) * (y - 2) + 3) / ((x^2 + y^2) + 1) - 4 * (x - y)', vars: ['x', 'y'] },
      { expr: '((((x + y) * (z + w) - (x - y)) * (z - w) + x) / (y^2 + z^2 + 1))', vars: ['x', 'y', 'z', 'w'] },
      { expr: '((x / (y + 1) + z / (w + 1)) * (x - w)) / (y + z + 10)', vars: ['x', 'y', 'z', 'w'] },
      { expr: '1 / (1 + 1 / (1 + 1 / (1 + x^2)))', vars: ['x'] }, // continued fraction
      { expr: '((((x^2 + 1)^2 + 2)^2 + 3)^2) / 1e6', vars: ['x'] },
      { expr: '((x - 1)*(x - 2)*(x - 3)*(x - 4)*(x - 5)) / 120', vars: ['x'] },
      { expr: '(((x + y)^2 - (x - y)^2) / 4) - x*y', vars: ['x', 'y'] },
      { expr: '((((x + 1) * (y - 2) + 3) / ((x^2 + y^2) + 1) - 4 * (x - y)) * (x + 2*y) + 5) / (x^2 + 1)', vars: ['x', 'y'] },
      { expr: '(((sin(x) + cos(y))^2 + (sin(y) - cos(x))^2) - 2) / (x^2 + y^2 + 1)', vars: ['x', 'y'] }
    );

    // 11. User-Defined Functions (Single & Multi-Parameter) (15 expressions)
    expressions.push(
      {
        expr: 'sq(x) + sq(y)',
        vars: ['x', 'y'],
        setup: env => {
          env.sq = { type: 'function', name: 'sq', params: ['t'], body: parse('t^2'), closure: {} };
        },
      },
      {
        expr: 'poly(x) - poly(y)',
        vars: ['x', 'y'],
        setup: env => {
          env.poly = { type: 'function', name: 'poly', params: ['t'], body: parse('t^3 - 2*t + 1'), closure: {} };
        },
      },
      {
        expr: 'dist(x, y)',
        vars: ['x', 'y'],
        setup: env => {
          env.dist = { type: 'function', name: 'dist', params: ['u', 'v'], body: parse('sqrt(u^2 + v^2)'), closure: {} };
        },
      },
      {
        expr: 'gauss(x, 0, 1) + gauss(y, 1, 2)',
        vars: ['x', 'y'],
        setup: env => {
          env.gauss = {
            type: 'function',
            name: 'gauss',
            params: ['t', 'mu', 'sig'],
            body: parse('exp(-((t - mu)^2) / (2 * sig^2))'),
            closure: {},
          };
        },
      },
      {
        expr: 'clamp(x, -2, 2) + clamp(y, 0, 1)',
        vars: ['x', 'y'],
        setup: env => {
          env.clamp = {
            type: 'function',
            name: 'clamp',
            params: ['t', 'lo', 'hi'],
            body: parse('if t < lo then lo else (if t > hi then hi else t)'),
            closure: {},
          };
        },
      },
      {
        expr: 'sinc(x) * sinc(y)',
        vars: ['x', 'y'],
        setup: env => {
          env.sinc = {
            type: 'function',
            name: 'sinc',
            params: ['t'],
            body: parse('if t == 0 then 1 else sin(t) / t'),
            closure: {},
          };
        },
      },
      {
        expr: 'f(x) + f(y) - 10',
        vars: ['x', 'y'],
        setup: env => {
          env.f = { type: 'function', name: 'f', params: ['t'], body: parse('t^2 + 3.5'), closure: {} };
        },
      },
      {
        expr: 'my_hypot(x, y, z)',
        vars: ['x', 'y', 'z'],
        setup: env => {
          env.my_hypot = {
            type: 'function',
            name: 'my_hypot',
            params: ['a', 'b', 'c'],
            body: parse('sqrt(a^2 + b^2 + c^2)'),
            closure: {},
          };
        },
      },
      {
        expr: 'f_exp(x) + f_exp(y)',
        vars: ['x', 'y'],
        setup: env => {
          env.f_exp = {
            type: 'function',
            name: 'f_exp',
            params: ['t'],
            body: parse('exp(t / 2) - sin(t)'),
            closure: {},
          };
        },
      },
      {
        expr: 'quad(x + 1) * quad(y - 1)',
        vars: ['x', 'y'],
        setup: env => {
          env.quad = {
            type: 'function',
            name: 'quad',
            params: ['u'],
            body: parse('2*u^2 - 3*u + 4'),
            closure: {},
          };
        },
      },
      {
        expr: 'step_fn(x) + step_fn(y)',
        vars: ['x', 'y'],
        setup: env => {
          env.step_fn = {
            type: 'function',
            name: 'step_fn',
            params: ['t'],
            body: parse('if t >= 0 then 1 else 0'),
            closure: {},
          };
        },
      },
      {
        expr: 'cubic(x, y)',
        vars: ['x', 'y'],
        setup: env => {
          env.cubic = {
            type: 'function',
            name: 'cubic',
            params: ['u', 'v'],
            body: parse('u^3 + 3*u^2*v + 3*u*v^2 + v^3'),
            closure: {},
          };
        },
      },
      {
        expr: 'avg(x, y) - avg(z, w)',
        vars: ['x', 'y', 'z', 'w'],
        setup: env => {
          env.avg = {
            type: 'function',
            name: 'avg',
            params: ['a', 'b'],
            body: parse('(a + b) / 2'),
            closure: {},
          };
        },
      },
      {
        expr: 'f_log(x) + f_log(y)',
        vars: ['x', 'y'],
        setup: env => {
          env.f_log = {
            type: 'function',
            name: 'f_log',
            params: ['t'],
            body: parse('ln(t^2 + 1) + atan(t)'),
            closure: {},
          };
        },
      },
      {
        expr: 'rot_x(x, y, pi/4)',
        vars: ['x', 'y'],
        setup: env => {
          env.rot_x = {
            type: 'function',
            name: 'rot_x',
            params: ['px', 'py', 'th'],
            body: parse('px * cos(th) - py * sin(th)'),
            closure: {},
          };
        },
      }
    );

    // 12. Nested User Functions (Chained Calls) (10 expressions)
    expressions.push(
      {
        expr: 'g(x) + g(y)',
        vars: ['x', 'y'],
        setup: env => {
          env.f = { type: 'function', name: 'f', params: ['t'], body: parse('t^2 + 1'), closure: {} };
          env.g = { type: 'function', name: 'g', params: ['u'], body: parse('f(u) * 2'), closure: {} };
        },
      },
      {
        expr: 'h(x) - h(y)',
        vars: ['x', 'y'],
        setup: env => {
          env.f1 = { type: 'function', name: 'f1', params: ['t'], body: parse('t + 1'), closure: {} };
          env.f2 = { type: 'function', name: 'f2', params: ['t'], body: parse('f1(t) * 2'), closure: {} };
          env.h = { type: 'function', name: 'h', params: ['t'], body: parse('f2(t) + f1(t)'), closure: {} };
        },
      },
      {
        expr: 'outer_fn(x, y)',
        vars: ['x', 'y'],
        setup: env => {
          env.sq = { type: 'function', name: 'sq', params: ['t'], body: parse('t^2'), closure: {} };
          env.outer_fn = {
            type: 'function',
            name: 'outer_fn',
            params: ['a', 'b'],
            body: parse('sqrt(sq(a) + sq(b))'),
            closure: {},
          };
        },
      },
      {
        expr: 'chain3(x)',
        vars: ['x'],
        setup: env => {
          env.c1 = { type: 'function', name: 'c1', params: ['t'], body: parse('t + 2'), closure: {} };
          env.c2 = { type: 'function', name: 'c2', params: ['t'], body: parse('c1(t)^2'), closure: {} };
          env.chain3 = { type: 'function', name: 'chain3', params: ['t'], body: parse('sin(c2(t))'), closure: {} };
        },
      },
      {
        expr: 'energy(x, y)',
        vars: ['x', 'y'],
        setup: env => {
          env.ke = { type: 'function', name: 'ke', params: ['v'], body: parse('0.5 * v^2'), closure: {} };
          env.pe = { type: 'function', name: 'pe', params: ['pos'], body: parse('0.5 * 10 * pos^2'), closure: {} };
          env.energy = {
            type: 'function',
            name: 'energy',
            params: ['pos', 'v'],
            body: parse('ke(v) + pe(pos)'),
            closure: {},
          };
        },
      },
      {
        expr: 'compose2(x, y)',
        vars: ['x', 'y'],
        setup: env => {
          env.add1 = { type: 'function', name: 'add1', params: ['t'], body: parse('t + 1'), closure: {} };
          env.mul2 = { type: 'function', name: 'mul2', params: ['t'], body: parse('t * 2'), closure: {} };
          env.compose2 = {
            type: 'function',
            name: 'compose2',
            params: ['a', 'b'],
            body: parse('add1(mul2(a)) + mul2(add1(b))'),
            closure: {},
          };
        },
      },
      {
        expr: 'nested_cond(x, y)',
        vars: ['x', 'y'],
        setup: env => {
          env.pos_sq = { type: 'function', name: 'pos_sq', params: ['t'], body: parse('if t > 0 then t^2 else 0'), closure: {} };
          env.nested_cond = {
            type: 'function',
            name: 'nested_cond',
            params: ['a', 'b'],
            body: parse('pos_sq(a) + pos_sq(b)'),
            closure: {},
          };
        },
      },
      {
        expr: 'dist4(x, y, z, w)',
        vars: ['x', 'y', 'z', 'w'],
        setup: env => {
          env.d2 = { type: 'function', name: 'd2', params: ['a', 'b'], body: parse('a^2 + b^2'), closure: {} };
          env.dist4 = {
            type: 'function',
            name: 'dist4',
            params: ['a', 'b', 'c', 'd'],
            body: parse('sqrt(d2(a, b) + d2(c, d))'),
            closure: {},
          };
        },
      },
      {
        expr: 'wave(x, y)',
        vars: ['x', 'y'],
        setup: env => {
          env.env_fn = { type: 'function', name: 'env_fn', params: ['t'], body: parse('exp(-abs(t))'), closure: {} };
          env.carrier = { type: 'function', name: 'carrier', params: ['t'], body: parse('sin(5 * t)'), closure: {} };
          env.wave = {
            type: 'function',
            name: 'wave',
            params: ['px', 'py'],
            body: parse('env_fn(px) * carrier(py)'),
            closure: {},
          };
        },
      },
      {
        expr: 'chain_math(x)',
        vars: ['x'],
        setup: env => {
          env.m1 = { type: 'function', name: 'm1', params: ['t'], body: parse('atan(t)'), closure: {} };
          env.m2 = { type: 'function', name: 'm2', params: ['t'], body: parse('exp(m1(t))'), closure: {} };
          env.chain_math = { type: 'function', name: 'chain_math', params: ['t'], body: parse('ln(m2(t))'), closure: {} };
        },
      }
    );

    // Verify all expressions in the suite
    it(`evaluates all ${expressions.length} expressions across 100 points with strict agreement (< 1e-12)`, () => {
      expect(expressions.length).toBeGreaterThanOrEqual(200);
      let passedCount = 0;
      for (const item of expressions) {
        assertNumericalAgreement(item.expr, item.vars, item.setup, 100, 1e-12);
        passedCount++;
      }
      expect(passedCount).toBe(expressions.length);
    });
  });

  describe('Performance Gate: Execution Benchmarks', () => {
    it('benchmarks AST walker vs compiled closures and reports throughput', () => {
      const benchmarkCases = [
        { name: 'x^2 + y^2 - 4', expr: 'x^2 + y^2 - 4', vars: ['x', 'y'] },
        { name: 'sin(x) * cos(y) - 0.5', expr: 'sin(x) * cos(y) - 0.5', vars: ['x', 'y'] },
        {
          name: 'five-level nested arithmetic',
          expr: '((((x + 1) * (y - 2) + 3) / ((x^2 + y^2) + 1) - 4 * (x - y)) * (x + 2*y) + 5) / (x^2 + 1)',
          vars: ['x', 'y'],
        },
        {
          name: 'user-defined function call',
          expr: 'f(x) + f(y) - 10',
          vars: ['x', 'y'],
          setup: (env: any) => {
            env.f = { type: 'function', name: 'f', params: ['t'], body: parse('t^2 + 3.5'), closure: {} };
          },
        },
      ];

      const N = 50_000;
      const results: { name: string; walkerUs: number; compiledUs: number; ratio: number }[] = [];

      for (const bCase of benchmarkCases) {
        const env = createInitialEnvironment();
        if (bCase.setup) bCase.setup(env);

        const knownFuncs = new Set<string>();
        for (const k in env) {
          if (env[k].type === 'function' || env[k].type === 'lambda') knownFuncs.add(k);
        }

        const ast = parse(bCase.expr, { knownFunctions: knownFuncs });
        const compRes = compileRelation(ast, bCase.vars, env) as CompileSuccess;

        const testEnv = { ...env };
        testEnv.x = { type: 'float', value: 1.5 };
        testEnv.y = { type: 'float', value: 2.5 };

        const evaluator = new Evaluator(testEnv, bCase.expr, new BudgetTracker(DEFAULT_INVOKED_FUEL));

        // 1. Benchmark AST Walker
        const t0 = performance.now();
        for (let i = 0; i < N; i++) {
          evaluator.evaluate(ast);
        }
        const t1 = performance.now();
        const walkerUs = ((t1 - t0) / N) * 1000;

        // 2. Benchmark Compiled Closure
        const fn = compRes.fn;
        const t2 = performance.now();
        for (let i = 0; i < N * 20; i++) {
          fn(1.5, 2.5);
        }
        const t3 = performance.now();
        const compiledUs = ((t3 - t2) / (N * 20)) * 1000;

        const ratio = walkerUs / compiledUs;
        results.push({ name: bCase.name, walkerUs, compiledUs, ratio });
      }

      console.log('\n--- PERFORMANCE GATE BENCHMARK RESULTS ---');
      for (const r of results) {
        console.log(
          `• ${r.name}:\n  Walker: ${r.walkerUs.toFixed(4)} µs/eval | Compiled: ${r.compiledUs.toFixed(4)} µs/eval | Speedup: ${r.ratio.toFixed(1)}x`
        );
        expect(r.ratio).toBeGreaterThan(20); // Significant speedup across all expressions
      }

      // 3. Measure 40,000 evaluations wall time for 2-variable relation
      const astCircle = parse('x^2 + y^2 - 4');
      const compCircle = compileRelation(astCircle, ['x', 'y'], createInitialEnvironment()) as CompileSuccess;
      const fnCircle = compCircle.fn;

      // Warm up JIT
      for (let i = 0; i < 5_000; i++) {
        fnCircle((i % 200) * 0.05 - 5, Math.floor(i / 200) * 0.05 - 5);
      }

      let minWallTime = Infinity;
      let sum = 0;
      for (let trial = 0; trial < 3; trial++) {
        let trialSum = 0;
        const tGrid0 = performance.now();
        for (let i = 0; i < 40_000; i++) {
          const x = (i % 200) * 0.05 - 5;
          const y = Math.floor(i / 200) * 0.05 - 5;
          trialSum += fnCircle(x, y);
        }
        const tGrid1 = performance.now();
        const wall = tGrid1 - tGrid0;
        if (wall < minWallTime) {
          minWallTime = wall;
          sum = trialSum;
        }
      }

      console.log(`\n• 40,000 evaluations of compiled relation: ${minWallTime.toFixed(3)} ms (sum=${sum.toFixed(1)})`);
      expect(minWallTime).toBeLessThan(10.0); // Well within interactive 60 FPS budget (< 16.6ms)
    });
  });
});
