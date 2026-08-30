import { Environment, GraphSpec } from '../core/types';
import { Evaluator } from '../core/evaluator';
import { valueToNumber } from '../core/numeric/tower';

export class Surface3DPlotter {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private spec: GraphSpec;
  private env: Environment;
  private dpr: number = 1;
  private angleX: number = Math.PI / 6; // 30 deg elevation
  private angleZ: number = Math.PI / 4; // 45 deg azimuth
  private zoom: number = 1.0;
  private panX: number = 0;
  private panY: number = 0;

  constructor(canvas: HTMLCanvasElement, spec: GraphSpec, env: Environment) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context');
    this.ctx = ctx;
    this.spec = spec;
    this.env = env;
    this.dpr = window.devicePixelRatio || 1;
    this.setupDragControls();
  }

  private mousedownListener?: (e: MouseEvent) => void;
  private mousemoveListener?: (e: MouseEvent) => void;
  private mouseupListener?: () => void;
  private wheelListener?: (e: WheelEvent) => void;
  private dblclickListener?: () => void;

  private setupDragControls(): void {
    let isDragging = false;
    let isPanning = false;
    let lastX = 0;
    let lastY = 0;

    this.mousedownListener = (e: MouseEvent) => {
      isDragging = true;
      isPanning = e.shiftKey || e.button === 2;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    this.canvas.addEventListener('mousedown', this.mousedownListener);

    this.mousemoveListener = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      if (isPanning) {
        this.panX += dx;
        this.panY += dy;
      } else {
        this.angleZ += dx * 0.01;
        this.angleX = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, this.angleX - dy * 0.01));
      }
      this.render();
    };
    window.addEventListener('mousemove', this.mousemoveListener);

    this.mouseupListener = () => {
      isDragging = false;
      isPanning = false;
    };
    window.addEventListener('mouseup', this.mouseupListener);

    this.wheelListener = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoom = Math.max(0.2, Math.min(5.0, this.zoom * factor));
      this.render();
    };
    this.canvas.addEventListener('wheel', this.wheelListener, { passive: false });

    this.dblclickListener = () => {
      this.angleX = Math.PI / 6;
      this.angleZ = Math.PI / 4;
      this.zoom = 1.0;
      this.panX = 0;
      this.panY = 0;
      this.render();
    };
    this.canvas.addEventListener('dblclick', this.dblclickListener);
  }

  public dispose(): void {
    if (this.mousedownListener) {
      this.canvas.removeEventListener('mousedown', this.mousedownListener);
      this.mousedownListener = undefined;
    }
    if (this.mousemoveListener) {
      window.removeEventListener('mousemove', this.mousemoveListener);
      this.mousemoveListener = undefined;
    }
    if (this.mouseupListener) {
      window.removeEventListener('mouseup', this.mouseupListener);
      this.mouseupListener = undefined;
    }
    if (this.wheelListener) {
      this.canvas.removeEventListener('wheel', this.wheelListener);
      this.wheelListener = undefined;
    }
    if (this.dblclickListener) {
      this.canvas.removeEventListener('dblclick', this.dblclickListener);
      this.dblclickListener = undefined;
    }
  }

  public render(): void {
    const width = this.canvas.clientWidth || 640;
    const height = this.canvas.clientHeight || 360;
    this.canvas.width = width * this.dpr;
    this.canvas.height = height * this.dpr;

    this.ctx.save();
    this.ctx.scale(this.dpr, this.dpr);

    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(0, 0, width, height);

    // 3D Projection setup
    const cx = width / 2 + this.panX;
    const cy = height / 2 + 20 + this.panY;
    const scale = (Math.min(width, height) / 3.2) * this.zoom;

    const cosZ = Math.cos(this.angleZ);
    const sinZ = Math.sin(this.angleZ);
    const cosX = Math.cos(this.angleX);
    const sinX = Math.sin(this.angleX);

    const project = (xNorm: number, yNorm: number, zNorm: number): { px: number; py: number; depth: number } => {
      // Rotate around Z
      const rx = xNorm * cosZ - yNorm * sinZ;
      const ry = xNorm * sinZ + yNorm * cosZ;
      // Rotate around X
      const rz = zNorm * cosX - ry * sinX;
      const rDepth = ry * cosX + zNorm * sinX;

      const px = cx + rx * scale;
      const py = cy - rz * scale;
      return { px, py, depth: rDepth };
    };

    // Draw background bounding box
    const corners = [
      project(-1, -1, -1), project(1, -1, -1), project(1, 1, -1), project(-1, 1, -1),
      project(-1, -1, 1), project(1, -1, 1), project(1, 1, 1), project(-1, 1, 1),
    ];
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    this.ctx.lineWidth = 1;
    this.ctx.setLineDash([4, 4]);
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7]
    ];
    for (const [e1, e2] of edges) {
      this.ctx.beginPath();
      this.ctx.moveTo(corners[e1].px, corners[e1].py);
      this.ctx.lineTo(corners[e2].px, corners[e2].py);
      this.ctx.stroke();
    }
    this.ctx.setLineDash([]);

    interface RenderQuad {
      p1: { px: number; py: number };
      p2: { px: number; py: number };
      p3: { px: number; py: number };
      p4: { px: number; py: number };
      depth: number;
      color: string;
    }

    const allQuads: RenderQuad[] = [];

    // Case 1: 3D Parametric Surface (e.g. Clifford Torus)
    if (this.spec.parametric && this.spec.parametric.zExpr) {
      const { xExpr, yExpr, zExpr, param: paramU, paramV, min: uMin, max: uMax, minV = 0, maxV = 2 * Math.PI } = this.spec.parametric;
      const vParam = paramV || 'v';
      const N = 40;
      const M = 40;
      const grid: { x: number; y: number; z: number }[][] = [];

      let xMin = Infinity, xMax = -Infinity;
      let yMin = Infinity, yMax = -Infinity;
      let zMin = Infinity, zMax = -Infinity;

      for (let j = 0; j < M; j++) {
        const row: { x: number; y: number; z: number }[] = [];
        const v = minV + (j / (M - 1)) * (maxV - minV);
        for (let i = 0; i < N; i++) {
          const u = uMin + (i / (N - 1)) * (uMax - uMin);
          try {
            const localEnv = {
              ...this.env,
              [paramU]: { type: 'float', value: u } as any,
              [vParam]: { type: 'float', value: v } as any,
            };
            const xVal = valueToNumber(new Evaluator(localEnv).evaluate(xExpr));
            const yVal = valueToNumber(new Evaluator(localEnv).evaluate(yExpr));
            const zVal = valueToNumber(new Evaluator(localEnv).evaluate(zExpr));
            const pt = { x: isFinite(xVal) ? xVal : 0, y: isFinite(yVal) ? yVal : 0, z: isFinite(zVal) ? zVal : 0 };
            row.push(pt);
            if (isFinite(xVal)) { if (xVal < xMin) xMin = xVal; if (xVal > xMax) xMax = xVal; }
            if (isFinite(yVal)) { if (yVal < yMin) yMin = yVal; if (yVal > yMax) yMax = yVal; }
            if (isFinite(zVal)) { if (zVal < zMin) zMin = zVal; if (zVal > zMax) zMax = zVal; }
          } catch {
            row.push({ x: 0, y: 0, z: 0 });
          }
        }
        grid.push(row);
      }

      if (xMin === xMax) { xMin -= 1; xMax += 1; }
      if (yMin === yMax) { yMin -= 1; yMax += 1; }
      if (zMin === zMax) { zMin -= 1; zMax += 1; }

      const projGrid = grid.map(row =>
        row.map(p => {
          const xNorm = ((p.x - xMin) / (xMax - xMin)) * 2 - 1;
          const yNorm = ((p.y - yMin) / (yMax - yMin)) * 2 - 1;
          const zNorm = ((p.z - zMin) / (zMax - zMin)) * 2 - 1;
          return { ...project(xNorm, yNorm, zNorm), zVal: p.z };
        })
      );

      for (let j = 0; j < M - 1; j++) {
        for (let i = 0; i < N - 1; i++) {
          const p1 = projGrid[j][i];
          const p2 = projGrid[j][i + 1];
          const p3 = projGrid[j + 1][i + 1];
          const p4 = projGrid[j + 1][i];
          const d = (p1.depth + p2.depth + p3.depth + p4.depth) / 4;
          const avgZ = (p1.zVal + p2.zVal + p3.zVal + p4.zVal) / 4;
          const t = Math.max(0, Math.min(1, (avgZ - zMin) / (zMax - zMin)));
          allQuads.push({
            p1, p2, p3, p4,
            depth: d,
            color: viridisColor3D(t),
          });
        }
      }
    } else {
      // Case 2: Explicit Surfaces z = f(x, y) (Single or Multi Intersecting Surfaces)
      const surfaceList = this.spec.surfaces || (this.spec.surface ? [this.spec.surface] : []);

      surfaceList.forEach((surf, surfIdx) => {
        const { expr, varX, varY, xMin, xMax, yMin, yMax } = surf;
        const N = 35;
        const M = 35;
        const grid: { x: number; y: number; z: number }[][] = [];
        let zMin = Infinity;
        let zMax = -Infinity;

        for (let j = 0; j < M; j++) {
          const row: { x: number; y: number; z: number }[] = [];
          const y = yMin + (j / (M - 1)) * (yMax - yMin);
          for (let i = 0; i < N; i++) {
            const x = xMin + (i / (N - 1)) * (xMax - xMin);
            try {
              const localEnv = {
                ...this.env,
                [varX]: { type: 'float', value: x } as any,
                [varY]: { type: 'float', value: y } as any,
              };
              const val = new Evaluator(localEnv).evaluate(expr);
              const z = valueToNumber(val);
              row.push({ x, y, z: isFinite(z) ? z : 0 });
              if (isFinite(z)) {
                if (z < zMin) zMin = z;
                if (z > zMax) zMax = z;
              }
            } catch {
              row.push({ x, y, z: 0 });
            }
          }
          grid.push(row);
        }

        if (!isFinite(zMin) || !isFinite(zMax) || zMin === zMax) {
          zMin = -1;
          zMax = 1;
        }

        const projGrid = grid.map(row =>
          row.map(p => {
            const xNorm = ((p.x - xMin) / (xMax - xMin)) * 2 - 1;
            const yNorm = ((p.y - yMin) / (yMax - yMin)) * 2 - 1;
            const zNorm = ((p.z - zMin) / (zMax - zMin)) * 2 - 1;
            return { ...project(xNorm, yNorm, zNorm), zVal: p.z };
          })
        );

        for (let j = 0; j < M - 1; j++) {
          for (let i = 0; i < N - 1; i++) {
            const p1 = projGrid[j][i];
            const p2 = projGrid[j][i + 1];
            const p3 = projGrid[j + 1][i + 1];
            const p4 = projGrid[j + 1][i];
            const d = (p1.depth + p2.depth + p3.depth + p4.depth) / 4;
            const avgZ = (p1.zVal + p2.zVal + p3.zVal + p4.zVal) / 4;
            const t = Math.max(0, Math.min(1, (avgZ - zMin) / (zMax - zMin)));
            const color = surfIdx === 0 ? viridisColor3D(t) : magmaColor3D(t);
            allQuads.push({
              p1, p2, p3, p4,
              depth: d,
              color,
            });
          }
        }
      });
    }

    // Sort all quads across all surfaces by depth (Painter's algorithm: farthest first)
    allQuads.sort((a, b) => a.depth - b.depth);

    for (const q of allQuads) {
      this.ctx.fillStyle = q.color;
      this.ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
      this.ctx.lineWidth = 0.5;

      this.ctx.beginPath();
      this.ctx.moveTo(q.p1.px, q.p1.py);
      this.ctx.lineTo(q.p2.px, q.p2.py);
      this.ctx.lineTo(q.p3.px, q.p3.py);
      this.ctx.lineTo(q.p4.px, q.p4.py);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();
    }

    // Header & Interaction controls guide
    this.ctx.font = '11px ui-monospace, monospace';
    this.ctx.fillStyle = '#94a3b8';
    const label = this.spec.parametric ? '3D Parametric Torus' : '3D Surface Scene';
    this.ctx.fillText(
      `${label} | Zoom: ${this.zoom.toFixed(1)}x | Orbit (drag), Pan (shift+drag), Zoom (scroll), Reset (dblclick)`,
      15,
      20
    );

    this.ctx.restore();
  }
}

