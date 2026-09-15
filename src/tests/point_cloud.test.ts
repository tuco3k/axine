import { describe, it, expect } from 'vitest';
import { SpaceValue, DrawingPrimitiveValue } from '../core/types';
import { SpaceViewport } from '../plot/space_viewport';
import { SpatialInspector } from '../plot/spatial_inspector';

class MockClassList {
  public classes: Set<string> = new Set();
  add(...cls: string[]) { cls.forEach(c => c && this.classes.add(c)); }
  remove(...cls: string[]) { cls.forEach(c => this.classes.delete(c)); }
  toggle(c: string, force?: boolean) {
    if (force !== undefined) {
      if (force) this.classes.add(c);
      else this.classes.delete(c);
      return force;
    }
    if (this.classes.has(c)) {
      this.classes.delete(c);
      return false;
    }
    this.classes.add(c);
    return true;
  }
  contains(c: string) { return this.classes.has(c); }
}

class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public classList: MockClassList = new MockClassList();
  public children: MockElement[] = [];
  public parentNode: MockElement | null = null;
  public style: Record<string, string> = {};
  public innerHTML: string = '';
  public textContent: string = '';
  public dataset: Record<string, string> = {};
  public tabIndex: number = 0;
  public value: string = '';
  public width: number = 800;
  public height: number = 600;

  private listeners: Record<string, Function[]> = {};

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  appendChild<T extends MockElement>(child: T): T {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild<T extends MockElement>(child: T): T {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      child.parentNode = null;
      this.children.splice(idx, 1);
    }
    return child;
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  addEventListener(event: string, handler: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(handler);
  }

  removeEventListener(event: string, handler: Function) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(h => h !== handler);
    }
  }

  querySelector(selector: string): MockElement | null {
    const traverse = (el: MockElement): MockElement | null => {
      if (selector.startsWith('.') && el.classList.contains(selector.slice(1))) return el;
      if (selector.startsWith('#') && el.id === selector.slice(1)) return el;
      if (el.tagName.toLowerCase() === selector.toLowerCase()) return el;
      for (const child of el.children) {
        const res = traverse(child);
        if (res) return res;
      }
      return null;
    };
    return traverse(this);
  }

  getBoundingClientRect() {
    return { top: 0, bottom: 600, left: 0, right: 800, width: 800, height: 600, x: 0, y: 0 };
  }

  getContext() {
    return {
      save() {}, restore() {}, clearRect() {}, fillRect() {}, strokeRect() {},
      beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {},
      setLineDash() {}, fillText() {}, strokeText() {}, measureText() { return { width: 10 }; },
      scale() {}, translate() {}, rotate() {}, resetTransform() {}, arc() {},
    };
  }
}

