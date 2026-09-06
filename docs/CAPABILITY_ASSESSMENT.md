# Architectural Assessment: Mathematical Capabilities and the Expanded Floor

> **Document Type**: Normative Architectural Specification & Capability Road Map  
> **Status**: Complete Specification — Ready for Architectural Review  
> **Target System**: Axine 2.0+ (Pure Relational Universe)  
> **Reference Baselines**: [`AGENTS.md`](../AGENTS.md), [`docs/SYNTAX_V2.md`](./SYNTAX_V2.md), [`docs/SEMANTICS.md`](./SEMANTICS.md), [`docs/BUILTIN_ASSESSMENT.md`](./BUILTIN_ASSESSMENT.md), [`docs/LEFTOVER_AUDIT.md`](./LEFTOVER_AUDIT.md), [`docs/DERIVATIVE_ASSESSMENT.md`](./DERIVATIVE_ASSESSMENT.md)

---

## Executive Summary

Axine today computes numbers with high fidelity: exact rationals, multi-precision floats, interval bisections, numerical ODE continuation, and uniform level-set manifold sampling. However, **Axine handles mathematical structures not at all**. A user can define an algebraic equation over real scalar variables, but they cannot define a finite group, a polynomial ring with its own arithmetic, a custom vector space, a piecewise function over geometric partitions, or a derivative on non-Euclidean objects.

Every advanced mathematical facility in the codebase today—symbolic differentiation, algebraic simplification, equation isolation, limits, and series—is hardcoded in TypeScript as rigid switch statements over internal AST nodes. Like the 44 procedural builtins recently removed in Phase 12, these hardcoded subsystems lock the user into a small set of anticipated operations.

This document specifies the **irreducible set of core capabilities** required to transform Axine from a scalar calculus engine into an extensible environment for abstract mathematics. It inventories each capability, derives its minimal floor addition, establishes the dependency graph, specifies the exact backslash commands, works out five comprehensive mathematical applications, estimates implementation costs, and inventories open theoretical risks.

```
                           THE CAPABILITY PYRAMID
┌─────────────────────────────────────────────────────────────────────────────┐
│ LEVEL 3: ABSTRACT ALGEBRAIC STRUCTURES & TOPOLOGY                           │
│ • Groups, Rings, Fields, Quotient Structures, Homomorphisms                 │
│ • Differential Forms, Exterior Calculus, Tensor Algebras                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ LEVEL 2: COMPUTATIONAL & LOGICAL ABSTRACTIONS                               │
│ • Bounded Quantifiers (\forall, \exists), Structural Catamorphisms (\fold) │
│ • Piecewise Regional Partitions (\cases, \when), Equational Rewriting       │
├─────────────────────────────────────────────────────────────────────────────┤
│ LEVEL 1: THE EXTENDED CORE FLOOR                                            │
│ • First-Class Syntactic Terms & Pattern Destructuring                       │
│ • Inductive Type Constructors & Carrier Set Comprehensions                  │
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
The ability to treat mathematical expressions as first-class, inspectable, and constructible syntactic terms without forcing immediate evaluation to scalar numbers. The core provides structural pattern matching over term shapes and fuel-bounded equational substitution.

#### What Currently Cannot Be Written
- **Symbolic Differentiation (`d//dx`)**: User-defined derivative rules on custom operators or functions.
- **Algebraic Simplification & Factoring**: Rules like $x^2 - y^2 \to (x - y)(x + y)$ or $\sin^2(x) + \cos^2(x) \to 1$.
- **Symbolic Integration by Parts & Transforms**: $\int u \, dv = uv - \int v \, du$ and Laplace/Fourier transform tables.
- **Solving & Isolation Steps**: Step-by-step algebraic manipulation of equations.

#### What the Core Must Provide
1. An `Expression` term representation (`{ type: 'expression', ast: ASTNode }`) in the value tower.
2. A structural pattern matching and unification algorithm (matching AST subtrees to metavariables $u, v \in \mathrm{Expr}$).
3. A fuel-bounded equational term-rewriting engine executing recursive bottom-up / top-down fixpoint passes.
4. Term quoting and quasi-quoting primitives to construct unevaluated AST templates.

#### Notation Implied
```axine
\rule <name>: <pattern> = <replacement> [\requires <condition>]
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
- **Boundary Value Problems (BVPs)**: Specifying differential equations with regional source terms or piecewise potentials $V(x) = \begin{cases} 0 & 0 \le x \le L \\ \infty & \text{otherwise} \end{cases}$.
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

## B. The Dependency Graph & Minimal First Addition

The capabilities are not independent; they form a strict directed acyclic dependency graph.

```
                                DEPENDENCY GRAPH
                                
      [1. Expressions as Values]               [2. Inductive Collections]
                  │                                         │
         ┌────────┴────────┐                       ┌────────┴────────┐
         ▼                 ▼                       ▼                 ▼
  [5. Piecewise]   [Equational Diff]         [3. Folding]    [Comprehensions]
         │                 │                       │                 │
         │                 │                       └────────┬────────┘
         │                 │                                ▼
         │                 │                     [4. Bounded Quantifiers]
         │                 │                                │
         │                 └───────────────┬────────────────┘
         │                                 ▼
         └──────────────────────► [6. Operation Tables & Axioms]
                                           │
                                  ┌────────┴────────┐
                                  ▼                 ▼
                        [7. Homomorphisms]   [8. Quotients]
