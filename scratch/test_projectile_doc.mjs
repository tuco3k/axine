import * as fs from 'fs';
import { DocumentState } from '../src/document/document_state.js';

async function run() {
  const content = fs.readFileSync('documents/projectile.axine', 'utf-8');
  console.log('=== Running projectile.axine through DocumentState ===\n');

  const docState = new DocumentState(content);
  // Give evaluation worker / cycle a moment
  await new Promise(resolve => setTimeout(resolve, 800));

  const records = docState.getRecords();
  for (const rec of records) {
    console.log(`[Line ${rec.line}] Type: ${rec.type} | Text: "${rec.text}"`);
    if (rec.type === 'ERROR') {
      console.log(`   ERROR:`, rec.error?.message);
    } else if (rec.type === 'EVAL_RESULT') {
      if (rec.result) {
        if (rec.result.type === 'derivation') {
          console.log(`   DERIVATION (${rec.result.steps.length} steps): roots =`, JSON.stringify(rec.result.roots));
        } else if (rec.result.type === 'solve_trace') {
          console.log(`   SOLVE_TRACE (${rec.result.iterations.length} iters): root =`, rec.result.root);
        } else if (rec.result.type === 'claim') {
          console.log(`   CLAIM "${rec.result.name}": verified=${rec.result.verified}, relevance="${rec.result.relevance}"`);
        } else {
          console.log(`   RESULT:`, rec.result);
        }
      }
    }
  }
}

run();
