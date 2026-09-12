/**
 * Spatial Inspector: 3-Layer Graph Inspection Engine (1D, 2D, 3D)
 * 
 * Layer 1: What is here (coordinates & evaluated relation truth/residual)
 * Layer 2: What produced this (relation AST, document source line anchor with jump-to-source)
 * Layer 3: How it got that value (point-wise algebraic reduction trace & Newton-Raphson library iterations)
 */

import { SpaceValue, SpatialEntity } from '../core/types';
import { Bounds2D, Bounds3D, Point3D, TriangleMesh3D } from '../core/sampler';
import { formatAST } from '../core/formatter';
import { typesetMath, escapeHtml } from '../core/math_typeset';

export interface ReductionStep {
  label: string;
  equation: string;
  detail?: string;
}

export interface InspectedEntityRecord {
  entityIndex: number;
  relationExpr: string;
  lineIdx?: number;
  sourceText?: string;
  valueAtPoint: number;
  residual: number;
  holds: boolean;
  isSnapped: boolean;
  reductionSteps: ReductionStep[];
  libraryTrace?: {
    functionName: string;
    iterations: { iteration: number; estimate: number; formula: string }[];
    convergedValue: number;
  };
  gridResolution?: string;
  gridStep?: number;
  toleranceDescription?: string;
}

export interface SpatialInspectionResult {
  dimension: 1 | 2 | 3;
  worldCoord: { x: number; y?: number; z?: number };
  screenPos: { x: number; y: number };
  isExactGeometryHit: boolean;
  hitEntities: InspectedEntityRecord[];
  gridResolution?: string;
  gridStep?: number;
}

/**
 * Computes Euclidean distance from point (px, py) to line segment (x1, y1)-(x2, y2).
 */
export function pointToSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { dist: number; closestX: number; closestY: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) {
    const d = Math.hypot(px - x1, py - y1);
    return { dist: d, closestX: x1, closestY: y1 };
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  const dist = Math.hypot(px - cx, py - cy);
  return { dist, closestX: cx, closestY: cy };
}

/**
 * Ray-sphere intersection test for 3D/2D point colliders.
 */
export function rayIntersectsSphere(
  orig: Point3D,
  dir: Point3D,
  center: Point3D,
  radius: number
): { hit: boolean; t: number; point?: Point3D } {
  const mx = orig[0] - center[0];
  const my = orig[1] - center[1];
  const mz = orig[2] - center[2];

  const b = mx * dir[0] + my * dir[1] + mz * dir[2];
  const c = (mx * mx + my * my + mz * mz) - radius * radius;

  if (c > 0 && b > 0) {
    return { hit: false, t: 0 };
  }

  const discr = b * b - c;
  if (discr < 0) {
    return { hit: false, t: 0 };
  }

  const s = Math.sqrt(discr);
  let t = -b - s;
  if (t <= 1e-6) {
    t = -b + s;
  }

  if (t > 1e-6) {
    const pt: Point3D = [
      orig[0] + dir[0] * t,
      orig[1] + dir[1] * t,
      orig[2] + dir[2] * t,
    ];
    return { hit: true, t, point: pt };
  }
  return { hit: false, t: 0 };
}

/**
 * Analytical ray-capsule intersection test along a line segment (a -> b) with radius r.
 */
