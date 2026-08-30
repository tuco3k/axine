import { ASTNode, DerivationValue, Environment, Value } from '../types';
import { Evaluator } from '../evaluator';
import { parse } from '../parser';
import { valueToNumber } from '../numeric/tower';

export class AlgebraicVerifier {
  public static verify(
    derivation: DerivationValue,
    origLhs: ASTNode,
    origRhs: ASTNode,
    varName: string,
    env: Environment
  ): DerivationValue | { type: 'unknown'; reason: any; detail: string } {
    // 1. Verify claimed roots by substituting back into original equation
    const rootsToVerify = derivation.roots.length > 0 ? derivation.roots : (Array.isArray(derivation.result) ? derivation.result : [derivation.result]).filter(v => v && (v.type === 'rational' || v.type === 'float'));
    if (!derivation.specialCase && rootsToVerify.length > 0) {
      for (const root of rootsToVerify) {
        try {
          const testEnv = { ...env, [varName]: root };
          const lhsVal = new Evaluator(testEnv).evaluate(origLhs);
          const rhsVal = new Evaluator(testEnv).evaluate(origRhs);

          if (lhsVal.type === 'rational' && rhsVal.type === 'rational') {
            if (lhsVal.n * rhsVal.d !== rhsVal.n * lhsVal.d) {
              return {
                type: 'unknown',
                reason: 'no-convergence',
                detail: `derivation failed self-verification: root substitution yielded ${lhsVal.n}/${lhsVal.d} != ${rhsVal.n}/${rhsVal.d}`,
              };
            }
          } else {
            const lhsNum = valueToNumber(lhsVal);
            const rhsNum = valueToNumber(rhsVal);
            if (Math.abs(lhsNum - rhsNum) > 1e-12) {
              return {
                type: 'unknown',
                reason: 'no-convergence',
                detail: `derivation failed self-verification: root substitution error |${lhsNum} - ${rhsNum}| > 1e-12`,
              };
            }
          }
        } catch (e: any) {
          return {
            type: 'unknown',
            reason: 'no-convergence',
            detail: `derivation failed self-verification during root substitution: ${e.message}`,
          };
        }
      }
    }

    // 2. Verify identity or no-solution special cases
    if (derivation.specialCase === 'all-real') {
      const samplePoints = [-10, -3.5, 0, 1.25, 7, 25];
      for (const pt of samplePoints) {
        const testEnv = { ...env, [varName]: { type: 'float', value: pt } as Value };
        const lhsNum = valueToNumber(new Evaluator(testEnv).evaluate(origLhs));
        const rhsNum = valueToNumber(new Evaluator(testEnv).evaluate(origRhs));
        if (Math.abs(lhsNum - rhsNum) > 1e-9) {
          return {
            type: 'unknown',
            reason: 'no-convergence',
            detail: 'derivation failed self-verification: claimed identity failed at test point',
          };
        }
      }
    }

    if (derivation.specialCase === 'no-solution') {
      const samplePoints = [-10, -3.5, 0, 1.25, 7, 25];
      let equalCount = 0;
      for (const pt of samplePoints) {
        const testEnv = { ...env, [varName]: { type: 'float', value: pt } as Value };
        const lhsNum = valueToNumber(new Evaluator(testEnv).evaluate(origLhs));
        const rhsNum = valueToNumber(new Evaluator(testEnv).evaluate(origRhs));
        if (Math.abs(lhsNum - rhsNum) < 1e-9) equalCount++;
      }
      if (equalCount > 0) {
        return {
          type: 'unknown',
          reason: 'no-convergence',
          detail: 'derivation failed self-verification: equation claimed no-solution but satisfied at sample point',
        };
      }
    }

    // 3. Consecutive step pair equivalence check at 20 sampled values of x
    const sampleVals = [
      -100, -42.5, -23.1, -12, -7.3, -4, -2.5, -1.2, -0.5, 0.1,
      0.8, 1.5, 2.7, 4.3, 6.9, 11.2, 18.5, 33.7, 55, 100
    ];

    // Extract side condition numbers to avoid singularities
    const excludedPoints = new Set<number>();
    for (const step of derivation.steps) {
      if (step.sideCondition) {
        const match = step.sideCondition.match(/[-+]?[0-9]*\.?[0-9]+/g);
        if (match) {
          match.forEach(m => excludedPoints.add(parseFloat(m)));
        }
      }
    }

    for (let k = 0; k < derivation.steps.length - 1; k++) {
      const s1 = derivation.steps[k];
      const s2 = derivation.steps[k + 1];

      // Parse step equations
      const parts1 = s1.equation.split(' = ');
      const parts2 = s2.equation.split(' = ');
      if (parts1.length !== 2 || parts2.length !== 2) continue;
      if (parts1[0].includes('(') && parts1[0].includes('Identity')) continue;
      if (parts2[0].includes('(') && parts2[0].includes('Identity')) continue;
      if (parts1[1].includes('False') || parts2[1].includes('False')) continue;
      if (parts1[1].includes('±') || parts2[1].includes('±')) continue;
      if (parts1[1].includes('or') || parts2[1].includes('or')) continue;

      try {
        const ast1Lhs = parse(parts1[0]);
        const ast1Rhs = parse(parts1[1]);
        const ast2Lhs = parse(parts2[0]);
        const ast2Rhs = parse(parts2[1]);

        const ratios: number[] = [];
        for (const x of sampleVals) {
          if (excludedPoints.has(x)) continue;
          const testEnv = { ...env, [varName]: { type: 'float', value: x } as Value };
          try {
            const v1L = valueToNumber(new Evaluator(testEnv).evaluate(ast1Lhs));
            const v1R = valueToNumber(new Evaluator(testEnv).evaluate(ast1Rhs));
            const v2L = valueToNumber(new Evaluator(testEnv).evaluate(ast2Lhs));
            const v2R = valueToNumber(new Evaluator(testEnv).evaluate(ast2Rhs));

            const diff1 = v1L - v1R;
            const diff2 = v2L - v2R;

            if (Math.abs(diff1) < 1e-9 && Math.abs(diff2) < 1e-9) {
              continue;
            }

            if (Math.abs(diff1) < 1e-9 || Math.abs(diff2) < 1e-9) {
              return {
                type: 'unknown',
                reason: 'no-convergence',
                detail: `derivation failed self-verification: step '${s1.equation}' and '${s2.equation}' have mismatched roots`,
              };
            }

            ratios.push(diff2 / diff1);
          } catch {
            // Ignore points outside evaluation domain
          }
        }

        if (ratios.length < 5) {
          continue;
        }

        // Check if all ratios are equal to the first ratio within tolerance
        const firstRatio = ratios[0];
        const allMatch = ratios.every(r => Math.abs(r - firstRatio) < 1e-5);
        if (!allMatch) {
          return {
            type: 'unknown',
            reason: 'no-convergence',
            detail: `derivation failed self-verification: consecutive steps '${s1.equation}' and '${s2.equation}' are not algebraically equivalent across sample points`,
          };
        }
      } catch {
        // If step format is not directly expression-parsable (e.g. ± roots notation), skip spot check
      }
    }

    return derivation;
  }

