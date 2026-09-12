# Axine Exploration Defects & Invariant Violations Report

> **Harness Configuration**: 1,000,000 Generated Cases across 10 AST & Relational Categories  
> **PRNG Algorithm**: Seeded Mulberry32 with Deterministic Seed Per Iteration ($i \in [0, 1000000)$)  
> **Reference Baselines**: [`AGENTS.md`](../AGENTS.md), [`docs/SEMANTICS.md`](./SEMANTICS.md), [`docs/SYNTAX_V2.md`](./SYNTAX_V2.md), [`docs/CONSOLIDATION_ASSESSMENT.md`](./CONSOLIDATION_ASSESSMENT.md)  
> **Status**: Read-Only Audit & Exploration Data (No Engine Fixes Applied)

---

## Executive Summary: Invariant Verification Sweep

The widened property-based generator was executed for **1,000,000 iterations** against the full Axine operational triad (Ontology, Reduction, Observation) checking Systemic Invariants **I1 through I8** and Expression Invariants **I1-Expr through I4-Expr**.

```
                           1,000,000 ITERATION HARNESS RESULTS
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ Total Cases Generated & Evaluated:       1,000,000                                      │
│ Total Execution Time:                    144.82 seconds (6,905 iterations/second)       │
│ Cleanly Verified Cases:                  975,002 (97.50%)                               │
│ Total Invariant Violations Recorded:     24,998 (2.50%)                                 │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Invariant Violation Census by Invariant

| Invariant | Description | Tested Target | Total Violations | Status |
| :--- | :--- | :--- | :---: | :---: |
| **I1** | Reduction Idempotency | $\mathcal{R}(\mathcal{R}(E)) \equiv \mathcal{R}(E)$ | 0 | **PASS** |
| **I2** | Compiler-Reducer Equivalence | $f_{\text{comp}}(\vec{c}) \approx [\mathcal{R}(E)]_{\vec{c}}$ | 0 | **PASS** |
| **I3** | Extensional Observation Invariance | $R_1 \iff R_2 \implies \text{Sample}(R_1) \equiv \text{Sample}(R_2)$ | 0 | **PASS** |
| **I4** | Free-Variable & Spatial Concordance | $n_{\text{dim}} \equiv \|\mathrm{FreeVars}(\text{AST})\| \equiv \|\mathrm{Coords}\|$ | 0 | **PASS** |
| **I5** | Context Field Axioms | Commutativity, Associativity, Distributivity | 0 | **PASS** |
| **I6** | Honest Stance on Unreducibles | Value $\lor$ Expression $\lor$ `unknown(budget-exhausted)` | 0 | **PASS** |
| **I7** | Operator Standing & Syntax Parity | Standing AST representation of all user/operator rules | **24,998** | **FAIL** |
| **I8** | Dimension & Unit Preservation | Physical unit & polynomial degree preservation | 0 | **PASS** |
| **I1-Expr** | Expression Reduction Idempotence | $\mathcal{R}(\mathcal{R}(E)) \equiv \mathcal{R}(E)$ on `ExpressionValue` | 0 | **PASS** |
| **I2-Expr** | Reducer vs Compiler on AST Closures | Parameterized expression evaluation agreement | 0 | **PASS** |
| **I3-Expr** | Substitution Reflexivity | $E[x \mapsto v] == E[x \mapsto v]$ structural equality | 0 | **PASS** |
| **I4-Expr** | Round-trip Parsing & Formatting | $F(P(F(N))) \equiv F(N)$ formatter idempotency | 0 | **PASS** |

---

## Defect Inventory & Root Cause Analysis

### Defect D3: Parser Greedy Token Gobbling in `\rule` Inside Block Scopes (Invariant I7 Broken)

- **Invariant Broken**: **I7 (Operator Standing)** / Parser Statement Boundary Delimitation
- **Total Occurrences in 1,000,000 Run**: **24,998 cases** (100% of generated `\rule` declarations within `{ ... }` blocks containing trailing statements).
- **Reproduction Seeds**:
  - `Seed 43`: `{\rule :cube(:x) => :x * :x * :x; :cube(2)}`
  - `Seed 123`: `{\rule :cube(:x) => :x * :x * :x; :cube(2)}`
  - `Seed 143`: `{\rule :cube(:x) => :x * :x * :x; :cube(3)}`
  - `Seed 203`: `{\rule :cube(:x) => :x * :x * :x; :cube(2)}`
  - `Seed 283`: `{\rule :cube(:x) => :x * :x * :x; :cube(3)}`
  - `Seed 303`: `{\rule :cube(:x) => :x * :x * :x; :cube(5)}`
  - `Seed 323`: `{\rule :cube(:x) => :x * :x * :x; :cube(3)}`
  - `Seed 373`: `{\rule :cube(:x) => :x * :x * :x; :cube(6)}`
  - `Seed 423`: `{\rule :cube(:x) => :x * :x * :x; :cube(4)}`
  - `Seed 533`: `{\rule :cube(:x) => :x * :x * :x; :cube(1)}`

#### Technical Root Cause
In `src/core/parser.ts` lines 348–358:
```typescript
const replTokens: Token[] = [];
let rdepth = 0;
while (this.peek().type !== 'EOF') {
  const t = this.peek().type;
  if (rdepth === 0 && t === 'REQUIRES') {
    break;
  }
  if (t === 'LPAREN' || t === 'LBRACKET' || t === 'LBRACE') rdepth++;
  else if (t === 'RPAREN' || t === 'RBRACKET' || t === 'RBRACE') rdepth--;
  replTokens.push(this.advance());
}
```
When `\rule` is declared inside a block or followed by a statement separator `;`:
1. The parser accumulates replacement tokens in a while loop that checks *only* for `EOF` or `REQUIRES`.
2. It does not check for `;`, newline statement boundaries, or the enclosing block's closing brace `}` at depth 0.
3. Consequently, it consumes the trailing statement `:cube(2)` and the closing `}` into the `RuleDecl` replacement token stream.
4. When the outer block parser subsequently attempts to match the closing `}` of the block, it encounters `EOF`, throwing:
   `MathError: Unexpected token 'EOF'. Expected }`

#### Impact
Equational rewrite rules (`\rule`) work only when they are the final or sole top-level declaration in a file, but fail with a syntax error when composed inside local lexical blocks with semicolons.

---

### Defect D4: Block-Level Trailing List Disambiguation without Semicolons

- **Category**: Lexer/Parser Lookahead Ambiguity
- **Reproduction**:
  ```axine
  {
    :n1 = 1
    :n2 = 2
    [:n1, :n2]
  }
  ```
- **Error Produced**: `MathError: Unexpected token ','. Expected ]`
- **Root Cause**:
  In `src/core/parser.ts` line 735:
  ```typescript
  // Check for indexing: left[index]
  if (this.peek().type === 'LBRACKET' && precedence < PREC_POSTFIX) {
    this.advance(); // consume [
    const indexNode = this.parseExpression(PREC_NONE);
    const rBracket = this.expect('RBRACKET', ']');
    ...
  }
  ```
  When line 2 ends with literal `2` and line 3 begins with `[` without an explicit `;`, the expression parser greedily treats `2[:n1, :n2]` as an array indexing operator on scalar `2`. The index parser parses `:n1` and immediately expects `]`, but finds `,`, causing a syntax failure.

---

### Defect D5: Library Transcendental Function Unification vs Pure Relational Stance

- **Category**: Standard Library Scope Resolution
- **Reproduction**:
  Evaluating `:sin(x)` without explicit `\import "lib/trig.ax"` produces:
  - Outside Application Mode: parsed as implicit multiplication $s \cdot i \cdot n \cdot x$ (a 4D space spanned by `i, n, s, x`).
  - Inside Application Mode or with `:sin(x)`: if not imported, throws `Function 'sin' is not defined`.
- **Finding**:
  In pure Axine, `:sin`, `:cos`, `:tan`, `:exp`, `:ln`, `:sqrt` are implemented in pure Axine inside `documents/lib/*.ax` rather than being hardcoded TypeScript builtins. Documents relying on transcendental functions must explicitly declare `\import "lib/trig.ax"` or have standard prelude autoloading.

---

## Complete Seed Reproduction Table (Sample of 50 Failing Seeds)

Every failing case from the 1,000,000 fuzz run is completely deterministic and reproducible using the seeds below with `Mulberry32`:

| Seed # | Category | Generating Axine Expression | Expected Outcome | Actual Outcome |
| :---: | :--- | :--- | :--- | :--- |
| **43** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(2)}` | Reduce to rational `8/1` | Threw `Unexpected token 'EOF'` |
| **123** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(2)}` | Reduce to rational `8/1` | Threw `Unexpected token 'EOF'` |
| **143** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(3)}` | Reduce to rational `27/1` | Threw `Unexpected token 'EOF'` |
| **203** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(2)}` | Reduce to rational `8/1` | Threw `Unexpected token 'EOF'` |
| **283** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(3)}` | Reduce to rational `27/1` | Threw `Unexpected token 'EOF'` |
| **303** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(5)}` | Reduce to rational `125/1` | Threw `Unexpected token 'EOF'` |
| **323** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(3)}` | Reduce to rational `27/1` | Threw `Unexpected token 'EOF'` |
| **373** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(6)}` | Reduce to rational `216/1` | Threw `Unexpected token 'EOF'` |
| **423** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(4)}` | Reduce to rational `64/1` | Threw `Unexpected token 'EOF'` |
| **533** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(1)}` | Reduce to rational `1/1` | Threw `Unexpected token 'EOF'` |
| **563** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(2)}` | Reduce to rational `8/1` | Threw `Unexpected token 'EOF'` |
| **593** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(3)}` | Reduce to rational `27/1` | Threw `Unexpected token 'EOF'` |
| **603** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(3)}` | Reduce to rational `27/1` | Threw `Unexpected token 'EOF'` |
| **743** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(5)}` | Reduce to rational `125/1` | Threw `Unexpected token 'EOF'` |
| **763** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(2)}` | Reduce to rational `8/1` | Threw `Unexpected token 'EOF'` |
| **943** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(3)}` | Reduce to rational `27/1` | Threw `Unexpected token 'EOF'` |
| **953** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(2)}` | Reduce to rational `8/1` | Threw `Unexpected token 'EOF'` |
| **973** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(5)}` | Reduce to rational `125/1` | Threw `Unexpected token 'EOF'` |
| **983** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(5)}` | Reduce to rational `125/1` | Threw `Unexpected token 'EOF'` |
| **1113** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(6)}` | Reduce to rational `216/1` | Threw `Unexpected token 'EOF'` |
| **1143** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(3)}` | Reduce to rational `27/1` | Threw `Unexpected token 'EOF'` |
| **1153** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(2)}` | Reduce to rational `8/1` | Threw `Unexpected token 'EOF'` |
| **1193** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(4)}` | Reduce to rational `64/1` | Threw `Unexpected token 'EOF'` |
| **1233** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(1)}` | Reduce to rational `1/1` | Threw `Unexpected token 'EOF'` |
| **1373** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(4)}` | Reduce to rational `64/1` | Threw `Unexpected token 'EOF'` |
| **1423** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(6)}` | Reduce to rational `216/1` | Threw `Unexpected token 'EOF'` |
| **1473** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(3)}` | Reduce to rational `27/1` | Threw `Unexpected token 'EOF'` |
| **1533** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(2)}` | Reduce to rational `8/1` | Threw `Unexpected token 'EOF'` |
| **1543** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(5)}` | Reduce to rational `125/1` | Threw `Unexpected token 'EOF'` |
| **1633** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(2)}` | Reduce to rational `8/1` | Threw `Unexpected token 'EOF'` |
| **1643** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(5)}` | Reduce to rational `125/1` | Threw `Unexpected token 'EOF'` |
| **1663** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(2)}` | Reduce to rational `8/1` | Threw `Unexpected token 'EOF'` |
| **1743** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(4)}` | Reduce to rational `64/1` | Threw `Unexpected token 'EOF'` |
| **1823** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(5)}` | Reduce to rational `125/1` | Threw `Unexpected token 'EOF'` |
| **1963** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(3)}` | Reduce to rational `27/1` | Threw `Unexpected token 'EOF'` |
| **2043** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(2)}` | Reduce to rational `8/1` | Threw `Unexpected token 'EOF'` |
| **2063** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(5)}` | Reduce to rational `125/1` | Threw `Unexpected token 'EOF'` |
| **2123** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(1)}` | Reduce to rational `1/1` | Threw `Unexpected token 'EOF'` |
| **2173** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(2)}` | Reduce to rational `8/1` | Threw `Unexpected token 'EOF'` |
| **2213** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(3)}` | Reduce to rational `27/1` | Threw `Unexpected token 'EOF'` |
| **2253** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(6)}` | Reduce to rational `216/1` | Threw `Unexpected token 'EOF'` |
| **2263** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(3)}` | Reduce to rational `27/1` | Threw `Unexpected token 'EOF'` |
| **2293** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(5)}` | Reduce to rational `125/1` | Threw `Unexpected token 'EOF'` |
| **2303** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(4)}` | Reduce to rational `64/1` | Threw `Unexpected token 'EOF'` |
| **2323** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(1)}` | Reduce to rational `1/1` | Threw `Unexpected token 'EOF'` |
| **2413** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(4)}` | Reduce to rational `64/1` | Threw `Unexpected token 'EOF'` |
| **2523** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(2)}` | Reduce to rational `8/1` | Threw `Unexpected token 'EOF'` |
| **2533** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(4)}` | Reduce to rational `64/1` | Threw `Unexpected token 'EOF'` |
| **2553** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(5)}` | Reduce to rational `125/1` | Threw `Unexpected token 'EOF'` |
| **2603** | `user_structures_operators` | `{\rule :cube(:x) => :x * :x * :x; :cube(6)}` | Reduce to rational `216/1` | Threw `Unexpected token 'EOF'` |

---

## Conclusion & State of the Engine

1. **Arithmetic, Spatial, and Compiler Stability (I1-I6, I8)**: Across 1,000,000 randomized and composite expressions spanning high-dimensional relations ($1 \dots 8$ variables), recursive quantifiers, collections, folds, maps, and algebraic field transformations, the engine maintained **100% agreement** between the reducer, compiler, and sampler.
2. **Defect D3 Isolated**: The single systematic invariant failure uncovered by the 1M iteration fuzz run is the greedy `replTokens` loop in `src/core/parser.ts:350`, which fails to respect `;` and `}` statement boundaries inside lexical blocks.
