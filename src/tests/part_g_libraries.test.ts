import { describe, it, expect } from 'vitest';
import { createInitialEnvironment, Evaluator } from '../core/evaluator';
import { parseProgram } from '../core/parser';
import * as fs from 'fs';
import * as path from 'path';

describe('Part G: Three Domain Libraries and Worked Problems (Gate G)', () => {
  it('loads and runs physics.axine with physics_problem.axine', () => {
    const filePath = path.resolve(process.cwd(), 'documents', 'physics_problem.axine');
    const source = fs.readFileSync(filePath, 'utf-8');

    const env = createInitialEnvironment();
    const evaluator = new Evaluator(env, source);
    const ast = parseProgram(source);

    if (ast.type === 'Block') {
      for (const stmt of ast.statements) {
        evaluator['evalNode'](stmt, env);
      }
    } else {
      evaluator['evalNode'](ast, env);
    }

    expect(env.merged_mass).toEqual({ type: 'rational', n: 5n, d: 1n });
    expect(env.merged_vx).toEqual({ type: 'rational', n: 1n, d: 1n });
    expect(env.ke_lost).toEqual({ type: 'rational', n: 135n, d: 1n }); // initial KE (100+37.5=137.5) - final KE (2.5) = 135
  });

  it('loads and runs statistics.axine with statistics_problem.axine', () => {
    const filePath = path.resolve(process.cwd(), 'documents', 'statistics_problem.axine');
    const source = fs.readFileSync(filePath, 'utf-8');

    const env = createInitialEnvironment();
    const evaluator = new Evaluator(env, source);
    const ast = parseProgram(source);

    if (ast.type === 'Block') {
      for (const stmt of ast.statements) {
        evaluator['evalNode'](stmt, env);
      }
    } else {
      evaluator['evalNode'](ast, env);
    }

    // Check z-statistic: (105 - 100) / (15 / sqrt(36)) = 5 / (15 / 6) = 5 / 2.5 = 2
    expect(env.observed_z).toEqual({ type: 'rational', n: 2n, d: 1n });
    expect(env.null_hypothesis_value).toEqual({ type: 'rational', n: 100n, d: 1n });
  });

  it('loads and runs linear.axine with linear_problem.axine', () => {
    const filePath = path.resolve(process.cwd(), 'documents', 'linear_problem.axine');
    const source = fs.readFileSync(filePath, 'utf-8');

    const env = createInitialEnvironment();
    const evaluator = new Evaluator(env, source);
    const ast = parseProgram(source);

    if (ast.type === 'Block') {
      for (const stmt of ast.statements) {
        evaluator['evalNode'](stmt, env);
      }
    } else {
      evaluator['evalNode'](ast, env);
    }

    // Check Gram-Schmidt orthogonality: dot_prod(u1, u2) == 0
    expect(env.orthogonality_check).toEqual({ type: 'rational', n: 0n, d: 1n });
    expect(env.u2).toEqual({
      type: 'tuple',
      elements: [
        { type: 'rational', n: 1n, d: 2n },
        { type: 'rational', n: -1n, d: 2n },
        { type: 'rational', n: 2n, d: 1n },
      ],
    });
  });
});
