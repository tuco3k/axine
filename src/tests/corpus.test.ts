import { describe, it, expect } from 'vitest';
import { evaluate, createInitialEnvironment } from '../core/evaluator';
import { formatAST } from '../core/formatter';
import { MathError } from '../core/errors';
import { BigFraction } from '../core/numeric/rational';

interface GoldenTestCase {
  id?: string;
  source: string;
  setup?: string[];
  expectedNormalized?: string;
  expectedValue?: { type: 'rational'; n: bigint; d: bigint } | { type: 'float'; value: number } | { type: 'boolean'; value: boolean } | { type: 'string'; match: string };
  expectedError?: {
    messageContains?: string;
    expectedContains?: string;
    suggestionContains?: string;
  };
}

const GOLDEN_CORPUS: GoldenTestCase[] = [
  // --- 1. Ambiguity Table Rows ---
  {
    source: '2x',
    setup: ['x := 5'],
    expectedNormalized: '2 · x',
    expectedValue: { type: 'rational', n: 10n, d: 1n },
  },
  {
    source: 'xy',
    setup: ['xy := 42'],
    expectedNormalized: 'xy',
    expectedValue: { type: 'rational', n: 42n, d: 1n },
  },
  {
    source: 'xy',
    expectedError: {
      messageContains: "'xy' is not defined. Multi-letter names must be assigned before use",
      suggestionContains: "Did you mean 'x·y' (implicit product) or did you mean to write 'xy := ...' first?",
    },
  },
  {
    source: 'f(x+1)',
    setup: ['x := 3', 'f(t) := t^2'],
    expectedNormalized: 'f(x + 1)',
    expectedValue: { type: 'rational', n: 16n, d: 1n },
  },
  {
    source: 'f(x+1)',
    setup: ['f := 4', 'x := 2'],
    expectedNormalized: 'f · (x + 1)',
    expectedValue: { type: 'rational', n: 12n, d: 1n },
  },
  {
    source: 'a / b c',
    setup: ['a := 12', 'b := 2', 'c := 3'],
    expectedNormalized: 'a / (b · c)',
    expectedValue: { type: 'rational', n: 2n, d: 1n },
  },
  {
    source: 'sin x^2',
    setup: ['x := 0'],
    expectedNormalized: 'sin(x^2)',
    expectedValue: { type: 'float', value: 0 },
  },
  {
    source: '2^3^2',
    expectedNormalized: '2^(3^2)',
    expectedValue: { type: 'rational', n: 512n, d: 1n },
  },
  {
    source: '-x^2',
    setup: ['x := 3'],
    expectedNormalized: '-(x^2)',
    expectedValue: { type: 'rational', n: -9n, d: 1n },
  },

  // --- 2. Precedence and Associativity Edge Cases ---
  {
    source: '1 + 2 * 3',
    expectedNormalized: '1 + 2 * 3',
    expectedValue: { type: 'rational', n: 7n, d: 1n },
  },
  {
    source: '(1 + 2) * 3',
    expectedNormalized: '(1 + 2) * 3',
    expectedValue: { type: 'rational', n: 9n, d: 1n },
  },
  {
    source: '10 - 4 - 2',
    expectedNormalized: '10 - 4 - 2',
    expectedValue: { type: 'rational', n: 4n, d: 1n },
  },
  {
    source: '10 - (4 - 2)',
    expectedNormalized: '10 - (4 - 2)',
    expectedValue: { type: 'rational', n: 8n, d: 1n },
  },
  {
    source: '24 / 6 / 2',
    expectedNormalized: '24 / 6 / 2',
    expectedValue: { type: 'rational', n: 2n, d: 1n },
  },
  {
    source: '24 / (6 / 2)',
    expectedNormalized: '24 / (6 / 2)',
    expectedValue: { type: 'rational', n: 8n, d: 1n },
  },
  {
    source: '2 * 3^2',
    expectedNormalized: '2 * 3^2',
    expectedValue: { type: 'rational', n: 18n, d: 1n },
  },
  {
    source: '(2 * 3)^2',
    expectedNormalized: '(2 * 3)^2',
    expectedValue: { type: 'rational', n: 36n, d: 1n },
  },
  {
    source: '2(3 + 4)',
    expectedNormalized: '2 · (3 + 4)',
    expectedValue: { type: 'rational', n: 14n, d: 1n },
  },
  {
    source: '(2 + 3)(4 + 5)',
    expectedNormalized: '(2 + 3) · (4 + 5)',
    expectedValue: { type: 'rational', n: 45n, d: 1n },
  },
  {
    source: '3!',
    expectedNormalized: '3!',
    expectedValue: { type: 'rational', n: 6n, d: 1n },
  },
  {
    source: '3!^2',
    expectedNormalized: '3!^2',
    expectedValue: { type: 'rational', n: 36n, d: 1n },
  },
  {
    source: '(3!)!',
    expectedNormalized: '3!!',
    expectedValue: { type: 'rational', n: 720n, d: 1n },
  },
  {
    source: '2 * 3!',
    expectedNormalized: '2 * 3!',
    expectedValue: { type: 'rational', n: 12n, d: 1n },
  },
  {
    source: '-3!',
    expectedNormalized: '-3!',
    expectedValue: { type: 'rational', n: -6n, d: 1n },
  },
  {
    source: 'x²',
    setup: ['x := 4'],
    expectedNormalized: 'x²',
    expectedValue: { type: 'rational', n: 16n, d: 1n },
  },
  {
    source: 'x³',
    setup: ['x := 3'],
    expectedNormalized: 'x³',
    expectedValue: { type: 'rational', n: 27n, d: 1n },
  },

  // --- 3. Exact Rational Arithmetic (Float Drift Prevention) ---
  {
    source: '1/3 + 1/3 + 1/3',
    expectedNormalized: '1 / 3 + 1 / 3 + 1 / 3',
    expectedValue: { type: 'rational', n: 1n, d: 1n },
  },
  {
    source: '1/7 + 2/7 + 4/7',
    expectedNormalized: '1 / 7 + 2 / 7 + 4 / 7',
    expectedValue: { type: 'rational', n: 1n, d: 1n },
  },
  {
    source: '1/10 + 2/10',
    expectedNormalized: '1 / 10 + 2 / 10',
    expectedValue: { type: 'rational', n: 3n, d: 10n },
  },
  {
    source: '1/3 * 3',
    expectedNormalized: '1 / 3 * 3',
    expectedValue: { type: 'rational', n: 1n, d: 1n },
  },
  {
    source: '(1/2 + 1/3) * 6',
    expectedNormalized: '(1 / 2 + 1 / 3) * 6',
    expectedValue: { type: 'rational', n: 5n, d: 1n },
  },
  {
    source: '355 / 113 - 355 / 113',
    expectedNormalized: '355 / 113 - 355 / 113',
    expectedValue: { type: 'rational', n: 0n, d: 1n },
  },
  {
    source: '12345678901234567890 * 10',
    expectedNormalized: '12345678901234567890 * 10',
    expectedValue: { type: 'rational', n: 123456789012345678900n, d: 1n },
  },
  {
    source: '2^64',
    expectedNormalized: '2^64',
    expectedValue: { type: 'rational', n: 18446744073709551616n, d: 1n },
  },
  {
    source: '2^(-3)',
    expectedNormalized: '2^(-3)',
    expectedValue: { type: 'rational', n: 1n, d: 8n },
  },
  {
    source: '(2/3)^(-2)',
    expectedNormalized: '(2 / 3)^(-2)',
    expectedValue: { type: 'rational', n: 9n, d: 4n },
  },

  // --- 4. Builtins & Mathematical Functions ---
  {
    source: 'abs(-42)',
    expectedNormalized: 'abs(-42)',
    expectedValue: { type: 'rational', n: 42n, d: 1n },
  },
  {
    source: 'abs(42)',
    expectedNormalized: 'abs(42)',
    expectedValue: { type: 'rational', n: 42n, d: 1n },
  },
  {
    source: 'abs(-3/4)',
    expectedNormalized: 'abs(-3 / 4)',
    expectedValue: { type: 'rational', n: 3n, d: 4n },
  },
  {
    source: 'floor(7/2)',
    expectedNormalized: 'floor(7 / 2)',
    expectedValue: { type: 'rational', n: 3n, d: 1n },
  },
  {
    source: 'floor(-7/2)',
    expectedNormalized: 'floor(-7 / 2)',
    expectedValue: { type: 'rational', n: -4n, d: 1n },
  },
  {
    source: 'ceil(7/2)',
    expectedNormalized: 'ceil(7 / 2)',
    expectedValue: { type: 'rational', n: 4n, d: 1n },
  },
  {
    source: 'ceil(-7/2)',
    expectedNormalized: 'ceil(-7 / 2)',
    expectedValue: { type: 'rational', n: -3n, d: 1n },
  },
  {
    source: 'round(7/2)',
    expectedNormalized: 'round(7 / 2)',
    expectedValue: { type: 'rational', n: 4n, d: 1n },
  },
  {
    source: 'min(5, 2, 8, 1, 9)',
    expectedNormalized: 'min(5, 2, 8, 1, 9)',
    expectedValue: { type: 'rational', n: 1n, d: 1n },
  },
  {
    source: 'max(5, 2, 8, 1, 9)',
    expectedNormalized: 'max(5, 2, 8, 1, 9)',
    expectedValue: { type: 'rational', n: 9n, d: 1n },
  },
  {
    source: 'sum(1, 2, 3, 4, 5)',
    expectedNormalized: 'sum(1, 2, 3, 4, 5)',
    expectedValue: { type: 'rational', n: 15n, d: 1n },
  },
  {
    source: 'prod(1, 2, 3, 4, 5)',
    expectedNormalized: 'prod(1, 2, 3, 4, 5)',
    expectedValue: { type: 'rational', n: 120n, d: 1n },
  },
  {
    source: 'gcd(48, 18)',
    expectedNormalized: 'gcd(48, 18)',
    expectedValue: { type: 'rational', n: 6n, d: 1n },
  },
  {
    source: 'lcm(4, 6)',
    expectedNormalized: 'lcm(4, 6)',
    expectedValue: { type: 'rational', n: 12n, d: 1n },
  },
  {
    source: 'mod(17, 5)',
    expectedNormalized: 'mod(17, 5)',
    expectedValue: { type: 'rational', n: 2n, d: 1n },
  },
  {
    source: 'sqrt(64)',
    expectedNormalized: 'sqrt(64)',
    expectedValue: { type: 'rational', n: 8n, d: 1n },
  },
  {
    source: 'sqrt(9/16)',
    expectedNormalized: 'sqrt(9 / 16)',
    expectedValue: { type: 'rational', n: 3n, d: 4n },
  },
  {
    source: 'exp(0)',
    expectedNormalized: 'exp(0)',
    expectedValue: { type: 'float', value: 1 },
  },
  {
    source: 'ln(1)',
    expectedNormalized: 'ln(1)',
    expectedValue: { type: 'float', value: 0 },
  },
  {
    source: 'log(100)',
    expectedNormalized: 'log(100)',
    expectedValue: { type: 'float', value: 2 },
  },
  {
    source: 'log2(8)',
    expectedNormalized: 'log2(8)',
    expectedValue: { type: 'float', value: 3 },
  },
  {
    source: 'cos(0)',
    expectedNormalized: 'cos(0)',
    expectedValue: { type: 'float', value: 1 },
  },
  {
    source: 'sin(0)',
    expectedNormalized: 'sin(0)',
    expectedValue: { type: 'float', value: 0 },
  },
  {
    source: 'tan(0)',
    expectedNormalized: 'tan(0)',
    expectedValue: { type: 'float', value: 0 },
  },
  {
    source: 'float(1/2)',
    expectedNormalized: 'float(1 / 2)',
    expectedValue: { type: 'float', value: 0.5 },
  },

  // --- 5. Comparisons & Booleans ---
  {
    source: '3 < 5',
    expectedNormalized: '3 < 5',
    expectedValue: { type: 'boolean', value: true },
  },
  {
    source: '5 <= 5',
    expectedNormalized: '5 <= 5',
    expectedValue: { type: 'boolean', value: true },
  },
  {
    source: '5 > 3',
    expectedNormalized: '5 > 3',
    expectedValue: { type: 'boolean', value: true },
  },
  {
    source: '5 >= 5',
    expectedNormalized: '5 >= 5',
    expectedValue: { type: 'boolean', value: true },
  },
  {
    source: '5 == 5',
    expectedNormalized: '5 == 5',
    expectedValue: { type: 'boolean', value: true },
  },
  {
    source: '5 != 3',
    expectedNormalized: '5 != 3',
    expectedValue: { type: 'boolean', value: true },
  },
  {
    source: '1/3 == 2/6',
    expectedNormalized: '1 / 3 == 2 / 6',
    expectedValue: { type: 'boolean', value: true },
  },

  // --- 6. Unicode Operator Input Normalization ---
  {
    source: '6 × 7',
    expectedNormalized: '6 * 7',
    expectedValue: { type: 'rational', n: 42n, d: 1n },
  },
  {
    source: '84 ÷ 2',
    expectedNormalized: '84 / 2',
    expectedValue: { type: 'rational', n: 42n, d: 1n },
  },
  {
    source: '10 \u2212 3',
    expectedNormalized: '10 - 3',
    expectedValue: { type: 'rational', n: 7n, d: 1n },
  },
  {
    source: '5 \u2264 10',
    expectedNormalized: '5 <= 10',
    expectedValue: { type: 'boolean', value: true },
  },
  {
    source: '10 \u2265 5',
    expectedNormalized: '10 >= 5',
    expectedValue: { type: 'boolean', value: true },
  },
  {
    source: '5 \u2260 3',
    expectedNormalized: '5 != 3',
    expectedValue: { type: 'boolean', value: true },
  },
  {
    source: '\u221a100',
    expectedNormalized: 'sqrt(100)',
    expectedValue: { type: 'rational', n: 10n, d: 1n },
  },
  {
    source: 'sin(π)',
    expectedNormalized: 'sin(pi)',
    expectedValue: { type: 'float', value: 0 },
  },
  {
    source: 'cos(τ)',
    expectedNormalized: 'cos(tau)',
    expectedValue: { type: 'float', value: 1 },
  },

  // --- 7. Error Cases with exact messages, expected, and suggestions ---
  {
    source: '1 / 0',
    expectedError: {
      messageContains: 'Division by zero',
      expectedContains: 'a non-zero divisor',
      suggestionContains: 'Check the divisor expression',
    },
  },
  {
    source: '5 / (3 - 3)',
    expectedError: {
      messageContains: 'Division by zero',
      expectedContains: 'a non-zero divisor',
      suggestionContains: 'Check the divisor expression',
    },
  },
  {
    source: 'sqrt(-1)',
    expectedError: {
      messageContains: 'Cannot compute square root of negative number in real mode',
      expectedContains: 'a non-negative real number (x >= 0)',
    },
  },
  {
    source: 'sqrt(-16)',
    expectedError: {
      messageContains: 'Cannot compute square root of negative number in real mode',
    },
  },
  {
    source: '(-4)^(1/2)',
    expectedError: {
      messageContains: 'Cannot compute fractional power of negative number in real mode',
    },
  },
  {
    source: '0^0',
    expectedError: {
      messageContains: 'Indeterminate form: 0^0 is undefined',
      expectedContains: 'a non-zero base or exponent',
    },
  },
  {
    source: 'ln(0)',
    expectedError: {
      messageContains: 'ln(0) is undefined for non-positive values',
      expectedContains: 'a strictly positive number (x > 0)',
    },
  },
  {
    source: 'ln(-5)',
    expectedError: {
      messageContains: 'ln(-5) is undefined for non-positive values',
    },
  },
  {
    source: 'log(0)',
    expectedError: {
      messageContains: 'log(0) is undefined for non-positive values',
    },
  },
  {
    source: 'log(-10)',
    expectedError: {
      messageContains: 'log(-10) is undefined for non-positive values',
    },
  },
  {
    source: 'log2(0)',
    expectedError: {
      messageContains: 'log2(0) is undefined for non-positive values',
    },
  },
  {
    source: 'factorial(-3)',
    expectedError: {
      messageContains: 'Factorial is only defined for non-negative integers',
    },
  },
  {
    source: '(-3)!',
    expectedError: {
      messageContains: 'Factorial is only defined for non-negative integers',
    },
  },
  {
    source: '(1/2)!',
    expectedError: {
      messageContains: 'Factorial is only defined for non-negative integers',
    },
  },
  {
    source: 'velocity + 1',
    expectedError: {
      messageContains: "'velocity' is not defined. Multi-letter names must be assigned before use",
      suggestionContains: "Did you mean 'v·e·l·o·c·i·t·y' (implicit product) or did you mean to write 'velocity := ...' first?",
    },
  },
  {
    source: 'acceleration * 2',
    expectedError: {
      messageContains: "'acceleration' is not defined. Multi-letter names must be assigned before use",
    },
  },
  {
    source: '',
    expectedError: {
      messageContains: 'Empty expression',
      expectedContains: 'a valid mathematical expression or definition',
    },
  },
  {
    source: '   \t  \n  ',
    expectedError: {
      messageContains: 'Empty expression',
    },
  },
  {
    source: '+',
    expectedError: {
      messageContains: "Unexpected token",
    },
  },
  {
    source: '*',
    expectedError: {
      messageContains: "Unexpected token",
    },
  },
  {
    source: '(1 + 2',
    expectedError: {
      messageContains: "Unexpected token",
      expectedContains: ')',
    },
  },
  {
    source: '1 + 2)',
    expectedError: {
      messageContains: "Unexpected token ')'",
    },
  },
  {
    source: 'graph(5)',
    expectedError: {
      messageContains: 'graph() requires at least one free variable to plot against, found 0',
    },
  },
];

