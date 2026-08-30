import { describe, it, expect } from 'vitest';
import { evaluate, createInitialEnvironment } from '../core/evaluator';

describe('Benchmark: 10,000-character expression', () => {
  it('parses and evaluates a 10,000-character mathematical expression cleanly', () => {
    // Generate a long arithmetic expression with nested structures, sums, and multiplications:
    // e.g. "1/2 + 1/3 + 1/4 + 1/5 + ..." repeated or structured
    let expr = '1';
    while (expr.length < 10000) {
      expr += ' + (2 * 3 + 4 / 2 - 1)';
    }

    expect(expr.length).toBeGreaterThanOrEqual(10000);

    const env = createInitialEnvironment();
    const startTime = performance.now();
    const { ast, value } = evaluate(expr, env);
    const endTime = performance.now();

    const durationMs = endTime - startTime;
    console.log(`10,000-character expression length: ${expr.length} chars, duration: ${durationMs.toFixed(2)}ms`);

    expect(ast).toBeDefined();
    expect(value.type).toBe('rational');
    expect(durationMs).toBeLessThan(1000); // Must be fast (< 1s)
  });
});
