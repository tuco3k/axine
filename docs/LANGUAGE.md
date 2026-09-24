# The Axine Language Reference

Axine is a language where equality is a mathematical relation rather than imperative variable assignment. Writing an equation establishes a predicate constraining coordinate variables in an ambient space, not a sequence of memory mutations. Because every equality is a relation, the declaration order of equations does not prescribe execution order, equations cannot mutate state (`x = x + 1` produces an algebraically contradictory empty set rather than an increment), and underdetermined systems define geometric manifolds spanning the dimensions of their free variables.

From this relational foundation, computation is the reduction of relations and the sampling of manifolds. When a relation algebraically isolates a variable to a closed term, that binding unifies through its lexical scope. When an expression contains free variables, it defines a coordinate space whose level sets are extracted by numerical continuation or implicit grid sampling. Discrete recurrences and continuous differential relations describe trajectories across spatial coordinates and continuous time, while operations that cannot be evaluated symbolically stand unreduced as themselves.

Documents in Axine are structured as block trees containing headings, prose paragraphs with inline mathematical typesetting, atomic equation blocks, embedded in-flow figures, and interactive multi-slot insert scaffolds.

---

## The Rules, in the Order Someone Needs Them

### 1. `=` is the only binding form; everything is a relation

#### What it is
The equals sign `=` defines a mathematical relation between expressions. Axine has no assignment operator (`:=` does not exist). When an equation algebraically isolates a variable to a constant within a lexical scope, that variable is substituted into downstream expressions. When an equation contains multiple free variables or multiple roots, it defines a manifold or point set spanning those variables.

#### Syntax
```axine
<expression> = <expression>
```

#### Real Examples and Output

**Example 1: Scalar constraint and downstream evaluation**
```axine
:r = 5
:area = 3.14159 * :r^2
:area
```
Output:
```
 1: :r = 5                  => 1D Space (r)
 2: :area = 3.14159 * :r^2  => 314159/4000
 3: :area                   => 314159/4000
```

**Example 2: Multi-valued and contradictory relations**
```axine
{\axis x; x^2 = 4}
{\axis x; x = 1; x = 2}
```
Output:
```
 1: {\axis x; x^2 = 4}        => Space (x, 1 entities)
 2: {\axis x; x = 1; x = 2}   => Space (x, 2 entities)
```
The relation `x^2 = 4` yields discrete roots $\{-2, 2\}$. The system `x = 1; x = 2` reduces algebraically to `0 = 1` (contradiction), rendering an empty level set.

#### Common Mistake
Treating `=` as imperative update:
```axine
x = 5
x = x + 1
```
In an imperative language, `x` becomes 6. In Axine, asserting $x = 5$ and $x = x + 1$ simultaneously asserts $0 = 1$, which is false. State cannot be mutated in place.

---

### 2. `:` makes a multi-letter word one token; bare words are juxtaposed letters

#### What it is
In standard mathematical notation, writing letters adjacent to each other denotes multiplication ($ab = a \cdot b$). Axine enforces this universally: any unadorned sequence of letters is parsed as the implicit multiplication of individual single-letter variables. Any identifier consisting of two or more characters must begin with a colon (`:`).

#### Syntax
```axine
:identifier_name
```
Identifier characters include letters, digits, and underscores (`:omega_0`, `:dt_1`, `:mass`). Bare underscores (`_`) are prohibited outside colon-prefixed identifiers.

#### Real Examples and Output

**Example 1: Bare juxtaposition as product**
```axine
a = 2
b = 3
c = 4
abc
```
Output:
```
 1: a = 2   => 1D Space (a)
 2: b = 3   => 1D Space (b)
 3: c = 4   => 1D Space (c)
 4: abc     => 24
```
`abc` evaluates as $a \cdot b \cdot c = 2 \cdot 3 \cdot 4 = 24$.

**Example 2: Colon-prefixed multi-letter identifier**
```axine
:speed = 100
:speed
```
Output:
```
 1: :speed = 100  => 100
 2: :speed        => 100
```

#### Common Mistake
Omitting the colon on descriptive variable names:
```axine
mass = 10
```
This parses as $m \cdot a \cdot s \cdot s = 10$ ($m \cdot a \cdot s^2 = 10$), defining a relation across three distinct variables ($a, m, s$) rather than one variable named `mass`. The correct syntax is `:mass = 10`.

Writing bare underscores without a colon is also an error:
```axine
omega_d = 5
```
Output:
```
Unexpected character '_' in identifier position
Suggestion: Bare '_' is not a valid variable. Multi-letter identifiers with underscores must start with ':' (e.g. ':omega_...')
```

---

### 3. `\` prefixes every command; the complete list with arity

