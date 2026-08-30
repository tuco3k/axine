# Math-Notation Programming Language & Live Document Editor

A mathematical Turing-complete notation language where you write math the way you'd write it on paper, and it executes numerically. The core language has **zero external runtime dependencies** (no math.js, nerdamer, decimal.js, Monaco/CodeMirror, or parser generators) and includes a handwritten tokenizer, Pratt precedence-climbing parser, exact rational tower backed by `BigInt`, AST normalizer/formatter, scope analyzer, Kleene 3-valued logic engine, 3D Canvas graphing engine, live 4-region Work Panel, and a 100-theorem witness corpus.

---

## Honest Mathematical Framing

This system does **NOT** prove the theorems in the witness corpus. It encodes each theorem as a formal **`claim`** whose computational shadow is finite and checkable.
- Claims with a finite witness shadow (Kinds A–G) evaluate to `true` or `false`.
- Theorems requiring infinite-dimensional manifolds, continuum topology, or undecidable reductions (Kind H, such as the Poincaré Conjecture, P vs NP, or MIP*=RE) strictly evaluate to **`unknown(not-finitely-checkable)`** and cite their human proof.

---

## Quick Start

```bash
# Install development dependencies (Vite, TypeScript, Vitest)
npm install

# Run complete unit test suite (367+ tests across 12 files)
npm test

# Start live interactive document editor
npm run dev

# Build for production
npm run build
```

---

## Architecture Overview

```
Source Code (Continuous Document)
    │
    ▼
Tokenizer (Lexer)     ──> Tokens with line/column Spans & Unicode Glyphs (π, τ, ϕ, √, Σ, Π, ∫, ∂, ≡)
    │
    ▼
Pratt Parser          ──> Abstract Syntax Tree (AST) with Blocks & Scopes
    │
    ├────────────────────────┬────────────────────────┬────────────────────────┐
    ▼                        ▼                        ▼                        ▼
AST Formatter           Scope Analyzer         Kleene 3-Valued Logic    Numeric Tower & Evaluator
(Canonical parse)       (Lexical closures)     (True / False / Unknown) (BigInt Rationals & Matrices)
    │                        │                        │                        │
    └────────────────────────┴────────────────────────┴────────────────────────┘
                                     │
                                     ▼
                Dimensionality Inference & 3D Canvas Engine
                (2D Curves, Surfaces, Heatmaps, Orbits, Pan, Dolly, Occlusion)
                                     │
                                     ▼
                Live Work Panel (Results, Scope, Trace & Fuel, Frames)
```

---

## Two Execution Modes

1. **Ambient Mode**:
   - Live per-line evaluation as you type.
   - Budget: 250 ms / 2,000,000 steps.
   - Cancels immediately on keystroke. Runs in the ambient worker pool.
2. **Invoked Mode**:
   - Explicit execution of `{ ... }` blocks or full document via `▶ Run All`.
   - User-chosen budget: `250ms`, `1s`, `10s`, `1min`, `10min`, `unbounded`.
   - Runs in an independent worker thread. Ambient typing never interrupts an invoked run.
   - Immediate worker cancellation in $<100$ ms via `worker.terminate()`.

---

## Core Language Features

- **Exact Rational Tower**: `BigFraction` with Euclidean GCD reduction. Evaluates $1/3 + 1/3 + 1/3 = 1$ without float drift.
- **Kleene 3-Valued Logic**: Exact Kleene truth tables for `not`, `and`, and `or` with verified short-circuiting (`false and <infinite-loop> -> false`, `true or <infinite-loop> -> true`).
- **Lexical Scopes & Blocks**: `{ x := 5; y := 10; x + y }` with private local bindings, `:≡` / `:==` global export, and mutual recursion.
- **Turing Universality**:
  - 3-state 2-symbol Busy Beaver $BB(3)$ producing 6 ones in finite steps.
  - Rule 110 Cellular Automaton 1D simulation.
  - Pure Untyped $\lambda$-Calculus with Church arithmetic ($3 \times 4 = 12$) and the $Y$-combinator.
- **Mathematical Notation**:
  - Stacked fractions `a // b` vs inline `a / b`.
  - Differentials `d//dx (x^3)` and $\partial//\partial x$.
  - Big operators $\Sigma(i \text{ in } 1..n, \text{expr})$, $\Pi(i \text{ in } 1..n, \text{expr})$, $\int(x \text{ in } a..b, \text{expr})$.
  - Matrix linear algebra: creation `matrix([[1, 2], [3, 4]])`, determinant `det(A)`, inverse `inverse(A)`, trace, transpose, rank, and eigenvalues.
- **3D Canvas Visualization**:
  - Real-time Orbit (mouse drag), Pan (Shift+drag), Dolly/Zoom (mouse wheel), and Reset (double-click).
  - Depth-sorted Painter's algorithm with recursive quad subdivision for mutual occlusion.
  - Dimmed occluded axes and bounding box rendering.

---

## Documentation

- **[`CORPUS.md`](./CORPUS.md)**: Classification of all 100 witness theorems (Kinds A–H) and computational shadows.
- **[`GRAMMAR.md`](./GRAMMAR.md)**: Formal EBNF grammar, precedence hierarchy, ambiguity resolution table, and Kleene truth tables.
---

## Graphing & Dimensionality Inference (`graph(...)`)

The scope analyzer counts free variables (excluding bound parameters and assigned variables) to infer visualization mode:

1. **1 Free Variable** $\rightarrow$ **2D Adaptive Curve Plot** (`graph(2x)`):
   - Adaptive recursive subdivision in areas of high curvature.
   - Discontinuity detection that breaks asymptotes (e.g. $\tan x$) without vertical spikes.
   - Header indicates default domain `[-10, 10]` or explicit domain.
2. **Multiple Series on Shared Axes** (`graph(2x, x^2, ln x)`):
   - Plots multiple series with distinct color coding and legend.
3. **Different Free Variables** (`graph(2x, y, 9z)`):
   - Maps each distinct variable to the common horizontal axis and displays an explicit notification banner:
     `"Note: Variables 'x', 'y', and 'z' were each mapped to the same horizontal axis."`
4. **Parametric 2D Curves** (`graph((cos t, sin t), t in 0..tau)`):
   - Detects 2D tuple with 1 free parameter and samples $(x(t), y(t))$.
5. **2 Free Variables** $\rightarrow$ **2D Heatmap & 3D Surface** (`graph(sin x cos y)`):
   - 2D Heatmap with Viridis color gradient and colorbar scale.
   - Interactive 3D Surface view with Orbit (drag), Pan (shift+drag), Zoom (scroll), and Reset (double-click).
6. **0 Free Variables** $\rightarrow$ Descriptive error: `"graph() requires at least one free variable to plot against, found 0."`

---

## Error Diagnostic System

Every syntax, lexical, or runtime error provides:
1. Precise source span with line, column, and `^^^^` underline in the code snippet.
2. Description of what was expected.
3. Actionable suggestion for correction.
4. Guaranteed zero unhandled exceptions, `NaN`, `undefined`, or stack traces leaking to the UI.


---

## Bounded Step-by-Step Algebraic Solving (`isolate`) & Convergence Trace

### 1. Honest Scope & Boundaries — Not a General CAS
This language is **NOT** a general Computer Algebra System (CAS). Algebraic solving is bounded and strictly enforced by an AST classifier before derivation begins. Unsupported forms immediately return `unknown(requires-unavailable-theory, ...)` naming the limitation and suggesting numeric `solve(f, near: x0)` rather than attempting unreliable partial derivations.

```
isolate(equation, for: x)
```

#### Supported Equation Classes ONLY:
- **`LINEAR`**: $ax + b = c$, including forms requiring expansion/distribution ($2(x - 3) = 4x + 1 \implies x = -7/2$), term collection, identity detection ($2(x+1) = 2x+2 \implies$ all real $x$), and contradiction detection ($5x = 5x+1 \implies$ no solution).
- **`QUADRATIC`**: $ax^2 + bx + c = 0$ via factoring into $(x - r_1)(x - r_2) = 0$ when integer roots exist ($x^2 - 5x + 6 = 0 \implies x \in \{2, 3\}$), completing the square ($x^2 - 2 = 0 \implies x = \pm\sqrt{2}$), or quadratic formula. Discriminants $D < 0$ return `unknown(requires-unavailable-theory)` naming complex numbers.
- **`PROPORTION`**: $A/B = C/D$, cross-multiplying and recording domain non-zero side conditions ($(x+1)/3 = 4/2 \implies x = 5$ with $3 \neq 0$).
- **`POWER`**: $x^n = k$ for integer $n$, producing all real roots (e.g. $x^2 = 9 \implies x \in \{-3, 3\}$; $x^3 = 27 \implies x = 3$).

#### Explicitly Out of Scope (Rejected by Classifier):
- Cubics and higher polynomials ($x^3 - 6x^2 + 11x - 6 = 0 \rightarrow$ `unknown`, suggests `solve()`)
- Multi-variable systems of equations
- Symbolic function applications ($\sin x = 1/2 \rightarrow$ `unknown`, suggests `solve()`)
- Absolute values, inequalities, non-power radicals
- Rational equations with variable in multiple denominators ($x/(x+1) + x/(x-1) = 2 \rightarrow$ `unknown`)

### 2. Derivation Structure & Mandatory Self-Verification
Derivation results are first-class objects containing a sequence of transformation steps:
- **Rule Enum**: `distribute`, `collect`, `add-both-sides`, `subtract-both-sides`, `multiply-both-sides`, `divide-both-sides`, `cross-multiply`, `factor`, `complete-square`, `quadratic-formula`, `take-root`.
- **Justification**: Clear plain-English description of the algebraic rule applied.
- **Side Conditions**: Explicitly recorded whenever dividing or taking roots (e.g., non-zero divisor, domain restrictions).

**Self-Verification**:
Every derivation is verified before display:
1. Claimed roots are substituted back into the original AST ($|LHS - RHS| < 10^{-12}$ or exact rational equality).
2. Consecutive step pairs $(S_k, S_{k+1})$ are tested for algebraic equivalence across 20 sampled numeric points.
If any check fails, the derivation is discarded and evaluates to `unknown(no-convergence, "derivation failed self-verification")`.

### 3. Numeric Solve Convergence Trace
```
solve(f, near: x0, trace: true)
solve(expr, x in a..b, trace: true)
```
Returns structured iteration telemetry including iteration index $n$, approximation $x_n$, function value $f(x_n)$, and residual error $|f(x_n)|$ or bracket width.

---

## Known Boundaries & Implementation Notes

- Transcendentals on exact rationals produce high-precision IEEE 754 floating point numbers rather than arbitrary-precision algebraic numbers.
- 3D surfaces are rendered using depth-sorted isometric/perspective polygon rasterization on HTML5 Canvas.

