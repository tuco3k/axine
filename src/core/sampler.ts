import { NumericCompiledFn } from './compiler';
import { MARCHING_CUBES_TRI_TABLE, CUBE_EDGE_VERTICES } from './marching_cubes_tables';

export type RangeInput = [number, number] | { min: number; max: number };

export interface Range1D {
  min: number;
  max: number;
}

export type Point2D = [number, number]; // [x, y]
export type Point3D = [number, number, number]; // [x, y, z]

export interface Polyline2D {
  points: Point2D[];
  closed: boolean;
}

export interface Bounds2D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface Bounds3D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface Contour2DResult {
  polylines: Polyline2D[];
  bounds: Bounds2D | null;
  sampleCount: number;
}

export interface TriangleMesh3D {
  vertices: Point3D[];
  triangles: [number, number, number][];
  positions: Float32Array;
  indices: Uint32Array;
  bounds: Bounds3D | null;
  sampleCount: number;
}

function normalizeRange(r: RangeInput): Range1D {
  if (Array.isArray(r)) {
    return { min: Math.min(r[0], r[1]), max: Math.max(r[0], r[1]) };
  }
  return { min: Math.min(r.min, r.max), max: Math.max(r.min, r.max) };
}

// Global edge direction offset mapping for fast Int32Array caching in 3D:
// [di, dj, dk, dir] where dir is 0 (X), 1 (Y), 2 (Z)
const CUBE_EDGE_DIR_MAP: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0, 0, 0], // Edge 0: (i, j, k) along X
  [1, 0, 0, 1], // Edge 1: (i+1, j, k) along Y
  [0, 1, 0, 0], // Edge 2: (i, j+1, k) along X
  [0, 0, 0, 1], // Edge 3: (i, j, k) along Y
  [0, 0, 1, 0], // Edge 4: (i, j, k+1) along X
  [1, 0, 1, 1], // Edge 5: (i+1, j, k+1) along Y
  [0, 1, 1, 0], // Edge 6: (i, j+1, k+1) along X
  [0, 0, 1, 1], // Edge 7: (i, j, k+1) along Y
  [0, 0, 0, 2], // Edge 8: (i, j, k) along Z
  [1, 0, 0, 2], // Edge 9: (i+1, j, k) along Z
  [1, 1, 0, 2], // Edge 10: (i+1, j+1, k) along Z
  [0, 1, 0, 2], // Edge 11: (i, j+1, k) along Z
];

// Corner binary coordinate offsets (x, y, z) for 0..7
const CORNER_X = [0, 1, 1, 0, 0, 1, 1, 0];
const CORNER_Y = [0, 0, 1, 1, 0, 0, 1, 1];
const CORNER_Z = [0, 0, 0, 0, 1, 1, 1, 1];

/**
 * Evaluates a compiled 2D relation over a grid and extracts contour polylines
 * using Marching Squares with saddle disambiguation.
 */
