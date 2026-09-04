import { ASTNode, Environment, FunctionValue, LambdaValue, NumberLiteralNode } from './types';
import { FLOAT_CONSTANTS } from './numeric/float';

export type NumericCompiledFn = (...args: number[]) => number;

export interface CompileSuccess {
  success: true;
  fn: NumericCompiledFn;
  code: string;
  variables: string[];
}

export interface CompileFailure {
  success: false;
  uncompilableNode: string;
  reason: string;
  variables: string[];
}

export type CompileResult = CompileSuccess | CompileFailure;

// Built-in transcendental and mathematical function code generators
const BUILTIN_MATH_GENERATORS: Record<string, (argExprs: string[]) => string | null> = {
  sin: args => args.length === 1 ? `Math.sin(${args[0]})` : null,
  cos: args => args.length === 1 ? `Math.cos(${args[0]})` : null,
  tan: args => args.length === 1 ? `Math.tan(${args[0]})` : null,
  asin: args => args.length === 1 ? `Math.asin(${args[0]})` : null,
  acos: args => args.length === 1 ? `Math.acos(${args[0]})` : null,
  atan: args => args.length === 1 ? `Math.atan(${args[0]})` : null,
  sinh: args => args.length === 1 ? `Math.sinh(${args[0]})` : null,
  cosh: args => args.length === 1 ? `Math.cosh(${args[0]})` : null,
  tanh: args => args.length === 1 ? `Math.tanh(${args[0]})` : null,
  exp: args => args.length === 1 ? `Math.exp(${args[0]})` : null,
  ln: args => args.length === 1 ? `Math.log(${args[0]})` : null,
  log: args => {
    if (args.length === 1) return `Math.log10(${args[0]})`;
    if (args.length === 2) return `(Math.log(${args[0]}) / Math.log(${args[1]}))`;
    return null;
  },
  log2: args => args.length === 1 ? `Math.log2(${args[0]})` : null,
  sqrt: args => args.length === 1 ? `Math.sqrt(${args[0]})` : null,
  abs: args => args.length === 1 ? `Math.abs(${args[0]})` : null,
  floor: args => args.length === 1 ? `Math.floor(${args[0]})` : null,
  ceil: args => args.length === 1 ? `Math.ceil(${args[0]})` : null,
  round: args => args.length === 1 ? `Math.round(${args[0]})` : null,
  min: args => args.length >= 1 ? `Math.min(${args.join(', ')})` : null,
  max: args => args.length >= 1 ? `Math.max(${args.join(', ')})` : null,
};

// Compilation cache keyed by AST node identity and joined variable list
const nodeCache = new WeakMap<ASTNode, Map<string, CompileResult>>();

interface CompilerContext {
  varMap: Map<string, string>; // Maps mathematical variable names to safe JS parameter identifiers
  env?: Environment;
  depth: number;
  userFnCallStack: Set<string>;
}

function sanitizeIdentifier(name: string, index: number): string {
  const clean = name.replace(/[^a-zA-Z0-9_$]/g, '_');
  return `_${clean}_${index}`;
}

type NodeGenResult = { success: true; code: string } | { success: false; uncompilableNode: string; reason: string };

