import { describe, it, expect } from 'vitest';
import { evaluate } from '../core/evaluator';
import { createInitialEnvironment } from '../core/evaluator';
import { formatKind } from '../core/kinds';

describe('Part B: User-Defined Units and Dimensions', () => {
  it('declares dimensions and base/derived units', () => {
    const env = createInitialEnvironment();
    evaluate('dimension length, mass, time', env);
    evaluate('unit meter : length', env);
    evaluate('unit second : time', env);
    evaluate('unit kilogram : mass', env);
    evaluate('unit newton = kilogram * meter / second^2', env);
    evaluate('unit foot = 0.3048 * meter', env);

    const { value: d } = evaluate('d := 5 meter', env);
    expect(d.type).toBe('quantity');
    if (d.type === 'quantity') {
      expect(d.unit).toBe('meter');
      expect(d.dimensions).toEqual({ length: 1 });
    }
  });

  it('evaluates quantity division d / t producing derived unit / dimensions (Gate B requirement)', () => {
    const env = createInitialEnvironment();
    evaluate('dimension length, mass, time', env);
    evaluate('unit meter : length', env);
    evaluate('unit second : time', env);
    evaluate('d := 5 meter', env);
    evaluate('t := 2 second', env);

    const { value: speed } = evaluate('v := d / t', env);
    expect(speed.type).toBe('quantity');
    if (speed.type === 'quantity') {
      expect(speed.dimensions).toEqual({ length: 1, time: -1 });
      expect(speed.unit).toContain('meter');
      expect(speed.unit).toContain('second');
      // 5 / 2 = 2.5 (or rational 5/2)
      if (speed.magnitude.type === 'rational') {
        expect(speed.magnitude.n).toBe(5n);
        expect(speed.magnitude.d).toBe(2n);
      } else if (speed.magnitude.type === 'float') {
        expect(speed.magnitude.value).toBe(2.5);
      }
    }
  });

  it('errors on adding quantities with mismatched dimensions naming both dimensions (Gate B requirement)', () => {
    const env = createInitialEnvironment();
    evaluate('dimension length, time', env);
    evaluate('unit meter : length', env);
    evaluate('unit second : time', env);
    evaluate('d := 5 meter', env);
    evaluate('t := 2 second', env);

    expect(() => evaluate('d + t', env)).toThrowError(/Dimension mismatch: cannot add length \(5 meter\) and time \(2 second\)/);
    expect(() => evaluate('d - t', env)).toThrowError(/Dimension mismatch: cannot subtract time \(2 second\) from length \(5 meter\)/);
  });

  it('rejects dimensioned quantities in transcendental functions (Gate B requirement)', () => {
    const env = createInitialEnvironment();
    evaluate('dimension length', env);
    evaluate('unit meter : length', env);
    evaluate('d := 5 meter', env);

    expect(() => evaluate('sin(5 meter)', env)).toThrowError(/Transcendental function 'sin' requires dimensionless argument/);
    expect(() => evaluate('cos(d)', env)).toThrowError(/Transcendental function 'cos' requires dimensionless argument/);
    expect(() => evaluate('exp(d)', env)).toThrowError(/Transcendental function 'exp' requires dimensionless argument/);
    expect(() => evaluate('ln(d)', env)).toThrowError(/Transcendental function 'ln' requires dimensionless argument/);

    // Dimensionless ratio cancels units and succeeds
    const { value: sinRatio } = evaluate('sin((10 meter) / (2 meter))', env);
    expect(sinRatio.type).toBe('float');
    if (sinRatio.type === 'float') {
      expect(sinRatio.value).toBeCloseTo(Math.sin(5), 5);
    }
  });

  it('converts quantities between compatible units with convert()', () => {
    const env = createInitialEnvironment();
    evaluate('dimension length', env);
    evaluate('unit meter : length', env);
    evaluate('unit foot = 0.3048 * meter', env);
    evaluate('d := 10 foot', env);

    const { value: inMeters } = evaluate('convert(d, to: meter)', env);
    expect(inMeters.type).toBe('quantity');
    if (inMeters.type === 'quantity') {
      expect(inMeters.unit).toBe('meter');
      if (inMeters.magnitude.type === 'float') {
        expect(inMeters.magnitude.value).toBeCloseTo(3.048, 4);
      }
    }

    const { value: inFeet } = evaluate('convert(3.048 meter, to: foot)', env);
    expect(inFeet.type).toBe('quantity');
    if (inFeet.type === 'quantity') {
      expect(inFeet.unit).toBe('foot');
      if (inFeet.magnitude.type === 'float') {
        expect(inFeet.magnitude.value).toBeCloseTo(10, 3);
      }
    }
  });

  it('errors when convert() is called with incompatible dimensions', () => {
    const env = createInitialEnvironment();
    evaluate('dimension length, time', env);
    evaluate('unit meter : length', env);
    evaluate('unit second : time', env);

    expect(() => evaluate('convert(5 meter, to: second)', env)).toThrowError(/Dimension mismatch: cannot convert length/);
  });

  it('kindof() identifies Quantity kinds and admits operations', () => {
    const env = createInitialEnvironment();
    evaluate('dimension length', env);
    evaluate('unit meter : length', env);
    evaluate('d := 5 meter', env);

    const { value: kindVal } = evaluate('kindof(d)', env);
    expect(kindVal.type).toBe('kind');
    if (kindVal.type === 'kind') {
      expect(formatKind(kindVal.kind)).toBe('Quantity(unit=meter)');
    }

    const { value: admitsVal } = evaluate('admits(d)', env);
    expect(admitsVal.type).toBe('list');
    if (admitsVal.type === 'list') {
      const ops = admitsVal.elements.map(e => (e as any).value);
      expect(ops).toContain('convert');
      expect(ops).toContain('+');
    }
  });
});
