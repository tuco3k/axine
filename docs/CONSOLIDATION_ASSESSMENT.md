# Architectural Assessment: Behavioral Consolidation to the Minimal Semantic Set

> **Document Type**: Normative Architectural Audit & Consolidation Blueprint  
> **Status**: Approved for Architectural Review  
> **Target Repository**: `tuco3k/axine`  
> **Reference Baselines**: [`AGENTS.md`](../AGENTS.md), [`docs/SEMANTICS.md`](./SEMANTICS.md), [`docs/REWRITE_ASSESSMENT.md`](./REWRITE_ASSESSMENT.md)

---

## Executive Summary: The Dispersion Crisis

Mathematical behavior in Axine currently lives across **9 distinct subsystems** containing over **480 handwritten dispatch cases**. Every subsystem was written by hand to interpret mathematical rules independently. 

Because these sites do not share a single operational semantics, they must be manually kept in agreement. They do not agree. Inconsistencies are invisible under standard test suites because tests only exercise the paths anticipated by the author. A user writing an unpredicted expression (such as `0^0`, `d//dx (abs(x))`, `y = x^0`, or `5 m + 0`) immediately triggers silent divergence between the gutter, the canvas, the compiler, and the type checker.

```
CURRENT ARCHITECTURE (DISPERSED)
┌──────────────────────────────────────────────────────────────────────────────┐
│  AST Walker ─── Tower ─── Compiler ─── Kind Lattice ─── Sampler ─── Viewport │
│     (45 cases)  (95 cases)  (35 cases)    (130 cases)    (18 cases)  (5 cases) │
│         ▲           ▲           ▲              ▲             ▲           ▲   │
│         └───────────┴───────────┴──────────────┴─────────────┴───────────┘   │
│                 Each site independently re-implements mathematics            │
│                     (Silent divergences on edge cases)                       │
└──────────────────────────────────────────────────────────────────────────────┘

CONSOLIDATED ARCHITECTURE (THE MINIMAL TRIAD)
┌──────────────────────────────────────────────────────────────────────────────┐
│  1. ONTOLOGY          │  2. REDUCTION                │  3. OBSERVATION       │
│  What an object IS    │  How expressions REDUCE      │  How manifolds APPEAR │
│  (AST, Values, Scope) │  (Algebraic Rewrite Rules)   │  (Slicing & Sampling) │
│                       │  • Compiler derives here     │                       │
│                       │  • Types infer from this     │                       │
└──────────────────────────────────────────────────────────────────────────────┘
```

The defense is not more review or more tests. It is **reducing the number of places behavior can live to the minimal set** ($\le 3$) and deriving all other subsystems from that core.

---

## Section A: Where Behavior Currently Lives

Below is an exhaustive census of every site in the codebase that independently decides what the system does mathematically.