export function sample2D(
  fn: (x: number, y: number) => number,
  xRangeInput: RangeInput,
  yRangeInput: RangeInput,
  resolution: number | [number, number]
): Contour2DResult {
  const xR = normalizeRange(xRangeInput);
  const yR = normalizeRange(yRangeInput);

  const nx = Math.max(1, Math.floor(Array.isArray(resolution) ? resolution[0] : resolution));
  const ny = Math.max(1, Math.floor(Array.isArray(resolution) ? resolution[1] : resolution));

  // Degenerate inputs: zero width range or resolution < 2
  if (xR.max <= xR.min || yR.max <= yR.min || nx < 2 || ny < 2) {
    return { polylines: [], bounds: null, sampleCount: 0 };
  }

  const dx = (xR.max - xR.min) / (nx - 1);
  const dy = (yR.max - yR.min) / (ny - 1);

  // Pre-allocate and sample grid
  const grid = new Float64Array(nx * ny);
  let allPositive = true;
  let allNegative = true;
  let hasValidFinite = false;

  for (let j = 0; j < ny; j++) {
    const y = yR.min + j * dy;
    const rowOffset = j * nx;
    for (let i = 0; i < nx; i++) {
      const x = xR.min + i * dx;
      let val = fn(x, y);
      if (!Number.isFinite(val)) {
        val = Number.NaN;
      } else {
        hasValidFinite = true;
        if (val < 0) allPositive = false;
        if (val > 0) allNegative = false;
      }
      grid[rowOffset + i] = val;
    }
  }

  // If everywhere positive or everywhere negative (no sign changes), return empty
  if (!hasValidFinite || allPositive || allNegative) {
    return { polylines: [], bounds: null, sampleCount: nx * ny };
  }

  // Extract line segments using Marching Squares
  interface Segment {
    p1: Point2D;
    p2: Point2D;
  }
  const segments: Segment[] = [];

  for (let j = 0; j < ny - 1; j++) {
    const y0 = yR.min + j * dy;
    const y1 = y0 + dy;
    const r0 = j * nx;
    const r1 = (j + 1) * nx;

    for (let i = 0; i < nx - 1; i++) {
      const x0 = xR.min + i * dx;
      const x1 = x0 + dx;

      const v0 = grid[r0 + i]; // bottom-left (0)
      const v1 = grid[r0 + i + 1]; // bottom-right (1)
      const v2 = grid[r1 + i + 1]; // top-right (2)
      const v3 = grid[r1 + i]; // top-left (3)

      const c0Finite = Number.isFinite(v0);
      const c1Finite = Number.isFinite(v1);
      const c2Finite = Number.isFinite(v2);
      const c3Finite = Number.isFinite(v3);
      if (!c0Finite && !c1Finite && !c2Finite && !c3Finite) continue;

      const b0 = c0Finite && v0 >= 0 ? 1 : 0;
      const b1 = c1Finite && v1 >= 0 ? 1 : 0;
      const b2 = c2Finite && v2 >= 0 ? 1 : 0;
      const b3 = c3Finite && v3 >= 0 ? 1 : 0;

      const caseIndex = b0 | (b1 << 1) | (b2 << 2) | (b3 << 3);
      if (caseIndex === 0 || caseIndex === 15) continue;

      const e0 = (): Point2D => {
        let t = Number.isFinite(v0) && Number.isFinite(v1) && Math.abs(v1 - v0) > 1e-15 ? -v0 / (v1 - v0) : 0.5;
        t = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0.5));
        return [x0 + t * dx, y0];
      };
      const e1 = (): Point2D => {
        let t = Number.isFinite(v1) && Number.isFinite(v2) && Math.abs(v2 - v1) > 1e-15 ? -v1 / (v2 - v1) : 0.5;
        t = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0.5));
        return [x1, y0 + t * dy];
      };
      const e2 = (): Point2D => {
        let t = Number.isFinite(v3) && Number.isFinite(v2) && Math.abs(v2 - v3) > 1e-15 ? -v3 / (v2 - v3) : 0.5;
        t = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0.5));
        return [x0 + t * dx, y1];
      };
      const e3 = (): Point2D => {
        let t = Number.isFinite(v0) && Number.isFinite(v3) && Math.abs(v3 - v0) > 1e-15 ? -v0 / (v3 - v0) : 0.5;
        t = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0.5));
        return [x0, y0 + t * dy];
      };

      switch (caseIndex) {
        case 1: // 0001
        case 14: // 1110
          segments.push({ p1: e3(), p2: e0() });
          break;
        case 2: // 0010
        case 13: // 1101
          segments.push({ p1: e0(), p2: e1() });
          break;
        case 3: // 0011
        case 12: // 1100
          segments.push({ p1: e3(), p2: e1() });
          break;
        case 4: // 0100
        case 11: // 1011
          segments.push({ p1: e1(), p2: e2() });
          break;
        case 5: {
          // 0101 (Saddle case)
          const vCenter = (v0 + v1 + v2 + v3) / 4;
          if (vCenter >= 0) {
            segments.push({ p1: e3(), p2: e2() });
            segments.push({ p1: e0(), p2: e1() });
          } else {
            segments.push({ p1: e3(), p2: e0() });
            segments.push({ p1: e1(), p2: e2() });
          }
          break;
        }
        case 6: // 0110
        case 9: // 1001
          segments.push({ p1: e0(), p2: e2() });
          break;
        case 7: // 0111
        case 8: // 1000
          segments.push({ p1: e3(), p2: e2() });
          break;
        case 10: {
          // 1010 (Saddle case)
          const vCenter = (v0 + v1 + v2 + v3) / 4;
          if (vCenter >= 0) {
            segments.push({ p1: e3(), p2: e0() });
            segments.push({ p1: e1(), p2: e2() });
          } else {
            segments.push({ p1: e3(), p2: e2() });
            segments.push({ p1: e0(), p2: e1() });
          }
          break;
        }
      }
    }
  }

  // Assemble line segments into contiguous polylines
  const polylines = stitchSegments(segments, Math.min(dx, dy) * 0.1);

  // Compute bounding box
  let bounds: Bounds2D | null = null;
  if (polylines.length > 0) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const poly of polylines) {
      for (const [px, py] of poly.points) {
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
    if (Number.isFinite(minX)) {
      bounds = { minX, maxX, minY, maxY };
    }
  }

  return {
    polylines,
    bounds,
    sampleCount: nx * ny,
  };
}

