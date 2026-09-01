import { TrajectoryValue, Value, DrawingPrimitiveValue } from '../core/types';
import { getTrajectoryStateAt } from '../core/simulation/trajectory';
import { valueToNumber } from '../core/numeric/tower';

export interface AnimationPlayerOptions {
  width?: number;
  height?: number;
  viewResolver?: (state: Value) => Value | null;
  onTimeUpdate?: (t: number, state: Value) => void;
}

export class AnimationPlayer {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private trajectories: TrajectoryValue[];
  private tStart: number = 0;
  private tEnd: number = 1;
  private currentTime: number = 0;
  private isPlaying: boolean = false;
  private playbackSpeed: number = 1.0;
  private lastFrameTimestamp: number = 0;
  private animFrameId: number | null = null;
  private viewResolver?: (state: Value) => Value | null;
  private onTimeUpdate?: (t: number, state: Value) => void;

  // Trail history
  private trailHistory: { t: number; x: number; y: number }[] = [];
  private maxTrailPoints: number = 200;

  // DOM elements
  private playBtn!: HTMLButtonElement;
  private scrubBar!: HTMLInputElement;
  private timeDisplay!: HTMLElement;
  private telemetryDisplay!: HTMLElement;
  private hudElement!: HTMLElement;
  private boundKeyDownHandler: (e: KeyboardEvent) => void;

  constructor(
    container: HTMLElement,
    trajectoryOrList: TrajectoryValue | TrajectoryValue[],
    options: AnimationPlayerOptions = {}
  ) {
    this.container = container;
    this.trajectories = Array.isArray(trajectoryOrList) ? trajectoryOrList : [trajectoryOrList];
    this.viewResolver = options.viewResolver;
    this.onTimeUpdate = options.onTimeUpdate;

    if (this.trajectories.length > 0) {
      this.tStart = Math.min(...this.trajectories.map(t => t.tStart));
      this.tEnd = Math.max(...this.trajectories.map(t => t.tEnd));
      this.currentTime = this.tStart;
    }

    const width = options.width || 480;
    const height = options.height || 300;

    this.container.innerHTML = '';
    this.container.className = 'axine-animation-player';

    // 1. HUD / Honesty metadata header
    this.hudElement = document.createElement('div');
    this.hudElement.className = 'anim-hud';
    this.renderHUD();
    this.container.appendChild(this.hudElement);

    // 2. Canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.className = 'anim-canvas';
    this.ctx = this.canvas.getContext('2d')!;
    this.container.appendChild(this.canvas);

    // 3. Scrub Bar and Live Telemetry Row
    const scrubRow = document.createElement('div');
    scrubRow.className = 'anim-scrub-row';

    this.scrubBar = document.createElement('input');
    this.scrubBar.type = 'range';
    this.scrubBar.className = 'anim-scrub-bar';
    this.scrubBar.min = String(this.tStart);
    this.scrubBar.max = String(this.tEnd);
    this.scrubBar.step = String((this.tEnd - this.tStart) / 500 || 0.01);
    this.scrubBar.value = String(this.currentTime);

    this.scrubBar.addEventListener('input', () => {
      this.currentTime = parseFloat(this.scrubBar.value);
      this.trailHistory = [];
      this.renderFrame();
    });

    this.timeDisplay = document.createElement('span');
    this.timeDisplay.className = 'anim-time-display';
    this.timeDisplay.textContent = `t = ${this.currentTime.toFixed(2)}s`;

    this.telemetryDisplay = document.createElement('div');
    this.telemetryDisplay.className = 'anim-telemetry';

    scrubRow.appendChild(this.scrubBar);
    scrubRow.appendChild(this.timeDisplay);
    this.container.appendChild(scrubRow);
    this.container.appendChild(this.telemetryDisplay);

    // 4. Transport Controls Row (Play, Pause, Step, Back, Reset, Speed)
    const controlsRow = document.createElement('div');
    controlsRow.className = 'anim-controls-row';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'anim-btn anim-btn-reset';
    resetBtn.title = 'Reset (Home / R)';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => this.reset());

    const backBtn = document.createElement('button');
    backBtn.className = 'anim-btn anim-btn-back';
    backBtn.title = 'Step Back (Left Arrow)';
    backBtn.textContent = 'Back';
    backBtn.addEventListener('click', () => this.stepBackward());

    this.playBtn = document.createElement('button');
    this.playBtn.className = 'anim-btn anim-btn-play';
    this.playBtn.title = 'Play / Pause (Space)';
    this.playBtn.textContent = 'Play';
    this.playBtn.addEventListener('click', () => this.togglePlay());

