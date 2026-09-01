import { describe, it, expect } from 'vitest';
import { evaluate } from '../core/evaluator';
import { DescribedValue, ObstructionReason } from '../core/types';

describe('Gate G4: Obstructions & Refusal Quality', () => {
  const obstructionTestCases: {
    reason: ObstructionReason;
    expression: string;
    description: string;
  }[] = [
    {
      reason: 'needs-parameterization',
      expression: '\u222c_S F \u00b7 dS',
      description: 'Surface integral over region without parameterization',
    },
    {
      reason: 'needs-basis',
      expression: '\u2207 f',
      description: 'Gradient of abstract scalar field without coordinate basis',
    },
    {
      reason: 'not-elementary',
      expression: '\u222b e^(-x^2) dx',
      description: 'Gaussian integral with non-elementary antiderivative',
    },
    {
      reason: 'undecidable',
      expression: '\u2200 x \u2208 \u211d, x^2 >= 0',
      description: 'Quantified first-order logic sentence over unbounded real line',
    },
    {
      reason: 'unimplemented-technique',
      expression: '\u222b (sin(x)/x) dx',
      description: 'Sine integral requiring non-elementary Si special function',
    },
    {
      reason: 'requires-proof',
      expression: 'G \u2245 H',
      description: 'Group isomorphism relation requiring constructive bijection proof',
    },
    {
      reason: 'infinite-object',
      expression: '{ x \u2208 \u211d : x > 0 }',
      description: 'Infinite set-builder comprehension over real numbers',
    },
    {
      reason: 'ill-posed',
      expression: 'd//dx (1 / 0)',
      description: 'Differentiation attempted on division by zero fraction',
    },
  ];

  it('verifies all 8 distinct obstruction reasons with full refusal quality structure', () => {
    const testedReasons = new Set<ObstructionReason>();

    for (const testCase of obstructionTestCases) {
      const res = evaluate(testCase.expression);
      expect(res.value.type, `Expression '${testCase.expression}' must return described value`).toBe('described');

      const desc = res.value as DescribedValue;
      expect(desc.obstruction, `Expression '${testCase.expression}' must have obstruction '${testCase.reason}'`).toBe(testCase.reason);
      testedReasons.add(desc.obstruction);

      // Verify Refusal Quality Standard:
      // 1. What the object is (kind & meaning)
      expect(desc.kind, `Refusal must state kind for '${testCase.expression}'`).toBeDefined();
      const meaning = desc.meaningInWords || desc.meaning;
      expect(meaning, `Refusal must explain meaning for '${testCase.expression}'`).toBeTruthy();
      expect(meaning.length).toBeGreaterThan(10);

      // 2. What is needed to evaluate it (requires)
      const requires = Array.isArray(desc.requires) ? desc.requires.join('; ') : desc.requires;
      expect(requires, `Refusal must specify what is needed to evaluate '${testCase.expression}'`).toBeTruthy();
      expect(requires.length).toBeGreaterThan(10);

      // 3. What CAN be done with it (canDo)
      const canDo = Array.isArray(desc.canDo) ? desc.canDo : [desc.canDo];
      expect(canDo.length, `Refusal must list operations supported for '${testCase.expression}'`).toBeGreaterThan(0);
      expect(canDo[0].length).toBeGreaterThan(5);

      // 4. What relates to it (related)
      const related = Array.isArray(desc.related) ? desc.related : (desc.related ? [desc.related] : []);
      expect(related.length, `Refusal must list related concepts for '${testCase.expression}'`).toBeGreaterThan(0);
    }

    // Verify all 8 distinct obstruction reasons are covered
    const expectedAllEight: ObstructionReason[] = [
      'needs-parameterization',
      'needs-basis',
      'not-elementary',
      'undecidable',
      'unimplemented-technique',
      'requires-proof',
      'infinite-object',
      'ill-posed',
    ];

    for (const reason of expectedAllEight) {
      expect(testedReasons.has(reason), `Obstruction reason '${reason}' must be covered and tested`).toBe(true);
    }
  });
});
