import { evaluate, createInitialEnvironment } from '../src/core/evaluator';
import { parse } from '../src/core/parser';

const expressions = [
  'isolate(x^2 - 5x + 6 = 0, for: x)',
  'isolate(x^2 = 4, for: x)',
  'simplify((x^2 - 1)/(x - 1))',
  'd//dx (x^3 * sin x)',
  'check(3/4 * pi * r^2, is: "sphere volume")',
];

const env = createInitialEnvironment();
for (const expr of expressions) {
  console.log('=== EXPR:', expr, '===');
  try {
    const res = evaluate(expr, env);
    console.log('TYPE:', res.value?.type);
    console.log('RESULT:', JSON.stringify(res.value, null, 2));
  } catch (err) {
    console.error('ERROR:', err);
  }
}
