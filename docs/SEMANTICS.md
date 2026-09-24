# Axine Semantic Model & Language Specification

> **Status**: Normative Specification & Architectural Blueprint  
> **Target Version**: Axine 2.0+

---

## 1. The Core Principle

Axine evaluates and reports what it found. It does not classify, guess, or invent. It does not dress up implementation gaps as mathematical facts.

```
                      ┌────────────────────────────┐
                      │      Axine Evaluation      │
                      └─────────────┬──────────────┘
                                    │
           ┌────────────────────────┼────────────────────────┐
           ▼                        ▼                        ▼
┌────────────────────┐   ┌────────────────────┐   ┌────────────────────┐
│  Reduced as Far    │   │   Budget Ran Out   │   │  Evaluation Error  │
│    as It Can Go    │   │   Partial Result   │   │ Mismatch / Syntax  │
└────────────────────┘   └────────────────────┘   └────────────────────┘
```

1. **Honest Reporting**: When Axine evaluates an expression, it reduces the expression as far as it can: an exact value, a bounded numerical approximation, or whatever cannot reduce standing as itself. The only other outcome is running out of budget, which shows the partial result and how far it got. It never presents heuristic guesses or synthetic placeholders as proven mathematical results.
2. **Context-Dependent Truth**: Mathematical truth is relative to the algebraic context in which evaluation occurs. A question cannot be answered in a vacuum; it is answered within a declared algebraic structure (e.g., $\mathbb{R}$, $\mathbb{C}$, $\mathbb{Z}_p$).
3. **No Decorative Features**: Language constructs exist to compute, observe, or derive. A feature that does not change evaluation or observation semantics is rejected.

---

## 2. Objects are What They Are; Representations are Observations

Mathematical objects in Axine have intrinsic meaning independent of how they are viewed. An equation or relation is an algebraic proposition, not a geometric drawing instruction.

$$\mathcal{R} = \{ (x, y) \in \mathbb{R}^2 \mid x^2 + y^2 = 4 \}$$

An expression such as $x^2 + y^2 = 4$ is a relation (a boolean predicate over coordinate tuples), not a "circle".
- In an observation over a 2D domain $(x, y) \in [-3, 3]^2$, the zero level set of $x^2 + y^2 - 4 = 0$ is observed as a circle of radius 2.
- In an observation over a 3D domain $(x, y, z) \in [-3, 3]^3$, the level set where $z$ is unconstrained is observed as an infinite circular cylinder along the $z$-axis.
- In an observation over a 1D slice $y = 0, x \in [-3, 3]$, the level set is observed as two discrete points $\{-2, 2\}$.

```
                    Relation: x^2 + y^2 = 4
                               │
       ┌───────────────────────┼───────────────────────┐
       ▼                       ▼                       ▼
  Domain: R^2             Domain: R^3             Domain: Slice (y=0)
  Observation: Circle     Observation: Cylinder   Observation: Two Points
```

### Observation Pipeline (Implicit Grid Plotting)
Plotting in Axine is uniform implicit grid sampling:
1. Define the sampling domain $\mathcal{D} = [a_1, b_1] \times \dots \times [a_n, b_n]$ with resolution $N$.
2. Sample the relation or function over the grid $\mathcal{D}$.
3. Extract level sets (contour lines in 2D, isosurfaces in 3D) or evaluate function graphs directly.

There are no dispatch tables matching AST shapes to preset "graph types" (e.g., matching $y = f(x)$ vs $x^2+y^2=r^2$). If the user specifies an $n$-dimensional domain for an $m$-dimensional relation, the engine evaluates the level set over that domain without special-casing syntactic forms.

---

## 3. Contexts (Mathematical Relativity)

Evaluation in Axine occurs within an explicit **Context**. The context defines the underlying field or ring, available operators, simplification rules, and numeric representations.

```
                   ┌─────────────────────────────────┐
                   │         Active Context          │
                   │  Field/Ring, Operators, Kinds   │
                   └────────────────┬────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
   Context Real (R)          Context Complex (C)         Context Z_p
• Default context          • sqrt(-1) = i             • Arithmetic mod p
• sqrt(-1) stands          • e^(i*pi) = -1            • Inverses via Bezout
• No imaginary unit i      • n roots for deg n poly   • Finite field algebra
```