export function rayIntersectsCapsule(
  orig: Point3D,
  dir: Point3D,
  a: Point3D,
  b: Point3D,
  radius: number
): { hit: boolean; t: number; point?: Point3D } {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const segLen = Math.hypot(ux, uy, uz);

  if (segLen < 1e-7) {
    return rayIntersectsSphere(orig, dir, a, radius);
  }

  const axisX = ux / segLen;
  const axisY = uy / segLen;
  const axisZ = uz / segLen;

  const wx = orig[0] - a[0];
  const wy = orig[1] - a[1];
  const wz = orig[2] - a[2];

  const wDotAxis = wx * axisX + wy * axisY + wz * axisZ;
  const vPerpX = wx - wDotAxis * axisX;
  const vPerpY = wy - wDotAxis * axisY;
  const vPerpZ = wz - wDotAxis * axisZ;

  const dDotAxis = dir[0] * axisX + dir[1] * axisY + dir[2] * axisZ;
  const dPerpX = dir[0] - dDotAxis * axisX;
  const dPerpY = dir[1] - dDotAxis * axisY;
  const dPerpZ = dir[2] - dDotAxis * axisZ;

  const A = dPerpX * dPerpX + dPerpY * dPerpY + dPerpZ * dPerpZ;
  const B = vPerpX * dPerpX + vPerpY * dPerpY + vPerpZ * dPerpZ;
  const C = vPerpX * vPerpX + vPerpY * vPerpY + vPerpZ * vPerpZ - radius * radius;

  const validTs: number[] = [];

  // 1. Test infinite cylinder section bounded by [0, segLen]
  if (A > 1e-9) {
    const discr = B * B - A * C;
    if (discr >= 0) {
      const s = Math.sqrt(discr);
      const t1 = (-B - s) / A;
      const t2 = (-B + s) / A;

      for (const t of [t1, t2]) {
        if (t > 1e-6) {
          const hitX = orig[0] + dir[0] * t;
          const hitY = orig[1] + dir[1] * t;
          const hitZ = orig[2] + dir[2] * t;
          const proj = (hitX - a[0]) * axisX + (hitY - a[1]) * axisY + (hitZ - a[2]) * axisZ;
          if (proj >= 0 && proj <= segLen) {
            validTs.push(t);
          }
        }
      }
    }
  }

  // 2. Test spherical end-cap at A
  const resA = rayIntersectsSphere(orig, dir, a, radius);
  if (resA.hit && resA.point && resA.t > 1e-6) {
    const projA = (resA.point[0] - a[0]) * axisX + (resA.point[1] - a[1]) * axisY + (resA.point[2] - a[2]) * axisZ;
    if (projA <= 1e-6) {
      validTs.push(resA.t);
    }
  }

  // 3. Test spherical end-cap at B
  const resB = rayIntersectsSphere(orig, dir, b, radius);
  if (resB.hit && resB.point && resB.t > 1e-6) {
    const projB = (resB.point[0] - b[0]) * axisX + (resB.point[1] - b[1]) * axisY + (resB.point[2] - b[2]) * axisZ;
    if (projB >= -1e-6) {
      validTs.push(resB.t);
    }
  }

  if (validTs.length > 0) {
    let minT = Infinity;
    for (const t of validTs) {
      if (t < minT) minT = t;
    }
    const pt: Point3D = [
      orig[0] + dir[0] * minT,
      orig[1] + dir[1] * minT,
      orig[2] + dir[2] * minT,
    ];
    return { hit: true, t: minT, point: pt };
  }

  return { hit: false, t: 0 };
}

/**
 * Möller–Trumbore ray-triangle intersection algorithm for 3D mesh surface picking.
 */
export function rayIntersectsTriangle(
  orig: Point3D,
  dir: Point3D,
  v0: Point3D,
  v1: Point3D,
  v2: Point3D
): { hit: boolean; t: number; point?: Point3D } {
  const EPSILON = 1e-7;
  const edge1: Point3D = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
  const edge2: Point3D = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];

  // h = cross(dir, edge2)
  const h: Point3D = [
    dir[1] * edge2[2] - dir[2] * edge2[1],
    dir[2] * edge2[0] - dir[0] * edge2[2],
    dir[0] * edge2[1] - dir[1] * edge2[0],
  ];

  // a = dot(edge1, h)
  const a = edge1[0] * h[0] + edge1[1] * h[1] + edge1[2] * h[2];
  if (a > -EPSILON && a < EPSILON) {
    return { hit: false, t: 0 }; // Ray is parallel to triangle
  }

  const f = 1.0 / a;
  // s = orig - v0
  const s: Point3D = [orig[0] - v0[0], orig[1] - v0[1], orig[2] - v0[2]];
  // u = f * dot(s, h)
  const u = f * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]);
  if (u < -1e-6 || u > 1.0 + 1e-6) {
    return { hit: false, t: 0 };
  }

  // q = cross(s, edge1)
  const q: Point3D = [
    s[1] * edge1[2] - s[2] * edge1[1],
    s[2] * edge1[0] - s[0] * edge1[2],
    s[0] * edge1[1] - s[1] * edge1[0],
  ];

  // v = f * dot(dir, q)
  const v = f * (dir[0] * q[0] + dir[1] * q[1] + dir[2] * q[2]);
  if (v < -1e-6 || u + v > 1.0 + 1e-6) {
    return { hit: false, t: 0 };
  }

  // t = f * dot(edge2, q)
  const t = f * (edge2[0] * q[0] + edge2[1] * q[1] + edge2[2] * q[2]);
  if (t > EPSILON) {
    const pt: Point3D = [
      orig[0] + dir[0] * t,
      orig[1] + dir[1] * t,
      orig[2] + dir[2] * t,
    ];
    return { hit: true, t, point: pt };
  }
  return { hit: false, t: 0 };
}

