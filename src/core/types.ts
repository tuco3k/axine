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
  | 'DOUBLE_INTEGRAL'
  | 'TRIPLE_INTEGRAL'
  | 'CONTOUR_INTEGRAL'
  | 'NABLA'
  | 'LAPLACIAN'
  | 'WEDGE'
  | 'HODGE_STAR'
  | 'TENSOR_PROD'
  | 'DIRECT_SUM'
  | 'LANGLE'
  | 'RANGLE'
  | 'NORM_BAR'
  | 'FLOOR_L'
  | 'FLOOR_R'
  | 'CEIL_L'
  | 'CEIL_R'
  | 'FORALL'
  | 'EXISTS'
  | 'EXISTS_UNIQUE'
  | 'SET_IN'
  | 'SET_NOTIN'
  | 'SET_SUBSET'
  | 'SET_SUBSETEQ'
  | 'SET_UNION'
  | 'SET_INTERSECT'
  | 'SET_DIFF'
  | 'ISO'
  | 'HOMOTOPY'
  | 'EQUIV'
  | 'DAGGER'
  | 'BAR_SEP'
  | 'FAT_ARROW' // =>
  | 'RECORD'
  | 'WITH'
  | 'DIMENSION'
  | 'UNIT'
  | 'OPERATOR'
  | 'PREFIX'
  | 'POSTFIX'
  | 'INFIX'
  | 'PRECEDENCE'
  | 'ASSOCIATIVITY'
  | 'KIND'
  | 'EXTENDS'
  | 'OPERATIONS'
  | 'AXIOMS'
  | 'RULE'
  | 'REQUIRES'
  | 'MODULE'
  | 'EXPORT'
  | 'IMPORT'
  | 'FROM'
  | 'AS'
  | 'IS'
  | 'CUSTOM_OP'
  | 'VIEW'
  | 'FOR'
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
  | MemberAccessNode
  | RegionIntegralNode
  | NablaOpNode
  | DifferentialFormOpNode
  | TensorOpNode
  | BracketOpNode
  | QuantifierNode
  | SetOpNode
  | SetBuilderNode
  | EquivalenceNode
  | DecoratedIdentifierNode
  | MatrixPostfixNode
  | ProbabilityNode
  | RecordDefNode
  | RecordWithNode
  | DimensionDeclNode
  | UnitDeclNode
  | OperatorDeclNode
  | KindDeclNode
  | RuleDeclNode
  | ModuleDeclNode
  | ImportNode
  | ExportNode
  | ViewDeclNode;

export interface RecordDefNode {
  type: 'RecordDef';
  name?: string;
  fields: string[];
  span: Span;
}

export interface RecordWithNode {
  type: 'RecordWith';
  target: ASTNode;
  updates: { name: string; value: ASTNode }[];
  span: Span;
}

export interface DimensionDeclNode {
  type: 'DimensionDecl';
  dimensions: string[];
  span: Span;
}

export interface UnitDeclNode {
  type: 'UnitDecl';
  name: string;
  dimension?: string;
  definition?: ASTNode;
  span: Span;
}

export interface OperatorDeclNode {
  type: 'OperatorDecl';
  op: string;
  fixity: 'infix' | 'prefix' | 'postfix';
  params: string[];
  body: ASTNode;
  precedence?: number;
  associativity?: 'left' | 'right';
  span: Span;
}

export interface KindDeclNode {
  type: 'KindDecl';
  name: string;
  params: string[];
  extendsKind?: { name: string; args: string[] };
  operations: string[];
  axioms: string[];
  span: Span;
}

export interface RuleDeclNode {
  type: 'RuleDecl';
  name?: string;
  pattern: ASTNode;
  replacement: ASTNode;
  requires?: ASTNode;
  span: Span;
}

export interface ModuleDeclNode {
  type: 'ModuleDecl';
  name: string;
  span: Span;
}

export interface ImportNode {
  type: 'Import';
  path: string;
  asName?: string;
  importedSymbols?: string[];
  span: Span;
}

export interface ExportNode {
  type: 'Export';
  symbols: string[];
  span: Span;
}

export interface ViewDeclNode {
  type: 'ViewDecl';
  targetType: string;
  viewFunction: ASTNode;
  span: Span;
}

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
  op: '-' | '+' | '\u221a' | 'not' | string;
  operand: ASTNode;
  span: Span;
}

export interface BinaryOpNode {
  type: 'BinaryOp';
  op: '+' | '-' | '*' | '/' | '%' | '^' | '=' | '==' | '!=' | '<' | '<=' | '>' | '>=' | 'in' | 'and' | 'or' | string;
  left: ASTNode;
  right: ASTNode;
  isImplicit?: boolean;
  span: Span;
}