    const stepBtn = document.createElement('button');
    stepBtn.className = 'anim-btn anim-btn-step';
    stepBtn.title = 'Step Forward (Right Arrow)';
    stepBtn.textContent = 'Step';
    stepBtn.addEventListener('click', () => this.stepForward());

    const speedSelect = document.createElement('select');
    speedSelect.className = 'anim-speed-select';
    speedSelect.title = 'Playback Rate';
    const speeds = [0.25, 0.5, 1.0, 2.0, 5.0];
    for (const spd of speeds) {
      const opt = document.createElement('option');
      opt.value = String(spd);
      opt.textContent = `${spd}x`;
      if (spd === 1.0) opt.selected = true;
      speedSelect.appendChild(opt);
    }
    speedSelect.addEventListener('change', () => {
      this.playbackSpeed = parseFloat(speedSelect.value) || 1.0;
    });

    controlsRow.appendChild(resetBtn);
    controlsRow.appendChild(backBtn);
    controlsRow.appendChild(this.playBtn);
    controlsRow.appendChild(stepBtn);
    controlsRow.appendChild(speedSelect);
    this.container.appendChild(controlsRow);

    // 5. Global Keyboard Handler
    this.boundKeyDownHandler = (e: KeyboardEvent) => {
      const targetTag = (e.target as any)?.tagName?.toUpperCase();
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') {
        return;
      }
      if (e.code === 'Space') {
        if (e.preventDefault) e.preventDefault();
        this.togglePlay();
      } else if (e.code === 'ArrowRight') {
        if (e.preventDefault) e.preventDefault();
        this.stepForward();
      } else if (e.code === 'ArrowLeft') {
        if (e.preventDefault) e.preventDefault();
        this.stepBackward();
      } else if (e.code === 'KeyR' || e.code === 'Home') {
        if (e.preventDefault) e.preventDefault();
        this.reset();
      }
    };
    window.addEventListener('keydown', this.boundKeyDownHandler);

    this.renderFrame();
  }

  public play() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.playBtn.textContent = 'Pause';
    this.lastFrameTimestamp = performance.now();
    this.tick();
  }

  public pause() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    this.playBtn.textContent = 'Play';
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  public togglePlay() {
    if (this.isPlaying) this.pause();
    else {
      if (this.currentTime >= this.tEnd) {
        this.currentTime = this.tStart;
        this.trailHistory = [];
      }
      this.play();
    }
  }

  public stepForward(dt?: number) {
    this.pause();
    const stepSize = dt || (this.trajectories[0]?.sourceInfo?.dt || (this.tEnd - this.tStart) / 50 || 0.05);
    this.currentTime = Math.min(this.tEnd, this.currentTime + stepSize);
    this.scrubBar.value = String(this.currentTime);
    this.renderFrame();
  }

  public stepBackward(dt?: number) {
    this.pause();
    const stepSize = dt || (this.trajectories[0]?.sourceInfo?.dt || (this.tEnd - this.tStart) / 50 || 0.05);
    this.currentTime = Math.max(this.tStart, this.currentTime - stepSize);
    this.scrubBar.value = String(this.currentTime);
    this.renderFrame();
  }

  public reset() {
    this.pause();
    this.currentTime = this.tStart;
    this.trailHistory = [];
    this.scrubBar.value = String(this.currentTime);
    this.renderFrame();
  }

  public setSpeed(speed: number) {
    this.playbackSpeed = speed;
  }

  public seek(t: number) {
    this.currentTime = Math.max(this.tStart, Math.min(this.tEnd, t));
    this.scrubBar.value = String(this.currentTime);
    this.renderFrame();
  }

  private tick = () => {
    if (!this.isPlaying) return;
    const now = performance.now();
    const elapsedSeconds = (now - this.lastFrameTimestamp) / 1000;
    this.lastFrameTimestamp = now;

    this.currentTime += elapsedSeconds * this.playbackSpeed;

    if (this.currentTime >= this.tEnd) {
      this.currentTime = this.tEnd;
      this.scrubBar.value = String(this.currentTime);
      this.renderFrame();
      this.pause();
      return;
    }

    this.scrubBar.value = String(this.currentTime);
    this.renderFrame();
    this.animFrameId = requestAnimationFrame(this.tick);
  };

  private renderHUD() {
    const primary = this.trajectories[0];
    if (!primary) return;
    const sourceInfo = primary.sourceInfo;
    const integrator = sourceInfo.integrator || sourceInfo.source;
    const dtStr = sourceInfo.dt ? `dt = ${sourceInfo.dt}` : '';
    const errStr = sourceInfo.errorEstimate !== undefined ? `err <= ${sourceInfo.errorEstimate.toExponential(2)}` : '';
    const drift = sourceInfo.energyDrift;

    let hudHtml = `<div class="hud-badges">`;
    hudHtml += `<span class="hud-badge hud-source">${integrator.toUpperCase()}</span>`;
    if (dtStr) hudHtml += `<span class="hud-badge hud-dt">${dtStr}</span>`;
    if (errStr) hudHtml += `<span class="hud-badge hud-err">${errStr}</span>`;
    if (drift !== undefined) {
      const isWarn = Math.abs(drift) > 0.01;
      const warnClass = isWarn ? 'hud-drift-warn' : 'hud-drift-ok';
      hudHtml += `<span class="hud-badge ${warnClass}">${isWarn ? 'Warning: ' : ''}Energy drift: ${(drift * 100).toFixed(2)}%</span>`;
    }
    hudHtml += `</div>`;
    this.hudElement.innerHTML = hudHtml;
  }

  private renderFrame() {
    this.timeDisplay.textContent = `t = ${this.currentTime.toFixed(2)}s`;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear background
    ctx.fillStyle = '#0f141c';
    ctx.fillRect(0, 0, w, h);

    // Draw grid
    this.drawGrid(w, h);

    let telemetryText = '';

    // Collect states and determine bounding box
    for (const traj of this.trajectories) {
      const state = getTrajectoryStateAt(traj, this.currentTime);
      if (this.onTimeUpdate) this.onTimeUpdate(this.currentTime, state);

      // Extract visual position and telemetry
      const { x, y, info } = this.extractPositionAndInfo(state);
      if (info) telemetryText += (telemetryText ? ' | ' : '') + info;

      // Update trail history
      if (!isNaN(x) && !isNaN(y)) {
        this.trailHistory.push({ t: this.currentTime, x, y });
        if (this.trailHistory.length > this.maxTrailPoints) {
          this.trailHistory.shift();
        }
      }

      // Check if user-declared view exists
      let customPrimitives: DrawingPrimitiveValue[] | null = null;
      if (this.viewResolver) {
        const viewRes = this.viewResolver(state);
        if (viewRes && (viewRes.type === 'scene' || viewRes.type === 'drawing_primitive' || (viewRes.type === 'list' && viewRes.elements.every(e => (e as any).type === 'drawing_primitive')))) {
          if (viewRes.type === 'scene') customPrimitives = viewRes.primitives;
          else if (viewRes.type === 'drawing_primitive') customPrimitives = [viewRes];
          else if (viewRes.type === 'list') customPrimitives = viewRes.elements as DrawingPrimitiveValue[];
        }
      }

      // Render Trail
      this.drawTrail(w, h);

      // Render Object or Custom View
      if (customPrimitives && customPrimitives.length > 0) {
        for (const prim of customPrimitives) {
          this.drawPrimitive(prim, w, h);
        }
      } else {
        this.drawDefaultBody(x, y, state, w, h);
      }
    }

    this.telemetryDisplay.textContent = telemetryText || `State at t = ${this.currentTime.toFixed(2)}`;
  }

  private drawGrid(w: number, h: number) {
    const ctx = this.ctx;
    ctx.strokeStyle = '#1b2332';
    ctx.lineWidth = 1;

    const step = 40;
    for (let x = 0; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Origin crosshairs
    const cx = w / 2;
    const cy = h / 2;
    ctx.strokeStyle = '#2d3a4f';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(w, cy);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, h);
    ctx.stroke();
  }

  private drawTrail(w: number, h: number) {
    if (this.trailHistory.length < 2) return;
    const ctx = this.ctx;
    const cx = w / 2;
    const cy = h / 2;
    const scale = 15; // 15px per unit

    ctx.save();
    for (let i = 1; i < this.trailHistory.length; i++) {
      const p0 = this.trailHistory[i - 1];
      const p1 = this.trailHistory[i];
      const alpha = (i / this.trailHistory.length) * 0.7;

      ctx.strokeStyle = `rgba(56, 189, 248, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + p0.x * scale, cy - p0.y * scale);
      ctx.lineTo(cx + p1.x * scale, cy - p1.y * scale);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawDefaultBody(x: number, y: number, state: Value, w: number, h: number) {
    const ctx = this.ctx;
    const cx = w / 2;
    const cy = h / 2;
    const scale = 15;

    const px = cx + x * scale;
    const py = cy - y * scale;

    ctx.save();
    // Body circle
    ctx.fillStyle = '#38bdf8';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();

    // Velocity vector if present on record
    if (state.type === 'record' && 'velocity' in state.fields) {
      const v = state.fields['velocity'];
      if (v.type === 'tuple' && v.elements.length >= 2) {
        const vx = valueToNumber(v.elements[0]);
        const vy = valueToNumber(v.elements[1]);
        const vScale = 1.0;
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + vx * vScale, py - vy * vScale);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawPrimitive(prim: DrawingPrimitiveValue, w: number, h: number) {
    const ctx = this.ctx;
    const cx = w / 2;
    const cy = h / 2;
    const scale = 15;

    ctx.save();
    switch (prim.primitive) {
      case 'point': {
        const p = this.extractXY(prim.params.p);
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.arc(cx + p.x * scale, cy - p.y * scale, 4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'segment': {
        const a = this.extractXY(prim.params.a);
        const b = this.extractXY(prim.params.b);
        ctx.strokeStyle = '#a78bfa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx + a.x * scale, cy - a.y * scale);
        ctx.lineTo(cx + b.x * scale, cy - b.y * scale);
        ctx.stroke();
        break;
      }
      case 'arrow': {
        const from = this.extractXY(prim.params.from);
        const to = this.extractXY(prim.params.to);
        const x1 = cx + from.x * scale;
        const y1 = cy - from.y * scale;
        const x2 = cx + to.x * scale;
        const y2 = cy - to.y * scale;
        ctx.strokeStyle = '#fbbf24';
        ctx.fillStyle = '#fbbf24';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        // Arrow head
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLen = 8;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
        ctx.fill();
        break;
      }
      case 'circle': {
        const center = this.extractXY(prim.params.center);
        const r = typeof prim.params.r === 'number' ? prim.params.r : valueToNumber(prim.params.r || 1);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx + center.x * scale, cy - center.y * scale, r * scale, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'polygon':
      case 'path': {
        const ptsVal = prim.params.points;
        if (ptsVal && ptsVal.type === 'list') {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ptsVal.elements.forEach((pVal: Value, idx: number) => {
            const p = this.extractXY(pVal);
            const px = cx + p.x * scale;
            const py = cy - p.y * scale;
            if (idx === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          if (prim.primitive === 'polygon') ctx.closePath();
          ctx.stroke();
        }
        break;
      }
      case 'label': {
        const at = this.extractXY(prim.params.at);
        const text = typeof prim.params.text === 'string' ? prim.params.text : (prim.params.text?.value || '');
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '12px system-ui, sans-serif';
        ctx.fillText(text, cx + at.x * scale + 5, cy - at.y * scale - 5);
        break;
      }
    }
    ctx.restore();
  }

  private extractXY(val: Value): { x: number; y: number } {
    if (!val) return { x: 0, y: 0 };
    if (val.type === 'tuple' && val.elements.length >= 2) {
      return { x: valueToNumber(val.elements[0]), y: valueToNumber(val.elements[1]) };
    }
    if (val.type === 'record') {
      const pos = val.fields['position'] || val.fields['pos'] || val.fields['p'];
      if (pos && pos.type === 'tuple' && pos.elements.length >= 2) {
        return { x: valueToNumber(pos.elements[0]), y: valueToNumber(pos.elements[1]) };
      }
      if ('x' in val.fields && 'y' in val.fields) {
        return { x: valueToNumber(val.fields['x']), y: valueToNumber(val.fields['y']) };
      }
    }
    if (val.type === 'float' || val.type === 'rational') {
      return { x: valueToNumber(val), y: 0 };
    }
    return { x: 0, y: 0 };
  }

  private extractPositionAndInfo(state: Value): { x: number; y: number; info: string } {
    const { x, y } = this.extractXY(state);
    let info = '';

    if (state.type === 'record') {
      const entries = Object.entries(state.fields)
        .map(([k, v]) => `${k}: ${v.type === 'float' ? (v.value.toFixed(2)) : (v.type === 'rational' ? `${v.n}/${v.d}` : '')}`)
        .filter(s => !s.endsWith(': '));
      info = `${state.typeName}(${entries.join(', ')})`;
    } else if (state.type === 'tuple') {
      info = `(${state.elements.map(e => valueToNumber(e).toFixed(2)).join(', ')})`;
    } else if (state.type === 'float' || state.type === 'rational') {
      info = `y = ${valueToNumber(state).toFixed(4)}`;
    }
    return { x, y, info };
  }

  public dispose() {
    this.pause();
    window.removeEventListener('keydown', this.boundKeyDownHandler);
    this.container.innerHTML = '';
  }
}