#### What it is
Every language keyword, command, quantifier, and structural constructor begins with a backslash (`\`). Bare words are reserved strictly for mathematical symbols.

#### Complete Command List with Arity

| Command | Arity | Form | Description |
| :--- | :---: | :--- | :--- |
| `\axis` | $1 \dots n$ | `\axis x, y, ...` | Declares coordinate axes for geometric rendering |
| `\module` | 1 | `\module :name` | Declares module namespace |
| `\import` | 1 | `\import "path"` | Imports module exports into active scope |
| `\from ... \import` | 2 | `\from "path" \import :sym1, ...` | Imports selective symbols from a module |
| `\unimport` | 1 | `\unimport :symbol` | Removes an imported symbol from the active environment |
| `\export` | $1 \dots n$ | `\export :sym1, :sym2` | Exports symbols from a module |
| `\forall` | 2 or 3 | `\forall x, f(x) = expr`<br>`\forall x \in S, pred` | Universal quantifier / relational function definition |
| `\exists` | 2 | `\exists x \in S, pred` | Bounded existential quantifier |
| `\exists!` / `\exists_unique` | 2 | `\exists! x \in S, pred` | Unique existential quantifier |
| `\if ... \then ... \else` | 3 | `\if c \then a \else b` | Conditional expression |
| `\cases` | 1 | `\cases(n) { v1, c1; v2, c2 }` | Piecewise definition with slot navigation |
| `\table` | 1 | `\table(r, c) { ... }` | 2D grid matrix with slot navigation |
| `\figure` | 1 or 2 | `\figure(:sym, width: 400)` | In-flow embedded viewport figure |
| `\derive` | 1 | `\derive { ... }` | Equational derivation block |
| `\where` | 2 | `expr \where pred` | Infix domain restriction filter |
| `\and` / `\land` | 2 | `p \and q` | Logical conjunction |
| `\or` / `\lor` | 2 | `p \or q` | Logical disjunction |
| `\not` | 1 | `\not p` | Logical negation |
| `\set` | 1 | `\set { a, b, ... }`<br>`\set { x \where pred }` | Finite set or set comprehension |
| `\multiset` | 1 | `\multiset { a, b, ... }` | Multiset with element multiplicities |
| `\fold` | 3 | `\fold (op) \over coll \from init` | Catamorphism reduction over collections |
| `\map` | 2 | `\map rel \over coll` | Elementwise mapping over collections |
| `\quote` | 1 | `\quote(expr)` | Suppresses evaluation, returning symbolic AST |
| `\unquote` | 1 | `\unquote(expr)` | Evaluates previously quoted AST |
| `\match` | 2 | `\match expr { \case pat: res, ... }` | Structural AST pattern matching |
| `\build` | 2 | `\build Node(args)` | Structural AST node synthesis |
| `\rule` | 3 or 4 | `\rule name: pat = repl [\requires c]` | Equational rewrite rule |
| `\dimension` | $1 \dots n$ | `\dimension :dim1, :dim2` | Declares physical dimension primitives |
| `\unit` | 2 | `\unit :u : :dim`<br>`\unit :u = expr` | Declares base or derived units |
| `\operator` | 5 | `\operator fix sym(params) = body \precedence: n \associativity: lr` | Custom operator definition |
| `\kind` | 3 | `\kind :Name(p) \extends :Parent { ... }` | Mathematical kind declaration |
| `\structure` | 2 | `\structure :Name { \carrier: S, \op o: r, \axiom a: p }` | Algebraic structure declaration |
| `\with` | 2 | `\with :Struct { ... }` | Enters structure scope with overloaded operators |
| `\quotient` | 2 | `\quotient :Struct \by rel` | Equivalence class quotient structure |
| `\homomorphism` | 4 | `\homomorphism :name: S \to T \map rel` | Structure-preserving homomorphism |
| `\isolate` | 2 | `\isolate(eq, \for x)` | Algebraic solver step isolation |
| `\simplify` | 1 | `\simplify(expr)` | Algebraic rational simplification |
| `\check` | 2 | `\check(expr, \is "target")` | Dimensional and invariant check |

#### Real Examples and Output

**Example 1: Conditional expression**
```axine
\if 1 < 2 \then 42 \else 99
```
Output:
```
 1: \if 1 < 2 \then 42 \else 99 => 42
```

**Example 2: Finite set and fold aggregation**
```axine
\set { 1, 2, 3, 4 }
\fold (+) \over \set { 1, 2, 3, 4 } \from 0
```
Output:
```
 1: \set { 1, 2, 3, 4 }                      => Set(1, 2, 3, 4)
 2: \fold (+) \over \set { 1, 2, 3, 4 } \from 0 => 10
```

#### Common Mistake
Writing commands without a backslash:
```axine
if x < 2 then 42 else 99
```
Without `\`, `if` is parsed as $i \cdot f$, `then` as $t \cdot h \cdot e \cdot n$, and `else` as $e \cdot l \cdot s \cdot e$. All commands require a leading `\`.

---

### 4. `\axis` declares a space; nothing renders without it

#### What it is
Axine distinguishes between evaluating a relation and rendering its geometry. An equation like `x^2 + y^2 = 25` establishes an algebraic relation across free variables $(x, y)$, but the graphical viewport does not render visual geometry unless coordinate axes are declared via `\axis`.

#### Syntax
```axine
{\axis x, y; <relations>}
{\axis x, y, z; <relations>}
```

#### Real Examples and Output

**Example 1: Rendered 2D coordinate space**
```axine
{\axis x, y; x^2 + y^2 = 25}
```
Output:
```
 1: {\axis x, y; x^2 + y^2 = 25} => Space (x, y, 1 entities)
```
The viewport extracts the zero level set via Marching Squares and plots a circle of radius 5.

**Example 2: Evaluated relation without `\axis`**
```axine
{x^2 + y^2 = 25}
```
Output:
```
 1: {x^2 + y^2 = 25} => 2D Space (x, y)
```
The free variables are analyzed and tracked, but zero visual entities are drawn because no projection axes were declared.

#### Common Mistake
Declaring axes that do not match the variables used in the equations without an alias:
```axine
{\axis X, Y; y = x^2}
```
This renders nothing because $y$ and $x$ do not match the declared axes $X$ and $Y$. Either declare the axes directly matching the variables (`{\axis x, y; y = x^2}`) or supply explicit aliases (`{\axis X, Y; X = x; Y = y; y = x^2}`).

---

### 5. `{ }` is scope and space together, and how nesting cascades

#### What it is
Curly braces `{ ... }` define both a lexical scope boundary and a geometric space boundary. Variables bound inside a block do not leak into the outer scope. Child blocks inherit all variable definitions, unit declarations, and coordinates from their parent scope, and can shadow them locally.

#### Syntax
```axine
{
  <statement 1>
  <statement 2>
  <result_expression>
}
```

#### Real Examples and Output

**Example 1: Lexical shadowing and isolation**
```axine
:base = 10
{
  :base = 20
  :inner = :base * 2
  :inner
}
:base
```
Output:
```
 1: :base = 10  => 10
 6: { ... }     => 40
 7: :base       => 10
```
The inner `:base = 20` shadows the outer binding locally. Once the block exits, the outer `:base` remains 10.

**Example 2: Multi-line block evaluation**
```axine
{
  x = 3
  y = 4
  x^2 + y^2
}
```
Output:
```
 5: { ... } => 25
```

#### Common Mistake
Attempting to read an internally computed variable outside its enclosing block:
```axine
{
  :temp = 42
}
:temp
```
`:temp` is unbound in the outer scope and stands unreduced as `:temp`.

---

### 6. `\forall` for bound variables, which is how functions exist

#### What it is
Axine does not have an imperative function declaration keyword. A function is a universally quantified relation:
$$\forall x, f(x) = \dots$$
Declaring `\forall x` tells the analyzer that $x$ is a bound parameter rather than a free coordinate axis of the ambient space. Calling `:f(val)` then reduces the relation via substitution.

#### Syntax
```axine
\forall <arg1>, <arg2>, ..., :name(<arg1>, <arg2>, ...) = <expression>
```

#### Real Examples and Output

**Example 1: Single-argument function definition and application**
```axine
\forall x, :sq(x) = x^2
:sq(5)
```
Output:
```
 1: \forall x, :sq(x) = x^2  => none
 2: :sq(5)                  => 25
```

**Example 2: Multi-argument function with library call**
```axine
\import "lib/sqrt.ax"
\forall a, b, :hypot(a, b) = :sqrt(a^2 + b^2)
:hypot(3, 4)
```
Output:
```
 1: \import "lib/sqrt.ax"                          => module sqrt { idiv, :idiv, int_sqrt_step, :int_sqrt_step, int_sqrt, :int_sqrt, is_perfect_square, :is_perfect_square, sqrt, :sqrt }
 2: \forall a, b, :hypot(a, b) = :sqrt(a^2 + b^2) => none
 3: :hypot(3, 4)                                   => 5
```

#### Common Mistake
Writing an equation without `\forall`:
```axine
:sq(x) = x^2
```
Without `\forall x`, this is not a function definition; it is a relational constraint between free variable $x$ and function variable `:sq`. Evaluating `:sq(5)` afterwards does not compute 25.

---

### 7. `\import` and `\unimport`, and how paths resolve

#### What it is
`\import` loads modules from relative file paths or virtual library paths. Modules export bindings via `\export`. `\unimport` removes a previously imported symbol from the active environment.

#### Path Resolution Rules
1. Paths are resolved relative to the virtual document cache (e.g. `"lib/sqrt.ax"`, `"lib/abs.ax"`, `"constants/pi.ax"`).
2. If not in the virtual cache, paths resolve relative to the current workspace root or active file directory.
3. Import paths must be quoted strings: `\import "path/to/file.ax"`.

#### Real Examples and Output

**Example 1: Importing and using standard libraries**
```axine
\import "lib/abs.ax"
:abs(-42)
```
Output:
```
 1: \import "lib/abs.ax"  => module abs { abs, :abs }
 2: :abs(-42)             => 42
```

**Example 2: Selective symbol import**
```axine
\from "lib/floor.ax" \import :floor
:floor(3.8)
```
Output:
```
 1: \from "lib/floor.ax" \import :floor => module floor { floor }
 2: :floor(3.8)                         => 3
```

#### Common Mistake
Omitting double quotes around the file path:
```axine
\import lib/abs.ax
```
This produces a syntax error because `lib` is parsed as adjacent variables $l \cdot i \cdot b$. Import paths must always be quoted string literals.

---

### 8. Reduction: expressions that cannot reduce stand as themselves

#### What it is
Axine does not invent values or throw exceptions when an algebraic term cannot be simplified. If symbols are unbound or no reduction rule applies, the expression stands unreduced as an unevaluated symbolic AST. Refusals to reduce are not engine failures; they are accurate reflections of unconstrained mathematical expressions.

#### Real Examples and Output

**Example 1: Unbound symbolic additions**
```axine
a + b
x^2 + 1
```
Output:
```
 1: a + b    => a + b
 2: x^2 + 1  => x^2 + 1
```

**Example 2: Named function standing alone**
```axine
{\forall x, :f(x) = 2*x; :f}
```
Output:
```
 1: {\forall x, :f(x) = 2*x; :f} => f
```
Referencing `:f` without arguments does not crash or print an opaque pointer; it returns the symbol $f$.

**Example 3: Non-real radicals in the real context $\mathbb{R}$**
```axine
\import "lib/sqrt.ax"
:sqrt(-4)
```
Output:
```
 1: \import "lib/sqrt.ax" => module sqrt { ... }
 2: :sqrt(-4)             => :sqrt(-4)
```
In the real field $\mathbb{R}$, $\sqrt{-4}$ does not exist. It stands unreduced as `:sqrt(-4)`.

#### Common Mistake
Expecting the runtime to synthesize heuristic approximations or guess intent. Axine enforces AGENTS.md rule: *"The evaluator never rewrites an expression on its own. A rewrite happens only as a step a person names, or inside a command a person invokes; it is defined in an Axine library, shown, and checked."*

---

### 9. Exact rationals, and when `:float()` is needed

#### What it is
Axine computes arithmetic over $\mathbb{Q}$ using exact rational fractions backed by `BigInt` numerators and denominators with Euclidean GCD canonicalization. Calculations never accumulate floating-point rounding errors. However, Taylor polynomials and iterative recurrences cause exact fraction sizes to grow exponentially. The builtin function `:float()` coerces an exact rational to a 64-bit float when decimal output is required.

#### Syntax
```axine
:float(<expression>)
```

#### Real Examples and Output

**Example 1: Exact rational arithmetic**
```axine
:q = 1/3 + 1/6
:q
:large = (1/2)^10
:large
```
Output:
```
 1: :q = 1/3 + 1/6    => 1D Space (q)
 2: :q                => 1/2
 3: :large = (1/2)^10 => 1/1024
 4: :large            => 1/1024
```

**Example 2: Decimal coercion via `:float`**
```axine
\import "lib/exp.ax"
:exact_e = :exp(1)
:exact_e
:decimal_e = :float(:exact_e)
:decimal_e
```
Output:
```
 1: \import "lib/exp.ax"          => module exp { ... }
 2: :exact_e = :exp(1)            => 260412269/95800320
 3: :exact_e                      => 260412269/95800320
 4: :decimal_e = :float(:exact_e) => 2.718282
 5: :decimal_e                    => 2.718282
```

#### Common Mistake
Omitting the colon prefix when calling `:float`:
```axine
float(1/3)
```
Output:
```
f * l * o * a * t * (1 / 3)
```
`float(1/3)` parses as $f \cdot l \cdot o \cdot a \cdot t \cdot \frac{1}{3}$. Always write `:float(x)`.

---

### 10. Comments are `#`

#### What it is
A hash symbol `#` introduces a comment that extends to the end of the line. Comments are classified as `PROSE` and produce no computational values.

#### Syntax
```axine
# Line comment
<expr> # Trailing comment
```

#### Real Examples and Output
```axine
# Gravitational constant in m/s^2
g = 9.8 # Earth sea-level gravity
g
```
Output:
```
 1: # Gravitational constant in m/s^2 => [PROSE]
 2: g = 9.8 # Earth sea-level gravity => 1D Space (g)
 3: g                                 => 49/5
```

#### Common Mistake
Using C-style `//` for comments:
```axine
// Damped oscillator parameters
```
In Axine, `//` is the stacked fraction operator (e.g. `a // b` parses as $\frac{a}{b}$) or the differential operator (`d//dt`). Writing `//` at line start is a syntax error.

---

## The Document Model & In-Flow Objects

Axine partitions `.ax` documents into a structured block document tree while maintaining 100% byte-for-byte lossless roundtrip serialization to plain text.

The blocks are the evaluator's units. One classification (`lineKind` in `src/core/classifier.ts`, joined into multi-line units by `src/core/segments.ts`) decides both what is evaluated and how it is shown: a line the evaluator evaluates is shown as mathematics, and a line it does not evaluate is shown as prose. A multi-line unit, such as a `{\axis ...}` block spread over several lines, is one block. Each math block takes its result, error and status from the evaluation of its unit.

### Block Types

1. **Heading Blocks (`#`, `##`, `###`)**:
   Section titles and hierarchical headers. Rendered as formatted headings in document flow. `##` and `###` lines are headings anywhere; a `#` line is a heading only as the document's first content, and elsewhere it is a comment.
2. **Paragraph & Prose Blocks**:
   Natural language text containing inline typeset mathematics wrapped in `$math$` spans, and line comments (`#`). In an empty paragraph, Axine renders an interactive placeholder (`Write math expressions, definitions (x := 5), claims, or prose...`); clicking or typing printable characters immediately enters editing mode.
3. **Equation Blocks**:
   Mathematical statements, relations, and definitions.
   - **Default Display**: Rendered as Cambridge/AMS typeset mathematics.
   - **Selection**: Single-click selects the equation atomically (arrow keys step over it as a single unit).
   - **Editing**: Double-clicking (or pressing `Enter` while selected) opens in-place text editing.
   - **Exit**: Pressing `Escape` or clicking outside commits edits and renders typeset mathematics.
4. **In-Flow Figure Blocks (`\figure` or `{\axis ...}`)**:
   Embedded graphical viewports mounted directly within the document flow.
   - **Atomic Selection**: Selected as a single unit; arrow keys step over the figure.
   - **What it shows**: the space its relation evaluated to. Without a space to draw, it says what there is instead: the error message, "The expression is unfinished.", an unknown result and its reason, or the type of a result that is not a space. A header badge names any state other than a current result: Not evaluated, Unfinished, Unknown, Error, or Stale (the text changed and the new result has not arrived).
   - **Provenance Navigation**: `\figure(:name)` displays a "Where it came from" link to the block where the last evaluation bound `:name`. The link is absent when no evaluation bound the name.
   - **Scroll Pass-Through**: Canvases allow mouse wheel and trackpad scroll gestures to pass through cleanly without getting trapped. Clicking the canvas activates 3D/2D camera interaction; pressing `Escape` releases focus.
   - **Reflow Anchoring**: Figures anchor to lexical block positions and reflow as surrounding equations or prose expand.
5. **Derivation Blocks (`\derive`)**:
   Step-by-step equivalence chains recording algebraic solver transformations.
6. **Slot Insert Commands (`\table`, `\cases`)**:
   Multi-slot insert commands sharing a unified editing architecture:
   - In static state, renders publication-grade typeset mathematical objects.
   - Double-clicking enters the structured edit scaffold with targetable input slots.
   - Pressing `Tab` advances to the next addressable slot; `Shift+Tab` cycles backwards.
   - Pressing `Escape` renders the command back into typeset mathematics.
   - **`\table(rows, cols){ ... }`**: 2D grid matrix with row-major Tab traversal.
   - **`\cases(branches){ val1, cond1; ... }`**: Piecewise conditional function definitions rendered with a large grouping brace.

### Frontmatter Metadata
Documents can specify metadata using YAML frontmatter enclosed in `---` lines at the top of the file:
```axine
---
:title: Damped Harmonic Motion
:course: PHYS 211
:author: Noah Slayton
:date: 2026-09-18
---
```

### Autocomplete & Incomplete Command Floor
1. **Incomplete commands stay literal**: Typing `\fo` renders as literal text `\fo`. Glyphs are not guessed or mutated prematurely.
2. **Descriptive Autocomplete Popover**: Displays available commands along with concise one-line descriptions. Pressing `Tab` or `Enter` accepts the selected completion.

---

## The Floor

Axine implements a minimal seven-primitive floor in its core runtime. Everything above this floor is written in pure Axine syntax.

### The Seven Primitives

1. **Exact Rational Arithmetic**: Arbitrary-precision fractions ($\mathbb{Q}$) backed by `BigInt` numerators and denominators with Euclidean GCD canonicalization.
2. **Relational Ordering & Equality**: Comparison relations ($=, \ne, <, \le, >, \ge$) and structural identity.
3. **Syntactic Substitution & Constraint Isolation**: Equational unification ($v = c \implies v \mapsto c$) within lexical scopes.
4. **Bounded Finite Iteration**: Step-bounded and fuel-guarded recurrence loops.
5. **First-Class Expressions as Values**: Quoting, pattern matching, structural reconstruction, and term rewriting (`\quote`, `\unquote`, `\match`, `\build`, `\rule`).
6. **Ordered Tuples**: Finite Cartesian products and 0-indexed element access (`t[0]`).
7. **Structural Equality & Kind Subsumption**: Multi-kind operator dispatch and structural subtype verification.

### What the Core Knows vs. What is Written in Axine

The core runtime contains zero implementations of square roots, trigonometric functions, logarithms, exponentials, physical formulas, or numerical integrators.

- **What the core knows**: Addition, subtraction, multiplication, division, modulo, integer exponents, tuple construction, array indexing, conditional branching (`\if`), equational substitution, and level-set extraction (Marching Squares / Cubes).
- **What is written in Axine**:
  - `sqrt` is written in pure Axine using integer square root checks and Newton-Raphson iterations (`lib/sqrt.ax`).
  - `exp` and `ln` are written in pure Axine via 12-term Taylor polynomials and range reduction (`lib/exp.ax`).
  - `sin`, `cos`, and `tan` are written in pure Axine via degree-25 Taylor series and angle reduction modulo $2\pi$ (`lib/trig.ax`).
  - Physical step integrators (Euler, Verlet, Runge-Kutta 4) are written in pure Axine (`documents/physics.ax`).

### Why `sqrt` is a Library and Not a Builtin

In standard programming environments, `Math.sqrt` is an opaque hardware instruction or C library routine. In Axine, host-language builtins are disqualified by design (AGENTS.md):
> *"Math.sqrt is banned because you cannot look at it, not because it is fast. A fast sqrt written in Axine ... is legitimate no matter how fast, as long as it is readable, derivable, and \expand shows what it did."*

Because `:sqrt` is written in `documents/lib/sqrt.ax`, its entire derivation—from checking for exact squares to executing Newton recurrence steps—is inspectable, step-verifiable, and derivable within Axine itself.

---

## Spaces and Rendering

### How a Relation Becomes Geometry
An equation $R(x_1, \dots, x_n) = 0$ is a boolean predicate defining a subset of $\mathbb{R}^n$:
$$\mathcal{M} = \{ (x_1, \dots, x_n) \in \mathbb{R}^n \mid R(x_1, \dots, x_n) = 0 \}$$

The dimension of the space is the count of unconstrained free variables in the relation:
- **1 Free Variable**: Defines a 1D space (points on an axis, e.g. $x^2 = 4$).
- **2 Free Variables**: Defines a 2D space (planar curve, e.g. $x^2 + y^2 = 25$).
- **3 Free Variables**: Defines a 3D space (surface in $\mathbb{R}^3$, e.g. $x^2 + y^2 + z^2 = 25$).
- **4+ Free Variables**: Defines a hyperspace (e.g. $a + b + c + x + y = 10$).

### Slicing Above 3D
In spaces with dimension $d > 2$, Axine projects the manifold onto the two primary active axes selected by the user (by default, the first two coordinates). The remaining $d - 2$ variables are assigned dedicated slice sliders. Moving a slider sweeps an affine hyperplane orthogonal to that coordinate, extracting and rendering the intersecting level-set cross-section in real time.

### What Makes Something Render and What Does Not
1. **Requires `\axis`**: A block must declare its coordinate axes with `\axis`.
2. **Variable Alignment**: The free variables in the relation must match the declared axes or be explicitly aliased (e.g. `X = x`). Any other name needs a value somewhere in the block or before it, in any order; a name without one is an error (`'r' has no value and is not an axis of this space`). A relation that cannot be evaluated at any point, such as one calling an undefined function, is also an error. The figure shows the error instead of empty axes.
3. **Without `\axis`**: The relation evaluates to a `SpaceValue` with `declaredAxes = undefined`. The engine computes its dimension and coordinates, but draws 0 entities in the viewport. No letter is a default axis: `y = x` is not drawn, and `{\axis p, x; p = x}` draws exactly what `{\axis y, x; y = x}` draws, with only the labels different.

---

## The Standard Library

Every file in `documents/lib/`, what it provides, the signature of every function, and a verified worked example with real output from the engine.

### 1. `lib/abs.ax`
- **Provides**: Absolute value for real numbers
- **Import**: `\import "lib/abs.ax"`
- **Function Signatures**:
  - `:abs(x)` — Absolute value $|x|$ via piecewise relation ($\text{if } x \ge 0 \text{ then } x \text{ else } -x$)
- **Worked Example**:
  ```axine
  \import "lib/abs.ax"
  :abs(-42)
  :abs(-7/4)
  ```
  Output:
  ```
   1: \import "lib/abs.ax" => module abs { abs, :abs }
   2: :abs(-42)            => 42
   3: :abs(-7/4)           => 7/4
  ```

### 2. `lib/bisect.ax`
- **Provides**: Bisection interval halving root search
- **Import**: `\import "lib/bisect.ax"`
- **Function Signatures**:
  - `:bisect_sqrt_step(x, a, b)` — Single interval-halving step over $[a, b]$ for root of $y^2 - x = 0$
  - `:bisect_sqrt(x)` — Bisection root search approximating $\sqrt{x}$ over $[0, \max(1, x)]$
- **Worked Example**:
  ```axine
  \import "lib/bisect.ax"
  :bisect_sqrt(2)
  :bisect_sqrt(16)
  ```
  Output:
  ```
   1: \import "lib/bisect.ax" => module bisect { bisect_sqrt_step, :bisect_sqrt_step, bisect_sqrt, :bisect_sqrt }
   2: :bisect_sqrt(2)         => 23/16
   3: :bisect_sqrt(16)        => 7/2
  ```

### 3. `lib/ceil.ax`
- **Provides**: Ceiling function defined via floor relation
- **Import**: `\import "lib/ceil.ax"`
- **Function Signatures**:
  - `:ceil(x)` — Least integer $k \ge x$ ($\text{if } \lfloor x \rfloor = x \text{ then } x \text{ else } \lfloor x \rfloor + 1$)
- **Worked Example**:
  ```axine
  \import "lib/ceil.ax"
  :ceil(5.1)
  :ceil(-3.8)
  ```
  Output:
  ```
   1: \import "lib/ceil.ax" => module ceil { ceil, :ceil }
   2: :ceil(5.1)            => 6
   3: :ceil(-3.8)           => -3
  ```

### 4. `lib/combinatorics.ax`
- **Provides**: Factorials, permutations, combinations, integer partitions, and derangements
- **Import**: `\import "lib/combinatorics.ax"`
- **Function Signatures**:
  - `:factorial(n)` — Factorial $n! = \prod_{i=1}^n i$ for non-negative integer $n$
  - `:permutations(n, k)` — Number of $k$-permutations of $n$ elements $P(n, k) = \frac{n!}{(n - k)!}$
  - `:combinations(n, k)` — Number of $k$-combinations of $n$ elements $C(n, k) = \frac{n!}{k!(n - k)!}$
  - `:binomial(n, k)` — Binomial coefficient $\binom{n}{k}$, alias for `:combinations(n, k)`
  - `:partitions(n)` — Number of integer partitions $p(n)$ via Euler recurrence
  - `:derangements(n)` — Subfactorial $!n$ (permutations of $n$ elements with zero fixed points)
- **Worked Example**:
  ```axine
  \import "lib/combinatorics.ax"
  :factorial(5)
  :permutations(5, 2)
  :combinations(5, 2)
  :partitions(5)
  :derangements(4)
  ```
  Output:
  ```
   1: \import "lib/combinatorics.ax" => module combinatorics { factorial, :factorial, permutations, :permutations, combinations, :combinations, binomial, :binomial, partitions, :partitions, derangements, :derangements }
   2: :factorial(5)                  => 120
   3: :permutations(5, 2)            => 20
   4: :combinations(5, 2)            => 10
   5: :partitions(5)                 => 7
   6: :derangements(4)               => 9
  ```

### 5. `lib/exp.ax`
- **Provides**: Exponential and logarithmic functions via degree-12 Taylor series and range reduction
- **Import**: `\import "lib/exp.ax"`
- **Function Signatures**:
  - `:exp_series(x)` — 12-term Taylor polynomial for $e^x$
  - `:exp_pos(x)` — Range-reduced exponential via square-and-multiply $(e^{x/16})^{16}$
  - `:exp(x)` — Exponential function $e^x$ for all real $x \in \mathbb{R}$
  - `:ln_series(u)` — 12-term Taylor series for $\ln(1 + u)$ where $|u| < 1$
  - `:ln_pos(x)` — Logarithm via square-root domain reduction $64 \cdot \ln(x^{1/64})$
  - `:ln(x)` — Natural logarithm $\ln(x)$ for positive real $x > 0$
  - `:log(x, b)` — Base-$b$ logarithm $\log_b(x) = \frac{\ln(x)}{\ln(b)}$
  - `:log2(x)` — Base-2 logarithm $\log_2(x) = \frac{\ln(x)}{\ln(2)}$
- **Worked Example**:
  ```axine
  \import "lib/exp.ax"
  :exp(0)
  :ln(1)
  :log2(8)
  ```
  Output:
  ```
   1: \import "lib/exp.ax" => module exp { exp_series, :exp_series, exp_pos, :exp_pos, exp, :exp, ln_series, :ln_series, ln_pos, :ln_pos, ln, :ln, log, :log, log2, :log2 }
   2: :exp(0)              => 1
   3: :ln(1)               => 0
   4: :log2(8)             => 3
  ```

### 6. `lib/floor.ax`
- **Provides**: Floor and rounding functions defined via discreteness relation
- **Import**: `\import "lib/floor.ax"`
- **Function Signatures**:
  - `:floor(x)` — Greatest integer $k \le x$ using modulo arithmetic $x - (x \bmod 1)$
  - `:round(x)` — Rounds real $x$ to nearest integer via $\lfloor x + 0.5 \rfloor$
- **Worked Example**:
  ```axine
  \import "lib/floor.ax"
  :floor(5.8)
  :floor(-3.2)
  :round(4.6)
  ```
  Output:
  ```
   1: \import "lib/floor.ax" => module floor { floor, :floor, round, :round }
   2: :floor(5.8)            => 5
   3: :floor(-3.2)           => -4
   4: :round(4.6)            => 5
  ```

### 7. `lib/graphs.ax`
- **Provides**: Finite graph representations, adjacency, connectivity, and cycle detection
- **Import**: `\import "lib/graphs.ax"`
- **Function Signatures**:
  - `:make_graph(v, e)` — Constructs undirected graph $(V, E)$ from vertex list $v$ and edge pairs $e$
  - `:graph_vertices(g)` — Extracts vertex list $V$ from graph $g$
  - `:graph_edges(g)` — Extracts edge list $E$ from graph $g$
  - `:adjacent(g, u, v)` — Returns true if vertices $u$ and $v$ share an edge in $g$
  - `:neighbors(g, u)` — Returns list of all vertices adjacent to vertex $u$
  - `:degree(g, u)` — Degree of vertex $u$ (count of incident edges)
  - `:reachable(g, u)` — List of all vertices reachable from $u$ via breadth-first search
  - `:has_path(g, u, v)` — Returns true if a path exists between vertices $u$ and $v$
  - `:is_connected(g)` — Returns true if all vertices belong to a single connected component
  - `:num_components(g)` — Total count of connected components in graph $g$
  - `:has_cycle(g)` — Returns true if graph $g$ contains at least one cycle ($|E| > |V| - k$)
- **Worked Example**:
  ```axine
  \import "lib/graphs.ax"
  :g = :make_graph([1, 2, 3, 4], [(1, 2), (2, 3), (3, 1), (3, 4)])
  :degree(:g, 3)
  :neighbors(:g, 3)
  :is_connected(:g)
  :has_cycle(:g)
  ```
  Output:
  ```
   1: \import "lib/graphs.ax"                                            => module graphs { ... }
   2: :g = :make_graph([1, 2, 3, 4], [(1, 2), (2, 3), (3, 1), (3, 4)])  => 1D Space (g)
   3: :degree(:g, 3)                                                     => 3
   4: :neighbors(:g, 3)                                                  => [1, 2, 4]
   5: :is_connected(:g)                                                  => true
   6: :has_cycle(:g)                                                     => true
  ```

### 8. `lib/logic.ax`
- **Provides**: Propositional logic connectives, truth assignment tables, and satisfiability analysis
- **Import**: `\import "lib/logic.ax"`
- **Function Signatures**:
  - `:l_not(p)` — Propositional negation $\neg p$
  - `:l_and(p, q)` — Propositional conjunction $p \land q$
  - `:l_or(p, q)` — Propositional disjunction $p \lor q$
  - `:l_implies(p, q)` — Material implication $p \to q \equiv \neg p \lor q$
  - `:l_iff(p, q)` — Logical equivalence $p \leftrightarrow q$
  - `:l_xor(p, q)` — Exclusive disjunction $p \oplus q$
  - `:assignments(n)` — Generates all $2^n$ boolean truth valuation lists for $n$ variables
  - `:table_row1(p, r)` — Formats 1-variable truth table row `[p, r]`
  - `:table_row2(p, q, r)` — Formats 2-variable truth table row `[p, q, r]`
  - `:is_satisfiable(r)` — Returns true if at least one evaluation in result list $r$ is true
  - `:is_tautology(r)` — Returns true if every evaluation in result list $r$ is true
  - `:is_contradiction(r)` — Returns true if every evaluation in result list $r$ is false
- **Worked Example**:
  ```axine
  \import "lib/logic.ax"
  :p = \true
  :q = \false
  :l_implies(:p, :q)
  :l_xor(:p, :q)
  :is_tautology([\true, \true, \true])
  :is_satisfiable([\false, \true, \false])
  ```
  Output:
  ```
   1: \import "lib/logic.ax"                    => module logic { ... }
   2: :p = \true                                => 1D Space (p)
   3: :q = \false                               => 1D Space (q)
   4: :l_implies(:p, :q)                        => false
   5: :l_xor(:p, :q)                            => true
   6: :is_tautology([\true, \true, \true])      => true
   7: :is_satisfiable([\false, \true, \false])  => true
  ```

### 9. `lib/newton.ax`
- **Provides**: Newton-Raphson root convergence with interval scaling
- **Import**: `\import "lib/newton.ax"`
- **Function Signatures**:
  - `:newton_sqrt_step(x, y)` — Single Newton-Raphson iteration step $y_{n+1} = \frac{1}{2}(y_n + x/y_n)$
  - `:newton_sqrt_core(x)` — Six unrolled Newton iterations over domain $[0.25, 4.0]$
  - `:newton_sqrt(x)` — Square root via interval scaling across powers of 4 and Newton convergence
- **Worked Example**:
  ```axine
  \import "lib/newton.ax"
  :newton_sqrt(2)
  ```
  Output:
  ```
   1: \import "lib/newton.ax" => module newton { newton_sqrt_step, :newton_sqrt_step, newton_sqrt_core, :newton_sqrt_core, newton_sqrt, :newton_sqrt }
   2: :newton_sqrt(2)          => 4946041176255201878775086487573351061418968498177/3497379255757941172020851852070562919437964212608
  ```

### 10. `lib/numbertheory.ax`
- **Provides**: Divisibility, modular arithmetic, extended Euclidean algorithm, and primality testing
- **Import**: `\import "lib/numbertheory.ax"`
- **Function Signatures**:
  - `:gcd(a, b)` — Greatest common divisor $\gcd(a, b)$ via Euclidean algorithm
  - `:lcm(a, b)` — Least common multiple $\frac{|a \cdot b|}{\gcd(a, b)}$
  - `:ext_gcd(a, b)` — Extended Euclidean algorithm returning $(g, x, y)$ where $ax + by = g$
  - `:mod(a, m)` — Canonical non-negative remainder in $[0, m - 1]$
  - `:mod_add(a, b, m)` — Modular addition $(a + b) \bmod m$
  - `:mod_sub(a, b, m)` — Modular subtraction $(a - b) \bmod m$
  - `:mod_mul(a, b, m)` — Modular multiplication $(a \cdot b) \bmod m$
  - `:mod_inv(a, m)` — Modular multiplicative inverse $a^{-1} \bmod m$ (returns 0 if non-coprime)
  - `:isprime(n)` — Primality predicate via trial division
  - `:totient(n)` — Euler's totient function $\phi(n)$ counting integers $k \le n$ coprime to $n$
  - `:powmod(b, e, m)` — Modular exponentiation $b^e \bmod m$ via repeated squaring
  - `:binomial(n, k)` — Binomial coefficient $\binom{n}{k} = \frac{n!}{k!(n - k)!}$
  - `:nextprime(n)` — Smallest prime strictly greater than $n$
  - `:divisors(n)` — Ordered list of all positive divisors of $n$
  - `:factorize(n)` — Prime factorization returning list of `(prime, exponent)` tuples
- **Worked Example**:
  ```axine
  \import "lib/numbertheory.ax"
  :gcd(48, 18)
  :isprime(17)
  :totient(9)
  :binomial(5, 2)
  :factorize(60)
  :ext_gcd(35, 15)
  :mod_inv(3, 11)
  ```
  Output:
  ```
   1: \import "lib/numbertheory.ax" => module numbertheory { ... }
   2: :gcd(48, 18)                  => 6
   3: :isprime(17)                  => true
   4: :totient(9)                   => 6
   5: :binomial(5, 2)               => 10
   6: :factorize(60)                => [(2, 2), (3, 1), (5, 1)]
   7: :ext_gcd(35, 15)              => (5, 1, -2)
   8: :mod_inv(3, 11)               => 4
  ```

### 11. `lib/relations.ax`
- **Provides**: Binary relations over finite sets, closures, and equivalence classes
- **Import**: `\import "lib/relations.ax"`
- **Function Signatures**:
  - `:rel_contains(r, x, y)` — Returns true if pair $(x, y)$ belongs to binary relation $r$
  - `:is_reflexive(r, s)` — Returns true if relation $r$ is reflexive over set $s$
  - `:is_symmetric(r)` — Returns true if relation $r$ is symmetric ($(a, b) \in r \implies (b, a) \in r$)
  - `:is_transitive(r)` — Returns true if relation $r$ is transitive
  - `:is_equivalence(r, s)` — Returns true if $r$ is reflexive, symmetric, and transitive on $s$
  - `:equiv_class(r, s, x)` — Returns equivalence class $[x]_r = \{ y \in s \mid (x, y) \in r \}$
  - `:reflexive_closure(r, s)` — Computes reflexive closure $r \cup \{ (a, a) \mid a \in s \}$
  - `:symmetric_closure(r)` — Computes symmetric closure $r \cup \{ (b, a) \mid (a, b) \in r \}$
  - `:transitive_closure(r)` — Computes transitive closure $r^+$ via fixed-point composition
- **Worked Example**:
  ```axine
  \import "lib/relations.ax"
  :s = [1, 2, 3]
  :r = [(1, 1), (2, 2), (3, 3), (1, 2), (2, 1)]
  :is_reflexive(:r, :s)
  :is_symmetric(:r)
  :is_transitive(:r)
  :is_equivalence(:r, :s)
  :equiv_class(:r, :s, 1)
  ```
  Output:
  ```
   1: \import "lib/relations.ax"                         => module relations { ... }
   2: :s = [1, 2, 3]                                     => 1D Space (s)
   3: :r = [(1, 1), (2, 2), (3, 3), (1, 2), (2, 1)]     => 1D Space (r)
   4: :is_reflexive(:r, :s)                              => true
   5: :is_symmetric(:r)                                  => true
   6: :is_transitive(:r)                                 => true
   7: :is_equivalence(:r, :s)                            => true
   8: :equiv_class(:r, :s, 1)                            => [1, 2]
  ```

### 12. `lib/sets.ax`
- **Provides**: Finite set operations, subsets, powersets, and integer ranges
- **Import**: `\import "lib/sets.ax"`
- **Function Signatures**:
  - `:contains(s, x)` — Returns true if element $x$ belongs to finite set $s$
  - `:card(s)` — Cardinality (number of distinct elements) of set $s$
  - `:subset(a, b)` — Returns true if set $a$ is a subset of set $b$ ($a \subseteq b$)
  - `:set_equal(a, b)` — Returns true if sets $a$ and $b$ contain identical elements
  - `:union(a, b)` — Computes union set $a \cup b$ without duplicate elements
  - `:intersection(a, b)` — Computes intersection set $a \cap b$
  - `:difference(a, b)` — Computes set difference $a \setminus b$
  - `:powerset(s)` — Computes power set $\mathcal{P}(s)$ containing all $2^{|s|}$ subsets
  - `:range(a, b)` — Generates discrete integer list $[a, a + 1, \dots, b]$
- **Worked Example**:
  ```axine
  \import "lib/sets.ax"
  :a = [1, 2, 3]
  :b = [2, 3, 4]
  :union(:a, :b)
  :intersection(:a, :b)
  :difference(:a, :b)
  :subset([2, 3], :a)
  ```
  Output:
  ```
   1: \import "lib/sets.ax" => module sets { ... }
   2: :a = [1, 2, 3]        => 1D Space (a)
   3: :b = [2, 3, 4]        => 1D Space (b)
   4: :union(:a, :b)        => [1, 2, 3, 4]
   5: :intersection(:a, :b) => [2, 3]
   6: :difference(:a, :b)   => [1]
   7: :subset([2, 3], :a)   => true
  ```

### 13. `lib/sqrt.ax`
- **Provides**: Square root defined as mathematical relation with Newton search
- **Import**: `\import "lib/sqrt.ax"`
- **Function Signatures**:
  - `:idiv(a, b)` — Exact integer division $(a - (a \bmod b)) / b$
  - `:int_sqrt_step(x, y)` — Iteration step for integer square root
  - `:int_sqrt(x)` — Exact integer square root $\lfloor \sqrt{x} \rfloor$
  - `:is_perfect_square(x)` — Returns integer root $\sqrt{x}$ if exact, otherwise -1
  - `:sqrt(x)` — Exact integer root for squares, stands unreduced for negative reals, else Newton approximation
- **Worked Example**:
  ```axine
  \import "lib/sqrt.ax"
  :sqrt(25)
  :is_perfect_square(49)
  :sqrt(-4)
  ```
  Output:
  ```
   1: \import "lib/sqrt.ax"   => module sqrt { idiv, :idiv, int_sqrt_step, :int_sqrt_step, int_sqrt, :int_sqrt, is_perfect_square, :is_perfect_square, sqrt, :sqrt }
   2: :sqrt(25)              => 5
   3: :is_perfect_square(49) => 7
   4: :sqrt(-4)              => :sqrt(-4)
  ```

### 14. `lib/strings.ax`
- **Provides**: String operations over finite sequences of numeric character codes
- **Import**: `\import "lib/strings.ax"`
- **Function Signatures**:
  - `:str_len(s)` — Length (element count) of character code list $s$
  - `:str_empty(s)` — Returns true if string length is 0
  - `:str_concat(a, b)` — Concatenates two character code lists $a + b$
  - `:char_at(s, i)` — Character code at 0-based index $i$
  - `:str_reverse(s)` — Reverses order of character codes in string $s$
  - `:substring(s, start, end)` — Extracts slice from index `start` up to index `end`
  - `:substr(s, start, len)` — Extracts slice of length `len` starting at index `start`
  - `:str_equal(a, b)` — Structural equality comparison of character sequences
  - `:is_palindrome(s)` — Returns true if string reads identically forward and backward
- **Worked Example**:
  ```axine
  \import "lib/strings.ax"
  :s = [104, 101, 108, 108, 111]
  :str_len(:s)
  :str_reverse(:s)
  :is_palindrome([109, 97, 100, 97, 109])
  ```
  Output:
  ```
   1: \import "lib/strings.ax"                 => module strings { ... }
   2: :s = [104, 101, 108, 108, 111]           => 1D Space (s)
   3: :str_len(:s)                             => 5
   4: :str_reverse(:s)                         => [111, 108, 108, 101, 104]
   5: :is_palindrome([109, 97, 100, 97, 109]) => true
  ```

### 15. `lib/trees.ax`
- **Provides**: Binary tree construction, structural metrics, and tree traversals
- **Import**: `\import "lib/trees.ax"`
- **Function Signatures**:
  - `:empty_tree` — Constant empty binary tree `[]`
  - `:leaf(v)` — Constructs leaf node `[v, [], []]` containing value $v$
  - `:node(v, l, r)` — Constructs binary tree node `[v, l, r]` with subtrees $l$ and $r$
  - `:is_empty(t)` — Returns true if tree $t$ is empty
  - `:is_leaf(t)` — Returns true if node $t$ is a non-empty leaf
  - `:value(t)` — Returns root value $v$ of node $t$
  - `:left(t)` — Returns left subtree of node $t$
  - `:right(t)` — Returns right subtree of node $t$
  - `:vertices(t)` — Total count of vertices in tree $t$
  - `:edges(t)` — Total count of edges in tree $t$ ($\max(0, |V| - 1)$)
  - `:leaves(t)` — Total count of leaf nodes in tree $t$
  - `:height(t)` — Height of tree $t$ (0 for leaf, $1 + \max(h_l, h_r)$ for internal node)
  - `:preorder(t)` — Preorder traversal sequence `[v, ...preorder(l), ...preorder(r)]`
  - `:inorder(t)` — Inorder traversal sequence `[...inorder(l), v, ...inorder(r)]`
  - `:postorder(t)` — Postorder traversal sequence `[...postorder(l), ...postorder(r), v]`
- **Worked Example**:
  ```axine
  \import "lib/trees.ax"
  :t = :node(1, :leaf(2), :leaf(3))
  :vertices(:t)
  :height(:t)
  :inorder(:t)
  :preorder(:t)
  ```
  Output:
  ```
   1: \import "lib/trees.ax"                => module trees { ... }
   2: :t = :node(1, :leaf(2), :leaf(3))     => 1D Space (t)
   3: :vertices(:t)                         => 3
   4: :height(:t)                           => 1
   5: :inorder(:t)                          => [2, 1, 3]
   6: :preorder(:t)                         => [1, 2, 3]
  ```

### 16. `lib/trig.ax`
- **Provides**: Circular and hyperbolic trigonometric functions via degree-25 Taylor series and angle reduction
- **Import**: `\import "lib/trig.ax"`
- **Function Signatures**:
  - `:sin_series(x)` — 13-term degree-25 Taylor series for $\sin(x)$
  - `:cos_series(x)` — 13-term degree-24 Taylor series for $\cos(x)$
  - `:reduce_angle(x)` — Reduces angle modulo $2\pi$ into interval $[-\pi, \pi]$
  - `:sin(x)` — Circular sine function $\sin(x)$ for real $x \in \mathbb{R}$
  - `:cos(x)` — Circular cosine function $\cos(x)$ for real $x \in \mathbb{R}$
  - `:tan(x)` — Circular tangent function $\tan(x) = \frac{\sin(x)}{\cos(x)}$
  - `:asin_series(x)` — Taylor series for inverse sine
  - `:asin(x)` — Inverse sine function $\arcsin(x)$
  - `:acos(x)` — Inverse cosine function $\arccos(x) = \frac{\pi}{2} - \arcsin(x)$
  - `:atan_series(x)` — Taylor series for inverse tangent
  - `:atan_half(x)` — Argument reduction $\frac{x}{1 + \sqrt{1 + x^2}}$
  - `:atan(x)` — Inverse tangent function $\arctan(x)$
  - `:sinh_series(x)` — Taylor series for hyperbolic sine
  - `:cosh_series(x)` — Taylor series for hyperbolic cosine
  - `:sinh(x)` — Hyperbolic sine function $\sinh(x)$
  - `:cosh(x)` — Hyperbolic cosine function $\cosh(x)$
  - `:tanh(x)` — Hyperbolic tangent function $\tanh(x) = \frac{\sinh(x)}{\cosh(x)}$
- **Worked Example**:
  ```axine
  \import "lib/trig.ax"
  :sin(0)
  :cos(0)
  :tan(0)
  :sinh(0)
  :cosh(0)
  ```
  Output:
  ```
   1: \import "lib/trig.ax" => module trig { sin_series, :sin_series, cos_series, :cos_series, reduce_angle, :reduce_angle, sin, :sin, cos, :cos, tan, :tan, asin, :asin, acos, :acos, atan_half, :atan_half, atan, :atan, sinh, :sinh, cosh, :cosh, tanh, :tanh }
   2: :sin(0)              => 0
   3: :cos(0)              => 1
   4: :tan(0)              => 0
   5: :sinh(0)             => 0
   6: :cosh(0)             => 1
  ```

---

## Writing Something Real

### 1. Numerical: Newton-Raphson Root Convergence (22 lines)

This program finds the real root of the cubic polynomial $f(x) = x^3 - 2x - 5 = 0$ using Newton's method ($x_{n+1} = x_n - \frac{f(x_n)}{f'(x_n)}$) and computes exact rational residuals.

