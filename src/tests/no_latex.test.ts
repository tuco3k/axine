import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Part 9.3: Zero LaTeX Command In String Literals Enforcement', () => {
  // Matches any backslash LaTeX command in string literals: \int, \frac, \mathrm, \lim, \Delta, \sum, \partial, \infty, \to
  const latexPattern = /\\(int|frac|mathrm|lim|Delta|sum|partial|infty|to)\b/;

  function scanDir(dir: string, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
          scanDir(fullPath, fileList);
        }
      } else if (file.endsWith('.ts')) {
        fileList.push(fullPath);
      }
    }
    return fileList;
  }

  it('asserts zero literal LaTeX backslash commands in any src/ file', () => {
    const srcDir = path.resolve(__dirname, '..');
    const files = scanDir(srcDir);
    const violations: { file: string; line: number; match: string; text: string }[] = [];

    for (const file of files) {
      if (file.endsWith('no_latex.test.ts')) continue; // Skip test file itself
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        const match = line.match(latexPattern);
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
      expect.fail(`Found ${violations.length} LaTeX command violations in src/:\n${summary}`);
    }

    expect(violations.length).toBe(0);
  });

  it('asserts zero unrendered bare _, ^, {, or } in rendered explainer outputs', async () => {
    const { explainSymbol, getRiemannRuleExplanation } = await import('../core/explainer');
    const contexts = [
      explainSymbol('dx', { parentType: 'integral', integrand: 'x^2', variableName: 'x' }),
      explainSymbol('dx', { parentType: 'derivative', variableName: 'x' }),
      explainSymbol('\u2202', { parentType: 'derivative', variableName: 'x' }),
      explainSymbol('\u222b', { parentType: 'integral' }),
      explainSymbol('\u03a3', { parentType: 'summation' }),
      explainSymbol('lim', { parentType: 'limit' }),
    ];

    const ruleTexts = [
      getRiemannRuleExplanation('left', 'x'),
      getRiemannRuleExplanation('midpoint', 'x'),
      getRiemannRuleExplanation('right', 'x'),
    ];

    for (const exp of contexts) {
      for (const key of ['whatItIs', 'whyItIsHere', 'showMe', 'goDeeper', 'role'] as const) {
        const html = exp[key];
        // Strip out HTML tags to examine remaining text content
        const text = html.replace(/<[^>]+>/g, '');
        // Assert no bare _, ^, {, or } in text
        expect(text).not.toContain('_');
        expect(text).not.toContain('^');
        expect(text).not.toContain('{');
        expect(text).not.toContain('}');
      }
    }

    for (const html of ruleTexts) {
      const text = html.replace(/<[^>]+>/g, '');
      expect(text).not.toContain('_');
      expect(text).not.toContain('^');
      expect(text).not.toContain('{');
      expect(text).not.toContain('}');
    }
  });
});
