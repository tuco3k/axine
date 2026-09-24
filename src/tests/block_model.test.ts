import { describe, it, expect } from "vitest";
import * as path from "path";
import * as fs from "fs";
import { parseAxDocument, serializeAxDocument, extractDefinedSymbol, extractReferencedSymbols } from "../document/block_model";
import { BlockState } from "../document/block_state";
import { DocumentState, type DocumentLineRecord } from "../document/document_state";
import { processDocumentLines } from "../core/worker";

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

  // Block status comes from evaluation records, the same ones the Results view
  // shows. (This replaces a test of a regex dependency graph that marked blocks
  // stale or "Unresolved" without evaluating anything.)
  function evaluate(state: BlockState, text = state.toText()): boolean {
    const records: DocumentLineRecord[] = [];
    processDocumentLines(1, text.split("\n"), (res) => {
      records[res.lineIndex] = { ...res, text: res.line, isEvaluating: false };
    });
    return state.applyEvaluation(records, text);
  }

  it("takes block results and status from evaluation, and marks an edited result stale", () => {
    const state = new BlockState([":r := 2", "{\\axis x, y; x^2 + y^2 = :r^2}", ":v := :sqrt(4)"].join("\n"));
    const [defBlock, figBlock, errBlock] = state.getBlocks();
    expect([defBlock.type, figBlock.type, errBlock.type]).toEqual(["equation", "figure", "equation"]);
    expect(figBlock.status).toBe("pending");
    expect(figBlock.result).toBeUndefined();

    expect(evaluate(state)).toBe(true);
    expect(defBlock.status).toBe("computed");
    expect(figBlock.status).toBe("computed");
    expect(figBlock.result?.type).toBe("space");
    expect(errBlock.status).toBe("error");
    expect(errBlock.error?.message).toContain("sqrt");
    expect(state.bindingLine(":r")).toBe(0);
    expect(state.bindingLine(":nowhere")).toBeUndefined();

    // Editing a block: its result no longer describes it.
    const oldResult = defBlock.result;
    state.updateBlock(defBlock.id, ":r := 3");
    expect(defBlock.status).toBe("stale");
    expect(defBlock.result).toBe(oldResult);

    // An evaluation of another text changes nothing.
    expect(evaluate(state, ":r := 2\n{\\axis x, y; x^2 + y^2 = :r^2}")).toBe(false);
    expect(defBlock.status).toBe("stale");

    expect(evaluate(state)).toBe(true);
    expect(defBlock.status).toBe("computed");
    expect(defBlock.result).not.toBe(oldResult);
  });

  it("marks every line after an edit as being evaluated until its new result arrives", () => {
    const state = new DocumentState(":r := 2\n:s := :r + 1\n:t := 5");
    const seen: DocumentLineRecord[][] = [];
    state.subscribe((records) => seen.push(records.map((r) => ({ ...r }))));
    seen.length = 0;
    state.setText(":r := 7\n:s := :r + 1\n:t := 5");
    // First notification: the evaluation has started, nothing has arrived.
    expect(seen[0][0].isEvaluating).toBe(true);
    expect(seen[0][1].isEvaluating).toBe(true);
    expect(seen[0][2].isEvaluating).toBe(true);
    const records = state.getRecords();
    expect(records.every((r) => !r.isEvaluating)).toBe(true);
    expect(JSON.stringify(records[1].result, (_k, v) => (typeof v === "bigint" ? v.toString() : v))).toContain('"8"');
    state.dispose();
  });
});
