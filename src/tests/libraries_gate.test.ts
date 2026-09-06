import { describe, it, expect } from "vitest";
import { evaluate, createInitialEnvironment } from "../core/evaluator";
import { valueToNumber } from "../core/numeric/tower";

describe("Phase 2 Gate: The Mathematical Libraries & Search Recurrences", () => {
  it("verifies documents/lib/sqrt.ax reduces :sqrt(4) to exact 2", () => {
    const env = createInitialEnvironment();
    evaluate(`\\import "lib/sqrt.ax"`, env);
    const res = evaluate(":sqrt(4)", env).value;
    expect(res.type).toBe("rational");
    expect((res as any).n).toBe(2n);
    expect((res as any).d).toBe(1n);
    console.log("• :sqrt(4) evaluated to exact rational:", res);
  });

  it("verifies documents/lib/sqrt.ax reduces :sqrt(2) to 1.41421356...", () => {
    const env = createInitialEnvironment();
    evaluate(`\\import "lib/sqrt.ax"`, env);
    const res = evaluate(":sqrt(2)", env).value;
    const num = valueToNumber(res);
    expect(Math.abs(num - 1.4142135623730951)).toBeLessThan(1e-9);
    console.log("• :sqrt(2) evaluated to:", num);
  });

  it("verifies documents/lib/sqrt.ax leaves :sqrt(-1) standing unreduced", () => {
    const env = createInitialEnvironment();
    evaluate(`\\import "lib/sqrt.ax"`, env);
    const res = evaluate(":sqrt(-1)", env).value;
    expect(res.type).toBe("expression");
    console.log("• :sqrt(-1) stands unreduced as:", (res as any).text || (res as any).ast?.type);
  });

  it("verifies documents/lib/abs.ax reduces :abs(-3) to 3", () => {
    const env = createInitialEnvironment();
    evaluate(`\\import "lib/abs.ax"`, env);
    const res = evaluate(":abs(-3)", env).value;
    expect(valueToNumber(res)).toBe(3);
  });

  it("verifies documents/lib/floor.ax reduces :floor(2.7) to 2", () => {
    const env = createInitialEnvironment();
    evaluate(`\\import "lib/floor.ax"`, env);
    const res = evaluate(":floor(2.7)", env).value;
    expect(valueToNumber(res)).toBe(2);
  });

  it("verifies documents/lib/trig.ax reduces :sin(0) to exactly 0", () => {
    const env = createInitialEnvironment();
    evaluate(`\\import "lib/trig.ax"`, env);
    const res = evaluate(":sin(0)", env).value;
    expect(valueToNumber(res)).toBe(0);
  });

  it("verifies documents/lib/numbertheory.ax reduces :gcd(12, 18) to 6", () => {
    const env = createInitialEnvironment();
    evaluate(`\\import "lib/numbertheory.ax"`, env);
    const res = evaluate(":gcd(12, 18)", env).value;
    expect(valueToNumber(res)).toBe(6);
  });

  it("verifies documents/lib/numbertheory.ax reduces :isprime(97) to true", () => {
    const env = createInitialEnvironment();
    evaluate(`\\import "lib/numbertheory.ax"`, env);
    const res = evaluate(":isprime(97)", env).value;
    expect(res.type).toBe("boolean");
    expect((res as any).value).toBe(true);
  });

  it("benchmarks Axine-level recurrence vs native loop for warm-start search", () => {
    const env = createInitialEnvironment();
    evaluate(`\\import "lib/newton.ax"`, env);

    const N = 1000;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      evaluate(":newton_sqrt(2)", env);
    }
    const t1 = performance.now();
    const axineTimeUs = ((t1 - t0) * 1000) / N;

    // Native loop for sqrt(2) (6 iterations)
    const t2 = performance.now();
    for (let i = 0; i < N; i++) {
      let v = 1.5;
      for (let k = 0; k < 6; k++) {
        v = 0.5 * (v + 2 / v);
      }
    }
    const t3 = performance.now();
    const nativeTimeUs = ((t3 - t2) * 1000) / N;

    console.log(`\n--- PHASE 2 RECURRENCE BENCHMARK ---`);
    console.log(`• Axine-level recurrence :newton_sqrt(2): ${axineTimeUs.toFixed(3)} µs/eval`);
    console.log(`• Native loop 6-step Newton: ${nativeTimeUs.toFixed(5)} µs/eval`);
  });
});