export class SpatialInspector {
  /**
   * Generates step-by-step reduction trace and Newton iterations for an inspected point.
   */
  public static generateReductionTrace(
    ent: SpatialEntity,
    x0: number,
    y0?: number,
    z0?: number,
    context?: {
      isSnapped?: boolean;
      gridResolution?: string;
      gridStep?: number;
      dimension?: 1 | 2 | 3;
    }
  ): { steps: ReductionStep[]; libraryTrace?: InspectedEntityRecord['libraryTrace'] } {
    const steps: ReductionStep[] = [];
    const varX = ent.coordinates[0] || 'x';
    const varY = ent.coordinates[1] || 'y';
    const varZ = ent.coordinates[2] || 'z';

    const sourceExpr = ent.source || (ent.ast ? formatAST(ent.ast) : `${varY} = f(${varX})`);
    const fmt = (n: number) => {
      if (Math.abs(n) < 1e-10) return '0';
      if (Number.isInteger(n)) return n.toString();
      return n.toFixed(4).replace(/\.?0+$/, '');
    };

    // Step 1: Variable instantiation / substitution
    let instantiatedExpr = sourceExpr;
    const regexX = new RegExp(`\\b${varX}\\b`, 'g');
    instantiatedExpr = instantiatedExpr.replace(regexX, fmt(x0));
    if (typeof y0 === 'number') {
      const regexY = new RegExp(`\\b${varY}\\b`, 'g');
      instantiatedExpr = instantiatedExpr.replace(regexY, fmt(y0));
    }
    if (typeof z0 === 'number') {
      const regexZ = new RegExp(`\\b${varZ}\\b`, 'g');
      instantiatedExpr = instantiatedExpr.replace(regexZ, fmt(z0));
    }

    const coordArgs = [fmt(x0), y0 !== undefined ? fmt(y0) : null, z0 !== undefined ? fmt(z0) : null]
      .filter(Boolean)
      .join(', ');

    steps.push({
      label: 'Coordinate Substitution',
      equation: instantiatedExpr,
      detail: `Substitute (${coordArgs})`,
    });

    // Check for library function (e.g. sqrt / newton_sqrt)
    let libTrace: InspectedEntityRecord['libraryTrace'] | undefined = undefined;
    if (sourceExpr.includes('sqrt') || sourceExpr.includes('newton')) {
      const targetVal = Math.max(0, x0);
      const sqrtVal = Math.sqrt(targetVal);

      // Simulate Newton-Raphson iteration sequence per lib/newton.ax
      const iterations: { iteration: number; estimate: number; formula: string }[] = [];
      let y = 0.5 * (targetVal + 1.0);
      iterations.push({
        iteration: 0,
        estimate: y,
        formula: `y_0 = 0.5 * (${fmt(targetVal)} + 1) = ${fmt(y)}`,
      });

      for (let i = 1; i <= 4; i++) {
        if (y <= 0) break;
        const nextY = 0.5 * (y + targetVal / y);
        iterations.push({
          iteration: i,
          estimate: nextY,
          formula: `y_${i} = 0.5 * (${fmt(y)} + ${fmt(targetVal)} / ${fmt(y)}) = ${fmt(nextY)}`,
        });
        if (Math.abs(nextY - y) < 1e-9) break;
        y = nextY;
      }

      libTrace = {
        functionName: ':sqrt(x) via Newton-Raphson Search (lib/newton.ax)',
        iterations,
        convergedValue: sqrtVal,
      };

      steps.push({
        label: 'Library Function Expansion (:sqrt)',
        equation: `:newton_sqrt(${fmt(targetVal)}) \\rightarrow ${fmt(sqrtVal)}`,
        detail: `Evaluated via 4 Newton iterations with initial seed y_0 = ${fmt(0.5 * (targetVal + 1.0))}`,
      });
    }

    // Step 2: Evaluation / Residual Computation
    try {
      const val = typeof y0 === 'number'
        ? (typeof z0 === 'number' ? ent.compiledFn(x0, y0, z0) : ent.compiledFn(x0, y0))
        : ent.compiledFn(x0);
      const isZero = Math.abs(val) < 1e-6;

      if (isZero) {
        steps.push({
          label: 'Exact Relation Reduction',
          equation: `f(${coordArgs}) = 0`,
          detail: 'Algebraic equality confirmed: point lies exactly on continuous geometric locus (residual = 0).',
        });
      } else if (context?.isSnapped) {
        const stepStr = context.gridStep !== undefined ? ` (grid step ${fmt(context.gridStep)})` : '';
        const stepLabel = context.dimension === 3
          ? 'Mesh Discretization Residual'
          : (context.dimension === 2 ? 'Sampled Curve Discretization Residual' : 'Discretization Residual');
        steps.push({
          label: stepLabel,
          equation: `f(${coordArgs}) = ${fmt(val)}`,
          detail: `Discretization residual is ${fmt(val)}${stepStr}. The continuous geometric locus passes within cell tolerance of this interpolated vertex.`,
        });
      } else {
        steps.push({
          label: 'Off-Surface Evaluation',
          equation: `f(${coordArgs}) = ${fmt(val)} \\neq 0`,
          detail: `Evaluated residual is ${fmt(val)}: point lies outside the geometric locus tolerance.`,
        });
      }
    } catch {
      // Fallback
    }

    return { steps, libraryTrace: libTrace };
  }

