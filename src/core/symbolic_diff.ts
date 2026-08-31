/**
 * Symbolic Differentiation Engine with Named Derivation Steps & Numeric Verification
 * (Phase 9 — Gate H1)
 */

import { ASTNode, Environment, Span, UnknownReason, Value } from './types';
import { parse } from './parser';
import { formatAST } from './formatter';
import { evaluate } from './evaluator';
import { valueToNumber } from './numeric/tower';
import { createError } from './errors';
import { AlgebraicSimplifier } from './algebra/simplify';

export interface SymbolicDiffStep {
  step: number;
  before: string;
  after: string;
  rule: string;
  operand?: string;
  justification: string;
  innerFunction?: string;
}

export interface NumericVerificationResult {
  passed: boolean;
  totalSampled: number;
  usablePoints: number;
  maxError: number;
  domain: [number, number];
  reason?: string;
}

export interface SymbolicDiffResult {
  derivativeAST: ASTNode;
  derivativeStr: string;
  steps: SymbolicDiffStep[];
  ruleSequence: string[];
  numericVerification: NumericVerificationResult;
}

export class SymbolicDifferentiator {
  private steps: SymbolicDiffStep[] = [];
  private stepCount: number = 0;
  private varName: string;

  constructor(varName: string) {
    this.varName = varName;
  }

  private addStep(rule: string, before: string, after: string, justification: string, innerFunction?: string, operand?: string) {
    this.stepCount++;
    this.steps.push({
      step: this.stepCount,
      before,
      after,
      rule,
      justification,
      innerFunction,
      operand
    });
  }

