/**
 * Explainer Visualizer Component (Phase 9 — Gate F3)
 * 
 * Renders interactive, expression-driven mathematical visualizations:
 * 1. Integral as Riemann Sum (partition rectangles with live n slider and sum convergence)
 * 2. Derivative as Tangent (secant line converging to tangent as h -> 0 with difference quotient)
 * 3. Limit as Epsilon-Delta (interactive ε and δ error tolerance bands)
 */

import { VisualizationConfig } from '../core/explainer';
import { evaluate, createInitialEnvironment } from '../core/evaluator';
import { valueToNumber } from '../core/numeric/tower';
import { Environment } from '../core/types';

export class ExplainerVisualizer {
  private container: HTMLElement;
  private config: VisualizationConfig;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private fn!: (x: number) => number;
  private dpr: number = 1;

  // State
  private riemannN: number = 6;
  private derivativeH: number = 1.0;
  private epsilon: number = 0.5;
  private delta: number = 0.25;

  constructor(container: HTMLElement, config: VisualizationConfig) {
    this.container = container;
    this.config = config;
    this.dpr = window.devicePixelRatio || 1;
    this.compileFunction();
    this.buildUI();
    this.render();
  }

  private compileFunction() {
    let expr = this.config.expression || 'x^2';
    const varName = this.config.variable || 'x';

    // Clean expression string of leading operator or diff markers
    expr = expr.trim();
    if (expr.startsWith('d//d' + varName)) {
      expr = expr.replace(new RegExp(`^d\\/\\/d${varName}\\s*`), '').trim();
    }
    if (expr.startsWith('lim')) {
      expr = expr.replace(/^lim(?:\([^)]+\)|_[^\s]+)?\s*/, '').trim();
    }
    if (!expr) expr = `${varName}^2`;

