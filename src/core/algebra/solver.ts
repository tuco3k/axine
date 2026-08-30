import { ASTNode, DerivationStep, DerivationValue, Environment, Value } from '../types';
import { BigFraction } from '../numeric/rational';
import { formatAST } from '../formatter';
import { EquationClassification, NormalizedPolynomial } from './types';
import { AlgebraicClassifier } from './classifier';

export class AlgebraicSolver {
  public static solve(
    classification: EquationClassification,
    env: Environment,
    source?: string
  ): DerivationValue | { type: 'unknown'; reason: any; detail: string } {
    if (classification.kind === 'UNSUPPORTED') {
      return {
        type: 'unknown',
        reason: 'requires-unavailable-theory',
        detail: classification.reason,
      };
    }

    switch (classification.kind) {
      case 'POWER':
        return this.solvePower(classification.varName, classification.exponent, classification.constant);
      case 'PROPORTION':
        return this.solveProportion(classification, env, source);
      case 'LINEAR':
        return this.solveLinear(classification.lhs, classification.rhs, classification.varName, env);
      case 'QUADRATIC':
        return this.solveQuadratic(classification.lhs, classification.rhs, classification.varName, env);
    }
  }

  private static solvePower(varName: string, exp: number, k: BigFraction): DerivationValue | { type: 'unknown'; reason: any; detail: string } {
    const steps: DerivationStep[] = [];
    const origEq = `${varName}^${exp} = ${k.toString()}`;

    if (exp === 1) {
      return {
        type: 'derivation',
        targetVar: varName,
        originalEquation: origEq,
        steps: [{ equation: `${varName} = ${k.toString()}`, rule: 'collect', justification: 'Equation is solved for ' + varName }],
        roots: [{ type: 'rational', n: k.n, d: k.d }],
      };
    }

    if (exp % 2 === 0) {
      // Even power
      if (k.n < 0n) {
        return {
          type: 'unknown',
          reason: 'requires-unavailable-theory',
          detail: `No real solution: even power ${varName}^${exp} = ${k.toString()} of negative number requires complex numbers (C)`,
        };
      }

      const rootNum = Math.pow(k.toNumber(), 1 / exp);
      const isExactInt = Number.isInteger(rootNum) && BigInt(Math.round(rootNum)) ** BigInt(exp) === k.n && k.d === 1n;
      const rootInt = isExactInt ? BigInt(Math.round(rootNum)) : null;

      if (rootInt !== null) {
        steps.push({
          equation: `${varName} = ±${rootInt.toString()}`,
          rule: 'take-root',
          justification: `Take ${exp === 2 ? 'square' : `${exp}th`} root of both sides`,
          sideCondition: 'even power produces both positive and negative roots',
        });
        return {
          type: 'derivation',
          targetVar: varName,
          originalEquation: origEq,
          steps,
          roots: [
            { type: 'rational', n: -rootInt, d: 1n },
            { type: 'rational', n: rootInt, d: 1n },
          ],
        };
      }

      steps.push({
        equation: `${varName} = ±√${k.toString()}`,
        rule: 'take-root',
        justification: `Take ${exp === 2 ? 'square' : `${exp}th`} root of both sides`,
        sideCondition: 'even power produces both positive and negative roots',
      });
      return {
        type: 'derivation',
        targetVar: varName,
        originalEquation: origEq,
        steps,
        roots: [
          { type: 'float', value: -rootNum, notice: `approximate root -√${k.toString()}` },
          { type: 'float', value: rootNum, notice: `approximate root √${k.toString()}` },
        ],
      };
    } else {
      // Odd power
      const isNeg = k.n < 0n;
      const absK = isNeg ? k.neg() : k;
      const rootNum = Math.pow(absK.toNumber(), 1 / exp) * (isNeg ? -1 : 1);
      const isExactInt = Number.isInteger(rootNum) && Math.round(rootNum) ** exp === Number(k.n) && k.d === 1n;
      const rootInt = isExactInt ? BigInt(Math.round(rootNum)) : null;

      if (rootInt !== null) {
        steps.push({
          equation: `${varName} = ${rootInt.toString()}`,
          rule: 'take-root',
          justification: `Take ${exp === 3 ? 'cube' : `${exp}th`} root of both sides`,
        });
        return {
          type: 'derivation',
          targetVar: varName,
          originalEquation: origEq,
          steps,
          roots: [{ type: 'rational', n: rootInt, d: 1n }],
        };
      }

      steps.push({
        equation: `${varName} = ${rootNum.toFixed(6)}`,
        rule: 'take-root',
        justification: `Take ${exp === 3 ? 'cube' : `${exp}th`} root of both sides`,
      });
      return {
        type: 'derivation',
        targetVar: varName,
        originalEquation: origEq,
        steps,
        roots: [{ type: 'float', value: rootNum, notice: `approximate ${exp}th root` }],
      };
    }
  }

