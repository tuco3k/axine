# IDE Cohesion Audit

Audited commit: `b17189c` (started on `b395d28`; every finding below was re-run on `b17189c`).
`npm run build` passes. `vitest`: 929 of 929 tests pass.

Method: the dev server was driven in headless Chromium (Playwright 1.62) at 1400×900 with real keyboard and mouse events. Screenshots were read after each step. Document text was read back from the running page, not from source. Engine behaviour was checked separately by running `processDocumentLines` over the `.ax` files in Node. No code was changed.

Status key:

- **WORKS**: implemented and seen working in the browser.
- **PARTIAL**: works for the named cases and fails for the others.
- **CLAIMED**: a commit reports it done, and it does not work.
- **DEAD**: code exists, nothing reaches it.

---

## A. What is actually implemented

### A1. Block document editor

| Feature | Status | Evidence |
|---|---|---|
| Launch → welcome screen → New Document | WORKS | Logo, recent workspaces, Open Folder / Open File / New Document all render and respond. |
| Typing prose and `# ` headings | WORKS | Heading and paragraph blocks form while typing. |
| Click any block to edit (ce23821 "single-click editing everywhere") | PARTIAL | Keys pressed less than 100 ms after clicking an equation go to the previously focused block. Clicking `:p = 1` and typing `9` at once produced `Prose.9`. At a 100 ms delay or more the key lands in the equation. |
| Keystrokes around reclassification | PARTIAL | At 20 ms per key, 12 of 15 typed equation lines lost the character right after `=` (`y = 2 * x + 5` → `y= * x+5`), when the paragraph textarea is swapped for a MathLive field. At 30 ms or more: 0 of 15. |
| Enter | PARTIAL | At the end of a block it moves to or creates the next block. With the caret mid-paragraph it does not split: the text is unchanged and the caret moves to the next block. `paragraph_block.ts:329` never reads the caret position. |
| Arrow keys between blocks | PARTIAL | ArrowDown from a paragraph into `:a = 1` put the caret at offset 0, so typing produced `X:a=1`. |
| Select all + copy | WORKS | The clipboard holds the full document text. |
| Multi-line paste (61d3163) | PARTIAL | The pasted lines arrive, but a blank line is also inserted between every pair of existing blocks elsewhere in the document (5 lines became 9 plus the paste). |
| Undo | PARTIAL | Only the browser's native undo inside a single field. There is no document-level undo, so ⌘Z after a multi-line paste does nothing. |
| Large documents | WORKS | 1,950 lines / 1,273 blocks: `setText` takes 32 ms; input event to next frame is about 8 ms (synthetic input events). |
| Raw Editor toggle | PARTIAL | Text round-trips both ways. The line-number gutter shows `1` for an 8-line document. Edits in raw mode do not mark the tab dirty. |

### A2. Block types and reclassification

| Feature | Status | Evidence |
|---|---|---|
| paragraph → heading (`# `) and paragraph → equation (`x = …`) | WORKS | |
| paragraph → figure while typing (0943dc5, ce23821 "caret preservation") | CLAIMED | Typing `\figure(:c, width: 400)` gives `:c, width: 400)\figure`. When `\figure` completes, the block becomes a figure, the caret resets to 0 and the `(` is dropped. |
| paragraph → slot while typing `\table(2, 2){1, 2; 3, 4}` | PARTIAL | Reclassifies on `\table`; the rest of the typed text lands in cell 0 and renders as `(2, 2){1, 2 3, 4}`. Entering through autocomplete (A5) works. |
| Bare expressions and commands | PARTIAL | Across `documents/`, 422 lines that the engine evaluates are displayed as prose. These include 186 function calls such as `:f(3)`, 59 `\import`, 27 `\export`, 26 `\module` and 53 bare identifiers. Consecutive lines merge into one prose paragraph, so `\import "lib/abs.ax"` appears as the tail of a sentence in `three_page_lab_report.ax`. |
| `derivation` block type | DEAD | Present in `BlockType` (`block_model.ts`). `block_editor.ts:98 createBlockComponent` has no branch for it, so it renders as a paragraph. The core evaluates `\derive { x + 1 = 3 }` as a free variable `derive` times a space. |
| Block line numbers | PARTIAL | In 275 of the 1,561 blocks parsed from `documents/`, `startLine` does not point at the block's own first line. Frontmatter throws the count off. |

### A3. Equation editing (MathLive) and math display

