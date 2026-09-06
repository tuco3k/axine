# Architectural Assessment: Mathematical Capabilities and the Expanded Floor

> **Document Type**: Normative Architectural Specification & Capability Road Map  
> **Status**: Complete Specification (Updated with C9 Operator Overloading) — Ready for Implementation  
> **Target System**: Axine 2.0+ (Pure Relational Universe)  
> **Reference Baselines**: [`AGENTS.md`](../AGENTS.md), [`docs/SYNTAX_V2.md`](./SYNTAX_V2.md), [`docs/SEMANTICS.md`](./SEMANTICS.md), [`docs/BUILTIN_ASSESSMENT.md`](./BUILTIN_ASSESSMENT.md), [`docs/LEFTOVER_AUDIT.md`](./LEFTOVER_AUDIT.md), [`docs/DERIVATIVE_ASSESSMENT.md`](./DERIVATIVE_ASSESSMENT.md)

---

## Executive Summary

Axine today computes numbers with high fidelity: exact rationals, multi-precision floats, interval bisections, numerical ODE continuation, and uniform level-set manifold sampling. However, **Axine handles mathematical structures not at all**. A user can define an algebraic equation over real scalar variables, but they cannot define a finite group, a polynomial ring with its own arithmetic, a custom vector space, a piecewise function over geometric partitions, or a derivative on non-Euclidean objects.

Every advanced mathematical facility in the codebase today—symbolic differentiation, algebraic simplification, equation isolation, limits, and series—is hardcoded in TypeScript as rigid switch statements over internal AST nodes. Like the 44 procedural builtins recently removed in Phase 12, these hardcoded subsystems lock the user into a small set of anticipated operations.

This document specifies the **irreducible set of nine core capabilities** (C1 through C9) required to transform Axine from a scalar calculus engine into an extensible environment for abstract mathematics. It inventories each capability, derives its minimal floor addition, establishes the dependency graph, specifies the exact backslash commands, works out five comprehensive mathematical applications, estimates implementation costs, and inventories open theoretical risks.

```
                           THE CAPABILITY PYRAMID
┌─────────────────────────────────────────────────────────────────────────────┐
│ LEVEL 3: STRUCTURE-BOUND OPERATIONS & TOPOLOGY                              │
│ • C9: Operator Overloading by Structure (\with, \op)                        │
│ • C7: Homomorphisms & Actions, C8: Quotient Structures                      │
│ • Differential Forms, Exterior Calculus, Tensor Algebras                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ LEVEL 2: COMPUTATIONAL & LOGICAL ABSTRACTIONS                               │
│ • C4: Bounded Quantifiers (\forall, \exists), C3: Structural Folds (\fold)  │
│ • C5: Piecewise Regional Partitions (\cases), C6: Operation Tables & Axioms │
├─────────────────────────────────────────────────────────────────────────────┤
│ LEVEL 1: THE EXTENDED CORE FLOOR                                            │
│ • C1: First-Class Syntactic Terms (\match, \build, \rule)                   │
│ • C2: Inductive Type Constructors & Carrier Set Comprehensions (\set)       │
├─────────────────────────────────────────────────────────────────────────────┤
│ LEVEL 0: THE EXISTING IRREDUCIBLE FLOOR                                     │
│ • Exact Rational Arithmetic, Numerical Relations (=, <, <=), Substitution  │
│ • Implicit Grid Sampler & Continuous ODE Continuation (RK4)                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## A. The Capability Inventory

Below is the complete inventory of missing core capabilities, what currently cannot be written without them, what the core engine must provide, the notation implied, and what additional mathematics becomes expressible.

---

### 1. Expressions as Values & Equational Pattern Rewriting (Term Homoiconicity)

#### What It Is
The ability to treat mathematical expressions as first-class, inspectable, and constructible syntactic terms without forcing immediate evaluation to scalar numbers. The core provides structural pattern matching over term shapes (`\match`), syntactic construction (`\build`), and fuel-bounded equational substitution (`\rule`).

#### What Currently Cannot Be Written
- **Symbolic Differentiation (`d//dx`)**: User-defined derivative rules on custom operators or functions.
- **Algebraic Simplification & Factoring**: Rules like $x^2 - y^2 \to (x - y)(x + y)$ or $\sin^2(x) + \cos^2(x) \to 1$.
- **Symbolic Integration by Parts & Transforms**: $\int u \, dv = uv - \int v \, du$ and Laplace/Fourier transform tables.
- **Solving & Isolation Steps**: Step-by-step algebraic manipulation of equations.

#### What the Core Must Provide
1. An `Expression` term representation (`{ type: 'expression', ast: ASTNode }`) in the value tower.
2. A structural pattern matching and unification algorithm (`\match`, matching AST subtrees to metavariables $u, v \in \mathrm{Expr}$).
3. A structural expression constructor (`\build`, synthesizing AST nodes from bound subtrees).
4. A fuel-bounded equational term-rewriting engine executing recursive bottom-up / top-down fixpoint passes.
5. Term quoting and quasi-quoting primitives to construct unevaluated AST templates.