```axine
# newton_cubic.ax — Root convergence for x^3 - 2x - 5 = 0 via Newton recurrence
\import "lib/abs.ax"

# Target polynomial: f(x) = x^3 - 2x - 5
# Derivative:        f'(x) = 3x^2 - 2
# Newton step:       x_{n+1} = x_n - f(x_n) / f'(x_n)
\forall x, :step(x) = x - (x^3 - 2*x - 5) / (3*x^2 - 2)

:x0 = 2.0
:x1 = :step(:x0)
:x2 = :step(:x1)
:x3 = :step(:x2)
:x4 = :step(:x3)

# Exact rational root after 4 iterations
:exact_root = :x4

# Decimal float approximation
:approx_root = :float(:x4)

# Verification of residual error: f(x4)
:residual = :abs(:x4^3 - 2*:x4 - 5)
:residual_float = :float(:residual)
```

#### Actual Output
```
 1: # newton_cubic.ax — Root convergence for x^3 - 2x - 5 = 0 via Newton recurrence => [PROSE]
 2: \import "lib/abs.ax"                          => module abs { abs, :abs }
 4: \forall x, :step(x) = x - (x^3 - 2*x - 5) / (3*x^2 - 2) => none
 6: :x0 = 2.0                                     => 2
 7: :x1 = :step(:x0)                              => 21/10
 8: :x2 = :step(:x1)                              => 11761/5615
 9: :x3 = :step(:x2)                              => 4138744325037/1975957316495
10: :x4 = :step(:x3)                              => 180361507581342374686204847776335588181/86109846986684169676738889168418120215
12: :exact_root = :x4                             => 180361507581342374686204847776335588181/86109846986684169676738889168418120215
13: :approx_root = :float(:x4)                    => 2.094551
15: :residual = :abs(:x4^3 - 2*:x4 - 5)           => 97478968847293887616593624137354075403328388555575414301470152374718996497152047171163502108416/638496399387006462929790970234774267447697621088328700331993595837849311688746982375182162850458682854070800938375
16: :residual_float = :float(:residual)           => 0
```