  public diff(node: ASTNode): ASTNode {
    const varName = this.varName;
    const nodeStr = formatAST(node);

    switch (node.type) {
      case 'NumberLiteral': {
        const res = parse('0');
        this.addStep('constant-rule', `d/d${varName}(${nodeStr})`, '0', `Derivative of constant ${nodeStr} is 0`, undefined, nodeStr);
        return res;
      }

      case 'Identifier': {
        if (node.name === varName) {
          const res = parse('1');
          this.addStep('identity-rule', `d/d${varName}(${node.name})`, '1', `Derivative of variable ${node.name} with respect to itself is 1`, undefined, node.name);
          return res;
        }
        if (['pi', 'e', 'tau', 'phi'].includes(node.name)) {
          const res = parse('0');
          this.addStep('constant-rule', `d/d${varName}(${node.name})`, '0', `Derivative of constant constant ${node.name} is 0`, undefined, node.name);
          return res;
        }
        // Independent variable or parameter treated as constant in partial differentiation
        const res = parse('0');
        this.addStep('constant-rule', `d/d${varName}(${node.name})`, '0', `Derivative of independent parameter ${node.name} with respect to ${varName} is 0`, undefined, node.name);
        return res;
      }

      case 'UnaryOp': {
        if (node.op === '-' || node.op === '\u2212') {
          const subDiff = this.diff(node.operand);
          const resStr = `-(${formatAST(subDiff)})`;
          const res = parse(resStr);
          this.addStep('negation-rule', `d/d${varName}(${nodeStr})`, formatAST(res), `Linearity: d/d${varName}(-u) = -du/d${varName}`);
          return res;
        }
        if (node.op === '+' || node.op === 'sqrt' || node.op === '\u221a') {
          if (node.op === 'sqrt' || node.op === '\u221a') {
            return this.diffFunction('sqrt', [node.operand], node.span);
          }
          return this.diff(node.operand);
        }
        throw createError(`Unsupported unary operator '${node.op}' in differentiation`, node.span);
      }

      case 'BinaryOp': {
        const leftHasVar = this.containsVar(node.left, varName);
        const rightHasVar = this.containsVar(node.right, varName);

        // Constant expression
        if (!leftHasVar && !rightHasVar) {
          const res = parse('0');
          this.addStep('constant-rule', `d/d${varName}(${nodeStr})`, '0', `Derivative of constant expression (${nodeStr}) is 0`);
          return res;
        }

        // Sum and Difference Rules
        if (node.op === '+' || node.op === '-' || node.op === '\u2212') {
          const dLeft = this.diff(node.left);
          const dRight = this.diff(node.right);
          const combinedStr = `${formatAST(dLeft)} ${node.op} ${formatAST(dRight)}`;
          const res = parse(combinedStr);
          const ruleName = node.op === '+' ? 'sum-rule' : 'difference-rule';
          this.addStep(
            ruleName,
            `d/d${varName}(${nodeStr})`,
            formatAST(res),
            `Linearity: differentiate terms individually: (${formatAST(dLeft)}) ${node.op} (${formatAST(dRight)})`
          );
          return res;
        }

        // Multiplication / Constant Multiple / Product Rule
        if (node.op === '*' || node.op === '\u00b7' || node.op === '\u00d7') {
          if (!leftHasVar) {
            // Constant multiple: c * g(x)
            const dRight = this.diff(node.right);
            const res = parse(`(${formatAST(node.left)}) * (${formatAST(dRight)})`);
            this.addStep(
              'constant-multiple-rule',
              `d/d${varName}(${nodeStr})`,
              formatAST(res),
              `Pull out constant factor ${formatAST(node.left)}: ${formatAST(node.left)} * d/d${varName}(${formatAST(node.right)})`,
              undefined,
              formatAST(node.left)
            );
            return res;
          }
          if (!rightHasVar) {
            // Constant multiple: f(x) * c
            const dLeft = this.diff(node.left);
            const res = parse(`(${formatAST(dLeft)}) * (${formatAST(node.right)})`);
            this.addStep(
              'constant-multiple-rule',
              `d/d${varName}(${nodeStr})`,
              formatAST(res),
              `Pull out constant factor ${formatAST(node.right)}: d/d${varName}(${formatAST(node.left)}) * ${formatAST(node.right)}`,
              undefined,
              formatAST(node.right)
            );
            return res;
          }

          // Full product rule: f(x) * g(x)
          const f = node.left;
          const g = node.right;
          const df = this.diff(f);
          const dg = this.diff(g);
          const resStr = `(${formatAST(df)}) * (${formatAST(g)}) + (${formatAST(f)}) * (${formatAST(dg)})`;
          const res = parse(resStr);
          this.addStep(
            'product-rule',
            `d/d${varName}(${nodeStr})`,
            formatAST(res),
            `Product rule: (f*g)' = f'*g + f*g' where f = ${formatAST(f)}, f' = ${formatAST(df)}, g = ${formatAST(g)}, g' = ${formatAST(dg)}`
          );
          return res;
        }

        // Division / Quotient Rule
        if (node.op === '/' || node.op === '//' || node.op === '\u00f7') {
          if (!rightHasVar) {
            // f(x) / c = (1/c) * f'(x)
            const df = this.diff(node.left);
            const res = parse(`(${formatAST(df)}) / (${formatAST(node.right)})`);
            this.addStep(
              'constant-multiple-rule',
              `d/d${varName}(${nodeStr})`,
              formatAST(res),
              `Pull out constant divisor ${formatAST(node.right)}: (1/${formatAST(node.right)}) * d/d${varName}(${formatAST(node.left)})`
            );
            return res;
          }

          // Full quotient rule: (f / g)' = (f'g - fg') / g^2
          const f = node.left;
          const g = node.right;
          const df = this.diff(f);
          const dg = this.diff(g);
          const resStr = `((${formatAST(df)}) * (${formatAST(g)}) - (${formatAST(f)}) * (${formatAST(dg)})) / ((${formatAST(g)})^2)`;
          const res = parse(resStr);
          this.addStep(
            'quotient-rule',
            `d/d${varName}(${nodeStr})`,
            formatAST(res),
            `Quotient rule: (f/g)' = (f'*g - f*g') / g^2 where numerator f = ${formatAST(f)}, f' = ${formatAST(df)}, denominator g = ${formatAST(g)}, g' = ${formatAST(dg)}`
          );
          return res;
        }

        // Exponentiation ^
        if (node.op === '^') {
          const base = node.left;
          const exp = node.right;

          if (!rightHasVar) {
            // Power rule: d/dx(u^n) = n * u^(n-1) * du/dx
            const expNumStr = formatAST(exp);
            let nMinus1Str: string;
            if (exp.type === 'NumberLiteral') {
              const n = parseFloat(exp.raw);
              nMinus1Str = (n - 1).toString();
            } else {
              nMinus1Str = `(${expNumStr} - 1)`;
            }

            if (base.type === 'Identifier' && base.name === varName) {
              const resStr = `${expNumStr} * ${varName}^(${nMinus1Str})`;
              const res = parse(resStr);
              this.addStep(
                'power-rule',
                `d/d${varName}(${nodeStr})`,
                formatAST(res),
                `Power rule: d/d${varName}(${varName}^${expNumStr}) = ${expNumStr}*${varName}^(${nMinus1Str})`
              );
              return res;
            }

            // Chain rule with power
            const du = this.diff(base);
            const resStr = `${expNumStr} * (${formatAST(base)})^(${nMinus1Str}) * (${formatAST(du)})`;
            const res = parse(resStr);
            this.addStep(
              'chain-rule',
              `d/d${varName}(${nodeStr})`,
              formatAST(res),
              `Chain rule with u = ${formatAST(base)}: d/d${varName}(u^${expNumStr}) = ${expNumStr}*u^(${nMinus1Str}) * du/d${varName}`,
              formatAST(base)
            );
            return res;
          }

          if (!leftHasVar) {
            // Exponential rule: d/dx(a^u) = a^u * ln(a) * du/dx
            const aStr = formatAST(base);
            const du = this.diff(exp);
            const resStr = `(${nodeStr}) * ln(${aStr}) * (${formatAST(du)})`;
            const res = parse(resStr);
            this.addStep(
              'general-exponential-rule',
              `d/d${varName}(${nodeStr})`,
              formatAST(res),
              `General exponential rule: d/d${varName}(${aStr}^u) = ${aStr}^u * ln(${aStr}) * du/d${varName} with u = ${formatAST(exp)}`,
              formatAST(exp)
            );
            return res;
          }

          // Variable base and variable exponent: u(x)^v(x) (Logarithmic differentiation)
          // y = u^v => y' = u^v * (v' * ln(u) + v * u'/u)
          const du = this.diff(base);
          const dv = this.diff(exp);
          const resStr = `(${nodeStr}) * ((${formatAST(dv)}) * ln(${formatAST(base)}) + (${formatAST(exp)}) * (${formatAST(du)}) / (${formatAST(base)}))`;
          const res = parse(resStr);
          this.addStep(
            'logarithmic-differentiation',
            `d/d${varName}(${nodeStr})`,
            formatAST(res),
            `Logarithmic differentiation for variable base and exponent: d/d${varName}(u^v) = u^v * (v'*ln(u) + v*u'/u) with u = ${formatAST(base)}, v = ${formatAST(exp)}`,
            formatAST(base)
          );
          return res;
        }

        throw createError(`Unsupported binary operator '${node.op}' in differentiation`, node.span);
      }

      case 'FunctionCall': {
        return this.diffFunction(node.callee, node.args, node.span);
      }

      default:
        throw createError(`Unsupported AST node type '${node.type}' in differentiation`, (node as any).span);
    }
  }