| Feature | Status | Evidence |
|---|---|---|
| Opening an equation leaves the source unchanged (c1e25cd "lossless Axine ↔ LaTeX bridge", 69a3d93, 19f770b) | CLAIMED | Clicking an equation and pressing Escape, with no edits, rewrites the line: `y = 2 * x + 5` → `y=2 * x+5`, `:y_pos` → `:y_{p}os`, `:rev_step` → `:rev_{s}tep`, `d//d:time :x` → `d//d:time:x`, `\unit :newton` → `\unit:newton`, `\else :f(…)` → `\else:f(…)`. Five corpus documents were loaded and every equation clicked once. All five went from 0 errors to failing: `three_page_lab_report` 6, `pendulum` 1, `derivation_export_demo` 1, `homework09_structural_induction` 24, `physics` 1. In `physics.ax`, clicking 11 equations changed 44 lines. |
| Static equation display matches the source | CLAIMED | `core/math_typeset.ts` (`renderMathShapedLine`, line 750) tokenizes source with regexes and drops grouping parentheses: `(a + b) * c` shows as a + b · c, `a * (b + c)` as a · b + c, `x / (y + 1)` as x (y + 1). In the lab report, `0.5 * ((1 + h^2)^50 - 1) * 0.05` shows as 0.5 · (1 + h²)⁵⁰ − 1 · 0.05, and `-(k / :m_spring)` loses its division. The page shows different mathematics than the engine computes. |
| Underscore identifiers | PARTIAL | `:y_at_2` renders with "at2" as a subscript; `:KE_2` and `:vx_at_2` render with a literal underscore. |
| `d//d:time :x` | PARTIAL | Typeset with `:x` inside the denominator: d over "d:time :x". |
| Autocomplete inside an equation | PARTIAL | The app's popover does not appear. MathLive's own LaTeX list shows instead (`\fontshape`, `\footnotesize`), in MathLive's blue. Escape committed `\fo` as `\forall`, contradicting LANGUAGE.md's "incomplete commands stay literal". |
| Math fonts | PARTIAL | MathLive logs "The math fonts could not be loaded" 21 times, in both `vite` dev and `vite preview` of `dist/`. `MathfieldElement.fontsDirectory` is never set. |

### A4. Slot commands (`\table`, `\cases`)

| Feature | Status | Evidence |
|---|---|---|
| Scaffold via autocomplete, Tab through cells, Escape to render | WORKS | 2×2 table and a two-branch `\cases` render with a brace. |
| Evaluation (3d1d568 "slot mechanism with table and cases") | CLAIMED | The core has no `\table`, `\cases` or `\figure`. The text the IDE writes (`\table(2, 2) {\n 1, 2;\n 3, 4\n}`) throws `Unexpected token ','`. The error appears only in the Results tab, never in the document. `documents/language_reference.ax` documents a third syntax, `\cases { \when c: a, …, \otherwise: b }`, which also throws. |

### A5. Autocomplete