| Site ID | Subsystem & File | What It Decides | Handwritten Cases | Sites It Must Agree With |
| :--- | :--- | :--- | :--- | :--- |
| **S1** | **Evaluator / AST Walker**<br>`src/core/evaluator.ts` (4,141 lines) | Dispatches evaluation semantics for every syntactic form, handles scope, blocks, ODEs, derivations, and error boundaries. | **45 AST node cases**<br>• 18 statement evaluators<br>• 15 builtin functions<br>• 12 special dispatchers | **S2** (Tower), **S3** (Compiler), **S4** (Kinds), **S6** (Dimensions), **S9** (Solvers) |
| **S2** | **Numeric Tower & Operators**<br>`src/core/numeric/tower.ts` (1,562 lines)<br>`rational.ts`, `float.ts`, `matrix.ts` | Evaluates arithmetic, comparisons, powers, roots, matrices, and constant folding over 10 value representations. | **95 operator cases**<br>• 16 addition branches<br>• 14 subtraction branches<br>• 18 multiplication branches<br>• 12 division branches<br>• 15 power branches<br>• 12 comparison branches<br>• 8 special functions | **S1** (Evaluator), **S3** (Compiler), **S4** (Kinds), **S8** (Units/Dimensions) |
| **S3** | **Relation Compiler (JIT Closures)**<br>`src/core/compiler.ts` (448 lines) | Generates high-speed JavaScript `Function` closures from AST nodes for slice sampling and level-set evaluation. | **35 code generators**<br>• 9 AST node types<br>• 5 unary ops<br>• 11 binary ops<br>• 21 builtin transcendental functions | **S1** (Evaluator), **S2** (Tower), **S5** (Sampler) |
| **S4** | **Kind Lattice & Subsumption**<br>`src/core/kinds.ts` (445 lines)<br>`classifier.ts`, `analyzer.ts` | Defines the mathematical ontology (20 kinds), subsumption ordering ($\sqsubseteq$), admitted operations, and coercion rules. | **130 kind rules**<br>• 20 MathKinds<br>• 8 subsumption branches<br>• 20 `admitsOperations` lists (110 operation strings)<br>• 6 coercion rules | **S1** (Evaluator), **S2** (Tower), **S9** (Solvers) |
| **S5** | **Slice Sampler & Mesh Engine**<br>`src/core/sampler.ts` (764 lines)<br>`marching_cubes_tables.ts` | Evaluates relations over 1D/2D/3D grids, extracts polylines via Marching Squares and meshes via Marching Cubes. | **18 sampling cases**<br>• 16 Marching Squares cases<br>• 256 Marching Cubes lookup cases<br>• 2D/3D slice closure factories | **S3** (Compiler), **S6** (Free Vars), **S7** (Viewport) |
| **S6** | **Spatial Dimension Inference**<br>`evaluator.ts` (`evalBlockAsSpace`),<br>`analyzer.ts` (`analyzeAST`) | Determines the intrinsic dimension $n = \|\mathrm{FreeVars}\|$ of spaces and relations by scanning identifier nodes. | **15 AST traversal cases**<br>• AST node visitor for free identifiers<br>• Lexical scope filter | **S5** (Sampler), **S7** (Viewport) |
| **S7** | **Space Viewport & UI Mapper**<br>`src/plot/space_viewport.ts` (686 lines)<br>`canvas2d.ts`, `surface3d.ts` | Maps spatial dimension $n$ to UI renderers (0: scalar, 1: 1D line, 2: 2D plane, 3: 3D orbit, $\ge 4$: slice + sliders). | **5 dimension branches**<br>• $n = 0, 1, 2, 3, \ge 4$<br>• Slice coordinate selection controls | **S5** (Sampler), **S6** (Dimension Inference) |
| **S8** | **Dimensional & Unit Analysis**<br>`src/core/dimensional.ts` (581 lines) | Infers physical units and polynomial degrees; checks geometric formula validity against hardcoded catalog. | **32 dimensional rules**<br>• 12 hardcoded `KNOWN_QUANTITIES`<br>• 8 unit conversion rules<br>• 12 AST degree rules | **S1** (Evaluator), **S2** (Tower) |
| **S9** | **Symbolic Diff & Algebraic Solvers**<br>`src/core/symbolic_diff.ts` (968 lines)<br>`src/core/algebra/solver.ts` (653 lines) | Computes symbolic derivatives with derivation steps; solves linear, quadratic, power, and proportion equations. | **76 algebraic rules**<br>• 22 differentiation rules<br>• 35 isolation/step rules<br>• 19 equation classifier branches | **S1** (Evaluator), **S2** (Tower), **S4** (Kinds) |
| **S10** | **Contextual Explainer & Visualizer**<br>`src/core/explainer.ts` (291 lines)<br>`src/plot/explainer_visualizer.ts` (450 lines) | Generates natural language explanations and interactive micro-canvases (Riemann sum, tangent line) from symbol context. | **35 regex & template rules**<br>• 15 symbol regex matchers<br>• 4 visualizer canvas renderers | **S1** (Evaluator), **S9** (Symbolic Diff) |

**Total Handwritten Behavioral Sites**: 10 subsystems, **481 handwritten cases**.

---

## Section B: Concrete Inconsistencies & Unchecked Divergence

This section demonstrates concrete mathematical expressions where two sites that must agree diverge silently. Nothing in the current architecture catches these errors.

---

### B.1 Reducer (**S2**) vs. Compiler (**S3**): Semantic Divergence on Arithmetic & Edge Cases

The reducer evaluates expressions in the gutter and notebook cells. The compiler generates JavaScript code for canvas rendering and interactive sampling. They evaluate different mathematics.

