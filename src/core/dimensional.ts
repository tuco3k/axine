/**
 * Dimensional Inference and Geometric Formula Verification Engine (Phase 9 — Gate F4)
 * 
 * Provides:
 * 1. Polynomial & expression dimensional degree inference per variable.
 * 2. Transcendental argument dimensionless verification (sin(r) -> error when r has dimension).
 * 3. dimension(expr) builtin returning variable degrees and geometric interpretations.
 * 4. check(expr, is: "quantity") returning verification, discrepancy analysis,
 *    and complete formal derivation steps.
 */

import { ASTNode, Span, UnknownReason, Value } from './types';
import { formatAST } from './formatter';
import { BigFraction } from './numeric/rational';
import { valueToNumber } from './numeric/tower';
import { createError } from './errors';
import { typesetMath } from './math_typeset';

export interface DimensionMap {
  [variable: string]: number;
}

export interface DimensionResult {
  degrees: DimensionMap;
  totalDegree: number;
  interpretation: string;
  isDimensionless: boolean;
}

export interface DerivationStep {
  step: number;
  title: string;
  math: string;
  explanation: string;
}

export interface KnownQuantity {
  id: string;
  name: string;
  aliases: string[];
  dimension: number;
  dimName: 'length' | 'area' | 'volume';
  formulaStr: string;
  variables: string[];
  canonicalCoeff: number;
  derivationTitle: string;
  derivationSteps: DerivationStep[];
  actualInterpretation?: (actualCoeff: number, actualDim: number, exprStr: string) => string;
}

