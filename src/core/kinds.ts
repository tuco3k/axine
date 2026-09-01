/**
 * Mathematical Kind Lattice System
 * 
 * Provides an ontological kind lattice orthogonal to runtime storage representations.
 * Kinds model mathematical entities with subsumption, allowed operations, and coercion rules.
 */

import { Value } from './types';

export type ScalarSubtype = 'natural' | 'integer' | 'rational' | 'real' | 'complex';

export interface ScalarKind {
  name: 'Scalar';
  subtype: ScalarSubtype;
}

export interface VectorKind {
  name: 'Vector';
  dimension: number | string;
  baseField: string;
}

export interface MatrixKind {
  name: 'Matrix';
  rows: number | string;
  cols: number | string;
  baseField: string;
}

export interface LinearMapKind {
  name: 'LinearMap';
  domain: string;
  codomain: string;
}

export interface FunctionKind {
  name: 'Function';
  domain: MathKind;
  codomain: MathKind;
}

export interface SetKind {
  name: 'Set';
  elementKind: MathKind;
  isInfinite?: boolean;
  standardName?: string;
}

export interface SequenceKind {
  name: 'Sequence';
  elementKind: MathKind;
  indexSet: string;
}

export interface IntervalKind {
  name: 'Interval';
  boundaryType: 'open' | 'closed' | 'half-open';
  start?: number | string;
  end?: number | string;
}

export interface AlgebraicStructureKind {
  name: 'Field' | 'Ring' | 'Group';
  structureName: string;
  carrierSet: string;
  axioms: string[];
}

export interface VectorFieldKind {
  name: 'VectorField';
  domain: string;
  dimension: number | string;
}

export interface ScalarFieldKind {
  name: 'ScalarField';
  domain: string;
}

export interface DifferentialFormKind {
  name: 'DifferentialForm';
  degree: number;
  manifold?: string;
}

export interface ManifoldKind {
  name: 'Manifold';
  dimension: number;
  oriented?: boolean;
}

export interface MeasureKind {
  name: 'Measure';
  space: string;
}

export interface DistributionKind {
  name: 'Distribution';
  support: string;
  family?: string;
}

export interface RecordKind {
  name: 'Record';
  typeName: string;
  fields: Record<string, MathKind>;
}

export interface UserDefinedKind {
  name: 'UserDefined';
  kindName: string;
  params: string[];
  extendsKind?: string;
  operations: string[];
  axioms: string[];
  axiomsVerified: boolean;
}

export interface QuantityKind {
  name: 'Quantity';
  dimensions: Record<string, number>;
  unit: string;
}

export interface UnknownKind {
  name: 'UnknownKind';
  description?: string;
}

export type MathKind =
  | ScalarKind
  | VectorKind
  | MatrixKind
  | LinearMapKind
  | FunctionKind
  | SetKind
  | SequenceKind
  | IntervalKind
  | AlgebraicStructureKind
  | VectorFieldKind
  | ScalarFieldKind
  | DifferentialFormKind
  | ManifoldKind
  | MeasureKind
  | DistributionKind
  | RecordKind
  | UserDefinedKind
  | QuantityKind
  | UnknownKind;

/**
 * String format of a mathematical kind including parameters.
 */
export function formatKind(kind: MathKind): string {
  switch (kind.name) {
    case 'Scalar':
      return `Scalar(${kind.subtype.charAt(0).toUpperCase() + kind.subtype.slice(1)})`;
    case 'Vector':
      return `Vector(dim=${kind.dimension}, field=${kind.baseField})`;
    case 'Matrix':
      return `Matrix(shape=${kind.rows}x${kind.cols}, field=${kind.baseField})`;
    case 'LinearMap':
      return `LinearMap(${kind.domain} -> ${kind.codomain})`;
    case 'Function':
      return `Function(${formatKind(kind.domain)} -> ${formatKind(kind.codomain)})`;
    case 'Set':
      if (kind.standardName) return `Set(${kind.standardName})`;
      return `Set(of=${formatKind(kind.elementKind)}${kind.isInfinite ? ', infinite' : ''})`;
    case 'Sequence':
      return `Sequence(of=${formatKind(kind.elementKind)}, indexSet=${kind.indexSet})`;
    case 'Interval':
      return `Interval(${kind.boundaryType}${kind.start !== undefined ? `, [${kind.start}..${kind.end}]` : ''})`;
    case 'Field':
    case 'Ring':
    case 'Group':
      return `${kind.name}(${kind.structureName}, carrier=${kind.carrierSet})`;
    case 'VectorField':
      return `VectorField(dim=${kind.dimension}, over=${kind.domain})`;
    case 'ScalarField':
      return `ScalarField(over=${kind.domain})`;
    case 'DifferentialForm':
      return `DifferentialForm(degree=${kind.degree}${kind.manifold ? `, on=${kind.manifold}` : ''})`;
    case 'Manifold':
      return `Manifold(dim=${kind.dimension}${kind.oriented !== undefined ? `, oriented=${kind.oriented}` : ''})`;
    case 'Measure':
      return `Measure(on=${kind.space})`;
    case 'Distribution':
      return `Distribution(support=${kind.support}${kind.family ? `, family=${kind.family}` : ''})`;
    case 'Record': {
      const fieldEntries = Object.entries(kind.fields)
        .map(([k, v]) => `${k}: ${formatKind(v)}`)
        .join(', ');
      return `Record(${kind.typeName}${fieldEntries ? ` { ${fieldEntries} }` : ''})`;
    }
    case 'UserDefined': {
      const paramStr = kind.params.length > 0 ? `(${kind.params.join(', ')})` : '';
      const extendsStr = kind.extendsKind ? ` extends ${kind.extendsKind}` : '';
      return `Kind(${kind.kindName}${paramStr}${extendsStr})`;
    }
    case 'Quantity': {
      return `Quantity(unit=${kind.unit})`;
    }
    case 'UnknownKind':
      return `UnknownKind(${kind.description || 'unspecified'})`;
  }
}

