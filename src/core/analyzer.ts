import { ASTNode, Span } from './types';
import { BUILTIN_FUNCTIONS, CONSTANTS } from './parser';
import { createError } from './errors';

export interface AnalysisResult {
  freeVariables: string[];
  undeclaredIdentifiers: string[];
  isDefinition: boolean;
  definedName?: string;
  isFunctionDef?: boolean;
}

export function analyzeAST(
  node: ASTNode,
  env: Record<string, any> = {},
  boundParams: Set<string> = new Set(),
  source?: string
): AnalysisResult {
  const freeVars = new Set<string>();
  const undeclared = new Set<string>();
  let isDef = false;
  let definedName: string | undefined;
  let isFuncDef = false;

  function isKnown(name: string): boolean {
    return (
      boundParams.has(name) ||
      name in env ||
      CONSTANTS.has(name) ||
      BUILTIN_FUNCTIONS.has(name)
    );
  }

  function checkIdentifier(name: string, span: Span) {
    if (isKnown(name)) {
      return;
    }

    if (name === 'i') {
      freeVars.add('i');
      return;
    }

    if (name.length > 1) {
      // Undeclared multi-letter identifier
      const productSuggestion = name.split('').join('·');
      throw createError(
        `'${name}' is not defined. Multi-letter names must be assigned before use`,
        span,
        {
          expected: `a previously assigned variable '${name}' or implicit product notation '${productSuggestion}'`,
          suggestion: `Did you mean '${productSuggestion}' (implicit product) or did you mean to write '${name} := ...' first?`,
          source,
        }
      );
    } else {
      // Single letter identifier: valid free variable
      freeVars.add(name);
    }
  }

  function walk(n: ASTNode) {
    switch (n.type) {
      case 'NumberLiteral':
        break;
      case 'Identifier':
        checkIdentifier(n.name, n.span);
        break;
      case 'UnaryOp':
        walk(n.operand);
        break;
      case 'BinaryOp':
        walk(n.left);
        walk(n.right);
        break;
      case 'PostfixOp':
        walk(n.operand);
        break;
      case 'Tuple':
        for (const el of n.elements) {
          walk(el);
        }
        break;
      case 'List':
        for (const el of n.elements) {
          walk(el);
        }
        break;
      case 'If':
        walk(n.condition);
        walk(n.thenBranch);
        walk(n.elseBranch);
        break;
      case 'NamedArg':
        walk(n.value);
        break;
      case 'Lambda': {
        const subParams = new Set(boundParams);
        for (const p of n.params) {
          subParams.add(p);
        }
        const bodyAnalysis = analyzeAST(n.body, env, subParams, source);
        for (const fv of bodyAnalysis.freeVariables) {
          if (!subParams.has(fv)) {
            freeVars.add(fv);
          }
        }
        break;
      }
      case 'Range': {
        walk(n.start);
        walk(n.end);
        if (n.step) walk(n.step);
        break;
      }
      case 'StringLiteral': {
        break;
      }
      case 'FunctionCall': {
        if (!BUILTIN_FUNCTIONS.has(n.callee) && !boundParams.has(n.callee) && !(n.callee in env)) {
          if (n.callee.length > 1) {
            checkIdentifier(n.callee, n.span);
          } else {
            freeVars.add(n.callee);
          }
        }
        if (n.callee === 'graph') {
          const subParams = new Set(boundParams);
          for (const arg of n.args) {
            if (arg.type === 'BinaryOp' && arg.op === 'in' && arg.left.type === 'Identifier') {
              subParams.add(arg.left.name);
            } else if (arg.type === 'Range' && (arg as any).variable) {
              subParams.add((arg as any).variable);
            }
          }
          for (const arg of n.args) {
            const subRes = analyzeAST(arg, env, subParams, source);
            for (const fv of subRes.freeVariables) {
              if (!subParams.has(fv)) freeVars.add(fv);
            }
          }
          break;
        }
        if (n.callee === 'isolate' || n.callee === 'simplify' || n.callee === 'solve') {
          let targetVar = 'x';
          for (const arg of n.args) {
            if (arg.type === 'NamedArg' && (arg.name === 'for' || arg.name === 'in' || arg.name === 'var') && arg.value.type === 'Identifier') {
              targetVar = arg.value.name;
            } else if (arg.type === 'Identifier') {
              targetVar = arg.name;
            }
          }
          const subParams = new Set(boundParams);
          subParams.add(targetVar);
          for (const arg of n.args) {
            const subRes = analyzeAST(arg, env, subParams, source);
            for (const fv of subRes.freeVariables) {
              if (!subParams.has(fv)) freeVars.add(fv);
            }
          }
          break;
        }
        if (n.callee !== 'unknown') {
          for (const arg of n.args) {
            walk(arg);
          }
        }
        break;
      }
      case 'Assignment': {
        isDef = true;
        definedName = n.target;
        walk(n.value);
        break;
      }
      case 'GlobalAssignment': {
        isDef = true;
        definedName = n.target;
        walk(n.value);
        break;
      }
      case 'Block': {
        const blockParams = new Set(boundParams);
        for (const stmt of n.statements) {
          if (stmt.type === 'FunctionDef') {
            blockParams.add(stmt.name);
          }
        }
        for (const stmt of n.statements) {
          const stmtAnalysis = analyzeAST(stmt, env, blockParams, source);
          for (const fv of stmtAnalysis.freeVariables) {
            if (!blockParams.has(fv)) {
              freeVars.add(fv);
            }
          }
          if (stmtAnalysis.definedName) {
            blockParams.add(stmtAnalysis.definedName);
          }
        }
        break;
      }
      case 'Diff': {
        const subParams = new Set(boundParams);
        subParams.add(n.variable);
        const exprAnalysis = analyzeAST(n.expr, env, subParams, source);
        for (const fv of exprAnalysis.freeVariables) {
          if (!subParams.has(fv)) freeVars.add(fv);
        }
        break;
      }
      case 'BigOp': {
        if (n.start) walk(n.start);
        if (n.end) walk(n.end);
        const subParams = new Set(boundParams);
        subParams.add(n.variable);
        const bodyAnalysis = analyzeAST(n.body, env, subParams, source);
        for (const fv of bodyAnalysis.freeVariables) {
          if (!subParams.has(fv)) freeVars.add(fv);
        }
        break;
      }
      case 'Limit': {
        walk(n.target);
        const subParams = new Set(boundParams);
        subParams.add(n.variable);
        const bodyAnalysis = analyzeAST(n.expr, env, subParams, source);
        for (const fv of bodyAnalysis.freeVariables) {
          if (!subParams.has(fv)) freeVars.add(fv);
        }
        break;
      }
      case 'Index': {
        walk(n.target);
        walk(n.index);
        break;
      }
      case 'MemberAccess': {
        walk(n.target);
        break;
      }
      case 'RecordDef': {
        break;
      }
      case 'RecordWith': {
        walk(n.target);
        for (const u of n.updates) {
          walk(u.value);
        }
        break;
      }
      case 'DimensionDecl':
      case 'ModuleDecl':
      case 'Export':
      case 'Import':
      case 'KindDecl': {
        break;
      }
      case 'UnitDecl': {
        if (n.definition) walk(n.definition);
        break;
      }
      case 'OperatorDecl': {
        const subParams = new Set(boundParams);
        for (const p of n.params) subParams.add(p);
        const bodyRes = analyzeAST(n.body, env, subParams, source);
        for (const fv of bodyRes.freeVariables) {
          if (!subParams.has(fv)) freeVars.add(fv);
        }
        break;
      }
      case 'RuleDecl': {
        break;
      }
      case 'Claim': {
        isDef = true;
        definedName = n.name;
        walk(n.shadow);
        walk(n.expect);
        break;
      }
      case 'FunctionDef': {
        isDef = true;
        definedName = n.name;
        isFuncDef = true;
        const subParams = new Set(boundParams);
        subParams.add(n.name);
        for (const p of n.params) {
          subParams.add(p);
        }
        // Walk body with params in scope
        const bodyAnalysis = analyzeAST(n.body, env, subParams, source);
        for (const fv of bodyAnalysis.freeVariables) {
          if (!subParams.has(fv)) {
            freeVars.add(fv);
          }
        }
        break;
      }
    }
  }

  walk(node);

  return {
    freeVariables: Array.from(freeVars),
    undeclaredIdentifiers: Array.from(undeclared),
    isDefinition: isDef,
    definedName,
    isFunctionDef: isFuncDef,
  };
}