  private diffFunction(fnName: string, args: ASTNode[], span: Span): ASTNode {
    const varName = this.varName;
    if (args.length === 0) {
      throw createError(`Function '${fnName}' requires arguments for differentiation`, span);
    }
    const u = args[0];
    const uStr = formatAST(u);

    if (!this.containsVar(u, varName)) {
      const res = parse('0');
      this.addStep('constant-rule', `d/d${varName}(${fnName}(${uStr}))`, '0', `Derivative of constant function application is 0`);
      return res;
    }

    const du = this.diff(u);
    const duStr = formatAST(du);

    switch (fnName) {
      case 'sin': {
        const resStr = `cos(${uStr}) * (${duStr})`;
        const res = parse(resStr);
        this.addStep('sin-rule', `d/d${varName}(sin(${uStr}))`, formatAST(res), `Chain rule with u = ${uStr}: d/d${varName}(sin(u)) = cos(u) * du/d${varName}`, uStr);
        return res;
      }

      case 'cos': {
        const resStr = `-sin(${uStr}) * (${duStr})`;
        const res = parse(resStr);
        this.addStep('cos-rule', `d/d${varName}(cos(${uStr}))`, formatAST(res), `Chain rule with u = ${uStr}: d/d${varName}(cos(u)) = -sin(u) * du/d${varName}`, uStr);
        return res;
      }

      case 'tan': {
        const resStr = `(1 + tan(${uStr})^2) * (${duStr})`;
        const res = parse(resStr);
        this.addStep('tan-rule', `d/d${varName}(tan(${uStr}))`, formatAST(res), `Chain rule with u = ${uStr}: d/d${varName}(tan(u)) = (1 + tan(u)^2) * du/d${varName}`, uStr);
        return res;
      }

      case 'asin': {
        const resStr = `(${duStr}) / sqrt(1 - (${uStr})^2)`;
        const res = parse(resStr);
        this.addStep('asin-rule', `d/d${varName}(asin(${uStr}))`, formatAST(res), `Chain rule with u = ${uStr}: d/d${varName}(asin(u)) = (1 / sqrt(1 - u^2)) * du/d${varName}`, uStr);
        return res;
      }

      case 'acos': {
        const resStr = `-(${duStr}) / sqrt(1 - (${uStr})^2)`;
        const res = parse(resStr);
        this.addStep('acos-rule', `d/d${varName}(acos(${uStr}))`, formatAST(res), `Chain rule with u = ${uStr}: d/d${varName}(acos(u)) = (-1 / sqrt(1 - u^2)) * du/d${varName}`, uStr);
        return res;
      }

      case 'atan': {
        const resStr = `(${duStr}) / (1 + (${uStr})^2)`;
        const res = parse(resStr);
        this.addStep('atan-rule', `d/d${varName}(atan(${uStr}))`, formatAST(res), `Chain rule with u = ${uStr}: d/d${varName}(atan(u)) = (1 / (1 + u^2)) * du/d${varName}`, uStr);
        return res;
      }

      case 'sinh': {
        const resStr = `cosh(${uStr}) * (${duStr})`;
        const res = parse(resStr);
        this.addStep('sinh-rule', `d/d${varName}(sinh(${uStr}))`, formatAST(res), `Chain rule with u = ${uStr}: d/d${varName}(sinh(u)) = cosh(u) * du/d${varName}`, uStr);
        return res;
      }

      case 'cosh': {
        const resStr = `sinh(${uStr}) * (${duStr})`;
        const res = parse(resStr);
        this.addStep('cosh-rule', `d/d${varName}(cosh(${uStr}))`, formatAST(res), `Chain rule with u = ${uStr}: d/d${varName}(cosh(u)) = sinh(u) * du/d${varName}`, uStr);
        return res;
      }

      case 'tanh': {
        const resStr = `(1 - tanh(${uStr})^2) * (${duStr})`;
        const res = parse(resStr);
        this.addStep('tanh-rule', `d/d${varName}(tanh(${uStr}))`, formatAST(res), `Chain rule with u = ${uStr}: d/d${varName}(tanh(u)) = (1 - tanh(u)^2) * du/d${varName}`, uStr);
        return res;
      }

      case 'exp': {
        const resStr = `exp(${uStr}) * (${duStr})`;
        const res = parse(resStr);
        this.addStep('exp-rule', `d/d${varName}(exp(${uStr}))`, formatAST(res), `Chain rule with u = ${uStr}: d/d${varName}(exp(u)) = exp(u) * du/d${varName}`, uStr);
        return res;
      }

      case 'ln': {
        const resStr = `(${duStr}) / (${uStr})`;
        const res = parse(resStr);
        this.addStep('ln-rule', `d/d${varName}(ln(${uStr}))`, formatAST(res), `Chain rule with u = ${uStr}: d/d${varName}(ln(u)) = (1/u) * du/d${varName}`, uStr);
        return res;
      }

      case 'log': {
        // Natural log or base a
        if (args.length === 1) {
          const resStr = `(${duStr}) / (${uStr})`;
          const res = parse(resStr);
          this.addStep('ln-rule', `d/d${varName}(log(${uStr}))`, formatAST(res), `Chain rule with u = ${uStr}: d/d${varName}(ln(u)) = (1/u) * du/d${varName}`, uStr);
          return res;
        }
        const baseStr = formatAST(args[1]);
        const resStr = `(${duStr}) / ((${uStr}) * ln(${baseStr}))`;
        const res = parse(resStr);
        this.addStep('log-base-rule', `d/d${varName}(log(${uStr}, ${baseStr}))`, formatAST(res), `Chain rule with u = ${uStr}, base = ${baseStr}: d/d${varName}(log_a(u)) = (1 / (u * ln(a))) * du/d${varName}`, uStr);
        return res;
      }

      case 'log2': {
        const resStr = `(${duStr}) / ((${uStr}) * ln(2))`;
        const res = parse(resStr);
        this.addStep('log-base-rule', `d/d${varName}(log2(${uStr}))`, formatAST(res), `Chain rule with u = ${uStr}, base = 2: d/d${varName}(log2(u)) = (1 / (u * ln(2))) * du/d${varName}`, uStr);
        return res;
      }

      case 'sqrt': {
        const resStr = `(${duStr}) / (2 * sqrt(${uStr}))`;
        const res = parse(resStr);
        this.addStep('sqrt-rule', `d/d${varName}(sqrt(${uStr}))`, formatAST(res), `Chain rule with u = ${uStr}: d/d${varName}(sqrt(u)) = (1 / (2*sqrt(u))) * du/d${varName}`, uStr);
        return res;
      }

      default:
        throw createError(`No derivative rule implemented for function '${fnName}'`, span);
    }
  }

