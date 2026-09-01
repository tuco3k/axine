import { describe, it, expect } from 'vitest';
import { evaluate, Evaluator, createInitialEnvironment, resolveModuleCode } from '../core/evaluator';

describe('Unified Module Resolution in Browser and Node', () => {
  it('resolves bundled documents without filesystem access', () => {
    const res = resolveModuleCode('physics.ax');
    expect('code' in res).toBe(true);
    if ('code' in res) {
      expect(res.canonicalPath).toBe('physics.ax');
      expect(res.code).toContain('module physics');
    }
  });

  it('resolves relative import paths "./physics.ax" and "documents/physics.ax"', () => {
    const res1 = resolveModuleCode('./physics.ax');
    const res2 = resolveModuleCode('documents/physics.ax');
    const res3 = resolveModuleCode('physics');

    expect('code' in res1).toBe(true);
    expect('code' in res2).toBe(true);
    expect('code' in res3).toBe(true);
  });

  it('reports missing module and lists all searched paths', () => {
    const env = createInitialEnvironment();
    expect(() => evaluate('import "missing_library_xyz.ax"', env)).toThrowError(
      /Cannot find module 'missing_library_xyz\.ax'\. Looked for:.*missing_library_xyz\.ax/
    );
  });

  it('rejects cyclic module imports naming all participating files', () => {
    Evaluator.virtualFiles.set('mod_alpha.ax', 'import "mod_beta.ax"');
    Evaluator.virtualFiles.set('mod_beta.ax', 'import "mod_alpha.ax"');

    const env = createInitialEnvironment();
    expect(() => evaluate('import "mod_alpha.ax"', env)).toThrowError(
      /Cyclic module import detected: mod_alpha\.ax -> mod_beta\.ax -> mod_alpha\.ax/
    );
  });

  it('evaluates physics.ax and exports all symbols into importing environment', () => {
    const env = createInitialEnvironment();
    evaluate('import "physics.ax"', env);

    expect(env.Body).toBeDefined();
    expect(env.euler_step).toBeDefined();
    expect(env.verlet_step).toBeDefined();
    expect(env.rk4_step).toBeDefined();
    expect(env.kinetic_energy).toBeDefined();
    expect(env.momentum).toBeDefined();
  });
});
