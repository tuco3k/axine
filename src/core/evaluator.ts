import {
  ASTNode,
  BigOpNode,
  BudgetLimits,
  ClaimNode,
  ClaimValue,
  CurveSeries,
  DEFAULT_BUDGET_LIMITS,
  DiffNode,
  LimitNode,
  Environment,
  FunctionCallNode,
  FunctionValue,
  GraphSpec,
  GraphValue,
  LambdaValue,
  ListValue,
  RangeNode,
  Span,
  UnknownReason,
  UnknownValue,
  Value,
  StepValue,
  ObstructionReason,
  RecordDefNode,
  RecordConstructorValue,
  QuantityValue,
  BinaryOpNode,
  UnaryOpNode,
  PostfixOpNode,
  ImportNode,
  TrajectoryValue,
  TrajectorySample,
} from './types';
import { BUNDLED_DOCUMENTS } from '../document/virtual_documents';
import { getTrajectoryStateAt, mapTrajectory, exportTrajectory } from './simulation/trajectory';
import { classifyODE, solveODERK4 } from './simulation/ode_solver';
import { BigFraction } from './numeric/rational';
import {
  addValues,
  applyBuiltin,
  compareValues,
  divValues,
  factorialValue,
  formatDimensions,
  formatQuantityString,
  makeFloat,
  makeNone,
  makeUnknown,
  modValues,
  mulValues,
  powValues,
  subValues,
  valueToNumber,
} from './numeric/tower';
import { FLOAT_CONSTANTS } from './numeric/float';
import { BUILTIN_FUNCTIONS, CONSTANTS, parse, parseProgram } from './parser';
import { analyzeAST } from './analyzer';
import { solveAlgebraic } from './algebra';
import { AlgebraicSimplifier } from './algebra/simplify';
import { createError } from './errors';
import { formatAST } from './formatter';
import { inferExpressionDimensions, checkGeometricQuantity } from './dimensional';
import { computeSymbolicDerivative } from './symbolic_diff';
import { MathKind, formatKind, admitsOperations, canCoerceKind, inferKindOfValue } from './kinds';

export function createInitialEnvironment(): Environment {
  const env: Environment = {};

  // Add constants
  for (const [name, val] of Object.entries(FLOAT_CONSTANTS)) {
    env[name] = { type: 'float', value: val };
  }
  env['none'] = { type: 'none' };
  env['true'] = { type: 'boolean', value: true };
  env['false'] = { type: 'boolean', value: false };

  return env;
}

export class BudgetExhaustedError extends Error {
  public reason: UnknownReason;
  public detail?: string;

  constructor(reason: UnknownReason = 'budget-exhausted', detail?: string) {
    super(`Budget exhausted: ${reason}${detail ? ` (${detail})` : ''}`);
    this.name = 'BudgetExhaustedError';
    this.reason = reason;
    this.detail = detail;
    Object.setPrototypeOf(this, BudgetExhaustedError.prototype);
  }
}

export class BudgetTracker {
  public steps: number = 0;
  public depth: number = 0;
  public peakDepth: number = 0;
  public memoHits: number = 0;
  public memoMisses: number = 0;
  public startTime: number;
  public deadline: number;
  public limits: BudgetLimits;

  constructor(limits: BudgetLimits = DEFAULT_BUDGET_LIMITS) {
    this.limits = limits;
    this.startTime = Date.now();
    this.deadline = this.startTime + limits.timeoutMs;
  }

  public check(_fnName?: string, _span?: Span): void {
    this.steps++;
    if (this.steps > this.limits.maxSteps) {
      throw new BudgetExhaustedError(
        'budget-exhausted',
        `step limit (${this.limits.maxSteps.toLocaleString()}) reached`
      );
    }
    if (this.steps % 500 === 0) {
      if (Date.now() > this.deadline) {
        throw new BudgetExhaustedError(
          'budget-exhausted',
          `wall-clock timeout (${this.limits.timeoutMs}ms) reached`
        );
      }
    }
  }

  public enterFunction(fnName: string, span?: Span): void {
    this.depth++;
    if (this.depth > this.peakDepth) this.peakDepth = this.depth;
    if (this.depth > this.limits.maxDepth) {
      throw createError(
        `recursion depth exceeded in ${fnName} — is there a base case?`,
        span ?? { start: 0, end: 0, line: 1, col: 1 }
      );
    }
  }

  public exitFunction(): void {
    this.depth--;
  }

  public checkBigInt(n: bigint, _span?: Span): void {
    const s = n.toString();
    if (s.length > this.limits.maxBigIntDigits) {
      throw new BudgetExhaustedError(
        'budget-exhausted',
        `BigInt digit limit (${this.limits.maxBigIntDigits}) exceeded`
      );
    }
  }

  public checkMemory(elementCount: number, _span?: Span): void {
    if (elementCount > this.limits.maxMemoryElements) {
      throw new BudgetExhaustedError(
        'budget-exhausted',
        `Memory limit (${this.limits.maxMemoryElements.toLocaleString()} elements) exceeded`
      );
    }
  }
}

export function resolveModuleCode(
  importPath: string
): { code: string; canonicalPath: string } | { searchedPaths: string[] } {
  const normPath = importPath.replace(/\\/g, '/');
  const cleanPath = normPath.replace(/^(\.\/|\/)/, '');
  const fileName = cleanPath.replace(/^.*[\\/]/, '');
  const withAx = (p: string) => (p.endsWith('.ax') ? p : p + '.ax');

  const candidatePaths: string[] = [];
  const addCandidate = (p: string) => {
    const norm = p.replace(/\\/g, '/');
    if (!candidatePaths.includes(norm)) {
      candidatePaths.push(norm);
    }
  };

  addCandidate(importPath);
  addCandidate(normPath);
  addCandidate(cleanPath);
  addCandidate(fileName);
  addCandidate(withAx(normPath));
  addCandidate(withAx(cleanPath));
  addCandidate(withAx(fileName));
  addCandidate(`documents/${withAx(cleanPath)}`);
  addCandidate(`documents/${withAx(fileName)}`);
  addCandidate(`/documents/${withAx(cleanPath)}`);
  addCandidate(`/documents/${withAx(fileName)}`);
  addCandidate(`./${withAx(fileName)}`);

  // 1. Check in-memory virtualFiles first
  for (const cp of candidatePaths) {
    if (Evaluator.virtualFiles.has(cp)) {
      return { code: Evaluator.virtualFiles.get(cp)!, canonicalPath: withAx(fileName) };
    }
  }

  // 2. Check build-time bundled documents
  for (const cp of candidatePaths) {
    if (BUNDLED_DOCUMENTS[cp]) {
      return { code: BUNDLED_DOCUMENTS[cp], canonicalPath: withAx(fileName) };
    }
  }
  const baseAx = withAx(fileName);
  if (BUNDLED_DOCUMENTS[baseAx]) {
    return { code: BUNDLED_DOCUMENTS[baseAx], canonicalPath: baseAx };
  }

  // 3. In Node environment, check physical filesystem
  try {
    if (typeof process !== 'undefined' && (process.versions as any)?.node) {
      const fs = require('fs');
      const path = require('path');
      const fsPaths = [
        normPath,
        cleanPath,
        path.resolve(process.cwd(), cleanPath),
        path.resolve(process.cwd(), 'documents', cleanPath),
        path.resolve(process.cwd(), 'documents', withAx(fileName)),
        path.resolve(process.cwd(), 'src', cleanPath),
      ];
      for (const fp of fsPaths) {
        addCandidate(fp);
        if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
          const code = fs.readFileSync(fp, 'utf-8');
          Evaluator.virtualFiles.set(withAx(fileName), code);
          return { code, canonicalPath: withAx(fileName) };
        }
      }
    }
  } catch {}

  return { searchedPaths: candidatePaths };
}

export class Evaluator {
  public static virtualFiles: Map<string, string> = new Map();

  public static initVirtualFiles(): void {
    for (const [filename, content] of Object.entries(BUNDLED_DOCUMENTS)) {
      Evaluator.virtualFiles.set(filename, content);
      Evaluator.virtualFiles.set(`./${filename}`, content);
      Evaluator.virtualFiles.set(`documents/${filename}`, content);
      Evaluator.virtualFiles.set(`/documents/${filename}`, content);
      Evaluator.virtualFiles.set(`./documents/${filename}`, content);
      const bareName = filename.replace(/\.ax$/, '');
      Evaluator.virtualFiles.set(bareName, content);
    }
  }

  public static resetVirtualFiles(): void {
    Evaluator.virtualFiles.clear();
    Evaluator.initVirtualFiles();
  }

  private env: Environment;
  private source: string;
  private budget: BudgetTracker;
  private memo: Map<string, Value> = new Map();
  public declaredDimensions: Set<string> = new Set();
  public declaredUnits: Map<string, { name: string; dimension: string; factor: number; dimensions: Record<string, number> }> = new Map();
  public userOperators: Map<string, any> = new Map();
  public declaredKinds: Map<string, any> = new Map();
  public userRules: any[] = [];
  public declaredViews: Map<string, Value> = new Map();

  constructor(
    env: Environment = createInitialEnvironment(),
    source: string = '',
    budget: BudgetTracker = new BudgetTracker()
  ) {
    this.env = env;
    this.source = source;
    this.budget = budget;
    if ((env as any).__units__) {
      for (const [k, v] of (env as any).__units__.entries()) {
        this.declaredUnits.set(k, v);
      }
    }
    if ((env as any).__operators__) {
      for (const [k, v] of (env as any).__operators__.entries()) {
        this.userOperators.set(k, v);
      }
    }
    if ((env as any).__rules__) {
      this.userRules.push(...(env as any).__rules__);
    }
    if ((env as any).__views__) {
      for (const [k, v] of (env as any).__views__.entries()) {
        this.declaredViews.set(k, v);
      }
    }
  }

  public evaluate(ast: ASTNode): Value {
    analyzeAST(ast, this.env, new Set(), this.source);
    return this.evalNode(ast, this.env);
  }