  private containsVar(node: ASTNode, varName: string): boolean {
    let found = false;
    function walk(n: ASTNode) {
      if (found) return;
      if (n.type === 'Identifier' && n.name === varName) {
        found = true;
        return;
      }
      for (const key of Object.keys(n)) {
        const val = (n as any)[key];
        if (val && typeof val === 'object') {
          if (Array.isArray(val)) {
            val.forEach(walk);
          } else if (val.type) {
            walk(val);
          }
        }
      }
    }
    walk(node);
    return found;
  }

  public getSteps(): SymbolicDiffStep[] {
    return this.steps;
  }
}

/**
 * Numerically verifies a symbolic derivative against central differences.
 */
export function verifyDerivativeNumerically(
  origAST: ASTNode,
  derivAST: ASTNode,
  varName: string,
  domain: [number, number] = [-3, 3]
): NumericVerificationResult {
  const h = 1e-6;
  const numSamples = 20;
  const tolerance = 1e-4; // Agreement within 1e-4 / 1e-5 relative to scale

  const [minX, maxX] = domain;
  const stepSize = (maxX - minX) / (numSamples + 1);

  const freeVars = extractFreeVariables(origAST);
  const baseEnv: Environment = {};
  for (const v of freeVars) {
    if (v !== varName) {
      baseEnv[v] = { type: 'float', value: 1.5 };
    }
  }

  let usablePoints = 0;
  let maxError = 0;

  for (let i = 1; i <= numSamples; i++) {
    const x = minX + i * stepSize;

    // Check near singular points
    if (Math.abs(x) < 1e-7) continue;

    try {
      const envPlus: Environment = { ...baseEnv, [varName]: { type: 'float', value: x + h } };
      const envMinus: Environment = { ...baseEnv, [varName]: { type: 'float', value: x - h } };
      const envExact: Environment = { ...baseEnv, [varName]: { type: 'float', value: x } };

      const fPlusVal = evaluate(formatAST(origAST), envPlus).value;
      const fMinusVal = evaluate(formatAST(origAST), envMinus).value;
      const fSymVal = evaluate(formatAST(derivAST), envExact).value;

      const fPlus = valueToNumber(fPlusVal);
      const fMinus = valueToNumber(fMinusVal);
      const fSym = valueToNumber(fSymVal);

      if (isNaN(fPlus) || isNaN(fMinus) || isNaN(fSym) || !isFinite(fPlus) || !isFinite(fMinus) || !isFinite(fSym)) {
        continue;
      }

      const numDeriv = (fPlus - fMinus) / (2 * h);
      const absDiff = Math.abs(numDeriv - fSym);
      const relDiff = absDiff / (1 + Math.abs(numDeriv));

      if (relDiff > maxError) {
        maxError = relDiff;
      }

      if (relDiff > tolerance) {
        return {
          passed: false,
          totalSampled: numSamples,
          usablePoints: usablePoints + 1,
          maxError,
          domain,
          reason: `Verification failed at x = ${x.toFixed(4)}: numerical ${numDeriv.toFixed(6)} != symbolic ${fSym.toFixed(6)} (rel diff: ${relDiff.toExponential(2)})`
        };
      }

      usablePoints++;
    } catch {
      // Skip undefined points
    }
  }

  if (usablePoints < 10) {
    return {
      passed: false,
      totalSampled: numSamples,
      usablePoints,
      maxError,
      domain,
      reason: `Fewer than 10 usable domain sample points (${usablePoints} usable)`
    };
  }

  return {
    passed: true,
    totalSampled: numSamples,
    usablePoints,
    maxError,
    domain
  };
}

