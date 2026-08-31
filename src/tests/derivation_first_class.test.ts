import { describe, it, expect } from 'vitest';
import { parse } from '../core/parser';
import { Evaluator, createInitialEnvironment } from '../core/evaluator';
import { solveAlgebraic } from '../core/algebra';
import { AlgebraicVerifier } from '../core/algebra/verifier';
import { AlgebraicSimplifier } from '../core/algebra/simplify';
import { DerivationValue, StepValue, Value } from '../core/types';
import { formatAST } from '../core/formatter';

describe('Part B: Derivations as First-Class Values & Self-Verification', () => {
  it('x^2 = 4 produces TWO branches with roots [2, -2]', () => {
    const env = createInitialEnvironment();
    const ast = parse('isolate(x^2 = 4, for: x)');
    const res = new Evaluator(env).evaluate(ast) as DerivationValue;

    expect(res.type).toBe('derivation');
    expect(res.targetVar).toBe('x');
    expect(res.verified).toBe(true);
    expect(res.roots).toHaveLength(2);

    const rootVals = res.roots.map(r => (r as any).n ? Number((r as any).n) / Number((r as any).d) : (r as any).value);
    expect(rootVals).toContain(2);
    expect(rootVals).toContain(-2);

    // Find the take-root step
    const takeRootStep = res.steps.find(s => s.rule === 'take-root');
    expect(takeRootStep).toBeDefined();
    expect(takeRootStep?.branches).toBeDefined();
    expect(takeRootStep?.branches?.length).toBe(2);
    expect(takeRootStep?.branches?.[0].result).toBeDefined();
    expect(takeRootStep?.branches?.[1].result).toBeDefined();
  });

  it('x^2 = 0 produces coincident single root', () => {
    const env = createInitialEnvironment();
    const ast = parse('isolate(x^2 = 0, for: x)');
    const res = new Evaluator(env).evaluate(ast) as DerivationValue;

    expect(res.type).toBe('derivation');
    expect(res.roots).toHaveLength(1);
    const rootVal = (res.roots[0] as any).n ?? (res.roots[0] as any).value;
    expect(Number(rootVal)).toBe(0);
    const takeRootStep = res.steps.find(s => s.rule === 'take-root');
    expect(takeRootStep?.branches?.length).toBe(1);
  });

  it('x^3 = 27 produces single real root with note', () => {
    const env = createInitialEnvironment();
    const ast = parse('isolate(x^3 = 27, for: x)');
    const res = new Evaluator(env).evaluate(ast) as DerivationValue;

    expect(res.type).toBe('derivation');
    expect(res.roots).toHaveLength(1);
    const rootVal = (res.roots[0] as any).n ?? (res.roots[0] as any).value;
    expect(Number(rootVal)).toBe(3);
    const takeRootStep = res.steps.find(s => s.rule === 'take-root');
    expect(takeRootStep?.justification).toContain('complex');
  });

  it('x^2 = -4 refuses with unknown(requires-unavailable-theory)', () => {
    const env = createInitialEnvironment();
    const ast = parse('isolate(x^2 = -4, for: x)');
    const res = new Evaluator(env).evaluate(ast) as any;

    expect(res.type).toBe('unknown');
    expect(res.reason).toBe('requires-unavailable-theory');
  });

  it('x^4 = 16 produces two real roots [2, -2] and complex roots note', () => {
    const env = createInitialEnvironment();
    const ast = parse('isolate(x^4 = 16, for: x)');
    const res = new Evaluator(env).evaluate(ast) as DerivationValue;

    expect(res.type).toBe('derivation');
    expect(res.roots).toHaveLength(2);
    const rootVals = res.roots.map(r => (r as any).n ? Number((r as any).n) / Number((r as any).d) : (r as any).value);
    expect(rootVals).toContain(2);
    expect(rootVals).toContain(-2);
    const takeRootStep = res.steps.find(s => s.rule === 'take-root');
    expect(takeRootStep?.justification).toContain('complex');
  });

  it('proportion (x + 1)/3 = 4/2 isolates cleanly with side condition', () => {
    const env = createInitialEnvironment();
    const ast = parse('isolate((x + 1)/3 = 4/2, for: x)');
    const res = new Evaluator(env).evaluate(ast) as DerivationValue;

    expect(res.type).toBe('derivation');
    expect(res.roots).toHaveLength(1);
    const rootVal = Number((res.roots[0] as any).n) / Number((res.roots[0] as any).d);
    expect(rootVal).toBe(5);

    const crossMulStep = res.steps.find(s => s.rule === 'cross-multiply');
    expect(crossMulStep).toBeDefined();
    expect(crossMulStep?.sideCondition).toContain('\u2260 0');
  });

  it('linear 2*(x - 3) = 4*x + 1 isolates to -7/2', () => {
    const env = createInitialEnvironment();
    const ast = parse('isolate(2*(x - 3) = 4*x + 1, for: x)');
    const res = new Evaluator(env).evaluate(ast) as DerivationValue;

    expect(res.type).toBe('derivation');
    expect(res.roots).toHaveLength(1);
    expect((res.roots[0] as any).n).toBe(-7n);
    expect((res.roots[0] as any).d).toBe(2n);
  });

  it('self-verification rejects a corrupted step with unknown(no-convergence)', () => {
    const env = createInitialEnvironment();
    const eqAst = parse('x^2 = 4');
    const deriv = solveAlgebraic(eqAst, 'x', env, 'x^2 = 4') as DerivationValue;

    expect(deriv.type).toBe('derivation');
    expect(deriv.verified).toBe(true);

    // Corrupt one step in the derivation
    const corruptedDeriv: DerivationValue = {
      ...deriv,
      steps: [
        ...deriv.steps.slice(0, 1),
        {
          equation: 'x = 999',
          before: 'x^2 = 4',
          after: 'x = 999',
          rule: 'take-root',
          justification: 'Corrupted invalid step',
        },
      ],
      roots: [{ type: 'rational', n: 999n, d: 1n }],
    };

    const verifyResult = AlgebraicVerifier.verify(
      corruptedDeriv,
      (eqAst as any).left,
      (eqAst as any).right,
      'x',
      env
    );

    expect(verifyResult.type).toBe('unknown');
    expect((verifyResult as any).reason).toBe('no-convergence');
    expect((verifyResult as any).detail).toContain('derivation failed self-verification');
  });

  it('rejects out-of-scope classes cleanly with exact unknown reasons', () => {
    const env = createInitialEnvironment();

    // 1. General cubic
    const cubicRes = new Evaluator(env).evaluate(parse('isolate(x^3 - 6*x^2 + 11*x - 6 = 0, for: x)')) as any;
    expect(cubicRes.type).toBe('unknown');
    expect(cubicRes.reason).toBe('requires-unavailable-theory');
    expect(cubicRes.detail).toContain('cubics and higher polynomial degrees');

    // 2. Transcendental (sin x = 1/2)
    const trigRes = new Evaluator(env).evaluate(parse('isolate(sin(x) = 1/2, for: x)')) as any;
    expect(trigRes.type).toBe('unknown');
    expect(trigRes.reason).toBe('requires-unavailable-theory');
    expect(trigRes.detail).toContain("symbolic function application 'sin' is unsupported");

    // 3. Multiple rational denominators (1/x + 1/(x+1) = 2)
    const multDenomRes = new Evaluator(env).evaluate(parse('isolate(1/x + 1/(x+1) = 2, for: x)')) as any;
    expect(multDenomRes.type).toBe('unknown');
    expect(multDenomRes.reason).toBe('requires-unavailable-theory');
    expect(multDenomRes.detail).toContain('rational equations where variable appears in multiple denominators are unsupported');
  });

  it('simplify(3x + 2x - 4, in: x) returns ExpressionValue with text "5x - 4"', () => {
    const env = createInitialEnvironment();
    const ast = parse('simplify(3*x + 2*x - 4, in: x)');
    const res = new Evaluator(env).evaluate(ast) as any;

    expect(res).toBeDefined();
    expect(res.type).toBe('derivation');
    expect(res.verified).toBe(true);

    // Result must be an ExpressionValue, not a rational constant
    expect(res.result).toBeDefined();
    expect(res.result.type).toBe('expression');
    expect(res.result.text).toContain('5');
    expect(res.result.text).toContain('x');
    expect(res.result.text).toContain('4');
  });

  it('simplify(3x + 2x - 4, in: x).result round-trips through parser to AST', () => {
    const env = createInitialEnvironment();
    const ast = parse('simplify(3*x + 2*x - 4, in: x)');
    const res = new Evaluator(env).evaluate(ast) as any;

    expect(res.result).toBeDefined();
    expect(res.result.type).toBe('expression');
    const parsedAST = parse(res.result.text);
    expect(formatAST(parsedAST)).toBe(formatAST(res.result.ast));
  });

  it('simplify(3x + 2x - 4, in: x) satisfies 10-point numerical agreement', () => {
    const env = createInitialEnvironment();
    const ast = parse('simplify(3*x + 2*x - 4, in: x)');
    const res = new Evaluator(env).evaluate(ast) as any;

    const originalAST = parse('3*x + 2*x - 4');
    const simplifiedAST = res.result.ast;
    const sampleXs = [-10, -5, -1, 0, 1, 2, 5, 10, 50, 100];
    for (const xVal of sampleXs) {
      const testEnv = { ...env, x: { type: 'float' as const, value: xVal } };
      const origResult = new Evaluator(testEnv).evaluate(originalAST);
      const simpResult = new Evaluator(testEnv).evaluate(simplifiedAST);
      const origNum = origResult.type === 'rational' ? Number(origResult.n) / Number(origResult.d) : (origResult as any).value;
      const simpNum = simpResult.type === 'rational' ? Number(simpResult.n) / Number(simpResult.d) : (simpResult as any).value;
      expect(Math.abs(origNum - simpNum)).toBeLessThan(1e-10);
    }
  });

  it('simplify((x^2 - 1)/(x - 1), in: x) returns ExpressionValue with domain condition', () => {
    const env = createInitialEnvironment();
    const ast = parse('simplify((x^2 - 1)/(x - 1), in: x)');
    const res = new Evaluator(env).evaluate(ast) as any;

    expect(res).toBeDefined();
    expect(res.type).toBe('derivation');
    expect(res.verified).toBe(true);

    // Result must be an ExpressionValue
    expect(res.result).toBeDefined();
    expect(res.result.type).toBe('expression');

    // Side condition must exclude x = 1
    const cancelStep = res.steps.find((s: any) => s.rule === 'cancel-common-factor');
    expect(cancelStep).toBeDefined();
    expect(cancelStep.sideCondition).toContain('1');
    expect(cancelStep.sideCondition).toContain('excluded');

    // Excluded roots must include 1
    expect(res.excludedRoots).toBeDefined();
    expect(res.excludedRoots.length).toBe(1);
  });

  it('simplify corrupted-step harness rejects bad simplification', () => {
    const env = createInitialEnvironment();
    // Construct a derivation that claims 3x + 2x - 4 simplifies to 7x + 1 (wrong)
    const originalAST = parse('3*x + 2*x - 4');
    const wrongAST = parse('7*x + 1');

    const corruptedDeriv: DerivationValue = {
      type: 'derivation',
      targetVar: 'x',
      originalEquation: '3 * x + 2 * x - 4',
      steps: [{
        before: '3 * x + 2 * x - 4',
        after: '7x + 1',
        rule: 'collect',
        justification: 'Corrupted: wrong coefficients',
        equation: '7x + 1',
      }],
      result: { type: 'expression', ast: wrongAST, text: '7x + 1' },
      roots: [],
      verified: false,
    };

    const verifyResult = AlgebraicVerifier.verifySimplification(
      corruptedDeriv,
      originalAST,
      wrongAST,
      'x',
      env
    );

    expect(verifyResult.type).toBe('unknown');
    expect((verifyResult as any).reason).toBe('no-convergence');
    expect((verifyResult as any).detail).toContain('derivation failed self-verification');
  });

  it('derivation composition d.steps, d.result, and simplify(d.steps[2].after)', () => {
    const env = createInitialEnvironment();
    const eval1 = new Evaluator(env);
    
    // 1. Assign derivation
    const dVal = eval1.evaluate(parse('d := isolate(x^2 - 5*x + 6 = 0, for: x)'));
    expect(dVal.type).toBe('derivation');
    env['d'] = dVal;

    // 2. d.result returns the roots
    const resVal = eval1.evaluate(parse('d.result'), env);
    expect(resVal.type).toBe('list');
    expect((resVal as any).elements.length).toBe(2);

    // 3. d.steps is a list of steps
    const stepsVal = eval1.evaluate(parse('d.steps'), env);
    expect(stepsVal.type).toBe('list');
    expect((stepsVal as any).elements.length).toBeGreaterThanOrEqual(2);

    // 4. d.steps[1] (or d.steps[2]) is a step value
    const step2 = eval1.evaluate(parse('d.steps[1]'), env) as StepValue;
    expect(step2.type).toBe('step');
    expect(step2.rule).toBeDefined();
    expect(step2.after).toBeDefined();

    // 5. Feed step.after into simplify
    env['step2'] = step2;
    const simpRes = eval1.evaluate(parse('simplify(step2.after, in: x)'), env);
    expect(simpRes).toBeDefined();
  });
});
