import { SpaceValue, SpatialEntity, DrawingPrimitiveValue } from '../core/types';
import { sample2D, sample3D, sampleSlice, populateSpaceGeometry, TriangleMesh3D, Bounds2D, Bounds3D, Contour2DResult } from '../core/sampler';
import { compileAST, rehydrateCompiledFunction } from '../core/compiler';
import { CameraState } from '../notebook/pane_tree';
import { SpatialInspector, SpatialInspectionResult } from './spatial_inspector';

export interface SpaceViewportOptions {
  width?: number;
  height?: number;
  initialSliceAxes?: [string, string];
  fixedCoords?: Record<string, number>;
  initialCameraState?: CameraState;
  onSliceChange?: (fixedCoords: Record<string, number>, durationMs: number) => void;
  onFocusChange?: (focused: boolean) => void;
  onCameraChange?: (camera: CameraState) => void;
  onJumpToSource?: (lineIdx: number) => void;
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

/**
 * Universal velocity stop ramp duration in milliseconds for both rotation and translation.
 */
export const STOP_RAMP_MS = 50;

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

  // Spatial Inspection State
  private inspectionResult: SpatialInspectionResult | null = null;
  private inspectorPanelEl: HTMLElement | null = null;
  private reticlePos: { x: number; y?: number; z?: number } | null = null;
  private showReticle: boolean = false;

  // Interactivity, Capture & Pointer Lock State
  public isCaptured: boolean = false;
  private isFocused: boolean = false;
  private isFullscreen: boolean = false;
  private isDragging: boolean = false;
  private isPanning3D: boolean = false;
  private lastMouseX: number = 0;
  private lastMouseY: number = 0;
  public isShiftHeld: boolean = false;
  private discardNextMouseDelta: boolean = false;
  private isPointerLocked: boolean = false;
  public isCameraFrozen: boolean = false;

  // Continuous Flight & Physics State (governed by STOP_RAMP_MS)
  private pressedKeys: Set<string> = new Set();
  private velX: number = 0;
  private velY: number = 0;
  private velZoom: number = 0;
  private velAngleX: number = 0;
  private velAngleZ: number = 0;
  private animFrameId: any = null;
  private lastAnimTime: number = 0;

  // Cleanup listeners
  private cleanups: (() => void)[] = [];

  constructor(container: HTMLElement, space: SpaceValue, options: SpaceViewportOptions = {}) {
    this.container = container;
    this.space = space;
    this.options = options;

    // Determine initial coordinates and view mode
    const dim = space.dimension;
    const coords = space.coordinates.length > 0 ? space.coordinates : (dim === 1 ? ['x'] : ['x', 'y']);
    if (dim === 1 || coords.length === 1) {
      this.displayAxes = [coords[0] || 'x', 'y'];
      this.viewMode = '1d'; // 1D number line default for single variable space (n = 1)
    } else if (dim === 2 || coords.length === 2) {
      this.displayAxes = [coords[0] || 'x', coords[1] || 'y'];
      this.viewMode = '2d';
    } else if (dim === 3 || coords.length === 3) {
      this.displayAxes = [coords[0] || 'x', coords[1] || 'y'];
      this.viewMode = '3d';
    } else {
      this.displayAxes = [coords[0] || 'x', coords[1] || 'y'];
      this.viewMode = '2d'; // Slicing 2D view for n >= 4
    }

    if (options.initialSliceAxes && options.initialSliceAxes.length === 2) {
      this.displayAxes = options.initialSliceAxes;
    }

    // Initialize fixed coordinates for non-display axes
    for (const c of coords) {
      if (!this.displayAxes.includes(c)) {
        this.fixedCoords[c] = options.fixedCoords?.[c] ?? (this.space.coordinateBounds?.[c]?.[0] ?? 0.0);
      }
    }

    if (this.space.coordinateBounds) {
      const b0 = this.space.coordinateBounds[this.displayAxes[0]];
      if (b0) {
        this.bounds2D.minX = b0[0];
        this.bounds2D.maxX = b0[1];
        this.defaultBounds2D.minX = b0[0];
        this.defaultBounds2D.maxX = b0[1];
      }
      const b1 = this.space.coordinateBounds[this.displayAxes[1]];
      if (b1) {
        this.bounds2D.minY = b1[0];
        this.bounds2D.maxY = b1[1];
        this.defaultBounds2D.minY = b1[0];
        this.defaultBounds2D.maxY = b1[1];
      }
    }

    if (this.space.primitives && this.space.primitives.length > 0) {
      this.updateBoundsFromPrimitives();
    }

    // Ensure compiledFn is present for every entity
    for (const ent of this.space.entities) {
      this.ensureEntityCompiled(ent);
    }

    // Setup DOM Structure
    this.container.innerHTML = '';
    this.container.className = 'space-viewport-container';
    this.container.tabIndex = 0;

    this.buildUI();

    this.canvas = typeof document !== 'undefined' ? document.createElement('canvas') : ({
      classList: { add: () => {}, remove: () => {}, contains: () => false },
      addEventListener: () => {},
      removeEventListener: () => {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 600, height: 300 }),
    } as any);
    if (this.canvas.className !== undefined) {
      this.canvas.className = 'space-viewport-canvas doc-inline-canvas';
    }
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
      arc: () => {},
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

    if (typeof document !== 'undefined') {
      const canvasWrapper = document.createElement('div');
      canvasWrapper.className = 'space-canvas-wrapper';
      canvasWrapper.appendChild(this.canvas);

      const hud = document.createElement('div');
      hud.className = 'space-flight-hud hidden';
      canvasWrapper.appendChild(hud);
      this.updateHUD(hud);

      this.container.appendChild?.(canvasWrapper);
    }

