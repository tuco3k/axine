import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { lineKind } from "../core/classifier";
import { processDocumentLines, LineResultMessage } from "../core/worker";
import { parseAxDocument } from "../document/block_model";

// Display and evaluation read one classification (core/classifier.ts lineKind,
// joined into units by core/segments.ts). A line shown as prose is not
// evaluated, and a line that is evaluated is shown as mathematics.

const DOCUMENTS_DIR = path.resolve(__dirname, "../../documents");

function listAxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...listAxFiles(p));
    else if (p.endsWith(".ax")) out.push(p);
  }
  return out.sort();
}

const MATH_BLOCKS = new Set(["equation", "figure", "slot", "derivation"]);

describe("One classifier", () => {
  it("reads known lines as prose, mathematics, or unfinished", () => {
    const prose = [
      "We consider a point mass moving along a parabolic trajectory under constant gravitational acceleration.",
      "x is five",
      "The curve below:",
      "Heading text",
      "Inline $a^2 + b^2 = c^2$ math.",
    ];
    const math = [
      "y = 2 * x + 5",
      '\\import "lib/abs.ax"',
      ":orbit := 10",
      "x = 5",
      "{\\axis x, y; x^2 + y^2 = 4}",
      ":sqrt(x)",
    ];
    for (const line of prose) expect([line, lineKind(line)]).toEqual([line, "prose"]);
    for (const line of math) expect([line, lineKind(line)]).toEqual([line, "math"]);
    expect(lineKind("(1 +")).toBe("incomplete");
    expect(lineKind("# a comment")).toBe("comment");
    expect(lineKind("   ")).toBe("blank");
  });

  it("makes one figure block of a relation written over several lines", () => {
    const model = parseAxDocument(["Before.", "{\\axis x, y;", "  x^2 + y^2 = 4", "}", "After."].join("\n"));
    expect(model.blocks.map((b) => [b.type, b.startLine, b.endLine])).toEqual([
      ["paragraph", 0, 0],
      ["figure", 1, 3],
      ["paragraph", 4, 4],
    ]);
  });

  for (const file of listAxFiles(DOCUMENTS_DIR)) {
    const rel = path.relative(DOCUMENTS_DIR, file);
    it(`${rel}: blocks partition the document and are the units the evaluator runs`, () => {
      const text = fs.readFileSync(file, "utf8");
      const lines = text.split("\n");
      const model = parseAxDocument(text);

      // The blocks cover every line once, in order, and each block's line
      // numbers are where its text is.
      const fmLines = model.rawFrontmatter ? model.rawFrontmatter.split("\n").length - 1 : 0;
      let next = fmLines;
      for (const block of model.blocks) {
        expect(block.startLine).toBe(next);
        expect(block.endLine).toBe(block.startLine + block.lines.length - 1);
        expect(lines.slice(block.startLine, block.endLine + 1).join("\n")).toBe(block.source);
        next = block.endLine + 1;
      }
      expect(next).toBe(lines.length);

      const records: LineResultMessage[] = [];
      processDocumentLines(1, lines, (res) => {
        records[res.lineIndex] = res;
      });

      // A line in a prose block is not evaluated; a line in a math block is.
      const mismatches: string[] = [];
      for (const block of model.blocks) {
        const shownAsMath = MATH_BLOCKS.has(block.type);
        for (let l = block.startLine; l <= block.endLine; l++) {
          const evaluated = records[l].classification.state !== "PROSE";
          if (evaluated !== shownAsMath) {
            mismatches.push(`L${l + 1} ${block.type} / ${records[l].classification.state}: ${lines[l].slice(0, 60)}`);
          }
        }
        // A math block's result is reported on its last line, for the unit
        // that starts on its first line.
        if (shownAsMath && records[block.endLine].sourceStartLine !== undefined) {
          expect(records[block.endLine].sourceStartLine).toBe(block.startLine);
        }
      }
      expect(mismatches).toEqual([]);
    });
  }
});
