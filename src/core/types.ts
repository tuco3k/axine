export interface Span {
  start: number;
  end: number;
  line: number;
  col: number;
}

export type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'IDENTIFIER'
  | 'IN'
  | 'STEP'
  | 'IF'
  | 'THEN'
  | 'ELSE'
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'ARROW' // ->
  | 'PLUS'
  | 'MINUS'
  | 'STAR'
  | 'SLASH' // /
  | 'DOUBLE_SLASH' // //
  | 'PERCENT'
  | 'CARET'
  | 'BANG'
  | 'ASSIGN' // :=
  | 'GLOBAL_ASSIGN' // :\u2261 or :==
  | 'DOT' // .
  | 'DOTDOT' // ..
  | 'EQ'     // = or ==
  | 'NEQ'    // != or \u2260
  | 'LT'     // <
  | 'LTE'    // <= or \u2264
  | 'GT'     // >
  | 'GTE'    // >= or \u2265
  | 'CONGRUENT' // \u2261
  | 'LPAREN' // (
  | 'RPAREN' // )
  | 'LBRACKET' // [
  | 'RBRACKET' // ]
  | 'LBRACE' // {
  | 'RBRACE' // }
  | 'COMMA'  // ,
  | 'COLON'  // :
  | 'SEMICOLON' // ;
  | 'SIGMA' // Σ
  | 'PI_PROD' // Π
  | 'INTEGRAL' // \u222b
  | 'DIFF_OP' // d//dx, \u2202//\u2202x, dy//dx
  | 'CLAIM'
  | 'SUPERSCRIPT_DIGITS' // ², ³, etc.
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  span: Span;
  leadingWhitespace: boolean;
}

export type ASTNode =
  | NumberLiteralNode
  | StringLiteralNode
  | IdentifierNode
  | UnaryOpNode
  | BinaryOpNode
  | PostfixOpNode
  | FunctionCallNode
  | AssignmentNode
  | GlobalAssignmentNode
  | FunctionDefNode
  | TupleNode
  | ListNode
  | RangeNode
  | IfNode
  | LambdaNode
  | NamedArgNode
  | BlockNode
  | DiffNode
  | BigOpNode
  | LimitNode
  | ClaimNode
  | IndexNode
  | MemberAccessNode;

export interface MemberAccessNode {
  type: 'MemberAccess';
  target: ASTNode;
  property: string;
  span: Span;
}

export interface IndexNode {
  type: 'Index';
  target: ASTNode;
  index: ASTNode;
  span: Span;
}

export interface NumberLiteralNode {
  type: 'NumberLiteral';
  raw: string;
  span: Span;
}

export interface StringLiteralNode {
  type: 'StringLiteral';
  value: string;
  span: Span;
}

export interface IdentifierNode {
  type: 'Identifier';
  name: string;
  span: Span;
}

export interface UnaryOpNode {
  type: 'UnaryOp';
  op: '-' | '+' | '\u221a' | 'not';
  operand: ASTNode;
  span: Span;
}

export interface BinaryOpNode {
  type: 'BinaryOp';
  op: '+' | '-' | '*' | '/' | '%' | '^' | '=' | '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'and' | 'or';
  left: ASTNode;
  right: ASTNode;
  isImplicit?: boolean;
  span: Span;
}

export interface PostfixOpNode {
  type: 'PostfixOp';
  op: '!' | 'superscript';
  operand: ASTNode;
  exponent?: bigint;
  span: Span;
}

export interface FunctionCallNode {
  type: 'FunctionCall';
  callee: string;
  args: ASTNode[];
  isBare?: boolean;
  span: Span;
}

export interface AssignmentNode {
  type: 'Assignment';
  target: string;
  value: ASTNode;
  span: Span;
}

export interface FunctionDefNode {
  type: 'FunctionDef';
  name: string;
  params: string[];
  body: ASTNode;
  span: Span;
}

export interface TupleNode {
  type: 'Tuple';
  elements: ASTNode[];
  span: Span;
}

export interface ListNode {
  type: 'List';
  elements: ASTNode[];
  span: Span;
}

export interface RangeNode {
  type: 'Range';
  variable: string;
  start: ASTNode;
  end: ASTNode;
  step?: ASTNode;
  span: Span;
}

export interface IfNode {
  type: 'If';
  condition: ASTNode;
  thenBranch: ASTNode;
  elseBranch: ASTNode;
  span: Span;
}

export interface LambdaNode {
  type: 'Lambda';
  params: string[];
  body: ASTNode;
  span: Span;
}

export interface NamedArgNode {
  type: 'NamedArg';
  name: string;
  value: ASTNode;
  span: Span;
}

export interface GlobalAssignmentNode {
  type: 'GlobalAssignment';
  target: string;
  value: ASTNode;
  span: Span;
}