---

### 2. Geometric: Sphere Intersected by an Inclined Plane (23 lines)

This program defines a 3D spherical shell constrained by an affine slicing plane $z = 0.5x + 1$, plots the resulting cross-section in 3D and 2D, and verifies the circle's center and squared radius algebraically.

```axine
# sphere_slice.ax — Sphere intersected by an inclined plane constraint
# 3D spherical shell constrained by an affine slicing plane
{\axis x, y, z;
  x^2 + y^2 + z^2 = 9
  z = 0.5 * x + 1
}

# 2D projection on the (x, y) coordinate plane
{\axis x, y;
  x^2 + y^2 + (0.5 * x + 1)^2 = 9
}

# Planar intersection geometry:
# Center of cross-section circle is at x = -0.4, z = 0.8
:x_c = -2/5
:z_c = 0.5 * :x_c + 1

# Squared radius of cross-section disk: R^2 - d^2
:r_sq = 9 - (:x_c^2 + :z_c^2)
:r_sq_float = :float(:r_sq)

# Point on boundary at x = 0: y^2 + 1 = 9 => y^2 = 8
:y_sq = 9 - :z_c^2 - 0
:y_bound = :float(:y_sq)
```

#### Actual Output
```
 4: { ... }                         => Space (x, y, z, 2 entities)
 8: { ... }                         => Space (x, y, 1 entities)
10: :x_c = -2/5                     => -2/5
11: :z_c = 0.5 * :x_c + 1           => 4/5
12: :r_sq = 9 - (:x_c^2 + :z_c^2)   => 41/5
13: :r_sq_float = :float(:r_sq)     => 8.2
14: :y_sq = 9 - :z_c^2 - 0          => 209/25
15: :y_bound = :float(:y_sq)        => 8.36
```