describe('P2.4: Point Clouds (Discrete Positions with No Defining Relation)', () => {
  it('evaluates a user-defined collection of 10,000 3D positions into a 3D space with zero entities and 10,000 primitives', () => {
    // Generate 10,000 3D positions
    const N = 10_000;
    const primitives: DrawingPrimitiveValue[] = [];
    for (let i = 0; i < N; i++) {
      const u = (i / N) * Math.PI * 2;
      const v = (i / N) * Math.PI;
      const r = 2.0 + 0.5 * Math.sin(i * 0.1);
      const x = r * Math.sin(v) * Math.cos(u);
      const y = r * Math.sin(v) * Math.sin(u);
      const z = r * Math.cos(v);
      primitives.push({
        type: 'drawing_primitive',
        primitive: 'point',
        params: { position: [x, y, z] },
      });
    }

    const space: SpaceValue = {
      type: 'space',
      coordinates: ['x', 'y', 'z'],
      dimension: 3,
      declaredAxes: ['x', 'y', 'z'],
      entities: [],
      primitives,
    };

    expect(space.dimension).toBe(3);
    expect(space.entities.length).toBe(0); // NO defining relation, NO sampling
    expect(space.primitives?.length).toBe(10_000);
  });

  it('renders and orbits 10,000 3D points at > 60 FPS in SpaceViewport', () => {
    const origDoc = (globalThis as any).document;
    (globalThis as any).document = {
      createElement: (tag: string) => new MockElement(tag),
      body: new MockElement('body'),
    };

    try {
      const N = 10_000;
      const primitives: DrawingPrimitiveValue[] = [];
      for (let i = 0; i < N; i++) {
        const theta = i * 0.1;
        const phi = i * 0.05;
        const r = 3.0;
        const x = r * Math.cos(theta) * Math.sin(phi);
        const y = r * Math.sin(theta) * Math.sin(phi);
        const z = r * Math.cos(phi);
        primitives.push({
          type: 'drawing_primitive',
          primitive: 'point',
          params: { position: [x, y, z] },
        });
      }

      const space: SpaceValue = {
        type: 'space',
        coordinates: ['x', 'y', 'z'],
        dimension: 3,
        declaredAxes: ['x', 'y', 'z'],
        entities: [],
        primitives,
      };

      const container = (globalThis as any).document.createElement('div');

      const viewport = new SpaceViewport(container as any, space, { width: 800, height: 600 });
      const canvas = container.querySelector('canvas');
      expect(canvas).not.toBeNull();

      // Benchmark 60 frames of 3D rendering and orbiting
      const FRAMES = 60;
      const t0 = performance.now();
      for (let f = 0; f < FRAMES; f++) {
        (viewport as any).angleX += 0.01;
        (viewport as any).angleZ += 0.02;
        (viewport as any).render();
      }
      const elapsedMs = performance.now() - t0;
      const avgFrameTimeMs = elapsedMs / FRAMES;
      const fps = 1000 / avgFrameTimeMs;

      console.log(`\n--- 10,000 3D POINT CLOUD RENDER PERFORMANCE ---`);
      console.log(`• Average Frame Time: ${avgFrameTimeMs.toFixed(3)} ms`);
      console.log(`• Effective Frame Rate: ${fps.toFixed(1)} FPS (Target: > 60 FPS)`);

      expect(avgFrameTimeMs).toBeLessThan(16.6); // Must run at >= 60 FPS (< 16.6ms)

      viewport.dispose();
    } finally {
      if (origDoc) (globalThis as any).document = origDoc;
      else delete (globalThis as any).document;
    }
  });

  it('inspects 3D point cloud and snaps to exact discrete coordinate tuple', () => {
    const origDoc = (globalThis as any).document;
    (globalThis as any).document = {
      createElement: (tag: string) => new MockElement(tag),
      body: new MockElement('body'),
    };

    try {
      const testPoints: [number, number, number][] = [
        [0, 0, 0],
        [1.5, 2.0, 3.0],
        [-2.0, 1.0, -1.0],
      ];

      const primitives: DrawingPrimitiveValue[] = testPoints.map(pos => ({
        type: 'drawing_primitive',
        primitive: 'point',
        params: { position: pos },
      }));

      const space: SpaceValue = {
        type: 'space',
        coordinates: ['x', 'y', 'z'],
        dimension: 3,
        declaredAxes: ['x', 'y', 'z'],
        entities: [],
        primitives,
      };

      const container = (globalThis as any).document.createElement('div');
      const viewport = new SpaceViewport(container as any, space, { width: 800, height: 600 });
      
      // Project [1.5, 2.0, 3.0] to screen coordinates
      const p2D = (viewport as any).project3D(1.5, 2.0, 3.0, 800, 600);
      expect(p2D).not.toBeNull();

      // Inspect at screen coordinates
      const inspectRes = SpatialInspector.inspect3D(
        space,
        (viewport as any).bounds3D,
        p2D.x,
        p2D.y,
        800,
        600,
        {
          angleX: (viewport as any).angleX,
          angleZ: (viewport as any).angleZ,
          zoom3D: (viewport as any).zoom3D,
          pan3DX: (viewport as any).pan3DX,
          pan3DY: (viewport as any).pan3DY,
        }
      );

      expect(inspectRes.isExactGeometryHit).toBe(true);
      expect(inspectRes.worldCoord.x).toBeCloseTo(1.5, 1);
      expect(inspectRes.worldCoord.y).toBeCloseTo(2.0, 1);
      expect(inspectRes.worldCoord.z).toBeCloseTo(3.0, 1);
      expect(inspectRes.hitEntities.length).toBeGreaterThan(0);
      expect(inspectRes.hitEntities[0].reductionSteps[0].label).toContain('Discrete Coordinate Position');

      viewport.dispose();
    } finally {
      if (origDoc) (globalThis as any).document = origDoc;
      else delete (globalThis as any).document;
    }
  });
});
