import { describe, it, expect } from 'vitest';
import { evaluate, createInitialEnvironment } from '../core/evaluator';
import { valueToNumber } from '../core/numeric/tower';

describe('Phase 12 Part A.2: simulate() and closed_form() (Gate E2)', () => {
  it('solves the projectile problem two ways and asserts numerical positions agree within 1e-4', () => {
    const env = createInitialEnvironment();
    evaluate('State := record { x, y, vx, vy }', env);

    // 1. Simulation step (exact acceleration integration for constant gravity g = 9.8)
    evaluate('proj_step(s, dt) := State(x: s.x + s.vx * dt, y: s.y + s.vy * dt - 0.5 * 9.8 * dt^2, vx: s.vx, vy: s.vy - 9.8 * dt)', env);
    evaluate('s0 := State(x: 0, y: 0, vx: 10, vy: 20)', env);
    evaluate('sim_traj := simulate(proj_step, s0, t in 0..4, dt: 0.05)', env);

    // 2. Closed form solution
    evaluate('proj_closed(t) := State(x: 10 * t, y: 20 * t - 0.5 * 9.8 * t^2, vx: 10, vy: 20 - 9.8 * t)', env);
    evaluate('closed_traj := closed_form(proj_closed, t in 0..4, dt: 0.05)', env);

    const { value: simVal } = evaluate('sim_traj', env);
    const { value: closedVal } = evaluate('closed_traj', env);

    expect(simVal.type).toBe('trajectory');
    expect(closedVal.type).toBe('trajectory');

    if (simVal.type === 'trajectory' && closedVal.type === 'trajectory') {
      expect(simVal.samples.length).toBe(closedVal.samples.length);

      for (let i = 0; i < simVal.samples.length; i++) {
        const sSim = simVal.samples[i].state;
        const sClosed = closedVal.samples[i].state;

        if (sSim.type === 'record' && sClosed.type === 'record') {
          const xSim = valueToNumber(sSim.fields.x);
          const ySim = valueToNumber(sSim.fields.y);
          const xClosed = valueToNumber(sClosed.fields.x);
          const yClosed = valueToNumber(sClosed.fields.y);

          expect(Math.abs(xSim - xClosed)).toBeLessThan(1e-4);
          expect(Math.abs(ySim - yClosed)).toBeLessThan(1e-4);
        }
      }
    }
  });

  it('records source metadata on the resulting trajectory', () => {
    const env = createInitialEnvironment();
    evaluate('my_step(x, dt) := x + dt', env);
    evaluate('traj_sim := simulate(my_step, 0, t in 0..1, dt: 0.1)', env);
    evaluate('traj_closed := closed_form(t -> t, t in 0..1, dt: 0.1)', env);

    const { value: sSrc } = evaluate('traj_sim.source', env);
    expect(sSrc).toEqual({ type: 'string', value: 'simulate' });

    const { value: cSrc } = evaluate('traj_closed.source', env);
    expect(cSrc).toEqual({ type: 'string', value: 'closed_form' });
  });
});