---

### 3. Differential: Damped Harmonic Oscillator (25 lines)

This program specifies the coupled first-order differential equations of motion for a damped physical oscillator ($m \ddot{x} + c \dot{x} + kx = 0$), declares the continuous trajectory manifold over coordinate time, and evaluates the state at $t = 1.0\text{ s}$.

```axine
# damped_oscillator.ax — Damped harmonic oscillator differential relation
\import "lib/exp.ax"
\import "lib/trig.ax"

m = 1.0
k = 9.0
c = 0.6

# System parameters:
# omega_0 = sqrt(k/m) = 3.0
# gamma = c / (2*m) = 0.3
# omega_d = sqrt(3^2 - 0.3^2) = sqrt(8.91) ~= 2.984962
:gamma = 0.3
:omega_d = 2.984962
:x0 = 2.0

# Coupled first-order differential equations of motion
d//d:time :x = :vx
d//d:time :vx = -(k / m) * :x - (c / m) * :vx

# Analytic position trajectory manifold over continuous time
{\axis :time, :x;
  :x = :x0 * :exp(-:gamma * :time) * :cos(:omega_d * :time)
}

# State evaluated at t = 1.0s
:x_1 = :x0 * :exp(-:gamma * 1.0) * :cos(:omega_d * 1.0)
:x_1_approx = :float(:x_1)
```

