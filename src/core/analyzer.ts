import { ASTNode } from './types';
import { CONSTANTS } from './parser';

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
    const cleanName = name.replace(/^:/, '');
    if (
      boundParams.has(name) ||
      boundParams.has(cleanName) ||
      name in env ||
      cleanName in env ||
      (':' + cleanName) in env ||
      CONSTANTS.has(name) ||
      CONSTANTS.has(cleanName)
    ) {
      return true;
    }
    if (env.__operators__?.has?.(name) || env.__operators__?.has?.(cleanName) || env.__units__?.has?.(name) || env.__units__?.has?.(cleanName)) {
      return true;
    }
    if (env.__rules__) {
      for (const r of env.__rules__) {
        if (r.pattern?.type === 'Diff' && r.pattern.expr?.type === 'FunctionCall' && (r.pattern.expr.callee === name || r.pattern.expr.callee === cleanName)) return true;
        if (r.pattern?.type === 'FunctionCall' && (r.pattern.callee === name || r.pattern.callee === cleanName)) return true;
      }
    }
    return false;
  }

  function checkIdentifier(name: string) {
    if (isKnown(name)) {
      return;
    }

    freeVars.add(name);
  }

  function walk(n: ASTNode) {
    switch (n.type) {
      case 'NumberLiteral':
        break;
      case 'Identifier':
        checkIdentifier(n.name);
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
      case 'Interval': {
        if (n.variable) {
          checkIdentifier(n.variable);
        }
        walk(n.start);
        walk(n.end);
        break;
      }
      case 'AxisDecl': {
        break;
      }
      case 'Where': {
        walk(n.expr);
        walk(n.condition);
        break;
      }
      case 'Quantifier': {
        const subParams = new Set(boundParams);
        subParams.add(n.variable);
        if (n.predicate.type === 'BinaryOp' && n.predicate.op === '=') {
          if (n.predicate.left.type === 'BinaryOp' && n.predicate.left.isImplicit && n.predicate.left.left.type === 'Identifier') {
            subParams.add(n.predicate.left.left.name);
          }
        }
        walk(n.domain);
        const predAnalysis = analyzeAST(n.predicate, env, subParams, source);
        for (const fv of predAnalysis.freeVariables) {
          if (!subParams.has(fv)) {
            freeVars.add(fv);
          }
        }
        break;
      }
      case 'StringLiteral': {
        break;
      }
      case 'FunctionCall': {
        if (!isKnown(n.callee)) {
          undeclared.add(n.callee);
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
        if (n.callee === 'ode') {
          const subParams = new Set(boundParams);
          subParams.add('t');
          subParams.add('y');
          subParams.add('dy');
          subParams.add('dt');
          subParams.add('dx');
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
        if (n.callee === 'sum' || n.callee === 'prod' || n.callee === 'integral' || n.callee === 'simpson' || n.callee === 'trapz') {
          const subParams = new Set(boundParams);
          for (const arg of n.args) {
            if (arg.type === 'BinaryOp' && (arg.op === 'in' || arg.op === 'SET_IN') && arg.left.type === 'Identifier') {
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
      case 'Unimport': {
        break;
      }
      case 'Block': {
        const blockParams = new Set(boundParams);
        for (const stmt of n.statements) {
          if (stmt.type === 'FunctionDef') {
            blockParams.add(stmt.name);
          } else if (stmt.type === 'Quantifier') {
            if (stmt.predicate.type === 'BinaryOp' && stmt.predicate.op === '=') {
              if (stmt.predicate.left.type === 'BinaryOp' && stmt.predicate.left.isImplicit && stmt.predicate.left.left.type === 'Identifier') {
                blockParams.add(stmt.predicate.left.left.name);
              }
            }
          }
        }
        const isRelationOrBlock = (s: ASTNode | undefined) => {
          if (!s) return false;
          if (s.type === 'Assignment' || s.type === 'Block') return true;
          if (s.type === 'BinaryOp' && ['=', '==', '!=', '<', '<=', '>', '>='].includes(s.op)) return true;
          return false;
        };
        const hasTrailingExpr = n.statements.length > 0 && !isRelationOrBlock(n.statements[n.statements.length - 1]);
        for (const stmt of n.statements) {
          if (stmt.type === 'Unimport') {
            blockParams.delete(stmt.name);
          }
          if (stmt.type === 'Assignment') {
            const valAnalysis = analyzeAST(stmt.value, env, blockParams, source);
            if (valAnalysis.freeVariables.length > 0 || !hasTrailingExpr) {
              freeVars.add(stmt.target);
              for (const fv of valAnalysis.freeVariables) {
                if (!blockParams.has(fv)) freeVars.add(fv);
              }
              blockParams.add(stmt.target);
              continue;
            }
          }
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
      case 'Quote': {
        const findUnquotes = (sub: ASTNode) => {
          if (sub.type === 'Unquote') {
            walk(sub.expr);
          } else {
            switch (sub.type) {
              case 'BinaryOp': findUnquotes(sub.left); findUnquotes(sub.right); break;
              case 'UnaryOp': case 'PostfixOp': findUnquotes(sub.operand); break;
              case 'FunctionCall': sub.args.forEach(findUnquotes); break;
              case 'Tuple': case 'List': sub.elements.forEach(findUnquotes); break;
              case 'Match': walk(sub); break;
              case 'Build': walk(sub); break;
            }
          }
        };
        findUnquotes(n.expr);
        break;
      }
      case 'Unquote': {
        walk(n.expr);
        break;
      }
      case 'Build': {
        if (n.template) {
          walk(n.template);
        }
        if (n.args) {
          for (const arg of n.args) {
            walk(arg);
          }
        }
        break;
      }
      case 'Match': {
        walk(n.expr);
        const extractPatternVars = (pat: ASTNode, out: Set<string>) => {
          if (pat.type === 'Identifier') {
            if (pat.name !== '_' && pat.name.length >= 1 && !CONSTANTS.has(pat.name)) {
              out.add(pat.name);
            }
          } else if (pat.type === 'BinaryOp') {
            extractPatternVars(pat.left, out);
            extractPatternVars(pat.right, out);
          } else if (pat.type === 'UnaryOp' || pat.type === 'PostfixOp') {
            extractPatternVars(pat.operand, out);
          } else if (pat.type === 'FunctionCall') {
            for (const arg of pat.args) extractPatternVars(arg, out);
          } else if (pat.type === 'Tuple' || pat.type === 'List') {
            for (const el of pat.elements) extractPatternVars(el, out);
          } else if (pat.type === 'Diff') {
            extractPatternVars(pat.expr, out);
          }
        };
        for (const c of n.cases) {
          const caseParams = new Set(boundParams);
          extractPatternVars(c.pattern, caseParams);
          if (c.guard) {
            const guardAnalysis = analyzeAST(c.guard, env, caseParams, source);
            for (const fv of guardAnalysis.freeVariables) {
              if (!caseParams.has(fv)) freeVars.add(fv);
            }
          }
          const bodyAnalysis = analyzeAST(c.body, env, caseParams, source);
          for (const fv of bodyAnalysis.freeVariables) {
            if (!caseParams.has(fv)) freeVars.add(fv);
          }
        }
        if (n.otherwise) {
          walk(n.otherwise);
        }
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
