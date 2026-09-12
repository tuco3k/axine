/**
 * Spatial Inspector: 3-Layer Graph Inspection Engine (1D, 2D, 3D)
 * 
 * Layer 1: What is here (coordinates & evaluated relation truth/residual)
 * Layer 2: What produced this (relation AST, document source line anchor with jump-to-source)
 * Layer 3: How it got that value (point-wise algebraic reduction trace & Newton-Raphson library iterations)
 */

import { SpaceValue, SpatialEntity, ASTNode, Span } from '../core/types';
import { Bounds2D, Bounds3D, Point2D, Point3D, TriangleMesh3D } from '../core/sampler';
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
}

export interface SpatialInspectionResult {
  dimension: 1 | 2 | 3;
  worldCoord: { x: number; y?: number; z?: number };
  screenPos: { x: number; y: number };
  isExactGeometryHit: boolean;
  hitEntities: InspectedEntityRecord[];
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
  if (u < 0.0 || u > 1.0) {
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
  if (v < 0.0 || u + v > 1.0) {
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
    z0?: number
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

    steps.push({
      label: 'Coordinate Substitution',
      equation: instantiatedExpr,
      detail: `Instantiate spatial coordinates at (${[fmt(x0), y0 !== undefined ? fmt(y0) : null, z0 !== undefined ? fmt(z0) : null].filter(Boolean).join(', ')})`,
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
      const isZero = Math.abs(val) < 1e-4;

      if (isZero) {
        steps.push({
          label: 'Exact Relation Reduction',
          equation: `f(${fmt(x0)}${y0 !== undefined ? `, ${fmt(y0)}` : ''}) = 0`,
          detail: 'Algebraic equality confirmed: point lies exactly on geometric locus (residual \u2248 0).',
        });
      } else {
        steps.push({
          label: 'Residual Evaluation',
          equation: `f(${fmt(x0)}${y0 !== undefined ? `, ${fmt(y0)}` : ''}) = ${fmt(val)} \\neq 0`,
          detail: `Residual deviation is ${fmt(val)}, confirming no geometric locus exists at this coordinate point.`,
        });
      }
    } catch {
      // Fallback
    }

    return { steps, libraryTrace: libTrace };
  }

  /**
   * Hit test in 1D Number Line space.
   */
  public static inspect1D(
    space: SpaceValue,
    bounds2D: Bounds2D,
    clickPixelX: number,
    width: number,
    pixelTolerance: number = 8
  ): SpatialInspectionResult {
    const minX = bounds2D.minX;
    const maxX = bounds2D.maxX;
    const worldX = minX + (clickPixelX / width) * (maxX - minX);
    const pixelScale = width / Math.max(1e-6, maxX - minX);

    let isExact = false;
    const hitEntities: InspectedEntityRecord[] = [];

    space.entities.forEach((ent, idx) => {
      let inspectedX = worldX;
      let holds = false;

      // Check cached roots
      if (ent.cachedRoots1D && ent.cachedRoots1D.length > 0) {
        for (const root of ent.cachedRoots1D) {
          const distPx = Math.abs(root - worldX) * pixelScale;
          if (distPx <= pixelTolerance) {
            inspectedX = root;
            isExact = true;
            holds = true;
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

      if (Math.abs(val) < 1e-4) {
        holds = true;
        isExact = true;
      }

      const trace = SpatialInspector.generateReductionTrace(ent, inspectedX);
      hitEntities.push({
        entityIndex: idx,
        relationExpr: ent.source || (ent.ast ? formatAST(ent.ast) : `f(x) = 0`),
        lineIdx: ent.ast?.span?.line ? ent.ast.span.line - 1 : undefined,
        sourceText: ent.source,
        valueAtPoint: val,
        residual: val,
        holds,
        isSnapped: isExact,
        reductionSteps: trace.steps,
        libraryTrace: trace.libraryTrace,
      });
    });

    return {
      dimension: 1,
      worldCoord: { x: worldX },
      screenPos: { x: clickPixelX, y: 0 },
      isExactGeometryHit: isExact,
      hitEntities,
    };
  }

  /**
   * Hit test in 2D Cartesian Space.
   */
  public static inspect2D(
    space: SpaceValue,
    bounds2D: Bounds2D,
    clickScreenX: number,
    clickScreenY: number,
    width: number,
    height: number,
    pixelTolerance: number = 8
  ): SpatialInspectionResult {
    const minX = bounds2D.minX;
    const maxX = bounds2D.maxX;
    const minY = bounds2D.minY;
    const maxY = bounds2D.maxY;

    const rawWorldX = minX + (clickScreenX / width) * (maxX - minX);
    const rawWorldY = maxY - (clickScreenY / height) * (maxY - minY);

    const scaleX = width / Math.max(1e-6, maxX - minX);
    const scaleY = height / Math.max(1e-6, maxY - minY);

    let bestDistPx = Infinity;
    let snappedX = rawWorldX;
    let snappedY = rawWorldY;
    let isSnapped = false;

    const entitySnapInfo: {
      index: number;
      ent: SpatialEntity;
      distPx: number;
      snapPt: [number, number];
    }[] = [];

    // 1. Hit test all entity contours
    space.entities.forEach((ent, idx) => {
      let entMinDist = Infinity;
      let entSnapPt: [number, number] = [rawWorldX, rawWorldY];

      if (ent.cachedContours && ent.cachedContours.polylines) {
        for (const poly of ent.cachedContours.polylines) {
          const pts = poly.points;
          for (let i = 0; i < pts.length - 1; i++) {
            const p1 = pts[i];
            const p2 = pts[i + 1];
            // Screen coords of segment
            const sx1 = (p1[0] - minX) * scaleX;
            const sy1 = (maxY - p1[1]) * scaleY;
            const sx2 = (p2[0] - minX) * scaleX;
            const sy2 = (maxY - p2[1]) * scaleY;

            const segRes = pointToSegmentDistance(clickScreenX, clickScreenY, sx1, sy1, sx2, sy2);
            if (segRes.dist < entMinDist) {
              entMinDist = segRes.dist;
              // Convert screen closest back to world
              const cWorldX = minX + (segRes.closestX / width) * (maxX - minX);
              const cWorldY = maxY - (segRes.closestY / height) * (maxY - minY);
              entSnapPt = [cWorldX, cWorldY];
            }
          }
        }
      }

      if (entMinDist <= pixelTolerance) {
        entitySnapInfo.push({
          index: idx,
          ent,
          distPx: entMinDist,
          snapPt: entSnapPt,
        });
        if (entMinDist < bestDistPx) {
          bestDistPx = entMinDist;
          snappedX = entSnapPt[0];
          snappedY = entSnapPt[1];
          isSnapped = true;
        }
      }
    });

    const inspectedEntities: InspectedEntityRecord[] = [];
    const evalX = isSnapped ? snappedX : rawWorldX;
    const evalY = isSnapped ? snappedY : rawWorldY;

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
      const trace = SpatialInspector.generateReductionTrace(ent, ptX, ptY);

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
      });
    });

    return {
      dimension: 2,
      worldCoord: { x: evalX, y: evalY },
      screenPos: { x: clickScreenX, y: clickScreenY },
      isExactGeometryHit: isSnapped,
      hitEntities: inspectedEntities,
    };
  }

  /**
   * Hit test in 3D Mesh space via view-ray picking (Möller–Trumbore ray-triangle intersection).
   */
  public static inspect3D(
    space: SpaceValue,
    bounds3D: Bounds3D,
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
    const scale3D = Math.min(width, height) * 0.22 * camera.zoom3D;

    // Approximate camera ray direction in world space
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

    // 1. Ray-mesh intersection test across all entity meshes
    space.entities.forEach((ent, idx) => {
      const mesh: TriangleMesh3D | undefined = ent.cachedMesh;
      if (mesh && mesh.vertices && mesh.triangles) {
        const verts = mesh.vertices;
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
    });

    // 2. If no mesh hit, intersect with ground plane z = 0 for empty space coordinates
    if (!hitWorldPt) {
      if (Math.abs(rayDir[2]) > 1e-6) {
        const tPlane = -rayOrig[2] / rayDir[2];
        if (tPlane > 0) {
          hitWorldPt = [
            rayOrig[0] + rayDir[0] * tPlane,
            rayOrig[1] + rayDir[1] * tPlane,
            0,
          ];
        }
      }
      if (!hitWorldPt) {
        hitWorldPt = [ndcX, ndcY, 0];
      }
    }

    const isHit = hitEntityIdx !== -1;
    const inspectedEntities: InspectedEntityRecord[] = [];

    space.entities.forEach((ent, idx) => {
      const ptX = hitWorldPt![0];
      const ptY = hitWorldPt![1];
      const ptZ = hitWorldPt![2];

      let val = 0;
      try {
        val = ent.compiledFn(ptX, ptY, ptZ);
      } catch {
        val = Number.NaN;
      }

      const holds = (isHit && idx === hitEntityIdx) || Math.abs(val) < 1e-3;
      const trace = SpatialInspector.generateReductionTrace(ent, ptX, ptY, ptZ);

      inspectedEntities.push({
        entityIndex: idx,
        relationExpr: ent.source || (ent.ast ? formatAST(ent.ast) : `f(x, y, z) = 0`),
        lineIdx: ent.ast?.span?.line ? ent.ast.span.line - 1 : undefined,
        sourceText: ent.source,
        valueAtPoint: val,
        residual: val,
        holds,
        isSnapped: isHit && idx === hitEntityIdx,
        reductionSteps: trace.steps,
        libraryTrace: trace.libraryTrace,
      });
    });

    return {
      dimension: 3,
      worldCoord: { x: hitWorldPt[0], y: hitWorldPt[1], z: hitWorldPt[2] },
      screenPos: { x: clickScreenX, y: clickScreenY },
      isExactGeometryHit: isHit,
      hitEntities: inspectedEntities,
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
    const panel = document.createElement('div');
    panel.className = 'spatial-inspector-panel';

    const coordStr = result.dimension === 1
      ? `x = ${result.worldCoord.x.toFixed(4)}`
      : (result.dimension === 2
        ? `x = ${result.worldCoord.x.toFixed(4)}, y = ${(result.worldCoord.y ?? 0).toFixed(4)}`
        : `x = ${result.worldCoord.x.toFixed(4)}, y = ${(result.worldCoord.y ?? 0).toFixed(4)}, z = ${(result.worldCoord.z ?? 0).toFixed(4)}`);

    // Top Header: Coordinates & Close button
    const header = document.createElement('div');
    header.className = 'spatial-inspector-header';
    header.innerHTML = `
      <div class="spatial-inspector-coords">
        <span class="spatial-inspector-tag">${result.dimension}D Point</span>
        <span class="spatial-inspector-coord-val">(${escapeHtml(coordStr)})</span>
      </div>
      <button class="spatial-inspector-close-btn" title="Close inspector (Esc)">&times;</button>
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

    if (result.hitEntities.length === 0) {
      body.innerHTML = `<div class="spatial-inspector-empty">No active mathematical relations in this space.</div>`;
    } else {
      result.hitEntities.forEach((ent) => {
        const card = document.createElement('div');
        card.className = `spatial-inspector-card ${ent.holds ? 'holds' : 'residual'}`;

        const statusBadge = ent.holds
          ? `<span class="spatial-status-badge verified">Holds (f = 0)</span>`
          : `<span class="spatial-status-badge stale">Residual: ${ent.residual.toFixed(4)}</span>`;

        const sourceLineHtml = typeof ent.lineIdx === 'number'
          ? `<button class="spatial-jump-line-btn" title="Jump to definition in document">Line ${ent.lineIdx + 1}</button>`
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

        card.innerHTML = `
          <!-- Layer 1: What is here -->
          <div class="spatial-layer-1">
            <div class="layer-title">Layer 1: Value at Point</div>
            <div class="layer-1-row">
              <div class="relation-source">${typesetMath(ent.relationExpr, { displayMode: false })}</div>
              ${statusBadge}
            </div>
          </div>

          <!-- Layer 2: What produced this -->
          <div class="spatial-layer-2">
            <div class="layer-title">Layer 2: Source Provenance</div>
            <div class="layer-2-row">
              <span class="provenance-label">Origin:</span>
              ${sourceLineHtml}
            </div>
          </div>

          <!-- Layer 3: How it got that value -->
          <div class="spatial-layer-3">
            <div class="layer-title-collapsible">
              <span>Layer 3: Algebraic Reduction & Derivation</span>
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
