import { describe, it, expect } from 'vitest';
import { evaluate, createInitialEnvironment } from '../core/evaluator';
import { SpaceValue } from '../core/types';
import { sampleSlice } from '../core/sampler';
import { SpaceViewport } from '../plot/space_viewport';

describe('Rewrite Phase 3: Spaces', () => {
  const env = createInitialEnvironment();

  describe('The 8 Phase 3 Dimensionality Test Cases', () => {
    // 1. x = 0 (1 free variable, evaluated in 2D Cartesian plane)
    it('1. x = 0 creates 1D space with coordinates ["x"]', () => {
      const { value } = evaluate('x = 0', env);
      expect(value.type).toBe('space');
      const space = value as SpaceValue;
      expect(space.dimension).toBe(1);
      expect(space.coordinates).toEqual(['x']);
      expect(space.entities.length).toBe(1);
    });

    // 2. y = x^2 (2D parabola)
    it('2. y = x^2 creates 2D space with coordinates ["x", "y"]', () => {
      const { value } = evaluate('y = x^2', env);
      expect(value.type).toBe('space');
      const space = value as SpaceValue;
      expect(space.dimension).toBe(2);
      expect(space.coordinates).toEqual(['x', 'y']);
      expect(space.entities.length).toBe(1);
    });

    // 3. x^2 + y^2 = 4 (2D circle)
    it('3. x^2 + y^2 = 4 creates 2D space with coordinates ["x", "y"]', () => {
      const { value } = evaluate('x^2 + y^2 = 4', env);
      expect(value.type).toBe('space');
      const space = value as SpaceValue;
      expect(space.dimension).toBe(2);
      expect(space.coordinates).toEqual(['x', 'y']);
      expect(space.entities.length).toBe(1);
    });

    // 4. x^2 + y^2 + z^2 = 4 (3D sphere)
    it('4. x^2 + y^2 + z^2 = 4 creates 3D space with coordinates ["x", "y", "z"]', () => {
      const { value } = evaluate('x^2 + y^2 + z^2 = 4', env);
      expect(value.type).toBe('space');
      const space = value as SpaceValue;
      expect(space.dimension).toBe(3);
      expect(space.coordinates).toEqual(['x', 'y', 'z']);
      expect(space.entities.length).toBe(1);
    });

    // 5. y = sin(x) (2D sine wave)
    it('5. y = sin(x) creates 2D space with coordinates ["x", "y"]', () => {
      const { value } = evaluate('y = sin(x)', env);
      expect(value.type).toBe('space');
      const space = value as SpaceValue;
      expect(space.dimension).toBe(2);
      expect(space.coordinates).toEqual(['x', 'y']);
      expect(space.entities.length).toBe(1);
    });

    // 6. { y = x^2 \n v = u^2 } (4 variables, 2D slice with 2 sliders)
    it('6. { y = x^2 ; v = u^2 } creates 4D space with coordinates ["u", "v", "x", "y"]', () => {
      const code = `
        {
          y = x^2
          v = u^2
        }
      `;
      const { value } = evaluate(code, env);
      expect(value.type).toBe('space');
      const space = value as SpaceValue;
      expect(space.dimension).toBe(4);
      expect(space.coordinates).toEqual(['u', 'v', 'x', 'y']);
      expect(space.entities.length).toBe(2);
    });

    // 7. { x = 0 \n { y = x^2 } } (nested spaces)
    it('7. { x = 0 ; { y = x^2 } } creates nested spaces with lexical scope & spatial containment', () => {
      const code = `
        {
          x = 0
          {
            y = x^2
          }
        }
      `;
      const { value } = evaluate(code, env);
      expect(value.type).toBe('space');
      const space = value as SpaceValue;
      expect(space.dimension).toBe(2);
      expect(space.entities.length).toBe(1);
      expect(space.nestedSpaces).toBeDefined();
      expect(space.nestedSpaces!.length).toBe(1);
      expect(space.nestedSpaces![0].dimension).toBe(2);
      expect(space.nestedSpaces![0].entities.length).toBe(1);
    });

    // 8. sqrt(-1) < 3 (numeric/undefined result, no error, no canvas)
    it('8. sqrt(-1) < 3 evaluates cleanly to none with 0 dimensions and no canvas', () => {
      const { value } = evaluate('sqrt(-1) < 3', env);
      expect(value.type).toBe('none');
    });
  });

  describe('Slider Dragging Performance Gate (< 16.6ms)', () => {
    it('measures frame time when dragging sliders on a 4-variable relation', () => {
      const code = `
        {
          y = x^2
          v = u^2
        }
      `;
      const { value } = evaluate(code, env);
      const space = value as SpaceValue;

      const entity = space.entities[0];
      const displayAxes: [string, string] = ['x', 'y'];
      const fixedCoords = { u: 1.5, v: 2.25 };

      // Warmup JIT
      for (let f = 0; f < 5; f++) {
        sampleSlice(
          entity.compiledFn,
          space.coordinates,
          displayAxes,
          fixedCoords,
          [[-5, 5], [-5, 5]],
          160
        );
      }

      // Benchmark 50 live slider drag frames
      const frameTimes: number[] = [];
      for (let f = 0; f < 50; f++) {
        fixedCoords.u = -2.0 + (f / 50) * 4.0;
        fixedCoords.v = fixedCoords.u * fixedCoords.u;

        const start = performance.now();
        const res = sampleSlice(
          entity.compiledFn,
          space.coordinates,
          displayAxes,
          fixedCoords,
          [[-5, 5], [-5, 5]],
          160
        );
        const elapsed = performance.now() - start;
        frameTimes.push(elapsed);
        expect((res as any).polylines).toBeDefined();
      }

      const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      const maxFrameTime = Math.max(...frameTimes);

      console.log('\n--- SLIDER DRAG PERFORMANCE GATE RESULTS ---');
      console.log(`• 4-variable relation 2D slice average frame time: ${avgFrameTime.toFixed(3)} ms`);
      console.log(`• 4-variable relation 2D slice max frame time: ${maxFrameTime.toFixed(3)} ms`);
      console.log(`• Target: < 16.6 ms (60 FPS interactive slider scrubbing)`);

      expect(avgFrameTime).toBeLessThan(16.6);
      expect(maxFrameTime).toBeLessThan(16.6);
    });
  });

  describe('SpaceViewport Viewport Lifecycle and Controls', () => {
    class MockClassList {
      public classes = new Set<string>();
      add(...cls: string[]) { cls.forEach(c => c && this.classes.add(c)); }
      remove(...cls: string[]) { cls.forEach(c => this.classes.delete(c)); }
      contains(c: string) { return this.classes.has(c); }
    }

    class MockElement {
      public tagName: string;
      public className = '';
      public classList = new MockClassList();
      public style: Record<string, string> = {};
      public children: MockElement[] = [];
      public parentElement: MockElement | null = null;
      public listeners = new Map<string, Function[]>();
      public innerHTML = '';
      public textContent = '';
      public tabIndex = 0;
      public title = '';
      public onclick: any = null;
      public oninput: any = null;
      public onchange: any = null;
      public value = '';
      public type = '';
      public min = '';
      public max = '';
      public step = '';
      public selected = false;

      constructor(tagName: string) {
        this.tagName = tagName.toUpperCase();
      }

      appendChild(child: MockElement) {
        child.parentElement = this;
        this.children.push(child);
        return child;
      }

      removeChild(child: MockElement) {
        this.children = this.children.filter(c => c !== child);
        if (child.parentElement === this) child.parentElement = null;
        return child;
      }

      addEventListener(event: string, handler: Function) {
        if (!this.listeners.has(event)) this.listeners.set(event, []);
        this.listeners.get(event)!.push(handler);
      }

      removeEventListener(event: string, handler: Function) {
        if (!this.listeners.has(event)) return;
        const list = this.listeners.get(event)!.filter(h => h !== handler);
        this.listeners.set(event, list);
      }

      querySelector(selector: string): MockElement | null {
        const cls = selector.replace('.', '');
        const traverse = (node: MockElement): MockElement | null => {
          if (node.className.includes(cls) || node.classList.contains(cls)) return node;
          for (const child of node.children) {
            const found = traverse(child);
            if (found) return found;
          }
          return null;
        };
        return traverse(this);
      }

      getBoundingClientRect() {
        return { top: 0, bottom: 300, left: 0, right: 500, width: 500, height: 300, x: 0, y: 0 };
      }

      getContext() {
        return {
          save() {}, restore() {}, clearRect() {}, fillRect() {}, strokeRect() {},
          beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {},
          setLineDash() {}, fillText() {}, strokeText() {}, measureText() { return { width: 10 }; },
          scale() {}, translate() {}, rotate() {}, resetTransform() {},
        };
      }
    }

    it('mounts, navigates, pans, zooms, and disposes cleanly in DOM', () => {
      const origDoc = (globalThis as any).document;
      (globalThis as any).document = {
        createElement: (tag: string) => new MockElement(tag),
      };

      try {
        const container = (globalThis as any).document.createElement('div');
        const { value } = evaluate('x^2 + y^2 = 4', env);
        const space = value as SpaceValue;

        const viewport = new SpaceViewport(container as any, space, {
          width: 500,
          height: 300,
        });

        expect(container.querySelector('.space-viewport-canvas')).toBeTruthy();
        expect(container.querySelector('.space-dimension-badge')).toBeTruthy();

        // Pan & Zoom
        viewport.pan2D(1.0, -1.0);
        viewport.zoom2D(1.2);
        viewport.resetView();

        const svg = viewport.toSVG();
        expect(svg).toContain('<svg');
        expect(svg).toContain('2D Space');

        viewport.dispose();
        expect(container.innerHTML).toBe('');
      } finally {
        if (origDoc) {
          (globalThis as any).document = origDoc;
        } else {
          delete (globalThis as any).document;
        }
      }
    });
  });
});
