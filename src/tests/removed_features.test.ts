import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { evaluate, createInitialEnvironment } from '../core/evaluator';
import { formatKind } from '../core/kinds';

/**
 * Systemic Enforcement Gate: Verification of Removed Constructs
 *
 * Ensures that all deprecated, obsolete, or deleted constructs remain
 * completely unreachable and absent from the repository.
 */
describe('Enforcement Gate: Verification of Removed Constructs', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const srcDir = path.resolve(__dirname, '..');
  const docsDir = path.resolve(rootDir, 'documents');

  function getAllFiles(dir: string, extensions: string[] = ['.ts', '.ax', '.html']): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'dist' && entry.name !== 'brain') {
          results.push(...getAllFiles(fullPath, extensions));
        }
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        results.push(fullPath);
      }
    }
    return results;
  }

  // 1. \graph, graph(, :graph(
  describe('1. Elimination of graph() and :graph(', () => {
    it('asserts zero occurrences of graph( or :graph( or \\graph in src/ and documents/', () => {
      const files = [...getAllFiles(srcDir, ['.ts']), ...getAllFiles(docsDir, ['.ax'])];
      const violations: { file: string; line: number; text: string }[] = [];

      for (const file of files) {
        if (file.endsWith('removed_features.test.ts')) continue;
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/(\bgraph\(|:graph\(|\\graph\b)/.test(line)) {
            // Exclude comments that document the removal
            if (!line.includes('deleted') && !line.includes('removed') && !line.includes('no graph(')) {
              violations.push({ file: path.relative(rootDir, file), line: i + 1, text: line.trim() });
            }
          }
        }
      }
      expect(violations).toEqual([]);
    });

    it('asserts parser/evaluator treats graph(x) as product or unreduced expression without graph plotting side effects', () => {
      const env = createInitialEnvironment();
      const res = evaluate('graph(x^2, x \\in 0..10)', env);
      expect(res.value.type).not.toBe('graph_type');
      expect(res.value.type).not.toBe('drawing_primitive');
    });
  });

  // 2. := as an operator
  describe('2. Elimination of := Definition Operator in Documents', () => {
    it('asserts zero occurrences of := in shipped .ax documents', () => {
      const docFiles = getAllFiles(docsDir, ['.ax']);
      const violations: { file: string; line: number; text: string }[] = [];

      for (const file of docFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes(':=')) {
            violations.push({ file: path.relative(rootDir, file), line: i + 1, text: line.trim() });
          }
        }
      }
      expect(violations).toEqual([]);
    });

    it('asserts equality and assignment work uniformly via = in relations', () => {
      const env = createInitialEnvironment();
      evaluate('x = 5', env);
      expect(env['x']).toBeDefined();
    });
  });

  // 3. : 3R annotations
  describe('3. Elimination of 3R Annotations', () => {
    it('asserts zero occurrences of 3R annotations in core or documents/ (grep check)', () => {
      const files = [...getAllFiles(path.resolve(srcDir, 'core'), ['.ts']), ...getAllFiles(docsDir, ['.ax'])];
      const violations: { file: string; line: number; text: string }[] = [];

      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/:\s*3R\b|3R\s*annotation/i.test(line)) {
            violations.push({ file: path.relative(rootDir, file), line: i + 1, text: line.trim() });
          }
        }
      }
      expect(violations).toEqual([]);
    });

    it('behaviorally asserts parser rejects : 3R annotation syntax with error', () => {
      const env = createInitialEnvironment();
      expect(() => evaluate('x = 0 : 3R', env)).toThrow();
    });
  });

  // 4. requires-unavailable-theory, unimplemented-technique in Documents
  describe('4. Elimination of Fake Obstruction Strings in Documents & Corpus', () => {
    it('asserts zero requires-unavailable-theory or unimplemented-technique in documents/ or corpus_data.ts', () => {
      const files = [...getAllFiles(docsDir, ['.ax']), path.resolve(srcDir, 'document/corpus_data.ts')];
      const violations: { file: string; line: number; text: string }[] = [];

      for (const file of files) {
        if (!fs.existsSync(file)) continue;
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes('requires-unavailable-theory') || line.includes('unimplemented-technique')) {
            violations.push({ file: path.relative(rootDir, file), line: i + 1, text: line.trim() });
          }
        }
      }
      expect(violations).toEqual([]);
    });

    it('behaviorally asserts unreduced expressions stand as expression AST rather than undefined values', () => {
      const env = createInitialEnvironment();
      const res = evaluate(':unresolved_symbol + 2', env);
      expect(res.value.type).toBe('expression');
      expect(res.value.type).not.toBe('undefined');
    });
  });

  // 5. Procedural simulate, iterate, record, view for in Documents
  describe('5. Elimination of Procedural Simulation & View Drawables in Documents', () => {
    it('asserts zero simulate( or view for in documents/', () => {
      const files = getAllFiles(docsDir, ['.ax']);
      const violations: { file: string; line: number; text: string }[] = [];

      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/(\bsimulate\(|\bview\s+for\b)/.test(line)) {
            violations.push({ file: path.relative(rootDir, file), line: i + 1, text: line.trim() });
          }
        }
      }
      expect(violations).toEqual([]);
    });
  });

  // 6. The View Dispatch Table
  describe('6. Elimination of AST-Matching View Dispatch Table', () => {
    it('asserts plotting uses uniform implicit grid sampling without custom view dispatchers', () => {
      const evaluatorPath = path.resolve(srcDir, 'core/evaluator.ts');
      const evaluatorContent = fs.readFileSync(evaluatorPath, 'utf-8');
      expect(evaluatorContent).not.toContain('evalGraph(');
      expect(evaluatorContent).not.toContain('dispatchView(');
    });

    it('behaviorally asserts relation evaluation creates a SpaceValue with coordinate manifold', () => {
      const env = createInitialEnvironment();
      const res = evaluate('{\\axis x, y; x^2 + y^2 = 4}', env);
      expect(res.value.type).toBe('space');
      if (res.value.type === 'space') {
        expect(res.value.dimension).toBe(2);
        expect(res.value.declaredAxes).toEqual(['x', 'y']);
      }
    });
  });

  // 7. Builtin Function Names in Core
  describe('7. Standard Library Purity', () => {
    it('asserts transcendental functions are defined in documents/lib/*.ax in pure Axine', () => {
      expect(fs.existsSync(path.resolve(docsDir, 'lib/trig.ax'))).toBe(true);
      expect(fs.existsSync(path.resolve(docsDir, 'lib/exp.ax'))).toBe(true);
      expect(fs.existsSync(path.resolve(docsDir, 'lib/sqrt.ax'))).toBe(true);
    });
  });

  // 8. The Corpus Dropdown
  describe('8. Elimination of Legacy Corpus Dropdown', () => {
    it('asserts zero corpus dropdown UI selectors in src/notebook/ or src/document/', () => {
      const appFiles = getAllFiles(path.resolve(srcDir, 'notebook'), ['.ts']);
      const violations: { file: string; line: number; text: string }[] = [];

      for (const file of appFiles) {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes('corpus-dropdown') || line.includes('corpus-select')) {
            violations.push({ file: path.relative(rootDir, file), line: i + 1, text: line.trim() });
          }
        }
      }
      expect(violations).toEqual([]);
    });
  });

  // 9. Complete Elimination of Explainer Subsystem
  describe('9. Complete Elimination of Explainer Subsystem', () => {
    it('asserts explainer source files do not exist', () => {
      expect(fs.existsSync(path.resolve(srcDir, 'core/explainer.ts'))).toBe(false);
      expect(fs.existsSync(path.resolve(srcDir, 'plot/explainer_visualizer.ts'))).toBe(false);
      expect(fs.existsSync(path.resolve(srcDir, 'tests/explainer.test.ts'))).toBe(false);
    });

    it('asserts zero explainer UI headers or panels in src/ (grep check)', () => {
      const srcFiles = getAllFiles(srcDir, ['.ts', '.html', '.css']);
      const violations: { file: string; line: number; text: string }[] = [];

      for (const file of srcFiles) {
        if (file.endsWith('removed_features.test.ts')) continue;
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (
            line.includes('WHAT IT IS') ||
            line.includes('WHY IT IS HERE') ||
            line.includes('SHOW ME') ||
            line.includes('GO DEEPER') ||
            line.includes('tm-clickable') ||
            line.includes('data-symbol')
          ) {
            violations.push({ file: path.relative(rootDir, file), line: i + 1, text: line.trim() });
          }
        }
      }
      expect(violations).toEqual([]);
    });
  });

  // 10. Order-Independent Kind Resolution (D9 Prevention Gate)
  describe('10. Order-Independent Structural Kind Resolution', () => {
    it('asserts kind resolution is determined purely by structure, not declaration order', () => {
      // Order 1: Define Vec2 first, then Point2D
      const env1 = createInitialEnvironment();
      evaluate(':Vec2 = \\record { :x, :y }', env1);
      evaluate(':Point2D = \\record { :x, :y }', env1);
      evaluate(':p = :Point2D(:x: 1, :y: 2)', env1);
      const kind1 = evaluate(':kindof(:p)', env1);

      // Order 2: Define Point2D first, then Vec2
      const env2 = createInitialEnvironment();
      evaluate(':Point2D = \\record { :x, :y }', env2);
      evaluate(':Vec2 = \\record { :x, :y }', env2);
      evaluate(':p = :Point2D(:x: 1, :y: 2)', env2);
      const kind2 = evaluate(':kindof(:p)', env2);

      expect(kind1.value.type).toBe('kind');
      expect(kind2.value.type).toBe('kind');
      // Both resolve to structural Record with identical { :x, :y } field kinds
      expect(formatKind((kind1.value as any).kind)).toEqual(formatKind((kind2.value as any).kind));
    });
  });
});