export interface BlockNode {
  type: 'Block';
  statements: ASTNode[];
  span: Span;
}

export interface DiffNode {
  type: 'Diff';
  variable: string;
  expr: ASTNode;
  isPartial?: boolean;
  span: Span;
}

export interface BigOpNode {
  type: 'BigOp';
  op: 'sum' | 'prod' | 'integral';
  variable: string;
  start?: ASTNode;
  end?: ASTNode;
  body: ASTNode;
  span: Span;
}

export interface LimitNode {
  type: 'Limit';
  variable: string;
  target: ASTNode;
  direction: 'two-sided' | 'left' | 'right';
  expr: ASTNode;
  span: Span;
}

export interface ClaimNode {
  type: 'Claim';
  name: string;
  statement: string;
  provedBy: string;
  relevance: string;
  kind: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
  shadow: ASTNode;
  expect: ASTNode;
  span: Span;
}

// -----------------------------------------------------------------------------
// Values & Numeric Tower
// -----------------------------------------------------------------------------

export interface RationalValue {
  type: 'rational';
  n: bigint;
  d: bigint;
  notice?: string;
}

export interface FloatValue {
  type: 'float';
  value: number;
  notice?: string;
}

export interface BooleanValue {
  type: 'boolean';
  value: boolean;
}

export interface TupleValue {
  type: 'tuple';
  elements: Value[];
}

export interface ListValue {
  type: 'list';
  elements: Value[];
}

export interface NoneValue {
  type: 'none';
}

export type UnknownReason =
  | 'budget-exhausted'
  | 'not-finitely-checkable'
  | 'search-incomplete'
  | 'no-convergence'
  | 'undefined-at-point'
  | 'requires-unavailable-theory';

export interface UnknownValue {
  type: 'unknown';
  reason: UnknownReason;
  detail?: string;
}

export interface MatrixValue {
  type: 'matrix';
  rows: number;
  cols: number;
  data: Value[][];
}

export interface GraphTypeValue {
  type: 'graph_type';
  vertices: string[];
  edges: [string, string][];
}

export interface ClaimValue {
  type: 'claim';
  name: string;
  statement: string;
  provedBy: string;
  relevance: string;
  kind: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
  shadowVal: Value;
  expectVal: Value;
  verified: boolean;
  status?: 'PASS' | 'FAIL' | 'DIVERGED';
  fuelConsumed?: { steps: number; wallMs: number };
  span?: Span;
}

export interface RangeValue {
  type: 'range';
  variable: string;
  start: number;
  end: number;
  step?: number;
}

export interface FunctionValue {
  type: 'function';
  name: string;
  params: string[];
  body: ASTNode;
  closure: Record<string, Value>;
}

export interface LambdaValue {
  type: 'lambda';
  params: string[];
  body: ASTNode;
  closure: Record<string, Value>;
}

export interface BuiltinValue {
  type: 'builtin';
  name: string;
  fn: (args: Value[], env: Record<string, Value>, span: Span) => Value;
}

export interface CurveSeries {
  expr: ASTNode;
  variable: string;
  label: string;
  color?: string;
}

export interface GraphSpec {
  dimensionality: 1 | 2;
  kind: 'curve' | 'multi_curve' | 'parametric' | 'surface' | 'heatmap' | 'orbit' | 'pointcloud' | 'packing' | 'lattice' | 'raster' | 'spacetime';
  series: CurveSeries[];
  domain: { var: string; min: number; max: number; isDefault: boolean; step?: number };
  domainY?: { var: string; min: number; max: number; isDefault: boolean; step?: number };
  sharedAxisNote?: string;
  orbitData?: number[];
  pointCloudData?: [number, number, number][];
  spherePackingData?: { center: [number, number, number]; radius: number }[];
  latticeData?: { points: [number, number, number][]; edges: [number, number][] };
  rasterData?: boolean[][];
  parametric?: {
    xExpr: ASTNode;
    yExpr: ASTNode;
    zExpr?: ASTNode;
    param: string;
    paramV?: string;
    min: number;
    max: number;
    minV?: number;
    maxV?: number;
    step?: number;
  };
  surface?: {
    expr: ASTNode;
    varX: string;
    varY: string;
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
  };
  surfaces?: {
    expr: ASTNode;
    varX: string;
    varY: string;
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
  }[];
}

export interface GraphValue {
  type: 'graph';
  spec: GraphSpec;
}