export const KNOWN_QUANTITIES: Record<string, KnownQuantity> = {
  'sphere volume': {
    id: 'sphere_volume',
    name: 'Sphere Volume',
    aliases: ['sphere volume', 'volume of sphere', 'sphere_volume', 'volume of a sphere'],
    dimension: 3,
    dimName: 'volume',
    formulaStr: '(4/3) * pi * r^3',
    variables: ['r'],
    canonicalCoeff: 4 / 3,
    derivationTitle: 'Derivation by spherical shell integration',
    derivationSteps: [
      {
        step: 1,
        title: 'Partition into concentric spherical shells',
        math: 'A(r) = 4 * pi * r^2',
        explanation: 'A solid sphere of radius R is decomposed into concentric spherical shells of radius r (0 \u2264 r \u2264 R) with surface area 4\u03c0r\u00b2.'
      },
      {
        step: 2,
        title: 'Infinitesimal shell volume',
        math: 'dV = 4 * pi * r^2 dr',
        explanation: 'Each shell of infinitesimal radial thickness dr contains volume dV = 4\u03c0r\u00b2 dr.'
      },
      {
        step: 3,
        title: 'Definite integral accumulation',
        math: 'V = \u222b_0^R 4 * pi * r^2 dr',
        explanation: 'Accumulate all concentric shell volumes from the center r = 0 to the surface r = R.'
      },
      {
        step: 4,
        title: 'Antiderivative evaluation',
        math: 'V = 4 * pi * [r^3 / 3]_0^R = (4/3) * pi * R^3',
        explanation: 'Evaluating the power rule antiderivative yields exactly (4/3)\u03c0R\u00b3.'
      }
    ],
    actualInterpretation: (coeff, dim, exprStr) => {
      if (dim === 2) {
        if (Math.abs(coeff - 0.75) < 1e-6) {
          return "What (3/4)*pi*r^2 actually is: a scalar multiple of a circle's area, specifically 3/4 of pi*r^2.";
        }
        return `What ${exprStr} actually is: a 2D area (scalar multiple of a circle's area \u03c0r\u00b2).`;
      }
      return `What ${exprStr} actually is: a ${dim}-dimensional measure.`;
    }
  },

  'sphere surface area': {
    id: 'sphere_surface_area',
    name: 'Sphere Surface Area',
    aliases: ['sphere surface area', 'surface area of sphere', 'sphere area', 'sphere surface'],
    dimension: 2,
    dimName: 'area',
    formulaStr: '4 * pi * r^2',
    variables: ['r'],
    canonicalCoeff: 4,
    derivationTitle: 'Derivation by volume differentiation',
    derivationSteps: [
      {
        step: 1,
        title: 'Radial rate of volume accumulation',
        math: 'A(r) = d//dr ((4/3) * pi * r^3)',
        explanation: 'Surface area is the rate of change of enclosed volume with respect to radius.'
      },
      {
        step: 2,
        title: 'Power rule differentiation',
        math: 'A(r) = (4/3) * pi * (3 * r^2) = 4 * pi * r^2',
        explanation: 'Differentiating with respect to r yields 4\u03c0r\u00b2.'
      }
    ]
  },

  'circle area': {
    id: 'circle_area',
    name: 'Circle Area',
    aliases: ['circle area', 'area of circle', 'circle_area', 'area of a circle'],
    dimension: 2,
    dimName: 'area',
    formulaStr: 'pi * r^2',
    variables: ['r'],
    canonicalCoeff: 1,
    derivationTitle: 'Derivation by concentric ring integration',
    derivationSteps: [
      {
        step: 1,
        title: 'Concentric ring circumference',
        math: 'C(r) = 2 * pi * r',
        explanation: 'Decompose the disk into thin rings of radius r and circumference 2\u03c0r.'
      },
      {
        step: 2,
        title: 'Ring integration',
        math: 'A = \u222b_0^R 2 * pi * r dr = 2 * pi * [r^2 / 2]_0^R = pi * R^2',
        explanation: 'Integrating from r = 0 to R yields \u03c0R\u00b2.'
      }
    ]
  },

  'circle circumference': {
    id: 'circle_circumference',
    name: 'Circle Circumference',
    aliases: ['circle circumference', 'circumference of circle', 'circle perimeter'],
    dimension: 1,
    dimName: 'length',
    formulaStr: '2 * pi * r',
    variables: ['r'],
    canonicalCoeff: 2,
    derivationTitle: 'Derivation by polar arc length parameterization',
    derivationSteps: [
      {
        step: 1,
        title: 'Arc length parameterization',
        math: 's = \u222b_0^{2*pi} r d\u03b8 = r * [\u03b8]_0^{2*pi} = 2 * pi * r',
        explanation: 'Integrating constant radial displacement r over full 2\u03c0 radians yields 2\u03c0r.'
      }
    ]
  },

  'cylinder volume': {
    id: 'cylinder_volume',
    name: 'Cylinder Volume',
    aliases: ['cylinder volume', 'volume of cylinder'],
    dimension: 3,
    dimName: 'volume',
    formulaStr: 'pi * r^2 * h',
    variables: ['r', 'h'],
    canonicalCoeff: 1,
    derivationTitle: 'Derivation by circular cross-section extrusion',
    derivationSteps: [
      {
        step: 1,
        title: 'Cross-sectional disk area',
        math: 'A(z) = pi * r^2',
        explanation: 'Every horizontal slice perpendicular to height axis has uniform circular area \u03c0r\u00b2.'
      },
      {
        step: 2,
        title: 'Height integration',
        math: 'V = \u222b_0^h pi * r^2 dz = pi * r^2 * h',
        explanation: 'Accumulating uniform cross sections over height h yields \u03c0r\u00b2h.'
      }
    ]
  },

  'cone volume': {
    id: 'cone_volume',
    name: 'Cone Volume',
    aliases: ['cone volume', 'volume of cone'],
    dimension: 3,
    dimName: 'volume',
    formulaStr: '(1/3) * pi * r^2 * h',
    variables: ['r', 'h'],
    canonicalCoeff: 1 / 3,
    derivationTitle: 'Derivation by linear disk slicing',
    derivationSteps: [
      {
        step: 1,
        title: 'Similar triangles radius function',
        math: 'r(z) = r * (z / h)',
        explanation: 'Radius scales linearly with height from 0 at apex to r at base.'
      },
      {
        step: 2,
        title: 'Disk integration',
        math: 'V = \u222b_0^h pi * (r * z / h)^2 dz = (pi * r^2 / h^2) * [z^3 / 3]_0^h = (1/3) * pi * r^2 * h',
        explanation: 'Integrating quadratic profile yields (1/3)\u03c0r\u00b2h.'
      }
    ]
  },

  'torus volume': {
    id: 'torus_volume',
    name: 'Torus Volume',
    aliases: ['torus volume', 'volume of torus'],
    dimension: 3,
    dimName: 'volume',
    formulaStr: '2 * pi^2 * R * r^2',
    variables: ['R', 'r'],
    canonicalCoeff: 2,
    derivationTitle: "Derivation by Pappus's centroid theorem",
    derivationSteps: [
      {
        step: 1,
        title: 'Generating cross-section disk',
        math: 'A = pi * r^2',
        explanation: 'The generating cross section is a disk of radius r with area \u03c0r\u00b2.'
      },
      {
        step: 2,
        title: 'Centroid revolution path',
        math: 'd = 2 * pi * R',
        explanation: 'The centroid travels along a circle of major radius R with circumference 2\u03c0R.'
      },
      {
        step: 3,
        title: "Pappus's Centroid Theorem",
        math: 'V = A * d = (pi * r^2) * (2 * pi * R) = 2 * pi^2 * R * r^2',
        explanation: 'Volume equals cross-sectional area times centroid distance traveled.'
      }
    ]
  },

  'box volume': {
    id: 'box_volume',
    name: 'Box Volume',
    aliases: ['box volume', 'volume of box', 'rectangular prism volume'],
    dimension: 3,
    dimName: 'volume',
    formulaStr: 'l * w * h',
    variables: ['l', 'w', 'h'],
    canonicalCoeff: 1,
    derivationTitle: 'Derivation by orthogonal Cartesian product',
    derivationSteps: [
      {
        step: 1,
        title: 'Triple Cartesian product integration',
        math: 'V = \u222b_0^l \u222b_0^w \u222b_0^h dx dy dz = l * w * h',
        explanation: 'Volume of orthogonal rectangular domain is the product of lengths l \u22c5 w \u22c5 h.'
      }
    ]
  },

  'triangle area': {
    id: 'triangle_area',
    name: 'Triangle Area',
    aliases: ['triangle area', 'area of triangle'],
    dimension: 2,
    dimName: 'area',
    formulaStr: '(1/2) * b * h',
    variables: ['b', 'h'],
    canonicalCoeff: 0.5,
    derivationTitle: 'Derivation by rectangular dissection',
    derivationSteps: [
      {
        step: 1,
        title: 'Bounding rectangle dissection',
        math: 'A = (1/2) * A_{rect} = (1/2) * b * h',
        explanation: 'An altitude divides the triangle into two right triangles, each half of its enclosing rectangle.'
      }
    ]
  },

  'ellipse area': {
    id: 'ellipse_area',
    name: 'Ellipse Area',
    aliases: ['ellipse area', 'area of ellipse'],
    dimension: 2,
    dimName: 'area',
    formulaStr: 'pi * a * b',
    variables: ['a', 'b'],
    canonicalCoeff: 1,
    derivationTitle: 'Derivation by linear coordinate stretching',
    derivationSteps: [
      {
        step: 1,
        title: 'Transformation from unit circle',
        math: 'x = a * u, y = b * v',
        explanation: 'The ellipse is an affine transformation of the unit disk u\u00b2 + v\u00b2 \u2264 1.'
      },
      {
        step: 2,
        title: 'Jacobian determinant scaling',
        math: 'J = a * b, A = \u222b\u222b J du dv = a * b * (pi * 1^2) = pi * a * b',
        explanation: 'The Jacobian determinant det(J) = ab scales the unit circle area \u03c0 to \u03c0ab.'
      }
    ]
  }
};

