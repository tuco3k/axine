import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Architectural Invariant: Zero MathLive Imports in Language Core (src/core/)', () => {
  function scanDir(dir: string, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        scanDir(fullPath, fileList);
      } else if (file.endsWith('.ts') || file.endsWith('.js')) {
        fileList.push(fullPath);
      }
    }
    return fileList;
  }

  it('asserts that zero files in src/core import or reference mathlive', () => {
    const coreDir = path.resolve(__dirname, '../core');
    const files = scanDir(coreDir);
    const violations: { file: string; line: number; text: string }[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (/from\s+['"]mathlive['"]|import\s*\(['"]mathlive['"]\)|['"]mathlive['"]/.test(line)) {
          violations.push({
            file: path.relative(coreDir, file),
            line: idx + 1,
            text: line.trim(),
          });
        }
      });
    }

    if (violations.length > 0) {
      const summary = violations.map(v => `${v.file}:${v.line} -> ${v.text}`).join('\n');
      expect.fail(`Found ${violations.length} forbidden MathLive imports in src/core:\n${summary}`);
    }

    expect(violations.length).toBe(0);
  });
});
