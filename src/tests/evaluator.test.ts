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

  it('evaluates relation with 1 free variable into 1D space', () => {
    const env = createInitialEnvironment();
    const { value } = evaluate('x = 0', env);
    expect(value.type).toBe('space');
    if (value.type === 'space') {
      expect(value.dimension).toBe(1);
      expect(value.coordinates).toEqual(['x']);
      expect(value.entities.length).toBe(1);
    }
  });

  it('evaluates relation with 2 free variables into 2D space', () => {
    const env = createInitialEnvironment();
    const { value } = evaluate('y = x^2', env);
    expect(value.type).toBe('space');
    if (value.type === 'space') {
      expect(value.dimension).toBe(2);
      expect(value.coordinates).toEqual(['x', 'y']);
      expect(value.entities.length).toBe(1);
    }
  });

  it('evaluates 3D relation into 3D space', () => {
    const env = createInitialEnvironment();
    const { value } = evaluate('x^2 + y^2 + z^2 = 4', env);
    expect(value.type).toBe('space');
    if (value.type === 'space') {
      expect(value.dimension).toBe(3);
      expect(value.coordinates).toEqual(['x', 'y', 'z']);
      expect(value.entities.length).toBe(1);
    }
  });

  it('evaluates block with 4 free variables into 4D space', () => {
    const env = createInitialEnvironment();
    const { value } = evaluate('{\n  y = x^2\n  v = u^2\n}', env);
    expect(value.type).toBe('space');
    if (value.type === 'space') {
      expect(value.dimension).toBe(4);
      expect(value.coordinates).toEqual(['u', 'v', 'x', 'y']);
      expect(value.entities.length).toBe(2);
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
