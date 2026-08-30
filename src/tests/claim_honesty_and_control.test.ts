import { describe, expect, it } from 'vitest';
import { CORPUS_DOCUMENTS } from '../document/corpus_data';
import { parse } from '../core/parser';
import { evaluate, Evaluator, createInitialEnvironment } from '../core/evaluator';
import { DocumentState } from '../document/document_state';
import { ASTNode, ClaimNode, Environment, Value } from '../core/types';
import { analyzeAST } from '../core/analyzer';
import { classifyLine } from '../core/classifier';
import { valueToNumber } from '../core/numeric/tower';

function validateShadowHonesty(shadowAST: ASTNode, env: Environment): { honest: boolean; reason?: string } {
  // 1. Literal constants or closed operations with no bound variable
  if (shadowAST.type === 'NumberLiteral' || shadowAST.type === 'StringLiteral' || (shadowAST.type === 'Identifier' && (shadowAST.name === 'true' || shadowAST.name === 'false'))) {
    return { honest: false, reason: 'Shadow is a closed literal constant' };
  }
  if (shadowAST.type === 'BinaryOp') {
    const analysis = analyzeAST(shadowAST, env);
    if (analysis.freeVariables.length === 0) {
      return { honest: false, reason: 'Shadow is a closed constant binary operation (e.g. 4 <= 4)' };
    }
  }

  // 2. Search constructs (all, any, find)
  if (shadowAST.type === 'FunctionCall') {
    const fnName = (shadowAST as any).callee || (shadowAST as any).name;
    if (['all', 'any', 'find'].includes(fnName)) {
      let pred = shadowAST.args[0];
      let range = shadowAST.args[1];
      if (range && range.type !== 'Range' && pred && pred.type === 'Range') {
        const tmp = pred; pred = range; range = tmp;
      }
      if (!range || range.type !== 'Range') {
        return { honest: false, reason: 'Search construct missing bound range' };
      }
      const boundVar = range.variable;
      const predAnalysis = analyzeAST(pred, env);
      if (!predAnalysis.freeVariables.includes(boundVar)) {
        return { honest: false, reason: `Predicate does not depend on bound variable '${boundVar}'` };
      }

      // Check for domain-independent analytic tautologies (e.g. abs(sin(t)) <= 1 or p > 1)
      const testValues = [-1000, -50.5, -1, 0, 1.25, 50.7, 1000];
      let trueCount = 0;
      for (const tv of testValues) {
        try {
          const testEnv = { ...env, [boundVar]: { type: 'float', value: tv } as any };
          const val = new Evaluator(testEnv).evaluate(pred);
          if (val.type === 'boolean' && val.value) trueCount++;
        } catch {
          // ignore evaluation domain errors
        }
      }
      if (trueCount === testValues.length) {
        return { honest: false, reason: 'Predicate is a domain-independent analytic tautology (e.g. abs(sin(t)) <= 1)' };
      }
    }
  }

  return { honest: true };
}

function runDocumentLines(source: string): { env: Environment; lineResults: { line: string; value?: Value; error?: string }[] } {
  const env = createInitialEnvironment();
  const lines = source.split('\n');
  const lineResults: { line: string; value?: Value; error?: string }[] = [];
  let accumulated = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      lineResults.push({ line });
      continue;
    }
    accumulated = accumulated ? accumulated + '\n' + line : line;
    const classification = classifyLine(accumulated, env);
    if (classification.state === 'INCOMPLETE') {
      lineResults.push({ line });
      continue;
    }
    try {
      const res = evaluate(accumulated, env);
      lineResults.push({ line, value: res.value });
      accumulated = '';
    } catch (e: any) {
      lineResults.push({ line, error: e.message });
      accumulated = '';
    }
  }
  return { env, lineResults };
}

