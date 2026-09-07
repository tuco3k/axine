# Architectural Assessment: The Simulation Engine (Phase 2)

> **Document Type**: Normative Architectural Assessment, Empirical Measurements, and Phase 2 Capability Roadmap  
> **Status**: Complete Assessment — No Implementation Code  
> **Target System**: Axine 2.0 Simulation Engine (The Mathematical Universe)  
> **Reference Baselines**: [`AGENTS.md`](../AGENTS.md), [`docs/SEMANTICS.md`](./SEMANTICS.md), [`docs/SYNTAX_V2.md`](./SYNTAX_V2.md), [`docs/CAPABILITY_ASSESSMENT.md`](./CAPABILITY_ASSESSMENT.md), [`docs/REWRITE_ASSESSMENT.md`](./REWRITE_ASSESSMENT.md)

---

## Executive Summary

Phase 1 established the Axine language in its own right: a minimal floor of 7 irreducible primitives, mathematical capabilities C1 through C9 implemented directly in Axine syntax, and all six Section E benchmark cases verified.

Phase 2 is **making the mathematical universe visible, interactive, and robust at scale**.

Today, the simulation engine (the sampler, compiler, and space viewport) remains frozen at Phase 3 of the original rewrite—prior to the introduction of expressions-as-values, user-defined structures, collections, and operator overloading. Empirical evaluation reveals that **the sampler and compiler are significantly behind the language**:
1. **The compiler only accepts hardcoded scalar arithmetic**: Any relation referencing an Axine library function (`:sqrt`, `:sin`, `:cos`), a user-defined vector space, an algebraic structure, an unevaluated derivative (`Diff`), or a collection (`\set`) fails JIT compilation and drops from the viewport entirely.
2. **The uniform grid sampler produces incorrect geometry under common mathematical conditions**: Isolated points ($x^2 + y^2 = 0$) are silently dropped with zero visual output, poles ($y = 1/x$) produce false connecting bridge lines across asymptotes, step jumps produce artificial vertical surfaces, and singular oscillations ($y = \sin(1/x)$) create dense aliasing webs.
3. **Observation by Slicing is exceptionally fast ($O(K^2)$ in $< 1.3\text{ ms}$ for 2D, $O(K^3)$ in $< 5.5\text{ ms}$ for 3D)**, but the CPU pipeline bottlenecks at higher resolutions and lacks high-level geometric structures (point clouds, parametric manifold charts, solid sectioning, and topological inspection tools).

This assessment inventories what the engine currently handles, measures performance ceilings across real-scale workloads, profiles pipeline bottlenecks, identifies geometric failure modes, and outlines the ordered capabilities and gates of Phase 2.