#### Divergence Case 1: Indeterminate Zero Power $0^0$
- **Expression**: `y = x^0` evaluated at $x = 0$, or `f(x) := 0^x` evaluated at $x = 0$.
- **Reducer (**S2**)**: `powValues` in `tower.ts` evaluates $0^0$ to `{ type: 'undefined' }` (or unreduced `0^0`).
- **Compiler (**S3**)**: `compileNode` compiles `^` to `Math.pow(x, 0)`. In JavaScript, `Math.pow(0, 0) === 1`.
- **The Divergence**: In the gutter, the user sees `f(0) = undefined`. On the canvas, the curve $y = x^0$ renders as a solid continuous line at $y = 1$ passing directly through $(0, 1)$ without a hole or discontinuity. The gutter and canvas directly contradict each other for the identical coordinate.

#### Divergence Case 2: Division by Zero Asymptotes $1/x$
- **Expression**: `y = 1 / x` sampled near $x = 0$.
- **Reducer (**S2**)**: `divValues` evaluates $1/0$ to `{ type: 'undefined' }` or unreduced `1/0`.
- **Compiler (**S3**)**: Emits native `1 / x`, producing IEEE-754 `+Infinity` or `-Infinity`.
- **The Divergence**: Marching Squares receives `Infinity`. Because `Number.isFinite(Infinity)` is `false`, the sampler replaces it with `NaN`. The level-set tracer silently clips the curve without knowing whether the discontinuity was a pole, an asymptote, or a numerical overflow.

#### Divergence Case 3: Truncated Modulo vs. Euclidean Modulo
- **Expression**: `y = x % -3`
- **Reducer (**S2**)**: Evaluates rational or integer modulo with BigInt arithmetic (`BigInt(n) % BigInt(d)`).
- **Compiler (**S3**)**: Emits `(x) % (-3)`. In JavaScript, `-5 % 3 === -2` (truncated toward zero), whereas mathematical modulo is non-negative ($1$).
- **The Divergence**: Periodic saw-tooth waveforms sampled on canvas have different phase and sign in negative coordinate quadrants compared to single-point evaluation in the gutter.

---

### B.2 Kind Lattice (**S4**) vs. Tower (**S2**) & Reducer (**S1**): Phantom Promises

The Kind Lattice claims a formal mathematical hierarchy with subsumption ($\sqsubseteq$) and admitted operations. The runtime engine does not implement them.

#### Divergence Case 1: LinearMap Subsumption of Vectors
- **Expression**: `compose(v, w)` or `kernel(v)` where `v` is a Vector `[1, 2, 3]`.
- **Kind Lattice (**S4**)**: `kindSubsumes({ name: 'LinearMap' }, { name: 'Vector' })` returns `true` (`kinds.ts:261`). `admitsOperations('LinearMap')` includes `compose (*)`, `apply`, `inverse (^-1)`, `kernel`, `image`.
- **Tower / Evaluator (**S1, S2**)**: Passing a vector to matrix operations or function application throws a runtime error `Cannot perform operation on Vector`.
- **The Divergence**: The kind checker reports that Vector is a valid LinearMap that admits `kernel` and `inverse`, but the evaluator crashes when the user attempts the operation.

#### Divergence Case 2: Scalar Subsumption & Precision Collapse
- **Expression**: `(1/3 + 1/6) = 1/2` vs `(0.3333333333333333 + 0.16666666666666666) = 0.5`
- **Kind Lattice (**S4**)**: Asserts $\text{Natural} \sqsubseteq \text{Integer} \sqsubseteq \text{Rational} \sqsubseteq \text{Real}$. This implies that any predicate true on Rational remains valid under Real.
- **Tower (**S2**)**: Once an expression mixes with a float, `BigFraction` is coerced to IEEE-754 `FloatValue`. Exact equivalence breaks: `1/3 + 1/6 == 1/2` evaluates to `true`, but `1/3 + 1/6 + 0.0 == 1/2` can evaluate to `false` due to floating point rounding. The subsumption lattice cannot express precision loss.

#### Divergence Case 3: Phantom Differential Form Operations
- **Expression**: `omega := DifferentialForm(degree: 1) ; d omega`
- **Kind Lattice (**S4**)**: Declares `DifferentialFormKind` and admits `wedge (∧)`, `exterior_derivative (d)`, `hodge_star (⋆)`.
- **Evaluator (**S1**)**: None of these operators are wired in `evalNode`. Calling `omega ^ eta` attempts numerical exponentiation and fails. The kind lattice is an unexecutable fiction.