| Feature | Status | Evidence |
|---|---|---|
| Popover on `\` in prose, Tab or Enter accepts | WORKS | |
| Catalog agrees with the language | PARTIAL | 40 of 79 entries in `document/autocomplete.ts` are not core commands: every "data structure" entry (`\matrix \list \tuple \struct \dict \vector \series \tree \trajectory \space \figure \derive \form`), the Greek letters, and `\sqrt \pm \approx …`. The tokenizer (`tokenizer.ts:571`) accepts any `\word` as a free variable, so accepting these gives a 1D space, not an error. `\sqrt(4)` → `Function 'sqrt' is not defined`. |
| Ranking | PARTIAL | `\fig` lists `\figure`, then `\Sigma`, `\sigma`, `\infty`, `\rceil`, `\rfloor`, `\lambda`. |

### A6. In-flow figures

| Feature | Status | Evidence |
|---|---|---|
| Figure renders a plot in the document (d213004, d6859b2) | CLAIMED | Every figure block renders a header and an empty box: in new documents, `three_page_lab_report.ax` and `pendulum.ax`. The block editor never receives evaluation results, and `block.result` is assigned nowhere in `src/`. `figure_block.ts:101 mountViewport` only builds a viewport when `block.result` exists. |
| Status badge | CLAIMED | The badge shows `block.status`: `verified` by default, then `stale` or `unknown` from regex symbol tracking in `block_state.ts` (line 114), not from evaluation. An empty figure displays VERIFIED; DESIGN.md §3 defines verified as proven and checked. |
| "Where it came from" | WORKS | Selects the defining block. The label is the first `:symbol` a regex finds in the figure source. |

### A7. Spaces and sampler (Results view)

| Feature | Status | Evidence |
|---|---|---|
| 1D / 2D / 3D rendering | WORKS | Number line, curves, 3D mesh. |
| Axis scaling | PARTIAL | `x^2 + y^2 = 4` draws as a flat ellipse about 6:1; axes are never equally scaled. |
| 3D navigation | WORKS | Drag, WASD and wheel change the view. The mesh shading shows zig-zag triangle artifacts. |
| Slicing above 3D (LANGUAGE.md "rendering the intersecting level-set cross-section in real time") | CLAIMED | For `{\axis x, y, z, w; x^2+y^2+z^2+w^2 = 4}` the z and w sliders move and update their labels, but the geometry never changes: at z = 6.40 the radius-2 circle is still drawn. `space_viewport.ts:1574` reuses `entity.cachedContours` from the first render and nothing invalidates it. |

### A8. Panes and tabs

| Feature | Status | Evidence |
|---|---|---|
| Split (⌘\\), tabs, Open as Tab, Pin, Expand, theme toggle | WORKS | |
| Two documents visible at once | PARTIAL | With `untitled.ax` and `b.ax` split side by side, only the active session renders; the other pane is empty. |
| Two Results views | PARTIAL | Opening a second Results view blanks the first. |
| File → New file | CLAIMED | Creates a session with no tab; the pane goes blank and the Run button stays on "Stop". |
| View → New document (.ax) | CLAIMED | Adds a second `untitled.ax` tab with zero blocks, so there is nowhere to type. Two sessions share the name. |
| Run / Stop, Budget dropdown | PARTIAL | The engine honours the budget: `:f(30)` returns 1346269 in about 2.2 s and Stop terminates. The button reads "Run" and the badge "Ready" while an invoked run is in progress. |
| Scope / Trace / Frames | PARTIAL | Trace shows duration, line count and status. Scope shows `k — space` for `:k = 2`. Frames lists `#0 space / space` with no content. |
| Closing the last dirty tab | PARTIAL | Nothing happens and no prompt appears. |

### A9. File tree and workspaces

| Feature | Status | Evidence |
|---|---|---|
| Virtual workspace, Files tab, New file → new tab | WORKS | |
| Open Folder / Open File | WORKS (stubbed picker) | With in-memory `showDirectoryPicker` and `showOpenFilePicker` stubs: the folder opens, `\import "lib/trig.ax"` resolves from it, ⌘S writes to the handle, and Open File adds a tab with the file's contents. The native pickers were not driven. |
| Close Workspace → welcome with recents | WORKS | |
| Rename / Delete in the tree | not exercised | See E. |

### A10. Import and export

| Feature | Status | Evidence |
|---|---|---|
| `\import` in a document | WORKS | Virtual `lib/` and folder-relative paths. |
| Export HTML | PARTIAL | The file downloads, but: plots are empty (circle missing, 1D point missing); the `:title:` frontmatter is ignored and the title reads "untitled"; the prose line `Some prose with $x^2$ inline.` is evaluated as math and shows `Expected property identifier after '.'`; `\table` appears raw with an error; `{\axis x, y; …}` renders as `{axis x, y x² …}`. |
| Export Markdown | PARTIAL | Same misclassified prose. It links `plots/space_L6.svg` and `plots/space_L8.svg`, which are not produced. |
| Print / PDF | PARTIAL | `window.print` fires. The print view repeats the heading as title and as prose, shows an empty 2D plot, and typesets `{axis x, y y = x²}`. |

### A11. Persistence

| Feature | Status | Evidence |
|---|---|---|
| ⌘S in a virtual workspace, then reload | WORKS | The content returns. |
| Unsaved edits, then reload | CLAIMED | The document reopens empty. Autosave writes `axine_autosave_untitled.ax` (`file_manager.ts:90`), but workspace load reads `axine_virtual_ws_<id>`, which still holds `""`. The autosave key is the file name only, so every workspace's `untitled.ax` shares one key. In 1 of 4 runs no autosave key was written within 3 s. `beforeunload` does warn. |
| Tabs after reload | PARTIAL | The layout is restored from `axine_layout_<ws>`, but the `b.ax` tab came back titled `untitled.ax` with empty content. |

