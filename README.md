# Axine

<p align="center">
  <img src="public/logo.png" alt="Axine Logo" width="120" />
</p>

Axine is a programming language and execution environment for mathematics. It computes over exact rationals, continuous relations, and user-defined algebraic structures without external runtime dependencies.

Files use the `.ax` extension.

---

## Examples

### 1. Exact rational arithmetic
```axine
1/3 + 1/3 + 1/3
```
**Produces:** `1` (exact rational with `BigInt` numerator and denominator; no floating-point rounding error).

### 2. Relation in a declared 2D space
```axine
{\axis x, y;
  x^2 + y^2 = 4
}
```
**Produces:** A 2D coordinate space rendering the circular level set of radius 2 via implicit sampling. The relation renders because it holds on that domain, not because of a plot command.

### 3. Quantified function definition and application
```axine
\forall x, :f(x) = x * 3
:f(2)
```
**Produces:** `6`. Multi-letter names use the `:` prefix; bare single letters are algebraic variables.

### 4. Expressions standing unreduced
```axine
2*x + 3*y
```
**Produces:** `2*x + 3*y`. Expressions that cannot reduce to scalars stand as first-class expression values rather than failing or returning `NaN`.

### 5. Intersecting relations in 3D space
```axine
{\axis x, y, z;
  x^2 + y^2 = 1
  z = x + y
}
```
**Produces:** A 3D coordinate space containing a circular cylinder and an inclined plane. The elliptic intersection curve appears where both relations hold simultaneously.

---

## Distinctive Characteristics

- **Single Equality Operator (`=`)**: `=` is the only equality and binding form. Imperative assignment operators (`:=`) do not exist.
- **Juxtaposition is Multiplication**: Bare adjacent letters denote multiplication ($xy = x \cdot y$). Multi-letter names require a colon prefix (`:sin`, `:theta`, `:vec`).
- **Parentheses on Single Letters Multiply**: `f(x)` denotes $f \cdot x$. Function calls require a multi-letter or colon-prefixed identifier (`:f(x)`).
- **Coordinate Spaces as Manifolds**: Declaring axes (`{\axis x, y; ...}`) creates a coordinate space. The renderer extracts zero level sets using uniform implicit sampling (Marching Squares in 2D, Marching Cubes in 3D).
- **The Seven-Primitive Core Floor**: The core runtime implements seven primitives: exact rational arithmetic, relational comparison, syntactic substitution, bounded iteration, first-class expressions as values, ordered tuples, and structural equality. All higher mathematical functions, transcendentals, and calculus rules are written in pure Axine in standard libraries.

---

## Scope and Boundaries

For a detailed breakdown of implemented domains, partial facilities, and out-of-scope capabilities, see [`COVERAGE.md`](./COVERAGE.md).

In brief, Axine:
- Does not perform heuristic type coercion or guess missing equations.
- Does not perform infinite-depth symbolic integration or arbitrary multivariate polynomial ideal solving.
- Is not an interactive theorem prover (such as Lean or Coq) with automated tactic search.
- Reports `budget-exhausted` or returns unreduced expressions when computational fuel limits are reached.

---

## Install and Run

```bash
# Install dependencies
npm install

# Run the test suite
npm test

# Start the interactive development server
npm run dev

# Build for production
npm run build
```

---

## Attribution

Designed and directed by Noah Slayton (tuco3k).  
Implementation written by Google Gemini (via Antigravity).  
Architecture and code review with Anthropic's Claude.
