import { describe, it, expect } from 'vitest';
import { evaluate } from '../core/evaluator';

describe('Reduction Model: Mathematical Expressions Stand Unreduced', () => {
  const reductionTestCases = [
    { expression: '\u222c_S F \u00b7 dS', expectedType: 'RegionIntegral' },
    { expression: '\u2207 f', expectedType: 'NablaOp' },
    { expression: '\u222b e^(-x^2) dx', expectedType: 'BigOp' },
    { expression: '\u2200 x \u2208 \u211d, x^2 >= 0', expectedType: 'Quantifier' },
    { expression: '\u222b (sin(x)/x) dx', expectedType: 'BigOp' },
    { expression: 'G \u2245 H', expectedType: 'Equivalence' },
    { expression: '{ x \u2208 \u211d : x > 0 }', expectedType: 'SetBuilder' },
  ];

  it('unreduced expressions evaluate to themselves without throwing or fabricating obstructions', () => {
    for (const testCase of reductionTestCases) {
      const res = evaluate(testCase.expression);
      expect(res.value.type, `Expression '${testCase.expression}' must stand as expression`).toBe('expression');
      expect((res.value as any).ast.type).toBe(testCase.expectedType);
    }
  });

  it('mathematical facts survive (1/0 is undefined / unreduced ill-posed fraction)', () => {
    const res = evaluate('d//dx (1 / 0)');
    expect(res.value.type).toBe('expression');
  });
});

