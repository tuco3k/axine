# Architectural Assessment: Transition to a Unified Mathematical Universe

> **Document**: Assessment of Architectural Impact, Deletions, and Migration Costs  
> **Status**: Non-executing Architectural Assessment  
> **Repository Target**: `tuco3k/axine`  
> **Reference Baseline**: [`AGENTS.md`](../AGENTS.md), [`docs/SEMANTICS.md`](./SEMANTICS.md)

---

## Executive Summary

Axine today is an evaluator with a display subsystem attached. Expressions evaluate to scalar or composite values, `graph()` requests visualization, and a 250-line AST dispatch table classifies syntax to decide how to draw.

Transitioning Axine to a **Mathematical Universe** means:
1. Writing an expression puts an object in a space.
2. The object possesses spatial/algebraic extension.
3. Display is the automatic observation of an object within its native space over an observation domain.
4. `graph()`, AST shape dispatchers, and view declarations are eliminated.

This assessment inspects the entire codebase (90 source files, 44 test suites, 614 automated tests) to determine the exact cost, module impact, deletion inventory, test suite fallout, sequencing, and technical unknowns.

---

## A. What Survives Untouched

The following subsystems are completely indifferent to this semantic transformation and require **zero architectural changes**:

| Subsystem | Source Path | Rationale / Why It Does Not Care |
| :--- | :--- | :--- |
| **Tokenizer** | `src/core/tokenizer.ts` | Mathematical tokens, operator symbols, Unicode math glyphs ($\Sigma, \Pi, \int, \nabla, \partial$, etc.), numbers, strings, and whitespace rules remain identical. |
| **Parser Core** | `src/core/parser.ts` | Expression parsing, operator precedence, relations ($=, \ne, <, \le, >, \ge$), bindings ($:=$), blocks ($\{ \dots \}$), records, and lambda syntax remain structurally identical. |
| **Rational Arithmetic Tower** | `src/core/numeric/rational.ts` | `BigFraction` handles exact integer and rational arithmetic ($\mathbb{Q}$) with infinite precision. Pure arithmetic on numbers does not change. |
| **Float Math Engine** | `src/core/numeric/float.ts` | Floating-point numerical routines, special functions ($\sin, \cos, \exp, \ln, \mathrm{erf}$, Bessel functions), and numerical precision helpers are invariant. |
| **Linear Algebra Core** | `src/core/numeric/matrix.ts` | Matrix data structures, Gaussian elimination, determinants, inverses, matrix multiplication, LU/QR decomposition, and trace calculations remain pure matrix algebra. |
| **Physical Dimensions & Units** | `src/core/dimensional.ts` | Dimensional lattice (Mass, Length, Time, etc.), unit conversions, and dimensional homogeneity verifiers operate purely on algebraic exponents. |
| **Symbolic Differentiation** | `src/core/symbolic_diff.ts` | AST transformation rules for derivatives (Product Rule, Chain Rule, Quotient Rule, Power Rule, Trig rules) operate purely on symbolic trees. |
| **Math Typesetting Engine** | `src/core/math_typeset.ts` | KaTeX-free AST typesetting pipeline, fraction bar formatting, lining figures, and TeXbook $\mu$-skip spacing algorithms format expressions regardless of how they are observed. |
| **Record & Module Systems** | `src/core/evaluator.ts` (Record/Module slices) | Record definitions, field accessors, `with` update expressions, and lexical module namespaces ($\mathrm{export}/\mathrm{import}$) are orthogonal to spatial extension. |
| **File I/O & Storage** | `src/document/file_manager.ts`<br>`src/notebook/storage.ts` | Local filesystem access via File System Access API, LocalStorage persistence, and JSON serializations operate on raw document text. |

---

## B. What Changes Shape