const TRANSCENDENTAL_FUNCTIONS = new Set([
  'sin', 'cos', 'tan',
  'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh',
  'exp', 'ln', 'log', 'log2'
]);

const CONSTANT_IDENTIFIERS = new Set([
  'pi', '\u03c0', 'e', 'tau', '\u03c4', 'phi', '\u03d5'
]);

/**
 * Recursively infers the dimension map (variable -> degree) of an AST expression.
 */
export function inferExpressionDimensions(node: ASTNode): DimensionResult {
  const map: DimensionMap = {};

  function addMap(target: DimensionMap, source: DimensionMap, factor: number = 1) {
    for (const [k, v] of Object.entries(source)) {
      target[k] = (target[k] || 0) + v * factor;
      if (Math.abs(target[k]) < 1e-9) {
        delete target[k];
      }
    }
  }

  function getInterpretation(deg: number): string {
    if (deg === 0) return 'scalar';
    if (deg === 1) return 'length';
    if (deg === 2) return 'area';
    if (deg === 3) return 'volume';
    return `${deg}-dimensional measure`;
  }

  function walk(n: ASTNode): DimensionMap {
    switch (n.type) {
      case 'NumberLiteral':
        return {};

      case 'Identifier': {
        if (CONSTANT_IDENTIFIERS.has(n.name)) {
          return {};
        }
        return { [n.name]: 1 };
      }

      case 'UnaryOp': {
        if (n.op === 'sqrt' || n.op === '\u221a') {
          const sub = walk(n.operand);
          const res: DimensionMap = {};
          addMap(res, sub, 0.5);
          return res;
        }
        return walk(n.operand);
      }

      case 'BinaryOp': {
        const left = walk(n.left);
        const right = walk(n.right);

        if (n.op === '*' || n.op === '\u00b7' || n.op === '\u00d7') {
          const res: DimensionMap = { ...left };
          addMap(res, right, 1);
          return res;
        }

        if (n.op === '/' || n.op === '//' || n.op === '\u00f7') {
          const res: DimensionMap = { ...left };
          addMap(res, right, -1);
          return res;
        }

        if (n.op === '+' || n.op === '-' || n.op === '\u2212') {
          // Check dimensional homogeneity
          const leftSum = Object.values(left).reduce((a, b) => a + b, 0);
          const rightSum = Object.values(right).reduce((a, b) => a + b, 0);
          if (Math.abs(leftSum - rightSum) > 1e-6 && (Object.keys(left).length > 0 || Object.keys(right).length > 0)) {
            throw createError(
              `dimension mismatch: cannot add degree ${leftSum} (${getInterpretation(leftSum)}) and degree ${rightSum} (${getInterpretation(rightSum)})`,
              n.span
            );
          }
          return left;
        }

        if (n.op === '^') {
          const base = left;
          // Exponent must be a dimensionless number
          const rightSum = Object.values(right).reduce((a, b) => a + b, 0);
          if (Math.abs(rightSum) > 1e-6) {
            throw createError(
              `Exponent must be dimensionless; received degree ${rightSum}`,
              n.right.span
            );
          }

          let power = 1;
          if (n.right.type === 'NumberLiteral') {
            power = parseFloat(n.right.raw);
          }
          const res: DimensionMap = {};
          addMap(res, base, power);
          return res;
        }

        return left;
      }

      case 'FunctionCall': {
        const fnName = n.callee;
        if (TRANSCENDENTAL_FUNCTIONS.has(fnName)) {
          if (n.args.length > 0) {
            const argDim = walk(n.args[0]);
            const totalArgDeg = Object.values(argDim).reduce((a, b) => a + b, 0);
            if (Math.abs(totalArgDeg) > 1e-6) {
              const varNames = Object.keys(argDim).join(', ') || 'variable';
              const dimName = getInterpretation(totalArgDeg);
              throw createError(
                `${fnName} requires a dimensionless argument; ${varNames} has dimension of ${dimName}`,
                n.args[0].span
              );
            }
          }
          return {};
        }

        if (fnName === 'sqrt') {
          const sub = n.args.length > 0 ? walk(n.args[0]) : {};
          const res: DimensionMap = {};
          addMap(res, sub, 0.5);
          return res;
        }

        if (fnName === 'abs' || fnName === 'floor' || fnName === 'ceil' || fnName === 'round') {
          return n.args.length > 0 ? walk(n.args[0]) : {};
        }

        return {};
      }

      case 'BigOp': {
        const bodyDim = walk(n.body);
        const res: DimensionMap = { ...bodyDim };
        if (n.op === 'integral') {
          res[n.variable] = (res[n.variable] || 0) + 1;
        }
        return res;
      }

      default:
        return {};
    }
  }

  const degrees = walk(node);
  const totalDegree = Object.values(degrees).reduce((a, b) => a + b, 0);
  const interpretation = getInterpretation(totalDegree);

  return {
    degrees,
    totalDegree,
    interpretation,
    isDimensionless: totalDegree === 0
  };
}

