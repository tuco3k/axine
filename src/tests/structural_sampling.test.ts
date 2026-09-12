import { describe, it, expect } from 'vitest';
import { evaluate, createInitialEnvironment } from '../core/evaluator';
import { SpaceValue } from '../core/types';
import { sample2D } from '../core/sampler';

describe('Phase 2.2: Structural Sampling & Non-Scalar Relations', () => {
  it('1. samples a relation over a user-defined vector space (:Vec2)', () => {
    const env = createInitialEnvironment();
    const code = `
      {
        \\axis[x, y];
        :Vec2 := \\record { :x, :y };
        v := :Vec2(:x: x, :y: y);
        v.:x^2 + v.:y^2 = 4
      }
    `;
    const { value } = evaluate(code, env);
    expect(value.type).toBe('space');
    const space = value as SpaceValue;
    expect(space.declaredAxes).toEqual(['x', 'y']);
    expect(space.entities.length).toBe(1);

    // Sample the compiled closure
    const entity = space.entities[0];
    const contour = sample2D(entity.compiledFn, [-3, 3], [-3, 3], 100);
    expect(contour.polylines.length).toBeGreaterThan(0);

    // Verify all sampled points lie on the circle of radius 2
    for (const poly of contour.polylines) {
      for (const [px, py] of poly.points) {
        const radius = Math.hypot(px, py);
        expect(radius).toBeCloseTo(2.0, 1);
      }
    }
  });

  it('2. samples a relation over a user-defined complex number with multiplication operator', () => {
    const env = createInitialEnvironment();
    const code = `
      {
        \\axis[x, y];
        :Complex := \\record { :re, :im };
        \\operator \\infix \u2297 (a, b) := :Complex(:re: a.:re * b.:re - a.:im * b.:im, :im: a.:re * b.:im + a.:im * b.:re);
        z := :Complex(:re: x, :im: y);
        (z \u2297 z).:re = 1
      }
    `;
    const { value } = evaluate(code, env);
    expect(value.type).toBe('space');
    const space = value as SpaceValue;
    expect(space.declaredAxes).toEqual(['x', 'y']);
    expect(space.entities.length).toBe(1);

    // Sample hyperbola x^2 - y^2 = 1
    const entity = space.entities[0];
    const contour = sample2D(entity.compiledFn, [-3, 3], [-3, 3], 100);
    expect(contour.polylines.length).toBeGreaterThanOrEqual(2);

    // Verify sampled points satisfy x^2 - y^2 = 1
    for (const poly of contour.polylines) {
      for (const [px, py] of poly.points) {
        const diff = px * px - py * py;
        expect(diff).toBeCloseTo(1.0, 1);
      }
    }
  });

  it('3. samples a relation using an overloaded user-defined operator (x \u2299 y = 2)', () => {
    const env = createInitialEnvironment();
    const code = `
      {
        \\axis[x, y];
        \\operator \\infix \u2299 (a, b) := a * b - (a + b);
        x \u2299 y = 2
      }
    `;
    const { value } = evaluate(code, env);
    expect(value.type).toBe('space');
    const space = value as SpaceValue;
    expect(space.declaredAxes).toEqual(['x', 'y']);
    expect(space.entities.length).toBe(1);

    // Sample shifted hyperbola xy - x - y = 2 => (x - 1)(y - 1) = 3
    const entity = space.entities[0];
    const contour = sample2D(entity.compiledFn, [-5, 5], [-5, 5], 100);
    expect(contour.polylines.length).toBeGreaterThan(0);

    for (const poly of contour.polylines) {
      for (const [px, py] of poly.points) {
        const val = px * py - (px + py);
        expect(val).toBeCloseTo(2.0, 1);
      }
    }
  });

  it('4. extracts drawing primitives and views from collections inside a space', () => {
    const env = createInitialEnvironment();
    const code = `
      {
        \\axis[x, y];
        :Particle := \\record { :pos, :vel };
        \\view \\for :Particle := p -> [:circle(p.:pos, 0.4), :arrow(p.:pos, p.:vel)];
        :p1 := :Particle(:pos: (-2, -1), :vel: (1, 2));
        :p2 := :Particle(:pos: (1, 1), :vel: (-1, 1));
        :pts := \\set { (0, 0), (2, -2) };
      }
    `;
    const { value } = evaluate(code, env);
    expect(value.type).toBe('space');
    const space = value as SpaceValue;
    expect(space.primitives).toBeDefined();
    expect(space.primitives!.length).toBeGreaterThanOrEqual(6);

    const kinds = space.primitives!.map(p => p.primitive);
    expect(kinds).toContain('circle');
    expect(kinds).toContain('arrow');
    expect(kinds).toContain('point');
  });

  it('5. samples a relation using an overloaded + operator where + is redefined by user', () => {
    const env = createInitialEnvironment();
    // User overloads + to mean a * b - 4
    const code = `
      {
        \\axis[x, y];
        \\operator \\infix + (a, b) := a * b - 4;
        x + y = 0
      }
    `;
    const { value } = evaluate(code, env);
    expect(value.type).toBe('space');
    const space = value as SpaceValue;
    expect(space.entities.length).toBe(1);

    // x + y = 0 with overloaded + becomes x * y - 4 = 0 => x * y = 4 (hyperbola)
    const entity = space.entities[0];
    const contour = sample2D(entity.compiledFn, [-5, 5], [-5, 5], 100);
    expect(contour.polylines.length).toBeGreaterThan(0);

    for (const poly of contour.polylines) {
      for (const [px, py] of poly.points) {
        const product = px * py;
        expect(product).toBeCloseTo(4.0, 1);
      }
    }
  });

  it('6. benchmarks 40,000 points: structural vs scalar relation sampling cost', () => {
    const env1 = createInitialEnvironment();
    const { value: valScalar } = evaluate('{ \\axis[x, y]; x^2 + y^2 = 4 }', env1);
    const fnScalar = (valScalar as SpaceValue).entities[0].compiledFn;

    const env2 = createInitialEnvironment();
    const { value: valStruct } = evaluate('{ \\axis[x, y]; :Vec2 := \\record { :x, :y }; v := :Vec2(:x: x, :y: y); v.:x^2 + v.:y^2 = 4 }', env2);
    const fnStruct = (valStruct as SpaceValue).entities[0].compiledFn;

    const env3 = createInitialEnvironment();
    const { value: valComplex } = evaluate(`{ \\axis[x, y]; :Complex := \\record { :re, :im }; \\operator \\infix \u2297 (a, b) := :Complex(:re: a.:re * b.:re - a.:im * b.:im, :im: a.:re * b.:im + a.:im * b.:re); z := :Complex(:re: x, :im: y); (z \u2297 z).:re = 1 }`, env3);
    const fnComplex = (valComplex as SpaceValue).entities[0].compiledFn;

    const N = 40000;
    const xs = new Float64Array(N);
    const ys = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      xs[i] = -3 + 6 * (i % 200) / 200;
      ys[i] = -3 + 6 * Math.floor(i / 200) / 200;
    }

    // Warmup
    for (let i = 0; i < 1000; i++) {
      fnScalar(xs[i], ys[i]);
      fnStruct(xs[i], ys[i]);
      fnComplex(xs[i], ys[i]);
    }

    // Measure Scalar
    const t0 = performance.now();
    for (let i = 0; i < N; i++) {
      fnScalar(xs[i], ys[i]);
    }
    const t1 = performance.now();
    const timeScalar = t1 - t0;

    // Measure Structural Record
    const t2 = performance.now();
    for (let i = 0; i < N; i++) {
      fnStruct(xs[i], ys[i]);
    }
    const t3 = performance.now();
    const timeStruct = t3 - t2;

    // Measure Structural Complex Operator
    const t4 = performance.now();
    for (let i = 0; i < N; i++) {
      fnComplex(xs[i], ys[i]);
    }
    const t5 = performance.now();
    const timeComplex = t5 - t4;

    console.log('\n--- STRUCTURAL SAMPLING 40,000 POINT BENCHMARK ---');
    console.log(`• Pure Scalar Circle (x^2 + y^2 = 4):                ${timeScalar.toFixed(3)} ms (${(timeScalar / N * 1000).toFixed(4)} µs/eval)`);
    console.log(`• Structural Record Vector Space (v.:x^2 + v.:y^2 = 4): ${timeStruct.toFixed(3)} ms (${(timeStruct / N * 1000).toFixed(4)} µs/eval)`);
    console.log(`• Structural Complex Operator ((z \\u2297 z).:re = 1):     ${timeComplex.toFixed(3)} ms (${(timeComplex / N * 1000).toFixed(4)} µs/eval)`);

    expect(timeStruct).toBeLessThan(50); // Under 50ms for 40,000 points
    expect(timeComplex).toBeLessThan(50);
  });
});

