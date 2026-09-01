import { describe, it, expect } from 'vitest';
import { createInitialEnvironment, Evaluator, BudgetTracker } from '../core/evaluator';
import { DEFAULT_BUDGET_LIMITS } from '../core/types';
import { parseProgram } from '../core/parser';
import { valueToNumber } from '../core/numeric/tower';
import { Value } from '../core/types';
import * as fs from 'fs';
import * as path from 'path';

function evalProgram(source: string, env: Record<string, Value> = createInitialEnvironment()): Record<string, Value> {
  const ast = parseProgram(source);
  if (ast.type === 'Block') {
    for (const stmt of ast.statements) {
      const budget = new BudgetTracker({ ...DEFAULT_BUDGET_LIMITS, timeoutMs: 5000 });
      const evaluator = new Evaluator(env, source, budget);
      (evaluator as any).evalNode(stmt, env);
    }
  } else {
    const budget = new BudgetTracker({ ...DEFAULT_BUDGET_LIMITS, timeoutMs: 5000 });
    const evaluator = new Evaluator(env, source, budget);
    (evaluator as any).evalNode(ast, env);
  }
  return env;
}

describe('Phase 12 Part C & Gate E5: Physics Library and Worked Documents', () => {
  it('evaluates documents/physics.ax and exports integrators', () => {
    const filePath = path.resolve(process.cwd(), 'documents', 'physics.ax');
    const content = fs.readFileSync(filePath, 'utf-8');
    const env = evalProgram(content);

    expect(env['Body']).toBeDefined();
    expect(env['euler_step']).toBeDefined();
    expect(env['verlet_step']).toBeDefined();
    expect(env['rk4_step']).toBeDefined();
  });

  it('evaluates documents/projectile.ax', () => {
    const filePath = path.resolve(process.cwd(), 'documents', 'projectile.ax');
    const content = fs.readFileSync(filePath, 'utf-8');
    const env = evalProgram(content);

    const trajVal = env['traj'];
    expect(trajVal).toBeDefined();
    expect(trajVal.type).toBe('trajectory');

    const EkVal = env['E_k1'];
    expect(EkVal).toBeDefined();
    const Ek = valueToNumber(EkVal);
    expect(Ek).toBeGreaterThan(0);
  });

  it('evaluates documents/pendulum.ax', () => {
    const filePath = path.resolve(process.cwd(), 'documents', 'pendulum.ax');
    const content = fs.readFileSync(filePath, 'utf-8');
    const env = evalProgram(content);

    const trajVal = env['traj'];
    expect(trajVal).toBeDefined();
    expect(trajVal.type).toBe('trajectory');
    expect((trajVal as any).samples.length).toBeGreaterThan(10);
  });

  it('evaluates documents/orbit.ax and verifies angular momentum conservation', () => {
    const filePath = path.resolve(process.cwd(), 'documents', 'orbit.ax');
    const content = fs.readFileSync(filePath, 'utf-8');
    const env = evalProgram(content);

    const L10Val = env['L_10'];
    expect(L10Val).toBeDefined();
    const L10 = valueToNumber(L10Val);
    // Initial L = 10 * 3.162277 ~= 31.62277
    const L0 = 10.0 * 3.162277;
    expect(Math.abs(L10 - L0)).toBeLessThan(0.05);
  });

  it('evaluates documents/collision.ax and verifies momentum conservation', () => {
    const filePath = path.resolve(process.cwd(), 'documents', 'collision.ax');
    const content = fs.readFileSync(filePath, 'utf-8');
    const env = evalProgram(content);

    const totalPVal = env['total_p'];
    expect(totalPVal).toBeDefined();
    const totalP = valueToNumber(totalPVal);
    // Initial momentum: 2.0 * 3.0 + 1.0 * (-1.0) = 5.0
    expect(totalP).toBeCloseTo(5.0, 1);
  });

  it('evaluates documents/spring.ax and verifies damped oscillator decay', () => {
    const filePath = path.resolve(process.cwd(), 'documents', 'spring.ax');
    const content = fs.readFileSync(filePath, 'utf-8');
    const env = evalProgram(content);

    const x3Val = env['x_3'];
    expect(x3Val).toBeDefined();
    const x3 = valueToNumber(x3Val);
    // Initial amplitude was 3.0; at t = 3s amplitude must be smaller due to damping
    expect(Math.abs(x3)).toBeLessThan(3.0);
  });

  it('evaluates documents/integrator_comparison.ax and verifies energy drift difference', () => {
    const filePath = path.resolve(process.cwd(), 'documents', 'integrator_comparison.ax');
    const content = fs.readFileSync(filePath, 'utf-8');
    const env = evalProgram(content);

    const driftEuler = valueToNumber(env['drift_euler']);
    const driftVerlet = valueToNumber(env['drift_verlet']);
    const driftRk4 = valueToNumber(env['drift_rk4']);

    expect(driftEuler).toBeGreaterThan(driftVerlet);
    expect(driftEuler).toBeGreaterThan(driftRk4);
    expect(driftRk4).toBeLessThan(1e-3);
  });

  it('evaluates documents/optics.ax and verifies geometric optics refraction', () => {
    const filePath = path.resolve(process.cwd(), 'documents', 'optics.ax');
    const content = fs.readFileSync(filePath, 'utf-8');
    const env = evalProgram(content);

    const rEnd = env['r_end'];
    expect(rEnd).toBeDefined();
    expect(rEnd.type).toBe('record');
    if (rEnd.type === 'record') {
      expect(rEnd.fields.direction).toBeDefined();
    }
  });
});