  private static solveProportion(
    prop: { varName: string; lhsNum: ASTNode; lhsDen: ASTNode; rhsNum: ASTNode; rhsDen: ASTNode },
    env: Environment,
    _source?: string
  ): DerivationValue | { type: 'unknown'; reason: any; detail: string } {
    const steps: DerivationStep[] = [];
    const origEq = `${formatAST(prop.lhsNum)} / ${formatAST(prop.lhsDen)} = ${formatAST(prop.rhsNum)} / ${formatAST(prop.rhsDen)}`;

    // Cross-multiply: lhsNum * rhsDen = rhsNum * lhsDen
    const lhsCross = this.createMulNode(prop.lhsNum, prop.rhsDen);
    const rhsCross = this.createMulNode(prop.rhsNum, prop.lhsDen);

    const denLhsConst = AlgebraicClassifier.tryEvalConstant(prop.lhsDen, env);

    let sideCondition = '';
    if (denLhsConst && denLhsConst.n !== 0n) {
      sideCondition = `valid since ${denLhsConst.toString()} != 0`;
    } else {
      sideCondition = `${formatAST(prop.lhsDen)} != 0 (excluded from domain)`;
    }

    steps.push({
      equation: `${formatAST(lhsCross)} = ${formatAST(rhsCross)}`,
      rule: 'cross-multiply',
      justification: 'Cross-multiply numerators and denominators',
      sideCondition,
    });

    const linearRes = this.solveLinear(lhsCross, rhsCross, prop.varName, env);
    if (linearRes.type === 'unknown') return linearRes;

    return {
      type: 'derivation',
      targetVar: prop.varName,
      originalEquation: origEq,
      steps: [...steps, ...linearRes.steps],
      roots: linearRes.roots,
      specialCase: linearRes.specialCase,
      excludedRoots: linearRes.excludedRoots,
      extraneousRoots: linearRes.extraneousRoots,
    };
  }