function compileNode(
  node: ASTNode,
  ctx: CompilerContext,
  isTopLevel: boolean = false
): NodeGenResult {
  if (ctx.depth > 200) {
    return {
      success: false,
      uncompilableNode: node.type,
      reason: 'Recursion depth exceeded during expression compilation',
    };
  }

  switch (node.type) {
    case 'NumberLiteral': {
      const rawStr = (node as NumberLiteralNode).raw;
      const num = Number(rawStr);
      if (Number.isNaN(num)) {
        return { success: false, uncompilableNode: 'NumberLiteral', reason: `Invalid numeric literal: ${rawStr}` };
      }
      return { success: true, code: Number.isFinite(num) ? num.toString() : 'NaN' };
    }

    case 'StringLiteral': {
      return {
        success: false,
        uncompilableNode: 'StringLiteral',
        reason: `String literals cannot be evaluated in numeric compiled closures: "${node.value}"`,
      };
    }

    case 'Identifier': {
      const name = node.name;

      // 1. Check if it is one of the free variables of the space
      if (ctx.varMap.has(name)) {
        return { success: true, code: ctx.varMap.get(name)! };
      }

      // 2. Check standard mathematical constants
      if (name in FLOAT_CONSTANTS) {
        if (name === 'pi') return { success: true, code: 'Math.PI' };
        if (name === 'e') return { success: true, code: 'Math.E' };
        if (name === 'tau') return { success: true, code: '(2 * Math.PI)' };
        if (name === 'phi') return { success: true, code: '((1 + Math.sqrt(5)) / 2)' };
        return { success: true, code: FLOAT_CONSTANTS[name].toString() };
      }

      // 3. Check boolean literals
      if (name === 'true') return { success: true, code: '1' };
      if (name === 'false') return { success: true, code: '0' };

      // 4. Check environment for constant scalar bindings
      if (ctx.env && name in ctx.env) {
        const val = ctx.env[name];
        if (val.type === 'float') {
          return { success: true, code: val.value.toString() };
        }
        if (val.type === 'rational') {
          const num = Number(val.n) / Number(val.d);
          return { success: true, code: num.toString() };
        }
        if (val.type === 'boolean') {
          return { success: true, code: val.value ? '1' : '0' };
        }
        return {
          success: false,
          uncompilableNode: 'Identifier',
          reason: `Identifier '${name}' is bound to non-scalar value of type '${val.type}'`,
        };
      }

      return {
        success: false,
        uncompilableNode: 'Identifier',
        reason: `Unbound variable or identifier '${name}' is not in free variable list or environment`,
      };
    }

    case 'UnaryOp': {
      const operandRes = compileNode(node.operand, { ...ctx, depth: ctx.depth + 1 });
      if (!operandRes.success) return operandRes;

      switch (node.op) {
        case '-':
          return { success: true, code: `(-(${operandRes.code}))` };
        case '+':
          return { success: true, code: `(+(${operandRes.code}))` };
        case 'not':
          return { success: true, code: `((${operandRes.code}) === 0 ? 1 : 0)` };
        case '\u221a':
          return { success: true, code: `Math.sqrt(${operandRes.code})` };
        default:
          return {
            success: false,
            uncompilableNode: 'UnaryOp',
            reason: `Unsupported unary operator '${node.op}'`,
          };
      }
    }

    case 'BinaryOp': {
      // Check for implicit function application e.g. f(x) or f x parsed as implicit multiplication
      if (node.op === '*' && node.isImplicit && node.left.type === 'Identifier') {
        const callee = node.left.name;
        if (ctx.env && callee in ctx.env) {
          const val = ctx.env[callee];
          if (val.type === 'function' || val.type === 'lambda') {
            return compileFunctionCall(callee, [node.right], ctx);
          }
        }
      }

      const leftRes = compileNode(node.left, { ...ctx, depth: ctx.depth + 1 });
      if (!leftRes.success) return leftRes;
      const rightRes = compileNode(node.right, { ...ctx, depth: ctx.depth + 1 });
      if (!rightRes.success) return rightRes;

      const op = node.op;

      // Arithmetic
      if (op === '+') return { success: true, code: `((${leftRes.code}) + (${rightRes.code}))` };
      if (op === '-') return { success: true, code: `((${leftRes.code}) - (${rightRes.code}))` };
      if (op === '*') return { success: true, code: `((${leftRes.code}) * (${rightRes.code}))` };
      if (op === '/' || op === '//') return { success: true, code: `((${leftRes.code}) / (${rightRes.code}))` };
      if (op === '%') return { success: true, code: `((${leftRes.code}) % (${rightRes.code}))` };
      if (op === '^') return { success: true, code: `Math.pow(${leftRes.code}, ${rightRes.code})` };

      // Top-level relation equation L = R compiles to difference (L - R) for zero level-set finding
      if (isTopLevel && op === '=') {
        return { success: true, code: `((${leftRes.code}) - (${rightRes.code}))` };
      }

      // Comparisons (returning 1 for true, 0 for false)
      if (op === '=' || op === '==') return { success: true, code: `((${leftRes.code}) === (${rightRes.code}) ? 1 : 0)` };
      if (op === '!=' || op === '\u2260') return { success: true, code: `((${leftRes.code}) !== (${rightRes.code}) ? 1 : 0)` };
      if (op === '<') return { success: true, code: `((${leftRes.code}) < (${rightRes.code}) ? 1 : 0)` };
      if (op === '<=' || op === '\u2264') return { success: true, code: `((${leftRes.code}) <= (${rightRes.code}) ? 1 : 0)` };
      if (op === '>') return { success: true, code: `((${leftRes.code}) > (${rightRes.code}) ? 1 : 0)` };
      if (op === '>=' || op === '\u2265') return { success: true, code: `((${leftRes.code}) >= (${rightRes.code}) ? 1 : 0)` };

      // Boolean logic
      if (op === 'and') return { success: true, code: `(((${leftRes.code}) !== 0 && (${rightRes.code}) !== 0) ? 1 : 0)` };
      if (op === 'or') return { success: true, code: `(((${leftRes.code}) !== 0 || (${rightRes.code}) !== 0) ? 1 : 0)` };

      return {
        success: false,
        uncompilableNode: 'BinaryOp',
        reason: `Unsupported binary operator '${op}' in numeric compiled closure`,
      };
    }

    case 'If': {
      const condRes = compileNode(node.condition, { ...ctx, depth: ctx.depth + 1 });
      if (!condRes.success) return condRes;
      const thenRes = compileNode(node.thenBranch, { ...ctx, depth: ctx.depth + 1 });
      if (!thenRes.success) return thenRes;
      const elseRes = compileNode(node.elseBranch, { ...ctx, depth: ctx.depth + 1 });
      if (!elseRes.success) return elseRes;

      return {
        success: true,
        code: `((${condRes.code}) !== 0 ? (${thenRes.code}) : (${elseRes.code}))`,
      };
    }

    case 'FunctionCall': {
      return compileFunctionCall(node.callee, node.args, ctx);
    }

    case 'Block': {
      // Single expression block or block with statements ending in expression
      if (node.statements.length === 0) {
        return { success: false, uncompilableNode: 'Block', reason: 'Empty block cannot be compiled to numeric value' };
      }
      const lastStmt = node.statements[node.statements.length - 1];
      return compileNode(lastStmt, { ...ctx, depth: ctx.depth + 1 }, isTopLevel);
    }

    // Explicitly uncompilable nodes:
    case 'Diff':
    case 'BigOp':
    case 'Limit':
    case 'RegionIntegral':
    case 'NablaOp':
    case 'DifferentialFormOp':
    case 'TensorOp':
    case 'MatrixPostfix':
    case 'RecordDef':
    case 'RecordWith':
    case 'DimensionDecl':
    case 'UnitDecl':
    case 'OperatorDecl':
    case 'KindDecl':
    case 'RuleDecl':
    case 'ModuleDecl':
    case 'Import':
    case 'Export':
    case 'ViewDecl':
    case 'Claim':
    case 'Tuple':
    case 'List':
    case 'SetBuilder':
    case 'SetOp':
    default: {
      return {
        success: false,
        uncompilableNode: node.type,
        reason: `Node type '${node.type}' is non-scalar or contains symbolic/side-effect operations and cannot be compiled to a numeric closure`,
      };
    }
  }
}

