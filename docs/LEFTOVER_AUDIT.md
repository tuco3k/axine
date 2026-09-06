# Axine Architecture & Syntax Audit: Complete Inventory of Legacy Leftovers

> **Audit Date**: 2026-09-06  
> **Status**: Comprehensive Repository Audit (No Code Modifications)  
> **Scope**: Codebase audit across `src/`, `documents/`, `src/tests/`, and `docs/` against the Pure Relational Specification ([AGENTS.md](../AGENTS.md), [docs/SYNTAX_V2.md](./SYNTAX_V2.md)).

---

## 1. What Does `:=` Do Right Now?

### Exact Behavioral Trace for `x := 5`
When `x := 5` is entered in the editor or evaluated via `evaluate('x := 5')`:
1. **Tokenizer** (`src/core/tokenizer.ts` L812):
   - Scans `x` as `IDENTIFIER('x')`.
   - Scans `:=` as `ASSIGN(':=')`.
   - Scans `5` as `NUMBER('5')`.
2. **Parser** (`src/core/parser.ts` L592–608):
   - `parseStatement()` matches `token.type === 'IDENTIFIER' && peek(1).type === 'ASSIGN'`.
   - It **silently accepts** the definition and constructs an `AssignmentNode`:
     ```json
     {
       "type": "Assignment",
       "target": "x",
       "value": { "type": "NumberLiteral", "raw": "5" }
     }
     ```
3. **Evaluator** (`src/core/evaluator.ts` L890–905):
   - Dispatches to `case 'Assignment'`, evaluates the right-hand value `5` to rational `5/1`, mutates/binds `currentEnv['x'] = value`, and returns the scalar value `{ type: 'rational', n: 5n, d: 1n }`.
4. **Document Classifier & State** (`src/core/classifier.ts`, `src/document/document_state.ts`):
   - Classifies the line as valid `STATEMENT` / `ASSIGNMENT` (state: `COMPLETE`, not `ERROR`).
5. **Gutter DOM Rendering** (`src/document/editor.ts` L2606–2614):
   - Renders a standard scalar result gutter row with green/normal text:
     ```html
     <div class="doc-gutter-row" data-line="0">
       <div class="doc-gutter-row-header">
         <span class="doc-gutter-lineno">L1</span>
       </div>
       <div class="doc-gutter-content">
         <div class="doc-gutter-result"><span class="doc-result-value"><span class="math-readonly">5</span></span></div>
       </div>
     </div>
     ```

### Root Cause Analysis
- **The Current Truth**: Despite Phase B claims, `:=` was **never removed** from the grammar. The tokenizer (`src/core/tokenizer.ts`), parser (`src/core/parser.ts`), and evaluator (`src/core/evaluator.ts`) all retain active `AssignmentNode`, `GlobalAssignmentNode`, and `ASSIGN` dispatch logic.
- **Why It is a Leftover**: In the V2 Pure Relational Model, there are no imperative assignments or definitions; equality is strictly a mathematical relation (`=`). Leaving `:=` active allows imperative mutation (`x := x + 1`) to leak through and bypass the relational space solver.
- **Verdict**: `:=` must be completely removed from the tokenizer and parser, producing a hard syntax error if encountered.

---

## 2. Full Leftover Sweep: Inventory of Removed Constructs

### Summary of Repo-Wide Occurrences
| Removed Construct | Total Codebase Hits | Primary Locations |
| :--- | :---: | :--- |
| **`:=` (Assignment Operator)** | **342** | `src/core/parser.ts`, `src/core/evaluator.ts`, 18 test files, 15 documents |
| **Bare Keywords (no backslash)** | **308** | Test strings, `corpus_data.ts`, unmigrated docs |
| **`graph(` / `:graph(`** | **36** | `documents/`, `corpus_data.ts`, `layout_dock_visuals.test.ts` |
| **`|` and `|-` Mode Switches** | **0** | Reverted cleanly in Gate 1 (`application_mode.test.ts`) |
| **`none` (as value / bare keyword)** | **86** | `src/core/evaluator.ts`, `src/core/types.ts`, `fuel_kleene.test.ts` |
| **`unknown(` / `:unknown(`** | **48** | `src/core/evaluator.ts`, `corpus_data.ts`, `fuel_kleene.test.ts` |
| **`undefined` as a Value** | **8** | `src/core/types.ts`, `evaluator.ts`, `corpus.test.ts` |
| **`requires-unavailable-theory`** | **52** | `src/core/evaluator.ts`, `corpus_data.ts`, claims test suite |
| **`unimplemented-technique`** | **11** | `src/core/evaluator.ts`, `corpus_data.ts`, `fuel_kleene.test.ts` |
| **`∅` (Empty Set as Value)** | **0** | Evaluates to boolean false / empty space manifold |
| **`simulate(`, `map(`, `iterate(`** | **213** | `documents/`, `corpus_data.ts`, procedural test suites |
| **`record` / `view for`** | **125** | `src/core/parser.ts`, `types.ts`, `linear.ax`, `physics.ax`, `optics.ax` |
| **Builtin References in Core** | **86** | `src/core/` JS Math calls in numeric kernels / string tags |

---

### Detailed File & Line Breakdown

### 2.1 The Assignment Operator (`:=`)
Total hits: **342**
- **`src/core/classifier.ts`** (4 hits):
  - L25: `* Predicate 1: Checks if the line contains an assignment operator ':='`
  - L28: `return line.includes(':=');`
  - L185: `const trailingIncomplete = /(:=|\+|-|\*|\/|%|\^|\(|\[|,|\.\.|in|step|->|if|then|else|and|or|not|=|<|`
  - L343: `// 1. it contains :=`
- **`src/core/evaluator.ts`** (1 hit):
  - L2376: `suggestion: \`Define ${callee}(x) := ... before calling it\`,`
- **`src/core/math_typeset.ts`** (7 hits):
  - L438: `// 2. Top-level Relation operators (=, ==, !=, <=, >=, <, >, :=, ->)`
  - L591: `if (str.startsWith(':=', i)) return { index: i, length: 2, op: ':=' };`
  - L615: `const tokenRegex = /(\s+)|("[^"]*"|'[^']*')|(-?\b\d+\s*\/\s*\d+\b)|(\.\.)|(\b[a-zA-Z]_(?:\{[^}]*\}|\`
  - L711: `* 2. Mathematical statements & definitions: expressions, definitions (:=), formulas,`
  - L732: `const tokenRegex = /(\s+)|("[^"]*"|'[^']*')|(\b(?:import|module|simulate|in|for|dt|as|let|const)\b)|`
  - L748: `const tokenRegex = /(\s+)|("[^"]*"|'[^']*')|(d\/\/d[a-zA-Z][a-zA-Z0-9_]*|\b\u2202\/\/\u2202[a-zA-Z][`
  - ... and 1 more lines
- **`src/core/parser.ts`** (10 hits):
  - L83: `suggestion: 'Type a mathematical formula such as 2 + 2 or f(x) := x^2',`
  - L88: `// Check for Assignment: variable := expr OR FunctionDef: f(x, y) := expr`
  - L222: `// Check for operator (prefix|postfix|infix) <op> (params) := <body>`
  - L431: `// Check for view for <Type> := <viewFunction>`
  - L509: `// Check for f(x, y) = expr OR f(x, y) := expr OR f(x, y) :== expr`
  - L550: `const defOpTok = this.advance(); // consume = or := or :==`
  - ... and 4 more lines
- **`src/core/tokenizer.ts`** (3 hits):
  - L108: `// Global assignment :equiv or :==`
  - L119: `tokens.push(this.makeToken('GLOBAL_ASSIGN', ':==', startPos, startLine, startCol, leadingWhitespace)`
  - L126: `tokens.push(this.makeToken('ASSIGN', ':=', startPos, startLine, startCol, leadingWhitespace));`
- **`src/core/types.ts`** (2 hits):
  - L29: `| 'ASSIGN' // :=`
  - L30: `| 'GLOBAL_ASSIGN' // :\u2261 or :==`
- **`src/document/corpus_data.ts`** (67 hits):
  - L23: `:collatz(n) := \\if n % 2 == 0 \\then n / 2 \\else 3*n + 1`
  - L24: `:orbit27 := :iterate(:collatz, 27, :until: 1, :max: 200)`
  - L46: `:f(r, x) := r * x * (1 - x)`
  - L47: `:orbit := :iterate(x -> :f(3.8, x), 0.5, :n: 100)`
  - L58: `:goldbach(n) := :find(p \\in 2..n, :isprime(p) \\and :isprime(n - p))`
  - L69: `:fib(n) := \\if n <= 1 \\then n \\else :fib(n-1) + :fib(n-2)`
  - ... and 61 more lines
- **`src/document/editor.ts`** (1 hit):
  - L987: `placeholder="Write math expressions, definitions (x := 5), claims, or prose..."`
- **`src/notebook/app.ts`** (2 hits):
  - L34: `{ id: 'c2', source: '# Ambiguity Resolution Rules\nx := 5\n2x' },`
  - L35: `{ id: 'c3', source: 'f(t) := t^2 + 1\nf(x+1)' },`
- **`src/tests/algebra_isolate.test.ts`** (1 hit):
  - L165: `const res = evaluate("{ :f(x) := x^3 - 2*x - 5; :solve(f, :near: 2, :trace: \\true) }", env).value a`
- **`src/tests/claim_honesty_and_control.test.ts`** (1 hit):
  - L196: `const state = new DocumentState('{ :loop(x) := :loop(x + 1); :loop(0) }');`
- **`src/tests/classifier.test.ts`** (11 hits):
  - L16: `it('hasAssignment correctly detects :=', () => {`
  - L17: `expect(hasAssignment('x := 5')).toBe(true);`
  - L18: `expect(hasAssignment('f(x) := x^2')).toBe(true);`
  - L48: `expect(isPrefixOfValidExpression('x := ')).toBe(true);`
  - L52: `expect(isPrefixOfValidExpression('f(x) := ')).toBe(true);`
  - L71: `it('"x := " -> INCOMPLETE', () => {`
  - ... and 5 more lines
- **`src/tests/corpus.test.ts`** (10 hits):
  - L30: `setup: ['x := 5'],`
  - L36: `setup: [':xy := 42'],`
  - L47: `setup: ['x := 3', ':fn(t) := t^2'],`
  - L53: `setup: ['f := 4', 'x := 2'],`
  - L59: `setup: ['a := 12', 'b := 2', 'c := 3'],`
  - L65: `setup: ['x := 0'],`
  - ... and 4 more lines
- **`src/tests/derivation_first_class.test.ts`** (1 hit):
  - L277: `const dVal = eval1.evaluate(parse(":d := :isolate(x^2 - 5*x + 6 = 0, :for: x)"));`
- **`src/tests/disk_imports.test.ts`** (9 hits):
  - L45: `:area_circle(r) := 3.14159 * r^2`
  - L46: `:hypotenuse(a, b) := (a^2 + b^2)^(1/2)`
  - L53: `:c_area := :area_circle(5)`
  - L54: `:h_val := :hypotenuse(3, 4)`
  - L67: `x := 10`
  - L91: `b := :Body(:mass: 2, :position: (0, 0), :velocity: (10, 0))`
  - ... and 3 more lines
- **`src/tests/error_and_import_ux.test.ts`** (1 hit):
  - L44: `':b := :Body(:radius: 0.5, :mass: 1.0, :position: (0, 0), :velocity: (0, 0))'`
- **`src/tests/evaluator.test.ts`** (3 hits):
  - L13: `evaluate('a := 3', env);`
  - L14: `evaluate(':velocity := 10', env);`
  - L21: `evaluate(':f(x) := x^2 + 1', env);`
- **`src/tests/export.test.ts`** (21 hits):
  - L16: `x := 10`
  - L24: `expect(body).toContain('x := 10');`
  - L35: `m := 2.5`
  - L36: `E := (1/2) * m * (10^2)`
  - L69: `{ lineIndex: 7, text: 'm := 2.5', classification: { state: 'COMPLETE' } as any, result: { type: 'rat`
  - L70: `{ lineIndex: 8, text: 'E := (1/2) * m * (10^2)', classification: { state: 'COMPLETE' } as any, resul`
  - ... and 15 more lines
- **`src/tests/extension_gate.test.ts`** (5 hits):
  - L94: `const attrRegex = /([a-zA-Z0-9\-]+)(?:=["']([^"']*)["'])?/g;`
  - L192: `const attrMatches = remaining.matchAll(/\[([a-zA-Z0-9\-_]+)(?:=["']([^"']*)["'])?\]/g);`
  - L421: `evaluate('r := 2', env);`
  - L492: `evaluate('R := 2', env);`
  - L542: `evaluate(':sq(t) := t^2', env);`