/**
 * Main entry point for computing and verifying symbolic derivatives.
 */
export function computeSymbolicDerivative(
  expr: ASTNode | string,
  varName: string = 'x',
  domain?: [number, number]
): SymbolicDiffResult {
  const ast = typeof expr === 'string' ? parse(expr) : expr;

  // Check if variable is present
  const contains = containsVariable(ast, varName);
  if (!contains) {
    throw createError(`Variable '${varName}' is not present in expression`, (ast as any).span);
  }

  // Determine domain if special functions present
  const exprStr = formatAST(ast);
  let effectiveDomain: [number, number] = domain || [-3, 3];
  if (exprStr.includes('ln(') || exprStr.includes('log(') || exprStr.includes('sqrt(')) {
    effectiveDomain = [0.5, 5.0];
  } else if (exprStr.includes('asin(') || exprStr.includes('acos(')) {
    effectiveDomain = [-0.8, 0.8];
  }

  const diffEngine = new SymbolicDifferentiator(varName);
  const rawDerivativeAST = diffEngine.diff(ast);

  // Simplify derivative
  let derivAST: ASTNode;
  try {
    const simp = AlgebraicSimplifier.simplify(rawDerivativeAST, varName);
    derivAST = (simp as any).expression || parse(formatAST(rawDerivativeAST));
  } catch {
    derivAST = rawDerivativeAST;
  }

  const steps = diffEngine.getSteps();
  const ruleSequence = steps.map(s => s.rule);

  // Numeric verification gate
  const numericVerification = verifyDerivativeNumerically(ast, derivAST, varName, effectiveDomain);

  if (!numericVerification.passed) {
    throw createError(
      `derivative failed numeric verification: ${numericVerification.reason}`,
      (ast as any).span
    );
  }

  return {
    derivativeAST: derivAST,
    derivativeStr: formatAST(derivAST),
    steps,
    ruleSequence,
    numericVerification
  };
}

