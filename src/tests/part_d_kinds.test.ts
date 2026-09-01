import { describe, it, expect } from 'vitest';
import { evaluate } from '../core/evaluator';
import { createInitialEnvironment } from '../core/evaluator';
import { formatKind, kindSubsumes, admitsOperations } from '../core/kinds';

describe('Part D: User-Defined Kinds', () => {
  it('declares a user-defined kind with axioms marked as declared-not-verified (Gate D requirement)', () => {
    const env = createInitialEnvironment();
    const declSource =
      'kind LieAlgebra(dim, field) extends VectorSpace(dim, field) { operations: [bracket], axioms: ["antisymmetry", "Jacobi identity"] }';

    const { value: res } = evaluate(declSource, env);
    expect(res.type).toBe('described');
    if (res.type === 'described') {
      expect(res.meaning).toContain('axioms declared but not checked');
      expect(res.kind.name).toBe('UserDefined');
      if (res.kind.name === 'UserDefined') {
        expect(res.kind.kindName).toBe('LieAlgebra');
        expect(res.kind.params).toEqual(['dim', 'field']);
        expect(res.kind.extendsKind).toBe('VectorSpace');
        expect(res.kind.operations).toEqual(['bracket']);
        expect(res.kind.axioms).toEqual(['antisymmetry', 'Jacobi identity']);
        expect(res.kind.axiomsVerified).toBe(false);
      }
    }
  });

  it('user-defined kind appears in kindof() and formats with parameters and extends', () => {
    const env = createInitialEnvironment();
    const declSource =
      'L := kind LieAlgebra(dim, field) extends VectorSpace(dim, field) { operations: [bracket], axioms: ["antisymmetry", "Jacobi identity"] }';
    evaluate(declSource, env);

    const { value: kindVal } = evaluate('kindof(L)', env);
    expect(kindVal.type).toBe('kind');
    if (kindVal.type === 'kind') {
      const formatted = formatKind(kindVal.kind);
      expect(formatted).toBe('Kind(LieAlgebra(dim, field) extends VectorSpace)');
    }
  });

  it('participates in kind subsumption in the lattice and admits operations', () => {
    const env = createInitialEnvironment();
    const { value: res } = evaluate(
      'kind LieAlgebra(dim, field) extends VectorSpace(dim, field) { operations: [bracket], axioms: ["antisymmetry", "Jacobi identity"] }',
      env
    );
    if (res.type === 'described') {
      // Subsumption: LieAlgebra is subsumed by VectorSpace
      const vsKind = { name: 'VectorSpace' } as any;
      expect(kindSubsumes(vsKind, res.kind)).toBe(true);

      // Admits operations: declared + inherited
      const ops = admitsOperations(res.kind);
      expect(ops).toContain('bracket');
      expect(ops).toContain('+');
      expect(ops).toContain('scale');
    }
  });

  it('appears in kind error messages when invalid operations or coercions occur', () => {
    const env = createInitialEnvironment();
    evaluate(
      'L := kind LieAlgebra(dim, field) extends VectorSpace(dim, field) { operations: [bracket], axioms: ["antisymmetry", "Jacobi identity"] }',
      env
    );

    // Attempting invalid coercion from Scalar to LieAlgebra
    expect(() => evaluate('coerce(5, to: L)', env)).toThrowError(/Cannot coerce Scalar\(Natural\) to Kind\(LieAlgebra\(dim, field\) extends VectorSpace\)/);
  });
});