  public static solveLinear(lhs: ASTNode, rhs: ASTNode, varName: string, env: Environment): DerivationValue | { type: 'unknown'; reason: any; detail: string } {
    const steps: DerivationStep[] = [];
    const origEq = `${formatAST(lhs)} = ${formatAST(rhs)}`;

    // Step 1: Distribute if parentheses exist
    const hasParenLhs = this.hasParens(lhs);
    const hasParenRhs = this.hasParens(rhs);

    if (hasParenLhs || hasParenRhs) {
      const polyLhs = AlgebraicClassifier.toPolynomial(lhs, varName, env);
      const polyRhs = AlgebraicClassifier.toPolynomial(rhs, varName, env);
      const lhsStr = this.formatPoly(polyLhs, varName);
      const rhsStr = this.formatPoly(polyRhs, varName);
      steps.push({
        equation: `${lhsStr} = ${rhsStr}`,
        rule: 'distribute',
        justification: 'Distribute multiplication across parentheses',
      });
    }

    const polyLhs = AlgebraicClassifier.toPolynomial(lhs, varName, env);
    const polyRhs = AlgebraicClassifier.toPolynomial(rhs, varName, env);

    // LHS = a1*x + b1, RHS = a2*x + b2
    const a1 = polyLhs.coeffs[1] ?? BigFraction.fromInt(0);
    const b1 = polyLhs.coeffs[0] ?? BigFraction.fromInt(0);
    const a2 = polyRhs.coeffs[1] ?? BigFraction.fromInt(0);
    const b2 = polyRhs.coeffs[0] ?? BigFraction.fromInt(0);

    // Step 2: Move variable terms to LHS (subtract a2*x)
    const netA = a1.sub(a2);
    const netB = b2.sub(b1);

    if (a2.n !== 0n) {
      const lhsAfterVarMove = this.formatPoly({ coeffs: [b1, netA], degree: netA.n === 0n ? 0 : 1 }, varName);
      const rhsAfterVarMove = b2.toString();
      steps.push({
        equation: `${lhsAfterVarMove} = ${rhsAfterVarMove}`,
        rule: a2.n > 0n ? 'subtract-both-sides' : 'add-both-sides',
        justification: `${a2.n > 0n ? 'Subtract' : 'Add'} ${a2.abs().toString()}${varName} ${a2.n > 0n ? 'from' : 'to'} both sides`,
      });
    }

    // Step 3: Move constant terms to RHS (subtract b1)
    if (b1.n !== 0n) {
      const lhsAfterConstMove = netA.equals(BigFraction.fromInt(1)) ? varName : (netA.equals(BigFraction.fromInt(-1)) ? `-${varName}` : `${netA.toString()}${varName}`);
      const rhsAfterConstMove = netB.toString();
      steps.push({
        equation: `${lhsAfterConstMove} = ${rhsAfterConstMove}`,
        rule: b1.n > 0n ? 'subtract-both-sides' : 'add-both-sides',
        justification: `${b1.n > 0n ? 'Subtract' : 'Add'} ${b1.abs().toString()} ${b1.n > 0n ? 'from' : 'to'} both sides`,
      });
    }

    // Case A: 0x = 0 (Identity, all real numbers)
    if (netA.n === 0n && netB.n === 0n) {
      steps.push({
        equation: '0 = 0 (Identity: true for all real x)',
        rule: 'collect',
        justification: 'Identity: equation holds for all real numbers',
      });
      return {
        type: 'derivation',
        targetVar: varName,
        originalEquation: origEq,
        steps,
        roots: [],
        specialCase: 'all-real',
      };
    }

    // Case B: 0x = k (k != 0, No solution)
    if (netA.n === 0n && netB.n !== 0n) {
      steps.push({
        equation: `0 = ${netB.toString()} (False: no solution)`,
        rule: 'collect',
        justification: 'Contradiction: equation has no solution',
      });
      return {
        type: 'derivation',
        targetVar: varName,
        originalEquation: origEq,
        steps,
        roots: [],
        specialCase: 'no-solution',
      };
    }

    // Case C: netA * x = netB -> x = netB / netA
    const root = netB.div(netA);
    if (!netA.equals(BigFraction.fromInt(1))) {
      steps.push({
        equation: `${varName} = ${root.toString()}`,
        rule: 'divide-both-sides',
        justification: `Divide both sides by ${netA.toString()}`,
        sideCondition: `valid since ${netA.toString()} != 0`,
      });
    }

    return {
      type: 'derivation',
      targetVar: varName,
      originalEquation: origEq,
      steps,
      roots: [{ type: 'rational', n: root.n, d: root.d }],
    };
  }

