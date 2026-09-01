import { describe, it, expect } from 'vitest';
import { evaluate, createInitialEnvironment } from '../core/evaluator';

describe('Phase 12 Part A: Trajectories as First-Class Values (Gate E1)', () => {
  it('creates a first-class Trajectory value and reports kindof() with state kind', () => {
    const env = createInitialEnvironment();
    evaluate('Body := record { mass, position, velocity }', env);
    evaluate('b0 := Body(mass: 1, position: (0, 0), velocity: (10, 0))', env);
    evaluate('b1 := Body(mass: 1, position: (10, 0), velocity: (10, 0))', env);
    evaluate('b2 := Body(mass: 1, position: (20, 0), velocity: (10, 0))', env);
    evaluate('traj := Trajectory("Body", 0, 2, [ (0, b0), (1, b1), (2, b2) ])', env);

    const { value: kVal } = evaluate('kindof(traj)', env);
    expect(kVal.type).toBe('kind');
    if (kVal.type === 'kind') {
      expect(kVal.kind.name).toBe('Trajectory');
      expect((kVal.kind as any).stateKind).toBe('Body');
    }

    const { value: durVal } = evaluate('traj.duration', env);
    expect(durVal).toEqual({ type: 'float', value: 2 });
  });

  it('interpolates state at non-sample timestamps via traj[t]', () => {
    const env = createInitialEnvironment();
    evaluate('p0 := (0, 0)', env);
    evaluate('p1 := (10, 20)', env);
    evaluate('traj := Trajectory("Vector(2)", 0, 10, [ (0, p0), (10, p1) ])', env);

    // Exact at t = 0
    const { value: s0 } = evaluate('traj[0]', env);
    expect(s0.type).toBe('tuple');
    if (s0.type === 'tuple') {
      expect(s0.elements[0]).toEqual({ type: 'rational', n: 0n, d: 1n });
      expect(s0.elements[1]).toEqual({ type: 'rational', n: 0n, d: 1n });
    }

    // Interpolated at midpoint t = 5: (5, 10)
    const { value: sMid } = evaluate('traj[5]', env);
    expect(sMid.type).toBe('tuple');
    if (sMid.type === 'tuple') {
      expect(sMid.elements[0]).toEqual({ type: 'float', value: 5 });
      expect(sMid.elements[1]).toEqual({ type: 'float', value: 10 });
    }

    // Interpolated at t = 2.5: (2.5, 5)
    const { value: sQuarter } = evaluate('traj[2.5]', env);
    expect(sQuarter.type).toBe('tuple');
    if (sQuarter.type === 'tuple') {
      expect(sQuarter.elements[0]).toEqual({ type: 'float', value: 2.5 });
      expect(sQuarter.elements[1]).toEqual({ type: 'float', value: 5 });
    }
  });

  it('maps over a trajectory with map(fn, traj) producing a new trajectory', () => {
    const env = createInitialEnvironment();
    evaluate('Particle := record { mass, position, velocity }', env);
    evaluate('p0 := Particle(mass: 2, position: (0, 0), velocity: (5, 0))', env);
    evaluate('p1 := Particle(mass: 2, position: (10, 0), velocity: (5, 0))', env);
    evaluate('p2 := Particle(mass: 2, position: (20, 0), velocity: (5, 0))', env);
    evaluate('traj := Trajectory("Particle", 0, 4, [ (0, p0), (2, p1), (4, p2) ])', env);
    evaluate('pos_traj := map(p -> p.position, traj)', env);

    const { value: posVal } = evaluate('pos_traj', env);
    expect(posVal.type).toBe('trajectory');
    if (posVal.type === 'trajectory') {
      expect(posVal.stateKind).toBe('Vector(2)');
      expect(posVal.samples.length).toBe(3);
    }

    // Interpolate mapped trajectory at t = 1: (5, 0)
    const { value: posAt1 } = evaluate('pos_traj[1]', env);
    expect(posAt1.type).toBe('tuple');
    if (posAt1.type === 'tuple') {
      expect(posAt1.elements[0]).toEqual({ type: 'float', value: 5 });
      expect(posAt1.elements[1]).toEqual({ type: 'float', value: 0 });
    }
  });

  it('enforces dimensional integrity and errors on mismatched units across time steps', () => {
    const env = createInitialEnvironment();
    evaluate('dimension length, time', env);
    evaluate('unit meter : length', env);
    evaluate('unit second : time', env);
    evaluate('unit foot = 0.3048 * meter', env);

    // Mismatched units across samples: sample 0 has meter, sample 1 has second
    expect(() => {
      evaluate('s0 := 10 * meter', env);
      evaluate('s1 := 20 * second', env);
      evaluate('bad_traj := Trajectory("Quantity", 0, 1, [ (0, s0), (1, s1) ])', env);
    }).toThrowError(/mismatched dimensional units/i);
  });

  it('exports trajectory to CSV and JSON formats', () => {
    const env = createInitialEnvironment();
    evaluate('p0 := (0, 0)', env);
    evaluate('p1 := (10, 20)', env);
    evaluate('traj := Trajectory("Vector(2)", 0, 1, [ (0, p0), (1, p1) ])', env);
    evaluate('csv_out := export_trajectory(traj, format: "csv")', env);
    evaluate('json_out := export_trajectory(traj, format: "json")', env);

    const { value: csvVal } = evaluate('csv_out', env);
    expect(csvVal.type).toBe('string');
    if (csvVal.type === 'string') {
      expect(csvVal.value).toContain('t,x1,x2');
      expect(csvVal.value).toContain('0,0,0');
      expect(csvVal.value).toContain('1,10,20');
    }

    const { value: jsonVal } = evaluate('json_out', env);
    expect(jsonVal.type).toBe('string');
    if (jsonVal.type === 'string') {
      const parsed = JSON.parse(jsonVal.value);
      expect(parsed.stateKind).toBe('Vector(2)');
      expect(parsed.samples.length).toBe(2);
    }
  });
});