/**
 * Stitches disjoint line segments into maximal connected polylines.
 */
function stitchSegments(
  segments: Array<{ p1: Point2D; p2: Point2D }>,
  tolerance: number
): Polyline2D[] {
  if (segments.length === 0) return [];

  const quant = Math.max(1e-10, tolerance);
  const pointKey = (p: Point2D) => `${Math.round(p[0] / quant)},${Math.round(p[1] / quant)}`;

  interface Node {
    point: Point2D;
    neighbors: Array<{ nodeIdx: number; segIdx: number }>;
  }

  const nodes: Node[] = [];
  const keyToNode = new Map<string, number>();

  function getOrCreateNode(p: Point2D): number {
    const k = pointKey(p);
    let idx = keyToNode.get(k);
    if (idx === undefined) {
      idx = nodes.length;
      nodes.push({ point: p, neighbors: [] });
      keyToNode.set(k, idx);
    }
    return idx;
  }

  for (let sIdx = 0; sIdx < segments.length; sIdx++) {
    const seg = segments[sIdx];
    const n1 = getOrCreateNode(seg.p1);
    const n2 = getOrCreateNode(seg.p2);
    if (n1 !== n2) {
      nodes[n1].neighbors.push({ nodeIdx: n2, segIdx: sIdx });
      nodes[n2].neighbors.push({ nodeIdx: n1, segIdx: sIdx });
    }
  }

  const usedSegments = new Uint8Array(segments.length);
  const polylines: Polyline2D[] = [];

  // 1. First trace paths starting at endpoints (degree === 1)
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.neighbors.length === 1) {
      const startEdge = node.neighbors[0];
      if (usedSegments[startEdge.segIdx]) continue;

      const path: Point2D[] = [node.point];
      let currNodeIdx = i;

      while (true) {
        let nextEdge: { nodeIdx: number; segIdx: number } | null = null;
        for (const edge of nodes[currNodeIdx].neighbors) {
          if (!usedSegments[edge.segIdx]) {
            nextEdge = edge;
            break;
          }
        }
        if (!nextEdge) break;

        usedSegments[nextEdge.segIdx] = 1;
        currNodeIdx = nextEdge.nodeIdx;
        path.push(nodes[currNodeIdx].point);
      }

      if (path.length > 1) {
        polylines.push({ points: path, closed: false });
      }
    }
  }

  // 2. Then trace remaining closed loops
  for (let i = 0; i < nodes.length; i++) {
    while (true) {
      let startEdge: { nodeIdx: number; segIdx: number } | null = null;
      for (const edge of nodes[i].neighbors) {
        if (!usedSegments[edge.segIdx]) {
          startEdge = edge;
          break;
        }
      }
      if (!startEdge) break;

      const path: Point2D[] = [nodes[i].point];
      let currNodeIdx = i;

      while (true) {
        let nextEdge: { nodeIdx: number; segIdx: number } | null = null;
        for (const edge of nodes[currNodeIdx].neighbors) {
          if (!usedSegments[edge.segIdx]) {
            nextEdge = edge;
            break;
          }
        }
        if (!nextEdge) break;

        usedSegments[nextEdge.segIdx] = 1;
        currNodeIdx = nextEdge.nodeIdx;
        path.push(nodes[currNodeIdx].point);
      }

      if (path.length > 1) {
        const first = path[0];
        const last = path[path.length - 1];
        const distSq = (first[0] - last[0]) ** 2 + (first[1] - last[1]) ** 2;
        const closed = distSq < quant * quant * 4;
        polylines.push({ points: path, closed });
      }
    }
  }

  return polylines;
}

