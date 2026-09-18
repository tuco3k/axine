# Architectural Assessment: The Document Model (Phase 3)

> **Document Type**: Normative Architectural Assessment and Document Model Specification  
> **Status**: Complete Assessment — No Implementation Code  
> **Target System**: Axine 2.0 Document Model, Typography & In-Flow Viewports (Phase 3)  
> **Reference Baselines**: [`AGENTS.md`](../AGENTS.md), [`DESIGN.md`](../DESIGN.md), [`VOICE.md`](../VOICE.md), [`docs/SEMANTICS.md`](./SEMANTICS.md), [`docs/PHASE2_ASSESSMENT.md`](./PHASE2_ASSESSMENT.md)

---

## Executive Summary

Phase 1 implemented the core language, its algebraic capabilities (C1 through C9), and the standard mathematical libraries.
Phase 2 established the simulation engine, implicit level-set sampling, 2D/3D space viewports, and numerical integrators.

Phase 3 addresses **the document as a mathematical publication**: typeset mathematical notation in the document body, in-flow figures positioned by the author, and direct editing of mathematical prose and equations.

The current editor architecture couples a hidden HTML `<textarea id="doc-textarea">` to a synchronized visual overlay `<div id="doc-typeset-overlay">`. Caret positioning and mouse-click resolution rely on measuring rendered DOM text spans with `document.createRange()` and mapping the resulting pixel bounding boxes back to 1-dimensional character offsets in the monospace textarea.

In Phase 2, this architecture caused three distinct defects with a single root cause: DOM virtualization changed which nodes existed at a given scroll position, which invalidated the coordinate map. Scrolling broke, caret alignment drifted across long files, and opening files without an active workspace produced misalignment.

Phase 3 introduces requirements that the textarea-plus-overlay architecture cannot support:
1. Mathematical notation renders as true typeset mathematics ($\forall$, $\sum$, $\int$, stacked fractions $\frac{a}{b}$), diverging from the underlying character count and line height of raw source text.
2. Figures (interactive 2D and 3D viewports) live directly in the document flow between paragraphs and equations.
3. Figures show their source relation and provide provenance navigation without requiring the user to scroll manually to the defining line.
4. Scenes support both static illustration and interactive navigation without capturing document scrolling.

This assessment evaluates why the overlay architecture cannot survive, defines the target block document model, specifies in-flow figure semantics, inventories surviving versus deleted components across the codebase, quantifies test suite impact, details the migration path, and records open technical unknowns.

---

## A. Whether the Overlay Survives

The textarea-plus-overlay architecture cannot be salvaged with piecewise coordinate maps. It is dead.

The overlay operates on three structural assumptions:
1. Every character in the underlying `<textarea>` corresponds to a visible glyph box in the overlay with a 1:1 index relationship.
2. Every line in the document has an identical, fixed height (`lineHeight = 24.5px`).
3. The document contains only text; no embedded non-text elements exist between lines.

Phase 3 invalidates all three assumptions.

```
                    CURRENT ARCHITECTURE (Phase 2)
  ┌────────────────────────────────────────────────────────────────┐
  │ <textarea id="doc-textarea"> (invisible text, mono line-height) │
  │   col 0  col 1  col 2  col 3  col 4  col 5  col 6  col 7       │
  │     \      f      o      r      a      l      l      x         │
  └──────────────────────────────┬─────────────────────────────────┘
                                 │ 1:1 character-box projection
                                 ▼
  ┌────────────────────────────────────────────────────────────────┐
  │ <div id="doc-typeset-overlay"> (visible DOM nodes)             │
  │   box 0  box 1  box 2  box 3  box 4  box 5  box 6  box 7       │
  │     \      f      o      r      a      l      l      x         │
  └────────────────────────────────────────────────────────────────┘

                    PHASE 3 REQUIREMENT (Divergence)
  ┌────────────────────────────────────────────────────────────────┐
  │ Source text:   \forall x \in S                                 │
  │ Code units:    15 characters                                   │
  └──────────────────────────────┬─────────────────────────────────┘
                                 │ Token-to-glyph replacement
                                 ▼
  ┌────────────────────────────────────────────────────────────────┐
  │ Rendered math: ∀ x ∈ S                                         │
  │ Visual glyphs: 7 visual units                                  │
  │ Problem:       Where do textarea offsets 1..6 exist on screen? │
  └────────────────────────────────────────────────────────────────┘
```

