# Design and Reference Notes

These notes capture architectural principles, typographical baselines, and design decisions drawn from mathematical literature, visual systems, and prior art. In accordance with our zero-dependency mandate, each entry documents what was adopted and what was deliberately rejected.

---

## 2.1 For the Derivation Renderer

### Wolfram Alpha Step-by-Step Solution Panes
- **What We Took**: The explicit operational gesture. Wolfram Alpha formats every step by isolating the transformation rule and operand on its own line preceding the resulting equation (e.g., `Subtract 4x from both sides` followed by `2x - 6 - 4x = 1`), with the operand visually mirrored across the relation anchor. We adopted this two-phase structure: operation intent with side targets first, followed by algebraic evaluation.
- **What We Rejected**: The monolithic accordion disclosure pattern and opaque intermediate leaps. Wolfram Alpha frequently collapses complex factoring or distribution into single black-box jumps without tracking side conditions or domain restrictions ($x \neq 0$), and hides alternate branching paths behind interactive paywalls rather than exposing unified branch forks.

### Khan Academy Worked Equation Examples
- **What We Took**: Focused typographical weight and visual diffing without rainbow highlighting. Khan Academy indicates transformed sub-expressions by adjusting font weight, position, and subtle neutral contrast while keeping the rest of the equation visually stable, allowing the eye to track algebraic flow without chromatic fatigue.
- **What We Rejected**: Excessive pastel color-coding per variable and patronizing animated transitions. Color must be reserved strictly for semantic states (verified, error, unknown, stale); relying on color to disambiguate terms clutters notation and fails accessibility contrast.

### Cambridge / AMS Typesetting Conventions for Aligned Equation Blocks
- **What We Took**: Center-relation alignment ($\align$ / $\eqalign$). In AMS-TeX and Cambridge mathematical publishing, systems of equations and derivations align strictly along the principal relation symbol (`=`, `<`, `\le`, `\neq`), with binary operators and operands indented systematically relative to the anchor.
- **What We Rejected**: Fixed-width tabular cell constraints and multi-column margin wrapping that break responsive layout in side panels. We use CSS grid with relation anchoring rather than rigid column tables.

---

## 2.2 For Notation Rendering

### KaTeX Layout Geometry and Metrics
- **What We Took**: Exact dimensional rules for fraction bars and vertical spacing metrics. Specifically: fraction line thickness scales with font size ($\approx 0.06\text{em}$ with a $1\text{px}$ minimum rendering threshold), numerator baseline raised by $\ge 0.65\text{em}$ above the bar, denominator baseline lowered by $\ge 0.45\text{em}$, and clearance gap preserved to prevent collision with descenders/ascenders.
- **What We Rejected**: Heavy DOM wrappers, hundreds of nested `<span>` elements with virtual font metrics tables, and bloated font asset packs. We compute layout directly via CSS grid/flex and clean HTML entities with system mathematical glyph fallback stacks.

### The TeXbook Rules for Spacing Around Operators and Relations
- **What We Took**: Differentiated math spacing classes: `\thickmuskip` ($5/18\text{em}$) around relation symbols (`=`, `<`, `>`, `\le`, `\ge`, `\neq`), `\medmuskip` ($4/18\text{em}$) around binary additive and subtractive operators (`+`, `-`), and `\thinmuskip` / zero spacing around implicit multiplication (`2x`, `a b`) and functional applications. Applying these precise spacing ratios eliminates visual ambiguity.
- **What We Rejected**: Monospace uniform character spacing for mathematical equations. Monospaced formatting treats `x = 2 + y` with identical spacing everywhere, making equations look like ASCII code dumps rather than genuine mathematical prose.

---

## 2.3 For the Editor and Work Panel

### Observable Notebooks
- **What We Took**: Explicit reactive state propagation and deterministic staleness indicators. When a line or cell is modified, downstream values that depend on un-evaluated blocks are dimmed and stamped with a subtle `stale` badge rather than clearing the visual output or showing unverified stale data as live truth.
- **What We Rejected**: Implicit non-linear dependency graphs and unprompted full re-execution loops on every keystroke that steal focus or freeze interaction. Ambient live execution remains bounded to keystroke debounce and separate worker pools with strict fuel budgets.

