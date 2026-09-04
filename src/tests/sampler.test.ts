import { describe, it, expect } from 'vitest';
import { parse } from '../core/parser';
import { compileRelation, CompileSuccess } from '../core/compiler';
import { createInitialEnvironment } from '../core/evaluator';
import { sample2D, sample3D, sampleSlice, findBounds2D, Contour2DResult } from '../core/sampler';
import { performance } from 'perf_hooks';

describe('Phase 2: The Sampler', () => {
  const env = createInitialEnvironment();

  function compile(expr: string, vars: string[]) {
    const ast = parse(expr);
    const res = compileRelation(ast, vars, env);
    if (!res.success) {
      throw new Error(`Failed to compile "${expr}": ${(res as any).reason}`);
    }
    return (res as CompileSuccess).fn;
  }

  describe('Degenerate Cases', () => {
    it('handles relation holding nowhere in window (returns empty)', () => {
      const fn = compile('x^2 + y^2 + 10', ['x', 'y']); // always >= 10
      const res = sample2D(fn, [-3, 3], [-3, 3], 100);
      expect(res.polylines).toHaveLength(0);
      expect(res.bounds).toBeNull();
    });

    it('handles relation holding nowhere in 3D window (returns empty mesh)', () => {
      const fn = compile('x^2 + y^2 + z^2 + 10', ['x', 'y', 'z']);
      const res = sample3D(fn, [-3, 3], [-3, 3], [-3, 3], 30);
      expect(res.vertices).toHaveLength(0);
      expect(res.triangles).toHaveLength(0);
      expect(res.bounds).toBeNull();
    });

    it('handles relation holding everywhere (0 = 0)', () => {
      const fn = compile('0', ['x', 'y']);
      expect(() => {
        const res = sample2D(fn, [-5, 5], [-5, 5], 50);
        for (const poly of res.polylines) {
          for (const [x, y] of poly.points) {
            expect(Number.isFinite(x)).toBe(true);
            expect(Number.isFinite(y)).toBe(true);
          }
        }
      }).not.toThrow();
    });

    it('handles contour passing exactly through a grid node without NaN or division by zero', () => {
      // x = 0 with symmetric grid around 0
      const fn = compile('x', ['x', 'y']);
      const res = sample2D(fn, [-2, 2], [-2, 2], 5); // grid nodes at x = -2, -1, 0, 1, 2
      expect(res.polylines.length).toBeGreaterThan(0);
      for (const poly of res.polylines) {
        for (const [x, y] of poly.points) {
          expect(Number.isNaN(x)).toBe(false);
          expect(Number.isNaN(y)).toBe(false);
          expect(Math.abs(x)).toBeLessThanOrEqual(1e-12);
        }
      }
    });

    it('handles relation with a pole in window (1/x = 0) without hang, throw, or NaN', () => {
      const fn = compile('1 / x', ['x', 'y']);
      expect(() => {
        const res = sample2D(fn, [-2, 2], [-2, 2], 50);
        for (const poly of res.polylines) {
          for (const [x, y] of poly.points) {
            expect(Number.isNaN(x)).toBe(false);
            expect(Number.isNaN(y)).toBe(false);
            expect(Number.isFinite(x)).toBe(true);
            expect(Number.isFinite(y)).toBe(true);
          }
        }
      }).not.toThrow();
    });

    it('handles constant relation (5 = 0)', () => {
      const fn = compile('5', ['x', 'y']);
      const res = sample2D(fn, [-10, 10], [-10, 10], 40);
      expect(res.polylines).toHaveLength(0);
      expect(res.bounds).toBeNull();
    });

    it('handles singular point where gradient vanishes (x^2 + y^2 = 0 and x^2 - y^2 = 0)', () => {
      const fnOrigin = compile('x^2 + y^2', ['x', 'y']);
      expect(() => {
        const res = sample2D(fnOrigin, [-2, 2], [-2, 2], 50);
        for (const poly of res.polylines) {
          for (const [x, y] of poly.points) {
            expect(Number.isFinite(x)).toBe(true);
            expect(Number.isFinite(y)).toBe(true);
          }
        }
      }).not.toThrow();

      const fnCross = compile('x^2 - y^2', ['x', 'y']);
      expect(() => {
        const resCross = sample2D(fnCross, [-3, 3], [-3, 3], 60);
        expect(resCross.polylines.length).toBeGreaterThan(0);
      }).not.toThrow();
    });

    it('handles minimal resolutions (resolution 1 and resolution 2)', () => {
      const fn = compile('x^2 + y^2 - 4', ['x', 'y']);
      // Resolution 1
      const res1 = sample2D(fn, [-3, 3], [-3, 3], 1);
      expect(res1.polylines).toHaveLength(0);

      // Resolution 2
      expect(() => {
        const res2 = sample2D(fn, [-3, 3], [-3, 3], 2);
        for (const poly of res2.polylines) {
          for (const [x, y] of poly.points) {
            expect(Number.isFinite(x)).toBe(true);
            expect(Number.isFinite(y)).toBe(true);
          }
        }
      }).not.toThrow();
    });

    it('handles range of zero width cleanly without division by zero', () => {
      const fn = compile('x + y', ['x', 'y']);
      const resZeroX = sample2D(fn, [2, 2], [-2, 2], 50);
      expect(resZeroX.polylines).toHaveLength(0);

      const resZeroBoth = sample2D(fn, [2, 2], [3, 3], 50);
      expect(resZeroBoth.polylines).toHaveLength(0);
    });
  });

  describe('Correctness Gate: Exact Numerical Manifold Verification', () => {
    it('1. x^2 + y^2 = 4 (Circle radius 2, assert |sqrt(x^2+y^2) - 2| < resolution step)', () => {
      const fn = compile('x^2 + y^2 - 4', ['x', 'y']);
      const res = sample2D(fn, [-3, 3], [-3, 3], 200);
      expect(res.polylines.length).toBeGreaterThan(0);

      const step = 6.0 / 199; // ~0.03015
      let maxDev = 0;
      let pointCount = 0;

      for (const poly of res.polylines) {
        for (const [x, y] of poly.points) {
          const r = Math.sqrt(x * x + y * y);
          const dev = Math.abs(r - 2.0);
          if (dev > maxDev) maxDev = dev;
          expect(dev).toBeLessThan(step);
          pointCount++;
        }
      }

      console.log(`\n• Correctness 1: Circle x^2 + y^2 = 4:`);
      console.log(`  Points sampled: ${pointCount}, Max deviation: ${maxDev.toExponential(4)} (resolution step: ${step.toFixed(4)})`);
      expect(pointCount).toBeGreaterThan(100);
      expect(maxDev).toBeLessThan(step);
    });

    it('2. y = x^2 (Parabola, assert |y - x^2| < tolerance)', () => {
      const fn = compile('y - x^2', ['x', 'y']);
      const res = sample2D(fn, [-3, 3], [-1, 9], 200);
      expect(res.polylines.length).toBeGreaterThan(0);

      let maxDev = 0;
      let pointCount = 0;

      for (const poly of res.polylines) {
        for (const [x, y] of poly.points) {
          const expectedY = x * x;
          const dev = Math.abs(y - expectedY);
          if (dev > maxDev) maxDev = dev;
          expect(dev).toBeLessThan(0.02);
          pointCount++;
        }
      }

      console.log(`• Correctness 2: Parabola y = x^2:`);
      console.log(`  Points sampled: ${pointCount}, Max deviation: ${maxDev.toExponential(4)}`);
      expect(pointCount).toBeGreaterThan(50);
      expect(maxDev).toBeLessThan(0.02);
    });

    it('3. x = 0 (Vertical line, assert |x| < 1e-12)', () => {
      const fn = compile('x', ['x', 'y']);
      const res = sample2D(fn, [-2, 2], [-5, 5], 100);
      expect(res.polylines.length).toBeGreaterThan(0);

      let maxDev = 0;
      let pointCount = 0;

      for (const poly of res.polylines) {
        for (const [x] of poly.points) {
          const dev = Math.abs(x);
          if (dev > maxDev) maxDev = dev;
          expect(dev).toBeLessThan(1e-12);
          pointCount++;
        }
      }

      console.log(`• Correctness 3: Vertical line x = 0:`);
      console.log(`  Points sampled: ${pointCount}, Max deviation: ${maxDev.toExponential(4)}`);
      expect(pointCount).toBeGreaterThan(50);
      expect(maxDev).toBeLessThan(1e-12);
    });

    it('4. y = sin(x) (Over -2pi..2pi, assert |y - sin(x)| < tolerance)', () => {
      const fn = compile('y - sin(x)', ['x', 'y']);
      const res = sample2D(fn, [-2 * Math.PI, 2 * Math.PI], [-1.5, 1.5], 250);
      expect(res.polylines.length).toBeGreaterThan(0);

      let maxDev = 0;
      let pointCount = 0;

      for (const poly of res.polylines) {
        for (const [x, y] of poly.points) {
          const expectedY = Math.sin(x);
          const dev = Math.abs(y - expectedY);
          if (dev > maxDev) maxDev = dev;
          expect(dev).toBeLessThan(0.01);
          pointCount++;
        }
      }

      console.log(`• Correctness 4: Sine wave y = sin(x):`);
      console.log(`  Points sampled: ${pointCount}, Max deviation: ${maxDev.toExponential(4)}`);
      expect(pointCount).toBeGreaterThan(100);
      expect(maxDev).toBeLessThan(0.01);
    });

    it('5. x^2 + y^2 + z^2 = 4 (3D sphere, assert every vertex satisfies |sqrt(x^2+y^2+z^2) - 2| < tolerance)', () => {
      const fn = compile('x^2 + y^2 + z^2 - 4', ['x', 'y', 'z']);
      const mesh = sample3D(fn, [-3, 3], [-3, 3], [-3, 3], 60);
      expect(mesh.vertices.length).toBeGreaterThan(1000);
      expect(mesh.triangles.length).toBeGreaterThan(1000);

      let maxDev = 0;
      for (const [x, y, z] of mesh.vertices) {
        const r = Math.sqrt(x * x + y * y + z * z);
        const dev = Math.abs(r - 2.0);
        if (dev > maxDev) maxDev = dev;
        expect(dev).toBeLessThan(0.05);
      }

      console.log(`• Correctness 5: 3D Sphere x^2 + y^2 + z^2 = 4:`);
      console.log(`  Vertices: ${mesh.vertices.length}, Triangles: ${mesh.triangles.length}, Max deviation: ${maxDev.toExponential(4)}`);
      expect(maxDev).toBeLessThan(0.05);
    });

    it('6. x^2 - y^2 = 1 (Hyperbola, assert both branches returned and |x^2 - y^2 - 1| < tolerance)', () => {
      const fn = compile('x^2 - y^2 - 1', ['x', 'y']);
      const res = sample2D(fn, [-4, 4], [-4, 4], 200);
      expect(res.polylines.length).toBeGreaterThanOrEqual(2);

      let hasLeftBranch = false; // x < 0
      let hasRightBranch = false; // x > 0
      let maxDev = 0;
      let totalPoints = 0;

      for (const poly of res.polylines) {
        for (const [x, y] of poly.points) {
          if (x < -0.5) hasLeftBranch = true;
          if (x > 0.5) hasRightBranch = true;
          const dev = Math.abs(x * x - y * y - 1.0);
          if (dev > maxDev) maxDev = dev;
          expect(dev).toBeLessThan(0.05);
          totalPoints++;
        }
      }

      console.log(`• Correctness 6: Hyperbola x^2 - y^2 = 1:`);
      console.log(`  Polylines: ${res.polylines.length}, Points: ${totalPoints}, Both branches returned: ${hasLeftBranch && hasRightBranch}, Max deviation: ${maxDev.toExponential(4)}`);
      expect(hasLeftBranch).toBe(true);
      expect(hasRightBranch).toBe(true);
      expect(maxDev).toBeLessThan(0.05);
    });
  });

  describe('Performance Gate & Higher-Dimensional Slicing', () => {
    it('measures 40,000-point 2D sample, 216,000-point 3D sample, and 6-variable 2D slice', () => {
      // 1. 40,000-point 2D sample (200 x 200)
      const fn2D = compile('x^2 + y^2 - 4', ['x', 'y']);
      for (let w = 0; w < 3; w++) {
        sample2D(fn2D, [-3, 3], [-3, 3], 50);
      }
      let minTime2D = Infinity;
      let res2D: any;
      for (let trial = 0; trial < 3; trial++) {
        const t0 = performance.now();
        const curRes = sample2D(fn2D, [-3, 3], [-3, 3], 200);
        const t1 = performance.now();
        const wall = t1 - t0;
        if (wall < minTime2D) {
          minTime2D = wall;
          res2D = curRes;
        }
      }
      const time2DMs = minTime2D;
      expect(res2D.sampleCount).toBe(40_000);

      // 2. 216,000-point 3D sample (60 x 60 x 60)
      const fn3D = compile('x^2 + y^2 + z^2 - 4', ['x', 'y', 'z']);
      for (let w = 0; w < 2; w++) {
        sample3D(fn3D, [-3, 3], [-3, 3], [-3, 3], 20);
      }
      let minTime3D = Infinity;
      let res3D: any;
      for (let trial = 0; trial < 3; trial++) {
        const t2 = performance.now();
        const curRes = sample3D(fn3D, [-3, 3], [-3, 3], [-3, 3], 60);
        const t3 = performance.now();
        const wall = t3 - t2;
        if (wall < minTime3D) {
          minTime3D = wall;
          res3D = curRes;
        }
      }
      const time3DMs = minTime3D;
      expect(res3D.sampleCount).toBe(216_000);

      // 3. 6-variable relation sampled on a 2D slice (200 x 200 = 40,000 points)
      // Space: R^6, Equation: x^2 + y^2 + z^2 + u^2 + v^2 + w^2 = 16
      // Sliced at: z = 1, u = 1, v = 1, w = 1 -> effective 2D slice: x^2 + y^2 = 12 (radius = sqrt(12) ~ 3.464)
      const fn6D = compile('x^2 + y^2 + z^2 + u^2 + v^2 + w^2 - 16', ['x', 'y', 'z', 'u', 'v', 'w']);
      // Warm up slice generator and JIT
      for (let w = 0; w < 5; w++) {
        sampleSlice(fn6D, ['x', 'y', 'z', 'u', 'v', 'w'], ['x', 'y'], { z: 1, u: 1, v: 1, w: 1 }, [[-5, 5], [-5, 5]], 200);
      }
      const t4 = performance.now();
      const resSlice = sampleSlice(
        fn6D,
        ['x', 'y', 'z', 'u', 'v', 'w'],
        ['x', 'y'],
        { z: 1, u: 1, v: 1, w: 1 },
        [[-5, 5], [-5, 5]],
        200
      ) as Contour2DResult;
      const t5 = performance.now();
      const timeSlice6DMs = t5 - t4;
      expect(resSlice.sampleCount).toBe(40_000);

      // Assert 6D slice manifold is correct: circle of radius sqrt(12)
      expect(resSlice.polylines.length).toBeGreaterThan(0);
      const targetRadius = Math.sqrt(12);
      let sliceMaxDev = 0;
      for (const poly of resSlice.polylines) {
        for (const [x, y] of poly.points) {
          const r = Math.sqrt(x * x + y * y);
          const dev = Math.abs(r - targetRadius);
          if (dev > sliceMaxDev) sliceMaxDev = dev;
          expect(dev).toBeLessThan(0.05);
        }
      }

      console.log('\n--- SAMPLER PERFORMANCE GATE TIMINGS ---');
      console.log(`• 40,000-point 2D sample (200x200): ${time2DMs.toFixed(3)} ms`);
      console.log(`• 216,000-point 3D sample (60x60x60): ${time3DMs.toFixed(3)} ms`);
      console.log(`• 6-variable relation 2D slice sample (200x200 = 40k points): ${timeSlice6DMs.toFixed(3)} ms (Max slice dev: ${sliceMaxDev.toExponential(4)})`);

      // Both 2D and 6D-slice must execute well within 60 FPS frame time (< 16.6ms)
      expect(time2DMs).toBeLessThan(15.0);
      expect(timeSlice6DMs).toBeLessThan(15.0);
      expect(time3DMs).toBeLessThan(150.0);
    });
  });

  describe('Zoom-to-Fit Bounds Discovery', () => {
    it('finds tight bounding box on 2D relation or returns null when holding nowhere', () => {
      const fnCircle = compile('x^2 + y^2 - 4', ['x', 'y']);
      const bounds = findBounds2D(fnCircle, [-10, 10], [-10, 10], 30);
      expect(bounds).not.toBeNull();
      if (bounds) {
        expect(bounds.minX).toBeLessThan(-1.8);
        expect(bounds.maxX).toBeGreaterThan(1.8);
        expect(bounds.minY).toBeLessThan(-1.8);
        expect(bounds.maxY).toBeGreaterThan(1.8);
      }

      const fnNowhere = compile('x^2 + y^2 + 100', ['x', 'y']);
      const nullBounds = findBounds2D(fnNowhere, [-10, 10], [-10, 10], 30);
      expect(nullBounds).toBeNull();
    });
  });
});
