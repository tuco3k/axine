import { describe, it, expect } from 'vitest';
import { explainSymbol, getRiemannRuleExplanation } from '../core/explainer';
import { typesetMath } from '../core/math_typeset';

describe('Phase 9 — Contextual Mathematical Explainer (Part F2)', () => {
  it('produces context-dependent explanations for dx in integral vs derivative (Gate Requirement)', () => {
    // Context A: dx in \u222b x^2 dx
    const expIntegral = explainSymbol('dx', {
      parentType: 'integral',
      integrand: 'x^2',
      variableName: 'x',
    });

    // Context B: dx in dy/dx
    const expDerivative = explainSymbol('dx', {
      parentType: 'derivative',
      variableName: 'x',
    });

    // Gate assertions:
    expect(expIntegral.symbol).toBe('dx');
    expect(expDerivative.symbol).toBe('dx');

    // 1. Roles are fundamentally different
    expect(expIntegral.role).toContain('Variable of Integration');
    expect(expDerivative.role).toContain('Differential in Denominator');

    // 2. What it is
    expect(expIntegral.whatItIs).toContain('infinitesimal displacement');
    expect(expIntegral.whatItIs).toContain('accumulation variable');
    expect(expDerivative.whatItIs).toContain('infinitesimal change in independent variable');
    expect(expDerivative.whatItIs).toContain('rate of change');

    // 3. Why it is here explains the consequence of changing the variable
    expect(expIntegral.whyItIsHere).toContain('yielding');
    expect(expIntegral.whyItIsHere).toContain('If this were');
    expect(expIntegral.whyItIsHere).toContain('treated as a constant factor');

    expect(expDerivative.whyItIsHere).toContain('rate-of-change is measured');
    expect(expDerivative.whyItIsHere).toContain('measure the time derivative');

    // 4. They must NOT be identical strings
    expect(expIntegral.whatItIs).not.toBe(expDerivative.whatItIs);
    expect(expIntegral.whyItIsHere).not.toBe(expDerivative.whyItIsHere);
  });

  it('generates contextual explanations for partial derivative \u2202', () => {
    const expPartial = explainSymbol('\u2202', {
      parentType: 'partial_derivative',
      exprString: '\u2202//\u2202x f(x, y)',
    });

    expect(expPartial.role).toContain('Partial Derivative Operator');
    expect(expPartial.whatItIs).toContain('partial differentiation');
    expect(expPartial.whyItIsHere).toContain('treating all other independent variables as constant');
    expect(expPartial.goDeeper).toContain("Clairaut's theorem");
  });

  it('generates contextual explanations for definite and indefinite integral operator \u222b', () => {
    const expDefinite = explainSymbol('\u222b', {
      parentType: 'integral',
      bounds: { lower: '0', upper: 'inf' },
    });

    expect(expDefinite.role).toContain('Definite Integration Operator');
    expect(expDefinite.whatItIs).toContain('Continuous accumulation operator');
    expect(expDefinite.whyItIsHere).toContain('net signed area/volume');

    const expIndefinite = explainSymbol('\u222b', {
      parentType: 'integral',
    });

    expect(expIndefinite.role).toContain('Indefinite Antiderivative Operator');
    expect(expIndefinite.whyItIsHere).toContain('general antiderivative family');
  });

  it('generates contextual explanations for summation operator \u03a3', () => {
    const expSum = explainSymbol('\u03a3', {
      parentType: 'summation',
    });

    expect(expSum.role).toContain('Discrete Summation Operator');
    expect(expSum.whatItIs).toContain('Greek capital Sigma');
    expect(expSum.whyItIsHere).toContain('discrete units');
    expect(expSum.showMe).toContain('Partial sum sequence');
  });

  it('generates contextual explanations for limit operator lim', () => {
    const expLim = explainSymbol('lim', {
      parentType: 'limit',
    });

    expect(expLim.role).toContain('Asymptotic Limit Operator');
    expect(expLim.whatItIs).toContain('approaches as its input arbitrarily nears');
    expect(expLim.whyItIsHere).toContain('indeterminate algebraic forms');
    expect(expLim.showMe).toContain('neighborhood bands');
  });

  it('generates contextual explanations for differential operator d', () => {
    const expDiff = explainSymbol('d', {
      parentType: 'derivative',
    });

    expect(expDiff.role).toContain('Differential Operator');
    expect(expDiff.whatItIs).toContain('Exterior differential operator');
    expect(expDiff.goDeeper).toContain("Stokes'");
  });

  it('renders d//dx f(x) with f(x) outside the differential operator fraction', () => {
    const html = typesetMath('d//dx f(x)');

    // The fraction tm-frac must contain d in numerator and dx in denominator, NOT f(x)
    expect(html).toContain('tm-diff-frac');
    expect(html).toContain('<span class="tm-den-box"><span class="tm-diff tm-clickable" data-symbol="dx" data-parent-type="derivative" data-var="x"><span class="tm-diff-d">d</span><span class="tm-var">x</span></span></span>');
    // f(x) must appear after the closing </span> of the fraction
    const fracEndIdx = html.indexOf('</span></span>');
    const fIdx = html.indexOf('<span class="tm-var">f</span>');
    expect(fIdx).toBeGreaterThan(fracEndIdx);
  });

  it('generates distinct rule-dependent explanation text for Left, Midpoint, and Right Riemann sums', () => {
    const leftText = explainSymbol('dx', { parentType: 'integral', integrand: '3*x + 1' });
    // Default is midpoint
    expect(leftText.showMe).toContain('Midpoint Riemann sum');
    expect(leftText.showMe).toContain('Exact on linear functions');

    // Dynamic rule explanation generator
    const leftDesc = getRiemannRuleExplanation('left', 'x');
    const midDesc = getRiemannRuleExplanation('midpoint', 'x');
    const rightDesc = getRiemannRuleExplanation('right', 'x');

    expect(leftDesc).toContain('Left Riemann sum');
    expect(leftDesc).toContain('underestimate');

    expect(midDesc).toContain('Midpoint Riemann sum');
    expect(midDesc).toContain('linear functions');

    expect(rightDesc).toContain('Right Riemann sum');
    expect(rightDesc).toContain('overestimate');

    // All three descriptions must be mutually distinct
    expect(leftDesc).not.toBe(midDesc);
    expect(midDesc).not.toBe(rightDesc);
    expect(leftDesc).not.toBe(rightDesc);
  });
});