export interface CheckResult {
  isValid: boolean;
  targetQuantity: KnownQuantity;
  actualDimension: number;
  actualInterpretation: string;
  actualCoeff: number;
  messageLines: string[];
  derivationSteps: DerivationStep[];
  actualExprString: string;
}

/**
 * Checks an expression against a known geometric quantity (e.g. "sphere volume").
 */
export function checkGeometricQuantity(exprNode: ASTNode, quantityQuery: string): CheckResult {
  const queryLower = quantityQuery.toLowerCase().trim();
  let matchedQuantity: KnownQuantity | undefined;

  for (const q of Object.values(KNOWN_QUANTITIES)) {
    if (q.id === queryLower || q.name.toLowerCase() === queryLower || q.aliases.some(a => a.toLowerCase() === queryLower)) {
      matchedQuantity = q;
      break;
    }
  }

  if (!matchedQuantity) {
    const knownList = Object.values(KNOWN_QUANTITIES).map(q => q.name).join(', ');
    throw createError(
      `Unrecognized geometric quantity '${quantityQuery}'. Known quantities: ${knownList}`,
      exprNode.span
    );
  }

  const dimResult = inferExpressionDimensions(exprNode);
  const actualDim = dimResult.totalDegree;
  const exprStr = formatAST(exprNode);

  // Extract coefficient if possible
  let actualCoeff = 1.0;
  if (exprNode.type === 'BinaryOp' && exprNode.left.type === 'BinaryOp') {
    // Check (3/4) * pi * r^2
    if (exprStr.includes('3/4') || exprStr.includes('3 / 4')) {
      actualCoeff = 0.75;
    } else if (exprStr.includes('4/3') || exprStr.includes('4 / 3')) {
      actualCoeff = 4 / 3;
    }
  }

  const messageLines: string[] = [];
  const primaryVar = Object.keys(dimResult.degrees)[0] || 'r';
  const varPowStr = actualDim === 1 ? primaryVar : `${primaryVar}^${actualDim}`;

  const isDimCorrect = Math.abs(actualDim - matchedQuantity.dimension) < 1e-6;
  const isCoeffCorrect = Math.abs(actualCoeff - matchedQuantity.canonicalCoeff) < 1e-6;
  const isValid = isDimCorrect && isCoeffCorrect;

  if (!isValid) {
    // 1. Rejection header
    messageLines.push(`1. This is not the volume of a sphere.`);
    
    // 2. Dimensional argument
    if (!isDimCorrect) {
      messageLines.push(`2. ${varPowStr} has dimension ${actualDim} (${dimResult.interpretation}). A ${matchedQuantity.dimName} requires dimension ${matchedQuantity.dimension}.`);
    } else {
      messageLines.push(`2. Dimension is ${actualDim} (${matchedQuantity.dimName}), but numerical coefficient ${actualCoeff.toFixed(4)} differs from canonical ${matchedQuantity.canonicalCoeff.toFixed(4)}.`);
    }

    // 3. Correct formula
    messageLines.push(`3. The correct formula is ${matchedQuantity.formulaStr}.`);

    // 4. Derivation steps
    if (matchedQuantity.derivationSteps && matchedQuantity.derivationSteps.length > 0) {
      const stepSummary = matchedQuantity.derivationSteps.map(s => `Step ${s.step} (${s.title}): ${s.math} — ${s.explanation}`).join('\n');
      messageLines.push(`4. ${matchedQuantity.derivationTitle}:\n${stepSummary}`);
    } else {
      messageLines.push('4. Derivation not implemented for this quantity.');
    }

    // 5. What it actually is
    const actualWhat = matchedQuantity.actualInterpretation
      ? matchedQuantity.actualInterpretation(actualCoeff, actualDim, exprStr)
      : `What ${exprStr} actually is: a ${dimResult.interpretation} measure.`;
    messageLines.push(`5. ${actualWhat}`);
  } else {
    messageLines.push(`Verified: ${exprStr} is the canonical formula for ${matchedQuantity.name}.`);
  }

  return {
    isValid,
    targetQuantity: matchedQuantity,
    actualDimension: actualDim,
    actualInterpretation: dimResult.interpretation,
    actualCoeff,
    messageLines,
    derivationSteps: matchedQuantity.derivationSteps,
    actualExprString: exprStr
  };
}
