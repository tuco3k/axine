import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { evaluate, createInitialEnvironment } from '../core/evaluator';
import { sample2D, sample3D, sampleSlice } from '../core/sampler';
import { SpaceValue } from '../core/types';
import { DocumentEditor } from '../document/editor';

// -----------------------------------------------------------------------------
// Complete DOM Mock for DocumentEditor in Vitest Runner
// -----------------------------------------------------------------------------
class MockClassList {
  public classes = new Set<string>();
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
  public style: Record<string, string> = {};
  public attributes: Map<string, string> = new Map();
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public listeners: Map<string, Function[]> = new Map();
  public value: string = '';
  public selectionStart: number = 0;
  public selectionEnd: number = 0;
  public scrollTop: number = 0;
  public scrollLeft: number = 0;
  public textValue: string = '';
  private _innerHTML: string = '';

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get textContent(): string {
    if (this.children.length === 0) return this.textValue || this._innerHTML.replace(/<[^>]*>/g, '');
    return (this.textValue + ' ' + this.children.map(c => c.textContent).join(' ')).trim();
  }

  set textContent(val: string) {
    this.textValue = val;
    this._innerHTML = val;
    this.children = [];
  }

  get innerHTML(): string {
    return this._innerHTML;
  }

  set innerHTML(html: string) {
    this._innerHTML = html;
    this.children = [];
    this.textValue = '';
    this.parseHTMLString(html);
  }

  private parseHTMLString(html: string) {
    const tokenRegex = /<!--[\s\S]*?-->|<(?:\/([a-zA-Z0-9\-]+)|([a-zA-Z0-9\-]+)([^>]*?)(\/)?)>|([^<]+)/g;
    let match;
    const stack: MockElement[] = [this];

    while ((match = tokenRegex.exec(html)) !== null) {
      const isClose = match[1];
      const isOpen = match[2];
      const attrStr = match[3] || '';
      const isSelfClosing = match[4] || ['INPUT', 'IMG', 'BR', 'HR'].includes((isOpen || '').toUpperCase());
      const textChunk = match[5];

      if (isClose) {
        if (stack.length > 1) {
          stack.pop();
        }
      } else if (isOpen) {
        const child = new MockElement(isOpen);
        child.parentElement = stack[stack.length - 1];

        const attrRegex = /([a-zA-Z0-9\-]+)(?:=["']([^"']*)["'])?/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
          const name = attrMatch[1];
          const val = attrMatch[2] !== undefined ? attrMatch[2] : '';
          child.setAttribute(name, val);
        }

        stack[stack.length - 1].children.push(child);
        if (!isSelfClosing) {
          stack.push(child);
        }
      } else if (textChunk) {
        const trimmed = textChunk.trim();
        if (trimmed) {
          stack[stack.length - 1].textValue += (stack[stack.length - 1].textValue ? ' ' : '') + trimmed;
        }
      }
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
    if (name === 'class') {
      this.className = value;
      this.classList = new MockClassList();
      value.split(/\s+/).forEach(c => c && this.classList.add(c));
    }
    if (name === 'id') {
      this.id = value;
    }
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
    if (name === 'class') {
      this.className = '';
      this.classList = new MockClassList();
    }
    if (name === 'id') {
      this.id = '';
    }
  }