  private evalNode(node: ASTNode, currentEnv: Environment): Value {
    this.budget.check(undefined, node.span);

    switch (node.type) {
      case 'NumberLiteral': {
        const frac = BigFraction.fromString(node.raw, node.span);
        this.budget.checkBigInt(frac.n, node.span);
        this.budget.checkBigInt(frac.d, node.span);
        if (frac.d.toString().length > 300) {
          return {
            type: 'float',
            value: frac.toNumber(),
            notice: 'exact result exceeded 300 digits; showing float',
          };
        }
        return { type: 'rational', n: frac.n, d: frac.d };
      }
      case 'Identifier': {
        const name = node.name;
        if (name === 'i' && !(name in currentEnv)) {
          throw createError(
            `Complex numbers are not supported in v1 (imaginary unit 'i' cannot be evaluated)`,
            node.span,
            {
              expected: 'a real number or defined variable',
              suggestion: 'Complex arithmetic is deferred to a future version',
              source: this.source,
            }
          );
        }
        if (name in currentEnv) {
          return currentEnv[name];
        }
        if (name === 'none') {
          return { type: 'none' };
        }
        if (name === 'R' || name === 'Reals' || name === '\u211d') {
          return { type: 'set_value', elementKind: { name: 'Scalar', subtype: 'real' }, standardName: '\u211d', isInfinite: true };
        }
        if (name === 'C' || name === 'Complexes' || name === '\u2102') {
          return { type: 'set_value', elementKind: { name: 'Scalar', subtype: 'complex' }, standardName: '\u2102', isInfinite: true };
        }
        if (name === 'Z' || name === 'Integers' || name === '\u2124') {
          return { type: 'set_value', elementKind: { name: 'Scalar', subtype: 'integer' }, standardName: '\u2124', isInfinite: true };
        }
        if (name === 'Q' || name === 'Rationals' || name === '\u211a') {
          return { type: 'set_value', elementKind: { name: 'Scalar', subtype: 'rational' }, standardName: '\u211a', isInfinite: true };
        }
        if (name === 'N' || name === 'Naturals' || name === '\u2115') {
          return { type: 'set_value', elementKind: { name: 'Scalar', subtype: 'natural' }, standardName: '\u2115', isInfinite: true };
        }
        if (CONSTANTS.has(name) && name in FLOAT_CONSTANTS) {
          return { type: 'float', value: FLOAT_CONSTANTS[name] };
        }
        if (BUILTIN_FUNCTIONS.has(name)) {
          return {
            type: 'builtin_function',
            name,
          } as any;
        }
        if (name === 'i') {
          throw createError(`Complex numbers and imaginary unit 'i' are unsupported in v1`, node.span, {
            expected: `real number expression`,
            suggestion: `Euler's identity requires complex numbers (unavailable in real arithmetic tower)`,
            source: this.source,
          });
        }
        throw createError(`Variable '${name}' is not assigned a value`, node.span, {
          expected: `a value assigned to '${name}'`,
          suggestion: `Assign a value (e.g. ${name} := 5) or use graph(${name}) to plot it`,
          source: this.source,
        });
      }
      case 'UnaryOp': {
        const userOp = this.userOperators.get(node.op) || (currentEnv as any).__operators__?.get(node.op) || (this.env as any).__operators__?.get(node.op);
        if (userOp && userOp.fixity === 'prefix') {
          const operandVal = this.evalNode(node.operand, currentEnv);
          const callEnv: Environment = {
            ...userOp.env,
            ...currentEnv,
            [userOp.params[0]]: operandVal,
          };
          return this.evalNode(userOp.body, callEnv);
        }
        const operand = this.evalNode(node.operand, currentEnv);
        if (operand.type === 'unknown') return operand;
        if (node.op === 'not') {
          return { type: 'boolean', value: !this.isTruthy(operand) };
        }
        if (node.op === '+') {
          return operand;
        }
        if (node.op === '-') {
          return subValues({ type: 'rational', n: 0n, d: 1n }, operand, node.span);
        }
        if (node.op === '\u221a') {
          return applyBuiltin('sqrt', [operand], node.span);
        }
        throw createError(`Unknown unary operator '${node.op}'`, node.span);
      }
      case 'BinaryOp': {
        const userOp = this.userOperators.get(node.op) || (currentEnv as any).__operators__?.get(node.op) || (this.env as any).__operators__?.get(node.op);
        if (userOp && userOp.fixity === 'infix') {
          const left = this.evalNode(node.left, currentEnv);
          const right = this.evalNode(node.right, currentEnv);
          const callEnv: Environment = {
            ...userOp.env,
            ...currentEnv,
            [userOp.params[0]]: left,
            [userOp.params[1]]: right,
          };
          return this.evalNode(userOp.body, callEnv);
        }
        if (node.op === 'and') {
          const left = this.evalNode(node.left, currentEnv);
          if (left.type === 'boolean' && !left.value) {
            return { type: 'boolean', value: false };
          }
          if (left.type === 'unknown') {
            const right = this.evalNode(node.right, currentEnv);
            if (right.type === 'boolean' && !right.value) {
              return { type: 'boolean', value: false };
            }
            return left;
          }
          const right = this.evalNode(node.right, currentEnv);
          if (right.type === 'unknown') return right;
          if (right.type === 'boolean' && !right.value) {
            return { type: 'boolean', value: false };
          }
          return { type: 'boolean', value: this.isTruthy(left) && this.isTruthy(right) };
        }
        if (node.op === 'or') {
          const left = this.evalNode(node.left, currentEnv);
          if (left.type === 'boolean' && left.value) {
            return { type: 'boolean', value: true };
          }
          if (left.type === 'unknown') {
            const right = this.evalNode(node.right, currentEnv);
            if (right.type === 'boolean' && right.value) {
              return { type: 'boolean', value: true };
            }
            return left;
          }
          const right = this.evalNode(node.right, currentEnv);
          if (right.type === 'unknown') return right;
          if (right.type === 'boolean' && right.value) {
            return { type: 'boolean', value: true };
          }
          return { type: 'boolean', value: this.isTruthy(left) || this.isTruthy(right) };
        }
        if (node.op === 'in') {
          throw createError(`Invalid use of 'in' operator`, node.span, {
            expected: 'range expression in graph or series',
            suggestion: 'Use range in graph(expr, x in a..b)',
            source: this.source,
          });
        }

        const left = this.evalNode(node.left, currentEnv);
        if (node.op === '*' && (left.type === 'function' || left.type === 'lambda')) {
          const right = this.evalNode(node.right, currentEnv);
          const args = right.type === 'tuple' ? right.elements : [right];
          return this.invokeCallable(left, args, node.span);
        }
        const right = this.evalNode(node.right, currentEnv);

        switch (node.op) {
          case '+':
            return addValues(left, right, node.span);
          case '-':
            return subValues(left, right, node.span);
          case '*':
            return mulValues(left, right, node.span);
          case '/':
            return divValues(left, right, node.span);
          case '%':
            return modValues(left, right, node.span);
          case '^':
            return powValues(left, right, node.span);
          case '=':
          case '==':
          case '!=':
          case '<':
          case '<=':
          case '>':
          case '>=':
            return compareValues(node.op, left, right, node.span);
        }
        throw createError(`Unknown binary operator '${node.op}'`, node.span);
      }
      case 'If': {
        const condVal = this.evalNode(node.condition, currentEnv);
        if (this.isTruthy(condVal)) {
          return this.evalNode(node.thenBranch, currentEnv);
        } else {
          return this.evalNode(node.elseBranch, currentEnv);
        }
      }
      case 'PostfixOp': {
        const userOp = this.userOperators.get(node.op) || (currentEnv as any).__operators__?.get(node.op) || (this.env as any).__operators__?.get(node.op);
        if (userOp && userOp.fixity === 'postfix') {
          const operandVal = this.evalNode(node.operand, currentEnv);
          const callEnv: Environment = {
            ...userOp.env,
            ...currentEnv,
            [userOp.params[0]]: operandVal,
          };
          return this.evalNode(userOp.body, callEnv);
        }
        const operand = this.evalNode(node.operand, currentEnv);
        if (node.op === '!') {
          return factorialValue(operand, node.span);
        }
        if (node.op === 'superscript') {
          const exp = node.exponent ?? 2n;
          return powValues(operand, { type: 'rational', n: exp, d: 1n }, node.span);
        }
        throw createError(`Unknown postfix operator '${node.op}'`, node.span);
      }
      case 'Tuple': {
        const elements = node.elements.map(el => this.evalNode(el, currentEnv));
        return { type: 'tuple', elements };
      }
      case 'List': {
        const elements = node.elements.map(el => this.evalNode(el, currentEnv));
        return { type: 'list', elements };
      }
      case 'Lambda': {
        return {
          type: 'lambda',
          params: node.params,
          body: node.body,
          closure: { ...currentEnv },
        };
      }
      case 'Range': {
        const startVal = valueToNumber(this.evalNode(node.start, currentEnv), node.start.span);
        const endVal = valueToNumber(this.evalNode(node.end, currentEnv), node.end.span);
        let stepVal: number | undefined;
        if (node.step) {
          stepVal = valueToNumber(this.evalNode(node.step, currentEnv), node.step.span);
        }
        return {
          type: 'range',
          variable: node.variable,
          start: startVal,
          end: endVal,
          step: stepVal,
        };
      }
      case 'Assignment': {
        if (node.value.type === 'RecordDef') {
          const recDef = node.value as RecordDefNode;
          const val: RecordConstructorValue = {
            type: 'record_constructor',
            name: node.target,
            fieldNames: recDef.fields,
          };
          currentEnv[node.target] = val;
          if (currentEnv === this.env) {
            this.env[node.target] = val;
          }
          return val;
        }
        const val = this.evalNode(node.value, currentEnv);
        currentEnv[node.target] = val;
        if (currentEnv === this.env) {
          this.env[node.target] = val;
        }
        return val;
      }
      case 'GlobalAssignment': {
        if (node.value.type === 'RecordDef') {
          const recDef = node.value as RecordDefNode;
          const val: RecordConstructorValue = {
            type: 'record_constructor',
            name: node.target,
            fieldNames: recDef.fields,
          };
          this.env[node.target] = val;
          currentEnv[node.target] = val;
          return val;
        }
        const val = this.evalNode(node.value, currentEnv);
        this.env[node.target] = val;
        currentEnv[node.target] = val;
        return val;
      }
      case 'FunctionDef': {
        const fnVal: FunctionValue = {
          type: 'function',
          name: node.name,
          params: node.params,
          body: node.body,
          closure: currentEnv,
        };
        currentEnv[node.name] = fnVal;
        if (currentEnv === this.env) {
          this.env[node.name] = fnVal;
        }
        return fnVal;
      }
      case 'Block': {
        const blockEnv: Environment = Object.create(currentEnv);
        let lastVal: Value = { type: 'none' };
        for (const stmt of node.statements) {
          this.budget.check('block', stmt.span);
          lastVal = this.evalNode(stmt, blockEnv);
        }
        return lastVal;
      }
      case 'BigOp': {
        return this.evalBigOp(node, currentEnv);
      }
      case 'Limit': {
        return this.evalLimit(node, currentEnv);
      }
      case 'Diff': {
        return this.evalDiff(node, currentEnv);
      }
      case 'Claim': {
        return this.evalClaim(node, currentEnv);
      }
      case 'RecordDef': {
        return {
          type: 'record_constructor',
          name: node.name || 'Record',
          fieldNames: node.fields,
        };
      }
      case 'RecordWith': {
        const targetVal = this.evalNode(node.target, currentEnv);
        if (targetVal.type !== 'record') {
          throw createError(`Cannot use 'with' update on non-record type '${targetVal.type}'`, node.span);
        }
        const updatedFields = { ...targetVal.fields };
        for (const update of node.updates) {
          if (!(update.name in updatedFields)) {
            const avail = Object.keys(targetVal.fields).join(', ');
            throw createError(
              `Field '${update.name}' does not exist on record '${targetVal.typeName}'. Available fields: ${avail || '(none)'}`,
              update.value.span
            );
          }
          updatedFields[update.name] = this.evalNode(update.value, currentEnv);
        }
        return {
          type: 'record',
          typeName: targetVal.typeName,
          fields: updatedFields,
        };
      }
      case 'DimensionDecl': {
        for (const d of node.dimensions) {
          this.declaredDimensions.add(d);
        }
        return { type: 'none' };
      }
      case 'UnitDecl': {
        let factor = 1.0;
        let dims: Record<string, number> = {};
        if (node.dimension) {
          factor = 1.0;
          dims = { [node.dimension]: 1 };
        } else if (node.definition) {
          const defVal = this.evalNode(node.definition, currentEnv);
          if (defVal.type === 'quantity') {
            factor = valueToNumber(defVal.magnitude, node.span);
            dims = defVal.dimensions;
          }
        }
        const unitRecord = {
          name: node.name,
          dimension: Object.keys(dims)[0] || 'derived',
          factor,
          dimensions: dims,
        };
        this.declaredUnits.set(node.name, unitRecord);
        if (!(currentEnv as any).__units__) {
          (currentEnv as any).__units__ = (this.env as any).__units__ || new Map();
        }
        (currentEnv as any).__units__.set(node.name, unitRecord);
        if (currentEnv !== this.env) {
          if (!(this.env as any).__units__) (this.env as any).__units__ = new Map();
          (this.env as any).__units__.set(node.name, unitRecord);
        }
        const unitVal: QuantityValue = {
          type: 'quantity',
          magnitude: { type: 'rational', n: 1n, d: 1n },
          unit: node.name,
          dimensions: dims,
        };
        currentEnv[node.name] = unitVal;
        if (currentEnv === this.env) {
          this.env[node.name] = unitVal;
        }
        return { type: 'none' };
      }
      case 'OperatorDecl': {
        const opRecord = {
          op: node.op,
          fixity: node.fixity,
          params: node.params,
          body: node.body,
          precedence: node.precedence ?? 45,
          associativity: node.associativity ?? 'left',
          env: currentEnv,
        };
        this.userOperators.set(node.op, opRecord);
        if (!(currentEnv as any).__operators__) {
          (currentEnv as any).__operators__ = (this.env as any).__operators__ || new Map();
        }
        (currentEnv as any).__operators__.set(node.op, opRecord);
        if (currentEnv !== this.env) {
          if (!(this.env as any).__operators__) (this.env as any).__operators__ = new Map();
          (this.env as any).__operators__.set(node.op, opRecord);
        }
        return { type: 'none' };
      }
      case 'KindDecl': {
        this.declaredKinds.set(node.name, {
          name: node.name,
          params: node.params,
          extendsKind: node.extendsKind?.name,
          operations: node.operations,
          axioms: node.axioms,
        });
        return {
          type: 'described',
          kind: {
            name: 'UserDefined',
            kindName: node.name,
            params: node.params,
            extendsKind: node.extendsKind?.name,
            operations: node.operations,
            axioms: node.axioms,
            axiomsVerified: false,
          },
          operation: `kind declaration: ${node.name}`,
          meaning: `User-defined mathematical kind ${node.name} (axioms declared but not checked)`,
          meaningInWords: `User-defined mathematical kind ${node.name} (axioms declared but not checked)`,
          requires: 'Axiom consistency check in formal proof assistant',
          canDo: node.operations.length > 0 ? node.operations : ['inspect'],
          obstruction: 'undecidable',
        };
      }
      case 'RuleDecl': {
        const pat = node.pattern;
        let isBuiltinOverride = false;
        let overrideName = '';

        if (pat.type === 'Diff') {
          const inner = pat.expr;
          if (inner.type === 'FunctionCall' && BUILTIN_FUNCTIONS.has(inner.callee)) {
            isBuiltinOverride = true;
            overrideName = inner.callee;
          } else if (inner.type === 'BinaryOp' && ['+', '-', '*', '/', '^'].includes(inner.op)) {
            isBuiltinOverride = true;
            overrideName = inner.op;
          }
        } else if (pat.type === 'FunctionCall' && BUILTIN_FUNCTIONS.has(pat.callee)) {
          isBuiltinOverride = true;
          overrideName = pat.callee;
        } else if (pat.type === 'BinaryOp' && ['+', '-', '*', '/', '^', '%', '=', '==', '!=', '<', '<=', '>', '>='].includes(pat.op)) {
          isBuiltinOverride = true;
          overrideName = pat.op;
        }

        if (isBuiltinOverride) {
          throw createError(
            `Cannot override built-in rule for '${overrideName}'`,
            node.span,
            {
              expected: 'a user-defined function or custom operator in rule pattern',
              suggestion: 'Declare rules on user-defined symbols rather than core built-ins',
              source: this.source,
            }
          );
        }

        const ruleRecord = {
          name: node.name || 'anonymous_rule',
          pattern: node.pattern,
          replacement: node.replacement,
          requires: node.requires,
          env: currentEnv,
        };
        this.userRules.push(ruleRecord);
        if (!(currentEnv as any).__rules__) {
          (currentEnv as any).__rules__ = (this.env as any).__rules__ || [];
        }
        (currentEnv as any).__rules__.push(ruleRecord);
        if (currentEnv !== this.env) {
          if (!(this.env as any).__rules__) (this.env as any).__rules__ = [];
          (this.env as any).__rules__.push(ruleRecord);
        }
        return { type: 'none' };
      }
      case 'ModuleDecl': {
        (currentEnv as any).__moduleName__ = node.name;
        if (currentEnv !== this.env) {
          (this.env as any).__moduleName__ = node.name;
        }
        return { type: 'none' };
      }
      case 'Export': {
        if (!(currentEnv as any).__exports__) {
          (currentEnv as any).__exports__ = new Set<string>();
        }
        for (const sym of node.symbols) {
          (currentEnv as any).__exports__.add(sym);
        }
        if (currentEnv !== this.env) {
          if (!(this.env as any).__exports__) {
            (this.env as any).__exports__ = new Set<string>();
          }
          for (const sym of node.symbols) {
            (this.env as any).__exports__.add(sym);
          }
        }
        return { type: 'none' };
      }
      case 'Import': {
        return this.evalImport(node, currentEnv);
      }
      case 'ViewDecl': {
        const viewFnVal = this.evalNode(node.viewFunction, currentEnv);
        this.declaredViews.set(node.targetType, viewFnVal);
        if (!(currentEnv as any).__views__) (currentEnv as any).__views__ = new Map();
        (currentEnv as any).__views__.set(node.targetType, viewFnVal);
        if (!(this.env as any).__views__) (this.env as any).__views__ = new Map();
        (this.env as any).__views__.set(node.targetType, viewFnVal);
        return { type: 'none' };
      }
      case 'Index': {
        const targetVal = this.evalNode(node.target, currentEnv);
        const indexVal = this.evalNode(node.index, currentEnv);
        const idxNum = Math.round(valueToNumber(indexVal, node.index.span));
        if (targetVal.type === 'list' || targetVal.type === 'tuple') {
          const len = targetVal.elements.length;
          const effectiveIdx = (idxNum >= 0 && idxNum < len) ? idxNum : (idxNum > 0 && idxNum <= len ? idxNum - 1 : -1);
          if (effectiveIdx === -1) {
            throw createError(`Index out of bounds: index ${idxNum} for collection of length ${len}`, node.span);
          }
          return targetVal.elements[effectiveIdx];
        }
        if (targetVal.type === 'derivation') {
          const len = targetVal.steps.length;
          const effectiveIdx = (idxNum >= 0 && idxNum < len) ? idxNum : (idxNum > 0 && idxNum <= len ? idxNum - 1 : -1);
          if (effectiveIdx === -1) {
            throw createError(`Step index out of bounds: step ${idxNum} for derivation of ${len} steps`, node.span);
          }
          const s = targetVal.steps[effectiveIdx];
          return {
            type: 'step',
            before: s.before,
            after: s.after,
            rule: s.rule,
            operand: s.operand,
            target: s.target,
            justification: s.justification,
            sideCondition: s.sideCondition,
            branches: s.branches,
          } as StepValue;
        }
        if (targetVal.type === 'matrix') {
          if (idxNum < 0 || idxNum >= targetVal.rows) {
            throw createError(`Row index out of bounds: index ${idxNum} for matrix with ${targetVal.rows} rows`, node.span);
          }
          return { type: 'list', elements: targetVal.data[idxNum] };
        }
        if (targetVal.type === 'trajectory') {
          const t = valueToNumber(indexVal, node.index.span);
          return getTrajectoryStateAt(targetVal, t);
        }
        throw createError(`Cannot index value of type ${targetVal.type}`, node.span);
      }
      case 'MemberAccess': {
        const targetVal = this.evalNode(node.target, currentEnv);
        const prop = node.property;
        if (targetVal.type === 'trajectory') {
          if (prop === 'duration') {
            return { type: 'float', value: targetVal.tEnd - targetVal.tStart };
          }
          if (prop === 'samples') {
            return {
              type: 'list',
              elements: targetVal.samples.map(s => s.state),
            };
          }
          if (prop === 'tStart') {
            return { type: 'float', value: targetVal.tStart };
          }
          if (prop === 'tEnd') {
            return { type: 'float', value: targetVal.tEnd };
          }
          if (prop === 'source') {
            return { type: 'string', value: targetVal.sourceInfo.source };
          }
          if (prop === 'integrator') {
            return { type: 'string', value: targetVal.sourceInfo.integrator ?? 'none' };
          }
          if (prop === 'errorEstimate') {
            return { type: 'float', value: targetVal.sourceInfo.errorEstimate ?? 0 };
          }
          if (prop === 'energyDrift') {
            return { type: 'float', value: targetVal.sourceInfo.energyDrift ?? 0 };
          }
        }
        if (targetVal.type === 'record') {
          if (prop in targetVal.fields) {
            return targetVal.fields[prop];
          }
          const availableFields = Object.keys(targetVal.fields).join(', ');
          throw createError(
            `Field '${prop}' does not exist on record '${targetVal.typeName}'. Available fields: ${availableFields || '(none)'}`,
            node.span,
            {
              expected: `one of [${availableFields}]`,
              suggestion: `Check the field name on record '${targetVal.typeName}'`,
              source: this.source,
            }
          );
        }
        if (targetVal.type === 'module') {
          if (prop in targetVal.exports) {
            return targetVal.exports[prop];
          }
          throw createError(`Symbol '${prop}' is not exported by module '${targetVal.name}'`, node.span);
        }
        if (targetVal.type === 'derivation') {
          if (prop === 'steps') {
            return {
              type: 'list',
              elements: targetVal.steps.map(s => ({
                type: 'step',
                before: s.before,
                after: s.after,
                rule: s.rule,
                operand: s.operand,
                target: s.target,
                justification: s.justification,
                sideCondition: s.sideCondition,
                branches: s.branches,
              } as StepValue)),
            };
          }
          if (prop === 'result') {
            return Array.isArray(targetVal.result)
              ? { type: 'list', elements: targetVal.result }
              : (targetVal.result ?? { type: 'list', elements: targetVal.roots });
          }
          if (prop === 'roots') {
            return { type: 'list', elements: targetVal.roots };
          }
          if (prop === 'verified') {
            return { type: 'boolean', value: targetVal.verified };
          }
        }
        if (targetVal.type === 'step') {
          if (prop === 'before') return { type: 'string', value: targetVal.before };
          if (prop === 'after') return { type: 'string', value: targetVal.after };
          if (prop === 'rule') return { type: 'string', value: targetVal.rule };
          if (prop === 'justification') return { type: 'string', value: targetVal.justification };
          if (prop === 'sideCondition') return { type: 'string', value: targetVal.sideCondition ?? '' };
        }
        throw createError(`Property '${prop}' does not exist on type '${targetVal.type}'`, node.span);
      }
      case 'StringLiteral': {
        return { type: 'string', value: node.value };
      }
      case 'FunctionCall': {
        const userRuleRes = this.applyUserRules(node, currentEnv);
        if (userRuleRes) {
          return userRuleRes;
        }
        return this.evalFunctionCall(node, currentEnv);
      }
      case 'NamedArg': {
        return this.evalNode(node.value, currentEnv);
      }
      case 'RegionIntegral': {
        const regionName = node.region.type === 'Identifier' ? node.region.name : 'S';
        const namedOp = `${node.integralType} integral over ${regionName}`;
        const meaningText = `Integration of ${node.differential} differential form over oriented manifold ${regionName}`;
        return {
          type: 'described',
          kind: { name: 'Scalar', subtype: 'real' },
          operation: namedOp,
          namedOperation: namedOp,
          meaning: meaningText,
          meaningInWords: meaningText,
          requires: 'Parameterization of region and coordinate basis for vector field',
          canDo: ['Symbolic integral expansion', 'Application of Stokes theorem or Divergence theorem'],
          related: ['Stokes theorem', 'Divergence theorem', 'Line integral', 'Surface integral'],
          obstruction: 'needs-parameterization',
        };
      }
      case 'NablaOp': {
        const isVectorOut = node.op === 'grad' || node.op === 'curl';
        const kind: MathKind = isVectorOut
          ? { name: 'VectorField', domain: 'R^3', dimension: 3 }
          : { name: 'ScalarField', domain: 'R^3' };
        const namedOp = `Vector differential operator: ${node.op}`;
        const meaningText = `Differential calculus operator ${node.op} applied to spatial field`;
        return {
          type: 'described',
          kind,
          operation: namedOp,
          namedOperation: namedOp,
          meaning: meaningText,
          meaningInWords: meaningText,
          requires: 'Coordinate chart / orthonormal basis and field functional definitions',
          canDo: ['Coordinate expansion in Cartesian / Cylindrical / Spherical coordinates', 'Vector identities check'],
          related: ['Gradient theorem', 'Curl theorem', 'Helmholtz decomposition', 'Laplace operator'],
          obstruction: 'needs-basis',
        };
      }
      case 'DifferentialFormOp': {
        const namedOp = `Exterior algebra operation: ${node.op}`;
        const meaningText = `Differential graded algebra operation ${node.op} on smooth differential forms`;
        return {
          type: 'described',
          kind: { name: 'DifferentialForm', degree: node.op === 'wedge' ? 2 : 1, manifold: 'R^3' },
          operation: namedOp,
          namedOperation: namedOp,
          meaning: meaningText,
          meaningInWords: meaningText,
          requires: 'Basis differential 1-forms (dx, dy, dz) and smooth manifold metric',
          canDo: ['Cartan calculus identities (d^2 = 0)', 'Hodge duality pairings', 'Poincaré lemma'],
          related: ['Exterior derivative', 'Wedge product', 'Hodge star', 'de Rham cohomology'],
          obstruction: 'needs-basis',
        };
      }
      case 'TensorOp': {
        const namedOp = `Algebraic composition: ${node.op}`;
        const meaningText = `${node.op === 'tensor' ? 'Tensor product' : 'Direct sum'} of vector spaces or modules`;
        return {
          type: 'described',
          kind: { name: 'Group', structureName: 'Module', carrierSet: 'V', axioms: [] },
          operation: namedOp,
          namedOperation: namedOp,
          meaning: meaningText,
          meaningInWords: meaningText,
          requires: 'Explicit basis generators and ring/field scalars',
          canDo: ['Universal property factorization', 'Dimension arithmetic', 'Dual module pairing'],
          related: ['Tensor algebra', 'Direct sum', 'Bilinear forms', 'Module theory'],
          obstruction: 'needs-basis',
        };
      }
      case 'BracketOp': {
        if (node.op === 'norm') {
          try {
            const operandVal = this.evalNode(node.operands[0], currentEnv);
            if (operandVal.type === 'tuple' || operandVal.type === 'list') {
              const elVals = operandVal.elements;
              let sumSq = 0;
              for (const el of elVals) {
                const num = el.type === 'rational' ? Number(el.n) / Number(el.d) : el.type === 'float' ? el.value : NaN;
                sumSq += num * num;
              }
              if (!Number.isNaN(sumSq)) {
                const res = Math.sqrt(sumSq);
                if (Number.isInteger(res)) {
                  return { type: 'rational', n: BigInt(res), d: 1n };
                }
                return { type: 'float', value: res };
              }
            }
          } catch {
            // Unbound operand -> describe
          }
          return {
            type: 'described',
            kind: { name: 'Scalar', subtype: 'real' },
            operation: 'Norm',
            namedOperation: 'Norm',
            meaning: 'Geometric length / magnitude in inner product space',
            meaningInWords: 'Geometric length / magnitude in inner product space',
            requires: 'Inner product metric or vector coordinates',
            canDo: ['Euclidean length computation', 'Triangle inequality verification'],
            related: ['Inner product', 'Metric space', 'Cauchy-Schwarz inequality'],
            obstruction: 'needs-basis',
          };
        }
        if (node.op === 'inner_product') {
          try {
            if (node.operands.length === 2) {
              const u = this.evalNode(node.operands[0], currentEnv);
              const v = this.evalNode(node.operands[1], currentEnv);
              if ((u.type === 'tuple' || u.type === 'list') && (v.type === 'tuple' || v.type === 'list')) {
                const uEls = u.elements;
                const vEls = v.elements;
                if (uEls.length !== vEls.length) {
                  throw createError(
                    `Cannot compute inner product of Vector(dim=${uEls.length}, field=R) and Vector(dim=${vEls.length}, field=R): dimension mismatch (${uEls.length} vs ${vEls.length})`,
                    node.span
                  );
                }
                let sum: Value = { type: 'rational', n: 0n, d: 1n };
                for (let i = 0; i < uEls.length; i++) {
                  const prod = mulValues(uEls[i], vEls[i], node.span);
                  sum = addValues(sum, prod, node.span);
                }
                return sum;
              }
            }
          } catch (e: any) {
            if (e && e.message && e.message.includes('dimension mismatch')) {
              throw e;
            }
          }
          return {
            type: 'described',
            kind: { name: 'Scalar', subtype: 'real' },
            operation: 'Inner product',
            namedOperation: 'Inner product',
            meaning: 'Bilinear positive-definite symmetric form \u27e8u, v\u27e9',
            meaningInWords: 'Bilinear positive-definite symmetric form \u27e8u, v\u27e9',
            requires: 'Coordinates in orthonormal basis or explicit metric tensor',
            canDo: ['Orthogonality test', 'Gram-Schmidt orthogonalization'],
            related: ['Hilbert space', 'Riesz representation', 'Dot product'],
            obstruction: 'needs-basis',
          };
        }
        if (node.op === 'floor' || node.op === 'ceil' || node.op === 'abs') {
          const val = this.evalNode(node.operands[0], currentEnv);
          if (val.type === 'rational') {
            if (node.op === 'abs') {
              return { type: 'rational', n: val.n < 0n ? -val.n : val.n, d: val.d };
            }
            const num = Number(val.n) / Number(val.d);
            const res = node.op === 'floor' ? Math.floor(num) : Math.ceil(num);
            return { type: 'rational', n: BigInt(res), d: 1n };
          }
          if (val.type === 'float') {
            const res = node.op === 'abs' ? Math.abs(val.value) : node.op === 'floor' ? Math.floor(val.value) : Math.ceil(val.value);
            return { type: 'float', value: res };
          }
        }
        if (node.op === 'card') {
          const val = this.evalNode(node.operands[0], currentEnv);
          if (val.type === 'tuple' || val.type === 'list') {
            return { type: 'rational', n: BigInt(val.elements.length), d: 1n };
          }
          if (val.type === 'set_value') {
            if (val.isInfinite) {
              return {
                type: 'described',
                kind: { name: 'Scalar', subtype: 'natural' },
                operation: 'Cardinality',
                namedOperation: 'Cardinality',
                meaning: 'Cardinality of infinite set',
                meaningInWords: 'Cardinality of infinite set',
                requires: 'Transfinite cardinal arithmetic (Aleph numbers)',
                canDo: ['Bijection verification', 'Cantor diagonal argument'],
                related: ['Aleph null', 'Continuum hypothesis', 'Countability'],
                obstruction: 'infinite-object',
              };
            }
            return { type: 'rational', n: BigInt((val.elements ?? []).length), d: 1n };
          }
        }
        const opName = `Bracket operator: ${node.op}`;
        return {
          type: 'described',
          kind: { name: 'Scalar', subtype: 'real' },
          operation: opName,
          namedOperation: opName,
          meaning: `Operation ${node.op} on mathematical expressions`,
          meaningInWords: `Operation ${node.op} on mathematical expressions`,
          requires: 'Concrete evaluation context',
          canDo: ['Symbolic manipulation'],
          related: ['Order theory', 'Metric spaces'],
          obstruction: 'needs-basis',
        };
      }
      case 'Quantifier': {
        const opName = `Quantified assertion: ${node.quantifier}`;
        const meaningText = `First-order logic predicate quantified over variable ${node.variable}`;
        return {
          type: 'described',
          kind: { name: 'UnknownKind' },
          operation: opName,
          namedOperation: opName,
          meaning: meaningText,
          meaningInWords: meaningText,
          requires: 'Automated theorem proving or finite domain enumeration',
          canDo: ['Proof search', 'Counterexample synthesis in finite models', 'Skolemization'],
          related: ['Predicate logic', 'Gödel completeness theorem', 'Model checking'],
          obstruction: 'undecidable',
        };
      }
      case 'SetOp': {
        try {
          const leftVal = this.evalNode(node.left, currentEnv);
          const rightVal = this.evalNode(node.right, currentEnv);
          if (node.op === 'in' || node.op === 'notin') {
            if (rightVal.type === 'list' || rightVal.type === 'tuple') {
              const found = rightVal.elements.some(e => {
                try {
                  return (compareValues('==', leftVal, e, node.span) as any).value === true;
                } catch {
                  return false;
                }
              });
              const res = node.op === 'in' ? found : !found;
              return { type: 'boolean', value: res };
            }
            if (rightVal.type === 'set_value' && !rightVal.isInfinite && rightVal.elements) {
              const found = rightVal.elements.some(e => {
                try {
                  return (compareValues('==', leftVal, e, node.span) as any).value === true;
                } catch {
                  return false;
                }
              });
              const res = node.op === 'in' ? found : !found;
              return { type: 'boolean', value: res };
            }
          }
        } catch {
          // Unbound operands -> describe
        }
        const opName = `Set operation: ${node.op}`;
        return {
          type: 'described',
          kind: { name: 'Set', elementKind: { name: 'Scalar', subtype: 'real' } },
          operation: opName,
          namedOperation: opName,
          meaning: `Set theory operation ${node.op} on sets`,
          meaningInWords: `Set theory operation ${node.op} on sets`,
          requires: 'Explicit element membership decider or finite enumeration',
          canDo: ['Venn diagram computation', 'Subset inclusion checks'],
          related: ['Zermelo-Fraenkel set theory', 'Boolean algebra of sets'],
          obstruction: 'needs-basis',
        };
      }
      case 'SetBuilder': {
        const opName = `Set-builder comprehension`;
        const meaningText = `Set specified by predicate condition over domain`;
        return {
          type: 'described',
          kind: { name: 'Set', elementKind: { name: 'Scalar', subtype: 'real' } },
          operation: opName,
          namedOperation: opName,
          meaning: meaningText,
          meaningInWords: meaningText,
          requires: 'Explicit element membership decision procedure or bounding constraint',
          canDo: ['Predicate verification on candidates', 'Subset inclusion checks'],
          related: ['Axiom of specification', 'ZFC set theory', 'Characteristic function'],
          obstruction: 'infinite-object',
        };
      }
      case 'Equivalence': {
        const opName = `Equivalence relation: ${node.relation}`;
        const meaningText = `Mathematical relation asserting ${node.relation} between objects`;
        return {
          type: 'described',
          kind: { name: 'UnknownKind' },
          operation: opName,
          namedOperation: opName,
          meaning: meaningText,
          meaningInWords: meaningText,
          requires: 'Isomorphism morphism construction or homotopy path',
          canDo: ['Category theoretic diagram chasing', 'Topological invariant computation'],
          related: ['Category theory', 'Homotopy type theory', 'Equivalence classes'],
          obstruction: 'requires-proof',
        };
      }
      case 'DecoratedIdentifier': {
        if (node.name in currentEnv) {
          return this.evalNode({ type: 'Identifier', name: node.name, span: node.span }, currentEnv);
        }
        const opName = `Decorated variable: ${node.name} with ${node.decoration}`;
        const meaningText = `Symbol ${node.name} equipped with mathematical diacritic ${node.decoration}`;
        return {
          type: 'described',
          kind: { name: 'Scalar', subtype: 'real' },
          operation: opName,
          namedOperation: opName,
          meaning: meaningText,
          meaningInWords: meaningText,
          requires: 'Variable binding or state definition',
          canDo: ['Symbolic equation solving', 'Time-derivative ODE formulation'],
          related: ['Complex conjugate', 'Unit vector', 'Time derivatives (Newton notation)'],
          obstruction: 'needs-basis',
        };
      }
      case 'MatrixPostfix': {
        const targetVal = this.evalNode(node.target, currentEnv);
        if (targetVal.type === 'list' && targetVal.elements.length > 0 && targetVal.elements[0].type === 'list') {
          // Matrix value
          if (node.op === 'transpose') {
            const rows = targetVal.elements.length;
            const cols = (targetVal.elements[0] as any).elements.length;
            const transposed: Value[] = [];
            for (let j = 0; j < cols; j++) {
              const row: Value[] = [];
              for (let i = 0; i < rows; i++) {
                row.push((targetVal.elements[i] as any).elements[j]);
              }
              transposed.push({ type: 'list', elements: row });
            }
            return { type: 'list', elements: transposed };
          }
        }
        const opName = `Matrix ${node.op}`;
        const meaningText = `Linear algebra unary operation ${node.op} on linear map or matrix`;
        return {
          type: 'described',
          kind: { name: 'Matrix', rows: 3, cols: 3, baseField: 'R' },
          operation: opName,
          namedOperation: opName,
          meaning: meaningText,
          meaningInWords: meaningText,
          requires: 'Matrix entries or linear operator representation',
          canDo: ['Spectral decomposition', 'Determinant and rank computation', 'SVD'],
          related: ['Transpose', 'Conjugate transpose', 'Matrix inversion', 'Adjoint operator'],
          obstruction: 'needs-basis',
        };
      }
      case 'Probability': {
        const opName = `Probability ${node.op}`;
        const meaningText = `Measure theoretic probability calculation for ${node.op}`;
        return {
          type: 'described',
          kind: { name: 'Scalar', subtype: 'real' },
          operation: opName,
          namedOperation: opName,
          meaning: meaningText,
          meaningInWords: meaningText,
          requires: 'Probability space (Ω, Σ, P) and random variable distributions',
          canDo: ['Bayes theorem inversion', 'Moment generating function analysis', 'Monte Carlo sampling'],
          related: ['Probability measure', 'Expected value', 'Variance', 'Conditional probability'],
          obstruction: 'needs-parameterization',
        };
      }
    }

    throw createError(`Cannot evaluate AST node`, (node as any).span);
  }