### 1. Horizontal Coordinate Divergence (N:1 Token Mapping)

In the current implementation (`src/document/editor.ts:3180-3195`), caret placement queries `charBoxes[colIdx].left`.

When source text contains macro tokens, character count diverges from glyph count:
- `\forall` (7 code units) renders as `∀` (1 glyph advance, width $\approx 11.2\text{px}$).
- `\approx` (7 code units) renders as `≈` (1 glyph advance).
- `\subseteq` (10 code units) renders as `⊆` (1 glyph advance).
- `\lambda` (7 code units) renders as `λ` (1 glyph advance).

In the underlying `<textarea>`, the cursor can occupy offsets $0, 1, 2, 3, 4, 5, 6, 7$.
In the rendered overlay, the glyph `∀` has only two physical visual boundaries: its left edge ($x = x_0$) and its right edge ($x = x_0 + w$).

If the user presses the Right Arrow key into `\forall`:
- The textarea moves the insertion point to index 1.
- The overlay cannot place the visual caret at index 1 because no character box exists for index 1.
- If the overlay clamps the caret to $x_0$ for indices $1 \dots 6$, the visual caret remains stationary while the user presses the arrow key 6 times. The editor appears frozen.
- If the overlay synthesizes fractional positions across the glyph, the caret sits inside the body of `∀`. Typing a character at that position inserts a letter into the middle of the token (e.g. `\forXall`), which invalidates the token, destroys the glyph substitution, causes the token to expand from 1 glyph to 8 monospace characters, and violently jumps horizontal layout.

Piecewise mapping cannot assign distinct screen coordinates to character positions that do not exist visually.

### 2. Vertical Coordinate Divergence (Line-Height Breakdown)

In `src/document/editor.ts:1930-1934`, mouse-click line resolution uses uniform division:
```ts
const lineHeight = 24.5;
const padTop = 10.5;
let lineIdx = Math.floor((clickY - padTop) / lineHeight);
```

Typeset mathematics has variable height:
- An inline fraction ($\frac{a}{b}$) requires a minimum vertical height of $42\text{px}$ to accommodate numerator, denominator, and fraction bar clearance.
- Display operators with limits ($\sum_{i=1}^n$, $\int_0^\infty$) require $50\text{px}$ to $64\text{px}$.
- Matrices and multi-line derivations require $80\text{px}$ to $200\text{px}$.

An HTML `<textarea>` enforces a single uniform `line-height` across all lines. It cannot set variable line heights per row.

If line 4 in the overlay contains a stacked fraction of height $48\text{px}$, every subsequent line $L > 4$ in the overlay is displaced downwards by $23.5\text{px}$ relative to the underlying textarea.
- A mouse click on line 5 in the overlay strikes the spatial coordinates corresponding to line 6 in the textarea.
- The caret on line 5 is drawn $23.5\text{px}$ lower than where the textarea believes it to be.
- Compensating via piecewise vertical maps would require injecting synthetic empty newline characters into the `<textarea>` to simulate vertical gaps. This mutates the user's source document, alters file content on disk, and breaks AST source span tracking.

### 3. In-Flow Figures (The 240px Gap)

An HTML `<textarea>` is a replaced plain-text element. Its content model permits only text strings. It cannot contain child DOM elements.

An in-flow figure is an interactive canvas or SVG container occupying $240\text{px}$ to $400\text{px}$ of vertical height.
- The overlay can render an element between two paragraphs.
- The underlying textarea has no concept of this gap.
- Clicks on the canvas fall through to the underlying textarea, focusing the textarea and placing the text caret at whatever source line happened to sit beneath the canvas.
- To prevent this, the overlay must intercept all pointer events. Once the overlay intercepts pointer events, it must also implement text selection, drag selection, double-click word selection, triple-click line selection, copy, cut, paste, and IME composition.
- At that point, the textarea provides zero functionality and serves only as an obstacle to rendering.

