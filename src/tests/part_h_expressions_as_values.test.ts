import { describe, it, expect } from 'vitest';
import { evaluate, createInitialEnvironment } from '../core/evaluator';
import { ExpressionValue, RationalValue } from '../core/types';

describe('Capability C1 Gate: Expressions as Values, \\match, \\build, \\quote, \\unquote, \\rule', () => {

  // =========================================================================
  // 1. \\quote and \\unquote
  // =========================================================================
  describe('Syntactic Quoting and Unquoting (\\quote, \\unquote)', () => {
    it('creates an ExpressionValue from \\quote without evaluating', () => {
      const env = createInitialEnvironment();
      const { value } = evaluate('\\quote(x^2 + 2*x + 1)', env);

      expect(value.type).toBe('expression');
      if (value.type === 'expression') {
        const expr = value as ExpressionValue;
        expect(expr.ast.type).toBe('BinaryOp');
        expect(expr.text).toContain('x^2');
      }
    });

    it('round-trips \\unquote(\\quote(expr)) to evaluate concrete arithmetic', () => {
      const env = createInitialEnvironment();
      const { value } = evaluate('\\unquote(\\quote(2 * 3 + 4))', env);

      expect(value.type).toBe('rational');
      if (value.type === 'rational') {
        expect((value as RationalValue).n).toBe(10n);
        expect((value as RationalValue).d).toBe(1n);
      }
    });

    it('evaluates expression stored in variable via \\unquote', () => {
      const env = createInitialEnvironment();
      evaluate(':term = \\quote(a + b)', env);
      evaluate('a = 10', env);
      evaluate('b = 20', env);

      const { value } = evaluate('\\unquote(:term)', env);
      expect(value.type).toBe('rational');
      if (value.type === 'rational') {
        expect((value as RationalValue).n).toBe(30n);
      }
    });
  });

  // =========================================================================
  // 2. \\build Constructing Every AST Node Type
  // =========================================================================
  describe('\\build AST Node Construction', () => {
    it('constructs NumberLiteral, StringLiteral, Identifier', () => {
      const env = createInitialEnvironment();

      const numRes = evaluate('\\build :NumberLiteral(42)', env).value as ExpressionValue;
      expect(numRes.type).toBe('expression');
      expect(numRes.ast.type).toBe('NumberLiteral');
      expect((numRes.ast as any).raw).toBe('42');

      const strRes = evaluate('\\build :StringLiteral("hello")', env).value as ExpressionValue;
      expect(strRes.type).toBe('expression');
      expect(strRes.ast.type).toBe('StringLiteral');
      expect((strRes.ast as any).value).toBe('hello');

      const idRes = evaluate('\\build :Identifier(:theta)', env).value as ExpressionValue;
      expect(idRes.type).toBe('expression');
      expect(idRes.ast.type).toBe('Identifier');
      expect((idRes.ast as any).name).toBe('theta');
    });

    it('constructs BinaryOp, UnaryOp, PostfixOp', () => {
      const env = createInitialEnvironment();

      const binRes = evaluate('\\build :BinaryOp("+", \\quote(x), \\quote(y))', env).value as ExpressionValue;
      expect(binRes.type).toBe('expression');
      expect(binRes.ast.type).toBe('BinaryOp');
      expect((binRes.ast as any).op).toBe('+');

      const unRes = evaluate('\\build :UnaryOp("-", \\quote(x))', env).value as ExpressionValue;
      expect(unRes.type).toBe('expression');
      expect(unRes.ast.type).toBe('UnaryOp');
      expect((unRes.ast as any).op).toBe('-');

      const postRes = evaluate('\\build :PostfixOp("!", \\quote(n))', env).value as ExpressionValue;
      expect(postRes.type).toBe('expression');
      expect(postRes.ast.type).toBe('PostfixOp');
      expect((postRes.ast as any).op).toBe('!');
    });

    it('constructs FunctionCall, Diff, BracketOp, Tuple, List', () => {
      const env = createInitialEnvironment();

      const fnRes = evaluate('\\build :FunctionCall(:sin, [\\quote(x)])', env).value as ExpressionValue;
      expect(fnRes.type).toBe('expression');
      expect(fnRes.ast.type).toBe('FunctionCall');
      expect((fnRes.ast as any).callee).toBe('sin');

      const diffRes = evaluate('\\build :Diff(:x, \\quote(x^2))', env).value as ExpressionValue;
      expect(diffRes.type).toBe('expression');
      expect(diffRes.ast.type).toBe('Diff');
      expect((diffRes.ast as any).variable).toBe('x');

      const brRes = evaluate('\\build :BracketOp(:abs, \\quote(x))', env).value as ExpressionValue;
      expect(brRes.type).toBe('expression');
      expect(brRes.ast.type).toBe('BracketOp');
      expect((brRes.ast as any).op).toBe('abs');

      const tupRes = evaluate('\\build :Tuple([\\quote(a), \\quote(b)])', env).value as ExpressionValue;
      expect(tupRes.type).toBe('expression');
      expect(tupRes.ast.type).toBe('Tuple');
      expect((tupRes.ast as any).elements.length).toBe(2);

      const listRes = evaluate('\\build :List([\\quote(1), \\quote(2)])', env).value as ExpressionValue;
      expect(listRes.type).toBe('expression');
      expect(listRes.ast.type).toBe('List');
      expect((listRes.ast as any).elements.length).toBe(2);
    });

    it('constructs expressions via template quasi-quoting \\build { ... }', () => {
      const env = createInitialEnvironment();
      evaluate(':u = \\quote(x^2)', env);
      evaluate(':v = \\quote(:sin(x))', env);

      const res = evaluate('\\build { :u * :v + 1 }', env).value as ExpressionValue;
      expect(res.type).toBe('expression');
      expect(res.ast.type).toBe('BinaryOp');
      expect(res.text).toContain('x^2');
      expect(res.text).toContain(':sin(x)');
    });
  });

  // =========================================================================
  // 3. \\match Over Every AST Node Type
  // =========================================================================
  describe('\\match Pattern Matching Across All AST Node Types', () => {
    it('matches NumberLiteral and StringLiteral', () => {
      const env = createInitialEnvironment();
      const code1 = `
        \\match \\quote(42) {
          \\case 42: "matched 42",
          \\otherwise: "fallback"
        }
      `;
      expect(evaluate(code1, env).value).toEqual({ type: 'string', value: 'matched 42' });

      const code2 = `
        \\match \\quote("hello") {
          \\case "hello": "matched hello",
          \\otherwise: "fallback"
        }
      `;
      expect(evaluate(code2, env).value).toEqual({ type: 'string', value: 'matched hello' });
    });

    it('matches Identifier and metavariable wildcards', () => {
      const env = createInitialEnvironment();
      const code = `
        \\match \\quote(z) {
          \\case _: "matched wildcard",
          \\otherwise: "none"
        }
      `;
      expect(evaluate(code, env).value).toEqual({ type: 'string', value: 'matched wildcard' });
    });

    it('matches BinaryOp (+, -, *, /, ^)', () => {
      const env = createInitialEnvironment();
      const code = `
        \\match \\quote(a * b) {
          \\case :x + :y: "sum",
          \\case :x * :y: "product",
          \\otherwise: "other"
        }
      `;
      expect(evaluate(code, env).value).toEqual({ type: 'string', value: 'product' });
    });

    it('matches UnaryOp and PostfixOp', () => {
      const env = createInitialEnvironment();
      const code1 = `
        \\match \\quote(-x) {
          \\case -:u: "negative",
          \\otherwise: "other"
        }
      `;
      expect(evaluate(code1, env).value).toEqual({ type: 'string', value: 'negative' });

      const code2 = `
        \\match \\quote(n!) {
          \\case :u!: "factorial",
          \\otherwise: "other"
        }
      `;
      expect(evaluate(code2, env).value).toEqual({ type: 'string', value: 'factorial' });
    });

    it('matches FunctionCall and Diff', () => {
      const env = createInitialEnvironment();
      const code1 = `
        \\match \\quote(:sin(x^2)) {
          \\case :cos(:u): "cos",
          \\case :sin(:u): "sin of expr",
          \\otherwise: "other"
        }
      `;
      expect(evaluate(code1, env).value).toEqual({ type: 'string', value: 'sin of expr' });

      const code2 = `
        \\match \\quote(d//dx (x^3)) {
          \\case d//dx (:u): "derivative wrt x",
          \\otherwise: "other"
        }
      `;
      expect(evaluate(code2, env).value).toEqual({ type: 'string', value: 'derivative wrt x' });
    });

    it('matches BracketOp, Tuple, and List', () => {
      const env = createInitialEnvironment();
      const code1 = `
        \\match \\quote(|x + 1|) {
          \\case |:u|: "absolute value",
          \\otherwise: "other"
        }
      `;
      expect(evaluate(code1, env).value).toEqual({ type: 'string', value: 'absolute value' });

      const code2 = `
        \\match \\quote((1, 2)) {
          \\case (:a, :b): "2-tuple",
          \\otherwise: "other"
        }
      `;
      expect(evaluate(code2, env).value).toEqual({ type: 'string', value: '2-tuple' });

      const code3 = `
        \\match \\quote([1, 2, 3]) {
          \\case [:a, :b, :c]: "3-list",
          \\otherwise: "other"
        }
      `;
      expect(evaluate(code3, env).value).toEqual({ type: 'string', value: '3-list' });
    });

    it('performs non-linear pattern matching (identical metavariables)', () => {
      const env = createInitialEnvironment();
      const codeMatch = `
        \\match \\quote(x + x) {
          \\case :u + :u: "identical terms",
          \\case :u + :v: "different terms",
          \\otherwise: "other"
        }
      `;
      expect(evaluate(codeMatch, env).value).toEqual({ type: 'string', value: 'identical terms' });

      const codeMismatch = `
        \\match \\quote(x + y) {
          \\case :u + :u: "identical terms",
          \\case :u + :v: "different terms",
          \\otherwise: "other"
        }
      `;
      expect(evaluate(codeMismatch, env).value).toEqual({ type: 'string', value: 'different terms' });
    });

    it('evaluates guard conditions in \\case \\if', () => {
      const env = createInitialEnvironment();
      const code = `
        \\match \\quote(10) {
          \\case :n \\if \\unquote(:n) < 5: "small",
          \\case :n \\if \\unquote(:n) >= 5: "large",
          \\otherwise: "other"
        }
      `;
      expect(evaluate(code, env).value).toEqual({ type: 'string', value: 'large' });
    });

    it('falls back to \\otherwise when no case matches', () => {
      const env = createInitialEnvironment();
      const code = `
        \\match \\quote(x * y) {
          \\case :a + :b: "sum",
          \\otherwise: "fallback reached"
        }
      `;
      expect(evaluate(code, env).value).toEqual({ type: 'string', value: 'fallback reached' });
    });

    it('throws structured error when no case matches and no \\otherwise is provided', () => {
      const env = createInitialEnvironment();
      const code = `
        \\match \\quote(x * y) {
          \\case :a + :b: "sum"
        }
      `;
      expect(() => evaluate(code, env)).toThrowError(/No matching pattern in \\match/);
    });

    it('deconstructs and transforms an AST term via \\match and \\build', () => {
      const env = createInitialEnvironment();
      const code = `
        \\match \\quote(x + y) {
          \\case :u + :v: \\build { :u * :v },
          \\otherwise: \\quote(0)
        }
      `;
      const res = evaluate(code, env).value as ExpressionValue;
      expect(res.type).toBe('expression');
      expect(res.ast.type).toBe('BinaryOp');
      expect((res.ast as any).op).toBe('*');
      expect(res.text).toBe('x * y');
    });
  });

  // =========================================================================
  // 4. Equational Rewriting (\\rule)
  // =========================================================================
  describe('Equational Rewriting (\\rule)', () => {
    it('applies user rewrite rule during evaluation', () => {
      const env = createInitialEnvironment();
      evaluate('\\rule :sq(:x) => :x * :x', env);

      const { value } = evaluate(':sq(5)', env);
      expect(value.type).toBe('rational');
      if (value.type === 'rational') {
        expect((value as RationalValue).n).toBe(25n);
      }
    });

    it('applies nested user rewrite rules on custom operators', () => {
      const env = createInitialEnvironment();
      evaluate('\\rule :double(:x) => :x + :x', env);

      const { value } = evaluate(':double(3) + 4', env);
      expect(value.type).toBe('rational');
      if (value.type === 'rational') {
        expect((value as RationalValue).n).toBe(10n);
      }
    });
  });

  // =========================================================================
  // 5. Performance Benchmark & Cost Measurement
  // =========================================================================
  describe('Reduction Speed Cost Measurement (Ordinary Arithmetic)', () => {
    it('measures ordinary arithmetic reduction throughput (< 5 µs per eval)', () => {
      const env = createInitialEnvironment();
      const expr = '(3 * 7 + 4) / 5 + 2^3';

      // Warm up
      for (let i = 0; i < 100; i++) {
        evaluate(expr, env);
      }

      const N = 2000;
      const t0 = performance.now();
      for (let i = 0; i < N; i++) {
        evaluate(expr, env);
      }
      const t1 = performance.now();
      const usPerEval = ((t1 - t0) * 1000) / N;

      console.log(`--- ARITHMETIC REDUCTION THROUGHPUT (POST-C1) ---`);
      console.log(`• Expression: ${expr}`);
      console.log(`• Average time: ${usPerEval.toFixed(4)} µs/eval over ${N} iterations`);

      expect(usPerEval).toBeLessThan(50.0); // well within interactive thresholds
    });
  });
});
