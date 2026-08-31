import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Part 3.4: Zero Emoji & UI Symbol Literal Enforcement', () => {
  const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE0F}]/u;

  function scanDir(dir: string, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
          scanDir(fullPath, fileList);
        }
      } else if (file.endsWith('.ts') || file.endsWith('.css') || file.endsWith('.html')) {
        fileList.push(fullPath);
      }
    }
    return fileList;
  }

  it('asserts zero literal emoji or symbol block characters in any src/ file', () => {
    const srcDir = path.resolve(__dirname, '..');
    const files = scanDir(srcDir);
    const violations: { file: string; line: number; match: string; text: string }[] = [];

    for (const file of files) {
      if (file.endsWith('no_emoji.test.ts')) continue; // Skip test file containing regex
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        const match = line.match(emojiPattern);
        if (match) {
          violations.push({
            file: path.relative(srcDir, file),
            line: idx + 1,
            match: match[0],
            text: line.trim(),
          });
        }
      });
    }

    if (violations.length > 0) {
      const summary = violations.map(v => `${v.file}:${v.line} matched '${v.match}' in: ${v.text}`).join('\n');
      expect.fail(`Found ${violations.length} emoji/symbol literal violations in src/:\n${summary}`);
    }

    expect(violations.length).toBe(0);
  });
});
