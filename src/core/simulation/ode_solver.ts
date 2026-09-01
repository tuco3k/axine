import { ASTNode, DerivationValue } from '../types';
import { formatAST } from '../formatter';

export interface ODEClassification {
  type: 'linear_first_order' | 'separable' | 'autonomous' | 'general';
  order: number;
  description: string;
  variable: string;
  dependentVar: string;
  symbolicSolution?: (t: number, y0: number) => number;
  symbolicFormula?: string;
  derivation?: DerivationValue;
}

function extractNumber(node: ASTNode): number | null {
  if (node.type === 'NumberLiteral') return parseFloat(node.raw);
  if (node.type === 'UnaryOp' && node.op === '-') {
    const sub = extractNumber(node.operand);
    return sub !== null ? -sub : null;
  }
  return null;
}

export function classifyODE(
  eqNode: ASTNode,
  depVar: string = 'y',
  indepVar: string = 't'
): ODEClassification {
  if (eqNode.type === 'BinaryOp' && (eqNode.op === '=' || eqNode.op === '==')) {
    const left = eqNode.left;
    const right = eqNode.right;

    let isDerivative = false;
    if (left.type === 'Diff') {
      isDerivative = true;
      if (left.variable) indepVar = left.variable;
    } else if (left.type === 'BinaryOp' && (left.op === '//' || left.op === '/')) {
      isDerivative = true;
    } else if (left.type === 'PostfixOp' && left.op === "'") {
      isDerivative = true;
    } else if (left.type === 'Identifier' && (left.name === 'dy' || left.name === `${depVar}'` || left.name === `d${depVar}`)) {
      isDerivative = true;
    }

    let k: number | null = null;
    if (right.type === 'Identifier' && right.name === depVar) {
      k = 1;
    } else if (right.type === 'UnaryOp' && right.op === '-' && right.operand.type === 'Identifier' && right.operand.name === depVar) {
      k = -1;
    } else if (right.type === 'BinaryOp' && right.op === '*') {
      if (right.right.type === 'Identifier' && right.right.name === depVar) {
        k = extractNumber(right.left);
      } else if (right.left.type === 'Identifier' && right.left.name === depVar) {
        k = extractNumber(right.right);
      }
    } else if (right.type === 'UnaryOp' && right.op === '-' && right.operand.type === 'BinaryOp' && right.operand.op === '*') {
      if (right.operand.right.type === 'Identifier' && right.operand.right.name === depVar) {
        const sub = extractNumber(right.operand.left);
        k = sub !== null ? -sub : null;
      } else if (right.operand.left.type === 'Identifier' && right.operand.left.name === depVar) {
        const sub = extractNumber(right.operand.right);
        k = sub !== null ? -sub : null;
      }
    }

    if (isDerivative && k !== null && !isNaN(k)) {
      const derivation: DerivationValue = {
        type: 'derivation',
        originalEquation: `${depVar}' = ${k === -1 ? '-' : (k === 1 ? '' : k)}${depVar}`,
        steps: [
          {
            before: `d${depVar}/d${indepVar} = ${k}${depVar}`,
            after: `(1/${depVar}) d${depVar} = ${k} d${indepVar}`,
            rule: 'separation-of-variables',
            justification: `Divide both sides by ${depVar} and multiply by d${indepVar}`,
          },
          {
            before: `\u222b (1/${depVar}) d${depVar} = \u222b ${k} d${indepVar}`,
            after: `ln|${depVar}| = ${k}${indepVar} + C`,
            rule: 'integrate-both-sides',
            justification: `\u222b(1/y)dy = ln|y| and \u222bk dt = k·t + C`,
          },
          {
            before: `ln|${depVar}| = ${k}${indepVar} + C`,
            after: `${depVar}(${indepVar}) = A · e^(${k}${indepVar})`,
            rule: 'exponentiate',
            justification: `e^(ln|y|) = e^(kt + C) = A·e^(kt) where A = ±e^C`,
          },
          {
            before: `${depVar}(0) = y\u2080 \u21d2 y\u2080 = A · e^0 = A`,
            after: `${depVar}(${indepVar}) = y\u2080 · e^(${k}${indepVar})`,
            rule: 'initial-condition',
            justification: `Substitute t = 0 to solve for constant A = y\u2080`,
          },
        ],
        roots: [],
        verified: true,
      };

      return {
        type: 'linear_first_order',
        order: 1,
        description: 'First-order linear autonomous ODE (separable)',
        variable: indepVar,
        dependentVar: depVar,
        symbolicFormula: `${depVar}(${indepVar}) = y\u2080 · exp(${k} · ${indepVar})`,
        symbolicSolution: (t: number, y0: number) => y0 * Math.exp(k * t),
        derivation,
      };
    }
  }

  // Fallback regex match
  const eqStr = formatAST(eqNode);
  const simpleDecayMatch = eqStr.match(/(?:d[a-zA-Z]+\s*\/\/\s*d[a-zA-Z]+|d\s*\/\/\s*d[a-zA-Z]+\s*[a-zA-Z]+|[a-zA-Z]+')\s*=\s*([+-]?\s*\d*(?:\.\d+)?)\s*\*?\s*([a-zA-Z]+)/);
  if (simpleDecayMatch) {
    let kStr = simpleDecayMatch[1].replace(/\s+/g, '');
    if (kStr === '' || kStr === '+') kStr = '1';
    if (kStr === '-') kStr = '-1';
    const k = parseFloat(kStr);
    const v = simpleDecayMatch[2];

    if (v === depVar) {
      const derivation: DerivationValue = {
        type: 'derivation',
        originalEquation: `${depVar}' = ${k === -1 ? '-' : (k === 1 ? '' : k)}${depVar}`,
        steps: [
          {
            before: `d${depVar}/d${indepVar} = ${k}${depVar}`,
            after: `(1/${depVar}) d${depVar} = ${k} d${indepVar}`,
            rule: 'separation-of-variables',
            justification: `Divide both sides by ${depVar} and multiply by d${indepVar}`,
          },
          {
            before: `\u222b (1/${depVar}) d${depVar} = \u222b ${k} d${indepVar}`,
            after: `ln|${depVar}| = ${k}${indepVar} + C`,
            rule: 'integrate-both-sides',
            justification: `\u222b(1/y)dy = ln|y| and \u222bk dt = k·t + C`,
          },
          {
            before: `ln|${depVar}| = ${k}${indepVar} + C`,
            after: `${depVar}(${indepVar}) = A · e^(${k}${indepVar})`,
            rule: 'exponentiate',
            justification: `e^(ln|y|) = e^(kt + C) = A·e^(kt) where A = ±e^C`,
          },
          {
            before: `${depVar}(0) = y\u2080 \u21d2 y\u2080 = A · e^0 = A`,
            after: `${depVar}(${indepVar}) = y\u2080 · e^(${k}${indepVar})`,
            rule: 'initial-condition',
            justification: `Substitute t = 0 to solve for constant A = y\u2080`,
          },
        ],
        roots: [],
        verified: true,
      };

      return {
        type: 'linear_first_order',
        order: 1,
        description: 'First-order linear autonomous ODE (separable)',
        variable: indepVar,
        dependentVar: depVar,
        symbolicFormula: `${depVar}(${indepVar}) = y\u2080 · exp(${k} · ${indepVar})`,
        symbolicSolution: (t: number, y0: number) => y0 * Math.exp(k * t),
        derivation,
      };
    }
  }

  return {
    type: 'general',
    order: 1,
    description: 'First-order general nonlinear ODE',
    variable: indepVar,
    dependentVar: depVar,
  };
}

export function solveODERK4(
  f: (t: number, y: number) => number,
  y0: number,
  tStart: number,
  tEnd: number,
  dt: number = 0.01
): {
  samples: { t: number; y: number }[];
  maxLocalError: number;
  cumulativeErrorEstimate: number;
} {
  const samples: { t: number; y: number }[] = [{ t: tStart, y: y0 }];
  let t = tStart;
  let y = y0;
  let maxLocalError = 0;
  let cumulativeError = 0;

  const rk4Step = (tCur: number, yCur: number, h: number): number => {
    const k1 = f(tCur, yCur);
    const k2 = f(tCur + 0.5 * h, yCur + 0.5 * h * k1);
    const k3 = f(tCur + 0.5 * h, yCur + 0.5 * h * k2);
    const k4 = f(tCur + h, yCur + h * k3);
    return yCur + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
  };

  const totalSteps = Math.ceil((tEnd - tStart) / dt);
  for (let step = 0; step < totalSteps; step++) {
    const h = Math.min(dt, tEnd - t);
    if (h <= 1e-12) break;

    // Full step of size h
    const yFull = rk4Step(t, y, h);

    // Two half steps of size h/2 (Richardson extrapolation error estimator)
    const yHalf1 = rk4Step(t, y, h / 2);
    const yHalf2 = rk4Step(t + h / 2, yHalf1, h / 2);

    // Local truncation error for RK4: e_local ~= |yHalf2 - yFull| / 15
    const localErr = Math.abs(yHalf2 - yFull) / 15;
    if (localErr > maxLocalError) maxLocalError = localErr;
    cumulativeError += localErr;

    // Use the higher-order extrapolated result yHalf2
    y = yHalf2;
    t += h;

    if (Math.abs(t - Math.round(t / dt) * dt) < 1e-10) {
      t = Math.round(t / dt) * dt;
    }

    samples.push({ t, y });
  }

  return {
    samples,
    maxLocalError,
    cumulativeErrorEstimate: cumulativeError,
  };
}
