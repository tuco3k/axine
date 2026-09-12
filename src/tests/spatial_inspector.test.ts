import { describe, it, expect } from 'vitest';
import {
  SpatialInspector,
  pointToSegmentDistance,
  rayIntersectsSphere,
  rayIntersectsCapsule,
  rayIntersectsTriangle,
} from '../plot/spatial_inspector';
import { SpaceValue, SpatialEntity } from '../core/types';
import { Bounds2D, Bounds3D } from '../core/sampler';

describe('Spatial Inspector & 3-Layer Graph Inspection Engine', () => {
  describe('Geometric & Ray Hit Testing Primitives', () => {
    it('computes point to line segment distance accurately', () => {
      // Point (2, 2) to segment (0, 0)-(4, 0)
      const res = pointToSegmentDistance(2, 2, 0, 0, 4, 0);
      expect(res.dist).toBeCloseTo(2.0, 5);
      expect(res.closestX).toBeCloseTo(2.0, 5);
      expect(res.closestY).toBeCloseTo(0.0, 5);

      // Point (-1, 0) before segment (0, 0)-(4, 0) -> clamps to (0, 0)
      const resBefore = pointToSegmentDistance(-1, 0, 0, 0, 4, 0);
      expect(resBefore.dist).toBeCloseTo(1.0, 5);
      expect(resBefore.closestX).toBeCloseTo(0.0, 5);

      // Point (5, 0) after segment (0, 0)-(4, 0) -> clamps to (4, 0)
      const resAfter = pointToSegmentDistance(5, 0, 0, 0, 4, 0);
      expect(resAfter.dist).toBeCloseTo(1.0, 5);
      expect(resAfter.closestX).toBeCloseTo(4.0, 5);
    });

    it('performs analytical ray-sphere intersection testing for point colliders', () => {
      const center: [number, number, number] = [0, 0, 0];
      const radius = 1.0;

      // Ray through center from z = 5 pointing down [0, 0, -1]
      const origHit: [number, number, number] = [0, 0, 5];
      const dirHit: [number, number, number] = [0, 0, -1];
      const hitRes = rayIntersectsSphere(origHit, dirHit, center, radius);

      expect(hitRes.hit).toBe(true);
      expect(hitRes.t).toBeCloseTo(4.0, 5); // 5 - 1 = 4
      expect(hitRes.point?.[0]).toBeCloseTo(0.0, 5);
      expect(hitRes.point?.[1]).toBeCloseTo(0.0, 5);
      expect(hitRes.point?.[2]).toBeCloseTo(1.0, 5);

      // Ray through point at offset x = 0.6 from z = 5
      const origOffset: [number, number, number] = [0.6, 0, 5];
      const offsetRes = rayIntersectsSphere(origOffset, dirHit, center, radius);
      expect(offsetRes.hit).toBe(true);
      expect(offsetRes.point?.[0]).toBeCloseTo(0.6, 5);
      expect(offsetRes.point?.[2]).toBeCloseTo(0.8, 5); // sqrt(1 - 0.36) = 0.8

      // Ray outside sphere at x = 1.5 from z = 5
      const origMiss: [number, number, number] = [1.5, 0, 5];
      const missRes = rayIntersectsSphere(origMiss, dirHit, center, radius);
      expect(missRes.hit).toBe(false);
    });

    it('performs analytical ray-capsule intersection testing along line segments', () => {
      const a: [number, number, number] = [0, 0, 0];
      const b: [number, number, number] = [4, 0, 0];
      const radius = 0.5;

      // 1. Ray hitting the cylindrical body at x = 2.0 from z = 5 pointing down
      const origBody: [number, number, number] = [2, 0, 5];
      const dirHit: [number, number, number] = [0, 0, -1];
      const bodyRes = rayIntersectsCapsule(origBody, dirHit, a, b, radius);

      expect(bodyRes.hit).toBe(true);
      expect(bodyRes.t).toBeCloseTo(4.5, 5); // 5 - 0.5 = 4.5
      expect(bodyRes.point?.[0]).toBeCloseTo(2.0, 5);
      expect(bodyRes.point?.[1]).toBeCloseTo(0.0, 5);
      expect(bodyRes.point?.[2]).toBeCloseTo(0.5, 5);

      // 2. Ray hitting the hemispherical end-cap at A (x = -0.3)
      const origCapA: [number, number, number] = [-0.3, 0, 5];
      const capARes = rayIntersectsCapsule(origCapA, dirHit, a, b, radius);
      expect(capARes.hit).toBe(true);
      expect(capARes.point?.[0]).toBeCloseTo(-0.3, 5);
      expect(capARes.point?.[2]).toBeCloseTo(0.4, 5); // sqrt(0.25 - 0.09) = 0.4

      // 3. Ray hitting the hemispherical end-cap at B (x = 4.3)
      const origCapB: [number, number, number] = [4.3, 0, 5];
      const capBRes = rayIntersectsCapsule(origCapB, dirHit, a, b, radius);
      expect(capBRes.hit).toBe(true);
      expect(capBRes.point?.[0]).toBeCloseTo(4.3, 5);
      expect(capBRes.point?.[2]).toBeCloseTo(0.4, 5);

      // 4. Ray missing outside capsule at y = 1.0
      const origMiss: [number, number, number] = [2, 1.0, 5];
      const missRes = rayIntersectsCapsule(origMiss, dirHit, a, b, radius);
      expect(missRes.hit).toBe(false);
    });
  });

  describe('Layer 1, Layer 2, Layer 3 in 1D Space', () => {
    it('inspects 1D number line at exact root and in empty space', () => {
      const ent: SpatialEntity = {
        coordinates: ['x'],
        ast: null as any,
        compiledFn: (x: number) => x * x - 4, // roots at x = -2, x = 2
        dimension: 1,
        source: 'x^2 - 4 = 0',
        cachedRoots1D: [-2, 2],
      };

      const space: SpaceValue = {
        type: 'space',
        coordinates: ['x'],
        dimension: 1,
        entities: [ent],
      };

      const bounds: Bounds2D = { minX: -5, maxX: 5, minY: -5, maxY: 5 };

      // 1. Click near root x = 2.0 (pixel at (2 - (-5))/10 * 600 = 420)
      const rootRes = SpatialInspector.inspect1D(space, bounds, 420, 600);
      expect(rootRes.dimension).toBe(1);
      expect(rootRes.isExactGeometryHit).toBe(true);
      expect(rootRes.hitEntities.length).toBe(1);

      const hit = rootRes.hitEntities[0];
      expect(hit.holds).toBe(true);
      expect(hit.valueAtPoint).toBeCloseTo(0, 4);

      // Verify Layer 3 reduction steps
      expect(hit.reductionSteps.length).toBeGreaterThan(0);
      expect(hit.reductionSteps.some(s => s.label.includes('Coordinate Substitution'))).toBe(true);

      // 2. Click in empty space at x = 0 (pixel at 300)
      const emptyRes = SpatialInspector.inspect1D(space, bounds, 300, 600);
      expect(emptyRes.hitEntities[0].holds).toBe(false);
      expect(emptyRes.hitEntities[0].valueAtPoint).toBeCloseTo(-4, 4); // 0^2 - 4 = -4
      expect(emptyRes.hitEntities[0].reductionSteps.some(s => s.label.includes('Residual Evaluation'))).toBe(true);
    });
  });

  describe('Layer 1, Layer 2, Layer 3 in 2D Space & Multi-Relation Intersections', () => {
    it('handles multi-relation intersections with stacked cards', () => {
      // Relation 1: y = x (y - x = 0)
      const ent1: SpatialEntity = {
        coordinates: ['x', 'y'],
        ast: null as any,
        compiledFn: (x: number, y: number) => y - x,
        dimension: 2,
        source: 'y = x',
        cachedContours: {
          polylines: [{ points: [[0, 0], [2, 2], [4, 4]], closed: false }],
          bounds: { minX: 0, maxX: 4, minY: 0, maxY: 4 },
          sampleCount: 10,
        },
      };

      // Relation 2: y = 4 - x (y + x - 4 = 0)
      const ent2: SpatialEntity = {
        coordinates: ['x', 'y'],
        ast: null as any,
        compiledFn: (x: number, y: number) => y + x - 4,
        dimension: 2,
        source: 'y = 4 - x',
        cachedContours: {
          polylines: [{ points: [[0, 4], [2, 2], [4, 0]], closed: false }],
          bounds: { minX: 0, maxX: 4, minY: 0, maxY: 4 },
          sampleCount: 10,
        },
      };

      const space: SpaceValue = {
        type: 'space',
        coordinates: ['x', 'y'],
        dimension: 2,
        entities: [ent1, ent2],
      };

      const bounds: Bounds2D = { minX: 0, maxX: 4, minY: 0, maxY: 4 };

      // Click at intersection (2, 2) (middle of 400x400 screen -> (200, 200))
      const res = SpatialInspector.inspect2D(space, bounds, 200, 200, 400, 400);

      expect(res.isExactGeometryHit).toBe(true);
      expect(res.worldCoord.x).toBeCloseTo(2, 2);
      expect(res.worldCoord.y).toBeCloseTo(2, 2);
      expect(res.hitEntities.length).toBe(2);

      // Both relations hold at intersection
      expect(res.hitEntities[0].holds).toBe(true);
      expect(res.hitEntities[1].holds).toBe(true);
    });

    it('generates Newton-Raphson iteration traces for library functions', () => {
      const sqrtEnt: SpatialEntity = {
        coordinates: ['x', 'y'],
        ast: null as any,
        compiledFn: (x: number, y: number) => y - Math.sqrt(Math.max(0, x)),
        dimension: 2,
        source: 'y = :sqrt(x)',
        cachedContours: {
          polylines: [{ points: [[0, 0], [4, 2], [9, 3]], closed: false }],
          bounds: { minX: 0, maxX: 10, minY: 0, maxY: 4 },
          sampleCount: 10,
        },
      };

      const trace = SpatialInspector.generateReductionTrace(sqrtEnt, 4, 2);

      expect(trace.libraryTrace).toBeDefined();
      expect(trace.libraryTrace?.functionName).toContain(':sqrt');
      expect(trace.libraryTrace?.convergedValue).toBeCloseTo(2.0, 5);
      expect(trace.libraryTrace?.iterations.length).toBeGreaterThanOrEqual(3);

      // Step 0 initial seed: 0.5 * (4 + 1) = 2.5
      expect(trace.libraryTrace?.iterations[0].estimate).toBeCloseTo(2.5, 3);
      // Final converged iteration
      expect(trace.libraryTrace?.iterations[trace.libraryTrace.iterations.length - 1].estimate).toBeCloseTo(2.0, 4);
    });
  });

  describe('3D Mesh Ray Picking & Inspection', () => {
    it('picks 3D mesh surface points along camera ray', () => {
      const mesh: any = {
        vertices: [
          [0, 0, 0],
          [2, 0, 0],
          [0, 2, 0],
        ],
        triangles: [[0, 1, 2]],
        positions: new Float32Array(),
        indices: new Uint32Array(),
        bounds: null,
        sampleCount: 1,
      };

      const ent3D: SpatialEntity = {
        coordinates: ['x', 'y', 'z'],
        ast: null as any,
        compiledFn: (x: number, y: number, z: number) => z,
        dimension: 3,
        source: 'z = 0',
        cachedMesh: mesh,
      };

      const space: SpaceValue = {
        type: 'space',
        coordinates: ['x', 'y', 'z'],
        dimension: 3,
        entities: [ent3D],
      };

      const bounds: Bounds3D = { minX: -3, maxX: 3, minY: -3, maxY: 3, minZ: -3, maxZ: 3 };

      const res = SpatialInspector.inspect3D(
        space,
        bounds,
        300,
        150,
        600,
        300,
        {
          angleX: Math.PI / 6,
          angleZ: Math.PI / 4,
          zoom3D: 1.0,
          pan3DX: 0,
          pan3DY: 0,
        }
      );

      expect(res.dimension).toBe(3);
      expect(res.hitEntities.length).toBe(1);
      expect(res.worldCoord.x).toBeDefined();
      expect(res.worldCoord.y).toBeDefined();
      expect(res.worldCoord.z).toBeDefined();
    });
  });

  describe('Viewport Interaction & Stop Ramp Dynamics', () => {
    it('exports STOP_RAMP_MS constant defined as 50ms', async () => {
      const { STOP_RAMP_MS } = await import('../plot/space_viewport');
      expect(STOP_RAMP_MS).toBe(50);
    });

    it('performs click selection without auto-opening inspector panel', async () => {
      const { SpaceViewport } = await import('../plot/space_viewport');
      const container: any = {
        innerHTML: '',
        className: '',
        appendChild: () => {},
        querySelector: () => null,
        addEventListener: () => {},
        removeEventListener: () => {},
        classList: { add: () => {}, remove: () => {}, contains: () => false },
      };

      const ent: SpatialEntity = {
        coordinates: ['x', 'y'],
        ast: null as any,
        compiledFn: (x: number, y: number) => y - x,
        dimension: 2,
        source: 'y = x',
        cachedContours: {
          polylines: [{ points: [[0, 0], [2, 2], [4, 4]], closed: false }],
          bounds: { minX: 0, maxX: 4, minY: 0, maxY: 4 },
          sampleCount: 10,
        },
      };

      const space: SpaceValue = {
        type: 'space',
        coordinates: ['x', 'y'],
        dimension: 2,
        entities: [ent],
      };

      const vp = new SpaceViewport(container, space);

      // Verify inspector panel is NOT open initially
      expect(vp.getInspectionResult()).toBeNull();

      // Inspect at coordinate selects and shows reticle
      vp.inspectAtCoordinate(2.0, 2.0);
      expect(vp.getInspectionResult()).not.toBeNull();
      expect(vp.getReticlePos()?.x).toBeCloseTo(2.0, 4);

      // Close inspector
      vp.closeInspection();
      expect(vp.getInspectionResult()).not.toBeNull(); // Selection retained
    });

    it('enforces viewport capture rule: inert until clicked, shift-wheel quick look, click capture, escape release', async () => {
      const { SpaceViewport } = await import('../plot/space_viewport');
      const containerListeners: Record<string, Function[]> = {};
      const canvasListeners: Record<string, Function[]> = {};

      const container: any = {
        innerHTML: '',
        className: '',
        appendChild: () => {},
        querySelector: () => null,
        addEventListener: (event: string, fn: Function) => {
          if (!containerListeners[event]) containerListeners[event] = [];
          containerListeners[event].push(fn);
        },
        removeEventListener: (event: string, fn: Function) => {
          if (containerListeners[event]) {
            containerListeners[event] = containerListeners[event].filter(f => f !== fn);
          }
        },
        classList: {
          add: () => {},
          remove: () => {},
          contains: () => false,
        },
        focus: () => {},
        blur: () => {},
      };

      const ent: SpatialEntity = {
        coordinates: ['x', 'y'],
        ast: null as any,
        compiledFn: (x: number, y: number) => y - x,
        dimension: 2,
        source: 'y = x',
      };

      const space: SpaceValue = {
        type: 'space',
        coordinates: ['x', 'y'],
        dimension: 2,
        entities: [ent],
        coordinateBounds: { x: [-5, 5], y: [-5, 5] },
      };

      const vp = new SpaceViewport(container, space);

      // Track canvas listeners
      const origCanvasAdd = (vp as any).canvas.addEventListener;
      (vp as any).canvas.addEventListener = (event: string, fn: Function, opts?: any) => {
        if (!canvasListeners[event]) canvasListeners[event] = [];
        canvasListeners[event].push(fn);
        if (origCanvasAdd) origCanvasAdd.call((vp as any).canvas, event, fn, opts);
      };

      // Re-setup events to capture listeners
      (vp as any).setupEvents();

      // 1. Initially inert
      expect(vp.getIsCaptured()).toBe(false);

      const boundsBefore = { ...vp.getCameraState().bounds2D };

      // 2. Wheel event without Shift when inert -> ignored (does not prevent default, bounds untouched)
      let unshiftedPrevented = false;
      const unshiftedWheelEvent: any = {
        deltaY: 100,
        shiftKey: false,
        preventDefault: () => { unshiftedPrevented = true; },
        stopPropagation: () => {},
      };
      if (canvasListeners['wheel']) {
        canvasListeners['wheel'].forEach(fn => fn(unshiftedWheelEvent));
      }
      expect(unshiftedPrevented).toBe(false);
      expect(vp.getCameraState().bounds2D.minX).toBeCloseTo(boundsBefore.minX, 5);
      expect(vp.getCameraState().bounds2D.maxX).toBeCloseTo(boundsBefore.maxX, 5);
      expect(vp.getIsCaptured()).toBe(false);

      // 3. Shift + Wheel when inert -> zooms that space and prevents default ("quick look without committing")
      let shiftWheelPrevented = false;
      const shiftWheelEvent: any = {
        deltaY: 100,
        shiftKey: true,
        preventDefault: () => { shiftWheelPrevented = true; },
        stopPropagation: () => {},
      };
      if (canvasListeners['wheel']) {
        canvasListeners['wheel'].forEach(fn => fn(shiftWheelEvent));
      }
      expect(shiftWheelPrevented).toBe(true);
      // Zoom factor 1.1 expands bounds
      expect(vp.getCameraState().bounds2D.maxX - vp.getCameraState().bounds2D.minX).toBeGreaterThan(
        boundsBefore.maxX - boundsBefore.minX
      );
      // Still uncaptured
      expect(vp.getIsCaptured()).toBe(false);

      // 4. Click captures the space
      vp.capture();
      expect(vp.getIsCaptured()).toBe(true);

      // 5. Wheel when captured -> zooms and prevents default (even without Shift)
      let capturedWheelPrevented = false;
      const capturedWheelEvent: any = {
        deltaY: -100,
        shiftKey: false,
        preventDefault: () => { capturedWheelPrevented = true; },
        stopPropagation: () => {},
      };
      if (canvasListeners['wheel']) {
        canvasListeners['wheel'].forEach(fn => fn(capturedWheelEvent));
      }
      expect(capturedWheelPrevented).toBe(true);

      // 6. Escape releases capture entirely
      const escapeEvent: any = {
        key: 'Escape',
        preventDefault: () => {},
        stopPropagation: () => {},
      };
      if (containerListeners['keydown']) {
        containerListeners['keydown'].forEach(fn => fn(escapeEvent));
      }
      expect(vp.getIsCaptured()).toBe(false);
    });
  });
});
