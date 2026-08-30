export interface CorpusDocument {
  id: string;
  title: string;
  category: 'Arithmetic' | 'Analysis' | 'Algebra' | 'Universality' | 'Geometry3D' | 'Claims';
  content: string;
}

export const CORPUS_DOCUMENTS: CorpusDocument[] = [
  {
    id: 'collatz',
    title: '1. Collatz Sequence Explorer',
    category: 'Arithmetic',
    content: `# Collatz Sequence Explorer
# Demonstrates user recursion, conditionals, iterate(), length, max, and sequence plotting
collatz(n) := if n % 2 == 0 then n / 2 else 3*n + 1
orbit27 := iterate(collatz, 27, until: 1, max: 200)
length orbit27
max orbit27
graph(orbit27)`
  },
  {
    id: 'basel',
    title: '2. The Basel Problem',
    category: 'Analysis',
    content: `# The Basel Problem: Sum of Inverse Squares
# Demonstrates bounded summation, exact rational arithmetic, and 300-digit threshold notice
sum(1/n^2, n in 1..10)
sum(1/n^2, n in 1..100)
sum(1/n^2, n in 1..1000)
float(pi^2 / 6)`
  },
  {
    id: 'logistic',
    title: '3. Logistic Map and Chaos',
    category: 'Analysis',
    content: `# Logistic Map and Chaos
# Demonstrates multi-parameter functions, lambdas, iterate(), and orbit visualization
f(r, x) := r * x * (1 - x)
orbit := iterate(x -> f(3.8, x), 0.5, n: 100)
last orbit
graph(orbit)`
  },
  {
    id: 'goldbach',
    title: '4. Goldbach\'s Conjecture Verification',
    category: 'Arithmetic',
    content: `# Goldbach's Conjecture Verification
# Demonstrates number theory (isprime), find(), quantification (all), and first-class none
goldbach(n) := find(p in 2..n, isprime p and isprime(n - p))
goldbach 28
goldbach 100
all(goldbach(2*k) != none, k in 2..50)`
  },
  {
    id: 'fibonacci',
    title: '5. Fibonacci Numbers and the Golden Ratio',
    category: 'Arithmetic',
    content: `# Fibonacci Numbers and the Golden Ratio
# Demonstrates memoized recursion, list comprehension/mapping, and convergence to phi
fib(n) := if n <= 1 then n else fib(n-1) + fib(n-2)
fib 10
fib 50
ratios := map(n -> fib(n+1) / fib(n), range(1..15))
last ratios
float phi`
  },
  {
    id: 'zeno',
    title: '6. Zeno\'s Paradox and Geometric Series',
    category: 'Analysis',
    content: `# Zeno's Paradox and Geometric Series
# Demonstrates bounded geometric summation, exact powers, and partial sum convergence
sum(1/2^n, n in 1..10)
sum(1/2^n, n in 1..50)
partial_sums := map(n -> sum(1/2^k, k in 1..n), range(1..20))
last partial_sums`
  },
  {
    id: 'newton',
    title: '7. Newton\'s Method and Root Finding',
    category: 'Analysis',
    content: `# Newton's Method and Bisection Root Finding
# Demonstrates solve(f, near: x0) and solve(expr, x in a..b)
f(x) := x^3 - 2*x - 5
solve(f, near: 2)
solve(x^3 - 2*x - 5, x in 2..3)
root := solve(f, near: 2)
f(root)`
  },
  {
    id: 'euler',
    title: '8. Euler\'s Formula and Identity',
    category: 'Analysis',
    content: `# Euler's Formula and Identity
# Demonstrates unsupported complex unit i diagnostic with pinpoint source underline
e^(i*pi) + 1`
  },
  {
    id: 'turing',
    title: '9. Turing Universality & Cellular Automata (turing.mathdoc)',
    category: 'Universality',
    content: `# Turing Universality & Cellular Automata
# 1. 3-state 2-symbol Busy Beaver BB(3) in finite steps producing 6 ones
{
  step_bb(state, sym) :=
    if state == 1 then
      (if sym == 0 then (2, 1, 1) else (0, 1, 1))
    else if state == 2 then
      (if sym == 0 then (3, 0, 1) else (2, 1, 1))
    else if state == 3 then
      (if sym == 0 then (3, 1, -1) else (1, 1, -1))
    else
      (0, sym, 0);

  run_bb(state, left, curr, right, steps) :=
    if state == 0 then
      (steps, curr + sum(left) + sum(right))
    else
      {
        trans := step_bb(state, curr);
        next_st := trans[0];
        w_sym := trans[1];
        dir := trans[2];
        if dir == 1 then
          run_bb(next_st, [w_sym] + left, if length right > 0 then first right else 0, if length right > 0 then drop(1, right) else [], steps + 1)
        else
          run_bb(next_st, if length left > 0 then drop(1, left) else [], if length left > 0 then first left else 0, [w_sym] + right, steps + 1)
      };

  run_bb(1, [], 0, [], 0)
}

# 2. Rule 110 Cellular Automaton (Turing Complete)
{
  rule110_step(l, c, r) :=
    if l == 1 and c == 1 and r == 1 then 0
    else if l == 1 and c == 1 and r == 0 then 1
    else if l == 1 and c == 0 and r == 1 then 1
    else if l == 1 and c == 0 and r == 0 then 0
    else if l == 0 and c == 1 and r == 1 then 1
    else if l == 0 and c == 1 and r == 0 then 1
    else if l == 0 and c == 0 and r == 1 then 1
    else 0;

  next_gen(cells) :=
    map(i -> rule110_step(if i > 0 then cells[i-1] else 0, cells[i], if i + 1 < length cells then cells[i+1] else 0), range(0..length(cells)-1));

  g0 := [0, 0, 0, 1, 0, 0, 0];
  g1 := next_gen(g0);
  g2 := next_gen(g1);
  g2
}`
  },
  {
    id: 'lambda',
    title: '10. Untyped Lambda Calculus & Combinators (lambda.mathdoc)',
    category: 'Universality',
    content: `# Pure Untyped Lambda Calculus
# Church Numeral Arithmetic: 3 * 4 = 12
{
  zero := f -> x -> x;
  succ := n -> f -> x -> f(n(f)(x));
  mult := m -> n -> f -> m(n(f));

  c1 := succ(zero);
  c2 := succ(c1);
  c3 := succ(c2);
  c4 := succ(c3);

  c12 := mult(c3)(c4);
  c12(n -> n + 1)(0)
}

# Fixed-point Y combinator calculating factorial: Y(F)(5) = 120
{
  Y(f) := (x -> f(y -> (x(x))(y)))(x -> f(y -> (x(x))(y)));
  fact_gen(recurse) := n -> if n <= 1 then 1 else n * recurse(n - 1);
  fact := Y(fact_gen);
  fact(5)
}`
  },
  {
    id: 'prime_gaps',
    title: '11. Prime Gap Distribution & Twin Primes',
    category: 'Arithmetic',
    content: `# Prime Gap Distribution
primes := filter(isprime, range(2..100))
twin_primes := filter(p -> isprime(p + 2), primes)
twin_primes
gaps := map(i -> primes[i+1] - primes[i], range(0..length(primes)-2))
graph(gaps)`
  },
  {
    id: 'matrix_diff',
    title: '12. Matrix Algebra & Differentials',
    category: 'Algebra',
    content: `# Matrix Determinant, Inverse, and Derivative
A := matrix([[4, 7], [2, 6]])
det(A)
trace(A)
invA := inverse(A)
A * invA

# Differential operator
x := 3
d//dx (x^4 - 2*x^2 + 5)`
  },
  {
    id: 'mandelbrot',
    title: '13. Mandelbrot & Julia Escape Time Map',
    category: 'Analysis',
    content: `# Mandelbrot Escape Dynamics
# Computes escape-time steps for sample coordinates
esc_step(zr, zi, count, cr, ci) :=
  if count >= 20 or zr^2 + zi^2 > 4 then
    count
  else
    esc_step(zr^2 - zi^2 + cr, 2*zr*zi + ci, count + 1, cr, ci)
mandel(cr, ci) := esc_step(0, 0, 0, cr, ci)
mandel(-0.5, 0.5)
mandel(0, 0)`
  },
  {
    id: 'clifford',
    title: '14. Clifford Torus 3D Projection',
    category: 'Geometry3D',
    content: `# Clifford Torus 3D Surface
# Parametric torus embedded in R^3
graph(((cos u)*(2 + cos v), (sin u)*(2 + cos v), sin v), u in 0..tau, v in 0..tau)`
  },
  {
    id: 'e8_lattice',
    title: '15. E8 Lattice Roots & Point Cloud',
    category: 'Geometry3D',
    content: `# E8 Lattice Roots
# 240 roots in 8D: 112 integer roots (±1, ±1, 0^6) and 128 half-integer roots (±1/2)^8 with even sum
# Project sample root vectors to 3D point cloud
roots_sample := [[1, 1, 0], [1, -1, 0], [-1, 1, 0], [-1, -1, 0], [0, 1, 1], [0, 1, -1], [0, -1, 1], [0, -1, -1]]
length roots_sample`
  },
  {
    id: 'cap_set',
    title: '16. Cap Sets in Affine Space F_3^3',
    category: 'Geometry3D',
    content: `# Cap Sets in Affine Space F_3^3
# Maximal subset of (Z/3Z)^3 containing no 3 collinear points (a + b + c = 0 mod 3)
cap3 := [[0,0,0], [0,0,1], [0,1,0], [0,1,2], [1,0,0], [1,0,2], [1,1,1], [1,1,2], [2,2,2]]
# Verify non-collinearity
is_collinear(p, q, r) := all((p[i] + q[i] + r[i]) % 3 == 0, i in 0..2)
length cap3`
  },
  {
    id: 'rsa_crypt',
    title: '17. RSA Cryptography & Number Theory',
    category: 'Arithmetic',
    content: `# RSA Key Generation & Modular Arithmetic
p := 61
q := 53
n := p * q
phi_n := totient n
e_key := 17
# Message encryption
msg := 42
c := powmod(msg, e_key, n)
c`
  },
  {
    id: 'poincare_claim',
    title: '18. Poincaré Conjecture (Perelman 2003)',
    category: 'Claims',
    content: `# Poincaré Conjecture
claim poincare {
  statement: "Every simply connected closed 3-manifold is homeomorphic to the 3-sphere",
  proved_by: "Perelman 2003 (Ricci flow with surgery)",
  relevance: "The theorem requires infinite-dimensional Ricci flow analysis with surgery and has no finite checkable shadow; evaluated to unknown(not-finitely-checkable)",
  kind: "H",
  shadow: unknown(not-finitely-checkable, "Requires infinite-dimensional Ricci flow analysis"),
  expect: unknown(not-finitely-checkable)
}`
  },
  {
    id: 'fermat_claim',
    title: '19. Fermat\'s Last Theorem (Wiles 1995)',
    category: 'Claims',
    content: `# Fermat's Last Theorem
claim fermat_last_theorem {
  statement: "a^n + b^n = c^n has no positive integer solutions for n > 2",
  proved_by: "Wiles-Taylor 1995",
  relevance: "Exhaustive finite box verification of a^n + b^n != c^n for exponents n in 3..8 and positive integer bases a, b, c in 1..200; witnesses non-existence within a finite window but does not prove the universal theorem",
  kind: "A",
  shadow: all(all(all(all(a^n + b^n != c^n, c in 1..200), b in 1..200), a in 1..200), n in 3..8),
  expect: true
}`
  },
  {
    id: 'riemann_claim',
    title: '20. Riemann Hypothesis Critical Line Verification',
    category: 'Claims',
    content: `# Riemann Hypothesis (Zeros on Critical Line)
claim riemann_first_zeros {
  statement: "All non-trivial zeros of the Riemann zeta function have Real(s) = 1/2",
  proved_by: "Open millennium problem / Gram 1903",
  relevance: "The complete Riemann Hypothesis asserts infinitely many non-trivial zeros lie on Re(s)=1/2; verifying all zeros requires infinite analytic continuation beyond finite arithmetic without complex zeta theory; evaluated to unknown(not-finitely-checkable)",
  kind: "H",
  shadow: unknown(not-finitely-checkable, "Requires complex analytic zeta function theory"),
  expect: unknown(not-finitely-checkable)
}`
  },
  {
    id: 'p_vs_np_claim',
    title: '21. P versus NP Problem (Clay Millennium)',
    category: 'Claims',
    content: `# P vs NP
claim p_vs_np {
  statement: "P != NP",
  proved_by: "Open millennium problem",
  relevance: "Asymptotic computational complexity class separation has no finite witness shadow; evaluated to unknown(not-finitely-checkable)",
  kind: "H",
  shadow: unknown(not-finitely-checkable, "Undecided; requires asymptotic complexity proof"),
  expect: unknown(not-finitely-checkable)
}`
  },
  {
    id: 'bsd_claim',
    title: '22. Birch and Swinnerton-Dyer Conjecture',
    category: 'Claims',
    content: `# Birch and Swinnerton-Dyer Conjecture
claim bsd_elliptic {
  statement: "The rank of an elliptic curve equals the order of vanishing of its L-function at s = 1",
  proved_by: "Gross-Zagier / Kolyvagin for rank <= 1",
  relevance: "The full Birch and Swinnerton-Dyer conjecture requires complex L-function analytic continuation and Shafarevich-Tate group finiteness with no general finite shadow; evaluated to unknown(not-finitely-checkable)",
  kind: "H",
  shadow: unknown(not-finitely-checkable, "Requires complex L-function analytic continuation"),
  expect: unknown(not-finitely-checkable)
}`
  },
  {
    id: 'four_color_claim',
    title: '23. Four Color Theorem (Appel-Haken 1976)',
    category: 'Claims',
    content: `# Four Color Theorem
claim four_color {
  statement: "Every planar graph can be colored with at most 4 colors such that no adjacent vertices share a color",
  proved_by: "Appel-Haken 1976 / Robertson et al. 1997",
  relevance: "The universal Four Color Theorem applies to all planar graphs via an unavoidability set of 1,482 reducible configurations and cannot be witnessed by finite graph instances; evaluated to unknown(not-finitely-checkable)",
  kind: "H",
  shadow: unknown(not-finitely-checkable, "Requires full unavoidability set discharging and reducible configuration search"),
  expect: unknown(not-finitely-checkable)
}`
  },
  {
    id: 'quantum_mip_claim',
    title: '24. MIP* = RE (Ji et al. 2020)',
    category: 'Claims',
    content: `# MIP* = RE
claim mip_star_re {
  statement: "Multi-prover interactive proofs with quantum entanglement equal recursively enumerable languages",
  proved_by: "Ji, Natarajan, Vidick, Wright, Yuen 2020",
  relevance: "Entangled quantum games and undecidability of the halting problem preclude finite shadow verification; evaluated to unknown(not-finitely-checkable)",
  kind: "H",
  shadow: unknown(not-finitely-checkable, "Refutes Connes embedding problem via undecidability of Halting Problem"),
  expect: unknown(not-finitely-checkable)
}`
  }
];