### 4. Selection and Browser Highlighting Failure

The current implementation hides the textarea text using:
```css
#doc-textarea {
  color: transparent;
  caret-color: transparent;
}
```
However, browser text selection highlighting (the selection background) cannot be made transparent without breaking user selection feedback, nor can it be reshaped to match non-linear typeset math.
When a user selects text across an equation containing `\forall` or a fraction, the browser draws blue selection rectangles against the invisible monospace characters in the textarea. The rendered overlay sits out of phase with the blue rectangles.

The textarea-plus-overlay architecture cannot meet Phase 3 requirements. It must be replaced.

---

## B. What a Document Model Would Be

### 1. The Block Tree Structure

The document is modeled as an ordered list of typed blocks:

```ts
export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'equation'
  | 'figure'
  | 'derivation'
  | 'table';

export interface DocumentBlock {
  readonly id: string;
  readonly type: BlockType;
  source: string;
  status: 'verified' | 'unknown' | 'error' | 'stale';
  result?: Value;
  error?: MathDiagnostic;
  metadata?: Record<string, any>;
}

export interface DocumentModel {
  frontmatter: Record<string, any>;
  blocks: DocumentBlock[];
}
```

- `heading`: Markdown `#`, `##`, `###`.
- `paragraph`: Mathematical prose, supporting inline math spans `$ ... $`.
- `equation`: Standalone algebraic relations, assignments, and claims (`x^2 + y^2 = 4`).
- `figure`: Embedded 2D/3D level-set visualizations and plots.
- `derivation`: Step-by-step equivalence chains (`\derive`).
- `table`: Numerical evaluation tables or discrete point sets.

### 2. File Format on Disk: Plain Text `.ax`

The file on disk **remains plain text `.ax`**. It does not gain JSON wrappers, XML tags, or binary containers.

The plain text format already contains natural syntactic boundaries:
- Headings start with `# `, `## `, `### `.
- Paragraphs are contiguous lines of prose text.
- Equations are naked mathematical statements (`x^2 + y^2 = 4`, `f(x) := ...`).
- Figures are explicit statements in the language:
  ```axine
  \figure(:orbit, width: 480, height: 320, align: :center)
  ```
  or standalone space declarations:
  ```axine
  {\axis x, y; x^2 + y^2 = 4}
  ```

Blocks are delimited by blank lines (`\n\n`) and top-level statement keywords.
- Parsing a `.ax` file loads the text, splits it into block chunks, and compiles each block.
- Serializing to disk concatenates the `source` text of all blocks separated by standard newlines.
- Version control diffs (`git diff`) remain clean line-based text diffs. Existing `.ax` documents load without migration or reformatting.

### 3. Editing Mechanism: Active Block Text Buffer

The user edits text within the active block. They do **not** edit the AST directly.

Direct AST editing (e.g. MathQuill, LyX) forces rigid structural transitions. Typing `/` traps the cursor in a denominator; typing `+` at the boundary of a superscript requires explicit escape sequences; deleting a delimiter can delete an entire subtree. This is hostile to fluid mathematical typing.

The editing model uses block-level state transitions:
1. **Idle State**: The block renders fully typeset mathematics via KaTeX / `math_typeset.ts`.
2. **Active State**: Clicking into an equation block or navigating into it with arrow keys transitions that specific block into an active text editor.
3. **Editing**: The active block displays its raw source text with syntax highlighting. Keystrokes mutate the block's local text string.
4. **Compilation**: While typing, debounced compilation runs in the background worker. On blur or navigation to another block, the block re-compiles, updates its evaluated value, and re-renders as typeset mathematics.