/**
 * Evaluates a compiled 3D relation over a domain and extracts an isosurface
 * triangle mesh using zero-allocation Marching Cubes with flat scalar caching.
 */
export function sample3D(
  fn: (x: number, y: number, z: number) => number,
  xRangeInput: RangeInput,
  yRangeInput: RangeInput,
  zRangeInput: RangeInput,
  resolution: number | [number, number, number]
): TriangleMesh3D {
  const xR = normalizeRange(xRangeInput);
  const yR = normalizeRange(yRangeInput);
  const zR = normalizeRange(zRangeInput);

  const nx = Math.max(1, Math.floor(Array.isArray(resolution) ? resolution[0] : resolution));
  const ny = Math.max(1, Math.floor(Array.isArray(resolution) ? resolution[1] : resolution));
  const nz = Math.max(1, Math.floor(Array.isArray(resolution) ? resolution[2] : resolution));

  if (xR.max <= xR.min || yR.max <= yR.min || zR.max <= zR.min || nx < 2 || ny < 2 || nz < 2) {
    return {
      vertices: [],
      triangles: [],
      positions: new Float32Array(0),
      indices: new Uint32Array(0),
      bounds: null,
      sampleCount: 0,
    };
  }

  const dx = (xR.max - xR.min) / (nx - 1);
  const dy = (yR.max - yR.min) / (ny - 1);
  const dz = (zR.max - zR.min) / (nz - 1);

  // Pre-sample 3D grid: index = (k * ny + j) * nx + i
  const totalSamples = nx * ny * nz;
  const grid = new Float64Array(totalSamples);

  let allPositive = true;
  let allNegative = true;
  let hasValidFinite = false;

  for (let k = 0; k < nz; k++) {
    const z = zR.min + k * dz;
    const sliceOffset = k * ny * nx;
    for (let j = 0; j < ny; j++) {
      const y = yR.min + j * dy;
      const rowOffset = sliceOffset + j * nx;
      for (let i = 0; i < nx; i++) {
        const x = xR.min + i * dx;
        let val = fn(x, y, z);
        if (!Number.isFinite(val)) {
          val = Number.NaN;
        } else {
          hasValidFinite = true;
          if (val < 0) allPositive = false;
          if (val > 0) allNegative = false;
        }
        grid[rowOffset + i] = val;
      }
    }
  }

  if (!hasValidFinite || allPositive || allNegative) {
    return {
      vertices: [],
      triangles: [],
      positions: new Float32Array(0),
      indices: new Uint32Array(0),
      bounds: null,
      sampleCount: totalSamples,
    };
  }

  const vertices: Point3D[] = [];
  const triangles: [number, number, number][] = [];

  // Flat Int32Array cache for high-speed O(1) edge-vertex reuse across cubes: (nx * ny * nz * 3)
  const edgeCache = new Int32Array(totalSamples * 3);
  edgeCache.fill(-1);

  function getEdgeVertex(
    i: number,
    j: number,
    k: number,
    edgeIdx: number,
    x0: number,
    y0: number,
    z0: number,
    vA: number,
    vB: number
  ): number {
    const [di, dj, dk, dir] = CUBE_EDGE_DIR_MAP[edgeIdx];
    const cacheIdx = (((k + dk) * ny + (j + dj)) * nx + (i + di)) * 3 + dir;

    let vIdx = edgeCache[cacheIdx];
    if (vIdx === -1) {
      const [vA_idx, vB_idx] = CUBE_EDGE_VERTICES[edgeIdx];
      const pAx = x0 + CORNER_X[vA_idx] * dx;
      const pAy = y0 + CORNER_Y[vA_idx] * dy;
      const pAz = z0 + CORNER_Z[vA_idx] * dz;

      const pBx = x0 + CORNER_X[vB_idx] * dx;
      const pBy = y0 + CORNER_Y[vB_idx] * dy;
      const pBz = z0 + CORNER_Z[vB_idx] * dz;

      let t = -vA / (vB - vA);
      if (!Number.isFinite(t)) t = 0.5;
      t = Math.max(0, Math.min(1, t));

      const vx = pAx + t * (pBx - pAx);
      const vy = pAy + t * (pBy - pAy);
      const vz = pAz + t * (pBz - pAz);

      vIdx = vertices.length;
      vertices.push([vx, vy, vz]);
      edgeCache[cacheIdx] = vIdx;
    }
    return vIdx;
  }

  for (let k = 0; k < nz - 1; k++) {
    const z0 = zR.min + k * dz;
    const s0 = k * ny * nx;
    const s1 = (k + 1) * ny * nx;

    for (let j = 0; j < ny - 1; j++) {
      const y0 = yR.min + j * dy;
      const r00 = s0 + j * nx;
      const r01 = s0 + (j + 1) * nx;
      const r10 = s1 + j * nx;
      const r11 = s1 + (j + 1) * nx;

      for (let i = 0; i < nx - 1; i++) {
        const x0 = xR.min + i * dx;

        const v0 = grid[r00 + i];
        const v1 = grid[r00 + i + 1];
        const v2 = grid[r01 + i + 1];
        const v3 = grid[r01 + i];
        const v4 = grid[r10 + i];
        const v5 = grid[r10 + i + 1];
        const v6 = grid[r11 + i + 1];
        const v7 = grid[r11 + i];

        let cubeMask = 0;
        if (v0 < 0) cubeMask |= 1;
        if (v1 < 0) cubeMask |= 2;
        if (v2 < 0) cubeMask |= 4;
        if (v3 < 0) cubeMask |= 8;
        if (v4 < 0) cubeMask |= 16;
        if (v5 < 0) cubeMask |= 32;
        if (v6 < 0) cubeMask |= 64;
        if (v7 < 0) cubeMask |= 128;

        if (cubeMask === 0 || cubeMask === 255) continue;

        const tris = MARCHING_CUBES_TRI_TABLE[cubeMask];
        if (!tris || tris.length === 0) continue;

        const cv0 = v0, cv1 = v1, cv2 = v2, cv3 = v3;
        const cv4 = v4, cv5 = v5, cv6 = v6, cv7 = v7;

        for (let t = 0; t < tris.length; t += 3) {
          const e0 = tris[t];
          const e1 = tris[t + 1];
          const e2 = tris[t + 2];

          const [vA0, vB0] = CUBE_EDGE_VERTICES[e0];
          const [vA1, vB1] = CUBE_EDGE_VERTICES[e1];
          const [vA2, vB2] = CUBE_EDGE_VERTICES[e2];

          const valA0 = vA0 === 0 ? cv0 : vA0 === 1 ? cv1 : vA0 === 2 ? cv2 : vA0 === 3 ? cv3 : vA0 === 4 ? cv4 : vA0 === 5 ? cv5 : vA0 === 6 ? cv6 : cv7;
          const valB0 = vB0 === 0 ? cv0 : vB0 === 1 ? cv1 : vB0 === 2 ? cv2 : vB0 === 3 ? cv3 : vB0 === 4 ? cv4 : vB0 === 5 ? cv5 : vB0 === 6 ? cv6 : cv7;

          const valA1 = vA1 === 0 ? cv0 : vA1 === 1 ? cv1 : vA1 === 2 ? cv2 : vA1 === 3 ? cv3 : vA1 === 4 ? cv4 : vA1 === 5 ? cv5 : vA1 === 6 ? cv6 : cv7;
          const valB1 = vB1 === 0 ? cv0 : vB1 === 1 ? cv1 : vB1 === 2 ? cv2 : vB1 === 3 ? cv3 : vB1 === 4 ? cv4 : vB1 === 5 ? cv5 : vB1 === 6 ? cv6 : cv7;

          const valA2 = vA2 === 0 ? cv0 : vA2 === 1 ? cv1 : vA2 === 2 ? cv2 : vA2 === 3 ? cv3 : vA2 === 4 ? cv4 : vA2 === 5 ? cv5 : vA2 === 6 ? cv6 : cv7;
          const valB2 = vB2 === 0 ? cv0 : vB2 === 1 ? cv1 : vB2 === 2 ? cv2 : vB2 === 3 ? cv3 : vB2 === 4 ? cv4 : vB2 === 5 ? cv5 : vB2 === 6 ? cv6 : cv7;

          const idx0 = getEdgeVertex(i, j, k, e0, x0, y0, z0, valA0, valB0);
          const idx1 = getEdgeVertex(i, j, k, e1, x0, y0, z0, valA1, valB1);
          const idx2 = getEdgeVertex(i, j, k, e2, x0, y0, z0, valA2, valB2);

          triangles.push([idx0, idx1, idx2]);
        }
      }
    }
  }

  // Pack flat buffers
  const positions = new Float32Array(vertices.length * 3);
  for (let i = 0; i < vertices.length; i++) {
    positions[i * 3] = vertices[i][0];
    positions[i * 3 + 1] = vertices[i][1];
    positions[i * 3 + 2] = vertices[i][2];
  }

  const indices = new Uint32Array(triangles.length * 3);
  for (let i = 0; i < triangles.length; i++) {
    indices[i * 3] = triangles[i][0];
    indices[i * 3 + 1] = triangles[i][1];
    indices[i * 3 + 2] = triangles[i][2];
  }

  let bounds: Bounds3D | null = null;
  if (vertices.length > 0) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const [vx, vy, vz] of vertices) {
      if (vx < minX) minX = vx;
      if (vx > maxX) maxX = vx;
      if (vy < minY) minY = vy;
      if (vy > maxY) maxY = vy;
      if (vz < minZ) minZ = vz;
      if (vz > maxZ) maxZ = vz;
    }
    bounds = { minX, maxX, minY, maxY, minZ, maxZ };
  }

  return {
    vertices,
    triangles,
    positions,
    indices,
    bounds,
    sampleCount: totalSamples,
  };
}

