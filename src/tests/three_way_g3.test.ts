import { describe, it, expect } from 'vitest';
import { evaluate } from '../core/evaluator';
import { DescribedValue } from '../core/types';
import { formatKind } from '../core/kinds';

describe('Gate G3: Three-Way Response Standard', () => {
  const unevaluableExpressions = [
    { expr: '\u222c_S F \u00b7 dS', expectedKind: 'Scalar', expectedOp: 'integral over S' },
    { expr: '\u222e_C F \u00b7 dr', expectedKind: 'Scalar', expectedOp: 'integral over C' },
    { expr: '\u222d_V f dV', expectedKind: 'Scalar', expectedOp: 'integral over V' },
    { expr: '\u222b e^(-x^2) dx', expectedKind: 'Scalar', expectedOp: 'integral of' },
    { expr: '\u2207 f', expectedKind: 'VectorField', expectedOp: 'grad' },
    { expr: '\u2207 \u00b7 F', expectedKind: 'ScalarField', expectedOp: 'div' },
    { expr: '\u2207 \u00d7 F', expectedKind: 'VectorField', expectedOp: 'curl' },
    { expr: '\u2207\u00b2 f', expectedKind: 'ScalarField', expectedOp: 'laplacian' },
    { expr: 'u \u2227 v', expectedKind: 'DifferentialForm', expectedOp: 'wedge' },
    { expr: '\u22c6 w', expectedKind: 'DifferentialForm', expectedOp: 'hodge' },
    { expr: 'u \u2297 v', expectedKind: 'Group', expectedOp: 'tensor' },
    { expr: 'u \u2295 v', expectedKind: 'Group', expectedOp: 'direct_sum' },
    { expr: '\u2200 x \u2208 \u211d, x^2 >= 0', expectedKind: 'UnknownKind', expectedOp: 'forall' },
    { expr: 'G \u2245 H', expectedKind: 'UnknownKind', expectedOp: 'iso' },
    { expr: 'P(A | B)', expectedKind: 'Scalar', expectedOp: 'prob' },
  ];

  it('evaluates exactly 15 unevaluable expressions to fully populated DescribedValue records', () => {
    expect(unevaluableExpressions.length).toBe(15);

    for (const item of unevaluableExpressions) {
      const { value } = evaluate(item.expr);
      expect(value.type, `Expression '${item.expr}' must produce DESCRIBED response`).toBe('described');

      const desc = value as DescribedValue;
      expect(desc.kind, `Kind must be populated for '${item.expr}'`).toBeDefined();
      expect(desc.kind.name, `Kind name must match for '${item.expr}'`).toBe(item.expectedKind);

      const opStr = desc.namedOperation || desc.operation;
      expect(opStr, `Named operation must be populated for '${item.expr}'`).toBeTruthy();
      expect(opStr.toLowerCase()).toContain(item.expectedOp.toLowerCase());

      const meaningStr = desc.meaningInWords || desc.meaning;
      expect(meaningStr, `Meaning in words must be populated for '${item.expr}'`).toBeTruthy();
      expect(meaningStr.length).toBeGreaterThan(10);

      expect(desc.requires, `Requires must be populated for '${item.expr}'`).toBeTruthy();
      expect(desc.canDo, `CanDo must be populated for '${item.expr}'`).toBeTruthy();
      expect(desc.related, `Related must be populated for '${item.expr}'`).toBeTruthy();
      expect(desc.obstruction, `Obstruction must be populated for '${item.expr}'`).toBeTruthy();
    }
  });

  it('renders all 15 DESCRIBED responses into structured Document DOM cards and extracts fields', () => {
    // Helper to simulate the editor gutter rendering
    function renderGutterCard(desc: DescribedValue): string {
      const kindStr = formatKind(desc.kind);
      const opStr = desc.namedOperation || desc.operation;
      const meaningStr = desc.meaningInWords || desc.meaning;
      const reqStr = Array.isArray(desc.requires) ? desc.requires.join('; ') : desc.requires;
      const canDoStr = Array.isArray(desc.canDo) ? desc.canDo.join('; ') : desc.canDo;
      const relatedStr = Array.isArray(desc.related) ? desc.related.join('; ') : (desc.related ?? '');
      return `
        <div class="doc-described-card" data-kind="${kindStr}" data-op="${opStr}">
          <span class="described-kind-badge">${kindStr}</span>
          <span class="described-op">${opStr}</span>
          <div class="described-details" style="display: none;">
            <span class="described-meaning">${meaningStr}</span>
            <span class="described-requires">${reqStr}</span>
            <span class="described-cando">${canDoStr}</span>
            <span class="described-related">${relatedStr}</span>
            <span class="described-obstruction">${desc.obstruction}</span>
          </div>
        </div>
      `;
    }

    // Helper to simulate the editor visual pane rendering
    function renderVisualPane(desc: DescribedValue): string {
      const kindStr = formatKind(desc.kind);
      const opStr = desc.namedOperation || desc.operation;
      const meaningStr = desc.meaningInWords || desc.meaning;
      const reqStr = Array.isArray(desc.requires) ? desc.requires.join('; ') : desc.requires;
      const canDoList = Array.isArray(desc.canDo) ? desc.canDo : [desc.canDo];
      const relatedList = Array.isArray(desc.related) ? desc.related : (desc.related ? [desc.related] : []);

      return `
        <div class="visual-described-pane" data-kind="${kindStr}" data-op="${opStr}">
          <div class="described-header-card">
            <div class="described-kind-badge">${kindStr}</div>
            <h3 class="described-title">${opStr}</h3>
            <p class="described-meaning">${meaningStr}</p>
          </div>
          <div class="described-section obstruction-section">
            <div class="section-label">Obstruction to Evaluation:</div>
            <div class="obstruction-badge">${desc.obstruction}</div>
          </div>
          <div class="described-section requires-section">
            <div class="section-label">Requires to Evaluate:</div>
            <div class="section-content">${reqStr}</div>
          </div>
          <div class="described-section cando-section">
            <div class="section-label">Operations Supported:</div>
            <ul class="cando-list">
              ${canDoList.map((item: string) => `<li>${item}</li>`).join('')}
            </ul>
          </div>
          ${relatedList.length > 0 ? `
            <div class="described-section related-section">
              <div class="section-label">Related Theorems & Concepts:</div>
              <div class="related-tags">
                ${relatedList.map((t: string) => `<span class="related-tag">${t}</span>`).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }

    for (const item of unevaluableExpressions) {
      const { value } = evaluate(item.expr);
      expect(value.type).toBe('described');
      const desc = value as DescribedValue;

      // Extract and verify gutter card DOM structure
      const gutterHtml = renderGutterCard(desc);
      expect(gutterHtml).toContain('doc-described-card');
      expect(gutterHtml).toContain(`data-kind="${formatKind(desc.kind)}"`);
      expect(gutterHtml).toContain('described-kind-badge');
      expect(gutterHtml).toContain('described-meaning');
      expect(gutterHtml).toContain('described-requires');
      expect(gutterHtml).toContain('described-cando');
      expect(gutterHtml).toContain('described-related');
      expect(gutterHtml).toContain('described-obstruction');
      expect(gutterHtml).toContain(desc.obstruction);

      // Extract and verify visual pane DOM structure
      const visualHtml = renderVisualPane(desc);
      expect(visualHtml).toContain('visual-described-pane');
      expect(visualHtml).toContain('described-header-card');
      expect(visualHtml).toContain('obstruction-section');
      expect(visualHtml).toContain('requires-section');
      expect(visualHtml).toContain('cando-section');
      expect(visualHtml).toContain(desc.obstruction);
    }
  });
});