- **`src/tests/file_open_save.test.ts`** (9 hits):
  - L100: `const attrRegex = /([a-zA-Z0-9\-]+)(?:=["']([^"']*)["'])?/g;`
  - L276: `const content = '# Homework 3\nx := 42\n';`
  - L293: `const diskContent = '# Original disk content\nx := 1\n';`
  - L294: `const unsavedContent = '# Edited autosaved content\nx := 100\n';`
  - L369: `const saveRes = await FileManager.saveFile('solution.ax', '# New calculation\ny := 99', mockHandle);`
  - L372: `expect(writtenText).toBe('# New calculation\ny := 99');`
  - ... and 3 more lines
- **`src/tests/fuel_kleene.test.ts`** (2 hits):
  - L84: `evaluate(':loop(n) := :loop(n + 1)', env);`
  - L158: `evaluate(":step_pow(n) := \\if n < 16 \\then n * 2 \\else \\none", env);`
- **`src/tests/language_extensions.test.ts`** (15 hits):
  - L34: `evaluate(":fib(n) := \\if n <= 1 \\then n \\else :fib(n-1) + :fib(n-2)", env);`
  - L41: `evaluate(':bad(x) := :bad(x + 1)', env);`
  - L53: `evaluate('L := [10, 20, 30, 40]', env);`
  - L107: `evaluate(":collatz(n) := \\if n % 2 == 0 \\then n / 2 \\else 3*n + 1", env);`
  - L266: `evaluate(':R(t) := :sin(2 * t)', env);`
  - L278: `evaluate(':f(x) := x^3', env);`
  - ... and 9 more lines
- **`src/tests/large_rational_typesetting.test.ts`** (1 hit):
  - L10: `const lines = [':h50 := :sum(1//n, n \\in 1..50)', ':h50'];`
- **`src/tests/layout_dock_visuals.test.ts`** (10 hits):
  - L91: `const attrRegex = /([a-zA-Z0-9\-]+)(?:=["']([^"']*)["'])?/g;`
  - L198: `const attrMatches = remaining.matchAll(/\[([a-zA-Z0-9\-_]+)(?:=["']([^"']*)["'])?\]/g);`
  - L317: `const docText = \`x := 42\ny := x + 8\`;`
  - L336: `editor = new DocumentEditor(container as any, 'f(x) := :sin(x)\n:graph(f(x), x \\in 0..10)');`
  - L373: `editor = new DocumentEditor(container as any, 'a := 5');`
  - L398: `'a := 15',`
  - ... and 4 more lines
- **`src/tests/multi_document.test.ts`** (10 hits):
  - L92: `const attrRegex = /([a-zA-Z0-9\-]+)(?:=["']([^"']*)["'])?/g;`
  - L208: `const attrMatches = remaining.matchAll(/\[([a-zA-Z0-9\-_]+)(?:=["']([^"']*)["'])?\]/g);`
  - L323: `evaluate('x := 42', envA);`
  - L335: `const linesA = ['x := 42', 'x * 2'];`
  - L348: `const editor = new DocumentEditor(container as any, 'a := 10\na * 2');`
  - L356: `const sessB = editor.createSession('doc_b.ax', 'b := 20\nb * 3');`
  - ... and 4 more lines
- **`src/tests/notation_math.test.ts`** (4 hits):
  - L21: `evalVal('x := 2', env);`
  - L55: `evalVal('A := :matrix([[1, 2], [3, 4]])', env);`
  - L78: `evalVal(':A_inv := :inverse(A)', env);`
  - L93: `evalVal('M := :matrix([[1, 2, 3], [2, 4, 6], [0, 1, 1]])', env);`
- **`src/tests/part_a_records.test.ts`** (17 hits):
  - L11: `evaluate(":Particle := \\record { :mass, :position, :velocity }", env);`
  - L12: `const { value: p } = evaluate('p := :Particle(:mass: 2, :position: (0,0,0), :velocity: (1,0,0))', en`
  - L31: `evaluate(":Particle := \\record { :mass, :position, :velocity }", env);`
  - L32: `evaluate('p := :Particle(:mass: 2, :position: (0,0,0), :velocity: (1,0,0))', env);`
  - L50: `evaluate(":Particle := \\record { :mass, :position, :velocity }", env);`
  - L51: `evaluate('p := :Particle(:mass: 2, :position: (0,0,0), :velocity: (1,0,0))', env);`
  - ... and 11 more lines
- **`src/tests/part_a_trajectories.test.ts`** (22 hits):
  - L7: `evaluate(":Body := \\record { :mass, :position, :velocity }", env);`
  - L8: `evaluate(':b0 := :Body(:mass: 1, :position: (0, 0), :velocity: (10, 0))', env);`
  - L9: `evaluate(':b1 := :Body(:mass: 1, :position: (10, 0), :velocity: (10, 0))', env);`
  - L10: `evaluate(':b2 := :Body(:mass: 1, :position: (20, 0), :velocity: (10, 0))', env);`
  - L11: `evaluate(':traj := :Trajectory("Body", 0, 2, [ (0, :b0), (1, :b1), (2, :b2) ])', env);`
  - L26: `evaluate(':p0 := (0, 0)', env);`
  - ... and 16 more lines
- **`src/tests/part_b_simulate_closed_form.test.ts`** (9 hits):
  - L8: `evaluate(":State := \\record { x, y, :vx, :vy }", env);`
  - L11: `evaluate(':proj_step(s, :dt) := :State(x: s.x + s.:vx * :dt, y: s.y + s.:vy * :dt - 0.5 * 9.8 * :dt^`
  - L12: `evaluate(':s0 := :State(x: 0, y: 0, :vx: 10, :vy: 20)', env);`
  - L13: `evaluate(":sim_traj := :simulate(:proj_step, :s0, t \\in 0..4, :dt: 0.05)", env);`
  - L16: `evaluate(':proj_closed(t) := :State(x: 10 * t, y: 20 * t - 0.5 * 9.8 * t^2, :vx: 10, :vy: 20 - 9.8 *`
  - L17: `evaluate(":closed_traj := :closed_form(:proj_closed, t \\in 0..4, :dt: 0.05)", env);`
  - ... and 3 more lines
- **`src/tests/part_b_units.test.ts`** (9 hits):
  - L16: `const { value: d } = evaluate('d := 5 :meter', env);`
  - L29: `evaluate('d := 5 :meter', env);`
  - L30: `evaluate('t := 2 :second', env);`
  - L32: `const { value: speed } = evaluate('v := d / t', env);`
  - L53: `evaluate('d := 5 :meter', env);`
  - L54: `evaluate('t := 2 :second', env);`
  - ... and 3 more lines
- **`src/tests/part_c_ode.test.ts`** (2 hits):
  - L24: `evaluate(":traj1 := :ode(d//dt y = -2 * y, y(0) = 1, t \\in 0..2, :dt: 0.05)", env1);`
  - L48: `evaluate(":traj2 := :ode(d//dt y = -2 * y, y(0) = 1, t \\in 0..2, :dt: 0.025)", env2);`
- **`src/tests/part_c_operators.test.ts`** (4 hits):
  - L11: `const declSource = "\\operator \u229b (a, b) := a * b - b * a \\precedence: 45 \\associativity: :lef`
  - L33: `const exprSource = 'x := 5 \u229b 3';`
  - L54: `const declSource = "\\operator \\prefix \u22c4 (f) := f + 10";`
  - L84: `const declSource = "\\operator \\postfix ° (x) := x * :pi / 180";`
- **`src/tests/part_d_kinds.test.ts`** (2 hits):
  - L31: `"L := \\kind :LieAlgebra(:dim, :field) \\extends :VectorSpace(:dim, :field) { \\operations: [:bracke`
  - L64: `"L := \\kind :LieAlgebra(:dim, :field) \\extends :VectorSpace(:dim, :field) { \\operations: [:bracke`
- **`src/tests/part_d_views_primitives.test.ts`** (9 hits):
  - L158: `const { value: pt } = evaluate('p := :point((1, 2))', env);`
  - L162: `const { value: seg } = evaluate('s := :segment((0, 0), (1, 1))', env);`
  - L166: `const { value: arr } = evaluate('a := :arrow((0, 0), (2, 3))', env);`
  - L170: `const { value: circ } = evaluate('c := :circle((0, 0), 5)', env);`
  - L174: `const { value: poly } = evaluate(':pg := :polygon([(0, 0), (2, 0), (1, 2)])', env);`
  - L178: `const { value: pth } = evaluate(':pt := :path([(0, 0), (1, 1), (2, 4)])', env);`
  - ... and 3 more lines
- **`src/tests/part_f_modules.test.ts`** (7 hits):
  - L17: `:position := (0, 0, 0)`
  - L18: `:velocity := (10, 0, 0)`
  - L19: `:acceleration := (0, -9.8, 0)`
  - L20: `:private_data := 42`
  - L45: `:a_val := 1`
  - L55: `:b_val := 2`
  - ... and 1 more lines
- **`src/tests/scope_blocks.test.ts`** (12 hits):
  - L13: `const res = evalVal('{ a := 10; b := 20; a + b }', env);`
  - L23: `evalVal('x := 100', env);`
  - L26: `const blockRes = evalVal('{ x := 5; x * 2 }', env);`
  - L36: `const res = evalVal('{ a := 10; { b := 20; { c := 30; a + b + c } } }', env);`
  - L44: `describe('Global Assignment (:\u2261 and :==)', () => {`
  - L47: `const res = evalVal('{ :secret := 999; :exported :\u2261 :secret * 2; :exported + 1 }', env);`
  - ... and 6 more lines
- **`src/tests/tokenizer.test.ts`** (2 hits):
  - L53: `const tokens = tokenize('f(x) := x^2, x \\in -10..10 \\step 0.01');`
  - L59: `['ASSIGN', ':='],`
- **`src/tests/universality.test.ts`** (25 hits):
  - L18: `:step_bb(:state, :sym) :=`
  - L29: `:run_bb(:state, :left, :curr, :right, :steps) :=`
  - L34: `:trans := :step_bb(:state, :curr);`
  - L35: `:next_st := :trans[0];`
  - L36: `:w_sym := :trans[1];`
  - L37: `:dir := :trans[2];`
  - ... and 19 more lines
- **`docs/CONSOLIDATION_ASSESSMENT.md`** (6 hits):
  - L73: `- **Expression**: \`y = x^0\` evaluated at $x = 0$, or \`f(x) := 0^x\` evaluated at $x = 0$.`
  - L108: `- **Expression**: \`omega := DifferentialForm(degree: 1) ; d omega\``
  - L121: `a := 5`
  - L129: `- The compiled closure expects \`a\` to be passed as an argument, ignoring the outer binding \`a := `
  - L130: `- Moving the slider for \`a\` overrides the user's explicit definition \`a := 5\` without warning.`
  - L143: `- **Expression**: \`f(x) := abs(x)\` ; evaluate \`d//dx f(x)\` at \`x = 0\`.`
- **`docs/SEMANTICS.md`** (5 hits):
  - L95: `x := sqrt(4)       # 2`
  - L98: `z := sqrt(-4)    # 2*i`
  - L227: `│  sys := HarmonicOscillator(m: 1, k: 10, b: 0.1)│`
  - L235: `│  traj := rk4(sys_ode, t in 0..10)            │`
  - L253: `norm(v) := max(abs(v))`


### 2.2 Bare Keywords without Backslashes (`import`, `forall`, `where`, `axis`, `in`, `if`, `then`, `else`, `and`, `or`, `not`, `unimport`)
Total hits: **308**
- **`src/document/corpus_data.ts`** (26 hits):
  - L42: `title: "3. Logistic Map and Chaos",`
  - L65: `title: "5. Fibonacci Numbers and the Golden Ratio",`
  - L78: `title: "6. Zeno's Paradox and Geometric Series",`
  - L89: `title: "7. Newton's Method and Root Finding",`
  - L101: `title: "8. Euler's Formula and Identity",`
  - L256: `title: "16. Cap Sets in Affine Space F_3^3",`
  - ... and 20 more lines