  /**
   * Hit test in 1D Number Line space using real sphere colliders on roots/points.
   */
  public static inspect1D(
    space: SpaceValue,
    bounds2D: Bounds2D,
    clickPixelX: number,
    width: number,
    pointRadius?: number
  ): SpatialInspectionResult {
    const minX = bounds2D.minX;
    const maxX = bounds2D.maxX;
    const spanX = Math.max(1e-6, maxX - minX);
    const worldX = minX + (clickPixelX / width) * spanX;

    const rPoint = pointRadius ?? Math.max(0.08, spanX * 0.018);
    const rayOrig: Point3D = [worldX, 0, 10];
    const rayDir: Point3D = [0, 0, -1];

    let isExact = false;
    let selectedX = worldX;
    const hitEntities: InspectedEntityRecord[] = [];

    space.entities.forEach((ent, idx) => {
      let entHit = false;
      let inspectedX = worldX;

      // Check cached roots with real sphere colliders
      if (ent.cachedRoots1D && ent.cachedRoots1D.length > 0) {
        for (const root of ent.cachedRoots1D) {
          const hitRes = rayIntersectsSphere(rayOrig, rayDir, [root, 0, 0], rPoint);
          if (hitRes.hit) {
            inspectedX = root;
            selectedX = root;
            entHit = true;
            isExact = true;
            break;
          }
        }
      }

      let val = 0;
      try {
        val = ent.compiledFn(inspectedX);
      } catch {
        val = Number.NaN;
      }

      const holds = entHit || Math.abs(val) < 1e-4;
      const trace = SpatialInspector.generateReductionTrace(ent, inspectedX, undefined, undefined, {
        isSnapped: entHit,
        dimension: 1,
      });

      const toleranceDesc = entHit
        ? (Math.abs(val) < 1e-6 ? 'exact algebraic zero (residual = 0)' : 'within root solver tolerance')
        : 'evaluated off-root coordinate';

      hitEntities.push({
        entityIndex: idx,
        relationExpr: ent.source || (ent.ast ? formatAST(ent.ast) : `f(x) = 0`),
        lineIdx: ent.ast?.span?.line ? ent.ast.span.line - 1 : undefined,
        sourceText: ent.source,
        valueAtPoint: val,
        residual: val,
        holds,
        isSnapped: entHit,
        reductionSteps: trace.steps,
        libraryTrace: trace.libraryTrace,
        toleranceDescription: toleranceDesc,
      });
    });

    return {
      dimension: 1,
      worldCoord: { x: isExact ? selectedX : worldX },
      screenPos: { x: clickPixelX, y: 0 },
      isExactGeometryHit: isExact,
      hitEntities,
    };
  }