```

### Dependency Audit Table

| Capability | Prerequisites | Reason for Dependency |
| :--- | :--- | :--- |
| **1. Expressions as Values** | None (Core floor addition) | Foundation for all symbolic transformation and term manipulation. |
| **2. Inductive Collections** | None (Core floor addition) | Foundation for discrete structures, sets, and lists. |
| **3. Folding (\fold)** | **2** (Inductive Collections) | Cannot reduce a collection without a structured collection representation. |
| **4. Bounded Quantifiers** | **2** (Collections), **3** (Folding) | $\forall$ and $\exists$ evaluate as boolean reductions over finite collections. |
| **5. Piecewise (\cases)** | **1** (Expressions as Values) | Piecewise functions require branch substitution and expression preservation. |
| **6. Operation Tables & Axioms** | **2** (Collections), **4** (Quantifiers) | Axiom checking evaluates quantified propositions over carrier collections. |
| **7. Homomorphisms** | **6** (Structures), **4** (Quantifiers) | Validating $\phi(a \star b) = \phi(a) \star \phi(b)$ is a quantified axiom over $G$. |
| **8. Quotient Structures** | **6** (Structures), **4** (Quantifiers), **1** (Expressions) | Requires quotient normalizer and well-definedness quantification. |

### The Minimal First Addition

The dependency analysis reveals that the **minimal first step** consists of two complementary additions:
1. **Capability 1 (Expressions as Values & Equational Rewriter)**: Unlocks symbolic differentiation (`d//dx`), algebraic simplification, integration by parts, and transform tables.
2. **Capability 2 + 4 (Inductive Collections & Bounded Quantifiers)**: Unlocks finite sets, sums, products, and axiom validation.

Together, these two additions unlock 90% of the downstream algebraic graph.

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
│    • AST structural pattern matcher with wildcard binding                   │
│    • Fuel-bounded fixpoint term substitution and rule dispatch              │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. DISCRETE ITERATION & QUANTIFICATION KERNEL                               │
│    • Structural catamorphism loop (\fold over inductive collections)        │
│    • Short-circuiting bounded quantifier evaluator (\forall, \exists)       │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. RELATIONAL SAMPLER & CONTINUATION ENGINE (UNCHANGED)                     │
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
│ 2. \cases { \when <cond>: <expr>, ..., \otherwise: <expr> }                 │
│    • Arity: 1 (Block containing branch pairs)                               │
│    • Meaning: Evaluates a piecewise regional branching expression.          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 3. \forall <vars> \in <collection>, <predicate>                             │
│    • Arity: 3 (Identifier list, Collection Expr, Predicate Expr)            │
│    • Meaning: Evaluates universal quantification over a discrete domain.    │
├─────────────────────────────────────────────────────────────────────────────┤
│ 4. \exists <vars> \in <collection>, <predicate>                             │
│    • Arity: 3 (Identifier list, Collection Expr, Predicate Expr)            │
│    • Meaning: Evaluates existential quantification over a discrete domain.  │
├─────────────────────────────────────────────────────────────────────────────┤
│ 5. \fold <op> \over <collection> \from <initial_value>                      │
│    • Arity: 3 (Binary Op/Function, Collection Expr, Initial Expr)           │
│    • Meaning: Reduces a collection using an associative operation.          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 6. \structure <name> { \carrier: <set>, \op <op>: <table>, \axiom ... }     │
│    • Arity: 2 (Identifier, Block specification)                             │
│    • Meaning: Declares an algebraic structure with operations and axioms.   │
├─────────────────────────────────────────────────────────────────────────────┤
│ 7. \quotient <structure> \by <relation_or_subgroup>                         │
│    • Arity: 2 (Structure Expr, Partition Expr)                              │
│    • Meaning: Constructs a quotient structure modulo an equivalence.        │
├─────────────────────────────────────────────────────────────────────────────┤
│ 8. \homomorphism <name>: <source> \to <target> \map <relation>              │
│    • Arity: 4 (Identifier, Source Expr, Target Expr, Map Relation)          │
│    • Meaning: Declares and validates a structure-preserving map.            │
├─────────────────────────────────────────────────────────────────────────────┤
│ 9. \set { <elem1>, <elem2>, ... }                                           │
│    • Arity: 1 (Element list or comprehension)                               │
│    • Meaning: Constructs an explicit or comprehension-defined set.          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## E. What This Makes Possible: Five Concrete Mathematical Workflows

Below are five mathematical formulations written in pure Axine syntax that are **completely impossible** in Axine today, showing exactly how they execute once the capabilities are added.

---

### 1. A Finite Group with Operation Table and Axiom Check (The Klein Four-Group $V_4$)

