import { describe, it, expect } from 'vitest';
import { parseFrontMatter, exportToHtml, exportToMarkdown } from '../document/exporter';
import { DocumentLineRecord } from '../document/document_state';
import { GraphSpec } from '../core/types';

describe('Phase 13 Part E: Export (HTML, PDF Print View, Markdown)', () => {
  it('correctly parses YAML front matter and body', () => {
    const doc = `---
title: Problem Set 4
course: MATH 225
author: Noah Slayton
date: 2026-09-14
---

# Section 1
x := 10
`;
    const { frontMatter, body } = parseFrontMatter(doc);
    expect(frontMatter.title).toBe('Problem Set 4');
    expect(frontMatter.course).toBe('MATH 225');
    expect(frontMatter.author).toBe('Noah Slayton');
    expect(frontMatter.date).toBe('2026-09-14');
    expect(body).toContain('# Section 1');
    expect(body).toContain('x := 10');
  });

  it('generates a self-contained HTML export with front matter header, typeset math, and embedded SVG plots', () => {
    const docText = `---
title: Energy Conservation Test
course: PHYS 101
author: Noah Slayton
---

# Setup
m := 2.5
E := (1/2) * m * (10^2)
plot(t, sin(t))
`;

    const graphSpec: GraphSpec = {
      dimensionality: 1,
      kind: 'curve',
      domain: { var: 't', min: 0, max: 6.28, isDefault: false },
      series: [
        {
          expr: null as any,
          variable: 't',
          label: 'sin(t)',
          color: '#00e5ff',
          explicitPoints: [
            { x: 0, y: 0, valid: true },
            { x: 1.57, y: 1, valid: true },
            { x: 3.14, y: 0, valid: true },
            { x: 4.71, y: -1, valid: true },
            { x: 6.28, y: 0, valid: true },
          ],
        },
      ],
    };

    const records: DocumentLineRecord[] = [
      { lineIndex: 0, text: '---', classification: { state: 'FRONTMATTER' } as any, durationMs: 0 },
      { lineIndex: 1, text: 'title: Energy Conservation Test', classification: { state: 'FRONTMATTER' } as any, durationMs: 0 },
      { lineIndex: 2, text: 'course: PHYS 101', classification: { state: 'FRONTMATTER' } as any, durationMs: 0 },
      { lineIndex: 3, text: 'author: Noah Slayton', classification: { state: 'FRONTMATTER' } as any, durationMs: 0 },
      { lineIndex: 4, text: '---', classification: { state: 'FRONTMATTER' } as any, durationMs: 0 },
      { lineIndex: 5, text: '', classification: { state: 'EMPTY' } as any, durationMs: 0 },
      { lineIndex: 6, text: '# Setup', classification: { state: 'COMMENT' } as any, durationMs: 0 },
      { lineIndex: 7, text: 'm := 2.5', classification: { state: 'COMPLETE' } as any, result: { type: 'rational', n: 5n, d: 2n }, durationMs: 1 },
      { lineIndex: 8, text: 'E := (1/2) * m * (10^2)', classification: { state: 'COMPLETE' } as any, result: { type: 'rational', n: 125n, d: 1n }, durationMs: 1 },
      { lineIndex: 9, text: 'plot(t, sin(t))', classification: { state: 'COMPLETE' } as any, result: { type: 'graph', spec: graphSpec } as any, durationMs: 2 },
    ];

    const html = exportToHtml('energy_test.ax', docText, records, 'dark');

    // Assert standalone HTML
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<h1 class="export-title">Energy Conservation Test</h1>');
    expect(html).toContain('<strong>Course:</strong> PHYS 101');
    expect(html).toContain('<strong>Author:</strong> Noah Slayton');

    // Assert embedded SVG plot
    expect(html).toContain('<svg');
    expect(html).toContain('export-plot-container');

    // Assert typeset math
    expect(html).toContain('export-math-result');
    expect(html).toContain('tm-num');
    expect(html).toContain('tm-den');

    // Assert zero external dependencies
    expect(html).not.toContain('<script src=');
    expect(html).not.toContain('<link rel="stylesheet" href=');
  });

  it('generates a clean Markdown export with front matter, code blocks, and linked plot assets', () => {
    const docText = `---
title: Harmonic Oscillator
author: Noah Slayton
---

# Problem Statement
omega := 2.0
x0 := 1.0
plot(t, cos(omega * t))
`;

    const graphSpec: GraphSpec = {
      dimensionality: 1,
      kind: 'curve',
      domain: { var: 't', min: 0, max: 10, isDefault: false },
      series: [
        {
          expr: null as any,
          variable: 't',
          label: 'cos(omega * t)',
          color: '#38bdf8',
          explicitPoints: [
            { x: 0, y: 1, valid: true },
            { x: 3.14, y: -1, valid: true },
          ],
        },
      ],
    };

    const records: DocumentLineRecord[] = [
      { lineIndex: 0, text: '---', classification: { state: 'FRONTMATTER' } as any, durationMs: 0 },
      { lineIndex: 1, text: 'title: Harmonic Oscillator', classification: { state: 'FRONTMATTER' } as any, durationMs: 0 },
      { lineIndex: 2, text: 'author: Noah Slayton', classification: { state: 'FRONTMATTER' } as any, durationMs: 0 },
      { lineIndex: 3, text: '---', classification: { state: 'FRONTMATTER' } as any, durationMs: 0 },
      { lineIndex: 4, text: '', classification: { state: 'EMPTY' } as any, durationMs: 0 },
      { lineIndex: 5, text: '# Problem Statement', classification: { state: 'COMMENT' } as any, durationMs: 0 },
      { lineIndex: 6, text: 'omega := 2.0', classification: { state: 'COMPLETE' } as any, result: { type: 'float', value: 2.0 }, durationMs: 1 },
      { lineIndex: 7, text: 'x0 := 1.0', classification: { state: 'COMPLETE' } as any, result: { type: 'float', value: 1.0 }, durationMs: 1 },
      { lineIndex: 8, text: 'plot(t, cos(omega * t))', classification: { state: 'COMPLETE' } as any, result: { type: 'graph', spec: graphSpec } as any, durationMs: 2 },
    ];

    const { markdown, plotImages } = exportToMarkdown('harmonic.ax', docText, records);

    expect(markdown).toContain('title: Harmonic Oscillator');
    expect(markdown).toContain('# Harmonic Oscillator');
    expect(markdown).toContain('# Problem Statement');
    expect(markdown).toContain('```axine');
    expect(markdown).toContain('omega := 2.0');
    expect(markdown).toContain('// => 2');
    expect(markdown).toContain('![Plot Line 9](plots/plot_L9.svg)');

    expect(plotImages.length).toBe(1);
    expect(plotImages[0].filename).toBe('plot_L9.svg');
    expect(plotImages[0].svgString).toContain('<svg');
  });
});