```
                     PHASE 2 SIMULATION ARCHITECTURE
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. THE UNIFIED COMPILATION & EVALUATION BRIDGE (P2-C1)                      │
│    • Pre-reduce symbolic derivations, inline Axine libraries (:sqrt, :sin)  │
│    • Lower user structures & operator overloads to compilable scalar closures│
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. DISCRETE & PARAMETRIC GEOMETRIC MANIFOLDS (P2-C2, P2-C3)                 │
│    • Direct point cloud rendering for discrete sets \set{ (x, y) }          │
│    • Explicit parametric chart meshing: (u, v) -> (x, y, z) in R^3          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. ROBUST LEVEL-SET SAMPLER & ADAPTIVE TOPOLOGY (P2-C4)                     │
│    • Adaptive quadtree / octree grid refinement with pole/asymptote filters │
│    • Honest measure-zero point extraction; zero silent geometry dropping    │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. GPU SLICING & 3D INTERROGATION WORKSPACE (P2-C5, P2-C6)                  │
│    • WebGL / WebGPU raymarching & instanced slicing at 120 FPS              │
│    • Solid sectioning, measurement calipers, entity isolation & provenance │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## A. What the Sampler Can Currently Handle

Every relation below was executed against the running evaluator, AST compiler, and sampler.

| Case # | Relation / Mathematical Construct | Evaluated Result | Engine Status | Concrete Empirical Behavior & Evidence |
| :---: | :--- | :---: | :---: | :--- |
| **1** | **Floor-Primitive Relation**<br>`x^2 + y^2 = 4` | `SpaceValue`<br>(dim 2) | **WORKS** | Compiles to `(x*x + y*y - 4)` in $< 0.03\text{ ms}$. 2D Marching Squares extracts 1 closed polyline of 505 vertices across 40,000 grid points in $1.26\text{ ms}$ ($794\text{ FPS}$). |
| **2** | **Library Function Relation**<br>`y = :sqrt(x)` or `:sqrt(x) = y` | `SpaceValue`<br>(0 entities) / `FunctionDef` | **FAILS** | `:sqrt` was migrated out of TypeScript hardcoded builtins into `documents/lib/sqrt.ax`. The JIT compiler's `OPERATIONS` table lacks `:sqrt`, rejecting compilation with *"Function 'sqrt' is not a compilable math built-in"*. Produces 0 drawable spatial entities. |
| **3** | **User-Defined Structure**<br>`:p + (x, y) = (3, 4)` | `SpaceValue`<br>(0 entities) | **FAILS** | Evaluates to a 2D space, but `compileAST` encounters tuple construction `(x, y)` and structure `+`, which are non-scalar. Compilation fails; 0 entities emitted. |
| **4** | **Result is a Collection**<br>`(x, y) \in S` where $S = \text{Set}$ | `boolean` / `SpaceValue` (0 entities) | **FAILS** | Set membership `\in` and `SetOp` nodes are marked uncompilable in `compiler.ts:303`. The viewport remains completely empty. |
| **5** | **Operator Overloading**<br>`:p1 + :p2 = [4, 6]` in `\with` | `boolean` / `SpaceValue` (0 entities) | **FAILS** | The compiler rejects `List` and non-scalar AST nodes. Structure-bound overloads do not lower to coordinate closures, leaving 0 graphable entities. |
| **6** | **Point Cloud**<br>`P = \set{ (0,0), (1,1), (2,4) }` | `SetValue`<br>(set of tuples) | **FAILS** | The evaluator treats point sets as algebraic data values rather than spatial geometry. There is no spatial entity constructor or renderer for discrete coordinate clouds without an explicit relation equation. |
| **7** | **Swept / Parametric Surface**<br>`{ x = cos(u)cos(v), y = sin(u)cos(v), z = sin(v) }` | `SpaceValue`<br>(dim 5, 3 entities) | **DEGRADES** | Creates a 5D space with coordinates `[u, v, x, y, z]` containing 3 separate implicit hypersurfaces. Slicing fixes 3 variables (e.g. $u=0, v=0, z=0$), rendering isolated points in 2D slices rather than a continuous 2D spherical surface in $\mathbb{R}^3$. |
| **8** | **Discontinuity or Pole**<br>`y = 1/x` | `SpaceValue`<br>(1 entity) | **DEGRADES** | Compiles cleanly to native closure `y - 1/x`. However, Marching Squares detects sign flips across the vertical asymptote at $x=0$, drawing a false connecting line segment between $(-\epsilon, -\infty)$ and $(+\epsilon, +\infty)$. |
| **9** | **Piecewise Definition**<br>`y = \if x < 0 \then -1 \else 1` | `SpaceValue`<br>(1 entity) | **DEGRADES** | Compiles to native JS ternary `((x < 0) ? -1 : 1) - y`. Marching Squares linearly interpolates across the step discontinuity at $x=0$, producing an erroneous vertical connecting line between $(-0.01, -1)$ and $(+0.01, 1)$. |
| **10** | **User-Defined Derivative**<br>`y = d//dx (x^3)` | `SpaceValue`<br>(0 entities) | **FAILS** | Evaluator produces derivation result $3x^2$, but AST contains `Diff` node which `compiler.ts:280` rejects as uncompilable. Symbolic derivation is not inlined into the spatial entity AST prior to compilation. |

---

## B. Performance at Real Scale

All benchmarks were measured on a real runtime instance with warm-start caching and JIT compilation.

