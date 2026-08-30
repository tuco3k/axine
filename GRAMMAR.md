# Mathematical Turing-Complete Notation Language — Formal Grammar & Semantics

## 1. Lexical Grammar

```ebnf
digit          = [0-9] ;
letter         = [a-zA-Z_] | unicode_math_glyph ;
identifier     = letter , { letter | digit } ;
number         = digit+ , [ "." , digit+ ] ;
string         = '"' , { char - '"' | '\"' } , '"' ;

unicode_math   = "π" | "τ" | "ϕ" | "√" | "≤" | "≥" | "≠" | "×" | "÷" | "−" | "≡" | "Σ" | "Π" | "∫" | "∂" ;
```

---

## 2. Operator Precedence Hierarchy (Tightest to Loosest)

| Precedence | Level | Associativity | Operators / Syntax | Examples |
|---|---|---|---|---|
| 80 | Postfix | Left | `!`, superscript digits `²`, `³`, `ⁿ`, indexing `[i]` | `5!`, `x²`, `A[0]` |
| 70 | Pow | Right | `^` | `2^3^2` = $2^{(3^2)}$ |
| 60 | Unary | Right | `+`, `-`, `√`, `not`, differentials `d//dx`, `∂//∂x` | `-x`, `√16`, `not p`, `d//dx x^2` |
| 50 | Implicit Mul | Left | Adjacent identifiers / numbers / calls | `2x`, `x y`, `sin x` |
| 40 | Explicit Mul | Left | `*`, `/`, `//`, `%`, `·`, `×`, `÷` | `a * b`, `a / b`, `a // b` |
| 30 | Additive | Left | `+`, `-`, `−` | `a + b`, `a - b` |
| 20 | Comparison & In | Non-assoc | `=`, `==`, `!=`, `≠`, `<`, `<=`, `≤`, `>`, `>=`, `≥`, `≡`, `in`, `..` | `x in 1..10`, `a ≡ b` |
| 15 | Logical And | Left | `and`, `∧` | `p and q` |
| 10 | Logical Or | Left | `or`, `∨` | `p or q` |
| 0  | Top-level | None | Statements, blocks `{ ... }`, definitions `:=`, `:≡`, `:==`, `claim` | `x := 5`, `{ a := 1; a + 1 }` |

---

## 3. Ambiguity Resolution Table

| Expression | Parse Interpretation | AST Representation | Mathematical Rationale |
|---|---|---|---|
| `2x` | Implicit multiplication | `BinaryOp('*', Number(2), Id('x'), isImplicit=true)` | Standard coefficient notation $2x$ |
| `xy` | Single identifier `xy` (if undeclared $\to$ error) | `Identifier('xy')` | Variable names can be multi-letter |
| `x y` | Implicit product of `x` and `y` | `BinaryOp('*', Id('x'), Id('y'), isImplicit=true)` | Whitespace demarcates distinct factors $x \cdot y$ |
| `a/bc` | $a / (b \cdot c)$ if `bc` undeclared identifier | `BinaryOp('/', Id('a'), Id('bc'))` | Denominator is single identifier token |
| `a / b c` | $(a / b) \cdot c$ | `BinaryOp('*', BinaryOp('/', Id('a'), Id('b')), Id('c'))` | Left-to-right explicit division and implicit product |
| `a // b` | Stacked fraction $a \over b$ | `BinaryOp('/', Id('a'), Id('b'))` | Stacked fraction notation with identical rational semantics |
| `sin x` | Bare function application $\sin(x)$ | `FunctionCall('sin', [Id('x')], isBare=true)` | Known math function takes tight bare argument |
| `sin(x)` | Function call $\sin(x)$ | `FunctionCall('sin', [Id('x')])` | Standard parenthesized function call |
| `2^3^2` | $2^{(3^2)} = 2^9 = 512$ | `BinaryOp('^', Number(2), BinaryOp('^', Number(3), Number(2)))` | Exponentiation is right-associative |
| `-x^2` | $-(x^2)$ | `UnaryOp('-', BinaryOp('^', Id('x'), Number(2)))` | Powers bind tighter than unary negation |

---

## 4. Kleene Three-Valued Logic Truth Tables

### Negation (`not`)
| $p$ | $\text{not } p$ |
|---|---|
| `true` | `false` |
| `false` | `true` |
| `unknown` | `unknown` |

### Conjunction (`and`)
| $p$ | $q$ | $p \text{ and } q$ | Short-circuit Behavior |
|---|---|---|---|
| `true` | `true` | `true` | Evaluates $q$ |
| `true` | `false` | `false` | Evaluates $q$ |
| `true` | `unknown` | `unknown` | Evaluates $q$ |
| `false` | any (including loop) | `false` | Short-circuits immediately without evaluating $q$ |
| `unknown` | `true` | `unknown` | Evaluates $q$ |
| `unknown` | `false` | `false` | Evaluates $q$ |
| `unknown` | `unknown` | `unknown` | Propagates unknown |

### Disjunction (`or`)
| $p$ | $q$ | $p \text{ or } q$ | Short-circuit Behavior |
|---|---|---|---|
| `true` | any (including loop) | `true` | Short-circuits immediately without evaluating $q$ |
| `false` | `true` | `true` | Evaluates $q$ |
| `false` | `false` | `false` | Evaluates $q$ |
| `false` | `unknown` | `unknown` | Evaluates $q$ |
| `unknown` | `true` | `true` | Evaluates $q$ |
| `unknown` | `false` | `unknown` | Evaluates $q$ |
| `unknown` | `unknown` | `unknown` | Propagates unknown |

---

## 5. Lexical Scopes & Blocks

```ebnf
block          = "{" , [ statement , { ( ";" | newline ) , statement } ] , "}" ;
local_assign   = identifier , ":=" , expression ;
global_assign  = identifier , ( ":≡" | ":==" ) , expression ;
func_def       = identifier , "(" , [ param_list ] , ")" , ( ":=" | ":≡" | ":==" ) , expression ;
```

- Blocks `{ s1; s2; ...; sn }` create a private lexical scope child inheriting from outer environment.
- `:=` binds locally within the block.
- `:≡` and `:==` bind globally to the document root environment.
- The block expression returns the value of the final statement $s_n$.
- Functions defined inside a block capture the block's lexical environment (closure) and support mutual recursion.

---

## 6. Formal Claims System

```ebnf
claim_stmt     = "claim" , identifier , "{" , claim_fields , "}" ;
claim_fields   = { claim_field , [ "," | ";" ] } ;
claim_field    = "statement" , ":" , string
               | "proved_by" , ":" , string
               | "kind" , ":" , ( "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" )
               | "shadow" , ":" , expression
               | "expect" , ":" , expression ;
```

- Every claim contains a mathematical proposition, citation, classification kind, finite shadow expression, and expected value.
- Kind H claims strictly evaluate to `unknown(not-finitely-checkable)` and cite their human proof.

---

## 7. Graphing & Multi-Surface 3D Composition

```ebnf
graph_call   = "graph" , "(" , expr_list , [ "," , domain_spec ] , ")" ;
domain_spec  = identifier , "in" , range , [ "," , identifier , "in" , range ] ;
```

- When multiple expressions with two shared free variables are provided (e.g. `graph(f(x, y), g(x, y), x in a..b, y in c..d)`), the plotter composes all surfaces into a **single 3D coordinate frame**.
- The surfaces are depth-sorted together polygon-by-polygon using quad subdivision and Painter's algorithm, yielding accurate mutual occlusion and intersection seams.

