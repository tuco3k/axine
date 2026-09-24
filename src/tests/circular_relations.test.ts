import { describe, it, expect } from "vitest";
import { processDocumentLines, LineResultMessage } from "../core/worker";

// Relations that define names in terms of each other stay relations. Nothing
// substitutes one into the other without end, and nothing runs out of budget.

function evaluateLines(lines: string[]): LineResultMessage[] {
  const results: LineResultMessage[] = [];
  processDocumentLines(1, lines, (res) => {
    results[res.lineIndex] = res;
  });
  return results;
}

const relationsOf = (res: LineResultMessage) => ((res.result as any)?.entities ?? []).map((e: any) => e.source);

describe("Circular definitions", () => {
  it("keeps {a = b + 1; b = a - 1} as two relations", () => {
    const [res] = evaluateLines(["{a = b + 1; b = a - 1}"]);
    expect(res.error).toBeUndefined();
    expect(res.result?.type).toBe("space");
    expect((res.result as any).coordinates).toEqual(["a", "b"]);
    expect(relationsOf(res)).toEqual(["a = b + 1", "b = a - 1"]);
  });

  it("keeps the same pair written on two lines as relations, binding neither name", () => {
    const [first, second, a] = evaluateLines(["a = b + 1", "b = a - 1", "a"]);
    expect(relationsOf(first)).toEqual(["a = b + 1"]);
    expect(relationsOf(second)).toEqual(["b = a - 1"]);
    expect(a.result?.type).toBe("space");
    expect((a.result as any).coordinates).toEqual(["a"]);
  });

  it("lets a name defined only by its own cycle stand as itself", () => {
    const [res] = evaluateLines(["{ :p = :q; :q = :p; :p }"]);
    expect(res.error).toBeUndefined();
    expect(res.result).toMatchObject({ type: "expression", text: "p" });
  });
});