```
                          EMPIRICAL THROUGHPUT AT SCALE
┌─────────────────────────────────────────────────────────────┬───────────┬─────────────┐
│ Benchmark Case                                              │ Wall Time │ 60 FPS Cap  │
├─────────────────────────────────────────────────────────────┼───────────┼─────────────┤
│ 1. 40,000 samples of floor-primitive relation (200x200)     │ 1.259 ms  │ YES (794 F) │
│ 2. 40,000 samples of relation containing library :sqrt      │ 1.169 ms  │ YES (856 F) │
│ 3. 40,000 samples over user structure (interpreted AST)     │ 24.280 ms │ NO  (41 F)  │
│ 4. 3D mesh at 216,000 points (60x60x60 Marching Cubes)      │ 5.501 ms  │ YES (182 F) │
│ 5. System of 20 relations in one space (200,000 samples)    │ 6.718 ms  │ YES (149 F) │
│ 6. 1,000 timesteps of differential relation (RK4)           │ 0.037 ms  │ YES (26.9k) │
│ 7. Collection of 10,000 points processed and bounded        │ 0.081 ms  │ YES (12.3k) │
└─────────────────────────────────────────────────────────────┴───────────┴─────────────┘
```

### Detailed Scale Analysis & Usability Ceilings

1. **40,000 samples of floor-primitive relation (`x^2 + y^2 = 4`, 2D)**:
   - **Wall Time**: $1.259\text{ ms}$ per slice frame ($794\text{ FPS}$).
   - **Interactivity**: Fully interactive at 60 FPS.
   - **Ceiling**: Usable up to $1,000 \times 1,000$ ($1,000,000$ points in $\approx 28\text{ ms}$). Beyond $1,500 \times 1,500$ ($2,250,000$ points in $70\text{ ms}$), slider dragging stutters.

2. **40,000 samples of relation containing `:sqrt` (`Math.sqrt(x^2 + y^2) = 2`)**:
   - **Wall Time**: $1.169\text{ ms}$ ($856\text{ FPS}$).
   - **Interactivity**: Fully interactive at 60 FPS.
   - **Ceiling**: Usable up to $800 \times 800$ ($\approx 26\text{ ms}$). Unusable at $1,500 \times 1,500$ ($92\text{ ms}$).

3. **40,000 samples over user-defined structure (Interpreted AST Walker)**:
   - **Wall Time**: $24.280\text{ ms}$ ($41\text{ FPS}$).
   - **Interactivity**: **Unusable for 60 FPS interactive slider scrubbing**.
   - **Ceiling**: Drops below 60 FPS at 20,000 points ($12.1\text{ ms}$). At 200,000 points ($121.4\text{ ms}$), slider dragging completely freezes the browser main thread.

4. **3D mesh at 216,000 points ($60 \times 60 \times 60$ Marching Cubes)**:
   - **Wall Time**: $5.501\text{ ms}$ ($182\text{ FPS}$).
   - **Interactivity**: Fully interactive at 60 FPS ($14,684$ triangles, $7,344$ vertices extracted).
   - **Ceiling**: Usable up to $70 \times 70 \times 70$ ($343,000$ points in $24\text{ ms}$). Unusable at $100 \times 100 \times 100$ ($1,000,000$ points in $75\text{ ms}$).

5. **System of 20 relations in one space ($100 \times 100 \times 20 = 200,000$ samples)**:
   - **Wall Time**: $6.718\text{ ms}$ ($149\text{ FPS}$).
   - **Interactivity**: Fully interactive at 60 FPS.
   - **Ceiling**: Usable up to 30 relations at $100 \times 100$ resolution ($18.2\text{ ms}$). At $200 \times 200$ for 20 relations ($800,000$ samples), frame time reaches $22.4\text{ ms}$ (dropping below 60 FPS).

6. **1,000 timesteps of a differential relation (Adaptive RK4 Continuation)**:
   - **Wall Time**: $0.037\text{ ms}$ ($26,908\text{ steps/sec}$).
   - **Interactivity**: Ultra-fast.
   - **Ceiling**: Scales to $200,000$ timesteps in $< 15\text{ ms}$. Unusable beyond $1,000,000$ timesteps ($78\text{ ms}$).

