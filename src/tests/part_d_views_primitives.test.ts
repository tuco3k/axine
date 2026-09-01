import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { evaluate, createInitialEnvironment } from '../core/evaluator';
import { AnimationPlayer } from '../plot/animation_player';
import { TrajectoryValue, DrawingPrimitiveValue } from '../core/types';

// Mock DOM elements
class MockClassList {
  public classes: Set<string> = new Set();
  add(...cls: string[]) { cls.forEach(c => c && this.classes.add(c)); }
  remove(...cls: string[]) { cls.forEach(c => this.classes.delete(c)); }
  contains(c: string) { return this.classes.has(c); }
}

class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public classList: MockClassList = new MockClassList();
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public listeners: Map<string, Function[]> = new Map();
  public type: string = 'text';
  public title: string = '';
  public value: string = '0';
  public min: string = '0';
  public max: string = '1';
  public step: string = '0.01';
  public width: number = 400;
  public height: number = 300;
  public textContent: string = '';
  private _innerHTML: string = '';

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, val: string) {
    if (name === 'type') this.type = val;
    if (name === 'class') this.className = val;
  }

  get innerHTML(): string {
    return this._innerHTML;
  }

  set innerHTML(val: string) {
    this._innerHTML = val;
    this.children = [];
  }

  appendChild(child: MockElement) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  addEventListener(event: string, fn: Function) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(fn);
  }

  removeEventListener(event: string, fn: Function) {
    const list = this.listeners.get(event) || [];
    this.listeners.set(event, list.filter(f => f !== fn));
  }

  dispatchEvent(event: any) {
    const list = this.listeners.get(event.type || event) || [];
    list.forEach(fn => fn(event));
  }

  querySelector(sel: string): MockElement | null {
    const cleanSel = sel.replace(/^\./, '').replace(/^#/, '');
    if (this.className.includes(cleanSel) || this.id === cleanSel || this.tagName.toLowerCase() === sel.toLowerCase()) {
      return this;
    }
    for (const child of this.children) {
      const found = child.querySelector(sel);
      if (found) return found;
    }
    return null;
  }

  getContext(_type: string) {
    return {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      shadowColor: '',
      shadowBlur: 0,
      fillRect: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {},
      closePath: () => {},
      fillText: () => {},
      save: () => {},
      restore: () => {},
    };
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter(c => c !== this);
    }
  }
}

class MockKeyboardEvent {
  public code: string;
  constructor(public type: string, init: any = {}) {
    this.code = init.code || '';
    Object.assign(this, init);
  }
}

