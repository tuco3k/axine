# Mathematical Capability and Domain Coverage

Axine separates the irreducible core runtime from mathematical domain libraries. The core provides a seven-primitive computational floor; all higher mathematical definitions, transcendentals, and algebraic structures are written in Axine syntax.

---

## The Seven-Primitive Core Floor

The core runtime contains seven primitives:

1. **Exact Rational Arithmetic**: Arbitrary-precision fractions ($\mathbb{Q}$) backed by `BigInt` numerators and denominators with Euclidean GCD canonicalization.
2. **Relational Ordering & Equality**: Comparison relations ($=, \ne, <, \le, >, \ge$) and structural identity.
3. **Syntactic Substitution & Constraint Isolation**: Equational unification ($v = c \implies v \mapsto c$) within lexical scopes.
4. **Bounded Finite Iteration**: Step-bounded and fuel-guarded recurrence loops.
5. **First-Class Expressions as Values**: Quoting, pattern matching, structural reconstruction, and term rewriting (`\quote`, `\unquote`, `\match`, `\build`, `\rule`).
6. **Ordered Tuples**: Finite Cartesian products and indexing.
7. **Structural Equality & Kind Subsumption**: Multi-kind operator dispatch and structural subtype verification.

All other mathematical functionality lives in Axine documents and standard libraries (`documents/lib/*.ax`).

---

## Domain Coverage Status

### 1. Implemented

| Domain / Feature | Description | Implementation Layer |
| :--- | :--- | :--- |
| **Exact Rational Arithmetic** | Exact addition, subtraction, multiplication, division, powers, and comparisons over $\mathbb{Q}$. | Core Floor |
| **Relational Coordinate Spaces** | Defining $n$-dimensional spaces (`{\axis x, y, ...}`) and evaluating implicit relation manifolds ($R = 0$). | Core Floor + Sampler |
| **Uniform Implicit Level-Set Sampling** | 2D Marching Squares and 3D Marching Cubes contour extraction over Cartesian coordinate grids. | Simulation Engine |
| **Continuous ODE Continuation** | Forward numerical integration of initial value problems ($d//dt\, y = f(t, y), y(t_0) = y_0$) using adaptive Runge-Kutta (RK4). | Simulation Engine |
| **Expressions as Values & Term Rewriting** | Homoiconic AST construction, term matching, and fuel-bounded equational substitution rules (`\rule`, `\match`, `\build`). | Core Floor |
| **Inductive Collections & Aggregations** | Finite sets, multisets, folds, and maps (`\set`, `\multiset`, `\fold`, `\map`). | Core Floor |
| **Bounded Quantifiers** | Predicate evaluation over discrete domains (`\forall`, `\exists`, `\exists!`) with short-circuiting and counterexample reporting. | Core Floor |
| **User-Defined Algebraic Structures** | Declarations of carrier sets, Cayley operation tables, and quantified axiom checks (`\structure`, `\carrier`, `\op`, `\axiom`). | Core Floor |
| **Operator Overloading by Structure** | Context-scoped operator dispatch (`\with :Structure { ... }`) resolving standard arithmetic symbols to structure operations. | Core Floor |
| **Homomorphisms & Quotients** | Structure-preserving mappings and equivalence class quotient normalizers (`\homomorphism`, `\quotient`). | Core Floor |
| **Elementary Transcendentals** | Square root, exponential, logarithm, trigonometric, and hyperbolic functions defined via recurrences and series. | Standard Library (`lib/`) |
| **Document Layout & Export** | Multi-edge dockable workspace, inline gutter results, and standalone self-contained HTML/PDF publication export. | Editor / Shell |

### 2. Partial

| Domain / Feature | Current State | Missing Capability |
| :--- | :--- | :--- |
| **Differential Forms on Manifolds** | Graded Leibniz rule and exterior derivative rules for Euclidean coordinates (`lib/differential_forms.ax`). | Non-Euclidean metric tensor connections and curvature forms. |
| **Asymptotic Manifold Discovery** | Coarse grid scanning and bounding box expansion for bounded relations. | Adaptive quadtree/octree refinement for high-frequency oscillations near singularities ($y = \sin(1/x)$). |
| **Non-Commutative Ideal Quotients** | Equivalence class normalization for finite abelian and cyclic quotient groups. | General non-commutative Gröbner basis term completion. |

### 3. Not Implemented

| Domain / Feature | Reason / Path Forward |
| :--- | :--- |
| **GPU-Accelerated Level-Set Raymarching** | Slicing currently executes on CPU worker threads ($< 1.3\text{ ms}$ for 2D, $< 5.5\text{ ms}$ for 3D). WebGL2/WebGPU fragment compilation is deferred to future engine optimization. |
| **3D Measurement Calipers & Solid Sectioning** | Caliper tools and clipping plane caps require dedicated viewport overlay tools. |

---

## Out of Scope (Deliberate Boundaries)

The following capabilities are excluded by design:

1. **Interactive Automated Theorem Proving with Tactic Search**:
   Axine evaluates finite computational propositions and witnesses. It does not replace proof assistants such as Lean, Coq, or Isabelle.
2. **Infinite-Depth Symbolic Integration**:
   Algorithms like full symbolic Risch integration on general elementary functions require deciding zero-equivalence of transcendental expressions, which is undecidable in general (Richardson's theorem). Indefinite integrals without bounds must provide explicit evaluation rules.
3. **Heuristic Guessing & Implicit Coercion**:
   Axine does not guess missing equations, silently coerce incompatible types, or synthesize intent. If an operation is undefined in the active context, it evaluates to `undefined` or raises a structured diagnostic.
4. **Hardcoded Core Builtins**:
   No mathematical function is hardcoded in the core runtime as an opaque TypeScript function. If a function cannot be expressed as an Axine relation or recurrence, it is not part of the language.