function compileFunctionCall(callee: string, args: ASTNode[], ctx: CompilerContext): NodeGenResult {
  // 1. Compile arguments
  const argCodes: string[] = [];
  for (const arg of args) {
    const argRes = compileNode(arg, { ...ctx, depth: ctx.depth + 1 });
    if (!argRes.success) return argRes;
    argCodes.push(argRes.code);
  }

  // 2. Check built-in mathematical functions
  if (callee in BUILTIN_MATH_GENERATORS) {
    const gen = BUILTIN_MATH_GENERATORS[callee];
    const code = gen(argCodes);
    if (code !== null) {
      return { success: true, code };
    }
    return {
      success: false,
      uncompilableNode: 'FunctionCall',
      reason: `Built-in function '${callee}' received incorrect number of arguments (${argCodes.length})`,
    };
  }

  // 3. Check user-defined functions or lambdas in environment
  if (ctx.env && callee in ctx.env) {
    const fnVal = ctx.env[callee];
    if (fnVal.type === 'function' || fnVal.type === 'lambda') {
      if (ctx.userFnCallStack.has(callee)) {
        return {
          success: false,
          uncompilableNode: 'FunctionCall',
          reason: `Recursive user function call '${callee}' cannot be inlined into static closure`,
        };
      }

      const userFn = fnVal as FunctionValue | LambdaValue;
      if (userFn.params.length !== argCodes.length) {
        return {
          success: false,
          uncompilableNode: 'FunctionCall',
          reason: `User function '${callee}' expects ${userFn.params.length} arguments, got ${argCodes.length}`,
        };
      }

      // Build nested context with mapped parameters
      const nestedVarMap = new Map<string, string>();
      const paramBindings: string[] = [];
      for (let i = 0; i < userFn.params.length; i++) {
        const paramName = userFn.params[i];
        const paramId = `_p_${callee}_${i}_${ctx.depth}`;
        nestedVarMap.set(paramName, paramId);
        paramBindings.push(`const ${paramId} = ${argCodes[i]};`);
      }

      const nestedCallStack = new Set(ctx.userFnCallStack);
      nestedCallStack.add(callee);

      const bodyRes = compileNode(
        userFn.body,
        {
          varMap: nestedVarMap,
          env: { ...ctx.env, ...userFn.closure },
          depth: ctx.depth + 1,
          userFnCallStack: nestedCallStack,
        },
        false
      );

      if (!bodyRes.success) return bodyRes;

      return {
        success: true,
        code: `((() => { ${paramBindings.join(' ')} return ${bodyRes.code}; })())`,
      };
    }
  }

  return {
    success: false,
    uncompilableNode: 'FunctionCall',
    reason: `Function '${callee}' is not a compilable math built-in or scalar user function`,
  };
}