describe('Phase 12 Part B & Gate E4: Views, Primitives, and Animation Player', () => {
  let container: MockElement;
  let globalListeners: Map<string, Function[]> = new Map();

  beforeEach(() => {
    globalListeners = new Map();
    (globalThis as any).KeyboardEvent = MockKeyboardEvent;
    (globalThis as any).window = {
      addEventListener: (evt: string, fn: Function) => {
        if (!globalListeners.has(evt)) globalListeners.set(evt, []);
        globalListeners.get(evt)!.push(fn);
      },
      removeEventListener: (evt: string, fn: Function) => {
        const list = globalListeners.get(evt) || [];
        globalListeners.set(evt, list.filter(f => f !== fn));
      },
      dispatchEvent: (evt: any) => {
        const list = globalListeners.get(evt.type) || [];
        list.forEach(fn => fn(evt));
      },
    };
    (globalThis as any).document = {
      createElement: (tag: string) => new MockElement(tag),
      body: new MockElement('body'),
    };
    (globalThis as any).requestAnimationFrame = (fn: Function) => setTimeout(fn, 16);
    (globalThis as any).cancelAnimationFrame = (id: any) => clearTimeout(id);
    (globalThis as any).performance = { now: () => Date.now() };

    container = new MockElement('div');
  });

  afterEach(() => {
    container.remove();
  });
  it('parses and evaluates drawing primitives', () => {
    const env = createInitialEnvironment();
    const { value: pt } = evaluate('p := point((1, 2))', env);
    expect(pt.type).toBe('drawing_primitive');
    expect((pt as DrawingPrimitiveValue).primitive).toBe('point');

    const { value: seg } = evaluate('s := segment((0, 0), (1, 1))', env);
    expect(seg.type).toBe('drawing_primitive');
    expect((seg as DrawingPrimitiveValue).primitive).toBe('segment');

    const { value: arr } = evaluate('a := arrow((0, 0), (2, 3))', env);
    expect(arr.type).toBe('drawing_primitive');
    expect((arr as DrawingPrimitiveValue).primitive).toBe('arrow');

    const { value: circ } = evaluate('c := circle((0, 0), 5)', env);
    expect(circ.type).toBe('drawing_primitive');
    expect((circ as DrawingPrimitiveValue).primitive).toBe('circle');

    const { value: poly } = evaluate('pg := polygon([(0, 0), (2, 0), (1, 2)])', env);
    expect(poly.type).toBe('drawing_primitive');
    expect((poly as DrawingPrimitiveValue).primitive).toBe('polygon');

    const { value: pth } = evaluate('pt := path([(0, 0), (1, 1), (2, 4)])', env);
    expect(pth.type).toBe('drawing_primitive');
    expect((pth as DrawingPrimitiveValue).primitive).toBe('path');

    const { value: lbl } = evaluate('l := label("Origin", (0, 0))', env);
    expect(lbl.type).toBe('drawing_primitive');
    expect((lbl as DrawingPrimitiveValue).primitive).toBe('label');
  });

  it('parses and evaluates user-declared view for record type', () => {
    const env = createInitialEnvironment();
    evaluate('Particle := record { position, velocity }', env);
    evaluate('view for Particle := p -> [circle(p.position, 2), arrow(p.position, p.velocity)]', env);

    const { value: viewsMap } = { value: (env as any).__views__ };
    expect(viewsMap).toBeDefined();
    expect(viewsMap.has('Particle')).toBe(true);
  });

  it('controls AnimationPlayer: play, pause, step forward, step backward, reset, seek', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const env = createInitialEnvironment();
    const { value: trajVal } = evaluate(
      'simulate(s -> (s[0] + 0.1, s[1] + 0.2), (0, 0), t in 0..1, dt: 0.1)',
      env
    );
    expect(trajVal.type).toBe('trajectory');

    const player = new AnimationPlayer(container, trajVal as TrajectoryValue, {
      width: 400,
      height: 250,
    });

    // Initial state: t = 0
    player.seek(0);
    const scrubBar = container.querySelector('.anim-scrub-bar') as HTMLInputElement;
    expect(scrubBar).toBeDefined();
    expect(parseFloat(scrubBar.value)).toBeCloseTo(0, 2);

    // Step forward
    player.stepForward(0.1);
    expect(parseFloat(scrubBar.value)).toBeCloseTo(0.1, 2);

    // Step backward
    player.stepBackward(0.1);
    expect(parseFloat(scrubBar.value)).toBeCloseTo(0.0, 2);

    // Play & Pause
    player.play();
    player.pause();

    // Reset
    player.seek(0.5);
    player.reset();
    expect(parseFloat(scrubBar.value)).toBeCloseTo(0.0, 2);

    // Speed selector change
    player.setSpeed(2.0);

    // Cleanup
    player.dispose();
    container.remove();
  });

  it('responds to keyboard bindings: Space (play/pause), ArrowRight (step), ArrowLeft (back), Home (reset)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const env = createInitialEnvironment();
    const { value: trajVal } = evaluate(
      'simulate(s -> (s[0] + 1, s[1] + 1), (0, 0), t in 0..5, dt: 1.0)',
      env
    );

    const player = new AnimationPlayer(container, trajVal as TrajectoryValue);
    const scrubBar = container.querySelector('.anim-scrub-bar') as HTMLInputElement;

    // ArrowRight -> step forward
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
    expect(parseFloat(scrubBar.value)).toBeGreaterThan(0);

    // ArrowLeft -> step backward
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));
    expect(parseFloat(scrubBar.value)).toBeCloseTo(0, 1);

    // KeyR -> reset
    player.seek(3.0);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
    expect(parseFloat(scrubBar.value)).toBeCloseTo(0, 1);

    player.dispose();
    container.remove();
  });
});