### JupyterLab Panel Splitting and Docking
- **What We Took**: Resizable split pane with persistent layout state and explicit view pinning (`Pin / Unpin`). Users can drag the splitter to dedicate visual room to derivations or 3D surfaces and lock the visual inspector to a specific line regardless of active cursor navigation.
- **What We Rejected**: Complex multi-window tab docks, modal dialogs, floating windows, and nested notebook ribbons that compete with document text and clutter the editing workflow.

### Rust Compiler Diagnostics (rustc-dev-guide)
- **What We Took**: Structured multi-level diagnostic reporting: primary error span underline, expected vs. found comparison, concise suggestions (`try solve(f, near: x0)`), and secondary contextual notes (such as unrepresented complex roots $\mathbb{C}$ or domain exclusions $x \neq a$).
- **What We Rejected**: Terminal-only ANSI color escapes and multi-page stack traces. All diagnostics map to structured JSON objects with source line/column spans rendered into clean gutter hints and trace inspectors.

---

## 2.4 For the 3D Renderer

### Newell-Newell-Sancha (1972) Visible Surface Determination
- **What We Took**: The five geometric overlap tests (bounding box in X/Y/Z, all vertices of polygon $P$ behind plane of polygon $Q$, all vertices of $Q$ in front of plane of $P$, projection overlap in X-Y) and polygon plane-splitting when cyclic overlap occurs. This ensures intersecting mathematical surfaces (such as planes intersecting paraboloids or sinusoids) render with accurate depth sorting and zero rendering artifacts.
- **What We Rejected**: Full BSP tree compilation or heavyweight WebGL shader pipelines. We maintain our pure zero-dependency Canvas2D software rasterizer with depth-sorted quad pooling.

### Matplotlib `mplot3d` Spatial Cueing and Label Placement
- **What We Took**: Dynamic 3D bounding box projection with distance-attenuated depth cueing (subtle gridline fade with depth) and projection-aware axis label placement that aligns along projected 3D coordinate axes rather than fixed 2D screen positions.
- **What We Rejected**: Slow synchronous Python-side bitmap rendering and static non-interactive camera snapshots. Our engine supports 60fps mouse drag orbit, shift-drag pan, and scroll zoom with viewport state preservation.

---

## 2.5 For Visual Design

### Bret Victor ("Learnable Programming" & "Up and Down the Ladder of Abstraction")
- **What We Took**: Tight temporal and spatial proximity between code and its mathematical behavior. Visual representations (plots, derivations, evaluations) appear side-by-side with document text; changing a parameter instantly reflects across both numeric derivations and geometric plots without jumping through modal dialogs.
- **What We Rejected**: Gimmicky direct-manipulation visual programming widgets that replace text syntax with sluggish mouse sliders for every arithmetic literal. Code remains the primary expressive notation.

### Edward Tufte on Data-Ink Ratio
- **What We Took**: Ruthless elimination of decorative non-data ink: removing colored button backgrounds, gradients, emoji icons, box shadows, and superfluous container borders. Chrome recedes into low-contrast warm neutrals so mathematical text and visualizations command primary visual prominence.
- **What We Rejected**: Severe minimalist minimalism that omits vital state information. We retain clear, accessible typography, explicit line numbers, status indicators, and keyboard focus outlines.

---

## 2.6 Numerical Root-Finding Precision & Sensitivity Analysis
- **Finding on $\mathbf{7 \times 10^{-6}}$ Gap**: During the projectile challenge, symbolic `isolate` produced $t = 7.208012\text{ s}$ while numeric `solve` produced $t = 7.208019\text{ s}$. Analysis confirmed Newton iteration is exact (tolerance $10^{-12}$, achieved residual $1.1 \times 10^{-16}$). The $\Delta t = 6.785 \times 10^{-6}\text{ s}$ arose because the symbolic line hardcoded literal `35.3553` instead of the full float $v_y = 35.35533328235472$. Propagating $\Delta v_y = 0.00003328235$ through $\frac{\partial t}{\partial v_y} = \frac{1}{g} = \frac{1}{4.905}$ yields exactly $\Delta t = 6.7854 \times 10^{-6}\text{ s}$.
- **Takeaway**: Exact symbolic derivation accurately preserves whatever precision is provided in equation literals. For mathematical consistency across symbolic and numeric verification, expressions should use full-precision literals or exact fractions.
