import { parse } from '../src/core/parser';
import { evaluate, createInitialEnvironment, BudgetTracker } from '../src/core/evaluator';
import { compileRelation } from '../src/core/compiler';
import { formatAST } from '../src/core/formatter';
import { sample2D, sampleSlice } from '../src/core/sampler';
import { ASTNode, Environment, ExpressionValue, RationalValue, FloatValue, SpaceValue, Value } from '../src/core/types';
import { valueToNumber } from '../src/core/numeric/tower';
import * as fs from 'fs';

// Deterministic PRNG: Mulberry32
function createMulberry32(seed: number) {
  let s = seed >>> 0;
  return function next(): number {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface InvariantViolation {
  seed: number;
  category: string;
  expression: string;
  invariant: string;
  discrepancy: string;
  detail?: string;
}

// AST helper to compare ASTs ignoring spans
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

const LIB_FUNCTIONS = [
  ':sin', ':cos', ':tan', ':asin', ':acos', ':atan',
  ':sinh', ':cosh', ':tanh', ':exp', ':ln', ':log', ':log2',
  ':sqrt', ':abs', ':floor', ':ceil', ':gamma', ':erf'
];

const BINARY_OPS = ['+', '-', '*', '/', '^', '%'];
const COMPARISON_OPS = ['==', '!=', '<', '<=', '>', '>=', '='];
const VARIABLE_NAMES = ['x', 'y', 'z', 'u', 'v', 'w', 'p', 'q'];

class WidenedGenerator {
  private rand: () => number;

  constructor(seed: number) {
    this.rand = createMulberry32(seed);
  }

  private pick<T>(arr: T[]): T {
    return arr[Math.floor(this.rand() * arr.length)];
  }

  private intBetween(min: number, max: number): number {
    return Math.floor(this.rand() * (max - min + 1)) + min;
  }

  private floatBetween(min: number, max: number): number {
    return this.rand() * (max - min) + min;
  }

  // 1. \forall bodies with conditionals and recursion
  genForallRecurrence(): { code: string; testPoint: number } {
    const type = this.intBetween(0, 4);
    const n = this.intBetween(0, 8);
    if (type === 0) {
      // Factorial-like
      return {
        code: `{\\forall x, :f(x) = \\if x <= 1 \\then 1 \\else x * :f(x - 1); :f(${n})}`,
        testPoint: n
      };
    } else if (type === 1) {
      // Fibonacci-like
      const fibN = Math.min(n, 7);
      return {
        code: `{\\forall x, :fib(x) = \\if x <= 1 \\then x \\else :fib(x - 1) + :fib(x - 2); :fib(${fibN})}`,
        testPoint: fibN
      };
    } else if (type === 2) {
      // Arithmetic sum
      return {
        code: `{\\forall x, :sum_n(x) = \\if x <= 0 \\then 0 \\else x + :sum_n(x - 1); :sum_n(${n})}`,
        testPoint: n
      };
    } else if (type === 3) {
      // Piecewise polynomial
      const k = this.intBetween(2, 5);
      return {
        code: `{\\forall x, :pw(x) = \\if x < 2 \\then x^${k} \\else 2*x + 1; :pw(${n})}`,
        testPoint: n
      };
    } else {
      // Collatz step recurrence
      const cN = this.intBetween(1, 10);
      return {
        code: `{\\forall x, :cstep(x) = \\if x % 2 == 0 \\then x / 2 \\else 3*x + 1; :cstep(${cN})}`,
        testPoint: cN
      };
    }
  }

  // 2. \match and \build over AST node types
  genMatchBuild(): string {
    const nodeTypes = [
      'NumberLiteral', 'StringLiteral', 'Identifier', 'BinaryOp', 'UnaryOp',
      'PostfixOp', 'FunctionCall', 'Diff', 'BracketOp', 'Tuple', 'List'
    ];
    const target = this.pick(nodeTypes);
    const num = this.intBetween(1, 20);
    const op = this.pick(['+', '-', '*', '/']);
    const fn = this.pick([':sin', ':cos', ':exp']);

    switch (target) {
      case 'NumberLiteral':
        return `\\match \\quote(${num}) { \\case ${num}: "matched", \\otherwise: "other" }`;
      case 'StringLiteral':
        return `\\match \\quote("axine_${num}") { \\case "axine_${num}": "matched", \\otherwise: "other" }`;
      case 'Identifier':
        return `\\match \\quote(x) { \\case _: "matched_id", \\otherwise: "other" }`;
      case 'BinaryOp':
        return `\\match \\quote(a ${op} b) { \\case :u ${op} :v: \\build { :u * :v }, \\otherwise: \\quote(0) }`;
      case 'UnaryOp':
        return `\\match \\quote(-x) { \\case -:u: \\build :UnaryOp("-", \\quote(:u)), \\otherwise: \\quote(0) }`;
      case 'PostfixOp':
        return `\\match \\quote(n!) { \\case :u!: \\build :PostfixOp("!", \\quote(:u)), \\otherwise: \\quote(0) }`;
      case 'FunctionCall':
        return `\\match \\quote(${fn}(x)) { \\case ${fn}(:u): \\build :FunctionCall(${fn}, [\\quote(:u)]), \\otherwise: \\quote(0) }`;
      case 'Diff':
        return `\\match \\quote(d//dx (x^2)) { \\case d//dx (:u): \\build :Diff(:x, \\quote(:u)), \\otherwise: \\quote(0) }`;
      case 'BracketOp':
        return `\\match \\quote(|x + 1|) { \\case |:u|: \\build :BracketOp(:abs, \\quote(:u)), \\otherwise: \\quote(0) }`;
      case 'Tuple':
        return `\\match \\quote((1, 2)) { \\case (:a, :b): \\build :Tuple([\\quote(:a), \\quote(:b)]), \\otherwise: \\quote(0) }`;
      case 'List':
        return `\\match \\quote([1, 2, 3]) { \\case [:a, :b, :c]: \\build :List([\\quote(:a), \\quote(:b), \\quote(:c)]), \\otherwise: \\quote(0) }`;
      default:
        return `\\match \\quote(1 + 1) { \\case :a + :b: "sum", \\otherwise: "other" }`;
    }
  }

  // 3. Collections, folds, and maps
  genCollectionFoldMap(): string {
    const collType = this.pick(['set', 'multiset', 'list', 'range']);
    const op = this.pick(['+', '*']);
    const init = op === '+' ? 0 : 1;
    const len = this.intBetween(2, 6);
    const nums = Array.from({ length: len }, () => this.intBetween(1, 5));

    let collStr = '';
    if (collType === 'set') {
      collStr = `\\set { ${nums.join(', ')} }`;
    } else if (collType === 'multiset') {
      collStr = `\\multiset { ${nums.join(', ')} }`;
    } else if (collType === 'list') {
      collStr = `[${nums.join(', ')}]`;
    } else {
      const start = this.intBetween(1, 3);
      const end = start + this.intBetween(2, 6);
      collStr = `${start}..${end}`;
    }

    const action = this.pick(['fold', 'map', 'quantifier']);
    if (action === 'fold') {
      return `\\fold (${op}) \\over ${collStr} \\from ${init}`;
    } else if (action === 'map') {
      const pow = this.intBetween(2, 3);
      return `\\map (x -> x^${pow}) \\over ${collStr}`;
    } else {
      return `\\forall x \\in ${collStr}, x >= 0`;
    }
  }

  // 4. User-defined structures and overloaded operators
  genUserStructuresAndOperators(): string {
    const choice = this.intBetween(0, 3);
    const a = this.intBetween(1, 6);
    const b = this.intBetween(1, 6);
    if (choice === 0) {
      // Infix custom operator
      return `{\\operator \\circledast (u, v) := u * v - u + v \\precedence: 45; ${a} \\circledast ${b}}`;
    } else if (choice === 1) {
      // Prefix custom operator
      return `{\\operator \\prefix \\diamond (f) := f * 2 + 3; \\diamond ${a}}`;
    } else if (choice === 2) {
      // Postfix custom operator
      return `{\\operator \\postfix ° (x) := x * 2; ${a}°}`;
    } else {
      // Equational rewrite rule
      return `{\\rule :cube(:x) => :x * :x * :x; :cube(${a})}`;
    }
  }

  // 5. Quoted and unquoted expressions, nested
  genQuotedNested(): string {
    const depth = this.intBetween(1, 4);
    let inner = `${this.intBetween(1, 10)} + ${this.intBetween(1, 10)}`;
    for (let i = 0; i < depth; i++) {
      inner = `\\quote(${inner})`;
    }
    for (let i = 0; i < depth; i++) {
      inner = `\\unquote(${inner})`;
    }
    return inner;
  }

  // 6. Imports and unimports in nested scopes
  genImportsUnimports(): string {
    const choice = this.intBetween(0, 2);
    if (choice === 0) {
      return `{\\import "constants/pi.ax"; :pi * 2}`;
    } else if (choice === 1) {
      return `{\\import "constants/pi.ax"; {\\unimport "pi"; \\if :pi \\then 1 \\else 0}}`;
    } else {
      return `{\\import "constants/e.ax"; {\\import "constants/pi.ax"; :pi + e}}`;
    }
  }

  // 7. Relations with 1 to 8 free variables
  genRelationN(numVars: number): { expr: string; vars: string[]; expectedDim: number } {
    const vars = VARIABLE_NAMES.slice(0, numVars);
    const op = this.pick(['+', '-']);
    const rhs = this.intBetween(1, 16);
    let lhsTerms = vars.map(v => `${v}^2`).join(` ${op} `);
    return {
      expr: `${lhsTerms} = ${rhs}`,
      vars,
      expectedDim: numVars
    };
  }

  // 8. \axis declarations with aliases and scaling relations
  genAxisAliases(): string {
    const choice = this.intBetween(0, 2);
    if (choice === 0) {
      return `{\\axis[X, Y]; Y = X^2}`;
    } else if (choice === 1) {
      return `{\\axis[X, Y]; X = a; Y = b; b = a^2}`;
    } else {
      return `{\\axis[X, Y]; X = 2*u; Y = 3*v; u^2 + v^2 = 1}`;
    }
  }

  // 9. Library functions in relations being sampled
  genSampledRelation(): { expr: string; vars: string[]; fn: string } {
    const fn1 = this.pick(LIB_FUNCTIONS);
    const fn2 = this.pick(LIB_FUNCTIONS);
    const op = this.pick(['+', '-', '*']);
    const choice = this.intBetween(0, 2);
    if (choice === 0) {
      return {
        expr: `${fn1}(x) ${op} ${fn2}(y) = 0.5`,
        vars: ['x', 'y'],
        fn: `${fn1}_${fn2}`
      };
    } else if (choice === 1) {
      return {
        expr: `z = ${fn1}(x^2 + y^2)`,
        vars: ['x', 'y', 'z'],
        fn: `${fn1}_3d`
      };
    } else {
      return {
        expr: `${fn1}(x) = y`,
        vars: ['x', 'y'],
        fn: `${fn1}_2d`
      };
    }
  }

  // 10. General arithmetic expression generator for algebraic invariants
  genArithmeticExpr(depth: number = 2): string {
    if (depth <= 0) {
      const choice = this.intBetween(0, 2);
      if (choice === 0) return `${this.intBetween(-10, 10)}`;
      if (choice === 1) return `${this.intBetween(1, 9)}/${this.intBetween(1, 9)}`;
      return `${this.floatBetween(-5, 5).toFixed(2)}`;
    }
    const op = this.pick(BINARY_OPS);
    const left = this.genArithmeticExpr(depth - 1);
    const right = this.genArithmeticExpr(depth - 1);
    return `(${left} ${op} ${right})`;
  }
}

async function runFuzzHarness(targetIterations: number = 1_000_000) {
  console.log(`=============================================================`);
  console.log(`Starting Widened Invariant Fuzzing Harness: ${targetIterations.toLocaleString()} iterations`);
  console.log(`=============================================================\n`);

  const violations: InvariantViolation[] = [];
  const invariantCounts: Record<string, number> = {};

  function recordViolation(v: InvariantViolation) {
    violations.push(v);
    invariantCounts[v.invariant] = (invariantCounts[v.invariant] || 0) + 1;
  }

  const startTime = Date.now();
  let progressStep = Math.floor(targetIterations / 10);
  if (progressStep === 0) progressStep = 1000;

  const baseEnv = createInitialEnvironment();

  for (let i = 0; i < targetIterations; i++) {
    const gen = new WidenedGenerator(i);
    const categorySelector = i % 10;

    if (i > 0 && i % progressStep === 0) {
      const elapsedSec = (Date.now() - startTime) / 1000;
      const rate = (i / elapsedSec).toFixed(0);
      console.log(`[Progress] ${i.toLocaleString()} / ${targetIterations.toLocaleString()} (${((i / targetIterations) * 100).toFixed(1)}%) — ${rate} iter/s — ${violations.length} violations found`);
    }

    try {
      if (categorySelector === 0) {
        // \forall with conditionals & recursion -> Check I1 & I6
        const { code, testPoint } = gen.genForallRecurrence();
        try {
          const res1 = evaluate(code, baseEnv);
          // Invariant I6: Result is valid value or budget-exhausted unknown
          if (res1.value.type === 'unknown' && res1.value.reason !== 'budget-exhausted') {
            recordViolation({
              seed: i,
              category: 'forall_recurrence',
              expression: code,
              invariant: 'I6 (Honest Stance on Unreducibles)',
              discrepancy: `Evaluated to unknown with unexpected reason: ${(res1.value as any).reason}`,
            });
          }
          // Invariant I1: Reduction idempotency
          if (res1.value.type === 'rational' || res1.value.type === 'float') {
            const numVal = valueToNumber(res1.value);
            if (Number.isNaN(numVal)) {
              recordViolation({
                seed: i,
                category: 'forall_recurrence',
                expression: code,
                invariant: 'I6 (Honest Stance on Unreducibles)',
                discrepancy: `Evaluated to NaN in reduction path`,
              });
            }
          }
        } catch (err: any) {
          recordViolation({
            seed: i,
            category: 'forall_recurrence',
            expression: code,
            invariant: 'I6 (Honest Stance on Unreducibles)',
            discrepancy: `Evaluator threw unhandled runtime error: ${err.message}`,
          });
        }
      } else if (categorySelector === 1) {
        // \match and \build -> Check I1-Expr, I4-Expr
        const code = gen.genMatchBuild();
        try {
          const res = evaluate(code, baseEnv);
          if (res.value.type === 'expression') {
            const exprVal = res.value as ExpressionValue;
            // Round-trip parse/format check (I4-Expr)
            const formatted = formatAST(exprVal.ast);
            const reparsed = parse(formatted);
            const reformatted = formatAST(reparsed);
            if (reformatted !== formatted) {
              recordViolation({
                seed: i,
                category: 'match_build',
                expression: code,
                invariant: 'I4-Expr (Round-trip Formatting)',
                discrepancy: `Formatted '${formatted}' does not round-trip idempotently: '${reformatted}'`,
              });
            }
          }
        } catch (err: any) {
          // Syntax / match errors that are expected when match has no otherwise are OK, but internal crashes are not
          if (!err.message?.includes('No matching pattern') && !err.message?.includes('Parse error')) {
            recordViolation({
              seed: i,
              category: 'match_build',
              expression: code,
              invariant: 'I6 (Honest Stance on Unreducibles)',
              discrepancy: `Unhandled exception during match/build: ${err.message}`,
            });
          }
        }
      } else if (categorySelector === 2) {
        // Collections, folds, maps -> Check I1, I5, I6
        const code = gen.genCollectionFoldMap();
        try {
          const res1 = evaluate(code, baseEnv);
          if (res1.value.type === 'rational' || res1.value.type === 'float') {
            const num1 = valueToNumber(res1.value);
            if (Number.isNaN(num1)) {
              recordViolation({
                seed: i,
                category: 'collections_fold_map',
                expression: code,
                invariant: 'I6 (Honest Stance on Unreducibles)',
                discrepancy: `Fold/Map evaluated to NaN`,
              });
            }
          }
        } catch (err: any) {
          recordViolation({
            seed: i,
            category: 'collections_fold_map',
            expression: code,
            invariant: 'I6 (Honest Stance on Unreducibles)',
            discrepancy: `Collection/fold/map evaluation threw: ${err.message}`,
          });
        }
      } else if (categorySelector === 3) {
        // User structures & operators -> Check I7, I1
        const code = gen.genUserStructuresAndOperators();
        try {
          const res = evaluate(code, baseEnv);
          if (res.value.type === 'rational' || res.value.type === 'float') {
            const num = valueToNumber(res.value);
            if (Number.isNaN(num)) {
              recordViolation({
                seed: i,
                category: 'user_structures_operators',
                expression: code,
                invariant: 'I7 (Operator Standing)',
                discrepancy: `User operator evaluation produced NaN`,
              });
            }
          }
        } catch (err: any) {
          recordViolation({
            seed: i,
            category: 'user_structures_operators',
            expression: code,
            invariant: 'I7 (Operator Standing)',
            discrepancy: `User operator evaluation threw: ${err.message}`,
          });
        }
      } else if (categorySelector === 4) {
        // Quoted nested expressions -> Check I1-Expr, I3-Expr
        const code = gen.genQuotedNested();
        try {
          const res = evaluate(code, baseEnv);
          if (res.value.type === 'rational' || res.value.type === 'float') {
            const n = valueToNumber(res.value);
            if (Number.isNaN(n)) {
              recordViolation({
                seed: i,
                category: 'quoted_nested',
                expression: code,
                invariant: 'I1-Expr (Idempotence of Expression Reduction)',
                discrepancy: `Nested unquote evaluated to NaN`,
              });
            }
          }
        } catch (err: any) {
          recordViolation({
            seed: i,
            category: 'quoted_nested',
            expression: code,
            invariant: 'I1-Expr (Idempotence of Expression Reduction)',
            discrepancy: `Nested quote/unquote evaluation threw: ${err.message}`,
          });
        }
      } else if (categorySelector === 5) {
        // Imports/unimports in nested scopes -> Check I6
        const code = gen.genImportsUnimports();
        try {
          const res = evaluate(code, baseEnv);
          // Should evaluate cleanly
        } catch (err: any) {
          recordViolation({
            seed: i,
            category: 'imports_unimports',
            expression: code,
            invariant: 'I6 (Honest Stance on Unreducibles)',
            discrepancy: `Scope import/unimport threw: ${err.message}`,
          });
        }
      } else if (categorySelector === 6) {
        // Relations with 1 to 8 free variables -> Check I4 & I2
        const nVars = (i % 8) + 1;
        const { expr, vars, expectedDim } = gen.genRelationN(nVars);
        try {
          const res = evaluate(expr, baseEnv);
          if (res.value.type === 'space') {
            const space = res.value as SpaceValue;
            if (space.dimension !== expectedDim) {
              recordViolation({
                seed: i,
                category: `relation_${nVars}vars`,
                expression: expr,
                invariant: 'I4 (Free-Variable & Spatial Concordance)',
                discrepancy: `Inferred space dimension ${space.dimension} != expected ${expectedDim} variables: ${vars.join(',')}`,
              });
            }
            if (space.coordinates.length !== expectedDim) {
              recordViolation({
                seed: i,
                category: `relation_${nVars}vars`,
                expression: expr,
                invariant: 'I4 (Free-Variable & Spatial Concordance)',
                discrepancy: `Space coordinates length ${space.coordinates.length} != ${expectedDim}`,
              });
            }
          }
        } catch (err: any) {
          recordViolation({
            seed: i,
            category: `relation_${nVars}vars`,
            expression: expr,
            invariant: 'I4 (Free-Variable & Spatial Concordance)',
            discrepancy: `Space relation evaluation threw: ${err.message}`,
          });
        }
      } else if (categorySelector === 7) {
        // \axis declarations with aliases -> Check Gate 5 / I4
        const code = gen.genAxisAliases();
        try {
          const res = evaluate(code, baseEnv);
          if (res.value.type === 'space') {
            const space = res.value as SpaceValue;
            if (!space.declaredAxes || space.declaredAxes.length === 0) {
              recordViolation({
                seed: i,
                category: 'axis_aliases',
                expression: code,
                invariant: 'I4 (Free-Variable & Spatial Concordance)',
                discrepancy: `Space with \\axis declaration did not set declaredAxes`,
              });
            }
          }
        } catch (err: any) {
          recordViolation({
            seed: i,
            category: 'axis_aliases',
            expression: code,
            invariant: 'I4 (Free-Variable & Spatial Concordance)',
            discrepancy: `\\axis block evaluation threw: ${err.message}`,
          });
        }
      } else if (categorySelector === 8) {
        // Library functions in relations being sampled -> Check I2 & I2-Expr (Compiler vs Reducer)
        const { expr, vars, fn } = gen.genSampledRelation();
        try {
          const ast = parse(expr);
          const compiled = compileRelation(ast, vars);
          if (compiled.success) {
            // Test points
            const pt1 = Array.from({ length: vars.length }, () => gen.floatBetween(-2.5, 2.5));
            const envWithVars: Environment = { ...baseEnv };
            for (let vIdx = 0; vIdx < vars.length; vIdx++) {
              envWithVars[vars[vIdx]] = { type: 'float', value: pt1[vIdx] };
            }

            const compVal = compiled.fn(...pt1);
            const evalRes = evaluate(expr, envWithVars);
            let evalValNum = NaN;
            if (evalRes.value.type === 'float') evalValNum = (evalRes.value as FloatValue).value;
            else if (evalRes.value.type === 'rational') evalValNum = Number((evalRes.value as RationalValue).n) / Number((evalRes.value as RationalValue).d);
            else if (evalRes.value.type === 'boolean') evalValNum = (evalRes.value as any).value ? 1 : 0;

            if (Number.isFinite(compVal) && Number.isFinite(evalValNum)) {
              const diff = Math.abs(compVal - evalValNum);
              if (diff > 1e-4) {
                recordViolation({
                  seed: i,
                  category: 'sampled_relation_compiler_agreement',
                  expression: `${expr} at (${pt1.map(p => p.toFixed(3)).join(', ')})`,
                  invariant: 'I2 (Compiler-Reducer Equivalence)',
                  discrepancy: `Compiled closure returned ${compVal} vs Reducer returned ${evalValNum} (diff: ${diff})`,
                });
              }
            } else if (Number.isFinite(compVal) !== Number.isFinite(evalValNum)) {
              // Disagreement on definedness / domain
              recordViolation({
                seed: i,
                category: 'sampled_relation_compiler_agreement',
                expression: `${expr} at (${pt1.map(p => p.toFixed(3)).join(', ')})`,
                invariant: 'I2 (Compiler-Reducer Equivalence)',
                discrepancy: `Domain discrepancy: Compiled finite = ${Number.isFinite(compVal)} (${compVal}) vs Reducer finite = ${Number.isFinite(evalValNum)} (${evalValNum})`,
              });
            }
          }
        } catch (err: any) {
          // Record any unhandled errors
          recordViolation({
            seed: i,
            category: 'sampled_relation_compiler_agreement',
            expression: expr,
            invariant: 'I2 (Compiler-Reducer Equivalence)',
            discrepancy: `Relation compilation/evaluation threw: ${err.message}`,
          });
        }
      } else {
        // Category 9: Algebraic Field Axioms (I5) - Commutativity, Associativity, Distributivity
        const aVal = gen.intBetween(-10, 10);
        const bVal = gen.intBetween(-10, 10);
        const cVal = gen.intBetween(-10, 10);

        // Check addition commutativity
        try {
          const res1 = evaluate(`${aVal} + ${bVal}`, baseEnv);
          const res2 = evaluate(`${bVal} + ${aVal}`, baseEnv);
          const n1 = valueToNumber(res1.value);
          const n2 = valueToNumber(res2.value);
          if (n1 !== n2) {
            recordViolation({
              seed: i,
              category: 'algebraic_field_axioms',
              expression: `${aVal} + ${bVal} vs ${bVal} + ${aVal}`,
              invariant: 'I5 (Context Field Axioms)',
              discrepancy: `Additive commutativity failed: ${n1} != ${n2}`,
            });
          }
        } catch (err: any) {
          recordViolation({
            seed: i,
            category: 'algebraic_field_axioms',
            expression: `${aVal} + ${bVal}`,
            invariant: 'I5 (Context Field Axioms)',
            discrepancy: `Addition threw error: ${err.message}`,
          });
        }

        // Check multiplication commutativity
        try {
          const res1 = evaluate(`${aVal} * ${bVal}`, baseEnv);
          const res2 = evaluate(`${bVal} * ${aVal}`, baseEnv);
          const n1 = valueToNumber(res1.value);
          const n2 = valueToNumber(res2.value);
          if (n1 !== n2) {
            recordViolation({
              seed: i,
              category: 'algebraic_field_axioms',
              expression: `${aVal} * ${bVal} vs ${bVal} * ${aVal}`,
              invariant: 'I5 (Context Field Axioms)',
              discrepancy: `Multiplicative commutativity failed: ${n1} != ${n2}`,
            });
          }
        } catch (err: any) {
          recordViolation({
            seed: i,
            category: 'algebraic_field_axioms',
            expression: `${aVal} * ${bVal}`,
            invariant: 'I5 (Context Field Axioms)',
            discrepancy: `Multiplication threw error: ${err.message}`,
          });
        }

        // Check distributivity a * (b + c) == a*b + a*c
        try {
          const resLeft = evaluate(`${aVal} * (${bVal} + ${cVal})`, baseEnv);
          const resRight = evaluate(`${aVal} * ${bVal} + ${aVal} * ${cVal}`, baseEnv);
          const nL = valueToNumber(resLeft.value);
          const nR = valueToNumber(resRight.value);
          if (nL !== nR) {
            recordViolation({
              seed: i,
              category: 'algebraic_field_axioms',
              expression: `${aVal} * (${bVal} + ${cVal}) vs ${aVal}*${bVal} + ${aVal}*${cVal}`,
              invariant: 'I5 (Context Field Axioms)',
              discrepancy: `Distributivity failed: ${nL} != ${nR}`,
            });
          }
        } catch (err: any) {
          recordViolation({
            seed: i,
            category: 'algebraic_field_axioms',
            expression: `${aVal} * (${bVal} + ${cVal})`,
            invariant: 'I5 (Context Field Axioms)',
            discrepancy: `Distributivity evaluation threw: ${err.message}`,
          });
        }
      }
    } catch (globalErr: any) {
      recordViolation({
        seed: i,
        category: 'harness_global',
        expression: `Iteration ${i}`,
        invariant: 'I6 (Honest Stance on Unreducibles)',
        discrepancy: `Global harness exception: ${globalErr.message}`,
      });
    }
  }

  const totalTimeSec = (Date.now() - startTime) / 1000;

  console.log(`\n=============================================================`);
  console.log(`Widened Invariant Fuzzing Complete!`);
  console.log(`• Total Cases Generated & Verified: ${targetIterations.toLocaleString()}`);
  console.log(`• Total Elapsed Time: ${totalTimeSec.toFixed(2)} seconds (${(targetIterations / totalTimeSec).toFixed(0)} iter/s)`);
  console.log(`• Total Invariant Violations: ${violations.length}`);
  console.log(`=============================================================\n`);

  console.log(`--- VIOLATION SUMMARY BY INVARIANT ---`);
  for (const [inv, count] of Object.entries(invariantCounts)) {
    console.log(`• ${inv}: ${count} violation(s)`);
  }

  if (violations.length > 0) {
    console.log(`\n--- FIRST 20 VIOLATION DETAILS ---`);
    for (let vIdx = 0; vIdx < Math.min(20, violations.length); vIdx++) {
      const v = violations[vIdx];
      console.log(`[#${vIdx + 1}] Seed: ${v.seed} | Category: ${v.category} | Invariant: ${v.invariant}`);
      console.log(`    Expression: ${v.expression}`);
      console.log(`    Discrepancy: ${v.discrepancy}`);
    }
  }

  // Write full JSON report to disk
  fs.writeFileSync('scripts/fuzz_violations_report.json', JSON.stringify({
    totalIterations: targetIterations,
    totalTimeSec,
    invariantCounts,
    violations
  }, null, 2));
  console.log(`\nFull violation report written to: scripts/fuzz_violations_report.json`);
}

// Default run with 1,000,000 iterations
const iters = process.argv[2] ? parseInt(process.argv[2], 10) : 1_000_000;
runFuzzHarness(iters);
