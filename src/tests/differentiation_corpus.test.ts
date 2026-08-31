/**
 * 40 Differentiation Problems Corpus & 5 Explicit Refusal Verifications
 * (Phase 9 — Gate H1)
 */

import { describe, it, expect } from 'vitest';
import {
  computeSymbolicDerivative,
  computeHigherDerivative,
  computeMixedPartials,
  computeGradient,
  computeDivergence,
  computeCurl,
  differentiateAtPoint
} from '../core/symbolic_diff';

interface TestCase {
  id: number;
  name: string;
  expr: string;
  varName: string;
  domain?: [number, number];
  expectedRules: string[];
  expectedRuleSubstrings?: string[];
  minUsablePoints?: number;
}

describe('Gate H1: 40 Differentiation Problems Corpus', () => {
  const corpus: TestCase[] = [
    // 1-4: Power rules
    {
      id: 1,
      name: 'Power rule positive integer',
      expr: 'x^5',
      varName: 'x',
      expectedRules: ['power-rule']
    },
    {
      id: 2,
      name: 'Power rule negative exponent',
      expr: 'x^(-3)',
      varName: 'x',
      domain: [0.5, 4.0],
      expectedRules: ['power-rule']
    },
    {
      id: 3,
      name: 'Power rule positive rational exponent',
      expr: 'x^(1/2)',
      varName: 'x',
      domain: [0.5, 4.0],
      expectedRules: ['power-rule']
    },
    {
      id: 4,
      name: 'Power rule negative rational exponent',
      expr: 'x^(-2/3)',
      varName: 'x',
      domain: [0.5, 4.0],
      expectedRules: ['power-rule']
    },

    // 5-8: Basic algebraic rules
    {
      id: 5,
      name: 'Identity rule',
      expr: 'x',
      varName: 'x',
      expectedRules: ['identity-rule']
    },
    {
      id: 6,
      name: 'Constant multiple rule',
      expr: '4 * (x^3)',
      varName: 'x',
      expectedRules: ['power-rule', 'constant-multiple-rule']
    },
    {
      id: 7,
      name: 'Sum rule',
      expr: 'x^3 + x^2',
      varName: 'x',
      expectedRules: ['power-rule', 'power-rule', 'sum-rule']
    },
    {
      id: 8,
      name: 'Difference rule',
      expr: 'x^4 - 2 * x',
      varName: 'x',
      expectedRules: ['power-rule', 'identity-rule', 'constant-multiple-rule', 'difference-rule']
    },

    // 9-11: Product rules
    {
      id: 9,
      name: 'Product rule polynomial and trig',
      expr: '(x^2) * sin(x)',
      varName: 'x',
      expectedRules: ['power-rule', 'sin-rule', 'product-rule']
    },
    {
      id: 10,
      name: 'Product rule exponential and trig',
      expr: 'exp(x) * cos(x)',
      varName: 'x',
      expectedRules: ['exp-rule', 'cos-rule', 'product-rule']
    },
    {
      id: 11,
      name: 'Product rule linear and logarithmic',
      expr: 'x * ln(x)',
      varName: 'x',
      domain: [0.5, 5.0],
      expectedRules: ['identity-rule', 'ln-rule', 'product-rule']
    },

    // 12-14: Quotient rules
    {
      id: 12,
      name: 'Quotient rule rational fraction',
      expr: 'x / (x + 1)',
      varName: 'x',
      domain: [0.5, 5.0],
      expectedRules: ['quotient-rule']
    },
    {
      id: 13,
      name: 'Quotient rule sinc function',
      expr: 'sin(x) / x',
      varName: 'x',
      domain: [0.5, 5.0],
      expectedRules: ['quotient-rule']
    },
    {
      id: 14,
      name: 'Quotient rule exponential over power',
      expr: 'exp(x) / (x^2)',
      varName: 'x',
      domain: [0.5, 5.0],
      expectedRules: ['quotient-rule']
    },

    // 15-20: Chain rules (justification names u)
    {
      id: 15,
      name: 'Chain rule power of linear',
      expr: '(3 * x + 2)^5',
      varName: 'x',
      expectedRules: ['chain-rule']
    },
    {
      id: 16,
      name: 'Chain rule sin of quadratic',
      expr: 'sin(x^2)',
      varName: 'x',
      expectedRules: ['sin-rule']
    },
    {
      id: 17,
      name: 'Chain rule cos of linear',
      expr: 'cos(3 * x)',
      varName: 'x',
      expectedRules: ['cos-rule']
    },
    {
      id: 18,
      name: 'Chain rule tan of linear',
      expr: 'tan(2 * x)',
      varName: 'x',
      domain: [-0.6, 0.6],
      expectedRules: ['tan-rule']
    },
    {
      id: 19,
      name: 'Chain rule exponential of linear',
      expr: 'exp(2 * x)',
      varName: 'x',
      expectedRules: ['exp-rule']
    },
    {
      id: 20,
      name: 'Chain rule ln of quadratic',
      expr: 'ln(x^2 + 1)',
      varName: 'x',
      expectedRules: ['ln-rule']
    },

    // 21-26: Trigonometric and inverse trigonometric
    {
      id: 21,
      name: 'Trig sin',
      expr: 'sin(x)',
      varName: 'x',
      expectedRules: ['sin-rule']
    },
    {
      id: 22,
      name: 'Trig cos',
      expr: 'cos(x)',
      varName: 'x',
      expectedRules: ['cos-rule']
    },
    {
      id: 23,
      name: 'Trig tan',
      expr: 'tan(x)',
      varName: 'x',
      domain: [-1.2, 1.2],
      expectedRules: ['tan-rule']
    },
    {
      id: 24,
      name: 'Inverse trig asin',
      expr: 'asin(x)',
      varName: 'x',
      domain: [-0.8, 0.8],
      expectedRules: ['asin-rule']
    },
    {
      id: 25,
      name: 'Inverse trig acos',
      expr: 'acos(x)',
      varName: 'x',
      domain: [-0.8, 0.8],
      expectedRules: ['acos-rule']
    },
    {
      id: 26,
      name: 'Inverse trig atan',
      expr: 'atan(x)',
      varName: 'x',
      expectedRules: ['atan-rule']
    },

    // 27-29: Hyperbolic functions
    {
      id: 27,
      name: 'Hyperbolic sinh',
      expr: 'sinh(x)',
      varName: 'x',
      expectedRules: ['sinh-rule']
    },
    {
      id: 28,
      name: 'Hyperbolic cosh',
      expr: 'cosh(x)',
      varName: 'x',
      expectedRules: ['cosh-rule']
    },
    {
      id: 29,
      name: 'Hyperbolic tanh',
      expr: 'tanh(x)',
      varName: 'x',
      expectedRules: ['tanh-rule']
    },

    // 30-34: Exponential, general base, and logarithmic
    {
      id: 30,
      name: 'Natural exponential',
      expr: 'exp(x)',
      varName: 'x',
      expectedRules: ['exp-rule']
    },
    {
      id: 31,
      name: 'General base exponential',
      expr: '2^x',
      varName: 'x',
      expectedRules: ['general-exponential-rule']
    },
    {
      id: 32,
      name: 'Natural logarithm',
      expr: 'ln(x)',
      varName: 'x',
      domain: [0.5, 5.0],
      expectedRules: ['ln-rule']
    },
    {
      id: 33,
      name: 'General base logarithm',
      expr: 'log(x, 10)',
      varName: 'x',
      domain: [0.5, 5.0],
      expectedRules: ['log-base-rule']
    },
    {
      id: 34,
      name: 'Logarithmic differentiation variable base and exponent',
      expr: 'x^x',
      varName: 'x',
      domain: [0.5, 4.0],
      expectedRules: ['logarithmic-differentiation']
    },

    // 35: Nested chain rule
    {
      id: 35,
      name: 'Nested composite chain rule',
      expr: 'sin(exp(x^2))',
      varName: 'x',
      domain: [-1.2, 1.2],
      expectedRules: ['sin-rule']
    }
  ];

  // Run individual tests for problems 1 to 35
  for (const item of corpus) {
    it(`Problem ${item.id}: ${item.name} (${item.expr})`, () => {
      const res = computeSymbolicDerivative(item.expr, item.varName, item.domain);

      // Verify rule presence
      for (const rule of item.expectedRules) {
        expect(res.ruleSequence).toContain(rule);
      }

      // Assert numeric verification passed
      expect(res.numericVerification.passed).toBe(true);
      expect(res.numericVerification.usablePoints).toBeGreaterThanOrEqual(item.minUsablePoints || 10);
      expect(res.numericVerification.maxError).toBeLessThan(1e-4);
    });
  }

  // 36: Higher order derivative d^2/dx^2
  it('Problem 36: Higher order derivative d^2/dx^2 (x^4)', () => {
    const res = computeHigherDerivative('x^4', 'x', 2);
    expect(res.orders.length).toBe(2);
    expect(res.orders[0].ruleSequence).toContain('power-rule');
    expect(res.orders[1].ruleSequence).toContain('power-rule');
    expect(res.allSteps.length).toBeGreaterThanOrEqual(2);
  });

  // 37: Mixed partials and Clairaut equality check
  it('Problem 37: Mixed partial derivatives with Clairaut check (x^2 * y^3 + 3*x*y)', () => {
    const res = computeMixedPartials('(x^2) * (y^3) + 3 * x * y', 'x', 'y');
    expect(res.clairautVerified).toBe(true);
    expect(res.message).toContain("Clairaut's theorem holds");
  });

  // 38: Gradient vector
  it('Problem 38: Gradient vector grad(x^2 + y^2 + z^2)', () => {
    const res = computeGradient('x^2 + y^2 + z^2', ['x', 'y', 'z']);
    expect(res.gradient.length).toBe(3);
    expect(res.results.every(r => r.numericVerification.passed)).toBe(true);
  });

  // 39: Divergence
  it('Problem 39: Divergence div([x^2, y^2, z^2])', () => {
    const res = computeDivergence(['x^2', 'y^2', 'z^2'], ['x', 'y', 'z']);
    expect(res.terms.length).toBe(3);
  });

  // 40: Curl in 3D
  it('Problem 40: Curl curl([-y, x, 0])', () => {
    const res = computeCurl(['-y', 'x', '0'], ['x', 'y', 'z']);
    expect(res.curl.length).toBe(3);
  });
});