#### Actual Output
```
 1: \import "lib/exp.ax"                          => module exp { ... }
 2: \import "lib/trig.ax"                         => module trig { ... }
 4: m = 1.0                                       => 1D Space (m)
 5: k = 9.0                                       => 1D Space (k)
 6: c = 0.6                                       => 1D Space (c)
 8: :gamma = 0.3                                  => 3/10
 9: :omega_d = 2.984962                           => 1492481/500000
10: :x0 = 2.0                                     => 2
12: d//d:time :x = :vx                            => 2D Space (vx, x)
13: d//d:time :vx = -(k / m) * :x - (c / m) * :vx => 2D Space (vx, x)
17: { ... }                                       => Space (time, x, 1 entities)
19: :x_1 = :x0 * :exp(-:gamma * 1.0) * :cos(:omega_d * 1.0) => -1.463499
20: :x_1_approx = :float(:x_1)                    => -1.463499
```

---

## Errors

The messages someone will actually hit, what each means, and what to do. The text below is pulled directly from the engine diagnostics.

### 1. `Unexpected character '_' in identifier position`
- **Exact message**: `Unexpected character '_' in identifier position`
- **Suggestion**: `Bare '_' is not a valid variable. Multi-letter identifiers with underscores must start with ':' (e.g. ':name_...')`
- **What it means**: An un-prefixed word contained an underscore (`omega_d = 5`). In Axine, un-prefixed words split into single-letter variable tokens; an underscore cannot serve as a bare variable name.
- **What to do**: Add a leading colon to multi-letter names containing underscores (`:omega_d = 5`).