const slice2DFactoryCache = new Map<string, (fn: any, ...fixedArgs: number[]) => (x: number, y: number) => number>();
const slice3DFactoryCache = new Map<string, (fn: any, ...fixedArgs: number[]) => (x: number, y: number, z: number) => number>();

/**
 * Creates a zero-overhead compiled 2D slice closure wrapping an n-variable function.
 */
function createSlice2DFn(
  fn: NumericCompiledFn,
  allVars: string[],
  freeAxes: [string, string],
  fixedValues: Record<string, number>
): (x: number, y: number) => number {
  const key = `${allVars.join(',')}:${freeAxes.join(',')}`;
  let factory = slice2DFactoryCache.get(key);
  if (!factory) {
    const fixedVarNames = allVars.filter(v => v !== freeAxes[0] && v !== freeAxes[1]);
    const factoryParams = ['fn', ...fixedVarNames];
    const callArgs = allVars.map(v => {
      if (v === freeAxes[0]) return 'x';
      if (v === freeAxes[1]) return 'y';
      return v;
    });
    const code = `return (${factoryParams.join(', ')}) => (x, y) => fn(${callArgs.join(', ')});`;
    factory = new Function(code)() as any;
    slice2DFactoryCache.set(key, factory!);
  }
  const fixedVarNames = allVars.filter(v => v !== freeAxes[0] && v !== freeAxes[1]);
  const fixedArgs = fixedVarNames.map(v => fixedValues[v] ?? 0);
  return factory!(fn, ...fixedArgs);
}