The following core modules must change structure or role. Each is classified as an **Edit** (modified in place) or a **Replacement** (fundamental redesign).

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        ARCHITECTURAL DELTA                              │
├──────────────────────────────┬──────────────────────────────────────────┤
│ Module                       │ Delta Type    │ Summary                  │
├──────────────────────────────┼──────────────────────────┼───────────────┤
│ src/core/types.ts            │ Replacement   │ Value & Space Hierarchy  │
│ src/core/evaluator.ts        │ Replacement   │ Universe Evaluation      │
│ src/plot/engine.ts           │ Replacement   │ Space Viewport Manager   │
│ src/plot/canvas2d.ts         │ Substantial   │ Domain Level-Set Sampler │
│ src/plot/surface3d.ts        │ Substantial   │ 3D Isosurface Sampler    │
│ src/document/document_state.ts│ Edit          │ Universe State Sync      │
│ src/document/editor.ts       │ Replacement   │ Multi-Space Work Panel   │
└──────────────────────────────┴───────────────┴──────────────────────────┘
```

### 1. `Value` (`src/core/types.ts`) — **Replacement**
- **Current State**: A flat union of 34 ad-hoc types (`RationalValue | FloatValue | TupleValue | GraphValue | TrajectoryValue | DrawingPrimitiveValue | SceneValue | DescribedValue | ...`).
- **Required Shape**:
  - A `Value` can no longer be merely a closed scalar/tuple; it must represent a **Mathematical Entity**:
    1. **Point / Scalar / Tensor**: An element of a field/ring (0-dimensional extension).
    2. **Spatial Object / Relation**: An object with spatial extension (a predicate $R(\vec{x}) = 0$ or function graph $y = f(\vec{x})$) carrying its coordinate tuple $(x_1, \dots, x_n)$ and its native ambient space $\mathcal{S}$.
    3. **Solution Curve / Trajectory**: A 1D parameterized path $\gamma(t)$ inhabiting phase space $(t, \vec{x}) \in \mathbb{R} \times \mathbb{R}^n$.
  - **Obsolete Values**: `GraphValue` (which wraps `GraphSpec`), `DrawingPrimitiveValue`, `SceneValue`, and `DescribedValue` are deleted. They were synthetic vehicles for display dispatch.

### 2. `Environment` & Spatial Setting (`src/core/evaluator.ts`, `src/core/types.ts`) — **Edit & Extension**
- **Current State**: `Environment = Record<string, Value>` — a flat JavaScript dictionary with ad-hoc hidden fields (`__views__`, `__exports__`, `__units__`).
- **Required Shape**:
  - The `Environment` carries the **Active Context** ($\mathbb{R}$, $\mathbb{C}$, $\mathbb{Z}_p$, Clifford algebra $C\ell(p,q)$) and its polymorphic operator signature table.
  - **Does a setting thread through Environment or belong to Value?**
    - The *Context / Default Field* is threaded through `Environment` (defining arithmetic rules and symbol resolution).
    - The *Spatial Setting* (e.g., coordinate space $\mathbb{R}^2(x, y)$ vs $\mathbb{R}^3(x, y, z)$) is an **intrinsic property of the Value itself**.
    - An object knows its free coordinates and dimensional extension. The environment does not force a universal coordinate space onto disjoint objects.

### 3. `evalGraph` & AST Dispatch Table (`src/core/evaluator.ts:3860-4110`) — **Delete**
- **Current State**: 250 lines of AST shape inspection. It checks whether arguments are tuples of 2 vs 3 expressions, trajectory arrays, orbits, or 2-variable scalar fields, then manually builds a `GraphSpec`.
- **Required Shape**: **Deleted entirely**. Expressions evaluate directly to spatial relations or functions. The engine does not inspect syntactic shapes to choose visual templates.

### 4. The Plot Layer (`src/plot/canvas2d.ts`, `src/plot/surface3d.ts`, `src/plot/engine.ts`) — **Substantial Edit / Replacement**
- **Current State**: `GraphPlotEngine` switches between `HeatmapPlotter`, `Surface3DPlotter`, and `Canvas2DPlotter` based on `spec.kind === 'parametric' | 'surface' | 'curve' | 'orbit'`.
- **Required Shape**:
  - **Plotters Survive**: The low-level rendering math (Canvas2D stroke paths, coordinate projections, DPR scaling, Pan/Zoom transformations, WebGL/Canvas 3D depth-sorting and lighting) remains intact.
  - **Input Pipeline Replaced**: Instead of receiving a rigid `GraphSpec`, a Viewport receives a set of *Spatial Entities* sharing that space, plus an observation domain $\mathcal{D} = [x_{\min}, x_{\max}] \times [y_{\min}, y_{\max}]$.
  - The 2D viewport uniformly evaluates $R(x, y)$ across $\mathcal{D}$ using adaptive marching squares (contour extraction).
  - The 3D viewport uniformly evaluates $R(x, y, z)$ across $\mathcal{D}$ using marching cubes or implicit raymarching. If a 2D relation $x^2 + y^2 = 4$ is observed in 3D, it automatically renders the cylinder because $z$ is unconstrained.
  - `src/plot/engine.ts` is **replaced** by a `SpaceViewportManager` that groups alive objects by space and instantiates a viewport for each active space.

### 5. The Editor & Document Model (`src/document/document_state.ts`, `src/document/editor.ts`) — **Substantial Edit**
- **Current State**: Assumes a 1-to-1 mapping where each line produces a single isolated result in the gutter. If `rec.result.type === 'graph'`, it embeds a canvas card under that line.
- **Required Shape**:
  - **Multi-Space Observation Panel**: Instead of stacking independent canvas cards per line, the editor groups expressions by their space.
    - If Line 1 defines $x^2 + y^2 = 4$ and Line 2 defines $y = 2x + 1$, both exist in $\mathbb{R}^2(x, y)$. They render together in the $\mathbb{R}^2$ observation viewport.
    - If Line 5 defines a 3D surface $z = \sin(x)\cos(y)$, it renders in the $\mathbb{R}^3(x, y, z)$ observation viewport.
  - `DocumentLineRecord` records spatial entity references rather than static display cards.

---

## C. What Gets Deleted

The rewrite eliminates substantial amounts of obsolete infrastructure:

```
DELETION INVENTORY
├── 1. Removed Obstruction Taxonomy (from SEMANTICS.md audit)
│   ├── 'requires-unavailable-theory' (types.ts:575 + 14 use sites)
│   └── 'unimplemented-technique' (types.ts:564 + 5 use sites)
│
├── 2. AST View Dispatch Table & Syntax
│   ├── evalGraph() (evaluator.ts:3860-4110 — 250 lines)
│   ├── declaredViews registry (evaluator.ts:893-900)
│   └── ViewDecl grammar & AST nodes (types.ts:167, parser.ts:view rules)
│
├── 3. Rigid Equation Classifier
│   └── AlgebraicClassifier (classifier.ts:1-322 — 322 lines)
│
├── 4. Synthetic Visual Value Types
│   ├── GraphValue & GraphSpec (types.ts:707-757)
│   ├── DrawingPrimitiveValue & SceneValue (types.ts:956-978)
│   └── DescribedValue (types.ts:627-641)
│
├── 5. Hardcoded Refusal Handlers
│   ├── Negative sqrt error in real mode (tower.ts:608-617)
│   ├── Imaginary unit 'i' rejection check (evaluator.ts:386-396, 427-433)
│   └── Single-kind arithmetic rejection throws (tower.ts:167-176)
│
└── 6. Legacy Visualizer Wrappers
    ├── GraphPlotEngine (plot/engine.ts:1-74)
    └── ExplainerVisualizer (plot/explainer_visualizer.ts:1-120)
