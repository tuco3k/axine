import { describe, expect, it } from 'vitest';
import {
  classifyLine,
  hasAssignment,
  hasDigitAdjacentToOperator,
  hasHighMathTokenRatio,
  hasKnownFunctionCall,
  isPrefixOfValidExpression,
} from '../core/classifier';
import { createInitialEnvironment } from '../core/evaluator';

describe('Line Classifier & Discrimination Predicates', () => {
  const env = createInitialEnvironment();

  describe('Named Predicates', () => {
    it('hasAssignment correctly detects :=', () => {
      expect(hasAssignment('x := 5')).toBe(true);
      expect(hasAssignment('f(x) := x^2')).toBe(true);
      expect(hasAssignment('x = 5')).toBe(false);
      expect(hasAssignment('some prose text')).toBe(false);
    });

    it('hasKnownFunctionCall detects function calls without false-positives on prose', () => {
      expect(hasKnownFunctionCall('sin(x)')).toBe(true);
      expect(hasKnownFunctionCall('sum(1/n^2, n in 1..10)')).toBe(true);
      expect(hasKnownFunctionCall('sin 2')).toBe(true);
      expect(hasKnownFunctionCall('Note: the sum diverges')).toBe(false);
      expect(hasKnownFunctionCall('roughly 3 or 4 iterations')).toBe(false);
    });

    it('hasDigitAdjacentToOperator detects digits touching math operators', () => {
      expect(hasDigitAdjacentToOperator('3 +')).toBe(true);
      expect(hasDigitAdjacentToOperator('2*')).toBe(true);
      expect(hasDigitAdjacentToOperator('2 ++ 3')).toBe(true);
      expect(hasDigitAdjacentToOperator('3 + * 4')).toBe(true);
      expect(hasDigitAdjacentToOperator('roughly 3 or 4 iterations')).toBe(false);
      expect(hasDigitAdjacentToOperator('Now let us check Collatz for 27')).toBe(false);
    });

    it('hasHighMathTokenRatio calculates non-space math token density', () => {
      expect(hasHighMathTokenRatio('1 + 2 * (3 / 4)')).toBe(true);
      expect(hasHighMathTokenRatio('x + y * z - 1')).toBe(true);
      expect(hasHighMathTokenRatio('Now let us check Collatz for 27')).toBe(false);
      expect(hasHighMathTokenRatio('This is an explanatory text paragraph.')).toBe(false);
    });

    it('isPrefixOfValidExpression identifies incomplete prefixes', () => {
      expect(isPrefixOfValidExpression('x := ')).toBe(true);
      expect(isPrefixOfValidExpression('sum(1/n^2,')).toBe(true);
      expect(isPrefixOfValidExpression('2 +')).toBe(true);
      expect(isPrefixOfValidExpression('((1 + 2)')).toBe(true);
      expect(isPrefixOfValidExpression('f(x) := ')).toBe(true);
      expect(isPrefixOfValidExpression('2 ++ 3')).toBe(false);
      expect(isPrefixOfValidExpression('3 + * 4')).toBe(false);
    });
  });

  describe('Prompt Explicit Test Cases', () => {
    it('"Now let\'s check Collatz for 27" -> PROSE', () => {
      expect(classifyLine("Now let's check Collatz for 27", env).state).toBe('PROSE');
    });

    it('"Note: the sum diverges" -> PROSE', () => {
      expect(classifyLine('Note: the sum diverges', env).state).toBe('PROSE');
    });

    it('"roughly 3 or 4 iterations" -> PROSE', () => {
      expect(classifyLine('roughly 3 or 4 iterations', env).state).toBe('PROSE');
    });

    it('"x := " -> INCOMPLETE', () => {
      expect(classifyLine('x := ', env).state).toBe('INCOMPLETE');
    });

    it('"sum(1/n^2," -> INCOMPLETE', () => {
      expect(classifyLine('sum(1/n^2,', env).state).toBe('INCOMPLETE');
    });

    it('"2 +" -> INCOMPLETE', () => {
      expect(classifyLine('2 +', env).state).toBe('INCOMPLETE');
    });

    it('"((1 + 2)" -> INCOMPLETE', () => {
      expect(classifyLine('((1 + 2)', env).state).toBe('INCOMPLETE');
    });

    it('"2 ++ 3" -> ERROR', () => {
      expect(classifyLine('2 ++ 3', env).state).toBe('ERROR');
    });

    it('"velocty * 2" -> ERROR (undeclared identifier)', () => {
      expect(classifyLine('velocty * 2', env).state).toBe('ERROR');
    });

    it('"f(x) := " -> INCOMPLETE', () => {
      expect(classifyLine('f(x) := ', env).state).toBe('INCOMPLETE');
    });

    it('"3 + * 4" -> ERROR', () => {
      expect(classifyLine('3 + * 4', env).state).toBe('ERROR');
    });
  });

  describe('Valid Math and Definitions', () => {
    it('parses valid math expressions as MATH', () => {
      expect(classifyLine('2 + 2', env).state).toBe('MATH');
      expect(classifyLine('sin(pi / 2)', env).state).toBe('MATH');
      expect(classifyLine('1/3 + 1/3 + 1/3', env).state).toBe('MATH');
    });

    it('parses valid assignments as DEFINITION', () => {
      const res = classifyLine('x := 10', env);
      expect(res.state).toBe('DEFINITION');
      expect(res.boundName).toBe('x');
    });

    it('parses valid function defs as DEFINITION', () => {
      const res = classifyLine('f(x) := x^2 + 1', env);
      expect(res.state).toBe('DEFINITION');
      expect(res.boundName).toBe('f');
    });
  });
});