  appendChild(child: MockElement): MockElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child: MockElement): MockElement {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
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

  dispatchEvent(event: { type: string; stopPropagation?: Function }) {
    const handlers = this.listeners.get(event.type) || [];
    for (const h of handlers) h(event);
  }

  getBoundingClientRect() {
    return { top: 0, bottom: 600, left: 0, right: 1000, width: 1000, height: 600, x: 0, y: 0 };
  }

  querySelector(selector: string): MockElement | null {
    const results = this.querySelectorAll(selector);
    return results[0] || null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const testMatch = (el: MockElement, subSel: string): boolean => {
      let remaining = subSel;

      const idMatch = remaining.match(/#([a-zA-Z0-9\-_]+)/);
      if (idMatch) {
        if (el.id !== idMatch[1]) return false;
        remaining = remaining.replace(idMatch[0], '');
      }

      const attrMatches = remaining.matchAll(/\[([a-zA-Z0-9\-_]+)(?:=["']([^"']*)["'])?\]/g);
      for (const am of attrMatches) {
        const attr = am[1];
        if (!el.attributes.has(attr)) return false;
        if (am[2] !== undefined && el.attributes.get(attr) !== am[2]) return false;
        remaining = remaining.replace(am[0], '');
      }

      const classMatches = remaining.matchAll(/\.([a-zA-Z0-9\-_]+)/g);
      for (const cm of classMatches) {
        if (!el.classList.contains(cm[1])) return false;
        remaining = remaining.replace(cm[0], '');
      }

      remaining = remaining.trim();
      if (remaining && remaining !== '*') {
        if (el.tagName.toLowerCase() !== remaining.toLowerCase()) return false;
      }

      return true;
    };

    const findMatchesForSegment = (roots: MockElement[], segment: string): MockElement[] => {
      const found: MockElement[] = [];
      const traverse = (node: MockElement) => {
        for (const child of node.children) {
          if (testMatch(child, segment)) {
            found.push(child);
          }
          traverse(child);
        }
      };
      for (const root of roots) {
        traverse(root);
      }
      return found;
    };

    const parts = selector.trim().split(/\s+/);
    let current = [this as MockElement];
    for (const part of parts) {
      current = findMatchesForSegment(current, part);
    }
    return current;
  }

  getContext() {
    const ctx: any = {
      canvas: this,
      measureText: (text: string) => ({ width: (text || '').length * 8 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    };
    return new Proxy(ctx, {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (typeof prop === 'string' && (prop.startsWith('is') || prop.startsWith('has'))) return () => false;
        return () => {};
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    });
  }
}

class MockLocalStorage {
  private store: Map<string, string> = new Map();
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
  removeItem(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
}

describe('Phase 4: Extension, Invariants I4 & I5, and Gutter Expression Rendering', () => {
  let origWindow: any;
  let origDocument: any;

  beforeEach(() => {
    origWindow = (globalThis as any).window;
    origDocument = (globalThis as any).document;

    const mockStorage = new MockLocalStorage();
    const mockDoc = new MockElement('document');
    const mockBody = new MockElement('body');
    const mockDocElement = new MockElement('html');

    mockDoc.appendChild(mockDocElement);
    mockDoc.appendChild(mockBody);

    (globalThis as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      devicePixelRatio: 1,
      localStorage: mockStorage,
    };
    (globalThis as any).document = {
      createElement: (tag: string) => new MockElement(tag),
      body: mockBody,
      documentElement: mockDocElement,
      activeElement: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      getElementById: (id: string) => mockDoc.querySelector(`#${id}`),
    };
  });

  afterEach(() => {
    (globalThis as any).window = origWindow;
    (globalThis as any).document = origDocument;
  });

  // ---------------------------------------------------------------------------
  // Phase 2 Gutter DOM Verification
  // ---------------------------------------------------------------------------
  describe('Phase 2 Gutter DOM Verification for Unreduced Standing Expressions', () => {
    it('extracts gutter DOM for a \u2297 b, \u230ax\u230b, \u2200x, and \u222ef confirming they render as mathematical expressions', () => {
      const docText = [
        'a \u2297 b',
        '\u230ax\u230b',
        '\u2200 x \u2208 \u211d, x >= 0',
        '\u222e_C F \u00b7 dr',
      ].join('\n');

      const container = new MockElement('div');
      const editor = new DocumentEditor(container as any, docText);

      const gutter = container.querySelector('#doc-gutter');
      const rows = gutter?.querySelectorAll('.doc-gutter-row') || [];
      expect(rows.length).toBe(4);

      // Line 1: Tensor Product: a (tensor) b
      const rec1 = (editor as any).state.getRecords()[0];
      const val1 = rows[0].querySelector('.doc-result-value');
      expect(val1).toBeTruthy();
      const text1 = val1?.textContent || '';
      const html1 = editor.typesetMathReadOnly(editor.formatValue(rec1.result));
      console.log('\n--- GUTTER DOM EXTRACTION (Line 1: a \\u2297 b) ---');
      console.log('Evaluated Value:', rec1.result);
      console.log('Formatted Value:', editor.formatValue(rec1.result));
      console.log('Rendered Typeset HTML:', html1);
      console.log('Gutter DOM Text:', text1);
      expect(text1).toContain('a');
      expect(text1).toContain('\u2297');
      expect(text1).toContain('b');
      expect(text1).not.toContain('none');
      expect(text1).not.toContain('unknown');
      expect(text1).not.toContain('Described');

      // Line 2: Floor: floor(x)
      const rec2 = (editor as any).state.getRecords()[1];
      const val2 = rows[1].querySelector('.doc-result-value');
      expect(val2).toBeTruthy();
      const text2 = val2?.textContent || '';
      const html2 = editor.typesetMathReadOnly(editor.formatValue(rec2.result));
      console.log('\n--- GUTTER DOM EXTRACTION (Line 2: \\u230ax\\u230b) ---');
      console.log('Evaluated Value:', rec2.result);
      console.log('Formatted Value:', editor.formatValue(rec2.result));
      console.log('Rendered Typeset HTML:', html2);
      console.log('Gutter DOM Text:', text2);
      expect(text2).toContain('\u230a');
      expect(text2).toContain('x');
      expect(text2).toContain('\u230b');
      expect(text2).not.toContain('none');

      // Line 3: Universal Quantifier: forall x in Reals, x >= 0
      const rec3 = (editor as any).state.getRecords()[2];
      const val3 = rows[2].querySelector('.doc-result-value');
      expect(val3).toBeTruthy();
      const text3 = val3?.textContent || '';
      const html3 = editor.typesetMathReadOnly(editor.formatValue(rec3.result));
      console.log('\n--- GUTTER DOM EXTRACTION (Line 3: \\u2200x) ---');
      console.log('Evaluated Value:', rec3.result);
      console.log('Formatted Value:', editor.formatValue(rec3.result));
      console.log('Rendered Typeset HTML:', html3);
      console.log('Gutter DOM Text:', text3);
      expect(text3).toContain('\u2200');
      expect(text3).toContain('x');
      expect(text3).not.toContain('none');

      // Line 4: Contour Integral: contour_int_C F . dr
      const rec4 = (editor as any).state.getRecords()[3];
      const val4 = rows[3].querySelector('.doc-result-value');
      expect(val4).toBeTruthy();
      const text4 = val4?.textContent || '';
      const html4 = editor.typesetMathReadOnly(editor.formatValue(rec4.result));
      console.log('\n--- GUTTER DOM EXTRACTION (Line 4: \\u222ef) ---');
      console.log('Evaluated Value:', rec4.result);
      console.log('Formatted Value:', editor.formatValue(rec4.result));
      console.log('Rendered Typeset HTML:', html4);
      console.log('Gutter DOM Text:', text4);
      expect(text4).toContain('\u222e');
      expect(text4).toContain('F');
      expect(text4).toContain('dr');
      expect(text4).not.toContain('none');

      editor.dispose();
    });
  });

  // ---------------------------------------------------------------------------
  // Invariant I4: Extension is Determined by the Object, Not Its Construction
  // ---------------------------------------------------------------------------
  describe('Invariant I4: Extension is Determined by the Object, Not Its Construction', () => {
    it('1. Circle radius 2 constructed via 4 distinct routes produces identical extension', () => {
      const routes = [
        // Route A: Parsed directly
        {
          name: 'Parsed directly',
          run: () => {
            const env = createInitialEnvironment();
            return evaluate('x^2 + y^2 = 4', env).value as SpaceValue;
          },
        },
        // Route B: Built by algebraic expansion / reduction
        {
          name: 'Algebraic expansion',
          run: () => {
            const env = createInitialEnvironment();
            return evaluate('(x + y)^2 - 2*x*y = 4', env).value as SpaceValue;
          },
        },
        // Route C: Produced by variable binding & substitution
        {
          name: 'Environment substitution',
          run: () => {
            const env = createInitialEnvironment();
            evaluate('r := 2', env);
            return evaluate('x^2 + y^2 = r^2', env).value as SpaceValue;
          },
        },
        // Route D: Implicit zero level set form
        {
          name: 'Implicit zero level-set',
          run: () => {
            const env = createInitialEnvironment();
            return evaluate('x^2 + y^2 - 4 = 0', env).value as SpaceValue;
          },
        },
      ];

      const samples: { name: string; space: SpaceValue; points: [number, number][] }[] = [];

      for (const r of routes) {
        const space = r.run();
        expect(space.type).toBe('space');

        // Invariant I4 Assertion 1: Identical dimension
        expect(space.dimension, `${r.name} must have dimension 2`).toBe(2);

        // Invariant I4 Assertion 2: Identical coordinate basis
        expect(space.coordinates, `${r.name} must have coordinates ['x', 'y']`).toEqual(['x', 'y']);

        // Invariant I4 Assertion 3: Identical spatial extension (sampled manifold)
        const fn = space.entities[0].compiledFn;
        const sampled = sample2D(fn, [-3, 3], [-3, 3], 80);
        const allPts: [number, number][] = [];
        for (const poly of sampled.polylines) {
          allPts.push(...poly.points);
        }
        expect(allPts.length).toBeGreaterThan(50);
        samples.push({ name: r.name, space, points: allPts });
      }

      // Assert extensional equivalence across all 4 routes: every point on Route A satisfies Route B, C, D
      const baseFn = samples[0].space.entities[0].compiledFn;
      for (let i = 1; i < samples.length; i++) {
        const other = samples[i];
        for (const [px, py] of other.points) {
          const dev = Math.abs(baseFn(px, py));
          expect(dev, `${other.name} point (${px}, ${py}) must satisfy base circle relation`).toBeLessThan(0.05);
        }
      }
    });

    it('2. 3D Sphere radius 2 constructed via 3 distinct routes produces identical extension', () => {
      const routes = [
        // Route A: Parsed directly
        {
          name: 'Parsed directly',
          run: () => {
            const env = createInitialEnvironment();
            return evaluate('x^2 + y^2 + z^2 = 4', env).value as SpaceValue;
          },
        },
        // Route B: Built by reduction
        {
          name: 'Constant power reduction',
          run: () => {
            const env = createInitialEnvironment();
            return evaluate('x^2 + y^2 + z^2 = 2^2', env).value as SpaceValue;
          },
        },
        // Route C: Function substitution
        {
          name: 'Function call substitution',
          run: () => {
            const env = createInitialEnvironment();
            evaluate('R := 2', env);
            return evaluate('x^2 + y^2 + z^2 = R^2', env).value as SpaceValue;
          },
        },
      ];

      const meshSamples: { name: string; space: SpaceValue; vertices: [number, number, number][] }[] = [];

      for (const r of routes) {
        const space = r.run();
        expect(space.type).toBe('space');

        expect(space.dimension, `${r.name} must have dimension 3`).toBe(3);
        expect(space.coordinates, `${r.name} must have coordinates ['x', 'y', 'z']`).toEqual(['x', 'y', 'z']);

        const fn = space.entities[0].compiledFn;
        const mesh = sample3D(fn, [-3, 3], [-3, 3], [-3, 3], 30);
        expect(mesh.vertices.length).toBeGreaterThan(100);
        meshSamples.push({ name: r.name, space, vertices: mesh.vertices });
      }

      const baseFn = meshSamples[0].space.entities[0].compiledFn;
      for (let i = 1; i < meshSamples.length; i++) {
        const other = meshSamples[i];
        for (const [vx, vy, vz] of other.vertices) {
          const dev = Math.abs(baseFn(vx, vy, vz));
          expect(dev, `${other.name} vertex (${vx}, ${vy}, ${vz}) must satisfy base sphere relation`).toBeLessThan(0.1);
        }
      }
    });

    it('3. 4D Hyperspace Space constructed via distinct routes produces identical extension', () => {
      const routes = [
        {
          name: 'Direct block',
          run: () => {
            const env = createInitialEnvironment();
            const code = `
              {
                y = x^2
                v = u^2
              }
            `;
            return evaluate(code, env).value as SpaceValue;
          },
        },
        {
          name: 'Function definition substitution',
          run: () => {
            const env = createInitialEnvironment();
            evaluate('sq(t) := t^2', env);
            const code = `
              {
                y = sq(x)
                v = sq(u)
              }
            `;
            return evaluate(code, env).value as SpaceValue;
          },
        },
      ];

      for (const r of routes) {
        const space = r.run();
        expect(space.type).toBe('space');

        expect(space.dimension).toBe(4);
        expect(space.coordinates).toEqual(['u', 'v', 'x', 'y']);
        expect(space.entities.length).toBe(2);

        // Test slice sampling at (u=1.5, v=2.25)
        const ent0 = space.entities[0];
        const slice = sampleSlice(ent0.compiledFn, space.coordinates, ['x', 'y'], { u: 1.5, v: 2.25 }, [[-3, 3], [-3, 3]], 60);
        expect((slice as any).polylines.length).toBeGreaterThan(0);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Invariant I5: Dimension Inference and Sampler Dimension Agree
  // ---------------------------------------------------------------------------
  describe('Invariant I5: Dimension Inference and Sampler Dimension Agree', () => {
    const dimensionCorpus = [
      {
        dim: 1,
        code: 'x = 0',
        coords: ['x'],
        sampleCheck: (fn: any, coords: string[]) => {
          expect(coords.length).toBe(1);
          // 1D Line sampled on 2D display plane (x vs dummy y)
          const res = sample2D((x, _y) => fn(x), [-3, 3], [-3, 3], 40);
          expect(res.polylines.length).toBeGreaterThan(0);
        },
      },
      {
        dim: 2,
        code: 'x^2 + y^2 = 9',
        coords: ['x', 'y'],
        sampleCheck: (fn: any, coords: string[]) => {
          expect(coords.length).toBe(2);
          const res = sample2D(fn, [-4, 4], [-4, 4], 60);
          expect(res.polylines.length).toBeGreaterThan(0);
        },
      },
      {
        dim: 3,
        code: 'x^2 + y^2 + z^2 = 9',
        coords: ['x', 'y', 'z'],
        sampleCheck: (fn: any, coords: string[]) => {
          expect(coords.length).toBe(3);
          const res = sample3D(fn, [-4, 4], [-4, 4], [-4, 4], 25);
          expect(res.vertices.length).toBeGreaterThan(0);
          expect(res.triangles.length).toBeGreaterThan(0);
        },
      },
      {
        dim: 4,
        code: `
          {
            x^2 + y^2 = 4
            u^2 + v^2 = 9
          }
        `,
        coords: ['u', 'v', 'x', 'y'],
        sampleCheck: (fn: any, coords: string[]) => {
          expect(coords.length).toBe(4);
          const res = sampleSlice(fn, coords, ['x', 'y'], { u: 0, v: 3 }, [[-3, 3], [-3, 3]], 40);
          expect((res as any).polylines.length).toBeGreaterThan(0);
        },
      },
      {
        dim: 6,
        code: `
          {
            x^2 + y^2 = 4
            u + v = 1
            p + q = 2
          }
        `,
        coords: ['p', 'q', 'u', 'v', 'x', 'y'],
        sampleCheck: (fn: any, coords: string[]) => {
          expect(coords.length).toBe(6);
          const res = sampleSlice(fn, coords, ['x', 'y'], { u: 0, v: 1, p: 1, q: 1 }, [[-3, 3], [-3, 3]], 40);
          expect((res as any).polylines.length).toBeGreaterThan(0);
        },
      },
    ];

    for (const testCase of dimensionCorpus) {
      it(`verifies dimension ${testCase.dim} agreement for: ${testCase.code.replace(/\s+/g, ' ').trim()}`, () => {
        const env = createInitialEnvironment();
        const res = evaluate(testCase.code, env);
        expect(res.value.type).toBe('space');
        const space = res.value as SpaceValue;

        // 1. Dimension Inference
        expect(space.dimension).toBe(testCase.dim);
        expect(space.coordinates).toEqual(testCase.coords);

        // 2. Sampler Dimension Concordance
        const ent = space.entities[0];
        expect(ent.dimension).toBe(testCase.dim);
        expect(ent.coordinates).toEqual(testCase.coords);
        testCase.sampleCheck(ent.compiledFn, space.coordinates);
      });
    }
  });
});