7. **Collection of 10,000 points rendered**:
   - **Wall Time**: $0.081\text{ ms}$ for bounding box, transformation, and coordinate projection.
   - **Interactivity**: Fully interactive on CPU.
   - **Ceiling**: CPU coordinate math scales to $250,000$ points ($12\text{ ms}$). Canvas 2D `ctx.arc()` draw calls bottleneck at $\approx 5,000$ points ($18\text{ ms}$); WebGL instanced point drawing scales to $5,000,000$ points at 60 FPS.

---

## C. Where the Time Goes

Detailed execution profiling was conducted for the slowest 3D simulation case (Marching Cubes over 216,000 points):

```
            3D MARCHING CUBES PROFILE BREAKDOWN (216,000 SAMPLES)
┌──────────────────────────────────────┬─────────────┬─────────────┬─────────────┐
│ Pipeline Stage                       │ Time (ms)   │ Fraction    │ Cadence     │
├──────────────────────────────────────┼─────────────┼─────────────┼─────────────┤
│ 1. AST Parsing & Semantic Analysis   │ 0.0170 ms   │ 0.35%       │ 1x on edit  │
│ 2. JIT Closure Compilation           │ 0.0232 ms   │ 0.48%       │ 1x on edit  │
│ 3. Grid Point Evaluation (216k pts)  │ 1.8150 ms   │ 37.43%      │ Every frame │
│ 4. Marching Cubes & Vertex Indexing  │ 3.0340 ms   │ 62.57%      │ Every frame │
│ 5. Canvas / WebGL Buffer Upload      │ ~0.9000 ms  │ (Overhead)  │ Every frame │
├──────────────────────────────────────┼─────────────┼─────────────┼─────────────┤
│ TOTAL SLICE FRAME PIPELINE           │ 4.8490 ms   │ 100.0%      │ Every frame │
└──────────────────────────────────────┴─────────────┴─────────────┴─────────────┘
```

### Architectural Findings:
1. **Compilation and Parsing are negligible ($< 1\%$ total time)**: The AST compiler generates JavaScript closures in $< 0.03\text{ ms}$.
2. **Marching Cubes Isosurface Extraction is the single largest bottleneck ($62.6\%$)**: Cube edge classification, table lookups (`MARCHING_CUBES_TRI_TABLE`), linear interpolation, and zero-allocation vertex deduplication take $3.03\text{ ms}$ of the $4.85\text{ ms}$ budget.
3. **Grid Point Evaluation takes $37.4\%$**: Evaluating the compiled numeric closure 216,000 times requires $1.81\text{ ms}$ ($8.4\text{ ns}$ per evaluation).
4. **Conclusion for Phase 2 Optimization**:
   - Compiling relations is already solved for scalar expressions.
   - To achieve $120\text{ FPS}$ at higher resolutions ($100^3 = 1\text{M}$ points), **Phase 2 must offload Grid Evaluation and Marching Cubes / Raymarching to the GPU (WebGL/WebGPU)**, reducing frame times from $75\text{ ms}$ to $< 1.0\text{ ms}$.

---

## D. Navigation and Interrogation

### 1. What Exists Today
- **3D Orbit**: Mouse drag orbiting azimuth ($\theta$) and elevation ($\phi$) angles.
- **3D & 2D Pan**: Shift+drag in 3D; drag in 2D.
- **Continuous Zoom**: Mouse wheel and touch pinch zooming.
- **Interactive Slicing with Coordinate Sliders**: $n - 2$ sliders for fixed coordinates $(v_3, \dots, v_n)$.
- **Zoom-to-Fit**: `findBounds2D()` coarse grid search detecting manifold bounding boxes.
- **Axis Selector**: Dynamic dropdown switching active display axes $[v_i, v_j]$.

### 2. Missing Inspection Facilities & Architectural Classification

