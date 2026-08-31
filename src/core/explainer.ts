/**
 * Contextual Mathematical Explanation Engine
 * 
 * Generates context-anchored mathematical explanations derived from
 * (node type, parent context, sibling values), NOT static dictionary lookups.
 */

import { ASTNode } from './types';

export interface ExplanationContext {
  parentType?: string;
  parentNode?: ASTNode | null;
  exprString?: string;
  variableName?: string;
  integrand?: string;
  bounds?: { lower?: string; upper?: string };
}

export interface NodeExplanation {
  symbol: string;
  role: string;
  whatItIs: string;
  whyItIsHere: string;
  showMe: string;
  goDeeper: string;
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

    // Context A: Under Integral (e.g. \int x^2 dx)
    if (parent === 'integral' || expr.includes('\u222b') || expr.includes('integral')) {
      const integrand = context.integrand || 'the integrand';
      return {
        symbol: sym,
        role: `Variable of Integration for $\\int$ ($${varName}$)`,
        whatItIs: `The infinitesimal displacement $\\mathrm{d}${varName}$ and accumulation variable in this integral.`,
        whyItIsHere: `It identifies $${varName}$ as the integration variable. Integrating $${integrand}$ with respect to $\\mathrm{d}${varName}$ accumulates slices along the $${varName}$-axis (yielding $\\frac{1}{3}${varName}^3$ for $${varName}^2$). If this were $\\mathrm{d}y$, $${varName}$ would be treated as a constant factor, yielding $${varName}^2 y$ instead.`,
        showMe: `Riemann sum convergence: partitioning the domain into $n$ strips of width $\\Delta ${varName}$ whose sum $\\sum f(${varName}_i) \\Delta ${varName}$ converges to the exact integral as $n \\to \\infty$.`,
        goDeeper: `Fundamental Theorem of Calculus: $\\int_a^b f(${varName}) \\, \\mathrm{d}${varName} = F(b) - F(a)$ where $F'(${varName}) = f(${varName})$.`,
      };
    }

    // Context B: Under Derivative / Differential Quotient (e.g. dy/dx or d/dx f(x))
    if (parent === 'derivative' || expr.includes('//') || expr.includes('d//') || expr.includes('/') || expr.includes('diff')) {
      return {
        symbol: sym,
        role: `Differential in Denominator of Derivative ($\\mathrm{d}${varName}$)`,
        whatItIs: `The infinitesimal change in independent variable $${varName}$, serving as the denominator in the instantaneous rate of change $\\frac{\\mathrm{d}y}{\\mathrm{d}${varName}}$.`,
        whyItIsHere: `It defines the variable with respect to which rate-of-change is measured in $\\lim_{\\Delta ${varName} \\to 0} \\frac{\\Delta y}{\\Delta ${varName}}$. Changing this to $\\mathrm{d}t$ would measure the time derivative $\\frac{\\mathrm{d}y}{\\mathrm{d}t}$ rather than spatial rate of change.`,
        showMe: `Secant line slope $\\frac{f(${varName} + \\Delta ${varName}) - f(${varName})}{\\Delta ${varName}}$ converging to the tangent line slope as $\\Delta ${varName} \\to 0$.`,
        goDeeper: `Leibniz notation and Chain Rule: $\\frac{\\mathrm{d}z}{\\mathrm{d}${varName}} = \\frac{\\mathrm{d}z}{\\mathrm{d}u} \\frac{\\mathrm{d}u}{\\mathrm{d}${varName}}$.`,
      };
    }

