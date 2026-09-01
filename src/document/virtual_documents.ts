// Build-time bundled virtual documents for offline browser execution and Node resolution

export const BUNDLED_DOCUMENTS: Record<string, string> = {
  'physics.ax': `# physics.ax — Physics domain library for Axine
# Provides dimensions, units, Body record, forces, step integrators, energy and momentum

module physics

dimension length, time, mass

unit meter : length
unit second : time
unit kilogram : mass
unit newton = kilogram * meter / second^2
unit joule = newton * meter

Body := record { mass, position, velocity }
Particle := record { mass, position, velocity }

view for Body := b -> [circle(b.position, 1), arrow(b.position, b.velocity)]

# Forces
gravity_force(b, g) := (0, -b.mass * g)
spring_force(b, k, anchor) := (-k * (b.position[0] - anchor[0]), -k * (b.position[1] - anchor[1]))
drag_force(b, c) := (-c * b.velocity[0], -c * b.velocity[1])

# Step Integrators
euler_step(b, force_fn, dt) := {
  F := force_fn(b);
  a := (F[0] / b.mass, F[1] / b.mass);
  new_pos := (b.position[0] + b.velocity[0] * dt, b.position[1] + b.velocity[1] * dt);
  new_vel := (b.velocity[0] + a[0] * dt, b.velocity[1] + a[1] * dt);
  Body(mass: b.mass, position: new_pos, velocity: new_vel)
}

verlet_step(b, force_fn, dt) := {
  F := force_fn(b);
  a := (F[0] / b.mass, F[1] / b.mass);
  new_pos := (b.position[0] + b.velocity[0] * dt + 0.5 * a[0] * dt^2, b.position[1] + b.velocity[1] * dt + 0.5 * a[1] * dt^2);
  mid_body := Body(mass: b.mass, position: new_pos, velocity: b.velocity);
  F_next := force_fn(mid_body);
  a_next := (F_next[0] / b.mass, F_next[1] / b.mass);
  new_vel := (b.velocity[0] + 0.5 * (a[0] + a_next[0]) * dt, b.velocity[1] + 0.5 * (a[1] + a_next[1]) * dt);
  Body(mass: b.mass, position: new_pos, velocity: new_vel)
}

rk4_step(b, force_fn, dt) := {
  F1 := force_fn(b);
  a1 := (F1[0] / b.mass, F1[1] / b.mass);
  v1 := b.velocity;
  b2 := Body(mass: b.mass, position: (b.position[0] + 0.5 * dt * v1[0], b.position[1] + 0.5 * dt * v1[1]), velocity: (b.velocity[0] + 0.5 * dt * a1[0], b.velocity[1] + 0.5 * dt * a1[1]));
  F2 := force_fn(b2);
  a2 := (F2[0] / b.mass, F2[1] / b.mass);
  v2 := b2.velocity;
  b3 := Body(mass: b.mass, position: (b.position[0] + 0.5 * dt * v2[0], b.position[1] + 0.5 * dt * v2[1]), velocity: (b.velocity[0] + 0.5 * dt * a2[0], b.velocity[1] + 0.5 * dt * a2[1]));
  F3 := force_fn(b3);
  a3 := (F3[0] / b.mass, F3[1] / b.mass);
  v3 := b3.velocity;
  b4 := Body(mass: b.mass, position: (b.position[0] + dt * v3[0], b.position[1] + dt * v3[1]), velocity: (b.velocity[0] + dt * a3[0], b.velocity[1] + dt * a3[1]));
  F4 := force_fn(b4);
  a4 := (F4[0] / b.mass, F4[1] / b.mass);
  v4 := b4.velocity;
  new_pos := (b.position[0] + (dt / 6) * (v1[0] + 2 * v2[0] + 2 * v3[0] + v4[0]), b.position[1] + (dt / 6) * (v1[1] + 2 * v2[1] + 2 * v3[1] + v4[1]));
  new_vel := (b.velocity[0] + (dt / 6) * (a1[0] + 2 * a2[0] + 2 * a3[0] + a4[0]), b.velocity[1] + (dt / 6) * (a1[1] + 2 * a2[1] + 2 * a3[1] + a4[1]));
  Body(mass: b.mass, position: new_pos, velocity: new_vel)
}

kinetic_energy(b) := 0.5 * b.mass * (b.velocity[0]^2 + b.velocity[1]^2 + (if length(b.velocity) > 2 then b.velocity[2]^2 else 0))
momentum(b) := if length(b.velocity) > 2 then (b.mass * b.velocity[0], b.mass * b.velocity[1], b.mass * b.velocity[2]) else (b.mass * b.velocity[0], b.mass * b.velocity[1])

export Body, Particle, gravity_force, spring_force, drag_force, euler_step, verlet_step, rk4_step, kinetic_energy, momentum
`,

  'physics_problem.ax': `---
title: Two-Particle Inelastic Collision and Kinetic Energy Loss
course: PHYS 101
author: Noah Slayton
date: 2026-09-01
---

# Physics worked problem: Collision of two particles and energy accounting

import "physics.ax"

# Define two colliding particles
p1 := Particle(mass: 2, position: (0, 0, 0), velocity: (10, 0, 0))
p2 := Particle(mass: 3, position: (5, 0, 0), velocity: (-5, 0, 0))

# Initial individual and total momenta
p1_mom := momentum(p1)
p2_mom := momentum(p2)
total_initial_momentum := (p1_mom[0] + p2_mom[0], p1_mom[1] + p2_mom[1], p1_mom[2] + p2_mom[2])

# Initial kinetic energies
ke1 := kinetic_energy(p1)
ke2 := kinetic_energy(p2)
total_initial_ke := ke1 + ke2

# Completely inelastic collision: merged particle
merged_mass := p1.mass + p2.mass
merged_vx := total_initial_momentum[0] / merged_mass
merged_particle := Particle(mass: merged_mass, position: (5, 0, 0), velocity: (merged_vx, 0, 0))

# Final momentum and kinetic energy
final_mom := momentum(merged_particle)
final_ke := kinetic_energy(merged_particle)
ke_lost := total_initial_ke - final_ke

total_initial_momentum
total_initial_ke
merged_particle
final_mom
final_ke
ke_lost
`,

  'projectile.ax': `# projectile.ax — Projectile motion with gravity and air drag
import "./physics.ax"

b0 := Body(mass: 1, position: (0, 0), velocity: (10, 15))
g := 9.8
c := 0.05

force_fn(b) := (
  -c * b.velocity[0],
  -b.mass * g - c * b.velocity[1]
)

# Simulate projectile trajectory using RK4
traj := simulate(b -> rk4_step(b, force_fn, 0.02), b0, t in 0..3, dt: 0.02)

# Sample state at t = 1.0s
b_1 := traj[1.0]
E_k1 := kinetic_energy(b_1)
`,

  'pendulum.ax': `# pendulum.ax — Simple pendulum trajectory and energy
import "./physics.ax"

L := 2.0
g := 9.81

# Pendulum state: (theta, omega)
p0 := (0.5, 0.0)

# Step function for pendulum: d(theta)/dt = omega, d(omega)/dt = -(g/L)*sin(theta)
pendulum_step(s, dt) := {
  theta := s[0];
  omega := s[1];
  alpha := -(g / L) * sin(theta);
  new_theta := theta + omega * dt + 0.5 * alpha * dt^2;
  alpha_next := -(g / L) * sin(new_theta);
  new_omega := omega + 0.5 * (alpha + alpha_next) * dt;
  (new_theta, new_omega)
}

traj := simulate(s -> pendulum_step(s, 0.02), p0, t in 0..5, dt: 0.02)

# Verify oscillation at t = 2.0s
s_2 := traj[2.0]
`,

  'orbit.ax': `# orbit.ax — Planetary orbit simulation with central gravitational force
import "./physics.ax"

GM := 100.0

# Orbit initial condition: radius r = 10, circular speed v = sqrt(GM/r) = sqrt(10) ~= 3.162277
b0 := Body(mass: 1.0, position: (10.0, 0.0), velocity: (0.0, 3.162277))

orbit_force(b) := {
  x := b.position[0];
  y := b.position[1];
  r2 := x^2 + y^2;
  r := sqrt(r2);
  F_mag := -GM * b.mass / r2;
  (F_mag * (x / r), F_mag * (y / r))
}

traj := simulate(b -> rk4_step(b, orbit_force, 0.05), b0, t in 0..20, dt: 0.05)

# Verify angular momentum L = x*vy - y*vx at t = 10.0s
b_10 := traj[10.0]
L_10 := b_10.position[0] * b_10.velocity[1] - b_10.position[1] * b_10.velocity[0]
`,

  'collision.ax': `# collision.ax — Elastic collision of two bodies
import "./physics.ax"

b1_0 := Body(mass: 2.0, position: (-5.0, 0.0), velocity: (3.0, 0.0))
b2_0 := Body(mass: 1.0, position: (5.0, 0.0), velocity: (-1.0, 0.0))

# Two-body system state: (b1, b2)
initial_system := (b1_0, b2_0)

two_body_step(sys, dt) := {
  b1 := sys[0];
  b2 := sys[1];
  p1 := b1.position[0];
  p2 := b2.position[0];
  v1 := b1.velocity[0];
  v2 := b2.velocity[0];
  # Check for contact (distance < 0.5)
  is_colliding := abs(p1 - p2) < 0.5 and (v1 - v2) > 0;
  new_v1 := if is_colliding then ((b1.mass - b2.mass) * v1 + 2 * b2.mass * v2) / (b1.mass + b2.mass) else v1;
  new_v2 := if is_colliding then ((b2.mass - b1.mass) * v2 + 2 * b1.mass * v1) / (b1.mass + b2.mass) else v2;
  new_b1 := Body(mass: b1.mass, position: (p1 + new_v1 * dt, 0.0), velocity: (new_v1, 0.0));
  new_b2 := Body(mass: b2.mass, position: (p2 + new_v2 * dt, 0.0), velocity: (new_v2, 0.0));
  (new_b1, new_b2)
}

traj := simulate(sys -> two_body_step(sys, 0.05), initial_system, t in 0..4, dt: 0.05)

# Verify state after collision at t = 3.0s
sys_3 := traj[3.0]
b1_post := sys_3[0]
b2_post := sys_3[1]
total_p := b1_post.mass * b1_post.velocity[0] + b2_post.mass * b2_post.velocity[0]
`,

  'spring.ax': `# spring.ax — Damped harmonic oscillator simulation
import "./physics.ax"

k := 4.0
c := 0.2
b0 := Body(mass: 1.0, position: (3.0, 0.0), velocity: (0.0, 0.0))

spring_force_fn(b) := (
  -k * b.position[0] - c * b.velocity[0],
  0.0
)

traj := simulate(b -> rk4_step(b, spring_force_fn, 0.05), b0, t in 0..10, dt: 0.05)

# Verify position at t = 3.0s
b_3 := traj[3.0]
x_3 := b_3.position[0]
`,

  'integrator_comparison.ax': `# integrator_comparison.ax — Energy drift comparison across integrators
# Compares Euler vs Verlet vs RK4 on a harmonic oscillator (k = 1, m = 1)
import "./physics.ax"

k := 1.0
b0 := Body(mass: 1.0, position: (1.0, 0.0), velocity: (0.0, 0.0))

harmonic_force(b) := (-k * b.position[0], 0.0)

# Simulate using Euler step (O(h) error, noticeable energy drift)
traj_euler := simulate(b -> euler_step(b, harmonic_force, 0.1), b0, t in 0..10, dt: 0.1)

# Simulate using Verlet step (symplectic, bounded energy oscillations)
traj_verlet := simulate(b -> verlet_step(b, harmonic_force, 0.1), b0, t in 0..10, dt: 0.1)

# Simulate using RK4 step (O(h^4) error, high accuracy)
traj_rk4 := simulate(b -> rk4_step(b, harmonic_force, 0.1), b0, t in 0..10, dt: 0.1)

# Energy trajectory mapping over time
E_euler_t := map(b -> float(0.5 * b.velocity[0]^2 + 0.5 * k * b.position[0]^2), traj_euler)
E_verlet_t := map(b -> float(0.5 * b.velocity[0]^2 + 0.5 * k * b.position[0]^2), traj_verlet)
E_rk4_t := map(b -> float(0.5 * b.velocity[0]^2 + 0.5 * k * b.position[0]^2), traj_rk4)

# Plot all three energy curves together
graph(E_euler_t, E_verlet_t, E_rk4_t)

# Initial energy: E0 = 0.5 * 1.0 * 1.0^2 = 0.5
b_e10 := traj_euler[10.0]
b_v10 := traj_verlet[10.0]
b_r10 := traj_rk4[10.0]

E_euler_10 := float(0.5 * b_e10.velocity[0]^2 + 0.5 * k * b_e10.position[0]^2)
E_verlet_10 := float(0.5 * b_v10.velocity[0]^2 + 0.5 * k * b_v10.position[0]^2)
E_rk4_10 := float(0.5 * b_r10.velocity[0]^2 + 0.5 * k * b_r10.position[0]^2)

# Energy drift from exact E = 0.5
drift_euler := float(abs(E_euler_10 - 0.5))
drift_verlet := float(abs(E_verlet_10 - 0.5))
drift_rk4 := float(abs(E_rk4_10 - 0.5))
`,

  'optics.ax': `# optics.ax — Geometric optics with zero built-in physics
# Ray propagation, interface refraction (Snell's Law), and custom views

Ray := record { origin, direction, intensity }

view for Ray := r -> [
  segment(r.origin, (r.origin[0] + r.direction[0] * 4.0, r.origin[1] + r.direction[1] * 4.0)),
  circle(r.origin, 0.2)
]

# Snell's law step function for medium boundary at x = 5.0 (n1 = 1.0 -> n2 = 1.5)
propagate_and_refract(r, dt) := {
  x := r.origin[0];
  y := r.origin[1];
  dx := r.direction[0];
  dy := r.direction[1];
  new_x := x + dx * dt;
  new_y := y + dy * dt;
  
  # When crossing boundary at x = 5.0 from air (1.0) into glass (1.5)
  crossed := (x < 5.0 and new_x >= 5.0);
  n1 := 1.0;
  n2 := 1.5;
  # theta1 relative to normal (1, 0): cos(theta1) = dx
  # n1*sin(theta1) = n2*sin(theta2)
  new_dx := if crossed then sqrt(1.0 - (n1 / n2)^2 * (1.0 - dx^2)) else dx;
  new_dy := if crossed then (n1 / n2) * dy else dy;
  
  Ray(origin: (new_x, new_y), direction: (new_dx, new_dy), intensity: r.intensity)
}

# Initial ray incident at 45 degrees
r0 := Ray(origin: (0.0, 0.0), direction: (0.707106, 0.707106), intensity: 1.0)

traj := simulate(r -> propagate_and_refract(r, 0.1), r0, t in 0..2, dt: 0.1)

# Ray state after refraction
r_end := traj[2.0]
`,

  'linear.ax': `# linear.math — Linear Algebra domain library
# Provides user-defined kinds, inner product space operations, projection and orthogonalization

module linear

kind InnerProductSpace(dim, field) extends VectorSpace(dim, field) {
  operations: [dot_prod, norm_sq]
  axioms: ["conjugate symmetry", "linearity in first argument", "positive definiteness"]
}

Basis := record { vectors, dimension }

dot_prod(u, v) := u[0]*v[0] + u[1]*v[1] + u[2]*v[2]

norm_sq(v) := dot_prod(v, v)

norm(v) := sqrt(norm_sq(v))

proj_scalar(u, v) := dot_prod(u, v) / norm_sq(v)

proj_vec(u, v) := (
  (proj_scalar(u, v)) * v[0],
  (proj_scalar(u, v)) * v[1],
  (proj_scalar(u, v)) * v[2]
)

export InnerProductSpace, Basis, dot_prod, norm_sq, norm, proj_scalar, proj_vec
`,

  'linear_problem.ax': `---
title: Gram-Schmidt Orthogonalization and Vector Projection
course: MATH 220
author: Noah Slayton
date: 2026-09-01
---

# Linear algebra worked problem: Constructing an orthogonal basis using Gram-Schmidt

import "linear.ax"

# Initial non-orthogonal basis vectors in R^3
v1 := (1, 1, 0)
v2 := (1, 0, 2)

# First orthogonal vector
u1 := v1

# Second orthogonal vector: u2 := v2 - proj_{u1}(v2)
p21 := proj_vec(v2, u1)
u2 := (v2[0] - p21[0], v2[1] - p21[1], v2[2] - p21[2])

# Verify orthogonality: dot_prod(u1, u2) must be 0
orthogonality_check := dot_prod(u1, u2)

# Compute norms of orthogonal basis vectors
u1_length := norm(u1)
u2_length := norm(u2)

# Construct orthogonal basis record
ortho_basis := Basis(vectors: [u1, u2], dimension: 2)

u1
p21
u2
orthogonality_check
u1_length
u2_length
ortho_basis
`,

  'statistics.ax': `# statistics.math — Statistics domain library
# Provides distribution representations, densities, and hypothesis testing structures

module statistics

NormalDist := record { mean, variance }
UniformDist := record { a, b }
HypothesisTest := record { null_val, sample_mean, sample_size, std_dev, z_stat }

pdf_normal(d, x) := (1 / sqrt(2 * pi * d.variance)) * exp(- (x - d.mean)^2 / (2 * d.variance))

mean_normal(d) := d.mean
var_normal(d) := d.variance

z_test(null_val, x_bar, s, n) := HypothesisTest(
  null_val: null_val,
  sample_mean: x_bar,
  sample_size: n,
  std_dev: s,
  z_stat: (x_bar - null_val) / (s / sqrt(n))
)

export NormalDist, UniformDist, HypothesisTest, pdf_normal, mean_normal, var_normal, z_test
`,

  'statistics_problem.ax': `---
title: One-Sample Hypothesis Testing and Normal PDF Evaluation
course: STAT 200
author: Noah Slayton
date: 2026-09-01
---

# Statistics worked problem: Evaluating hypothesis test z-statistic and distribution densities

import "statistics.ax"

# Standard normal distribution and shifted distribution
std_norm := NormalDist(mean: 0, variance: 1)
test_dist := NormalDist(mean: 100, variance: 225)

# Density at mean and at 1 standard deviation
density_at_mean := pdf_normal(std_norm, 0)
density_at_1sd := pdf_normal(std_norm, 1)

# Hypothesis test on sample of size n=36, sample mean=105, known std_dev=15 against H0: mu=100
test_result := z_test(100, 105, 15, 36)

# Access test components
null_hypothesis_value := test_result.null_val
observed_z := test_result.z_stat

density_at_mean
density_at_1sd
test_result
null_hypothesis_value
observed_z
`
};