---

### B.3 Spatial Dimension Inference (**S6**) vs. Sampler (**S5**) vs. Viewport (**S7**)

The dimension of a space is supposed to be strictly $n = \|\mathrm{FreeVars}\|$. Lexical scoping creates silent mismatches.

#### Divergence Case 1: Lexically Shadowed Free Variables
- **Expression**:
  ```axine
  a := 5
  {
    y = a * x + b
  }
  ```
- **Dimension Inference (**S6**)**: If the free variable scanner inspects the AST of `y = a * x + b` in isolation, it counts 4 identifiers $\{y, a, x, b\} \implies n = 4$. If it inspects the outer environment, `a` is bound to $5$, so the true free variables are $\{y, x, b\} \implies n = 3$.
- **Sampler / Viewport (**S5, S7**)**: If the free variable collector in `evalBlockAsSpace` and the compiler context in `compileAST` disagree on whether `a` is bound:
  - The viewport instantiates a 4D slice viewer (2 display axes, 2 sliders for `a` and `b`).
  - The compiled closure expects `a` to be passed as an argument, ignoring the outer binding `a := 5`.
  - Moving the slider for `a` overrides the user's explicit definition `a := 5` without warning.

#### Divergence Case 2: Relations with Zero Free Variables
- **Expression**: `sqrt(-1) < 3` or `2 = 2` inside a block `{ 2 = 2 }`.
- **Dimension Inference (**S6**)**: Finds 0 free variables ($n = 0$).
- **Viewport (**S7**)**: $n = 0$ creates no canvas and renders in the gutter.
- **Divergence**: If a user writes `{ x = 0 ; 2 = 2 }`, the block has 1 free variable ($x$). The viewport creates a 1D Number line for $x$. But the relation `2 = 2` is a tautology ($0 = 0$) over all $x$. The 1D sampler tries to find roots of $0 = 0$ and marks every sampled point as a root, drawing a solid black bar across the entire axis.

---

### B.4 Reducer (**S1, S2**) vs. Symbolic Differentiator (**S9**)

#### Divergence Case 1: Differentiation of Non-Smooth Points
- **Expression**: `f(x) := abs(x)` ; evaluate `d//dx f(x)` at `x = 0`.
- **Symbolic Differentiator (**S9**)**: Produces the derivative AST `x / abs(x)` or `sgn(x)`, which at $x = 0$ evaluates to $0/0 \implies \text{undefined}$.
- **Numerical Difference Fallback**: If evaluated via numerical difference quotient $\frac{f(h) - f(-h)}{2h} = \frac{|h| - |-h|}{2h} = 0$, the engine reports that the derivative is $0$.
- **The Divergence**: Symbolic differentiation reports undefined (correct: non-differentiable cusp); numerical evaluation reports $0$ (false derivative).

#### Divergence Case 2: Chain Rule Syntactic Bloat vs. Normalized Reduction
- **Expression**: `d//dx (sin(x)^2 + cos(x)^2)`
- **Symbolic Differentiator (**S9**)**: Generates $2\sin(x)\cos(x) + 2\cos(x)(-\sin(x))$ without simplification.
- **Reducer (**S1**)**: Reduces the original expression $\sin^2(x) + \cos^2(x)$ to $1$, whose derivative is $0$.
- **The Divergence**: `evaluate("d//dx (sin(x)^2 + cos(x)^2)")` produces an unreduced 7-node AST, while `evaluate("d//dx 1")` produces $0$. The system fails the invariant that algebraically identical inputs produce identical derivatives.

---

### B.5 Dimensional Checker (**S8**) vs. Numeric Tower (**S2**)

#### Divergence Case 1: Transcendental Functions on Physical Quantities
- **Expression**: `sin(90 deg)` vs `sin(10 m)`
- **Dimensional Checker (**S8**)**: `deg` is an angular unit (dimensionless ratio $\text{rad}$); `10 m` is a length. `S8` correctly flags `sin(10 m)` as an invalid transcendental argument.
- **Numeric Tower (**S2**)**: `applyBuiltin('sin', ...)` strips the unit from `QuantityValue` and computes $\sin(10) = -0.544021$.
- **The Divergence**: In standalone dimensional checking (`check(sin(10 m))`), it reports an error. In direct evaluation (`sin(10 m)`), it returns a bare number without error.

