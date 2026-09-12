# Axine Relational Library Coverage & Future Libraries

This document tracks mathematical, geometric, and numerical domains that belong in Axine relational libraries written in pure Axine relation syntax (\`.ax\`), rather than hardcoded imperative TypeScript in the core engine.

---

## 1. Riemann Sum Partition Visualizations

### Status: Pure Axine Relational Library (To Be Implemented in \`.ax\`)
The Riemann sum partition visualization (previously implemented as ~100 lines of imperative TypeScript micro-canvas code) was retired from the core runtime. Keeping procedural canvas drawing in the core violates Axine's core design tenet: **the core does not possess privileged geometric knowledge that the user cannot express.**

In pure Axine, Riemann sums, Darboux upper/lower sums, and trapezoidal approximations are expressed directly as piecewise spatial relations and geometric manifolds over coordinate blocks:

\`\`\`axine
# riemann.ax — Rectangular Partition Manifold in Pure Axine
\module :riemann

# Step function partition relation over interval [a, b] with n subdivisions
{\axis :x, :y;
  :dx = (b - a) / n
  :k = \floor((:x - a) / :dx)
  :x_eval = a + :k * :dx
  :y = :f(:x_eval) \where :x \ge a \and :x \le b
}
\`\`\`

By defining partition geometry as a relation in Axine:
1. Partitions automatically participate in the 2D/3D spatial solver, multi-viewport projection, and interactive domain zooming.
2. Left, right, midpoint, and trapezoidal rules are just mathematical variations of the evaluation point \`:x_eval\`.
3. The language requires no special-cased "explainer" canvas subsystem.

---

## 2. Standard Relational Library Manifest

| Library Module | Domain | Pure Relational Representation |
| :--- | :--- | :--- |
| \`documents/lib/sqrt.ax\` | Exact Square Roots & Recurrences | Integer root testing + Newton recurrence relation |
| \`documents/lib/exp.ax\` | Exponential & Logarithm | Taylor series recurrence & inverse relation search |
| \`documents/lib/trig.ax\` | Trigonometry & Inverse Trig | Maclaurin polynomials & unit circle manifold |
| \`documents/lib/riemann.ax\` | Numerical Integration & Step Manifolds | Piecewise partition bounds over coordinate axes |
| \`documents/lib/linear.ax\` | Linear Algebra & Inner Products | Matrix relations and bilinear inner product spaces |
| \`documents/lib/physics.ax\` | Differential Equations of Motion | Relational state constraints across time manifolds |
