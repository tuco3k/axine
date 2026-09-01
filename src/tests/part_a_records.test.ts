import { describe, it, expect } from 'vitest';
import { evaluate } from '../core/evaluator';
import { createInitialEnvironment } from '../core/evaluator';
import { formatKind, inferKindOfValue } from '../core/kinds';
import { formatAST } from '../core/formatter';
import { parse } from '../core/parser';

describe('Part A: Records', () => {
  it('declares a record schema and instantiates with named arguments', () => {
    const env = createInitialEnvironment();
    evaluate('Particle := record { mass, position, velocity }', env);
    const { value: p } = evaluate('p := Particle(mass: 2, position: (0,0,0), velocity: (1,0,0))', env);

    expect(p.type).toBe('record');
    if (p.type === 'record') {
      expect(p.typeName).toBe('Particle');
      expect(p.fields.mass).toEqual({ type: 'rational', n: 2n, d: 1n });
      expect(p.fields.position).toEqual({
        type: 'tuple',
        elements: [
          { type: 'rational', n: 0n, d: 1n },
          { type: 'rational', n: 0n, d: 1n },
          { type: 'rational', n: 0n, d: 1n },
        ],
      });
    }
  });

  it('accesses record fields via dot notation', () => {
    const env = createInitialEnvironment();
    evaluate('Particle := record { mass, position, velocity }', env);
    evaluate('p := Particle(mass: 2, position: (0,0,0), velocity: (1,0,0))', env);

    const { value: massVal } = evaluate('p.mass', env);
    expect(massVal).toEqual({ type: 'rational', n: 2n, d: 1n });

    const { value: velVal } = evaluate('p.velocity', env);
    expect(velVal).toEqual({
      type: 'tuple',
      elements: [
        { type: 'rational', n: 1n, d: 1n },
        { type: 'rational', n: 0n, d: 1n },
        { type: 'rational', n: 0n, d: 1n },
      ],
    });
  });

  it('errors on invalid field access naming the record type and available fields', () => {
    const env = createInitialEnvironment();
    evaluate('Particle := record { mass, position, velocity }', env);
    evaluate('p := Particle(mass: 2, position: (0,0,0), velocity: (1,0,0))', env);

    expect(() => evaluate('p.charge', env)).toThrowError(/Field 'charge' does not exist on record 'Particle'. Available fields: mass, position, velocity/);
  });

  it('updates records immutably using with { ... } returning a new record', () => {
    const env = createInitialEnvironment();
    evaluate('Particle := record { mass, position, velocity }', env);
    evaluate('p := Particle(mass: 2, position: (0,0,0), velocity: (1,0,0))', env);

    const { value: p2 } = evaluate('p2 := p with { velocity: (2,0,0) }', env);
    expect(p2.type).toBe('record');
    if (p2.type === 'record') {
      expect((p2.fields.velocity as any).elements[0]).toEqual({ type: 'rational', n: 2n, d: 1n });
    }

    // Original p is untouched
    const { value: originalVel } = evaluate('p.velocity', env);
    expect((originalVel as any).elements[0]).toEqual({ type: 'rational', n: 1n, d: 1n });
  });

  it('errors on with update with unknown field naming available fields', () => {
    const env = createInitialEnvironment();
    evaluate('Particle := record { mass, position, velocity }', env);
    evaluate('p := Particle(mass: 2, position: (0,0,0), velocity: (1,0,0))', env);

    expect(() => evaluate('p with { spin: 0.5 }', env)).toThrowError(/Field 'spin' does not exist on record 'Particle'/);
  });

  it('stores records in lists and passes them to functions', () => {
    const env = createInitialEnvironment();
    evaluate('Particle := record { mass, position, velocity }', env);
    evaluate('p1 := Particle(mass: 2, position: (0,0,0), velocity: (1,0,0))', env);
    evaluate('p2 := Particle(mass: 3, position: (1,1,1), velocity: (0,2,0))', env);
    evaluate('particles := [p1, p2]', env);

    const { value: totalMass } = evaluate('particles[0].mass + particles[1].mass', env);
    expect(totalMass).toEqual({ type: 'rational', n: 5n, d: 1n });
  });

  it('Gate A: a record with a Vector field kind-checks', () => {
    const env = createInitialEnvironment();
    evaluate('Particle := record { mass, position, velocity }', env);
    const { value: p } = evaluate('p := Particle(mass: 2, position: (0,0,0), velocity: (1,0,0))', env);

    const recordKind = inferKindOfValue(p);
    expect(recordKind.name).toBe('Record');
    if (recordKind.name === 'Record') {
      expect(recordKind.typeName).toBe('Particle');
      expect(recordKind.fields.mass).toEqual({ name: 'Scalar', subtype: 'natural' });
      expect(recordKind.fields.position).toEqual({ name: 'Vector', dimension: 3, baseField: 'R' });
      expect(recordKind.fields.velocity).toEqual({ name: 'Vector', dimension: 3, baseField: 'R' });
    }

    const { value: kindOfP } = evaluate('kindof(p)', env);
    expect(kindOfP.type).toBe('kind');
    if (kindOfP.type === 'kind') {
      expect(formatKind(kindOfP.kind)).toContain('Record(Particle');
      expect(formatKind(kindOfP.kind)).toContain('position: Vector(dim=3, field=R)');
    }

    const { value: kindOfPos } = evaluate('kindof(p.position)', env);
    expect(kindOfPos.type).toBe('kind');
    if (kindOfPos.type === 'kind') {
      expect(kindOfPos.kind).toEqual({ name: 'Vector', dimension: 3, baseField: 'R' });
    }

    const { value: admitsCross } = evaluate('admits(p.position)', env);
    expect(admitsCross.type).toBe('list');
    if (admitsCross.type === 'list') {
      const ops = admitsCross.elements.map(e => (e as any).value);
      expect(ops.some(op => op.includes('cross'))).toBe(true);
    }
  });

  it('round-trips record definition and with-update through parser and formatter', () => {
    const code1 = 'record { mass, position, velocity }';
    const ast1 = parse(code1);
    expect(formatAST(ast1)).toBe('record { mass, position, velocity }');

    const code2 = 'p with { velocity: (2, 0, 0) }';
    const ast2 = parse(code2);
    expect(formatAST(ast2)).toBe('p with { velocity: (2, 0, 0) }');
  });
});
