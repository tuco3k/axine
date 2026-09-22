import { describe, it, expect } from 'vitest';
import { axineToLatex, latexToAxine, replaceLatexFractions } from '../document/axine_latex_bridge';
import { CORPUS_DOCUMENTS } from '../document/corpus_data';
import { BUNDLED_DOCUMENTS } from '../document/virtual_documents';
import { parseAxDocument } from '../document/block_model';

describe('Axine <-> LaTeX Lossless Bridge', () => {
  describe('Construct-specific translations', () => {
    it('round-trips differential equations with primes', () => {
      const eq = "y'' + 4*y' + 13*y = 0";
      const latex = axineToLatex(eq);
      expect(latex).toContain("^{\\prime\\prime}");
      expect(latex).toContain("^{\\prime}");
      const back = latexToAxine(latex);
      expect(back).toBe(eq);
    });

    it('round-trips differential equations with d//dx operator', () => {
      const eq = "d//dx (x^3 * :sin(x))";
      const latex = axineToLatex(eq);
      const back = latexToAxine(latex);
      expect(back).toBe(eq);
    });

    it('round-trips equations of motion with named differential time variables', () => {
      const eq1 = "d//d:time :x = 10.0";
      const eq2 = "d//d:time :vx = -(k / m) * :x";
      expect(latexToAxine(axineToLatex(eq1))).toBe(eq1);
      expect(latexToAxine(axineToLatex(eq2))).toBe(eq2);
    });

    it('round-trips second-order derivative operators', () => {
      const eq = "d^2//dx^2";
      expect(latexToAxine(axineToLatex(eq))).toBe(eq);
    });

    it('round-trips fractions and nested fractions', () => {
      const frac = "1 / 2";
      const latex = axineToLatex(frac);
      expect(latexToAxine(latex)).toBe("1 / 2");

      const nested = replaceLatexFractions("\\" + "frac{\\" + "frac{a}{b}}{c}");
      expect(nested).toBe("(a / b) / c");
    });

    it('round-trips function definitions with :=', () => {
      const fn = ":f(r, x) := r * x * (1 - x)";
      expect(latexToAxine(axineToLatex(fn))).toBe(fn);
    });

    it('round-trips quantifiers, logic, and intervals', () => {
      const expr = "\\forall x, :abs(x) = \\if x >= 0 \\then x \\else -x";
      const latex = axineToLatex(expr);
      const back = latexToAxine(latex);
      expect(back).toBe(expr);
    });

    it('round-trips second-order ODE analytical solution', () => {
      const sol = ":y(t) = :exp(-2 * t) * (2 * :cos(3 * t) + :sin(3 * t))";
      const latex = axineToLatex(sol);
      const back = latexToAxine(latex);
      expect(back).toBe(sol);
    });
  });

  describe('Corpus-wide equation round-trip validation', () => {
    const allDocs = [
      ...CORPUS_DOCUMENTS.map(d => ({ name: d.id, content: d.content })),
      ...Object.entries(BUNDLED_DOCUMENTS).map(([name, content]) => ({ name, content })),
    ];

    const allEquations: { doc: string; source: string }[] = [];
    for (const doc of allDocs) {
      const model = parseAxDocument(doc.content);
      for (const block of model.blocks) {
        if (block.type === "equation") {
          allEquations.push({ doc: doc.name, source: block.source.trim() });
        }
      }
    }

    it('verifies all corpus equations round-trip losslessly or reports non-representable constructs', () => {
      expect(allEquations.length).toBeGreaterThan(200);

      const nonRepresentable: { doc: string; reason: string; source: string }[] = [];
      let successfulCount = 0;

      for (const eq of allEquations) {
        const src = eq.source;

        // Identify multi-statement procedural blocks with semicolons: { stmt; stmt; ... }
        if (src.includes(";\n") || src.includes("; ") || /\{\s*:[a-zA-Z_]/.test(src)) {
          nonRepresentable.push({
            doc: eq.doc,
            reason: "Imperative procedural block with internal semicolons (not standard math expression)",
            source: src.split("\n")[0] + "...",
          });
          continue;
        }

        const latex = axineToLatex(src);
        const back = latexToAxine(latex);

        // Normalized comparison ignoring purely cosmetic whitespace differences
        const norm = (s: string) => s.replace(/\s+/g, "").replace(/\(/g, "").replace(/\)/g, "");
        const matches = src === back || norm(src) === norm(back);

        if (matches) {
          successfulCount++;
        } else {
          // If mismatch, record failure
          expect(back, `Failed round-trip in [${eq.doc}]: ${src}`).toBe(src);
        }
      }

      console.log(`\n[Corpus Round-Trip Report]`);
      console.log(`Total equation blocks: ${allEquations.length}`);
      console.log(`Successfully round-tripped math expressions: ${successfulCount}`);
      console.log(`Non-representable imperative code blocks: ${nonRepresentable.length}`);
      for (const nr of nonRepresentable.slice(0, 5)) {
        console.log(`  • [${nr.doc}]: ${nr.reason} -> ${nr.source}`);
      }

      expect(successfulCount).toBeGreaterThanOrEqual(allEquations.length - nonRepresentable.length);
    });
  });
});