#### Notation Implied
```axine
\rule <name>: <pattern> = <replacement> [\requires <condition>]
\match <expr> { \case <pattern>: <result>, ... }
\build <type>(<args>)
```

#### What Else Becomes Possible
- Operational transform calculus (Laplace, Fourier, Mellin, Z-transforms).
- Computer algebra normalization for non-commutative algebras (quaternions, Clifford algebras, Dirac matrices).
- Automated derivation generation for pedagogical explanations.

---

### 2. Collections as Definable Objects & Inductive Data Constructors

#### What It Is
The ability to define discrete collections (finite sets, sequences, tuples, matrices, graphs, simplicial complexes) as algebraic structures built from primitive constructors (e.g. empty set $\emptyset$, element adjunction $\{x\} \cup S$, list `nil` and `cons(head, tail)`), rather than relying on a hardcoded JavaScript `ListValue` array.

#### What Currently Cannot Be Written
- **Carrier Sets for Abstract Structures**: Declaring $G = \{e, a, b, c\}$ or $\mathbb{Z}_7 = \{0, 1, 2, 3, 4, 5, 6\}$.
- **Matrices Over Arbitrary Rings**: Matrices whose elements are polynomial expressions, quaternions, or modular integers.
- **Simplicial Complexes & Chains**: Combinatorial geometric structures for algebraic topology.
- **Polynomials as Coefficient Lists**: $P(x) = \sum a_k x^k$ represented as $[a_0, a_1, \dots, a_n]$.

#### What the Core Must Provide
1. Inductive type constructor registry (tagged records and sum types).
2. Set comprehension evaluation over discrete domains: $\{ x \in S \mid P(x) \}$.
3. Structural destructuring in relation patterns (e.g. decomposing a list into `head` and `tail`).

#### Notation Implied
```axine
\set { <elem1>, <elem2>, ... }
\set { <var> \in <domain> \where <predicate> }
```

#### What Else Becomes Possible
- Permutation groups $S_n$ and alternating groups $A_n$.
- Finite fields $\mathbb{F}_{p^k}$.
- Graph-theoretic structures (nodes, edges, adjacency relations).

---

### 3. Folding, Mapping, and Structural Aggregation (\fold)

#### What It Is
The catamorphism abstraction: reducing a collection to a single value by iteratively applying an associative binary relation from an initial identity element ($\mathrm{foldr} / \mathrm{foldl}$), and mapping relations elementwise over collections.