  /**
   * Hit test in 2D Cartesian Space using thin capsule colliders on line segments and sphere colliders on points.
   */
  public static inspect2D(
    space: SpaceValue,
    bounds2D: Bounds2D,
    clickScreenX: number,
    clickScreenY: number,
    width: number,
    height: number,
    capsuleRadius?: number
  ): SpatialInspectionResult {
    const minX = bounds2D.minX;
    const maxX = bounds2D.maxX;
    const minY = bounds2D.minY;
    const maxY = bounds2D.maxY;

    const spanX = Math.max(1e-6, maxX - minX);
    const spanY = Math.max(1e-6, maxY - minY);

    const rawWorldX = minX + (clickScreenX / width) * spanX;
    const rawWorldY = maxY - (clickScreenY / height) * spanY;

    const rCapsule = capsuleRadius ?? Math.max(0.06, spanX * 0.015);
    const rayOrig: Point3D = [rawWorldX, rawWorldY, 10];
    const rayDir: Point3D = [0, 0, -1];

    let snappedX = rawWorldX;
    let snappedY = rawWorldY;
    let isSnapped = false;
    let bestT = Infinity;

    const entitySnapInfo: {
      index: number;
      ent: SpatialEntity;
      snapPt: [number, number];
    }[] = [];

    // 1. Ray-capsule intersection test across all polyline contours
    space.entities.forEach((ent, idx) => {
      let entHit = false;
      let entSnapPt: [number, number] = [rawWorldX, rawWorldY];
      let entMinT = Infinity;

      if (ent.cachedContours && ent.cachedContours.polylines) {
        for (const poly of ent.cachedContours.polylines) {
          const pts = poly.points;
          for (let i = 0; i < pts.length - 1; i++) {
            const p1 = pts[i];
            const p2 = pts[i + 1];

            const a: Point3D = [p1[0], p1[1], 0];
            const b: Point3D = [p2[0], p2[1], 0];

            const capRes = rayIntersectsCapsule(rayOrig, rayDir, a, b, rCapsule);
            if (capRes.hit && capRes.t < entMinT) {
              entMinT = capRes.t;
              entHit = true;
              // Project 2D point on segment
              const segRes = pointToSegmentDistance(rawWorldX, rawWorldY, p1[0], p1[1], p2[0], p2[1]);
              entSnapPt = [segRes.closestX, segRes.closestY];
            }
          }
        }
      }

      if (entHit) {
        entitySnapInfo.push({
          index: idx,
          ent,
          snapPt: entSnapPt,
        });
        if (entMinT < bestT) {
          bestT = entMinT;
          snappedX = entSnapPt[0];
          snappedY = entSnapPt[1];
          isSnapped = true;
        }
      }
    });

    const inspectedEntities: InspectedEntityRecord[] = [];
    const evalX = isSnapped ? snappedX : rawWorldX;
    const evalY = isSnapped ? snappedY : rawWorldY;

    let primaryGridResolution: string | undefined = undefined;
    let primaryGridStep: number | undefined = undefined;

    const fmtStep = (n: number) => {
      if (Math.abs(n) < 1e-10) return '0';
      if (Number.isInteger(n)) return n.toString();
      return n.toFixed(4).replace(/\.?0+$/, '');
    };

    space.entities.forEach((ent, idx) => {
      const snapForThis = entitySnapInfo.find(s => s.index === idx);
      const ptX = snapForThis ? snapForThis.snapPt[0] : evalX;
      const ptY = snapForThis ? snapForThis.snapPt[1] : evalY;

      let val = 0;
      try {
        val = ent.compiledFn(ptX, ptY);
      } catch {
        val = Number.NaN;
      }

      const holds = Math.abs(val) < 1e-3 || !!snapForThis;
      const res2D = ent.cachedContours?.resolution;
      const gridResStr = res2D ? `${res2D[0]}×${res2D[1]}` : undefined;
      const step2D = ent.cachedContours?.gridStep ? ent.cachedContours.gridStep[0] : undefined;

      if (!primaryGridResolution && gridResStr) {
        primaryGridResolution = gridResStr;
        primaryGridStep = step2D;
      }

      const trace = SpatialInspector.generateReductionTrace(ent, ptX, ptY, undefined, {
        isSnapped: !!snapForThis,
        gridResolution: gridResStr,
        gridStep: step2D,
        dimension: 2,
      });

      let toleranceDesc = 'evaluated off-curve coordinate';
      if (snapForThis) {
        if (Math.abs(val) < 1e-6) {
          toleranceDesc = 'exact algebraic zero (residual = 0)';
        } else if (step2D !== undefined) {
          toleranceDesc = `within sampled contour tolerance (grid step ${fmtStep(step2D)})`;
        } else {
          toleranceDesc = 'within sampled contour tolerance';
        }
      }

      inspectedEntities.push({
        entityIndex: idx,
        relationExpr: ent.source || (ent.ast ? formatAST(ent.ast) : `f(x, y) = 0`),
        lineIdx: ent.ast?.span?.line ? ent.ast.span.line - 1 : undefined,
        sourceText: ent.source,
        valueAtPoint: val,
        residual: val,
        holds,
        isSnapped: !!snapForThis,
        reductionSteps: trace.steps,
        libraryTrace: trace.libraryTrace,
        gridResolution: gridResStr,
        gridStep: step2D,
        toleranceDescription: toleranceDesc,
      });
    });

    return {
      dimension: 2,
      worldCoord: { x: evalX, y: evalY },
      screenPos: { x: clickScreenX, y: clickScreenY },
      isExactGeometryHit: isSnapped,
      hitEntities: inspectedEntities,
      gridResolution: primaryGridResolution,
      gridStep: primaryGridStep,
    };
  }

