import { ASTNode, Environment, GraphSpec } from '../core/types';
import { Evaluator } from '../core/evaluator';
import { valueToNumber } from '../core/numeric/tower';

export interface Point2D {
  x: number;
  y: number;
  valid: boolean;
}

const SERIES_COLORS = [
  '#38bdf8', // sky-400
  '#f43f5e', // rose-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#a855f7', // purple-500
  '#06b6d4', // cyan-500
];

export class Canvas2DPlotter {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private spec: GraphSpec;
  private env: Environment;
  private dpr: number = 1;

  constructor(canvas: HTMLCanvasElement, spec: GraphSpec, env: Environment) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D context from canvas');
    this.ctx = ctx;
    this.spec = spec;
    this.env = env;
    this.dpr = window.devicePixelRatio || 1;
    this.setupInteractivity();
  }

  public render(): void {
    const width = this.canvas.clientWidth || 640;
    const height = this.canvas.clientHeight || 360;
    this.canvas.width = width * this.dpr;
    this.canvas.height = height * this.dpr;

    this.ctx.save();
    this.ctx.scale(this.dpr, this.dpr);

    // Clear background
    this.ctx.fillStyle = '#0a0f1d';
    this.ctx.fillRect(0, 0, width, height);

    if (this.spec.kind === 'parametric' && this.spec.parametric) {
      this.renderParametric(width, height);
    } else if (this.spec.kind === 'orbit' && this.spec.orbitData) {
      this.renderOrbit(width, height);
    } else {
      this.renderCurves(width, height);
    }

    this.ctx.restore();
  }

  private renderCurves(width: number, height: number): void {
    const xMin = this.spec.domain.min;
    const xMax = this.spec.domain.max;
    if (xMax <= xMin) return;

    // Sample series data with adaptive sampling
    const seriesSamples: { points: Point2D[]; label: string; color: string }[] = [];
    let yMin = Infinity;
    let yMax = -Infinity;

    for (let sIdx = 0; sIdx < this.spec.series.length; sIdx++) {
      const s = this.spec.series[sIdx];
      const color = SERIES_COLORS[sIdx % SERIES_COLORS.length];
      const points = this.adaptiveSampleCurve(s.expr, s.variable, xMin, xMax);
      seriesSamples.push({ points, label: s.label, color });

      for (const p of points) {
        if (p.valid && isFinite(p.y)) {
          if (p.y < yMin) yMin = p.y;
          if (p.y > yMax) yMax = p.y;
        }
      }
    }

    // Default or sanitize y-range
    if (!isFinite(yMin) || !isFinite(yMax) || yMin === yMax) {
      yMin = -10;
      yMax = 10;
    } else {
      const pad = (yMax - yMin) * 0.1 || 1;
      yMin = Math.max(-1000, yMin - pad);
      yMax = Math.min(1000, yMax + pad);
    }

    const padding = { top: 48, right: 30, bottom: 40, left: 60 };
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;

    const toScreenX = (x: number) => padding.left + ((x - xMin) / (xMax - xMin)) * plotW;
    const toScreenY = (y: number) => padding.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

    // Draw Grid & Axes
    this.drawGridAndAxes(width, height, padding, xMin, xMax, yMin, yMax, toScreenX, toScreenY);

    // Draw curves with discontinuity splitting
    this.ctx.save();
    this.ctx.rect(padding.left, padding.top, plotW, plotH);
    this.ctx.clip();

    for (const sample of seriesSamples) {
      this.ctx.strokeStyle = sample.color;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();

      let inPath = false;
      let prevY = 0;

      for (let i = 0; i < sample.points.length; i++) {
        const pt = sample.points[i];
        if (!pt.valid || !isFinite(pt.y) || pt.y < yMin - (yMax - yMin) * 2 || pt.y > yMax + (yMax - yMin) * 2) {
          inPath = false;
          continue;
        }

        const sx = toScreenX(pt.x);
        const sy = toScreenY(pt.y);

        // Discontinuity check: large jump between consecutive samples (e.g. tan(x) asymptote)
        if (inPath && Math.abs(pt.y - prevY) > (yMax - yMin) * 0.8) {
          inPath = false;
        }

        if (!inPath) {
          this.ctx.moveTo(sx, sy);
          inPath = true;
        } else {
          this.ctx.lineTo(sx, sy);
        }
        prevY = pt.y;
      }
      this.ctx.stroke();
    }
    this.ctx.restore();

    // Draw Header info (Domain default note, shared axis note, legend)
    this.drawHeaderAndLegend(seriesSamples);
  }

  private renderParametric(width: number, height: number): void {
    if (!this.spec.parametric) return;
    const { xExpr, yExpr, param, min, max } = this.spec.parametric;

    const points = this.adaptiveSampleParametric(xExpr, yExpr, param, min, max);

    let xMin = Infinity, xMax = -Infinity;
    let yMin = Infinity, yMax = -Infinity;

    for (const p of points) {
      if (p.valid && isFinite(p.x) && isFinite(p.y)) {
        if (p.x < xMin) xMin = p.x;
        if (p.x > xMax) xMax = p.x;
        if (p.y < yMin) yMin = p.y;
        if (p.y > yMax) yMax = p.y;
      }
    }

    if (!isFinite(xMin) || !isFinite(xMax) || xMin === xMax) { xMin = -5; xMax = 5; }
    if (!isFinite(yMin) || !isFinite(yMax) || yMin === yMax) { yMin = -5; yMax = 5; }

    const xPad = (xMax - xMin) * 0.1 || 1;
    const yPad = (yMax - yMin) * 0.1 || 1;
    xMin -= xPad; xMax += xPad;
    yMin -= yPad; yMax += yPad;

    const padding = { top: 48, right: 30, bottom: 40, left: 60 };
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;

    const toScreenX = (x: number) => padding.left + ((x - xMin) / (xMax - xMin)) * plotW;
    const toScreenY = (y: number) => padding.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

    this.drawGridAndAxes(width, height, padding, xMin, xMax, yMin, yMax, toScreenX, toScreenY);

    this.ctx.save();
    this.ctx.rect(padding.left, padding.top, plotW, plotH);
    this.ctx.clip();

    this.ctx.strokeStyle = '#38bdf8'; // sky-400
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    let inPath = false;

    for (const pt of points) {
      if (!pt.valid || !isFinite(pt.x) || !isFinite(pt.y)) {
        inPath = false;
        continue;
      }
      const sx = toScreenX(pt.x);
      const sy = toScreenY(pt.y);
      if (!inPath) {
        this.ctx.moveTo(sx, sy);
        inPath = true;
      } else {
        this.ctx.lineTo(sx, sy);
      }
    }
    this.ctx.stroke();
    this.ctx.restore();

    // Parametric header
    this.ctx.font = '12px ui-monospace, monospace';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillStyle = '#38bdf8';
    this.ctx.fillText(`Parametric Curve: (${this.spec.parametric.param}) in [${min.toFixed(2)}, ${max.toFixed(2)}]`, 15, 20);
  }

  private renderOrbit(width: number, height: number): void {
    const orbit = this.spec.orbitData || [];
    if (orbit.length === 0) return;

    const xMin = 0;
    const xMax = Math.max(1, orbit.length - 1);
    let yMin = Infinity;
    let yMax = -Infinity;

    for (const y of orbit) {
      if (isFinite(y)) {
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
      }
    }

    if (!isFinite(yMin) || !isFinite(yMax) || yMin === yMax) {
      yMin = 0;
      yMax = 10;
    } else {
      const pad = (yMax - yMin) * 0.1 || 1;
      yMin = yMin - pad;
      yMax = yMax + pad;
    }

    const padding = { top: 48, right: 30, bottom: 40, left: 60 };
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;

    const toScreenX = (x: number) => padding.left + ((x - xMin) / (xMax - xMin)) * plotW;
    const toScreenY = (y: number) => padding.top + plotH - ((y - yMin) / (yMax - yMin)) * plotH;

    this.drawGridAndAxes(width, height, padding, xMin, xMax, yMin, yMax, toScreenX, toScreenY);

    this.ctx.save();
    this.ctx.rect(padding.left, padding.top, plotW, plotH);
    this.ctx.clip();

    this.ctx.strokeStyle = '#38bdf8';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();

    for (let i = 0; i < orbit.length; i++) {
      const sx = toScreenX(i);
      const sy = toScreenY(orbit[i]);
      if (i === 0) {
        this.ctx.moveTo(sx, sy);
      } else {
        this.ctx.lineTo(sx, sy);
      }
    }
    this.ctx.stroke();

    // Draw dots
    this.ctx.fillStyle = '#38bdf8';
    for (let i = 0; i < orbit.length; i++) {
      const sx = toScreenX(i);
      const sy = toScreenY(orbit[i]);
      this.ctx.beginPath();
      this.ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.restore();

    this.ctx.font = '12px ui-monospace, monospace';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillStyle = '#38bdf8';
    this.ctx.fillText(`Orbit Sequence: ${orbit.length} steps`, 15, 20);
  }

  private adaptiveSampleCurve(expr: ASTNode, variable: string, xMin: number, xMax: number): Point2D[] {
    const points: Point2D[] = [];
    const N = 120;
    const dx = (xMax - xMin) / N;

    const evalAt = (x: number): Point2D => {
      try {
        const localEnv = { ...this.env, [variable]: { type: 'float', value: x } as any };
        const evaluator = new Evaluator(localEnv);
        const val = evaluator.evaluate(expr);
        const y = valueToNumber(val);
        return { x, y, valid: isFinite(y) };
      } catch {
        return { x, y: NaN, valid: false };
      }
    };

    const subdivide = (p1: Point2D, p2: Point2D, depth: number) => {
      if (depth >= 6) {
        points.push(p2);
        return;
      }
      const xm = (p1.x + p2.x) / 2;
      const pm = evalAt(xm);

      if (!p1.valid || !p2.valid || !pm.valid) {
        points.push(pm);
        points.push(p2);
        return;
      }

      const linearY = (p1.y + p2.y) / 2;
      const dy = Math.abs(pm.y - linearY);
      const spanY = Math.abs(p2.y - p1.y);

      if (dy > 0.05 * (spanY + 1) && Math.abs(p2.x - p1.x) > 1e-4) {
        subdivide(p1, pm, depth + 1);
        subdivide(pm, p2, depth + 1);
      } else {
        points.push(p2);
      }
    };

    let pPrev = evalAt(xMin);
    points.push(pPrev);

    for (let i = 1; i <= N; i++) {
      const x = xMin + i * dx;
      const pCurr = evalAt(x);
      subdivide(pPrev, pCurr, 0);
      pPrev = pCurr;
    }

    return points;
  }

  private adaptiveSampleParametric(xExpr: ASTNode, yExpr: ASTNode, param: string, tMin: number, tMax: number): Point2D[] {
    const points: Point2D[] = [];
    const N = 240;
    const dt = (tMax - tMin) / N;

    const evalAt = (t: number): Point2D => {
      try {
        const localEnv = { ...this.env, [param]: { type: 'float', value: t } as any };
        const evaluator = new Evaluator(localEnv);
        const xVal = evaluator.evaluate(xExpr);
        const yVal = evaluator.evaluate(yExpr);
        const x = valueToNumber(xVal);
        const y = valueToNumber(yVal);
        return { x, y, valid: isFinite(x) && isFinite(y) };
      } catch {
        return { x: NaN, y: NaN, valid: false };
      }
    };

    for (let i = 0; i <= N; i++) {
      const t = tMin + i * dt;
      points.push(evalAt(t));
    }

    return points;
  }

  private drawGridAndAxes(
    width: number,
    height: number,
    padding: { top: number; right: number; bottom: number; left: number },
    xMin: number,
    xMax: number,
    yMin: number,
    yMax: number,
    toScreenX: (x: number) => number,
    toScreenY: (y: number) => number
  ): void {
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;

    // Grid lines
    this.ctx.strokeStyle = '#1e293b'; // subtle grid
    this.ctx.lineWidth = 1;

    const numTicksX = 6;
    const numTicksY = 5;

    this.ctx.font = '11px ui-monospace, monospace';
    this.ctx.fillStyle = '#64748b';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';

    for (let i = 0; i <= numTicksX; i++) {
      const xVal = xMin + (i / numTicksX) * (xMax - xMin);
      const sx = toScreenX(xVal);

      this.ctx.beginPath();
      this.ctx.moveTo(sx, padding.top);
      this.ctx.lineTo(sx, padding.top + plotH);
      this.ctx.stroke();

      this.ctx.fillText(xVal.toFixed(1), sx, padding.top + plotH + 6);
    }

    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';

    for (let i = 0; i <= numTicksY; i++) {
      const yVal = yMin + (i / numTicksY) * (yMax - yMin);
      const sy = toScreenY(yVal);

      this.ctx.beginPath();
      this.ctx.moveTo(padding.left, sy);
      this.ctx.lineTo(padding.left + plotW, sy);
      this.ctx.stroke();

      this.ctx.fillText(yVal.toFixed(1), padding.left - 8, sy);
    }

    // Zero axes if within range
    this.ctx.strokeStyle = '#334155';
    this.ctx.lineWidth = 1.5;

    if (xMin <= 0 && xMax >= 0) {
      const sx0 = toScreenX(0);
      this.ctx.beginPath();
      this.ctx.moveTo(sx0, padding.top);
      this.ctx.lineTo(sx0, padding.top + plotH);
      this.ctx.stroke();
    }

    if (yMin <= 0 && yMax >= 0) {
      const sy0 = toScreenY(0);
      this.ctx.beginPath();
      this.ctx.moveTo(padding.left, sy0);
      this.ctx.lineTo(padding.left + plotW, sy0);
      this.ctx.stroke();
    }

    // Border
    this.ctx.strokeStyle = '#334155';
    this.ctx.strokeRect(padding.left, padding.top, plotW, plotH);
  }

  private drawHeaderAndLegend(
    series: { points: Point2D[]; label: string; color: string }[]
  ): void {
    this.ctx.font = '11px ui-monospace, monospace';
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'middle';

    let xOffset = 15;

    // Domain note
    this.ctx.fillStyle = '#94a3b8';
    if (this.spec.domain.isDefault) {
      this.ctx.fillText('Domain: default [-10, 10]', xOffset, 16);
      xOffset += 180;
    } else {
      this.ctx.fillText(`Domain: [${this.spec.domain.min}, ${this.spec.domain.max}]`, xOffset, 16);
      xOffset += 160;
    }

    // Series legend
    for (const s of series) {
      this.ctx.fillStyle = s.color;
      this.ctx.fillRect(xOffset, 11, 10, 10);
      this.ctx.fillStyle = '#cbd5e1';
      this.ctx.fillText(s.label, xOffset + 15, 16);
      xOffset += this.ctx.measureText(s.label).width + 30;
    }

    // Shared axis note banner
    if (this.spec.sharedAxisNote) {
      this.ctx.font = '11px ui-monospace, monospace';
      this.ctx.fillStyle = '#f59e0b'; // amber
      this.ctx.fillText(this.spec.sharedAxisNote, 15, 34);
    }
  }

  private resizeListener?: () => void;

  private setupInteractivity(): void {
    this.resizeListener = () => this.render();
    window.addEventListener('resize', this.resizeListener);
  }

  public dispose(): void {
    if (this.resizeListener) {
      window.removeEventListener('resize', this.resizeListener);
      this.resizeListener = undefined;
    }
  }
}
