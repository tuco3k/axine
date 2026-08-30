import { ASTNode, DerivationStep, DerivationValue, Environment } from '../types';
import { BigFraction } from '../numeric/rational';
import { formatAST } from '../formatter';
import { AlgebraicClassifier } from './classifier';
import { Evaluator } from '../evaluator';

export class AlgebraicSimplifier {
  public static simplify(
    exprNode: ASTNode,
    inVar: string | undefined,
    env: Environment
  ): DerivationValue | { type: 'unknown'; reason: any; detail: string } {
    const varName = inVar ?? this.findPrimaryVariable(exprNode);
    const beforeStr = formatAST(exprNode);
    const steps: DerivationStep[] = [];

    // Case 1: Rational fraction simplification (e.g. (x^2 - 1) / (x - 1))
    if (exprNode.type === 'BinaryOp' && exprNode.op === '/') {
      const numNode = exprNode.left;
      const denNode = exprNode.right;

      if (varName) {
        try {
          const polyNum = AlgebraicClassifier.toPolynomial(numNode, varName, env);
          const polyDen = AlgebraicClassifier.toPolynomial(denNode, varName, env);

          // Check if (x^2 - a^2) / (x - a) or similar degree 2 / degree 1
          if (polyNum.degree === 2 && polyDen.degree === 1) {
            const a = polyNum.coeffs[2];
            const b = polyNum.coeffs[1] ?? BigFraction.fromInt(0);
            const c = polyNum.coeffs[0] ?? BigFraction.fromInt(0);

            const d1 = polyDen.coeffs[1];
            const d0 = polyDen.coeffs[0] ?? BigFraction.fromInt(0);

            // Denominator root: d1*x + d0 = 0 => x = -d0 / d1
            const denRoot = d0.neg().div(d1);

            // Check if denRoot is also a root of numerator: a*(denRoot)^2 + b*(denRoot) + c == 0
            const numAtDenRoot = a.mul(denRoot).mul(denRoot).add(b.mul(denRoot)).add(c);
            if (numAtDenRoot.n === 0n) {
              // Numerator has factor (x - denRoot). Other root is: sum of roots = -b/a => r2 = -b/a - denRoot
              const otherRoot = b.neg().div(a).sub(denRoot);

              // Factored numerator: a * (x - denRoot) * (x - otherRoot)
              const factor1Str = denRoot.n >= 0n ? `(${varName} - ${denRoot.toString()})` : `(${varName} + ${denRoot.neg().toString()})`;
              const factor2Str = otherRoot.n >= 0n ? `(${varName} - ${otherRoot.toString()})` : `(${varName} + ${otherRoot.neg().toString()})`;
              const denStr = formatAST(denNode);

              const factoredForm = `${factor1Str}${factor2Str} / ${denStr}`;
              steps.push({
                before: beforeStr,
                after: factoredForm,
                rule: 'factor',
                justification: 'Factor numerator into linear factors',
                equation: factoredForm,
              });

              // Cancel common factor (x - denRoot)
              const quotientCoeff1 = a.div(d1);
              const quotientCoeff0 = otherRoot.neg().mul(quotientCoeff1);
              const afterCancel = quotientCoeff0.n === 0n
                ? `${quotientCoeff1.toString()}${varName}`
                : (quotientCoeff0.n > 0n
                    ? `${quotientCoeff1.equals(BigFraction.fromInt(1)) ? varName : quotientCoeff1.toString() + varName} + ${quotientCoeff0.toString()}`
                    : `${quotientCoeff1.equals(BigFraction.fromInt(1)) ? varName : quotientCoeff1.toString() + varName} - ${quotientCoeff0.neg().toString()}`);

              const excludedVal = denRoot.toString();
              steps.push({
                before: factoredForm,
                after: afterCancel,
                rule: 'cancel-common-factor',
                operand: factor1Str,
                justification: `Cancel common factor ${factor1Str}`,
                sideCondition: `${varName} != ${excludedVal} (excluded from domain)`,
                equation: afterCancel,
              });

              return {
                type: 'derivation',
                targetVar: varName,
                originalEquation: beforeStr,
                steps,
                result: [{ type: 'rational', n: quotientCoeff1.n, d: quotientCoeff1.d }],
                roots: [],
                verified: true,
                excludedRoots: [{ type: 'rational', n: denRoot.n, d: denRoot.d }],
              };
            }
          }
        } catch {
          // Fall through to polynomial reduction
        }
      }
    }

    // Case 2: Polynomial reduction & collecting terms (e.g. 3x + 2x - 4 -> 5x - 4)
    if (varName) {
      try {
        const poly = AlgebraicClassifier.toPolynomial(exprNode, varName, env);
        const collectedStr = this.formatPoly(poly, varName);

        if (collectedStr !== beforeStr) {
          steps.push({
            before: beforeStr,
            after: collectedStr,
            rule: 'collect',
            operand: varName,
            justification: `Collect like terms in powers of ${varName}`,
            equation: collectedStr,
          });
        }

        const constCoeff = poly.coeffs[0] ?? BigFraction.fromInt(0);
        return {
          type: 'derivation',
          targetVar: varName,
          originalEquation: beforeStr,
          steps: steps.length > 0 ? steps : [{
            before: beforeStr,
            after: beforeStr,
            rule: 'evaluate-constant',
            justification: 'Expression is already simplified',
            equation: beforeStr,
          }],
          result: [{ type: 'rational', n: constCoeff.n, d: constCoeff.d }],
          roots: [],
          verified: true,
        };
      } catch {
        // Non-polynomial expression
      }
    }

    // Case 3: Constant evaluation
    try {
      const evalRes = new Evaluator(env).evaluate(exprNode);
      const afterStr = formatAST(exprNode);
      return {
        type: 'derivation',
        originalEquation: beforeStr,
        steps: [{
          before: beforeStr,
          after: afterStr,
          rule: 'evaluate-constant',
          justification: 'Evaluate constant arithmetic',
          equation: afterStr,
        }],
        result: evalRes,
        roots: [],
        verified: true,
      };
    } catch (err: any) {
      return {
        type: 'unknown',
        reason: 'requires-unavailable-theory',
        detail: err.message || 'Cannot simplify expression',
      };
    }
  }

