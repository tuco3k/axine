import { ASTNode, Environment } from '../types';
import { BigFraction } from '../numeric/rational';
import { EquationClassification, NormalizedPolynomial } from './types';
import { CONSTANTS } from '../parser';

export class AlgebraicClassifier {
  public static classify(
    lhs: ASTNode,
    rhs: ASTNode,
    varName: string,
    env: Environment
  ): EquationClassification {
    // 1. Scan AST for unsupported constructs
    const checkUnsupported = (node: ASTNode, inDenominator: boolean = false): { unsupported: boolean; reason?: string } => {
      switch (node.type) {
        case 'UnaryOp':
          if (node.op === '√') {
            const innerHasVar = this.containsVariable(node.operand, varName);
            if (innerHasVar) {
              return { unsupported: true, reason: 'radical equations containing variable are unsupported; try solve(f, near: x0)' };
            }
          }
          return checkUnsupported(node.operand, inDenominator);
        case 'BinaryOp': {
          if (node.op === '/') {
            const leftCheck = checkUnsupported(node.left, inDenominator);
            if (leftCheck.unsupported) return leftCheck;
            const rightHasVar = this.containsVariable(node.right, varName);
            if (rightHasVar && inDenominator) {
              return { unsupported: true, reason: 'rational equation where variable appears in multiple denominators; try solve(f, near: x0)' };
            }
            return checkUnsupported(node.right, true);
          }
          if (node.op === '^') {
            const leftHasVar = this.containsVariable(node.left, varName);
            const rightHasVar = this.containsVariable(node.right, varName);
            if (rightHasVar) {
              return { unsupported: true, reason: 'exponential equations with variable in exponent are unsupported; try solve(f, near: x0)' };
            }
            if (leftHasVar) {
              // Check if power is integer
              const expVal = this.tryEvalConstant(node.right, env);
              if (expVal === null || expVal.d !== 1n) {
                return { unsupported: true, reason: 'non-integer powers of variable are unsupported; try solve(f, near: x0)' };
              }
            }
          }
          const leftRes = checkUnsupported(node.left, inDenominator);
          if (leftRes.unsupported) return leftRes;
          return checkUnsupported(node.right, inDenominator);
        }
        case 'FunctionCall': {
          const fn = (node as any).callee || (node as any).name;
          const hasVar = node.args.some(arg => this.containsVariable(arg, varName));
          if (hasVar) {
            return {
              unsupported: true,
              reason: `symbolic function application '${fn}' is unsupported; try solve(f, near: x0)`,
            };
          }
          return { unsupported: false };
        }
        default:
          return { unsupported: false };
      }
    };

    const lhsCheck = checkUnsupported(lhs);
    if (lhsCheck.unsupported) return { kind: 'UNSUPPORTED', reason: lhsCheck.reason! };
    const rhsCheck = checkUnsupported(rhs);
    if (rhsCheck.unsupported) return { kind: 'UNSUPPORTED', reason: rhsCheck.reason! };

    const totalVarDens = this.countVariableDenominators(lhs, varName) + this.countVariableDenominators(rhs, varName);
    if (totalVarDens > 1) {
      return { kind: 'UNSUPPORTED', reason: 'rational equations where variable appears in multiple denominators are unsupported; try solve(f, near: x0)' };
    }

    // 2. Check for Pure Power: x^n = k or x = k
    if (lhs.type === 'BinaryOp' && lhs.op === '^' && lhs.left.type === 'Identifier' && lhs.left.name === varName) {
      const expVal = this.tryEvalConstant(lhs.right, env);
      const rhsConst = this.tryEvalConstant(rhs, env);
      if (expVal && expVal.d === 1n && rhsConst) {
        return {
          kind: 'POWER',
          varName,
          exponent: Number(expVal.n),
          constant: rhsConst,
        };
      }
    }

    // 3. Check for Proportions: A/B = C/D or A/B = C
    const isLhsDiv = lhs.type === 'BinaryOp' && lhs.op === '/';
    const isRhsDiv = rhs.type === 'BinaryOp' && rhs.op === '/';
    if (isLhsDiv || isRhsDiv) {
      const countDenVars = (isLhsDiv && this.containsVariable((lhs as any).right, varName) ? 1 : 0) +
                           (isRhsDiv && this.containsVariable((rhs as any).right, varName) ? 1 : 0);
      if (countDenVars > 1) {
        return { kind: 'UNSUPPORTED', reason: 'rational equations where variable appears in multiple denominators are unsupported; try solve(f, near: x0)' };
      }
      if (isLhsDiv && isRhsDiv) {
        return {
          kind: 'PROPORTION',
          varName,
          lhsNum: (lhs as any).left,
          lhsDen: (lhs as any).right,
          rhsNum: (rhs as any).left,
          rhsDen: (rhs as any).right,
        };
      }
      if (isLhsDiv) {
        return {
          kind: 'PROPORTION',
          varName,
          lhsNum: (lhs as any).left,
          lhsDen: (lhs as any).right,
          rhsNum: rhs,
          rhsDen: { type: 'NumberLiteral', raw: '1', span: rhs.span },
        };
      }
    }

    // 4. Polynomial Degree Check: Expand P(x) = LHS - RHS
    try {
      const polyLhs = this.toPolynomial(lhs, varName, env);
      const polyRhs = this.toPolynomial(rhs, varName, env);
      const diffPoly = this.polySub(polyLhs, polyRhs);
      const deg = diffPoly.degree;

      if (deg === 0 || deg === 1) {
        return { kind: 'LINEAR', varName, lhs, rhs };
      }
      if (deg === 2) {
        return { kind: 'QUADRATIC', varName, lhs, rhs };
      }
      return {
        kind: 'UNSUPPORTED',
        reason: `cubics and higher polynomial degrees (degree ${deg}) are unsupported; try solve(f, near: x0)`,
      };
    } catch (err: any) {
      return {
        kind: 'UNSUPPORTED',
        reason: err.message || 'unsupported equation form; try solve(f, near: x0)',
      };
    }
  }