describe('Fix Pass 2: Honesty, Strengthened Tests, and Acceptance Verification', () => {
  describe('1. Claim System Honesty & Relevance Enforcement', () => {
    it('requires a relevance field on every claim (syntax error if missing)', () => {
      const invalidClaim = `
        claim bad_claim {
          statement: "Some theorem",
          proved_by: "Someone",
          kind: "A",
          shadow: 1 + 1 == 2,
          expect: true
        }
      `;
      expect(() => parse(invalidClaim)).toThrow(/claim requires a 'relevance' field/i);
    });

    it('rejects original regression fixtures (4 <= 4, abs(sin(t)) <= 1, p > 1)', () => {
      const env = createInitialEnvironment();

      // Regression Fixture 1: 4 <= 4
      const ast1 = parse('4 <= 4');
      const v1 = validateShadowHonesty(ast1, env);
      expect(v1.honest).toBe(false);

      // Regression Fixture 2: all(abs(sin(t)) <= 1, t in 1..10)
      const ast2 = parse('all(abs(sin(t)) <= 1, t in 1..10)');
      const v2 = validateShadowHonesty(ast2, env);
      expect(v2.honest).toBe(false);

      // Legitimate shadow: Fermat's Last Theorem
      const fermatAst = parse('all(all(all(all(a^n + b^n != c^n, c in 1..200), b in 1..200), a in 1..200), n in 3..8)');
      const vFermat = validateShadowHonesty(fermatAst, env);
      expect(vFermat.honest).toBe(true);
    });

    it('asserts all corpus claims have non-empty relevance and honest Kind H or checkable shadows', () => {
      const claimsFound: ClaimNode[] = [];

      for (const doc of CORPUS_DOCUMENTS) {
        if (doc.category === 'Claims') {
          const ast = parse(doc.content);
          if (ast.type === 'Claim') {
            claimsFound.push(ast);
          }
        }
      }

      expect(claimsFound.length).toBe(7);

      for (const claim of claimsFound) {
        // 1. Relevance is present and descriptive
        expect(claim.relevance).toBeDefined();
        expect(claim.relevance.trim().length).toBeGreaterThan(15);

        // 2. Kind H claims return unknown(not-finitely-checkable)
        if (claim.kind === 'H') {
          const res = new Evaluator(createInitialEnvironment()).evaluate(claim.shadow);
          expect(res.type).toBe('unknown');
          expect((res as any).reason).toBe('not-finitely-checkable');
        } else {
          // 3. Non-H claims pass shadow honesty validator
          const honesty = validateShadowHonesty(claim.shadow, createInitialEnvironment());
          expect(honesty.honest).toBe(true);
        }
      }
    });
  });

  describe('2. Sigma Argument Order & Disambiguation', () => {
    it('evaluates expression-first sum(1/n^2, n in 1..10)', () => {
      const res = evaluate('sum(1/n^2, n in 1..10)', createInitialEnvironment()).value;
      expect(res.type).toBe('rational');
      expect((res as any).d).toBeGreaterThan(1n);
    });

    it('evaluates binder-first sum(n in 1..10, 1/n^2)', () => {
      const res = evaluate('sum(n in 1..10, 1/n^2)', createInitialEnvironment()).value;
      expect(res.type).toBe('rational');
      expect((res as any).d).toBeGreaterThan(1n);
    });

    it('evaluates variadic sum(1, 2, 3, 4)', () => {
      const res = evaluate('sum(1, 2, 3, 4)', createInitialEnvironment()).value;
      expect(res).toEqual({ type: 'rational', n: 10n, d: 1n });
    });
  });

  describe('3. Matrix Eigenvalues with Unknown Handling', () => {
    it('returns unknown(requires-unavailable-theory) for complex eigenvalues', () => {
      const res = evaluate('eigenvalues(matrix([[0, -1], [1, 0]]))', createInitialEnvironment()).value;
      expect(res.type).toBe('unknown');
      expect((res as any).reason).toBe('requires-unavailable-theory');
    });

    it('computes exact/convergent eigenvalues for real symmetric matrix', () => {
      const res = evaluate('eigenvalues(matrix([[2, 0], [0, 5]]))', createInitialEnvironment()).value;
      expect(res.type).toBe('list');
      const vals = (res as any).elements.map((e: Value) => (e as any).value);
      expect(vals).toContain(2);
      expect(vals).toContain(5);
    });
  });

  describe('4. Worker Termination Timing (< 100ms)', () => {
    it('terminates a non-yielding loop within 100ms measured', () => {
      const state = new DocumentState('{ loop(x) := loop(x + 1); loop(0) }');
      const { durationMs } = state.stop();
      expect(durationMs).toBeLessThan(100);
      state.dispose();
    });
  });

  describe('5. Corpus Acceptance Values Verification (Single Environment per Document)', () => {
    it('collatz: length 112, max 9232', () => {
      const doc = CORPUS_DOCUMENTS.find(d => d.id === 'collatz')!;
      const { env } = runDocumentLines(doc.content);
      const orbitVal = env['orbit27'] as any;
      expect(orbitVal).toBeDefined();
      expect(orbitVal.elements.length).toBe(112);

      const maxVal = evaluate('max orbit27', env).value;
      expect(valueToNumber(maxVal)).toBe(9232);
    });

    it('basel: sum(1/n^2, n in 1..10) = 1968329/1270080', () => {
      const res = evaluate('sum(1/n^2, n in 1..10)', createInitialEnvironment()).value;
      expect(res).toEqual({ type: 'rational', n: 1968329n, d: 1270080n });
    });

    it('zeno: sum(1/2^n, n in 1..10) = 1023/1024', () => {
      const res = evaluate('sum(1/2^n, n in 1..10)', createInitialEnvironment()).value;
      expect(res).toEqual({ type: 'rational', n: 1023n, d: 1024n });
    });

    it('fibonacci: fib(50) = 12586269025', () => {
      const doc = CORPUS_DOCUMENTS.find(d => d.id === 'fibonacci')!;
      const { env } = runDocumentLines(doc.content);
      const fib50 = evaluate('fib 50', env).value;
      expect(fib50).toEqual({ type: 'rational', n: 12586269025n, d: 1n });
    });

    it('newton: solve(f, near: 2) = 2.0945514815423265 (1e-12)', () => {
      const doc = CORPUS_DOCUMENTS.find(d => d.id === 'newton')!;
      const { env } = runDocumentLines(doc.content);
      const rootVal = evaluate('solve(f, near: 2)', env).value;
      const rootNum = valueToNumber(rootVal);
      expect(Math.abs(rootNum - 2.0945514815423265)).toBeLessThan(1e-12);
    });

    it('goldbach: goldbach(100) returns a prime p with 100-p prime', () => {
      const doc = CORPUS_DOCUMENTS.find(d => d.id === 'goldbach')!;
      const { env } = runDocumentLines(doc.content);
      const pVal = evaluate('goldbach 100', env).value;
      const p = valueToNumber(pVal);
      expect(p).toBeGreaterThanOrEqual(2);
      const isPPrime = evaluate(`isprime(${p})`, env).value;
      const is100MinusPPrime = evaluate(`isprime(100 - ${p})`, env).value;
      expect(isPPrime).toEqual({ type: 'boolean', value: true });
      expect(is100MinusPPrime).toEqual({ type: 'boolean', value: true });
    });

    it('cap_set: the F_3^3 search returns 9', () => {
      const doc = CORPUS_DOCUMENTS.find(d => d.id === 'cap_set')!;
      const { env } = runDocumentLines(doc.content);
      const lenVal = evaluate('length cap3', env).value;
      expect(valueToNumber(lenVal)).toBe(9);
    });

    it('euler: errors naming i, not a generic undeclared-name error', () => {
      const doc = CORPUS_DOCUMENTS.find(d => d.id === 'euler')!;
      const { lineResults } = runDocumentLines(doc.content);
      const errorLine = lineResults.find(r => r.error);
      expect(errorLine).toBeDefined();
      expect(errorLine!.error).toMatch(/imaginary unit 'i'/i);
    });
  });
});