const SCALAR_LATTICE_RANK: Record<ScalarSubtype, number> = {
  natural: 1,
  integer: 2,
  rational: 3,
  real: 4,
  complex: 5,
};

/**
 * Checks subsumption in the kind lattice: whether target subsumes source.
 */
export function kindSubsumes(target: MathKind, source: MathKind): boolean {
  if (target.name === source.name) {
    if (target.name === 'Scalar' && source.name === 'Scalar') {
      return SCALAR_LATTICE_RANK[target.subtype] >= SCALAR_LATTICE_RANK[source.subtype];
    }
    if (target.name === 'Vector' && source.name === 'Vector') {
      return target.dimension === source.dimension && target.baseField === source.baseField;
    }
    if (target.name === 'Matrix' && source.name === 'Matrix') {
      return target.rows === source.rows && target.cols === source.cols;
    }
    if (target.name === 'Set' && source.name === 'Set') {
      return kindSubsumes(target.elementKind, source.elementKind);
    }
    if (target.name === 'Record' && source.name === 'Record') {
      if (target.typeName !== source.typeName && target.typeName !== 'Record') return false;
      for (const [k, v] of Object.entries(target.fields)) {
        if (!source.fields[k] || !kindSubsumes(v, source.fields[k])) return false;
      }
      return true;
    }
    if (target.name === 'UserDefined' && source.name === 'UserDefined') {
      return target.kindName === source.kindName;
    }
    return true;
  }

  // Vector is a LinearMap from baseField^dim to baseField
  if (target.name === 'LinearMap' && source.name === 'Matrix') {
    return true;
  }

  if (target.name === 'LinearMap' && source.name === 'Vector') {
    return true;
  }

  // User-defined kinds with extends
  if (source.name === 'UserDefined' && source.extendsKind) {
    if (target.name === source.extendsKind) return true;
    if (target.name === 'UserDefined' && target.kindName === source.extendsKind) return true;
  }

  return false;
}

/**
 * Returns the list of mathematical operations admitted by a given kind.
 */
export function admitsOperations(kind: MathKind): string[] {
  switch (kind.name) {
    case 'Scalar':
      return ['+', '-', '*', '/', '^', 'abs', 'round', 'floor', 'ceil', 'sqrt', 'sin', 'cos', 'exp', 'ln'];
    case 'Vector':
      return ['+', '-', 'dot (\u00b7)', 'cross (\u00d7)', 'norm (|\u22c5|)', 'scale', 'dimension'];
    case 'Matrix':
      return ['+', '-', 'matmul (*)', 'scale', 'transpose (^T)', 'inverse (^-1)', 'det', 'trace', 'eigenvalues', 'rank'];
    case 'LinearMap':
      return ['+', '-', 'compose (*)', 'apply', 'inverse (^-1)', 'kernel', 'image'];
    case 'Function':
      return ['apply', 'compose', 'diff (d//dx)', 'integrate (\u222b)', 'limit'];
    case 'Set':
      return ['union (\u222a)', 'intersect (\u2229)', 'setminus (\u2216)', 'subset (\u2282)', 'subseteq (\u2286)', 'in (\u2208)', 'notin (\u2209)', 'card (|S|)'];
    case 'Sequence':
      return ['index ([i])', 'take', 'drop', 'map', 'filter', 'sum', 'limit (as n->inf)'];
    case 'Interval':
      return ['in (\u2208)', 'subset (\u2282)', 'length', 'endpoints', 'union (\u222a)', 'intersect (\u2229)'];
    case 'Field':
    case 'Ring':
    case 'Group':
      return ['elements', 'operation (+, *)', 'identity', 'inverse', 'homomorphism', 'subgroup'];
    case 'VectorField':
      return ['+', '-', 'div (\u2207\u00b7)', 'curl (\u2207\u00d7)', 'lie_derivative', 'integrate (\u222e, \u222c)'];
    case 'ScalarField':
      return ['+', '-', '*', 'grad (\u2207)', 'laplacian (\u2207\u00b2)', 'integrate'];
    case 'DifferentialForm':
      return ['+', '-', 'wedge (\u2227)', 'exterior_derivative (d)', 'hodge_star (\u22c6)', 'integrate (\u222b_M)'];
    case 'Manifold':
      return ['boundary (\u2202)', 'tangent_space', 'chart', 'orient', 'triangulate'];
    case 'Measure':
      return ['integrate (\u222b_X f d\u03bc)', 'total_measure', 'pushforward'];
    case 'Distribution':
      return ['prob (P)', 'expectation (E)', 'variance (Var)', 'sample', 'pdf', 'cdf'];
    case 'Record':
      return ['field_access (.)', 'with_update (with)', 'equality (=, !=)'];
    case 'UserDefined':
      return kind.operations.length > 0 ? kind.operations : ['inspect'];
    case 'Quantity':
      return ['+', '-', '*', '/', '^', 'convert'];
    case 'UnknownKind':
      return ['inspect', 'describe'];
  }
}

