import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, ViteDevServer } from "vite";
import { chromium, Browser, Page } from "playwright";
import path from "path";

// A figure shows the evaluator's result for its relation. With no space to
// draw, it says what there is instead, and it never claims more than that.

describe("Figure blocks show what was computed", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    server = await createServer({
      configFile: path.resolve(__dirname, "../../vite.config.ts"),
      server: { port: 0 },
    });
    await server.listen();
    const baseUrl = "http://localhost:" + (server.httpServer!.address() as any).port;
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
    await page.goto(baseUrl);
    await page.evaluate(() => localStorage.clear());
    await page.goto(baseUrl);
    await page.waitForFunction(() => typeof (window as any).editor !== "undefined");
    await page.getByText("New Document").click();
    await page.waitForFunction(() => !!(window as any).editor?.blockEditor);
  }, 60000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (server) await server.close();
  });

  it("draws a computed space, and states an error, an unfinished relation, or a non-space result", async () => {
    const text = [
      "{\\axis x, y; x^2 + y^2 = 4}",
      "",
      "{\\axis x, y; y = x ^^ 2}",
      "",
      "{\\axis x, y; y = x^2 +",
    ].join("\n");
    await page.evaluate((t) => (window as any).editor.blockEditor.setText(t), text);
    await page.waitForFunction(() => {
      const ed = (window as any).editor;
      return !ed.state.getIsEvaluating() && ed.state.getRecords()[0]?.result?.type === "space";
    });
    await page.waitForFunction(() => document.querySelectorAll(".doc-block-figure[data-status]").length === 3);

    const figures = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>(".doc-block-figure")).map((el) => ({
        status: el.getAttribute("data-status"),
        badge: el.querySelector(".doc-figure-badge")?.textContent ?? null,
        message: el.querySelector(".doc-figure-message")?.textContent ?? null,
        canvas: !!el.querySelector("canvas"),
      }))
    );

    expect(figures[0]).toEqual({ status: "computed", badge: null, message: null, canvas: true });
    expect(figures[1].status).toBe("error");
    expect(figures[1].badge).toBe("Error");
    expect(figures[1].message).toContain("Unexpected operator");
    expect(figures[1].canvas).toBe(false);
    expect(figures[2]).toEqual({
      status: "incomplete",
      badge: "Unfinished",
      message: "The expression is unfinished.",
      canvas: false,
    });

    const pageText = await page.locator(".doc-block-editor").innerText();
    expect(pageText).not.toMatch(/verified/i);
  });

  it("states the error of a relation naming an undefined value or function, instead of drawing empty axes", async () => {
    await page.evaluate(() =>
      (window as any).editor.blockEditor.setText("{\\axis x, y; x^2 + y^2 = :r^2}\n\n{\\axis x, y; y = :sqrt(x)}")
    );
    await page.waitForFunction(() => document.querySelectorAll(".doc-block-figure[data-status='error']").length === 2);
    const figures = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>(".doc-block-figure")).map((el) => ({
        badge: el.querySelector(".doc-figure-badge")?.textContent ?? null,
        message: el.querySelector(".doc-figure-message")?.textContent ?? null,
        canvas: !!el.querySelector("canvas"),
      }))
    );
    expect(figures).toEqual([
      { badge: "Error", message: "'r' has no value and is not an axis of this space", canvas: false },
      { badge: "Error", message: ":sqrt has no definition", canvas: false },
    ]);
  });

  it("shows x^2 + y^2 = -1 as an empty figure with no Error badge", async () => {
    await page.evaluate(() => (window as any).editor.blockEditor.setText("{\\axis x, y; x^2 + y^2 = -1}"));
    await page.waitForFunction(() => document.querySelector(".doc-block-figure")?.getAttribute("data-status") === "computed");
    await page.waitForFunction(() => !!document.querySelector(".doc-block-figure canvas"));
    const figure = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".doc-block-figure")!;
      return {
        badge: el.querySelector(".doc-figure-badge")?.textContent ?? null,
        message: el.querySelector(".doc-figure-message")?.textContent ?? null,
        canvas: !!el.querySelector("canvas"),
      };
    });
    expect(figure).toEqual({ badge: null, message: null, canvas: true });
  });

  it("marks a figure stale while the relation above it is re-evaluated", async () => {
    await page.evaluate(() => (window as any).editor.blockEditor.setText(":r := 2\n\n{\\axis x, y; x^2 + y^2 = :r^2}"));
    await page.waitForFunction(() => document.querySelector(".doc-block-figure")?.getAttribute("data-status") === "computed");

    // Edit the definition; record every status the figure passes through.
    const statuses = await page.evaluate(async () => {
      const ed = (window as any).editor.blockEditor;
      const fig = document.querySelector(".doc-block-figure")!;
      const seen: string[] = [];
      const observer = new MutationObserver(() => seen.push(fig.getAttribute("data-status")!));
      observer.observe(fig, { attributes: true, attributeFilter: ["data-status"] });
      const def = ed.getBlocks()[0];
      ed.getComponent(def.id).enterEditMode();
      const ta = ed.getComponent(def.id).el.querySelector("textarea, math-field") as any;
      if (ta.tagName === "TEXTAREA") {
        ta.value = ":r := 3";
        ta.dispatchEvent(new Event("input"));
      } else {
        ta.setValue(":r := 3");
      }
      ed.getComponent(def.id).exitEditMode(true);
      await new Promise((resolve) => {
        const check = () => ((window as any).editor.state.getIsEvaluating() ? setTimeout(check, 20) : resolve(null));
        setTimeout(check, 20);
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      observer.disconnect();
      return seen;
    });
    expect(statuses).toContain("stale");
    expect(statuses[statuses.length - 1]).toBe("computed");
  });
});