/**
 * Creates a zero-overhead compiled 3D slice closure wrapping an n-variable function.
 */
function createSlice3DFn(
  fn: NumericCompiledFn,
  allVars: string[],
  freeAxes: [string, string, string],
  fixedValues: Record<string, number>
): (x: number, y: number, z: number) => number {
  const key = `${allVars.join(',')}:${freeAxes.join(',')}`;
  let factory = slice3DFactoryCache.get(key);
  if (!factory) {
    const fixedVarNames = allVars.filter(v => !freeAxes.includes(v as any));
    const factoryParams = ['fn', ...fixedVarNames];
    const callArgs = allVars.map(v => {
      if (v === freeAxes[0]) return 'x';
      if (v === freeAxes[1]) return 'y';
      if (v === freeAxes[2]) return 'z';
      return v;
    });
    const code = `return (${factoryParams.join(', ')}) => (x, y, z) => fn(${callArgs.join(', ')});`;
    factory = new Function(code)() as any;
    slice3DFactoryCache.set(key, factory!);
  }
  const fixedVarNames = allVars.filter(v => !freeAxes.includes(v as any));
  const fixedArgs = fixedVarNames.map(v => fixedValues[v] ?? 0);
  return factory!(fn, ...fixedArgs);
}

/**
 * Samples an n-dimensional relation across a 2D or 3D slice by fixing (n-2) or (n-3) coordinates.
 *
 * Evaluation cost is strictly O(K^2) for 2D slices or O(K^3) for 3D slices, completely independent of n.
 *
 * @param fn Compiled relation closure taking all n variables as arguments in declared order
 * @param allVars Ordered array of all free variable names for the relation (e.g. ['x', 'y', 'z', 'u', 'v', 'w'])
 * @param freeAxes The 2 or 3 active display coordinate names (e.g. ['x', 'y'])
 * @param fixedValues Map of fixed coordinate values for the non-display variables (e.g. { z: 0, u: 1, v: 2, w: 3 })
 * @param ranges Range for each of the free display axes (either array of RangeInput or Record<string, RangeInput>)
 * @param resolution Sampling resolution per axis (e.g. 200 for 2D, 60 for 3D)
 */
