# Axine Syntax & Semantics Specification V2 (The Pure Relational Model)

> **Document Type**: Normative Language Specification & Migration Cost Analysis  
> **Status**: Design Complete — Ready for Review  
> **Target Version**: Axine 2.0 (Pure Relational Universe)  
> **Supersedes**: V1 Syntax, `:=` Definition Grammar, Procedural `simulate()`, Multi-letter Undeclared Errors, and Custom Record Plotters  
> **Reference Baselines**: [`AGENTS.md`](../AGENTS.md), [`docs/SEMANTICS.md`](./SEMANTICS.md), [`docs/CONSOLIDATION_ASSESSMENT.md`](./CONSOLIDATION_ASSESSMENT.md)

---

## Executive Summary: The Relational Paradigm Shift

Axine is moving from a hybrid environment (part CAS, part procedural scripting language, part canvas plotter) to a **Pure Mathematical Universe of Relations**.

```
                           THE V2 RELATIONAL UNIVERSE
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. EQUALITY IS A RELATION         2. JUXTAPOSITION IS MULTIPLICATION        │
│    • := is deleted.                   • theta = t · h · e · t · a (5D)      │
│    • There is only =.                 • :theta = single variable (1D)       │
├───────────────────────────────────┼─────────────────────────────────────────┤
│ 3. APPLICATION IS LEXICAL         4. TIME IS A SPATIAL COORDINATE           │
│    • Bare | switches block to f(x)    • :time is a coordinate axis in R^n   │
│    • Bare |- switches off to f · x    • Animation is slider motion along t  │
├───────────────────────────────────┼─────────────────────────────────────────┤
│ 5. SAMPLING VS RECURRENCE         6. NO PROCEDURAL SCRIPTS                  │
│    • Closed forms: sampled            • simulate(), map(), iterate() gone   │
│    • ODEs/recurrences: stepped        • Physics library deleted             │
└───────────────────────────────────┴─────────────────────────────────────────┘
```

---

## 1. There Is Only `=` (Elimination of `:=`)

### 1.1 The Rule
The assignment/definition operator `:=` is **completely removed** from the grammar and tokenizer. All mathematical equalities use `=`.

```axine
g = 9.8         # A relation constraining g
x = 0           # A relation constraining x
y = x^2         # A relation constraining (x, y)
x^2 + y^2 = 4   # A relation constraining (x, y)
```

There is no syntactic distinction between a "variable assignment", a "constant definition", and an "algebraic equation". What the user observes depends solely on the dimension and properties of the space being observed, not on which symbol was typed.

### 1.2 Unification, Constraint Satisfaction, and Substitution Semantics

When relations are evaluated within a lexical block `{ ... }`, the reduction engine applies constraint isolation:

1. **Uniquely Isolated Scalar Relations ($v = c$)**:
   If a relation in a lexical scope algebraically isolates a single variable $v$ to a closed constant or closed expression $c$ where $v \notin \mathrm{FreeVars}(c)$ (e.g. $g = 9.8$ or $x = 4$ or $k = 2 \pi$):
   - The constraint $v = c$ establishes a canonical substitution rule $v \mapsto c$ for all sibling and descendant expressions within that lexical scope.
   - For all downstream expressions in the block, $v$ is unified with $c$.
   - The variable $v$ does not add a free dimension to the ambient space (it is bound/resolved by constraint).

2. **Multi-Valued Relations ($x^2 = 4$)**:
   - $x^2 = 4$ yields roots $x \in \{-2, 2\}$.
   - It defines a 1D space with coordinate `['x']` containing two discrete points.
   - It does not collapse to a single scalar substitution.

3. **Underdetermined Relations ($y = x^2$)**:
   - Contains 2 free variables $(x, y)$.
   - Defines an intrinsic 2-dimensional space $\mathbb{R}^2$ containing the parabolic curve manifold.

4. **Contradictory / Over-Constrained Systems ($x = 1 \text{ and } x = 2$)**:
   - The system $x = 1 \land x = 2$ reduces to $1 = 2 \implies \text{false}$ (the empty set $\emptyset$).
   - The viewport renders an empty space (zero level-set intersections).