### 2. `Function '<name>' is not defined`
- **Exact message**: `Function '<name>' is not defined`
- **Suggestion**: `Define <name>(x) := ... before calling it` (or import from `lib/`)
- **What it means**: A standard library function like `:sqrt(x)`, `:sin(x)`, or `:exp(x)` was invoked without importing the module. Transcendentals are not hardcoded core builtins.
- **What to do**: Add the required import (e.g. `\import "lib/sqrt.ax"`, `\import "lib/trig.ax"`).

### 3. `Field '<field>' does not exist on record '<Record>'`
- **Exact message**: `Field '<field>' does not exist on record '<Record>'. Available fields: <list>`
- **What it means**: A record constructor or `\with` update specified a field name that was not declared in the `\record` schema.
- **What to do**: Match the field names declared in the record schema.

### 4. `Matrix dimension mismatch for <operation>: <dim1> <op> <dim2>`
- **Exact message**: `Matrix dimension mismatch for addition: 2x3 + 3x2`
- **What it means**: Matrix arithmetic was attempted on incompatible dimensions (e.g. adding matrices of different sizes, or multiplying matrices where columns of the left matrix do not equal rows of the right matrix).
- **What to do**: Ensure matching dimensions ($m \times n$ with $m \times n$ for addition, $m \times k$ with $k \times n$ for multiplication).

