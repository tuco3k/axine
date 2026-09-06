import { describe, it, expect } from "vitest";
import { sample2D } from "../core/sampler";

describe("Phase 1 Gate: Warm-Start Search in Sampler", () => {
  it("samples 40,000 points of :sqrt(X^2 + Y^2) = 2 in under 0.5s with warm-start fallback tracking", () => {
    const N = 200; // 200x200 = 40,000 grid points
    const TOL = 1e-12;
    const MAX_ITER = 30;

    function warmSqrtRelation(x: number, y: number, seed?: number): number {
      const u = x * x + y * y;
      if (u <= 0) return -2.0;

      let v = (seed !== undefined && Number.isFinite(seed) && seed + 2 > 1e-6) ? (seed + 2) : 1.5;
      let it = 0;
      while (it < MAX_ITER) {
        it++;
        const nextV = 0.5 * (v + u / v);
        if (Math.abs(nextV - v) < TOL || Math.abs(nextV * nextV - u) < TOL) {
          v = nextV;
          break;
        }
        v = nextV;
      }

      if (Math.abs(v * v - u) > 1e-6) {
        return Number.NaN;
      }
      return v - 2.0;
    }

    for (let w = 0; w < 5; w++) {
      sample2D(warmSqrtRelation, [-3, 3], [-3, 3], N);
    }

    const t0 = performance.now();
    const result = sample2D(warmSqrtRelation, [-3, 3], [-3, 3], N);
    const t1 = performance.now();
    const elapsedMs = t1 - t0;

    console.log("\n--- PHASE 1 GATE RESULTS ---");
    console.log(`• 40,000 samples of :sqrt(X^2 + Y^2) = 2 wall time: ${elapsedMs.toFixed(3)} ms (${(elapsedMs / 1000).toFixed(4)} s)`);
    console.log(`• Sample Count: ${result.sampleCount}`);
    console.log(`• Fallback Count: ${result.fallbackCount ?? 0}`);
    console.log(`• Polylines extracted: ${result.polylines.length}`);
    if (result.bounds) {
      console.log(`• Contour Bounds: X=[${result.bounds.minX.toFixed(4)}, ${result.bounds.maxX.toFixed(4)}], Y=[${result.bounds.minY.toFixed(4)}, ${result.bounds.maxY.toFixed(4)}]`);
    }

    expect(result.sampleCount).toBe(40000);
    expect(elapsedMs).toBeLessThan(500);
    expect(result.polylines.length).toBeGreaterThanOrEqual(1);

    let maxRadialDeviation = 0;
    for (const poly of result.polylines) {
      for (const [px, py] of poly.points) {
        const r = Math.sqrt(px * px + py * py);
        const dev = Math.abs(r - 2.0);
        if (dev > maxRadialDeviation) maxRadialDeviation = dev;
      }
    }
    console.log(`• Max Radial Deviation from R=2: ${maxRadialDeviation.toExponential(4)}`);
    expect(maxRadialDeviation).toBeLessThan(0.01);
  });
});
