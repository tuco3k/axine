import { describe, it, expect } from 'vitest';
import { evaluate } from '../core/evaluator';
import { parse } from '../core/parser';
import { compileRelation } from '../core/compiler';
import { realPow } from '../core/operations';
import { ExpressionValue, RationalValue, FloatValue } from '../core/types';

describe('Phase 2 Operation Table & Reduction Model Gate', () => {
  describe('D2 Confirmed: Negative-Base Powers and Odd Roots', () => {
    it('evaluates exact odd roots of negative bases in the Reducer', () => {
      // (-8)^(1/3) = -2
      const res1 = evaluate('(-8)^(1/3)');
      expect(res1.value.type).toBe('rational');
      const r1 = res1.value as RationalValue;
      expect(r1.n).toBe(-2n);
      expect(r1.d).toBe(1n);

      // (-8)^(2/3) = 4
      const res2 = evaluate('(-8)^(2/3)');
      expect(res2.value.type).toBe('rational');
      const r2 = res2.value as RationalValue;
      expect(r2.n).toBe(4n);
      expect(r2.d).toBe(1n);

      // (-27)^(1/3) = -3
      const res3 = evaluate('(-27)^(1/3)');
      expect(res3.value.type).toBe('rational');
      const r3 = res3.value as RationalValue;
      expect(r3.n).toBe(-3n);
      expect(r3.d).toBe(1n);

      // (-32)^(1/5) = -2
      const res4 = evaluate('(-32)^(1/5)');
      expect(res4.value.type).toBe('rational');
      const r4 = res4.value as RationalValue;
      expect(r4.n).toBe(-2n);
      expect(r4.d).toBe(1n);

      // (-8)^(4/3) = 16
      const res5 = evaluate('(-8)^(4/3)');
      expect(res5.value.type).toBe('rational');
      const r5 = res5.value as RationalValue;
      expect(r5.n).toBe(16n);
      expect(r5.d).toBe(1n);
    });

    it('leaves unreducible even roots of negative bases standing unreduced', () => {
      // (-4)^(1/2) has no real root in R -> stands as unreduced expression
      const res = evaluate('(-4)^(1/2)');
      expect(res.value.type).toBe('expression');
      const expr = res.value as ExpressionValue;
      expect(expr.ast.type).toBe('BinaryOp');
    });

    it('evaluates negative-base powers in compiled closures identically to reducer', () => {
      const ast1 = parse('x^(1/3)');
      const comp1 = compileRelation(ast1, ['x']);
      expect(comp1.success).toBe(true);
      if (comp1.success) {
        expect(comp1.fn(-8)).toBeCloseTo(-2, 10);
        expect(comp1.fn(-27)).toBeCloseTo(-3, 10);
        expect(comp1.fn(8)).toBeCloseTo(2, 10);
      }

      const ast2 = parse('x^(2/3)');
      const comp2 = compileRelation(ast2, ['x']);
      expect(comp2.success).toBe(true);
      if (comp2.success) {
        expect(comp2.fn(-8)).toBeCloseTo(4, 10);
      }

      const ast3 = parse('x^(1/5)');
      const comp3 = compileRelation(ast3, ['x']);
      expect(comp3.success).toBe(true);
      if (comp3.success) {
        expect(comp3.fn(-32)).toBeCloseTo(-2, 10);
      }

      const ast4 = parse('x^(1/2)');
      const comp4 = compileRelation(ast4, ['x']);
      expect(comp4.success).toBe(true);
      if (comp4.success) {
        expect(Number.isNaN(comp4.fn(-4))).toBe(true);
      }
    });

    it('realPow operation helper directly handles negative bases and odd roots', () => {
      expect(realPow(-8, 1 / 3)).toBeCloseTo(-2, 10);
      expect(realPow(-8, 2 / 3)).toBeCloseTo(4, 10);
      expect(realPow(-27, 1 / 3)).toBeCloseTo(-3, 10);
      expect(realPow(-32, 1 / 5)).toBeCloseTo(-2, 10);
      expect(Number.isNaN(realPow(-4, 0.5))).toBe(true);
    });
  });

  describe('I2: Compiler-Reducer Equivalence on Deeply Nested Arithmetic (D1)', () => {
    const expressions = [
      '((2 + 3) * (4 - 1) + 6) / 3 - 2^3',
      '(3 * 4 + 5 * 6) / (2 + 4)',
      '2^3^2 - 500',
      '((10 + 20) * (30 - 15)) / ((5 + 5) * 3)',
      '(sin(0) + cos(0)) * (2 + 3)',
    ];

    for (const expr of expressions) {
      it(`evaluates '${expr}' equivalently in Reducer and Compiler`, () => {
        const redRes = evaluate(expr);
        let redVal: number;
        if (redRes.value.type === 'rational') {
          redVal = Number(redRes.value.n) / Number(redRes.value.d);
        } else if (redRes.value.type === 'float') {
          redVal = redRes.value.value;
        } else {
          throw new Error(`Unexpected reducer value type: ${redRes.value.type}`);
        }

        const ast = parse(expr);
        const comp = compileRelation(ast, []);
        expect(comp.success).toBe(true);
        if (comp.success) {
          const compVal = comp.fn();
          expect(compVal).toBeCloseTo(redVal, 10);
        }
      });
    }
  });

  describe('I7: All 27+ Tokenizer Operators Stand Without Throwing', () => {
    const tokenizerOperators = [
      { name: 'contour integral', code: '\u222e_C F \u00b7 dr' },
      { name: 'double integral', code: '\u222c_S F \u00b7 dS' },
      { name: 'triple integral', code: '\u222d_V f dV' },
      { name: 'integral', code: '\u222b e^(-x^2) dx' },
      { name: 'sum', code: '\u03a3(i in 1..n, i)' },
      { name: 'product', code: '\u03a0(i in 1..n, i)' },
      { name: 'gradient', code: '\u2207 f' },
      { name: 'laplacian', code: '\u2207\u00b2 f' },
      { name: 'wedge product', code: 'u \u2227 v' },
      { name: 'hodge star', code: '\u22c6 w' },
      { name: 'tensor product', code: 'u \u2297 v' },
      { name: 'direct sum', code: 'u \u2295 v' },
      { name: 'inner product', code: '\u27e8u, v\u27e9' },
      { name: 'norm', code: '\u2016v\u2016' },
      { name: 'floor', code: '\u230ax\u230b' },
      { name: 'ceil', code: '\u2308x\u2309' },
      { name: 'universal quantifier', code: '\u2200 x \u2208 \u211d, x >= 0' },
      { name: 'existential quantifier', code: '\u2203 x \u2208 \u211d, x > 0' },
      { name: 'uniqueness quantifier', code: '\u2203! x \u2208 \u211d, x = 0' },
      { name: 'element of', code: 'x \u2208 A' },
      { name: 'not element of', code: 'x \u2209 A' },
      { name: 'proper subset', code: 'A \u2282 B' },
      { name: 'subset or equal', code: 'A \u2286 B' },
      { name: 'union', code: 'A \u222a B' },
      { name: 'intersection', code: 'A \u2229 B' },
      { name: 'set minus', code: 'A \u2216 B' },
      { name: 'congruence / equivalence', code: 'a \u2261 b' },
      { name: 'isomorphism', code: 'G \u2245 H' },
      { name: 'homotopy / equivalence', code: 'f \u2243 g' },
      { name: 'similarity', code: 'x \u223c y' },
      { name: 'conjugate transpose / dagger', code: 'A\u2020' },
    ];

    it(`confirms all ${tokenizerOperators.length} operators parse and stand cleanly without error`, () => {
      for (const op of tokenizerOperators) {
        expect(() => {
          const res = evaluate(op.code);
          expect(
            res.value.type,
            `Operator ${op.name} (${op.code}) must stand as unreduced expression`
          ).toBe('expression');
        }).not.toThrow();
      }
    });
  });

  describe('I1: Exact Rational Reduction vs Float Precision', () => {
    it('1/3 evaluates to exact rational { type: rational, n: 1, d: 3 }', () => {
      const res = evaluate('1/3');
      expect(res.value.type).toBe('rational');
      const r = res.value as RationalValue;
      expect(r.n).toBe(1n);
      expect(r.d).toBe(3n);
    });

    it('float(1/3) evaluates to float 0.3333333333333333', () => {
      const res = evaluate('float(1/3)');
      expect(res.value.type).toBe('float');
      const f = res.value as FloatValue;
      expect(f.value).toBeCloseTo(1 / 3, 15);
    });

    it('preserves reduction idempotency: R(R(E)) = R(E)', () => {
      const res1 = evaluate('1/3');
      const r1 = res1.value as RationalValue;
      const res2 = evaluate(`${r1.n}/${r1.d}`);
      expect(res1.value).toEqual(res2.value);
    });
  });
});
