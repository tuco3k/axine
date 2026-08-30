import { ASTNode, Environment, Value } from '../types';
import { AlgebraicClassifier } from './classifier';
import { AlgebraicSolver } from './solver';
import { AlgebraicVerifier } from './verifier';

export function solveAlgebraic(
  equationNode: ASTNode,
  varName: string,
  env: Environment,
  source?: string
): Value {
  let lhs: ASTNode;
  let rhs: ASTNode;

  if (equationNode.type === 'BinaryOp' && (equationNode.op === '==' || equationNode.op === '=')) {
    lhs = equationNode.left;
    rhs = equationNode.right;
  } else {
    // If passed single expression e.g. isolate(3x + 7, for: x) -> implicit = 0
    lhs = equationNode;
    rhs = { type: 'NumberLiteral', raw: '0', span: equationNode.span };
  }

  // 1. Classify
  const classification = AlgebraicClassifier.classify(lhs, rhs, varName, env);
  if (classification.kind === 'UNSUPPORTED') {
    return {
      type: 'unknown',
      reason: 'requires-unavailable-theory',
      detail: classification.reason,
    };
  }

  // 2. Solve & Generate Steps
  const derivation = AlgebraicSolver.solve(classification, env, source);
  if (derivation.type === 'unknown') {
    return derivation;
  }

  // 3. Self-Verification
  const verified = AlgebraicVerifier.verify(derivation, lhs, rhs, varName, env);
  return verified;
}

export * from './types';
export * from './classifier';
export * from './solver';
export * from './verifier';