  public static countVariableDenominators(node: ASTNode, varName: string): number {
    let count = 0;
    const walk = (n: ASTNode) => {
      if (n.type === 'BinaryOp') {
        if (n.op === '/' && this.containsVariable(n.right, varName)) {
          count++;
        }
        walk(n.left);
        walk(n.right);
      } else if (n.type === 'UnaryOp' || n.type === 'PostfixOp') {
        walk(n.operand);
      } else if (n.type === 'Tuple' || n.type === 'List') {
        n.elements.forEach(walk);
      } else if (n.type === 'FunctionCall') {
        n.args.forEach(walk);
      }
    };
    walk(node);
    return count;
  }

  public static containsVariable(node: ASTNode, varName: string): boolean {
    if (node.type === 'Identifier' && node.name === varName) return true;
    if (node.type === 'UnaryOp' || node.type === 'PostfixOp') return this.containsVariable(node.operand, varName);
    if (node.type === 'BinaryOp') return this.containsVariable(node.left, varName) || this.containsVariable(node.right, varName);
    if (node.type === 'Tuple' || node.type === 'List') return node.elements.some(e => this.containsVariable(e, varName));
    if (node.type === 'FunctionCall') return node.args.some(a => this.containsVariable(a, varName));
    return false;
  }

  public static tryEvalConstant(node: ASTNode, env: Environment): BigFraction | null {
    if (node.type === 'NumberLiteral') {
      return BigFraction.fromString(node.raw, node.span);
    }
    if (node.type === 'Identifier') {
      if (node.name in env) {
        const val = env[node.name];
        if (val.type === 'rational') return new BigFraction(val.n, val.d);
        if (val.type === 'float') return BigFraction.fromString(val.value.toString());
      }
      if (CONSTANTS.has(node.name)) {
        return null; // Float constant (pi, e)
      }
    }
    if (node.type === 'UnaryOp') {
      const inner = this.tryEvalConstant(node.operand, env);
      if (!inner) return null;
      if (node.op === '-') return inner.neg();
      if (node.op === '+') return inner;
    }
    if (node.type === 'BinaryOp') {
      const left = this.tryEvalConstant(node.left, env);
      const right = this.tryEvalConstant(node.right, env);
      if (!left || !right) return null;
      if (node.op === '+') return left.add(right);
      if (node.op === '-') return left.sub(right);
      if (node.op === '*') return left.mul(right);
      if (node.op === '/') return left.div(right);
      if (node.op === '^' && right.d === 1n) {
        const exp = Number(right.n);
        if (exp >= 0 && exp <= 10) {
          let res = BigFraction.fromInt(1);
          for (let i = 0; i < exp; i++) res = res.mul(left);
          return res;
        }
      }
    }
    return null;
  }

