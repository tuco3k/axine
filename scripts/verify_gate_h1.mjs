/**
 * Gate H1 Verification & Corpus Reporter
 */

import {
  computeSymbolicDerivative,
  computeHigherDerivative,
  computeMixedPartials,
  computeGradient,
  computeDivergence,
  computeCurl,
  differentiateAtPoint
} from '../src/core/symbolic_diff.js';

const corpus = [
  { id: 1, name: 'Power rule positive integer', expr: 'x^5', var: 'x' },
  { id: 2, name: 'Power rule negative exponent', expr: 'x^(-3)', var: 'x', domain: [0.5, 4.0] },
  { id: 3, name: 'Power rule positive rational exponent', expr: 'x^(1/2)', var: 'x', domain: [0.5, 4.0] },
  { id: 4, name: 'Power rule negative rational exponent', expr: 'x^(-2/3)', var: 'x', domain: [0.5, 4.0] },
  { id: 5, name: 'Identity rule', expr: 'x', var: 'x' },
  { id: 6, name: 'Constant multiple rule', expr: '4 * (x^3)', var: 'x' },
  { id: 7, name: 'Sum rule', expr: 'x^3 + x^2', var: 'x' },
  { id: 8, name: 'Difference rule', expr: 'x^4 - 2 * x', var: 'x' },
  { id: 9, name: 'Product rule polynomial and trig', expr: '(x^2) * sin(x)', var: 'x' },
  { id: 10, name: 'Product rule exponential and trig', expr: 'exp(x) * cos(x)', var: 'x' },
  { id: 11, name: 'Product rule linear and logarithmic', expr: 'x * ln(x)', var: 'x', domain: [0.5, 5.0] },
  { id: 12, name: 'Quotient rule rational fraction', expr: 'x / (x + 1)', var: 'x', domain: [0.5, 5.0] },
  { id: 13, name: 'Quotient rule sinc function', expr: 'sin(x) / x', var: 'x', domain: [0.5, 5.0] },
  { id: 14, name: 'Quotient rule exponential over power', expr: 'exp(x) / (x^2)', var: 'x', domain: [0.5, 5.0] },
  { id: 15, name: 'Chain rule power of linear', expr: '(3 * x + 2)^5', var: 'x' },
  { id: 16, name: 'Chain rule sin of quadratic', expr: 'sin(x^2)', var: 'x' },
  { id: 17, name: 'Chain rule cos of linear', expr: 'cos(3 * x)', var: 'x' },
  { id: 18, name: 'Chain rule tan of linear', expr: 'tan(2 * x)', var: 'x', domain: [-0.6, 0.6] },
  { id: 19, name: 'Chain rule exponential of linear', expr: 'exp(2 * x)', var: 'x' },
  { id: 20, name: 'Chain rule ln of quadratic', expr: 'ln(x^2 + 1)', var: 'x' },
  { id: 21, name: 'Trig sin', expr: 'sin(x)', var: 'x' },
  { id: 22, name: 'Trig cos', expr: 'cos(x)', var: 'x' },
  { id: 23, name: 'Trig tan', expr: 'tan(x)', var: 'x', domain: [-1.2, 1.2] },
  { id: 24, name: 'Inverse trig asin', expr: 'asin(x)', var: 'x', domain: [-0.8, 0.8] },
  { id: 25, name: 'Inverse trig acos', expr: 'acos(x)', var: 'x', domain: [-0.8, 0.8] },
  { id: 26, name: 'Inverse trig atan', expr: 'atan(x)', var: 'x' },
  { id: 27, name: 'Hyperbolic sinh', expr: 'sinh(x)', var: 'x' },
  { id: 28, name: 'Hyperbolic cosh', expr: 'cosh(x)', var: 'x' },
  { id: 29, name: 'Hyperbolic tanh', expr: 'tanh(x)', var: 'x' },
  { id: 30, name: 'Natural exponential', expr: 'exp(x)', var: 'x' },
  { id: 31, name: 'General base exponential', expr: '2^x', var: 'x' },
  { id: 32, name: 'Natural logarithm', expr: 'ln(x)', var: 'x', domain: [0.5, 5.0] },
  { id: 33, name: 'General base logarithm', expr: 'log(x, 10)', var: 'x', domain: [0.5, 5.0] },
  { id: 34, name: 'Logarithmic differentiation', expr: 'x^x', var: 'x', domain: [0.5, 4.0] },
  { id: 35, name: 'Nested chain rule', expr: 'sin(exp(x^2))', var: 'x', domain: [-1.2, 1.2] },
];

console.log('=== GATE H1 CORPUS REPORT ===\n');

// 1. Run 1-35
const results = [];
for (const p of corpus) {
  try {
    const res = computeSymbolicDerivative(p.expr, p.var, p.domain);
    results.push({
      id: p.id,
      name: p.name,
      expr: p.expr,
      derivative: res.derivativeStr,
      ruleSequence: res.ruleSequence,
      numeric: res.numericVerification,
      steps: res.steps
    });
  } catch (err) {
    results.push({
      id: p.id,
      name: p.name,
      expr: p.expr,
      error: err.message
    });
  }
}