/**
 * Determines whether coercion is possible from one kind to another.
 */
export function canCoerceKind(from: MathKind, to: MathKind): { canCoerce: boolean; reason?: string } {
  if (kindSubsumes(to, from)) {
    return { canCoerce: true };
  }

  if (from.name === 'Scalar' && to.name === 'Vector') {
    return { canCoerce: false, reason: `Cannot coerce Scalar to Vector: dimension unspecified` };
  }

  if (from.name === 'Vector' && to.name === 'Matrix') {
    return { canCoerce: true }; // Column vector [N x 1] matrix
  }

  if (from.name === 'Matrix' && to.name === 'LinearMap') {
    return { canCoerce: true };
  }

  if (from.name === 'Set' && to.name === 'Distribution') {
    return { canCoerce: false, reason: `Cannot coerce Set to Distribution: requires probability measure on carrier set` };
  }

  return {
    canCoerce: false,
    reason: `Cannot coerce ${formatKind(from)} to ${formatKind(to)}: kinds are incompatible in the mathematical lattice`,
  };
}

/**
 * Infers the mathematical kind of an evaluated runtime value.
 */
export function inferKindOfValue(val: Value): MathKind {
  switch (val.type) {
    case 'rational':
      if (val.d === 1n) {
        if (val.n >= 0n) return { name: 'Scalar', subtype: 'natural' };
        return { name: 'Scalar', subtype: 'integer' };
      }
      return { name: 'Scalar', subtype: 'rational' };
    case 'float':
      return { name: 'Scalar', subtype: 'real' };
    case 'boolean':
      return { name: 'Scalar', subtype: 'natural' }; // 0 or 1 in Boolean algebra
    case 'matrix':
      return { name: 'Matrix', rows: val.rows, cols: val.cols, baseField: 'R' };
    case 'list': {
      if (val.elements.length > 0 && val.elements.every(e => e.type === 'rational' || e.type === 'float')) {
        return { name: 'Vector', dimension: val.elements.length, baseField: 'R' };
      }
      return { name: 'Sequence', elementKind: { name: 'Scalar', subtype: 'real' }, indexSet: 'N' };
    }
    case 'tuple': {
      return { name: 'Vector', dimension: val.elements.length, baseField: 'R' };
    }
    case 'range':
      return { name: 'Interval', boundaryType: 'closed', start: val.start, end: val.end };
    case 'function':
    case 'lambda':
      return {
        name: 'Function',
        domain: { name: 'Scalar', subtype: 'real' },
        codomain: { name: 'Scalar', subtype: 'real' },
      };
    case 'derivation':
      return { name: 'Scalar', subtype: 'real' };
    case 'graph':
    case 'graph_type':
      return { name: 'Manifold', dimension: 2, oriented: true };
    case 'kind':
      return val.kind;
    case 'set_value':
      return { name: 'Set', elementKind: val.elementKind, standardName: val.standardName, isInfinite: val.isInfinite };
    case 'differential_form':
      return { name: 'DifferentialForm', degree: val.degree, manifold: val.manifold };
    case 'vector_field':
      return { name: 'VectorField', domain: val.domain, dimension: val.dimension };
    case 'distribution':
      return { name: 'Distribution', support: val.support, family: val.family };
    case 'algebraic_structure':
      return { name: val.structureType, structureName: val.name, carrierSet: val.carrierSet, axioms: val.axioms };
    case 'described':
      return val.kind;
    case 'record': {
      const fieldKinds: Record<string, MathKind> = {};
      for (const [k, v] of Object.entries(val.fields)) {
        fieldKinds[k] = inferKindOfValue(v);
      }
      return {
        name: 'Record',
        typeName: val.typeName,
        fields: fieldKinds,
      };
    }
    case 'quantity': {
      return {
        name: 'Quantity',
        dimensions: val.dimensions,
        unit: val.unit,
      };
    }
    default:
      return { name: 'Scalar', subtype: 'real' };
  }
}