export type StepRule =
  | 'distribute'
  | 'collect'
  | 'add-both-sides'
  | 'subtract-both-sides'
  | 'multiply-both-sides'
  | 'divide-both-sides'
  | 'cross-multiply'
  | 'take-root'
  | 'raise-power'
  | 'factor'
  | 'complete-square'
  | 'quadratic-formula'
  | 'cancel-common-factor'
  | 'evaluate-constant'
  | 'power-rule'
  | 'constant-rule'
  | 'constant-multiple-rule'
  | 'sum-rule'
  | 'difference-rule'
  | 'product-rule'
  | 'quotient-rule'
  | 'chain-rule'
  | 'sin-rule'
  | 'cos-rule'
  | 'tan-rule'
  | 'asin-rule'
  | 'acos-rule'
  | 'atan-rule'
  | 'sinh-rule'
  | 'cosh-rule'
  | 'tanh-rule'
  | 'exp-rule'
  | 'ln-rule'
  | 'log-base-rule'
  | 'logarithmic-differentiation'
  | 'negation-rule'
  | 'identity-rule'
  | 'general-exponential-rule'
  | 'sqrt-rule'
  | 'substitution'
  | 'factoring'
  | 'conjugate-multiplication'
  | 'lhopitals-rule';

export interface DerivationBranch {
  condition?: string;
  steps: DerivationStep[];
  result: Value;
}

export interface DerivationStep {
  before: string;
  after: string;
  rule: StepRule;
  operand?: string;
  target?: 'both-sides' | 'left' | 'right' | string;
  justification: string;
  sideCondition?: string;
  branches?: DerivationBranch[];
  equation?: string;
}

export interface DerivationValue {
  type: 'derivation';
  targetVar?: string;
  originalEquation: string;
  steps: DerivationStep[];
  result?: Value | Value[];
  roots: Value[];
  specialCase?: 'no-solution' | 'all-real' | 'none';
  verified: boolean;
  excludedRoots?: Value[];
  extraneousRoots?: Value[];
  originalExpr?: ASTNode;
  finalExpr?: ASTNode;
  originalExprString?: string;
  finalExprString?: string;
  ruleSequence?: string[];
}

export interface SolveTraceIteration {
  n: number;
  x: number;
  fx: number;
  error: number;
  low?: number;
  high?: number;
  mid?: number;
  fMid?: number;
  width?: number;
}

export interface SolveTraceValue {
  type: 'solve_trace';
  method: 'newton' | 'bisection';
  root: Value;
  iterations: SolveTraceIteration[];
}

export interface StepValue {
  type: 'step';
  before: string;
  after: string;
  rule: StepRule;
  operand?: string;
  target?: 'both-sides' | 'left' | 'right' | string;
  justification: string;
  sideCondition?: string;
  branches?: DerivationBranch[];
}

export interface DimensionValue {
  type: 'dimension';
  degrees: Record<string, number>;
  totalDegree: number;
  interpretation: string;
  isDimensionless: boolean;
}

export interface ExpressionValue {
  type: 'expression';
  ast: ASTNode;
  text: string;
}

export interface CheckResultValue {
  type: 'check_result';
  isValid: boolean;
  targetQuantity: string;
  actualDimension: number;
  actualInterpretation: string;
  actualCoeff: number;
  messageLines: string[];
  derivationSteps: { step: number; title: string; math: string; explanation: string }[];
  actualExprString: string;
}

export interface StringValue {
  type: 'string';
  value: string;
}

export type Value =
  | RationalValue
  | FloatValue
  | BooleanValue
  | TupleValue
  | ListValue
  | NoneValue
  | UnknownValue
  | MatrixValue
  | GraphTypeValue
  | ClaimValue
  | RangeValue
  | FunctionValue
  | LambdaValue
  | BuiltinValue
  | GraphValue
  | DerivationValue
  | StepValue
  | ExpressionValue
  | SolveTraceValue
  | DimensionValue
  | CheckResultValue
  | StringValue;

export type Environment = Record<string, Value>;

// -----------------------------------------------------------------------------
// Execution Fuel & Budget Limits
// -----------------------------------------------------------------------------

export interface FuelLimits {
  maxSteps: number;
  timeoutMs: number;
  maxDepth: number;
  maxBigIntDigits: number;
  maxMemoryElements: number;
}

export type BudgetLimits = FuelLimits;

export const DEFAULT_AMBIENT_FUEL: FuelLimits = {
  maxSteps: 2_000_000,
  timeoutMs: 250,
  maxDepth: 1_000,
  maxBigIntDigits: 100_000,
  maxMemoryElements: 10_000_000,
};

export const DEFAULT_INVOKED_FUEL: FuelLimits = {
  maxSteps: 100_000_000,
  timeoutMs: 10_000,
  maxDepth: 1_000,
  maxBigIntDigits: 100_000,
  maxMemoryElements: 10_000_000,
};

export const DEFAULT_BUDGET_LIMITS: BudgetLimits = DEFAULT_AMBIENT_FUEL;