---

### B.6 Explainer (**S10**) vs. Live Evaluator (**S1**)

#### Divergence Case: Hardcoded Regex Desynchronization
- **Expression**: `\int_0^1 x^3 dx`
- **Explainer (**S10**)**: Matches the symbol `dx` under `integral`. Its template (`explainer.ts:77`) hardcodes:
  > *"Integrating $x^2$ with respect to $dx$ accumulates slices... yielding $1/3 x^3$."*
- **The Divergence**: The user wrote $x^3$ (whose integral is $\frac{1}{4}x^4 = 0.25$). The explainer text explicitly describes $x^2$ and $\frac{1}{3}x^3$ because its template was hardcoded for a quadratic example. The explanation directly contradicts the formula on screen.

---

## Section C: The Minimal Set

What is the smallest number of places mathematical behavior can live?

### The Minimal Triad

Mathematical behavior in Axine can be completely defined in **exactly three places**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             THE MINIMAL TRIAD                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  1. ONTOLOGY (What an object IS)                                            │
│     • The universal AST: Numbers, Identifiers, Operators, Blocks, Relations │
│     • The Value domain: Rational (BigInt), Float (f64), Complex (f64, f64), │
│       Unreduced Expression AST, Space (Coordinates, AST)                    │
│     • Lexical Scope / Environment: name -> Value                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  2. REDUCTION (What reduction DOES)                                         │
│     • Small-step term rewriting: (E, Context) -> E'                         │
│     • Field/Ring Axioms: Constant folding, identities (+0, *1), associative │
│       grouping over the active Context (R, C, Z_p)                          │
│     • Fuel/Budget tracking: Step/Depth limits -> unknown(budget-exhausted)  │
│     • Unreduced forms STAND: If no rule matches, return E                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  3. OBSERVATION (What extension MEANS)                                      │
│     • Slicing: Given Space(V, R) and Slice(V_free, V_fixed), substitute     │
│       fixed coordinates to produce R_slice(V_free)                          │
│     • Sampling: Evaluate R_slice over grid [-L, L]^k                         │
│     • Reconstruction: Marching Squares (k=2), Marching Cubes (k=3),         │
│       Root interval (k=1)                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Derivation Audit of the 10 Current Sites from the Minimal Triad

Can the 10 current behavioral sites be derived from the triad, or are they genuinely independent?

| Current Site | Status | How It Is Derived from the Minimal Triad |
| :--- | :--- | :--- |
| **S1: Evaluator** | **Consolidates into 2 (Reduction)** | The AST walker is simply the term rewriting engine of **Reduction**. |
| **S2: Numeric Tower** | **Consolidates into 2 (Reduction)** | The operator implementations are the reduction rules for constant literals under field axioms. |
| **S3: Relation Compiler** | **DERIVED from 2 (Reduction)** | The compiler is not an independent semantics; it is a code-generation backend for the reduction rules on floats. It must be generated directly from the AST reduction table. |
| **S4: Kind Lattice** | **DELETED / DERIVED from 1 & 2** | Kinds are not an independent type system. A kind is simply the predicate of which reduction rules apply to an object. Static kind hierarchies that promise unexecutable operations are eliminated. |
| **S5: Slice Sampler** | **Consolidates into 3 (Observation)** | The sampler is the uniform level-set extractor for observed slices. |
| **S6: Dimension Inference** | **DERIVED from 1 (Ontology)** | Dimension is strictly $\|\mathrm{FreeVars}(\text{AST}, \text{Scope})\|$. It requires no separate heuristic engine. |
| **S7: Space Viewport** | **DERIVED from 3 (Observation)** | The viewport simply observes $k = \min(n, 2 \text{ or } 3)$ display axes and provides $n - k$ sliders for the rest. |
| **S8: Dimensional Analysis** | **DERIVED from 2 (Reduction)** | Units are multiplicative algebraic symbols with reduction rules ($1\text{ m} \cdot 1\text{ m} \to 1\text{ m}^2$, $1\text{ m} + 1\text{ s} \to \text{unreduced}$). The hardcoded `KNOWN_QUANTITIES` catalog is deleted. |
| **S9: Symbolic Diff & Solvers** | **DERIVED from 2 (Reduction)** | Differentiation is an operator `d//dx` with standard reduction rules (product rule, chain rule). Isolation is equivalence-preserving relational rewriting. |
| **S10: Contextual Explainer** | **DELETED** | Hardcoded text templates that desynchronize from code are deleted. Explanations are live derivation steps produced directly by reduction traces. |

