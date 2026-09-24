import { describe, it, expect } from "vitest";
import { processDocumentLines } from "../core/worker";

// No letter is special. Without \axis nothing is drawn; with \axis, renaming
// the letters consistently gives the same drawing: the same points, the same
// number of displayed dimensions and sliders, only the labels different.

interface Drawing {
  drawn: boolean;
  displayed?: number;
  sliders?: number;
  points?: string[];
}

// What a figure of this line would draw, read from the evaluated space: its
// declared axes, its other dimensions, and the geometry the sampler produced
// for it, as coordinates in axis order.
function drawingOf(source: string): Drawing {
  let result: any;
  processDocumentLines(1, [source], (res) => {
    result = res.result;
  });
  if (!result || result.type !== "space") return { drawn: false };
  const points: string[] = [];
  for (const ent of result.entities ?? []) {
    for (const poly of ent.cachedContours?.polylines ?? []) {
      for (const [a, b] of poly.points) points.push(`${a.toFixed(3)},${b.toFixed(3)}`);
    }
    for (const v of ent.cachedMesh?.vertices ?? []) points.push(v.map((n: number) => n.toFixed(3)).join(","));
    for (const r of ent.cachedRoots1D ?? []) points.push(r.toFixed(3));
  }
  if (points.length === 0) return { drawn: false };
  const displayed = result.declaredAxes?.length ?? result.coordinates.length;
  return { drawn: true, displayed, sliders: result.coordinates.length - displayed, points: points.sort() };
}

describe("No letter is special", () => {
  it("draws nothing without \\axis, whatever the letters", () => {
    for (const source of ["y = x", "x = y", "p = c", "y = j", "x^2 + y^2 = 4", "p^2 + 4c^2 = 4", "x^2 = 4", "z = x^2 - y^2"]) {
      expect([source, drawingOf(source).drawn]).toEqual([source, false]);
    }
  });

  // Each pair is the same relation with its letters renamed consistently.
  const pairs: [string, string][] = [
    // y = x against p = c: y -> p, x -> c
    ["{\\axis x, y; y = x}", "{\\axis c, p; p = c}"],
    ["{\\axis y, x; y = x}", "{\\axis p, c; p = c}"],
    // {\axis p, x; p = x} draws what {\axis y, x; y = x} draws
    ["{\\axis y, x; y = x}", "{\\axis p, x; p = x}"],
    // A circle and an ellipse: x -> p, y -> c
    ["{\\axis x, y; x^2 + y^2 = 4}", "{\\axis p, c; p^2 + c^2 = 4}"],
    ["{\\axis x, y; x^2 + 4y^2 = 4}", "{\\axis p, c; p^2 + 4c^2 = 4}"],
    // A 3D surface: x -> p, y -> c, z -> q
    ["{\\axis x, y, z; z = x^2 - y^2}", "{\\axis p, c, q; q = p^2 - c^2}"],
  ];

  for (const [original, renamed] of pairs) {
    it(`draws ${renamed} exactly as ${original}`, () => {
      const a = drawingOf(original);
      const b = drawingOf(renamed);
      expect(a.drawn).toBe(true);
      expect(b).toEqual(a);
    });
  }
});
