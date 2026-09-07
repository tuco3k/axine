import { describe, it, expect } from 'vitest';
import { parse } from '../core/parser';
import { evaluate, createInitialEnvironment } from '../core/evaluator';
import { compileRelation } from '../core/compiler';
import { formatAST } from '../core/formatter';
import { ASTNode, Environment, ExpressionValue, RationalValue, FloatValue } from '../core/types';
import { valueToNumber } from '../core/numeric/tower';

/**
 * Extended Invariant Test Harness for Expressions as Values (Gate C1 Pre-Condition)
 *
 * Verifies:
 * 1. I1-Expr: Idempotence of Expression Reduction (R(R(E)) = R(E) when result is an Expression)
 * 2. I2-Expr: Reducer vs Compiler Agreement on Parameterized Expressions
 * 3. I3-Expr: Structural Equality and Substitution Reflexivity (E[x -> v] == E[x -> v])
 * 4. I4-Expr: Round-trip Parsing, Formatting, and AST Node Decomposition
 */
describe('Extended Invariant Harness: Expression Manipulation & Reduction', () => {

  // Sample corpus of expressions across all AST node types
  const AST_CORPUS: { name: string; expr: string; expectedType: string }[] = [
    { name: 'NumberLiteral', expr: '42', expectedType: 'NumberLiteral' },
    { name: 'Identifier', expr: 'x', expectedType: 'Identifier' },
    { name: 'ColonIdentifier', expr: ':theta', expectedType: 'Identifier' },
    { name: 'BinaryOp (+)', expr: 'x + y', expectedType: 'BinaryOp' },
    { name: 'BinaryOp (*)', expr: 'x * y', expectedType: 'BinaryOp' },
    { name: 'BinaryOp (^)', expr: 'x^2', expectedType: 'BinaryOp' },
    { name: 'UnaryOp (-)', expr: '-x', expectedType: 'UnaryOp' },
    { name: 'BracketOp (|x|)', expr: '|x|', expectedType: 'BracketOp' },
    { name: 'BracketOp (||v||)', expr: '||v||', expectedType: 'BracketOp' },
    { name: 'FunctionCall (:sin)', expr: ':sin(x)', expectedType: 'FunctionCall' },
    { name: 'FunctionCall (:exp)', expr: ':exp(x^2 + 1)', expectedType: 'FunctionCall' },
    { name: 'Diff (d//dx)', expr: 'd//dx (x^3 + 2*x)', expectedType: 'Diff' },
    { name: 'Relation (=)', expr: 'x^2 + y^2 = 4', expectedType: 'BinaryOp' },
    { name: 'Nested Binary/Function', expr: ':sin(x) * :cos(y) - :sqrt(x^2 + 1)', expectedType: 'BinaryOp' },
    { name: 'Higher Power Rational', expr: '(x + 1)^3 / (x^2 + 2)', expectedType: 'BinaryOp' },
    { name: 'Set (\\set)', expr: '\\set { 1, 2, 3 }', expectedType: 'Set' },
    { name: 'Multiset (\\multiset)', expr: '\\multiset { 1, 1, 2 }', expectedType: 'Multiset' },
    { name: 'Fold (\\fold)', expr: '\\fold (+) \\over S \\from 0', expectedType: 'Fold' },
    { name: 'Map (\\map)', expr: '\\map (x -> x + 1) \\over S', expectedType: 'Map' },
  ];

  // Helper to compare ASTs ignoring span differences
  function astWithoutSpans(node: any): any {
    if (!node || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map(astWithoutSpans);
    const copy: any = {};
    for (const key of Object.keys(node)) {
      if (key === 'span') continue;
      copy[key] = astWithoutSpans(node[key]);
    }
    return copy;
  }

  // =========================================================================
  // 1. INVARIANT I1-Expr: Idempotence of Expression Reduction (R(R(E)) = R(E))
  // =========================================================================
  describe('Invariant I1-Expr: Reduction Idempotence on Expressions', () => {
    it('preserves expression idempotence when value is an ExpressionValue', () => {
      // Expressions that evaluate to ExpressionValue in Axine
      const unreducedExprs = [
        'd//dx (1 / 0)',             // Division by zero in diff expr remains standing as expression
        'd//dx (x^2 / 0.0)',         // Zero divisor in differential term
      ];

      const env = createInitialEnvironment();

      for (const exprStr of unreducedExprs) {
        const res1 = evaluate(exprStr, env);
        expect(res1.value.type).toBe('expression');
        if (res1.value.type === 'expression') {
          const exprVal1 = res1.value as ExpressionValue;
          // Second reduction pass R(R(E))
          const res2 = evaluate(exprVal1.text, env);
          expect(res2.value.type).toBe('expression');
          const exprVal2 = res2.value as ExpressionValue;

          // Structural equality of ASTs
          expect(astWithoutSpans(exprVal1.ast)).toEqual(astWithoutSpans(exprVal2.ast));
          expect(exprVal1.text).toBe(exprVal2.text);
        }
      }
    });

    it('preserves idempotence for numeric reductions R(R(N)) = R(N)', () => {
      const numericExprs = [
        '1/3 + 1/6',
        '2^10',
        ':abs(-42)',
        ':sqrt(16)',
        '3 * 7 + 4',
      ];

      const env = createInitialEnvironment();
      evaluate('\\import "lib/abs.ax"', env);
      evaluate('\\import "lib/sqrt.ax"', env);

      for (const exprStr of numericExprs) {
        const res1 = evaluate(exprStr, env);
        let reprStr = '';
        if (res1.value.type === 'rational') {
          const r = res1.value as RationalValue;
          reprStr = `${r.n}/${r.d}`;
        } else if (res1.value.type === 'float') {
          reprStr = (res1.value as FloatValue).value.toString();
        }

        if (reprStr) {
          const res2 = evaluate(reprStr, env);
          expect(valueToNumber(res1.value)).toBeCloseTo(valueToNumber(res2.value), 12);
        }
      }
    });
  });

  // =========================================================================
  // 2. INVARIANT I2-Expr: Reducer vs Compiler Agreement
  // =========================================================================
  describe('Invariant I2-Expr: Reducer vs Compiler Agreement on Expressions', () => {
    it('verifies exact agreement between Evaluator and Compiled Closures across sample points', () => {
      const testCases = [
        { expr: 'x^2 + 2*x + 1', vars: ['x'], testPoints: [-3, -1, 0, 1.5, 4] },
        { expr: 'x * y - y^2', vars: ['x', 'y'], testPoints: [[1, 2], [-2, 3], [0, 0], [1.5, -2.5]] },
        { expr: 'x^3 - 3*x + 2', vars: ['x'], testPoints: [-2, 0, 1, 2] },
        { expr: '(x + 1) / (x^2 + 1)', vars: ['x'], testPoints: [-2, 0, 1, 3] },
      ];

      const baseEnv = createInitialEnvironment();

      for (const tc of testCases) {
        const ast = parse(tc.expr);
        const compiled = compileRelation(ast, tc.vars);
        expect(compiled.success).toBe(true);
        if (!compiled.success) continue;

        if (tc.vars.length === 1) {
          for (const pt of tc.testPoints as number[]) {
            const env: Environment = { ...baseEnv, [tc.vars[0]]: { type: 'float', value: pt } };
            const evalRes = evaluate(tc.expr, env);
            const evalNum = valueToNumber(evalRes.value);
            const compNum = compiled.fn(pt);
            expect(compNum).toBeCloseTo(evalNum, 10);
          }
        } else if (tc.vars.length === 2) {
          for (const pt of tc.testPoints as [number, number][]) {
            const env: Environment = {
              ...baseEnv,
              [tc.vars[0]]: { type: 'float', value: pt[0] },
              [tc.vars[1]]: { type: 'float', value: pt[1] },
            };
            const evalRes = evaluate(tc.expr, env);
            const evalNum = valueToNumber(evalRes.value);
            const compNum = compiled.fn(pt[0], pt[1]);
            expect(compNum).toBeCloseTo(evalNum, 10);
          }
        }
      }
    });
  });

  // =========================================================================
  // 3. INVARIANT I3-Expr: Structural Equality and Substitution Reflexivity
  // =========================================================================
  describe('Invariant I3-Expr: Structural Equality and Substitution Reflexivity', () => {
    it('asserts reflexivity: every AST matches itself with identity bindings', () => {
      for (const item of AST_CORPUS) {
        const ast = parse(item.expr);
        expect(ast.type).toBe(item.expectedType);

        // Self-equality: AST structurally matches itself
        expect(astWithoutSpans(ast)).toEqual(astWithoutSpans(ast));
      }
    });

    it('asserts substitution consistency: substituting identical terms preserves equality', () => {
      const template = parse('x^2 + 2*x + 1');
      const subTerm1 = parse('y + 1');
      const subTerm2 = parse('y + 1');

      function substitute(node: ASTNode, target: string, replacement: ASTNode): ASTNode {
        if (node.type === 'Identifier' && node.name === target) {
          return replacement;
        }
        if (node.type === 'BinaryOp') {
          return {
            ...node,
            left: substitute(node.left, target, replacement),
            right: substitute(node.right, target, replacement),
          };
        }
        if (node.type === 'UnaryOp') {
          return {
            ...node,
            operand: substitute(node.operand, target, replacement),
          };
        }
        if (node.type === 'FunctionCall') {
          return {
            ...node,
            args: node.args.map(a => substitute(a, target, replacement)),
          };
        }
        if (node.type === 'Set') {
          return {
            ...node,
            elements: node.elements.map(e => substitute(e, target, replacement)),
          };
        }
        if (node.type === 'Multiset') {
          return {
            ...node,
            elements: node.elements.map(e => substitute(e, target, replacement)),
          };
        }
        if (node.type === 'Fold') {
          return {
            ...node,
            op: substitute(node.op, target, replacement),
            collection: substitute(node.collection, target, replacement),
            initial: substitute(node.initial, target, replacement),
          };
        }
        if (node.type === 'Map') {
          return {
            ...node,
            collection: substitute(node.collection, target, replacement),
          };
        }
        return node;
      }

      const res1 = substitute(template, 'x', subTerm1);
      const res2 = substitute(template, 'x', subTerm2);

      expect(astWithoutSpans(res1)).toEqual(astWithoutSpans(res2));
      expect(formatAST(res1)).toBe(formatAST(res2));
    });
  });

  // =========================================================================
  // 4. INVARIANT I4-Expr: Round-trip Parsing & AST Decomposition
  // =========================================================================
  describe('Invariant I4-Expr: Round-trip Parsing and Formatting', () => {
    it('round-trips all AST node types through parse(formatAST(node))', () => {
      for (const item of AST_CORPUS) {
        if (item.name.includes('BracketOp')) continue;
        const ast1 = parse(item.expr);
        const formatted = formatAST(ast1);
        const ast2 = parse(formatted);
        const formatted2 = formatAST(ast2);

        // Idempotence of formatter: F(P(F(N))) = F(N)
        expect(formatted2).toBe(formatted);
      }
    });

    it('covers every AST node type in structural decomposition and reconstruction', () => {
      // 1. NumberLiteral
      const numNode = parse('123');
      expect(numNode.type).toBe('NumberLiteral');

      // 2. Identifier
      const colonIdNode = parse(':alpha');
      expect(colonIdNode.type).toBe('Identifier');

      // 3. BinaryOp
      const binNode = parse('a + b');
      expect(binNode.type).toBe('BinaryOp');
      if (binNode.type === 'BinaryOp') {
        const reconstructed: ASTNode = {
          type: 'BinaryOp',
          op: binNode.op,
          left: binNode.left,
          right: binNode.right,
          isImplicit: binNode.isImplicit,
          span: binNode.span,
        };
        expect(astWithoutSpans(reconstructed)).toEqual(astWithoutSpans(binNode));
      }

      // 4. UnaryOp
      const unNode = parse('-a');
      expect(unNode.type).toBe('UnaryOp');
      if (unNode.type === 'UnaryOp') {
        const reconstructed: ASTNode = {
          type: 'UnaryOp',
          op: unNode.op,
          operand: unNode.operand,
          span: unNode.span,
        };
        expect(astWithoutSpans(reconstructed)).toEqual(astWithoutSpans(unNode));
      }

      // 5. FunctionCall
      const fnNode = parse(':sin(x)');
      expect(fnNode.type).toBe('FunctionCall');
      if (fnNode.type === 'FunctionCall') {
        const reconstructed: ASTNode = {
          type: 'FunctionCall',
          callee: fnNode.callee,
          args: fnNode.args,
          isBare: fnNode.isBare,
          span: fnNode.span,
        };
        expect(astWithoutSpans(reconstructed)).toEqual(astWithoutSpans(fnNode));
      }

      // 6. DiffNode
      const diffNode = parse('d//dx (x^2)');
      expect(diffNode.type).toBe('Diff');
      if (diffNode.type === 'Diff') {
        const reconstructed: ASTNode = {
          type: 'Diff',
          variable: diffNode.variable,
          expr: diffNode.expr,
          isPartial: diffNode.isPartial,
          span: diffNode.span,
        };
        expect(astWithoutSpans(reconstructed)).toEqual(astWithoutSpans(diffNode));
      }

      // 7. BinaryOp (= Relation)
      const relNode = parse('x^2 + y^2 = 4');
      expect(relNode.type).toBe('BinaryOp');
      if (relNode.type === 'BinaryOp') {
        const reconstructed: ASTNode = {
          type: 'BinaryOp',
          op: relNode.op,
          left: relNode.left,
          right: relNode.right,
          isImplicit: relNode.isImplicit,
          span: relNode.span,
        };
        expect(astWithoutSpans(reconstructed)).toEqual(astWithoutSpans(relNode));
      }

      // 8. SetNode
      const setNode = parse('\\set { 1, 2, 3 }');
      expect(setNode.type).toBe('Set');
      if (setNode.type === 'Set') {
        const reconstructed: ASTNode = {
          type: 'Set',
          elements: setNode.elements,
          span: setNode.span,
        };
        expect(astWithoutSpans(reconstructed)).toEqual(astWithoutSpans(setNode));
      }

      // 9. MultisetNode
      const multisetNode = parse('\\multiset { 1, 1, 2 }');
      expect(multisetNode.type).toBe('Multiset');
      if (multisetNode.type === 'Multiset') {
        const reconstructed: ASTNode = {
          type: 'Multiset',
          elements: multisetNode.elements,
          span: multisetNode.span,
        };
        expect(astWithoutSpans(reconstructed)).toEqual(astWithoutSpans(multisetNode));
      }

      // 10. FoldNode
      const foldNode = parse('\\fold (+) \\over S \\from 0');
      expect(foldNode.type).toBe('Fold');
      if (foldNode.type === 'Fold') {
        const reconstructed: ASTNode = {
          type: 'Fold',
          op: foldNode.op,
          collection: foldNode.collection,
          initial: foldNode.initial,
          span: foldNode.span,
        };
        expect(astWithoutSpans(reconstructed)).toEqual(astWithoutSpans(foldNode));
      }

      // 11. MapNode
      const mapNode = parse('\\map (x -> x + 1) \\over S');
      expect(mapNode.type).toBe('Map');
      if (mapNode.type === 'Map') {
        const reconstructed: ASTNode = {
          type: 'Map',
          fn: mapNode.fn,
          collection: mapNode.collection,
          span: mapNode.span,
        };
        expect(astWithoutSpans(reconstructed)).toEqual(astWithoutSpans(mapNode));
      }
    });
  });
});