export interface PostfixOpNode {
  type: 'PostfixOp';
  op: '!' | 'superscript' | string;
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

export interface RegionIntegralNode {
  type: 'RegionIntegral';
  integralType: 'single' | 'double' | 'triple' | 'contour' | 'surface';
  region: ASTNode;
  integrand: ASTNode;
  differential: string;
  span: Span;
}

export interface NablaOpNode {
  type: 'NablaOp';
  op: 'grad' | 'div' | 'curl' | 'laplacian';
  target: ASTNode;
  span: Span;
}

export interface DifferentialFormOpNode {
  type: 'DifferentialFormOp';
  op: 'exterior_derivative' | 'wedge' | 'hodge_star';
  operands: ASTNode[];
  span: Span;
}

export interface TensorOpNode {
  type: 'TensorOp';
  op: 'tensor' | 'direct_sum';
  left: ASTNode;
  right: ASTNode;
  span: Span;
}

export interface BracketOpNode {
  type: 'BracketOp';
  op: 'inner_product' | 'norm' | 'floor' | 'ceil' | 'abs' | 'card';
  operands: ASTNode[];
  span: Span;
}

export interface QuantifierNode {
  type: 'Quantifier';
  quantifier: 'forall' | 'exists' | 'exists_unique';
  variable: string;
  domain: ASTNode;
  predicate: ASTNode;
  span: Span;
}

export interface SetOpNode {
  type: 'SetOp';
  op: 'union' | 'intersect' | 'setminus' | 'subset' | 'subseteq' | 'in' | 'notin';
  left: ASTNode;
  right: ASTNode;
  span: Span;
}

export interface SetBuilderNode {
  type: 'SetBuilder';
  variable: string;
  domain: ASTNode;
  predicate: ASTNode;
  span: Span;
}

export interface EquivalenceNode {
  type: 'Equivalence';
  relation: 'iso' | 'homotopy' | 'equiv';
  left: ASTNode;
  right: ASTNode;
  span: Span;
}

export interface DecoratedIdentifierNode {
  type: 'DecoratedIdentifier';
  decoration: 'bar' | 'hat' | 'dot' | 'ddot';
  name: string;
  span: Span;
}

export interface MatrixPostfixNode {
  type: 'MatrixPostfix';
  op: 'transpose' | 'adjoint' | 'inverse';
  target: ASTNode;
  span: Span;
}

export interface ProbabilityNode {
  type: 'Probability';
  op: 'prob' | 'expect' | 'variance' | 'covariance';
  event: ASTNode;
  condition?: ASTNode;
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

import { MathKind } from './kinds';

export type ObstructionReason =
  | 'needs-parameterization'
  | 'needs-basis'
  | 'not-elementary'
  | 'undecidable'
  | 'unimplemented-technique'
  | 'requires-proof'
  | 'infinite-object'
  | 'ill-posed';

export type UnknownReason =
  | 'budget-exhausted'
  | 'not-finitely-checkable'
  | 'search-incomplete'
  | 'no-convergence'
  | 'undefined-at-point'
  | 'requires-unavailable-theory'
  | ObstructionReason;

export interface UnknownValue {
  type: 'unknown';
  reason: UnknownReason;
  detail?: string;
}

export interface KindValue {
  type: 'kind';
  kind: MathKind;
}

export interface SetValue {
  type: 'set_value';
  elementKind: MathKind;
  standardName?: string;
  isInfinite?: boolean;
  predicate?: ASTNode;
  elements?: Value[];
}

export interface DifferentialFormValue {
  type: 'differential_form';
  degree: number;
  manifold?: string;
  expression?: ASTNode;
}

export interface VectorFieldValue {
  type: 'vector_field';
  domain: string;
  dimension: number | string;
  components?: ASTNode[];
}

export interface DistributionValue {
  type: 'distribution';
  support: string;
  family?: string;
}

export interface AlgebraicStructureValue {
  type: 'algebraic_structure';
  structureType: 'Field' | 'Ring' | 'Group';
  name: string;
  carrierSet: string;
  axioms: string[];
}

export interface DescribedValue {
  type: 'described';
  kind: MathKind;
  operation: string;
  namedOperation?: string;
  meaning: string;
  meaningInWords?: string;
  obstruction: ObstructionReason;
  requires: string | string[];
  canDo: string | string[];
  related?: string | string[];
  ast?: ASTNode;
  provenance?: 'user-rule' | 'builtin' | string;
  rulesFired?: string[];
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
  | 'lhopitals-rule'
  | 'separation-of-variables'
  | 'integrate-both-sides'
  | 'exponentiate'
  | 'initial-condition';

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

export interface RecordValue {
  type: 'record';
  typeName: string;
  fields: Record<string, Value>;
}

export interface RecordConstructorValue {
  type: 'record_constructor';
  name: string;
  fieldNames: string[];
}

export interface QuantityValue {
  type: 'quantity';
  magnitude: Value;
  unit: string;
  dimensions: Record<string, number>; // e.g. { length: 1, time: -1 }
}

export interface ModuleValue {
  type: 'module';
  name: string;
  exports: Record<string, Value>;
}

export interface TrajectorySample {
  t: number;
  state: Value;
}

export interface TrajectoryValue {
  type: 'trajectory';
  stateKind: string;
  tStart: number;
  tEnd: number;
  samples: TrajectorySample[];
  sourceInfo: {
    source: 'simulate' | 'ode' | 'closed_form';
    integrator?: string;
    dt?: number;
    errorEstimate?: number;
    energyDrift?: number;
    symbolicDerivation?: DerivationValue;
  };
  units?: {
    timeUnit?: string;
    stateUnits?: Record<string, string>;
  };
}

export type DrawingPrimitiveKind =
  | 'point'
  | 'segment'
  | 'arrow'
  | 'circle'
  | 'polygon'
  | 'path'
  | 'patch'
  | 'label'
  | 'field';

export interface DrawingPrimitiveValue {
  type: 'drawing_primitive';
  primitive: DrawingPrimitiveKind;
  params: Record<string, any>;
  units?: Record<string, string>;
}

export interface SceneValue {
  type: 'scene';
  primitives: DrawingPrimitiveValue[];
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
  | StringValue
  | KindValue
  | SetValue
  | DifferentialFormValue
  | VectorFieldValue
  | DistributionValue
  | AlgebraicStructureValue
  | DescribedValue
  | RecordValue
  | RecordConstructorValue
  | QuantityValue
  | ModuleValue
  | TrajectoryValue
  | DrawingPrimitiveValue
  | SceneValue;

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
