import { SpaceValue } from '../core/types';
import { sample2D, sample3D, sampleSlice, findBounds2D, TriangleMesh3D, Bounds2D, Bounds3D, Contour2DResult } from '../core/sampler';
import { compileAST } from '../core/compiler';

export interface SpaceViewportOptions {
  width?: number;
  height?: number;
  initialSliceAxes?: [string, string];
  fixedCoords?: Record<string, number>;
  onSliceChange?: (fixedCoords: Record<string, number>, durationMs: number) => void;
  onFocusChange?: (focused: boolean) => void;
}

const ENTITY_PALETTE = [
  '#38bdf8', // sky-400
  '#f43f5e', // rose-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#a855f7', // purple-500
  '#06b6d4', // cyan-500
  '#ec4899', // pink-500
  '#84cc16', // lime-500
];

export class SpaceViewport {
  private container: HTMLElement;
  private space: SpaceValue;
  private options: SpaceViewportOptions;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private controlsEl?: HTMLElement;

  private displayAxes: [string, string];
  private fixedCoords: Record<string, number> = {};
  private viewMode: '1d' | '2d' | '3d';

  // 2D Viewport State
  private bounds2D: Bounds2D = { minX: -5, maxX: 5, minY: -5, maxY: 5 };
  private defaultBounds2D: Bounds2D = { minX: -5, maxX: 5, minY: -5, maxY: 5 };

  // 3D Viewport State
  private bounds3D: Bounds3D = { minX: -3, maxX: 3, minY: -3, maxY: 3, minZ: -3, maxZ: 3 };
  private angleX: number = Math.PI / 6; // 30 deg elevation
  private angleZ: number = Math.PI / 4; // 45 deg azimuth
  private zoom3D: number = 1.0;
  private pan3DX: number = 0;
  private pan3DY: number = 0;

  // Interactivity State
  private isFocused: boolean = false;
  private isFullscreen: boolean = false;
  private isDragging: boolean = false;
  private isPanning3D: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;

  // Cleanup listeners
  private cleanups: (() => void)[] = [];

  constructor(container: HTMLElement, space: SpaceValue, options: SpaceViewportOptions = {}) {
    this.container = container;
    this.space = space;
    this.options = options;

    // Determine initial coordinates and view mode
    const coords = space.coordinates.length > 0 ? space.coordinates : ['x', 'y'];
    if (coords.length === 1) {
      this.displayAxes = [coords[0], 'y'];
      this.viewMode = '1d'; // 1D number line default for single variable space (n = 1)
    } else if (coords.length === 2) {
      this.displayAxes = [coords[0], coords[1]];
      this.viewMode = '2d';
    } else if (coords.length === 3) {
      this.displayAxes = [coords[0], coords[1]];
      this.viewMode = '3d';
    } else {
      this.displayAxes = [coords[0], coords[1]];
      this.viewMode = '2d'; // Slicing 2D view for n >= 4
    }

    if (options.initialSliceAxes && options.initialSliceAxes.length === 2) {
      this.displayAxes = options.initialSliceAxes;
    }

    // Initialize fixed coordinates for non-display axes
    for (const c of coords) {
      if (!this.displayAxes.includes(c)) {
        this.fixedCoords[c] = options.fixedCoords?.[c] ?? 0.0;
      }
    }

    // Ensure compiledFn is present for every entity
    for (const ent of this.space.entities) {
      if (!ent.compiledFn && ent.ast) {
        const comp = compileAST(ent.ast, ent.coordinates);
        if (comp.success) {
          ent.compiledFn = comp.fn;
        }
      }
    }

    // Setup DOM Structure
    this.container.innerHTML = '';
    this.container.className = 'space-viewport-container';
    this.container.tabIndex = 0;

    this.buildUI();

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'space-viewport-canvas doc-inline-canvas';
    const ctx = this.canvas.getContext?.('2d') || ({
      save: () => {},
      restore: () => {},
      clearRect: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      setLineDash: () => {},
      fillText: () => {},
      strokeText: () => {},
      measureText: (text: string) => ({ width: (text || '').length * 8 }),
      scale: () => {},
      translate: () => {},
      rotate: () => {},
      resetTransform: () => {},
    } as any);
    this.ctx = ctx;

    const canvasWrapper = document.createElement('div');
    canvasWrapper.className = 'space-canvas-wrapper';
    canvasWrapper.appendChild(this.canvas);
    this.container.appendChild(canvasWrapper);

    this.initDefaultBounds();
    this.setupEvents();
    this.render();
  }