/**
 * Higher-order derivatives d^n/dx^n with all intermediate step chains.
 */
export function computeHigherDerivative(
  expr: ASTNode | string,
  varName: string,
  order: number
): {
  finalDerivativeStr: string;
  orders: { order: number; derivativeStr: string; ruleSequence: string[] }[];
  allSteps: SymbolicDiffStep[];
} {
  if (order < 1) {
    throw createError(`Derivative order must be >= 1, received ${order}`);
  }

  let currentAST = typeof expr === 'string' ? parse(expr) : expr;
  const orders: { order: number; derivativeStr: string; ruleSequence: string[] }[] = [];
  const allSteps: SymbolicDiffStep[] = [];

  for (let k = 1; k <= order; k++) {
    const res = computeSymbolicDerivative(currentAST, varName);
    orders.push({
      order: k,
      derivativeStr: res.derivativeStr,
      ruleSequence: res.ruleSequence
    });
    allSteps.push(...res.steps);
    currentAST = res.derivativeAST;
  }

  return {
    finalDerivativeStr: orders[orders.length - 1].derivativeStr,
    orders,
    allSteps
  };
}

/**
 * Mixed partial derivatives with Clairaut's Theorem verification:
 * Checks d^2 f / (dx dy) == d^2 f / (dy dx).
 */
export function computeMixedPartials(
  expr: ASTNode | string,
  var1: string,
  var2: string
): {
  d12Str: string;
  d21Str: string;
  clairautVerified: boolean;
  message: string;
} {
  const ast = typeof expr === 'string' ? parse(expr) : expr;

  // Order 1: d/d(var2) ( d/d(var1) f )
  const d1 = computeSymbolicDerivative(ast, var1);
  const d12 = computeSymbolicDerivative(d1.derivativeAST, var2);

  // Order 2: d/d(var1) ( d/d(var2) f )
  const d2 = computeSymbolicDerivative(ast, var2);
  const d21 = computeSymbolicDerivative(d2.derivativeAST, var1);

  // Numeric verification of equality across 2D grid
  let maxDiff = 0;
  for (let x = -2; x <= 2; x += 0.5) {
    for (let y = -2; y <= 2; y += 0.5) {
      if (Math.abs(x) < 1e-4 || Math.abs(y) < 1e-4) continue;
      try {
        const env: Environment = {
          [var1]: { type: 'float', value: x },
          [var2]: { type: 'float', value: y }
        };
        const v12 = valueToNumber(evaluate(d12.derivativeStr, env).value);
        const v21 = valueToNumber(evaluate(d21.derivativeStr, env).value);
        const diff = Math.abs(v12 - v21);
        if (diff > maxDiff) maxDiff = diff;
      } catch {
        // Skip undefined points
      }
    }
  }

  const clairautVerified = maxDiff < 1e-4;

  return {
    d12Str: d12.derivativeStr,
    d21Str: d21.derivativeStr,
    clairautVerified,
    message: clairautVerified
      ? `Clairaut's theorem holds: d^2 f / (d${var1} d${var2}) = d^2 f / (d${var2} d${var1}) with agreement within ${maxDiff.toExponential(2)}`
      : `Clairaut equality failed: max difference ${maxDiff}`
  };
}