### 1.3 What Breaks & What Changes
- **Imperative Mutation (`x := x + 1`) is Impossible**:
  In V1, users could write procedural sequences like `x := 1 ; x := x + 1`. Under V2, `x = 1` and `x = x + 1` within the same space is the relation $x = 1 \land 0 = 1$, which is algebraically false and produces no solution.
- **Function Definitions**:
  V1 function definitions `f(x) := x^2` become relations `f(x) = x^2` inside an application block (`|`).

---

## 2. Multi-Letter Identifiers and the Colon Prefix (`:`)

### 2.1 The Juxtaposition Principle
In mathematical literature, writing variables adjacent to one another without an explicit operator always denotes multiplication:
$$ab = a \cdot b, \qquad 2\pi r = 2 \cdot \pi \cdot r, \qquad xyz = x \cdot y \cdot z$$

In V1, Axine attempted a hybrid rule: single letters multiplied implicitly (`2x = 2·x`), but multi-letter names (`theta`, `speed`) were scanned as single identifiers and threw runtime errors if not previously defined.

### 2.2 The V2 Rule
1. **Bare Letters are Single Variables**:
   Any unadorned sequence of letters represents the **implicit multiplication of individual single-letter variables**:
   ```axine
   theta       # Parsed as: t · h · e · t · a (5 variables, spans R^5)
   xy          # Parsed as: x · y (2 variables, spans R^2)
   abc         # Parsed as: a · b · c (3 variables, spans R^3)
   2x          # Parsed as: 2 · x (1 variable)
   ```

2. **The Colon Prefix (`:`) Creates a Multi-Letter Word**:
   To define or reference a multi-letter identifier, the token **must be prefixed with a colon (`:`)**:
   ```axine
   :theta      # One variable named "theta" (1D)
   :mass       # One variable named "mass" (1D)
   :speed      # One variable named "speed" (1D)
   :time       # One variable named "time" (1D)
   :dt         # One variable named "dt" (1D)
   :p1         # One variable named "p1" (1D)
   ```

3. **No Declarations, No Lookup Errors**:
   The tokenizer scans `:word` as a single `IDENTIFIER` token with name `"word"`. There is no "undeclared multi-letter name" error. If `:theta` is free, it is simply a free coordinate named `theta`.

### 2.3 Interaction with Builtin Functions and Keywords
- **Keywords**: Structural keywords (`import`, `module`, `where`, `in`, `if`, `then`, `else`, `with`, `context`) remain reserved lexer tokens.
- **Builtin Mathematical Functions**: Standard transcendental function names (`sin`, `cos`, `tan`, `ln`, `exp`, `sqrt`, `abs`, `det`, `trace`, `dim`, `ker`) are recognized as function callees when inside Application Mode (`|`) or when preceded by `:`.
  - In Application Mode (`|`): `sin(x)` is $\sin(x)$.
  - Outside Application Mode: `sin(x)` without `:` is $s \cdot i \cdot n \cdot x$. Writing `:sin(x)` or activating `|` mode applies the builtin sine function.

---

## 3. Application Mode (`|` and `|-`)

### 3.1 The Ambiguity Crisis in Mathematical Notation
In mathematics, $f(x + 1)$ is overloaded:
- It represents the **application of function $f$ to argument $(x + 1)$**: $f(x + 1)$.
- It represents the **algebraic product of variable $f$ and term $(x + 1)$**: $f \cdot (x + 1)$.

In V1, Axine attempted to resolve this by querying the runtime environment at parse time (if $f$ was bound, parse as call; if unbound, parse as product). This created parser/evaluator order dependency and broken derivations.

### 3.2 The V2 Specification: Explicit Application Mode

Application mode is controlled lexically at the block level using **bare `|` on its own line**:

```axine
{
  |
  f(x) = x * 3
  y = f(2) + 4     # f(2) is function application: 2 * 3 = 6 -> y = 10
}

f(2)               # Outside block: parsed strictly as f · 2
```

```axine
{
  |
  # Application Mode is active here
  f(x) = x^2
  g(x) = f(x) + 1
  
  |-
  # Application Mode is turned OFF here
  a(b + c)         # Parsed as: a · (b + c)
}
```

