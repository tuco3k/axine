# AGENTS.md — read before writing any code in this repo

## Claims — honesty rules
A claim whose shadow is true regardless of the theorem is worse than no
claim. If you cannot state in one sentence why the theorem entails the
shadow, the claim is Kind H. This applies to every claim, not only the
ones the spec names.

- Every claim requires a `relevance` field: one sentence stating why the
  theorem entails this shadow. A claim without it does not parse.
- A shadow that is a closed constant (`4 <= 4`) or a tautology over its
  own range (`abs(sin t) <= 1`) is a build failure, not a claim.
- Never attach a famous name to an object that is not that object. A
  document called `clifford` must compute a Clifford torus or be deleted.
- Kind H is a correct, complete answer. Many theorems should be H.
  Reaching for a contrived shadow to avoid H is the failure mode.

## Derivations — completeness & branching rules
A derivation that loses a solution is worse than no derivation. take-root
always branches. Any transformation that can change the solution set
records a side condition, and extraneous roots are reported, never silently
dropped.

## Resolved decisions — do not relitigate
- `unknown` is a VALUE with a reason enum. Never an exception, never NaN.
- `none` != `unknown`. none = definitively absent from the searched range.
  unknown = the search did not finish. Conflating these is the top
  correctness risk in this codebase.
- Fuel exhaustion produces a value. It never throws.
- `/` and `//` are semantically identical, differing only in a display flag.
- `d` and `∂` are reserved. `d / dx` with spaces is an error, not division.
- `a/bc` is an error (`bc` is one identifier). `a / b c` is `a / (b·c)`.
- Bounded `sum`/`Σ` is expression-first: `sum(1/n^2, n in 1..N)`.
- No symbolic simplification beyond constant folding and dropping 0/1 terms.
  No symbolic integration. Ever.
- Ambient and invoked execution use separate worker pools and separate
  budgets. They must never share.
- Pause = cooperative yield. Stop = worker.terminate(). Both are required.
- Values that cannot be represented (complex eigenvalues, sqrt of negative)
  return `unknown(requires-unavailable-theory)`, never a partial number.

## Process rules
- TARGETED EDITS ONLY. Never rewrite a file wholesale with a heredoc.
  This is where the y-axis tick bug came from, twice.
- If a test fails, fix the code. NEVER edit a test to match behavior.
  If a spec item is impossible, STOP AND SAY SO. Do not resolve silently.
- Do not pad test counts with loop-generated variations of one code path.
- No control in the UI may render without wired behavior. No button that
  duplicates another action, no dropdown whose value is never read, no
  status string hardcoded into a template.
- Every view and plotter implements dispose(), and it is called.
- `npm test` does not verify UI behavior. Any claim about timing,
  responsiveness, or interaction requires running the browser and
  measuring it.
- Never report a phase complete based on code inspection. Only after tests
  pass AND you have watched it run.
- A test that would pass on an unimplemented feature is not a test. Two
  values compared for agreement must be obtained by independent means —
  if both derive from the same formula, the test proves nothing.

## Mistakes made in prior sessions — do not repeat
- A y-axis tick bug was introduced by rewriting canvas2d.ts wholesale.
- A failing `a/bc` test was edited to match the implementation instead of
  the implementation being fixed.
- ~140 of 294 tests were loop-generated variations of a single path.
- Four claims shipped with tautological shadows displaying "Verified"
  next to the Four Color Theorem and the Riemann Hypothesis.
- Four corpus documents were arbitrary trig surfaces named after objects
  they did not compute.
- CORPUS.md classified a different set of theorems than the spec named,
  with one placeholder row covering 59 of them.
- The Run button called setText(), identical to typing. The budget
  dropdown was never read.
- Completion was reported for orbit/pan/dolly, Stop timing, and ambient
  responsiveness with no browser session and no measurements.

## Phase Specifications
Detailed requirements and acceptance criteria for Phases 5 through 7 are defined in [`SPEC.md`](./SPEC.md). Read `SPEC.md` directly before starting any phase.