  /**
   * Verify a simplification derivation by checking that the original and
   * simplified expressions agree at 20 sampled points, skipping any
   * points excluded by side conditions.
   */
  public static verifySimplification(
    derivation: DerivationValue,
    originalAST: ASTNode,
    simplifiedAST: ASTNode,
    varName: string,
    env: Environment
  ): DerivationValue | { type: 'unknown'; reason: any; detail: string } {
    const sampleVals = [
      -100, -42.5, -23.1, -12, -7.3, -4, -2.5, -1.2, -0.5, 0.1,
      0.8, 1.5, 2.7, 4.3, 6.9, 11.2, 18.5, 33.7, 55, 100
    ];

    // Extract excluded points from side conditions
    const excludedPoints = new Set<number>();
    for (const step of derivation.steps) {
      if (step.sideCondition) {
        const match = step.sideCondition.match(/[-+]?[0-9]*\.?[0-9]+/g);
        if (match) {
          match.forEach(m => excludedPoints.add(parseFloat(m)));
        }
      }
    }

    let testedCount = 0;
    for (const x of sampleVals) {
      if (excludedPoints.has(x)) continue;
      const testEnv = { ...env, [varName]: { type: 'float', value: x } as Value };
      try {
        const origVal = valueToNumber(new Evaluator(testEnv).evaluate(originalAST));
        const simpVal = valueToNumber(new Evaluator(testEnv).evaluate(simplifiedAST));

        if (!isFinite(origVal) || !isFinite(simpVal)) continue;

        if (Math.abs(origVal - simpVal) > 1e-12) {
          return {
            type: 'unknown',
            reason: 'no-convergence',
            detail: `derivation failed self-verification: original evaluates to ${origVal} but simplified evaluates to ${simpVal} at ${varName}=${x}`,
          };
        }
        testedCount++;
      } catch {
        // Skip points where evaluation fails (e.g. division by zero)
      }
    }

    if (testedCount < 3) {
      return {
        type: 'unknown',
        reason: 'no-convergence',
        detail: `derivation failed self-verification: could only evaluate at ${testedCount} sample points (need at least 3)`,
      };
    }

    return { ...derivation, verified: true };
  }
}
