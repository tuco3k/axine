import { describe, it, expect } from "vitest";
import * as path from "path";
import * as fs from "fs";
import { parseAxDocument, serializeAxDocument, extractDefinedSymbol, extractReferencedSymbols } from "../document/block_model";
import { BlockState } from "../document/block_state";

function getAxFiles(dir: string, list: string[] = []): string[] {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) getAxFiles(p, list);
    else if (f.endsWith(".ax")) list.push(p);
  }
  return list;
}

describe("Block Document Model & 100% Roundtrip Serialization Gate", () => {
  it("losslessly parses and serializes every .ax document in the repository byte-for-byte", () => {
    const docsDir = path.resolve(__dirname, "../../documents");
    const axFiles = getAxFiles(docsDir);
    expect(axFiles.length).toBeGreaterThanOrEqual(50);

    for (const file of axFiles) {
      const original = fs.readFileSync(file, "utf8");
      const model = parseAxDocument(original);
      const serialized = serializeAxDocument(model);

      if (serialized !== original) {
        expect.fail("Roundtrip serialization mismatch on: " + path.relative(docsDir, file));
      }
      expect(serialized).toBe(original);
    }
  });

  it("classifies headings, paragraphs, equations, figures, and derivations accurately", () => {
    const doc = [
      "# Main Title",
      "",
      "# This is a prose comment",
      ":orbit := {\\axis x, y; x^2 + y^2 = 4}",
      "",
      "\\figure(:orbit, width: 480, height: 320)",
      "",
      "\\derive x + 0 " + "\\" + "to x",
    ].join("\n");

    const model = parseAxDocument(doc);
    const nonBlank = model.blocks.filter(b => b.type !== "blank");

    expect(nonBlank.length).toBe(5);
    expect(nonBlank[0].type).toBe("heading");
    expect(nonBlank[1].type).toBe("paragraph");
    expect(nonBlank[2].type).toBe("figure"); // {\\axis ...}
    expect(nonBlank[3].type).toBe("figure"); // \\figure(...)
    expect(nonBlank[4].type).toBe("derivation");
  });

  it("extracts defined and referenced symbols correctly", () => {
    expect(extractDefinedSymbol(":orbit := {\\axis x, y; ...}")).toBe(":orbit");
    expect(extractDefinedSymbol("f(x) := x^2")).toBe("f");
    expect(extractDefinedSymbol(":val = 42")).toBe(":val");

    const refs = extractReferencedSymbols("\\figure(:orbit, width: 480, :param)");
    expect(refs).toContain(":orbit");
    expect(refs).toContain(":param");
  });

  it("manages reactive symbol dependencies and stale/error states on edits and deletions", () => {
    const doc = [
      ":orbit := {\\axis x, y; x^2 + y^2 = 4}",
      "\\figure(:orbit, width: 480, height: 320)",
    ].join("\n");

    const state = new BlockState(doc);
    const blocks = state.getBlocks();
    const defBlock = blocks[0];
    const figBlock = blocks[1];

    expect(state.getDefiningBlock(":orbit")?.id).toBe(defBlock.id);
    expect(state.getDependentBlocks(":orbit").map(b => b.id)).toContain(figBlock.id);

    // 1. Editing producing block marks referencing block stale
    state.updateBlock(defBlock.id, ":orbit := {\\axis x, y; x^2 + y^2 = 9}");
    expect(figBlock.status).toBe("stale");

    // 2. Deleting producing block marks referencing block error
    state.deleteBlock(defBlock.id);
    expect(figBlock.status).toBe("error");
    expect(figBlock.error?.message).toContain("Unresolved symbol :orbit");
  });
});
