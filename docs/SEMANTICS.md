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
│   Value Found      │   │     Obstruction    │   │  Evaluation Error  │
│  Exact / Numeric   │   │  Defined Taxonomy  │   │ Mismatch / Syntax  │
└────────────────────┘   └────────────────────┘   └────────────────────┘
```

1. **Honest Reporting**: When Axine evaluates an expression, it produces an exact value, a bounded numerical approximation, or an explicit obstruction reason. It never presents heuristic guesses or synthetic placeholders as proven mathematical results.
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
• sqrt(-1) is undefined    • e^(i*pi) = -1            • Inverses via Bezout
• No imaginary unit i      • n roots for deg n poly   • Finite field algebra
```

### 3.1 The Default Context ($\mathbb{R}$)
The default context is the field of real numbers $\mathbb{R}$.
- In $\mathbb{R}$, $\sqrt{-1}$ is **genuinely undefined** (`undefined`). It is not an engine failure, not "requires unavailable theory", and not a missing feature error.
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
x := sqrt(4)       # 2

with context C {
  z := sqrt(-4)    # 2*i
  e^(i * pi) + 1   # 0
}

with context Z(7) {
  3 / 2            # 5, because 2 * 5 = 10 ≡ 3 (mod 7)
}
```
Crossing contexts is explicit. Roots that do not exist in the active context evaluate to `undefined`.

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

## 5. Revised Obstruction Taxonomy

Axine distinguishes between values, mathematical obstructions, and execution limits.

```
                         Evaluation Outcome
                                  │
       ┌──────────────────────────┼──────────────────────────┐
       ▼                          ▼                          ▼
     Value                   Obstruction                   Error
 (Number, Tuple,        (Legitimate Reason)         (Invalid Syntax,
Matrix, Relation)                 │                  Kind Mismatch)
                                  │
          ┌───────────────────────┼───────────────────────┐
          ▼                       ▼                       ▼
   budget-exhausted          undecidable             undefined
 (Fuel/Time limit)       (Proven Undecidable)   (Genuinely Undefined)
