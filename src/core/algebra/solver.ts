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
        steps: [{
          before: origEq,
          after: `${varName} = ${k.toString()}`,
          rule: 'collect',
          justification: 'Equation is solved for ' + varName,
          equation: `${varName} = ${k.toString()}`,
        }],
        result: [{ type: 'rational', n: k.n, d: k.d }],
        roots: [{ type: 'rational', n: k.n, d: k.d }],
        verified: true,
      };
    }

    if (exp % 2 === 0) {
      // Even power
      if (k.n < 0n) {
        return {
          type: 'unknown',
          reason: 'requires-unavailable-theory',
          detail: `even power ${varName}^${exp} = ${k.toString()} of negative number requires complex numbers (C); try solve(f, near: x0)`,
        };
      }

      if (k.n === 0n) {
        const branches = [
          {
            condition: `${varName} = 0 (coincident)`,
            steps: [{
              before: origEq,
              after: `${varName} = 0`,
              rule: 'take-root' as const,
              operand: `^(1/${exp})`,
              target: 'both-sides',
              justification: 'Coincident root branch',
              equation: `${varName} = 0`,
            }],
            result: { type: 'rational' as const, n: 0n, d: 1n },
          },
        ];
        steps.push({
          before: origEq,
          after: `${varName} = 0`,
          rule: 'take-root',
          operand: `^(1/${exp})`,
          target: 'both-sides',
          justification: `Take ${exp === 2 ? 'square' : `${exp}th`} root of both sides (branches coincide at ${varName} = 0)`,
          branches,
          equation: `${varName} = 0`,
        });
        return {
          type: 'derivation',
          targetVar: varName,
          originalEquation: origEq,
          steps,
          result: [{ type: 'rational', n: 0n, d: 1n }],
          roots: [{ type: 'rational', n: 0n, d: 1n }],
          verified: true,
        };
      }

      const rootNum = Math.pow(k.toNumber(), 1 / exp);
      const isExactInt = Number.isInteger(rootNum) && BigInt(Math.round(rootNum)) ** BigInt(exp) === k.n && k.d === 1n;
      const rootInt = isExactInt ? BigInt(Math.round(rootNum)) : null;

      if (rootInt !== null) {
        const branches = [
          {
            condition: `${varName} >= 0`,
            steps: [{
              before: origEq,
              after: `${varName} = ${rootInt.toString()}`,
              rule: 'take-root' as const,
              operand: `^(1/${exp})`,
              target: 'both-sides',
              justification: 'Positive root branch',
              equation: `${varName} = ${rootInt.toString()}`,
            }],
            result: { type: 'rational' as const, n: rootInt, d: 1n },
          },
          {
            condition: `${varName} < 0`,
            steps: [{
              before: origEq,
              after: `${varName} = -${rootInt.toString()}`,
              rule: 'take-root' as const,
              operand: `^(1/${exp})`,
              target: 'both-sides',
              justification: 'Negative root branch',
              equation: `${varName} = -${rootInt.toString()}`,
            }],
            result: { type: 'rational' as const, n: -rootInt, d: 1n },
          },
        ];

        const justification = exp === 2
          ? 'Take square root of both sides (branches into positive and negative cases)'
          : `Take ${exp}th root of both sides (2 real roots ±${rootInt.toString()}; ${exp - 2} complex roots unrepresented)`;

        steps.push({
          before: origEq,
          after: `${varName} = ${rootInt.toString()} or ${varName} = -${rootInt.toString()}`,
          rule: 'take-root',
          operand: `^(1/${exp})`,
          target: 'both-sides',
          justification,
          sideCondition: 'even power splits into positive and negative branches',
          branches,
          equation: `${varName} = ±${rootInt.toString()}`,
        });

        const roots: Value[] = [
          { type: 'rational', n: -rootInt, d: 1n },
          { type: 'rational', n: rootInt, d: 1n },
        ];

        return {
          type: 'derivation',
          targetVar: varName,
          originalEquation: origEq,
          steps,
          result: roots,
          roots,
          verified: true,
        };
      }

      const branches = [
        {
          condition: `${varName} >= 0`,
          steps: [{
            before: origEq,
            after: `${varName} = √${k.toString()}`,
            rule: 'take-root' as const,
            operand: `^(1/${exp})`,
            target: 'both-sides',
            justification: 'Positive root branch',
            equation: `${varName} = √${k.toString()}`,
          }],
          result: { type: 'float' as const, value: rootNum },
        },
        {
          condition: `${varName} < 0`,
          steps: [{
            before: origEq,
            after: `${varName} = -√${k.toString()}`,
            rule: 'take-root' as const,
            operand: `^(1/${exp})`,
            target: 'both-sides',
            justification: 'Negative root branch',
            equation: `${varName} = -√${k.toString()}`,
          }],
          result: { type: 'float' as const, value: -rootNum },
        },
      ];

      const justification = exp === 2
        ? 'Take square root of both sides (branches into positive and negative cases)'
        : `Take ${exp}th root of both sides (2 real roots ±√${k.toString()}; ${exp - 2} complex roots unrepresented)`;

      steps.push({
        before: origEq,
        after: `${varName} = √${k.toString()} or ${varName} = -√${k.toString()}`,
        rule: 'take-root',
        operand: `^(1/${exp})`,
        target: 'both-sides',
        justification,
        sideCondition: 'even power splits into positive and negative branches',
        branches,
        equation: `${varName} = ±√${k.toString()}`,
      });

      const roots: Value[] = [
        { type: 'float', value: -rootNum, notice: `approximate root -√${k.toString()}` },
        { type: 'float', value: rootNum, notice: `approximate root √${k.toString()}` },
      ];

      return {
        type: 'derivation',
        targetVar: varName,
        originalEquation: origEq,
        steps,
        result: roots,
        roots,
        verified: true,
      };
    } else {
      // Odd power
      const rootNum = Math.cbrt ? (exp === 3 ? Math.cbrt(k.toNumber()) : Math.pow(Math.abs(k.toNumber()), 1 / exp) * Math.sign(k.toNumber())) : Math.pow(k.toNumber(), 1 / exp);
      const isExactInt = Number.isInteger(rootNum) && BigInt(Math.round(rootNum)) ** BigInt(exp) === k.n && k.d === 1n;
      const rootInt = isExactInt ? BigInt(Math.round(rootNum)) : null;

      if (rootInt !== null) {
        steps.push({
          before: origEq,
          after: `${varName} = ${rootInt.toString()}`,
          rule: 'take-root',
          operand: `^(1/${exp})`,
          target: 'both-sides',
          justification: `Take ${exp === 3 ? 'cube' : `${exp}th`} root of both sides (1 real root; ${exp - 1} complex roots unrepresented)`,
          equation: `${varName} = ${rootInt.toString()}`,
        });
        const roots: Value[] = [{ type: 'rational', n: rootInt, d: 1n }];
        return {
          type: 'derivation',
          targetVar: varName,
          originalEquation: origEq,
          steps,
          result: roots,
          roots,
          verified: true,
        };
      }

      steps.push({
        before: origEq,
        after: `${varName} = ${rootNum.toFixed(6)}`,
        rule: 'take-root',
        operand: `^(1/${exp})`,
        target: 'both-sides',
        justification: `Take ${exp === 3 ? 'cube' : `${exp}th`} root of both sides (real root; ${exp - 1} complex roots unrepresented)`,
        equation: `${varName} = ${rootNum.toFixed(6)}`,
      });
      const roots: Value[] = [{ type: 'float', value: rootNum, notice: `approximate ${exp}th root` }];
      return {
        type: 'derivation',
        targetVar: varName,
        originalEquation: origEq,
        steps,
        result: roots,
        roots,
        verified: true,
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
      sideCondition = `valid since ${denLhsConst.toString()} != 0 (≠ 0)`;
    } else {
      sideCondition = `${formatAST(prop.lhsDen)} != 0 (≠ 0, excluded from domain)`;
    }

    const crossEq = `${formatAST(lhsCross)} = ${formatAST(rhsCross)}`;
    steps.push({
      before: origEq,
      after: crossEq,
      equation: crossEq,
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
      verified: true,
    };
  }

  public static solveLinear(lhs: ASTNode, rhs: ASTNode, varName: string, env: Environment): DerivationValue | { type: 'unknown'; reason: any; detail: string } {
    const steps: DerivationStep[] = [];
    const origEq = `${formatAST(lhs)} = ${formatAST(rhs)}`;
    let currEq = origEq;

    // Step 1: Distribute if parentheses exist
    const hasParenLhs = this.hasParens(lhs);
    const hasParenRhs = this.hasParens(rhs);

    if (hasParenLhs || hasParenRhs) {
      const polyLhs = AlgebraicClassifier.toPolynomial(lhs, varName, env);
      const polyRhs = AlgebraicClassifier.toPolynomial(rhs, varName, env);
      const lhsStr = this.formatPoly(polyLhs, varName);
      const rhsStr = this.formatPoly(polyRhs, varName);
      const nextEq = `${lhsStr} = ${rhsStr}`;
      steps.push({
        before: currEq,
        after: nextEq,
        equation: nextEq,
        rule: 'distribute',
        justification: 'Distribute multiplication across parentheses',
      });
      currEq = nextEq;
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
      const nextEq = `${lhsAfterVarMove} = ${rhsAfterVarMove}`;
      steps.push({
        before: currEq,
        after: nextEq,
        equation: nextEq,
        rule: a2.n > 0n ? 'subtract-both-sides' : 'add-both-sides',
        operand: `${a2.abs().toString()}${varName}`,
        target: 'both-sides',
        justification: `${a2.n > 0n ? 'Subtract' : 'Add'} ${a2.abs().toString()}${varName} ${a2.n > 0n ? 'from' : 'to'} both sides`,
      });
      currEq = nextEq;
    }

    // Step 3: Move constant terms to RHS (subtract b1)
    if (b1.n !== 0n) {
      const lhsAfterConstMove = netA.equals(BigFraction.fromInt(1)) ? varName : (netA.equals(BigFraction.fromInt(-1)) ? `-${varName}` : `${netA.toString()}${varName}`);
      const rhsAfterConstMove = netB.toString();
      const nextEq = `${lhsAfterConstMove} = ${rhsAfterConstMove}`;
      steps.push({
        before: currEq,
        after: nextEq,
        equation: nextEq,
        rule: b1.n > 0n ? 'subtract-both-sides' : 'add-both-sides',
        operand: b1.abs().toString(),
        target: 'both-sides',
        justification: `${b1.n > 0n ? 'Subtract' : 'Add'} ${b1.abs().toString()} ${b1.n > 0n ? 'from' : 'to'} both sides`,
      });
      currEq = nextEq;
    }

    // Case A: 0x = 0 (Identity, all real numbers)
    if (netA.n === 0n && netB.n === 0n) {
      steps.push({
        before: currEq,
        after: '0 = 0 (Identity: true for all real x)',
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
        verified: true,
      };
    }

    // Case B: 0x = k (k != 0, No solution)
    if (netA.n === 0n && netB.n !== 0n) {
      steps.push({
        before: currEq,
        after: `0 = ${netB.toString()} (False: no solution)`,
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
        verified: true,
      };
    }

    // Case C: netA * x = netB -> x = netB / netA
    const root = netB.div(netA);
    if (!netA.equals(BigFraction.fromInt(1))) {
      const finalEq = `${varName} = ${root.toString()}`;
      steps.push({
        before: currEq,
        after: finalEq,
        equation: finalEq,
        rule: 'divide-both-sides',
        operand: netA.toString(),
        target: 'both-sides',
        justification: `Divide both sides by ${netA.toString()}`,
        sideCondition: `valid since ${netA.toString()} != 0 (≠ 0)`,
      });
    }

    return {
      type: 'derivation',
      targetVar: varName,
      originalEquation: origEq,
      steps,
      result: [{ type: 'rational', n: root.n, d: root.d }],
      roots: [{ type: 'rational', n: root.n, d: root.d }],
      verified: true,
    };
  }

  public static solveQuadratic(lhs: ASTNode, rhs: ASTNode, varName: string, env: Environment): DerivationValue | { type: 'unknown'; reason: any; detail: string } {
    const steps: DerivationStep[] = [];
    const origEq = `${formatAST(lhs)} = ${formatAST(rhs)}`;
    let currEq = origEq;

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
        before: currEq,
        after: stdEq,
        equation: stdEq,
        rule: 'collect',
        justification: 'Collect all terms on left-hand side in standard quadratic form',
      });
      currEq = stdEq;
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
      const nextEq = `${varName}^2 = ${rhsConst.toString()}`;
      steps.push({
        before: currEq,
        after: nextEq,
        equation: nextEq,
        rule: 'add-both-sides',
        justification: `Isolate ${varName}^2`,
      });
      const powerRes = this.solvePower(varName, 2, rhsConst);
      if (powerRes.type === 'unknown') return powerRes;
      return {
        ...powerRes,
        originalEquation: origEq,
        steps: [...steps, ...powerRes.steps],
      };
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
        const factEq = `${f1Str}${f2Str} = 0`;
        steps.push({
          before: currEq,
          after: factEq,
          equation: factEq,
          rule: 'factor',
          justification: 'Factor quadratic into linear factors',
        });
        currEq = factEq;

        const rootsStr = `${varName} = ${r2.toString()} or ${varName} = ${r1.toString()}`;
        steps.push({
          before: currEq,
          after: rootsStr,
          equation: rootsStr,
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
          result: roots,
          roots,
          verified: true,
        };
      }
    }

    // Case 2: Quadratic formula
    const twoA = BigFraction.fromInt(2).mul(a);
    const dFloatVal = Math.sqrt(D.toNumber());
    const root1Val = (-b.toNumber() + dFloatVal) / twoA.toNumber();
    const root2Val = (-b.toNumber() - dFloatVal) / twoA.toNumber();

    const quadEq = `${varName} = (-(${b.toString()}) ± √(${D.toString()})) / (${twoA.toString()})`;
    steps.push({
      before: currEq,
      after: quadEq,
      equation: quadEq,
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
      result: roots,
      roots,
      verified: true,
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