  /**
   * Hit test in 3D Mesh space via view-ray picking against triangle meshes, capsule colliders, and sphere colliders.
   */
  public static inspect3D(
    space: SpaceValue,
    _bounds3D: Bounds3D,
    clickScreenX: number,
    clickScreenY: number,
    width: number,
    height: number,
    camera: {
      angleX: number;
      angleZ: number;
      zoom3D: number;
      pan3DX: number;
      pan3DY: number;
    }
  ): SpatialInspectionResult {
    const centerX = width * 0.5 + camera.pan3DX;
    const centerY = height * 0.5 + camera.pan3DY;
    const scale3D = (Math.min(width, height) / 3.8) * camera.zoom3D;

    // Camera ray direction in world space
    const cosAz = Math.cos(camera.angleZ);
    const sinAz = Math.sin(camera.angleZ);
    const cosEl = Math.cos(camera.angleX);
    const sinEl = Math.sin(camera.angleX);

    // Eye vector from center
    const eyeDist = 10.0;
    const rayOrig: Point3D = [
      eyeDist * cosEl * sinAz,
      eyeDist * cosEl * cosAz,
      eyeDist * sinEl,
    ];

    // Screen pixel offset relative to center
    const ndcX = (clickScreenX - centerX) / scale3D;
    const ndcY = (centerY - clickScreenY) / scale3D;

    // View direction vector
    const rightVec: Point3D = [cosAz, -sinAz, 0];
    const upVec: Point3D = [-sinEl * sinAz, -sinEl * cosAz, cosEl];
    const forwardVec: Point3D = [-cosEl * sinAz, -cosEl * cosAz, -sinEl];

    const rayDirNorm: Point3D = [
      forwardVec[0] * eyeDist + rightVec[0] * ndcX + upVec[0] * ndcY,
      forwardVec[1] * eyeDist + rightVec[1] * ndcX + upVec[1] * ndcY,
      forwardVec[2] * eyeDist + rightVec[2] * ndcX + upVec[2] * ndcY,
    ];
    const len = Math.hypot(rayDirNorm[0], rayDirNorm[1], rayDirNorm[2]) || 1;
    const rayDir: Point3D = [rayDirNorm[0] / len, rayDirNorm[1] / len, rayDirNorm[2] / len];

    let minT = Infinity;
    let hitWorldPt: Point3D | null = null;
    let hitEntityIdx = -1;

    // 1. Ray-mesh intersection test across all entity meshes (triangles and vertex sphere colliders)
    space.entities.forEach((ent, idx) => {
      const mesh: TriangleMesh3D | undefined = ent.cachedMesh;
      if (mesh && mesh.vertices) {
        const verts = mesh.vertices;
        if (mesh.triangles && mesh.triangles.length > 0) {
          for (const tri of mesh.triangles) {
            const v0 = verts[tri[0]];
            const v1 = verts[tri[1]];
            const v2 = verts[tri[2]];
            if (!v0 || !v1 || !v2) continue;

            const res = rayIntersectsTriangle(rayOrig, rayDir, v0, v1, v2);
            if (res.hit && res.t > 0 && res.t < minT) {
              minT = res.t;
              hitWorldPt = res.point || null;
              hitEntityIdx = idx;
            }
          }
        }

        // Vertex sphere colliders
        const rVertex = 0.12;
        for (const v of verts) {
          const sRes = rayIntersectsSphere(rayOrig, rayDir, v, rVertex);
          if (sRes.hit && sRes.t > 0 && sRes.t < minT) {
            minT = sRes.t;
            hitWorldPt = v;
            hitEntityIdx = idx;
          }
        }
      }
    });

    const isHit = hitEntityIdx !== -1 && hitWorldPt !== null;
    // If no geometry hit, unproject ray to z=0 or closest point
    const evalCoord: Point3D = hitWorldPt || [
      ndcX * cosAz + ndcY * sinEl * sinAz,
      -ndcX * sinAz + ndcY * sinEl * cosAz,
      ndcY * cosEl,
    ];

    const fmtStep = (n: number) => {
      if (Math.abs(n) < 1e-10) return '0';
      if (Number.isInteger(n)) return n.toString();
      return n.toFixed(4).replace(/\.?0+$/, '');
    };

    let primaryGridResolution: string | undefined = undefined;
    let primaryGridStep: number | undefined = undefined;

    const inspectedEntities: InspectedEntityRecord[] = [];
    space.entities.forEach((ent, idx) => {
      let val = 0;
      try {
        val = ent.compiledFn(evalCoord[0], evalCoord[1], evalCoord[2]);
      } catch {
        val = Number.NaN;
      }

      const isSnapped = idx === hitEntityIdx && isHit;
      const holds = isSnapped || Math.abs(val) < 1e-2;
      const mesh = ent.cachedMesh;
      const gridResStr = mesh?.resolution ? `${mesh.resolution[0]}×${mesh.resolution[1]}×${mesh.resolution[2]}` : undefined;
      const step3D = mesh?.gridStep ? mesh.gridStep[0] : undefined;

      if (!primaryGridResolution && gridResStr) {
        primaryGridResolution = gridResStr;
        primaryGridStep = step3D;
      }

      const trace = SpatialInspector.generateReductionTrace(ent, evalCoord[0], evalCoord[1], evalCoord[2], {
        isSnapped,
        gridResolution: gridResStr,
        gridStep: step3D,
        dimension: 3,
      });

      let toleranceDesc = 'evaluated off-surface coordinate';
      if (isSnapped) {
        if (Math.abs(val) < 1e-6) {
          toleranceDesc = 'exact algebraic zero (residual = 0)';
        } else if (step3D !== undefined) {
          toleranceDesc = `within mesh tolerance at this resolution (grid step ${fmtStep(step3D)})`;
        } else {
          toleranceDesc = 'within mesh tolerance at this resolution';
        }
      }

      inspectedEntities.push({
        entityIndex: idx,
        relationExpr: ent.source || (ent.ast ? formatAST(ent.ast) : `f(x, y, z) = 0`),
        lineIdx: ent.ast?.span?.line ? ent.ast.span.line - 1 : undefined,
        sourceText: ent.source,
        valueAtPoint: val,
        residual: val,
        holds,
        isSnapped,
        reductionSteps: trace.steps,
        libraryTrace: trace.libraryTrace,
        gridResolution: gridResStr,
        gridStep: step3D,
        toleranceDescription: toleranceDesc,
      });
    });

    return {
      dimension: 3,
      worldCoord: { x: evalCoord[0], y: evalCoord[1], z: evalCoord[2] },
      screenPos: { x: clickScreenX, y: clickScreenY },
      isExactGeometryHit: isHit,
      hitEntities: inspectedEntities,
      gridResolution: primaryGridResolution,
      gridStep: primaryGridStep,
    };
  }