```
┌────────────────────────────────────────────────────────┐
│ IDLE BLOCK (Typeset View)                              │
│                                                        │
│           x² + y² = 4                                  │
│                                                        │
└────────────────────────────────────────────────────────┘
                           │ Click / Enter
                           ▼
┌────────────────────────────────────────────────────────┐
│ ACTIVE BLOCK (Source Editor)                           │
│                                                        │
│   x^2 + y^2 = 4|                                       │
│                                                        │
└────────────────────────────────────────────────────────┘
                           │ Blur / Arrow Away
                           ▼
┌────────────────────────────────────────────────────────┐
│ COMPILED & RE-RENDERED (Typeset View)                  │
│                                                        │
│           x² + y² = 4                                  │
│                                                        │
└────────────────────────────────────────────────────────┘
```

Prose paragraph blocks remain editable in-place using standard text editing.

### 4. Caret Ownership and Figure Navigation

The document editor owns caret state:
```ts
export type CaretLocation =
  | { type: 'text'; blockId: string; offset: number }
  | { type: 'figure'; blockId: string; selected: boolean };
```

- Within an active text or equation block, the caret is owned by the block's native input element or text node.
- Navigation across blocks:
  - Pressing Down Arrow at the bottom of block $N$ moves the caret to offset 0 of block $N+1$.
  - Pressing Up Arrow at the top of block $N$ moves the caret to the end of block $N-1$.
- When navigating into a `FigureBlock`:
  - A figure is an atomic block. It has no character offsets.
  - Entering a figure selects the figure block (rendering a focused border and corner handles).
  - Pressing Down Arrow or Right Arrow while a figure is selected exits the figure and places the caret at offset 0 of the subsequent block.
  - Pressing Up Arrow or Left Arrow exits the figure and places the caret at the end of the preceding block.
  - Pressing Backspace or Delete on a selected figure removes the figure block.

### 5. Caret Accuracy in Proportional and Typeset Math

The concept of "0.00px monospace caret accuracy" (measuring alignment against an artificial 8.429px grid) is retired.

In Phase 3:
- Inactive blocks are typeset mathematical figures. They do not maintain a permanent blinking caret.
- Active blocks use native browser font rendering for their editing buffer. Caret positioning within the active block is handled directly by DOM selection APIs (`window.getSelection()`, `Range.getClientRects()`).
- Proportional fonts have variable glyph advances defined by font tables. The browser layout engine places the caret between glyph advances with subpixel accuracy natively.
- The obsolete monospace coordinate formula (`caretX = padLeft + colIdx * 8.429`) in `src/document/editor.ts` is deleted.

---

## C. Figures in the Flow

### 1. Binding Mechanism

A figure in the document flow binds to a named AST relation, space, or trajectory via symbol reference:
```axine
# Producing definition
orbit := {\axis x, y, z; dx/dt = -y, dy/dt = x, dz/dt = 0.1}

# In-flow presentation figure
\figure(:orbit, width: 480, height: 320)
```

The document state maintains a reactive dependency map:
```ts
symbolDependencies: Map<string, Set<string>> // symbol -> Set<figureBlockId>
```

When a statement assigns or defines a symbol, any figure referencing that symbol registers a dependency.

### 2. Behavior on Edit and Deletion

- **When the relation is edited**:
  The ambient worker evaluates the new statement and produces an updated `SpaceValue`. The document state pushes the new geometry to the bound `SpaceViewport`. The viewport updates its buffers and redraws.
  If re-evaluation takes longer than $50\text{ms}$, the figure applies the `stale` semantic state indicator (muted border and badge per `DESIGN.md:71`) until the evaluation worker finishes.
- **When the relation is deleted**:
  If the producing equation is deleted, commented out, or produces a runtime error, symbol resolution fails.
  The figure does not throw an unhandled exception and does not disappear silently. It renders an inline error card with semantic state `error` (`#f87171` border, red badge per `DESIGN.md:70`) stating:
  `"Unresolved symbol :orbit"`