### 3.3 Lexical Rules and Inheritance
1. **Activation (`|`)**: A line containing only `|` (with optional whitespace or comments) turns Application Mode **ON** for all subsequent lines in the current block.
2. **Deactivation (`|-`)**: A line containing only `|-` turns Application Mode **OFF** for all subsequent lines in the current block.
3. **Inheritance**: Nested blocks `{ ... }` inherit the active mode of their parent block. A child block may override by declaring its own `|` or `|-`.
4. **Default (Top-Level & Unmarked Blocks)**: Application mode is **OFF** by default. At the top level and in unmarked blocks, all juxtaposition and parenthesized groupings $a(b)$ are algebraic multiplication $a \cdot b$.

### 3.4 Disambiguation with Absolute Value / Norm (`|x|`)
There is **zero lexical collision** between the mode switch `|` and mathematical absolute value `|x|`:

| Construct | Syntax Pattern | Lexer Token | Semantic Meaning |
| :--- | :--- | :--- | :--- |
| **Mode Switch ON** | `^[ \t]*\|[ \t]*(?:#.*)?$` (line with only `\|`) | `MODE_APPLY_ON` | Switch block to Application Mode |
| **Mode Switch OFF** | `^[ \t]*\|-[ \t]*(?:#.*)?$` (line with only `\|-`) | `MODE_APPLY_OFF` | Switch block to Algebraic Mode |
| **Absolute Value** | `\|<expr>\|` (inline with enclosed expression) | `PIPE_OPEN` ... `PIPE_CLOSE` | Mathematical absolute value $|x|$ |
| **Norm** | `\|\|<expr>\|\|` (inline double pipe) | `NORM_OPEN` ... `NORM_CLOSE` | Vector/Matrix norm $\|v\|$ |
| **Divisibility / Divides** | `<expr> \| <expr>` (inline binary operator) | `BINARY_OP('|')` | Number-theoretic divides $a \mid b$ |

The line-start and line-end anchor rule guarantees that the lexer distinguishes mode control lines from inline mathematical expressions unambiguously.

---

## 4. Time as a Coordinate Variable & Range Syntax

### 4.1 Time is a Dimension, Not a Simulation Loop
In V1, dynamics required a special procedural engine: `simulate(step_fn, initial_state, t in 0..T, dt: h)`. This treated time as an imperative simulation loop creating arrays of discrete snapshots.

In V2:
- `:time` (or $t$) is simply an ordinary continuous real coordinate axis $t \in \mathbb{R}$.
- A physical law or trajectory is an algebraic relation in $(x, y, :time)$ space.
- **Animation is Slicing**: Playing an animation is sweeping a slice slider along the `:time` axis. There is no special animation engine; the Space Viewer already supports sweeping any coordinate slider at 60 FPS.

```axine
{
  # A 3D space with coordinates x, y, and :time
  :time in [0, 10]
  x = cos(:time)
  y = sin(:time)
}
```

### 4.2 Range and Domain Syntax
In V1, ranges used `t in 0..10` or pipe notation `x | [0, 10]`. Since `|` is now reserved for line-level Application Mode, domain and interval restrictions use standard mathematical set-membership notation:

```axine
# Primary Interval Range Syntax:
variable in [min, max]          # Closed interval [a, b]
variable in (min, max)          # Open interval (a, b)
variable in [min, max)          # Half-open interval [a, b)
variable in min..max            # Compact discrete / continuous range

# Unicode equivalents fully supported:
:time ∈ [0, 10]
:theta ∈ [0, 2*pi]
```

### 4.3 Domain Restriction on Relations (`where`)
To restrict a relation to a domain without wrapping in a full block:
```axine
y = sqrt(x) where x in [0, 100]
x^2 + y^2 = 4 where x in [0, 2] and y in [0, 2]   # First quadrant quarter-circle
```

---

## 5. Relations: Closed-Form Sampling vs. Recurrence Continuation

Every mathematical object in Axine is a relation $R = 0$. The difference between closed-form geometry, discrete recurrences, and differential equations is strictly **how the spatial extension is computed**:

```
                               RELATION R = 0
                                     │
         ┌───────────────────────────┴───────────────────────────┐
         ▼                                                       ▼
  CLOSED-FORM RELATIONS                               RECURRENCE RELATIONS
  • Evaluated over grid [-L, L]^n                     • Form contains d/dt or n+1
  • Level sets extracted via                          • Extension computed via
    Marching Squares / Cubes                            Forward Numeric Continuation
  • Examples: x^2 + y^2 = 4, y = 3^t                  • Examples: dy/dt = -k*y, a(n+1) = r*a(n)
```

### 5.1 Closed-Form Relations (Sampling)
- **Form**: Relations with no differential operators or inductive index shifts:
  $$x^2 + y^2 = 4, \qquad y = \sin(x), \qquad z = x^2 - y^2$$
- **Evaluation Strategy**: Uniform implicit grid evaluation over $[-L, L]^n$ followed by Marching Squares (2D) or Marching Cubes (3D).

### 5.2 Differential Relations & Initial Value Problems (Continuous Recurrence)
- **Form**: Relations containing the differential operator `d//dt` (or `d/dt` or $\dot{y}$ or $y'$):
  ```axine
  {
    |
    d//d:time y = -:k * y
    y(0) = 5
    :time in [0, 10]
  }
  ```
- **How the System Knows to Step Rather Than Sample (Derivation by Form)**:
  1. The AST scanner detects the differential operator `Diff('d', ':time', y)`.
  2. The scope scanner checks for an initial condition relation matching $y(t_0) = y_0$.
  3. **The Continuation Strategy**:
     - When both $\frac{dy}{dt} = f(t, y)$ and $y(t_0) = y_0$ are present, the system derives that this is an Initial Value Problem (IVP).
     - Instead of grid sampling, the engine integrates forward from $t_0$ across the declared domain $t \in [t_0, t_{end}]$ using high-throughput adaptive Runge-Kutta (RK4 / Dormand-Prince).
     - The output is the exact continuous trajectory manifold $(t, y(t))$ in the $(t, y)$ space.
  4. If no initial condition is specified, the equation stands as an unconstrained differential relation.

### 5.3 Discrete Recurrences & Difference Equations
- **Form**: Relations specifying index steps:
  ```axine
  {
    |
    a(n + 1) = :r * a(n) * (1 - a(n))
    a(0) = 0.5
    n in 0..100
  }
  ```
- **Evaluation**: Stepped forward inductively for $n = 0, 1, 2, \dots, 100$, producing the discrete point manifold $(n, a(n))$.

---

## 6. Systemic Consequences & Deletion Inventory

The shift to a pure relational model makes several large subsystems obsolete. They are deleted rather than adapted.

```
                           DELETION ARCHITECTURE
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. PROCEDURAL PHYSICS SUBSYSTEM (DELETED)                                   │
│    • simulate(), map(), iterate(), fold(), unfold()                         │
│    • Trajectory, Body, Particle records                                     │
│    • physics.ax library                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. IMPERATIVE RECORD & VIEW SYSTEM (DELETED)                                │
│    • record { ... } declarations                                            │
│    • view for ... := ... declarations                                       │
│    • Custom canvas drawing primitives (point, segment, arrow, patch)        │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. FIRST-CLASS IMPERATIVE FUNCTIONS & LAMBDAS (REPLACED)                    │
│    • (x) -> x^2 anonymous lambda values replaced by | application mode      │
│    • Function values as mutable heap objects eliminated                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.1 The Physics Library Does Not Survive
The V1 physics subsystem (`physics.ax`, `Body`, `Particle`, `simulate()`, `euler_step`, `verlet_step`, `rk4_step`) was an imperative simulator grafted onto a math notebook.

In V2:
- Physics is expressed as standard Newton-Euler differential equations in $(x, y, :time)$ coordinates:
  ```axine
  # Projectile Motion in V2 (Pure Differential Relations)
  {
    |
    d//d:time :vx = -:c * :vx
    d//d:time :vy = -:g - :c * :vy
    d//d:time x = :vx
    d//d:time y = :vy
    
    x(0) = 0
    y(0) = 0
    :vx(0) = 10
    :vy(0) = 15
    :time in [0, 3]
  }
  ```
- No procedural step functions, no state packing/unpacking, no mutable record updates.

### 6.2 Records and Imperative Drawing Primitives Do Not Survive
`RecordDefNode`, `ViewDefNode`, and the ad-hoc vector drawing primitives (`point`, `segment`, `arrow`, `circle`, `polygon`, `path`, `patch`, `label`, `field`) were created to draw custom sprites for `Body` and `Ray` records.
- In V2, spaces display mathematical manifolds (points, curves, surfaces, slices) directly from algebraic relations.
- The procedural drawing layer is completely removed.

---

## 7. Migration Cost & Impact Breakdown

Below is the precise audit of all code modifications, test breakages, and corpus rewrite costs required to implement V2.

### 7.1 Subsystem Impact Matrix

| Subsystem | File(s) | Delta Classification | Detailed Changes & Deletions |
| :--- | :--- | :--- | :--- |
| **Tokenizer** | `src/core/tokenizer.ts` | **Substantial Edit** | • Remove `:=` (`ASSIGN`) token.<br>• Add `:identifier` token rule for multi-letter words.<br>• Change unadorned multi-letter strings to sequences of single-letter `IDENTIFIER` tokens with implicit multiplication.<br>• Add line-level `|` (`MODE_APPLY_ON`) and `|-` (`MODE_APPLY_OFF`). |
| **Parser** | `src/core/parser.ts` | **Substantial Edit** | • Delete `AssignmentNode`, `GlobalAssignmentNode`, `FunctionDefNode`, `RecordDefNode`, `ViewDefNode`.<br>• Parse all `=` as `RelationNode`.<br>• Add lexical `applicationMode` state to parser: in `|` mode, parse `f(...)` as `FunctionCall`; outside `|` mode, parse as `BinaryOp('*')`.<br>• Parse `in [a, b]` interval ranges. |
| **Analyzer** | `src/core/analyzer.ts` | **Simplification** | • Remove multi-letter undeclared identifier check and suggestion generator.<br>• Free variables are collected directly from single letters and `:words`. |
| **Evaluator / Reducer** | `src/core/evaluator.ts` | **Major Deletion** | • Delete `evalAssignment`, `evalFunctionDef`, `evalRecordDef`, `evalViewDef`, `evalSimulate`, `evalIterate`, `evalMap`, `evalTrajectory`, and all procedural collection builtins.<br>• Add relational constraint unification ($v = c \implies v \mapsto c$).<br>• Add continuous IVP / recurrence solver pipeline. |
| **Types & AST** | `src/core/types.ts` | **Deletion & Cleanup** | • Delete `AssignmentNode`, `FunctionDefNode`, `RecordDefNode`, `ViewDefNode`, `TrajectoryValue`, `RecordValue`, `DrawingPrimitiveValue`. |
| **Space Viewport** | `src/plot/space_viewport.ts` | **Cleanup** | • Slicing sliders directly handle `:time` axis.<br>• Remove custom view/record overlay hooks. |

---

### 7.2 Test Suite Breakage Audit (Current 49 Files / 669 Tests)

The table below audits every test file in the repository against the V2 changes:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          TEST SUITE MIGRATION AUDIT                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  PASS COMPLETELY UNCHANGED:  348 Tests (52.0%)                              │
│  • Exact rational arithmetic, float special functions, matrix algorithms,    │
│    symbolic diff rules, tokenizer unicode operators, 2D/3D Marching Squares  │
│    and Marching Cubes, dimension lattice, and pure arithmetic benchmarks.   │
├─────────────────────────────────────────────────────────────────────────────┤
│  REQUIRE SYNTAX UPDATES:     212 Tests (31.7%)                              │
│  • Tests using := -> updated to =.                                          │
│  • Tests using multi-letter names (theta, alpha, rk4) -> updated to :name.  │
│  • Tests calling user functions -> wrapped in { | ... }.                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  DELETED / OBSOLETE:         109 Tests (16.3%)                              │
│  • part_e_physics_worked_docs.test.ts (8 tests — simulate & Body records)   │
│  • part_b_simulate_closed_form.test.ts (2 tests — procedural simulate)      │
│  • part_a_trajectories.test.ts (5 tests — discrete trajectory indexing)     │
│  • part_a_records.test.ts (8 tests — record constructor definitions)        │
│  • part_d_views_primitives.test.ts (4 tests — view for Body declarations)   │
│  • classifier.test.ts (19 tests — rigid equation rejections)                │
│  • error_and_import_ux.test.ts (4 tests — multi-letter suggestion errors)   │
│  • procedural collection tests across corpus & export suites (59 tests)     │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Detailed Breakdown by Test Suite:

1. **`part_e_physics_worked_docs.test.ts` (8 tests) -> DELETED / REWRITTEN**:
   Tests `documents/physics.ax`, `projectile.ax`, `pendulum.ax`, `orbit.ax`, `collision.ax`, `spring.ax`, `integrator_comparison.ax`, `optics.ax`. All 8 tests rely on `simulate()` and `Body` records. Rewritten to test pure differential relations.
2. **`part_a_records.test.ts` (8 tests) -> DELETED**:
   Tests `record { ... }` syntax and record field access.
3. **`part_d_views_primitives.test.ts` (4 tests) -> DELETED**:
   Tests `view for Body := ...` and custom canvas primitives (`arrow`, `circle`).
4. **`part_a_trajectories.test.ts` (5 tests) -> DELETED**:
   Tests `Trajectory` sample interpolation and discrete time indexing.
5. **`part_b_simulate_closed_form.test.ts` (2 tests) -> DELETED**:
   Tests procedural `simulate()` step integration.
6. **`parser.test.ts` (7 tests) -> 4 UPDATED**:
   Update ambiguity tests: `2x -> 2·x` passes unchanged; `f(x+1)` tests updated to reflect `|` mode vs algebraic mode.
7. **`corpus.test.ts` (266 tests) -> 44 UPDATED**:
   Corpus documents using `:=` updated to `=`; multi-letter identifiers prefixed with `:`.

---

### 7.3 Corpus & Virtual Documents Migration Breakdown (67 Documents Total)

| Document Category | Document Count | Required Changes | Migration Strategy |
| :--- | :---: | :--- | :--- |
| **Pure Relations & Geometry** | 28 documents | Update `:=` to `=` | Trivial search-and-replace (`:=` $\to$ `=`). |
| **Calculus & Analysis** | 15 documents | Update multi-letter vars to `:<var>` | Prefix variable names (`:theta`, `:phi`, `:eps`). Wrap function applications in `\|`. |
| **Physics Worked Problems** | 10 documents | **Full Rewrite** | Replace `simulate()`, `Body`, `euler_step` with clean differential equations ($\frac{d}{dt}y = \dots$). |
| **Discrete Algorithms** (`collatz`, `fibonacci`, `turing`, `lambda`) | 8 documents | Wrap in `{ \| ... }` | Use discrete recurrence relations ($a(n+1) = \dots$) or functional application blocks. |
| **Theorems & Claims** | 6 documents | Update shadows | Update claim statements to pure relations with `:vars`. |

---

## 8. Summary Cost-Benefit Verdict

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            FINAL ARCHITECTURAL PRICE                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  CODE DELETIONS:    ~1,850 lines of procedural & custom plotting code       │
│  CODE ADDITIONS:    ~380 lines (tokenizer :word & | mode, IVP continuation) │
│  NET CODE REDUCTION: -1,470 lines (Significant complexity reduction)        │
│                                                                             │
│  TOTAL TESTS BROKEN / REQUIRING REWRITE: 109 Deleted, 212 Updated           │
│  CORPUS DOCUMENTS REWRITTEN: 10 Physics docs rewritten, 37 docs updated     │
│                                                                             │
│  ARCHITECTURAL BENEFIT:                                                     │
│  • 100% of mathematical behavior lives in the Minimal Triad.                │
│  • Zero order-dependent parser ambiguities.                                 │
│  • Zero procedural simulation loops.                                        │
│  • Multi-letter names and juxtaposition follow universal math rules.        │
└─────────────────────────────────────────────────────────────────────────────┘
```