  private initDefaultBounds(): void {
    if (this.space.entities.length > 0) {
      const primary = this.space.entities[0];
      if (this.space.dimension === 2 && primary.coordinates.length === 2) {
        try {
          const autoBounds = findBounds2D(primary.compiledFn, [-15, 15], [-15, 15]);
          if (autoBounds) {
            this.bounds2D = { ...autoBounds };
            this.defaultBounds2D = { ...autoBounds };
            return;
          }
        } catch {
          // Fallback to default
        }
      }
    }
    this.bounds2D = { minX: -5, maxX: 5, minY: -5, maxY: 5 };
    this.defaultBounds2D = { minX: -5, maxX: 5, minY: -5, maxY: 5 };
  }

  private buildUI(): void {
    const header = document.createElement('div');
    header.className = 'space-viewport-header';

    const leftGroup = document.createElement('div');
    leftGroup.className = 'space-header-left';

    const badge = document.createElement('span');
    badge.className = 'space-dimension-badge';
    const dimText = `${this.space.dimension}D Space`;
    const coordsText = this.space.coordinates.length > 0 ? `(${this.space.coordinates.join(', ')})` : '';
    badge.textContent = `${dimText} ${coordsText}`.trim();
    leftGroup.appendChild(badge);

    // Dimension / View mode selector if n >= 3 or n == 1
    if (this.space.dimension === 3) {
      const modeBtn = document.createElement('button');
      modeBtn.className = 'space-btn space-mode-toggle-btn';
      modeBtn.textContent = this.viewMode === '3d' ? '3D Mesh' : '2D Slice';
      modeBtn.title = 'Switch between 3D Mesh and 2D Orthogonal Slice';
      modeBtn.onclick = (e) => {
        e.stopPropagation();
        this.viewMode = this.viewMode === '3d' ? '2d' : '3d';
        modeBtn.textContent = this.viewMode === '3d' ? '3D Mesh' : '2D Slice';
        this.updateSlidersUI();
        this.render();
      };
      leftGroup.appendChild(modeBtn);
    } else if (this.space.dimension === 1) {
      const modeBtn = document.createElement('button');
      modeBtn.className = 'space-btn space-mode-toggle-btn';
      modeBtn.textContent = this.viewMode === '2d' ? '2D Plane' : '1D Line';
      modeBtn.title = 'Switch between 2D Cartesian Plane and 1D Number Line';
      modeBtn.onclick = (e) => {
        e.stopPropagation();
        this.viewMode = this.viewMode === '2d' ? '1d' : '2d';
        modeBtn.textContent = this.viewMode === '2d' ? '2D Plane' : '1D Line';
        this.render();
      };
      leftGroup.appendChild(modeBtn);
    }

    header.appendChild(leftGroup);

    // Right action buttons
    const rightGroup = document.createElement('div');
    rightGroup.className = 'space-header-right';

    // Reset Zoom Button
    const resetBtn = document.createElement('button');
    resetBtn.className = 'space-btn space-reset-btn';
    resetBtn.innerHTML = '&#8634; Reset';
    resetBtn.title = 'Reset to default zoom-to-fit bounds (R)';
    resetBtn.onclick = (e) => {
      e.stopPropagation();
      this.resetView();
    };
    rightGroup.appendChild(resetBtn);

    // Fullscreen Button
    const fsBtn = document.createElement('button');
    fsBtn.className = 'space-btn space-fullscreen-btn';
    fsBtn.innerHTML = '&#x26F6; Full';
    fsBtn.title = 'Toggle Fullscreen (F / Esc)';
    fsBtn.onclick = (e) => {
      e.stopPropagation();
      this.toggleFullscreen();
    };
    rightGroup.appendChild(fsBtn);

    header.appendChild(rightGroup);
    this.container.appendChild(header);

    // Slicing Controls (for n >= 4 or 2D slice mode in 3D)
    const controls = document.createElement('div');
    controls.className = 'space-slice-controls';
    this.container.appendChild(controls);
    this.controlsEl = controls;

    this.updateSlidersUI();
  }

