# Axine — Phase Specifications (Phases 5 – 7)

This document contains the specifications for the frontend and interaction phases of Axine.

---

## Phase 5: Live Typeset Input (Overlay Architecture)

### 5.1 Architectural Requirement
- **Overlay Architecture ONLY** (NOT `contenteditable`).
- A transparent, synchronized `<textarea>` sits directly above a live typeset backdrop element (`.doc-typeset-overlay` / `.doc-typeset-line`).
- The `<textarea>` handles native keyboard events, IME, copy/paste, undo/redo history, selection ranges, and caret motion.
- The backdrop layer renders syntax-highlighted, typeset math in exact pixel registration with the transparent input text.

### 5.2 Typesetting Features
- **Superscripts**: `x^2`, `x^n`, or `x²` rendered with raised typography and reduced font scale.
- **Fractions**: Stacked fraction rendering for `a // b` with exact horizontal bar alignment and proportional vertical offsets.
- **Glyphs**: Live visual rendering of mathematical symbols (`π`, `τ`, `√`, `≤`, `≥`, `≠`, `∫`, `Σ`, `∂`).
- **Operators & Spacing**: TeXbook-compliant math spacing around relations (`=`, `<`), binary operators (`+`, `-`), and implicit multiplication.

### 5.3 Acceptance Criteria & Alignment Gate
- **1px Caret Alignment**: The caret position in the `<textarea>` must align within 1px horizontally and vertically with the typeset glyphs at every character offset across the line.
- **Height & Spacing Metric**: Monospace or precise proportional metrics with matched `line-height`, `letter-spacing`, `padding`, `border`, and `font-size`.
- **Caret Fallback**: If caret-at-superscript-height proves unreliable across variable browser zoom/DPI, adopt the documented fallback: full-height caret with text still raised.
- **Targeted Edits**: Use targeted edits on `src/document/editor.ts` and `src/styles/main.css` to avoid breaking existing editor and panel resize logic.

---

## Phase 6: Depth Collapse & Nested Structure Folding

### 6.1 Sub-expression Folding
- Expressions with AST depth $> 2$ or nested sub-terms (e.g. large rational terms, polynomials, blocks) support interactive visual collapse into a compact chip (`⋯` / `[expr]`).
- Hovering over a collapsed chip previews the full expansion; clicking or pressing hotkey expands/collapses.

### 6.2 Editor Gutter & Block Folding
- Multi-line `{ ... }` scope blocks and multi-step derivations in the editor provide folding carets in the gutter.
- State persists across re-evaluation runs without resetting fold state.

---

## Phase 7: Click-to-Open Popovers & Pinning

### 7.1 Inline Click-to-Open Popovers
- Clicking an identifier or derivation step opens an anchored lightweight popover displaying:
  - Full variable type, provenance, and exact rational value.
  - Step justification, transformation rule, side condition, and branch paths.
- Esc or clicking outside closes the popover.

### 7.2 Panel Pinning Control
- Right-hand Visual and Result panels support an explicit `Pin` toggle (`isPinned`).
- When pinned, editing other lines or moving the cursor does not overwrite the active panel view.
- When unpinned, the panel follows the active cursor line dynamically.