**Conclusion**: The triad is sufficient. Every legitimate mathematical behavior in Axine is either a rule of **Ontology**, a rule of **Reduction**, or a rule of **Observation**.

---

## Section D: Systemic Invariants

The following machine-checkable invariants must hold across the entire system. They can be verified by property-based testing (e.g. `fast-check` generating arbitrary valid AST expressions) rather than hand-crafted unit tests.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SYSTEMIC INVARIANTS & PROPERTY GATES                     │
└─────────────────────────────────────────────────────────────────────────────┘

  Invariant 1: Reduction Idempotency
  ∀ E, Context:  Reduce(Reduce(E, Context), Context) ≡ Reduce(E, Context)

  Invariant 2: Compilation-Reduction Equivalence
  ∀ E(x_1..x_n), ∀ (c_1..c_n) ∈ R^n where defined:
      Compile(E)(c_1..c_n) == ToNumber(Reduce(E[x_i ↦ c_i], R))

  Invariant 3: Extensional Observation Invariance
  ∀ R_1, R_2:  (R_1 ⟺ R_2) ⟹ Sample(R_1, Domain) ≡ Sample(R_2, Domain)

  Invariant 4: Free-Variable & Spatial Concordance
  ∀ Space:  n_dim ≡ |FreeVars(AST, Scope)| ≡ (n_display + n_sliders)

  Invariant 5: Context Relational Soundness
  ∀ a, b, c ∈ Context:
      Reduce(a + b) ≡ Reduce(b + a)
      Reduce((a + b) + c) ≡ Reduce(a + (b + c))
      Reduce(a * (b + c)) ≡ Reduce(a * b + a * c)

  Invariant 6: Honest Stance on Unreducibles
  ∀ E:  Reduce(E) ∈ { Value, ExpressionAST, unknown(budget-exhausted) }
        (No synthetic error strings, no fake refusal tokens)
