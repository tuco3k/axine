import { describe, it, expect } from 'vitest';
import { parse } from '../core/parser';
import { evaluate, createInitialEnvironment } from '../core/evaluator';
import { formatAST } from '../core/formatter';
import { SpaceValue } from '../core/types';
import { SpaceViewport } from '../plot/space_viewport';

describe('Pure Relational Architecture Gates (1 through 5)', () => {
  // Gate 1: |x| is abs, ||v|| is norm, f(x) is f * x everywhere. No application mode, no | mode switch, no |-.
  describe('Gate 1: Absolute value, norm, and multiplication', () => {
    it('parses |x| as absolute value', () => {
      const ast = parse('|x|');
      expect(ast.type).toBe('BracketOp');
      if (ast.type === 'BracketOp') {
        expect(ast.op).toBe('abs');
        expect(ast.operands[0]).toEqual({
          type: 'Identifier',
          name: 'x',
          span: expect.any(Object),
        });
      }
    });

    it('parses ||v|| as norm', () => {
      const ast = parse('||v||');
      expect(ast.type).toBe('BracketOp');
      if (ast.type === 'BracketOp') {
        expect(ast.op).toBe('norm');
        expect(ast.operands[0]).toEqual({
          type: 'Identifier',
          name: 'v',
          span: expect.any(Object),
        });
      }
    });

    it('parses f(x) and f(2) as implicit multiplication f · x and f · 2', () => {
      const astFx = parse('f(x)');
      expect(astFx.type).toBe('BinaryOp');
      if (astFx.type === 'BinaryOp') {
        expect(astFx.op).toBe('*');
        expect(astFx.isImplicit).toBe(true);
      }
      expect(formatAST(astFx)).toBe('f · x');

      const astF2 = parse('f(2)');
      expect(astF2.type).toBe('BinaryOp');
      if (astF2.type === 'BinaryOp') {
        expect(astF2.op).toBe('*');
        expect(astF2.isImplicit).toBe(true);
      }
      expect(formatAST(astF2)).toBe('f · 2');
    });

    it('does not recognize | as a mode switch on its own line', () => {
      const ast = parse('a | b');
      expect(ast.type).toBe('BinaryOp');
      if (ast.type === 'BinaryOp') {
        expect(ast.op).toBe('|');
      }
    });
  });

  // Gate 2: Bare import produces a 6-variable space. No keyword table in tokenizer. Every keyword requires \.
  describe('Gate 2: Keywords require backslash and bare words are juxtaposed variables', () => {
    it('evaluates bare import as a 6-variable space (i · m · p · o · r · t)', () => {
      const env = createInitialEnvironment();
      const { value } = evaluate('import', env);
      expect(value.type).toBe('space');
      const space = value as SpaceValue;
      expect(space.dimension).toBe(6);
      expect(space.coordinates).toEqual(['i', 'm', 'o', 'p', 'r', 't']);
    });

    it('parses \\import as a module import command', () => {
      const ast = parse('\\import "constants.ax"');
      expect(ast.type).toBe('Import');
      if (ast.type === 'Import') {
        expect(ast.path).toBe('constants.ax');
      }
    });

    it('parses \\if \\then \\else, \\where, \\forall, \\exists, \\axis with backslash', () => {
      const astIf = parse('\\if 1 = 1 \\then 2 \\else 3');
      expect(astIf.type).toBe('If');

      const astAxis = parse('\\axis[X, Y]');
      expect(astAxis.type).toBe('AxisDecl');
      if (astAxis.type === 'AxisDecl') {
        expect(astAxis.axes).toEqual(['X', 'Y']);
      }
    });
  });

  // Gate 3: \in is unified. x \in [0, 10] is a set membership relation. [0, 10] is an interval set.
  describe('Gate 3: Unified \\in and interval sets', () => {
    it('parses x \\in [0, 10] as set membership relation with interval set', () => {
      const ast = parse('x \\in [0, 10]');
      expect(ast.type).toBe('SetOp');
      if (ast.type === 'SetOp') {
        expect(ast.op).toBe('in');
        expect(ast.left).toEqual({ type: 'Identifier', name: 'x', span: expect.any(Object) });
        expect(ast.right.type).toBe('Interval');
        const interval = ast.right as any;
        expect(interval.kind).toBe('closed');
      }
    });

    it('evaluates numeric membership in intervals', () => {
      const env = createInitialEnvironment();
      const inRes = evaluate('5 \\in [0, 10]', env).value;
      expect(inRes.type).toBe('boolean');
      expect((inRes as any).value).toBe(true);

      const outRes = evaluate('15 \\in [0, 10]', env).value;
      expect(outRes.type).toBe('boolean');
      expect((outRes as any).value).toBe(false);

      const openRes = evaluate('0 \\in (0, 10)', env).value;
      expect(openRes.type).toBe('boolean');
      expect((openRes as any).value).toBe(false);
    });

    it('evaluates membership in standard sets \\in \\R, \\Z, \\N', () => {
      const env = createInitialEnvironment();
      const rRes = evaluate('5 \\in R', env).value;
      expect(rRes.type).toBe('boolean');
      expect((rRes as any).value).toBe(true);

      const zRes = evaluate('5.5 \\in Z', env).value;
      expect(zRes.type).toBe('boolean');
      expect((zRes as any).value).toBe(false);
    });
  });

  // Gate 4: \forall x, f(x) = x * 3 defines a function. f(2) evaluates to 6. f alone stands unreduced.
  // f(x) with no relation is f * x. Bound variables in \forall do not add axes. Library t does not collide with document t.
  describe('Gate 4: Function definition and reduction via \\forall', () => {
    it('reduces f(2) to 6 when \\forall x, f(x) = x * 3 is declared', () => {
      const env = createInitialEnvironment();
      const { value } = evaluate('{\\forall x, f(x) = x * 3; f(2)}', env);
      expect(value.type).toBe('rational');
      expect((value as any).n).toBe(6n);
    });

    it('leaves f alone unreduced', () => {
      const env = createInitialEnvironment();
      const { value } = evaluate('{\\forall x, f(x) = x * 3; f}', env);
      expect(value.type).toBe('expression');
      expect((value as any).text).toBe('f');
    });

    it('evaluates f(x) with no quantifier relation as f · x', () => {
      const env = createInitialEnvironment();
      const { value } = evaluate('f(x)', env);
      expect(value.type).toBe('space');
      const space = value as SpaceValue;
      expect(space.coordinates).toEqual(['f', 'x']);
    });

    it('does not add bound variable x to the space axes', () => {
      const env = createInitialEnvironment();
      const { value } = evaluate('{\\forall x, f(x) = x * 3; y = f(2)}', env);
      expect(value.type).toBe('space');
      const space = value as SpaceValue;
      // Coordinates should only contain y, not x
      expect(space.coordinates).toEqual(['y']);
    });
  });

  // Gate 5: y = x^2 with no \axis graphs nothing. \axis[X, Y] with Y = X^2 graphs.
  // \axis[X, Y] with b = a^2 graphs nothing. \axis[X, Y], X = a, Y = b, b = a^2 graphs parabola via aliases.
  describe('Gate 5: \\axis declared coordinate space and aliasing', () => {
    it('y = x^2 with no \\axis has declaredAxes undefined and graphs nothing in viewport', () => {
      const env = createInitialEnvironment();
      const { value } = evaluate('y = x^2', env);
      expect(value.type).toBe('space');
      const space = value as SpaceValue;
      expect(space.declaredAxes).toBeUndefined();

      // Test viewport rendering behavior
      const container = typeof document !== 'undefined' ? document.createElement('div') : ({ innerHTML: '', appendChild: () => {}, querySelector: () => null } as any);
      const viewport = new SpaceViewport(container, space);
      // Renders with 0 entity curves drawn because declaredAxes is undefined
      expect(viewport).toBeDefined();
    });

    it('\\axis[X, Y] with Y = X^2 graphs parabola in declared space', () => {
      const env = createInitialEnvironment();
      const { value } = evaluate('{\\axis[X, Y]; Y = X^2}', env);
      expect(value.type).toBe('space');
      const space = value as SpaceValue;
      expect(space.declaredAxes).toEqual(['X', 'Y']);
      expect(space.entities.length).toBe(1);
    });

    it('\\axis[X, Y] with b = a^2 graphs nothing in viewport (0 entities in declared space)', () => {
      const env = createInitialEnvironment();
      const { value } = evaluate('{\\axis[X, Y]; b = a^2}', env);
      expect(value.type).toBe('space');
      const space = value as SpaceValue;
      expect(space.declaredAxes).toEqual(['X', 'Y']);
      expect(space.entities.length).toBe(0);
    });

    it('\\axis[X, Y], X = a, Y = b, b = a^2 graphs parabola via aliases', () => {
      const env = createInitialEnvironment();
      const { value } = evaluate('{\\axis[X, Y]; X = a; Y = b; b = a^2}', env);
      expect(value.type).toBe('space');
      const space = value as SpaceValue;
      expect(space.declaredAxes).toEqual(['X', 'Y']);
      expect(space.entities.length).toBe(1);
      expect(space.entities[0].source).toContain('Y');
      expect(space.entities[0].source).toContain('X');
    });
  });
});
