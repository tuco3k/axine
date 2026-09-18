import { processDocumentLines } from '../src/core/worker';
import { formatValue } from '../src/document/editor';
import { SpaceValue } from '../src/core/types';
import { Evaluator } from '../src/core/evaluator';
import fs from 'fs';
import path from 'path';

Evaluator.setFsModule(fs, path);

export function runAxineDoc(code: string, baseDir?: string): Array<{ lineIdx: number; line: string; state: string; output: string; rawResult?: any }> {
  if (baseDir) {
    Evaluator.setBaseDir(baseDir);
  }
  const lines = code.split('\n');
  const results: Array<{ lineIdx: number; line: string; state: string; output: string; rawResult?: any }> = [];

  processDocumentLines(1, lines, (msg) => {
    let output = '';
    if (msg.error) {
      output = `ERROR: ${msg.error.message}`;
    } else if (msg.result) {
      if (msg.result.type === 'space') {
        const space = msg.result as SpaceValue;
        if (space.declaredAxes) {
          output = `Space (${space.declaredAxes.join(', ')}, ${space.entities.length} entities)`;
        } else if (space.dimension > 0) {
          output = `${space.dimension}D Space (${space.coordinates.join(', ')})`;
        } else if (space.resultVal) {
          output = formatValue(space.resultVal);
        } else {
          output = '0D Space';
        }
      } else {
        output = formatValue(msg.result);
      }
    } else {
      output = msg.classification.state;
    }

    results.push({
      lineIdx: msg.lineIndex,
      line: msg.line,
      state: msg.classification.state,
      output,
      rawResult: msg.result,
    });
  });

  return results;
}

if (process.argv[2]) {
  const filePath = path.resolve(process.argv[2]);
  const baseDir = path.dirname(filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  const res = runAxineDoc(content, baseDir);
  for (const r of res) {
    if (r.state === 'PROSE' && r.line.trim().startsWith('#')) {
      console.log(`L${r.lineIdx + 1}: ${r.line}`);
    } else if (r.state === 'PROSE' && !r.line.trim()) {
      // empty
    } else {
      console.log(`L${r.lineIdx + 1}: ${r.line.padEnd(40)} => ${r.output}`);
    }
  }
}