// Generate procedural test cases to exceed 200 cases across all combinations
for (let i = 1; i <= 30; i++) {
  const frac = new BigFraction(2n, BigInt(i));
  GOLDEN_CORPUS.push({
    id: `rational-harmonic-${i}`,
    source: `1/${i} + 1/${i}`,
    expectedNormalized: `1 / ${i} + 1 / ${i}`,
    expectedValue: { type: 'rational', n: frac.n, d: frac.d },
  });
}

for (let i = 2; i <= 25; i++) {
  GOLDEN_CORPUS.push({
    id: `power-eval-${i}`,
    source: `${i}^2`,
    expectedNormalized: `${i}^2`,
    expectedValue: { type: 'rational', n: BigInt(i * i), d: 1n },
  });
}

for (let i = 0; i <= 15; i++) {
  let fact = 1n;
  for (let j = 1n; j <= BigInt(i); j++) fact *= j;
  GOLDEN_CORPUS.push({
    id: `factorial-${i}`,
    source: `${i}!`,
    expectedNormalized: `${i}!`,
    expectedValue: { type: 'rational', n: fact, d: 1n },
  });
}

for (let i = 1; i <= 20; i++) {
  GOLDEN_CORPUS.push({
    id: `gcd-${i}`,
    source: `gcd(${i * 6}, ${i * 9})`,
    expectedNormalized: `gcd(${i * 6}, ${i * 9})`,
    expectedValue: { type: 'rational', n: BigInt(i * 3), d: 1n },
  });
}