    this.initDefaultBounds();
    if (options.initialCameraState) {
      this.setCameraState(options.initialCameraState);
    }
    this.setupEvents();
    this.render();
  }

  public updateHUD(targetEl?: HTMLElement): void {
    const hudEl = targetEl || (this.container.querySelector('.space-flight-hud') as HTMLElement);
    if (!hudEl) return;
    if (this.viewMode === '1d') {
      hudEl.textContent = 'Pan A/D / Drag • Zoom +/- / Wheel • [I] Inspect • Esc Exit';
    } else if (this.viewMode === '2d') {
      hudEl.textContent = 'Pan WASD / Drag • Zoom +/- / Wheel • [I] Inspect • Esc Exit';
    } else {
      if (this.isShiftHeld) {
        hudEl.textContent = '[SHIFT HELD] Cursor Active • Camera Frozen • Click to Select • Release Shift to Fly';
      } else {
        hudEl.textContent = 'WASD Fly • Mouse Look • Hold Shift for Cursor • [I] Inspect • Esc Exit';
      }
    }
  }

  private initDefaultBounds(): void {
    if (this.space.coordinateBounds) {
      const b0 = this.space.coordinateBounds[this.displayAxes[0]];
      const b1 = this.space.coordinateBounds[this.displayAxes[1]];
      if (b0 && b1) {
        this.bounds2D = { minX: b0[0], maxX: b0[1], minY: b1[0], maxY: b1[1] };
        this.defaultBounds2D = { ...this.bounds2D };
        return;
      }
    }
    if (this.space.extent2D && (this.viewMode === '2d' || this.viewMode === '1d')) {
      this.bounds2D = { ...this.space.extent2D };
      this.defaultBounds2D = { ...this.space.extent2D };
      return;
    }
    if (this.space.extent3D && this.viewMode === '3d') {
      this.bounds3D = { ...this.space.extent3D };
      return;
    }
    if (this.space.entities.length > 0) {
      const primary = this.space.entities[0];
      if (this.ensureEntityCompiled(primary)) {
        populateSpaceGeometry(this.space);
        if (this.space.extent2D) {
          this.bounds2D = { ...this.space.extent2D };
          this.defaultBounds2D = { ...this.space.extent2D };
          return;
        }
      }
    }
    if (this.space.primitives && this.space.primitives.length > 0) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const prim of this.space.primitives) {
        const checkPt = (pt: [number, number] | null) => {
          if (pt) {
            minX = Math.min(minX, pt[0]);
            maxX = Math.max(maxX, pt[0]);
            minY = Math.min(minY, pt[1]);
            maxY = Math.max(maxY, pt[1]);
          }
        };
        const p1 = this.toCoord(prim.params?.position || prim.params?.pos || prim.params?.center || prim.params?.from || prim.params?.start);
        checkPt(p1);
        const p2 = this.toCoord(prim.params?.to || prim.params?.end);
        checkPt(p2);
        const vec = this.toCoord(prim.params?.vel || prim.params?.velocity || prim.params?.vector);
        if (p1 && vec) {
          checkPt([p1[0] + vec[0], p1[1] + vec[1]]);
        }
      }
      if (Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minY) && Number.isFinite(maxY)) {
        const padX = Math.max(1, (maxX - minX) * 0.4);
        const padY = Math.max(1, (maxY - minY) * 0.4);
        this.bounds2D = { minX: minX - padX, maxX: maxX + padX, minY: minY - padY, maxY: maxY + padY };
        this.defaultBounds2D = { ...this.bounds2D };
        return;
      }
    }
    this.bounds2D = { minX: -5, maxX: 5, minY: -5, maxY: 5 };
    this.defaultBounds2D = { minX: -5, maxX: 5, minY: -5, maxY: 5 };
  }

  private buildUI(): void {
    if (typeof document === 'undefined') return;
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
        this.updateHUD();
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
        this.updateHUD();
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
    resetBtn.textContent = 'Reset';
    resetBtn.title = 'Reset to default zoom-to-fit bounds (R)';
    resetBtn.onclick = (e) => {
      e.stopPropagation();
      this.resetView();
    };
    rightGroup.appendChild(resetBtn);

    // Fullscreen Button
    const fsBtn = document.createElement('button');
    fsBtn.className = 'space-btn space-fullscreen-btn';
    fsBtn.textContent = 'Full';
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

      const bounds = this.space.coordinateBounds?.[c];
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'space-range-slider';
      slider.min = bounds ? String(bounds[0]) : '-10';
      slider.max = bounds ? String(bounds[1]) : '10';
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

  private startAnimationLoop(): void {
    if (this.animFrameId !== null) return;
    this.lastAnimTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.animFrameId = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(this.animationStep) : null;
  }

  private stopAnimationLoop(): void {
    if (this.animFrameId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private animationStep = (timestamp: number): void => {
    if (
      !this.isFocused &&
      this.pressedKeys.size === 0 &&
      Math.abs(this.velX) < 1e-4 &&
      Math.abs(this.velY) < 1e-4 &&
      Math.abs(this.velZoom) < 1e-4 &&
      Math.abs(this.velAngleX) < 1e-4 &&
      Math.abs(this.velAngleZ) < 1e-4
    ) {
      this.animFrameId = null;
      return;
    }

    const dt = Math.min(0.05, Math.max(0.001, (timestamp - this.lastAnimTime) / 1000));
    this.lastAnimTime = timestamp;

    const spanX = this.bounds2D.maxX - this.bounds2D.minX;
    const spanY = this.bounds2D.maxY - this.bounds2D.minY;
    const accel2DX = spanX * 2.5;
    const accel2DY = spanY * 2.5;

    let targetVelX = 0;
    let targetVelY = 0;
    let targetVelZoom = 0;
    let targetVelAngleX = 0;
    let targetVelAngleZ = 0;

    // Target velocity determined from active keys
    if (this.pressedKeys.has('a') || this.pressedKeys.has('A') || this.pressedKeys.has('ArrowLeft')) {
      if (this.viewMode === '3d') {
        targetVelX = -150;
      } else {
        targetVelX = -accel2DX;
      }
    }
    if (this.pressedKeys.has('d') || this.pressedKeys.has('D') || this.pressedKeys.has('ArrowRight')) {
      if (this.viewMode === '3d') {
        targetVelX = 150;
      } else {
        targetVelX = accel2DX;
      }
    }
    if (this.pressedKeys.has('w') || this.pressedKeys.has('W') || this.pressedKeys.has('ArrowUp')) {
      if (this.viewMode === '3d') {
        targetVelZoom = 1.5;
        targetVelY = -80;
      } else if (this.viewMode === '2d') {
        targetVelY = accel2DY;
      }
    }
    if (this.pressedKeys.has('s') || this.pressedKeys.has('S') || this.pressedKeys.has('ArrowDown')) {
      if (this.viewMode === '3d') {
        targetVelZoom = -1.5;
        targetVelY = 80;
      } else if (this.viewMode === '2d') {
        targetVelY = -accel2DY;
      }
    }
    if (this.pressedKeys.has('+') || this.pressedKeys.has('=')) {
      targetVelZoom = 1.5;
    }
    if (this.pressedKeys.has('-') || this.pressedKeys.has('_')) {
      targetVelZoom = -1.5;
    }

    // Stop ramp: ease velocity to target (or 0) over STOP_RAMP_MS
    const rampAlpha = 1.0 - Math.exp(-dt / (STOP_RAMP_MS / 1000));
    this.velX += (targetVelX - this.velX) * rampAlpha;
    this.velY += (targetVelY - this.velY) * rampAlpha;
    this.velZoom += (targetVelZoom - this.velZoom) * rampAlpha;
    this.velAngleX += (targetVelAngleX - this.velAngleX) * rampAlpha;
    this.velAngleZ += (targetVelAngleZ - this.velAngleZ) * rampAlpha;

    if (Math.abs(this.velX) < 1e-4 && targetVelX === 0) this.velX = 0;
    if (Math.abs(this.velY) < 1e-4 && targetVelY === 0) this.velY = 0;
    if (Math.abs(this.velZoom) < 1e-4 && targetVelZoom === 0) this.velZoom = 0;
    if (Math.abs(this.velAngleX) < 1e-4 && targetVelAngleX === 0) this.velAngleX = 0;
    if (Math.abs(this.velAngleZ) < 1e-4 && targetVelAngleZ === 0) this.velAngleZ = 0;

    // Integrate velocities into camera
    let changed = false;
    if (Math.abs(this.velX) > 1e-5 || Math.abs(this.velY) > 1e-5) {
      if (this.viewMode === '3d') {
        this.pan3DX += this.velX * dt;
        this.pan3DY += this.velY * dt;
      } else {
        this.pan2D(this.velX * dt, this.viewMode === '1d' ? 0 : this.velY * dt);
      }
      changed = true;
    }

    if (Math.abs(this.velZoom) > 1e-5) {
      if (this.viewMode === '3d') {
        this.zoom3D = Math.max(0.2, Math.min(5.0, this.zoom3D * Math.exp(this.velZoom * dt)));
      } else {
        this.zoom2D(Math.exp(-this.velZoom * dt));
      }
      changed = true;
    }

    if (Math.abs(this.velAngleZ) > 1e-5 || Math.abs(this.velAngleX) > 1e-5) {
      this.angleZ += this.velAngleZ * dt;
      this.angleX = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, this.angleX + this.velAngleX * dt));
      changed = true;
    }

    if (changed) {
      this.notifyCameraChange();
      this.render();
    } else if (
      this.pressedKeys.size === 0 &&
      this.velX === 0 &&
      this.velY === 0 &&
      this.velZoom === 0 &&
      this.velAngleX === 0 &&
      this.velAngleZ === 0
    ) {
      this.stopAnimationLoop();
      return;
    }

    this.animFrameId = typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(this.animationStep) : null;
  };

  private setupEvents(): void {
    // Focus & Capture management
    const hudEl = this.container.querySelector('.space-flight-hud') as HTMLElement;
    const focusHandler = () => {
      if (!this.isCaptured) {
        this.isCaptured = true;
        this.isFocused = true;
        this.container.focus?.();
        this.container.classList?.add('focused', 'captured');
        this.updateHUD(hudEl);
        hudEl?.classList.remove('hidden');
        if (this.options.onFocusChange) this.options.onFocusChange(true);
      }
    };
    this.container.addEventListener?.('click', () => {
      this.container.focus?.();
      focusHandler();
    });
    this.container.addEventListener?.('focus', focusHandler);
    this.canvas.addEventListener?.('click', () => {
      this.container.focus?.();
      focusHandler();
    });

    const blurHandler = () => {
      if (this.isCaptured || this.isFocused) {
        this.isCaptured = false;
        this.isFocused = false;
        this.isShiftHeld = false;
        this.isCameraFrozen = false;
        this.canvas.classList?.remove('shift-cursor');
        if (typeof document !== 'undefined' && document.pointerLockElement === this.canvas) {
          document.exitPointerLock?.();
        }
        this.container.classList?.remove('focused', 'captured');
        this.pressedKeys.clear();
        this.stopAnimationLoop();
        hudEl?.classList.add('hidden');
        if (this.options.onFocusChange) this.options.onFocusChange(false);
      }
    };
    this.container.addEventListener?.('blur', blurHandler);

    // Pointer lock change listener
    const pointerLockChangeHandler = () => {
      if (typeof document !== 'undefined') {
        this.isPointerLocked = document.pointerLockElement === this.canvas;
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener?.('pointerlockchange', pointerLockChangeHandler);
    }

    // Continuous Keyboard Navigation with Event Capture
    const flightKeys = ['w', 'a', 's', 'd', 'W', 'A', 'S', 'D', '+', '-', '=', '_'];

    const keydownHandler = (e: KeyboardEvent) => {
      if (!this.isCaptured) return;

      // Shift key: release pointer lock and show free cursor with frozen camera
      if (e.key === 'Shift') {
        if (!this.isShiftHeld) {
          this.isShiftHeld = true;
          this.isCameraFrozen = true;
          if (typeof document !== 'undefined' && document.pointerLockElement === this.canvas) {
            document.exitPointerLock?.();
          }
          this.canvas.classList?.add('shift-cursor');
          this.updateHUD();
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault?.();
        e.stopPropagation?.();
        if (this.inspectorPanelEl) {
          this.closeInspection();
        }
        if (typeof document !== 'undefined' && document.pointerLockElement === this.canvas) {
          document.exitPointerLock?.();
        }
        if (this.isFullscreen) {
          this.toggleFullscreen();
        }
        this.isCaptured = false;
        this.isFocused = false;
        this.isShiftHeld = false;
        this.isCameraFrozen = false;
        this.canvas.classList?.remove('shift-cursor');
        this.container.classList?.remove('focused', 'captured');
        this.pressedKeys.clear();
        this.stopAnimationLoop();
        hudEl?.classList.add('hidden');
        this.container.blur?.();
        if (this.options.onFocusChange) this.options.onFocusChange(false);
        this.render();
        return;
      }

      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault?.();
        e.stopPropagation?.();
        this.toggleInspector();
        return;
      }

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault?.();
        e.stopPropagation?.();
        this.toggleFullscreen();
        return;
      }

      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault?.();
        e.stopPropagation?.();
        this.resetView();
        return;
      }

      // Keyboard space cursor / reticle navigation
      if (
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight' ||
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'PageUp' ||
        e.key === 'PageDown' ||
        e.key === 'e' ||
        e.key === 'E' ||
        e.key === 'q' ||
        e.key === 'Q'
      ) {
        e.preventDefault?.();
        e.stopPropagation?.();
        if (!this.reticlePos) {
          const midX = (this.bounds2D.minX + this.bounds2D.maxX) * 0.5;
          const midY = (this.bounds2D.minY + this.bounds2D.maxY) * 0.5;
          this.reticlePos = { x: midX, y: midY, z: 0 };
        }
        const mult = e.shiftKey ? 10 : 1;
        const stepX = (this.bounds2D.maxX - this.bounds2D.minX) * 0.02 * mult;
        const stepY = (this.bounds2D.maxY - this.bounds2D.minY) * 0.02 * mult;
        const stepZ = (this.bounds3D.maxZ - this.bounds3D.minZ) * 0.02 * mult;

        if (e.key === 'ArrowLeft') this.reticlePos.x -= stepX;
        if (e.key === 'ArrowRight') this.reticlePos.x += stepX;
        if (e.key === 'ArrowUp') {
          if (this.viewMode !== '1d') this.reticlePos.y = (this.reticlePos.y ?? 0) + stepY;
        }
        if (e.key === 'ArrowDown') {
          if (this.viewMode !== '1d') this.reticlePos.y = (this.reticlePos.y ?? 0) - stepY;
        }
        if (e.key === 'PageUp' || e.key === 'e' || e.key === 'E') {
          if (this.viewMode === '3d') this.reticlePos.z = (this.reticlePos.z ?? 0) + stepZ;
        }
        if (e.key === 'PageDown' || e.key === 'q' || e.key === 'Q') {
          if (this.viewMode === '3d') this.reticlePos.z = (this.reticlePos.z ?? 0) - stepZ;
        }

        this.showReticle = true;
        if (this.inspectorPanelEl) {
          this.inspectAtCoordinate(this.reticlePos.x, this.reticlePos.y, this.reticlePos.z);
        } else {
          this.render();
        }
        return;
      }

      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault?.();
        e.stopPropagation?.();
        if (!this.reticlePos) {
          const midX = (this.bounds2D.minX + this.bounds2D.maxX) * 0.5;
          const midY = (this.bounds2D.minY + this.bounds2D.maxY) * 0.5;
          this.reticlePos = { x: midX, y: midY, z: 0 };
        }
        this.inspectAtCoordinate(this.reticlePos.x, this.reticlePos.y, this.reticlePos.z);
        return;
      }

      if (flightKeys.includes(e.key)) {
        e.preventDefault?.();
        e.stopPropagation?.();
        this.pressedKeys.add(e.key);
        this.startAnimationLoop();
      }
    };
    const keyupHandler = (e: KeyboardEvent) => {
      // Releasing Shift immediately re-locks and resumes camera control
      if (e.key === 'Shift') {
        this.isShiftHeld = false;
        this.isCameraFrozen = false;
        this.canvas.classList?.remove('shift-cursor');
        if (this.isCaptured && this.viewMode === '3d') {
          this.discardNextMouseDelta = true; // Discard first frame mouse delta after re-lock
          try {
            this.canvas.requestPointerLock?.();
          } catch {}
        }
        this.updateHUD();
        return;
      }

      if (flightKeys.includes(e.key)) {
        this.pressedKeys.delete(e.key);
      }
    };

    this.container.addEventListener?.('keydown', keydownHandler as any);
    this.container.addEventListener?.('keyup', keyupHandler as any);

    const globalKeydown = (e: KeyboardEvent) => {
      if (!this.isCaptured) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }
      keydownHandler(e);
    };
    const globalKeyup = (e: KeyboardEvent) => {
      if (!this.isCaptured) return;
      keyupHandler(e);
    };
    if (typeof window !== 'undefined') {
      window.addEventListener?.('keydown', globalKeydown);
      window.addEventListener?.('keyup', globalKeyup);
    }

    // Mouse interaction: rotation driven from per-frame delta (velocity) without drift
    let mouseDownPos = { x: 0, y: 0 };
    const mousedownHandler = (e: MouseEvent) => {
      if (e.target !== this.canvas) return;
      focusHandler();
      this.isDragging = true;
      this.isPanning3D = e.button === 2;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
      mouseDownPos = { x: e.clientX, y: e.clientY };

      if (!this.isShiftHeld && this.viewMode === '3d' && e.button === 0) {
        try {
          this.canvas.requestPointerLock?.();
        } catch {}
      }
    };
    this.canvas.addEventListener?.('mousedown', mousedownHandler as any);

    const mousemoveHandler = (e: MouseEvent) => {
      // If not captured, hovering does nothing
      if (!this.isCaptured) {
        return;
      }

      // If Shift is held, camera is frozen (free cursor)
      if (this.isShiftHeld) {
        return;
      }

      // Discard first frame mouse delta after re-lock to prevent camera jump
      if (this.discardNextMouseDelta) {
        this.discardNextMouseDelta = false;
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        return;
      }

      if (!this.isDragging && !this.isPointerLocked) return;

      const dx = this.isPointerLocked && typeof e.movementX === 'number' && e.movementX !== 0 ? e.movementX : e.clientX - this.lastMouseX;
      const dy = this.isPointerLocked && typeof e.movementY === 'number' && e.movementY !== 0 ? e.movementY : e.clientY - this.lastMouseY;
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;

      if (this.viewMode === '3d') {
        if (this.isPanning3D) {
          this.pan3DX += dx;
          this.pan3DY += dy;
        } else {
          // Instant velocity-driven rotation without floating drift
          this.angleZ += dx * 0.005;
          this.angleX = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, this.angleX - dy * 0.005));
        }
      } else if (this.viewMode === '1d') {
        const spanX = this.bounds2D.maxX - this.bounds2D.minX;
        const width = this.canvas.clientWidth || 600;
        const worldDx = -(dx / width) * spanX;
        this.pan2D(worldDx, 0);
      } else {
        const spanX = this.bounds2D.maxX - this.bounds2D.minX;
        const spanY = this.bounds2D.maxY - this.bounds2D.minY;
        const width = this.canvas.clientWidth || 600;
        const height = this.canvas.clientHeight || 300;

        const worldDx = -(dx / width) * spanX;
        const worldDy = (dy / height) * spanY;
        this.pan2D(worldDx, worldDy);
      }

      this.notifyCameraChange();
      this.render();
    };
    if (typeof window !== 'undefined') window.addEventListener?.('mousemove', mousemoveHandler);

    const mouseupHandler = (e: MouseEvent) => {
      const dist = Math.hypot(e.clientX - mouseDownPos.x, e.clientY - mouseDownPos.y);
      this.isDragging = false;
      this.isPanning3D = false;

      // Click (not drag) -> select point without moving camera and without auto-opening inspector
      if (dist < 6 && (e.target === this.canvas || this.container.contains(e.target as Node))) {
        const rect = this.canvas.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        const width = this.canvas.clientWidth || rect.width || 600;
        const height = this.canvas.clientHeight || rect.height || 300;

        let res: SpatialInspectionResult;
        if (this.viewMode === '1d') {
          res = SpatialInspector.inspect1D(this.space, this.bounds2D, clickX, width);
        } else if (this.viewMode === '3d') {
          res = SpatialInspector.inspect3D(this.space, this.bounds3D, clickX, clickY, width, height, {
            angleX: this.angleX,
            angleZ: this.angleZ,
            zoom3D: this.zoom3D,
            pan3DX: this.pan3DX,
            pan3DY: this.pan3DY,
          });
        } else {
          res = SpatialInspector.inspect2D(this.space, this.bounds2D, clickX, clickY, width, height);
        }

        if (res.isExactGeometryHit) {
          this.inspectionResult = res;
          this.reticlePos = { ...res.worldCoord };
          this.showReticle = true;

          // If inspector is already open by user, update it live; otherwise do NOT auto-open
          if (this.inspectorPanelEl) {
            this.showInspection(res);
          } else {
            this.render();
          }
        } else {
          this.showReticle = false;
          this.inspectionResult = null;
          if (this.inspectorPanelEl) {
            this.closeInspection();
          } else {
            this.render();
          }
        }
      }
    };
    if (typeof window !== 'undefined') window.addEventListener?.('mouseup', mouseupHandler);

    // Mouse wheel zoom for 1D, 2D, 3D
    const wheelHandler = (e: WheelEvent) => {
      // Viewport Capture Rule:
      // A space is inert until clicked. Hovering does nothing — the page scrolls past normally.
      // - If not captured:
      //   - hover without Shift: do nothing, let event bubble so stream / page scrolls.
      //   - hover + Shift + wheel: zooms that space, page does NOT scroll ("A quick look without committing").
      // - If captured:
      //   - wheel zooms that space, page does NOT scroll.
      const isShift = e.shiftKey || this.isShiftHeld;
      if (!this.isCaptured && !isShift) {
        return;
      }

      e.preventDefault?.();
      e.stopPropagation?.();
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      if (this.viewMode === '3d') {
        this.zoom3D = Math.max(0.2, Math.min(5.0, this.zoom3D * (e.deltaY > 0 ? 0.9 : 1.1)));
      } else {
        this.zoom2D(factor);
      }
      this.notifyCameraChange();
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
      this.stopAnimationLoop();
      this.container.removeEventListener?.('click', focusHandler);
      this.canvas.removeEventListener?.('click', focusHandler);
      this.container.removeEventListener?.('blur', blurHandler);
      if (typeof document !== 'undefined') {
        document.removeEventListener?.('pointerlockchange', pointerLockChangeHandler);
      }
      this.container.removeEventListener?.('keydown', keydownHandler as any);
      this.container.removeEventListener?.('keyup', keyupHandler as any);
      this.canvas.removeEventListener?.('mousedown', mousedownHandler as any);
      if (typeof window !== 'undefined') {
        window.removeEventListener?.('mousemove', mousemoveHandler);
        window.removeEventListener?.('mouseup', mouseupHandler);
      }
      this.canvas.removeEventListener?.('wheel', wheelHandler as any);
      this.canvas.removeEventListener?.('dblclick', dblclickHandler);
    });
  }

  public notifyCameraChange(): void {
    if (this.options.onCameraChange) {
      this.options.onCameraChange(this.getCameraState());
    }
  }

  public project3D(x: number, y: number, z: number, width: number, height: number): { x: number; y: number; depth: number } {
    const cx = width * 0.5 + this.pan3DX;
    const cy = height * 0.5 + this.pan3DY;
    const scale = (Math.min(width, height) / 3.8) * this.zoom3D;
    const cosX = Math.cos(this.angleX);
    const sinX = Math.sin(this.angleX);
    const cosZ = Math.cos(this.angleZ);
    const sinZ = Math.sin(this.angleZ);

    const x1 = x * cosZ - y * sinZ;
    const y1 = x * sinZ + y * cosZ;
    const z1 = z;

    const x2 = x1;
    const y2 = y1 * cosX - z1 * sinX;
    const z2 = y1 * sinX + z1 * cosX;

    const screenX = cx + x2 * scale;
    const screenY = cy - z2 * scale;
    return { x: screenX, y: screenY, depth: y2 };
  }

  public toggleInspector(): void {
    if (this.inspectorPanelEl) {
      this.closeInspection();
    } else if (this.inspectionResult) {
      this.showInspection(this.inspectionResult);
    } else if (this.reticlePos) {
      this.inspectAtCoordinate(this.reticlePos.x, this.reticlePos.y, this.reticlePos.z);
    } else {
      const midX = (this.bounds2D.minX + this.bounds2D.maxX) * 0.5;
      const midY = (this.bounds2D.minY + this.bounds2D.maxY) * 0.5;
      this.inspectAtCoordinate(midX, midY, 0);
    }
  }

  public showInspection(result: SpatialInspectionResult): void {
    this.inspectionResult = result;
    this.reticlePos = { ...result.worldCoord };
    this.showReticle = true;

    if (this.inspectorPanelEl) {
      this.inspectorPanelEl.remove();
      this.inspectorPanelEl = null;
    }

    this.inspectorPanelEl = SpatialInspector.renderInspectionPanel(result, {
      onJumpToSource: (lineIdx) => {
        this.options.onJumpToSource?.(lineIdx);
      },
      onClose: () => {
        this.closeInspection();
      },
    });

    this.container.appendChild(this.inspectorPanelEl);
    this.render();
  }

  public closeInspection(): void {
    if (this.inspectorPanelEl) {
      this.inspectorPanelEl.remove();
      this.inspectorPanelEl = null;
    }
    this.container.focus?.();
    this.render();
  }

  public getIsCaptured(): boolean {
    return this.isCaptured;
  }

  public capture(): void {
    this.isCaptured = true;
    this.isFocused = true;
    this.container.focus?.();
    this.container.classList?.add('focused', 'captured');
    const hudEl = this.container.querySelector('.space-flight-hud') as HTMLElement;
    this.updateHUD(hudEl);
    hudEl?.classList.remove('hidden');
    if (this.options.onFocusChange) this.options.onFocusChange(true);
  }

  public releaseCapture(): void {
    this.isCaptured = false;
    this.isFocused = false;
    this.isShiftHeld = false;
    this.isCameraFrozen = false;
    this.canvas.classList?.remove('shift-cursor');
    if (typeof document !== 'undefined' && document.pointerLockElement === this.canvas) {
      document.exitPointerLock?.();
    }
    this.container.classList?.remove('focused', 'captured');
    this.pressedKeys.clear();
    this.stopAnimationLoop();
    const hudEl = this.container.querySelector('.space-flight-hud') as HTMLElement;
    hudEl?.classList.add('hidden');
    this.container.blur?.();
    if (this.options.onFocusChange) this.options.onFocusChange(false);
    this.render();
  }

  public inspectAtCoordinate(x: number, y?: number, z?: number): void {
    const rect = this.canvas?.getBoundingClientRect?.() || { width: 600, height: 300 };
    const width = Math.floor(rect.width) || this.canvas.clientWidth || 600;
    const height = Math.floor(rect.height) || this.canvas.clientHeight || 300;

    let result: SpatialInspectionResult;
    if (this.viewMode === '1d') {
      const minX = this.bounds2D.minX;
      const maxX = this.bounds2D.maxX;
      const clickPx = 30 + ((x - minX) / (maxX - minX)) * (width - 60);
      result = SpatialInspector.inspect1D(this.space, this.bounds2D, clickPx, width);
    } else if (this.viewMode === '3d') {
      const pt2D = this.project3D(x, y ?? 0, z ?? 0, width, height);
      result = SpatialInspector.inspect3D(this.space, this.bounds3D, pt2D.x, pt2D.y, width, height, {
        angleX: this.angleX,
        angleZ: this.angleZ,
        zoom3D: this.zoom3D,
        pan3DX: this.pan3DX,
        pan3DY: this.pan3DY,
      });
    } else {
      const minX = this.bounds2D.minX;
      const maxX = this.bounds2D.maxX;
      const minY = this.bounds2D.minY;
      const maxY = this.bounds2D.maxY;
      const sx = ((x - minX) / (maxX - minX)) * width;
      const sy = height - (((y ?? 0) - minY) / (maxY - minY)) * height;
      result = SpatialInspector.inspect2D(this.space, this.bounds2D, sx, sy, width, height);
    }

    this.showInspection(result);
  }

  public getInspectionResult(): SpatialInspectionResult | null {
    return this.inspectionResult;
  }

  public getReticlePos(): { x: number; y?: number; z?: number } | null {
    return this.reticlePos;
  }

  public getCameraState(): CameraState {
    return {
      viewMode: this.viewMode,
      displayAxes: [this.displayAxes[0], this.displayAxes[1]],
      fixedCoords: { ...this.fixedCoords },
      bounds2D: { ...this.bounds2D },
      bounds3D: { ...this.bounds3D },
      angleX: this.angleX,
      angleZ: this.angleZ,
      zoom3D: this.zoom3D,
      pan3DX: this.pan3DX,
      pan3DY: this.pan3DY,
    };
  }

  public setCameraState(state: Partial<CameraState>): void {
    if (state.viewMode) this.viewMode = state.viewMode;
    if (state.displayAxes && state.displayAxes.length === 2) this.displayAxes = [state.displayAxes[0], state.displayAxes[1]];
    if (state.fixedCoords) this.fixedCoords = { ...state.fixedCoords };
    if (state.bounds2D) this.bounds2D = { ...state.bounds2D };
    if (state.bounds3D) this.bounds3D = { ...state.bounds3D };
    if (typeof state.angleX === 'number') this.angleX = state.angleX;
    if (typeof state.angleZ === 'number') this.angleZ = state.angleZ;
    if (typeof state.zoom3D === 'number') this.zoom3D = state.zoom3D;
    if (typeof state.pan3DX === 'number') this.pan3DX = state.pan3DX;
    if (typeof state.pan3DY === 'number') this.pan3DY = state.pan3DY;
    this.updateSlidersUI();
    this.render();
  }

  public ensureEntityCompiled(ent: SpatialEntity): boolean {
    if (typeof ent.compiledFn === 'function') return true;
    if (ent.compiledCode) {
      try {
        ent.compiledFn = rehydrateCompiledFunction(ent.coordinates, ent.compiledCode);
        return true;
      } catch {
        // Fallback to AST compile
      }
    }
    if (ent.ast) {
      try {
        const comp = compileAST(ent.ast, ent.coordinates);
        if (comp.success && typeof comp.fn === 'function') {
          ent.compiledFn = comp.fn;
          return true;
        }
      } catch {
        // Ignore compilation errors
      }
    }
    return false;
  }

  public updateSpace(newSpace: SpaceValue): void {
    this.space = newSpace;
    if (this.space.primitives && this.space.primitives.length > 0) {
      this.updateBoundsFromPrimitives();
    }
    for (const ent of this.space.entities) {
      this.ensureEntityCompiled(ent);
    }
    this.updateSlidersUI();
    this.render();
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

  private getThemeColors() {
    if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
      return {
        bg: '#181716',
        axis: '#8c867e',
        grid: '#2e2b28',
        text: '#a8a39d',
        textBright: '#f5f4f0',
      };
    }
    try {
      const target = this.container || (typeof document !== 'undefined' ? document.documentElement : null);
      if (!target) {
        return {
          bg: '#181716',
          axis: '#8c867e',
          grid: '#2e2b28',
          text: '#a8a39d',
          textBright: '#f5f4f0',
        };
      }
      const style = window.getComputedStyle(target);
      return {
        bg: style.getPropertyValue('--color-plot-bg')?.trim() || '#181716',
        axis: style.getPropertyValue('--color-plot-axis')?.trim() || '#8c867e',
        grid: style.getPropertyValue('--color-plot-grid')?.trim() || '#2e2b28',
        text: style.getPropertyValue('--color-plot-text')?.trim() || '#a8a39d',
        textBright: style.getPropertyValue('--color-text-primary')?.trim() || '#f5f4f0',
      };
    } catch {
      return {
        bg: '#181716',
        axis: '#8c867e',
        grid: '#2e2b28',
        text: '#a8a39d',
        textBright: '#f5f4f0',
      };
    }
  }

  public render(): void {
    if (!this.ctx || !this.canvas) return;

    const rect = this.canvas?.getBoundingClientRect?.() || { width: 600, height: 300 };
    const width = Math.floor(rect.width) || this.canvas.clientWidth || 600;
    const height = Math.floor(rect.height) || this.canvas.clientHeight || 300;
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);

    this.ctx.save();
    this.ctx.scale(dpr, dpr);

    const colors = this.getThemeColors();

    // Clear Background with theme token
    this.ctx.fillStyle = colors.bg;
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
    const colors = this.getThemeColors();
    const axisVar = this.space.coordinates[0] || 'x';
    const minX = this.bounds2D.minX;
    const maxX = this.bounds2D.maxX;
    const centerY = height * 0.5;

    // Draw main horizontal axis
    this.ctx.strokeStyle = colors.axis;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(30, centerY);
    this.ctx.lineTo(width - 30, centerY);
    this.ctx.stroke();

    // Axis label
    this.ctx.fillStyle = colors.text;
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
    for (let eIdx = 0; eIdx < this.space.entities.length; eIdx++) {
      const entity = this.space.entities[eIdx];
      if (!this.ensureEntityCompiled(entity)) continue;
      const color = entity.color || ENTITY_PALETTE[eIdx % ENTITY_PALETTE.length];

      let roots: number[] = entity.cachedRoots1D || [];
      if (!entity.cachedRoots1D) {
        const N = 400;
        const stepSample = (maxX - minX) / N;
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
        entity.cachedRoots1D = roots;
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

        this.ctx.fillStyle = colors.textBright;
        this.ctx.font = 'bold 11px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`${axisVar} = ${rx.toFixed(2)}`, px, centerY - 16);
      }
    }

    // Draw inspection reticle
    if (this.showReticle && this.reticlePos) {
      const rx = this.reticlePos.x;
      const px = 30 + ((rx - minX) / (maxX - minX)) * (width - 60);
      this.ctx.strokeStyle = '#f59e0b';
      this.ctx.setLineDash([4, 4]);
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.moveTo(px, 10);
      this.ctx.lineTo(px, height - 10);
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      this.ctx.fillStyle = '#f59e0b';
      this.ctx.beginPath();
      this.ctx.arc(px, centerY, 5, 0, 2 * Math.PI);
      this.ctx.fill();
    }
  }

  private render2D(width: number, height: number): void {
    const colors = this.getThemeColors();
    const minX = this.bounds2D.minX;
    const maxX = this.bounds2D.maxX;
    const minY = this.bounds2D.minY;
    const maxY = this.bounds2D.maxY;

    const mapX = (x: number) => ((x - minX) / (maxX - minX)) * width;
    const mapY = (y: number) => height - ((y - minY) / (maxY - minY)) * height;

    // Draw Grid Lines
    this.ctx.strokeStyle = colors.grid;
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
    this.ctx.strokeStyle = colors.axis;
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
    this.ctx.fillStyle = colors.text;
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
    this.ctx.fillStyle = colors.textBright;
    this.ctx.font = 'bold 12px var(--font-math, sans-serif)';
    this.ctx.textAlign = 'right';
    this.ctx.fillText(this.displayAxes[0], width - 10, axisYPos - 12);
    this.ctx.textAlign = 'left';
    this.ctx.fillText(this.displayAxes[1], axisXPos + 8, 14);

    // Render Contours from pre-sampled space geometry
    const resolution = 160;

    for (let eIdx = 0; eIdx < this.space.entities.length; eIdx++) {
      const entity = this.space.entities[eIdx];
      if (!this.ensureEntityCompiled(entity)) continue;
      const color = entity.color || ENTITY_PALETTE[eIdx % ENTITY_PALETTE.length];

      let contourResult: Contour2DResult = entity.cachedContours;
      if (!contourResult) {
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
          const var0 = entity.coordinates[0];
          const isAxisX = var0 === this.displayAxes[0];
          const sliceFn = isAxisX
            ? (x: number, _y: number) => entity.compiledFn(x)
            : (_x: number, y: number) => entity.compiledFn(y);
          contourResult = sample2D(sliceFn, [minX, maxX], [minY, maxY], resolution);
        } else {
          const ext = this.space.extent2D || this.bounds2D;
          contourResult = sample2D(entity.compiledFn, [ext.minX, ext.maxX], [ext.minY, ext.maxY], 200);
        }
        entity.cachedContours = contourResult;
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

    // Draw Primitives (Points, Circles, Arrows, Segments, Polygons, Paths, Labels)
    if (this.space.primitives && this.space.primitives.length > 0) {
      for (let pIdx = 0; pIdx < this.space.primitives.length; pIdx++) {
        const prim = this.space.primitives[pIdx];
        const primColor = prim.params?.color || ENTITY_PALETTE[pIdx % ENTITY_PALETTE.length];
        this.renderPrimitive2D(prim, primColor, mapX, mapY, colors);
      }
    }

    // Draw inspection reticle in 2D
    if (this.showReticle && this.reticlePos) {
      const rx = this.reticlePos.x;
      const ry = this.reticlePos.y ?? 0;
      const px = mapX(rx);
      const py = mapY(ry);

      this.ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
      this.ctx.setLineDash([4, 4]);
      this.ctx.lineWidth = 1;

      // Crosshair lines
      this.ctx.beginPath();
      this.ctx.moveTo(px, 0);
      this.ctx.lineTo(px, height);
      this.ctx.moveTo(0, py);
      this.ctx.lineTo(width, py);
      this.ctx.stroke();
      this.ctx.setLineDash([]);

      // Target circle
      this.ctx.strokeStyle = '#f59e0b';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(px, py, 7, 0, 2 * Math.PI);
      this.ctx.stroke();

      // Center dot
      this.ctx.fillStyle = '#f59e0b';
      this.ctx.beginPath();
      this.ctx.arc(px, py, 2.5, 0, 2 * Math.PI);
      this.ctx.fill();

      // Coordinate tag
      this.ctx.fillStyle = 'rgba(24, 23, 22, 0.85)';
      this.ctx.fillRect(px + 10, py - 22, 110, 18);
      this.ctx.strokeStyle = '#3d3936';
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(px + 10, py - 22, 110, 18);

      this.ctx.fillStyle = '#f5f4f0';
      this.ctx.font = '11px var(--font-family-doc, monospace)';
      this.ctx.textAlign = 'left';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(`(${rx.toFixed(2)}, ${ry.toFixed(2)})`, px + 14, py - 13);
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

    // Sample/Render 3D Marching Cubes Mesh
    const resolution3D = 36;

    for (let eIdx = 0; eIdx < this.space.entities.length; eIdx++) {
      const entity = this.space.entities[eIdx];
      if (!this.ensureEntityCompiled(entity)) continue;
      const mesh: TriangleMesh3D = entity.cachedMesh || sample3D(
        entity.compiledFn,
        [minX, maxX],
        [minY, maxY],
        [minZ, maxZ],
        resolution3D
      );
      entity.cachedMesh = mesh;

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

    // Draw inspection reticle in 3D
    if (this.showReticle && this.reticlePos) {
      const rx = this.reticlePos.x;
      const ry = this.reticlePos.y ?? 0;
      const rz = this.reticlePos.z ?? 0;
      const pt2D = this.project3D(rx, ry, rz, width, height);
      if (pt2D) {
        this.ctx.strokeStyle = '#f59e0b';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(pt2D.x, pt2D.y, 8, 0, 2 * Math.PI);
        this.ctx.stroke();

        this.ctx.fillStyle = '#f59e0b';
        this.ctx.beginPath();
        this.ctx.arc(pt2D.x, pt2D.y, 3, 0, 2 * Math.PI);
        this.ctx.fill();

        // Coordinate tag
        this.ctx.fillStyle = 'rgba(24, 23, 22, 0.85)';
        this.ctx.fillRect(pt2D.x + 12, pt2D.y - 22, 140, 18);
        this.ctx.strokeStyle = '#3d3936';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(pt2D.x + 12, pt2D.y - 22, 140, 18);

        this.ctx.fillStyle = '#f5f4f0';
        this.ctx.font = '11px var(--font-family-doc, monospace)';
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(`(${rx.toFixed(2)}, ${ry.toFixed(2)}, ${rz.toFixed(2)})`, pt2D.x + 16, pt2D.y - 13);
      }
    }
  }

  private updateBoundsFromPrimitives(): void {
    if (!this.space.primitives || this.space.primitives.length === 0) return;
    if (this.space.entities.length > 0 && this.space.coordinateBounds) return;

    const allX: number[] = [];
    const allY: number[] = [];
    for (const prim of this.space.primitives) {
      if (prim.primitive === 'point' && Array.isArray(prim.params?.position)) {
        allX.push(prim.params.position[0]);
        allY.push(prim.params.position[1]);
      } else if (prim.primitive === 'circle' && Array.isArray(prim.params?.center)) {
        const r = Number(prim.params.radius) || 1;
        allX.push(prim.params.center[0] - r, prim.params.center[0] + r);
        allY.push(prim.params.center[1] - r, prim.params.center[1] + r);
      } else if (prim.primitive === 'arrow' || prim.primitive === 'segment') {
        if (Array.isArray(prim.params?.start)) {
          allX.push(prim.params.start[0]);
          allY.push(prim.params.start[1]);
        }
        if (Array.isArray(prim.params?.end)) {
          allX.push(prim.params.end[0]);
          allY.push(prim.params.end[1]);
        }
        if (Array.isArray(prim.params?.vector) && Array.isArray(prim.params?.start)) {
          allX.push(prim.params.start[0] + prim.params.vector[0]);
          allY.push(prim.params.start[1] + prim.params.vector[1]);
        }
      } else if ((prim.primitive === 'polygon' || prim.primitive === 'path') && Array.isArray(prim.params?.points)) {
        for (const pt of prim.params.points) {
          if (Array.isArray(pt)) {
            allX.push(pt[0]);
            allY.push(pt[1]);
          }
        }
      } else if (prim.primitive === 'label' && Array.isArray(prim.params?.position)) {
        allX.push(prim.params.position[0]);
        allY.push(prim.params.position[1]);
      }
    }

    if (allX.length > 0 && allY.length > 0) {
      const minX = Math.min(...allX);
      const maxX = Math.max(...allX);
      const minY = Math.min(...allY);
      const maxY = Math.max(...allY);
      const spanX = Math.max(0.1, maxX - minX);
      const spanY = Math.max(0.1, maxY - minY);
      const padX = Math.max(1, spanX * 0.25);
      const padY = Math.max(1, spanY * 0.25);
      this.bounds2D.minX = minX - padX;
      this.bounds2D.maxX = maxX + padX;
      this.bounds2D.minY = minY - padY;
      this.bounds2D.maxY = maxY + padY;
      this.defaultBounds2D = { ...this.bounds2D };
    }
  }

  private toScalar(v: any): number | null {
    if (v === undefined || v === null) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (v.type === 'float') return v.value;
    if (v.type === 'rational') return Number(v.n) / Number(v.d);
    if (v.type === 'quantity') return this.toScalar(v.magnitude);
    return null;
  }

  private toCoord(v: any): [number, number] | null {
    if (v === undefined || v === null) return null;
    if (Array.isArray(v)) {
      const x = this.toScalar(v[0]);
      const y = this.toScalar(v[1]);
      return (x !== null && y !== null) ? [x, y] : null;
    }
    if (v.type === 'tuple' || v.type === 'list') {
      if (v.elements.length >= 2) {
        const x = this.toScalar(v.elements[0]);
        const y = this.toScalar(v.elements[1]);
        return (x !== null && y !== null) ? [x, y] : null;
      }
    }
    if (v.type === 'record' && v.fields) {
      const xVal = v.fields.x || v.fields[':x'] || v.fields.re || v.fields[':re'] || v.fields.pos || v.fields[':pos'];
      const yVal = v.fields.y || v.fields[':y'] || v.fields.im || v.fields[':im'] || v.fields.vel || v.fields[':vel'];
      if (xVal && yVal) {
        const x = this.toScalar(xVal);
        const y = this.toScalar(yVal);
        if (x !== null && y !== null) return [x, y];
      }
    }
    return null;
  }

  private renderPrimitive2D(
    prim: DrawingPrimitiveValue,
    color: string,
    mapX: (x: number) => number,
    mapY: (y: number) => number,
    colors: any
  ): void {
    switch (prim.primitive) {
      case 'point': {
        const pos = this.toCoord(prim.params?.position || prim.params?.pos || prim.params?.center);
        if (pos) {
          const px = mapX(pos[0]);
          const py = mapY(pos[1]);
          const r = this.toScalar(prim.params?.radius || prim.params?.r) || 5;

          // Glow / stroke ring
          this.ctx.fillStyle = color;
          this.ctx.beginPath();
          this.ctx.arc(px, py, r, 0, 2 * Math.PI);
          this.ctx.fill();

          this.ctx.strokeStyle = colors.bg;
          this.ctx.lineWidth = 1.5;
          this.ctx.stroke();

          // Coordinate readout above point
          this.ctx.fillStyle = colors.text;
          this.ctx.font = '10px monospace';
          this.ctx.textAlign = 'center';
          this.ctx.fillText(`(${pos[0].toFixed(1)}, ${pos[1].toFixed(1)})`, px, py - r - 4);
        }
        break;
      }
      case 'circle': {
        const center = this.toCoord(prim.params?.center || prim.params?.pos || prim.params?.position);
        const radius = this.toScalar(prim.params?.radius || prim.params?.r) || 1;
        if (center) {
          const px = mapX(center[0]);
          const py = mapY(center[1]);
          const rPx = Math.abs(mapX(center[0] + radius) - mapX(center[0]));

          this.ctx.strokeStyle = color;
          this.ctx.lineWidth = 2;
          this.ctx.beginPath();
          this.ctx.arc(px, py, Math.abs(rPx), 0, 2 * Math.PI);
          this.ctx.stroke();

          // Subtle transparent fill
          this.ctx.fillStyle = color + '18';
          this.ctx.fill();
        }
        break;
      }
      case 'arrow': {
        const start = this.toCoord(prim.params?.start || prim.params?.from || prim.params?.pos || prim.params?.position) || [0, 0];
        let end = this.toCoord(prim.params?.end || prim.params?.to);
        if (!end) {
          const vec = this.toCoord(prim.params?.vector || prim.params?.vel || prim.params?.velocity || prim.params?.direction);
          if (vec) {
            end = [start[0] + vec[0], start[1] + vec[1]];
          }
        }
        if (start && end) {
          const x0 = mapX(start[0]);
          const y0 = mapY(start[1]);
          const x1 = mapX(end[0]);
          const y1 = mapY(end[1]);

          this.ctx.strokeStyle = color;
          this.ctx.fillStyle = color;
          this.ctx.lineWidth = 2.2;
          this.ctx.beginPath();
          this.ctx.moveTo(x0, y0);
          this.ctx.lineTo(x1, y1);
          this.ctx.stroke();

          // Arrowhead
          const angle = Math.atan2(y1 - y0, x1 - x0);
          const headLen = 9;
          this.ctx.beginPath();
          this.ctx.moveTo(x1, y1);
          this.ctx.lineTo(x1 - headLen * Math.cos(angle - Math.PI / 6), y1 - headLen * Math.sin(angle - Math.PI / 6));
          this.ctx.lineTo(x1 - headLen * Math.cos(angle + Math.PI / 6), y1 - headLen * Math.sin(angle + Math.PI / 6));
          this.ctx.closePath();
          this.ctx.fill();
        }
        break;
      }
      case 'segment': {
        const start = this.toCoord(prim.params?.start || prim.params?.from);
        const end = this.toCoord(prim.params?.end || prim.params?.to);
        if (start && end) {
          this.ctx.strokeStyle = color;
          this.ctx.lineWidth = 2;
          this.ctx.beginPath();
          this.ctx.moveTo(mapX(start[0]), mapY(start[1]));
          this.ctx.lineTo(mapX(end[0]), mapY(end[1]));
          this.ctx.stroke();
        }
        break;
      }
      case 'polygon': {
        const rawPts = prim.params?.points;
        if (Array.isArray(rawPts) && rawPts.length >= 3) {
          const pts = rawPts.map(p => this.toCoord(p)).filter((p): p is [number, number] => p !== null);
          if (pts.length >= 3) {
            this.ctx.strokeStyle = color;
            this.ctx.fillStyle = color + '22';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(mapX(pts[0][0]), mapY(pts[0][1]));
            for (let i = 1; i < pts.length; i++) {
              this.ctx.lineTo(mapX(pts[i][0]), mapY(pts[i][1]));
            }
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
          }
        }
        break;
      }
      case 'path': {
        const rawPts = prim.params?.points;
        if (Array.isArray(rawPts) && rawPts.length >= 2) {
          const pts = rawPts.map(p => this.toCoord(p)).filter((p): p is [number, number] => p !== null);
          if (pts.length >= 2) {
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(mapX(pts[0][0]), mapY(pts[0][1]));
            for (let i = 1; i < pts.length; i++) {
              this.ctx.lineTo(mapX(pts[i][0]), mapY(pts[i][1]));
            }
            this.ctx.stroke();
          }
        }
        break;
      }
      case 'label': {
        const pos = this.toCoord(prim.params?.position || prim.params?.pos);
        const text = prim.params?.text || '';
        if (pos) {
          this.ctx.fillStyle = color;
          this.ctx.font = 'bold 12px sans-serif';
          this.ctx.textAlign = 'center';
          this.ctx.fillText(text, mapX(pos[0]), mapY(pos[1]) - 8);
        }
        break;
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