  private evalFunctionCall(node: FunctionCallNode, currentEnv: Environment): Value {
    const callee = node.callee;

    if (callee === 'graph') {
      return this.evalGraph(node, currentEnv);
    }

    if (callee === 'kindof') {
      if (node.args.length !== 1) throw createError('kindof() expects 1 argument', node.span);
      try {
        const val = this.evalNode(node.args[0], currentEnv);
        return { type: 'kind', kind: inferKindOfValue(val) };
      } catch {
        return { type: 'kind', kind: this.inferKindOfAST(node.args[0], currentEnv) };
      }
    }

    if (callee === 'admits') {
      if (node.args.length !== 1) throw createError('admits() expects 1 argument', node.span);
      let kind: MathKind;
      try {
        const val = this.evalNode(node.args[0], currentEnv);
        kind = inferKindOfValue(val);
      } catch {
        kind = this.inferKindOfAST(node.args[0], currentEnv);
      }
      const ops = admitsOperations(kind);
      return {
        type: 'list',
        elements: ops.map(op => ({ type: 'string', value: op })),
      };
    }

    if (callee === 'coerce') {
      if (node.args.length < 2) throw createError('coerce(expr, to: kind) requires 2 arguments', node.span);
      const val = this.evalNode(node.args[0], currentEnv);
      let targetKind: MathKind;
      const targetArg = node.args[1];
      if (targetArg.type === 'NamedArg' && targetArg.name === 'to') {
        const toVal = this.evalNode(targetArg.value, currentEnv);
        targetKind = toVal.type === 'kind' ? toVal.kind : inferKindOfValue(toVal);
      } else {
        const toVal = this.evalNode(targetArg, currentEnv);
        targetKind = toVal.type === 'kind' ? toVal.kind : inferKindOfValue(toVal);
      }
      const fromKind = inferKindOfValue(val);
      const check = canCoerceKind(fromKind, targetKind);
      if (!check.canCoerce) {
        throw createError(check.reason || `Cannot coerce ${formatKind(fromKind)} to ${formatKind(targetKind)}`, node.span);
      }
      return val;
    }

    if (callee === 'convert') {
      if (node.args.length < 2) {
        throw createError(`convert(quantity, to: unit) requires 2 arguments`, node.span);
      }
      const qtyVal = this.evalNode(node.args[0], currentEnv);
      if (qtyVal.type !== 'quantity') {
        throw createError(`First argument to convert() must be a quantity with units`, node.args[0].span);
      }
      let targetUnitName = '';
      const toArg = node.args[1];
      if (toArg.type === 'NamedArg' && toArg.name === 'to') {
        targetUnitName = toArg.value.type === 'Identifier' ? toArg.value.name : '';
      } else if (toArg.type === 'Identifier') {
        targetUnitName = toArg.name;
      }
      if (!targetUnitName) {
        throw createError(`Expected target unit in convert(..., to: <unit>)`, node.span);
      }
      let targetUnit = this.declaredUnits.get(targetUnitName);
      if (!targetUnit && (currentEnv as any).__units__) {
        targetUnit = (currentEnv as any).__units__.get(targetUnitName);
      }
      if (!targetUnit && (this.env as any).__units__) {
        targetUnit = (this.env as any).__units__.get(targetUnitName);
      }
      if (!targetUnit) {
        const tVal = currentEnv[targetUnitName] ?? this.env[targetUnitName];
        if (tVal && tVal.type === 'quantity') {
          targetUnit = {
            name: targetUnitName,
            dimension: Object.keys(tVal.dimensions)[0] || 'derived',
            factor: 1.0,
            dimensions: tVal.dimensions,
          };
        }
      }
      if (!targetUnit) {
        throw createError(`Unit '${targetUnitName}' is not defined`, toArg.span);
      }
      // Check dimension match
      const keysQty = Object.keys(qtyVal.dimensions).filter(k => qtyVal.dimensions[k] !== 0);
      const keysTarget = Object.keys(targetUnit.dimensions).filter(k => targetUnit.dimensions[k] !== 0);
      let match = keysQty.length === keysTarget.length;
      if (match) {
        for (const k of keysQty) {
          if (qtyVal.dimensions[k] !== targetUnit.dimensions[k]) {
            match = false;
            break;
          }
        }
      }
      if (!match) {
        throw createError(
          `Dimension mismatch: cannot convert ${formatDimensions(qtyVal.dimensions)} (${formatQuantityString(qtyVal)}) to unit '${targetUnitName}' of dimension ${formatDimensions(targetUnit.dimensions)}`,
          node.span
        );
      }
      let sourceUnit = this.declaredUnits.get(qtyVal.unit);
      if (!sourceUnit && (currentEnv as any).__units__) {
        sourceUnit = (currentEnv as any).__units__.get(qtyVal.unit);
      }
      if (!sourceUnit && (this.env as any).__units__) {
        sourceUnit = (this.env as any).__units__.get(qtyVal.unit);
      }
      const sourceFactor = sourceUnit ? sourceUnit.factor : 1.0;
      const targetFactor = targetUnit.factor;
      const convertedMag = mulValues(qtyVal.magnitude, makeFloat(sourceFactor / targetFactor), node.span);
      return {
        type: 'quantity',
        magnitude: convertedMag,
        unit: targetUnitName,
        dimensions: targetUnit.dimensions,
      };
    }

    // Check custom builtins that take ranges or lambdas:
    if (callee === 'sum' || callee === 'prod') {
      return this.evalSumOrProd(node, currentEnv);
    }
    if (callee === 'range') {
      return this.evalRangeBuiltin(node, currentEnv);
    }
    if (callee === 'map') {
      return this.evalMap(node, currentEnv);
    }
    if (callee === 'filter') {
      return this.evalFilter(node, currentEnv);
    }
    if (callee === 'iterate') {
      return this.evalIterate(node, currentEnv);
    }
    if (callee === 'find') {
      return this.evalFind(node, currentEnv);
    }
    if (callee === 'all') {
      return this.evalAll(node, currentEnv);
    }
    if (callee === 'any') {
      return this.evalAny(node, currentEnv);
    }
    if (callee === 'unknown') {
      let reason: UnknownReason = 'budget-exhausted';
      let detail: string | undefined;
      if (node.args.length >= 1) {
        const arg0 = node.args[0];
        if (arg0.type === 'Identifier') {
          reason = arg0.name as UnknownReason;
        } else if (arg0.type === 'StringLiteral') {
          reason = arg0.value as UnknownReason;
        } else if (arg0.type === 'UnaryOp' || arg0.type === 'BinaryOp') {
          reason = formatAST(arg0).replace(/\s+/g, '') as UnknownReason;
        } else {
          const val0 = this.evalNode(arg0, currentEnv);
          reason = String((val0 as any).value ?? val0.type) as UnknownReason;
        }
      }
      if (node.args.length >= 2) {
        const arg1 = node.args[1];
        if (arg1.type === 'StringLiteral') {
          detail = arg1.value;
        } else if (arg1.type === 'Identifier') {
          detail = arg1.name;
        } else {
          const val1 = this.evalNode(arg1, currentEnv);
          detail = String((val1 as any).value ?? val1.type);
        }
      }
      return makeUnknown(reason, detail);
    }
    if (callee === 'least') {
      return this.evalLeast(node, currentEnv);
    }
    if (callee === 'unfold') {
      return this.evalUnfold(node, currentEnv);
    }
    if (callee === 'fold') {
      return this.evalFold(node, currentEnv);
    }
    if (callee === 'count') {
      return this.evalCount(node, currentEnv);
    }
    if (callee === 'sort') {
      return this.evalSort(node, currentEnv);
    }
    if (callee === 'distinct') {
      return this.evalDistinct(node, currentEnv);
    }
    if (callee === 'zip') {
      return this.evalZip(node, currentEnv);
    }
    if (callee === 'take') {
      return this.evalTake(node, currentEnv);
    }
    if (callee === 'drop') {
      return this.evalDrop(node, currentEnv);
    }
    if (callee === 'solve') {
      return this.evalSolve(node, currentEnv);
    }
    if (callee === 'isolate') {
      return this.evalIsolate(node, currentEnv);
    }
    if (callee === 'simplify') {
      return this.evalSimplify(node, currentEnv);
    }
    if (callee === 'dimension') {
      return this.evalDimension(node, currentEnv);
    }
    if (callee === 'check') {
      return this.evalCheck(node, currentEnv);
    }
    if (callee === 'Trajectory') {
      return this.evalTrajectoryConstructor(node, currentEnv);
    }
    if (callee === 'simulate') {
      return this.evalSimulate(node, currentEnv);
    }
    if (callee === 'ode') {
      return this.evalODE(node, currentEnv);
    }
    if (callee === 'closed_form') {
      return this.evalClosedForm(node, currentEnv);
    }
    if (callee === 'export_trajectory') {
      if (node.args.length < 1) throw createError('export_trajectory(traj, [format]) requires at least 1 argument', node.span);
      const trajVal = this.evalNode(node.args[0], currentEnv);
      if (trajVal.type !== 'trajectory') {
        throw createError('export_trajectory first argument must be a Trajectory', node.args[0].span);
      }
      let fmt: 'csv' | 'json' = 'csv';
      if (node.args.length >= 2) {
        const arg1 = node.args[1];
        if (arg1.type === 'NamedArg' && arg1.name === 'format') {
          const val = this.evalNode(arg1.value, currentEnv);
          if (val.type === 'string' && (val.value === 'json' || val.value === 'csv')) {
            fmt = val.value;
          }
        } else {
          const val = this.evalNode(arg1, currentEnv);
          if (val.type === 'string' && (val.value === 'json' || val.value === 'csv')) {
            fmt = val.value;
          }
        }
      }
      return { type: 'string', value: exportTrajectory(trajVal, fmt) };
    }

    // Drawing Primitives (Phase 12 Part B.5)
    if (callee === 'point') {
      const p = node.args.length > 0 ? this.evalNode(node.args[0], currentEnv) : { type: 'tuple', elements: [] };
      return { type: 'drawing_primitive', primitive: 'point', params: { p } };
    }
    if (callee === 'segment') {
      const a = node.args.length > 0 ? this.evalNode(node.args[0], currentEnv) : { type: 'tuple', elements: [] };
      const b = node.args.length > 1 ? this.evalNode(node.args[1], currentEnv) : { type: 'tuple', elements: [] };
      return { type: 'drawing_primitive', primitive: 'segment', params: { a, b } };
    }
    if (callee === 'arrow') {
      const from = node.args.length > 0 ? this.evalNode(node.args[0], currentEnv) : { type: 'tuple', elements: [] };
      const to = node.args.length > 1 ? this.evalNode(node.args[1], currentEnv) : { type: 'tuple', elements: [] };
      const params: Record<string, any> = { from, to };
      for (let i = 2; i < node.args.length; i++) {
        const arg = node.args[i];
        if (arg.type === 'NamedArg') {
          params[arg.name] = this.evalNode(arg.value, currentEnv);
        }
      }
      return { type: 'drawing_primitive', primitive: 'arrow', params };
    }
    if (callee === 'circle') {
      const center = node.args.length > 0 ? this.evalNode(node.args[0], currentEnv) : { type: 'tuple', elements: [] };
      const r = node.args.length > 1 ? this.evalNode(node.args[1], currentEnv) : { type: 'float', value: 1 };
      const params: Record<string, any> = { center, r };
      for (let i = 2; i < node.args.length; i++) {
        const arg = node.args[i];
        if (arg.type === 'NamedArg') {
          params[arg.name] = this.evalNode(arg.value, currentEnv);
        }
      }
      return { type: 'drawing_primitive', primitive: 'circle', params };
    }
    if (callee === 'polygon') {
      const points = node.args.length > 0 ? this.evalNode(node.args[0], currentEnv) : { type: 'list', elements: [] };
      return { type: 'drawing_primitive', primitive: 'polygon', params: { points } };
    }
    if (callee === 'path') {
      const points = node.args.length > 0 ? this.evalNode(node.args[0], currentEnv) : { type: 'list', elements: [] };
      return { type: 'drawing_primitive', primitive: 'path', params: { points } };
    }
    if (callee === 'patch') {
      const fn = node.args.length > 0 ? this.evalNode(node.args[0], currentEnv) : { type: 'none' };
      const params: Record<string, any> = { fn };
      for (let i = 1; i < node.args.length; i++) {
        const arg = node.args[i];
        if (arg.type === 'NamedArg') {
          params[arg.name] = this.evalNode(arg.value, currentEnv);
        } else if (arg.type === 'Range') {
          params[arg.variable || `range${i}`] = this.evalNode(arg, currentEnv);
        }
      }
      return { type: 'drawing_primitive', primitive: 'patch', params };
    }
    if (callee === 'label') {
      const text = node.args.length > 0 ? this.evalNode(node.args[0], currentEnv) : { type: 'string', value: '' };
      const at = node.args.length > 1 ? this.evalNode(node.args[1], currentEnv) : { type: 'tuple', elements: [] };
      return { type: 'drawing_primitive', primitive: 'label', params: { text, at } };
    }
    if (callee === 'field') {
      const f = node.args.length > 0 ? this.evalNode(node.args[0], currentEnv) : { type: 'none' };
      const params: Record<string, any> = { f };
      for (let i = 1; i < node.args.length; i++) {
        const arg = node.args[i];
        if (arg.type === 'NamedArg') {
          params[arg.name] = this.evalNode(arg.value, currentEnv);
        }
      }
      return { type: 'drawing_primitive', primitive: 'field', params };
    }

    if (callee === 'div' || callee === 'curl' || callee === 'grad' || callee === 'laplacian') {
      const isVectorOut = callee === 'grad' || callee === 'curl';
      const kind: MathKind = isVectorOut
        ? { name: 'VectorField', domain: 'R^3', dimension: 3 }
        : { name: 'ScalarField', domain: 'R^3' };
      const namedOp = `Vector differential operator: ${callee}`;
      const meaningText = `Differential calculus operator ${callee} applied to spatial field`;
      return {
        type: 'described',
        kind,
        operation: namedOp,
        namedOperation: namedOp,
        meaning: meaningText,
        meaningInWords: meaningText,
        requires: 'Coordinate chart / orthonormal basis and field functional definitions',
        canDo: ['Coordinate expansion in Cartesian / Cylindrical / Spherical coordinates', 'Vector identities check'],
        related: ['Gradient theorem', 'Curl theorem', 'Helmholtz decomposition', 'Laplace operator'],
        obstruction: 'needs-basis',
      };
    }
    if (callee === 'norm' || callee === 'inner') {
      return this.evalNode(
        {
          type: 'BracketOp',
          op: callee === 'norm' ? 'norm' : 'inner_product',
          operands: node.args,
          span: node.span,
        },
        currentEnv
      );
    }

    // Check user defined function or record constructor
    const calleeVal = currentEnv[callee] ?? this.env[callee];
    if (calleeVal) {
      if (calleeVal.type === 'record_constructor') {
        const fields: Record<string, Value> = {};
        for (let i = 0; i < node.args.length; i++) {
          const arg = node.args[i];
          if (arg.type === 'NamedArg') {
            if (!calleeVal.fieldNames.includes(arg.name)) {
              const avail = calleeVal.fieldNames.join(', ');
              throw createError(
                `Field '${arg.name}' does not exist on record '${calleeVal.name}'. Available fields: ${avail || '(none)'}`,
                arg.span
              );
            }
            fields[arg.name] = this.evalNode(arg.value, currentEnv);
          } else {
            const fieldName = calleeVal.fieldNames[i];
            if (!fieldName) {
              throw createError(
                `Too many positional arguments for record '${calleeVal.name}'. Expected ${calleeVal.fieldNames.length} fields: ${calleeVal.fieldNames.join(', ')}`,
                arg.span
              );
            }
            fields[fieldName] = this.evalNode(arg, currentEnv);
          }
        }
        for (const reqField of calleeVal.fieldNames) {
          if (!(reqField in fields)) {
            throw createError(
              `Missing field '${reqField}' for record '${calleeVal.name}'. Required fields: ${calleeVal.fieldNames.join(', ')}`,
              node.span
            );
          }
        }
        return {
          type: 'record',
          typeName: calleeVal.name,
          fields,
        };
      }
      if (calleeVal.type === 'function') {
        return this.invokeUserFunction(calleeVal, node.args, currentEnv, node.span);
      }
      if (calleeVal.type === 'lambda') {
        return this.invokeLambda(calleeVal, node.args, currentEnv, node.span);
      }
    }

    // Check builtin function
    if (BUILTIN_FUNCTIONS.has(callee)) {
      const argVals = node.args.map((a: ASTNode) => this.evalNode(a, currentEnv));
      return applyBuiltin(callee, argVals, node.span);
    }

    throw createError(`Function '${callee}' is not defined`, node.span, {
      expected: 'a defined function name',
      suggestion: `Define ${callee}(x) := ... before calling it`,
      source: this.source,
    });
  }