```

### 5.1 Retained Obstruction Categories
1. `budget-exhausted`: Computation stopped due to step, time, or memory limits before finding an exact solution or completing a search.
2. `undecidable`: The proposition is provably undecidable within the formal system (e.g., zero-equivalence of general elementary functions via Richardson's theorem).
3. `undefined`: The operation has no mathematical definition in the active context ($1/0$ in $\mathbb{R}$, $\sqrt{-1}$ in $\mathbb{R}$, $\log(-3)$ in $\mathbb{R}$, $\tan(\pi/2)$ in $\mathbb{R}$).

### 5.2 Removed Categories & Rationale
- `requires-unavailable-theory`: **REMOVED**. This category disguised context boundaries and unhandled cases as runtime obstructions. In context $\mathbb{R}$, $\sqrt{-1}$ is `undefined`. In context $\mathbb{C}$, $\sqrt{-1} = i$.
- `unimplemented-technique`: **REMOVED**. Engine limitations are not mathematical facts. If the engine cannot solve an equation within bounds, it returns `budget-exhausted` or reports that no algebraic reduction rule applied.

---

### 5.3 Audit & Migration of Removed Categories

All existing use sites of `requires-unavailable-theory` and `unimplemented-technique` across the codebase are audited below with their required replacements:

| File & Line | Function / Context | Current Return | Target Semantic Replacement |
| :--- | :--- | :--- | :--- |
| `src/core/types.ts:575` | `UnknownReason` union | `'requires-unavailable-theory'` | **Delete member** from type union |
| `src/core/types.ts:564` | `ObstructionReason` union | `'unimplemented-technique'` | **Delete member** from type union |
| `src/core/algebra/solver.ts:16` | `AlgebraicSolver.isolate` | `makeUnknown('requires-unavailable-theory', ...)` | `makeUnknown('budget-exhausted', ...)` or return unresolved relation |
| `src/core/algebra/solver.ts:60` | `AlgebraicSolver.solveQuadratic` ($D < 0$) | `makeUnknown('requires-unavailable-theory', ...)` | In context $\mathbb{R}$: return `{ type: 'none' }` (no real roots). In context $\mathbb{C}$: compute $x = \frac{-b \pm i\sqrt{\|D\|}}{2a}$ |
| `src/core/algebra/solver.ts:496` | `AlgebraicSolver.solvePower` ($\sqrt[2k]{-c}$) | `makeUnknown('requires-unavailable-theory', ...)` | In context $\mathbb{R}$: `{ type: 'none' }`. In context $\mathbb{C}$: return complex roots |
| `src/core/algebra/simplify.ts:181` | `AlgebraicSimplifier.simplify` | `makeUnknown('requires-unavailable-theory', ...)` | Return unsimplified normalized AST or `budget-exhausted` |
| `src/core/algebra/index.ts:29` | `isolate` fallback | `makeUnknown('requires-unavailable-theory', ...)` | Return unisolated relation or `budget-exhausted` |
| `src/core/numeric/matrix.ts:281` | `matrixEigenvalues` (Complex $\lambda$) | `makeUnknown('requires-unavailable-theory', ...)` | In context $\mathbb{R}$: return `undefined` (no real eigenvalues). In context $\mathbb{C}$: return complex tuple |
| `src/core/evaluator.ts:2478` | `evalIntegral` | `const obstruction = isGaussian ? 'not-elementary' : 'unimplemented-technique'` | Replace with `budget-exhausted` or numeric quadrature result |
| `src/core/evaluator.ts:2498` | `evalIntegral` (Indefinite integral) | `makeUnknown('requires-unavailable-theory', ...)` | Indefinite integration without limits is not supported symbolically: raise diagnostic stating definite limits are required |
| `src/core/evaluator.ts:3815` | `evalClaim` (Catch handler) | `makeUnknown('requires-unavailable-theory', ...)` | Return structured error or `budget-exhausted` |
| `src/core/evaluator.ts:3854` | `evalClaim` (Fallback handler) | `makeUnknown('requires-unavailable-theory', ...)` | Return structured error or `budget-exhausted` |
| `src/tests/language_extensions.test.ts:325, 387` | Indefinite integral test | Expects `'requires-unavailable-theory'` | Update test to verify clear diagnostic for indefinite integrals |
| `src/tests/derivation_first_class.test.ts:59, 151, 157, 163` | Isolation rejection tests | Expects `'requires-unavailable-theory'` | Update test to expect `{ type: 'none' }` in $\mathbb{R}$ or explicit derivation branch |
| `src/tests/algebra_isolate.test.ts:70, 113, 121, 129` | Negative discriminant tests | Expects `'requires-unavailable-theory'` | Update test to expect `{ type: 'none' }` in $\mathbb{R}$ |
| `src/tests/claim_honesty_and_control.test.ts:179` | Matrix complex eigenvalues | Expects `'requires-unavailable-theory'` | Update test to expect `undefined` in $\mathbb{R}$ or complex result in $\mathbb{C}$ |
| `src/tests/fuel_kleene.test.ts:105-106` | Kleene fuel propagation | Uses `'requires-unavailable-theory'` | Update test fixture to use `'budget-exhausted'` |
| `src/tests/obstructions_g4.test.ts:32, 92` | Obstruction test suite | Uses `'unimplemented-technique'` | Update test to verify `'budget-exhausted'` or `'not-elementary'` |
| `src/tests/dimensional.test.ts:75, 151` | Dimensional analysis violations | Expects `'requires-unavailable-theory'` | Return structured `DimensionMismatch` error |

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
  - An interactive theorem prover with automated tactic search (e.g., Lean, Coq, Isabelle).
  - A heavy computer algebra system with infinite-depth symbolic integration or arbitrary multivariate polynomial ideal solvers.
  - A guessing assistant that silently coerces types or invents intent.
- **Out-of-Scope Reporting**: When an operation exceeds engine capabilities, Axine reports that the computation exceeded its budget or is not defined in the active context. It never claims that a problem is mathematically unsolvable merely because the engine lacks an algorithm.

---

## 9. Comprehensive Contradiction Audit

The following table itemizes every location where the current codebase contradicts this semantic specification, detailing the current behavior, the required target behavior, and the implementation effort.

| Contradiction # | File & Location | Current Implementation Behavior | Target Semantic Behavior | Effort |
| :--- | :--- | :--- | :--- | :--- |
| **C1** | `src/core/evaluator.ts:893-900`<br>`src/core/evaluator.ts:3865-4110` (`evalGraph`) | Dispatches plot rendering based on AST shape matching (`Trajectory`, `Identifier`, `FunctionCall`) into rigid graph types. | Unify graph generation as implicit level-set sampling over defined domain $\mathcal{D} = [a_1, b_1] \times \dots \times [a_n, b_n]$. | **Large** |
| **C2** | `src/core/numeric/tower.ts:608-617` (`sqrtValue`) | Hardcodes runtime error: *"Cannot compute square root of negative number in real mode (complex numbers deferred to future version)"*. | In context $\mathbb{R}$: return `undefined`. In context $\mathbb{C}$: return $i \sqrt{\|x\|}$. | **Medium** |
| **C3** | `src/core/evaluator.ts:386-396, 427-433` | Hardcodes identifier check throwing error for imaginary unit `i` as unsupported. | In context $\mathbb{R}$: treat as unbound identifier or undefined. In context $\mathbb{C}$: resolve to constant $i = (0, 1)$. | **Medium** |
| **C4** | `src/document/corpus_data.ts:98-105`<br>`src/tests/claim_honesty_and_control.test.ts:259-266` | Contains corpus document and test asserting that $e^{i\pi} + 1$ must fail with diagnostic *"unsupported imaginary unit 'i'"*. | Evaluate Euler's formula in context $\mathbb{C}$ producing exact zero ($0$). | **Medium** |
| **C5** | `src/core/numeric/tower.ts:167-176, 252-261, 754-757` | Throws hardcoded string errors like *"Cannot add Vector to Scalar: addition requires matching kinds"*; disallows scalar-vector multiplication. | Delegate operator resolution to Context operator table with structured overload mismatch diagnostics. | **Large** |
| **C6** | `src/core/algebra/classifier.ts:6-105` | Rigid AST pattern matching rejecting non-polynomial, non-linear algebraic forms before solving. | Attempt algebraic term rewriting and simplification; fall back to numerical isolation or return unresolved relation on budget exhaustion. | **Large** |
| **C7** | `src/core/types.ts:564, 575`<br>`src/core/algebra/solver.ts:16, 60, 496`<br>`src/core/numeric/matrix.ts:281` | Emits `requires-unavailable-theory` and `unimplemented-technique` on negative discriminants, complex eigenvalues, etc. | Eliminate removed categories across 19 use sites. Replace with `undefined`, `{ type: 'none' }`, or `budget-exhausted`. | **Medium** |
| **C8** | Architecture Wide (`src/core/`) | Entire evaluation pipeline runs in a single ambient universe without explicit Context scopes ($\mathbb{R}$, $\mathbb{C}$, $\mathbb{Z}_p$). | Introduce first-class `Context` representation in `Environment` controlling operator tables and field rules. | **Large** |
| **C9** | Architecture Wide (`src/editor/`, `src/document/`) | Missing `expand` macro primitive to unfold high-level abstractions into user-editable low-level statements. | Implement `expand` transformation pass in document/AST pipeline to unfold composite objects into editable source. | **Medium** |
| **C10** | `src/core/evaluator.ts:2478, 2498` (`evalIntegral`) | Indefinite integrals return `requires-unavailable-theory`; definite integrals check hardcoded Gaussian pattern. | Definite integrals use numerical quadrature with bounded error; indefinite integrals raise explicit syntax requirement for integration limits. | **Small** |

---

## 10. Implementation Road Map

```
  Phase A: Taxonomy & Diagnostics (C2, C3, C4, C7, C10)
  ├── Remove 'requires-unavailable-theory' and 'unimplemented-technique'
  ├── Update all 19 call sites to 'undefined', 'budget-exhausted', or 'none'
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
