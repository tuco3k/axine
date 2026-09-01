import { describe, it, expect, beforeEach } from 'vitest';
import { evaluate, Evaluator, createInitialEnvironment } from '../core/evaluator';

describe('Part F: Modules', () => {
  beforeEach(() => {
    Evaluator.virtualFiles.clear();
  });

  it('Gate F: two files, one importing the other', () => {
    // Module file A
    Evaluator.virtualFiles.set(
      'kinematics.ax',
      `
module kinematics
export position, velocity, acceleration

position := (0, 0, 0)
velocity := (10, 0, 0)
acceleration := (0, -9.8, 0)
private_data := 42
`
    );

    // Importing file B
    const env = createInitialEnvironment();
    evaluate('import "kinematics.ax" as kin', env);

    const { value: vVal } = evaluate('kin.velocity', env);
    expect(vVal.type).toBe('tuple');
    if (vVal.type === 'tuple') {
      expect(vVal.elements[0]).toEqual({ type: 'rational', n: 10n, d: 1n });
    }

    // Private binding is not exported
    expect(() => evaluate('kin.private_data', env)).toThrowError(/Symbol 'private_data' is not exported/);
  });

  it('Gate F: rejects cyclic module imports naming both files', () => {
    Evaluator.virtualFiles.set(
      'module_a.ax',
      `
module module_a
import "module_b.ax"
export a_val
a_val := 1
`
    );

    Evaluator.virtualFiles.set(
      'module_b.ax',
      `
module module_b
import "module_a.ax"
export b_val
b_val := 2
`
    );

    const env = createInitialEnvironment();
    expect(() => evaluate('import "module_a.ax"', env)).toThrowError(/Cyclic module import detected.*module_a\.ax.*module_b\.ax/);
  });

  it('supports selective from-import syntax', () => {
    Evaluator.virtualFiles.set(
      'physics_helpers.ax',
      `
module physics_helpers
export speed_of_light
speed_of_light := 299792458
`
    );

    const env = createInitialEnvironment();
    evaluate('from "physics_helpers.ax" import speed_of_light', env);

    const { value: cVal } = evaluate('speed_of_light', env);
    expect(cVal).toEqual({ type: 'rational', n: 299792458n, d: 1n });
  });

  it('rejects network imports explicitly', () => {
    const env = createInitialEnvironment();
    expect(() => evaluate('import "https://cdn.example.com/math.ax"', env)).toThrowError(/Network imports are not allowed/);
  });
});
