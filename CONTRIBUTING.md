# Contributing to Axine

## Core Principles

1. **The Seven-Primitive Floor**:
   The core runtime implements seven primitives (exact rational arithmetic, relational comparison, syntactic substitution, bounded iteration, expressions as values, ordered tuples, and structural equality). Mathematical functions, transcendentals, and domain algorithms must be written in pure Axine in standard libraries (`documents/lib/`), not hardcoded as TypeScript primitives in the core engine.

2. **No External Runtime Dependencies**:
   The language core possesses zero external runtime dependencies. Parsing, arithmetic, evaluation, reduction, and visualization are implemented directly.

3. **Targeted Changes**:
   Make minimal, targeted edits to files. Do not rewrite files wholesale.

4. **Honest Reporting**:
   - When a computation is undefined in the active context, return `undefined`.
   - When computation bounds are reached, return `budget-exhausted`.
   - Never invent heuristic answers or silently coerce mathematical types.
   - If a test fails, fix the code. Do not edit tests to match erroneous behavior.

---

## Development Workflow

### Prerequisites
- Node.js (v20+)
- npm

### Commands
```bash
# Install dependencies
npm install

# Run the test suite
npm test

# Run a specific test file
npx vitest run src/tests/<test_name>.test.ts

# Start the interactive development server
npm run dev

# Run TypeScript typecheck and production build
npm run build
```

Every contribution must pass `npm test` and `npm run build` without warnings or type errors.

---

## Code and Prose Register

All documentation, error messages, labels, and comments adhere to [`VOICE.md`](./VOICE.md):
- State the fact directly without sales language or adjectives of quality.
- Error messages identify what occurred and the exact condition required.
- Refusals to reduce are stated plainly without apology.