export function sampleSlice(
  fn: NumericCompiledFn,
  allVars: string[],
  freeAxes: [string, string] | [string, string, string],
  fixedValues: Record<string, number>,
  ranges: RangeInput[] | Record<string, RangeInput>,
  resolution: number | number[]
): Contour2DResult | TriangleMesh3D {
  for (const axis of freeAxes) {
    if (!allVars.includes(axis)) {
      throw new Error(`Free axis '${axis}' not found in declared variables: [${allVars.join(', ')}]`);
    }
  }

  const getRange = (axisName: string, index: number): RangeInput => {
    if (Array.isArray(ranges)) {
      return ranges[index];
    }
    if (axisName in ranges) {
      return ranges[axisName];
    }
    return [-10, 10];
  };

  if (freeAxes.length === 2) {
    const r0 = getRange(freeAxes[0], 0);
    const r1 = getRange(freeAxes[1], 1);
    const res = Array.isArray(resolution) ? [resolution[0], resolution[1]] as [number, number] : resolution;

    const sliceFn2D = createSlice2DFn(fn, allVars, freeAxes as [string, string], fixedValues);
    return sample2D(sliceFn2D, r0, r1, res);
  } else {
    const r0 = getRange(freeAxes[0], 0);
    const r1 = getRange(freeAxes[1], 1);
    const r2 = getRange(freeAxes[2], 2);
    const res = Array.isArray(resolution) ? [resolution[0], resolution[1], resolution[2]] as [number, number, number] : resolution;

    const sliceFn3D = createSlice3DFn(fn, allVars, freeAxes as [string, string, string], fixedValues);
    return sample3D(sliceFn3D, r0, r1, r2, res);
  }
}

/**
 * Zoom-to-fit domain discovery helper.
 * Samples coarsely over an initial window, finds where the relation holds, and tightens bounds.
 * If the relation holds nowhere in the window, returns null (empty result).
 */
export function findBounds2D(
  fn: (x: number, y: number) => number,
  initialRangeX: RangeInput = [-10, 10],
  initialRangeY: RangeInput = [-10, 10],
  coarseResolution: number = 30
): Bounds2D | null {
  const coarse = sample2D(fn, initialRangeX, initialRangeY, coarseResolution);
  if (!coarse.bounds || coarse.polylines.length === 0) {
    return null;
  }

  // Add 10% padding margin around detected manifold
  const b = coarse.bounds;
  const padX = Math.max(0.1, (b.maxX - b.minX) * 0.1);
  const padY = Math.max(0.1, (b.maxY - b.minY) * 0.1);

  return {
    minX: b.minX - padX,
    maxX: b.maxX + padX,
    minY: b.minY - padY,
    maxY: b.maxY + padY,
  };
}
