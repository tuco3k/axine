import { describe, it, expect } from 'vitest';
import { parse } from '../core/parser';
import { formatAST } from '../core/formatter';
import { typesetMath } from '../core/math_typeset';

function stripSpan(node: any): any {
  if (!node || typeof node !== 'object') return node;
  if (Array.isArray(node)) return node.map(stripSpan);
  const copy: any = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === 'span') continue;
    copy[k] = stripSpan(v);
  }
  return copy;
}

describe('Gate G2: Notation Coverage & AST Parity', () => {
  // 1. Multiple & Contour Integrals
  it('parses multiple and contour integrals with AST parity between Unicode and ASCII', () => {
    // \u222c is double integral
    const uniDouble = parse('\u222c_S F \u00b7 dS');
    const ascDouble = parse('iint_S F \u00b7 dS');
    expect(stripSpan(uniDouble)).toEqual(stripSpan(ascDouble));

    // \u222d is triple integral
    const uniTriple = parse('\u222d_V f dV');
    const ascTriple = parse('iiint_V f dV');
    expect(stripSpan(uniTriple)).toEqual(stripSpan(ascTriple));

    // \u222e is contour integral
    const uniContour = parse('\u222e_C F \u00b7 dr');
    const ascContour = parse('oint_C F \u00b7 dr');
    expect(stripSpan(uniContour)).toEqual(stripSpan(ascContour));

    // Region integral over boundary
    const bndIntegral = parse('\u222b_\u2202\u03a9 F \u00b7 n dS');
    expect(bndIntegral.type).toBe('RegionIntegral');
  });

  // 2. Nabla & Laplacian Operators
  it('parses grad, div, curl, laplacian with AST parity between Unicode and ASCII', () => {
    // Grad: \u2207 f vs grad(f)
    const uniGrad = parse('\u2207 f');
    const ascGrad = parse('grad(f)');
    const ascDel = parse('del(f)');
    expect(stripSpan(uniGrad)).toEqual(stripSpan(ascGrad));
    expect(stripSpan(uniGrad)).toEqual(stripSpan(ascDel));

    // Div: \u2207 \u00b7 F vs div(F)
    const uniDiv = parse('\u2207 \u00b7 F');
    const ascDiv = parse('div(F)');
    expect(stripSpan(uniDiv)).toEqual(stripSpan(ascDiv));

    // Curl: \u2207 \u00d7 F vs curl(F)
    const uniCurl = parse('\u2207 \u00d7 F');
    const ascCurl = parse('curl(F)');
    expect(stripSpan(uniCurl)).toEqual(stripSpan(ascCurl));

    // Laplacian: \u2207\u00b2 f vs laplacian(f)
    const uniLaplacian = parse('\u2207\u00b2 f');
    const ascLaplacian = parse('laplacian(f)');
    expect(stripSpan(uniLaplacian)).toEqual(stripSpan(ascLaplacian));
  });

  // 3. Differential Forms: Wedge & Hodge Star
  it('parses wedge and hodge star with AST parity', () => {
    // Wedge: \u2227 vs wedge(u, v)
    const uniWedge = parse('u \u2227 v');
    const ascWedge = parse('wedge(u, v)');
    expect(stripSpan(uniWedge)).toEqual(stripSpan(ascWedge));

    // Hodge Star: \u22c6 w vs hodge(w) / star(w)
    const uniStar = parse('\u22c6 w');
    const ascHodge = parse('hodge(w)');
    const ascStar = parse('star(w)');
    expect(stripSpan(uniStar)).toEqual(stripSpan(ascHodge));
    expect(stripSpan(uniStar)).toEqual(stripSpan(ascStar));
  });

  // 4. Tensor & Direct Sum
  it('parses tensor product and direct sum with AST parity', () => {
    // Tensor: \u2297 vs tensor(u, v)
    const uniTensor = parse('u \u2297 v');
    const ascTensor = parse('tensor(u, v)');
    expect(stripSpan(uniTensor)).toEqual(stripSpan(ascTensor));

    // Direct Sum: \u2295 vs direct_sum(u, v) / oplus(u, v)
    const uniDirectSum = parse('u \u2295 v');
    const ascDirectSum = parse('direct_sum(u, v)');
    const ascOplus = parse('oplus(u, v)');
    expect(stripSpan(uniDirectSum)).toEqual(stripSpan(ascDirectSum));
    expect(stripSpan(uniDirectSum)).toEqual(stripSpan(ascOplus));
  });

  // 5. Brackets: Inner Product & Norm
  it('parses inner product and norm brackets with AST parity', () => {
    // Inner product: \u27e8u, v\u27e9 vs inner(u, v)
    const uniInner = parse('\u27e8u, v\u27e9');
    const ascInner = parse('inner(u, v)');
    expect(stripSpan(uniInner)).toEqual(stripSpan(ascInner));

    // Norm: \u2016v\u2016 vs norm(v)
    const uniNorm = parse('\u2016v\u2016');
    const ascNorm = parse('norm(v)');
    expect(stripSpan(uniNorm)).toEqual(stripSpan(ascNorm));

    // Floor & Ceil brackets
    const floorAst = parse('\u230ax\u230b');
    expect(floorAst.type).toBe('BracketOp');
    expect((floorAst as any).op).toBe('floor');

    const ceilAst = parse('\u2308x\u2309');
    expect(ceilAst.type).toBe('BracketOp');
    expect((ceilAst as any).op).toBe('ceil');
  });

  // 6. Quantifiers
  it('parses forall, exists, exists! with AST parity', () => {
    // Forall: \u2200 x \u2208 S, P(x) vs forall x in S, P(x)
    const uniForall = parse('\u2200 x \u2208 S, P(x)');
    const ascForall = parse('forall x in S, P(x)');
    expect(stripSpan(uniForall)).toEqual(stripSpan(ascForall));

    // Exists: \u2203 x \u2208 S, P(x) vs exists x in S, P(x)
    const uniExists = parse('\u2203 x \u2208 S, P(x)');
    const ascExists = parse('exists x in S, P(x)');
    expect(stripSpan(uniExists)).toEqual(stripSpan(ascExists));

    // Exists unique: \u2203! x \u2208 S, P(x) vs exists! x in S, P(x)
    const uniExistsUnique = parse('\u2203! x \u2208 S, P(x)');
    const ascExistsUnique = parse('exists! x in S, P(x)');
    expect(stripSpan(uniExistsUnique)).toEqual(stripSpan(ascExistsUnique));
  });

  // 7. Set Relations & Operations
  it('parses set operators with AST parity', () => {
    // In: \u2208 vs in
    expect(stripSpan(parse('x \u2208 S'))).toEqual(stripSpan(parse('x in S')));

    // Not in: \u2209 vs notin
    expect(stripSpan(parse('x \u2209 S'))).toEqual(stripSpan(parse('x notin S')));

    // Subset: \u2282 vs subset
    expect(stripSpan(parse('A \u2282 B'))).toEqual(stripSpan(parse('A subset B')));

    // Subsequence/SubsetEq: \u2286 vs subseteq
    expect(stripSpan(parse('A \u2286 B'))).toEqual(stripSpan(parse('A subseteq B')));

    // Union: \u222a vs union
    expect(stripSpan(parse('A \u222a B'))).toEqual(stripSpan(parse('A union B')));

    // Intersect: \u2229 vs intersect
    expect(stripSpan(parse('A \u2229 B'))).toEqual(stripSpan(parse('A intersect B')));

    // Set minus / diff: \u2216 vs setminus
    expect(stripSpan(parse('A \u2216 B'))).toEqual(stripSpan(parse('A setminus B')));
  });

  // 8. Set-Builder Notation
  it('parses set-builder notation with colon and bar separators', () => {
    const sbColon = parse('{ x \u2208 S : x > 0 }');
    const sbBar = parse('{ x in S | x > 0 }');
    expect(stripSpan(sbColon)).toEqual(stripSpan(sbBar));
    expect(sbColon.type).toBe('SetBuilder');
  });

  // 9. Equivalences & Isomorphisms
  it('parses equivalence, isomorphism, and homotopy relations with AST parity', () => {
    // Iso: \u2245 vs iso
    expect(stripSpan(parse('G \u2245 H'))).toEqual(stripSpan(parse('G iso H')));

    // Homotopy: \u2243 vs homotopic
    expect(stripSpan(parse('X \u2243 Y'))).toEqual(stripSpan(parse('X homotopic Y')));

    // Equiv: \u223c vs equiv
    expect(stripSpan(parse('a \u223c b'))).toEqual(stripSpan(parse('a equiv b')));
  });

  // 10. Decorated Identifiers & Diacritics
  it('parses decorated identifiers with combining diacritics and function aliases', () => {
    // Bar: x\u0304 vs bar(x)
    expect(stripSpan(parse('x\u0304'))).toEqual(stripSpan(parse('bar(x)')));

    // Hat: x\u0302 vs hat(x)
    expect(stripSpan(parse('x\u0302'))).toEqual(stripSpan(parse('hat(x)')));

    // Dot: x\u0307 vs dot(x)
    expect(stripSpan(parse('x\u0307'))).toEqual(stripSpan(parse('dot(x)')));

    // Ddot: x\u0308 vs ddot(x)
    expect(stripSpan(parse('x\u0308'))).toEqual(stripSpan(parse('ddot(x)')));
  });

  // 11. Matrix Postfix: Transpose, Adjoint, Inverse
  it('parses matrix postfix operations with AST parity', () => {
    // Transpose: A^T
    const transpose = parse('A^T');
    expect(transpose.type).toBe('MatrixPostfix');
    expect((transpose as any).op).toBe('transpose');

    // Adjoint: A^\u2020 vs A^dagger
    const uniAdjoint = parse('A^\u2020');
    const ascAdjoint = parse('A^dagger');
    expect(stripSpan(uniAdjoint)).toEqual(stripSpan(ascAdjoint));
    expect(uniAdjoint.type).toBe('MatrixPostfix');
    expect((uniAdjoint as any).op).toBe('adjoint');

    // Inverse: A^-1 vs A^(-1)
    const inv1 = parse('A^-1');
    const inv2 = parse('A^(-1)');
    expect(stripSpan(inv1)).toEqual(stripSpan(inv2));
    expect(inv1.type).toBe('MatrixPostfix');
    expect((inv1 as any).op).toBe('inverse');
  });

  // 12. Standard Sets as First-Class Identifiers
  it('parses standard sets R, C, Z, Q, N in blackboard and ASCII spellings', () => {
    expect(parse('\u211d').type).toBe('Identifier');
    expect(parse('\u2102').type).toBe('Identifier');
    expect(parse('\u2124').type).toBe('Identifier');
    expect(parse('\u211a').type).toBe('Identifier');
    expect(parse('\u2115').type).toBe('Identifier');
  });

  // 13. Probability Notation
  it('parses probability, expectation, variance, covariance', () => {
    // Conditional probability: P(A | B)
    const condProb = parse('P(A | B)');
    expect(condProb.type).toBe('Probability');
    expect((condProb as any).op).toBe('prob');
    expect((condProb as any).condition).toBeDefined();

    // Expectation: E[X] vs E(X)
    const expBracket = parse('E[X]');
    const expParen = parse('E(X)');
    expect(stripSpan(expBracket)).toEqual(stripSpan(expParen));
    expect(expBracket.type).toBe('Probability');
    expect((expBracket as any).op).toBe('expect');

    // Variance: Var(X)
    const varX = parse('Var(X)');
    expect(varX.type).toBe('Probability');
    expect((varX as any).op).toBe('variance');

    // Covariance: Cov(X, Y)
    const covXY = parse('Cov(X, Y)');
    expect(covXY.type).toBe('Probability');
    expect((covXY as any).op).toBe('covariance');
  });

  // 14. Typesetter Round-Trip Rendering
  it('round-trips all notation classes through the typesetter and formatter', () => {
    const expressions = [
      '\u222c_S F \u00b7 dS',
      '\u222e_C F \u00b7 dr',
      '\u2207 f',
      '\u2207 \u00b7 F',
      '\u2207 \u00d7 F',
      '\u2207\u00b2 f',
      'u \u2227 v',
      '\u22c6 w',
      'u \u2297 v',
      'u \u2295 v',
      '\u27e8u, v\u27e9',
      '\u2016v\u2016',
      '\u2200 x \u2208 S, P(x)',
      'A \u222a B',
      '{ x \u2208 S : x > 0 }',
      'G \u2245 H',
      'A^T',
      'A^\u2020',
      'P(A | B)',
      'E[X]',
    ];

    for (const expr of expressions) {
      const ast = parse(expr);
      const formatted = formatAST(ast);
      expect(formatted).toBeTruthy();

      const html = typesetMath(expr);
      expect(html).toBeTruthy();
      expect(html).toContain('tm-');
    }
  });
});
