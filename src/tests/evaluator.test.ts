import { describe, it, expect } from 'vitest';
import { evaluate, createInitialEnvironment } from '../core/evaluator';
import { MathError } from '../core/errors';

describe('Evaluator', () => {
  it('evaluates exact rationals without float drift', () => {
    const env = createInitialEnvironment();
    const { value } = evaluate('1/3 + 1/3 + 1/3', env);
    expect(value).toEqual({ type: 'rational', n: 1n, d: 1n });
  });

  it('evaluates assignments and persistent variables', () => {
    const env = createInitialEnvironment();
    evaluate('a := 3', env);
    evaluate('velocity := 10', env);
    const { value } = evaluate('velocity * a', env);
    expect(value).toEqual({ type: 'rational', n: 30n, d: 1n });
  });

  it('evaluates function definitions and function calls', () => {
    const env = createInitialEnvironment();
    evaluate('f(x) := x^2 + 1', env);
    const { value } = evaluate('f(3)', env);
    expect(value).toEqual({ type: 'rational', n: 10n, d: 1n });
  });

  it('evaluates bare function calls', () => {
    const env = createInitialEnvironment();
    const { value } = evaluate('sin 0', env);
    expect(value).toEqual({ type: 'float', value: 0 });
  });

  it('evaluates graph with 1 free variable', () => {
    const env = createInitialEnvironment();
    const { value } = evaluate('graph(2x)', env);
    expect(value.type).toBe('graph');
    if (value.type === 'graph') {
      expect(value.spec.dimensionality).toBe(1);
      expect(value.spec.series.length).toBe(1);
      expect(value.spec.domain.var).toBe('x');
    }
  });

  it('evaluates graph with multiple free variables across series and generates note', () => {
    const env = createInitialEnvironment();
    const { value } = evaluate('graph(2x, y, 9z)', env);
    expect(value.type).toBe('graph');
    if (value.type === 'graph') {
      expect(value.spec.dimensionality).toBe(1);
      expect(value.spec.series.length).toBe(3);
      expect(value.spec.sharedAxisNote).toContain('Variables');
      expect(value.spec.sharedAxisNote).toContain('were each mapped to the same horizontal axis');
    }
  });

  it('evaluates graph with 2 free variables into heatmap/surface', () => {
    const env = createInitialEnvironment();
    const { value } = evaluate('graph(sin x cos y)', env);
    expect(value.type).toBe('graph');
    if (value.type === 'graph') {
      expect(value.spec.dimensionality).toBe(2);
      expect(value.spec.kind).toBe('heatmap');
    }
  });

  it('evaluates parametric graph', () => {
    const env = createInitialEnvironment();
    const { value } = evaluate('graph((cos t, sin t), t in 0..tau)', env);
    expect(value.type).toBe('graph');
    if (value.type === 'graph') {
      expect(value.spec.kind).toBe('parametric');
      expect(value.spec.domain.var).toBe('t');
    }
  });

  it('errors with rich suggestion on undeclared multi-letter identifier', () => {
    const env = createInitialEnvironment();
    try {
      evaluate('velocity + 5', env);
      expect.unreachable('Should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(MathError);
      expect(e.diagnostic.message).toContain("'velocity' is not defined");
      expect(e.diagnostic.suggestion).toContain("v·e·l·o·c·i·t·y");
      expect(e.diagnostic.suggestion).toContain("velocity := ...");
    }
  });
});
