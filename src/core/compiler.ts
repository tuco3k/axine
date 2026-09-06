import { ASTNode, Environment, FunctionValue, LambdaValue, NumberLiteralNode } from './types';
import { OPERATIONS, REAL_HELPERS_CODE } from './operations';

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

      // 3. Check boolean literals
      if (name === 'true') return { success: true, code: '1' };
      if (name === 'false') return { success: true, code: '0' };

      // 4. Check environment for constant scalar bindings
      const cleanName = name.replace(/^:/, '');
      if (ctx.env && (name in ctx.env || cleanName in ctx.env)) {
        const val = ctx.env[name] !== undefined ? ctx.env[name] : ctx.env[cleanName];
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

    case 'Assignment': {
      const targetCode = ctx.varMap.get(node.target) || node.target;
      const valueRes = compileNode(node.value, { ...ctx, depth: ctx.depth + 1 });
      if (!valueRes.success) return valueRes;
      return {
        success: true,
        code: `((${targetCode}) - (${valueRes.code}))`,
      };
    }

    case 'UnaryOp': {
      const operandRes = compileNode(node.operand, { ...ctx, depth: ctx.depth + 1 });
      if (!operandRes.success) return operandRes;

      if (node.op === '-' && OPERATIONS['neg']) {
        return { success: true, code: OPERATIONS['neg'].compileJS([operandRes.code]) };
      }
      if (node.op === '+' && OPERATIONS['pos']) {
        return { success: true, code: OPERATIONS['pos'].compileJS([operandRes.code]) };
      }
      if (node.op === 'not' && OPERATIONS['not']) {
        return { success: true, code: OPERATIONS['not'].compileJS([operandRes.code]) };
      }
      if (node.op === '\u221a' || node.op === 'sqrt') {
        return compileFunctionCall(':sqrt', [node.operand], ctx);
      }
      return {
        success: false,
        uncompilableNode: 'UnaryOp',
        reason: `Unsupported unary operator '${node.op}'`,
      };
    }

    case 'PostfixOp': {
      const operandRes = compileNode(node.operand, { ...ctx, depth: ctx.depth + 1 });
      if (!operandRes.success) return operandRes;
      if (node.op in OPERATIONS && OPERATIONS[node.op].kind === 'postfix') {
        return { success: true, code: OPERATIONS[node.op].compileJS([operandRes.code]) };
      }
      return {
        success: false,
        uncompilableNode: 'PostfixOp',
        reason: `Unsupported postfix operator '${node.op}' in numeric compiled closure`,
      };
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
          if ((val as any).type === 'forall_rule') {
            const rule = val as any;
            const param = rule.param;
            const body = rule.body;
            const argRes = compileNode(node.right, { ...ctx, depth: ctx.depth + 1 });
            if (!argRes.success) return argRes;
            const innerCtx: CompilerContext = {
              ...ctx,
              depth: ctx.depth + 1,
              varMap: new Map(ctx.varMap),
            };
            innerCtx.varMap.set(param, `(${argRes.code})`);
            return compileNode(body, innerCtx);
          }
        }
      }

      const leftRes = compileNode(node.left, { ...ctx, depth: ctx.depth + 1 });
      if (!leftRes.success) return leftRes;
      const rightRes = compileNode(node.right, { ...ctx, depth: ctx.depth + 1 });
      if (!rightRes.success) return rightRes;

      const op = node.op;

      // Top-level relation equation L = R compiles to difference (L - R) for zero level-set finding
      if (isTopLevel && op === '=') {
        return { success: true, code: `((${leftRes.code}) - (${rightRes.code}))` };
      }

      // Canonicalize symbols if needed
      const canonicalOp = op === '\u2260' ? '!=' : op === '\u2264' ? '<=' : op === '\u2265' ? '>=' : op;

      if (canonicalOp in OPERATIONS && OPERATIONS[canonicalOp].kind === 'binary') {
        return { success: true, code: OPERATIONS[canonicalOp].compileJS([leftRes.code, rightRes.code]) };
      }

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
      if (node.statements.length === 0) {
        return { success: false, uncompilableNode: 'Block', reason: 'Empty block cannot be compiled to numeric value' };
      }
      const stmtsCode: string[] = [];
      const currentVarMap = new Map(ctx.varMap);
      for (let i = 0; i < node.statements.length - 1; i++) {
        const stmt = node.statements[i];
        if (stmt.type === 'Assignment') {
          const valRes = compileNode(stmt.value, { ...ctx, varMap: currentVarMap, depth: ctx.depth + 1 }, false);
          if (!valRes.success) return valRes;
          const cleanVar = stmt.target.replace(/^:/, '');
          const varId = `_b_${cleanVar}_${i}_${ctx.depth}`;
          currentVarMap.set(stmt.target, varId);
          currentVarMap.set(cleanVar, varId);
          currentVarMap.set(':' + cleanVar, varId);
          stmtsCode.push(`const ${varId} = ${valRes.code};`);
        } else if (stmt.type === 'BinaryOp' && stmt.op === '=') {
          if (stmt.left.type === 'Identifier') {
            const valRes = compileNode(stmt.right, { ...ctx, varMap: currentVarMap, depth: ctx.depth + 1 }, false);
            if (!valRes.success) return valRes;
            const cleanVar = stmt.left.name.replace(/^:/, '');
            const varId = `_b_${cleanVar}_${i}_${ctx.depth}`;
            currentVarMap.set(stmt.left.name, varId);
            currentVarMap.set(cleanVar, varId);
            currentVarMap.set(':' + cleanVar, varId);
            stmtsCode.push(`const ${varId} = ${valRes.code};`);
          } else {
            const valRes = compileNode(stmt, { ...ctx, varMap: currentVarMap, depth: ctx.depth + 1 }, false);
            if (!valRes.success) return valRes;
            stmtsCode.push(`${valRes.code};`);
          }
        } else {
          const valRes = compileNode(stmt, { ...ctx, varMap: currentVarMap, depth: ctx.depth + 1 }, false);
          if (!valRes.success) return valRes;
          stmtsCode.push(`${valRes.code};`);
        }
      }

      const lastStmt = node.statements[node.statements.length - 1];
      const lastRes = compileNode(lastStmt, { ...ctx, varMap: currentVarMap, depth: ctx.depth + 1 }, false);
      if (!lastRes.success) return lastRes;

      if (stmtsCode.length === 0) {
        return lastRes;
      }

      return {
        success: true,
        code: `((() => { ${stmtsCode.join(' ')} return ${lastRes.code}; })())`,
      };
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

  // 2. Check built-in mathematical functions via OPERATIONS table
  const cleanCallee = callee.replace(/^:/, '');
  if (cleanCallee in OPERATIONS && OPERATIONS[cleanCallee].kind === 'function') {
    const op = OPERATIONS[cleanCallee];
    if (cleanCallee === 'log') {
      if (argCodes.length === 1 || argCodes.length === 2) {
        return { success: true, code: op.compileJS(argCodes) };
      }
      return {
        success: false,
        uncompilableNode: 'FunctionCall',
        reason: `Built-in function '${callee}' expects 1 or 2 arguments, got ${argCodes.length}`,
      };
    }
    if (cleanCallee === 'min' || cleanCallee === 'max') {
      if (argCodes.length >= 1) {
        return { success: true, code: op.compileJS(argCodes) };
      }
      return {
        success: false,
        uncompilableNode: 'FunctionCall',
        reason: `Built-in function '${callee}' expects at least 1 argument, got ${argCodes.length}`,
      };
    }
    if (argCodes.length === 1) {
      return { success: true, code: op.compileJS(argCodes) };
    }
    return {
      success: false,
      uncompilableNode: 'FunctionCall',
      reason: `Built-in function '${callee}' received incorrect number of arguments (${argCodes.length})`,
    };
  }

  // 3. Check user-defined functions or lambdas in environment
  if (ctx.env && (callee in ctx.env || cleanCallee in ctx.env)) {
    const fnVal = ctx.env[callee] !== undefined ? ctx.env[callee] : ctx.env[cleanCallee];
    if (fnVal.type === 'function' || fnVal.type === 'lambda') {
      if (ctx.userFnCallStack.has(callee) || ctx.userFnCallStack.has(cleanCallee)) {
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
        const cleanParam = paramName.replace(/^:/, '');
        const paramId = `_p_${cleanCallee}_${i}_${ctx.depth}`;
        nestedVarMap.set(paramName, paramId);
        nestedVarMap.set(cleanParam, paramId);
        nestedVarMap.set(':' + cleanParam, paramId);
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

    if ((fnVal as any).type === 'forall_rule') {
      const rule = fnVal as any;
      const params: string[] = rule.params || [rule.param];
      if (params.length !== argCodes.length) {
        if (cleanCallee === 'log' && params.length === 2 && argCodes.length === 1) {
          argCodes.push('10');
        } else {
          return {
            success: false,
            uncompilableNode: 'FunctionCall',
            reason: `Relation rule '${callee}' expects ${params.length} arguments, got ${argCodes.length}`,
          };
        }
      }

      if (ctx.userFnCallStack.has(callee) || ctx.userFnCallStack.has(cleanCallee)) {
        return {
          success: true,
          code: `NaN`,
        };
      }

      const nestedVarMap = new Map<string, string>();
      const paramBindings: string[] = [];
      for (let i = 0; i < params.length; i++) {
        const paramName = params[i];
        const cleanParam = paramName.replace(/^:/, '');
        const paramId = `_p_${cleanCallee}_${i}_${ctx.depth}`;
        nestedVarMap.set(paramName, paramId);
        nestedVarMap.set(cleanParam, paramId);
        nestedVarMap.set(':' + cleanParam, paramId);
        paramBindings.push(`const ${paramId} = ${argCodes[i]};`);
      }

      const nestedCallStack = new Set(ctx.userFnCallStack);
      nestedCallStack.add(callee);

      const bodyRes = compileNode(
        rule.body,
        {
          varMap: nestedVarMap,
          env: { ...ctx.env, ...rule.env },
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
      const fullCode = `${REAL_HELPERS_CODE}\n${code}`;
      // Create new Function with positional parameter arguments
      const fn = new Function(...sanitizedParams, fullCode) as NumericCompiledFn;

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

export const compileAST = compileRelation;