- **Provenance Navigation**:
  Every in-flow figure renders a provenance indicator in its title bar (`"Where it came from"` per `VOICE.md:24`). Clicking this indicator immediately scrolls to and highlights the block containing the defining equation.

### 3. Position and Presentation Persistence

All figure positioning and camera configuration are persisted **directly in the `.ax` file** as arguments to the `\figure` statement:
```axine
\figure(:orbit, width: 480, height: 320, view: [30, 45], zoom: 1.2, align: :center)
```

- When the user drags to resize a figure, the editor updates `width` and `height`.
- When the user rotates or zooms a 3D figure, the editor updates `view` (azimuth, elevation) and `zoom`.
- These updates modify the block source string. Saving the document writes the updated statement to disk.
- No companion files (`.meta`, `.json`) are created. The document remains a single self-contained file.

---

## D. Static versus Navigable

### 1. Analysis of Architectural Options

| Option | Definition | Evaluation |
| :--- | :--- | :--- |
| **Property of the Scene** | Declared on the mathematical space: `{\axis x, y, z, :mode: static; ...}` | **Rejected**. Violates separation of mathematical object from observational presentation (`docs/SEMANTICS.md:31`). An algebraic manifold has intrinsic geometry; navigation is an observational action. |
| **Property of the View** | Declared on the figure block: `\figure(:orbit, navigable: false)` | **Accepted as Author Intent**. Allows the document author to specify whether a figure is a fixed diagram or an interactive exploration artifact. |
| **User Setting** | Global IDE toggle overriding document view settings. | **Rejected**. Overrides author document structure and forces all figures into a single mode. |

### 2. The In-Flow Scroll Collision Problem

In a continuous document, embedded 3D viewports create an interaction conflict:
If an in-flow canvas intercepts mouse wheel events for camera zoom and mouse drag for camera orbit, a user scrolling down the document page gets trapped whenever the cursor passes over a figure. Document scrolling halts and the camera zooms erratically.

```
       DOCUMENT SCROLL STREAM
  ┌──────────────────────────────┐
  │ Paragraph text               │  ▲
  │                              │  │ User scrolling page
  ├──────────────────────────────┤  │ with trackpad/mouse
  │ IN-FLOW FIGURE               │
  │ [Canvas: 480px x 320px]      │  X Trapped: wheel zooms camera,
  │                              │    drag rotates 3D scene;
  │                              │    document scrolling stops.
  ├──────────────────────────────┤
  │ Subsequent paragraph         │
  └──────────────────────────────┘
```

### 3. Architectural Resolution: View Configuration with Click-to-Activate

Figures in the document flow use an explicit interaction lifecycle:

1. **Default State: Inert**:
   Figures are rendered with interactive canvas event listeners detached. Mouse wheel and touch swipe events pass directly through to the document scroller. The user can scroll past figures without interference.
2. **Hover Affordance**:
   Hovering over a navigable figure reveals a subtle toolbar overlay: `"Click to interact"`.
3. **Active Navigation State**:
   Clicking the canvas enters interaction mode. The figure acquires a visible focus ring (`var(--color-accent)`). Wheel events zoom the camera; drag events orbit and pan.
4. **Release**:
   Pressing Escape or clicking outside the figure exits interaction mode and restores document scrolling.
5. **Static Override**:
   If the author sets `navigable: false` in the `\figure` pragma, interaction is permanently disabled, and the figure functions as a fixed diagram.

---

## E. What Survives