  private invokeUserFunction(
    fn: FunctionValue,
    argNodes: ASTNode[],
    callerEnv: Environment,
    span: Span
  ): Value {
    if (fn.params.length !== argNodes.length) {
      throw createError(
        `Function '${fn.name}' expects ${fn.params.length} argument(s), got ${argNodes.length}`,
        span,
        {
          expected: `${fn.params.length} argument(s)`,
          suggestion: `Call ${fn.name}(${fn.params.join(', ')})`,
          source: this.source,
        }
      );
    }

    const argVals = argNodes.map(a => this.evalNode(a, callerEnv));

    // Check memoization cache
    const memoKey = `${fn.name}:${argVals.map(v => this.serializeValueForMemo(v)).join(',')}`;
    if (this.memo.has(memoKey)) {
      return this.memo.get(memoKey)!;
    }

    this.budget.enterFunction(fn.name, span);

    try {
      const localEnv: Environment = { ...this.env, ...fn.closure, [fn.name]: fn };
      for (let i = 0; i < fn.params.length; i++) {
        localEnv[fn.params[i]] = argVals[i];
      }
      const result = this.evalNode(fn.body, localEnv);
      this.memo.set(memoKey, result);
      return result;
    } finally {
      this.budget.exitFunction();
    }
  }

  public invokeLambda(
    lambda: LambdaValue,
    argNodes: ASTNode[],
    callerEnv: Environment,
    span: Span
  ): Value {
    if (lambda.params.length !== argNodes.length) {
      throw createError(
        `Lambda expects ${lambda.params.length} argument(s), got ${argNodes.length}`,
        span
      );
    }
    const argVals = argNodes.map(a => this.evalNode(a, callerEnv));
    const localEnv: Environment = { ...this.env, ...lambda.closure };
    for (let i = 0; i < lambda.params.length; i++) {
      localEnv[lambda.params[i]] = argVals[i];
    }
    return this.evalNode(lambda.body, localEnv);
  }

