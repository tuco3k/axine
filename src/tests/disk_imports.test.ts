import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Evaluator, createInitialEnvironment } from '../core/evaluator';
import { parseProgram } from '../core/parser';
import { valueToNumber } from '../core/numeric/tower';
import { Value } from '../core/types';
import * as fs from 'fs';
import * as path from 'path';

function evalDocument(source: string, env = createInitialEnvironment()): Record<string, Value> {
  const ast = parseProgram(source);
  if (ast.type === 'Block') {
    for (const stmt of ast.statements) {
      const evaluator = new Evaluator(env, source);
      (evaluator as any).evalNode(stmt, env);
    }
  } else {
    const evaluator = new Evaluator(env, source);
    (evaluator as any).evalNode(ast, env);
  }
  return env;
}

describe('Phase 13 Part C & Gate C: Module Imports from Disk & Resolution Order', () => {
  const testDir = path.resolve(process.cwd(), 'tmp_gate_c_test');

  beforeEach(() => {
    Evaluator.resetVirtualFiles();
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    Evaluator.setBaseDir(testDir);
  });

  afterEach(() => {
    Evaluator.resetVirtualFiles();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('resolves module imports relative to current file directory on disk', () => {
    // 1. Create helper.ax and importer.ax in testDir
    const helperContent = `
# Geometry helpers
area_circle(r) := 3.14159 * r^2
hypotenuse(a, b) := (a^2 + b^2)^(1/2)
`;
    fs.writeFileSync(path.join(testDir, 'geometry_helper.ax'), helperContent, 'utf-8');

    const importerContent = `
import "geometry_helper.ax"

c_area := area_circle(5)
h_val := hypotenuse(3, 4)
`;
    const env = evalDocument(importerContent);

    expect(env['c_area']).toBeDefined();
    expect(env['h_val']).toBeDefined();
    expect(valueToNumber(env['h_val'])).toBe(5);
  });

  it('fails with detailed resolution order and searched paths when imported file is moved or missing', () => {
    const importerContent = `
import "missing_physics_tool.ax"

x := 10
`;
    let thrownError: any = null;
    try {
      evalDocument(importerContent);
    } catch (e: any) {
      thrownError = e;
    }

    expect(thrownError).not.toBeNull();
    const message = thrownError.message || '';

    // Error must name the path and describe resolution order (disk first, stdlib second, listing paths)
    expect(message).toContain("Cannot find module 'missing_physics_tool.ax'");
    expect(message).toContain('1. Disk (relative to file directory):');
    expect(message).toContain('2. Stdlib (bundled virtual filesystem):');
    expect(message).toContain('missing_physics_tool.ax');
  });

  it('allows a disk file to import physics.ax from the stdlib without losing access', () => {
    // Disk file in testDir importing bundled stdlib physics.ax
    const diskFileContent = `
import "physics.ax"

b := Body(mass: 2, position: (0, 0), velocity: (10, 0))
ke := kinetic_energy(b)
`;
    const env = evalDocument(diskFileContent);

    expect(env['b']).toBeDefined();
    expect(env['ke']).toBeDefined();
    expect(valueToNumber(env['ke'])).toBe(100);
  });

  it('resolves disk files registered via directory handle in browser environment', () => {
    Evaluator.setDiskFiles({
      'custom_math.ax': `square(n) := n * n`,
    });

    const doc = `
import "custom_math.ax"
res := square(7)
`;
    const env = evalDocument(doc);
    expect(env['res']).toBeDefined();
    expect(valueToNumber(env['res'])).toBe(49);
  });
});