    // Default differential
    return {
      symbol: sym,
      role: `Infinitesimal Differential (\\mathrm{d}${varName})`,
      whatItIs: `An infinitesimal change in the quantity $${varName}$.`,
      whyItIsHere: `Represents the first-order differential variation $\\mathrm{d}${varName}$.`,
      showMe: `Linear differential approximation $\\mathrm{d}f = f'(${varName}) \\, \\mathrm{d}${varName}$.`,
      goDeeper: `Differential 1-forms in exterior calculus.`,
    };
  }

  // Case 2: Integral Operator
  if (sym === '\u222b' || sym === '\\int' || sym === 'integral') {
    const hasBounds = context.bounds && (context.bounds.lower || context.bounds.upper);
    return {
      symbol: '\u222b',
      role: hasBounds ? 'Definite Integration Operator' : 'Indefinite Antiderivative Operator',
      whatItIs: `Continuous accumulation operator (Leibniz elongated S from Latin *summa*).`,
      whyItIsHere: hasBounds
        ? `Computes the net signed area/volume under the integrand between limits $${context.bounds?.lower ?? 'a'}$ and $${context.bounds?.upper ?? 'b'}$.`
        : `Calculates the general antiderivative family $F(x) + C$ whose derivative recovers the integrand.`,
      showMe: `Continuous area accumulation partitioned into Riemann rectangles.`,
      goDeeper: `Riemann-Darboux integral formulation and Lebesgue measure generalization.`,
    };
  }

  // Case 3: Partial Differential Operator
  if (sym === '\u2202' || sym === '\\partial') {
    return {
      symbol: '\u2202',
      role: 'Partial Derivative Operator',
      whatItIs: `Denotes partial differentiation with respect to a single independent variable in a multivariable system.`,
      whyItIsHere: `Instructs the engine to vary only the specified coordinate while treating all other independent variables as constant parameters. Replacing this with total derivative $\\mathrm{d}$ would require tracing implicit inter-variable dependencies.`,
      showMe: `3D surface cross-section tangent line along a single coordinate axis plane.`,
      goDeeper: `Clairaut's theorem on the equality of mixed partial derivatives $\\frac{\\partial^2 f}{\\partial x \\partial y} = \\frac{\\partial^2 f}{\\partial y \\partial x}$.`,
    };
  }

  // Case 4: Differential Operator 'd' (stand-alone)
  if (sym === 'd') {
    return {
      symbol: 'd',
      role: 'Differential Operator',
      whatItIs: `Exterior differential operator $\\mathrm{d}$.`,
      whyItIsHere: `Forms differentials and derivative ratios (e.g. $\\frac{\\mathrm{d}}{\\mathrm{d}x}$). Removing it reduces differential quotients to ordinary algebraic division.`,
      showMe: `First-order linear differential approximation.`,
      goDeeper: `Differential forms and Stokes' generalized theorem $\\int_{\\partial \\Omega} \\omega = \\int_{\\Omega} \\mathrm{d}\\omega$.`,
    };
  }

  // Case 5: Summation Operator
  if (sym === '\u03a3' || sym === '\\sum' || sym === 'sum') {
    return {
      symbol: '\u03a3',
      role: 'Discrete Summation Operator',
      whatItIs: `Discrete accumulator (Greek capital Sigma) summing terms across integer indices.`,
      whyItIsHere: `Evaluates the sum of sequential terms $a_n$. Unlike continuous integration $\\int$, index steps advance by discrete units $\\Delta n = 1$.`,
      showMe: `Partial sum sequence $S_N = \\sum_{n=1}^N a_n$ plotted against index $N$.`,
      goDeeper: `Series convergence criteria: Cauchy criterion, Ratio test, and Integral test comparison.`,
    };
  }

  // Case 6: Limit Operator 'lim'
  if (sym === 'lim' || sym === '\\lim') {
    return {
      symbol: 'lim',
      role: 'Asymptotic Limit Operator',
      whatItIs: `Analyzes the value that a function approaches as its input arbitrarily nears a target point.`,
      whyItIsHere: `Resolves indeterminate algebraic forms (such as $\\frac{0}{0}$ or $\\frac{\\infty}{\\infty}$) and defines continuity and differentiability at singular points.`,
      showMe: `$\\epsilon$-$\\delta$ neighborhood bands contracting around the target point $(x_0, L)$.`,
      goDeeper: `Weierstrass $(\\epsilon, \\delta)$ formal limit definition and L'Hôpital's rule.`,
    };
  }

  // Fallback generic
  return {
    symbol: sym,
    role: `Mathematical Symbol (${sym})`,
    whatItIs: `Symbol $${sym}$ in current expression context.`,
    whyItIsHere: `Contributes to the syntax of the current mathematical expression.`,
    showMe: `Evaluated expression visualization.`,
    goDeeper: `Formal definition and mathematical semantics.`,
  };
}