  public invokeCallable(
    fnVal: Value,
    argVals: Value[],
    span?: Span
  ): Value {
    if ((fnVal as any).type === 'builtin_function') {
      return applyBuiltin((fnVal as any).name, argVals, span);
    }
    if (fnVal.type === 'function') {
      const memoKey = `${fnVal.name}:${argVals.map(v => this.serializeValueForMemo(v)).join(',')}`;
      if (this.memo.has(memoKey)) return this.memo.get(memoKey)!;

      this.budget.enterFunction(fnVal.name, span);
      try {
        const localEnv: Environment = { ...this.env, ...fnVal.closure, [fnVal.name]: fnVal };
        for (let i = 0; i < fnVal.params.length; i++) {
          localEnv[fnVal.params[i]] = argVals[i];
        }
        const res = this.evalNode(fnVal.body, localEnv);
        this.memo.set(memoKey, res);
        return res;
      } finally {
        this.budget.exitFunction();
      }
    }
    if (fnVal.type === 'lambda') {
      const localEnv: Environment = { ...fnVal.closure };
      for (let i = 0; i < fnVal.params.length; i++) {
        localEnv[fnVal.params[i]] = argVals[i];
      }
      return this.evalNode(fnVal.body, localEnv);
    }
    throw createError(`Expected function or lambda, got ${fnVal.type}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
  }

  private evalSumOrProd(node: FunctionCallNode, currentEnv: Environment): Value {
    const isSum = node.callee === 'sum';

    // Check bounded form: sum(expr, n in a..b) or sum(n in a..b, expr)
    if (node.args.length === 2 && (node.args[1].type === 'Range' || node.args[0].type === 'Range')) {
      const expr = node.args[1].type === 'Range' ? node.args[0] : node.args[1];
      const range = (node.args[1].type === 'Range' ? node.args[1] : node.args[0]) as RangeNode;
      if (!range.variable) {
        throw createError(
          `Missing binding variable in bounded ${node.callee}. Expected 'n in ${formatAST(range.start)}..${formatAST(range.end)}', got '${formatAST(range.start)}..${formatAST(range.end)}'`,
          range.span,
          {
            expected: `a binding variable like 'n in ${formatAST(range.start)}..${formatAST(range.end)}'`,
            suggestion: `Write ${node.callee}(${formatAST(expr)}, n in ${formatAST(range.start)}..${formatAST(range.end)})`,
            source: this.source,
          }
        );
      }
      const startNum = valueToNumber(this.evalNode(range.start, currentEnv), range.start.span);
      const endNum = valueToNumber(this.evalNode(range.end, currentEnv), range.end.span);
      const stepNum = range.step ? valueToNumber(this.evalNode(range.step, currentEnv), range.step.span) : 1;

      if (stepNum <= 0) {
        throw createError('Range step must be positive', range.span);
      }

      let acc: Value = isSum ? { type: 'rational', n: 0n, d: 1n } : { type: 'rational', n: 1n, d: 1n };
      const varName = range.variable;

      for (let x = startNum; x <= endNum + 1e-9; x += stepNum) {
        this.budget.check(node.callee, node.span);
        const xVal: Value = Number.isInteger(x)
          ? { type: 'rational', n: BigInt(Math.round(x)), d: 1n }
          : { type: 'float', value: x };
        const localEnv = { ...currentEnv, [varName]: xVal };
        const term = this.evalNode(expr, localEnv);
        acc = isSum ? addValues(acc, term, node.span) : mulValues(acc, term, node.span);
      }

      return acc;
    }

    // Variadic or list form
    const argVals = node.args.map((a: ASTNode) => this.evalNode(a, currentEnv));
    return applyBuiltin(node.callee, argVals, node.span);
  }

  private evalRangeBuiltin(node: FunctionCallNode, currentEnv: Environment): ListValue {
    if (node.args.length === 1 && node.args[0].type === 'Range') {
      const r = node.args[0] as RangeNode;
      const startNum = valueToNumber(this.evalNode(r.start, currentEnv), r.start.span);
      const endNum = valueToNumber(this.evalNode(r.end, currentEnv), r.end.span);
      const stepNum = r.step ? valueToNumber(this.evalNode(r.step, currentEnv), r.step.span) : 1;
      const elements: Value[] = [];
      for (let x = startNum; x <= endNum + 1e-9; x += stepNum) {
        this.budget.check('range', node.span);
        elements.push(
          Number.isInteger(x) ? { type: 'rational', n: BigInt(Math.round(x)), d: 1n } : { type: 'float', value: x }
        );
      }
      return { type: 'list', elements };
    }
    if (node.args.length >= 2) {
      const startNum = valueToNumber(this.evalNode(node.args[0], currentEnv), node.args[0].span);
      const endNum = valueToNumber(this.evalNode(node.args[1], currentEnv), node.args[1].span);
      const stepNum = node.args.length >= 3 ? valueToNumber(this.evalNode(node.args[2], currentEnv), node.args[2].span) : 1;
      const elements: Value[] = [];
      for (let x = startNum; x <= endNum + 1e-9; x += stepNum) {
        this.budget.check('range', node.span);
        elements.push(
          Number.isInteger(x) ? { type: 'rational', n: BigInt(Math.round(x)), d: 1n } : { type: 'float', value: x }
        );
      }
      return { type: 'list', elements };
    }
    throw createError('range() expects range(a..b) or range(a, b, step)', node.span);
  }

  private evalMap(node: FunctionCallNode, currentEnv: Environment): Value {
    if (node.args.length !== 2) throw createError('map(f, collection) requires 2 arguments', node.span);
    const fnVal = this.evalNode(node.args[0], currentEnv);
    const colVal = this.evalNode(node.args[1], currentEnv);

    if (colVal.type === 'trajectory') {
      return mapTrajectory(colVal, (state: Value) => {
        this.budget.check('map_trajectory', node.span);
        return this.invokeCallable(fnVal, [state], node.span);
      });
    }

    if (colVal.type !== 'list') throw createError('map expects a list or trajectory as second argument', node.span);

    const elements: Value[] = [];
    for (const item of colVal.elements) {
      this.budget.check('map', node.span);
      elements.push(this.invokeCallable(fnVal, [item], node.span));
    }
    return { type: 'list', elements };
  }

  private evalFilter(node: FunctionCallNode, currentEnv: Environment): ListValue {
    if (node.args.length !== 2) throw createError('filter(predicate, list) requires 2 arguments', node.span);
    const fnVal = this.evalNode(node.args[0], currentEnv);
    const listVal = this.evalNode(node.args[1], currentEnv);
    if (listVal.type !== 'list') throw createError('filter expects a list as second argument', node.span);

    const elements: Value[] = [];
    for (const item of listVal.elements) {
      this.budget.check('filter', node.span);
      const res = this.invokeCallable(fnVal, [item], node.span);
      if (this.isTruthy(res)) {
        elements.push(item);
      }
    }
    return { type: 'list', elements };
  }

  private evalIterate(node: FunctionCallNode, currentEnv: Environment): ListValue {
    if (node.args.length < 2) {
      throw createError('iterate(f, x0, ...) requires at least 2 arguments', node.span);
    }
    const fnVal = this.evalNode(node.args[0], currentEnv);
    const x0 = this.evalNode(node.args[1], currentEnv);

    // Extract named arguments or positional arguments
    let nLimit: number | undefined;
    let untilVal: Value | undefined;
    let maxLimit: number | undefined;

    for (let i = 2; i < node.args.length; i++) {
      const arg = node.args[i];
      if (arg.type === 'NamedArg') {
        if (arg.name === 'n') {
          nLimit = Math.round(valueToNumber(this.evalNode(arg.value, currentEnv), arg.value.span));
        } else if (arg.name === 'until') {
          untilVal = this.evalNode(arg.value, currentEnv);
        } else if (arg.name === 'max') {
          maxLimit = Math.round(valueToNumber(this.evalNode(arg.value, currentEnv), arg.value.span));
        }
      }
    }

    const orbit: Value[] = [x0];
    let curr = x0;

    if (untilVal !== undefined) {
      const cap = maxLimit ?? 1000;
      let count = 0;
      while (count < cap) {
        this.budget.check('iterate', node.span);
        // Check if curr == untilVal
        const match = compareValues('==', curr, untilVal, node.span);
        if ((match as any).value) break;

        curr = this.invokeCallable(fnVal, [curr], node.span);
        orbit.push(curr);
        count++;
        if ((compareValues('==', curr, untilVal, node.span) as any).value) break;
      }
      return { type: 'list', elements: orbit };
    }

    const n = nLimit ?? maxLimit ?? 100;
    for (let i = 0; i < n; i++) {
      this.budget.check('iterate', node.span);
      curr = this.invokeCallable(fnVal, [curr], node.span);
      orbit.push(curr);
    }
    return { type: 'list', elements: orbit };
  }

  private evalFind(node: FunctionCallNode, currentEnv: Environment): Value {
    if (node.args.length !== 2) throw createError('find(x in a..b, predicate) requires 2 arguments', node.span);
    let rangeArg = node.args[0];
    let predNode = node.args[1];
    if (rangeArg.type !== 'Range' && predNode.type === 'Range') {
      const temp = rangeArg;
      rangeArg = predNode;
      predNode = temp;
    }

    if (rangeArg.type !== 'Range') {
      throw createError('find() requires a range (x in a..b or x in collection)', rangeArg.span);
    }

    const startVal = this.evalNode(rangeArg.start, currentEnv);
    const varName = rangeArg.variable;

    if (startVal.type === 'list' || startVal.type === 'tuple') {
      const elements = startVal.elements;
      for (const item of elements) {
        this.budget.check('find', node.span);
        const localEnv = { ...currentEnv, [varName]: item };
        const match = this.evalNode(predNode, localEnv);
        if (match.type === 'unknown') return match;
        if (this.isTruthy(match)) return item;
      }
      return makeNone();
    }

    const startNum = valueToNumber(startVal, rangeArg.start.span);
    const endNum = valueToNumber(this.evalNode(rangeArg.end, currentEnv), rangeArg.end.span);
    const stepNum = rangeArg.step ? valueToNumber(this.evalNode(rangeArg.step, currentEnv), rangeArg.step.span) : 1;

    for (let x = startNum; x <= endNum + 1e-9; x += stepNum) {
      try {
        this.budget.check('find', node.span);
      } catch (e) {
        if (e instanceof BudgetExhaustedError) {
          return makeUnknown('search-incomplete', `checked to ${x} of ${endNum}`);
        }
        throw e;
      }
      const xVal: Value = Number.isInteger(x)
        ? { type: 'rational', n: BigInt(Math.round(x)), d: 1n }
        : { type: 'float', value: x };
      const localEnv = { ...currentEnv, [varName]: xVal };
      try {
        const match = this.evalNode(predNode, localEnv);
        if (match.type === 'unknown') {
          return match;
        }
        if (this.isTruthy(match)) {
          return xVal;
        }
      } catch (e) {
        if (e instanceof BudgetExhaustedError) {
          return makeUnknown('search-incomplete', `checked to ${x} of ${endNum}`);
        }
        throw e;
      }
    }

    return makeNone();
  }

  private evalAll(node: FunctionCallNode, currentEnv: Environment): Value {
    if (node.args.length !== 2) throw createError('all(predicate, x in a..b) requires 2 arguments', node.span);
    let predNode = node.args[0];
    let rangeNode = node.args[1];

    if (rangeNode.type !== 'Range' && predNode.type === 'Range') {
      // Swapped arguments: all(x in a..b, predicate)
      const temp = predNode;
      predNode = rangeNode;
      rangeNode = temp;
    }

    if (rangeNode.type !== 'Range') {
      throw createError('all() requires a range (x in a..b or x in collection)', node.span);
    }

    const startVal = this.evalNode(rangeNode.start, currentEnv);
    const varName = rangeNode.variable;

    if (startVal.type === 'list' || startVal.type === 'tuple') {
      const elements = startVal.elements;
      let firstUnknown: UnknownValue | null = null;
      for (const item of elements) {
        this.budget.check('all', node.span);
        const localEnv = { ...currentEnv, [varName]: item };
        const match = this.evalNode(predNode, localEnv);
        if (match.type === 'unknown') {
          if (!firstUnknown) firstUnknown = match;
        } else if (!this.isTruthy(match)) {
          return { type: 'boolean', value: false };
        }
      }
      if (firstUnknown) return firstUnknown;
      return { type: 'boolean', value: true };
    }

    const startNum = valueToNumber(startVal, rangeNode.start.span);
    const endNum = valueToNumber(this.evalNode(rangeNode.end, currentEnv), rangeNode.end.span);
    const stepNum = rangeNode.step ? valueToNumber(this.evalNode(rangeNode.step, currentEnv), rangeNode.step.span) : 1;
    let firstUnknown: UnknownValue | null = null;

    for (let x = startNum; x <= endNum + 1e-9; x += stepNum) {
      try {
        this.budget.check('all', node.span);
      } catch (e) {
        if (e instanceof BudgetExhaustedError) {
          firstUnknown = firstUnknown || makeUnknown('search-incomplete', `checked to ${x} of ${endNum}`);
          break;
        }
        throw e;
      }
      const xVal: Value = Number.isInteger(x)
        ? { type: 'rational', n: BigInt(Math.round(x)), d: 1n }
        : { type: 'float', value: x };
      const localEnv = { ...currentEnv, [varName]: xVal };
      try {
        const match = this.evalNode(predNode, localEnv);
        if (match.type === 'unknown') {
          if (!firstUnknown) firstUnknown = match;
        } else if (!this.isTruthy(match)) {
          return { type: 'boolean', value: false }; // Definite counterexample
        }
      } catch (e) {
        if (e instanceof BudgetExhaustedError) {
          firstUnknown = firstUnknown || makeUnknown('search-incomplete', `checked to ${x} of ${endNum}`);
          break;
        }
        throw e;
      }
    }

    if (firstUnknown) return firstUnknown;
    return { type: 'boolean', value: true };
  }

  private evalAny(node: FunctionCallNode, currentEnv: Environment): Value {
    if (node.args.length !== 2) throw createError('any(predicate, x in a..b) requires 2 arguments', node.span);
    let predNode = node.args[0];
    let rangeNode = node.args[1];

    if (rangeNode.type !== 'Range' && predNode.type === 'Range') {
      const temp = predNode;
      predNode = rangeNode;
      rangeNode = temp;
    }

    if (rangeNode.type !== 'Range') {
      throw createError('any() requires a range (x in a..b or x in collection)', node.span);
    }

    const startVal = this.evalNode(rangeNode.start, currentEnv);
    const varName = rangeNode.variable;

    if (startVal.type === 'list' || startVal.type === 'tuple') {
      const elements = startVal.elements;
      let firstUnknown: UnknownValue | null = null;
      for (const item of elements) {
        this.budget.check('any', node.span);
        const localEnv = { ...currentEnv, [varName]: item };
        const match = this.evalNode(predNode, localEnv);
        if (match.type === 'unknown') {
          if (!firstUnknown) firstUnknown = match;
        } else if (this.isTruthy(match)) {
          return { type: 'boolean', value: true };
        }
      }
      if (firstUnknown) return firstUnknown;
      return { type: 'boolean', value: false };
    }

    const startNum = valueToNumber(startVal, rangeNode.start.span);
    const endNum = valueToNumber(this.evalNode(rangeNode.end, currentEnv), rangeNode.end.span);
    const stepNum = rangeNode.step ? valueToNumber(this.evalNode(rangeNode.step, currentEnv), rangeNode.step.span) : 1;
    let firstUnknown: UnknownValue | null = null;

    for (let x = startNum; x <= endNum + 1e-9; x += stepNum) {
      try {
        this.budget.check('any', node.span);
      } catch (e) {
        if (e instanceof BudgetExhaustedError) {
          firstUnknown = firstUnknown || makeUnknown('search-incomplete', `checked to ${x} of ${endNum}`);
          break;
        }
        throw e;
      }
      const xVal: Value = Number.isInteger(x)
        ? { type: 'rational', n: BigInt(Math.round(x)), d: 1n }
        : { type: 'float', value: x };
      const localEnv = { ...currentEnv, [varName]: xVal };
      try {
        const match = this.evalNode(predNode, localEnv);
        if (match.type === 'unknown') {
          if (!firstUnknown) firstUnknown = match;
        } else if (this.isTruthy(match)) {
          return { type: 'boolean', value: true }; // Definite witness
        }
      } catch (e) {
        if (e instanceof BudgetExhaustedError) {
          firstUnknown = firstUnknown || makeUnknown('search-incomplete', `checked to ${x} of ${endNum}`);
          break;
        }
        throw e;
      }
    }

    if (firstUnknown) return firstUnknown;
    return { type: 'boolean', value: false };
  }

  private evalLeast(node: FunctionCallNode, currentEnv: Environment): Value {
    // least(p, from: a) or least(x in a..inf, p) or least(p, a)
    let predNode = node.args[0];
    let startVal = 0;
    let varName = 'x';
    for (const arg of node.args) {
      if (arg.type === 'NamedArg' && arg.name === 'from') {
        startVal = valueToNumber(this.evalNode(arg.value, currentEnv), arg.value.span);
      }
    }
    if (node.args.length >= 2 && node.args[1].type === 'Range') {
      const r = node.args[1] as RangeNode;
      varName = r.variable || 'x';
      startVal = valueToNumber(this.evalNode(r.start, currentEnv), r.start.span);
    } else if (node.args.length === 2 && node.args[1].type !== 'NamedArg') {
      startVal = valueToNumber(this.evalNode(node.args[1], currentEnv), node.args[1].span);
    }

    let x = Math.round(startVal);
    while (true) {
      this.budget.check('least', node.span);
      const xVal: Value = { type: 'rational', n: BigInt(x), d: 1n };
      const localEnv = { ...currentEnv, [varName]: xVal };
      const match = this.evalNode(predNode, localEnv);
      if (match.type === 'unknown') {
        return match;
      }
      if (this.isTruthy(match)) {
        return xVal;
      }
      x++;
    }
  }

  private evalUnfold(node: FunctionCallNode, currentEnv: Environment): Value {
    if (node.args.length !== 2) throw createError('unfold(f, seed) requires 2 arguments', node.span);
    const fnVal = this.evalNode(node.args[0], currentEnv);
    let curr = this.evalNode(node.args[1], currentEnv);
    const elements: Value[] = [];

    while (curr.type !== 'none') {
      this.budget.check('unfold', node.span);
      this.budget.checkMemory(elements.length, node.span);
      elements.push(curr);
      curr = this.invokeCallable(fnVal, [curr], node.span);
      if (curr.type === 'unknown') {
        return curr;
      }
    }
    return { type: 'list', elements };
  }

  private evalFold(node: FunctionCallNode, currentEnv: Environment): Value {
    if (node.args.length !== 3) throw createError('fold(f, list, initial) requires 3 arguments', node.span);
    const fnVal = this.evalNode(node.args[0], currentEnv);
    const listVal = this.evalNode(node.args[1], currentEnv);
    let acc = this.evalNode(node.args[2], currentEnv);
    if (listVal.type !== 'list') throw createError('fold second argument must be a list', node.span);
    for (const item of listVal.elements) {
      this.budget.check('fold', node.span);
      acc = this.invokeCallable(fnVal, [acc, item], node.span);
      if (acc.type === 'unknown') return acc;
    }
    return acc;
  }

  private evalCount(node: FunctionCallNode, currentEnv: Environment): Value {
    if (node.args.length !== 2) throw createError('count(pred, range/list) requires 2 arguments', node.span);
    const predNode = node.args[0];
    const secondArg = node.args[1];
    let tally = 0n;

    if (secondArg.type === 'Range') {
      const startNum = valueToNumber(this.evalNode(secondArg.start, currentEnv), secondArg.start.span);
      const endNum = valueToNumber(this.evalNode(secondArg.end, currentEnv), secondArg.end.span);
      const stepNum = secondArg.step ? valueToNumber(this.evalNode(secondArg.step, currentEnv), secondArg.step.span) : 1;
      const varName = secondArg.variable;
      for (let x = startNum; x <= endNum + 1e-9; x += stepNum) {
        this.budget.check('count', node.span);
        const xVal: Value = Number.isInteger(x) ? { type: 'rational', n: BigInt(Math.round(x)), d: 1n } : { type: 'float', value: x };
        const localEnv = { ...currentEnv, [varName]: xVal };
        const match = this.evalNode(predNode, localEnv);
        if (match.type === 'unknown') return match;
        if (this.isTruthy(match)) tally++;
      }
    } else {
      const listVal = this.evalNode(secondArg, currentEnv);
      const fnVal = this.evalNode(predNode, currentEnv);
      if (listVal.type === 'list') {
        for (const item of listVal.elements) {
          this.budget.check('count', node.span);
          const match = this.invokeCallable(fnVal, [item], node.span);
          if (match.type === 'unknown') return match;
          if (this.isTruthy(match)) tally++;
        }
      }
    }
    return { type: 'rational', n: tally, d: 1n };
  }

  private evalSort(node: FunctionCallNode, currentEnv: Environment): Value {
    if (node.args.length !== 1) throw createError('sort(list) requires 1 argument', node.span);
    const listVal = this.evalNode(node.args[0], currentEnv);
    if (listVal.type !== 'list') throw createError('sort requires a list', node.span);
    const sorted = [...listVal.elements].sort((a, b) => {
      const cmp = compareValues('<', a, b, node.span);
      return (cmp as any).value ? -1 : 1;
    });
    return { type: 'list', elements: sorted };
  }

  private evalDistinct(node: FunctionCallNode, currentEnv: Environment): Value {
    if (node.args.length !== 1) throw createError('distinct(list) requires 1 argument', node.span);
    const listVal = this.evalNode(node.args[0], currentEnv);
    if (listVal.type !== 'list') throw createError('distinct requires a list', node.span);
    const unique: Value[] = [];
    for (const item of listVal.elements) {
      if (!unique.some(u => (compareValues('==', u, item, node.span) as any).value)) {
        unique.push(item);
      }
    }
    return { type: 'list', elements: unique };
  }

  private evalZip(node: FunctionCallNode, currentEnv: Environment): Value {
    if (node.args.length !== 2) throw createError('zip(list1, list2) requires 2 arguments', node.span);
    const l1 = this.evalNode(node.args[0], currentEnv);
    const l2 = this.evalNode(node.args[1], currentEnv);
    if (l1.type !== 'list' || l2.type !== 'list') throw createError('zip requires two lists', node.span);
    const len = Math.min(l1.elements.length, l2.elements.length);
    const elements: Value[] = [];
    for (let i = 0; i < len; i++) {
      elements.push({ type: 'tuple', elements: [l1.elements[i], l2.elements[i]] });
    }
    return { type: 'list', elements };
  }

  private evalTake(node: FunctionCallNode, currentEnv: Environment): Value {
    if (node.args.length !== 2) throw createError('take(n, list) requires 2 arguments', node.span);
    const n = Math.max(0, Math.round(valueToNumber(this.evalNode(node.args[0], currentEnv), node.args[0].span)));
    const listVal = this.evalNode(node.args[1], currentEnv);
    if (listVal.type !== 'list') throw createError('take second argument must be a list', node.span);
    return { type: 'list', elements: listVal.elements.slice(0, n) };
  }

  private evalDrop(node: FunctionCallNode, currentEnv: Environment): Value {
    if (node.args.length !== 2) throw createError('drop(n, list) requires 2 arguments', node.span);
    const n = Math.max(0, Math.round(valueToNumber(this.evalNode(node.args[0], currentEnv), node.args[0].span)));
    const listVal = this.evalNode(node.args[1], currentEnv);
    if (listVal.type !== 'list') throw createError('drop second argument must be a list', node.span);
    return { type: 'list', elements: listVal.elements.slice(n) };
  }

  private evalBigOp(node: BigOpNode, currentEnv: Environment): Value {
    if (node.op === 'integral' && (!node.start || !node.end)) {
      const exprStr = formatAST(node.body);
      const compact = exprStr.replace(/\s+/g, '');
      const isGaussian = compact.includes('e^(-x') || compact.includes('exp(-x') || compact.includes('e^-x') || compact.includes('e^-(x');
      const isSpecialNonElementary = compact.includes('sin(x)/x') || compact.includes('1/ln(x)') || compact.includes('cos(x)/x') || compact.includes('ln(ln(x))');
      if (isGaussian || isSpecialNonElementary) {
        const obstruction: ObstructionReason = isGaussian ? 'not-elementary' : 'unimplemented-technique';
        const namedOp = `Indefinite integral of ${exprStr} d${node.variable}`;
        const meaningText = `Antiderivative function \u222b ${exprStr} d${node.variable}`;
        return {
          type: 'described',
          kind: { name: 'Scalar', subtype: 'real' },
          operation: namedOp,
          namedOperation: namedOp,
          meaning: meaningText,
          meaningInWords: meaningText,
          requires: isGaussian
            ? 'Non-elementary special function representation (Error function erf(x))'
            : 'Special function antiderivative representation (Sine integral Si(x) or Logarithmic integral li(x))',
          canDo: ['Definite numerical quadrature on intervals', 'Taylor series expansion'],
          related: ['Liouville theorem', 'Risch algorithm', 'Special functions'],
          obstruction,
        };
      }
      return {
        type: 'unknown',
        reason: 'requires-unavailable-theory',
        detail: 'Indefinite integration is unsupported; try a definite integral with bounds, e.g. \u222b_a^b f(x) dx',
      };
    }

    const startNum = node.start ? valueToNumber(this.evalNode(node.start, currentEnv), node.start.span) : 0;
    const endNum = node.end ? valueToNumber(this.evalNode(node.end, currentEnv), node.end.span) : 0;
    const varName = node.variable;

    if (node.op === 'sum') {
      let total: Value = { type: 'rational', n: 0n, d: 1n };
      for (let i = Math.round(startNum); i <= Math.round(endNum); i++) {
        this.budget.check('sum', node.span);
        const iVal: Value = { type: 'rational', n: BigInt(i), d: 1n };
        const localEnv = Object.create(currentEnv);
        localEnv[varName] = iVal;
        const term = this.evalNode(node.body, localEnv);
        total = addValues(total, term, node.span);
        if (total.type === 'unknown') return total;
      }
      return total;
    }

    if (node.op === 'prod') {
      let total: Value = { type: 'rational', n: 1n, d: 1n };
      for (let i = Math.round(startNum); i <= Math.round(endNum); i++) {
        this.budget.check('prod', node.span);
        const iVal: Value = { type: 'rational', n: BigInt(i), d: 1n };
        const localEnv = Object.create(currentEnv);
        localEnv[varName] = iVal;
        const term = this.evalNode(node.body, localEnv);
        total = mulValues(total, term, node.span);
        if (total.type === 'unknown') return total;
      }
      return total;
    }

    if (node.op === 'integral') {
      const N = 200;
      const h = (endNum - startNum) / N;
      let sum = 0;
      for (let i = 0; i <= N; i++) {
        this.budget.check('integral', node.span);
        const x = startNum + i * h;
        const localEnv = Object.create(currentEnv);
        localEnv[varName] = { type: 'float', value: x };
        const yVal = valueToNumber(this.evalNode(node.body, localEnv), node.span);
        const weight = (i === 0 || i === N) ? 1 : (i % 2 === 1 ? 4 : 2);
        sum += weight * yVal;
      }
      return { type: 'float', value: (h / 3) * sum };
    }

    return { type: 'none' };
  }

  private evalLimit(node: LimitNode, currentEnv: Environment): Value {
    const varName = node.variable;
    let targetNum: number | 'inf' | '-inf' = 0;
    let isInfinity = false;

    if (node.target.type === 'Identifier' && (node.target.name === 'inf' || node.target.name === 'infinity' || node.target.name === '\u221e')) {
      targetNum = 'inf';
      isInfinity = true;
    } else if (node.target.type === 'UnaryOp' && node.target.op === '-' && node.target.operand.type === 'Identifier' && (node.target.operand.name === 'inf' || node.target.operand.name === 'infinity' || node.target.operand.name === '\u221e')) {
      targetNum = '-inf';
      isInfinity = true;
    } else {
      const targetVal = this.evalNode(node.target, currentEnv);
      targetNum = valueToNumber(targetVal, node.target.span);
    }

    const dirStr = node.direction === 'right' ? '+' : (node.direction === 'left' ? '-' : '');
    const targetStr = `${targetNum}${dirStr}`;
    const origEq = `lim(${varName} -> ${targetStr}, ${formatAST(node.expr)})`;

    // 1. Direct Substitution (if finite target)
    if (!isInfinity && typeof targetNum === 'number') {
      try {
        const localEnv = Object.create(currentEnv);
        localEnv[varName] = { type: 'float', value: targetNum };
        const subVal = this.evalNode(node.expr, localEnv);
        const subNum = valueToNumber(subVal);
        if (isFinite(subNum) && !isNaN(subNum) && subVal.type !== 'unknown') {
          return {
            type: 'derivation',
            targetVar: varName,
            originalEquation: origEq,
            roots: [subVal],
            steps: [{
              before: origEq,
              after: formatAST(node.expr),
              rule: 'substitution',
              justification: 'Direct substitution',
              equation: `${origEq} = ${subNum}`,
            }],
            ruleSequence: ['substitution'],
            verified: true,
          };
        }
      } catch {
        // Direct substitution yielded error / indeterminate
      }
    }

    // 2. Factoring & L'Hopital (if fraction P(x)/Q(x))
    if (!isInfinity && typeof targetNum === 'number' && node.expr.type === 'BinaryOp' && (node.expr.op === '/' || (node.expr as any).op === '//')) {
      try {
        const num = node.expr.left;
        const den = node.expr.right;
        const localEnv = Object.create(currentEnv);
        localEnv[varName] = { type: 'float', value: targetNum };
        
        let numVal = 0;
        let denVal = 0;
        try { numVal = valueToNumber(this.evalNode(num, localEnv)); } catch {}
        try { denVal = valueToNumber(this.evalNode(den, localEnv)); } catch {}

        if (Math.abs(numVal) < 1e-9 && Math.abs(denVal) < 1e-9) {
          const numDeriv = computeSymbolicDerivative(num, varName);
          const denDeriv = computeSymbolicDerivative(den, varName);
          const derivQuotient: ASTNode = {
            type: 'BinaryOp',
            op: '/',
            left: numDeriv.derivativeAST,
            right: denDeriv.derivativeAST,
            span: node.span,
          };
          const lhopVal = this.evalNode(derivQuotient, localEnv);
          const lhopNum = valueToNumber(lhopVal);
          if (isFinite(lhopNum) && !isNaN(lhopNum)) {
            return {
              type: 'derivation',
              targetVar: varName,
              originalEquation: origEq,
              roots: [lhopVal],
              steps: [
                {
                  before: origEq,
                  after: `lim(${varName} -> ${targetStr}, (${formatAST(numDeriv.derivativeAST)}) / (${formatAST(denDeriv.derivativeAST)}))`,
                  rule: 'lhopitals-rule',
                  justification: `L'H\u00f4pital's Rule (indeterminate form 0/0)`,
                  equation: `lim(${varName} -> ${targetStr}, ${formatAST(node.expr)}) = lim(${varName} -> ${targetStr}, (${formatAST(numDeriv.derivativeAST)}) / (${formatAST(denDeriv.derivativeAST)}))`,
                },
                {
                  before: `lim(${varName} -> ${targetStr}, (${formatAST(numDeriv.derivativeAST)}) / (${formatAST(denDeriv.derivativeAST)}))`,
                  after: `${lhopNum}`,
                  rule: 'substitution',
                  justification: 'Direct substitution after differentiation',
                  equation: `${origEq} = ${lhopNum}`,
                }
              ],
              ruleSequence: ['lhopitals-rule', 'substitution'],
              verified: true,
            };
          }
        }
      } catch {
        // Fall through to numerical estimation
      }
    }

    // 3. Fallback: Robust Numerical Limit Sequence
    const est = this.estimateLimitNumerically(node.expr, varName, targetNum, node.direction, currentEnv);
    if (est.converged) {
      const resVal: Value = { type: 'float', value: est.value };
      return {
        type: 'derivation',
        targetVar: varName,
        originalEquation: origEq,
        roots: [resVal],
        steps: [{
          before: origEq,
          after: `${est.value}`,
          rule: 'substitution',
          justification: 'Numerical convergence analysis',
          equation: `${origEq} = ${est.value}`,
        }],
        ruleSequence: ['substitution'],
        verified: true,
      };
    }

    const reason = est.reason || 'unbounded';
    const detail =
      reason === 'one-sided-limits-disagree'
        ? 'Limit does not exist because left and right limits disagree'
        : reason === 'unbounded'
        ? 'Limit is unbounded (tends to infinity)'
        : reason === 'oscillating'
        ? 'Limit is oscillating and does not converge'
        : 'Limit is undefined at target point';

    return {
      type: 'unknown',
      reason: reason as UnknownReason,
      detail,
    };
  }

  private estimateLimitNumerically(
    expr: ASTNode,
    variable: string,
    targetPoint: number | 'inf' | '-inf',
    direction: 'two-sided' | 'left' | 'right',
    env: Environment
  ): { value: number; converged: boolean; reason?: 'one-sided-limits-disagree' | 'unbounded' | 'oscillating' | 'undefined' } {
    if (targetPoint === 'inf' || targetPoint === '-inf') {
      const sign = targetPoint === 'inf' ? 1 : -1;
      const vals: number[] = [];
      for (let i = 2; i <= 8; i++) {
        try {
          const lEnv = Object.create(env);
          lEnv[variable] = { type: 'float', value: sign * Math.pow(10, i) };
          vals.push(valueToNumber(this.evalNode(expr, lEnv)));
        } catch {}
      }
      if (vals.length < 3) return { value: 0, converged: false, reason: 'undefined' };

      const last = vals[vals.length - 1];
      const prev = vals[vals.length - 2];
      if (Math.abs(last) > 1e4 && Math.abs(last) > Math.abs(prev)) {
        return { value: 0, converged: false, reason: 'unbounded' };
      }
      if (Math.abs(last - prev) > 0.05) {
        return { value: 0, converged: false, reason: 'oscillating' };
      }
      return { value: last, converged: true };
    }

    const a = targetPoint;
    const deltas = [1e-2, 1e-3, 1e-4, 1e-5, 1e-6, 1e-7];

    if (direction === 'two-sided') {
      const leftVals: number[] = [];
      const rightVals: number[] = [];
      for (const d of deltas) {
        try {
          const lEnv = Object.create(env);
          lEnv[variable] = { type: 'float', value: a - d };
          leftVals.push(valueToNumber(this.evalNode(expr, lEnv)));
        } catch {}
        try {
          const rEnv = Object.create(env);
          rEnv[variable] = { type: 'float', value: a + d };
          rightVals.push(valueToNumber(this.evalNode(expr, rEnv)));
        } catch {}
      }

      if (leftVals.length < 2 || rightVals.length < 2) {
        return { value: 0, converged: false, reason: 'undefined' };
      }

      const lEnd = leftVals[leftVals.length - 1];
      const rEnd = rightVals[rightVals.length - 1];

      if (Math.abs(lEnd) > 1e4 || Math.abs(rEnd) > 1e4) {
        return { value: 0, converged: false, reason: 'unbounded' };
      }
      if (Math.abs(lEnd - rEnd) > 1e-3) {
        return { value: 0, converged: false, reason: 'one-sided-limits-disagree' };
      }
      return { value: (lEnd + rEnd) / 2, converged: true };
    }

    const vals: number[] = [];
    const sign = direction === 'left' ? -1 : 1;
    for (const d of deltas) {
      try {
        const lEnv = Object.create(env);
        lEnv[variable] = { type: 'float', value: a + sign * d };
        vals.push(valueToNumber(this.evalNode(expr, lEnv)));
      } catch {}
    }
    if (vals.length < 2) return { value: 0, converged: false, reason: 'undefined' };

    const last = vals[vals.length - 1];
    if (Math.abs(last) > 1e4) {
      return { value: 0, converged: false, reason: 'unbounded' };
    }
    return { value: last, converged: true };
  }

  private matchPattern(pattern: ASTNode, target: ASTNode, boundVars: Set<string> = new Set()): { matched: boolean; bindings: Record<string, ASTNode> } {
    if (pattern.type === 'Identifier') {
      if (pattern.name.length === 1 || !/^(pi|e|tau|phi)$/.test(pattern.name)) {
        return { matched: true, bindings: { [pattern.name]: target } };
      }
      if (target.type === 'Identifier' && target.name === pattern.name) {
        return { matched: true, bindings: {} };
      }
      return { matched: false, bindings: {} };
    }
    if (pattern.type !== target.type) {
      return { matched: false, bindings: {} };
    }
    switch (pattern.type) {
      case 'NumberLiteral':
        return { matched: pattern.raw === (target as any).raw, bindings: {} };
      case 'StringLiteral':
        return { matched: pattern.value === (target as any).value, bindings: {} };
      case 'Diff': {
        const targetDiff = target as DiffNode;
        const m = this.matchPattern(pattern.expr, targetDiff.expr, boundVars);
        return m;
      }
      case 'FunctionCall': {
        const targetFn = target as FunctionCallNode;
        if (pattern.callee !== targetFn.callee && pattern.callee !== 'myfunc' && pattern.callee.length > 1) {
          return { matched: false, bindings: {} };
        }
        if (pattern.args.length !== targetFn.args.length) {
          return { matched: false, bindings: {} };
        }
        const combinedBindings: Record<string, ASTNode> = {};
        for (let i = 0; i < pattern.args.length; i++) {
          const m = this.matchPattern(pattern.args[i], targetFn.args[i], boundVars);
          if (!m.matched) return { matched: false, bindings: {} };
          Object.assign(combinedBindings, m.bindings);
        }
        return { matched: true, bindings: combinedBindings };
      }
      case 'BinaryOp': {
        const targetBin = target as BinaryOpNode;
        if (pattern.op !== targetBin.op) return { matched: false, bindings: {} };
        const mLeft = this.matchPattern(pattern.left, targetBin.left, boundVars);
        if (!mLeft.matched) return { matched: false, bindings: {} };
        const mRight = this.matchPattern(pattern.right, targetBin.right, boundVars);
        if (!mRight.matched) return { matched: false, bindings: {} };
        return { matched: true, bindings: { ...mLeft.bindings, ...mRight.bindings } };
      }
      case 'UnaryOp': {
        const targetUnary = target as UnaryOpNode;
        if (pattern.op !== targetUnary.op) return { matched: false, bindings: {} };
        return this.matchPattern(pattern.operand, targetUnary.operand, boundVars);
      }
      case 'PostfixOp': {
        const targetPostfix = target as PostfixOpNode;
        if (pattern.op !== targetPostfix.op) return { matched: false, bindings: {} };
        return this.matchPattern(pattern.operand, targetPostfix.operand, boundVars);
      }
    }
    return { matched: false, bindings: {} };
  }

  private substitutePatternBindings(replacement: ASTNode, bindings: Record<string, ASTNode>): ASTNode {
    if (replacement.type === 'Identifier') {
      if (replacement.name in bindings) {
        return bindings[replacement.name];
      }
      return replacement;
    }
    switch (replacement.type) {
      case 'BinaryOp':
        return {
          ...replacement,
          left: this.substitutePatternBindings(replacement.left, bindings),
          right: this.substitutePatternBindings(replacement.right, bindings),
        };
      case 'UnaryOp':
        return {
          ...replacement,
          operand: this.substitutePatternBindings(replacement.operand, bindings),
        };
      case 'PostfixOp':
        return {
          ...replacement,
          operand: this.substitutePatternBindings(replacement.operand, bindings),
        };
      case 'FunctionCall':
        return {
          ...replacement,
          args: replacement.args.map(a => this.substitutePatternBindings(a, bindings)),
        };
      case 'Diff':
        return {
          ...replacement,
          expr: this.substitutePatternBindings(replacement.expr, bindings),
        };
    }
    return replacement;
  }

  private applyUserRules(node: ASTNode, currentEnv: Environment): Value | null {
    const rules = [...this.userRules, ...((currentEnv as any).__rules__ || []), ...((this.env as any).__rules__ || [])];
    for (const rule of rules) {
      const match = this.matchPattern(rule.pattern, node);
      if (match.matched) {
        const reqStr = rule.requires ? ` (requires: ${formatAST(rule.requires)})` : '';
        return {
          type: 'described',
          kind: { name: 'Function' } as any,
          operation: `user rule: ${formatAST(rule.pattern)} => ${formatAST(rule.replacement)}`,
          namedOperation: `User rule rewrite`,
          meaning: `computed via unverified user rule${reqStr}`,
          meaningInWords: `computed via unverified user rule${reqStr}`,
          provenance: 'user-rule',
          rulesFired: [rule.name || formatAST(rule.pattern)],
          requires: rule.requires ? formatAST(rule.requires) : 'Verification of user rule axioms/derivation',
          canDo: ['Symbolic pattern derivation', 'Substitution'],
          obstruction: 'requires-proof',
        };
      }
    }
    return null;
  }

  private evalTrajectoryConstructor(node: FunctionCallNode, currentEnv: Environment): TrajectoryValue {
    let stateKind = 'Value';
    let tStart = 0;
    let tEnd = 1;
    let samples: TrajectorySample[] = [];

    if (node.args.length === 4) {
      const kArg = node.args[0];
      if (kArg.type === 'Identifier') stateKind = kArg.name;
      else if (kArg.type === 'StringLiteral') stateKind = kArg.value;
      else {
        const kVal = this.evalNode(kArg, currentEnv);
        stateKind = kVal.type === 'string' ? kVal.value : (kVal.type === 'kind' ? formatKind(kVal.kind) : kVal.type);
      }

      tStart = valueToNumber(this.evalNode(node.args[1], currentEnv), node.args[1].span);
      tEnd = valueToNumber(this.evalNode(node.args[2], currentEnv), node.args[2].span);
      const rawSamplesVal = this.evalNode(node.args[3], currentEnv);
      if (rawSamplesVal.type !== 'list') {
        throw createError('Trajectory samples must be a list', node.args[3].span);
      }
      const rawList = rawSamplesVal.elements;
      if (rawList.length === 0) {
        throw createError('Trajectory samples list cannot be empty', node.args[3].span);
      }

      samples = rawList.map((item, idx) => {
        if (item.type === 'tuple' && item.elements.length === 2 && (item.elements[0].type === 'rational' || item.elements[0].type === 'float')) {
          const t = valueToNumber(item.elements[0]);
          return { t, state: item.elements[1] };
        }
        if (item.type === 'record' && 't' in item.fields && 'state' in item.fields) {
          const t = valueToNumber(item.fields['t']);
          return { t, state: item.fields['state'] };
        }
        const t = rawList.length === 1 ? tStart : tStart + (idx / (rawList.length - 1)) * (tEnd - tStart);
        return { t, state: item };
      });
    } else if (node.args.length === 1) {
      const rawSamplesVal = this.evalNode(node.args[0], currentEnv);
      if (rawSamplesVal.type !== 'list') {
        throw createError('Trajectory expects a list of samples', node.args[0].span);
      }
      const rawList = rawSamplesVal.elements;
      if (rawList.length === 0) {
        throw createError('Trajectory samples list cannot be empty', node.args[0].span);
      }
      samples = rawList.map((item, idx) => {
        if (item.type === 'tuple' && item.elements.length === 2 && (item.elements[0].type === 'rational' || item.elements[0].type === 'float')) {
          const t = valueToNumber(item.elements[0]);
          return { t, state: item.elements[1] };
        }
        if (item.type === 'record' && 't' in item.fields && 'state' in item.fields) {
          const t = valueToNumber(item.fields['t']);
          return { t, state: item.fields['state'] };
        }
        return { t: idx, state: item };
      });
      tStart = samples[0].t;
      tEnd = samples[samples.length - 1].t;
      const firstState = samples[0].state;
      if (firstState.type === 'record') stateKind = firstState.typeName;
      else if (firstState.type === 'tuple') stateKind = `Vector(${firstState.elements.length})`;
      else if (firstState.type === 'quantity') stateKind = `Quantity(${firstState.unit})`;
      else if (firstState.type === 'rational' || firstState.type === 'float') stateKind = 'Scalar';
    } else {
      throw createError('Trajectory() expects Trajectory(stateKind, tStart, tEnd, samples) or Trajectory(samples)', node.span);
    }

    // Unit verification across all samples (Phase 12 Part A.3 & Gate E1)
    this.validateTrajectoryUnits(samples, node.span);

    return {
      type: 'trajectory',
      stateKind,
      tStart,
      tEnd,
      samples,
      sourceInfo: {
        source: 'simulate',
      },
    };
  }

  private validateTrajectoryUnits(samples: TrajectorySample[], span: Span) {
    if (samples.length <= 1) return;
    const baseState = samples[0].state;

    const extractUnits = (val: Value): Record<string, string> => {
      const map: Record<string, string> = {};
      if (val.type === 'quantity') {
        map[''] = val.unit;
      } else if (val.type === 'record') {
        for (const [k, v] of Object.entries(val.fields)) {
          if (v.type === 'quantity') map[k] = v.unit;
        }
      } else if (val.type === 'tuple') {
        val.elements.forEach((e, idx) => {
          if (e.type === 'quantity') map[String(idx)] = e.unit;
        });
      }
      return map;
    };

    const baseUnits = extractUnits(baseState);
    if (Object.keys(baseUnits).length === 0) return;

    for (let i = 1; i < samples.length; i++) {
      const currUnits = extractUnits(samples[i].state);
      for (const [key, baseUnit] of Object.entries(baseUnits)) {
        const currUnit = currUnits[key];
        if (currUnit && currUnit !== baseUnit) {
          throw createError(
            `Trajectory state has mismatched dimensional units at t = ${samples[i].t}: expected unit '${baseUnit}', got '${currUnit}'`,
            span,
            {
              expected: `consistent unit '${baseUnit}'`,
              suggestion: `Ensure all trajectory samples maintain uniform dimensional units across all time steps`,
              source: this.source,
            }
          );
        }
      }
    }
  }

  private evalSimulate(node: FunctionCallNode, currentEnv: Environment): TrajectoryValue {
    if (node.args.length < 3) {
      throw createError('simulate(step, initial, t in 0..T, [dt: h]) requires at least 3 arguments', node.span);
    }
    const stepFnVal = this.evalNode(node.args[0], currentEnv);
    const initialVal = this.evalNode(node.args[1], currentEnv);

    let tStart = 0;
    let tEnd = 1;
    let rangeNode: RangeNode | null = null;
    let dt = 0.01;

    for (let i = 2; i < node.args.length; i++) {
      const arg = node.args[i];
      if (arg.type === 'Range') {
        rangeNode = arg;
      } else if (arg.type === 'NamedArg') {
        if (arg.name === 'dt' || arg.name === 'h') {
          dt = valueToNumber(this.evalNode(arg.value, currentEnv), arg.value.span);
        }
      }
    }

    if (!rangeNode && node.args[2].type === 'Range') {
      rangeNode = node.args[2] as RangeNode;
    }

    if (rangeNode) {
      tStart = valueToNumber(this.evalNode(rangeNode.start, currentEnv), rangeNode.start.span);
      tEnd = valueToNumber(this.evalNode(rangeNode.end, currentEnv), rangeNode.end.span);
    } else if (node.args.length >= 3 && node.args[2].type !== 'NamedArg') {
      tEnd = valueToNumber(this.evalNode(node.args[2], currentEnv), node.args[2].span);
    }

    if (dt <= 0) dt = 0.01;

    const samples: TrajectorySample[] = [{ t: tStart, state: initialVal }];
    let currState = initialVal;
    let t = tStart;
    const maxIters = 100_000;
    let iters = 0;

    while (t < tEnd - 1e-12 && iters < maxIters) {
      this.budget.check('simulate', node.span);
      iters++;
      const hStep = Math.min(dt, tEnd - t);
      const dtVal: Value = { type: 'float', value: hStep };
      const tVal: Value = { type: 'float', value: t };

      let nextState: Value;
      try {
        if ((stepFnVal.type === 'function' && stepFnVal.params.length === 3) ||
            (stepFnVal.type === 'lambda' && stepFnVal.params.length === 3)) {
          nextState = this.invokeCallable(stepFnVal, [currState, tVal, dtVal], node.span);
        } else if ((stepFnVal.type === 'function' && stepFnVal.params.length === 1) ||
                   (stepFnVal.type === 'lambda' && stepFnVal.params.length === 1)) {
          nextState = this.invokeCallable(stepFnVal, [currState], node.span);
        } else {
          nextState = this.invokeCallable(stepFnVal, [currState, dtVal], node.span);
        }
      } catch (err: any) {
        throw createError(`Simulation step failed at t = ${t}: ${err.message || String(err)}`, node.span);
      }

      t += hStep;
      if (Math.abs(t - Math.round(t / dt) * dt) < 1e-10) {
        t = Math.round(t / dt) * dt;
      }
      samples.push({ t, state: nextState });
      currState = nextState;
    }

    this.validateTrajectoryUnits(samples, node.span);

    let stateKind = 'Value';
    if (initialVal.type === 'record') stateKind = initialVal.typeName;
    else if (initialVal.type === 'tuple') stateKind = `Vector(${initialVal.elements.length})`;
    else if (initialVal.type === 'quantity') stateKind = `Quantity(${initialVal.unit})`;
    else if (initialVal.type === 'rational' || initialVal.type === 'float') stateKind = 'Scalar';

    return {
      type: 'trajectory',
      stateKind,
      tStart,
      tEnd,
      samples,
      sourceInfo: {
        source: 'simulate',
        dt,
      },
    };
  }

  private evalClosedForm(node: FunctionCallNode, currentEnv: Environment): TrajectoryValue {
    if (node.args.length < 2) {
      throw createError('closed_form(f, t in 0..T, [dt: h, samples: N]) requires at least 2 arguments', node.span);
    }
    const fnVal = this.evalNode(node.args[0], currentEnv);

    let tStart = 0;
    let tEnd = 1;
    let rangeNode: RangeNode | null = null;
    let dt: number | undefined;
    let numSamples = 101;

    for (let i = 1; i < node.args.length; i++) {
      const arg = node.args[i];
      if (arg.type === 'Range') {
        rangeNode = arg;
      } else if (arg.type === 'NamedArg') {
        if (arg.name === 'dt' || arg.name === 'h') {
          dt = valueToNumber(this.evalNode(arg.value, currentEnv), arg.value.span);
        } else if (arg.name === 'samples' || arg.name === 'N' || arg.name === 'n') {
          numSamples = Math.max(2, Math.round(valueToNumber(this.evalNode(arg.value, currentEnv), arg.value.span)));
        }
      }
    }

    if (rangeNode) {
      tStart = valueToNumber(this.evalNode(rangeNode.start, currentEnv), rangeNode.start.span);
      tEnd = valueToNumber(this.evalNode(rangeNode.end, currentEnv), rangeNode.end.span);
    }

    if (dt !== undefined && dt > 0) {
      numSamples = Math.max(2, Math.round((tEnd - tStart) / dt) + 1);
    } else {
      dt = (tEnd - tStart) / (numSamples - 1);
    }

    const samples: TrajectorySample[] = [];
    for (let i = 0; i < numSamples; i++) {
      this.budget.check('closed_form', node.span);
      const frac = i / (numSamples - 1);
      const t = tStart + frac * (tEnd - tStart);
      const tVal: Value = { type: 'float', value: t };
      const s = this.invokeCallable(fnVal, [tVal], node.span);
      samples.push({ t, state: s });
    }

    this.validateTrajectoryUnits(samples, node.span);

    let stateKind = 'Value';
    const firstState = samples[0]?.state;
    if (firstState) {
      if (firstState.type === 'record') stateKind = firstState.typeName;
      else if (firstState.type === 'tuple') stateKind = `Vector(${firstState.elements.length})`;
      else if (firstState.type === 'quantity') stateKind = `Quantity(${firstState.unit})`;
      else if (firstState.type === 'rational' || firstState.type === 'float') stateKind = 'Scalar';
    }

    return {
      type: 'trajectory',
      stateKind,
      tStart,
      tEnd,
      samples,
      sourceInfo: {
        source: 'closed_form',
        dt,
      },
    };
  }

  private evalODE(node: FunctionCallNode, currentEnv: Environment): TrajectoryValue {
    if (node.args.length < 3) {
      throw createError('ode(dy//dt = f(t,y), y(0) = y0, t in 0..T, [dt: h]) requires at least 3 arguments', node.span);
    }
    const eqArg = node.args[0];
    const initArg = node.args[1];

    let tStart = 0;
    let tEnd = 1;
    let rangeNode: RangeNode | null = null;
    let dt = 0.05;

    for (let i = 2; i < node.args.length; i++) {
      const arg = node.args[i];
      if (arg.type === 'Range') {
        rangeNode = arg;
      } else if (arg.type === 'NamedArg') {
        if (arg.name === 'dt' || arg.name === 'h') {
          dt = valueToNumber(this.evalNode(arg.value, currentEnv), arg.value.span);
        }
      }
    }

    if (!rangeNode && node.args[2].type === 'Range') {
      rangeNode = node.args[2] as RangeNode;
    }

    let depVar = 'y';
    let indepVar = 't';

    if (rangeNode) {
      if (rangeNode.variable) indepVar = rangeNode.variable;
      tStart = valueToNumber(this.evalNode(rangeNode.start, currentEnv), rangeNode.start.span);
      tEnd = valueToNumber(this.evalNode(rangeNode.end, currentEnv), rangeNode.end.span);
    } else if (node.args.length >= 3 && node.args[2].type !== 'NamedArg') {
      tEnd = valueToNumber(this.evalNode(node.args[2], currentEnv), node.args[2].span);
    }

    if (dt <= 0) dt = 0.05;

    // Initial condition y0
    let y0 = 1;
    if (initArg.type === 'BinaryOp' && initArg.op === '=') {
      y0 = valueToNumber(this.evalNode(initArg.right, currentEnv), initArg.right.span);
    } else {
      y0 = valueToNumber(this.evalNode(initArg, currentEnv), initArg.span);
    }

    // Classify ODE and extract rate function f(t, y)
    let classification = classifyODE(eqArg, depVar, indepVar);
    let fRate: (t: number, y: number) => number;

    if (eqArg.type === 'BinaryOp' && eqArg.op === '=') {
      const rhs = eqArg.right;
      fRate = (tNum: number, yNum: number) => {
        const localEnv: Environment = {
          ...currentEnv,
          [indepVar]: { type: 'float', value: tNum },
          [depVar]: { type: 'float', value: yNum },
        };
        const res = this.evalNode(rhs, localEnv);
        return valueToNumber(res, rhs.span);
      };
    } else {
      const fnVal = this.evalNode(eqArg, currentEnv);
      fRate = (tNum: number, yNum: number) => {
        const tVal: Value = { type: 'float', value: tNum };
        const yVal: Value = { type: 'float', value: yNum };
        let res: Value;
        if ((fnVal.type === 'function' && fnVal.params.length === 1) ||
            (fnVal.type === 'lambda' && fnVal.params.length === 1)) {
          res = this.invokeCallable(fnVal, [yVal], node.span);
        } else {
          res = this.invokeCallable(fnVal, [tVal, yVal], node.span);
        }
        return valueToNumber(res, node.span);
      };
    }

    // Solve via RK4 with error estimation
    const solution = solveODERK4(fRate, y0, tStart, tEnd, dt);

    const samples: TrajectorySample[] = solution.samples.map(s => ({
      t: s.t,
      state: { type: 'float', value: s.y },
    }));

    return {
      type: 'trajectory',
      stateKind: 'Scalar',
      tStart,
      tEnd,
      samples,
      sourceInfo: {
        source: 'ode',
        integrator: 'rk4',
        dt,
        errorEstimate: solution.cumulativeErrorEstimate,
        symbolicDerivation: classification.derivation,
      },
    };
  }

  private evalImport(node: ImportNode, currentEnv: Environment): Value {
    const importPath = node.path;
    if (/^https?:\/\//i.test(importPath)) {
      throw createError(`Network imports are not allowed: '${importPath}'`, node.span, {
        expected: 'a relative filesystem path',
        suggestion: 'Import local .ax files using relative paths only',
        source: this.source,
      });
    }

    const importStack: string[] = (currentEnv as any).__importStack__ || [];
    const resolved = resolveModuleCode(importPath);

    if ('searchedPaths' in resolved) {
      const available = Array.from(
        new Set([
          ...Object.keys(BUNDLED_DOCUMENTS),
          ...Array.from(Evaluator.virtualFiles.keys()).map(k => k.replace(/^.*[\\/]/, '')),
        ])
      )
        .filter(k => k.endsWith('.ax'))
        .sort();

      throw createError(
        `Cannot find module '${importPath}'. Looked for: ${resolved.searchedPaths.map(p => `'${p}'`).join(', ')}`,
        node.span,
        {
          expected: 'an existing .ax module',
          suggestion: `Available modules: ${available.join(', ') || '(none)'}`,
          source: this.source,
        }
      );
    }

    const { code, canonicalPath } = resolved;

    if (importStack.includes(canonicalPath) || importStack.includes(importPath)) {
      const cycleStr = [...importStack, canonicalPath].join(' -> ');
      throw createError(`Cyclic module import detected: ${cycleStr}`, node.span, {
        expected: 'acyclic dependency graph',
        suggestion: 'Refactor mutual imports or extract shared definitions into a base module',
        source: this.source,
      });
    }

    const modEnv = createInitialEnvironment();
    (modEnv as any).__importStack__ = [...importStack, canonicalPath];

    // Evaluate module statements
    const parsedAST = parseProgram(code);
    if (parsedAST.type === 'Block') {
      for (const stmt of parsedAST.statements) {
        this.evalNode(stmt, modEnv);
      }
    } else {
      this.evalNode(parsedAST, modEnv);
    }

    // Collect exported symbols
    const exportedSymbols: Set<string> | undefined = (modEnv as any).__exports__;
    const exports: Record<string, Value> = {};

    for (const [k, v] of Object.entries(modEnv)) {
      if (k.startsWith('__')) continue;
      if (exportedSymbols) {
        if (exportedSymbols.has(k)) {
          exports[k] = v;
        }
      } else {
        exports[k] = v;
      }
    }

    // Propagate units, operators, kinds, rules, views
    if ((modEnv as any).__units__) {
      for (const [k, v] of (modEnv as any).__units__.entries()) {
        this.declaredUnits.set(k, v);
        if (!(currentEnv as any).__units__) (currentEnv as any).__units__ = new Map();
        (currentEnv as any).__units__.set(k, v);
      }
    }
    if ((modEnv as any).__operators__) {
      for (const [k, v] of (modEnv as any).__operators__.entries()) {
        this.userOperators.set(k, v);
        if (!(currentEnv as any).__operators__) (currentEnv as any).__operators__ = new Map();
        (currentEnv as any).__operators__.set(k, v);
      }
    }
    if ((modEnv as any).__kinds__) {
      for (const [k, v] of (modEnv as any).__kinds__.entries()) {
        this.declaredKinds.set(k, v);
        if (!(currentEnv as any).__kinds__) (currentEnv as any).__kinds__ = new Map();
        (currentEnv as any).__kinds__.set(k, v);
      }
    }
    if ((modEnv as any).__rules__) {
      for (const r of (modEnv as any).__rules__) {
        this.userRules.push(r);
        if (!(currentEnv as any).__rules__) (currentEnv as any).__rules__ = [];
        (currentEnv as any).__rules__.push(r);
      }
    }
    if ((modEnv as any).__views__) {
      for (const [k, v] of (modEnv as any).__views__.entries()) {
        this.declaredViews.set(k, v);
        if (!(currentEnv as any).__views__) (currentEnv as any).__views__ = new Map();
        (currentEnv as any).__views__.set(k, v);
      }
    }

    const modName = (modEnv as any).__moduleName__ || canonicalPath.replace(/^.*[\\/]/, '').replace(/\.(ax|axine|math)$/, '');

    if (node.importedSymbols && node.importedSymbols.length > 0) {
      for (const sym of node.importedSymbols) {
        if (sym in exports) {
          currentEnv[sym] = exports[sym];
        } else {
          throw createError(`Symbol '${sym}' is not exported by module '${importPath}'`, node.span, {
            expected: `one of the exported symbols: ${Object.keys(exports).join(', ') || '(none)'}`,
            suggestion: `Check the exports in '${importPath}'`,
            source: this.source,
          });
        }
      }
    } else if (node.asName) {
      currentEnv[node.asName] = {
        type: 'module',
        name: modName,
        exports,
      };
    } else {
      currentEnv[modName] = {
        type: 'module',
        name: modName,
        exports,
      };
      for (const [k, v] of Object.entries(exports)) {
        currentEnv[k] = v;
      }
    }

    return { type: 'none' };
  }

  private evalDiff(node: DiffNode, currentEnv: Environment): Value {
    const userRuleRes = this.applyUserRules(node, currentEnv);
    if (userRuleRes) {
      return userRuleRes;
    }

    const varName = node.variable;

    if (node.expr.type === 'BinaryOp' && (node.expr.op === '/' || (node.expr as any).op === '//')) {
      if (node.expr.right.type === 'NumberLiteral' && (node.expr.right.raw === '0' || node.expr.right.raw === '0.0')) {
        return {
          type: 'described',
          kind: { name: 'Scalar', subtype: 'real' },
          operation: 'Differentiation of ill-posed fraction',
          namedOperation: 'Differentiation of ill-posed fraction',
          meaning: 'Differentiation attempted on expression with division by zero',
          meaningInWords: 'Differentiation attempted on expression with division by zero',
          requires: 'Well-defined smooth function on open domain',
          canDo: ['Singularity classification', 'Regularization'],
          related: ['Poles and residues', 'Distribution theory', 'Dirac delta'],
          obstruction: 'ill-posed',
        };
      }
    }

    // Symbolic derivation if variable is not bound in environment
    if (!(varName in currentEnv) && !(node.expr.type === 'Identifier' && node.expr.name in currentEnv)) {
      const symRes = computeSymbolicDerivative(node.expr, varName);
      return {
        type: 'derivation',
        originalEquation: `d//d${varName} (${formatAST(node.expr)})`,
        roots: [],
        originalExpr: node.expr,
        finalExpr: symRes.derivativeAST,
        originalExprString: `d//d${varName} (${formatAST(node.expr)})`,
        finalExprString: symRes.derivativeStr,
        steps: symRes.steps,
        ruleSequence: symRes.ruleSequence,
        targetVar: varName,
        verified: symRes.numericVerification.passed
      };
    }