  public static toPolynomial(node: ASTNode, varName: string, env: Environment): NormalizedPolynomial {
    switch (node.type) {
      case 'NumberLiteral': {
        const frac = BigFraction.fromString(node.raw, node.span);
        return { coeffs: [frac], degree: 0 };
      }
      case 'Identifier': {
        if (node.name === varName) {
          return { coeffs: [BigFraction.fromInt(0), BigFraction.fromInt(1)], degree: 1 };
        }
        const constVal = this.tryEvalConstant(node, env);
        if (constVal) return { coeffs: [constVal], degree: 0 };
        throw new Error(`Symbolic variable '${node.name}' is unassigned`);
      }
      case 'UnaryOp': {
        const inner = this.toPolynomial(node.operand, varName, env);
        if (node.op === '+') return inner;
        if (node.op === '-') {
          return {
            coeffs: inner.coeffs.map(c => c.neg()),
            degree: inner.degree,
          };
        }
        throw new Error(`Unary operator '${node.op}' unsupported in polynomial reduction`);
      }
      case 'BinaryOp': {
        const left = this.toPolynomial(node.left, varName, env);
        const right = this.toPolynomial(node.right, varName, env);
        if (node.op === '+') return this.polyAdd(left, right);
        if (node.op === '-') return this.polySub(left, right);
        if (node.op === '*') return this.polyMul(left, right);
        if (node.op === '/') {
          if (right.degree !== 0 || right.coeffs[0].n === 0n) {
            throw new Error('Division by non-constant polynomial');
          }
          const divisor = right.coeffs[0];
          return {
            coeffs: left.coeffs.map(c => c.div(divisor)),
            degree: left.degree,
          };
        }
        if (node.op === '^') {
          if (right.degree !== 0 || right.coeffs[0].d !== 1n || right.coeffs[0].n < 0n) {
            throw new Error('Polynomial exponent must be a non-negative integer');
          }
          const exp = Number(right.coeffs[0].n);
          if (exp === 0) return { coeffs: [BigFraction.fromInt(1)], degree: 0 };
          let res = left;
          for (let i = 1; i < exp; i++) {
            res = this.polyMul(res, left);
          }
          return res;
        }
        throw new Error(`Operator '${node.op}' unsupported in polynomial reduction`);
      }
      default:
        throw new Error(`AST node type '${node.type}' unsupported in polynomial reduction`);
    }
  }

  public static polyAdd(p1: NormalizedPolynomial, p2: NormalizedPolynomial): NormalizedPolynomial {
    const maxLen = Math.max(p1.coeffs.length, p2.coeffs.length);
    const coeffs: BigFraction[] = [];
    for (let i = 0; i < maxLen; i++) {
      const c1 = p1.coeffs[i] ?? BigFraction.fromInt(0);
      const c2 = p2.coeffs[i] ?? BigFraction.fromInt(0);
      coeffs.push(c1.add(c2));
    }
    return this.cleanPoly(coeffs);
  }

  public static polySub(p1: NormalizedPolynomial, p2: NormalizedPolynomial): NormalizedPolynomial {
    const maxLen = Math.max(p1.coeffs.length, p2.coeffs.length);
    const coeffs: BigFraction[] = [];
    for (let i = 0; i < maxLen; i++) {
      const c1 = p1.coeffs[i] ?? BigFraction.fromInt(0);
      const c2 = p2.coeffs[i] ?? BigFraction.fromInt(0);
      coeffs.push(c1.sub(c2));
    }
    return this.cleanPoly(coeffs);
  }

  public static polyMul(p1: NormalizedPolynomial, p2: NormalizedPolynomial): NormalizedPolynomial {
    const len = p1.coeffs.length + p2.coeffs.length - 1;
    const coeffs: BigFraction[] = Array.from({ length: len }, () => BigFraction.fromInt(0));
    for (let i = 0; i < p1.coeffs.length; i++) {
      for (let j = 0; j < p2.coeffs.length; j++) {
        coeffs[i + j] = coeffs[i + j].add(p1.coeffs[i].mul(p2.coeffs[j]));
      }
    }
    return this.cleanPoly(coeffs);
  }

  private static cleanPoly(coeffs: BigFraction[]): NormalizedPolynomial {
    let deg = coeffs.length - 1;
    while (deg > 0 && coeffs[deg].n === 0n) {
      deg--;
    }
    return {
      coeffs: coeffs.slice(0, deg + 1),
      degree: deg,
    };
  }
}