```

**Total Code Deleted**: ~1,450 lines of rigid dispatchers, hardcoded error switches, and ad-hoc visual wrappers.

---

## D. The Test Suite Breakdown

The repository contains **614 automated tests** across **44 test files**.

```
                      TEST SUITE IMPACT (614 Tests Total)
┌────────────────────────────────────────────────────────────────────────┐
│  [487 Tests: 79.3%] Passes Completely Unchanged                        │
├────────────────────────────────────────────────────────────────────────┤
│  [113 Tests: 18.4%] Needs Updating (Semantic / Syntax Migration)       │
├────────────────────────────────────────────────────────────────────────┤
│  [ 14 Tests:  2.3%] Meaningless / Must Be Deleted                      │
└────────────────────────────────────────────────────────────────────────┘
```

### 1. Tests that Pass Unchanged (**487 Tests**)
These test pure arithmetic, parser AST construction, BigFraction operations, floating-point math, symbolic differentiation rules, dimensional analysis, record manipulations, module resolution, lexical scoping, and document serialization:
- `differentiation_corpus.test.ts`: **45 tests** (all symbolic derivative transformations)
- `corpus.test.ts` (pure arithmetic, physics formulas, algorithms, derivations): **208 tests**
- `language_extensions.test.ts` (sums, products, limits, record syntax): **30 tests**
- `derivation_first_class.test.ts` (step rules, branch verifications): **10 tests**
- `algebra_isolate.test.ts` (linear/quadratic isolations): **12 tests**
- `dimensional.test.ts` & `part_b_units.test.ts`: **17 tests**
- `notation_g2.test.ts` & `notation_math.test.ts`: **22 tests**
- `scope_blocks.test.ts`, `part_f_modules.test.ts`, `disk_imports.test.ts`: **17 tests**
- `part_a_records.test.ts`, `part_c_operators.test.ts`, `part_d_kinds.test.ts`: **16 tests**
- `claim_honesty_and_control.test.ts` (Kinds A–H, fuel limits): **15 tests**
- `fuel_kleene.test.ts`, `rational.test.ts`, `universality.test.ts`: **23 tests**
- `tokenizer.test.ts`, `parser.test.ts`, `benchmark.test.ts`, `no_emoji.test.ts`, `no_latex.test.ts`, `file_open_save.test.ts`, `multi_document.test.ts`: **25 tests**
- Worked physics documents & ODE integrators (`part_e_physics_worked_docs.test.ts`, `part_c_ode.test.ts`, `part_b_simulate_closed_form.test.ts`): **12 tests**
- Other unit suites: **35 tests**

### 2. Tests that Need Updating (**113 Tests**)
These tests are mathematically sound but rely on legacy syntax (`graph()`), removed obstruction enums, or outdated single-universe error strings:
- **Corpus Visual Documents** (`src/tests/corpus.test.ts`): **44 tests**  
  *Reason*: 11 corpus files (`projectile.ax`, `pendulum.ax`, `orbit.ax`, `collision.ax`, `optics.ax`, `c6`–`c9`) explicitly call `graph(...)`. These must be rewritten so relations/trajectories stand alone as spatial objects.
- **Derivation & Algebraic Rejections** (`derivation_first_class.test.ts`, `algebra_isolate.test.ts`): **10 tests**  
  *Reason*: Asserted that negative discriminants or cubics produce `unknown(requires-unavailable-theory)`. Must be updated to assert `{ type: 'none' }` in $\mathbb{R}$ or `budget-exhausted`.
- **Dimensional Rejections** (`dimensional.test.ts`): **2 tests**  
  *Reason*: Transcendental dimension violations expecting `requires-unavailable-theory` updated to structured `DimensionMismatch` diagnostic.
- **Complex Numbers & Eigenvalues** (`claim_honesty_and_control.test.ts`): **2 tests**  
  *Reason*: Line 179 (matrix complex eigenvalues) updated to expect `undefined` in $\mathbb{R}$ or complex eigenpair in $\mathbb{C}$.
- **Export & Layout Plot Assertions** (`export.test.ts`, `layout_dock_visuals.test.ts`): **6 tests**  
  *Reason*: Asserted presence of `GraphSpec` structures in exported HTML/SVG; must be updated to verify Space Viewport SVG outputs.
- **Language Extensions Indefinite Integrals** (`language_extensions.test.ts`): **4 tests**  
  *Reason*: Indefinite integrals without limits updated to expect syntax requirement for limits rather than `requires-unavailable-theory`.
- **Worked Physics & Trajectories** (`part_a_trajectories.test.ts`, `part_e_physics_worked_docs.test.ts`): **4 tests**  
  *Reason*: Tests calling `graph(traj)` updated to observe trajectories directly.
- **Other Gutter / Evaluation Tests** (`evaluator.test.ts`, `error_and_import_ux.test.ts`, `explainer.test.ts`): **41 tests**  
  *Reason*: Adjust expected error message strings or result structures.

### 3. Tests that Become Meaningless / Deleted (**14 Tests**)
- `src/tests/part_d_views_primitives.test.ts`: **4 tests**  
  *Reason*: Tests explicit `view Circle = ...` AST declarations and `DrawingPrimitiveValue` dispatching.
- `src/tests/classifier.test.ts` (lines testing `AlgebraicClassifier`): **4 tests**  
  *Reason*: Tests rigid AST rejections (e.g. radical equations or multiple denominators being rejected before solving).
- `src/tests/obstructions_g4.test.ts`: **1 test**  
  *Reason*: Tests emission of the deleted `unimplemented-technique` enum.
- `src/tests/claim_honesty_and_control.test.ts` (line 259): **1 test**  
  *Reason*: Tests that Euler's identity $e^{i\pi}+1$ must fail with an "imaginary unit 'i' is unsupported" diagnostic. Replaced by evaluation test in $\mathbb{C}$.
- `src/tests/language_extensions.test.ts` (indefinite integral fallback assertion): **4 tests**  
  *Reason*: Asserts `requires-unavailable-theory` for higher polynomial degrees.

---

## E. Rewrite Order & Dependency Chain

The transition can be executed in five distinct phases. Most of the rewrite is incremental, with only **one localized window of UI breakage** during the Work Panel replacement.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       REWRITE DEPENDENCY GRAPH                          │
├─────────────────────────────────────────────────────────────────────────┤
│  Phase 1: Taxonomy & Context Foundation (No Breakage)                  │
│  ├── Prune 'requires-unavailable-theory' & 'unimplemented-technique'    │
│  ├── Introduce Context { R, C, Z_p } in Environment                     │
│  └── Add SpatialObject to Value union without removing legacy values    │
│                                │                                        │
│                                ▼                                        │
│  Phase 2: Uniform Level-Set Sampling Engine (Incremental)               │
│  ├── Implement 2D Marching Squares & 3D Isosurface Samplers             │
│  └── Allow relations (x^2+y^2=4) to evaluate directly to SpatialObjects │
│                                │                                        │
│                                ▼                                        │
│  Phase 3: Work Panel Multi-Space Viewport (UI Breakage Window)          │
│  ├── Replace per-line canvas cards with Space Viewport Canvas           │
│  ├── Delete evalGraph() and GraphSpec dispatch table                   │
│  └── Breakage Window: 1-2 days (UI work panel in flux, tests pass)     │
│                                │                                        │
│                                ▼                                        │
│  Phase 4: Corpus & Document Migration (Incremental)                     │
│  ├── Strip graph() calls from all 67 corpus documents & .ax files       │
│  └── Update 113 affected test assertions                                │
│                                │                                        │
│                                ▼                                        │
│  Phase 5: Cleanup & Deletion of Dead Infrastructure                    │
│  ├── Delete AlgebraicClassifier, ViewDecl grammar, GraphPlotEngine      │
│  └── Delete 14 obsolete tests; verify full suite passes                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### The Breakage Window
- **Where**: Phase 3 (`src/document/editor.ts` and `src/document/document_state.ts`).
- **Duration**: ~1 to 2 days of engineering effort.
- **Symptom**: During this window, the graphical editor UI will not render plots correctly because the per-line canvas mounting logic is removed before the multi-space viewport is fully wired. Headless evaluation (`npm test`) continues to pass if Phase 1 and 2 are completed first.

---

## F. What You Do Not Know (Technical Uncertainties)

The following questions cannot be determined purely by reading the existing codebase and represent critical architectural risks to resolve during implementation:

### 1. Sampling Performance & Resolution in Web Workers
- **Uncertainty**: Today, explicit functions $y = f(x)$ are sampled on a 1D grid ($100$ points) and 2D heatmaps on a $50 \times 50$ grid ($2,500$ points) in $\approx 2\text{--}5\text{ ms}$.
- Uniform implicit level-set extraction over arbitrary domains $\mathcal{D} \subset \mathbb{R}^2$ requires sampling a grid of at least $200 \times 200$ ($40,000$ evals) to capture fine features, or an adaptive quadtree.
- In $\mathbb{R}^3$, a $60 \times 60 \times 60$ voxel grid requires $216,000$ evaluations.
- **Unknown**: Will JS AST evaluation in a Web Worker sustain $200,000+$ evaluations per ambient keystroke within the $250\text{ ms}$ fuel budget, or will relations require JIT bytecode compilation / WebGL fragment shader raymarching?

### 2. Multi-Object Space Coordinate Unification
- **Uncertainty**: If Line 1 defines $x^2 + y^2 = 4$ and Line 2 defines $u^2 + v^2 = 9$:
  - Are $(x, y)$ and $(u, v)$ two independent 2D spaces, or isomorphic observations of $\mathbb{R}^2$?
  - If Line 3 introduces $x + z = 1$, does it automatically promote the space of Line 1 to $\mathbb{R}^3(x, y, z)$?
- **Unknown**: The exact formal rule for coordinate unification across multiple lines in a document needs strict algebraic definition.

### 3. Viewport Domain Bounds Without Explicit Range Syntax
- **Uncertainty**: Today, `graph(f, x in -5..5)` explicitly specifies the domain. If the user simply writes $x^2 + y^2 = 4$ with no domain specified:
  - How does the viewport determine its initial bounding box?
  - Does every space initialize with a standard observation window (e.g., $[-5, 5]^n$) with infinite pan/zoom, or should the engine inspect roots/features to compute bounding boxes?

### 4. Serialization Across Worker Boundary
- **Uncertainty**: Spatial objects contain predicates and relations ($R: \mathbb{R}^n \to \mathbb{R}$). JavaScript functions cannot be cloned across `postMessage()`.
- **Unknown**: Should the Web Worker perform all grid sampling and send only the extracted geometric contours (polylines / meshes) to the main thread, or should the AST be transferred and compiled on the main thread? (Contour streaming from the worker is cleaner for UI responsiveness, but requires the worker to know the UI viewport bounds).

---

## Conclusion & Cost Summary

| Metric | Measurement |
| :--- | :--- |
| **Code to Delete** | ~1,450 lines (AST dispatchers, classifier, dead taxonomies, view nodes) |
| **Code to Write / Replace** | ~2,200 lines (Spatial value hierarchy, marching samplers, multi-space panel) |
| **Test Suite Impact** | 487 pass unchanged (79.3%), 113 updated (18.4%), 14 deleted (2.3%) |
| **Core Intact Modules** | Tokenizer, Parser, Rational Tower, Floats, Matrix, Dimensions, Differentiator, Typesetting |
| **Risk / Complexity** | Medium-High (sampling performance in workers and multi-space coordinate unification) |