  public static solveQuadratic(lhs: ASTNode, rhs: ASTNode, varName: string, env: Environment): DerivationValue | { type: 'unknown'; reason: any; detail: string } {
    const steps: DerivationStep[] = [];
    const origEq = `${formatAST(lhs)} = ${formatAST(rhs)}`;

    const polyLhs = AlgebraicClassifier.toPolynomial(lhs, varName, env);
    const polyRhs = AlgebraicClassifier.toPolynomial(rhs, varName, env);
    const diffPoly = AlgebraicClassifier.polySub(polyLhs, polyRhs);

    // ax^2 + bx + c = 0
    const a = diffPoly.coeffs[2] ?? BigFraction.fromInt(0);
    const b = diffPoly.coeffs[1] ?? BigFraction.fromInt(0);
    const c = diffPoly.coeffs[0] ?? BigFraction.fromInt(0);

    const stdEq = `${this.formatPoly(diffPoly, varName)} = 0`;
    if (origEq !== stdEq) {
      steps.push({
        equation: stdEq,
        rule: 'collect',
        justification: 'Collect all terms on left-hand side in standard quadratic form',
      });
    }

    // Discriminant D = b^2 - 4ac
    const bSq = b.mul(b);
    const fourAC = BigFraction.fromInt(4).mul(a).mul(c);
    const D = bSq.sub(fourAC);

    if (D.n < 0n) {
      return {
        type: 'unknown',
        reason: 'requires-unavailable-theory',
        detail: `No real roots: discriminant b^2 - 4ac = ${D.toString()} < 0 requires complex numbers (C)`,
      };
    }

    // Case 1: Pure quadratic ax^2 + c = 0 (b = 0)
    if (b.n === 0n) {
      const rhsConst = c.neg().div(a);
      steps.push({
        equation: `${varName}^2 = ${rhsConst.toString()}`,
        rule: 'add-both-sides',
        justification: `Isolate ${varName}^2`,
      });
      return this.solvePower(varName, 2, rhsConst);
    }

    // Check if D is a perfect square for factoring
    const dFloat = Math.sqrt(D.toNumber());
    const isSquare = Number.isInteger(dFloat) && BigInt(Math.round(dFloat)) ** 2n === D.n && D.d === 1n;

    if (isSquare) {
      const dInt = BigInt(Math.round(dFloat));
      const twoA = BigFraction.fromInt(2).mul(a);
      const r1 = b.neg().add(new BigFraction(dInt, 1n)).div(twoA);
      const r2 = b.neg().sub(new BigFraction(dInt, 1n)).div(twoA);

      if (a.equals(BigFraction.fromInt(1)) && r1.d === 1n && r2.d === 1n) {
        // (x - r1)(x - r2) = 0
        const f1Str = r1.n >= 0n ? `(${varName} - ${r1.n})` : `(${varName} + ${-r1.n})`;
        const f2Str = r2.n >= 0n ? `(${varName} - ${r2.n})` : `(${varName} + ${-r2.n})`;
        steps.push({
          equation: `${f1Str}${f2Str} = 0`,
          rule: 'factor',
          justification: 'Factor quadratic into linear factors',
        });
        steps.push({
          equation: `${varName} = ${r2.toString()} or ${varName} = ${r1.toString()}`,
          rule: 'collect',
          justification: 'Set each factor to zero to obtain roots',
        });

        const roots: Value[] = r1.equals(r2)
          ? [{ type: 'rational', n: r1.n, d: r1.d }]
          : [
              { type: 'rational', n: Math.min(Number(r1.n), Number(r2.n)) === Number(r1.n) ? r1.n : r2.n, d: 1n },
              { type: 'rational', n: Math.max(Number(r1.n), Number(r2.n)) === Number(r1.n) ? r1.n : r2.n, d: 1n },
            ];

        return {
          type: 'derivation',
          targetVar: varName,
          originalEquation: origEq,
          steps,
          roots,
        };
      }
    }

    // Case 2: Quadratic formula
    const twoA = BigFraction.fromInt(2).mul(a);
    const dFloatVal = Math.sqrt(D.toNumber());
    const root1Val = (-b.toNumber() + dFloatVal) / twoA.toNumber();
    const root2Val = (-b.toNumber() - dFloatVal) / twoA.toNumber();

    steps.push({
      equation: `${varName} = (-(${b.toString()}) ± √(${D.toString()})) / (${twoA.toString()})`,
      rule: 'quadratic-formula',
      justification: 'Apply quadratic formula x = (-b ± √(b² - 4ac)) / (2a)',
    });

    const roots: Value[] = [
      { type: 'float', value: Math.min(root1Val, root2Val), notice: `approximate root (-${b.toString()} - √${D.toString()}) / ${twoA.toString()}` },
      { type: 'float', value: Math.max(root1Val, root2Val), notice: `approximate root (-${b.toString()} + √${D.toString()}) / ${twoA.toString()}` },
    ];

    return {
      type: 'derivation',
      targetVar: varName,
      originalEquation: origEq,
      steps,
      roots,
    };
  }

  private static formatPoly(poly: NormalizedPolynomial, varName: string): string {
    const terms: string[] = [];
    for (let deg = poly.coeffs.length - 1; deg >= 0; deg--) {
      const c = poly.coeffs[deg];
      if (!c || c.n === 0n) continue;
      let term = '';
      if (deg === 0) {
        term = c.toString();
      } else if (deg === 1) {
        term = c.equals(BigFraction.fromInt(1)) ? varName : (c.equals(BigFraction.fromInt(-1)) ? `-${varName}` : `${c.toString()}${varName}`);
      } else {
        term = c.equals(BigFraction.fromInt(1)) ? `${varName}^${deg}` : (c.equals(BigFraction.fromInt(-1)) ? `-${varName}^${deg}` : `${c.toString()}${varName}^${deg}`);
      }
      terms.push(term);
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

  private static hasParens(node: ASTNode): boolean {
    if (node.type === 'BinaryOp') {
      if (node.op === '*' && (node.left.type === 'BinaryOp' || node.right.type === 'BinaryOp')) {
        return true;
      }
      return this.hasParens(node.left) || this.hasParens(node.right);
    }
    if (node.type === 'UnaryOp') return this.hasParens(node.operand);
    return false;
  }

  private static createMulNode(left: ASTNode, right: ASTNode): ASTNode {
    return {
      type: 'BinaryOp',
      op: '*',
      left,
      right,
      span: { start: left.span.start, end: right.span.end, line: left.span.line, col: left.span.col },
    };
  }
}