```axine
# The Klein Four-Group V4 = {e, a, b, c} (Z2 x Z2)
:G_set = \set { :e, :a, :b, :c }

\structure :V4 {
  \carrier: :G_set,
  
  # Cayley Multiplication Table
  \op :mul: {
    (:e, :e) = :e, (:e, :a) = :a, (:e, :b) = :b, (:e, :c) = :c,
    (:a, :e) = :a, (:a, :a) = :e, (:a, :b) = :c, (:a, :c) = :b,
    (:b, :e) = :b, (:b, :a) = :c, (:b, :b) = :e, (:b, :c) = :a,
    (:c, :e) = :c, (:c, :a) = :b, (:c, :b) = :a, (:c, :c) = :e
  },
  
  # Group Axioms Verified Automatically by Bounded Quantifiers:
  \axiom :closure:
    \forall :x, :y \in :G_set, (:x \star :y) \in :G_set,
    
  \axiom :associativity:
    \forall :x, :y, :z \in :G_set, (:x \star :y) \star :z = :x \star (:y \star :z),
    
  \axiom :identity:
    \exists :id \in :G_set, \forall :x \in :G_set, :id \star :x = :x \land :x \star :id = :x,
    
  \axiom :inverses:
    \forall :x \in :G_set, \exists :inv \in :G_set, :x \star :inv = :e
}
```

*Outcome*: Axine evaluates the bounded quantifiers over all $4 \times 4 \times 4 = 64$ triples, confirms all four axioms evaluate to `true`, and registers `:V4` as a verified group.

---

### 2. Polynomial Arithmetic Over a User-Defined Finite Ring ($\mathbb{Z}_7[x]$)

```axine
# Define the coefficient ring Z7
:Z7 = \set { 0, 1, 2, 3, 4, 5, 6 }

# Polynomial Addition in Z7[x]: elementwise addition mod 7
\rule :poly_add:
  :add_poly(:p1, :p2) = \map (\lambda :pair, (:pair.1 + :pair.2) % 7) \over \zip(:p1, :p2)

# Polynomial Evaluation via Horner's Method: \fold over coefficient list
# P(x) = a0 + a1*x + a2*x^2 = a0 + x*(a1 + x*(a2))
\rule :poly_eval:
  :eval_poly(:coeffs, :x) = \fold (\lambda :coeff, :acc, (:coeff + :x * :acc) % 7) \over \reverse(:coeffs) \from 0

# P(x) = 3 + 2x + 5x^2 represented as [3, 2, 5]
:P = [3, 2, 5]

# Evaluate P(4) in Z7: 3 + 2(4) + 5(16) = 3 + 8 + 80 = 91 = 0 (mod 7)
:result = :eval_poly(:P, 4)
```

*Outcome*: `:result` reduces to `0`. Polynomials are evaluated over arbitrary rings without any built-in polynomial CAS engine.

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
| **1. Expressions as Values & Rewriter** | **1.5 Weeks** | `types.ts`, `parser.ts`, `evaluator.ts`, `algebra/rewrite.ts` | High: affects derivation steps and rule execution across 45 test files. | **Fuel Invariant**: Rewriter must enforce strict step fuel to prevent non-terminating rewrite loops. |
| **2. Inductive Collections & Sets** | **1.0 Week** | `types.ts`, `parser.ts`, `evaluator.ts` | Medium: replaces ad-hoc `ListValue` with structured inductive terms. | **Honesty Invariant**: Ensure empty sets $\emptyset$ evaluate cleanly to empty manifolds. |
| **3. Folding (\fold)** | **3 Days** | `evaluator.ts`, `parser.ts` | Low: self-contained structural iterator. | **Stack Invariant**: Must use iterative loop, never deep JS recursion. |
| **4. Bounded Quantifiers (\forall, \exists)** | **4 Days** | `evaluator.ts`, `parser.ts` | Low: adds boolean short-circuit loop over collections. | **Termination Invariant**: Bounded only to finite collections; reject open real intervals. |
| **5. Piecewise (\cases)** | **4 Days** | `evaluator.ts`, `sampler.ts`, `symbolic_diff.ts` | Medium: Sampler must detect partition boundaries for grid refinement. | **Discontinuity Invariant**: Render level sets without spurious connecting lines. |
| **6. Operation Tables & Axioms** | **1.0 Week** | `types.ts`, `evaluator.ts`, `kinds.ts` | Low: builds on Quantifiers and Collections. | **Kind Safety**: OpTable mismatches must produce structured error diagnostics. |
| **7. Homomorphisms** | **3 Days** | `evaluator.ts`, `parser.ts` | Low: builds on Structures and Quantifiers. | **Diagnostic Honesty**: Clearly report non-homomorphic elements if check fails. |
| **8. Quotient Structures** | **1.0 Week** | `evaluator.ts`, `algebra/quotient.ts` | Medium: requires normalizer and well-definedness checking. | **Canonical Representative**: Ensure normalizer idempotence $N(N(x)) = N(x)$. |

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
