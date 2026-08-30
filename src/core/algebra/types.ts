import { ASTNode } from '../types';
import { BigFraction } from '../numeric/rational';

export type EquationClassification =
  | { kind: 'LINEAR'; varName: string; lhs: ASTNode; rhs: ASTNode }
  | { kind: 'QUADRATIC'; varName: string; lhs: ASTNode; rhs: ASTNode }
  | { kind: 'PROPORTION'; varName: string; lhsNum: ASTNode; lhsDen: ASTNode; rhsNum: ASTNode; rhsDen: ASTNode }
  | { kind: 'POWER'; varName: string; exponent: number; constant: BigFraction }
  | { kind: 'UNSUPPORTED'; reason: string; suggestion?: string };

export interface NormalizedPolynomial {
  // Coeffs index = power: c0 + c1*x + c2*x^2 + ...
  coeffs: BigFraction[];
  degree: number;
}