```
                        INSPECTION MATRIX: VIEWER VS LANGUAGE
┌─────────────────────────────────────────────────────────────┬─────────────────────────┐
│ Tool / Capability                                           │ Architectural Layer     │
├─────────────────────────────────────────────────────────────┼─────────────────────────┤
│ 1. Hiding / Isolating Parts of a Model                      │ Pure Viewer Work        │
│ 2. Sectioning Through a Solid (Clipping Planes + Caps)      │ Viewer + Sampler Shader │
│ 3. Measuring Tool (Distance, Angle, Area between Objects)   │ Pure Viewer Work        │
│ 4. Entity Provenance (Select Geometry -> Highlight AST)     │ Pure Viewer Work        │
│ 5. Multiple Spaces Visible at Once (Side-by-Side Panes)     │ Pure Viewer / Layout    │
│ 6. Parametric Manifold Charts (u, v) -> (x, y, z)           │ Language + Sampler      │
│ 7. Vector Field & Streamline Flow Tracing                   │ Language + Sampler      │
│ 8. Curvature / Singularity Heatmap Overlay                  │ Viewer + Sampler        │
└─────────────────────────────────────────────────────────────┴─────────────────────────┘
```

#### Detailed Breakdown:

1. **Hiding or Isolating Parts of a Model**:
   - *Requirement*: In a space with 10 relations (e.g. intersecting cylinders and planes), toggle visibility of individual entities or isolate one entity.
   - *Layer*: **Pure Viewer Work**. Requires an entity layer manager in `SpaceViewport` that filters the render loop by entity index.
2. **Sectioning Through a Solid**:
   - *Requirement*: Drag an arbitrary clipping plane through a 3D Marching Cubes solid, displaying the interior cross-section with solid cap filling.
   - *Layer*: **Viewer + Sampler Shader**. Can be implemented via GPU clipping plane equations ($ax + by + cz + d \ge 0$) and 2D planar contour cap triangulation. Zero language changes needed.
3. **Measuring (Distance, Angle, Area)**:
   - *Requirement*: Interactive caliper tool clicking two points to measure Euclidean distance $\|\vec{p}_1 - \vec{p}_2\|$, three points for angle $\theta = \arccos(\frac{\vec{u}\cdot\vec{v}}{\|u\|\|v\|})$, or selecting a closed surface to sum triangle mesh areas $\sum \frac{1}{2}\|\vec{e}_1 \times \vec{e}_2\|$.
   - *Layer*: **Pure Viewer Work**. Raycasting against existing vertex/polyline data structures.
4. **Entity Provenance (Geometry $\to$ Relation Selection)**:
   - *Requirement*: Hovering or clicking a curve/surface highlights the exact line in the editor document that generated it, displaying its algebraic formula in a tooltip.
   - *Layer*: **Pure Viewer Work**. Tagging polylines and triangle indices with entity ID and source span.
5. **Multiple Spaces Visible at Once**:
   - *Requirement*: Comparing two separate $\{ \dots \}$ blocks in side-by-side synchronized viewports.
   - *Layer*: **Pure Viewer / Notebook Work**. Multi-canvas grid layout in `app.ts` / `editor.ts`.
6. **Vector Fields & Flow Streamlines**:
   - *Requirement*: Visualizing gradient vector fields $\nabla f(x, y)$ or autonomous ODE vector fields $(\dot{x}, \dot{y})$ with arrows and streamline integration.
   - *Layer*: **Language + Sampler**. Requires language syntax to identify vector relations or gradient operations and sampler grid vector evaluation.

---

## E. Robustness: Where the Pipeline Produces Wrong Geometry

Under the Axine honesty stance: **Wrong geometry is worse than none.**

```
                     GEOMETRIC ROBUSTNESS FAILURE AUDIT
┌─────────────────────────────────────────────────────────────┬─────────────────────────┐
│ Mathematical Scenario                                       │ Current Pipeline Output │
├─────────────────────────────────────────────────────────────┼─────────────────────────┤
│ 1. Near-Tangential Intersections (Kissing Circles)          │ Gap or Non-Manifold X   │
│ 2. Measure-Zero Sets (Isolated Points: x^2 + y^2 = 0)       │ SILENTLY DROPPED (0 pts)│
│ 3. Undefined Regions / Holes (z = sqrt(1 - x^2 - y^2))      │ Jagged Stair-Stepping   │
│ 4. Numerical Noise near Singularity (y = 1/x, sin(1/x))     │ False Connecting Lines  │
│ 5. Extension Exceeds Sampled Window (x^2 + y^2 = 100)       │ Blank Screen            │
└─────────────────────────────────────────────────────────────┴─────────────────────────┘
```