  private updateSlidersUI(): void {
    if (!this.controlsEl) return;
    this.controlsEl.innerHTML = '';

    const coords = this.space.coordinates;
    const isSlicing = (this.space.dimension >= 4) || (this.space.dimension === 3 && this.viewMode === '2d');

    if (!isSlicing || coords.length < 3) {
      this.controlsEl.style.display = 'none';
      return;
    }

    this.controlsEl.style.display = 'flex';

    // Axis Selection Row
    const axisSelectorRow = document.createElement('div');
    axisSelectorRow.className = 'space-axis-selectors';

    const labelX = document.createElement('label');
    labelX.textContent = 'X-Axis: ';
    const selectX = document.createElement('select');
    selectX.className = 'space-select';
    coords.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      if (c === this.displayAxes[0]) opt.selected = true;
      selectX.appendChild(opt);
    });

    const labelY = document.createElement('label');
    labelY.textContent = ' Y-Axis: ';
    const selectY = document.createElement('select');
    selectY.className = 'space-select';
    coords.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      if (c === this.displayAxes[1]) opt.selected = true;
      selectY.appendChild(opt);
    });

    const onAxisChange = () => {
      const newX = selectX.value;
      const newY = selectY.value;
      if (newX !== newY) {
        this.displayAxes = [newX, newY];
        // Ensure fixedCoords contains other axes
        coords.forEach(c => {
          if (c !== newX && c !== newY && !(c in this.fixedCoords)) {
            this.fixedCoords[c] = 0.0;
          }
        });
        this.updateSlidersUI();
        this.render();
      }
    };

    selectX.onchange = onAxisChange;
    selectY.onchange = onAxisChange;

    axisSelectorRow.appendChild(labelX);
    axisSelectorRow.appendChild(selectX);
    axisSelectorRow.appendChild(labelY);
    axisSelectorRow.appendChild(selectY);
    this.controlsEl.appendChild(axisSelectorRow);

    // Sliders for Fixed Coordinates
    const slidersBox = document.createElement('div');
    slidersBox.className = 'space-sliders-box';

    coords.forEach(c => {
      if (c === this.displayAxes[0] || c === this.displayAxes[1]) return;
      if (!(c in this.fixedCoords)) this.fixedCoords[c] = 0.0;

      const sliderRow = document.createElement('div');
      sliderRow.className = 'space-slider-row';

      const varLabel = document.createElement('span');
      varLabel.className = 'space-slider-label';
      varLabel.textContent = `${c} = `;

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'space-range-slider';
      slider.min = '-10';
      slider.max = '10';
      slider.step = '0.05';
      slider.value = String(this.fixedCoords[c]);

      const valDisplay = document.createElement('span');
      valDisplay.className = 'space-slider-value';
      valDisplay.textContent = this.fixedCoords[c].toFixed(2);

      slider.oninput = () => {
        const val = parseFloat(slider.value);
        this.fixedCoords[c] = val;
        valDisplay.textContent = val.toFixed(2);

        const t0 = performance.now();
        this.render();
        const duration = performance.now() - t0;

        if (this.options.onSliceChange) {
          this.options.onSliceChange(this.fixedCoords, duration);
        }
      };

      sliderRow.appendChild(varLabel);
      sliderRow.appendChild(slider);
      sliderRow.appendChild(valDisplay);
      slidersBox.appendChild(sliderRow);
    });

    this.controlsEl.appendChild(slidersBox);
  }

  private setupEvents(): void {
    // Focus management
    const focusHandler = () => {
      if (!this.isFocused) {
        this.isFocused = true;
        this.container.classList?.add('focused');
        if (this.options.onFocusChange) this.options.onFocusChange(true);
      }
    };
    this.container.addEventListener?.('click', focusHandler);
    this.canvas.addEventListener?.('click', focusHandler);

    const blurHandler = () => {
      if (this.isFocused) {
        this.isFocused = false;
        this.container.classList?.remove('focused');
        if (this.options.onFocusChange) this.options.onFocusChange(false);
      }
    };
    this.container.addEventListener?.('blur', blurHandler);

    // Keyboard navigation
    const keydownHandler = (e: KeyboardEvent) => {
      if (!this.isFocused) return;

      const panDeltaX = (this.bounds2D.maxX - this.bounds2D.minX) * 0.05;
      const panDeltaY = (this.bounds2D.maxY - this.bounds2D.minY) * 0.05;

      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault?.();
          this.pan2D(-panDeltaX, 0);
          this.render();
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault?.();
          this.pan2D(panDeltaX, 0);
          this.render();
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault?.();
          this.pan2D(0, panDeltaY);
          this.render();
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault?.();
          this.pan2D(0, -panDeltaY);
          this.render();
          break;
        case '+':
        case '=':
          e.preventDefault?.();
          this.zoom2D(0.9);
          this.render();
          break;
        case '-':
        case '_':
          e.preventDefault?.();
          this.zoom2D(1.1);
          this.render();
          break;
        case 'f':
        case 'F':
          e.preventDefault?.();
          this.toggleFullscreen();
          break;
        case 'r':
        case 'R':
          e.preventDefault?.();
          this.resetView();
          break;
        case 'Escape':
        case 'q':
        case 'Q':
          e.preventDefault?.();
          if (this.isFullscreen) {
            this.toggleFullscreen();
          } else {
            this.container.blur?.();
            blurHandler();
          }
          break;
      }
    };
    this.container.addEventListener?.('keydown', keydownHandler as any);

    // Mouse drag for 2D pan and 3D orbit
    const mousedownHandler = (e: MouseEvent) => {
      if (e.target !== this.canvas) return;
      this.isDragging = true;
      this.isPanning3D = e.shiftKey || e.button === 2;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      focusHandler();
    };
    this.canvas.addEventListener?.('mousedown', mousedownHandler as any);

    const mousemoveHandler = (e: MouseEvent) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.lastMouseX;
      const dy = e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      if (this.viewMode === '3d') {
        if (this.isPanning3D) {
          this.pan3DX += dx;
          this.pan3DY += dy;
        } else {
          this.angleZ += dx * 0.01;
          this.angleX = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, this.angleX - dy * 0.01));
        }
      } else {
        const spanX = this.bounds2D.maxX - this.bounds2D.minX;
        const spanY = this.bounds2D.maxY - this.bounds2D.minY;
        const width = this.canvas.clientWidth || 600;
        const height = this.canvas.clientHeight || 300;

        const worldDx = -(dx / width) * spanX;
        const worldDy = (dy / height) * spanY;
        this.pan2D(worldDx, worldDy);
      }

      this.render();
    };
    if (typeof window !== 'undefined') window.addEventListener?.('mousemove', mousemoveHandler);

    const mouseupHandler = () => {
      this.isDragging = false;
      this.isPanning3D = false;
    };
    if (typeof window !== 'undefined') window.addEventListener?.('mouseup', mouseupHandler);

    // Mouse wheel zoom
    const wheelHandler = (e: WheelEvent) => {
      e.preventDefault?.();
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      if (this.viewMode === '3d') {
        this.zoom3D = Math.max(0.2, Math.min(5.0, this.zoom3D * (e.deltaY > 0 ? 0.9 : 1.1)));
      } else {
        this.zoom2D(factor);
      }
      this.render();
    };
    this.canvas.addEventListener?.('wheel', wheelHandler as any, { passive: false });

    // Double-click reset
    const dblclickHandler = () => {
      this.resetView();
    };
    this.canvas.addEventListener?.('dblclick', dblclickHandler);

    // Save cleanup hooks
    this.cleanups.push(() => {
      this.container.removeEventListener?.('click', focusHandler);
      this.canvas.removeEventListener?.('click', focusHandler);
      this.container.removeEventListener?.('blur', blurHandler);
      this.container.removeEventListener?.('keydown', keydownHandler as any);
      this.canvas.removeEventListener?.('mousedown', mousedownHandler as any);
      if (typeof window !== 'undefined') {
        window.removeEventListener?.('mousemove', mousemoveHandler);
        window.removeEventListener?.('mouseup', mouseupHandler);
      }
      this.canvas.removeEventListener?.('wheel', wheelHandler as any);
      this.canvas.removeEventListener?.('dblclick', dblclickHandler);
    });
  }

  public pan2D(dx: number, dy: number): void {
    this.bounds2D.minX += dx;
    this.bounds2D.maxX += dx;
    this.bounds2D.minY += dy;
    this.bounds2D.maxY += dy;
  }

  public zoom2D(factor: number): void {
    const cx = (this.bounds2D.minX + this.bounds2D.maxX) * 0.5;
    const cy = (this.bounds2D.minY + this.bounds2D.maxY) * 0.5;
    const halfW = (this.bounds2D.maxX - this.bounds2D.minX) * 0.5 * factor;
    const halfH = (this.bounds2D.maxY - this.bounds2D.minY) * 0.5 * factor;

    this.bounds2D.minX = cx - halfW;
    this.bounds2D.maxX = cx + halfW;
    this.bounds2D.minY = cy - halfH;
    this.bounds2D.maxY = cy + halfH;
  }

  public rotate3D(dAzimuth: number, dElevation: number): void {
    this.angleZ += dAzimuth;
    this.angleX = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, this.angleX + dElevation));
    this.render();
  }

  public pan3D(dx: number, dy: number): void {
    this.pan3DX += dx;
    this.pan3DY += dy;
    this.render();
  }

  public zoom3DBy(factor: number): void {
    this.zoom3D = Math.max(0.2, Math.min(5.0, this.zoom3D * factor));
    this.render();
  }

  public setFixedCoords(coords: Record<string, number>): void {
    Object.assign(this.fixedCoords, coords);
    this.render();
  }

  public resetView(): void {
    this.bounds2D = { ...this.defaultBounds2D };
    this.angleX = Math.PI / 6;
    this.angleZ = Math.PI / 4;
    this.zoom3D = 1.0;
    this.pan3DX = 0;
    this.pan3DY = 0;
    this.render();
  }

  public toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
    if (this.isFullscreen) {
      this.container.classList.add('fullscreen');
    } else {
      this.container.classList.remove('fullscreen');
    }
    this.render();
  }

  public render(): void {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.floor(rect.width) || this.canvas.clientWidth || 600;
    const height = Math.floor(rect.height) || this.canvas.clientHeight || 300;
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);

    this.ctx.save();
    this.ctx.scale(dpr, dpr);

    // Clear Dark Background
    this.ctx.fillStyle = '#0a0f1d';
    this.ctx.fillRect(0, 0, width, height);

    if (this.viewMode === '1d') {
      this.render1D(width, height);
    } else if (this.viewMode === '3d') {
      this.render3D(width, height);
    } else {
      this.render2D(width, height);
    }

    this.ctx.restore();
  }

  private render1D(width: number, height: number): void {
    const axisVar = this.space.coordinates[0] || 'x';
    const minX = this.bounds2D.minX;
    const maxX = this.bounds2D.maxX;
    const centerY = height * 0.5;

    // Draw main horizontal axis
    this.ctx.strokeStyle = '#64748b';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(30, centerY);
    this.ctx.lineTo(width - 30, centerY);
    this.ctx.stroke();

    // Axis label
    this.ctx.fillStyle = '#94a3b8';
    this.ctx.font = '12px var(--font-math, sans-serif)';
    this.ctx.textAlign = 'right';
    this.ctx.fillText(axisVar, width - 10, centerY + 4);

    // Draw ticks
    const step = this.computeNiceStep(maxX - minX);
    const firstTick = Math.ceil(minX / step) * step;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';

    for (let t = firstTick; t <= maxX; t += step) {
      const px = 30 + ((t - minX) / (maxX - minX)) * (width - 60);
      this.ctx.beginPath();
      this.ctx.moveTo(px, centerY - 6);
      this.ctx.lineTo(px, centerY + 6);
      this.ctx.stroke();

      const label = Number(t.toFixed(4)).toString();
      this.ctx.fillText(label, px, centerY + 10);
    }

    // Sample roots along 1D domain
    const N = 400;
    const stepSample = (maxX - minX) / N;

    for (let eIdx = 0; eIdx < this.space.entities.length; eIdx++) {
      const entity = this.space.entities[eIdx];
      const color = entity.color || ENTITY_PALETTE[eIdx % ENTITY_PALETTE.length];
      const roots: number[] = [];

      let prevVal: number | null = null;
      for (let i = 0; i <= N; i++) {
        const xVal = minX + i * stepSample;
        let v: number;
        try {
          v = entity.compiledFn(xVal);
        } catch {
          continue;
        }

        if (prevVal !== null && ((prevVal <= 0 && v >= 0) || (prevVal >= 0 && v <= 0))) {
          const denom = v - prevVal;
          const t = Math.abs(denom) > 1e-15 ? -prevVal / denom : 0.5;
          const rootX = (xVal - stepSample) + t * stepSample;
          roots.push(rootX);
        }
        prevVal = v;
      }

      // Draw found roots
      for (const rx of roots) {
        const px = 30 + ((rx - minX) / (maxX - minX)) * (width - 60);
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(px, centerY, 6, 0, 2 * Math.PI);
        this.ctx.fill();

        // Glow ring
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        this.ctx.fillStyle = '#f8fafc';
        this.ctx.font = 'bold 11px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`${axisVar} = ${rx.toFixed(2)}`, px, centerY - 16);
      }
    }
  }

  private render2D(width: number, height: number): void {
    const minX = this.bounds2D.minX;
    const maxX = this.bounds2D.maxX;
    const minY = this.bounds2D.minY;
    const maxY = this.bounds2D.maxY;

    const mapX = (x: number) => ((x - minX) / (maxX - minX)) * width;
    const mapY = (y: number) => height - ((y - minY) / (maxY - minY)) * height;

    // Draw Grid Lines
    this.ctx.strokeStyle = '#1e293b';
    this.ctx.lineWidth = 1;

    const stepX = this.computeNiceStep(maxX - minX);
    const stepY = this.computeNiceStep(maxY - minY);

    const firstTickX = Math.ceil(minX / stepX) * stepX;
    for (let x = firstTickX; x <= maxX; x += stepX) {
      const px = mapX(x);
      this.ctx.beginPath();
      this.ctx.moveTo(px, 0);
      this.ctx.lineTo(px, height);
      this.ctx.stroke();
    }

    const firstTickY = Math.ceil(minY / stepY) * stepY;
    for (let y = firstTickY; y <= maxY; y += stepY) {
      const py = mapY(y);
      this.ctx.beginPath();
      this.ctx.moveTo(0, py);
      this.ctx.lineTo(width, py);
      this.ctx.stroke();
    }

    // Draw Major Coordinate Axes
    this.ctx.strokeStyle = '#475569';
    this.ctx.lineWidth = 1.5;

    const originX = mapX(0);
    const originY = mapY(0);

    // Y Axis (x = 0)
    if (minX <= 0 && maxX >= 0) {
      this.ctx.beginPath();
      this.ctx.moveTo(originX, 0);
      this.ctx.lineTo(originX, height);
      this.ctx.stroke();
    }

    // X Axis (y = 0)
    if (minY <= 0 && maxY >= 0) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, originY);
      this.ctx.lineTo(width, originY);
      this.ctx.stroke();
    }

    // Tick Numbers & Axis Labels
    this.ctx.fillStyle = '#94a3b8';
    this.ctx.font = '11px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';

    const axisYPos = Math.max(15, Math.min(height - 15, originY));
    for (let x = firstTickX; x <= maxX; x += stepX) {
      if (Math.abs(x) < 1e-12) continue;
      const px = mapX(x);
      this.ctx.fillText(Number(x.toFixed(4)).toString(), px, axisYPos + 4);
    }

    this.ctx.textAlign = 'right';
    this.ctx.textBaseline = 'middle';
    const axisXPos = Math.max(30, Math.min(width - 15, originX));
    for (let y = firstTickY; y <= maxY; y += stepY) {
      if (Math.abs(y) < 1e-12) continue;
      const py = mapY(y);
      this.ctx.fillText(Number(y.toFixed(4)).toString(), axisXPos - 6, py);
    }

    // Axis Variable Names
    this.ctx.fillStyle = '#cbd5e1';
    this.ctx.font = 'bold 12px var(--font-math, sans-serif)';
    this.ctx.textAlign = 'right';
    this.ctx.fillText(this.displayAxes[0], width - 10, axisYPos - 12);
    this.ctx.textAlign = 'left';
    this.ctx.fillText(this.displayAxes[1], axisXPos + 8, 14);

    // Extract and Render Contours via Marching Squares
    const resolution = 160;

    for (let eIdx = 0; eIdx < this.space.entities.length; eIdx++) {
      const entity = this.space.entities[eIdx];
      const color = entity.color || ENTITY_PALETTE[eIdx % ENTITY_PALETTE.length];

      let contourResult: Contour2DResult;
      if (this.space.dimension >= 4 || (this.space.dimension === 3 && this.viewMode === '2d')) {
        contourResult = sampleSlice(
          entity.compiledFn,
          this.space.coordinates,
          this.displayAxes,
          this.fixedCoords,
          [[minX, maxX], [minY, maxY]],
          resolution
        ) as Contour2DResult;
      } else if (entity.coordinates.length === 1) {
        // 1D relation (e.g. x = 0) evaluated in 2D Cartesian plane
        const var0 = entity.coordinates[0];
        const isAxisX = var0 === this.displayAxes[0];
        const sliceFn = isAxisX
          ? (x: number, _y: number) => entity.compiledFn(x)
          : (_x: number, y: number) => entity.compiledFn(y);
        contourResult = sample2D(sliceFn, [minX, maxX], [minY, maxY], resolution);
      } else {
        contourResult = sample2D(entity.compiledFn, [minX, maxX], [minY, maxY], resolution);
      }

      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 2.2;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';

      for (const poly of contourResult.polylines) {
        if (poly.points.length < 2) continue;
        this.ctx.beginPath();
        const p0 = poly.points[0];
        this.ctx.moveTo(mapX(p0[0]), mapY(p0[1]));

        for (let i = 1; i < poly.points.length; i++) {
          const pt = poly.points[i];
          this.ctx.lineTo(mapX(pt[0]), mapY(pt[1]));
        }

        if (poly.closed) {
          this.ctx.closePath();
        }
        this.ctx.stroke();
      }
    }
  }

  private render3D(width: number, height: number): void {
    const minX = this.bounds3D.minX;
    const maxX = this.bounds3D.maxX;
    const minY = this.bounds3D.minY;
    const maxY = this.bounds3D.maxY;
    const minZ = this.bounds3D.minZ;
    const maxZ = this.bounds3D.maxZ;

    const cx = width * 0.5 + this.pan3DX;
    const cy = height * 0.5 + this.pan3DY;
    const scale = (Math.min(width, height) / 3.8) * this.zoom3D;

    // 3D rotation matrix
    const cosX = Math.cos(this.angleX);
    const sinX = Math.sin(this.angleX);
    const cosZ = Math.cos(this.angleZ);
    const sinZ = Math.sin(this.angleZ);

    const project3D = (x: number, y: number, z: number): [number, number, number] => {
      // Rotate around Z (azimuth)
      const x1 = x * cosZ - y * sinZ;
      const y1 = x * sinZ + y * cosZ;
      const z1 = z;

      // Rotate around X (elevation)
      const x2 = x1;
      const y2 = y1 * cosX - z1 * sinX;
      const z2 = y1 * sinX + z1 * cosX;

      const screenX = cx + x2 * scale;
      const screenY = cy - z2 * scale;
      return [screenX, screenY, y2]; // y2 is camera depth
    };

    // Draw 3D Bounding Box Wireframe
    this.ctx.strokeStyle = '#334155';
    this.ctx.lineWidth = 1;

    const corners = [
      [minX, minY, minZ], [maxX, minY, minZ], [maxX, maxY, minZ], [minX, maxY, minZ],
      [minX, minY, maxZ], [maxX, minY, maxZ], [maxX, maxY, maxZ], [minX, maxY, maxZ],
    ];

    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0],
      [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];

    for (const [i1, i2] of edges) {
      const p1 = project3D(corners[i1][0], corners[i1][1], corners[i1][2]);
      const p2 = project3D(corners[i2][0], corners[i2][1], corners[i2][2]);
      this.ctx.beginPath();
      this.ctx.moveTo(p1[0], p1[1]);
      this.ctx.lineTo(p2[0], p2[1]);
      this.ctx.stroke();
    }

    // Draw 3D Coordinates Axis Arrows
    const origin = project3D(0, 0, 0);
    const xAxisEnd = project3D(maxX * 1.15, 0, 0);
    const yAxisEnd = project3D(0, maxY * 1.15, 0);
    const zAxisEnd = project3D(0, 0, maxZ * 1.15);

    this.ctx.lineWidth = 1.5;

    // X Axis (Reddish)
    this.ctx.strokeStyle = '#ef4444';
    this.ctx.beginPath();
    this.ctx.moveTo(origin[0], origin[1]);
    this.ctx.lineTo(xAxisEnd[0], xAxisEnd[1]);
    this.ctx.stroke();

    // Y Axis (Greenish)
    this.ctx.strokeStyle = '#10b981';
    this.ctx.beginPath();
    this.ctx.moveTo(origin[0], origin[1]);
    this.ctx.lineTo(yAxisEnd[0], yAxisEnd[1]);
    this.ctx.stroke();

    // Z Axis (Sky Blue)
    this.ctx.strokeStyle = '#38bdf8';
    this.ctx.beginPath();
    this.ctx.moveTo(origin[0], origin[1]);
    this.ctx.lineTo(zAxisEnd[0], zAxisEnd[1]);
    this.ctx.stroke();

    // Labels
    this.ctx.fillStyle = '#cbd5e1';
    this.ctx.font = 'bold 11px var(--font-math, sans-serif)';
    this.ctx.fillText(this.space.coordinates[0] || 'x', xAxisEnd[0] + 4, xAxisEnd[1]);
    this.ctx.fillText(this.space.coordinates[1] || 'y', yAxisEnd[0] + 4, yAxisEnd[1]);
    this.ctx.fillText(this.space.coordinates[2] || 'z', zAxisEnd[0] + 4, zAxisEnd[1]);

    // Sample 3D Marching Cubes Mesh
    const resolution3D = 36;

    for (let eIdx = 0; eIdx < this.space.entities.length; eIdx++) {
      const entity = this.space.entities[eIdx];
      const mesh: TriangleMesh3D = sample3D(
        entity.compiledFn,
        [minX, maxX],
        [minY, maxY],
        [minZ, maxZ],
        resolution3D
      );

      // Transform all vertices and depth-sort triangles
      const projected = mesh.vertices.map(v => project3D(v[0], v[1], v[2]));

      interface SortedTriangle {
        v0: [number, number, number];
        v1: [number, number, number];
        v2: [number, number, number];
        depth: number;
        normalZ: number;
      }

      const triangles: SortedTriangle[] = [];

      for (let t = 0; t < mesh.triangles.length; t++) {
        const tri = mesh.triangles[t];
        const p0 = projected[tri[0]];
        const p1 = projected[tri[1]];
        const p2 = projected[tri[2]];

        const depth = (p0[2] + p1[2] + p2[2]) / 3;

        // Compute 2D surface normal for lighting
        const ax = p1[0] - p0[0], ay = p1[1] - p0[1];
        const bx = p2[0] - p0[0], by = p2[1] - p0[1];
        const cross = ax * by - ay * bx;

        triangles.push({
          v0: p0,
          v1: p1,
          v2: p2,
          depth,
          normalZ: cross,
        });
      }

      // Sort back-to-front
      triangles.sort((a, b) => a.depth - b.depth);

      // Render Lit Shaded Faces
      for (const tri of triangles) {
        const lighting = Math.min(1.0, Math.max(0.3, Math.abs(tri.normalZ) * 0.00015 + 0.4));
        const r = Math.round(56 * lighting);
        const g = Math.round(189 * lighting);
        const b = Math.round(248 * lighting);

        this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.85)`;
        this.ctx.strokeStyle = `rgba(${r + 30}, ${g + 30}, ${b + 30}, 0.6)`;
        this.ctx.lineWidth = 0.5;

        this.ctx.beginPath();
        this.ctx.moveTo(tri.v0[0], tri.v0[1]);
        this.ctx.lineTo(tri.v1[0], tri.v1[1]);
        this.ctx.lineTo(tri.v2[0], tri.v2[1]);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
      }
    }
  }

  private computeNiceStep(span: number): number {
    const rawStep = span / 8;
    const power = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const frac = rawStep / power;
    if (frac < 1.5) return power;
    if (frac < 3.5) return 2 * power;
    if (frac < 7.5) return 5 * power;
    return 10 * power;
  }

  public getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  public toSVG(): string {
    const rect = this.canvas?.getBoundingClientRect?.() || { width: 600, height: 300 };
    const width = Math.floor(rect.width) || 600;
    const height = Math.floor(rect.height) || 300;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#0a0f1d"/><text x="20" y="30" fill="#94a3b8" font-family="sans-serif">${this.space.dimension}D Space (${this.space.coordinates.join(', ')})</text></svg>`;
  }

  public dispose(): void {
    for (const cleanup of this.cleanups) {
      cleanup();
    }
    this.cleanups = [];
    this.container.innerHTML = '';
  }
}