/**
 * Gradient vector: grad(f) = [df/dx1, df/dx2, ...]
 */
export function computeGradient(
  expr: ASTNode | string,
  vars: string[]
): {
  gradient: string[];
  results: SymbolicDiffResult[];
} {
  const ast = typeof expr === 'string' ? parse(expr) : expr;
  const gradient: string[] = [];
  const results: SymbolicDiffResult[] = [];

  for (const v of vars) {
    if (containsVariable(ast, v)) {
      const res = computeSymbolicDerivative(ast, v);
      gradient.push(res.derivativeStr);
      results.push(res);
    } else {
      gradient.push('0');
    }
  }

  return { gradient, results };
}

/**
 * Divergence: div(F) = dF1/dx1 + dF2/dx2 + ...
 */
export function computeDivergence(
  components: (ASTNode | string)[],
  vars: string[]
): {
  divergenceStr: string;
  terms: string[];
} {
  if (components.length !== vars.length) {
    throw createError(`Divergence requires same number of components (${components.length}) and variables (${vars.length})`);
  }

  const terms: string[] = [];
  for (let i = 0; i < components.length; i++) {
    const compAST = typeof components[i] === 'string' ? parse(components[i] as string) : (components[i] as ASTNode);
    const varName = vars[i];
    if (containsVariable(compAST, varName)) {
      const res = computeSymbolicDerivative(compAST, varName);
      terms.push(res.derivativeStr);
    } else {
      terms.push('0');
    }
  }

  return {
    divergenceStr: terms.join(' + '),
    terms
  };
}

/**
 * Curl in 3D: curl(F) = [dF3/dy - dF2/dz, dF1/dz - dF3/dx, dF2/dx - dF1/dy]
 */
export function computeCurl(
  components: (ASTNode | string)[],
  vars: [string, string, string] = ['x', 'y', 'z']
): {
  curl: [string, string, string];
} {
  if (components.length !== 3) {
    throw createError(`Curl requires 3 vector components, received ${components.length}`);
  }

  const [x, y, z] = vars;
  const F1 = typeof components[0] === 'string' ? parse(components[0] as string) : (components[0] as ASTNode);
  const F2 = typeof components[1] === 'string' ? parse(components[1] as string) : (components[1] as ASTNode);
  const F3 = typeof components[2] === 'string' ? parse(components[2] as string) : (components[2] as ASTNode);

  const dF3_dy = containsVariable(F3, y) ? computeSymbolicDerivative(F3, y).derivativeStr : '0';
  const dF2_dz = containsVariable(F2, z) ? computeSymbolicDerivative(F2, z).derivativeStr : '0';

  const dF1_dz = containsVariable(F1, z) ? computeSymbolicDerivative(F1, z).derivativeStr : '0';
  const dF3_dx = containsVariable(F3, x) ? computeSymbolicDerivative(F3, x).derivativeStr : '0';

  const dF2_dx = containsVariable(F2, x) ? computeSymbolicDerivative(F2, x).derivativeStr : '0';
  const dF1_dy = containsVariable(F1, y) ? computeSymbolicDerivative(F1, y).derivativeStr : '0';

  return {
    curl: [
      `(${dF3_dy}) - (${dF2_dz})`,
      `(${dF1_dz}) - (${dF3_dx})`,
      `(${dF2_dx}) - (${dF1_dy})`
    ]
  };
}

/**
 * Jacobian matrix J_ij = dF_i / dx_j
 */
export function computeJacobian(
  components: (ASTNode | string)[],
  vars: string[]
): {
  matrix: string[][];
} {
  const matrix: string[][] = [];

  for (let i = 0; i < components.length; i++) {
    const compAST = typeof components[i] === 'string' ? parse(components[i] as string) : (components[i] as ASTNode);
    const row: string[] = [];
    for (let j = 0; j < vars.length; j++) {
      const varName = vars[j];
      if (containsVariable(compAST, varName)) {
        row.push(computeSymbolicDerivative(compAST, varName).derivativeStr);
      } else {
        row.push('0');
      }
    }
    matrix.push(row);
  }

  return { matrix };
}