- **`src/document/virtual_documents.ts`** (23 hits):
  - L13: `"derivation_export_demo.ax": "---\n:title: Symbolic Derivations and Exact Calculations\n:course: MAT`
  - L17: `"lib/bisect.ax": "# bisect.ax — Bisection root search method in pure Axine\n\\module :bisect\n\n# Ha`
  - L18: `"bisect.ax": "# bisect.ax — Bisection root search method in pure Axine\n\\module :bisect\n\n# Halvin`
  - L21: `"lib/exp.ax": "# exp.ax — Exponential and logarithm functions defined via Taylor series and inverse `
  - L22: `"exp.ax": "# exp.ax — Exponential and logarithm functions defined via Taylor series and inverse sear`
  - L25: `"lib/newton.ax": "# newton.ax — Newton-Raphson root search method in pure Axine\n\\module :newton\n\`
  - ... and 17 more lines
- **`src/tests/algebra_isolate.test.ts`** (5 hits):
  - L20: `it('solves distributing and collecting linear equation 2(x - 3) = 4x + 1 -> x = -7/2', () => {`
  - L47: `it('solves factorable quadratic x^2 - 5x + 6 = 0 -> roots 2 and 3', () => {`
  - L97: `it('solves even power x^2 = 9 returning BOTH roots (-3 and 3)', () => {`
  - L109: `it('rejects general cubics x^3 - 6x^2 + 11x - 6 = 0 with unknown and suggests :solve()', () => {`
  - L117: `it('rejects trigonometric equations :sin(x) = 1/2 with unknown and suggests :solve()', () => {`
- **`src/tests/benchmark.test.ts`** (1 hit):
  - L5: `it('parses and evaluates a 10,000-character mathematical expression cleanly', () => {`
- **`src/tests/browser_module_resolution.test.ts`** (4 hits):
  - L4: `describe('Unified Module Resolution in Browser and Node', () => {`
  - L14: `it('resolves relative import paths "./physics.ax" and "documents/physics.ax"', () => {`
  - L24: `it('reports missing module and lists all searched paths', () => {`
  - L41: `it('evaluates physics.ax and exports all symbols into importing environment', () => {`
- **`src/tests/claim_honesty_and_control.test.ts`** (10 hits):
  - L38: `return { honest: false, reason: \`Predicate does not depend on bound variable '${boundVar}'\` };`
  - L92: `describe('Fix Pass 2: Honesty, Strengthened Tests, and Acceptance Verification', () => {`
  - L94: `it('requires a relevance field on every claim (syntax error if missing)', () => {`
  - L126: `it('asserts all corpus claims have non-empty relevance and honest Kind H or checkable shadows', () =`
  - L149: `expect((res as any).reason).toBe('not-finitely-checkable');`
  - L160: `it('evaluates expression-first sum(1/n^2, n in 1..10)', () => {`
  - ... and 4 more lines
- **`src/tests/classifier.test.ts`** (6 hits):
  - L25: `expect(hasKnownFunctionCall('sum(1/n^2, n in 1..10)')).toBe(true);`
  - L28: `expect(hasKnownFunctionCall('roughly 3 or 4 iterations')).toBe(false);`
  - L36: `expect(hasDigitAdjacentToOperator('roughly 3 or 4 iterations')).toBe(false);`
  - L67: `it('"roughly 3 or 4 iterations" -> PROSE', () => {`
  - L68: `expect(classifyLine('roughly 3 or 4 iterations', env).state).toBe('PROSE');`
  - L104: `describe('Valid Math and Definitions', () => {`
- **`src/tests/compiler.test.ts`** (1 hit):
  - L680: `it('benchmarks AST walker vs compiled closures and reports throughput', () => {`
- **`src/tests/corpus.test.ts`** (1 hit):
  - L522: `expectedContains: 'a valid mathematical expression or definition',`
- **`src/tests/derivation_first_class.test.ts`** (13 hits):
  - L68: `it('x^4 = 16 produces two real roots [2, -2] and complex roots note', () => {`
  - L152: `expect(cubicRes.detail).toContain('cubics and higher polynomial degrees');`
  - L164: `expect(multDenomRes.detail).toContain('rational equations where variable appears in multiple denomin`
  - L167: `it(':simplify(3x + 2x - 4, in: x) returns ExpressionValue with text "5x - 4"', () => {`
  - L169: `const ast = parse(":simplify(3*x + 2*x - 4, \:in: x)");`
  - L184: `it(':simplify(3x + 2x - 4, in: x).result round-trips through parser to AST', () => {`
  - ... and 7 more lines
- **`src/tests/differentiation_corpus.test.ts`** (6 hits):
  - L96: `name: 'Product rule polynomial and trig',`
  - L103: `name: 'Product rule exponential and trig',`
  - L110: `name: 'Product rule linear and logarithmic',`
  - L291: `name: 'Logarithmic differentiation variable base and exponent',`
  - L363: `it('Refusal 1: Differentiating with respect to a variable not present in expression', () => {`
  - L366: `}).toThrow("Variable 'x' is not present in expression");`
- **`src/tests/dimensional.test.ts`** (7 hits):
  - L16: `it('infers degree 0 for numeric constants and :pi, e, tau, phi', () => {`
  - L24: `it('adds degrees for products and scales by powers', () => {`
  - L64: `describe('1.3 The dimension() builtin in evaluator', () => {`
  - L86: `it('produces all 5 parts in exact specified order', () => {`
  - L96: `expect(res.messageLines[0]).toBe('1. This is not the volume of a sphere.');`
  - L122: `it('evaluates :check(3/4 * :pi * r^2, :is: "sphere volume") in the evaluator', () => {`
  - ... and 1 more lines
- **`src/tests/disk_imports.test.ts`** (3 hits):
  - L63: `it('fails with detailed resolution order and searched paths when imported file is moved or missing',`
  - L86: `it('allows a disk file to import physics.ax from the stdlib without losing access', () => {`
  - L101: `it('resolves disk files registered via directory handle in browser environment', () => {`
- **`src/tests/error_and_import_ux.test.ts`** (7 hits):
  - L8: `it('asserts import does not evaluate to none and produces a module descriptor with exported bindings`
  - L28: `it('asserts selective from-import evaluates to module with only selected bindings', () => {`
  - L39: `it('asserts long error message (>3 lines) contains full text and does not clip', () => {`
  - L53: `expect(msg).toContain("Field 'radius' does not exist on record 'Body'");`
  - L73: `expect(rowHtml).toContain("Field &#039;radius&#039; does not exist on record &#039;Body&#039;");`
  - L78: `expect(plainText).toContain("Field 'radius' does not exist on record 'Body'");`
  - ... and 1 more lines
- **`src/tests/evaluator.test.ts`** (3 hits):
  - L11: `it('evaluates assignments and persistent variables', () => {`
  - L19: `it('evaluates function definitions and function calls', () => {`
  - L76: `it('undeclared multi-letter identifier stands as expression or space without error', () => {`
- **`src/tests/explainer.test.ts`** (5 hits):
  - L6: `it('produces context-dependent explanations for dx in integral vs derivative (Gate Requirement)', ()`
  - L26: `expect(expDerivative.role).toContain('Differential in Denominator');`
  - L31: `expect(expDerivative.whatItIs).toContain('infinitesimal change in independent variable');`
  - L59: `it('generates contextual explanations for definite and indefinite integral operator \u222b', () => {`
  - L121: `it('generates distinct rule-dependent explanation text for Left, Midpoint, and Right Riemann sums', `
- **`src/tests/export.test.ts`** (8 hits):
  - L7: `it('correctly parses YAML front matter and body', () => {`
  - L27: `it('generates a self-contained HTML export with front matter header, typeset math, and embedded SVG `
  - L107: `it('preserves whitespace and proper word separation in exported results and records', () => {`
  - L111: `text: 'import "physics.ax"',`
  - L160: `const html = exportToHtml('physics_test.ax', 'import "physics.ax"\nb\ntraj\np_exact\n', records, 'li`
  - L172: `it('generates a clean Markdown export with front matter, code blocks, and linked plot assets', () =>`
  - ... and 2 more lines
- **`src/tests/extension_gate.test.ts`** (3 hits):
  - L268: `describe('Phase 4: Extension, Invariants I4 & I5, and Gutter Expression Rendering', () => {`
  - L310: `it('extracts gutter DOM for a \u2297 b, \u230ax\u230b, \u2200x, and \u222ef confirming they render a`
  - L573: `describe('Invariant I5: Dimension Inference and Sampler Dimension Agree', () => {`
- **`src/tests/file_open_save.test.ts`** (3 hits):
  - L255: `it('correctly tracks and persists recent files', () => {`
  - L274: `it('saves and clears autosave backstop in localStorage', () => {`
  - L377: `it('updates dirty indicator on edit and clears on save in DocumentEditor', async () => {`
- **`src/tests/fuel_kleene.test.ts`** (7 hits):
  - L11: `it('evaluates not operator on booleans and unknown', () => {`
  - L97: `it('propagates unknown through arithmetic and preserves earliest reason', () => {`
  - L111: `describe('Quantifiers, Search, and none vs unknown', () => {`
  - L112: `it('distinguishes none (definitively absent) from unknown (did not finish)', () => {`
  - L133: `it('evaluates all() returning true, false (counterexample), or unknown', () => {`
  - L141: `it('evaluates any() returning true (witness), false, or unknown', () => {`
  - ... and 1 more lines
- **`src/tests/kinds_g1.test.ts`** (2 hits):
  - L87: `it('checks and executes kind coercions with :coerce()', () => {`
  - L96: `it('kind checking catches real errors naming both kinds and the operation', () => {`
- **`src/tests/language_extensions.test.ts`** (15 hits):
  - L6: `it('evaluates if-then-else expressions', () => {`
  - L15: `it('evaluates and, or, not operators with short-circuiting', () => {`
  - L39: `it('detects infinite recursion and reports budget-exhausted unknown', () => {`
  - L51: `it('creates lists and accesses length, first, last, max, min, sum', () => {`
  - L62: `it('generates ranges with range(a..b) and range(a..b step c)', () => {`
  - L76: `it('maps functions and lambdas over lists', () => {`
  - ... and 9 more lines
- **`src/tests/large_rational_typesetting.test.ts`** (3 hits):
  - L8: `it('computes sum(1//n, n in 1..50) and asserts innerText does not flatten into a single integer', ()`
  - L35: `it('asserts stacked fractions contain fraction separator slash in DOM text extraction', () => {`
  - L43: `it('asserts integrator_comparison.ax runs with exact rationals and formats drift cleanly', () => {`
- **`src/tests/layout_dock_visuals.test.ts`** (6 hits):
  - L276: `describe('Layout, Multi-Edge Docking, and Inline Visuals', () => {`
  - L335: `it('persists dock edge and size per orientation (Right, Bottom, Left, Top)', () => {`
  - L396: `it('renders plots, derivations, standing expressions, and scalars inline in Results gutter', () => {`
  - L438: `it('supports pinning visual items into top pinned slot and unpinning', () => {`
  - L472: `it('supports expanding and collapsing individual gutter rows with persisted collapse', () => {`
  - L541: `it('asserts dock menu dropdown toggles and selects dock edges', () => {`
- **`src/tests/multi_document.test.ts`** (3 hits):
  - L347: `it('supports creating multiple tab sessions with independent names and states', () => {`
  - L363: `it('preserves scroll position, caret position, dock state, and pinned visuals across tab switches', `
  - L414: `it('closing a tab cleans up the session and switches to remaining tab', () => {`
- **`src/tests/no_emoji.test.ts`** (3 hits):
  - L24: `it('asserts zero literal emoji or symbol block characters in any src/ file', () => {`
  - L47: `const summary = violations.map(v => \`${v.file}:${v.line} matched '${v.match}' in: ${v.text}\`).join`
  - L48: `expect.fail(\`Found ${violations.length} emoji/symbol literal violations in src/:\n${summary}\`);`
- **`src/tests/no_latex.test.ts`** (6 hits):
  - L25: `it('asserts zero literal LaTeX backslash commands in any src/ file', () => {`
  - L48: `const summary = violations.map(v => \`${v.file}:${v.line} matched '${v.match}' in: ${v.text}\`).join`
  - L49: `expect.fail(\`Found ${violations.length} LaTeX command violations in src/:\n${summary}\`);`
  - L55: `it('asserts zero unrendered bare _, ^, {, or } in rendered explainer outputs', async () => {`
  - L94: `it('asserts zero placeholder or instructional leaks in rendered explainer outputs', async () => {`
  - L120: `'not implemented yet',`
- **`src/tests/notation_g2.test.ts`** (11 hits):
  - L19: `it('parses multiple and contour integrals with AST parity between Unicode and ASCII', () => {`
  - L41: `it('parses grad, div, curl, laplacian with AST parity between Unicode and ASCII', () => {`
  - L66: `it('parses wedge and hodge star with AST parity', () => {`
  - L81: `it('parses tensor product and direct sum with AST parity', () => {`
  - L96: `it('parses inner product and norm brackets with AST parity', () => {`
  - L118: `it('parses forall, exists, exists! with AST parity', () => {`
  - ... and 5 more lines
- **`src/tests/notation_math.test.ts`** (4 hits):
  - L9: `describe('Phase 3: Mathematical Notation, Differentials, Big Operators, and Matrices', () => {`
  - L53: `it('creates matrices and computes determinant and inverse', () => {`
  - L91: `it('computes rank and matrix multiplication', () => {`
  - L100: `it('computes totient, powmod, and binomial', () => {`
- **`src/tests/obstructions_g4.test.ts`** (1 hit):
  - L15: `it('unreduced expressions evaluate to themselves without throwing or fabricating obstructions', () =`
- **`src/tests/operation_table_gate.test.ts`** (8 hits):
  - L9: `describe('D2 Confirmed: Negative-Base Powers and Odd Roots', () => {`
  - L10: `it('evaluates exact odd roots of negative bases in the Reducer', () => {`
  - L55: `it('evaluates negative-base powers in compiled closures identically to reducer', () => {`
  - L87: `it('realPow operation helper directly handles negative bases and odd roots', () => {`
  - L106: `it(\`evaluates '${expr}' equivalently in Reducer and Compiler\`, () => {`
  - L152: `{ name: 'not element of', code: 'x \u2209 A' },`
  - ... and 2 more lines
- **`src/tests/parser.test.ts`** (1 hit):
  - L5: `describe('Parser and Formatter Ambiguity Table', () => {`
- **`src/tests/part_a_records.test.ts`** (4 hits):
  - L9: `it('declares a record schema and instantiates with named arguments', () => {`
  - L48: `it('errors on invalid field access naming the record type and available fields', () => {`
  - L81: `it('stores records in lists and passes them to functions', () => {`
  - L130: `it('round-trips record definition and with-update through parser and formatter', () => {`
- **`src/tests/part_a_trajectories.test.ts`** (3 hits):
  - L5: `it('creates a first-class Trajectory value and reports kindof() with state kind', () => {`
  - L80: `it('enforces dimensional integrity and errors on mismatched units across time steps', () => {`
  - L95: `it('exports trajectory to CSV and JSON formats', () => {`
- **`src/tests/part_b_simulate_closed_form.test.ts`** (2 hits):
  - L5: `describe('Phase 12 Part A.2: simulate() and closed_form() (Gate E2)', () => {`
  - L6: `it('solves the projectile problem two ways and asserts numerical positions agree within 1e-4', () =>`
- **`src/tests/part_b_units.test.ts`** (4 hits):
  - L6: `describe('Part B: User-Defined Units and Dimensions', () => {`
  - L7: `it('declares dimensions and base/derived units', () => {`
  - L60: `it('rejects dimensioned quantities in transcendental functions (Gate B requirement)', () => {`
  - L113: `it('kindof() identifies Quantity kinds and admits operations', () => {`
- **`src/tests/part_c_ode.test.ts`** (2 hits):
  - L7: `describe('Phase 12 Part A.2 & Gate E3: ode() with RK4 and Classification', () => {`
  - L8: `it('classifies dy//dt = -2*y and generates symbolic derivation steps', () => {`
- **`src/tests/part_c_operators.test.ts`** (3 hits):
  - L9: `it('parses, evaluates, renders, and round-trips an infix user-defined operator (Gate C requirement)'`
  - L52: `it('parses, evaluates, and round-trips a prefix user-defined operator', () => {`
  - L81: `it('parses, evaluates, and round-trips a postfix user-defined operator', () => {`
- **`src/tests/part_d_kinds.test.ts`** (5 hits):
  - L7: `it('declares a user-defined kind with axioms marked as declared-not-verified (Gate D requirement)', `
  - L15: `expect(res.meaning).toContain('axioms declared but not checked');`
  - L28: `it('user-defined kind appears in kindof() and formats with parameters and extends', () => {`
  - L42: `it('participates in kind subsumption in the lattice and admits operations', () => {`
  - L61: `it('appears in kind error messages when invalid operations or coercions occur', () => {`
- **`src/tests/part_d_views_primitives.test.ts`** (3 hits):
  - L121: `describe('Phase 12 Part B & Gate E4: Views, Primitives, and Animation Player', () => {`
  - L156: `it('parses and evaluates drawing primitives', () => {`
  - L187: `it('parses and evaluates user-declared view for record type', () => {`
- **`src/tests/part_e_physics_worked_docs.test.ts`** (7 hits):
  - L26: `describe('Phase 12 Part C & Gate E5: Physics Library and Worked Documents', () => {`
  - L27: `it('evaluates documents/physics.ax and exports integrators', () => {`
  - L64: `it('evaluates documents/orbit.ax and verifies angular momentum conservation', () => {`
  - L77: `it('evaluates documents/collision.ax and verifies momentum conservation', () => {`
  - L89: `it('evaluates documents/spring.ax and verifies damped oscillator decay', () => {`
  - L101: `it('evaluates documents/integrator_comparison.ax and verifies energy drift difference', () => {`
  - ... and 1 more lines
- **`src/tests/part_e_rules.test.ts`** (3 hits):
  - L8: `it('parses and formats a user-defined pattern rule (Gate E)', () => {`
  - L18: `it('an unverifiable user-rule result is DESCRIBED, not COMPUTED (Gate E requirement)', () => {`
  - L32: `it('a rule attempting to override a built-in operation or function errors (Gate E requirement)', () `
- **`src/tests/part_f_modules.test.ts`** (1 hit):
  - L63: `it('supports selective from-import syntax', () => {`
- **`src/tests/part_g_libraries.test.ts`** (4 hits):
  - L7: `describe('Part G: Three Domain Libraries and Worked Problems (Gate G)', () => {`
  - L8: `it('loads and runs physics.ax with physics_problem.ax', () => {`
  - L29: `it('loads and runs statistics.ax with statistics_problem.ax', () => {`
  - L50: `it('loads and runs linear.ax with linear_problem.ax', () => {`
- **`src/tests/pure_relational_gates.test.ts`** (17 hits):
  - L10: `describe('Gate 1: Absolute value, norm, and multiplication', () => {`
  - L37: `it('parses f(x) and f(2) as implicit multiplication f · x and f · 2', () => {`
  - L55: `it('does not recognize | as a mode switch on its own line', () => {`
  - L65: `describe('Gate 2: Keywords require backslash and bare words are juxtaposed variables', () => {`
  - L66: `it('evaluates bare import as a 6-variable space (i · m · p · o · r · t)', () => {`
  - L68: `const { value } = evaluate('import', env);`
  - ... and 11 more lines
- **`src/tests/rational.test.ts`** (1 hit):
  - L52: `it('factorial handles non-negative integers exactly and stands unreduced for negatives/non-integers'`
- **`src/tests/relational_libraries_conformance.test.ts`** (10 hits):
  - L40: `it('evaluates :abs on positive, negative, zero, and exact rational values', () => {`
  - L51: `it('evaluates :floor on integers, decimals, and negative real numbers', () => {`
  - L60: `it('evaluates :ceil on integers, decimals, and negative real numbers', () => {`
  - L134: `it('evaluates :exp across zero, small, large, and negative inputs', () => {`
  - L148: `it('evaluates :ln on positive real values and special zero-point :ln(1) = 0', () => {`
  - L172: `it('evaluates :log and :log2 with change of base', () => {`
  - ... and 4 more lines
- **`src/tests/sampler.test.ts`** (9 hits):
  - L23: `it('handles relation holding nowhere in window (returns empty)', () => {`
  - L30: `it('handles relation holding nowhere in 3D window (returns empty mesh)', () => {`
  - L51: `it('handles contour passing exactly through a grid node without NaN or division by zero', () => {`
  - L65: `it('handles relation with a pole in window (1/x = 0) without hang, throw, or NaN', () => {`
  - L87: `it('handles singular point where gradient vanishes (x^2 + y^2 = 0 and x^2 - y^2 = 0)', () => {`
  - L106: `it('handles minimal resolutions (resolution 1 and resolution 2)', () => {`
  - ... and 3 more lines
- **`src/tests/scope_blocks.test.ts`** (6 hits):
  - L9: `describe('Phase 2: Lexical Scopes, Blocks, Global Assignment, and Forward References', () => {`
  - L10: `describe('Block Expressions and Local Scoping', () => {`
  - L11: `it('evaluates block expression and returns the value of the final statement', () => {`
  - L34: `it('handles nested blocks and lexical hierarchy', () => {`
  - L44: `describe('Global Assignment (:\u2261 and :==)', () => {`
  - L65: `it('supports function definitions with local closures in blocks', () => {`
- **`src/tests/spaces.test.ts`** (2 hits):
  - L171: `describe('SpaceViewport Viewport Lifecycle and Controls', () => {`
  - L255: `it('mounts, navigates, pans, zooms, and disposes cleanly in DOM', () => {`
- **`src/tests/time_ranges.test.ts`** (4 hits):
  - L13: `expect(s0.op).toBe('in');`
  - L21: `expect(s1.op).toBe('in');`
  - L29: `expect(s2.op).toBe('in');`
  - L37: `expect(s4.op).toBe('in');`
- **`src/tests/tokenizer.test.ts`** (5 hits):
  - L5: `it('tokenizes simple integers and decimals', () => {`
  - L16: `it('handles unicode operators and symbols', () => {`
  - L52: `it('tokenizes assignments and ranges with backslash keywords', () => {`
  - L65: `['IN', 'in'],`
  - L77: `const tokens = tokenize('import');`
- **`src/tests/universality.test.ts`** (1 hit):
  - L11: `it('simulates 3-state 2-symbol Busy Beaver BB(3) in 21 steps producing 6 ones', () => {`
- **`src/tests/warm_start_gate.test.ts`** (2 hits):
  - L4: `describe("Phase 1 Gate: Warm-Start Search in Sampler", () => {`
  - L5: `it("samples 40,000 points of :sqrt(X^2 + Y^2) = 2 in under 0.5s with warm-start fallback tracking", `
- **`documents/derivation_export_demo.ax`** (1 hit):
  - L2: `:title: Symbolic Derivations and Exact Calculations`
- **`documents/linear.ax`** (1 hit):
  - L9: `\axioms: ["conjugate symmetry", "linearity in first argument", "positive definiteness"]`
- **`documents/linear_problem.ax`** (1 hit):
  - L2: `:title: Gram-Schmidt Orthogonalization and Vector Projection`
- **`documents/physics_problem.ax`** (1 hit):
  - L2: `:title: Two-Particle Inelastic Collision and Kinetic Energy Loss`
- **`documents/statistics_problem.ax`** (1 hit):
  - L2: `:title: One-Sample Hypothesis Testing and Normal PDF Evaluation`


### 2.3 Procedural Plotting Calls (`graph(` / `:graph(`)
Total hits: **36**
- **`src/core/evaluator.ts`** (3 hits):
  - L1025: `suggestion: 'Use range in graph(expr, x in a..b)',`
  - L1901: `throw createError('graph() requires at least one free variable to plot against, found 0', node.span)`
  - L1924: `// Check for list or trajectory series (e.g. graph(E_euler_t, E_verlet_t, E_rk4_t) or graph(y_pos))`
- **`src/document/corpus_data.ts`** (6 hits):
  - L27: `:graph(:orbit27)\``
  - L49: `:graph(:orbit)\``
  - L203: `:graph(:gaps)\``
  - L242: `:graph(((:cos(u))*(2 + :cos(v)), (:sin(u))*(2 + :cos(v)), :sin(v)), u \\in 0..:tau, v \\in 0..:tau)\`
  - L407: `:graph(:R0(:th), :R10(:th), :th \\in 0.2..1.4)`
  - L411: `:graph(:traj_3d(x, :th), x \\in 0..260, :th \\in 0.4..1.2)`
- **`src/document/virtual_documents.ts`** (3 hits):
  - L14: `"integrator_comparison.ax": "# integrator_comparison.ax — Energy drift comparison across integrators`
  - L44: `"three_page_lab_report.ax": "---\n:title: Classical Mechanics Laboratory Report\n:course: PHYS 201 -`
  - L45: `"thrown_ball.ax": "# Getting started: a thrown ball\n# Simulates a ball launched at an angle under s`
- **`src/notebook/app.ts`** (4 hits):
  - L38: `{ id: 'c6', source: '# 2D Adaptive Curve Plot with Asymptote Breaking\ngraph(tan x, x in -5..5)' },`
  - L39: `{ id: 'c7', source: '# Multi-series with Shared Horizontal Axis\ngraph(2x, y^2, ln z)' },`
  - L40: `{ id: 'c8', source: '# Parametric Curve\ngraph((cos t, sin t), t in 0..tau)' },`
  - L41: `{ id: 'c9', source: '# 2D Scalar Field (Heatmap & 3D Surface)\ngraph(sin x cos y, x in -5..5, y in -`
- **`src/notebook/cell.ts`** (1 hit):
  - L88: `this.textarea.placeholder = 'Enter math expression (e.g. 2x, 1/3 + 1/3 + 1/3, graph(sin x))';`
- **`src/tests/corpus.test.ts`** (2 hits):
  - L557: `source: ':graph(5)',`
  - L559: `messageContains: 'graph() requires at least one free variable to plot against, found 0',`
- **`src/tests/export.test.ts`** (3 hits):
  - L260: `const docText = \`y_pos := map(b -> b.position[1], traj)\ngraph(y_pos)\nball_at_2 := traj[2.0]\nspri`
  - L271: `text: 'graph(y_pos)',`
  - L297: `expect(plainText).toContain('graph(y_pos)');`
- **`src/tests/large_rational_typesetting.test.ts`** (1 hit):
  - L56: `// Line with graph(E_euler_t, E_verlet_t, E_rk4_t) or Space`
- **`src/tests/layout_dock_visuals.test.ts`** (6 hits):
  - L336: `editor = new DocumentEditor(container as any, 'f(x) := :sin(x)\n:graph(f(x), x \\in 0..10)');`
  - L399: `':graph(x^2, x \\in 0..10)',`
  - L440: `':graph(x^2, x \\in 0..5)',`
  - L473: `const docText = ':graph(x^2, x \\in 0..10)';`
  - L510: `'graph(2x)',`
  - L542: `editor = new DocumentEditor(container as any, 'graph(2x)');`
- **`documents/integrator_comparison.ax`** (1 hit):
  - L26: `:graph(:E_euler_t, :E_verlet_t, :E_rk4_t)`
- **`documents/three_page_lab_report.ax`** (2 hits):
  - L24: `:graph(:y_pos)`
  - L57: `:graph(:E_euler, :E_verlet, :E_rk4)`
- **`documents/thrown_ball.ax`** (1 hit):
  - L17: `:graph(:y_pos)`
- **`docs/REWRITE_ASSESSMENT.md`** (3 hits):
  - L12: `Axine is transitioning from an evaluator with an attached display subsystem (\`graph()\`) to a **Mat`
  - L199: `│  • 44 corpus documents calling graph() -> rewritten to raw relations.    │`
  - L232: `├── Strip graph() from all 67 corpus documents; relations stand alone`


### 2.4 Procedural Functional Iterators (`simulate(`, `map(`, `iterate(`, `fold(`, `unfold(`)
Total hits: **213**
- **`src/core/algebra/classifier.ts`** (2 hits):
  - L237: `coeffs: inner.coeffs.map(c => c.neg()),`
  - L255: `coeffs: left.coeffs.map(c => c.div(divisor)),`
- **`src/core/dimensional.ts`** (2 hits):
  - L510: `const knownList = Object.values(KNOWN_QUANTITIES).map(q => q.name).join(', ');`
  - L556: `const stepSummary = matchedQuantity.derivationSteps.map(s => \`Step ${s.step} (${s.title}): ${s.math`
- **`src/core/evaluator.ts`** (34 hits):
  - L263: `...diskSearched.map(p => \`[disk] ${p}\`),`
  - L264: `...stdlibSearched.map(p => \`[stdlib] ${p}\`),`
  - L306: `args: ast.args.map(a => substituteExpressions(a, substMap)),`
  - L1136: `const elements = node.elements.map(el => this.evalNode(el, currentEnv));`
  - L1140: `const elements = node.elements.map(el => this.evalNode(el, currentEnv));`
  - L1535: `elements: targetVal.samples.map(s => s.state),`
  - ... and 28 more lines
- **`src/core/explainer.ts`** (2 hits):
  - L243: `const stepItems = quantity.derivationSteps.map(s => {`
  - L264: `const showMeHtml = lines.map(line => \`<div style="margin-bottom: 3px;">${line}</div>\`).join('');`
- **`src/core/formatter.ts`** (17 hits):
  - L109: `return \`(${node.elements.map(e => formatNode(e, PREC_NONE)).join(', ')})\`;`
  - L112: `return \`[${node.elements.map(e => formatNode(e, PREC_NONE)).join(', ')}]\`;`
  - L115: `return \`{\n  ${node.statements.map(s => formatNode(s, PREC_NONE)).join(';\n  ')}\n}\`;`
  - L156: `const paramsStr = node.params.length === 1 ? formatIdent(node.params[0]) : \`(${node.params.map(form`
  - L176: `return \`${formatIdent(node.name)}(${node.params.map(formatIdent).join(', ')}) = ${formatNode(node.b`
  - L188: `return \`${calleeStr}(${node.args.map(a => formatNode(a, PREC_NONE)).join(', ')})\`;`
  - ... and 11 more lines
- **`src/core/kinds.ts`** (1 hit):
  - L198: `.map(([k, v]) => \`${k}: ${formatKind(v)}\`)`
- **`src/core/math_typeset.ts`** (14 hits):
  - L218: `const argsHtml = node.args.map(a => typesetASTNode(a, options)).join(', ');`
  - L299: `const items = node.elements.map(e => typesetASTNode(e, options)).join(', ');`
  - L306: `const rows = node.elements.map(rowNode => {`
  - L307: `const cells = (rowNode as any).elements.map((cellNode: ASTNode) => {`
  - L325: `const items = node.elements.map(e => typesetASTNode(e, options)).join(', ');`
  - L411: `const parsedRows = rowsRaw.map((rStr: string) => {`
  - ... and 8 more lines
- **`src/core/numeric/matrix.ts`** (5 hits):
  - L29: `const data: Value[][] = list.elements.map(el => [el]);`
  - L135: `const a: Value[][] = m.data.map(row => [...row]);`
  - L227: `const a: Value[][] = m.data.map(row => [...row]);`
  - L286: `let a: number[][] = m.data.map(row => row.map(v => valueToNumber(v, span)));`
  - L296: `let v: number[] = a.map(row => row[j]);`
- **`src/core/numeric/tower.ts`** (2 hits):
  - L78: `return { type: 'Tuple', elements: val.elements.map(e => valueToASTNode(e, s)), span: s };`
  - L80: `return { type: 'List', elements: val.elements.map(e => valueToASTNode(e, s)), span: s };`
- **`src/core/sampler.ts`** (4 hits):
  - L673: `const callArgs = allVars.map(v => {`
  - L683: `const fixedArgs = fixedVarNames.map(v => fixedValues[v] ?? 0);`
  - L701: `const callArgs = allVars.map(v => {`
  - L712: `const fixedArgs = fixedVarNames.map(v => fixedValues[v] ?? 0);`
- **`src/core/simulation/trajectory.ts`** (9 hits):
  - L42: `const interpolatedElements = sA.elements.map((elA, idx) =>`
  - L66: `const interpolatedElements = sA.elements.map((elA, idx) =>`
  - L113: `const mappedSamples: TrajectorySample[] = traj.samples.map(s => ({`
  - L150: `samples: traj.samples.map(s => ({`
  - L166: `headers = ['t', ...firstState.elements.map((_, i) => \`x${i + 1}\`)];`
  - L168: `if (s.type === 'tuple') return [t, ...s.elements.map(e => valueToNumber(e))];`
  - ... and 3 more lines
- **`src/core/symbolic_diff.ts`** (1 hit):
  - L600: `const ruleSequence = steps.map(s => s.rule);`
- **`src/core/worker.ts`** (2 hits):
  - L247: `if (Array.isArray(val)) return val.map(sanitizeValueForWorker);`
  - L251: `entities: (val.entities || []).map((e: any) => {`
- **`src/document/corpus_data.ts`** (8 hits):
  - L22: `# Demonstrates user recursion, conditionals, iterate(), length, max, and sequence plotting`
  - L24: `:orbit27 := :iterate(:collatz, 27, :until: 1, :max: 200)`
  - L45: `# Demonstrates multi-parameter functions, lambdas, iterate(), and orbit visualization`
  - L47: `:orbit := :iterate(x -> :f(3.8, x), 0.5, :n: 100)`
  - L72: `:ratios := :map(n -> :fib(n+1) / :fib(n), :range(1..15))`
  - L84: `:partial_sums := :map(n -> :sum(1/2^k, k \\in 1..n), :range(1..20))`
  - ... and 2 more lines
- **`src/document/document_state.ts`** (1 hit):
  - L119: `this.records = splitLines.map((line, idx) => {`
- **`src/document/editor.ts`** (17 hits):
  - L349: `return this.sessionOrder.map(id => this.sessions.get(id)!).filter(Boolean);`
  - L507: `tabContainer.innerHTML = this.sessionOrder.map(id => {`
  - L852: `listEl.innerHTML = recents.map(r => \``
  - L939: `${CORPUS_DOCUMENTS.map(doc => \`<option value="${doc.id}">[${doc.category}] ${doc.title}</option>\`)`
  - L2218: `${canDoList.map((item: string) => \`<li>${escapeHtml(item)}</li>\`).join('')}`
  - L2226: `${relatedList.map((t: string) => \`<span class="related-tag">${escapeHtml(t)}</span>\`).join('')}`
  - ... and 11 more lines
- **`src/document/exporter.ts`** (5 hits):
  - L183: `.map(pt => \`${toSvgX(pt.x).toFixed(1)},${toSvgY(pt.y).toFixed(1)}\`)`
  - L378: `const projected = mesh.vertices.map(v => project3D(v[0], v[1], v[2]));`
  - L551: `${branch.steps.map((bs: DerivationStep) => \``
  - L569: `html += \`<div class="export-deriv-result"><span class="export-result-label">Roots:</span> ${deriv.r`
  - L623: `${trace.iterations.map((it: any) => \``
- **`src/document/virtual_documents.ts`** (10 hits):
  - L4: `"collision.ax": "# collision.ax — Elastic collision of two bodies\n\\import \"./physics.ax\"\n\\impo`
  - L13: `"derivation_export_demo.ax": "---\n:title: Symbolic Derivations and Exact Calculations\n:course: MAT`
  - L14: `"integrator_comparison.ax": "# integrator_comparison.ax — Energy drift comparison across integrators`
  - L35: `"optics.ax": "# optics.ax — Geometric optics with zero built-in physics\n# Ray propagation, interfac`
  - L36: `"orbit.ax": "# orbit.ax — Planetary orbit simulation with central gravitational force\n\\import \"./`
  - L37: `"pendulum.ax": "# pendulum.ax — Simple pendulum trajectory and energy\n\\import \"./physics.ax\"\n\\`
  - ... and 4 more lines
- **`src/notebook/cell.ts`** (3 hits):
  - L290: `return \`(${val.elements.map((e: Value) => this.formatValue(e)).join(', ')})\`;`
  - L296: `return \`[${val.elements.map((e: Value) => this.formatValue(e)).join(', ')}]\`;`
  - L315: `.map(([k, v]) => \`${k}: ${this.formatValue(v)}\`)`
- **`src/notebook/state.ts`** (2 hits):
  - L157: `cells: this.cells.map(c => ({ id: c.id, source: c.source })),`
  - L165: `this.cells = (data.cells || []).map((c: any) => ({`
- **`src/plot/animation_player.ts`** (4 hits):
  - L50: `this.tStart = Math.min(...this.trajectories.map(t => t.tStart));`
  - L51: `this.tEnd = Math.max(...this.trajectories.map(t => t.tEnd));`
  - L555: `.map(([k, v]) => \`${k}: ${v.type === 'float' ? (v.value.toFixed(2)) : (v.type === 'rational' ? \`${`
  - L559: `info = \`(${state.elements.map(e => valueToNumber(e).toFixed(2)).join(', ')})\`;`
- **`src/plot/explainer_visualizer.ts`** (2 hits):
  - L270: `let yMin = Math.min(0, ...rects.map(r => r.y), this.fn(a), this.fn(b));`
  - L271: `let yMax = Math.max(1, ...rects.map(r => r.y), this.fn(a), this.fn(b));`
- **`src/plot/space_viewport.ts`** (1 hit):
  - L994: `const projected = mesh.vertices.map(v => project3D(v[0], v[1], v[2]));`
- **`src/plot/surface3d.ts`** (4 hits):
  - L269: `const projGrid = grid.map(row =>`
  - L270: `row.map(p => {`
  - L336: `const projGrid = grid.map(row =>`
  - L337: `row.map(p => {`
- **`src/tests/claim_honesty_and_control.test.ts`** (1 hit):
  - L188: `const vals = (res as any).elements.map((e: Value) => (e as any).value);`
- **`src/tests/compiler.test.ts`** (1 hit):
  - L43: `const point: number[] = vars.map((_, idx) => {`
- **`src/tests/derivation_first_class.test.ts`** (2 hits):
  - L20: `const rootVals = res.roots.map(r => (r as any).n ? Number((r as any).n) / Number((r as any).d) : (r `
  - L75: `const rootVals = res.roots.map(r => (r as any).n ? Number((r as any).n) / Number((r as any).d) : (r `
- **`src/tests/export.test.ts`** (4 hits):
  - L137: `text: 'traj := simulate(b, 0..3)',`
  - L260: `const docText = \`y_pos := map(b -> b.position[1], traj)\ngraph(y_pos)\nball_at_2 := traj[2.0]\nspri`
  - L264: `text: 'y_pos := map(b -> b.position[1], traj)',`
  - L341: `...records.map((r, i) => ({ ...r, lineIndex: i + 3 })),`
- **`src/tests/extension_gate.test.ts`** (1 hit):
  - L54: `return (this.textValue + ' ' + this.children.map(c => c.textContent).join(' ')).trim();`
- **`src/tests/file_open_save.test.ts`** (1 hit):
  - L60: `return (this.textValue + ' ' + this.children.map(c => c.textContent).join(' ')).trim();`
- **`src/tests/kinds_g1.test.ts`** (2 hits):
  - L76: `const vecOps = (resVec.value as any).elements.map((e: any) => e.value);`
  - L82: `const scalarOps = (resScalar.value as any).elements.map((e: any) => e.value);`
- **`src/tests/language_extensions.test.ts`** (3 hits):
  - L78: `const res = evaluate(':map(x -> x^2, [1, 2, 3, 4])', env);`
  - L105: `it('computes orbits with iterate(f, x0, n: N) and iterate(f, x0, until: v, max: M)', () => {`
  - L108: `const orbit = evaluate(':iterate(:collatz, 6, :until: 1, :max: 20)', env);`
- **`src/tests/layout_dock_visuals.test.ts`** (2 hits):
  - L50: `return (this.textValue + ' ' + this.children.map(c => c.textContent).join(' ')).trim();`
  - L407: `const tabs = container.querySelectorAll('.doc-tab-btn').map(b => b.getAttribute('data-tab'));`
- **`src/tests/multi_document.test.ts`** (1 hit):
  - L51: `return (this.textValue + ' ' + this.children.map(c => c.textContent).join(' ')).trim();`
- **`src/tests/no_emoji.test.ts`** (1 hit):
  - L47: `const summary = violations.map(v => \`${v.file}:${v.line} matched '${v.match}' in: ${v.text}\`).join`
- **`src/tests/no_latex.test.ts`** (1 hit):
  - L48: `const summary = violations.map(v => \`${v.file}:${v.line} matched '${v.match}' in: ${v.text}\`).join`
- **`src/tests/notation_g2.test.ts`** (1 hit):
  - L8: `if (Array.isArray(node)) return node.map(stripSpan);`
- **`src/tests/part_a_records.test.ts`** (1 hit):
  - L125: `const ops = admitsCross.elements.map(e => (e as any).value);`
- **`src/tests/part_a_trajectories.test.ts`** (2 hits):
  - L55: `it('maps over a trajectory with map(fn, traj) producing a new trajectory', () => {`
  - L62: `evaluate(':pos_traj := :map(p -> p.:position, :traj)', env);`
- **`src/tests/part_b_simulate_closed_form.test.ts`** (3 hits):
  - L5: `describe('Phase 12 Part A.2: simulate() and closed_form() (Gate E2)', () => {`
  - L13: `evaluate(":sim_traj := :simulate(:proj_step, :s0, t \\in 0..4, :dt: 0.05)", env);`
  - L48: `evaluate(":traj_sim := :simulate(:my_step, 0, t \\in 0..1, :dt: 0.1)", env);`
- **`src/tests/part_b_units.test.ts`** (1 hit):
  - L128: `const ops = admitsVal.elements.map(e => (e as any).value);`
- **`src/tests/part_d_views_primitives.test.ts`** (2 hits):
  - L203: `":simulate(s -> (s[0] + 0.1, s[1] + 0.2), (0, 0), t \\in 0..1, :dt: 0.1)",`
  - L250: `":simulate(s -> (s[0] + 1, s[1] + 1), (0, 0), t \\in 0..5, :dt: 1.0)",`
- **`src/tests/relational_libraries_conformance.test.ts`** (2 hits):
  - L316: `const items = (res as any).elements.map((it: any) => Number(it.n));`
  - L324: `const pairs = (res as any).elements.map((tuple: any) => [Number(tuple.elements[0].n), Number(tuple.e`
- **`src/tests/tokenizer.test.ts`** (5 hits):
  - L7: `expect(tokens.map(t => [t.type, t.value])).toEqual([`
  - L18: `expect(tokens.map(t => [t.type, t.value])).toEqual([`
  - L42: `expect(tokens.map(t => [t.type, t.value])).toEqual([`
  - L54: `expect(tokens.map(t => [t.type, t.value])).toEqual([`
  - L78: `expect(tokens.map(t => [t.type, t.value])).toEqual([`
- **`src/tests/universality.test.ts`** (1 hit):
  - L89: `:map(i -> :rule110_step(\\if i > 0 \\then :cells[i-1] \\else 0, :cells[i], \\if i + 1 < :length(:cel`
- **`documents/collision.ax`** (1 hit):
  - L27: `:traj = :simulate(:sys -> :two_body_step(:sys, 0.05), :initial_system, t \in 0..4, :dt: 0.05)`
- **`documents/derivation_export_demo.ax`** (1 hit):
  - L26: `:y_pos = :map(p -> p[1], :traj)`
- **`documents/integrator_comparison.ax`** (6 hits):
  - L12: `:traj_euler = :simulate(b -> :euler_step(b, :harmonic_force, 0.1), :b0, t \in 0..10, :dt: 0.1)`
  - L15: `:traj_verlet = :simulate(b -> :verlet_step(b, :harmonic_force, 0.1), :b0, t \in 0..10, :dt: 0.1)`
  - L18: `:traj_rk4 = :simulate(b -> :rk4_step(b, :harmonic_force, 0.1), :b0, t \in 0..10, :dt: 0.1)`
  - L21: `:E_euler_t = :map(b -> 0.5 * b.:velocity[0]^2 + 0.5 * k * b.:position[0]^2, :traj_euler)`
  - L22: `:E_verlet_t = :map(b -> 0.5 * b.:velocity[0]^2 + 0.5 * k * b.:position[0]^2, :traj_verlet)`
  - L23: `:E_rk4_t = :map(b -> 0.5 * b.:velocity[0]^2 + 0.5 * k * b.:position[0]^2, :traj_rk4)`
- **`documents/optics.ax`** (1 hit):
  - L36: `:traj = :simulate(r -> :propagate_and_refract(r, 0.1), :r0, t \in 0..2, :dt: 0.1)`
- **`documents/orbit.ax`** (1 hit):
  - L19: `:traj = :simulate(b -> :rk4_step(b, :orbit_force, 0.05), :b0, t \in 0..20, :dt: 0.05)`
- **`documents/pendulum.ax`** (1 hit):
  - L22: `:traj = :simulate(s -> :pendulum_step(s, 0.02), :p0, t \in 0..5, :dt: 0.02)`
- **`documents/projectile.ax`** (1 hit):
  - L14: `:traj = :simulate(b -> :rk4_step(b, :force_fn, 0.02), :b0, t \in 0..3, :dt: 0.02)`
- **`documents/spring.ax`** (1 hit):
  - L13: `:traj = :simulate(b -> :rk4_step(b, :spring_force_fn, 0.05), :b0, t \in 0..10, :dt: 0.05)`
- **`documents/three_page_lab_report.ax`** (8 hits):
  - L20: `:traj = :simulate(b -> :verlet_step(b, :weight, 0.05), :ball0, t \in 0..3, :dt: 0.05)`
  - L23: `:y_pos = :map(b -> b.:position[1], :traj)`
  - L42: `:traj_euler = :simulate(b -> :euler_step(b, :spring_force_fn, 0.1), :b0, t \in 0..10, :dt: 0.1)`
  - L45: `:traj_verlet = :simulate(b -> :verlet_step(b, :spring_force_fn, 0.1), :b0, t \in 0..10, :dt: 0.1)`
  - L48: `:traj_rk4 = :simulate(b -> :rk4_step(b, :spring_force_fn, 0.1), :b0, t \in 0..10, :dt: 0.1)`
  - L52: `:E_euler = :map(b -> 0.5 * b.:velocity[0]^2 + 0.5 * k * b.:position[0]^2, :traj_euler)`
  - ... and 2 more lines
- **`documents/thrown_ball.ax`** (2 hits):
  - L13: `:traj = :simulate(b -> :verlet_step(b, :weight, 0.05), :ball0, t \in 0..3, :dt: 0.05)`
  - L16: `:y_pos = :map(b -> b.:position[1], :traj)`


### 2.5 Record Types and View Declarations (`record`, `view for`)
Total hits: **125**
- **`src/core/analyzer.ts`** (1 hit):
  - L334: `case 'RecordDef': {`
- **`src/core/classifier.ts`** (1 hit):
  - L296: `ast.type === 'RecordDef' ||`
- **`src/core/compiler.ts`** (1 hit):
  - L288: `case 'RecordDef':`
- **`src/core/evaluator.ts`** (38 hits):
  - L24: `RecordDefNode,`
  - L457: `if (val.type === 'record_constructor' && val.name === 'Record') {`
  - L488: `if (boundVal.type === 'record_constructor' && boundVal.name === 'Record') {`
  - L645: `if (val.type === 'record_constructor' && val.name === 'Record') {`
  - L774: `if (boundVal.type === 'record_constructor' && boundVal.name === 'Record') {`
  - L1071: `if (right.type === 'record_constructor' && right.name === 'Record') {`
  - ... and 32 more lines
- **`src/core/formatter.ts`** (3 hits):
  - L83: `'dagger', 'adj', 'record', 'with', 'dimension', 'unit', 'operator',`
  - L229: `case 'RecordDef': {`
  - L230: `return \`\\record { ${node.fields.map(formatIdent).join(', ')} }\`;`
- **`src/core/kinds.ts`** (1 hit):
  - L414: `case 'record': {`
- **`src/core/parser.ts`** (4 hits):
  - L431: `// Check for view for <Type> := <viewFunction>`
  - L713: `// Check for record with { field: val, ... }`
  - L1383: `// Record definition expression: record { mass, position, velocity }`
  - L1406: `type: 'RecordDef',`
- **`src/core/simulation/trajectory.ts`** (6 hits):
  - L49: `if (sA.type === 'record' && sB.type === 'record') {`
  - L60: `return { type: 'record', typeName: sA.typeName, fields };`
  - L121: `if (firstState.type === 'record') stateKind = firstState.typeName;`
  - L171: `} else if (firstState.type === 'record') {`
  - L175: `if (s.type === 'record') return [t, ...fieldKeys.map(k => valueToNumber(s.fields[k] || { type: 'none`
  - L196: `case 'record': {`
- **`src/core/tokenizer.ts`** (2 hits):
  - L256: `if (name === 'record') {`
  - L257: `tokens.push(this.makeToken('RECORD', 'record', startPos, startLine, startCol, leadingWhitespace));`
- **`src/core/types.ts`** (5 hits):
  - L161: `| RecordDefNode`
  - L207: `export interface RecordDefNode {`
  - L208: `type: 'RecordDef';`
  - L973: `type: 'record';`
  - L979: `type: 'record_constructor';`
- **`src/document/editor.ts`** (4 hits):
  - L2865: `if (state.type === 'record' && views && views.has(state.typeName)) {`
  - L2952: `case 'record': {`
  - L2958: `case 'record_constructor':`
  - L2959: `return \`record ${val.name} { ${val.fieldNames.join(', ')} }\`;`
- **`src/document/virtual_documents.ts`** (5 hits):
  - L33: `"linear.ax": "# linear.math — Linear Algebra domain library\n# Provides user-defined kinds, inner pr`
  - L34: `"linear_problem.ax": "---\n:title: Gram-Schmidt Orthogonalization and Vector Projection\n:course: MA`
  - L35: `"optics.ax": "# optics.ax — Geometric optics with zero built-in physics\n# Ray propagation, interfac`
  - L38: `"physics.ax": "# physics.ax — Physics domain library for Axine\n# Provides dimensions, units, Body r`
  - L42: `"statistics.ax": "# statistics.math — Statistics domain library\n# Provides distribution representat`
- **`src/notebook/cell.ts`** (3 hits):
  - L313: `case 'record': {`
  - L319: `case 'record_constructor':`
  - L320: `return \`record ${val.name} { ${val.fieldNames.join(', ')} }\`;`
- **`src/plot/animation_player.ts`** (4 hits):
  - L419: `// Velocity vector if present on record`
  - L420: `if (state.type === 'record' && 'velocity' in state.fields) {`
  - L534: `if (val.type === 'record') {`
  - L553: `if (state.type === 'record') {`
- **`src/plot/space_viewport.ts`** (1 hit):
  - L79: `this.viewMode = '2d'; // Slicing 2D view for n >= 4`
- **`src/tests/error_and_import_ux.test.ts`** (4 hits):
  - L41: `// Intentionally trigger a detailed error by referencing invalid record field and invalid function a`
  - L53: `expect(msg).toContain("Field 'radius' does not exist on record 'Body'");`
  - L73: `expect(rowHtml).toContain("Field &#039;radius&#039; does not exist on record &#039;Body&#039;");`
  - L78: `expect(plainText).toContain("Field 'radius' does not exist on record 'Body'");`
- **`src/tests/export.test.ts`** (2 hits):
  - L125: `type: 'record',`
  - L280: `result: { type: 'record', typeName: 'Body', fields: {} } as any,`
- **`src/tests/part_a_records.test.ts`** (21 hits):
  - L9: `it('declares a record schema and instantiates with named arguments', () => {`
  - L11: `evaluate(":Particle := \\record { :mass, :position, :velocity }", env);`
  - L14: `expect(p.type).toBe('record');`
  - L15: `if (p.type === 'record') {`
  - L29: `it('accesses record fields via dot notation', () => {`
  - L31: `evaluate(":Particle := \\record { :mass, :position, :velocity }", env);`
  - ... and 15 more lines
- **`src/tests/part_a_trajectories.test.ts`** (2 hits):
  - L7: `evaluate(":Body := \\record { :mass, :position, :velocity }", env);`
  - L57: `evaluate(":Particle := \\record { :mass, :position, :velocity }", env);`
- **`src/tests/part_b_simulate_closed_form.test.ts`** (2 hits):
  - L8: `evaluate(":State := \\record { x, y, :vx, :vy }", env);`
  - L32: `if (sSim.type === 'record' && sClosed.type === 'record') {`
- **`src/tests/part_d_views_primitives.test.ts`** (2 hits):
  - L187: `it('parses and evaluates user-declared view for record type', () => {`
  - L189: `evaluate(":Particle := \\record { :position, :velocity }", env);`
- **`src/tests/part_e_physics_worked_docs.test.ts`** (2 hits):
  - L122: `expect(rEnd.type).toBe('record');`
  - L123: `if (rEnd.type === 'record') {`
- **`documents/linear.ax`** (1 hit):
  - L12: `:Basis = \record { :vectors, :dimension }`
- **`documents/linear_problem.ax`** (1 hit):
  - L30: `# Construct orthogonal basis record`
- **`documents/optics.ax`** (2 hits):
  - L5: `:Ray = \record { :origin, :direction, :intensity }`
  - L7: `\view \for :Ray = r -> [`
- **`documents/physics.ax`** (4 hits):
  - L2: `# Provides dimensions, units, Body record, forces, step integrators, energy and momentum`
  - L14: `:Body = \record { :mass, :position, :velocity }`
  - L15: `:Particle = \record { :mass, :position, :velocity }`
  - L17: `\view \for :Body = b -> [:circle(b.:position, 1), :arrow(b.:position, b.:velocity)]`
- **`documents/statistics.ax`** (3 hits):
  - L9: `:NormalDist = \record { :mean, :variance }`
  - L10: `:UniformDist = \record { a, b }`
  - L11: `:HypothesisTest = \record { :null_val, :sample_mean, :sample_size, :std_dev, :z_stat }`


### 2.6 Value Enums: `undefined`, `unknown(`, `requires-unavailable-theory`, `unimplemented-technique`
- **`undefined` as Value** (8 hits):
- **`src/core/evaluator.ts`** (5 hits):
  - L202: `if (typeof process !== 'undefined' && (process.versions as any)?.node) {`
  - L3290: `): { value: number; converged: boolean; reason?: 'one-sided-limits-disagree' | 'unbounded' | 'oscill`
  - L3301: `if (vals.length < 3) return { value: 0, converged: false, reason: 'undefined' };`
  - L3334: `return { value: 0, converged: false, reason: 'undefined' };`
  - L3358: `if (vals.length < 2) return { value: 0, converged: false, reason: 'undefined' };`
- **`src/core/worker.ts`** (1 hit):
  - L263: `if (typeof self !== 'undefined' && typeof (self as any).postMessage === 'function' && typeof window `
- **`src/tests/corpus.test.ts`** (1 hit):
  - L17: `| { type: 'undefined' }`
- **`src/tests/pure_relational_gates.test.ts`** (1 hit):
  - L182: `const container = typeof document !== 'undefined' ? document.createElement('div') : ({ innerHTML: ''`

- **`unknown(` / `:unknown(`** (48 hits):
- **`src/core/evaluator.ts`** (1 hit):
  - L4150: `// Kind H claims NEVER attempt finite execution; they return unknown(not-finitely-checkable)`
- **`src/core/math_typeset.ts`** (4 hits):
  - L357: `// 0. Handle unknown(...) results and Verified/Not prose`
  - L358: `if (trimmed.startsWith('unknown(') && trimmed.endsWith(')')) {`
  - L369: `return \`<span class="tm-unknown">unknown(${escapeHtml(reason)}, ${typesetProseWithMath(detail, opti`
  - L371: `return \`<span class="tm-unknown">unknown(${escapeHtml(inner)})</span>\`;`
- **`src/core/numeric/matrix.ts`** (1 hit):
  - L281: `// Complex eigenvalues -> return unknown(requires-unavailable-theory)`
- **`src/document/corpus_data.ts`** (18 hits):
  - L289: `:relevance: "The theorem requires infinite-dimensional Ricci flow analysis with surgery and has no f`
  - L291: `:shadow: :unknown("not-finitely-checkable", "Requires infinite-dimensional Ricci flow analysis"),`
  - L292: `:expect: :unknown("not-finitely-checkable")`
  - L317: `:relevance: "The complete Riemann Hypothesis asserts infinitely many non-trivial zeros lie on Re(s)=`
  - L319: `:shadow: :unknown("not-finitely-checkable", "Requires complex analytic zeta function theory"),`
  - L320: `:expect: :unknown("not-finitely-checkable")`
  - ... and 12 more lines
- **`src/document/editor.ts`** (1 hit):
  - L2907: `return \`unknown(${val.reason}${val.detail ? \`, "${val.detail}"\` : ''})\`;`
- **`src/tests/algebra_isolate.test.ts`** (1 hit):
  - L70: `it('rejects complex quadratic roots x^2 + 1 = 0 with unknown(requires-unavailable-theory)', () => {`
- **`src/tests/claim_honesty_and_control.test.ts`** (2 hits):
  - L145: `// 2. Kind H claims return unknown(not-finitely-checkable)`
  - L179: `it('returns unknown(requires-unavailable-theory) for complex eigenvalues', () => {`
- **`src/tests/derivation_first_class.test.ts`** (2 hits):
  - L59: `it('x^2 = -4 refuses with unknown(requires-unavailable-theory)', () => {`
  - L108: `it('self-verification rejects a corrupted step with unknown(no-convergence)', () => {`
- **`src/tests/dimensional.test.ts`** (1 hit):
  - L75: `it('returns unknown(requires-unavailable-theory) for transcendental violation', () => {`
- **`src/tests/fuel_kleene.test.ts`** (11 hits):
  - L15: `expect(evalVal("\\not :unknown(\"budget-exhausted\")", env)).toEqual({`
  - L24: `const u = ':unknown("budget-exhausted")';`
  - L50: `const u = ':unknown("search-incomplete")';`
  - L76: `expect(evalVal(':unknown("no-convergence") == :unknown("no-convergence")', env)).toEqual({ type: 'bo`
  - L77: `expect(evalVal(':unknown("no-convergence") == 5', env)).toEqual({ type: 'boolean', value: false });`
  - L78: `expect(evalVal(':unknown("no-convergence") != 5', env)).toEqual({ type: 'boolean', value: true });`
  - ... and 5 more lines
- **`src/tests/language_extensions.test.ts`** (1 hit):
  - L396: `const html = typesetStringExpression('unknown(requires-unavailable-theory, "cubics and higher polyno`
- **`src/tests/universality.test.ts`** (2 hits):
  - L53: `it('evaluates non-halting machine under fuel returning unknown(budget-exhausted)', () => {`
  - L129: `it('evaluates Omega combinator (\\x. xx)(\\x. xx) to unknown(budget-exhausted)', () => {`
- **`docs/CONSOLIDATION_ASSESSMENT.md`** (3 hits):
  - L198: `│     • Fuel/Budget tracking: Step/Depth limits -> unknown(budget-exhausted)  │`
  - L262: `∀ E:  Reduce(E) ∈ { Value, ExpressionAST, unknown(budget-exhausted) }`
  - L391: `2. **\`unknown(budget-exhausted, ...)\`** (computation ran out of resources).`

- **`requires-unavailable-theory`** (52 hits):
- **`src/core/algebra/index.ts`** (1 hit):
  - L29: `reason: 'requires-unavailable-theory',`
- **`src/core/algebra/simplify.ts`** (1 hit):
  - L181: `reason: 'requires-unavailable-theory',`
- **`src/core/algebra/solver.ts`** (3 hits):
  - L16: `reason: 'requires-unavailable-theory',`
  - L60: `reason: 'requires-unavailable-theory',`
  - L496: `reason: 'requires-unavailable-theory',`
- **`src/core/evaluator.ts`** (2 hits):
  - L4430: `return makeUnknown('requires-unavailable-theory', err.message || String(err));`
  - L4469: `return makeUnknown('requires-unavailable-theory', err.message || String(err));`
- **`src/core/numeric/matrix.ts`** (2 hits):
  - L281: `// Complex eigenvalues -> return unknown(requires-unavailable-theory)`
  - L282: `return makeUnknown('requires-unavailable-theory', 'Complex eigenvalues require complex number field `
- **`src/core/types.ts`** (1 hit):
  - L613: `| 'requires-unavailable-theory'`
- **`src/tests/algebra_isolate.test.ts`** (5 hits):
  - L70: `it('rejects complex quadratic roots x^2 + 1 = 0 with unknown(requires-unavailable-theory)', () => {`
  - L74: `expect(res.reason).toBe('requires-unavailable-theory');`
  - L113: `expect(res.reason).toBe('requires-unavailable-theory');`
  - L121: `expect(res.reason).toBe('requires-unavailable-theory');`
  - L129: `expect(res.reason).toBe('requires-unavailable-theory');`
- **`src/tests/claim_honesty_and_control.test.ts`** (2 hits):
  - L179: `it('returns unknown(requires-unavailable-theory) for complex eigenvalues', () => {`
  - L182: `expect((res as any).reason).toBe('requires-unavailable-theory');`
- **`src/tests/derivation_first_class.test.ts`** (5 hits):
  - L59: `it('x^2 = -4 refuses with unknown(requires-unavailable-theory)', () => {`
  - L65: `expect(res.reason).toBe('requires-unavailable-theory');`
  - L151: `expect(cubicRes.reason).toBe('requires-unavailable-theory');`
  - L157: `expect(trigRes.reason).toBe('requires-unavailable-theory');`
  - L163: `expect(multDenomRes.reason).toBe('requires-unavailable-theory');`
- **`src/tests/dimensional.test.ts`** (3 hits):
  - L75: `it('returns unknown(requires-unavailable-theory) for transcendental violation', () => {`
  - L79: `expect(value.reason).toBe('requires-unavailable-theory');`
  - L151: `expect(value.reason).toBe('requires-unavailable-theory');`
- **`src/tests/fuel_kleene.test.ts`** (2 hits):
  - L106: `const resSin = evalVal(":sin(:unknown(\"requires-unavailable-theory\"))", env);`
  - L107: `expect(resSin).toMatchObject({ type: 'unknown', reason: 'requires-unavailable-theory' });`
- **`src/tests/language_extensions.test.ts`** (1 hit):
  - L396: `const html = typesetStringExpression('unknown(requires-unavailable-theory, "cubics and higher polyno`
- **`docs/CONSOLIDATION_ASSESSMENT.md`** (1 hit):
  - L275: `| **I6: No Fake Refusals** | Unreducibles stand or exhaust budget | **PASS\*** | Replaced \`requires`
- **`docs/REWRITE_ASSESSMENT.md`** (2 hits):
  - L187: `| **Deletions** | Obstruction enums (SEMANTICS.md) | **19 use sites** | **Deleted** | \`requires-una`
  - L217: `├── Remove 'requires-unavailable-theory' and 'unimplemented-technique'`
- **`docs/SEMANTICS.md`** (21 hits):
  - L187: `- \`requires-unavailable-theory\`: **REMOVED**. This category disguised context boundaries and unhan`
  - L194: `All existing use sites of \`requires-unavailable-theory\` and \`unimplemented-technique\` across the`
  - L198: `| \`src/core/types.ts:575\` | \`UnknownReason\` union | \`'requires-unavailable-theory'\` | **Delete`
  - L200: `| \`src/core/algebra/solver.ts:16\` | \`AlgebraicSolver.isolate\` | \`makeUnknown('requires-unavaila`
  - L201: `| \`src/core/algebra/solver.ts:60\` | \`AlgebraicSolver.solveQuadratic\` ($D < 0$) | \`makeUnknown('`
  - L202: `| \`src/core/algebra/solver.ts:496\` | \`AlgebraicSolver.solvePower\` ($\sqrt[2k]{-c}$) | \`makeUnkn`
  - ... and 15 more lines

- **`unimplemented-technique`** (11 hits):
- **`src/core/types.ts`** (1 hit):
  - L602: `| 'unimplemented-technique'`
- **`docs/REWRITE_ASSESSMENT.md`** (3 hits):
  - L187: `| **Deletions** | Obstruction enums (SEMANTICS.md) | **19 use sites** | **Deleted** | \`requires-una`
  - L207: `│  • 1 test in obstructions_g4.test.ts (unimplemented-technique).          │`
  - L217: `├── Remove 'requires-unavailable-theory' and 'unimplemented-technique'`
- **`docs/SEMANTICS.md`** (7 hits):
  - L188: `- \`unimplemented-technique\`: **REMOVED**. Engine limitations are not mathematical facts. If the en`
  - L194: `All existing use sites of \`requires-unavailable-theory\` and \`unimplemented-technique\` across the`
  - L199: `| \`src/core/types.ts:564\` | \`ObstructionReason\` union | \`'unimplemented-technique'\` | **Delete`
  - L206: `| \`src/core/evaluator.ts:2478\` | \`evalIntegral\` | \`const obstruction = isGaussian ? 'not-elemen`
  - L215: `| \`src/tests/obstructions_g4.test.ts:32, 92\` | Obstruction test suite | Uses \`'unimplemented-tech`
  - L309: `| **C7** | \`src/core/types.ts:564, 575\`<br>\`src/core/algebra/solver.ts:16, 60, 496\`<br>\`src/cor`
  - ... and 1 more lines


---

## 3. Colon Overload: The Many Jobs of `:`

In the Pure Relational Design, `:` was specified to have **exactly one job**: prefixing multi-letter identifier names (`:theta`, `:speed`, `:mass`).

Below is every other use of `:` still reachable in the parser and runtime:

| Overload Site | Example Syntax | Reachability Status | Architectural Target / What It Should Become |
| :--- | :--- | :--- | :--- |
| **1. Named Arguments** | `:Body(:mass: 1.0, :position: ...)`<br>`:ode(..., :dt: 0.05)`<br>`:isolate(eq, :for: x)` | **Reachable** in `src/core/parser.ts` L1767 | **Eliminate**. Relations use positional tuples or algebraic substitutions (`eq \where dt = 0.05`). No procedural named args. |
| **2. Unit / Dimension Annotations** | `\unit :meter : :length`<br>`x = 0 : 3R` | **Reachable** in `src/core/parser.ts` L190 | **Standardize to set membership / keywords** (`\unit :meter \in :length` or explicit dimension declarations). |
| **3. Operator & Rule Metadata** | `\operator ... \precedence: 45 \associativity: left`<br>`\rule r := ... \requires: ...` | **Reachable** in `src/core/parser.ts` L258, L330 | **Standardize without colon** (`\precedence 45`, `\associativity left`, `\requires cond`). |
| **4. Record Updates (`\with`)** | `r \with { field: val, field2: val2 }` | **Reachable** in `src/core/parser.ts` L720 | **Delete with record system**. Replaced by pure coordinate projection and space slicing. |
| **5. Set-Builder Comprehension** | `{ x \in S : x > 0 }` | **Reachable** in `src/core/parser.ts` L1894, L1905 | **Replace with `\where`** (`{ x \in S \where x > 0 }`). |
| **6. Quantifier Separator** | `\forall x : x > 0` | **Reachable** in `src/core/parser.ts` L2203 | **Standardize to comma** (`\forall x, x > 0`). |
| **7. Claim Block Fields** | `\claim c { \statement: ..., \proved_by: ... }` | **Reachable** in `src/core/parser.ts` L2247 | **Standardize to keyword headers** (`\statement ...`, `\proved_by ...`). |
| **8. Frontmatter Headers** | `--- \n :title: ... \n :author: ... \n ---` | **Reachable** in `src/core/tokenizer.ts` L41 | **Eliminate from grammar**. Document titles belong in document metadata/UI, not lexical syntax. |
| **9. Global Assignment Operators** | `:\equiv` (`GLOBAL_ASSIGN`), `:==` | **Reachable** in `src/core/tokenizer.ts` L810 | **Eliminate**. Lexical export directives (`\export name`) replace global mutation. |

---

## 4. Bracket Overload: Uses of `[ ... ]`

Below is every distinct syntactic construct currently using square brackets `[ ... ]`:

1. **List / Array Literals** (`src/core/parser.ts` L1587):
   - Syntax: `[1, 2, 3]`, `[[1, 2], [3, 4]]`
   - Semantics: Constructs an ordered finite `ListValue` or matrix row.
2. **Interval Sets in Set-Membership** (`src/core/parser.ts` L863):
   - Syntax: `x \in [0, 10]`, `x \in [0, 10)`, `x \in (0, 10]`
   - Semantics: Constructs a continuous real domain `IntervalValue`.
3. **Subscript Indexing** (`src/core/parser.ts` L685):
   - Syntax: `v[0]`, `matrix[i, j]`, `traj[2.0]`
   - Semantics: Discrete index subscripting or sample extraction.
4. **Axis Declaration Arguments** (`src/core/parser.ts` L135):
   - Syntax: `\axis[X, Y, Z]`
   - Semantics: Declares coordinate space projection.
5. **Unit Alias Declarations** (`src/core/parser.ts` L2642):
   - Syntax: `\unit N [Newton] = kg * m / s^2`
   - Semantics: Display string alias for unit rendering.
6. **Probability Expectation Operator** (`src/core/parser.ts` L1495):
   - Syntax: `E[X]`
   - Semantics: Expected value operator.

### Unification & Disambiguation Analysis
- **Distinct AST Roles**:
  - In prefix position, `[a, b]` is unambiguously parsed as a `List`.
  - In infix position following `\in` or `\notin`, `[a, b]` is unambiguously parsed as an `Interval` (closed, open, or half-open).
  - In postfix position following an expression, `expr[idx]` is parsed as an `IndexNode`.
  - In directive position following `\axis`, `\axis[X, Y]` is parsed as `AxisDecl`.
- **Can They Be Unified or Do They Need Separate Spellings?**
  - `[a, b]` as a list literal and `x \in [a, b]` as an interval are standard mathematical conventions. They do not collide because their grammatical contexts (prefix value vs `\in` target) are distinct.
  - `\axis[X, Y]` can be unified to comma-separated identifiers without brackets (`\axis X, Y, Z`, matching `\dimension L, M, T` and `\export a, b`).

---

## 5. Additional Forgotten Constructs (Pre-Redesign Legacy)

The following historical subsystems and constructs were identified in the codebase that predate the pure relational redesign:

1. **First-Class Anonymous Lambdas (`x -> expr`, `(x, y) -> expr`)**:
   - Implemented in `src/core/parser.ts` L1629–1655, `src/core/types.ts` (`LambdaValue`), and `src/core/evaluator.ts` (`invokeLambda`).
   - In V2, first-class anonymous functions are replaced by relational definitions (`\forall x, f(x) = ...`) and spatial evaluation.
2. **Procedural Numerical ODE Solver (`:ode(...)`)**:
   - `src/core/simulation/ode_solver.ts` and `src/tests/part_c_ode.test.ts` retain a procedural Runge-Kutta solver `:ode(diff_eq, ic, t \in 0..T, :dt: 0.05)`.
   - In V2, differential equations are spatial relations ($d//dt y = -k \cdot y$) integrated directly by the manifold continuation engine without procedural call wrappers.
3. **Discrete Trajectory Snapshot Arrays (`TrajectoryValue`)**:
   - `src/core/types.ts` and `src/core/simulation/trajectory.ts` maintain discrete time-step sample buffers with linear interpolation (`traj[t]`).
   - In V2, trajectories are continuous spatial curve manifolds in $(x, y, :time)$ space.
4. **Drawing Primitives (`:point`, `:segment`, `:arrow`, `:circle`, `:polygon`, `:path`, `:label`, `:patch`, `:field`)**:
   - Retained in `src/core/types.ts` (`DrawingPrimitiveValue`), `src/document/editor.ts`, and `optics.ax` / `physics.ax`.
   - In V2, geometry is rendered directly from algebraic zero-sets ($R = 0$) by Marching Squares/Cubes, not imperative vector sprites.
5. **Procedural Functional Builtins (`find`, `least`, `unfold`, `fold`, `count`, `all`, `any`)**:
   - Retained in `src/core/evaluator.ts` L2700–3150.
   - In V2, mathematical search is expressed as relational constraints with compiled recurrences.
6. **Described Values & Obstruction Cards (`DescribedValue`, Kind A–H Cards)**:
   - `src/core/types.ts` and `src/document/editor.ts` L2189–2230 contain legacy cards reporting "Obstruction to Evaluation" for incomplete expressions.
7. **Hardcoded Dimensional Assertions (`:check(expr, :is: "...")`)**:
   - `src/core/parser.ts` L2300–2340 and `src/document/editor.ts` L2536–2556 retain hardcoded dimensional check wrappers.
8. **YAML Document Frontmatter Stripping**:
   - `src/core/tokenizer.ts` L41–47 and `src/core/parser.ts` L2950–2955 silently intercept and strip `--- ... ---` frontmatter.

---

## 6. Documents Audit Table: Complete `documents/` Directory

Below is the execution and syntax audit for every `.ax` file in `documents/`:

| # | Document Path | Parses? | Evaluates? | Renders? | Errors / Warnings | Mixed Syntax Flags |
| :-: | :--- | :-: | :-: | :-: | :--- | :--- |
| 1 | `collision.ax` | OK | OK | OK | None | `simulate()` |
| 2 | `constants/e.ax` | OK | OK | OK | None | **CLEAN** |
| 3 | `constants/phi.ax` | OK | OK | OK | None | **CLEAN** |
| 4 | `constants/pi.ax` | OK | OK | OK | None | **CLEAN** |
| 5 | `constants/tau.ax` | OK | OK | OK | None | **CLEAN** |
| 6 | `derivation_export_demo.ax` | OK | OK | OK | None | `bare-and, map()` |
| 7 | `e.ax` | OK | OK | OK | None | **CLEAN** |
| 8 | `integrator_comparison.ax` | OK | OK | OK | None | `simulate(), map(), graph()` |
| 9 | `lib/abs.ax` | OK | OK | OK | None | **CLEAN** |
| 10 | `lib/bisect.ax` | OK | OK | OK | None | **CLEAN** |
| 11 | `lib/ceil.ax` | OK | OK | OK | None | **CLEAN** |
| 12 | `lib/exp.ax` | OK | OK | OK | None | **CLEAN** |
| 13 | `lib/floor.ax` | OK | OK | OK | None | **CLEAN** |
| 14 | `lib/newton.ax` | OK | OK | OK | None | **CLEAN** |
| 15 | `lib/numbertheory.ax` | OK | OK | OK | None | **CLEAN** |
| 16 | `lib/sqrt.ax` | OK | OK | OK | None | **CLEAN** |
| 17 | `lib/trig.ax` | OK | OK | OK | None | **CLEAN** |
| 18 | `linear.ax` | OK | OK | OK | None | `bare-in, record` |
| 19 | `linear_problem.ax` | OK | OK | OK | None | `bare-and, record` |
| 20 | `optics.ax` | OK | OK | OK | None | `simulate(), record, view for` |
| 21 | `orbit.ax` | OK | OK | OK | None | `simulate()` |
| 22 | `pendulum.ax` | OK | OK | OK | None | `simulate()` |
| 23 | `phi.ax` | OK | OK | OK | None | **CLEAN** |
| 24 | `physics.ax` | OK | OK | OK | None | `record, view for` |
| 25 | `physics_problem.ax` | OK | OK | OK | None | `bare-and` |
| 26 | `pi.ax` | OK | OK | OK | None | **CLEAN** |
| 27 | `projectile.ax` | OK | OK | OK | None | `simulate()` |
| 28 | `spring.ax` | OK | OK | OK | None | `simulate()` |
| 29 | `statistics.ax` | OK | OK | OK | None | `record` |
| 30 | `statistics_problem.ax` | OK | OK | OK | None | `bare-and` |
| 31 | `tau.ax` | OK | OK | OK | None | **CLEAN** |
| 32 | `three_page_lab_report.ax` | OK | OK | OK | None | `simulate(), map(), graph()` |
| 33 | `thrown_ball.ax` | OK | OK | OK | None | `simulate(), map(), graph()` |

### Document State Summary
- **Total Documents in `documents/`**: **33**
- **Clean V2 Pure Relational Documents**: **17** (51.5%)
  - All standard libraries (`lib/abs.ax`, `lib/bisect.ax`, `lib/ceil.ax`, `lib/exp.ax`, `lib/floor.ax`, `lib/newton.ax`, `lib/numbertheory.ax`, `lib/sqrt.ax`, `lib/trig.ax`)
  - All mathematical constant modules (`constants/e.ax`, `constants/phi.ax`, `constants/pi.ax`, `constants/tau.ax`, and roots)
- **Documents in Mixed Syntax State**: **16** (48.5%)
  - 10 Physics / Optics worked documents using procedural `simulate()`, `map()`, or `Body` records (`collision.ax`, `integrator_comparison.ax`, `optics.ax`, `orbit.ax`, `pendulum.ax`, `physics.ax`, `projectile.ax`, `spring.ax`, `three_page_lab_report.ax`, `thrown_ball.ax`).
  - 6 Domain library and problem documents using legacy `record`, `bare-in`, or `bare-and` (`linear.ax`, `linear_problem.ax`, `statistics.ax`, `statistics_problem.ax`, `physics_problem.ax`, `derivation_export_demo.ax`).