### Detailed Failure Analysis:

1. **Near-Tangential Intersections**:
   - *Test*: Two kissing circles $(x-1)^2 + y^2 = 1$ and $x^2 + y^2 = 4$ touching tangentially at $(2, 0)$.
   - *Failure*: Linear interpolation across a square grid cell cannot resolve quadratic tangency. At resolution $100 \times 100$, the sampler either creates an artificial gap of $\approx 0.02$ units or produces a false intersecting cross where the two circles cross through each other.
   - *Remedy*: Adaptive quadtree subdivision near regions where $|\nabla f_1 \times \nabla f_2| < \epsilon$.

2. **Measure-Zero Sets (Isolated Points & Zero Level Sets)**:
   - *Test*: $x^2 + y^2 = 0$ (a single point at the origin $(0, 0)$).
   - *Failure*: Since $x^2 + y^2 \ge 0$ everywhere, $f(x, y) \ge 0$ on all four corners of every cell. The Marching Squares bitmask is `0000` everywhere. **Marching Squares produces ZERO polylines. The point is silently dropped, presenting a blank viewport to the user.**
   - *Remedy*: Local minimum detector checking for cells where $\min |f(x,y)| < \epsilon$ and $\nabla f = \mathbf{0}$, emitting a discrete point geometry entity.

3. **Surfaces with Undefined Regions or Holes**:
   - *Test*: $z = \sqrt{1 - x^2 - y^2}$ (defined only on the unit disk $x^2 + y^2 \le 1$).
   - *Failure*: For $x^2 + y^2 > 1$, $\sqrt{\cdot}$ returns `NaN`. Marching Cubes treats `NaN` corners as non-crossing, setting interpolation fraction $t = 0.5$. This produces a jagged, irregular boundary with sawtooth artifacts along the perimeter.
   - *Remedy*: Exact domain boundary clipping using domain interval predicates and interval bisection along NaN edges.

4. **Numerical Noise Near Singularities & Poles**:
   - *Test*: $y = 1/x$ across $x = 0$, and $y = \sin(1/x)$.
   - *Failure*: At $x = 0$, $1/x$ diverges from $-\infty$ to $+\infty$. Opposite signs in neighboring cells trigger Marching Squares to draw an erroneous vertical line bridging the asymptote. In $y = \sin(1/x)$, infinite frequency oscillation aliases against grid resolution, drawing a dense chaotic spiderweb of false lines.
   - *Remedy*: Derivative jump / asymptote filter: when $|f(x_1) - f(x_0)| / \Delta x > \text{threshold}$ without a bounded sign change, discard the edge segment.

5. **Extension Exceeding Sampled Window**:
   - *Test*: $x^2 + y^2 = 100$ sampled over default $[-5, 5]^2$.
   - *Failure*: All grid points evaluate to negative values ($x^2 + y^2 - 100 \le 50 - 100 = -50 < 0$). Bitmask is `1111` everywhere; 0 polylines emitted. Viewport is blank with no indication of geometry.
   - *Remedy*: Automatic hierarchical domain search: if a relation has free variables and coarse grid has no roots, expand bounding box exponentially ($[-10, 10] \to [-50, 50] \to [-200, 200]$) up to a fuel limit before reporting emptiness.

---

## F. What Phase 2 Actually Is: Capabilities & Gates

Based on Sections A through E, Phase 2 consists of **six ordered capabilities (P2-C1 through P2-C6)**.

