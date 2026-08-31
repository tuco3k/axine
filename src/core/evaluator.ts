import {
  ASTNode,
  BigOpNode,
  BudgetLimits,
  ClaimNode,
  ClaimValue,
  CurveSeries,
  DEFAULT_BUDGET_LIMITS,
  DiffNode,
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
} from './types';
import { BigFraction } from './numeric/rational';
import {
  addValues,
  applyBuiltin,
  compareValues,
  divValues,
  factorialValue,
  makeNone,
  makeUnknown,
  modValues,
  mulValues,
  powValues,
  subValues,
  valueToNumber,
} from './numeric/tower';
import { FLOAT_CONSTANTS } from './numeric/float';
import { BUILTIN_FUNCTIONS, CONSTANTS, parse } from './parser';
import { analyzeAST } from './analyzer';
import { solveAlgebraic } from './algebra';
import { AlgebraicSimplifier } from './algebra/simplify';
import { createError } from './errors';
import { formatAST } from './formatter';
import { inferExpressionDimensions, checkGeometricQuantity } from './dimensional';
import { computeSymbolicDerivative } from './symbolic_diff';

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

export class Evaluator {
  private env: Environment;
  private source: string;
  private budget: BudgetTracker;
  private memo: Map<string, Value> = new Map();

  constructor(
    env: Environment = createInitialEnvironment(),
    source: string = '',
    budget: BudgetTracker = new BudgetTracker()
  ) {
    this.env = env;
    this.source = source;
    this.budget = budget;
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
        if (CONSTANTS.has(name)) {
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
        break;
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
        const operand = this.evalNode(node.operand, currentEnv);
        if (node.op === '!') {
          return factorialValue(operand, node.span);
        }
        if (node.op === 'superscript') {
          const exp = node.exponent ?? 2n;
          return powValues(operand, { type: 'rational', n: exp, d: 1n }, node.span);
        }
        break;
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
        const val = this.evalNode(node.value, currentEnv);
        currentEnv[node.target] = val;
        if (currentEnv === this.env) {
          this.env[node.target] = val;
        }
        return val;
      }
      case 'GlobalAssignment': {
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
      case 'Diff': {
        return this.evalDiff(node, currentEnv);
      }
      case 'Claim': {
        return this.evalClaim(node, currentEnv);
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
        throw createError(`Cannot index value of type ${targetVal.type}`, node.span);
      }
      case 'MemberAccess': {
        const targetVal = this.evalNode(node.target, currentEnv);
        const prop = node.property;
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
        return this.evalFunctionCall(node, currentEnv);
      }
      case 'NamedArg': {
        return this.evalNode(node.value, currentEnv);
      }
    }

    throw createError(`Cannot evaluate AST node`, node.span);
  }

  private evalFunctionCall(node: FunctionCallNode, currentEnv: Environment): Value {
    const callee = node.callee;

    if (callee === 'graph') {
      return this.evalGraph(node, currentEnv);
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

    // Check user defined function
    const calleeVal = currentEnv[callee] ?? this.env[callee];
    if (calleeVal) {
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

  private evalMap(node: FunctionCallNode, currentEnv: Environment): ListValue {
    if (node.args.length !== 2) throw createError('map(f, list) requires 2 arguments', node.span);
    const fnVal = this.evalNode(node.args[0], currentEnv);
    const listVal = this.evalNode(node.args[1], currentEnv);
    if (listVal.type !== 'list') throw createError('map expects a list as second argument', node.span);

    const elements: Value[] = [];
    for (const item of listVal.elements) {
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
    const startNum = valueToNumber(this.evalNode(node.start, currentEnv), node.start.span);
    const endNum = valueToNumber(this.evalNode(node.end, currentEnv), node.end.span);
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

  private evalDiff(node: DiffNode, currentEnv: Environment): Value {
    const varName = node.variable;

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
    if (v.type === 'tuple') return `(${v.elements.map(e => this.serializeValueForMemo(e)).join(',')})`;
    if (v.type === 'list') return `[${v.elements.map(e => this.serializeValueForMemo(e)).join(',')}]`;
    return 'obj';
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
    if (val.type === 'function' || val.type === 'builtin' || val.type === 'lambda') {
      knownFuncs.add(key);
    } else {
      knownVars.add(key);
    }
  }

  return parse(source, { knownFunctions: knownFuncs, knownVariables: knownVars, source });
}