function magmaColor3D(t: number): string {
  const c0 = [0, 0, 4];
  const c1 = [81, 18, 124];
  const c2 = [182, 54, 121];
  const c3 = [251, 136, 97];
  const c4 = [252, 253, 191];

  let r = 0, g = 0, b = 0;
  if (t < 0.25) {
    const u = t / 0.25;
    r = c0[0] + (c1[0] - c0[0]) * u;
    g = c0[1] + (c1[1] - c0[1]) * u;
    b = c0[2] + (c1[2] - c0[2]) * u;
  } else if (t < 0.5) {
    const u = (t - 0.25) / 0.25;
    r = c1[0] + (c2[0] - c1[0]) * u;
    g = c1[1] + (c2[1] - c1[1]) * u;
    b = c1[2] + (c2[2] - c1[2]) * u;
  } else if (t < 0.75) {
    const u = (t - 0.5) / 0.25;
    r = c2[0] + (c3[0] - c2[0]) * u;
    g = c2[1] + (c3[1] - c2[1]) * u;
    b = c2[2] + (c3[2] - c2[2]) * u;
  } else {
    const u = (t - 0.75) / 0.25;
    r = c3[0] + (c4[0] - c3[0]) * u;
    g = c3[1] + (c4[1] - c3[1]) * u;
    b = c3[2] + (c4[2] - c3[2]) * u;
  }
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function viridisColor3D(t: number): string {
  const c0 = [68, 1, 84];
  const c1 = [59, 82, 139];
  const c2 = [33, 145, 140];
  const c3 = [94, 201, 98];
  const c4 = [253, 231, 37];

  let r = 0, g = 0, b = 0;
  if (t < 0.25) {
    const u = t / 0.25;
    r = c0[0] + (c1[0] - c0[0]) * u;
    g = c0[1] + (c1[1] - c0[1]) * u;
    b = c0[2] + (c1[2] - c0[2]) * u;
  } else if (t < 0.5) {
    const u = (t - 0.25) / 0.25;
    r = c1[0] + (c2[0] - c1[0]) * u;
    g = c1[1] + (c2[1] - c1[1]) * u;
    b = c1[2] + (c2[2] - c1[2]) * u;
  } else if (t < 0.75) {
    const u = (t - 0.5) / 0.25;
    r = c2[0] + (c3[0] - c2[0]) * u;
    g = c2[1] + (c3[1] - c2[1]) * u;
    b = c2[2] + (c3[2] - c2[2]) * u;
  } else {
    const u = (t - 0.75) / 0.25;
    r = c3[0] + (c4[0] - c3[0]) * u;
    g = c3[1] + (c4[1] - c3[1]) * u;
    b = c3[2] + (c4[2] - c3[2]) * u;
  }
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}
