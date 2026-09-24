import { describe, it, expect } from "vitest";
import { processDocumentLines, LineResultMessage } from "../core/worker";

// A relation in a space with declared axes that cannot be drawn is the space's
// error, not an empty drawing.

function evaluateLine(source: string): LineResultMessage {
  let last: LineResultMessage | undefined;
  processDocumentLines(1, [source], (res) => {
    last = res;
  });
  return last!;
}

describe("Relations a space cannot draw", () => {
  it("reports a call to an undefined function", () => {
    const res = evaluateLine("{\\axis x, y; y = :sqrt(x)}");
    expect(res.result).toBeUndefined();
    expect(res.error?.message).toBe("Function 'sqrt' is not defined");
  });

  it("reports a name that has no value and is not an axis", () => {
    expect(evaluateLine("{\\axis x, y; x^2 + y^2 = :r^2}").error?.message).toBe(
      "'r' has no value and is not an axis of this space"
    );
    expect(evaluateLine("{\\axis x, y; x^2 + y^2 = :rad^2 + s}").error?.message).toBe(
      "':rad', 's' have no value and are not axes of this space"
    );
  });

  it("reports an operation on the wrong kind of value", () => {
    const res = evaluateLine('{\\axis x, y; y = "text" + 1}');
    expect(res.result).toBeUndefined();
    expect(res.error?.message).toMatch(/Cannot add/);
  });

  it("draws a relation whose name is given a value later in the block", () => {
    for (const source of ["{\\axis x, y; y = k x; k = 2}", "{\\axis x, y; k = 2; y = k x}"]) {
      const res = evaluateLine(source);
      expect(res.error).toBeUndefined();
      expect(res.result?.type).toBe("space");
      expect((res.result as any).entities.length).toBe(1);
    }
  });

  it("still draws a relation that is undefined only at some points", () => {
    const res = evaluateLine("{\\axis x, y; y = 1/x}");
    expect(res.error).toBeUndefined();
    expect((res.result as any).entities.length).toBe(1);
  });
});