### 3.1 The Default Context ($\mathbb{R}$)
The default context is the field of real numbers $\mathbb{R}$.
- In $\mathbb{R}$, $\sqrt{-1}$ does not reduce: `:sqrt(-1)` stands as itself. That is not an engine failure, not "requires unavailable theory", and not a missing feature error.
- The symbol `i` is not defined in $\mathbb{R}$. Referencing `i` in $\mathbb{R}$ is an unknown variable error unless bound in scope.

### 3.2 The Complex Context ($\mathbb{C}$)
In context $\mathbb{C}$:
- $\sqrt{-1} = i$.
- $e^{i \pi} + 1 = 0$ evaluates to $0$.
- Polynomials of degree $n$ have $n$ roots counting multiplicity.
- Complex matrices yield complex eigenvalues and eigenvectors.

### 3.3 Context Transitions
Contexts are entered explicitly via block syntax or pragmas:
```axine
# Default context is R
x = :sqrt(4)       # 2

with context C {
  z = :sqrt(-4)    # 2*i
  e^(i * pi) + 1   # 0
}

with context Z(7) {
  3 / 2            # 5, because 2 * 5 = 10 ≡ 3 (mod 7)
}
```
Crossing contexts is explicit. Roots that do not exist in the active context stand unreduced.

---

## 4. Multi-Kind Operator Resolution & Structured Diagnostics

Operators in Axine are polymorphic over the kinds defined in the active context. The active context maintains a signature table:

$$\mathrm{OpTable}: (\mathrm{Op}, \mathrm{Kind}_{\mathrm{left}}, \mathrm{Kind}_{\mathrm{right}}) \to \mathrm{Kind}_{\mathrm{result}}$$

```
                      Binary Operation: a <op> b
                                  │
                                  ▼
                     Lookup (op, kind(a), kind(b))
                                  │
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
            Match Found                      No Match
                  │                               │
                  ▼                               ▼
           Execute Operation              Structured Error
                                        • Op invoked
                                        • Kinds received
                                        • Available signatures
                                        • Actionable suggestions
```

### 4.1 Multi-Kind Resolution Rules
1. **Geometric & Vector Spaces**: A scalar multiplied by a vector ($c \cdot \mathbf{v}$) is defined and yields a vector. A vector multiplied by a vector ($\mathbf{u} \cdot \mathbf{v}$) yields a scalar (inner product) or a bivector (geometric product) depending on the operator and context.
2. **Strict Kind Safety**: Operations without a mathematical definition in the context (such as adding a scalar to a matrix: $\mathbf{A} + 5$) do not silently coerce or broadcast unless explicitly defined in the context.

### 4.2 Structured Error Reporting on Mismatch
When an operator is called on incompatible kinds, Axine produces a structured diagnostic:

```json
{
  "error": "OperatorMismatch",
  "op": "+",
  "leftKind": "Matrix(3, 3)",
  "rightKind": "Scalar",
  "availableOverloads": [
    "+(Matrix(m, n), Matrix(m, n)) -> Matrix(m, n)",
    "+(Scalar, Scalar) -> Scalar"
  ],
  "suggestion": "Did you mean to add a scaled identity matrix: A + 5 * I(3)?"
}
```

Diagnostics provide:
1. Exact operator and received kinds.
2. List of valid overloads in the active context.
3. Relevant suggestions or canonical conversions.

---

## 5. What Evaluation Produces

```
                         Evaluation Outcome
                                  │
       ┌──────────────────────────┼──────────────────────────┐
       ▼                          ▼                          ▼
 Reduced as far as        Budget ran out                   Error
    it can go          (the partial result           (Invalid syntax,
 (what cannot reduce    and how far it got)           kind mismatch)
  stands as itself)
```

### 5.1 An expression reduces as far as it can
Whatever cannot reduce stands as itself. In $\mathbb{R}$, `:sqrt(-4)`, `1/0` and `0/0` stand as written, and `:sqrt(-1) < 3` evaluates to `:sqrt(-1) < 3`. Standing as itself is a result, not a failure: it is exactly what is known.

### 5.2 `none`, `undefined` and `unknown` are not values
There is no value meaning "absent", "undefined" or "not known". A question with no answer in the active context is answered by the expression that asked it, unreduced. `requires-unavailable-theory` and `unimplemented-technique` are removed and stay removed, with the other `unknown` reasons.

### 5.3 Running out of budget
The only other outcome is running out of budget (steps, time, depth or memory). It shows the partial result and how far it got: a sum stopped at its 200,000th term shows the sum of the terms it added and where it stopped. It never throws.