#### What Currently Cannot Be Written
- **Arbitrary Sums & Products**: Big-operator aggregations $\sum_{x \in S} f(x)$, $\prod_{g \in G} g$, $\bigoplus_{i=1}^n V_i$, $\bigotimes A_i$.
- **Polynomial Evaluation (Horner's Method)**: Evaluating $a_n x^n + \dots + a_0$ by folding over coefficients.
- **Matrix Operations Over Custom Rings**: Matrix multiplication, determinants, and traces defined via general algebraic summation rather than floating-point arrays.
- **Norms on Abstract Vector Spaces**: Computing $\|v\| = \sqrt{\sum v_i^2}$ for user-defined vector spaces.

#### What the Core Must Provide
1. A fuel-bounded collection iterator that traverses inductive constructors (lists, sets) without stack overflow.
2. Accumulator binding and reduction loop semantics inside the relation reducer.

#### Notation Implied
```axine
\fold <op> \over <collection> \from <initial_value>
\map <relation> \over <collection>
```

#### What Else Becomes Possible
- Statistical aggregations over sample spaces.
- Vector dot products, tensor contractions, and matrix multiplications over arbitrary user-defined rings.
- Combinatorial search over finite sets (minimum, maximum, argmax).

---

### 4. Bounded Quantification (\forall, \exists)

#### What It Is
First-order predicate evaluation over finite or bounded discrete domains, reducing a quantified proposition ($\forall x \in S, P(x)$ or $\exists x \in S, P(x)$) to a definitive boolean truth value or an explicit counterexample witness.

#### What Currently Cannot Be Written
- **Axiom Verification**: Verifying whether a binary operation table on a finite set satisfies associativity ($\forall a, b, c \in G, (a \star b) \star c = a \star (b \star c)$).
- **Group Identity & Inverse Validation**: Checking $\exists e \in G, \forall x \in G, e \star x = x$ and $\forall x \in G, \exists y \in G, x \star y = e$.
- **Predicate Filtering on Sets**: Constructing subsets of elements satisfying constraints (e.g. prime subfields, centers of groups $Z(G) = \{ z \in G \mid \forall g \in G, gz = zg \}$).

#### What the Core Must Provide
1. Bounded domain enumeration engine with short-circuit evaluation ($(\exists x, P(x))$ halts on first true; $(\forall x, P(x))$ halts on first false).
2. Counterexample certificate extraction on validation failure.

#### Notation Implied
```axine
\forall <vars> \in <collection>, <predicate>
\exists <vars> \in <collection>, <predicate>
```

#### What Else Becomes Possible
- Automated property-based verification of mathematical definitions.
- Subgroup tests (verifying $H \le G$ by checking $x y^{-1} \in H$).
- Injectivity and surjectivity checks for functions between finite sets.

---

### 5. Piecewise Definitions over Partitioned Domains (\cases)

#### What It Is
The ability to define relations and functions whose mathematical formulations branch over mutually disjoint geometric regions or logical predicates, with exact boundary condition semantics.

#### What Currently Cannot Be Written
- **Standard Piecewise Analysis**: Step functions (Heaviside $\theta(x)$), triangle waves, clamp functions.
- **Boundary Value Problems (BVPs)**: Specifying differential equations with regional source terms or piecewise potentials.
- **Splines and Finite Elements**: Continuous piecewise polynomial splines spanning partitioned intervals.
- **Piecewise Level-Set Sampling**: Rendering manifolds with conditional boundaries.

#### What the Core Must Provide
1. Condition-branch evaluator that tests domain predicates in order and dispatches evaluation to the active branch.
2. Symbolic derivative propagation through piecewise nodes (producing piecewise derivatives with Dirac delta $\delta(x)$ jump terms at boundaries).
3. Sampler boundary-refinement around partition interfaces.

#### Notation Implied
```axine
\cases {
  \when <condition_1>: <expr_1>,
  \when <condition_2>: <expr_2>,
  \otherwise: <expr_default>
}
```

#### What Else Becomes Possible
- Non-smooth mechanical systems (collisions, Coulomb friction models).
- Complex analysis branch cuts (logarithm and root branch selections).
- Generalized indicator functions $\mathbf{1}_A(x)$ for measure theory.

---

### 6. Operation Tables, Signatures, and Axiom Declarations

#### What It Is
The ability to declare an algebraic structure $(S, \star, \dots)$ specified by a carrier set $S$, one or more closed operations with explicit Cayley lookup tables or algorithmic relations, and a set of mathematical axioms that the structure must satisfy.

#### What Currently Cannot Be Written
- **Finite Groups & Semigroups**: Cyclic groups $C_n$, dihedral groups $D_{2n}$, quaternion group $Q_8$.
- **Custom Rings & Fields**: Polynomial quotient rings, Galois fields $\mathbb{F}_{p^n}$.
- **Lie Algebras**: Vector spaces equipped with a Lie bracket $[X, Y]$ satisfying the Jacobi identity $[X, [Y, Z]] + [Y, [Z, X]] + [Z, [X, Y]] = 0$.

#### What the Core Must Provide
1. Multi-Kind signature table (SEMANTICS.md Section 4) capable of registering user-defined algebraic structures.
2. Cayley table lookup reducer ($O(1)$ discrete operation dispatch).
3. Automated axiom check pass that evaluates declared axioms over carrier sets using bounded quantifiers.

#### Notation Implied
```axine
\structure <name> {
  \carrier: <set>,
  \op <op_name>: <operation_table_or_relation>,
  \axiom <axiom_name>: <quantified_relation>
}
```

#### What Else Becomes Possible
- Group representation theory and character tables.
- Cryptographic finite field arithmetic (e.g. AES $GF(2^8)$ field).
- Formal classification of user-defined algebraic structures.

---

### 7. Structure-Preserving Maps (Homomorphisms & Actions)

#### What It Is
Declaring and validating mappings $\phi: G \to H$ between two algebraic structures that preserve operational relations ($\phi(a \star_G b) = \phi(a) \star_H \phi(b)$), including group actions on sets ($G \times X \to X$) and linear maps between custom vector spaces.

#### What Currently Cannot Be Written
- **Group & Ring Homomorphisms**: Evaluating $\phi(x)$ and proving $\ker(\phi) \trianglelefteq G$ and $\mathrm{im}(\phi) \le H$.
- **Group Actions & Symmetries**: Defining how rotation/reflection groups act on geometric vertex sets.
- **Linear Transformations on Custom Spaces**: Matrix representations of linear maps relative to user-defined bases.

#### What the Core Must Provide
1. Mapping type `{ type: 'homomorphism', source, target, mapFn }`.
2. Automatic homomorphism verification pass checking $\forall a, b \in G, \phi(a \star b) = \phi(a) \star \phi(b)$ using bounded quantification.
3. Kernel and Image computation over finite structures: $\ker \phi = \{ x \in G \mid \phi(x) = e_H \}$.

#### Notation Implied
```axine
\homomorphism <name>: <source_structure> \to <target_structure> \map <relation>
\action <name>: <group> \on <set> \map <relation>
```

#### What Else Becomes Possible
- Exact sequences and diagram chasing in homological algebra.
- Symmetry orbits and stabilizer calculations via Orbit-Stabilizer theorem.
- Coordinate chart transformations on differential manifolds.

---

### 8. Quotient Structures & Equivalence Relations

#### What It Is
Constructing a new mathematical structure $S / \sim$ by partitioning a carrier set $S$ modulo an equivalence relation $\sim$ (or modulo a normal subgroup $N \trianglelefteq G$ or ideal $I \subseteq R$), defining operations on equivalence classes $[x]$, and selecting canonical normal representatives.

#### What Currently Cannot Be Written
- **Modular Arithmetic as a True Ring**: $\mathbb{Z}/n\mathbb{Z}$ where elements are congruence classes $[a]_n$.
- **Field Extensions via Polynomial Quotients**: Constructing $\mathbb{C} \cong \mathbb{R}[x] / (x^2 + 1)$ or $\mathbb{F}_{p^2} \cong \mathbb{F}_p[x] / (P(x))$.
- **Projective & Quotient Manifolds**: Projective plane $\mathbb{RP}^2 = (\mathbb{R}^3 \setminus \{0\}) / \sim$, torus $\mathbb{T}^2 = \mathbb{R}^2 / \mathbb{Z}^2$.

#### What the Core Must Provide
1. Equivalence class representation with a normalizer function $S \to S$ computing the canonical representative of $[x]$.
2. Well-definedness verification of induced operations: $\forall a_1 \sim a_2, b_1 \sim b_2 \implies (a_1 \star b_1) \sim (a_2 \star b_2)$.

#### Notation Implied
```axine
\quotient <structure> \by <equivalence_relation_or_subgroup>
```

#### What Else Becomes Possible
- Algebraic construction of complex numbers and finite fields from first principles.
- Fundamental groups $\pi_1(X)$ and homology groups $H_k(X) = Z_k / B_k$.
- Affine and projective algebraic geometry over quotient rings.

---

### 9. Operator Overloading by Structure (\with, \op)

#### What It Is
The ability to bind standard arithmetic and algebraic operators (`+`, `-`, `*`, `/`, `^`, `\wedge`, `\otimes`, `\circ`, `\star`, `==`) to user-defined relations within the context of a mathematical structure. When an expression `a + b` is evaluated where `a, b \in S` (or inside a structural scope `\with :Structure { ... }`), the evaluator dispatches `+` to the structure's registered addition relation rather than failing with a kind mismatch or defaulting to real scalar arithmetic.

#### What Currently Cannot Be Written
- **Idiomatic Polynomial Arithmetic**: Writing `:p1 + :p2` and `:p1 * :p2` for polynomial coefficient lists rather than invoking awkward procedural names like `:add_poly(:p1, :p2)`.
- **Modular Arithmetic Systems**: Writing `3 + 5` inside `\with :Z7 { ... }` evaluating directly to `1`.
- **Matrix Rings Over Arbitrary Rings**: Writing `:A * :B` where element additions and multiplications use the underlying ring's overloaded operators.
- **Quaternion & Clifford Multiplication**: Writing `:q1 * :q2` resolving to the non-commutative Hamilton product.

#### What the Core Must Provide
1. Structure-scoped operator dispatch table in `OpTable` (SEMANTICS.md Section 4 & Context System).
2. Lexical structure scoping pragma `\with <structure> { ... }` that binds active operator overloads for enclosed statements.
3. Dynamic operator dispatch: when evaluating `BinaryOp(op, left, right)`, resolve against the active structure's operator table before falling back to scalar arithmetic.

#### Notation Implied
```axine
\structure <name> {
  \carrier: <set>,
  \op +: <add_relation>,
  \op *: <mul_relation>
}

\with <structure> {
  # Operators resolve to structure definitions
  :c = :a + :b
}
```

#### What Else Becomes Possible
- Direct mathematical notation across all user-defined rings, fields, vector spaces, and algebras.
- Dual numbers for exact automatic differentiation ($a + b\epsilon$ with $\epsilon^2 = 0$).
- Interval arithmetic packages defined entirely in Axine standard libraries.

---

## B. The Dependency Graph & Minimal First Addition

The nine capabilities form a strict directed acyclic dependency graph.

```
                                DEPENDENCY GRAPH
                                
      [C1. Expressions as Values]               [C2. Inductive Collections]
                  │                                         │
         ┌────────┴────────┐                       ┌────────┴────────┐
         ▼                 ▼                       ▼                 ▼
  [C5. Piecewise]   [Equational Diff]        [C3. Folding]     [Comprehensions]
         │                 │                       │                 │
         │                 │                       └────────┬────────┘
         │                 │                                ▼
         │                 │                     [C4. Bounded Quantifiers]
         │                 │                                │
         │                 └───────────────┬────────────────┘
         │                                 ▼
         └──────────────────────► [C6. Operation Tables & Axioms]
                                           │
                        ┌──────────────────┼──────────────────┐
                        ▼                  ▼                  ▼
              [C7. Homomorphisms]   [C8. Quotients]   [C9. Operator Overloads]
```

### Dependency Audit Table

| Capability | Prerequisites | Reason for Dependency |
| :--- | :--- | :--- |
| **C1. Expressions as Values** | None (Core floor addition) | Foundation for all symbolic transformation, term rewriting, and pattern matching. |
| **C2. Inductive Collections** | None (Core floor addition) | Foundation for discrete structures, sets, and lists. |
| **C3. Folding (\fold)** | **C2** (Inductive Collections) | Cannot reduce a collection without a structured collection representation. |
| **C4. Bounded Quantifiers** | **C2** (Collections), **C3** (Folding) | $\forall$ and $\exists$ evaluate as boolean reductions over finite collections. |
| **C5. Piecewise (\cases)** | **C1** (Expressions as Values) | Piecewise functions require branch substitution and expression preservation. |
| **C6. Operation Tables & Axioms** | **C2** (Collections), **C4** (Quantifiers) | Axiom checking evaluates quantified propositions over carrier collections. |
| **C7. Homomorphisms** | **C6** (Structures), **C4** (Quantifiers) | Validating $\phi(a \star b) = \phi(a) \star \phi(b)$ is a quantified axiom over $G$. |
| **C8. Quotient Structures** | **C6** (Structures), **C4** (Quantifiers), **C1** (Expressions) | Requires quotient normalizer and well-definedness quantification. |
| **C9. Operator Overloading** | **C6** (Structures), **C1** (Expressions) | Binds structural operations to operator syntax within lexical scopes. |

### The Minimal First Addition

The dependency analysis reveals that the **minimal first step** consists of:
1. **C1 (Expressions as Values & Term Rewriting)**: Unlocks symbolic differentiation (`d//dx`), algebraic simplification, integration by parts, and transform tables.
2. **C2 + C4 (Inductive Collections & Bounded Quantifiers)**: Unlocks finite sets, sums, products, and axiom validation.

---

## C. The Floor, Revised

### 1. The Floor Today
Today's minimal floor consists strictly of:
1. Exact rational arithmetic (`BigFraction`) and IEEE-754 float operations.
2. Numerical relational predicates ($=, <, \le, >, \ge$).
3. Relational constraint isolation and scalar substitution ($v = c \implies v \mapsto c$).
4. Uniform implicit grid sampling (Marching Squares / Cubes) and continuous IVP numerical continuation (RK4).
5. Fuel-bounded iteration counter.

### 2. The Revised Floor (After All Capabilities Are Added)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           THE REVISED AXINE FLOOR                           │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. VALUES & NUMBER TOWER                                                    │
│    • Exact Rational, Float, Boolean, String, Tagged Term                    │
│    • Expression Term: { type: 'expression', ast: ASTNode }                  │
│    • Structure Descriptor: { type: 'structure', carrier, opTable, axioms }  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. EQUATIONAL TERM REWRITING & PATTERN ENGINE                               │
│    • AST structural pattern matcher with wildcard binding (\match)          │
│    • AST node constructor (\build)                                          │
│    • Fuel-bounded fixpoint term substitution and rule dispatch (\rule)      │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. DISCRETE ITERATION & QUANTIFICATION KERNEL                               │
│    • Structural catamorphism loop (\fold over inductive collections)        │
│    • Short-circuiting bounded quantifier evaluator (\forall, \exists)       │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. STRUCTURE-SCOPED OPERATOR DISPATCH TABLE                                 │
│    • Context-bound operator resolution (\with, \op)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ 5. RELATIONAL SAMPLER & CONTINUATION ENGINE (UNCHANGED)                     │
│    • Uniform implicit grid evaluation over [-L, L]^n                        │
│    • Forward numerical continuation for differential relations (RK4)        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3. Does "Expressions as Values" Make Axine Homoiconic?

**Yes, plainly.** If expressions can be stored in variables, matched on structural shape, and spliced into new expressions, the language possesses homoiconicity (code can be represented as data and manipulated as data).

#### What Does Homoiconicity Cost?
1. **Value Tower Expansion**: `ExpressionValue` is added to `src/core/types.ts`.
2. **Evaluation Boundary**: The evaluator must distinguish between *evaluating* an expression (reducing it to a number or space) and *constructing* an expression (leaving it as an AST term).
3. **Guard Against Macro Bloat**: Axine must **not** become a general-purpose macro-expansion programming language. The rewriter must be restricted strictly to **fuel-bounded equational substitution**. It must not provide arbitrary I/O, reflective introspection of runtime scopes, or side-effecting metaprogramming.

---

## D. The Notation, Derived

Per the foundational Axine syntax standard:
- **No bare keywords**: All structural operations use backslash commands (`\command`).
- **Arity follows from AST shape**: Commands take either tokens or expressions according to their grammatical structure.
- **Juxtaposition is multiplication**: Multi-letter variables use the colon prefix (`:var`).

Below is the complete, closed set of backslash commands required:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       COMPLETE BACKSLASH COMMAND SET                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. \rule <name>: <pattern> = <replacement> [\requires <guard>]              │
│    • Arity: 3 or 4 (Identifier, Pattern Expr, Replacement Expr, Guard Expr) │
│    • Meaning: Declares an equational term rewrite rule.                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. \match <expr> { \case <pattern>: <result>, ... }                         │
│    • Arity: 1 (Expression with case branch block)                           │
│    • Meaning: Pattern-matches an expression AST by structure.               │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. \build <node_type>(<args>)                                               │
│    • Arity: 2 (Node Type Token, Argument Tuple)                             │
│    • Meaning: Constructs an unevaluated AST expression term.                │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. \cases { \when <cond>: <expr>, ..., \otherwise: <expr> }                 │
│    • Arity: 1 (Block containing branch pairs)                               │
│    • Meaning: Evaluates a piecewise regional branching expression.          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 5. \forall <vars> \in <collection>, <predicate>                             │
│    • Arity: 3 (Identifier list, Collection Expr, Predicate Expr)            │
│    • Meaning: Evaluates universal quantification over a discrete domain.    │
├─────────────────────────────────────────────────────────────────────────────┤
│ 6. \exists <vars> \in <collection>, <predicate>                             │
│    • Arity: 3 (Identifier list, Collection Expr, Predicate Expr)            │
│    • Meaning: Evaluates existential quantification over a discrete domain.  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 7. \fold <op> \over <collection> \from <initial_value>                      │
│    • Arity: 3 (Binary Op/Function, Collection Expr, Initial Expr)           │
│    • Meaning: Reduces a collection using an associative operation.          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 8. \structure <name> { \carrier: <set>, \op <op>: <rel>, \axiom ... }       │
│    • Arity: 2 (Identifier, Block specification)                             │
│    • Meaning: Declares an algebraic structure with operations and axioms.   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 9. \with <structure> { <statements> }                                       │
│    • Arity: 2 (Structure Expr, Statement Block)                             │
│    • Meaning: Executes statements with structure's operator overloads.      │
├─────────────────────────────────────────────────────────────────────────────┤
│ 10. \quotient <structure> \by <relation_or_subgroup>                        │
│    • Arity: 2 (Structure Expr, Partition Expr)                              │
│    • Meaning: Constructs a quotient structure modulo an equivalence.        │
├─────────────────────────────────────────────────────────────────────────────┤
│ 11. \homomorphism <name>: <source> \to <target> \map <relation>             │
│    • Arity: 4 (Identifier, Source Expr, Target Expr, Map Relation)          │
│    • Meaning: Declares and validates a structure-preserving map.            │
├─────────────────────────────────────────────────────────────────────────────┤
│ 12. \set { <elem1>, <elem2>, ... }                                          │
│    • Arity: 1 (Element list or comprehension)                               │
│    • Meaning: Constructs an explicit or comprehension-defined set.          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## E. What This Makes Possible: Five Concrete Mathematical Workflows

Below are five mathematical formulations written in pure Axine syntax that are **completely impossible** in Axine today, showing exactly how they execute once capabilities C1 through C9 exist.

---

### 1. A Finite Group with Operation Table and Axiom Check (The Klein Four-Group $V_4$)

```axine
# The Klein Four-Group V4 = {e, a, b, c} (Z2 x Z2)
:G_set = \set { :e, :a, :b, :c }

\structure :V4 {
  \carrier: :G_set,
  
  # Cayley Multiplication Table
  \op *: {
    (:e, :e) = :e, (:e, :a) = :a, (:e, :b) = :b, (:e, :c) = :c,
    (:a, :e) = :a, (:a, :a) = :e, (:a, :b) = :c, (:a, :c) = :b,
    (:b, :e) = :b, (:b, :a) = :c, (:b, :b) = :e, (:b, :c) = :a,
    (:c, :e) = :c, (:c, :a) = :b, (:c, :b) = :a, (:c, :c) = :e
  },
  
  # Group Axioms Verified Automatically by Bounded Quantifiers:
  \axiom :closure:
    \forall :x, :y \in :G_set, (:x * :y) \in :G_set,
    
  \axiom :associativity:
    \forall :x, :y, :z \in :G_set, (:x * :y) * :z = :x * (:y * :z),
    
  \axiom :identity:
    \exists :id \in :G_set, \forall :x \in :G_set, :id * :x = :x \land :x * :id = :x,
    
  \axiom :inverses:
    \forall :x \in :G_set, \exists :inv \in :G_set, :x * :inv = :e
}
```

*Outcome*: Axine evaluates the bounded quantifiers over all $4 \times 4 \times 4 = 64$ triples, confirms all four axioms evaluate to `true`, and registers `:V4` as a verified group.

---

### 2. Polynomial Arithmetic Over a User-Defined Finite Ring ($\mathbb{Z}_7[x]$ with Operator Overloading)

```axine
# Define the coefficient ring Z7
:Z7 = \set { 0, 1, 2, 3, 4, 5, 6 }

# Define the Polynomial Ring Structure Z7[x]
\structure :Z7_poly {
  \carrier: \set { :coeffs \in \list(:Z7) },
  
  # Overload + for Polynomials: elementwise addition mod 7
  \op +: \lambda :p1, :p2, \map (\lambda :pair, (:pair.1 + :pair.2) % 7) \over \zip(:p1, :p2),
  
  # Overload * for Polynomials: Cauchy convolution product mod 7
  \op *: \lambda :p1, :p2, \fold (\lambda :k, :acc, :acc \concat [:cauchy_term(:p1, :p2, :k) % 7]) \over (0..(\len(:p1)+\len(:p2)-2)) \from []
}

# In structural context, standard + and * execute polynomial arithmetic!
\with :Z7_poly {
  :p1 = [3, 2, 5]     # 3 + 2x + 5x^2
  :p2 = [4, 6, 1]     # 4 + 6x + x^2
  
  # Evaluates via overloaded + to [ (3+4)%7, (2+6)%7, (5+1)%7 ] = [0, 1, 6]
  :p_sum = :p1 + :p2
}
```

*Outcome*: With C9 operator overloading, `:p_sum` reduces naturally to `[0, 1, 6]` ($x + 6x^2$) using idiomatic mathematical `+` syntax!

---

### 3. Differential Forms and the Exterior Derivative ($d(\omega \wedge \eta)$)

```axine
# Library: lib/differential_forms.ax

# 1. Wedge Product Antisymmetry on 1-forms
\rule :wedge_anti:
  :wedge(:dx_i, :dx_j) = -:wedge(:dx_j, :dx_i)

\rule :wedge_nil:
  :wedge(:dx_i, :dx_i) = 0

# 2. Exterior Derivative of a 0-form (Scalar function f)
\rule :ext_diff_scalar:
  :d(:f) = (d//dx :f) * :dx + (d//dy :f) * :dy + (d//dz :f) * :dz

# 3. Graded Leibniz Rule for Exterior Derivative: d(w ^ n) = dw ^ n + (-1)^p (w ^ dn)
\rule :ext_diff_wedge:
  :d(:wedge(:w, :n)) = :wedge(:d(:w), :n) + (-1)^(\deg(:w)) * :wedge(:w, :d(:n))

# 4. Nilpotency: d(d(w)) = 0
\rule :ext_diff_nilpotent:
  :d(:d(:w)) = 0

# Test Case: 1-form w = x^2 * dy. Compute dw:
# d(x^2 * dy) = d(x^2) ^ dy + x^2 * d(dy) = (2x dx) ^ dy + 0 = 2x (dx ^ dy)
:w = x^2 * :dy
:dw = :d(:w)
```

*Outcome*: `:dw` automatically reduces via equational rewriting to `2 * x * :wedge(:dx, :dy)`.

---

### 4. A Piecewise Function on a Partitioned Domain

```axine
# Continuous Piecewise Function with Derivative Jump
# f(x) = { x^2           if x < 0
#        { sin(x)        if 0 <= x <= pi
#        { -sqrt(x - pi) if x > pi

f(x) = \cases {
  \when x < 0: x^2,
  \when x <= :pi: :sin(x),
  \otherwise: -:sqrt(x - :pi)
}

# The relation is directly plotted by the Sampler
y = f(x) where x \in [-3, 6]

# Symbolic derivative produces the exact piecewise derivative
:df_dx = d//dx f(x)
```

*Outcome*: The sampler refines grid sampling around the partition points $x = 0$ and $x = \pi$, rendering the smooth curve segments without interpolation artifacts across discontinuities.

---

### 5. Integration by Parts as a Library Relation

```axine
# Library: lib/calculus.ax

# Integration by parts: \int u * v' dx = u * v - \int v * u' dx
\rule :int_by_parts:
  \int (:u * :dv) = :u * :v - \int (:v * (d//d:x :u))
    \requires :dv = (d//d:x :v)

# Example: \int x * cos(x) dx
# Match u = x, dv = cos(x) => v = sin(x), du = 1
# Result: x * sin(x) - \int sin(x) * 1 dx = x * sin(x) - (-cos(x)) = x*sin(x) + cos(x)
:integral = \int (x * :cos(x))
```

*Outcome*: The equational rewrite engine applies the rule, invokes the library derivative `d//dx x = 1` and anti-derivative lookup, producing `x * :sin(x) + :cos(x)`.

---

## F. Implementation Cost, Effort, and Conformance Risk

Below is the engineering effort breakdown and invariant risk analysis for each capability:

| Capability | Estimated Effort | Primary Files Affected | Conformance & Test Suite Impact | Invariant Risks & Mitigations |
| :--- | :---: | :--- | :--- | :--- |
| **C1. Expressions as Values & Rewriter** | **1.5 Weeks** | `types.ts`, `parser.ts`, `evaluator.ts`, `algebra/rewrite.ts` | High: affects derivation steps and rule execution across 45 test files. | **Fuel Invariant**: Rewriter must enforce strict step fuel to prevent non-terminating rewrite loops. |
| **C2. Inductive Collections & Sets** | **1.0 Week** | `types.ts`, `parser.ts`, `evaluator.ts` | Medium: replaces ad-hoc `ListValue` with structured inductive terms. | **Honesty Invariant**: Ensure empty sets $\emptyset$ evaluate cleanly to empty manifolds. |
| **C3. Folding (\fold)** | **3 Days** | `evaluator.ts`, `parser.ts` | Low: self-contained structural iterator. | **Stack Invariant**: Must use iterative loop, never deep JS recursion. |
| **C4. Bounded Quantifiers (\forall, \exists)** | **4 Days** | `evaluator.ts`, `parser.ts` | Low: adds boolean short-circuit loop over collections. | **Termination Invariant**: Bounded only to finite collections; reject open real intervals. |
| **C5. Piecewise (\cases)** | **4 Days** | `evaluator.ts`, `sampler.ts`, `symbolic_diff.ts` | Medium: Sampler must detect partition boundaries for grid refinement. | **Discontinuity Invariant**: Render level sets without spurious connecting lines. |
| **C6. Operation Tables & Axioms** | **1.0 Week** | `types.ts`, `evaluator.ts`, `kinds.ts` | Low: builds on Quantifiers and Collections. | **Kind Safety**: OpTable mismatches must produce structured error diagnostics. |
| **C7. Homomorphisms** | **3 Days** | `evaluator.ts`, `parser.ts` | Low: builds on Structures and Quantifiers. | **Diagnostic Honesty**: Clearly report non-homomorphic elements if check fails. |
| **C8. Quotient Structures** | **1.0 Week** | `evaluator.ts`, `algebra/quotient.ts` | Medium: requires normalizer and well-definedness checking. | **Canonical Representative**: Ensure normalizer idempotence $N(N(x)) = N(x)$. |
| **C9. Operator Overloading** | **4 Days** | `types.ts`, `evaluator.ts`, `operations.ts` | Low: structure-scoped dispatch in evaluator. | **No Fast Paths**: Fallback to standard scalar tower when out of structure scope. |

---

## G. What You Do Not Know (Unresolved Theoretical & Architectural Risks)

This section inventories the critical open questions and theoretical boundaries that cannot be resolved without concrete experimentation:

### 1. The Undecidability of Equational Equivalence (Richardson's Theorem)
- When users define equational rewrite rules over transcendental functions, determining whether an expression simplifies to zero ($E \equiv 0$) is **provably undecidable in general** (Richardson's theorem, 1968).
- *Risk*: A library rule engine can get stuck or exhaust fuel on expressions that are mathematically zero but syntactically non-reducing (e.g. $e^{i\pi} + 1$).
- *Resolution*: Axine must honestly report `budget-exhausted` rather than claiming a relation is false.

### 2. Confluence and Termination in User Rule Sets
- If a user imports two libraries with competing or symmetric rewrite rules (e.g. $A \star B \to B \star A$ alongside an expansion rule), the rewrite system may lose confluence or loop indefinitely.
- *Question*: Does Axine require a Knuth-Bendix completion checker in the linter, or is fuel-bounding sufficient?

### 3. Infinite Carrier Sets and the Word Problem for Groups
- While finite groups ($|G| < \infty$) are completely verifiable via bounded quantifiers, infinite finitely-presented groups $\langle S \mid R \rangle$ have an **undecidable Word Problem** (Novikov-Boone theorem).
- *Boundary*: Axine must restrict structural axiom checking strictly to finite discrete sets or finite sample domains, raising an explicit diagnostic if applied to uncountably infinite domains ($\mathbb{R}$).

### 4. Performance Scaling of Discrimination Trees
- A standard library with 300+ mathematical rewrite rules will suffer severe latency under naive linear rule scanning ($O(N \cdot R)$).
- *Question*: Will the core require a Discrimination Tree / Aho-Corasick AST trie to maintain $<16.6\text{ ms}$ interactive slider performance?

### 5. Operator Resolution Order in Nested Structure Scopes
- If a document nests `\with :R1 { \with :R2 { a + b } }`, does operator resolution perform lexical shadowing (inner over outer) or structural kind matching ($a, b \in R_1 \implies R_1$, $a, b \in R_2 \implies R_2$)?
- *Resolution*: Lexical shadowing with fallback to parent structure scope.

---

## H. Final Architectural Verdict

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            FINAL RECOMMENDATION                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. THE STRATEGY: EXPAND THE FLOOR IN TWO PHASES                             │
│    • Phase 1: Expressions as Values & Equational Rewriter (d//dx, algebra). │
│    • Phase 2: Inductive Collections, Bounded Quantifiers, & Structures.     │
├─────────────────────────────────────────────────────────────────────────────┤
│ 2. THE RESULT: 100% OF ADVANCED MATHEMATICS LIVES IN LIBRARIES              │
│    • Core becomes a pure mathematical kernel (~2,500 lines smaller).        │
│    • Groups, rings, differential forms, and transforms written in Axine.    │
│    • Zero hardcoded domain-specific CAS code in TypeScript.                 │
└─────────────────────────────────────────────────────────────────────────────┘
```
