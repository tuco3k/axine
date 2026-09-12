# Axine — Formal Grammar & Lexical Specification

Axine enforces unambiguous parsing rules derived from standard mathematical literature.

---

## 1. The Core Lexical Rules: `:`, `\`, and Bare Letters

1. **Bare Single Letters are Variables**:
   Any unadorned single letter ($x, y, z, a, b$) is a single-letter variable. Adjacent bare letters represent implicit multiplication:
   - `xy` parses as $x \cdot y$
   - `abc` parses as $a \cdot b \cdot c$
   - `2x` parses as $2 \cdot x$

2. **The Colon Prefix (`:`) Introduces Multi-Letter Identifiers**:
   Any identifier containing two or more letters must begin with a colon (`:`):
   - `:sin`, `:cos`, `:theta`, `:alpha`, `:mass`, `:radius`
   - Identifier characters include letters, digits, and underscores (`:x_pos`, `:dt_2`).

3. **Parentheses on Single Letters Denote Multiplication**:
   - `f(x)` parses strictly as $f \cdot x$.
   - To apply a function, use a multi-letter or colon-prefixed identifier: `:f(x)` or `Func(x)`.

4. **The Backslash Prefix (`\`) Introduces Language Keywords**:
   All language commands, keywords, logical connectives, and syntactic forms begin with `\` (e.g. `\axis`, `\forall`, `\match`, `\rule`).

5. **Single Equality Operator (`=`)**:
   `=` is the only equality and binding operator. Imperative assignment (`:=`) does not exist.

---

## 2. Operator Precedence Hierarchy

| Precedence | Level | Associativity | Operators / Syntax | Examples |
| :---: | :--- | :--- | :--- | :--- |
| **90** | Postfix | Left | `!`, superscript digits (`²`, `³`), member access (`.`), indexing (`[i]`), matrix modifiers (`^T`, `^\dagger`, `^-1`) | `5!`, `x²`, `v.1`, `M[0]`, `A^T` |
| **80** | Exponentiation | Right | `^` | `2^3^2` = $2^{(3^2)} = 512$ |
| **70** | Unary | Right | `+`, `-`, `\not`, differentials (`d//dx`, `\partial//\partial x`), Nabla (`\nabla`), Hodge (`\star`), brackets (`\|x\|`, `\|\|v\|\|`, `\lfloor x \rfloor`, `\lceil x \rceil`) | `-x`, `d//dx x^2`, `\|x\|` |
| **60** | Implicit Multiplication | Left | Adjacent identifiers, numbers, parenthesized terms | `2x`, `x y`, `a(b + c)` |
| **50** | Explicit Multiplication | Left | `*`, `/`, `//` (stacked fraction), `%`, `\wedge`, `\otimes`, `\oplus` | `a * b`, `a / b`, `a // b` |
| **40** | Bare Call | Left | Known function with unparenthesized argument | `:sin x`, `:ln x` |
| **30** | Additive | Left | `+`, `-` | `a + b`, `a - b` |
| **20** | Relational & Set | Non-assoc | `=`, `==`, `!=`, `<`, `<=`, `>`, `>=`, `\in`, `\notin`, `\subset`, `\subseteq`, `\equiv`, `\iso`, `\homotopic` | `x^2 + y^2 = 4`, `x \in S` |
| **10** | Range | Non-assoc | `..` | `1..10`, `0..N \step 2` |
| **7** | Logical Not | Right | `\not` | `\not p` |
| **6** | Logical And | Left | `\and`, `\land` | `p \and q` |
| **5** | Logical Or | Left | `\or`, `\lor` | `p \or q` |
| **4** | Domain Restriction | Non-assoc | `\where` | `y = \sqrt(x) \where x \ge 0` |
| **0** | Block / Top-Level | None | Statements, blocks (`{ ... }`), declarations | `{\axis x, y; x = y}` |

---

## 3. Ambiguity Resolution Table

| Expression | Parse Interpretation | AST Representation | Mathematical Rationale |
| :--- | :--- | :--- | :--- |
| `2x` | Implicit multiplication | `BinaryOp('*', Number(2), Id('x'), isImplicit=true)` | Coefficient notation $2x \equiv 2 \cdot x$. |
| `xy` | Implicit multiplication | `BinaryOp('*', Id('x'), Id('y'), isImplicit=true)` | Adjacent bare letters multiply ($x \cdot y$). |
| `:theta` | Single multi-letter variable | `Identifier('theta')` | Colon prefix identifies multi-letter word. |
| `a/bc` | $a / (b \cdot c)$ | `BinaryOp('/', Id('a'), BinaryOp('*', Id('b'), Id('c')))` | `bc` parses as product $b \cdot c$. |
| `a / b c` | $(a / b) \cdot c$ | `BinaryOp('*', BinaryOp('/', Id('a'), Id('b')), Id('c'))` | Left-to-right explicit division followed by product. |
| `a // b` | Stacked fraction $\frac{a}{b}$ | `BinaryOp('/', Id('a'), Id('b'))` | Stacked fraction display with exact rational semantics. |
| `f(x)` | Multiplication $f \cdot x$ | `BinaryOp('*', Id('f'), Id('x'), isImplicit=true)` | Single letter followed by parenthesized term multiplies. |
| `:f(x)` | Function application $f(x)$ | `FunctionCall('f', [Id('x')])` | Colon-prefixed callee applies function. |
| `2^3^2` | $2^{(3^2)} = 2^9 = 512$ | `BinaryOp('^', Number(2), BinaryOp('^', 3, 2))` | Exponentiation is right-associative. |
| `-x^2` | $-(x^2)$ | `UnaryOp('-', BinaryOp('^', Id('x'), Number(2)))` | Exponentiation binds tighter than unary negation. |
| `d//dx :f(x)` | $\frac{d}{dx}[f(x)]$ | `Diff('x', FunctionCall('f', [Id('x')]))` | Differential operator binds to following operand. |
| `d//dx :f(x) :g(x)` | $(\frac{d}{dx}[f(x)]) \cdot g(x)$ | `BinaryOp('*', Diff('x', FunctionCall('f', [Id('x')])), FunctionCall('g', [Id('x')]))` | Differentiator acts on immediate term; trailing factors multiply. |
| `d//dx (:f(x) * :g(x))` | $\frac{d}{dx}[f(x) \cdot g(x)]$ | `Diff('x', BinaryOp('*', FunctionCall('f', [Id('x')]), FunctionCall('g', [Id('x')])))` | Parentheses group product under derivative. |

---

## 4. Backslash Command Inventory

### Coordinate Spaces & Manifolds
- `\axis x, y, z;` — Declares coordinate axes for geometric manifolds inside a block.

### Logic & Quantifiers
- `\forall <vars> \in <collection>, <predicate>` — Bounded universal quantifier.
- `\exists <vars> \in <collection>, <predicate>` — Bounded existential quantifier.
- `\exists_unique <vars> \in <collection>, <predicate>` (or `\exists!`) — Bounded unique existential quantifier.
- `\and`, `\or`, `\not` — Logical connectives.

### Homoiconic Expressions & Pattern Rewriting
- `\rule <name>: <pattern> = <replacement> [\requires <condition>]` — Equational rewrite rule.
- `\match <expr> { \case <pattern>: <result>, ... }` — Structural AST pattern matching.
- `\build <NodeType>(<args>)` — Structural AST synthesis.
- `\quote(<expr>)` — Suppresses evaluation, returning an unevaluated `ExpressionValue`.
- `\unquote(<expr>)` — Evaluates a previously quoted expression.

### Collections & Aggregations
- `\set { <elem1>, <elem2>, ... }` — Finite set constructor.
- `\set { <elem> \where <predicate> }` — Set comprehension over discrete domain.
- `\multiset { ... }` — Multiset constructor with element multiplicities.
- `\fold <op> \over <collection> \from <initial>` — Catamorphism reduction.
- `\map <relation> \over <collection>` — Elementwise mapping.

### Conditionals & Domain Branching
- `\if <cond> \then <expr1> \else <expr2>` — Inline conditional expression.
- `\cases { \when <cond1>: <expr1>, ..., \otherwise: <expr_default> }` — Piecewise region definition.
- `<expr> \where <predicate>` — Domain filter on relations.

### Modules & Namespaces
- `\module <name>` — Declares module namespace.
- `\import "<path>"` / `\import "<path>" \as <alias>` — Module import.
- `\from "<path>" \import <sym1>, <sym2>` — Selective symbol import.
- `\unimport "<path>"` — Removes imported symbols from local scope.
- `\export <sym1>, <sym2>` — Exports symbols from module.

### Algebraic Structures & Types
- `\structure <name> { \carrier: <set>, \op <op>: <rel>, \axiom <name>: <pred> }` — Algebraic structure declaration.
- `\with <structure> { ... }` — Enters lexical structure scope with overloaded operators.
- `\quotient <structure> \by <relation>` — Equivalence class quotient structure.
- `\homomorphism <name>: <source> \to <target> \map <rel>` — Structure-preserving map.
- `\kind <Name>(<params>) \extends <Parent> { ... }` — Kind hierarchy declaration.

### Dimensions & Units
- `\dimension <dim1>, <dim2>` — Base physical dimension declaration.
- `\unit <name> : <dimension>` / `\unit <name> = <expr>` — Unit declaration.
- `\operator (prefix|postfix|infix) <symbol>(<params>) = <body> \precedence: <n> \associativity: (left|right)` — Custom operator definition.

---

## 5. Formal EBNF Grammar

```ebnf
program        = { statement , [ ";" | newline ] } ;

statement      = axis_decl
               | rule_decl
               | module_decl
               | import_decl
               | export_decl
               | structure_decl
               | kind_decl
               | operator_decl
               | unit_decl
               | dimension_decl
               | expression ;

axis_decl      = "\axis" , ident_list ;
ident_list     = identifier , { "," , identifier } ;

structure_decl = "\structure" , identifier , "{" , { struct_field } , "}" ;
struct_field   = "\carrier" , ":" , expression
               | "\op" , operator_sym , ":" , expression
               | "\axiom" , identifier , ":" , expression ;

with_expr      = "\with" , expression , "{" , program , "}" ;

rule_decl      = "\rule" , [ identifier , ":" ] , expression , ( "=" | "=>" ) , expression , [ "\requires" , [ ":" ] , expression ] ;

match_expr     = "\match" , expression , "{" , { match_case } , "}" ;
match_case     = "\case" , expression , ":" , expression ;

build_expr     = "\build" , identifier , "(" , [ expr_list ] , ")" ;

fold_expr      = "\fold" , expression , "\over" , expression , "\from" , expression ;
map_expr       = "\map" , expression , "\over" , expression ;

quantifier     = ( "\forall" | "\exists" | "\exists_unique" | "\exists!" ) , ident_list , "\in" , expression , "," , expression ;

cases_expr     = "\cases" , "{" , { when_clause } , [ "\otherwise" , ":" , expression ] , "}" ;
when_clause    = "\when" , expression , ":" , expression , [ "," ] ;

block_expr     = "{" , [ "\axis" , ident_list , ";" ] , program , "}" ;

expression     = relation ;
relation       = logic_or , [ ( "=" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "\in" | "\notin" | "\subset" | "\subseteq" | "\equiv" | "\iso" | "\homotopic" ) , logic_or ] ;
logic_or       = logic_and , { ( "\or" | "\lor" ) , logic_and } ;
logic_and      = logic_not , { ( "\and" | "\land" ) , logic_not } ;
logic_not      = [ "\not" ] , addition ;
addition       = multiplication , { ( "+" | "-" ) , multiplication } ;
multiplication = unary , { ( "*" | "/" | "//" | "%" | "\wedge" | "\otimes" | "\oplus" ) , unary } ;

unary          = ( "+" | "-" | "\not" | diff_op | nabla_op ) , unary
               | postfix ;

diff_op        = ( "d//d" | "d/d" | "\partial//\partial" | "\partial/\partial" ) , identifier ;
nabla_op       = ( "\nabla" | "\nabla²" | "\laplacian" ) ;

postfix        = primary , { "!" | superscript_digit | "." , identifier | "[" , expression , "]" | "^T" | "^\dagger" | "^-1" } ;

primary        = number
               | identifier
               | string
               | "(" , [ expr_list ] , ")"
               | "[" , [ expr_list ] , "]"
               | block_expr
               | with_expr
               | match_expr
               | build_expr
               | fold_expr
               | map_expr
               | quantifier
               | cases_expr
               | "\quote" , "(" , expression , ")"
               | "\unquote" , "(" , expression , ")"
               | "\set" , "{" , [ expr_list ] , "}"
               | "\multiset" , "{" , [ expr_list ] , "}"
               | "|" , expression , "|"
               | "||" , expression , "||"
               | "\lfloor" , expression , "\rfloor"
               | "\lceil" , expression , "\rceil" ;

expr_list      = expression , { "," , expression } ;
number         = digit+ , [ "." , digit+ ] , [ ( "e" | "E" ) , [ "+" | "-" ] , digit+ ] ;
identifier     = letter , { letter | digit | "_" }
               | ":" , letter , { letter | digit | "_" } ;
digit          = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" ;
letter         = "a" | ... | "z" | "A" | ... | "Z" | unicode_greek ;
```