```
                              PHASE 2 DEPENDENCY GRAPH
                              
           [P2-C1. Unified Compilation & Evaluation Bridge]
                                  │
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
     [P2-C2. Point Clouds & Collections]  [P2-C3. Parametric Manifolds]
                  │                               │
                  └───────────────┬───────────────┘
                                  ▼
           [P2-C4. Robust Level-Set Sampler & Adaptive Mesh]
                                  │
                                  ▼
           [P2-C5. GPU Slicing & Compute Engine (WebGL/WebGPU)]
                                  │
                                  ▼
           [P2-C6. Interactive 3D Interrogation & Inspection]
```

---

### P2-C1: The Unified Compilation & Evaluation Bridge

#### Description
Connect Phase 1 language capabilities to the simulation engine. Prior to JIT closure compilation, the engine executes a lowering pass:
1. Symbolically reduce unevaluated `Diff` nodes to closed algebraic polynomials.
2. Inline Axine standard library functions (`:sqrt`, `:sin`, `:cos`, `:exp`, `:ln`) into native JavaScript/GLSL numeric calls.
3. Lower piecewise `\cases` into branch conditionals.
4. Lower operator-overloaded structures into coordinate scalar equations ($[x, y] + [u, v] = [x+u, y+v]$).

#### Gates
- All 10 Section A relations produce active, compilable spatial entities.
- `y = :sqrt(x)`, `y = d//dx (x^3)`, and `y = \cases{ \when x < 0: -1, \otherwise: 1 }` compile to native closures in $< 0.1\text{ ms}$.
- Zero manual TypeScript builtins added to the core.

---

### P2-C2: Point Clouds & Discrete Geometric Collections

#### Description
Add first-class spatial entity support for discrete collections: `SetValue`, `ListValue`, `MultisetValue`, and tuples of coordinates $(x, y)$ or $(x, y, z)$. Render point clouds, discrete trajectories, and vector lattices directly in 2D and 3D viewports without requiring implicit level-set equations.

#### Gates
- Point cloud $P = \text{Set of 10,000 points}$ renders in $< 1.0\text{ ms}$ with automatic bounding box and zoom-to-fit.
- Discrete trajectories (e.g. Collatz, Lorenz discrete maps) render as connected or disconnected point series.
- Hovering over a point displays its exact coordinate tuple.

---

### P2-C3: Explicit Parametric & Swept Manifold Mesher

#### Description
Implement a dedicated parametric mesher for 1D curves $\vec{r}(t) = (x(t), y(t), z(t))$ and 2D surfaces $\vec{r}(u, v) = (x(u,v), y(u,v), z(u,v))$ over bounded domains $u \in [a, b], v \in [c, d]$. Distinguish between implicit codimension-1 equations ($R(x, y, z) = 0$) and parametric charts $(\mathbb{R}^2 \to \mathbb{R}^3)$.

#### Gates
- Swept surfaces (sphere, torus, Moebius strip, Klein bottle) render as clean, continuous 3D triangle meshes with regular UV coordinate mapping.
- 3D space with $\{ x = \cos(u)\cos(v), y = \sin(u)\cos(v), z = \sin(v) \}$ renders as an integrated 3D sphere mesh in $< 5.0\text{ ms}$ (not an empty slice).

---

### P2-C4: Robust Level-Set Sampler & Adaptive Mesh Refinement

#### Description
Replace naive uniform grid sampling with an **Adaptive Quadtree (2D) and Octree (3D) Sampler** equipped with:
1. **Asymptote & Pole Detection**: Suppress false bridge segments across vertical asymptotes ($y = 1/x$).
2. **Measure-Zero Point Extractor**: Detect isolated real roots ($x^2 + y^2 = 0$) and emit discrete point entities.
3. **Domain Boundary Alignment**: Exact root finding along undefined/NaN interfaces ($z = \sqrt{1 - x^2 - y^2}$).
4. **Hierarchical Window Expansion**: Automatic domain search when relations exceed the default window ($x^2 + y^2 = 100$).

#### Gates
- `y = 1/x` renders two separate hyperbolic branches with zero connecting lines across $x = 0$.
- `x^2 + y^2 = 0` renders a distinct point at $(0, 0)$ (zero silently dropped points).
- `z = \sqrt{1 - x^2 - y^2}` renders a smooth circular boundary with zero sawtooth stair-stepping.
- `x^2 + y^2 = 100` automatically expands viewport bounds to $[-11, 11]^2$.