### A12. Inspection panel

| Feature | Status | Evidence |
|---|---|---|
| Capture, then Enter or Shift+click, opens the panel | WORKS | |
| "Where it came from" (f32c9a1 "3-layer spatial inspection") | CLAIMED | Reports `Line 1` for relations on document lines 2 and 3; the number counts within the space block. Clicking it from a Space tab changes nothing on screen. |
| "How it got here" | CLAIMED | `spatial_inspector.ts:283 generateReductionTrace` checks whether the source contains the string `sqrt`, then runs Newton's method in JavaScript on the clicked x coordinate, using `Math.sqrt` for the converged value (line 336: "Simulate Newton-Raphson iteration sequence"). It labels this `:sqrt(x) via Newton-Raphson Search (lib/newton.ax)`. `lib/sqrt.ax` actually tries a perfect-square path first and then runs at least 5 Newton steps. The panel shows a trace that did not happen. A raw `\rightarrow` leaks into the text. |

### A13. Packaged browser verification

| Feature | Status | Evidence |
|---|---|---|
| `npm run test:browser` | DEAD | `scripts/browser_verify.mjs` goes to `localhost:5173` (`vite.config.ts` uses 3000) and waits for `#corpus-select`, which no longer exists. Pointed at a running server, it times out after 30 s. |

---

## B. Where cohesion breaks

**B1. Document text lives in six places.** These are:

- the hidden `#doc-textarea`, which stays the source of truth for save, export and autosave even in block mode (`editor.ts:766 getText`, `:872 saveDocument`, `:1061 exportHtml`, `:1129 scheduleAutosave`);
- the `BlockState` model;
- `DocumentState.lines`, which the evaluator reads;
- `session.savedContent`;
- `workspace.files`;
- the autosave key.

`DocumentEditor.setText` (`editor.ts:753`) updates the textarea and the evaluator but not the blocks: the page kept showing the old document while a different one was evaluated. "Copy document" reads the block editor (`editor.ts:1770`); Save reads the textarea.

**B2. Two classifiers, and the display one is copied four times.** `core/classifier.ts` decides what is evaluated (MATH / DEFINITION / PROSE / INCOMPLETE / ERROR). `block_model.classifyBlockType` (`block_model.ts:48`) decides what is displayed. Its rules are repeated inline in `parseAxDocument` (`block_model.ts:182`, `:239`), in the paragraph Enter handler (`paragraph_block.ts:329`) and in the figure block's revert check. They disagree on 476 non-blank lines in `documents/`: 422 evaluated but shown as prose, 54 shown as equations but not evaluated. Commit `b17189c` had to add `\axis` in four places.

**B3. Evaluation results and blocks never meet.** Results are indexed by line in `DocumentState`; blocks carry their own `result`, `status` and `error` fields, which nothing fills from evaluation. `block_state.ts` computes its own "stale" and "error" states from regex symbol matching. Block line numbers are wrong for 18% of corpus blocks, so the two could not be joined by line even if something tried.

**B4. One set of view fields, many panes.** `DocumentEditor` holds a single `blockEditor` (`editor.ts:155`), `textarea`, `overlayEl`, `caretEl`, `gutterEl` (`:131`) and `lineNumbersEl`. `renderEditorOnly` (`:3629`) and `renderResultsOnly` (`:3820`, which reassigns `this.gutterEl` at `:3833`) point those fields at whichever view rendered last. A second document pane stays empty and a second Results view goes blank.

**B5. Four math renderers:**

- `core/typesetMath`: regex-based, used for static equations, results and the inspector;
- MathLive, while editing;
- `typesetSourceLine`, in the exporter and print;
- `formatter.formatAST`, which is AST-based and used in inspector traces.

The same equation looks different idle, while editing and when exported. Only the formatter works from the parser's AST.

**B6. Three samplers:**

- `core/sampler.populateSpaceGeometry`, called four times in `evaluator.ts`;
- `SpaceViewport`, which re-samples at 160 or 200 and writes `entity.cachedContours` and `cachedMesh` back onto the value;
- `exporter.ts`, with its own `sample2D`, `sample3D` and `sampleSlice` calls.

The inspector reads whichever cache is present. Because the cache sits on the value object, views that share a value share one slice.

