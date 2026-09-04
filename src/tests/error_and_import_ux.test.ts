import { describe, it, expect } from 'vitest';
import { Evaluator, createInitialEnvironment, evaluate } from '../core/evaluator';
import { processDocumentLines, LineResultMessage } from '../core/worker';
import { CORPUS_DOCUMENTS } from '../document/corpus_data';
import { DocumentEditor } from '../document/editor';

describe('Error Box Wrapping & Import Value Semantics', () => {
  it('asserts import does not evaluate to none and produces a module descriptor with exported bindings', () => {
    Evaluator.initVirtualFiles();
    const env = createInitialEnvironment();
    const { value: modVal } = evaluate('import "physics.ax"', env);

    expect(modVal.type).toBe('module');
    expect(modVal.type).not.toBe('none');

    const mod = modVal as { type: 'module'; name: string; exports: Record<string, any> };
    expect(mod.name).toBe('physics');
    expect(Object.keys(mod.exports)).toContain('Body');
    expect(Object.keys(mod.exports)).toContain('Particle');
    expect(Object.keys(mod.exports)).toContain('euler_step');
    expect(Object.keys(mod.exports)).toContain('verlet_step');
    expect(Object.keys(mod.exports)).toContain('rk4_step');
    expect(Object.keys(mod.exports)).toContain('gravity_force');
    expect(Object.keys(mod.exports)).toContain('kinetic_energy');
    expect(Object.keys(mod.exports)).toContain('momentum');
  });

  it('asserts selective from-import evaluates to module with only selected bindings', () => {
    Evaluator.initVirtualFiles();
    const env = createInitialEnvironment();
    const { value: modVal } = evaluate('from "physics.ax" import Body, gravity_force', env);

    expect(modVal.type).toBe('module');
    expect(modVal.type).not.toBe('none');
    const mod = modVal as { type: 'module'; name: string; exports: Record<string, any> };
    expect(Object.keys(mod.exports)).toEqual(['Body', 'gravity_force']);
  });

  it('asserts long error message (>3 lines) contains full text and does not clip', () => {
    Evaluator.initVirtualFiles();
    // Intentionally trigger a detailed error by referencing invalid record field and invalid function args
    const lines = [
      'import "physics.ax"',
      'b := Body(radius: 0.5, mass: 1.0, position: (0, 0), velocity: (0, 0))'
    ];
    const results: LineResultMessage[] = [];
    processDocumentLines(1, lines, (msg: LineResultMessage) => results.push(msg));

    const errResult = results[1];
    expect(errResult.classification.state).toBe('ERROR');
    expect(errResult.error).toBeDefined();
    const msg = errResult.error?.message ?? '';
    expect(msg).toContain("Field 'radius' does not exist on record 'Body'");
    expect(msg).toContain('Available fields: mass, position, velocity');

    // Verify HTML output and formatted gutter row
    const mockRecord = {
      lineIndex: 1,
      text: lines[1],
      classification: { state: 'ERROR' as const },
      error: { message: msg, span: { start: 0, end: 10 } },
      durationMs: 1
    };
    const rowHtml = (DocumentEditor.prototype as any).formatGutterRow.call(
      { formatValue: (v: any) => String(v) },
      mockRecord,
      false,
      false,
      false
    );

    expect(rowHtml).toContain('doc-gutter-error');
    expect(rowHtml).toContain("Field &#039;radius&#039; does not exist on record &#039;Body&#039;");
    expect(rowHtml).toContain('Available fields: mass, position, velocity');

    // Strip tags and decode entities to simulate rendered DOM text
    const plainText = rowHtml.replace(/<[^>]*>/g, ' ').replace(/&#039;/g, "'").replace(/\s+/g, ' ');
    expect(plainText).toContain("Field 'radius' does not exist on record 'Body'");
    expect(plainText).toContain('Available fields: mass, position, velocity');
  });

  it('evaluates "Getting started: a thrown ball" document cleanly from CORPUS_DOCUMENTS', () => {
    Evaluator.initVirtualFiles();
    const thrownBallDoc = CORPUS_DOCUMENTS.find(d => d.id === 'thrown_ball');
    expect(thrownBallDoc).toBeDefined();
    expect(thrownBallDoc?.title).toBe('Getting started: a thrown ball');

    const lines = thrownBallDoc!.content.split('\n');
    const results: LineResultMessage[] = [];
    processDocumentLines(1, lines, (msg: LineResultMessage) => results.push(msg));

    // Verify import line
    const importRes = results.find(r => r.line.includes('import "physics.ax"'));
    expect(importRes?.result?.type).toBe('module');

    // Verify trajectory
    const trajRes = results.find(r => r.boundName === 'traj');
    expect(trajRes?.result?.type).toBe('trajectory');

    // Verify graph or space
    const graphRes = results.find(r => r.result?.type === 'graph' || r.result?.type === 'space');
    expect(graphRes).toBeDefined();

    // Verify kinetic energy calculation
    const keRes = results.find(r => r.boundName === 'KE');
    expect(keRes?.result).toBeDefined();

    // Ensure NO errors in the entire document
    const errorRes = results.filter(r => r.classification.state === 'ERROR');
    expect(errorRes.length).toBe(0);
  });
});