for (let i = 1; i <= 20; i++) {
  GOLDEN_CORPUS.push({
    id: `lcm-${i}`,
    source: `lcm(${i * 2}, ${i * 3})`,
    expectedNormalized: `lcm(${i * 2}, ${i * 3})`,
    expectedValue: { type: 'rational', n: BigInt(i * 6), d: 1n },
  });
}

for (let i = 1; i <= 20; i++) {
  GOLDEN_CORPUS.push({
    id: `sqrt-${i}`,
    source: `sqrt(${i * i})`,
    expectedNormalized: `sqrt(${i * i})`,
    expectedValue: { type: 'rational', n: BigInt(i), d: 1n },
  });
}

for (let i = 1; i <= 20; i++) {
  GOLDEN_CORPUS.push({
    id: `implicit-mult-var-${i}`,
    source: `${i}x`,
    setup: ['x := 2'],
    expectedNormalized: `${i} · x`,
    expectedValue: { type: 'rational', n: BigInt(i * 2), d: 1n },
  });
}

for (let i = 1; i <= 15; i++) {
  GOLDEN_CORPUS.push({
    id: `nested-parens-${i}`,
    source: '('.repeat(i) + '42' + ')'.repeat(i),
    expectedNormalized: '42',
    expectedValue: { type: 'rational', n: 42n, d: 1n },
  });
}

