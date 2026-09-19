# Axine Standard Library Reference

This document is a scannable reference of every importable function in the Axine standard library (`documents/lib/`).

---

## Usage

Import an entire library module or import selective symbols:

```axine
\import "lib/numbertheory.ax"
:g = :gcd(48, 18)

\from "lib/trig.ax" \import :sin, :cos
:theta = :sin(0)
```

---

## Table of Contents

- [lib/abs.ax](#libabsax) — Absolute value
- [lib/bisect.ax](#libbisectax) — Bisection root search
- [lib/ceil.ax](#libceilax) — Ceiling function
- [lib/combinatorics.ax](#libcombinatoricsax) — Factorials, permutations, combinations, and partitions
- [lib/exp.ax](#libexpax) — Exponential and logarithm functions
- [lib/floor.ax](#libfloorax) — Floor and rounding
- [lib/graphs.ax](#libgraphsax) — Finite graphs, adjacency, reachability, and cycle detection
- [lib/logic.ax](#liblogicax) — Propositional logic, connectives, truth tables, and satisfiability
- [lib/newton.ax](#libnewtonax) — Newton-Raphson root search
- [lib/numbertheory.ax](#libnumbertheoryax) — Number theory, modular arithmetic, and primality
- [lib/relations.ax](#librelationsax) — Binary relations, closures, and equivalence classes
- [lib/sets.ax](#libsetsax) — Finite set operations, subsets, powersets, and ranges
- [lib/sqrt.ax](#libsqrtax) — Square root, integer square roots, and perfect square tests
- [lib/strings.ax](#libstringsax) — Character-code strings, slices, reversal, and palindromes
- [lib/trees.ax](#libtreesax) — Binary trees, metrics, and traversals
- [lib/trig.ax](#libtrigax) — Trigonometric and hyperbolic functions

---

## lib/abs.ax

Piecewise absolute value defined over the real field.

**Import**: `\import "lib/abs.ax"`

| Function Signature | Description |
| :--- | :--- |
| `:abs(x)` | Absolute value $|x|$ via piecewise relation ($\text{if } x \ge 0 \text{ then } x \text{ else } -x$) |

---

## lib/bisect.ax

Interval-halving root search in pure Axine.

**Import**: `\import "lib/bisect.ax"`

| Function Signature | Description |
| :--- | :--- |
| `:bisect_sqrt_step(x, a, b)` | Single interval-halving step over $[a, b]$ for root of $y^2 - x = 0$ |
| `:bisect_sqrt(x)` | Bisection root search approximating $\sqrt{x}$ over $[0, \max(1, x)]$ |

---

## lib/ceil.ax

Ceiling function defined via floor relation.

**Import**: `\import "lib/ceil.ax"`

| Function Signature | Description |
| :--- | :--- |
| `:ceil(x)` | Least integer $k \ge x$ ($\text{if } \lfloor x \rfloor = x \text{ then } x \text{ else } \lfloor x \rfloor + 1$) |

---

## lib/combinatorics.ax

Counting principles, factorials, permutations, combinations, and integer partitions.

**Import**: `\import "lib/combinatorics.ax"`

| Function Signature | Description |
| :--- | :--- |
| `:factorial(n)` | Factorial $n! = \prod_{i=1}^n i$ for non-negative integer $n$ |
| `:permutations(n, k)` | Number of $k$-permutations of $n$ elements $P(n, k) = \frac{n!}{(n - k)!}$ |
| `:combinations(n, k)` | Number of $k$-combinations of $n$ elements $C(n, k) = \frac{n!}{k!(n - k)!}$ |
| `:binomial(n, k)` | Binomial coefficient $\binom{n}{k}$, alias for `:combinations(n, k)` |
| `:partitions(n)` | Number of integer partitions $p(n)$ via Euler recurrence |
| `:derangements(n)` | Subfactorial $!n$ (permutations of $n$ elements with zero fixed points) |

---

## lib/exp.ax

Exponential and logarithmic functions via degree-12 Taylor series and range reduction.

**Import**: `\import "lib/exp.ax"`

| Function Signature | Description |
| :--- | :--- |
| `:exp_series(x)` | 12-term Taylor polynomial for $e^x$ |
| `:exp_pos(x)` | Range-reduced exponential via square-and-multiply $(e^{x/16})^{16}$ |
| `:exp(x)` | Exponential function $e^x$ for all real $x \in \mathbb{R}$ |
| `:ln_series(u)` | 12-term Taylor series for $\ln(1 + u)$ where $|u| < 1$ |
| `:ln_pos(x)` | Logarithm via square-root domain reduction $64 \cdot \ln(x^{1/64})$ |
| `:ln(x)` | Natural logarithm $\ln(x)$ for positive real $x > 0$ |
| `:log(x, b)` | Base-$b$ logarithm $\log_b(x) = \frac{\ln(x)}{\ln(b)}$ |
| `:log2(x)` | Base-2 logarithm $\log_2(x) = \frac{\ln(x)}{\ln(2)}$ |

---

## lib/floor.ax

Floor and rounding functions defined via discreteness relation.

**Import**: `\import "lib/floor.ax"`

| Function Signature | Description |
| :--- | :--- |
| `:floor(x)` | Greatest integer $k \le x$ using modulo arithmetic $x - (x \bmod 1)$ |
| `:round(x)` | Rounds real $x$ to nearest integer via $\lfloor x + 0.5 \rfloor$ |

---

## lib/graphs.ax

Finite graph representations, adjacency, connectivity, and cycle detection.

**Import**: `\import "lib/graphs.ax"`

| Function Signature | Description |
| :--- | :--- |
| `:make_graph(v, e)` | Constructs undirected graph $(V, E)$ from vertex list $v$ and edge pairs $e$ |
| `:graph_vertices(g)` | Extracts vertex list $V$ from graph $g$ |
| `:graph_edges(g)` | Extracts edge list $E$ from graph $g$ |
| `:adjacent(g, u, v)` | Returns true if vertices $u$ and $v$ share an edge in $g$ |
| `:neighbors(g, u)` | Returns list of all vertices adjacent to vertex $u$ |
| `:degree(g, u)` | Degree of vertex $u$ (count of incident edges) |
| `:reachable(g, u)` | List of all vertices reachable from $u$ via breadth-first search |
| `:has_path(g, u, v)` | Returns true if a path exists between vertices $u$ and $v$ |
| `:is_connected(g)` | Returns true if all vertices belong to a single connected component |
| `:num_components(g)` | Total count of connected components in graph $g$ |
| `:has_cycle(g)` | Returns true if graph $g$ contains at least one cycle ($|E| > |V| - k$) |

---

## lib/logic.ax

Propositional logic connectives, truth assignment tables, and satisfiability analysis.

**Import**: `\import "lib/logic.ax"`

| Function Signature | Description |
| :--- | :--- |
| `:l_not(p)` | Propositional negation $\neg p$ |
| `:l_and(p, q)` | Propositional conjunction $p \land q$ |
| `:l_or(p, q)` | Propositional disjunction $p \lor q$ |
| `:l_implies(p, q)` | Material implication $p \to q \equiv \neg p \lor q$ |
| `:l_iff(p, q)` | Logical equivalence $p \leftrightarrow q$ |
| `:l_xor(p, q)` | Exclusive disjunction $p \oplus q$ |
| `:assignments(n)` | Generates all $2^n$ boolean truth valuation lists for $n$ variables |
| `:table_row1(p, r)` | Formats 1-variable truth table row `[p, r]` |
| `:table_row2(p, q, r)` | Formats 2-variable truth table row `[p, q, r]` |
| `:is_satisfiable(r)` | Returns true if at least one evaluation in result list $r$ is true |
| `:is_tautology(r)` | Returns true if every evaluation in result list $r$ is true |
| `:is_contradiction(r)` | Returns true if every evaluation in result list $r$ is false |

---

## lib/newton.ax

Newton-Raphson root convergence with interval scaling.

**Import**: `\import "lib/newton.ax"`

| Function Signature | Description |
| :--- | :--- |
| `:newton_sqrt_step(x, y)` | Single Newton-Raphson iteration step $y_{n+1} = \frac{1}{2}(y_n + x/y_n)$ |
| `:newton_sqrt_core(x)` | Six unrolled Newton iterations over domain $[0.25, 4.0]$ |
| `:newton_sqrt(x)` | Square root via interval scaling across powers of 4 and Newton convergence |

---

## lib/numbertheory.ax

Divisibility, modular arithmetic, extended Euclidean algorithm, and primality testing.

**Import**: `\import "lib/numbertheory.ax"`

| Function Signature | Description |
| :--- | :--- |
| `:gcd(a, b)` | Greatest common divisor $\gcd(a, b)$ via Euclidean algorithm |
| `:lcm(a, b)` | Least common multiple $\frac{\|a \cdot b\|}{\gcd(a, b)}$ |
| `:ext_gcd(a, b)` | Extended Euclidean algorithm returning $(g, x, y)$ where $ax + by = g$ |
| `:mod(a, m)` | Canonical non-negative remainder in $[0, m - 1]$ |
| `:mod_add(a, b, m)` | Modular addition $(a + b) \bmod m$ |
| `:mod_sub(a, b, m)` | Modular subtraction $(a - b) \bmod m$ |
| `:mod_mul(a, b, m)` | Modular multiplication $(a \cdot b) \bmod m$ |
| `:mod_inv(a, m)` | Modular multiplicative inverse $a^{-1} \bmod m$ (returns 0 if non-coprime) |
| `:isprime(n)` | Primality predicate via trial division |
| `:totient(n)` | Euler's totient function $\phi(n)$ counting integers $k \le n$ coprime to $n$ |
| `:powmod(b, e, m)` | Modular exponentiation $b^e \bmod m$ via repeated squaring |
| `:binomial(n, k)` | Binomial coefficient $\binom{n}{k} = \frac{n!}{k!(n - k)!}$ |
| `:nextprime(n)` | Smallest prime strictly greater than $n$ |
| `:divisors(n)` | Ordered list of all positive divisors of $n$ |
| `:factorize(n)` | Prime factorization returning list of `(prime, exponent)` tuples |

---

## lib/relations.ax

Binary relations over finite sets, closures, and equivalence classes.

**Import**: `\import "lib/relations.ax"`

| Function Signature | Description |
| :--- | :--- |
| `:rel_contains(r, x, y)` | Returns true if pair $(x, y)$ belongs to binary relation $r$ |
| `:is_reflexive(r, s)` | Returns true if relation $r$ is reflexive over set $s$ |
| `:is_symmetric(r)` | Returns true if relation $r$ is symmetric ($(a, b) \in r \implies (b, a) \in r$) |
| `:is_transitive(r)` | Returns true if relation $r$ is transitive |
| `:is_equivalence(r, s)` | Returns true if $r$ is reflexive, symmetric, and transitive on $s$ |
| `:equiv_class(r, s, x)` | Returns equivalence class $[x]_r = \{ y \in s \mid (x, y) \in r \}$ |
| `:reflexive_closure(r, s)` | Computes reflexive closure $r \cup \{ (a, a) \mid a \in s \}$ |
| `:symmetric_closure(r)` | Computes symmetric closure $r \cup \{ (b, a) \mid (a, b) \in r \}$ |
| `:transitive_closure(r)` | Computes transitive closure $r^+$ via fixed-point composition |

---

## lib/sets.ax

Finite set operations, subsets, powersets, and integer ranges.

**Import**: `\import "lib/sets.ax"`

| Function Signature | Description |
| :--- | :--- |
| `:contains(s, x)` | Returns true if element $x$ belongs to finite set $s$ |
| `:card(s)` | Cardinality (number of distinct elements) of set $s$ |
| `:subset(a, b)` | Returns true if set $a$ is a subset of set $b$ ($a \subseteq b$) |
| `:set_equal(a, b)` | Returns true if sets $a$ and $b$ contain identical elements |
| `:union(a, b)` | Computes union set $a \cup b$ without duplicate elements |
| `:intersection(a, b)` | Computes intersection set $a \cap b$ |
| `:difference(a, b)` | Computes set difference $a \setminus b$ |
| `:powerset(s)` | Computes power set $\mathcal{P}(s)$ containing all $2^{\|s\|}$ subsets |
| `:range(a, b)` | Generates discrete integer list $[a, a + 1, \dots, b]$ |

---

## lib/sqrt.ax

Square root defined as mathematical relation with Newton search.

**Import**: `\import "lib/sqrt.ax"`

| Function Signature | Description |
| :--- | :--- |
| `:idiv(a, b)` | Exact integer division $(a - (a \bmod b)) / b$ |
| `:int_sqrt_step(x, y)` | Iteration step for integer square root |
| `:int_sqrt(x)` | Exact integer square root $\lfloor \sqrt{x} \rfloor$ |
| `:is_perfect_square(x)` | Returns integer root $\sqrt{x}$ if exact, otherwise -1 |
| `:sqrt(x)` | Exact integer root for squares, stands unreduced for negative reals, else Newton approximation |

---

## lib/strings.ax

String operations over finite sequences of numeric character codes.

**Import**: `\import "lib/strings.ax"`

| Function Signature | Description |
| :--- | :--- |
| `:str_len(s)` | Length (element count) of character code list $s$ |
| `:str_empty(s)` | Returns true if string length is 0 |
| `:str_concat(a, b)` | Concatenates two character code lists $a + b$ |
| `:char_at(s, i)` | Character code at 0-based index $i$ |
| `:str_reverse(s)` | Reverses order of character codes in string $s$ |
| `:substring(s, start, end)` | Extracts slice from index `start` up to index `end` |
| `:substr(s, start, len)` | Extracts slice of length `len` starting at index `start` |
| `:str_equal(a, b)` | Structural equality comparison of character sequences |
| `:is_palindrome(s)` | Returns true if string reads identically forward and backward |

---

## lib/trees.ax

Binary tree construction, structural metrics, and tree traversals.

**Import**: `\import "lib/trees.ax"`

| Function Signature | Description |
| :--- | :--- |
| `:empty_tree` | Constant empty binary tree `[]` |
| `:leaf(v)` | Constructs leaf node `[v, [], []]` containing value $v$ |
| `:node(v, l, r)` | Constructs binary tree node `[v, l, r]` with subtrees $l$ and $r$ |
| `:is_empty(t)` | Returns true if tree $t$ is empty |
| `:is_leaf(t)` | Returns true if node $t$ is a non-empty leaf |
| `:value(t)` | Returns root value $v$ of node $t$ |
| `:left(t)` | Returns left subtree of node $t$ |
| `:right(t)` | Returns right subtree of node $t$ |
| `:vertices(t)` | Total count of vertices in tree $t$ |
| `:edges(t)` | Total count of edges in tree $t$ ($\max(0, \|V\| - 1)$) |
| `:leaves(t)` | Total count of leaf nodes in tree $t$ |
| `:height(t)` | Height of tree $t$ (0 for leaf, $1 + \max(h_l, h_r)$ for internal node) |
| `:preorder(t)` | Preorder traversal sequence `[v, ...preorder(l), ...preorder(r)]` |
| `:inorder(t)` | Inorder traversal sequence `[...inorder(l), v, ...inorder(r)]` |
| `:postorder(t)` | Postorder traversal sequence `[...postorder(l), ...postorder(r), v]` |

---

## lib/trig.ax

Circular and hyperbolic trigonometric functions via degree-25 Taylor series and angle reduction.

**Import**: `\import "lib/trig.ax"`

| Function Signature | Description |
| :--- | :--- |
| `:sin_series(x)` | 13-term degree-25 Taylor series for $\sin(x)$ |
| `:cos_series(x)` | 13-term degree-24 Taylor series for $\cos(x)$ |
| `:reduce_angle(x)` | Reduces angle modulo $2\pi$ into interval $[-\pi, \pi]$ |
| `:sin(x)` | Circular sine function $\sin(x)$ for real $x \in \mathbb{R}$ |
| `:cos(x)` | Circular cosine function $\cos(x)$ for real $x \in \mathbb{R}$ |
| `:tan(x)` | Circular tangent function $\tan(x) = \frac{\sin(x)}{\cos(x)}$ |
| `:asin_series(x)` | Taylor series for inverse sine |
| `:asin(x)` | Inverse sine function $\arcsin(x)$ |
| `:acos(x)` | Inverse cosine function $\arccos(x) = \frac{\pi}{2} - \arcsin(x)$ |
| `:atan_series(x)` | Taylor series for inverse tangent |
| `:atan_half(x)` | Argument reduction $\frac{x}{1 + \sqrt{1 + x^2}}$ |
| `:atan(x)` | Inverse tangent function $\arctan(x)$ |
| `:sinh_series(x)` | Taylor series for hyperbolic sine |
| `:cosh_series(x)` | Taylor series for hyperbolic cosine |
| `:sinh(x)` | Hyperbolic sine function $\sinh(x)$ |
| `:cosh(x)` | Hyperbolic cosine function $\cosh(x)$ |
| `:tanh(x)` | Hyperbolic tangent function $\tanh(x) = \frac{\sinh(x)}{\cosh(x)}$ |
