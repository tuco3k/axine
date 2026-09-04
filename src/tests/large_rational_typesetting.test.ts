import { describe, it, expect } from 'vitest';
import { Evaluator } from '../core/evaluator';
import { typesetMath } from '../core/math_typeset';
import { BUNDLED_DOCUMENTS } from '../document/virtual_documents';
import { processDocumentLines, LineResultMessage } from '../core/worker';

describe('Large Rational Typesetting & Flattening Prevention', () => {
  it('computes sum(1//n, n in 1..50) and asserts innerText does not flatten into a single integer', () => {
    Evaluator.initVirtualFiles();
    const lines = ['h50 := sum(1//n, n in 1..50)', 'h50'];
    const results: LineResultMessage[] = [];
    processDocumentLines(1, lines, (msg: LineResultMessage) => results.push(msg));

    expect(results[1].result?.type).toBe('rational');
    const rat = results[1].result as { type: 'rational'; n: bigint; d: bigint };
    expect(rat.n.toString()).toBe('13943237577224054960759');
    expect(rat.d.toString()).toBe('3099044504245996706400');

    // Typeset the result
    const html = typesetMath(`${rat.n}/${rat.d}`, { displayMode: true });
    expect(html).toContain('tm-large-rational');
    expect(html).toContain('4.499205');
    expect(html).toContain('[exact]');

    // Strip HTML tags to simulate DOM text extraction
    const plainText = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    expect(plainText).toContain('4.499205');
    expect(plainText).toContain('[exact]');

    // Assert that the raw flattened digit string is NEVER present
    const flattenedBadInt = `${rat.n}${rat.d}`;
    expect(plainText).not.toContain(flattenedBadInt);
  });

  it('asserts stacked fractions contain fraction separator slash in DOM text extraction', () => {
    const html = typesetMath('13943/27720', { displayMode: true });
    expect(html).toContain('tm-frac-slash');
    const plainText = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    expect(plainText).toBe('13943 / 27720');
    expect(plainText).not.toBe('1394327720');
  });

  it('asserts integrator_comparison.ax runs with exact rationals and formats drift cleanly', () => {
    Evaluator.initVirtualFiles();
    const docText = BUNDLED_DOCUMENTS['integrator_comparison.ax'];
    const lines = docText.split('\n');
    const results: LineResultMessage[] = [];
    processDocumentLines(1, lines, (msg: LineResultMessage) => results.push(msg), () => false, {
      timeoutMs: 10000,
      maxSteps: 100000000,
      maxDepth: 5000,
      maxBigIntDigits: 100000,
      maxMemoryElements: 1000000,
    });

    // Line with graph(E_euler_t, E_verlet_t, E_rk4_t) or Space
    const graphRec = results.find((r: LineResultMessage) => r.result?.type === 'graph' || r.result?.type === 'space');
    expect(graphRec).toBeDefined();
    if (graphRec?.result?.type === 'graph') {
      const spec = (graphRec.result as any).spec;
      expect(spec.series.length).toBe(3);
      expect(spec.series[0].explicitPoints?.length).toBeGreaterThan(50);
    } else if (graphRec?.result?.type === 'space') {
      const sp = graphRec.result as any;
      expect(sp.entities.length).toBeGreaterThanOrEqual(1);
    }

    // Check drift variables
    const driftEulerRec = results.find((r: LineResultMessage) => r.boundName === 'drift_euler');
    const driftVerletRec = results.find((r: LineResultMessage) => r.boundName === 'drift_verlet');
    const driftRk4Rec = results.find((r: LineResultMessage) => r.boundName === 'drift_rk4');

    expect(driftEulerRec?.result?.type).toBe('rational');
    expect(driftVerletRec?.result).toBeDefined();
    expect(driftRk4Rec?.result).toBeDefined();

    const htmlEuler = typesetMath(`${(driftEulerRec?.result as any).n}/${(driftEulerRec?.result as any).d}`);
    expect(htmlEuler).toContain('0.852407');
    expect(htmlEuler).toContain('[exact]');
  });
});