    try {
      const baseEnv = createInitialEnvironment();
      this.fn = (x: number) => {
        try {
          const env: Environment = {
            ...baseEnv,
            [varName]: { type: 'float', value: x },
          };
          const { value } = evaluate(expr, env);
          const num = valueToNumber(value);
          if (!isNaN(num)) return num;
        } catch {
          // fall through
        }
        return this.evalJsFallback(expr, varName, x);
      };
      // Test evaluation
      this.fn(1.0);
    } catch {
      this.fn = (x: number) => this.evalJsFallback(expr, varName, x);
    }
  }

  private evalJsFallback(expr: string, varName: string, x: number): number {
    try {
      const jsExpr = expr
        .replace(/\^/g, '**')
        .replace(/\bsin\b/g, 'Math.sin')
        .replace(/\bcos\b/g, 'Math.cos')
        .replace(/\btan\b/g, 'Math.tan')
        .replace(/\bsqrt\b/g, 'Math.sqrt')
        .replace(/\bln\b/g, 'Math.log')
        .replace(/\bexp\b/g, 'Math.exp')
        .replace(/\bpi\b/g, 'Math.PI')
        .replace(new RegExp(`\\b${varName}\\b`, 'g'), `(${x})`);
      const res = Number(eval(jsExpr));
      return isNaN(res) ? 0 : res;
    } catch {
      return x * x;
    }
  }

  private buildUI() {
    this.container.innerHTML = '';
    this.container.className = 'vis-widget-root';

    // Top Canvas
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'vis-canvas-wrap';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'vis-canvas';
    this.canvas.width = 340 * this.dpr;
    this.canvas.height = 160 * this.dpr;
    this.canvas.style.width = '340px';
    this.canvas.style.height = '160px';

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2d canvas context');
    this.ctx = ctx;
    canvasWrap.appendChild(this.canvas);
    this.container.appendChild(canvasWrap);

    // Controls & Readouts
    const controlsWrap = document.createElement('div');
    controlsWrap.className = 'vis-controls-wrap';

    if (this.config.type === 'riemann_sum') {
      this.buildRiemannControls(controlsWrap);
    } else if (this.config.type === 'derivative_tangent') {
      this.buildDerivativeControls(controlsWrap);
    } else if (this.config.type === 'epsilon_delta') {
      this.buildEpsilonDeltaControls(controlsWrap);
    }

    this.container.appendChild(controlsWrap);
  }

  // --- 1. RIEMANN SUM CONTROLS & RENDERING ---
  private buildRiemannControls(parent: HTMLElement) {
    parent.innerHTML = `
      <div class="vis-control-row">
        <label class="vis-label" for="riemann-n-slider">Partitions <span class="vis-badge" id="vis-n-badge">n = ${this.riemannN}</span></label>
        <input type="range" class="vis-slider" id="riemann-n-slider" min="2" max="50" step="1" value="${this.riemannN}">
      </div>
      <div class="vis-readouts-grid">
        <div class="vis-stat-item"><span class="vis-stat-name">Δx:</span> <span class="vis-stat-val" id="vis-val-dx">0.3333</span></div>
        <div class="vis-stat-item"><span class="vis-stat-name">Riemann Sum:</span> <span class="vis-stat-val" id="vis-val-sum">2.6296</span></div>
        <div class="vis-stat-item"><span class="vis-stat-name">Exact Integral:</span> <span class="vis-stat-val" id="vis-val-exact">2.6667</span></div>
        <div class="vis-stat-item"><span class="vis-stat-name">Error:</span> <span class="vis-stat-val" id="vis-val-error">0.0370</span></div>
      </div>
    `;

    const slider = parent.querySelector('#riemann-n-slider') as HTMLInputElement;
    slider?.addEventListener('input', () => {
      this.riemannN = parseInt(slider.value, 10);
      const badge = parent.querySelector('#vis-n-badge');
      if (badge) badge.textContent = `n = ${this.riemannN}`;
      this.render();
    });
  }

  private renderRiemannSum() {
    const a = this.config.bounds?.lower ?? 0;
    const b = this.config.bounds?.upper ?? 2;
    const n = this.riemannN;
    const dx = (b - a) / n;

    // Numerical integration (fine grid for exact)
    let exactSum = 0;
    const fineN = 2000;
    const fdx = (b - a) / fineN;
    for (let i = 0; i < fineN; i++) {
      const mid = a + (i + 0.5) * fdx;
      exactSum += this.fn(mid) * fdx;
    }

    // Compute Riemann sum (Midpoint)
    let riemannSum = 0;
    const rects: { x0: number; x1: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const x0 = a + i * dx;
      const x1 = a + (i + 1) * dx;
      const mid = (x0 + x1) / 2;
      const y = this.fn(mid);
      riemannSum += y * dx;
      rects.push({ x0, x1, y });
    }

    const err = Math.abs(riemannSum - exactSum);

    // Update DOM Readouts
    const dxEl = this.container.querySelector('#vis-val-dx');
    const sumEl = this.container.querySelector('#vis-val-sum');
    const exactEl = this.container.querySelector('#vis-val-exact');
    const errEl = this.container.querySelector('#vis-val-error');
    if (dxEl) dxEl.textContent = dx.toFixed(4);
    if (sumEl) sumEl.textContent = riemannSum.toFixed(4);
    if (exactEl) exactEl.textContent = exactSum.toFixed(4);
    if (errEl) errEl.textContent = err.toFixed(4);

    // Plot Canvas
    const w = 340;
    const h = 160;
    this.ctx.save();
    this.ctx.scale(this.dpr, this.dpr);
    this.ctx.clearRect(0, 0, w, h);

    // Coordinate domain & range
    const xMin = a - (b - a) * 0.2;
    const xMax = b + (b - a) * 0.2;
    let yMin = Math.min(0, ...rects.map(r => r.y), this.fn(a), this.fn(b));
    let yMax = Math.max(1, ...rects.map(r => r.y), this.fn(a), this.fn(b));
    yMax = yMax * 1.2;

    const mapX = (x: number) => 35 + ((x - xMin) / (xMax - xMin)) * (w - 55);
    const mapY = (y: number) => h - 25 - ((y - yMin) / (yMax - yMin)) * (h - 45);

    // Grid & Axes
    this.drawAxes(mapX, mapY, xMin, xMax, yMin, yMax, w, h);

    // Draw Riemann Rectangles
    for (const r of rects) {
      const rx0 = mapX(r.x0);
      const rx1 = mapX(r.x1);
      const ry = mapY(r.y);
      const yBase = mapY(0);

      this.ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
      this.ctx.fillRect(rx0, Math.min(ry, yBase), rx1 - rx0, Math.abs(yBase - ry));

      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(rx0, Math.min(ry, yBase), rx1 - rx0, Math.abs(yBase - ry));

      // Midpoint dot
      const mx = mapX((r.x0 + r.x1) / 2);
      this.ctx.fillStyle = '#06b6d4';
      this.ctx.beginPath();
      this.ctx.arc(mx, ry, 2.5, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Draw Continuous Function Curve
    this.ctx.strokeStyle = '#10b981';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    const steps = 120;
    for (let i = 0; i <= steps; i++) {
      const cx = xMin + (i / steps) * (xMax - xMin);
      const cy = this.fn(cx);
      const px = mapX(cx);
      const py = mapY(cy);
      if (i === 0) this.ctx.moveTo(px, py);
      else this.ctx.lineTo(px, py);
    }
    this.ctx.stroke();

    this.ctx.restore();
  }

  // --- 2. DERIVATIVE AS TANGENT & SECANT CONVERGENCE ---
  private buildDerivativeControls(parent: HTMLElement) {
    parent.innerHTML = `
      <div class="vis-control-row">
        <label class="vis-label" for="deriv-h-slider">Step Size <span class="vis-badge" id="vis-h-badge">h = ${this.derivativeH.toFixed(2)}</span></label>
        <input type="range" class="vis-slider" id="deriv-h-slider" min="0.02" max="2.0" step="0.02" value="${this.derivativeH}">
      </div>
      <div class="vis-readouts-grid">
        <div class="vis-stat-item"><span class="vis-stat-name">Δy:</span> <span class="vis-stat-val" id="vis-val-dy">3.0000</span></div>
        <div class="vis-stat-item"><span class="vis-stat-name">Secant Slope:</span> <span class="vis-stat-val" id="vis-val-secant">3.0000</span></div>
        <div class="vis-stat-item"><span class="vis-stat-name">Exact Tangent:</span> <span class="vis-stat-val" id="vis-val-tangent">2.0000</span></div>
        <div class="vis-stat-item"><span class="vis-stat-name">Slope Error:</span> <span class="vis-stat-val" id="vis-val-err">1.0000</span></div>
      </div>
    `;

    const slider = parent.querySelector('#deriv-h-slider') as HTMLInputElement;
    slider?.addEventListener('input', () => {
      this.derivativeH = parseFloat(slider.value);
      const badge = parent.querySelector('#vis-h-badge');
      if (badge) badge.textContent = `h = ${this.derivativeH.toFixed(2)}`;
      this.render();
    });
  }

  private renderDerivativeTangent() {
    const x0 = this.config.point ?? 1.0;
    const hStep = this.derivativeH;
    const y0 = this.fn(x0);
    const y1 = this.fn(x0 + hStep);
    const dy = y1 - y0;
    const secantSlope = dy / hStep;

    // Exact derivative via small central difference
    const eps = 1e-6;
    const exactTangent = (this.fn(x0 + eps) - this.fn(x0 - eps)) / (2 * eps);
    const slopeErr = Math.abs(secantSlope - exactTangent);

    // Update DOM readouts
    const dyEl = this.container.querySelector('#vis-val-dy');
    const secEl = this.container.querySelector('#vis-val-secant');
    const tanEl = this.container.querySelector('#vis-val-tangent');
    const errEl = this.container.querySelector('#vis-val-err');
    if (dyEl) dyEl.textContent = dy.toFixed(4);
    if (secEl) secEl.textContent = secantSlope.toFixed(4);
    if (tanEl) tanEl.textContent = exactTangent.toFixed(4);
    if (errEl) errEl.textContent = slopeErr.toFixed(4);

    // Plot Canvas
    const w = 340;
    const h = 160;
    this.ctx.save();
    this.ctx.scale(this.dpr, this.dpr);
    this.ctx.clearRect(0, 0, w, h);

    const xMin = x0 - 1.5;
    const xMax = x0 + Math.max(2.5, hStep + 1.0);
    const yMin = Math.min(-1.0, y0 - 2.0, y1 - 2.0);
    const yMax = Math.max(4.0, y0 + 3.5, y1 + 1.5);

    const mapX = (x: number) => 35 + ((x - xMin) / (xMax - xMin)) * (w - 55);
    const mapY = (y: number) => h - 25 - ((y - yMin) / (yMax - yMin)) * (h - 45);

    this.drawAxes(mapX, mapY, xMin, xMax, yMin, yMax, w, h);

    // Draw Function Curve
    this.ctx.strokeStyle = '#38bdf8';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    const steps = 120;
    for (let i = 0; i <= steps; i++) {
      const cx = xMin + (i / steps) * (xMax - xMin);
      const cy = this.fn(cx);
      const px = mapX(cx);
      const py = mapY(cy);
      if (i === 0) this.ctx.moveTo(px, py);
      else this.ctx.lineTo(px, py);
    }
    this.ctx.stroke();

    // Draw Tangent Line (Gold / Amber)
    this.ctx.strokeStyle = '#f59e0b';
    this.ctx.lineWidth = 1.5;
    this.ctx.setLineDash([4, 3]);
    this.ctx.beginPath();
    const tanX0 = xMin;
    const tanY0 = y0 + exactTangent * (tanX0 - x0);
    const tanX1 = xMax;
    const tanY1 = y0 + exactTangent * (tanX1 - x0);
    this.ctx.moveTo(mapX(tanX0), mapY(tanY0));
    this.ctx.lineTo(mapX(tanX1), mapY(tanY1));
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Draw Secant Line (Rose / Crimson)
    this.ctx.strokeStyle = '#f43f5e';
    this.ctx.lineWidth = 1.8;
    this.ctx.beginPath();
    const secX0 = xMin;
    const secY0 = y0 + secantSlope * (secX0 - x0);
    const secX1 = xMax;
    const secY1 = y0 + secantSlope * (secX1 - x0);
    this.ctx.moveTo(mapX(secX0), mapY(secY0));
    this.ctx.lineTo(mapX(secX1), mapY(secY1));
    this.ctx.stroke();

    // Draw Secant Triangle (dx, dy)
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(mapX(x0), mapY(y0));
    this.ctx.lineTo(mapX(x0 + hStep), mapY(y0));
    this.ctx.lineTo(mapX(x0 + hStep), mapY(y1));
    this.ctx.stroke();

    // Points
    this.ctx.fillStyle = '#f59e0b';
    this.ctx.beginPath();
    this.ctx.arc(mapX(x0), mapY(y0), 3.5, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = '#f43f5e';
    this.ctx.beginPath();
    this.ctx.arc(mapX(x0 + hStep), mapY(y1), 3.5, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.restore();
  }

  // --- 3. LIMIT AS EPSILON-DELTA CONTROLS & RENDERING ---
  private buildEpsilonDeltaControls(parent: HTMLElement) {
    parent.innerHTML = `
      <div class="vis-control-row">
        <label class="vis-label" for="eps-slider">Tolerance Band <span class="vis-badge" id="vis-eps-badge">ε = ${this.epsilon.toFixed(2)}</span></label>
        <input type="range" class="vis-slider" id="eps-slider" min="0.1" max="2.0" step="0.05" value="${this.epsilon}">
      </div>
      <div class="vis-control-row">
        <label class="vis-label" for="delta-slider">Radius Band <span class="vis-badge" id="vis-delta-badge">δ = ${this.delta.toFixed(2)}</span></label>
        <input type="range" class="vis-slider" id="delta-slider" min="0.05" max="1.5" step="0.05" value="${this.delta}">
      </div>
      <div class="vis-readouts-grid">
        <div class="vis-stat-item"><span class="vis-stat-name">Target (x₀, L):</span> <span class="vis-stat-val" id="vis-val-target">(2.0, 5.0)</span></div>
        <div class="vis-stat-item"><span class="vis-stat-name">Max |f(x) - L|:</span> <span class="vis-stat-val" id="vis-val-maxdev">0.5000</span></div>
        <div class="vis-stat-item vis-stat-full"><span class="vis-stat-name">Status:</span> <span class="vis-stat-val vis-status-pill" id="vis-val-status">Within Tolerance</span></div>
      </div>
    `;

    const epsSlider = parent.querySelector('#eps-slider') as HTMLInputElement;
    epsSlider?.addEventListener('input', () => {
      this.epsilon = parseFloat(epsSlider.value);
      const b = parent.querySelector('#vis-eps-badge');
      if (b) b.textContent = `ε = ${this.epsilon.toFixed(2)}`;
      this.render();
    });

    const deltaSlider = parent.querySelector('#delta-slider') as HTMLInputElement;
    deltaSlider?.addEventListener('input', () => {
      this.delta = parseFloat(deltaSlider.value);
      const b = parent.querySelector('#vis-delta-badge');
      if (b) b.textContent = `δ = ${this.delta.toFixed(2)}`;
      this.render();
    });
  }

  private renderEpsilonDelta() {
    const x0 = this.config.point ?? 2.0;
    const L = this.config.targetLimit ?? this.fn(x0);
    const eps = this.epsilon;
    const delta = this.delta;

    // Check maximum deviation in [x0 - delta, x0 + delta]
    let maxDev = 0;
    const sampleSteps = 50;
    for (let i = 0; i <= sampleSteps; i++) {
      const sx = x0 - delta + (i / sampleSteps) * (2 * delta);
      const sy = this.fn(sx);
      const dev = Math.abs(sy - L);
      if (dev > maxDev) maxDev = dev;
    }

    const isValid = maxDev <= eps + 1e-5;

    // Update DOM
    const targetEl = this.container.querySelector('#vis-val-target');
    const maxdevEl = this.container.querySelector('#vis-val-maxdev');
    const statusEl = this.container.querySelector('#vis-val-status');
    if (targetEl) targetEl.textContent = `(${x0.toFixed(1)}, ${L.toFixed(1)})`;
    if (maxdevEl) maxdevEl.textContent = maxDev.toFixed(4);
    if (statusEl) {
      statusEl.textContent = isValid ? 'Valid: |f(x)-L| < ε' : 'Exceeds ε Tolerance';
      statusEl.className = `vis-stat-val vis-status-pill ${isValid ? 'valid' : 'invalid'}`;
    }

    // Canvas Plot
    const w = 340;
    const h = 160;
    this.ctx.save();
    this.ctx.scale(this.dpr, this.dpr);
    this.ctx.clearRect(0, 0, w, h);

    const xMin = x0 - 2.0;
    const xMax = x0 + 2.0;
    const yMin = Math.max(0, L - 3.0);
    const yMax = L + 3.0;

    const mapX = (x: number) => 35 + ((x - xMin) / (xMax - xMin)) * (w - 55);
    const mapY = (y: number) => h - 25 - ((y - yMin) / (yMax - yMin)) * (h - 45);

    this.drawAxes(mapX, mapY, xMin, xMax, yMin, yMax, w, h);

    // Epsilon Band (Horizontal green/amber)
    const eyTop = mapY(L + eps);
    const eyBot = mapY(L - eps);
    this.ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
    this.ctx.fillRect(mapX(xMin), eyTop, mapX(xMax) - mapX(xMin), eyBot - eyTop);

    this.ctx.strokeStyle = '#10b981';
    this.ctx.setLineDash([3, 3]);
    this.ctx.beginPath();
    this.ctx.moveTo(mapX(xMin), eyTop);
    this.ctx.lineTo(mapX(xMax), eyTop);
    this.ctx.moveTo(mapX(xMin), eyBot);
    this.ctx.lineTo(mapX(xMax), eyBot);
    this.ctx.stroke();

    // Delta Band (Vertical cyan/blue)
    const dxLeft = mapX(x0 - delta);
    const dxRight = mapX(x0 + delta);
    this.ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
    this.ctx.fillRect(dxLeft, mapY(yMax), dxRight - dxLeft, mapY(yMin) - mapY(yMax));

    this.ctx.strokeStyle = '#38bdf8';
    this.ctx.beginPath();
    this.ctx.moveTo(dxLeft, mapY(yMin));
    this.ctx.lineTo(dxLeft, mapY(yMax));
    this.ctx.moveTo(dxRight, mapY(yMin));
    this.ctx.lineTo(dxRight, mapY(yMax));
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // Curve
    this.ctx.strokeStyle = '#a855f7';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    const steps = 120;
    for (let i = 0; i <= steps; i++) {
      const cx = xMin + (i / steps) * (xMax - xMin);
      const cy = this.fn(cx);
      const px = mapX(cx);
      const py = mapY(cy);
      if (i === 0) this.ctx.moveTo(px, py);
      else this.ctx.lineTo(px, py);
    }
    this.ctx.stroke();

    // Center point (x0, L)
    this.ctx.fillStyle = '#ffffff';
    this.ctx.beginPath();
    this.ctx.arc(mapX(x0), mapY(L), 3.5, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.restore();
  }

  private drawAxes(
    mapX: (x: number) => number,
    mapY: (y: number) => number,
    xMin: number,
    xMax: number,
    yMin: number,
    yMax: number,
    w: number,
    h: number
  ) {
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    this.ctx.lineWidth = 1;

    // Axis lines
    const x0 = mapX(0);
    const y0 = mapY(0);

    this.ctx.beginPath();
    // X Axis
    if (y0 >= 10 && y0 <= h - 10) {
      this.ctx.moveTo(35, y0);
      this.ctx.lineTo(w - 10, y0);
    } else {
      this.ctx.moveTo(35, h - 25);
      this.ctx.lineTo(w - 10, h - 25);
    }

    // Y Axis
    if (x0 >= 35 && x0 <= w - 10) {
      this.ctx.moveTo(x0, 10);
      this.ctx.lineTo(x0, h - 25);
    } else {
      this.ctx.moveTo(35, 10);
      this.ctx.lineTo(35, h - 25);
    }
    this.ctx.stroke();

    // Labels
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    this.ctx.font = '10px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`${xMin.toFixed(1)}`, 40, h - 10);
    this.ctx.fillText(`${xMax.toFixed(1)}`, w - 20, h - 10);
    this.ctx.textAlign = 'right';
    this.ctx.fillText(`${yMax.toFixed(1)}`, 30, 20);
    this.ctx.fillText(`${yMin.toFixed(1)}`, 30, h - 30);
  }

  public render() {
    if (this.config.type === 'riemann_sum') {
      this.renderRiemannSum();
    } else if (this.config.type === 'derivative_tangent') {
      this.renderDerivativeTangent();
    } else if (this.config.type === 'epsilon_delta') {
      this.renderEpsilonDelta();
    }
  }
}