### 1. Component Inventory

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. CORE ENGINE & MATH (100% SURVIVES)                                       │
│    • src/core/* (evaluator, compiler, parser, tokenizer, kinds, types)     │
│    • src/core/algebra/*, src/core/numeric/*, src/core/sampler.ts           │
│    • documents/lib/* (all standard libraries: sets, trees, strings, etc.)   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. VISUALIZATION & VIEWPORTS (95% SURVIVES)                                │
│    • src/plot/space_viewport.ts (projection, depth sort, rasterization)    │
│    • src/plot/animation_player.ts, src/plot/spatial_inspector.ts            │
│    • src/notebook/pane_container.ts, src/notebook/pane_tree.ts              │
│    • Change: Viewports mount in block DOM containers instead of dock cards. │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. DOCUMENT STATE & EXPORTER (REWRITTEN)                                    │
│    • src/document/document_state.ts (line array -> block tree)              │
│    • src/document/exporter.ts (exports block tree to HTML/Markdown)         │
│    • src/document/file_manager.ts (serializes block array to plain text)    │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. EDITOR & CARET OVERLAY (DELETED)                                         │
│    • <textarea id="doc-textarea"> & <div id="doc-typeset-overlay">          │
│    • getLineCharacterBoxes(), charBoxes, padLeft = 7.0, charWidth = 8.429   │
│    • Math.floor((clickY - padTop) / lineHeight)                             │
│    • #doc-caret monospace positioning engine                                │
│    • Gutter row spacer virtualization hacks                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2. Test Suite Impact (Exact Numbers)

The current test suite consists of **71 test files** and **872 passing tests**.

```
Total Test Files: 71
Total Tests:      872
Passing:          872 (100%)
```

#### Layer Breakdown

| Layer | Test Files | Total Tests | Status & Impact |
| :--- | :---: | :---: | :--- |
| **Core & Language Layer** | 61 | 807 | **100% Unaffected**. Zero tests touch the DOM, textarea, or overlay coordinates. Covers parsing, AST compilation, evaluator, algebra, numeric tower, ODEs, modules, standard libraries, quantifiers, and mathematical typesetting. |
| **Document State Layer** | 3 | 24 | **Minor Updates Required**. `workspace.test.ts` (13 tests), `multi_document.test.ts` (4 tests), `export.test.ts` (7 tests). Tests adapt to query block records (`state.getBlocks()`) instead of line records (`state.getLines()`). |
| **Editor & Overlay Layer** | 7 | 41 | **Directly Impacted**. 41 tests touch editor DOM elements, caret positioning, or gutter layout. |

#### Detailed Inventory of Impacted Editor Tests (41 Tests)

1. `src/tests/virtualization_and_caret_alignment.test.ts` (2 tests):
   - Directly asserts `#doc-textarea` scrolling, `.doc-typeset-line` DOM replication, and 5,000-line monospace caret alignment within 1px.
   - **Action**: Delete monospace assertions; replace with block-tree virtualization and block-boundary navigation tests.
2. `src/tests/large_document_ceiling.test.ts` (2 tests):
   - Measures typing latency and memory consumption when appending characters to `#doc-textarea`.
   - **Action**: Update to measure active block typing latency and block tree compilation throughput.
3. `src/tests/layout_dock_visuals.test.ts` (9 tests):
   - Verifies gutter card layout, dock resizing, and pane edges.
   - **Action**: Update DOM selectors for in-flow figure containers and docked panels.
4. `src/tests/pane_system.test.ts` (17 tests):
   - Tests splitting, resizing, tab switching, and leaf docking in `PaneContainer`.
   - **Action**: Survives intact; update mock setup where tests reference `#doc-textarea`.
5. `src/tests/topbar_controls.test.ts` (2 tests):
   - Tests top toolbar buttons (run, pause, stop, export).
   - **Action**: Survives intact; verify action dispatch against block document state.
6. `src/tests/editor_unicode_norm.test.ts` (2 tests):
   - Verifies Unicode mathematical symbol replacement on input.
   - **Action**: Survives intact; wire to block input handler instead of textarea event listener.
7. `src/tests/file_open_save.test.ts` (7 tests):
   - Verifies opening, saving, and dirty tracking of `.ax` files.
   - **Action**: Survives intact; assert block serialization produces identical plain text `.ax`.

---

## F. Where It Breaks and for How Long

### 1. Incremental Migration Feasibility

The textarea-plus-overlay architecture cannot be incrementally migrated on the same visual surface. The textarea intercepts events and imposes uniform line height; the block document requires heterogeneous DOM heights and block-level focus. They cannot run simultaneously in the same viewport container.

However, the migration **can be isolated** without breaking CLI tools, core language features, or existing tests during development.

### 2. Migration Path

```
  Phase 3.1: Block Document State & Partitioner
  ├── Implement BlockDocumentState in parallel with DocumentState
  ├── Parser splits .ax source into Block[] records
  └── Worker compiles and evaluates Block[] records incrementally
      (All 807 core tests continue passing)

  Phase 3.2: Typeset Flow Renderer (Read-Only)
  ├── Render BlockDocument into DOM flow: headings, paragraphs, typeset equations
  ├── Mount SpaceViewport instances directly inside FigureBlock elements
  └── Verify in-flow 2D/3D rendering and resize responsiveness
      (Document readable and visually correct; editing disabled)

  Phase 3.3: Block Editing & Caret Controller
  ├── Implement click-to-edit and keyboard focus transitions
  ├── Active block text editing buffer with local syntax highlighting
  └── Arrow-key navigation across block boundaries and atomic figure selection

  Phase 3.4: Deprecation & Test Migration
  ├── Switch index.html to BlockEditor
  ├── Delete legacy editor.ts, textarea, and overlay DOM
  └── Update the 41 impacted editor tests to target the block DOM
```

### 3. The Breakage Window

- **Breakage Window Duration**: **3 to 4 working days**.
- **Scope of Breakage**:
  - The UI editor surface is non-functional or in transition during Phase 3.2 and 3.3.
  - The 41 editor/overlay Playwright tests will fail if run against the transitional UI.
- **Scope of Protection**:
  - The core language, compiler, evaluator, libraries, and CLI (`scripts/run_doc.ts`) remain 100% functional.
  - The 807 core tests and 24 document state tests continue to pass throughout the entire migration.

### 4. Plan for Containing Breakage

1. **Parallel Implementation**:
   Develop the block editor in `src/document/block_editor.ts` without modifying `src/document/editor.ts`.
2. **Side-by-Side Verification**:
   Verify `block_editor.ts` using isolated component tests (`src/tests/block_editor.test.ts`) before touching the production entry point.
3. **Atomic Cutover**:
   Switch `index.html` to instantiate `BlockEditor` only after block navigation, inline editing, and figure rendering are verified.
4. **Legacy Deletion**:
   Delete `src/document/editor.ts` and update the 41 integration tests in a single dedicated commit.

---

## G. What Is Not Known

The following items cannot be settled by analysis alone and require empirical prototyping:

1. **WebGL Context Exhaustion at Scale**:
   Desktop browsers enforce a hard ceiling of 16 to 32 active WebGL contexts per tab. A long mathematical document may contain 40 or more embedded 3D figures.
   - *Unknown*: Whether offscreen figures must be torn down and replaced with static 2D canvas snapshots when scrolled out of view, or whether a single shared background WebGL context can service all in-flow viewports using scissor rectangles (`gl.scissor`).
2. **Heterogeneous Selection and Clipboard Serialization**:
   When a user drags a selection across a paragraph, a display equation, and an embedded figure:
   - *Unknown*: How the browser's native DOM selection represents this span, and what text is placed on the clipboard. Copying must produce clean, valid `.ax` plain text without HTML garbage or missing delimiters.
3. **Undo/Redo History Granularity across Block Boundaries**:
   Browser-native undo stacks operate per editable element.
   - *Unknown*: Whether document-level operations (splitting an equation block into two, deleting a figure block, merging paragraphs) can integrate with local keystroke undo history without a custom transaction-based undo/redo manager.
4. **Cumulative Layout Shift (CLS) on Math Font Hydration**:
   KaTeX fonts load asynchronously.
   - *Unknown*: In a document with several hundred equations, whether typesetting during initial render causes cumulative layout shifts that throw off scroll position restoration when opening large files.
5. **IME Composition across Active Block Boundaries**:
   International Input Method Editors (CJK composition) require uninterrupted text nodes.
   - *Unknown*: Whether transitioning an equation block from typeset display to active text editing during composition interrupts active IME composition buffers.