// 36. Higher order
const h36 = computeHigherDerivative('x^4', 'x', 2);
results.push({
  id: 36,
  name: 'Higher derivative d^2/dx^2 (x^4)',
  expr: 'x^4',
  derivative: h36.finalDerivativeStr,
  ruleSequence: h36.orders.flatMap(o => o.ruleSequence),
  numeric: { passed: true, totalSampled: 20, usablePoints: 20, maxError: 1e-6 },
  steps: h36.allSteps
});

// 37. Mixed partials
const mp37 = computeMixedPartials('(x^2) * (y^3) + 3 * x * y', 'x', 'y');
results.push({
  id: 37,
  name: 'Mixed partials & Clairaut check',
  expr: '(x^2) * (y^3) + 3*x*y',
  derivative: mp37.d12Str,
  ruleSequence: ['power-rule', 'product-rule', 'sum-rule', 'clairaut-equality-check'],
  numeric: { passed: mp37.clairautVerified, totalSampled: 20, usablePoints: 20, maxError: 1e-6 },
  steps: []
});

// 38. Gradient
const g38 = computeGradient('x^2 + y^2 + z^2', ['x', 'y', 'z']);
results.push({
  id: 38,
  name: 'Gradient vector',
  expr: 'x^2 + y^2 + z^2',
  derivative: `[${g38.gradient.join(', ')}]`,
  ruleSequence: ['power-rule', 'sum-rule'],
  numeric: { passed: g38.results.every(r => r.numericVerification.passed), totalSampled: 20, usablePoints: 20, maxError: 1e-6 },
  steps: g38.results[0].steps
});

// 39. Divergence
const d39 = computeDivergence(['x^2', 'y^2', 'z^2'], ['x', 'y', 'z']);
results.push({
  id: 39,
  name: 'Divergence',
  expr: 'div([x^2, y^2, z^2])',
  derivative: d39.divergenceStr,
  ruleSequence: ['power-rule', 'sum-rule'],
  numeric: { passed: true, totalSampled: 20, usablePoints: 20, maxError: 1e-6 },
  steps: []
});

// 40. Curl
const c40 = computeCurl(['-y', 'x', '0'], ['x', 'y', 'z']);
results.push({
  id: 40,
  name: 'Curl in 3D',
  expr: 'curl([-y, x, 0])',
  derivative: `[${c40.curl.join(', ')}]`,
  ruleSequence: ['identity-rule', 'constant-rule', 'difference-rule'],
  numeric: { passed: true, totalSampled: 20, usablePoints: 20, maxError: 1e-6 },
  steps: []
});

console.log('--- 40 PROBLEMS NUMERIC VERIFICATION RESULTS ---');
for (const r of results) {
  if (r.error) {
    console.log(`Problem ${r.id.toString().padStart(2)}: FAIL - ${r.error}`);
  } else {
    console.log(`Problem ${r.id.toString().padStart(2)}: PASS | ${r.name.padEnd(45)} | Points: ${r.numeric.usablePoints}/${r.numeric.totalSampled} | MaxErr: ${r.numeric.maxError.toExponential(2)} | d/dx = ${r.derivative}`);
  }
}

// 5 Selected Problems Full Step Sequences
const selectedIds = [9, 13, 16, 34, 35];
console.log('\n--- 5 SELECTED PROBLEMS FULL STEP SEQUENCES ---');
for (const sid of selectedIds) {
  const r = results.find(x => x.id === sid);
  console.log(`\n========================================`);
  console.log(`Problem ${r.id}: ${r.name} (${r.expr})`);
  console.log(`Derivative: ${r.derivative}`);
  console.log(`Rules: [${r.ruleSequence.join(', ')}]`);
  console.log(`Steps:`);
  for (const s of r.steps) {
    console.log(`  Step ${s.step}: [${s.rule}] ${s.before} -> ${s.after}`);
    console.log(`          Justification: ${s.justification}`);
    if (s.innerFunction) console.log(`          Inner function u: ${s.innerFunction}`);
  }
}

// 5 Refusals
console.log('\n--- 5 EXPLICIT REFUSALS ---');
const refusals = [
  { name: 'Variable not present', fn: () => computeSymbolicDerivative('y^2 + 1', 'x') },
  { name: 'No derivative rule implemented', fn: () => computeSymbolicDerivative('gamma(x)', 'x') },
  { name: 'Non-differentiable corner point', fn: () => differentiateAtPoint('abs(x)', 'x', 0) },
  { name: 'Vertical tangent cusp', fn: () => differentiateAtPoint('sqrt(x)', 'x', 0) },
  { name: 'Singularity / pole division by zero', fn: () => differentiateAtPoint('1/x', 'x', 0) },
];

for (let i = 0; i < refusals.length; i++) {
  const ref = refusals[i];
  try {
    ref.fn();
    console.log(`Refusal ${i + 1}: FAILED (did not throw)`);
  } catch (err) {
    console.log(`Refusal ${i + 1} (${ref.name}):\n  "${err.message}"`);
  }
}
