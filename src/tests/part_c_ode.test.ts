import { describe, it, expect } from 'vitest';
import { evaluate, createInitialEnvironment } from '../core/evaluator';
import { valueToNumber } from '../core/numeric/tower';
import { classifyODE } from '../core/simulation/ode_solver';
import { parse } from '../core/parser';

describe('Phase 12 Part A.2 & Gate E3: ode() with RK4 and Classification', () => {
  it('classifies dy//dt = -2*y and generates symbolic derivation steps', () => {
    const parsed = parse("dy//dt = -2 * y");
    const classification = classifyODE(parsed, 'y', 't');

    expect(classification.type).toBe('linear_first_order');
    expect(classification.description).toBe('First-order linear autonomous ODE (separable)');
    expect(classification.derivation).toBeDefined();
    if (classification.derivation) {
      expect(classification.derivation.steps.length).toBe(4);
      expect(classification.derivation.steps[0].rule).toBe('separation-of-variables');
      expect(classification.derivation.steps[1].rule).toBe('integrate-both-sides');
    }
  });

  it('solves dy/dt = -2y, y(0) = 1 over 0..2, confirms RK4 error is bounded by C*dt^4', () => {
    const env1 = createInitialEnvironment();
    evaluate('traj1 := ode(dy//dt = -2 * y, y(0) = 1, t in 0..2, dt: 0.05)', env1);

    const { value: trajVal1 } = evaluate('traj1', env1);
    expect(trajVal1.type).toBe('trajectory');

    if (trajVal1.type === 'trajectory') {
      expect(trajVal1.sourceInfo.source).toBe('ode');
      expect(trajVal1.sourceInfo.integrator).toBe('rk4');
      expect(trajVal1.sourceInfo.errorEstimate).toBeDefined();

      const err1 = trajVal1.sourceInfo.errorEstimate!;
      expect(err1).toBeGreaterThan(0);
      // For dt = 0.05, O(dt^4) ~= (0.05)^4 = 6.25e-6
      expect(err1).toBeLessThan(1e-4);

      // Value at t = 2: exact is e^(-4) ~= 0.01831563888873418
      const { value: yEndVal1 } = evaluate('traj1[2]', env1);
      const yEnd1 = valueToNumber(yEndVal1);
      const exactEnd = Math.exp(-4);
      const actualErr1 = Math.abs(yEnd1 - exactEnd);
      expect(actualErr1).toBeLessThan(1e-4);

      // Now solve with dt = 0.025 (half step size) to confirm O(dt^4) convergence
      const env2 = createInitialEnvironment();
      evaluate('traj2 := ode(dy//dt = -2 * y, y(0) = 1, t in 0..2, dt: 0.025)', env2);
      const { value: trajVal2 } = evaluate('traj2', env2);
      if (trajVal2.type === 'trajectory') {
        const { value: yEndVal2 } = evaluate('traj2[2]', env2);
        const yEnd2 = valueToNumber(yEndVal2);
        const actualErr2 = Math.abs(yEnd2 - exactEnd);

        // 4th order error reduction: error should drop by roughly 16x (ratio ~ 16)
        const errorReductionRatio = actualErr1 / actualErr2;
        expect(errorReductionRatio).toBeGreaterThan(14);
        expect(errorReductionRatio).toBeLessThan(18);
      }
    }
  });
});