### 5.4 Where the code differs from this section
Observed by running the engine at commit cf32878 (budget: 200,000 steps, depth 500):

| Where | What it does now | Observed |
| :--- | :--- | :--- |
| `src/core/evaluator.ts:823, 826, 6403` | Running out of budget or recursion depth returns `unknown(budget-exhausted)` with no partial result | `:sum(1/n^2, n \in 1..100000000)` → `unknown(budget-exhausted, "step limit (200,000) reached")` |
| `src/core/evaluator.ts:3672–3837` (`find`, `all`, `exists`) | A search that runs out returns `unknown(search-incomplete)`; it says how far it got but is not a partial result | `\find(x \in 1..100000000, x < 0)` → `unknown(search-incomplete, "checked to 50000 of 100000000")` |
| `src/core/evaluator.ts:3660, 3696` (`find`) | A search with no match returns `none` | `\find(x \in 1..5, x > 10)` → `none` |
| `src/core/evaluator.ts:1421` (`\where`) | An expression whose condition is false returns `none` | `5 \where 1 > 2` → `none` |
| `src/core/evaluator.ts:4213` (limits) | A limit that does not exist returns `unknown` (`one-sided-limits-disagree`, `unbounded`, `oscillating`, `undefined`) | |
| `src/core/evaluator.ts:5707` (`evalDiff`) | A derivative it cannot take returns `none` | |
| `src/core/evaluator.ts:2724` | `\unknown(reason, detail)` constructs an `unknown` value | |
| `src/core/evaluator.ts:5714` (claims) | A Kind H claim returns `unknown(not-finitely-checkable)` | |
| `src/core/evaluator.ts:1901` (kind declarations) | Records `obstruction: 'undecidable'` | |
| `src/core/evaluator.ts:6002, 6044` (dimension, `\check`) | Any failure returns `unknown(requires-unavailable-theory)` | |
| `src/core/algebra/solver.ts:16, 60, 496`, `algebra/index.ts:29`, `algebra/simplify.ts:181` | `\isolate` and `\simplify` return `unknown(requires-unavailable-theory)` | `\isolate(x^2 = -1, \for x)` → `unknown(requires-unavailable-theory, "even power x^2 = -1 of negative number requires complex numbers (C)")` |
| `src/core/algebra/verifier.ts` (11 sites) | A derivation that fails its own check returns `unknown(no-convergence)` | |
| `src/core/numeric/matrix.ts:282, 335` | Complex eigenvalues return `unknown(requires-unavailable-theory)`; QR non-convergence returns `unknown(no-convergence)` | |
| `src/core/simulation/trajectory.ts:79`, `numeric/tower.ts:905` | The state of an empty trajectory, and a comparison involving `none`, return `none` | |
| `src/core/numeric/tower.ts:172` (`valueToNumber`) | A builtin that needs a number throws on an expression that stands | `:float(1/0)` → error "Expected numeric value, got expression" |
| `src/core/numeric/rational.ts:103, 131`, `symbolic_diff.ts:911` | Division by zero and a pole throw; the evaluator catches them at the top level, where `1/0` stands | |
| `src/core/types.ts:700–727` | `NoneValue`, `UnknownValue` and the reason unions, including `requires-unavailable-theory` and `unimplemented-technique` | |
| Declarations (`\unit`, `\dimension`, `\operator`, `\rule`, `\module`, `\export`, `\view`, `\unimport`, `\axis`) | Return a `none` value for a statement that produces nothing | |
| Tests | Assert `unknown`/`none` outcomes: `fuel_kleene` (19), `derivation_first_class` (14), `algebra_isolate` (11), `claim_honesty_and_control` (6), `language_extensions` (5), `dimensional` (5), `universality` (4), `removed_features` (3), `error_and_import_ux` (2), `part_j_quantifiers`, `part_i_collections_fold_map`, `layout_dock_visuals` (1 each) | |

Already as this section says: `0/0`, `1/0`, `:sqrt(-4)`, `:sqrt(-1) < 3`, `:f(0)` for `:f(x) = 1/x`, `0^(-1)`, `:mod(1, 0)`, `:ln(-1)`, `:ln(0)` all stand as written.

---

## 6. The `expand` Primitive

High-level domain objects (such as physical systems, ODE formulations, geometric constructions, and multi-step derivations) are defined as composable abstractions. The `expand` primitive unpacks an abstraction in place into its constituent Axine statements.