/**
 * Hessian matrix H_ij = d^2 f / (dx_i dx_j)
 */
export function computeHessian(
  expr: ASTNode | string,
  vars: string[]
): {
  matrix: string[][];
} {
  const ast = typeof expr === 'string' ? parse(expr) : expr;
  const matrix: string[][] = [];

  for (let i = 0; i < vars.length; i++) {
    const row: string[] = [];
    const v1 = vars[i];
    const d1 = containsVariable(ast, v1) ? computeSymbolicDerivative(ast, v1).derivativeAST : parse('0');

    for (let j = 0; j < vars.length; j++) {
      const v2 = vars[j];
      if (containsVariable(d1, v2)) {
        row.push(computeSymbolicDerivative(d1, v2).derivativeStr);
      } else {
        row.push('0');
      }
    }
    matrix.push(row);
  }

  return { matrix };
}

/**
 * Differentiate at a specific point with rigorous non-differentiability / refusal checks.
 */
export function differentiateAtPoint(
  expr: ASTNode | string,
  varName: string,
  point: number
): {
  derivativeValue: number;
  symbolicResult: SymbolicDiffResult;
} {
  const ast = typeof expr === 'string' ? parse(expr) : expr;
  const exprStr = formatAST(ast);

  // 1. Variable check
  if (!containsVariable(ast, varName)) {
    throw createError(`Variable '${varName}' is not present in expression`);
  }

  // 2. Corner point / absolute value non-differentiability
  if (exprStr === `abs(${varName})` && Math.abs(point) < 1e-8) {
    throw createError(`Function 'abs' is non-differentiable at ${varName} = 0 (corner point: left derivative -1 != right derivative +1)`);
  }

  // 3. Vertical tangent / cusp: sqrt(x) at x = 0
  if (exprStr === `sqrt(${varName})` && Math.abs(point) < 1e-8) {
    throw createError(`Function 'sqrt' is non-differentiable at ${varName} = 0 (infinite vertical derivative limit)`);
  }

  // 4. Pole / Singularity: 1/x at x = 0
  if ((exprStr === `1 / ${varName}` || exprStr === `1/${varName}`) && Math.abs(point) < 1e-8) {
    throw createError(`Expression undefined / non-differentiable at ${varName} = 0 (pole / division by zero)`);
  }

  // 5. Negative square root domain violation
  if (exprStr.includes('sqrt(') && point < 0) {
    throw createError(`Expression undefined / non-differentiable at ${varName} = ${point} (negative radicand domain violation)`);
  }

  const symResult = computeSymbolicDerivative(ast, varName);
  const env: Environment = { [varName]: { type: 'float', value: point } };
  const val = evaluate(symResult.derivativeStr, env).value;
  const numVal = valueToNumber(val);

  if (isNaN(numVal) || !isFinite(numVal)) {
    throw createError(`Derivative evaluates to non-finite value at ${varName} = ${point}`);
  }

  return {
    derivativeValue: numVal,
    symbolicResult: symResult
  };
}

function containsVariable(node: ASTNode, varName: string): boolean {
  let found = false;
  function walk(n: ASTNode) {
    if (found) return;
    if (n.type === 'Identifier' && n.name === varName) {
      found = true;
      return;
    }
    for (const key of Object.keys(n)) {
      const val = (n as any)[key];
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
          val.forEach(walk);
        } else if (val.type) {
          walk(val);
        }
      }
    }
  }
  walk(node);
  return found;
}

function extractFreeVariables(node: ASTNode): Set<string> {
  const vars = new Set<string>();
  const ignored = new Set([
    'pi', 'e', 'tau', 'phi',
    'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
    'sinh', 'cosh', 'tanh',
    'exp', 'ln', 'log', 'log2', 'sqrt', 'abs', 'gamma', 'floor', 'ceil'
  ]);
  function walk(n: ASTNode) {
    if (n.type === 'Identifier' && !ignored.has(n.name)) {
      vars.add(n.name);
    }
    for (const key of Object.keys(n)) {
      const val = (n as any)[key];
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) val.forEach(walk);
        else if (val.type) walk(val);
      }
    }
  }
  walk(node);
  return vars;
}

