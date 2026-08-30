import { Environment, GraphSpec } from '../core/types';
import { Evaluator } from '../core/evaluator';
import { valueToNumber } from '../core/numeric/tower';

export class HeatmapPlotter {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private spec: GraphSpec;
  private env: Environment;
  private dpr: number = 1;

  constructor(canvas: HTMLCanvasElement, spec: GraphSpec, env: Environment) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context');
    this.ctx = ctx;
    this.spec = spec;
    this.env = env;
    this.dpr = window.devicePixelRatio || 1;
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

    if (!this.spec.surface) return;
    const { expr, varX, varY, xMin, xMax, yMin, yMax } = this.spec.surface;

    const N = 80;
    const M = 60;
    const grid: number[][] = [];
    let zMin = Infinity;
    let zMax = -Infinity;

    for (let j = 0; j < M; j++) {
      const row: number[] = [];
      const y = yMax - (j / (M - 1)) * (yMax - yMin);
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
          row.push(z);
          if (isFinite(z)) {
            if (z < zMin) zMin = z;
            if (z > zMax) zMax = z;
          }
        } catch {
          row.push(NaN);
        }
      }
      grid.push(row);
    }

    if (!isFinite(zMin) || !isFinite(zMax) || zMin === zMax) {
      zMin = -1;
      zMax = 1;
    }

    const padding = { top: 40, right: 90, bottom: 40, left: 55 };
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;

    const cellW = plotW / N;
    const cellH = plotH / M;

    for (let j = 0; j < M; j++) {
      for (let i = 0; i < N; i++) {
        const z = grid[j][i];
        if (isNaN(z)) {
          this.ctx.fillStyle = '#1e293b';
        } else {
          const t = Math.max(0, Math.min(1, (z - zMin) / (zMax - zMin)));
          this.ctx.fillStyle = viridisColor(t);
        }
        this.ctx.fillRect(
          padding.left + i * cellW,
          padding.top + j * cellH,
          cellW + 0.5,
          cellH + 0.5
        );
      }
    }

    // Border & Axes
    this.ctx.strokeStyle = '#475569';
    this.ctx.strokeRect(padding.left, padding.top, plotW, plotH);

    // Ticks
    this.ctx.font = '11px ui-monospace, monospace';
    this.ctx.fillStyle = '#94a3b8';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';

    const numTicksX = 5;
    for (let i = 0; i <= numTicksX; i++) {
      const xVal = xMin + (i / numTicksX) * (xMax - xMin);
      const sx = padding.left + (i / numTicksX) * plotW;
      this.ctx.fillText(xVal.toFixed(1), sx, padding.top + plotH + 5);
    }

    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';
    const numTicksY = 5;
    for (let j = 0; j <= numTicksY; j++) {
      const yVal = yMin + (j / numTicksY) * (yMax - yMin);
      const sy = padding.top + plotH - (j / numTicksY) * plotH;
      this.ctx.fillText(yVal.toFixed(1), padding.left - 6, sy);
    }

    // Colorbar
    const cbX = width - padding.right + 25;
    const cbW = 15;
    const cbH = plotH;
    for (let j = 0; j < cbH; j++) {
      const t = 1 - j / cbH;
      this.ctx.fillStyle = viridisColor(t);
      this.ctx.fillRect(cbX, padding.top + j, cbW, 1);
    }
    this.ctx.strokeStyle = '#475569';
    this.ctx.strokeRect(cbX, padding.top, cbW, cbH);

    this.ctx.textAlign = 'left';
    this.ctx.fillText(zMax.toFixed(2), cbX + cbW + 6, padding.top + 5);
    this.ctx.fillText(zMin.toFixed(2), cbX + cbW + 6, padding.top + cbH - 5);
    this.ctx.fillText(((zMin + zMax) / 2).toFixed(2), cbX + cbW + 6, padding.top + cbH / 2);

    // Header
    this.ctx.font = '12px ui-monospace, monospace';
    this.ctx.fillStyle = '#cbd5e1';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText(
      `2D Heatmap: f(${varX}, ${varY}) | X: [${xMin}, ${xMax}] Y: [${yMin}, ${yMax}]`,
      15,
      20
    );

    this.ctx.restore();
  }
}

function viridisColor(t: number): string {
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