```
┌──────────────────────────────────────────────┐
│  High-Level Abstraction                      │
│  sys := HarmonicOscillator(m: 1, k: 10, b: 0.1)│
└──────────────────────┬───────────────────────┘
                       │ expand(sys)
                       ▼
┌──────────────────────────────────────────────┐
│  Unfolded Low-Level Axine Code (In-Place)   │
│  x''(t) + 0.1*x'(t) + 10*x(t) = 0           │
│  x(0) = 1, x'(0) = 0                         │
│  traj := rk4(sys_ode, t in 0..10)            │
└──────────────────────────────────────────────┘
```

1. **Macro-Like In-Place Unfolding**: `expand` replaces a composite expression with its constituent primitive relations, functions, and bindings directly in the document.
2. **Editable Artifacts**: The generated code is standard, user-editable Axine code. The user can tweak individual terms, change numerical parameters, or alter initial conditions.
3. **Clean Core Engine**: Domain packages (e.g., mechanics, electrical circuits, thermodynamics) provide definitions that expand into standard equations and differential systems. The core evaluator does not require domain-specific solver hardcoding.

---

## 7. Defaults & Overrides

Axine has no immutable "system" functions or hardcoded keywords that cannot be lexically shadowed or specialized.

1. **Standard Library in Axine**: Core mathematical functions ($\sin, \cos, \exp, \ln, \det, \mathrm{tr}$) and operator overloads are defined in standard library modules.
2. **Lexical Scoping**: Users can override any function, constant, or operator within a scope:
   ```axine
   # User-defined norm overriding standard norm in local block
   norm(v) := max(abs(v))
   ```
3. **Operator Overloading via Context Definitions**: Custom operators and kind rules are registered within contexts rather than being baked into TypeScript `switch` statements.

---

## 8. Honest Scope Boundaries

Axine maintains precise boundaries between what it computes, what it observes, and what lies outside its scope.

```
┌────────────────────────────────────────────────────────────────────────┐
│                               AXINE                                    │
│                                                                        │
│  • Observable Computational Notebook                                  │
│  • Exact Rational & Multi-Precision Float Arithmetic                  │
│  • Bounded Numerical Solvers & ODE Integrators (RK4, Dormand-Prince)  │
│  • Uniform Implicit & Explicit Level-Set Plotting (2D & 3D)           │
│  • Step-Verified Algebraic Equivalence Derivations                    │
│  • Explicit Mathematical Contexts (R, C, Z_p)                         │
└────────────────────────────────────────────────────────────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
┌───────────────────────────┐             ┌───────────────────────────┐
│     WHAT AXINE IS NOT     │             │     OUT-OF-SCOPE BEHAVIOR │
│ • General Theorem Prover  │             │ • No "impossible" claims  │
│ • Infinite CAS / Gröbner  │             │ • Honest budget reporting │
│ • Guessing Heuristic Engine│            │ • Explicit context errors │
└───────────────────────────┘             └───────────────────────────┘
```

- **What Axine IS**:
  - A deterministic, observable notebook for mathematical structures, numerical algorithms, and algebraic derivations.
  - A reliable computation engine operating with fuel-bounded execution and explicit contexts.
  - A multi-dimensional level-set visualizer across arbitrary coordinate slices.
- **What Axine IS NOT**:
  - An interactive theorem prover with automated tactic search (e.g., Lean, Coq, Isabelle). Axine never chooses a step on its own. The only commands that choose steps are ones a person invokes by name, and \expand writes out every step they chose, each one checked.
  - A heavy computer algebra system with infinite-depth symbolic integration or arbitrary multivariate polynomial ideal solvers.
  - A guessing assistant that silently coerces types or invents intent.
- **Out-of-Scope Reporting**: When an operation exceeds engine capabilities, Axine reports that the computation exceeded its budget or is not defined in the active context. It never claims that a problem is mathematically unsolvable merely because the engine lacks an algorithm.

---

## 9. Comprehensive Contradiction Audit

The following table itemizes every location where the current codebase contradicts this semantic specification, detailing the current behavior, the required target behavior, and the implementation effort.