**B7. Two frontmatter parsers, and neither reads the documented syntax.** `block_model.ts:134` and `exporter.ts:15` both split at the first colon, so `:title: X` yields an empty key and is dropped. LANGUAGE.md documents `:title:`; 5 corpus documents use it and none use `title:`. `export.test.ts` passes because it uses `title:`.

**B8. Two editors and a spec for the other one.** The block editor is the default. The textarea-overlay "Raw Editor" is what SPEC.md Phase 5 requires as "Overlay Architecture ONLY (NOT contenteditable)". AGENTS.md says to read SPEC.md before any phase, so the normative spec describes the editor that is not the default.

**B9. Four ways to create a document; two work.** Welcome → New Document and Files → New file work. File → New file and View → New document leave an empty pane.

**B10. Four persistence stores:**

- `FileManager` autosave, keyed by file name;
- `WorkspaceManager` virtual workspaces;
- the `PaneContainer` layout, per workspace;
- `notebook/storage.ts`, which is dead.

localStorage keys use three prefixes: `axine_*`, `doc_*`, and `math_notebook_*`. The theme key, `math_notebook_theme` (`editor.ts:1794`), is named after the removed notebook app.

**B11. A removed UI still built and run on every load.** `buildUI` (`editor.ts:1184`) builds the old work panel at `:1308`: Results / Scope / Trace & Fuel / Frames tabs, a dock menu and a splitter. `initPaneContainer` (`:3447`) then replaces the contents of `#doc-workspace`; none of those elements exist on the page afterwards. The dock code (`loadDockLayout :430`, `applyDockLayout :494`, `cycleDockEdge`, `togglePanelCollapse`, ⌘B, ⌘⇧D) still runs, writes `doc_dock_layout` and sets `data-dock`, with no visible effect. The dead template hard-codes the status string "Continuous Ambient Reactive" (`:1372`), which AGENTS.md prohibits.

**B12. The autocomplete catalog is independent of the language.** See A5. Nothing derives the list from the parser, and the tokenizer does not reject unknown commands, so a wrong entry never surfaces as an error.

**B13. What `src/core` knows about the editor.** Nothing in `src/core` touches the DOM or imports MathLive, and a test enforces the MathLive rule. Presentation and document concerns have moved into core, though:

- `core/math_typeset.ts` emits HTML with `tm-*` class names styled only by `src/styles/main.css` (46 selectors).
- `core/worker.ts` (`processDocumentLines`, line 66) is the IDE's document protocol: it skips frontmatter, treats lines starting with `#` as prose, and sanitizes values for `postMessage`.
- `core/classifier.ts` defines PROSE and INCOMPLETE line states, which are document concepts.
- `SpaceValue` carries `cachedContours` and `cachedMesh`, which the viewport writes.

**B14. Layering inversion.** `exporter.ts:5` imports `formatValue` from `editor.ts`, so exporting pulls in the whole editor and MathLive, and the exporter cannot load in Node.

**B15. Naming and error-handling drift.**

- The live pane system lives in `src/notebook/`, beside the dead notebook app.
- CSS uses at least six prefixes: `doc-`, `pane-`, `axine-`, `space-`, `spatial-`, `tm-`.
- Empty `catch {}` blocks: 8 in `src/document`, 3 in `src/notebook`, 1 in `src/plot`, 26 in `src/core` (22 of them in `evaluator.ts`).
- `initPaneContainer` logs "SUCCESS" to the console.

**B16. Docs, IDE and core disagree.**

- LANGUAGE.md says `:=` does not exist. The core accepts it (`x := 5` evaluates), and the Raw Editor placeholder suggests `x := 5` (`editor.ts:1296`, `:3674`).
- LANGUAGE.md says equations edit on double-click. Editing has been single-click since ce23821, yet `equation_block.test.ts` is still titled "edits on double-click".
- `:q = 4` evaluates to a 1D space. LANGUAGE.md shows both `:r = 5 => 1D Space (r)` and `:speed = 100 => 100`, and Scope displays "space".

---

## C. What was never finished

**Commands declared but not implemented.** `\figure`, `\table`, `\cases` (two documented syntaxes) and `\derive` appear in the LANGUAGE.md command table, in autocomplete and as IDE block types, and the core parses none of them. 40 autocomplete entries have no core meaning.

**Features started and not completed:**