    const currentVal = currentEnv[varName];
    const x0 = currentVal ? valueToNumber(currentVal, node.span) : 0;
    const h = 1e-6;

    // Check if node.expr is a function identifier without application: d//dx f
    if (node.expr.type === 'Identifier' && node.expr.name in currentEnv) {
      const fnVal = currentEnv[node.expr.name];
      if (fnVal.type === 'function' || fnVal.type === 'lambda') {
        const paramCount = fnVal.params.length;
        if (paramCount !== 1) {
          throw createError(
            `cannot differentiate ${paramCount}-argument function '${node.expr.name}' without application; expected d//d${varName} ${node.expr.name}(${fnVal.params.join(', ')})`,
            node.span
          );
        }
        const yPlus = valueToNumber(this.invokeCallable(fnVal, [{ type: 'float', value: x0 + h }], node.span), node.span);
        const yMinus = valueToNumber(this.invokeCallable(fnVal, [{ type: 'float', value: x0 - h }], node.span), node.span);
        const deriv = (yPlus - yMinus) / (2 * h);
        if (Math.abs(deriv - Math.round(deriv)) < 1e-6) {
          return { type: 'rational', n: BigInt(Math.round(deriv)), d: 1n };
        }
        return { type: 'float', value: deriv };
      }
    }