/**
 * Compiles an AST node into a high-throughput numeric JavaScript closure:
 *   (x1, ..., xn) => number
 *
 * @param ast The mathematical expression or relation AST
 * @param vars The ordered list of free variables corresponding to the function arguments
 * @param env Optional lexical environment for resolving scalar constants and user-defined functions
 * @returns CompileResult (CompileSuccess with compiled closure, or CompileFailure naming the uncompilable node)
 */
export function compileRelation(
  ast: ASTNode,
  vars: string[],
  env?: Environment
): CompileResult {
  // Check cache
  const cacheKey = vars.join(',');
  let cachedMap = nodeCache.get(ast);
  if (cachedMap && cachedMap.has(cacheKey)) {
    return cachedMap.get(cacheKey)!;
  }

  // Build variable mapping
  const varMap = new Map<string, string>();
  const sanitizedParams: string[] = [];

  for (let i = 0; i < vars.length; i++) {
    const varName = vars[i];
    const paramId = sanitizeIdentifier(varName, i);
    varMap.set(varName, paramId);
    sanitizedParams.push(paramId);
  }

  const ctx: CompilerContext = {
    varMap,
    env,
    depth: 0,
    userFnCallStack: new Set(),
  };

  const genResult = compileNode(ast, ctx, true);

  let result: CompileResult;

  if (!genResult.success) {
    result = {
      success: false,
      uncompilableNode: genResult.uncompilableNode,
      reason: genResult.reason,
      variables: vars,
    };
  } else {
    try {
      const code = `return (${genResult.code});`;
      // Create new Function with positional parameter arguments
      const fn = new Function(...sanitizedParams, code) as NumericCompiledFn;

      result = {
        success: true,
        fn,
        code,
        variables: vars,
      };
    } catch (err: any) {
      result = {
        success: false,
        uncompilableNode: ast.type,
        reason: `JavaScript code generation error: ${err.message || String(err)}`,
        variables: vars,
      };
    }
  }

  // Store in cache
  if (!cachedMap) {
    cachedMap = new Map();
    nodeCache.set(ast, cachedMap);
  }
  cachedMap.set(cacheKey, result);

  return result;
}
