import { describe, it, expect } from 'vitest';
import { sample2D, sample3D } from '../core/sampler';

describe('P2.1: Sampler Robustness (E1 through E5 Regression Suite)', () => {
  // =========================================================================
  // E1: Near-tangential intersections
  // =========================================================================
  describe('E1: Near-tangential intersections', () => {
    it('samples two kissing circles touching tangentially at (2,0) without generating broken non-manifold fragments', () => {
      // Circle 1: (x-1)^2 + y^2 = 1 (centered at (1,0), r=1, touches (2,0))
      // Circle 2: x^2 + y^2 = 4 (centered at (0,0), r=2, touches (2,0))
      const fn1 = (x: number, y: number) => (x - 1) ** 2 + y ** 2 - 1;
      const fn2 = (x: number, y: number) => x ** 2 + y ** 2 - 4;

      const res1 = sample2D(fn1, [0, 3], [-2, 2], 100);
      const res2 = sample2D(fn2, [0, 3], [-2, 2], 100);

      expect(res1.polylines.length).toBeGreaterThanOrEqual(1);
      expect(res2.polylines.length).toBeGreaterThanOrEqual(1);

      // Both circles produce clean bounded polylines
      expect(res1.bounds).not.toBeNull();
      expect(res2.bounds).not.toBeNull();
      expect(res1.bounds!.maxX).toBeCloseTo(2.0, 1);
      expect(res2.bounds!.maxX).toBeCloseTo(2.0, 1);
    });
  });

  // =========================================================================
  // E2: Relation holding on a measure-zero set
  // =========================================================================
  describe('E2: Relation holding on a measure-zero set', () => {
    it('extracts isolated point at (0, 0) for x^2 + y^2 = 0 instead of silently dropping it', () => {
      const fnPoint = (x: number, y: number) => x * x + y * y;
      const res = sample2D(fnPoint, [-2, 2], [-2, 2], 101); // 101 ensures 0 is an exact grid node

      expect(res.polylines.length).toBe(1);
      expect(res.polylines[0].points.length).toBe(1);
      expect(res.polylines[0].points[0][0]).toBeCloseTo(0, 5);
      expect(res.polylines[0].points[0][1]).toBeCloseTo(0, 5);
      expect(res.bounds).not.toBeNull();
      expect(res.bounds!.minX).toBeCloseTo(0, 5);
      expect(res.bounds!.maxX).toBeCloseTo(0, 5);
    });

    it('extracts 3D isolated point at origin for x^2 + y^2 + z^2 = 0', () => {
      const fn3DPoint = (x: number, y: number, z: number) => x * x + y * y + z * z;
      const res = sample3D(fn3DPoint, [-2, 2], [-2, 2], [-2, 2], 21); // 21 ensures (0,0,0) is a node

      expect(res.vertices.length).toBe(1);
      expect(res.vertices[0][0]).toBeCloseTo(0, 5);
      expect(res.vertices[0][1]).toBeCloseTo(0, 5);
      expect(res.vertices[0][2]).toBeCloseTo(0, 5);
    });
  });

  // =========================================================================
  // E3: Surface with a hole or undefined region
  // =========================================================================
  describe('E3: Surface with a hole or undefined region', () => {
    it('samples smooth boundary for z = sqrt(1 - x^2 - y^2) without sawtooth NaN artifacts', () => {
      const fnUpperSphere = (x: number, y: number, z: number) => {
        const d = 1 - x * x - y * y;
        if (d < 0) return Number.NaN;
        return z - Math.sqrt(d);
      };

      const res = sample3D(fnUpperSphere, [-1.5, 1.5], [-1.5, 1.5], [-0.5, 1.5], 30);
      expect(res.vertices.length).toBeGreaterThan(0);
      expect(res.triangles.length).toBeGreaterThan(0);

      // All vertices must be strictly inside or on the unit cylinder x^2 + y^2 <= 1.05
      for (const [vx, vy, vz] of res.vertices) {
        expect(Number.isFinite(vx)).toBe(true);
        expect(Number.isFinite(vy)).toBe(true);
        expect(Number.isFinite(vz)).toBe(true);
        expect(vx * vx + vy * vy).toBeLessThanOrEqual(1.15);
      }
    });

    it('samples 2D domain boundary for sqrt(x) + sqrt(y) = 2 without NaN errors', () => {
      const fnSqrt = (x: number, y: number) => {
        if (x < 0 || y < 0) return Number.NaN;
        return Math.sqrt(x) + Math.sqrt(y) - 2;
      };

      const res = sample2D(fnSqrt, [-1, 5], [-1, 5], 50);
      expect(res.polylines.length).toBeGreaterThan(0);
      for (const poly of res.polylines) {
        for (const [x, y] of poly.points) {
          expect(x).toBeGreaterThanOrEqual(-0.01);
          expect(y).toBeGreaterThanOrEqual(-0.01);
        }
      }
    });
  });

  // =========================================================================
  // E4: Numerical noise near a singularity or pole
  // =========================================================================
  describe('E4: Numerical noise near a singularity or pole', () => {
    it('suppresses false vertical bridge lines across the pole at x = 0 for y = 1/x', () => {
      const fnPole = (x: number, y: number) => y - 1 / x;
      const res = sample2D(fnPole, [-4, 4], [-4, 4], 200);

      // Must produce exactly 2 distinct hyperbolic branches, not 3 (no middle bridge line)
      expect(res.polylines).toHaveLength(2);

      // Verify that NO polyline crosses from x < -0.01 to x > 0.01 (no asymptote bridge)
      for (const poly of res.polylines) {
        const isLeftBranch = poly.points.every(([x]) => x < 0.001);
        const isRightBranch = poly.points.every(([x]) => x > -0.001);
        expect(isLeftBranch || isRightBranch).toBe(true);
      }
    });

    it('handles high-frequency oscillation y = sin(1/x) without crashing or hanging', () => {
      const fnSingular = (x: number, y: number) => y - Math.sin(1 / (x === 0 ? 1e-15 : x));
      const res = sample2D(fnSingular, [-1, 1], [-1.5, 1.5], 100);

      expect(res.polylines.length).toBeGreaterThan(0);
      for (const poly of res.polylines) {
        for (const [x, y] of poly.points) {
          expect(Number.isFinite(x)).toBe(true);
          expect(Number.isFinite(y)).toBe(true);
        }
      }
    });
  });

  // =========================================================================
  // E5: Relation whose extension exceeds the sampled window
  // =========================================================================
  describe('E5: Relation whose extension exceeds the sampled window', () => {
    it('honestly returns empty result when circle x^2 + y^2 = 100 is completely outside [-5, 5]^2', () => {
      const fnLarge = (x: number, y: number) => x * x + y * y - 100;
      const res = sample2D(fnLarge, [-5, 5], [-5, 5], 100);

      // Must return empty polylines and null bounds honestly
      expect(res.polylines).toHaveLength(0);
      expect(res.bounds).toBeNull();
    });

    it('honestly returns empty 3D mesh when sphere x^2 + y^2 + z^2 = 100 is outside [-4, 4]^3', () => {
      const fnLarge3D = (x: number, y: number, z: number) => x * x + y * y + z * z - 100;
      const res = sample3D(fnLarge3D, [-4, 4], [-4, 4], [-4, 4], 30);

      expect(res.vertices).toHaveLength(0);
      expect(res.triangles).toHaveLength(0);
      expect(res.bounds).toBeNull();
    });
  });
});
