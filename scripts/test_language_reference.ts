import { evaluate, createInitialEnvironment } from '../src/core/evaluator';
import { formatValue } from '../src/document/editor';
import { runAxineDoc } from './run_doc';

console.log('=== AXINE LANGUAGE REFERENCE VERIFICATION RUNNER ===\n');

function testDoc(title: string, code: string) {
  console.log(`\n========================================`);
  console.log(`TEST: ${title}`);
  console.log(`========================================`);
  console.log(`SOURCE:\n${code.trim()}\n--- OUTPUT ---`);
  const res = runAxineDoc(code.trim());
  for (const r of res) {
    if (r.state === 'PROSE' && r.line.trim().startsWith('#')) {
      console.log(`  ${r.line}`);
    } else if (r.state === 'PROSE' && !r.line.trim()) {
      // blank line
    } else {
      console.log(`  ${r.line.padEnd(45)} => ${r.output}`);
    }
  }
}

// 1. = is the only binding form
testDoc('Rule 1: Binding and relations via =', `
:r = 5
:area = 3.14159 * :r^2
:area
`);

testDoc('Rule 1: Multi-valued and contradictory relations', `
{\\axis x; x^2 = 4}
{\\axis x; x = 1; x = 2}
`);

// 2. : makes a multi-letter word one token
testDoc('Rule 2: Multi-letter tokens vs bare juxtaposition', `
a = 2
b = 3
c = 4
abc
:speed = 100
:speed
`);

// 3. \ prefixes every command
testDoc('Rule 3: Backslash commands', `
\\if 1 < 2 \\then 42 \\else 99
\\set { 1, 2, 3, 4 }
\\fold + \\over [1, 2, 3, 4] \\from 0
`);

// 4. \axis declares a space
testDoc('Rule 4: \\axis declares a space', `
{\\axis x, y; x^2 + y^2 = 25}
{x^2 + y^2 = 25}
`);

// 5. { } is scope and space together
testDoc('Rule 5: Scope blocks and cascading', `
:base = 10
{
  :base = 20
  :inner = :base * 2
  :inner
}
:base
`);

// 6. \forall for bound variables
testDoc('Rule 6: Functions via \\forall', `
\\forall x, :sq(x) = x^2
:sq(5)
\\forall a, b, :hypot(a, b) = :sqrt(a^2 + b^2)
:hypot(3, 4)
`);

// 7. \import and \unimport
testDoc('Rule 7: Imports and unimports', `
\\import "lib/abs.ax"
:abs(-42)
\\unimport "lib/abs.ax"
`);

// 8. Reduction: expressions that cannot reduce stand as themselves
testDoc('Rule 8: Standing unreduced expressions', `
{\\forall x, :f(x) = 2*x; :f}
a + b
x^2 + 1
`);

// 9. Exact rationals and float()
testDoc('Rule 9: Exact rationals and float()', `
:q = 1/3 + 1/6
:q
:large = (1/2)^10
:large
:approx = :float(1/3)
:approx
`);

// 10. Comments are #
testDoc('Rule 10: Comments', `
# This is a comment
x = 7 # inline comment
x
`);


// Standard Library Tests
testDoc('StdLib 1: lib/abs.ax', `
\\import "lib/abs.ax"
:abs(-42)
:abs(-7/4)
`);

testDoc('StdLib 2: lib/floor.ax', `
\\import "lib/floor.ax"
:floor(5.8)
:floor(-3.2)
:round(4.6)
`);

testDoc('StdLib 3: lib/ceil.ax', `
\\import "lib/ceil.ax"
:ceil(5.1)
:ceil(-3.8)
`);

testDoc('StdLib 4: lib/sqrt.ax', `
\\import "lib/sqrt.ax"
:sqrt(25)
:sqrt(2)
:is_perfect_square(49)
`);

testDoc('StdLib 5: lib/exp.ax', `
\\import "lib/exp.ax"
:exp(0)
:exp(1)
:ln(1)
:log2(8)
`);

testDoc('StdLib 6: lib/newton.ax', `
\\import "lib/newton.ax"
:newton_sqrt(2)
:newton_sqrt(16)
`);

testDoc('StdLib 7: lib/bisect.ax', `
\\import "lib/bisect.ax"
:bisect_sqrt(2)
:bisect_sqrt(16)
`);

testDoc('StdLib 8: lib/numbertheory.ax', `
\\import "lib/numbertheory.ax"
:gcd(48, 18)
:lcm(12, 15)
:isprime(17)
:totient(9)
:binomial(5, 2)
:factorize(60)
`);

testDoc('StdLib 9: lib/trig.ax', `
\\import "lib/trig.ax"
:sin(0)
:cos(0)
:tan(0)
:sinh(0)
:cosh(0)
`);
