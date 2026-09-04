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

    // Assert embedded SVG plot with axis labels and no duplicate legend for 1 series
    expect(html).toContain('<svg');
    expect(html).toContain('export-plot-container');
    expect(html).toContain('t (s)');
    expect(html).not.toContain('class="svg-legend"');

    // Assert typeset math and inline fraction
    expect(html).toContain('export-math-result');
    expect(html).toContain('tm-num');
    expect(html).toContain('5/2');

    // Assert source lines are typeset, not monospace
    expect(html).toContain('export-source-typeset');
    expect(html).toContain('tm-var');
    expect(html).toContain('tm-rel');

    // Assert comments render as prose
    expect(html).toContain('export-prose-comment');
    expect(html).toContain('Setup');

    // Assert zero external dependencies
    expect(html).not.toContain('<script src=');
    expect(html).not.toContain('<link rel="stylesheet" href=');
  });

  it('preserves whitespace and proper word separation in exported results and records', () => {
    const records: DocumentLineRecord[] = [
      {
        lineIndex: 0,
        text: 'import "physics.ax"',
        classification: { state: 'COMPLETE' } as any,
        result: {
          type: 'module',
          name: 'physics',
          exports: { Body: {}, Particle: {}, gravity_force: {} },
        } as any,
        durationMs: 1,
      },
      {
        lineIndex: 1,
        text: 'b := Body(mass: 1, position: (0, 0), velocity: (10, 15))',
        classification: { state: 'COMPLETE' } as any,
        result: {
          type: 'record',
          typeName: 'Body',
          fields: {
            mass: { type: 'rational', n: 1n, d: 1n },
            position: { type: 'tuple', elements: [{ type: 'rational', n: 0n, d: 1n }, { type: 'rational', n: 0n, d: 1n }] },
            velocity: { type: 'tuple', elements: [{ type: 'rational', n: 10n, d: 1n }, { type: 'rational', n: 15n, d: 1n }] },
          },
        } as any,
        durationMs: 1,
      },
      {
        lineIndex: 2,
        text: 'traj := simulate(b, 0..3)',
        classification: { state: 'COMPLETE' } as any,
        result: {
          type: 'trajectory',
          stateKind: 'Scalar',
          tStart: 0,
          tEnd: 3,
          samples: new Array(61).fill({ t: 0, state: { type: 'rational', n: 0n, d: 1n } }),
        } as any,
        durationMs: 1,
      },
      {
        lineIndex: 3,
        text: 'p_exact := (20, 52/5)',
        classification: { state: 'COMPLETE' } as any,
        result: {
          type: 'tuple',
          elements: [{ type: 'rational', n: 20n, d: 1n }, { type: 'rational', n: 52n, d: 5n }],
        } as any,
        durationMs: 1,
      },
    ];

    const html = exportToHtml('physics_test.ax', 'import "physics.ax"\nb\ntraj\np_exact\n', records, 'light');

    // Assert word separation
    const plainText = html.replace(/<[^>]+>/g, '');
    expect(plainText).toContain('module physics { Body, Particle, gravity_force }');
    expect(plainText).toContain('Body(mass: 1, position: (0, 0), velocity: (10, 15))');
    expect(plainText).toContain('Trajectory(Scalar, 0..3, 61 samples)');

    // Assert fraction inside tuple contains inline fraction 52/5
    expect(plainText).toContain('52/5');
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

  it('asserts exact rational in export contains 52/5 as a contiguous string', () => {
    const docText = `p_exact := (20, 52/5)\nKE := 3029/50\n`;
    const records: DocumentLineRecord[] = [
      {
        lineIndex: 0,
        text: 'p_exact := (20, 52/5)',
        classification: { state: 'COMPLETE' } as any,
        result: {
          type: 'tuple',
          elements: [{ type: 'rational', n: 20n, d: 1n }, { type: 'rational', n: 52n, d: 5n }],
        } as any,
        durationMs: 1,
      },
      {
        lineIndex: 1,
        text: 'KE := 3029/50',
        classification: { state: 'COMPLETE' } as any,
        result: { type: 'rational', n: 3029n, d: 50n },
        durationMs: 1,
      },
    ];

    const html = exportToHtml('fractions_test.ax', docText, records, 'light');
    const plainText = html.replace(/<[^>]+>/g, '');

    // Assert exact rational appears as a contiguous string "52/5" and "3029/50"
    expect(plainText).toContain('52/5');
    expect(plainText).toContain('3029/50');
  });

  it('asserts an identifier containing an underscore round-trips through export unchanged', () => {
    const docText = `y_pos := map(b -> b.position[1], traj)\ngraph(y_pos)\nball_at_2 := traj[2.0]\nspring_force_fn := (b) -> (-k * b.position[0], 0.0)\n`;
    const records: DocumentLineRecord[] = [
      {
        lineIndex: 0,
        text: 'y_pos := map(b -> b.position[1], traj)',
        classification: { state: 'COMPLETE' } as any,
        result: { type: 'trajectory', stateKind: 'Scalar', tStart: 0, tEnd: 3, samples: [] } as any,
        durationMs: 1,
      },
      {
        lineIndex: 1,
        text: 'graph(y_pos)',
        classification: { state: 'COMPLETE' } as any,
        result: { type: 'graph', spec: { dimensionality: 1, kind: 'curve', series: [] } } as any,
        durationMs: 1,
      },
      {
        lineIndex: 2,
        text: 'ball_at_2 := traj[2.0]',
        classification: { state: 'COMPLETE' } as any,
        result: { type: 'record', typeName: 'Body', fields: {} } as any,
        durationMs: 1,
      },
      {
        lineIndex: 3,
        text: 'spring_force_fn := (b) -> (-k * b.position[0], 0.0)',
        classification: { state: 'COMPLETE' } as any,
        result: { type: 'function', name: 'spring_force_fn', params: ['b'], body: {} as any },
        durationMs: 1,
      },
    ];

    const html = exportToHtml('identifiers_test.ax', docText, records, 'light');
    const plainText = html.replace(/<[^>]+>/g, '');

    // Assert underscore identifiers round-trip completely intact
    expect(plainText).toContain('y_pos');
    expect(plainText).toContain('graph(y_pos)');
    expect(plainText).toContain('ball_at_2');
    expect(plainText).toContain('spring_force_fn');
  });

  it('asserts full derivation steps, justifications, rules, and branch forks are exported by default, and collapsed when configured', async () => {
    const { evaluate, createInitialEnvironment } = await import('../core/evaluator');

    const env = createInitialEnvironment();
    const res1 = evaluate('isolate(x^2 - 5x + 6 = 0, for: x)', env);
    const res2 = evaluate('isolate(x^2 = 4, for: x)', env);
    const res3 = evaluate('simplify((x^2 - 1)/(x - 1))', env);
    const res4 = evaluate('d//dx (x^3 * sin x)', env);
    const res5 = evaluate('check(3/4 * pi * r^2, is: "sphere volume")', env);

    const records: DocumentLineRecord[] = [
      { lineIndex: 0, text: 'isolate(x^2 - 5x + 6 = 0, for: x)', classification: { state: 'COMPLETE' } as any, result: res1.value, durationMs: 2 },
      { lineIndex: 1, text: 'isolate(x^2 = 4, for: x)', classification: { state: 'COMPLETE' } as any, result: res2.value, durationMs: 2 },
      { lineIndex: 2, text: 'simplify((x^2 - 1)/(x - 1))', classification: { state: 'COMPLETE' } as any, result: res3.value, durationMs: 2 },
      { lineIndex: 3, text: 'd//dx (x^3 * sin x)', classification: { state: 'COMPLETE' } as any, result: res4.value, durationMs: 2 },
      { lineIndex: 4, text: 'check(3/4 * pi * r^2, is: "sphere volume")', classification: { state: 'COMPLETE' } as any, result: res5.value, durationMs: 2 },
    ];

    const docText = `isolate(x^2 - 5x + 6 = 0, for: x)\nisolate(x^2 = 4, for: x)\nsimplify((x^2 - 1)/(x - 1))\nd//dx (x^3 * sin x)\ncheck(3/4 * pi * r^2, is: "sphere volume")\n`;

    // 1. Default (Expanded) export
    const htmlExpanded = exportToHtml('deriv_test.ax', docText, records, 'light');
    expect(htmlExpanded).toContain('export-deriv-tree');
    expect(htmlExpanded).toContain('export-step-card');
    expect(htmlExpanded).toContain('factor');
    expect(htmlExpanded).toContain('cancel-common-factor');
    expect(htmlExpanded).toContain('take-root');
    expect(htmlExpanded).toContain('Branch');
    expect(htmlExpanded).toContain('export-deriv-forks');
    expect(htmlExpanded).toContain('power-rule');
    expect(htmlExpanded).toContain('product-rule');
    expect(htmlExpanded).toContain('Canonical Derivation Steps');

    // 2. Collapsed export (steps: collapsed)
    const collapsedDocText = `---\nsteps: collapsed\n---\n${docText}`;
    const collapsedRecords: DocumentLineRecord[] = [
      { lineIndex: 0, text: '---', classification: { state: 'FRONTMATTER' } as any, durationMs: 0 },
      { lineIndex: 1, text: 'steps: collapsed', classification: { state: 'FRONTMATTER' } as any, durationMs: 0 },
      { lineIndex: 2, text: '---', classification: { state: 'FRONTMATTER' } as any, durationMs: 0 },
      ...records.map((r, i) => ({ ...r, lineIndex: i + 3 })),
    ];
    const htmlCollapsed = exportToHtml('deriv_test_collapsed.ax', collapsedDocText, collapsedRecords, 'light');
    expect(htmlCollapsed).not.toContain('class="export-deriv-tree"');
    expect(htmlCollapsed).not.toContain('class="export-deriv-forks"');
    expect(htmlCollapsed).toContain('export-math-result');
  });
});