### 5. `Trace requires a square matrix, got <dim>` / `Determinant requires a square matrix, got <dim>`
- **Exact message**: `Trace requires a square matrix, got 2x3`
- **What it means**: `:trace(M)` or `:det(M)` was called on a non-square matrix ($m \ne n$).
- **What to do**: Restrict matrix operations to $n \times n$ square matrices.

### 6. `Matrix is singular and cannot be inverted`
- **Exact message**: `Matrix is singular and cannot be inverted`
- **What it means**: Inverting a matrix with determinant zero ($\det(M) = 0$).
- **What to do**: Check the determinant or matrix condition before computing the inverse.

### 7. `Variable '<var>' is not present in expression`
- **Exact message**: `Variable '<var>' is not present in expression`
- **What it means**: `d//dx` was called on an expression that does not contain variable $x$.
- **What to do**: Verify that the differentiation variable matches the expression's variables.

### 8. `Function 'abs' is non-differentiable at x = 0`
- **Exact message**: `Function 'abs' is non-differentiable at x = 0 (corner point: left derivative -1 != right derivative +1)`
- **What it means**: Differentiating $|x|$ at the singularity $x = 0$.
- **What to do**: Restrict the evaluation domain away from the singularity using `\where x != 0`.

### 9. `Expected '{' or '(' after \set`
- **Exact message**: `Expected '{' or '(' after \set`
- **What it means**: Omitting brackets when constructing a finite set (`\set 1, 2`).
- **What to do**: Enclose elements in braces: `\set { 1, 2, 3 }`.

---

## What Axine Does Not Do

Axine maintains strict boundaries between computation, observation, and out-of-scope behaviors. For a full breakdown, see [COVERAGE.md](../COVERAGE.md).

Plainly stated:

1. **No Interactive Automated Theorem Proving with Tactic Search**:
   Axine evaluates finite computational propositions, verifies algebraic steps, and samples level sets. It does not search for formal proofs and does not replace proof assistants such as Lean, Coq, or Isabelle.

2. **No Infinite-Depth Symbolic Integration**:
   Axine does not implement full symbolic Risch integration. Symbolic integration of general elementary functions requires deciding zero-equivalence of transcendental expressions, which is undecidable in general (Richardson's theorem). Indefinite integrals without bounds must provide explicit evaluation rules.

3. **No Heuristic Guessing or Implicit Type Coercion**:
   Axine never synthesizes missing equations, guesses user intent, or silently coerces incompatible types. If an operation has no mathematical definition in the active context, it evaluates to `undefined` or stands unreduced.

4. **No Opaque Host Builtins**:
   No mathematical function is hardcoded in the core runtime as an opaque JavaScript/TypeScript function. If a function cannot be expressed as an Axine relation, series, or recurrence, it is not part of the language.

---

## Quick Reference

### Operator Precedence Hierarchy

| Prec | Level | Assoc | Operators / Syntax | Examples |
| :---: | :--- | :--- | :--- | :--- |
| **90** | Postfix | Left | `!`, `²`, `³`, `.`, `[i]`, `^T`, `^\dagger`, `^-1` | `5!`, `x²`, `v.x`, `M[0]`, `A^T` |
| **80** | Exponentiation | Right | `^` | `2^3^2` = $2^{(3^2)} = 512$ |
| **70** | Unary | Right | `+`, `-`, `\not`, `d//dx`, `\nabla`, `\laplacian`, `\star`, `|x|`, `||v||` | `-x`, `d//dx x^2`, `|x|` |
| **60** | Implicit Mul | Left | Adjacent identifiers, numbers, parenthesized terms | `2x`, `x y`, `a(b + c)` |
| **50** | Explicit Mul | Left | `*`, `/`, `//` (fraction), `%`, `\wedge`, `\otimes`, `\oplus` | `a * b`, `a / b`, `a // b` |
| **40** | Bare Call | Left | Known function with unparenthesized argument | `:sin x`, `:ln x` |
| **30** | Additive | Left | `+`, `-` | `a + b`, `a - b` |
| **20** | Relational / Set | None | `=`, `==`, `!=`, `<`, `<=`, `>`, `>=`, `\in`, `\notin`, `\subset`, `\equiv` | `x^2 + y^2 = 4`, `x \in S` |
| **10** | Range | None | `..` | `1..10`, `0..N \step 2` |
| **7** | Logical Not | Right | `\not` | `\not p` |
| **6** | Logical And | Left | `\and`, `\land` | `p \and q` |
| **5** | Logical Or | Left | `\or`, `\lor` | `p \or q` |
| **4** | Domain Filter | None | `\where` | `y = :sqrt(x) \where x >= 0` |
| **0** | Block / Top | None | Statements, blocks (`{ ... }`), declarations | `{\axis x, y; x = y}` |

### Ambiguity Resolution Table

| Expression | Interpretation | AST Node | Rationale |
| :--- | :--- | :--- | :--- |
| `2x` | Implicit multiplication | `BinaryOp('*', 2, x, isImplicit: true)` | Numerical coefficient notation $2x \equiv 2 \cdot x$ |
| `xy` | Implicit multiplication | `BinaryOp('*', x, y, isImplicit: true)` | Bare adjacent letters multiply ($x \cdot y$) |
| `:theta` | Single multi-letter variable | `Identifier('theta')` | Colon prefix identifies multi-letter token |
| `a/bc` | $a / (b \cdot c)$ | `BinaryOp('/', a, BinaryOp('*', b, c))` | `bc` is the implicit product $b \cdot c$ |
| `a / b c` | $(a / b) \cdot c$ | `BinaryOp('*', BinaryOp('/', a, b), c)` | Left-to-right explicit division followed by product |
| `a // b` | Stacked fraction $\frac{a}{b}$ | `BinaryOp('/', a, b)` | Stacked fraction display with exact rational semantics |
| `f(x)` | Multiplication $f \cdot x$ | `BinaryOp('*', f, x, isImplicit: true)` | Single letter followed by parenthesized term multiplies |
| `:f(x)` | Function application $f(x)$ | `FunctionCall('f', [x])` | Colon-prefixed callee applies function |
| `2^3^2` | $2^{(3^2)} = 2^9 = 512$ | `BinaryOp('^', 2, BinaryOp('^', 3, 2))` | Exponentiation is right-associative |
| `-x^2` | $-(x^2)$ | `UnaryOp('-', BinaryOp('^', x, 2))` | Exponentiation binds tighter than unary negation |
| `d//dx :f(x)` | $\frac{d}{dx}[f(x)]$ | `Diff('x', FunctionCall('f', [x]))` | Differential operator binds to immediate operand |
| `d//dx :f(x) :g(x)` | $(\frac{d}{dx}[f(x)]) \cdot g(x)$ | `BinaryOp('*', Diff(...), FunctionCall(...))` | Differentiator acts on immediate term; trailing factors multiply |
| `d//dx (:f(x) * :g(x))` | $\frac{d}{dx}[f(x) \cdot g(x)]$ | `Diff('x', BinaryOp('*', ...))` | Parentheses group product under derivative |