| Contradiction # | File & Location | Current Implementation Behavior | Target Semantic Behavior | Effort |
| :--- | :--- | :--- | :--- | :--- |
| **C1** | `src/core/evaluator.ts:893-900`<br>`src/core/evaluator.ts:3865-4110` (`evalGraph`) | Dispatches plot rendering based on AST shape matching (`Trajectory`, `Identifier`, `FunctionCall`) into rigid graph types. | Unify graph generation as implicit level-set sampling over defined domain $\mathcal{D} = [a_1, b_1] \times \dots \times [a_n, b_n]$. | **Large** |
| **C2** | `src/core/numeric/tower.ts:608-617` (`sqrtValue`) | Hardcodes runtime error: *"Cannot compute square root of negative number in real mode (complex numbers deferred to future version)"*. | In context $\mathbb{R}$: stand as `:sqrt(x)`. In context $\mathbb{C}$: return $i \sqrt{\|x\|}$. | **Medium** |
| **C3** | `src/core/evaluator.ts:386-396, 427-433` | Hardcodes identifier check throwing error for imaginary unit `i` as unsupported. | In context $\mathbb{R}$: treat as an unbound identifier. In context $\mathbb{C}$: resolve to constant $i = (0, 1)$. | **Medium** |
| **C4** | `src/document/corpus_data.ts:98-105`<br>`src/tests/claim_honesty_and_control.test.ts:259-266` | Contains corpus document and test asserting that $e^{i\pi} + 1$ must fail with diagnostic *"unsupported imaginary unit 'i'"*. | Evaluate Euler's formula in context $\mathbb{C}$ producing exact zero ($0$). | **Medium** |
| **C5** | `src/core/numeric/tower.ts:167-176, 252-261, 754-757` | Throws hardcoded string errors like *"Cannot add Vector to Scalar: addition requires matching kinds"*; disallows scalar-vector multiplication. | Delegate operator resolution to Context operator table with structured overload mismatch diagnostics. | **Large** |
| **C6** | `src/core/algebra/classifier.ts:6-105` | Rigid AST pattern matching rejecting non-polynomial, non-linear algebraic forms before solving. | Attempt algebraic term rewriting and simplification; fall back to numerical isolation or return unresolved relation on budget exhaustion. | **Large** |
| **C7** | `src/core/types.ts:564, 575`<br>`src/core/algebra/solver.ts:16, 60, 496`<br>`src/core/numeric/matrix.ts:281` | Emits `requires-unavailable-theory` and `unimplemented-technique` on negative discriminants, complex eigenvalues, etc. | Eliminate removed categories (§5.4). Replace with the unreduced expression, or the partial result where the budget ran out. | **Medium** |
| **C8** | Architecture Wide (`src/core/`) | Entire evaluation pipeline runs in a single ambient universe without explicit Context scopes ($\mathbb{R}$, $\mathbb{C}$, $\mathbb{Z}_p$). | Introduce first-class `Context` representation in `Environment` controlling operator tables and field rules. | **Large** |
| **C9** | Architecture Wide (`src/editor/`, `src/document/`) | Missing `expand` macro primitive to unfold high-level abstractions into user-editable low-level statements. | Implement `expand` transformation pass in document/AST pipeline to unfold composite objects into editable source. | **Medium** |
| **C10** | `src/core/evaluator.ts:2478, 2498` (`evalIntegral`) | Indefinite integrals return `requires-unavailable-theory`; definite integrals check hardcoded Gaussian pattern. | Definite integrals use numerical quadrature with bounded error; indefinite integrals raise explicit syntax requirement for integration limits. | **Small** |

---

## 10. Implementation Road Map

```
  Phase A: Taxonomy & Diagnostics (C2, C3, C4, C7, C10)
  ├── Remove 'requires-unavailable-theory' and 'unimplemented-technique'
  ├── Replace them with the unreduced expression, or the partial result where the budget ran out
  └── Add structured operator mismatch diagnostics

  Phase B: Context System & Complex Numbers (C2, C3, C4, C8)
  ├── Implement Context { R, C, Z_p } scoping and AST wrappers
  ├── Implement Complex number tower (Gaussian rationals, complex floats)
  └── Wire Euler's identity and complex polynomial/matrix solvers

  Phase C: Uniform Observation & Plotting (C1)
  ├── Replace AST view dispatch tables with domain grid evaluators
  └── Implement 2D contouring / 3D marching cubes for implicit relations

  Phase D: Macro Expansion & Extensible Library (C6, C9)
  ├── Implement 'expand' primitive for in-place AST unfolding
  └── Migrate domain helpers into Axine standard library modules
```
