import { describe, it, expect } from 'vitest';
import { compileRelation } from '../core/compiler';
import { parse } from '../core/parser';

describe('P2.3 Performance & Correctness Fuzzer: 1,000,000 Evaluations', () => {
  it('verifies exact equivalence between batch evaluation and pointwise evaluation over 1,000,000 randomized cases', () => {
    // 1. Define distinct mathematical relation expressions
    const testExpressions = [
      'x^2 + y^2 - 4',
      'x * y - 1',
      '(x - 1)^2 + (y + 2)^2 - 9',
      'x^3 - 3*x*y^2 - 1',
      'x^2 / 4 + y^2 / 9 - 1',
      'x^4 + y^4 - (x^2 + y^2)',
      'x^2 - y^2 - 1',
      '(x^2 + y^2 - 1)^3 - x^2 * y^3',
      '2 * x + 3 * y - 5',
      'x^2 + y^2 + x*y - 3',
    ];

    const compiledFns = testExpressions.map(expr => {
      const ast = parse(expr);
      const res = compileRelation(ast, ['x', 'y']);
      if (!res.success) throw new Error(`Compilation failed for ${expr}: ${res.reason}`);
      return { expr, fn: res.fn };
    });

    const TOTAL_EVALS = 1_000_000;
    const EVALS_PER_EXPR = TOTAL_EVALS / compiledFns.length; // 100,000 per expr
    const GRID_SIZE = 100; // 100x100 = 10,000 points per grid, 10 grids per expr = 100,000 points

    let maxAbsoluteDeviation = 0;
    let verifiedPointCount = 0;

    // Linear Congruential Generator for deterministic, fast pseudo-random floats
    let seed = 42;
    function nextFloat(min: number, max: number): number {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      const u = seed / 4294967296;
      return min + u * (max - min);
    }

    for (const { fn } of compiledFns) {
      expect(fn.batch2D).toBeDefined();

      const numGrids = EVALS_PER_EXPR / (GRID_SIZE * GRID_SIZE);
      for (let g = 0; g < numGrids; g++) {
        const xMin = nextFloat(-10, 0);
        const xMax = nextFloat(0, 10);
        const yMin = nextFloat(-10, 0);
        const yMax = nextFloat(0, 10);

        const nx = GRID_SIZE;
        const ny = GRID_SIZE;
        const dx = (xMax - xMin) / (nx - 1);
        const dy = (yMax - yMin) / (ny - 1);

        const batchBuffer = new Float64Array(nx * ny);
        fn.batch2D!(batchBuffer, xMin, dx, nx, yMin, dy, ny);

        // Verify pointwise against batchBuffer
        let idx = 0;
        for (let j = 0; j < ny; j++) {
          const y = yMin + j * dy;
          for (let i = 0; i < nx; i++) {
            const x = xMin + i * dx;
            const expected = fn(x, y);
            const actual = batchBuffer[idx++];

            const diff = Math.abs(expected - actual);
            if (diff > maxAbsoluteDeviation) {
              maxAbsoluteDeviation = diff;
            }
            if (Number.isNaN(expected)) {
              expect(Number.isNaN(actual)).toBe(true);
            } else {
              expect(diff).toBeLessThan(1e-12);
            }
            verifiedPointCount++;
          }
        }
      }
    }

    expect(verifiedPointCount).toBe(TOTAL_EVALS);
    expect(maxAbsoluteDeviation).toBe(0);
  });

  it('verifies 3D batch evaluation equivalence over 100,000 randomized points', () => {
    const expr = 'x^2 + y^2 + z^2 - 4';
    const ast = parse(expr);
    const res = compileRelation(ast, ['x', 'y', 'z']);
    expect(res.success).toBe(true);
    const fn = (res as any).fn;
    expect(fn.batch3D).toBeDefined();

    const N = 46; // 46^3 = 97,336 points ~ 100k
    const xMin = -3, dx = 6 / (N - 1);
    const yMin = -3, dy = 6 / (N - 1);
    const zMin = -3, dz = 6 / (N - 1);

    const batchBuffer = new Float64Array(N * N * N);
    fn.batch3D!(batchBuffer, xMin, dx, N, yMin, dy, N, zMin, dz, N);

    let idx = 0;
    let maxDev = 0;
    for (let k = 0; k < N; k++) {
      const z = zMin + k * dz;
      for (let j = 0; j < N; j++) {
        const y = yMin + j * dy;
        for (let i = 0; i < N; i++) {
          const x = xMin + i * dx;
          const expected = fn(x, y, z);
          const actual = batchBuffer[idx++];
          const diff = Math.abs(expected - actual);
          if (diff > maxDev) maxDev = diff;
        }
      }
    }

    expect(maxDev).toBe(0);
  });
});