describe(`Golden File Test Corpus (${GOLDEN_CORPUS.length} cases)`, () => {
  it(`has at least 200 test cases (actual: ${GOLDEN_CORPUS.length})`, () => {
    expect(GOLDEN_CORPUS.length).toBeGreaterThanOrEqual(200);
  });

  for (let idx = 0; idx < GOLDEN_CORPUS.length; idx++) {
    const testCase = GOLDEN_CORPUS[idx];
    const testTitle = testCase.id ?? `[#${idx + 1}] ${testCase.source}`;

    it(testTitle, () => {
      const env = createInitialEnvironment();
      if (testCase.setup) {
        for (const s of testCase.setup) {
          evaluate(s, env);
        }
      }

      if (testCase.expectedError) {
        let threw = false;
        try {
          evaluate(testCase.source, env);
        } catch (e: any) {
          threw = true;
          expect(e).toBeInstanceOf(MathError);
          if (testCase.expectedError.messageContains) {
            expect(e.diagnostic.message).toContain(testCase.expectedError.messageContains);
          }
          if (testCase.expectedError.expectedContains) {
            expect(e.diagnostic.expected).toContain(testCase.expectedError.expectedContains);
          }
          if (testCase.expectedError.suggestionContains) {
            expect(e.diagnostic.suggestion).toContain(testCase.expectedError.suggestionContains);
          }
        }
        if (!threw) {
          expect.unreachable(`Expected expression '${testCase.source}' to throw MathError but it succeeded`);
        }
      } else {
        const { ast, value } = evaluate(testCase.source, env);

        if (testCase.expectedNormalized !== undefined) {
          expect(formatAST(ast)).toBe(testCase.expectedNormalized);
        }

        if (testCase.expectedValue) {
          if (testCase.expectedValue.type === 'rational') {
            expect(value).toEqual({
              type: 'rational',
              n: testCase.expectedValue.n,
              d: testCase.expectedValue.d,
            });
          } else if (testCase.expectedValue.type === 'float') {
            expect(value.type).toBe('float');
            if (value.type === 'float') {
              expect(value.value).toBeCloseTo(testCase.expectedValue.value, 6);
            }
          } else if (testCase.expectedValue.type === 'boolean') {
            expect(value).toEqual({
              type: 'boolean',
              value: testCase.expectedValue.value,
            });
          }
        }
      }
    });
  }
});