- In-flow figures: the component exists but is never given a result (A6).
- The derivation block type (A2).
- Slicing above 3D: sliders with no re-sampling (A7).
- Inspector layers 2 and 3: wrong line and a simulated trace (A12).
- Per-block semantic state (verified / unknown / error / stale, DESIGN.md §3), which is never driven by evaluation.
- Document-level undo.
- SPEC.md Phase 6 (sub-expression folding chips) is absent.
- SPEC.md Phase 7.1 (identifier popovers) was built as the "explainer" (65949ae) and deleted (63b9d4e); SPEC.md still requires it. Phase 7.2 (Pin) works.

**Dead code:**

- `src/notebook/app.ts`, `cell.ts`, `state.ts`, `storage.ts` and `autocomplete.ts`: 811 lines imported by nothing, tests included.
- `src/plot/engine.ts`: a re-export shim nobody imports.
- `src/core/numeric/float.ts`.
- `src/document/corpus_data.ts`: imported only by 3 tests.
- The work panel and dock code (B11).
- `SpaceViewport.setFixedCoords` and `toSVG`: no callers.

**Tests that assert less than their names claim:**

- `axine_latex_bridge.test.ts`, "Axine <-> LaTeX Lossless Bridge" and "Corpus-wide equation round-trip validation": runs `latexToAxine(axineToLatex(s))` in Node. It never passes through MathLive's serialization, which is where the rewrite in A3 happens. `axineToLatex` returns most Axine unchanged, so MathLive receives Axine as LaTeX.
- `equation_block.test.ts`, "…edits on double-click, and commits on Escape": sets the field value in code and uses `x^2 + y^2 = 4`, which contains no `:`, `_` or `\`, so the rewrite never triggers.
- `block_reclassification.test.ts`, "dynamically reclassifies typed commands": assigns `textarea.value = "\\table"` in one step and fires one `input` event. The per-keystroke path, where the caret resets and keys drop, is never exercised.
- `figure_block.test.ts`, "Atomic In-Flow Figure Block Component": builds a block by hand with `status: "verified"` and no result, and never asserts that a plot renders. This is how the gate passes while every real figure is empty.
- `export.test.ts`: asserts that `<svg` and `export-plot-container` are present, not that geometry is drawn. It uses `title:`, not the documented `:title:`.

**TODOs.** None in `src/`. Unfinished work is not marked in the code.

**`documents/`.** In the engine, 49 of 51 `.ax` files run with zero errors. `language_examples_combined.ax` and `language_reference.ax` each report 3 errors, all from "common mistake" and syntax-template lines left as live code (`omega_d = 5`, `\forall <arg1>, <arg2>, …`). In the IDE:

- every figure renders empty;
- no frontmatter title is shown;
- clicking through equations breaks 5 of the 5 documents tested (A3).

**`scripts/`.** There are 82 scripts:

- 59 hard-code `/Users/…` or `~/.gemini/…` paths;
- 41 target the textarea-overlay DOM;
- 10 target the removed work panel;
- the one wired into `package.json` is dead (A13).

---

## D. The three worst problems

### D1. The equation surface does not preserve the file

**What it is.** Opening an equation and closing it rewrites the source (A3), and 5 of 5 working documents stop evaluating after their equations are clicked. When not being edited, equations are drawn by a regex typesetter that drops parentheses, so the page shows different mathematics than the engine computes. Idle and editing views come from two different renderers.

**Why it matters.** AGENTS.md: "The file is complete… The IDE is one interpretation. The file is the truth." At present the IDE changes the file by looking at it and shows math that differs from what it computes. Every other document feature sits on top of this surface. It also explains the reported pattern of "working" fixes that fail in practice: the tests round-trip in Node with inputs that avoid `:`, `_` and `\`.

**Rough cost.** Medium to large.

- The smaller route: stop writing MathLive's serialization back to the file. Keep the file text as what the user edits, with MathLive or a typeset preview as display only. Generate the display from the parser's AST (`formatter.ts` already walks it), which also retires the regex typesetter.
- The larger route: a real Axine ↔ MathLive grammar with escaping for `_`, `:`, `\` commands and spacing.

Either way, the missing test is a browser round-trip over every line in `documents/`: open, Escape, compare bytes.

### D2. The displayed document and the evaluated document are two models that never meet

**What it is.** The block model has its own regex classifier (copied four times), its own line numbers (wrong for 18% of blocks) and its own regex-derived status. The evaluator has a separate classifier and line-indexed results. Nothing connects them (B2, B3). Consequences:

- figures are always empty and wear a VERIFIED badge they did not earn;
- prose is evaluated as math in exports;
- 422 computing lines display as prose;
- results appear only in a separate Results tab, one line at a time, never beside the equation that produced them.

**Why it matters.** The product's premise is computation inside a document. Today the document and the computation are two parallel views of the text, and each new block feature has to guess what the evaluator will do.

**Rough cost.** Medium. Use one classification pass, the core's, to produce both evaluation units and block boundaries with correct line ranges. Attach each result to its block by that range, and drive figure mounting and the status badge from it. Delete `block_state`'s regex dependency tracking and the four copies of `classifyBlockType`. The figure and status components already exist and only need data.

### D3. `DocumentEditor` is one object with one set of views inside a multi-pane shell

**What it is.** `editor.ts` is 3,953 lines. It holds one textarea (still the source of truth in block mode), one block editor, one results gutter and one set of caret and overlay fields. The pane system renders N views into those fields (B4). It also builds and discards the old work panel and dock on every load (B11). There are four ways to create a document, two of them broken (B9), and four persistence stores that lose unsaved work on reload (B10, A11).

**Why it matters.** Any feature involving more than one view half-works: a second document pane is blank, a second Results view blanks the first, and the Run button shows the wrong state. Which bug appears depends on which view rendered last. New features land in the same file and inherit all of this.

**Rough cost.** Large.

- Give each open document a model owned by its session: text, records, and dirty and saved state.
- Make each pane view a subscriber that owns its own DOM.
- Remove the hidden textarea as the source of truth; make the Raw Editor a view over the same model, or remove it.
- Delete the work-panel and dock code and `src/notebook/{app,cell,state,storage,autocomplete}.ts`.
- Choose one persistence path: autosave writes to the workspace file.

Deletions come first and are cheap; the model split is the expensive part.

Close behind these three: the inspector's simulated trace (A12) is a small fix but violates the honesty rules directly, and the language/IDE command mismatch (`\table`, `\cases`, `\figure`, `\derive`, the autocomplete catalog) needs a decision before either side changes.

---

## E. What I do not know

- **Native file pickers.** Open Folder and Open File were tested with in-memory stubs of `showDirectoryPicker` and `showOpenFilePicker`. Real permission prompts, handle persistence across reloads, and writes to disk are unverified.
- **Browser coverage.** Only headless Chromium on macOS at 1400×900. Not tested: Safari, Firefox, HiDPI, trackpad gestures, IME, non-US keyboard layouts.
- **Timing.** Typing-speed thresholds (the reclassification loss at about 20 ms per key, the focus race under 100 ms) were measured with synthetic key events at fixed intervals. Real typing arrives in bursts; how often users hit these windows is not measured. The latency figures in A1 use synthetic `input` events, not physical keys.
- **Not exercised:**
  - file-tree Rename and Delete, drag-and-drop between panes, splitter resizing;
  - the Recent files menu, Save As, the Copy document button;
  - light theme beyond one screenshot;
  - the 1D and 3D inspector, keyboard reticle navigation;
  - `plot/animation_player.ts`, trajectory and ODE rendering;
  - backward delete across blocks (b395d28).
- **MathLive fonts.** Whether the failed font load visibly changes glyphs: fields rendered with fallback fonts, and I did not compare them against correctly loaded fonts.
- **Why autosave missed once in four runs.** I did not trace it.
- **The 26 empty `catch` blocks in `src/core`.** These are language-side and were not investigated.
- **Language-side questions I observed but did not adjudicate:**
  - `:x = 5` evaluating to a 1D space rather than 5;
  - `:=` being accepted although LANGUAGE.md says it does not exist;
  - unknown `\word` being accepted as a variable;
  - the two `\cases` syntaxes.

  I don't know which is intended; the language owner decides before the IDE aligns.
- **CLAIMED is based on the commit messages cited.** I did not read every commit's diff, and later commits may have partly addressed a claim before the regressions I observed.
- **`dist/` is committed.** I did not check whether it matches a fresh build or what is deployed.
- **Scope of `b17189c`.** It landed during the audit and changes the parser, evaluator, LaTeX bridge and viewport. All findings above were re-run on it. I did not audit the new derivative and arbitrary-axis features themselves, beyond noting that `d//d:time:x` (what the MathLive rewrite produces) now fails to parse, which is why `pendulum.ax` newly breaks under D1.
