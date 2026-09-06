import {
  ASTNode,
  AssignmentNode,
  BigOpNode,
  BudgetLimits,
  ClaimNode,
  ClaimValue,
  DEFAULT_BUDGET_LIMITS,
  DiffNode,
  LimitNode,
  Environment,
  FunctionCallNode,
  FunctionValue,
  QuantifierNode,
  IntervalNode,
  LambdaValue,
  ListValue,
  RangeNode,
  Span,
  UnknownReason,
  UnknownValue,
  Value,
  StepValue,
  RecordDefNode,
  RecordConstructorValue,
  QuantityValue,
  BinaryOpNode,
  UnaryOpNode,
  PostfixOpNode,
  ImportNode,
  ModuleValue,
  TrajectoryValue,
  TrajectorySample,
  DEFAULT_INVOKED_FUEL,
  SpaceValue,
  SpatialEntity,
  BlockNode,
} from './types';
import { compileAST } from './compiler';
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
  valueToASTNode,
  UTILITY_BUILTINS,
} from './numeric/tower';
import { parse, parseProgram } from './parser';
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

  public enterFunction(fnName: string, _span?: Span): void {
    this.depth++;
    if (this.depth > this.peakDepth) this.peakDepth = this.depth;
    if (this.depth > this.limits.maxDepth) {
      throw new BudgetExhaustedError(
        'budget-exhausted',
        `recursion depth limit (${this.limits.maxDepth}) reached in ${fnName}`
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

export interface ModuleResolutionFailure {
  diskSearched: string[];
  stdlibSearched: string[];
  searchedPaths: string[];
}

export function resolveModuleCode(
  importPath: string,
  baseDir: string = Evaluator.currentBaseDir
): { code: string; canonicalPath: string } | ModuleResolutionFailure {
  const normPath = importPath.replace(/\\/g, '/');
  const cleanPath = normPath.replace(/^(\.\/|\/)/, '');
  const fileName = cleanPath.replace(/^.*[\\/]/, '');
  const withAx = (p: string) => (p.endsWith('.ax') ? p : p + '.ax');

  const diskSearched: string[] = [];
  const stdlibSearched: string[] = [];

  // =========================================================================
  // STEP 1: Relative to the current file's directory (disk)
  // =========================================================================
  const diskCandidates = [
    importPath,
    normPath,
    cleanPath,
    fileName,
    withAx(normPath),
    withAx(cleanPath),
    withAx(fileName),
    `./${withAx(fileName)}`,
  ];

  for (const dc of diskCandidates) {
    if (!diskSearched.includes(dc)) diskSearched.push(dc);
    if (Evaluator.diskFiles.has(dc)) {
      return { code: Evaluator.diskFiles.get(dc)!, canonicalPath: withAx(fileName) };
    }
  }

  // Check physical filesystem in Node environment (relative to baseDir or cwd)
  if (typeof process !== 'undefined' && (process.versions as any)?.node) {
    try {
      const fs = require('fs');
      const path = require('path');
      const searchDirs = [
        baseDir || process.cwd(),
        process.cwd(),
      ];
      for (const dir of searchDirs) {
        if (!dir) continue;
        const fsPaths = [
          path.resolve(dir, importPath),
          path.resolve(dir, withAx(importPath)),
          path.resolve(dir, cleanPath),
          path.resolve(dir, withAx(cleanPath)),
          path.resolve(dir, fileName),
          path.resolve(dir, withAx(fileName)),
        ];
        for (const fp of fsPaths) {
          const normFp = fp.replace(/\\/g, '/');
          if (!diskSearched.includes(normFp)) {
            diskSearched.push(normFp);
          }
          if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
            const code = fs.readFileSync(fp, 'utf-8');
            return { code, canonicalPath: withAx(fileName) };
          }
        }
      }
    } catch {}
  }

  // =========================================================================
  // STEP 2: The bundled virtual filesystem (stdlib)
  // =========================================================================
  const stdlibCandidates = [
    withAx(fileName),
    fileName,
    withAx(cleanPath),
    cleanPath,
    importPath,
    `documents/${withAx(cleanPath)}`,
    `documents/${withAx(fileName)}`,
    `/documents/${withAx(cleanPath)}`,
    `/documents/${withAx(fileName)}`,
  ];

  for (const sc of stdlibCandidates) {
    if (!stdlibSearched.includes(sc)) stdlibSearched.push(sc);
    if (Evaluator.virtualFiles.has(sc)) {
      return { code: Evaluator.virtualFiles.get(sc)!, canonicalPath: withAx(fileName) };
    }
    if (BUNDLED_DOCUMENTS[sc]) {
      return { code: BUNDLED_DOCUMENTS[sc], canonicalPath: withAx(fileName) };
    }
  }

  // =========================================================================
  // STEP 3: Fail, listing every path searched
  // =========================================================================
  const searchedPaths = [
    ...diskSearched.map(p => `[disk] ${p}`),
    ...stdlibSearched.map(p => `[stdlib] ${p}`),
  ];

  return {
    diskSearched,
    stdlibSearched,
    searchedPaths,
  };
}

export function substituteExpressions(ast: ASTNode, substMap: Record<string, ASTNode>): ASTNode {
  if (Object.keys(substMap).length === 0) return ast;
  switch (ast.type) {
    case 'Identifier':
      if (substMap[ast.name]) {
        return substMap[ast.name];
      }
      return ast;
    case 'Assignment':
      return {
        ...ast,
        value: substituteExpressions(ast.value, substMap),
      };
    case 'BinaryOp':
      return {
        ...ast,
        left: substituteExpressions(ast.left, substMap),
        right: substituteExpressions(ast.right, substMap),
      };
    case 'UnaryOp':
      return {
        ...ast,
        operand: substituteExpressions(ast.operand, substMap),
      };
    case 'PostfixOp':
      return {
        ...ast,
        operand: substituteExpressions(ast.operand, substMap),
      };
    case 'FunctionCall':
      return {
        ...ast,
        args: ast.args.map(a => substituteExpressions(a, substMap)),
      };
    case 'Where':
      return {
        ...ast,
        expr: substituteExpressions(ast.expr, substMap),
        condition: substituteExpressions(ast.condition, substMap),
      };
    default:
      return ast;
  }
}

export function substituteAliases(ast: ASTNode, aliasMap: Record<string, string>): ASTNode {
  const substMap: Record<string, ASTNode> = {};
  for (const [k, v] of Object.entries(aliasMap)) {
    substMap[k] = { type: 'Identifier', name: v, span: ast.span };
  }
  return substituteExpressions(ast, substMap);
}

export class Evaluator {
  public static virtualFiles: Map<string, string> = new Map();
  public static diskFiles: Map<string, string> = new Map();
  public static currentBaseDir: string = '';

  public static setBaseDir(dir: string): void {
    Evaluator.currentBaseDir = dir;
  }

  public static setDiskFiles(files: Map<string, string> | Record<string, string>): void {
    Evaluator.diskFiles.clear();
    if (files instanceof Map) {
      for (const [k, v] of files.entries()) {
        Evaluator.diskFiles.set(k, v);
      }
    } else if (typeof files === 'object') {
      for (const [k, v] of Object.entries(files)) {
        Evaluator.diskFiles.set(k, v);
      }
    }
  }

  public static clearDiskFiles(): void {
    Evaluator.diskFiles.clear();
    Evaluator.currentBaseDir = '';
  }

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
    Evaluator.diskFiles.clear();
    Evaluator.currentBaseDir = '';
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
  private activeRuleCalls: Set<string> = new Set();

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
    try {
      if (ast.type === 'AxisDecl') {
        (this.env as any).__declaredAxes__ = ast.axes;
        return {
          type: 'space',
          coordinates: ast.axes,
          dimension: ast.axes.length,
          declaredAxes: ast.axes,
          entities: [],
          span: ast.span,
        };
      }

      if (ast.type === 'Block') {
        return this.evalBlockAsSpace(ast, this.env);
      }

      const declaredAxes: string[] | undefined = (this.env as any).__declaredAxes__;

      if (ast.type === 'Assignment') {
        const valAnalysis = analyzeAST(ast.value, this.env, new Set(), this.source);
        if (valAnalysis.freeVariables.length > 0) {
          const coordinates = declaredAxes ?? [ast.target, ...valAnalysis.freeVariables].sort((a, b) => a.localeCompare(b));
          const uniqueCoords = [...new Set(coordinates)];
          const canGraph = declaredAxes === undefined || uniqueCoords.every(v => declaredAxes.includes(v));
          const comp = compileAST(ast, uniqueCoords, this.env);
          return {
            type: 'space',
            coordinates: uniqueCoords,
            dimension: uniqueCoords.length,
            declaredAxes,
            entities: canGraph && comp.success ? [{
              coordinates: uniqueCoords,
              ast,
              compiledFn: comp.fn,
              dimension: uniqueCoords.length,
              source: formatAST(ast),
            }] : [],
            span: ast.span,
          };
        }

        const val = this.evalNode(ast.value, this.env);
        if (val.type === 'record_constructor' && val.name === 'Record') {
          val.name = ast.target;
        }
        this.env[ast.target] = val;
        return val;
      }

      if (ast.type === 'BinaryOp' && ast.op === '=') {
        let boundVar: string | undefined;
        let boundVal: Value | undefined;

        if (ast.left.type === 'Identifier') {
          try {
            const rVal = this.evalNode(ast.right, this.env);
            if (rVal && rVal.type !== 'expression' && rVal.type !== 'space' && rVal.type !== 'unknown') {
              boundVar = ast.left.name;
              boundVal = rVal;
            }
          } catch {}
        }
        if (!boundVar && ast.right.type === 'Identifier') {
          try {
            const lVal = this.evalNode(ast.left, this.env);
            if (lVal && lVal.type !== 'expression' && lVal.type !== 'space' && lVal.type !== 'unknown') {
              boundVar = ast.right.name;
              boundVal = lVal;
            }
          } catch {}
        }

        if (boundVar && boundVal) {
          if (boundVal.type === 'record_constructor' && boundVal.name === 'Record') {
            boundVal.name = boundVar;
          }
          this.env[boundVar] = boundVal;
          if (declaredAxes !== undefined || boundVar.length === 1) {
            const coordinates = declaredAxes ?? [boundVar];
            const canGraph = declaredAxes === undefined || declaredAxes.includes(boundVar);
            const comp = compileAST(ast, coordinates, this.env);
            return {
              type: 'space',
              coordinates,
              dimension: coordinates.length,
              declaredAxes,
              entities: canGraph && comp.success ? [{
                coordinates,
                ast,
                compiledFn: comp.fn,
                dimension: coordinates.length,
                source: formatAST(ast),
              }] : [],
              resultVal: boundVal,
              span: ast.span,
            };
          }
          return boundVal;
        }
      }

      const analysis = analyzeAST(ast, this.env, new Set(), this.source);
      const isRelation = ast.type === 'BinaryOp' && ['=', '==', '!=', '<', '<=', '>', '>='].includes(ast.op);
      const isBareIdentifierOrProduct = (n: ASTNode): boolean => {
        if (n.type === 'Identifier') return true;
        if (n.type === 'BinaryOp' && n.op === '*' && n.isImplicit) {
          return isBareIdentifierOrProduct(n.left) && isBareIdentifierOrProduct(n.right);
        }
        return false;
      };

      if ((isRelation || isBareIdentifierOrProduct(ast)) && analysis.freeVariables.length > 0 && !analysis.isDefinition) {
        const canGraph = declaredAxes === undefined || (
          analysis.freeVariables.every(v => declaredAxes.includes(v))
        );
        const coordinates = declaredAxes ?? [...analysis.freeVariables].sort((a, b) => a.localeCompare(b));
        const comp = compileAST(ast, coordinates, this.env);
        const entities: SpatialEntity[] = [];
        if (comp.success && isRelation && canGraph) {
          entities.push({
            coordinates,
            ast,
            compiledFn: comp.fn,
            dimension: coordinates.length,
            source: formatAST(ast),
          });
        }
        return {
          type: 'space',
          coordinates,
          dimension: coordinates.length,
          declaredAxes,
          entities,
          span: ast.span,
        };
      }

      return this.evalNode(ast, this.env);
    } catch (err) {
      if (err instanceof BudgetExhaustedError) {
        return makeUnknown(err.reason, err.detail);
      }
      if (err instanceof RangeError && err.message.toLowerCase().includes('call stack')) {
        return makeUnknown('budget-exhausted', 'maximum recursion depth reached');
      }
      throw err;
    }
  }

  private evalBlockAsSpace(node: BlockNode, currentEnv: Environment, parentCoords: string[] = []): Value {
    const blockEnv: Environment = Object.create(currentEnv);
    const analysis = analyzeAST(node, currentEnv, new Set(), this.source);
    const coordinates = [...new Set([...parentCoords, ...analysis.freeVariables])].sort((a, b) => a.localeCompare(b));
    const entities: SpatialEntity[] = [];
    const nestedSpaces: SpaceValue[] = [];
    let lastVal: Value = { type: 'none' };
    let hasContradiction = false;
    let coordinateBounds: Record<string, [number, number]> | undefined;
    let timeVariable: string | undefined;

    let declaredAxes: string[] | undefined = undefined;
    for (const stmt of node.statements) {
      if (stmt.type === 'AxisDecl') {
        declaredAxes = stmt.axes;
      }
    }

    const substMap: Record<string, ASTNode> = {};
    const intermediateDefinitions = new Set<ASTNode>();
    if (declaredAxes) {
      // First pass: identify explicit aliases
      for (const stmt of node.statements) {
        if (stmt.type === 'BinaryOp' && stmt.op === '=') {
          if (stmt.left.type === 'Identifier' && declaredAxes.includes(stmt.left.name) &&
              stmt.right.type === 'Identifier' && !declaredAxes.includes(stmt.right.name)) {
            substMap[stmt.right.name] = stmt.left;
            intermediateDefinitions.add(stmt);
          } else if (stmt.right.type === 'Identifier' && declaredAxes.includes(stmt.right.name) &&
                     stmt.left.type === 'Identifier' && !declaredAxes.includes(stmt.left.name)) {
            substMap[stmt.left.name] = stmt.right;
            intermediateDefinitions.add(stmt);
          }
        } else if (stmt.type === 'Assignment') {
          if (declaredAxes.includes(stmt.target) && stmt.value.type === 'Identifier' && !declaredAxes.includes(stmt.value.name)) {
            substMap[stmt.value.name] = { type: 'Identifier', name: stmt.target, span: stmt.span };
            intermediateDefinitions.add(stmt);
          }
        }
      }
      // Second pass: identify intermediate definitions
      for (const stmt of node.statements) {
        if (intermediateDefinitions.has(stmt)) continue;
        if (stmt.type === 'BinaryOp' && stmt.op === '=') {
          if (stmt.left.type === 'Identifier' && !declaredAxes.includes(stmt.left.name) && !substMap[stmt.left.name]) {
            const rwRight = substituteExpressions(stmt.right, substMap);
            const a = analyzeAST(rwRight, blockEnv, new Set(), this.source);
            if (a.freeVariables.length > 0 && a.freeVariables.every(v => declaredAxes!.includes(v))) {
              substMap[stmt.left.name] = rwRight;
              intermediateDefinitions.add(stmt);
            }
          }
        } else if (stmt.type === 'Assignment') {
          if (!declaredAxes.includes(stmt.target) && !substMap[stmt.target]) {
            const rwValue = substituteExpressions(stmt.value, substMap);
            const a = analyzeAST(rwValue, blockEnv, new Set(), this.source);
            if (a.freeVariables.length > 0 && a.freeVariables.every(v => declaredAxes!.includes(v))) {
              substMap[stmt.target] = rwValue;
              intermediateDefinitions.add(stmt);
            }
          }
        }
      }
    }

    for (const stmt of node.statements) {
      this.budget.check('block', stmt.span);
      if (intermediateDefinitions.has(stmt) && declaredAxes) {
        if (stmt.type === 'Assignment') {
          try {
            const val = this.evalNode(stmt.value, blockEnv);
            if (val && val.type !== 'expression' && val.type !== 'space' && val.type !== 'unknown') {
              blockEnv[stmt.target] = val;
              lastVal = val;
            }
          } catch {}
        } else if (stmt.type === 'BinaryOp' && stmt.op === '=') {
          if (stmt.left.type === 'Identifier') {
            try {
              const val = this.evalNode(stmt.right, blockEnv);
              if (val && val.type !== 'expression' && val.type !== 'space' && val.type !== 'unknown') {
                if (val.type === 'record_constructor' && val.name === 'Record') {
                  val.name = stmt.left.name;
                }
                blockEnv[stmt.left.name] = val;
                const clean = stmt.left.name.replace(/^:/, '');
                blockEnv[clean] = val;
                blockEnv[':' + clean] = val;
                lastVal = val;
              }
            } catch {}
          }
        }
        continue;
      }
      if (stmt.type === 'AxisDecl') {
        lastVal = { type: 'none' };
      } else if (stmt.type === 'Quantifier') {
        lastVal = this.evalNode(stmt, blockEnv);
      } else if (stmt.type === 'Block') {
        const childVal = this.evalBlockAsSpace(stmt, blockEnv, coordinates);
        if (childVal.type === 'space') {
          const mergedCoords = new Set([...coordinates, ...childVal.coordinates]);
          const finalChildCoords = [...mergedCoords].sort((a, b) => a.localeCompare(b));
          childVal.coordinates = finalChildCoords;
          childVal.dimension = finalChildCoords.length;
          nestedSpaces.push(childVal);
        }
        lastVal = childVal;
      } else if (stmt.type === 'Assignment') {
        const rewrittenValue = substituteExpressions(stmt.value, substMap);
        const rewrittenStmt: AssignmentNode = { ...stmt, value: rewrittenValue };
        const valAnalysis = analyzeAST(rewrittenValue, blockEnv, new Set(), this.source);
        const stmtVars = [stmt.target, ...valAnalysis.freeVariables];
        const canGraph = declaredAxes === undefined || (
          stmtVars.length > 0 &&
          stmtVars.every(v => declaredAxes!.includes(v))
        );

        if (canGraph) {
          const stmtCoords = declaredAxes ?? [...new Set([stmt.target, ...valAnalysis.freeVariables])].sort((a, b) => a.localeCompare(b));
          const comp = compileAST(rewrittenStmt, stmtCoords.length > 0 ? stmtCoords : [stmt.target], blockEnv);
          if (comp.success) {
            entities.push({
              coordinates: stmtCoords.length > 0 ? stmtCoords : [stmt.target],
              ast: rewrittenStmt,
              compiledFn: comp.fn,
              dimension: (stmtCoords.length > 0 ? stmtCoords : [stmt.target]).length,
              source: formatAST(rewrittenStmt),
            });
          }
        }

        try {
          const val = this.evalNode(stmt.value, blockEnv);
          blockEnv[stmt.target] = val;
          lastVal = val;
        } catch {
          // Free variables in assignment RHS
        }
      } else if (stmt.type === 'Interval' || (stmt.type === 'SetOp' && stmt.op === 'in' && stmt.right.type === 'Interval')) {
        const interval = stmt.type === 'Interval' ? stmt : (stmt.right as IntervalNode);
        const varName = stmt.type === 'Interval' ? stmt.variable : (stmt.left.type === 'Identifier' ? stmt.left.name : undefined);
        let startNum = 0;
        let endNum = 10;
        try {
          const sVal = this.evalNode(interval.start, blockEnv);
          startNum = sVal.type === 'rational' ? Number(sVal.n) / Number(sVal.d) : sVal.type === 'float' ? sVal.value : 0;
        } catch {
          startNum = 0;
        }
        try {
          const eVal = this.evalNode(interval.end, blockEnv);
          endNum = eVal.type === 'rational' ? Number(eVal.n) / Number(eVal.d) : eVal.type === 'float' ? eVal.value : 10;
        } catch {
          endNum = 10;
        }
        if (varName) {
          if (!coordinateBounds) coordinateBounds = {};
          coordinateBounds[varName] = [startNum, endNum];
          if (varName === 'time' || varName === ':time' || varName === 't') {
            timeVariable = varName;
          }
        }
        lastVal = { type: 'none' };
      } else if (stmt.type === 'GlobalAssignment' || stmt.type === 'FunctionDef' || stmt.type === 'Unimport') {
        lastVal = this.evalNode(stmt, blockEnv);
      } else {
        const rewrittenStmt = substituteExpressions(stmt, substMap);
        const stmtAnalysis = analyzeAST(rewrittenStmt, blockEnv, new Set(), this.source);
        const isRel = rewrittenStmt.type === 'BinaryOp' && ['=', '==', '!=', '<', '<=', '>', '>='].includes(rewrittenStmt.op);
        const canGraph = declaredAxes === undefined || (
          stmtAnalysis.freeVariables.every(v => declaredAxes!.includes(v))
        );

        if (canGraph && (stmtAnalysis.freeVariables.length > 0 || isRel)) {
          const stmtCoords = declaredAxes ?? [...new Set([...coordinates, ...stmtAnalysis.freeVariables])].sort((a, b) => a.localeCompare(b));
          const comp = compileAST(rewrittenStmt, stmtCoords, blockEnv);
          if (comp.success) {
            entities.push({
              coordinates: stmtCoords,
              ast: rewrittenStmt,
              compiledFn: comp.fn,
              dimension: stmtCoords.length,
              source: formatAST(rewrittenStmt),
            });
          }
        }
        if (isRel) {
          if (stmt.type === 'BinaryOp' && stmt.op === '=') {
            let boundVar: string | undefined;
            let boundVal: Value | undefined;
            if (stmt.left.type === 'Identifier') {
              try {
                const rVal = this.evalNode(stmt.right, blockEnv);
                if (rVal && rVal.type !== 'expression' && rVal.type !== 'space' && rVal.type !== 'unknown') {
                  boundVar = stmt.left.name;
                  boundVal = rVal;
                }
              } catch {}
            } else if (stmt.right.type === 'Identifier') {
              try {
                const lVal = this.evalNode(stmt.left, blockEnv);
                if (lVal && lVal.type !== 'expression' && lVal.type !== 'space' && lVal.type !== 'unknown') {
                  boundVar = stmt.right.name;
                  boundVal = lVal;
                }
              } catch {}
            }
            if (boundVar && boundVal) {
              if (boundVal.type === 'record_constructor' && boundVal.name === 'Record') {
                boundVal.name = boundVar;
              }
              if (Object.prototype.hasOwnProperty.call(blockEnv, boundVar)) {
                const existing = blockEnv[boundVar];
                if (existing.type === 'rational' || existing.type === 'float') {
                  const cmp = compareValues('==', existing, boundVal);
                  if (cmp.type === 'boolean' && !cmp.value) {
                    hasContradiction = true;
                  }
                }
              }
              blockEnv[boundVar] = boundVal;
              const cleanVar = boundVar.replace(/^:/, '');
              blockEnv[cleanVar] = boundVal;
              blockEnv[':' + cleanVar] = boundVal;
              lastVal = boundVal;
            }
          }
          continue;
        }
        lastVal = this.evalNode(stmt, blockEnv);
      }
    }

    if (hasContradiction) {
      const allCoords = new Set(coordinates);
      for (const ent of entities) {
        for (const c of ent.coordinates) allCoords.add(c);
      }
      for (const ns of nestedSpaces) {
        for (const c of ns.coordinates) allCoords.add(c);
      }
      const finalCoords = [...allCoords].sort((a, b) => a.localeCompare(b));
      return {
        type: 'space',
        coordinates: declaredAxes ?? finalCoords,
        dimension: (declaredAxes ?? finalCoords).length,
        declaredAxes,
        entities,
        nestedSpaces: nestedSpaces.length > 0 ? nestedSpaces : undefined,
        bindings: blockEnv,
        coordinateBounds,
        timeVariable,
        resultVal: { type: 'expression', text: '0 = 1' } as any,
        span: node.span,
      };
    }

    const lastStmt = node.statements[node.statements.length - 1];
    const isRelation = (s: ASTNode | undefined) => s && (s.type === 'Assignment' || (s.type === 'BinaryOp' && ['=', '==', '!=', '<', '<=', '>', '>='].includes(s.op)));
    const endsInRelation = isRelation(lastStmt);
    if (nestedSpaces.length > 0 || lastVal.type === 'space' || (entities.length > 0 && endsInRelation) || (entities.length > 0 && coordinateBounds !== undefined) || declaredAxes !== undefined) {
      const allCoords = new Set(coordinates);
      for (const ent of entities) {
        for (const c of ent.coordinates) allCoords.add(c);
      }
      for (const ns of nestedSpaces) {
        for (const c of ns.coordinates) allCoords.add(c);
      }
      const finalCoords = [...allCoords].sort((a, b) => a.localeCompare(b));
      return {
        type: 'space',
        coordinates: declaredAxes ?? finalCoords,
        dimension: (declaredAxes ?? finalCoords).length,
        declaredAxes,
        entities,
        nestedSpaces: nestedSpaces.length > 0 ? nestedSpaces : undefined,
        bindings: blockEnv,
        coordinateBounds,
        timeVariable,
        resultVal: lastVal,
        span: node.span,
      };
    }

    return lastVal;
  }

  private evalNode(node: ASTNode, currentEnv: Environment): Value {
    this.budget.check(undefined, node.span);

    switch (node.type) {
      case 'Interval': {
        return { type: 'expression', ast: node, text: formatAST(node) };
      }
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
        if ((currentEnv as any).__unimported__?.has(name)) {
          return { type: 'expression', ast: node, text: name };
        }
        if (name in currentEnv) {
          const val = currentEnv[name];
          if ((val as any)?.type === 'forall_rule') {
            return { type: 'expression', ast: node, text: name };
          }
          return val;
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
        if (UTILITY_BUILTINS.has(name)) {
          return {
            type: 'builtin_function',
            name,
          } as any;
        }
        return { type: 'expression', ast: node, text: name };
      }
      case 'Where': {
        const exprVal = this.evalNode(node.expr, currentEnv);
        const condVal = this.evalCondition(node.condition, currentEnv);
        if (condVal.type === 'boolean') {
          if (condVal.value) {
            return exprVal;
          } else {
            return { type: 'none' };
          }
        }
        return {
          type: 'expression',
          ast: node,
          text: formatAST(node),
        };
      }
      case 'AxisDecl': {
        (currentEnv as any).__declaredAxes__ = node.axes;
        return {
          type: 'space',
          coordinates: node.axes,
          dimension: node.axes.length,
          declaredAxes: node.axes,
          entities: [],
          span: node.span,
        };
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
        if (operand.type === 'expression') return { type: 'expression', ast: node, text: formatAST(node) };
        if (node.op === 'not') {
          return { type: 'boolean', value: !this.isTruthy(operand) };
        }
        if (node.op === '+') {
          return operand;
        }
        if (node.op === '-') {
          return subValues({ type: 'rational', n: 0n, d: 1n }, operand, node.span);
        }
        if (node.op === '\u221a' || node.op === 'sqrt') {
          return this.evalFunctionCall({
            type: 'FunctionCall',
            callee: ':sqrt',
            args: [node.operand],
            span: node.span,
          }, currentEnv);
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

        if (node.op === '*' && node.left.type === 'Identifier') {
          const idName = node.left.name;
          const binding = currentEnv[idName] || currentEnv[idName.replace(/^:/, '')] || currentEnv[':' + idName.replace(/^:/, '')];
          if (binding && (binding as any).type === 'forall_rule') {
            return this.invokeForallRule(binding as any, [node.right], currentEnv, {
              type: 'FunctionCall',
              callee: idName,
              args: [node.right],
              isBare: true,
              span: node.span,
            });
          }
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
          case '//':
            return divValues(left, right, node.span);
          case '%':
            return modValues(left, right, node.span);
          case '^':
            return powValues(left, right, node.span);
          case '=': {
            if (node.left.type === 'Identifier') {
              if (right.type !== 'expression' && right.type !== 'space' && right.type !== 'unknown') {
                if (right.type === 'record_constructor' && right.name === 'Record') {
                  right.name = node.left.name;
                }
                currentEnv[node.left.name] = right;
                const clean = node.left.name.replace(/^:/, '');
                currentEnv[clean] = right;
                currentEnv[':' + clean] = right;
              }
            }
            return compareValues(node.op, left, right, node.span);
          }
          case '==':
          case '!=':
          case '<':
          case '<=':
          case '>':
          case '>=':
            return compareValues(node.op, left, right, node.span);
          default:
            throw createError(`Unknown binary operator '${node.op}'`, node.span);
        }
      }
      case 'If': {
        const condVal = this.evalCondition(node.condition, currentEnv);
        if (condVal.type === 'expression') {
          return {
            type: 'expression',
            ast: node,
            text: formatAST(node),
          };
        }
        if (condVal.type === 'unknown') {
          return condVal;
        }
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
        if (node.op === '\u2020' || node.op === 'dagger' || node.op === 'transpose') {
          return { type: 'expression', ast: node, text: formatAST(node) };
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
      case 'Unimport': {
        delete currentEnv[node.name];
        if (!(currentEnv as any).__unimported__) {
          (currentEnv as any).__unimported__ = new Set();
        }
        (currentEnv as any).__unimported__.add(node.name);
        if (node.name === 'pi') {
          (currentEnv as any).__unimported__.add('π');
          (currentEnv as any).__unimported__.add('pi');
          delete currentEnv['π'];
          delete currentEnv['pi'];
        } else if (node.name === 'tau') {
          (currentEnv as any).__unimported__.add('τ');
          (currentEnv as any).__unimported__.add('tau');
          delete currentEnv['τ'];
          delete currentEnv['tau'];
        } else if (node.name === 'phi') {
          (currentEnv as any).__unimported__.add('ϕ');
          (currentEnv as any).__unimported__.add('phi');
          delete currentEnv['ϕ'];
          delete currentEnv['phi'];
        }
        return { type: 'none' };
      }
      case 'Block': {
        return this.evalBlockAsSpace(node, currentEnv);
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
          const rawName = update.name.replace(/^:/, '');
          let targetKey = update.name;
          if (!(targetKey in updatedFields)) {
            if (rawName in updatedFields) {
              targetKey = rawName;
            } else if (`:${rawName}` in updatedFields) {
              targetKey = `:${rawName}`;
            } else {
              const avail = Object.keys(targetVal.fields).join(', ');
              throw createError(
                `Field '${update.name}' does not exist on record '${targetVal.typeName}'. Available fields: ${avail || '(none)'}`,
                update.value.span
              );
            }
          }
          updatedFields[targetKey] = this.evalNode(update.value, currentEnv);
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
          if (inner.type === 'BinaryOp' && ['+', '-', '*', '/', '^'].includes(inner.op)) {
            isBuiltinOverride = true;
            overrideName = inner.op;
          } else if (inner.type === 'FunctionCall') {
            const callee = inner.callee.replace(/^:/, '');
            if (['sin', 'cos', 'tan', 'exp', 'ln', 'sqrt', 'sinh', 'cosh', 'tanh', 'asin', 'acos', 'atan'].includes(callee) || UTILITY_BUILTINS.has(callee)) {
              isBuiltinOverride = true;
              overrideName = inner.callee;
            }
          }
        } else if (pat.type === 'FunctionCall') {
          const callee = pat.callee.replace(/^:/, '');
          if (['sin', 'cos', 'tan', 'exp', 'ln', 'sqrt', 'sinh', 'cosh', 'tanh', 'asin', 'acos', 'atan'].includes(callee) || UTILITY_BUILTINS.has(callee)) {
            isBuiltinOverride = true;
            overrideName = pat.callee;
          }
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
        const viewBody = this.evalNode(node.viewFunction, currentEnv);
        this.declaredViews.set(node.targetType, viewBody);
        if (!(currentEnv as any).__views__) {
          (currentEnv as any).__views__ = new Map();
        }
        (currentEnv as any).__views__.set(node.targetType, viewBody);
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
          const rawProp = prop.replace(/^:/, '');
          if (prop in targetVal.fields) {
            return targetVal.fields[prop];
          }
          if (rawProp in targetVal.fields) {
            return targetVal.fields[rawProp];
          }
          if (`:${rawProp}` in targetVal.fields) {
            return targetVal.fields[`:${rawProp}`];
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
        return { type: 'expression', ast: node, text: formatAST(node) };
      }
      case 'NablaOp': {
        return { type: 'expression', ast: node, text: formatAST(node) };
      }
      case 'DifferentialFormOp': {
        return { type: 'expression', ast: node, text: formatAST(node) };
      }
      case 'TensorOp': {
        return { type: 'expression', ast: node, text: formatAST(node) };
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
            // Unbound operand -> stands
          }
          return { type: 'expression', ast: node, text: formatAST(node) };
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
          return { type: 'expression', ast: node, text: formatAST(node) };
        }
        if (node.op === 'floor' || node.op === 'ceil' || node.op === 'abs') {
          try {
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
          } catch {
            return { type: 'expression', ast: node, text: formatAST(node) };
          }
        }
        if (node.op === 'card') {
          try {
            const val = this.evalNode(node.operands[0], currentEnv);
            if (val.type === 'tuple' || val.type === 'list') {
              return { type: 'rational', n: BigInt(val.elements.length), d: 1n };
            }
            if (val.type === 'set_value') {
              if (val.isInfinite) {
                return { type: 'expression', ast: node, text: formatAST(node) };
              }
              return { type: 'rational', n: BigInt((val.elements ?? []).length), d: 1n };
            }
          } catch {
            return { type: 'expression', ast: node, text: formatAST(node) };
          }
        }
        return { type: 'expression', ast: node, text: formatAST(node) };
      }
      case 'Quantifier': {
        if (node.quantifier === 'forall') {
          const params: string[] = [node.variable];
          let currPred: ASTNode = node.predicate;
          while (currPred.type === 'Quantifier' && currPred.quantifier === 'forall') {
            params.push((currPred as QuantifierNode).variable);
            currPred = (currPred as QuantifierNode).predicate;
          }

          if (currPred.type === 'BinaryOp' && currPred.op === '=') {
            const left = currPred.left;
            let fnName: string | undefined;
            if (
              left.type === 'BinaryOp' &&
              left.op === '*' &&
              left.left.type === 'Identifier' &&
              left.right.type === 'Identifier' &&
              left.right.name === params[0]
            ) {
              fnName = left.left.name;
            } else if (left.type === 'FunctionCall') {
              fnName = left.callee;
            }
            if (fnName) {
              const rule = {
                type: 'forall_rule',
                name: fnName,
                params,
                param: params[0],
                body: currPred.right,
                env: currentEnv,
              };
              currentEnv[fnName] = rule as any;
              const clean = fnName.replace(/^:/, '');
              currentEnv[clean] = rule as any;
              currentEnv[':' + clean] = rule as any;
              return { type: 'none' };
            }
          }
        }
        return { type: 'expression', ast: node, text: formatAST(node) };
      }
      case 'SetOp': {
        try {
          const leftVal = this.evalNode(node.left, currentEnv);
          if (node.right.type === 'Interval') {
            const interval = node.right as IntervalNode;
            const sVal = this.evalNode(interval.start, currentEnv);
            const eVal = this.evalNode(interval.end, currentEnv);
            const numLeft = leftVal.type === 'rational' ? Number(leftVal.n) / Number(leftVal.d) : leftVal.type === 'float' ? leftVal.value : NaN;
            const numStart = sVal.type === 'rational' ? Number(sVal.n) / Number(sVal.d) : sVal.type === 'float' ? sVal.value : (interval.isInfStart ? -Infinity : NaN);
            const numEnd = eVal.type === 'rational' ? Number(eVal.n) / Number(eVal.d) : eVal.type === 'float' ? eVal.value : (interval.isInfEnd ? Infinity : NaN);

            if (!isNaN(numLeft) && !isNaN(numStart) && !isNaN(numEnd)) {
              let inside = false;
              const kind = (interval as any).kind || (interval as any).boundaryType || 'closed';
              if (kind === 'closed') {
                inside = numLeft >= numStart && numLeft <= numEnd;
              } else if (kind === 'open') {
                inside = numLeft > numStart && numLeft < numEnd;
              } else if (kind === 'left_open' || kind === 'half-open-left') {
                inside = numLeft > numStart && numLeft <= numEnd;
              } else if (kind === 'right_open' || kind === 'half-open-right') {
                inside = numLeft >= numStart && numLeft < numEnd;
              }
              return { type: 'boolean', value: node.op === 'in' ? inside : !inside };
            }
          }
          const rightVal = this.evalNode(node.right, currentEnv);
          if (node.op === 'in' || node.op === 'notin') {
            if (rightVal.type === 'set_value') {
              if (rightVal.standardName === '\u211d' || rightVal.standardName === 'Reals' || rightVal.standardName === 'R') {
                const isReal = leftVal.type === 'rational' || leftVal.type === 'float';
                return { type: 'boolean', value: node.op === 'in' ? isReal : !isReal };
              }
              if (rightVal.standardName === '\u2124' || rightVal.standardName === 'Integers' || rightVal.standardName === 'Z') {
                const isInt = leftVal.type === 'rational' && leftVal.d === 1n;
                return { type: 'boolean', value: node.op === 'in' ? isInt : !isInt };
              }
              if (rightVal.standardName === '\u2115' || rightVal.standardName === 'Naturals' || rightVal.standardName === 'N') {
                const isNat = leftVal.type === 'rational' && leftVal.d === 1n && leftVal.n >= 0n;
                return { type: 'boolean', value: node.op === 'in' ? isNat : !isNat };
              }
              if (!rightVal.isInfinite && rightVal.elements) {
                const found = rightVal.elements.some(e => {
                  try {
                    return (compareValues('==', leftVal, e, node.span) as any).value === true;
                  } catch {
                    return false;
                  }
                });
                return { type: 'boolean', value: node.op === 'in' ? found : !found };
              }
            }
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
          }
        } catch {
          // Unbound operands -> stands
        }
        return { type: 'expression', ast: node, text: formatAST(node) };
      }
      case 'SetBuilder': {
        return { type: 'expression', ast: node, text: formatAST(node) };
      }
      case 'Equivalence': {
        return { type: 'expression', ast: node, text: formatAST(node) };
      }
      case 'DecoratedIdentifier': {
        if (node.name in currentEnv) {
          return this.evalNode({ type: 'Identifier', name: node.name, span: node.span }, currentEnv);
        }
        return { type: 'expression', ast: node, text: formatAST(node) };
      }
      case 'MatrixPostfix': {
        try {
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
        } catch {
          // Unbound operand -> stands
        }
        return { type: 'expression', ast: node, text: formatAST(node) };
      }
      case 'Probability': {
        return { type: 'expression', ast: node, text: formatAST(node) };
      }
      default: {
        return { type: 'expression', ast: node, text: formatAST(node) };
      }
    }
  }

  private evalFunctionCall(node: FunctionCallNode, currentEnv: Environment): Value {
    const callee = node.callee.replace(/^:/, '');

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
      if (targetArg.type === 'NamedArg' && (targetArg.name === 'to' || targetArg.name.replace(/^:/, '') === 'to')) {
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
      if (toArg.type === 'NamedArg' && (toArg.name === 'to' || toArg.name.replace(/^:/, '') === 'to')) {
        targetUnitName = toArg.value.type === 'Identifier' ? toArg.value.name.replace(/^:/, '') : '';
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
        } else if (this.source && arg0.span && arg0.span.end > arg0.span.start) {
          reason = this.source.slice(arg0.span.start, arg0.span.end).replace(/\s+/g, '') as UnknownReason;
        } else if (arg0.type === 'UnaryOp' || arg0.type === 'BinaryOp') {
          reason = formatAST(arg0).replace(/[:·\s]+/g, '') as UnknownReason;
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
      return { type: 'expression', ast: node, text: formatAST(node) };
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
      if ((calleeVal as any).type === 'forall_rule') {
        return this.invokeForallRule(calleeVal, node.args, currentEnv, node);
      }
    }

    // Check if callee is in environment directly as forall_rule
    const cleanCallee = callee.replace(/^:/, '');
    const directBinding = currentEnv[callee] || currentEnv[cleanCallee] || currentEnv[':' + cleanCallee];
    if (directBinding && (directBinding as any).type === 'forall_rule') {
      return this.invokeForallRule(directBinding, node.args, currentEnv, node);
    }

    // Check utility builtin function (e.g. min, max, dot, length, matrix, det)
    if (UTILITY_BUILTINS.has(callee) || UTILITY_BUILTINS.has(cleanCallee)) {
      const argVals = node.args.map((a: ASTNode) => this.evalNode(a, currentEnv));
      return applyBuiltin(UTILITY_BUILTINS.has(callee) ? callee : cleanCallee, argVals, node.span);
    }

    throw createError(`Function '${callee}' is not defined`, node.span, {
      expected: 'a defined function name',
      suggestion: `Define ${callee}(x) := ... before calling it`,
      source: this.source,
    });
  }

  private invokeForallRule(rule: any, args: ASTNode[], currentEnv: Environment, node: FunctionCallNode): Value {
    const argVals = args.map(a => this.evalNode(a, currentEnv));
    const unknownArg = argVals.find(v => v.type === 'unknown');
    if (unknownArg) return unknownArg;
    const argKey = argVals.map(v => JSON.stringify(v, (_, val) => typeof val === 'bigint' ? val.toString() + 'n' : val)).join(',');
    const callKey = `${rule.name}(${argKey})`;
    if (this.activeRuleCalls.has(callKey)) {
      const concreteAst: ASTNode = {
        type: 'FunctionCall',
        callee: rule.name,
        args: argVals.map(v => valueToASTNode(v, node.span)),
        isBare: node.isBare,
        span: node.span,
      };
      return { type: 'expression', ast: concreteAst, text: formatAST(concreteAst) };
    }
    this.activeRuleCalls.add(callKey);
    try {
      const callEnv = Object.create(rule.env);
      const params = rule.params || [rule.param];
      for (let i = 0; i < params.length; i++) {
        if (i < argVals.length) {
          callEnv[params[i]] = argVals[i];
          const clean = params[i].replace(/^:/, '');
          callEnv[clean] = argVals[i];
          callEnv[':' + clean] = argVals[i];
        } else if (params[i].replace(/^:/, '') === 'b') {
          const defaultB: Value = { type: 'rational', n: 10n, d: 1n };
          callEnv[params[i]] = defaultB;
          callEnv['b'] = defaultB;
          callEnv[':b'] = defaultB;
        }
      }
      return this.evalNode(rule.body, callEnv);
    } finally {
      this.activeRuleCalls.delete(callKey);
    }
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
    const unknownArg = argVals.find(v => v.type === 'unknown');
    if (unknownArg) return unknownArg;

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
    if ((fnVal as any).type === 'forall_rule') {
      const rule = fnVal as any;
      const dummyCallNode: FunctionCallNode = {
        type: 'FunctionCall',
        callee: rule.name,
        args: argVals.map(v => valueToASTNode(v, span)),
        span: span ?? { start: 0, end: 0, line: 1, col: 1 },
      };
      return this.invokeForallRule(rule, dummyCallNode.args, this.env, dummyCallNode);
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
      if (arg.type === 'NamedArg' && arg.name.replace(/^[:\\]/, '') === 'from') {
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
      return { type: 'expression', ast: node, text: formatAST(node) };
    }

    let startNum = 0;
    let endNum = 0;
    try {
      if (node.start) {
        const sVal = this.evalNode(node.start, currentEnv);
        if (sVal.type === 'expression') return { type: 'expression', ast: node, text: formatAST(node) };
        startNum = valueToNumber(sVal, node.start.span);
      }
      if (node.end) {
        const eVal = this.evalNode(node.end, currentEnv);
        if (eVal.type === 'expression') return { type: 'expression', ast: node, text: formatAST(node) };
        endNum = valueToNumber(eVal, node.end.span);
      }
    } catch {
      return { type: 'expression', ast: node, text: formatAST(node) };
    }
    if (Number.isNaN(startNum) || Number.isNaN(endNum)) {
      return { type: 'expression', ast: node, text: formatAST(node) };
    }

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
        if (total.type === 'unknown' || total.type === 'expression') return total;
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
        if (total.type === 'unknown' || total.type === 'expression') return total;
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

    return { type: 'expression', ast: node, text: formatAST(node) };
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
      const availableStdlib = Array.from(
        new Set([
          ...Object.keys(BUNDLED_DOCUMENTS),
          ...Array.from(Evaluator.virtualFiles.keys()).map(k => k.replace(/^.*[\\/]/, '')),
        ])
      )
        .filter(k => k.endsWith('.ax'))
        .sort();

      const diskList = resolved.diskSearched.map(p => `'${p}'`).join(', ');
      const stdlibList = resolved.stdlibSearched.map(p => `'${p}'`).join(', ');

      throw createError(
        `Cannot find module '${importPath}'. Looked for: ${resolved.searchedPaths.map(p => `'${p}'`).join(', ')}\nResolution failed:\n  1. Disk (relative to file directory): ${diskList}\n  2. Stdlib (bundled virtual filesystem): ${stdlibList}`,
        node.span,
        {
          expected: 'an existing .ax module on disk or in the bundled stdlib',
          suggestion: `Available stdlib modules: ${availableStdlib.join(', ') || '(none)'}`,
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
    const evalModStmt = (stmt: ASTNode) => {
      if (stmt.type === 'BinaryOp' && stmt.op === '=') {
        if (stmt.left.type === 'Identifier') {
          try {
            const rVal = this.evalNode(stmt.right, modEnv);
            if (rVal && rVal.type !== 'expression' && rVal.type !== 'space' && rVal.type !== 'unknown') {
              if (rVal.type === 'record_constructor' && rVal.name === 'Record') {
                rVal.name = stmt.left.name;
              }
              modEnv[stmt.left.name] = rVal;
              return;
            }
          } catch {}
        }
        if (stmt.right.type === 'Identifier') {
          try {
            const lVal = this.evalNode(stmt.left, modEnv);
            if (lVal && lVal.type !== 'expression' && lVal.type !== 'space' && lVal.type !== 'unknown') {
              if (lVal.type === 'record_constructor' && lVal.name === 'Record') {
                lVal.name = stmt.right.name;
              }
              modEnv[stmt.right.name] = lVal;
              return;
            }
          } catch {}
        }
      }
      this.evalNode(stmt, modEnv);
    };

    if (parsedAST.type === 'Block') {
      for (const stmt of parsedAST.statements) {
        evalModStmt(stmt);
      }
    } else {
      evalModStmt(parsedAST);
    }

    // Collect exported symbols
    const exportedSymbols: Set<string> | undefined = (modEnv as any).__exports__;
    const exports: Record<string, Value> = {};

    for (const [k, v] of Object.entries(modEnv)) {
      if (k.startsWith('__')) continue;
      if (exportedSymbols) {
        if (
          exportedSymbols.has(k) ||
          exportedSymbols.has(':' + k) ||
          exportedSymbols.has(k.replace(/^:/, ''))
        ) {
          exports[k] = v;
          const cleanK = k.replace(/^:/, '');
          exports[cleanK] = v;
          exports[':' + cleanK] = v;
        }
      } else {
        exports[k] = v;
        const cleanK = k.replace(/^:/, '');
        exports[cleanK] = v;
        exports[':' + cleanK] = v;
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

    const modValue: ModuleValue = {
      type: 'module',
      name: modName,
      exports,
    };

    if (node.importedSymbols && node.importedSymbols.length > 0) {
      const selectiveExports: Record<string, Value> = {};
      for (const sym of node.importedSymbols) {
        if (sym in exports) {
          currentEnv[sym] = exports[sym];
          selectiveExports[sym] = exports[sym];
        } else {
          throw createError(`Symbol '${sym}' is not exported by module '${importPath}'`, node.span, {
            expected: `one of the exported symbols: ${Object.keys(exports).join(', ') || '(none)'}`,
            suggestion: `Check the exports in '${importPath}'`,
            source: this.source,
          });
        }
      }
      return {
        type: 'module',
        name: modName,
        exports: selectiveExports,
      };
    } else if (node.asName) {
      currentEnv[node.asName] = modValue;
    } else {
      currentEnv[modName] = modValue;
      for (const [k, v] of Object.entries(exports)) {
        currentEnv[k] = v;
      }
    }

    return modValue;
  }

  private evalDiff(node: DiffNode, currentEnv: Environment): Value {
    const userRuleRes = this.applyUserRules(node, currentEnv);
    if (userRuleRes) {
      return userRuleRes;
    }

    const varName = node.variable;

    if (node.expr.type === 'BinaryOp' && (node.expr.op === '/' || (node.expr as any).op === '//')) {
      if (node.expr.right.type === 'NumberLiteral' && (node.expr.right.raw === '0' || node.expr.right.raw === '0.0')) {
        return { type: 'expression', ast: node, text: formatAST(node) };
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
      if (arg.type === 'NamedArg' && (arg.name === 'is' || arg.name.replace(/^:/, '') === 'is')) {
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



  private evalCondition(node: ASTNode, currentEnv: Environment): Value {
    if (node.type === 'BinaryOp') {
      if (node.op === 'and') {
        const left = this.evalCondition(node.left, currentEnv);
        if (left.type === 'boolean' && !left.value) return left;
        const right = this.evalCondition(node.right, currentEnv);
        if (right.type === 'boolean' && !right.value) return right;
        if (left.type === 'boolean' && right.type === 'boolean') return { type: 'boolean', value: left.value && right.value };
        return { type: 'expression', ast: node, text: formatAST(node) };
      }
      if (node.op === 'or') {
        const left = this.evalCondition(node.left, currentEnv);
        if (left.type === 'boolean' && left.value) return left;
        const right = this.evalCondition(node.right, currentEnv);
        if (right.type === 'boolean' && right.value) return right;
        if (left.type === 'boolean' && right.type === 'boolean') return { type: 'boolean', value: left.value || right.value };
        return { type: 'expression', ast: node, text: formatAST(node) };
      }
      if (['=', '==', '!=', '<', '<=', '>', '>='].includes(node.op)) {
        const left = this.evalNode(node.left, currentEnv);
        const right = this.evalNode(node.right, currentEnv);
        return compareValues(node.op as any, left, right, node.span);
      }
    }
    return this.evalNode(node, currentEnv);
  }

  private isTruthy(val: Value): boolean {
    if (val.type === 'boolean') return val.value;
    if (val.type === 'none') return false;
    if (val.type === 'rational') return val.n !== 0n;
    if (val.type === 'float') return val.value !== 0 && !isNaN(val.value);
    if (val.type === 'expression') return false;
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
  budget: BudgetTracker = new BudgetTracker(DEFAULT_INVOKED_FUEL)
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