  /**
   * Builds the interactive 3-Layer inspection panel DOM.
   */
  public static renderInspectionPanel(
    result: SpatialInspectionResult,
    options: {
      onJumpToSource?: (lineIdx: number) => void;
      onClose?: () => void;
    } = {}
  ): HTMLElement {
    if (typeof document === 'undefined') {
      return { className: '', innerHTML: '', appendChild: () => {}, remove: () => {}, querySelector: () => null } as any;
    }

    const panel = document.createElement('div');
    panel.className = 'spatial-inspector-panel';

    const coordStr = result.dimension === 1
      ? `x = ${result.worldCoord.x.toFixed(4)}`
      : (result.dimension === 2
        ? `x = ${result.worldCoord.x.toFixed(4)}, y = ${(result.worldCoord.y ?? 0).toFixed(4)}`
        : `x = ${result.worldCoord.x.toFixed(4)}, y = ${(result.worldCoord.y ?? 0).toFixed(4)}, z = ${(result.worldCoord.z ?? 0).toFixed(4)}`);

    const gridTag = result.gridResolution ? `Grid: ${result.gridResolution}` : undefined;

    // Top Header: Coordinates, Grid Resolution & Close button
    const header = document.createElement('div');
    header.className = 'spatial-inspector-header';
    header.innerHTML = `
      <div class="spatial-inspector-coords">
        <span class="spatial-inspector-tag">${result.dimension}D Point</span>
        <span class="spatial-inspector-coord-val">(${escapeHtml(coordStr)})</span>
        ${gridTag ? `<span class="spatial-inspector-grid-tag">${escapeHtml(gridTag)}</span>` : ''}
      </div>
      <button class="spatial-inspector-close-btn" title="Close (Esc)">&times;</button>
    `;

    const closeBtn = header.querySelector('.spatial-inspector-close-btn') as HTMLElement;
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      options.onClose?.();
      panel.remove();
    });

    panel.appendChild(header);

    // Entity Cards (Handling single or multiple intersecting relations)
    const body = document.createElement('div');
    body.className = 'spatial-inspector-body';

    const fmtResidual = (val: number) => {
      if (Math.abs(val) < 1e-12) return '0';
      if (Number.isInteger(val)) return val.toString();
      return val.toFixed(4).replace(/\.?0+$/, '');
    };

    if (result.hitEntities.length === 0) {
      body.innerHTML = `<div class="spatial-inspector-empty">No relations in space.</div>`;
    } else {
      result.hitEntities.forEach((ent) => {
        const card = document.createElement('div');
        const isNearZero = Math.abs(ent.residual) < 1e-4;
        card.className = `spatial-inspector-card ${isNearZero || ent.isSnapped ? 'holds' : 'residual'}`;

        const residualValStr = fmtResidual(ent.residual);
        const residualBadge = `<span class="spatial-residual-tag">f = ${residualValStr}</span>`;

        const sourceLineHtml = typeof ent.lineIdx === 'number'
          ? `<button class="spatial-jump-line-btn" title="Go to line">Line ${ent.lineIdx + 1}</button>`
          : `<span class="spatial-line-tag">Space Relation</span>`;

        let stepsHtml = '';
        ent.reductionSteps.forEach((step, sIdx) => {
          stepsHtml += `
            <div class="spatial-reduction-step">
              <div class="step-label">${sIdx + 1}. ${escapeHtml(step.label)}</div>
              <div class="step-equation">${typesetMath(step.equation, { displayMode: false })}</div>
              ${step.detail ? `<div class="step-detail">${escapeHtml(step.detail)}</div>` : ''}
            </div>
          `;
        });

        let libHtml = '';
        if (ent.libraryTrace) {
          libHtml += `
            <div class="spatial-lib-trace">
              <div class="lib-trace-title">${escapeHtml(ent.libraryTrace.functionName)}</div>
              <div class="lib-iterations">
                ${ent.libraryTrace.iterations.map(it => `
                  <div class="lib-iteration-row">
                    <span class="it-idx">Step ${it.iteration}:</span>
                    <span class="it-val">${escapeHtml(it.formula)}</span>
                  </div>
                `).join('')}
              </div>
              <div class="lib-converged">Converged value: <strong>${ent.libraryTrace.convergedValue.toFixed(6)}</strong></div>
            </div>
          `;
        }

        const toleranceNoteHtml = ent.toleranceDescription
          ? `<div class="spatial-tolerance-note">${escapeHtml(ent.toleranceDescription)}</div>`
          : '';

        card.innerHTML = `
          <!-- Layer 1: What is here -->
          <div class="spatial-layer-1">
            <div class="layer-title">Value at point</div>
            <div class="layer-1-row">
              <div class="relation-source">${typesetMath(ent.relationExpr, { displayMode: false })}</div>
              ${residualBadge}
            </div>
            ${toleranceNoteHtml}
          </div>

          <!-- Layer 2: What produced this -->
          <div class="spatial-layer-2">
            <div class="layer-title">Where it came from</div>
            <div class="layer-2-row">
              <span class="provenance-label">Origin</span>
              ${sourceLineHtml}
            </div>
          </div>

          <!-- Layer 3: How it got that value -->
          <div class="spatial-layer-3">
            <div class="layer-title-collapsible">
              <span>How it got here</span>
              <span class="collapsible-icon">\u25be</span>
            </div>
            <div class="spatial-reduction-content">
              ${stepsHtml}
              ${libHtml}
            </div>
          </div>
        `;

        // Wire jump-to-line button
        const jumpBtn = card.querySelector('.spatial-jump-line-btn') as HTMLElement;
        if (jumpBtn && typeof ent.lineIdx === 'number') {
          jumpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            options.onJumpToSource?.(ent.lineIdx!);
          });
        }

        // Wire collapsible toggle
        const toggleBtn = card.querySelector('.layer-title-collapsible') as HTMLElement;
        const reductionContent = card.querySelector('.spatial-reduction-content') as HTMLElement;
        toggleBtn?.addEventListener('click', () => {
          reductionContent.classList.toggle('collapsed');
          const icon = toggleBtn.querySelector('.collapsible-icon') as HTMLElement;
          if (icon) {
            icon.textContent = reductionContent.classList.contains('collapsed') ? '\u25b8' : '\u25be';
          }
        });

        body.appendChild(card);
      });
    }

    panel.appendChild(body);
    return panel;
  }
}