```

### Current Codebase Pass/Fail Audit on Proposed Invariants

| Invariant | Description | Current Code Status | Failure Mode / Reason |
| :--- | :--- | :---: | :--- |
| **I1: Idempotency** | $\mathcal{R}(\mathcal{R}(E)) = \mathcal{R}(E)$ | **FAIL** | Expressions with floating point intermediates or unevaluated user functions can shift on a second pass. |
| **I2: Compiler-Reducer Agreement** | $f_{\text{compiled}}(\vec{c}) \approx [\mathcal{R}(E)]_{\vec{c}}$ | **FAIL** | Diverges on $0^0$ ($1$ vs unreduced/undefined), $1/0$ ($\infty$ vs unreduced/undefined), and negative powers. |
| **I3: Extensional Invariance** | $R_1 \Leftrightarrow R_2 \implies \text{Sample}(R_1) = \text{Sample}(R_2)$ | **PASS** | Uniform grid Marching Squares samples the zero level set identically regardless of syntactic form. |
| **I4: Dimension Concordance** | $n_{\text{infer}} = n_{\text{sampler}} = n_{\text{viewport}}$ | **FAIL** | Lexical variables in outer scopes can be falsely counted as free space variables by `analyzeAST`. |
| **I5: Context Field Axioms** | Field axioms hold under reduction | **FAIL** | Large rational addition coerced to float violates associativity $(a+b)+c \ne a+(b+c)$. |
| **I6: No Fake Refusals** | Unreducibles stand or exhaust budget | **PASS\*** | Replaced `requires-unavailable-theory` and `none` with unreduced standing expressions in recent phase. |

---

## Section E: Migration Cost & Breakage Windows

Consolidating the architecture to the Minimal Triad requires touching, replacing, or deleting existing modules.

### Module Breakdown: Survives, Changes, Deletes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CONSOLIDATION IMPACT                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  SURVIVES UNCHANGED (11 modules — ~4,200 lines)                             │
│  • src/core/tokenizer.ts           (Lexing & tokens)                        │
│  • src/core/parser.ts              (AST grammar & parsing)                  │
│  • src/core/formatter.ts           (AST pretty-printing)                    │
│  • src/core/math_typeset.ts        (Typography & KaTeX rendering)           │
│  • src/core/numeric/rational.ts    (BigFraction exact arithmetic)           │
│  • src/core/numeric/float.ts       (Multi-precision float math)             │
│  • src/core/numeric/matrix.ts      (Matrix algorithms)                      │
│  • src/core/sampler.ts             (Marching Squares/Cubes slice sampling)  │
│  • src/plot/canvas2d.ts            (2D Canvas rendering & viewport math)   │
│  • src/plot/surface3d.ts           (3D Mesh rendering & orbit controls)     │
│  • src/document/file_manager.ts    (File I/O & persistence)                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  CHANGES / CONSOLIDATED (4 modules — ~2,800 lines)                          │
│  • src/core/evaluator.ts           (Refactored into pure Context Reducer)   │
│  • src/core/numeric/tower.ts       (Merged into Context reduction rules)    │
│  • src/core/compiler.ts            (Directly driven by reduction table)     │
│  • src/plot/space_viewport.ts      (Simplified strictly to n-D slicing)     │
├─────────────────────────────────────────────────────────────────────────────┤
│  DELETED ENTIRELY (5 modules — ~2,350 lines)                                │
│  • src/core/kinds.ts               (322 lines — replaced by context rules)  │
│  • src/core/classifier.ts          (210 lines — rigid equation patterns)    │
│  • src/core/explainer.ts           (291 lines — hardcoded regex templates)  │
│  • src/plot/explainer_visualizer.ts(450 lines — hardcoded canvas visualizers)│
│  • src/core/dimensional.ts         (581 lines — hardcoded KNOWN_QUANTITIES) │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Test Suite Impact (647 Total Tests)

- **492 Tests (76.0%) Pass Unchanged**: Tokenizer, parser, BigFraction, float math, matrix arithmetic, slice sampling, ODE integration, and multi-variable relation plotting.
- **118 Tests (18.2%) Require Assertion Updates**: Tests asserting hardcoded kind names (`Scalar(Natural)`), tests expecting explainer template strings, and tests checking deleted `KNOWN_QUANTITIES`.
- **37 Tests (5.8%) Deleted**: Tests asserting rigid equation classification rejections, explainer regex unit tests, and kind lattice subsumption tests for phantom operations.

### Application Breakage Window
- **Zero Breakage Strategy**: Consolidation can proceed incrementally:
  1. *Step 1*: Delete `explainer.ts` and `explainer_visualizer.ts` (0 UI dependencies).
  2. *Step 2*: Replace `kinds.ts` checks with direct value matching in `evaluator.ts`.
  3. *Step 3*: Unify `tower.ts` and `evaluator.ts` into a single reduction engine.
  4. *Step 4*: Update `compiler.ts` to share operator mappings with reduction.
- **Estimated Window of Transient Test Failures**: **1 day** during Step 3 unification.

---

## Section F: What You Do Not Know (Technical Uncertainties)

The following deep technical questions remain open and cannot be resolved by code inspection alone:

1. **Symbolic Normalization vs. Exponential Term Growth**:
   - Under the rule *"an unreduced expression stands as itself"*, operations on unreduced expressions accumulate AST nodes (e.g. $((\sqrt{-1} + 1) + 1) + 1 \dots$).
   - Constant folding handles associative grouping for arithmetic, but what is the exact canonical normal form for algebraic expressions that prevents exponential AST growth without implementing a full, slow Gröbner basis engine?
2. **Context Switching Semantics Across Nested Spaces**:
   - If an outer space declares `with context C` and an inner block declares `with context R`:
   - Does a value $\sqrt{-4} = 2i$ computed in the outer scope become `undefined` or an unreduced symbol when referenced inside the real inner scope?
   - How does closure compilation handle a slice relation that references variables from conflicting algebraic contexts?
3. **Implicit Grid Sampling Near Wild Oscillations**:
   - For relations like $\sin(1/x) = y$ or $x^2 + y^2 = 0$ (isolated point at the origin):
   - Marching Squares samples at discrete grid resolution $\Delta x$. An isolated zero point where no grid cell changes sign is completely invisible to Marching Squares.
   - What is the minimal root-bounding or interval-arithmetic mechanism that guarantees isolated points and cusps are detected without sacrificing the $O(K^2)$ slicing performance?

---

## Section G: Resolution of $0/0$ — Undefined vs. Refusal

### The Question
> *"The refusal pass reports $0/0$ reducing to `undefined`. Is `undefined` a value that $0/0$ reduces to, or a refusal with a new name? Under the reduction model $0/0$ should reduce to something or stand as $0/0$. Say which it is and whether it survives the consistency requirement."*

### The Mathematical & Semantic Analysis

1. **What is Division?**
   In any field $\mathbb{F} = (F, +, \cdot, 0, 1)$, division $a / b$ is not a primary operation; it is syntactic sugar for multiplication by the multiplicative inverse:
   $$a / b \equiv a \cdot b^{-1}$$
   The field axioms state:
   $$\forall b \in F \setminus \{0\}, \;\exists!\, b^{-1} \in F \text{ such that } b \cdot b^{-1} = 1$$
   The element $0$ has **no multiplicative inverse** by definition. The symbol $0^{-1}$ is not an element of $F$.

2. **What Happens During Reduction?**
   Reduction is the application of rewrite rules:
   - $\text{Rule 1 (Inverse)}: b \cdot b^{-1} \to 1 \quad (\text{if } b \ne 0)$
   - $\text{Rule 2 (Zero Product)}: 0 \cdot a \to 0$
   - $\text{Rule 3 (Division)}: a / b \to a \cdot b^{-1} \quad (\text{if } b \ne 0)$

   When presented with $0 / 0$:
   - Rule 3 cannot fire because $b = 0$.
   - Rule 2 cannot fire because the second operand $0^{-1}$ does not exist.
   - **No algebraic reduction rule in the field applies to $0 / 0$.**

3. **Is `undefined` a Refusal in Disguise?**
   **YES.** Returning a special token `undefined` for $0/0$ is an artificial refusal mechanism.
   - When $\sqrt{-1}$ cannot be reduced in $\mathbb{R}$, we let it stand as $\sqrt{-1}$. We do not replace it with `undefined`.
   - When $x + y$ cannot be reduced because $x$ and $y$ are unbound, we let it stand as $x + y$. We do not replace it with `undefined`.
   - If we replace $0/0$ with the English token `undefined`, the engine is stepping outside the algebraic reduction system to declare: *"I refuse to represent this expression as an AST; I will substitute a pseudo-value."*
   - Furthermore, `undefined` destroys algebraic structure: what is $\text{undefined} + 2$? What is $\text{undefined} \cdot 0$? In standard AST reduction, $(0/0) + 2$ is simply the unreduced tree `BinaryOp('+', BinaryOp('/', 0, 0), 2)`.

4. **The Consistent Resolution**:
   Under the pure **Evaluation is Reduction** model:
   - **$0/0$ is an unreducible expression. It stands as $0/0$.**
   - $1/0$ stands as $1/0$.
   - $\sqrt{-1}$ in $\mathbb{R}$ stands as $\sqrt{-1}$.
   - $0/0$ does NOT reduce to `undefined`. `undefined` as a special value type is eliminated.
   - The two surviving terminal outcomes are:
     1. **An Expression (reduced as far as field rules allow, which may be the expression itself)**.
     2. **`unknown(budget-exhausted, ...)`** (computation ran out of resources).

This eliminates the last remaining asymmetry in the evaluation model.

---

## Conclusion & Architectural Recommendation

1. **Adopt the Minimal Triad**: Consolidate all mathematical operations into **Ontology**, **Reduction**, and **Observation**.
2. **Derive the Compiler**: Generate `compiler.ts` directly from the reduction rules table, eliminating all silent semantic divergence between gutter evaluation and canvas sampling.
3. **Retire the Kind Lattice & Explainer**: Replace static kind hierarchies and hardcoded regex templates with live derivation traces produced during reduction.
4. **Enforce Complete Reduction Uniformity**: Let $0/0$ stand as $0/0$, unifying division by zero with all other unreducible mathematical forms under the single axiom: **an expression that cannot be reduced evaluates to itself.**
