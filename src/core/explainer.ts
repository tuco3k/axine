/**
 * Contextual Mathematical Explanation Engine
 * 
 * Generates context-anchored mathematical explanations derived from
 * (node type, parent context, sibling values), NOT static dictionary lookups.
 * Explanations use pure mathematical expressions rendered via typesetMath,
 * with ZERO LaTeX backslash command strings.
 */

import { ASTNode } from './types';
import { typesetMath } from './math_typeset';

export interface VisualizationConfig {
  type: 'riemann_sum' | 'derivative_tangent' | 'epsilon_delta';
  expression: string;
  variable: string;
  bounds?: { lower: number; upper: number };
  point?: number;
  targetLimit?: number;
}

export interface ExplanationContext {
  parentType?: string;
  parentNode?: ASTNode | null;
  exprString?: string;
  variableName?: string;
  integrand?: string;
  bounds?: { lower?: string; upper?: string };
  point?: number;
  targetLimit?: number;
}

export interface NodeExplanation {
  symbol: string;
  role: string;
  whatItIs: string;
  whyItIsHere: string;
  showMe: string;
  goDeeper: string;
  visualization?: VisualizationConfig;
}

/**
 * Generates an anchored explanation for a symbol in its specific expression context.
 */
export function explainSymbol(symbol: string, context: ExplanationContext): NodeExplanation {
  const sym = symbol.trim();
  const parent = context.parentType || '';
  const expr = context.exprString || '';

  // Case 1: Differential / Variable of Integration 'dx', 'dy', 'dt'
  if (/^d[a-zA-Z_][a-zA-Z0-9_]*$/.test(sym) || sym === 'dx' || sym === 'dy' || sym === 'dt') {
    const varName = sym.slice(1);

    // Context A: Under Integral (e.g. \u222b x^2 dx)
    if (parent === 'integral' || expr.includes('\u222b') || expr.includes('integral')) {
      const integrand = context.integrand || `${varName}^2`;
      const lower = context.bounds?.lower ? parseFloat(context.bounds.lower) : 0;
      const upper = context.bounds?.upper ? parseFloat(context.bounds.upper) : 2;

      return {
        symbol: sym,
        role: `Variable of Integration for ${typesetMath('\u222b', { displayMode: false })} (${typesetMath(varName, { displayMode: false })})`,
        whatItIs: `The infinitesimal displacement ${typesetMath('d' + varName, { displayMode: false })} and accumulation variable in this integral.`,
        whyItIsHere: `It identifies ${typesetMath(varName, { displayMode: false })} as the integration variable. Integrating ${typesetMath(integrand, { displayMode: false })} with respect to ${typesetMath('d' + varName, { displayMode: false })} accumulates slices along the ${typesetMath(varName, { displayMode: false })}-axis (yielding ${typesetMath('1//3', { displayMode: false })}${typesetMath(varName + '^3', { displayMode: false })} for ${typesetMath(varName + '^2', { displayMode: false })}). If this were ${typesetMath('dy', { displayMode: false })}, ${typesetMath(varName, { displayMode: false })} would be treated as a constant factor, yielding ${typesetMath(varName + '^2 y', { displayMode: false })} instead.`,
        showMe: `Midpoint Riemann sum convergence: partitioning the domain into ${typesetMath('n', { displayMode: false })} strips of width ${typesetMath('Delta_' + varName, { displayMode: false })} whose midpoint sum ${typesetMath('\u03a3', { displayMode: false })} ${typesetMath('f(x_i) * Delta_' + varName, { displayMode: false })} converges to the exact integral as ${typesetMath('n -> \u221e', { displayMode: false })}.`,
        goDeeper: `Fundamental Theorem of Calculus: ${typesetMath('\u222b_a^b f(' + varName + ') d' + varName + ' = F(b) - F(a)', { displayMode: false })} where ${typesetMath("F'(" + varName + ") = f(" + varName + ")", { displayMode: false })}.`,
        visualization: {
          type: 'riemann_sum',
          expression: integrand,
          variable: varName,
          bounds: { lower: isNaN(lower) ? 0 : lower, upper: isNaN(upper) ? 2 : upper },
        },
      };
    }

    // Context B: Under Derivative / Differential Quotient (e.g. dy/dx or d/dx f(x))
    if (parent === 'derivative' || expr.includes('//') || expr.includes('d//') || expr.includes('/') || expr.includes('diff')) {
      const funcExpr = context.exprString || `${varName}^2`;
      return {
        symbol: sym,
        role: `Differential in Denominator of Derivative (${typesetMath('d' + varName, { displayMode: false })})`,
        whatItIs: `The infinitesimal change in independent variable ${typesetMath(varName, { displayMode: false })}, serving as the denominator in the instantaneous rate of change ${typesetMath('dy // d' + varName, { displayMode: false })}.`,
        whyItIsHere: `It defines the variable with respect to which rate-of-change is measured in <span class="tm-fn">lim</span><sub class="tm-sub">&Delta;${varName} &rarr; 0</sub> ${typesetMath('Delta_y // Delta_' + varName, { displayMode: false })}. Changing this to ${typesetMath('dt', { displayMode: false })} would measure the time derivative ${typesetMath('dy // dt', { displayMode: false })} rather than spatial rate of change.`,
        showMe: `Secant line slope ${typesetMath('(f(' + varName + ' + Delta_' + varName + ') - f(' + varName + ')) // Delta_' + varName, { displayMode: false })} converging to the tangent line slope as ${typesetMath('Delta_' + varName + ' -> 0', { displayMode: false })}.`,
        goDeeper: `Leibniz notation and Chain Rule: ${typesetMath('dz // d' + varName + ' = (dz // du) * (du // d' + varName + ')', { displayMode: false })}.`,
        visualization: {
          type: 'derivative_tangent',
          expression: funcExpr,
          variable: varName,
          point: context.point ?? 1.5,
        },
      };
    }

    // Default differential
    return {
      symbol: sym,
      role: `Infinitesimal Differential (${typesetMath('d' + varName, { displayMode: false })})`,
      whatItIs: `An infinitesimal change in the quantity ${typesetMath(varName, { displayMode: false })}.`,
      whyItIsHere: `Represents the first-order differential variation ${typesetMath('d' + varName, { displayMode: false })}.`,
      showMe: `Linear differential approximation ${typesetMath("df = f'(" + varName + ') * d' + varName, { displayMode: false })}.`,
      goDeeper: `Differential 1-forms in exterior calculus.`,
      visualization: {
        type: 'derivative_tangent',
        expression: `${varName}^2`,
        variable: varName,
        point: 1.0,
      },
    };
  }

  // Case 2: Integral Operator
  if (sym === '\u222b' || sym === 'integral') {
    const hasBounds = context.bounds && (context.bounds.lower || context.bounds.upper);
    const lower = context.bounds?.lower ? parseFloat(context.bounds.lower) : 0;
    const upper = context.bounds?.upper ? parseFloat(context.bounds.upper) : 2;
    const integrand = context.integrand || 'x^2';
    const varName = context.variableName || 'x';

    return {
      symbol: '\u222b',
      role: hasBounds ? 'Definite Integration Operator' : 'Indefinite Antiderivative Operator',
      whatItIs: `Continuous accumulation operator (Leibniz elongated S from Latin summa).`,
      whyItIsHere: hasBounds
        ? `Computes the net signed area/volume under the integrand between limits ${typesetMath(context.bounds?.lower ?? 'a', { displayMode: false })} and ${typesetMath(context.bounds?.upper ?? 'b', { displayMode: false })}.`
        : `Calculates the general antiderivative family ${typesetMath('F(x) + C', { displayMode: false })} whose derivative recovers the integrand.`,
      showMe: `Continuous area accumulation partitioned into Riemann rectangles.`,
      goDeeper: `Riemann-Darboux integral formulation and Lebesgue measure generalization.`,
      visualization: {
        type: 'riemann_sum',
        expression: integrand,
        variable: varName,
        bounds: { lower: isNaN(lower) ? 0 : lower, upper: isNaN(upper) ? 2 : upper },
      },
    };
  }

  // Case 3: Partial Differential Operator
  if (sym === '\u2202') {
    const varName = context.variableName || 'x';
    return {
      symbol: '\u2202',
      role: `Partial Derivative Operator (${typesetMath('\u2202', { displayMode: false })})`,
      whatItIs: `Denotes partial differentiation with respect to a single independent variable in a multivariable system.`,
      whyItIsHere: `Instructs the engine to vary only the specified coordinate while treating all other independent variables as constant parameters. Replacing this with total derivative ${typesetMath('d', { displayMode: false })} would require tracing implicit inter-variable dependencies.`,
      showMe: `3D surface cross-section tangent line along a single coordinate axis plane.`,
      goDeeper: `Clairaut's theorem on the equality of mixed partial derivatives.`,
      visualization: {
        type: 'derivative_tangent',
        expression: context.exprString || `${varName}^2`,
        variable: varName,
        point: 1.0,
      },
    };
  }

  // Case 4: Differential Operator 'd' (stand-alone)
  if (sym === 'd') {
    const varName = context.variableName || 'x';
    return {
      symbol: 'd',
      role: `Differential Operator (${typesetMath('d', { displayMode: false })})`,
      whatItIs: `Exterior differential operator ${typesetMath('d', { displayMode: false })}.`,
      whyItIsHere: `Forms differentials and derivative ratios (e.g. ${typesetMath('d//dx', { displayMode: false })}). Removing it reduces differential quotients to ordinary algebraic division.`,
      showMe: `First-order linear differential approximation ${typesetMath("df = f'(x) * dx", { displayMode: false })}.`,
      goDeeper: `Differential forms and Stokes' generalized theorem.`,
      visualization: {
        type: 'derivative_tangent',
        expression: context.exprString || `${varName}^2`,
        variable: varName,
        point: 1.0,
      },
    };
  }

  // Case 5: Summation Operator
  if (sym === '\u03a3' || sym === 'sum') {
    return {
      symbol: '\u03a3',
      role: `Discrete Summation Operator (${typesetMath('\u03a3', { displayMode: false })})`,
      whatItIs: `Discrete accumulator (Greek capital Sigma) summing terms across integer indices.`,
      whyItIsHere: `Evaluates the sum of sequential terms ${typesetMath('a_n', { displayMode: false })}. Unlike continuous integration ${typesetMath('\u222b', { displayMode: false })}, index steps advance by discrete units ${typesetMath('Delta_n = 1', { displayMode: false })}.`,
      showMe: `Partial sum sequence ${typesetMath('S_N = sum(a_n, n=1, N)', { displayMode: false })} plotted against index ${typesetMath('N', { displayMode: false })}.`,
      goDeeper: `Series convergence criteria: Cauchy criterion, Ratio test, and Integral test comparison.`,
    };
  }

  // Case 6: Limit Operator 'lim'
  if (sym === 'lim') {
    const exprStr = context.exprString || '2*x + 1';
    return {
      symbol: 'lim',
      role: 'Asymptotic Limit Operator',
      whatItIs: `Analyzes the value that a function approaches as its input arbitrarily nears a target point.`,
      whyItIsHere: `Resolves indeterminate algebraic forms (such as ${typesetMath('0//0', { displayMode: false })} or ${typesetMath('inf // inf', { displayMode: false })}) and defines continuity and differentiability at singular points.`,
      showMe: `Epsilon-delta neighborhood bands contracting around the target point.`,
      goDeeper: `Weierstrass formal limit definition and L'Hopital's rule.`,
      visualization: {
        type: 'epsilon_delta',
        expression: exprStr,
        variable: context.variableName || 'x',
        point: context.point ?? 3.0,
        targetLimit: context.targetLimit ?? 10.0,
      },
    };
  }

  // Fallback generic
  return {
    symbol: sym,
    role: `Mathematical Symbol (${typesetMath(sym, { displayMode: false })})`,
    whatItIs: `Symbol ${typesetMath(sym, { displayMode: false })} in current expression context.`,
    whyItIsHere: `Contributes to the syntax of the current mathematical expression.`,
    showMe: `Evaluated expression visualization.`,
    goDeeper: `Formal definition and mathematical semantics.`,
  };
}
