import * as fs from 'fs';
import { parse } from '../src/core/parser';
import { Evaluator, createInitialEnvironment } from '../src/core/evaluator';

const content = fs.readFileSync('documents/projectile.mathdoc', 'utf-8');
const env = createInitialEnvironment();

console.log('=== Step-by-Step Evaluator Output for projectile.mathdoc ===\n');

// Parse the whole document as a sequence of statements or line-by-line
// Note: handle the multi-line claim block as a single statement
const lines = content.split('\n');
let blockAcc = '';
let inBlock = false;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const trimmed = line.trim();
  if (!trimmed || (trimmed.startsWith('//') && !inBlock)) continue;

  if (trimmed.startsWith('claim ') || trimmed.includes('{')) {
    inBlock = true;
  }

  if (inBlock) {
    blockAcc += line + '\n';
    if (trimmed.includes('}')) {
      inBlock = false;
      evaluateStatement(blockAcc, i + 1);
      blockAcc = '';
    }
  } else {
    evaluateStatement(line, i + 1);
  }
}

function evaluateStatement(stmt: string, lineNum: number) {
  try {
    const ast = parse(stmt);
    const evaluator = new Evaluator(env);
    const result = evaluator.evaluate(ast);
    console.log(`[Line ${lineNum}] SUCCESS: ${stmt.trim().split('\n')[0]}`);
    if (result && result.type === 'derivation') {
      console.log(`  -> Derivation:`, result.targetVar, '=', result.roots);
    } else if (result && result.type === 'claim') {
      console.log(`  -> Claim ${result.name} (Kind ${result.kind}): verified=${result.verified}`);
      console.log(`     Relevance: "${result.relevance}"`);
    } else if (result && result.type === 'float') {
      console.log(`  -> Float Value:`, result.value);
    } else if (result && result.type === 'function') {
      console.log(`  -> Function Defined: ${result.name}(${result.params.join(', ')})`);
    } else {
      console.log(`  -> Result:`, result);
    }
  } catch (err: any) {
    console.log(`[Line ${lineNum}] ERROR: ${stmt.trim().split('\n')[0]}`);
    console.log(`  -> Error:`, err.message);
  }
}