    const envPlus = Object.create(currentEnv);
    envPlus[varName] = { type: 'float', value: x0 + h };
    const yPlus = valueToNumber(this.evalNode(node.expr, envPlus), node.span);

    const envMinus = Object.create(currentEnv);
    envMinus[varName] = { type: 'float', value: x0 - h };
    const yMinus = valueToNumber(this.evalNode(node.expr, envMinus), node.span);

    const deriv = (yPlus - yMinus) / (2 * h);
    if (Math.abs(deriv - Math.round(deriv)) < 1e-6) {
      return { type: 'rational', n: BigInt(Math.round(deriv)), d: 1n };
    }
    return { type: 'float', value: deriv };
  }

  private evalClaim(node: ClaimNode, currentEnv: Environment): Value {
    let shadowVal: Value;
    if (node.kind === 'H') {
      // Kind H claims NEVER attempt finite execution; they return unknown(not-finitely-checkable)
      shadowVal = makeUnknown('not-finitely-checkable', node.provedBy || 'Requires infinite or undecidable proof');
    } else {
      shadowVal = this.evalNode(node.shadow, currentEnv);
    }
    const expectVal = this.evalNode(node.expect, currentEnv);
    const cmp = compareValues('==', shadowVal, expectVal, node.span);
    const verified = (cmp as any).value === true;
    const claimVal: ClaimValue = {
      type: 'claim',
      name: node.name,
      statement: node.statement,
      provedBy: node.provedBy,
      relevance: node.relevance,
      kind: node.kind,
      shadowVal,
      expectVal,
      verified,
      span: node.span,
    };
    this.env[node.name] = claimVal;
    currentEnv[node.name] = claimVal;
    return claimVal;
  }

  private evalSolve(node: FunctionCallNode, currentEnv: Environment): Value {
    let traceMode = false;
    let forVar: string | undefined;
    let nearVal: number | undefined;

    for (const arg of node.args) {
      if (arg.type === 'NamedArg') {
        if (arg.name === 'trace') {
          const tVal = this.evalNode(arg.value, currentEnv);
          traceMode = tVal.type === 'boolean' ? tVal.value : true;
        } else if (arg.name === 'near') {
          nearVal = valueToNumber(this.evalNode(arg.value, currentEnv), arg.value.span);
        } else if (arg.name === 'for' || arg.name === 'var') {
          if (arg.value.type === 'Identifier') {
            forVar = arg.value.name;
          }
        }
      }
    }

    // 1. Newton's method: solve(f, near: x0) OR solve(expr, for: x, near: x0)
    if (nearVal !== undefined) {
      const fnArg = node.args[0];
      let fnVal: Value | undefined;

      if (!forVar) {
        if (fnArg.type === 'Identifier' && fnArg.name in currentEnv) {
          fnVal = currentEnv[fnArg.name];
        } else {
          try {
            fnVal = this.evalNode(fnArg, currentEnv);
          } catch {
            // Might be an unevaluated expression without explicit 'for:'
          }
        }
      }

      const evalF = (x: number): number => {
        if (forVar) {
          const localEnv = { ...currentEnv, [forVar]: { type: 'float', value: x } as Value };
          return valueToNumber(this.evalNode(fnArg, localEnv), node.span);
        }
        if (fnVal && (fnVal.type === 'function' || fnVal.type === 'lambda')) {
          const val = this.invokeCallable(fnVal, [{ type: 'float', value: x }], node.span);
          return valueToNumber(val, node.span);
        }
        // Fallback: if single free variable can be identified in fnArg
        const localEnv = { ...currentEnv, x: { type: 'float', value: x } as Value };
        return valueToNumber(this.evalNode(fnArg, localEnv), node.span);
      };

      let x = nearVal;
      const h = 1e-7;
      const maxIter = 100;
      let converged = false;
      const iterations: { n: number; x: number; fx: number; error: number }[] = [];

      for (let iter = 0; iter < maxIter; iter++) {
        this.budget.check('solve', node.span);
        const fx = evalF(x);
        iterations.push({ n: iter, x, fx, error: Math.abs(fx) });

        if (Math.abs(fx) < 1e-12) {
          converged = true;
          break;
        }

        const df = (evalF(x + h) - evalF(x - h)) / (2 * h);
        if (Math.abs(df) < 1e-14) {
          throw createError('solve(): derivative near zero during Newton iteration', node.span, {
            expected: 'a non-zero derivative',
            suggestion: 'Choose a different initial guess near: x0',
            source: this.source,
          });
        }

        const dx = fx / df;
        x -= dx;
        if (Math.abs(dx) < 1e-12) {
          converged = true;
          break;
        }
      }

      if (!converged) {
        throw createError(`solve(): did not converge within ${maxIter} iterations`, node.span, {
          expected: 'convergence to a root',
          suggestion: 'Provide a closer initial guess near: x0',
          source: this.source,
        });
      }

      const rootVal: Value = { type: 'float', value: x };
      if (traceMode) {
        return {
          type: 'solve_trace',
          method: 'newton',
          root: rootVal,
          iterations,
        };
      }

      return rootVal;
    }

    // 2. Bisection method: solve(expr, x in a..b)
    if (node.args.length >= 2 && (node.args[1].type === 'Range' || node.args[0].type === 'Range')) {
      let expr = node.args[0];
      let range = node.args[1] as RangeNode;
      if (expr.type === 'Range' && range.type !== 'Range') {
        const tmp = expr; expr = range; range = tmp as RangeNode;
      }

      const a = valueToNumber(this.evalNode(range.start, currentEnv), range.start.span);
      const b = valueToNumber(this.evalNode(range.end, currentEnv), range.end.span);
      const varName = range.variable;

      const evalF = (x: number): number => {
        const localEnv = { ...currentEnv, [varName]: { type: 'float', value: x } as Value };
        return valueToNumber(this.evalNode(expr, localEnv), node.span);
      };

      let low = a;
      let high = b;
      let fLow = evalF(low);
      let fHigh = evalF(high);

      if (fLow * fHigh > 0) {
        throw createError(`solve(): no sign change in interval [${a}, ${b}]`, node.span, {
          expected: 'opposite signs f(a) and f(b)',
          suggestion: 'Choose an interval where the function crosses zero',
          source: this.source,
        });
      }

      const iterations: { n: number; x: number; fx: number; error: number; low: number; high: number; mid: number; fMid: number; width: number }[] = [];

      for (let iter = 0; iter < 100; iter++) {
        this.budget.check('solve', node.span);
        const mid = (low + high) / 2;
        const fMid = evalF(mid);
        const err = (high - low) / 2;
        iterations.push({ n: iter, x: mid, fx: fMid, error: err, low, high, mid, fMid, width: high - low });

        if (Math.abs(fMid) < 1e-12 || err < 1e-12) {
          const rootVal: Value = { type: 'float', value: mid };
          if (traceMode) {
            return {
              type: 'solve_trace',
              method: 'bisection',
              root: rootVal,
              iterations,
            };
          }
          return rootVal;
        }
        if (fLow * fMid < 0) {
          high = mid;
          fHigh = fMid;
        } else {
          low = mid;
          fLow = fMid;
        }
      }

      const rootVal: Value = { type: 'float', value: (low + high) / 2 };
      if (traceMode) {
        return {
          type: 'solve_trace',
          method: 'bisection',
          root: rootVal,
          iterations,
        };
      }
      return rootVal;
    }

    throw createError('solve() expects solve(f, near: x0) or solve(expr, x in a..b)', node.span);
  }

  private evalIsolate(node: FunctionCallNode, currentEnv: Environment): Value {
    if (node.args.length < 1) {
      throw createError('isolate(equation, for: x) requires at least 1 argument', node.span, {
        expected: 'an equation and target variable',
        suggestion: 'Write isolate(3x + 7 = 22, for: x)',
        source: this.source,
      });
    }

    const eqArg = node.args[0];
    let varName = 'x';

    for (const arg of node.args.slice(1)) {
      if (arg.type === 'NamedArg' && (arg.name === 'for' || arg.name === 'var')) {
        if (arg.value.type === 'Identifier') {
          varName = arg.value.name;
        }
      } else if (arg.type === 'Identifier') {
        varName = arg.name;
      }
    }

    return solveAlgebraic(eqArg, varName, currentEnv, this.source);
  }

  private evalSimplify(node: FunctionCallNode, currentEnv: Environment): Value {
    if (node.args.length < 1) {
      throw createError('simplify(expression, in: x) requires at least 1 argument', node.span, {
        expected: 'an algebraic expression to simplify',
        suggestion: 'Write simplify(3x + 2x - 4, in: x)',
        source: this.source,
      });
    }

    let exprArg = node.args[0];
    if (exprArg.type === 'MemberAccess' || exprArg.type === 'Index' || exprArg.type === 'Identifier') {
      try {
        const evalVal = this.evalNode(exprArg, currentEnv);
        if (evalVal.type === 'string') {
          exprArg = parse((evalVal as any).value);
        }
      } catch {
        // use exprArg as is
      }
    }

    let inVar: string | undefined;
    for (const arg of node.args.slice(1)) {
      if (arg.type === 'NamedArg' && (arg.name === 'in' || arg.name === 'for' || arg.name === 'var')) {
        if (arg.value.type === 'Identifier') {
          inVar = arg.value.name;
        }
      } else if (arg.type === 'Identifier') {
        inVar = arg.name;
      }
    }

    return AlgebraicSimplifier.simplify(exprArg, inVar, currentEnv);
  }

  private evalDimension(node: FunctionCallNode, _currentEnv: Environment): Value {
    if (node.args.length === 0) {
      throw createError('dimension() expects 1 expression argument', node.span);
    }
    const exprNode = node.args[0];
    try {
      const res = inferExpressionDimensions(exprNode);
      return {
        type: 'dimension',
        degrees: res.degrees,
        totalDegree: res.totalDegree,
        interpretation: res.interpretation,
        isDimensionless: res.isDimensionless,
      };
    } catch (err: any) {
      return makeUnknown('requires-unavailable-theory', err.message || String(err));
    }
  }

  private evalCheck(node: FunctionCallNode, _currentEnv: Environment): Value {
    if (node.args.length === 0) {
      throw createError('check() expects at least 1 expression argument and an is: "quantity" target', node.span);
    }

    const exprNode = node.args[0];
    let quantityName = 'sphere volume';

    for (let i = 1; i < node.args.length; i++) {
      const arg = node.args[i];
      if (arg.type === 'NamedArg' && arg.name === 'is') {
        if (arg.value.type === 'StringLiteral') {
          quantityName = arg.value.value;
        } else if (arg.value.type === 'Identifier') {
          quantityName = arg.value.name;
        }
      } else if (arg.type === 'StringLiteral') {
        quantityName = arg.value;
      }
    }

    try {
      const checkRes = checkGeometricQuantity(exprNode, quantityName);
      return {
        type: 'check_result',
        isValid: checkRes.isValid,
        targetQuantity: checkRes.targetQuantity.name,
        actualDimension: checkRes.actualDimension,
        actualInterpretation: checkRes.actualInterpretation,
        actualCoeff: checkRes.actualCoeff,
        messageLines: checkRes.messageLines,
        derivationSteps: checkRes.derivationSteps,
        actualExprString: checkRes.actualExprString,
      };
    } catch (err: any) {
      return makeUnknown('requires-unavailable-theory', err.message || String(err));
    }
  }

  private evalGraph(node: FunctionCallNode, currentEnv: Environment): GraphValue {
    if (node.args.length === 0) {
      throw createError('graph() requires at least one argument', node.span);
    }

    // Check if plotting an orbit or list directly: graph(orbit)
    if (node.args.length === 1) {
      const firstArg = node.args[0];
      if (firstArg.type === 'Identifier' && firstArg.name in currentEnv) {
        const val = currentEnv[firstArg.name];
        if (val.type === 'list') {
          const orbitNums: number[] = val.elements.map(e => valueToNumber(e, firstArg.span));
          const spec: GraphSpec = {
            dimensionality: 1,
            kind: 'orbit',
            series: [{ expr: firstArg, variable: 'index', label: firstArg.name }],
            domain: { var: 'index', min: 0, max: orbitNums.length - 1, isDefault: false },
            orbitData: orbitNums,
          };
          return { type: 'graph', spec };
        }
      }
    }

    const exprArgs: ASTNode[] = [];
    const ranges: RangeNode[] = [];

    for (const arg of node.args) {
      if (arg.type === 'Range') {
        ranges.push(arg);
      } else {
        exprArgs.push(arg);
      }
    }

    // Trajectory plots: graph(traj1, traj2, ...)
    const evaluatedArgs = exprArgs.map(expr => {
      try {
        return this.evalNode(expr, currentEnv);
      } catch {
        return null;
      }
    });

    if (evaluatedArgs.length > 0 && evaluatedArgs.every(v => v && v.type === 'trajectory')) {
      const trajs = evaluatedArgs as TrajectoryValue[];
      let tMin = Infinity;
      let tMax = -Infinity;
      const seriesList: CurveSeries[] = [];

      for (let i = 0; i < trajs.length; i++) {
        const traj = trajs[i];
        if (traj.tStart < tMin) tMin = traj.tStart;
        if (traj.tEnd > tMax) tMax = traj.tEnd;
        const pts = traj.samples.map(s => {
          const y = valueToNumber(s.state);
          return { x: s.t, y, valid: isFinite(y) };
        });
        seriesList.push({
          expr: exprArgs[i],
          variable: 't',
          label: formatAST(exprArgs[i]),
          explicitPoints: pts,
        });
      }

      const spec: GraphSpec = {
        dimensionality: 1,
        kind: seriesList.length > 1 ? 'multi_curve' : 'curve',
        series: seriesList,
        domain: { var: 't', min: isFinite(tMin) ? tMin : 0, max: isFinite(tMax) ? tMax : 10, isDefault: false },
      };
      return { type: 'graph', spec };
    }

    // Parametric plot: graph((cos t, sin t), t in 0..tau) or graph((x(u,v), y(u,v), z(u,v)), u in 0..tau, v in 0..tau)
    if (exprArgs.length === 1 && exprArgs[0].type === 'Tuple') {
      const tuple = exprArgs[0];
      if (tuple.elements.length === 3) {
        const xExpr = tuple.elements[0];
        const yExpr = tuple.elements[1];
        const zExpr = tuple.elements[2];
        const rU = ranges[0];
        const rV = ranges[1];
        const paramU = rU ? rU.variable : 'u';
        const paramV = rV ? rV.variable : 'v';
        const minU = rU ? valueToNumber(this.evalNode(rU.start, currentEnv), rU.start.span) : 0;
        const maxU = rU ? valueToNumber(this.evalNode(rU.end, currentEnv), rU.end.span) : 2 * Math.PI;
        const minV = rV ? valueToNumber(this.evalNode(rV.start, currentEnv), rV.start.span) : 0;
        const maxV = rV ? valueToNumber(this.evalNode(rV.end, currentEnv), rV.end.span) : 2 * Math.PI;

        const spec: GraphSpec = {
          dimensionality: 2,
          kind: 'parametric',
          series: [],
          domain: { var: paramU, min: minU, max: maxU, isDefault: !rU },
          domainY: { var: paramV, min: minV, max: maxV, isDefault: !rV },
          parametric: {
            xExpr,
            yExpr,
            zExpr,
            param: paramU,
            paramV,
            min: minU,
            max: maxU,
            minV,
            maxV,
          },
        };
        return { type: 'graph', spec };
      }

      if (tuple.elements.length !== 2) {
        throw createError('Parametric curve requires a 2D tuple (x(t), y(t)) or 3D tuple (x(u,v), y(u,v), z(u,v))', tuple.span);
      }

      const xExpr = tuple.elements[0];
      const yExpr = tuple.elements[1];
      const xAnalysis = analyzeAST(xExpr, currentEnv, new Set(), this.source);
      const yAnalysis = analyzeAST(yExpr, currentEnv, new Set(), this.source);
      const paramVars = Array.from(new Set([...xAnalysis.freeVariables, ...yAnalysis.freeVariables]));

      let paramName = paramVars[0] ?? 't';
      let min = 0;
      let max = 2 * Math.PI;
      let isDefault = true;
      let step: number | undefined;

      if (ranges.length > 0) {
        const r = ranges[0];
        paramName = r.variable;
        min = valueToNumber(this.evalNode(r.start, currentEnv), r.start.span);
        max = valueToNumber(this.evalNode(r.end, currentEnv), r.end.span);
        if (r.step) step = valueToNumber(this.evalNode(r.step, currentEnv), r.step.span);
        isDefault = false;
      }

      const spec: GraphSpec = {
        dimensionality: 1,
        kind: 'parametric',
        series: [],
        domain: { var: paramName, min, max, isDefault, step },
        parametric: { xExpr, yExpr, param: paramName, min, max, step },
      };

      return { type: 'graph', spec };
    }

    const domainVarSet = new Set<string>();
    const allFreeVars = new Set<string>();
    for (const r of ranges) {
      domainVarSet.add(r.variable);
      allFreeVars.add(r.variable);
    }

    const seriesList: CurveSeries[] = [];

    for (const expr of exprArgs) {
      const analysis = analyzeAST(expr, currentEnv, domainVarSet, this.source);
      for (const fv of analysis.freeVariables) {
        allFreeVars.add(fv);
      }
      const label = formatAST(expr);
      seriesList.push({
        expr,
        variable: Array.from(domainVarSet)[0] ?? analysis.freeVariables[0] ?? 'x',
        label,
      });
    }

    const freeVarArray = Array.from(allFreeVars);

    if (freeVarArray.length === 0) {
      throw createError('graph() requires at least one free variable to plot against, found 0', node.span);
    }

    // 2D scalar field heatmap / surface: graph(sin x cos y) or graph(s1, s2, x in ..., y in ...)
    if (exprArgs.length >= 1 && freeVarArray.length === 2) {
      const varX = freeVarArray[0];
      const varY = freeVarArray[1];
      let xMin = -10, xMax = 10, yMin = -10, yMax = 10;
      let isDefaultX = true, isDefaultY = true;

      for (const r of ranges) {
        if (r.variable === varX) {
          xMin = valueToNumber(this.evalNode(r.start, currentEnv), r.start.span);
          xMax = valueToNumber(this.evalNode(r.end, currentEnv), r.end.span);
          isDefaultX = false;
        } else if (r.variable === varY) {
          yMin = valueToNumber(this.evalNode(r.start, currentEnv), r.start.span);
          yMax = valueToNumber(this.evalNode(r.end, currentEnv), r.end.span);
          isDefaultY = false;
        }
      }

      const surfaces = exprArgs.map(expr => ({
        expr,
        varX,
        varY,
        xMin,
        xMax,
        yMin,
        yMax,
      }));

      const spec: GraphSpec = {
        dimensionality: 2,
        kind: exprArgs.length === 1 ? 'heatmap' : 'surface',
        series: seriesList,
        domain: { var: varX, min: xMin, max: xMax, isDefault: isDefaultX },
        domainY: { var: varY, min: yMin, max: yMax, isDefault: isDefaultY },
        surface: surfaces[0],
        surfaces,
      };

      return { type: 'graph', spec };
    }

    // 1D curves
    let domainVar = freeVarArray[0];
    let min = -10;
    let max = 10;
    let isDefault = true;
    let step: number | undefined;

    if (ranges.length > 0) {
      const r = ranges[0];
      domainVar = r.variable;
      min = valueToNumber(this.evalNode(r.start, currentEnv), r.start.span);
      max = valueToNumber(this.evalNode(r.end, currentEnv), r.end.span);
      if (r.step) step = valueToNumber(this.evalNode(r.step, currentEnv), r.step.span);
      isDefault = false;
    }

    let sharedAxisNote: string | undefined;
    if (freeVarArray.length > 1) {
      const varNames = freeVarArray.map(v => `'${v}'`).join(', ');
      sharedAxisNote = `Note: Variables ${varNames} were each mapped to the same horizontal axis.`;
    }

    const spec: GraphSpec = {
      dimensionality: 1,
      kind: seriesList.length > 1 ? 'multi_curve' : 'curve',
      series: seriesList,
      domain: { var: domainVar, min, max, isDefault, step },
      sharedAxisNote,
    };

    return { type: 'graph', spec };
  }

  private isTruthy(val: Value): boolean {
    if (val.type === 'boolean') return val.value;
    if (val.type === 'none') return false;
    if (val.type === 'rational') return val.n !== 0n;
    if (val.type === 'float') return val.value !== 0 && !isNaN(val.value);
    return true;
  }

  private serializeValueForMemo(v: Value): string {
    if (v.type === 'rational') return `${v.n}/${v.d}`;
    if (v.type === 'float') return `${v.value}`;
    if (v.type === 'boolean') return `${v.value}`;
    if (v.type === 'none') return 'none';
    if (v.type === 'string') return `"${v.value}"`;
    if (v.type === 'tuple') return `(${v.elements.map(e => this.serializeValueForMemo(e)).join(',')})`;
    if (v.type === 'list') return `[${v.elements.map(e => this.serializeValueForMemo(e)).join(',')}]`;
    if (v.type === 'record') {
      const fieldKeys = Object.keys(v.fields).sort();
      return `record:${v.typeName}{${fieldKeys.map(k => `${k}:${this.serializeValueForMemo(v.fields[k])}`).join(',')}}`;
    }
    if (v.type === 'quantity') {
      return `quantity(${this.serializeValueForMemo(v.magnitude)},${v.unit})`;
    }
    return Math.random().toString();
  }

  public inferKindOfAST(ast: ASTNode, env: Environment): MathKind {
    switch (ast.type) {
      case 'NumberLiteral':
        return ast.raw.includes('.') ? { name: 'Scalar', subtype: 'real' } : { name: 'Scalar', subtype: 'integer' };
      case 'StringLiteral':
        return { name: 'Scalar', subtype: 'real' };
      case 'Identifier': {
        if (ast.name === 'R' || ast.name === 'Reals' || ast.name === '\u211d') return { name: 'Set', elementKind: { name: 'Scalar', subtype: 'real' }, standardName: '\u211d', isInfinite: true };
        if (ast.name === 'C' || ast.name === 'Complexes' || ast.name === '\u2102') return { name: 'Set', elementKind: { name: 'Scalar', subtype: 'complex' }, standardName: '\u2102', isInfinite: true };
        if (ast.name === 'Z' || ast.name === 'Integers' || ast.name === '\u2124') return { name: 'Set', elementKind: { name: 'Scalar', subtype: 'integer' }, standardName: '\u2124', isInfinite: true };
        if (ast.name === 'Q' || ast.name === 'Rationals' || ast.name === '\u211a') return { name: 'Set', elementKind: { name: 'Scalar', subtype: 'rational' }, standardName: '\u211a', isInfinite: true };
        if (ast.name === 'N' || ast.name === 'Naturals' || ast.name === '\u2115') return { name: 'Set', elementKind: { name: 'Scalar', subtype: 'natural' }, standardName: '\u2115', isInfinite: true };
        if (ast.name in env) return inferKindOfValue(env[ast.name]);
        return { name: 'Scalar', subtype: 'real' };
      }
      case 'Tuple':
      case 'List':
        return { name: 'Vector', dimension: ast.elements.length, baseField: 'R' };
      case 'Range':
        return { name: 'Interval', boundaryType: 'closed' };
      case 'Lambda':
      case 'FunctionDef':
        return {
          name: 'Function',
          domain: { name: 'Scalar', subtype: 'real' },
          codomain: { name: 'Scalar', subtype: 'real' },
        };
      case 'Diff':
        return {
          name: 'Function',
          domain: { name: 'Scalar', subtype: 'real' },
          codomain: { name: 'Scalar', subtype: 'real' },
        };
      case 'BigOp':
      case 'Limit':
      case 'RegionIntegral':
      case 'Probability':
      case 'DecoratedIdentifier':
        return { name: 'Scalar', subtype: 'real' };
      case 'NablaOp':
        return ast.op === 'grad' || ast.op === 'curl'
          ? { name: 'VectorField', domain: 'R^3', dimension: 3 }
          : { name: 'ScalarField', domain: 'R^3' };
      case 'DifferentialFormOp':
        return { name: 'DifferentialForm', degree: ast.op === 'wedge' ? 2 : 1, manifold: 'R^3' };
      case 'TensorOp':
        return { name: 'Group', structureName: 'Module', carrierSet: 'V', axioms: [] };
      case 'BracketOp':
        if (ast.op === 'card') return { name: 'Scalar', subtype: 'natural' };
        return { name: 'Scalar', subtype: 'real' };
      case 'SetBuilder':
        return { name: 'Set', elementKind: { name: 'Scalar', subtype: 'real' }, isInfinite: true };
      case 'SetOp':
        if (ast.op === 'in' || ast.op === 'notin' || ast.op === 'subset' || ast.op === 'subseteq') {
          return { name: 'Scalar', subtype: 'natural' };
        }
        return { name: 'Set', elementKind: { name: 'Scalar', subtype: 'real' } };
      case 'MatrixPostfix':
        return { name: 'Matrix', rows: 3, cols: 3, baseField: 'R' };
      case 'Quantifier':
      case 'Equivalence':
        return { name: 'UnknownKind' };
      default:
        return { name: 'Scalar', subtype: 'real' };
    }
  }
}

export function evaluate(
  source: string,
  env: Environment = createInitialEnvironment(),
  budget: BudgetTracker = new BudgetTracker()
): { ast: ASTNode; value: Value } {
  const ast = analyzeAndParse(source, env);
  const evaluator = new Evaluator(env, source, budget);
  try {
    const value = evaluator.evaluate(ast);
    return { ast, value };
  } catch (err) {
    if (err instanceof BudgetExhaustedError) {
      return { ast, value: makeUnknown(err.reason, err.detail) };
    }
    throw err;
  }
}

export function analyzeAndParse(source: string, env: Environment): ASTNode {
  const knownFuncs = new Set<string>();
  const knownVars = new Set<string>();

  for (const [key, val] of Object.entries(env)) {
    if (val.type === 'function' || val.type === 'builtin' || val.type === 'lambda' || val.type === 'record_constructor') {
      knownFuncs.add(key);
    } else {
      knownVars.add(key);
    }
  }

  return parse(source, { knownFunctions: knownFuncs, knownVariables: knownVars, source });
}

Evaluator.initVirtualFiles();
