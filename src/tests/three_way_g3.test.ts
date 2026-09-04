import { describe, it, expect } from 'vitest';
import { evaluate } from '../core/evaluator';
import { ExpressionValue } from '../core/types';

describe('Reduction Model: Unreduced Standing Expressions', () => {
  const unevaluableExpressions = [
    { expr: '\u222c_S F \u00b7 dS', expectedType: 'RegionIntegral' },
    { expr: '\u222e_C F \u00b7 dr', expectedType: 'RegionIntegral' },
    { expr: '\u222d_V f dV', expectedType: 'RegionIntegral' },
    { expr: '\u222b e^(-x^2) dx', expectedType: 'BigOp' },
    { expr: '\u2207 f', expectedType: 'NablaOp' },
    { expr: '\u2207 \u00b7 F', expectedType: 'NablaOp' },
    { expr: '\u2207 \u00d7 F', expectedType: 'NablaOp' },
    { expr: '\u2207\u00b2 f', expectedType: 'NablaOp' },
    { expr: 'u \u2227 v', expectedType: 'DifferentialFormOp' },
    { expr: '\u22c6 w', expectedType: 'DifferentialFormOp' },
    { expr: 'u \u2297 v', expectedType: 'TensorOp' },
    { expr: 'u \u2295 v', expectedType: 'TensorOp' },
    { expr: '\u2200 x \u2208 \u211d, x^2 >= 0', expectedType: 'Quantifier' },
    { expr: 'G \u2245 H', expectedType: 'Equivalence' },
    { expr: 'P(A | B)', expectedType: 'Probability' },
  ];

  it('evaluates exactly 15 unevaluable expressions to unreduced standing AST nodes', () => {
    expect(unevaluableExpressions.length).toBe(15);

    for (const item of unevaluableExpressions) {
      const { value } = evaluate(item.expr);
      expect(value.type, `Expression '${item.expr}' must produce standing expression`).toBe('expression');

      const exprVal = value as ExpressionValue;
      expect(exprVal.ast, `AST must be populated for '${item.expr}'`).toBeDefined();
      expect(exprVal.ast.type, `AST type must match for '${item.expr}'`).toBe(item.expectedType);
      expect(exprVal.text, `Text formatting must be populated for '${item.expr}'`).toBeTruthy();
    }
  });
});