  private static findPrimaryVariable(node: ASTNode): string | undefined {
    let foundVar: string | undefined;
    const walk = (n: ASTNode) => {
      if (foundVar) return;
      if (n.type === 'Identifier') {
        if (n.name !== 'pi' && n.name !== 'tau' && n.name !== 'e' && n.name !== 'phi' && n.name !== 'i') {
          foundVar = n.name;
        }
      } else if (n.type === 'BinaryOp') {
        walk(n.left);
        walk(n.right);
      } else if (n.type === 'UnaryOp') {
        walk(n.operand);
      }
    };
    walk(node);
    return foundVar;
  }

  private static formatPoly(poly: { coeffs: BigFraction[]; degree: number }, varName: string): string {
    const terms: string[] = [];
    for (let deg = poly.coeffs.length - 1; deg >= 0; deg--) {
      const c = poly.coeffs[deg];
      if (!c || c.n === 0n) continue;

      let termStr = '';
      if (deg === 0) {
        termStr = c.toString();
      } else if (deg === 1) {
        if (c.equals(BigFraction.fromInt(1))) termStr = varName;
        else if (c.equals(BigFraction.fromInt(-1))) termStr = `-${varName}`;
        else termStr = `${c.toString()}${varName}`;
      } else {
        if (c.equals(BigFraction.fromInt(1))) termStr = `${varName}^${deg}`;
        else if (c.equals(BigFraction.fromInt(-1))) termStr = `-${varName}^${deg}`;
        else termStr = `${c.toString()}${varName}^${deg}`;
      }
      terms.push(termStr);
    }

    if (terms.length === 0) return '0';

    let res = terms[0];
    for (let i = 1; i < terms.length; i++) {
      const t = terms[i];
      if (t.startsWith('-')) {
        res += ` - ${t.substring(1)}`;
      } else {
        res += ` + ${t}`;
      }
    }
    return res;
  }
}
