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
    expect(res.error?.message).toBe(":sqrt has no definition");
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

  // Whether a relation can be drawn is decided by the sampling that draws it,
  // not by a few probe points.
  it("draws a relation defined only on a narrow strip of the view", () => {
    // :f has a value only for |t| < 0.2; everywhere else it adds a number to a string.
    const res = evaluateLine(
      '{\\axis x, y; \\forall t, :f(t) = \\if |t| < 0.2 \\then t \\else "outside" + 1; y = :f(x)}'
    );
    expect(res.error).toBeUndefined();
    const entity = (res.result as any).entities[0];
    expect(entity.noValues).toBe(false);
    expect(entity.cachedContours.polylines.length).toBeGreaterThan(0);
    for (const poly of entity.cachedContours.polylines) {
      for (const [x] of poly.points) expect(Math.abs(x)).toBeLessThan(0.3);
    }
  });

  it("gives x^2 + y^2 = -1 an empty space, not an error: it has values and no points", () => {
    const res = evaluateLine("{\\axis x, y; x^2 + y^2 = -1}");
    expect(res.error).toBeUndefined();
    const entity = (res.result as any).entities[0];
    expect(entity.noValues).toBe(false);
    expect(entity.cachedContours.polylines).toEqual([]);
  });

  it("still draws a relation that is undefined only at some points", () => {
    const res = evaluateLine("{\\axis x, y; y = 1/x}");
    expect(res.error).toBeUndefined();
    expect((res.result as any).entities.length).toBe(1);
  });
});
