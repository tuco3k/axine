# Voice

Axine is a language for mathematics. Its interface and documentation
speak the way the language behaves: informative, exact, unhurried. It
states facts. It does not sell, apologize, or cheer.

## State the fact
The content is the fact. Prose that only restates a number is padding.

  NO   "Residual deviation is -0.013, confirming no geometric locus
        exists at this coordinate point."
  YES  "f = -0.013. Grid step 0.0625."

A sentence is fine when it carries information the number does not.

## Use the reader's words
Labels name what a thing is to someone using it, not what it is called
in the implementation or in a design document.

  NO   "Layer 3: Algebraic Reduction & Derivation"
  YES  "How it got here"

  NO   "Source Provenance"
  YES  "Where it came from"

If a label matches a section heading in a spec, it is probably wrong.

## Do not explain the obvious
The interface does not describe its own controls in sentences, narrate
what just happened, or tell the reader what to do next when the next
step is visible.

## No adjectives of quality
Nothing is powerful, advanced, seamless, or intuitive. A thing is what
it does.

## Errors state what happened
No apology, no "oops", no reassurance. Name what occurred and, where it
is a fact rather than a guess, what would make it work.

  NO   "Sorry, something went wrong! Try again?"
  YES  "No sign change in [2, 3]. Bisection requires one."

## Refusals are not failures
When the system does not reduce something, it says so plainly. It does
not apologize for mathematics.

## One voice everywhere
Menus, panel headers, errors, tooltips, README, docs, comments in
shipped .ax files. The register does not change between surfaces.

## Length follows content
Short where the fact is short. Longer where there is more to say. Never
padded to seem thorough, never clipped to seem efficient.