describe('Gate H1: 5 Explicit Differentiation Refusals', () => {
  it('Refusal 1: Differentiating with respect to a variable not present in expression', () => {
    expect(() => {
      computeSymbolicDerivative('y^2 + 1', 'x');
    }).toThrow("Variable 'x' is not present in expression");
  });

  it('Refusal 2: Function with no derivative rule implemented', () => {
    expect(() => {
      computeSymbolicDerivative('gamma(x)', 'x');
    }).toThrow("No derivative rule implemented for function 'gamma'");
  });

  it('Refusal 3: Non-differentiable corner point requested: abs(x) at x = 0', () => {
    expect(() => {
      differentiateAtPoint('abs(x)', 'x', 0);
    }).toThrow("Function 'abs' is non-differentiable at x = 0 (corner point: left derivative -1 != right derivative +1)");
  });

  it('Refusal 4: Vertical tangent / cusp point requested: sqrt(x) at x = 0', () => {
    expect(() => {
      differentiateAtPoint('sqrt(x)', 'x', 0);
    }).toThrow("Function 'sqrt' is non-differentiable at x = 0 (infinite vertical derivative limit)");
  });

  it('Refusal 5: Singularity / division by zero pole requested: 1/x at x = 0', () => {
    expect(() => {
      differentiateAtPoint('1/x', 'x', 0);
    }).toThrow("Expression undefined / non-differentiable at x = 0 (pole / division by zero)");
  });
});
