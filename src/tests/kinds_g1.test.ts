import { describe, it, expect } from 'vitest';
import { evaluate, createInitialEnvironment } from '../core/evaluator';
import { formatKind } from '../core/kinds';
import { KindValue } from '../core/types';

describe('Gate G1: Mathematical Kinds & Lattice', () => {
  const run = (code: string) => {
    const env = createInitialEnvironment();
    return evaluate(code, env);
  };

  const getKindStr = (code: string) => {
    const res = run(`kindof(${code})`);
    expect(res.value.type).toBe('kind');
    return formatKind((res.value as KindValue).kind);
  };

  it('evaluates kindof() correctly on 20 diverse expressions', () => {
    const testCases: [string, string][] = [
      // 1. Natural integer
      ['42', 'Scalar(Natural)'],
      // 2. Negative integer
      ['-15', 'Scalar(Integer)'],
      // 3. Rational fraction
      ['22/7', 'Scalar(Rational)'],
      // 4. Decimal rational
      ['0.75', 'Scalar(Rational)'],
      // 5. Floating-point real
      ['float(3.14159)', 'Scalar(Real)'],
      // 6. Transcendental constant
      ['pi', 'Scalar(Real)'],
      // 7. Vector from tuple
      ['(1, 2, 3)', 'Vector(dim=3, field=R)'],
      // 8. Vector from list
      ['[10, 20]', 'Vector(dim=2, field=R)'],
      // 9. 4D Vector
      ['(1, 0, 0, 1)', 'Vector(dim=4, field=R)'],
      // 10. Matrix 2x2
      ['matrix([[1, 2], [3, 4]])', 'Matrix(shape=2x2, field=R)'],
      // 11. Matrix 3x2
      ['matrix([[1, 0], [0, 1], [1, 1]])', 'Matrix(shape=3x2, field=R)'],
      // 12. Closed Interval
      ['1..10', 'Interval(closed, [1..10])'],
      // 13. Standard Reals Set
      ['R', 'Set(\u211d)'],
      // 14. Standard Complexes Set
      ['C', 'Set(\u2102)'],
      // 15. Standard Integers Set
      ['Z', 'Set(\u2124)'],
      // 16. Standard Rationals Set
      ['Q', 'Set(\u211a)'],
      // 17. Standard Naturals Set
      ['N', 'Set(\u2115)'],
      // 18. Lambda function
      ['x -> x^2', 'Function(Scalar(Real) -> Scalar(Real))'],
      // 19. Boolean truth value
      ['true', 'Scalar(Natural)'],
      // 20. Evaluated scalar arithmetic
      ['sin(0.5) * exp(2.0)', 'Scalar(Real)'],
    ];

    expect(testCases.length).toBe(20);

    for (const [expr, expectedKind] of testCases) {
      const actualKind = getKindStr(expr);
      expect(actualKind).toBe(expectedKind);
    }
  });

  it('reports operational admissibility with admits()', () => {
    const resVec = run('admits([1, 2, 3])');
    expect(resVec.value.type).toBe('list');
    const vecOps = (resVec.value as any).elements.map((e: any) => e.value);
    expect(vecOps).toContain('+');
    expect(vecOps.some((op: string) => op.includes('dot'))).toBe(true);

    const resScalar = run('admits(42)');
    expect(resScalar.value.type).toBe('list');
    const scalarOps = (resScalar.value as any).elements.map((e: any) => e.value);
    expect(scalarOps).toContain('sin');
    expect(scalarOps).toContain('sqrt');
  });

  it('checks and executes kind coercions with coerce()', () => {
    // Column vector coercion to matrix
    const resCoerce = run('coerce([1, 2, 3], to: matrix([[1], [2], [3]]))');
    expect(resCoerce.value.type).toBe('list');

    // Incompatible coercion fails with precise reason
    expect(() => run('coerce(R, to: (1, 2, 3))')).toThrowError(/Cannot coerce Set\(.*\)/);
  });

  it('kind checking catches real errors naming both kinds and the operation', () => {
    // 1. Vector added to scalar -> error naming both kinds and addition
    expect(() => run('[1, 2, 3] + 5')).toThrowError(
      /Cannot add (Vector\(dim=3, field=R\)|Scalar\(Natural\)) to (Vector\(dim=3, field=R\)|Scalar\(Natural\)): addition requires matching kinds/
    );

    // 2. Scalar added to vector -> error naming both kinds
    expect(() => run('5 + [1, 2, 3]')).toThrowError(
      /Cannot add (Vector\(dim=3, field=R\)|Scalar\(Natural\)) to (Vector\(dim=3, field=R\)|Scalar\(Natural\)): addition requires matching kinds/
    );

    // 3. 3-vector dotted with 2-vector -> error naming both dimensions
    expect(() => run('inner([1, 2, 3], [4, 5])')).toThrowError(
      /Cannot compute inner product of Vector\(dim=3, field=R\) and Vector\(dim=2, field=R\): dimension mismatch \(3 vs 2\)/
    );

    // 4. Sin of a vector -> error naming Vector kind and Scalar domain
    expect(() => run('sin([1, 2, 3])')).toThrowError(
      /Cannot apply sin to Vector\(dim=3, field=R\): sin has domain Scalar/
    );

    // 5. Sqrt of a vector -> error naming Vector kind and Scalar domain
    expect(() => run('sqrt((1, 4, 9))')).toThrowError(
      /Cannot apply sqrt to Vector\(dim=3, field=R\): sqrt has domain Scalar/
    );
  });
});
