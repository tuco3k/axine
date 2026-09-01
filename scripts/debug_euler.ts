import { createInitialEnvironment, Evaluator } from '../src/core/evaluator';
import { parseProgram } from '../src/core/parser';
import * as fs from 'fs';
import * as path from 'path';

const content = fs.readFileSync(path.resolve(process.cwd(), 'documents', 'integrator_comparison.ax'), 'utf-8');
const env = createInitialEnvironment();
const evaluator = new Evaluator(env, content);
const ast = parseProgram(content);

if (ast.type === 'Block') {
  for (const stmt of ast.statements) {
    (evaluator as any).evalNode(stmt, env);
  }
}

console.log('b_e10:', env['b_e10']);
console.log('E_euler_10:', env['E_euler_10']);
console.log('drift_euler:', env['drift_euler']);
console.log('drift_verlet:', env['drift_verlet']);
console.log('drift_rk4:', env['drift_rk4']);