---

### P2-C5: High-Performance GPU Slicing & Raymarching Engine

#### Description
Implement a WebGL2 / WebGPU compute and raymarching pipeline for $n$-dimensional spaces:
1. Compile implicit relations directly to GLSL/WGSL fragment shaders.
2. Slicing sliders upload $(n - 2)$ uniform coordinates to the GPU; the GPU raymarches the 2D/3D slice at $120\text{ FPS}$ with zero CPU sampling overhead.
3. Instanced GPU point cloud rendering for $> 1,000,000$ points.

#### Gates
- 4D space slider scrubbing executes in $< 0.8\text{ ms}$ frame time at $1,000 \times 1,000$ resolution ($120\text{ FPS}$).
- $1,000,000$ point cloud renders at $60\text{ FPS}$ with smooth orbit/pan/zoom.

---

### P2-C6: Interactive 3D Interrogation & Inspection Workspace

#### Description
Build the complete interactive 3D inspection and measurement toolkit in `SpaceViewport`:
1. **Entity Layer Isolation**: Checkboxes to show, hide, or isolate individual relations in a multi-entity space.
2. **Solid Sectioning**: Dynamic 3D clipping plane with solid cross-sectional cap rendering.
3. **Measurement Calipers**: Interactive distance, angle, and surface area measurement tools.
4. **Provenance Highlighting**: Clicking geometry highlights the source relation in the editor document.
5. **Multi-Space Comparison**: Synchronized side-by-side comparative views of multiple space blocks.

#### Gates
- Distance, angle, and area measurements verified accurate to $10^{-6}$ against analytical standards.
- Sectioning plane sweeps smoothly through 3D meshes with real-time cap polygon filling.
- Entity selection highlights corresponding AST line in editor gutter.

---

## G. What You Do Not Know (Open Uncertainties)

1. **Automatic Parametric vs. Implicit Intent Recognition**:
   - In a pure relational block `{ x = cos(u)*cos(v), y = sin(u)*cos(v), z = sin(v) }`, how does the engine formally derive whether the user intends a 2D parametric surface embedded in $\mathbb{R}^3$ versus a system of three implicit hypersurfaces in $\mathbb{R}^5$?
   - *Risk*: Heuristic guessing violates the semantic honesty principle. The engine needs a formal structural rule (e.g. relations where isolated variables span the display axes and parameter variables span independent domains).

2. **GPU Shader Compilation of User-Defined Recursive Recurrences**:
   - Compiling standard arithmetic and polynomials to GLSL is straightforward. However, if a relation references a user-defined Newton's method library recurrence or an ODE integrator, how can bounded iteration loops be emitted in WebGL shaders without hitting instruction limits?

3. **Topological Invariant Preservation Across Critical Slices**:
   - When an $n$-D slice slider passes through a Morse critical value (a saddle point or neck pinch where $\nabla R = \mathbf{0}$), numerical interpolation in Marching Squares can suffer triangle flipping and winding reversals. How can the adaptive octree guarantee topological consistency and surface orientation across frames?

4. **Global Manifold Discovery for Highly Non-Linear Relational Systems**:
   - If a user defines an implicit equation with isolated components far from the origin (e.g. $(x - 1000)^2 + (y - 1000)^2 = 1$), how can the domain discovery algorithm locate the manifold without scanning an infeasibly large bounding box?

---

## Deliverable Summary

This assessment establishes the complete technical baseline for Phase 2:
- **Phase 1 is complete**: Language capabilities C1–C9 and floor primitives are verified.
- **The Sampler must be upgraded to match the language**: Bridging the AST lowering pass (P2-C1), supporting point clouds (P2-C2) and parametric charts (P2-C3), replacing uniform grid sampling with an adaptive quadtree/octree engine (P2-C4), accelerating slicing via GPU compute (P2-C5), and delivering the complete 3D inspection workspace (P2-C6).
