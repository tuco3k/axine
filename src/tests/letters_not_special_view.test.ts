import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, ViteDevServer } from "vite";
import { chromium, Browser, Page } from "playwright";
import path from "path";

// In the running app: without \axis the Results view draws nothing and shows
// the relation; with \axis it draws, labelled with the declared letters.

describe("No letter is special, in the Results view", () => {
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
    page = await browser.newPage({ viewport: { width: 1400, height: 1800 } });
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

  it("draws y = x and p = c only with \\axis, each labelled with its own letters", async () => {
    const lines = ["y = x", "p = c", "{\\axis x, y; y = x}", "{\\axis c, p; p = c}"];
    await page.evaluate((t) => (window as any).editor.blockEditor.setText(t), lines.join("\n"));
    await page.waitForFunction(() => (window as any).editor.state.getRecords()[3]?.result?.type === "space");
    await page.click("#doc-view-menu-btn");
    await page.getByText("Results (untitled)").click();
    await page.waitForFunction(() => document.querySelectorAll(".doc-gutter-row canvas").length === 2);
    const rows = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>(".doc-gutter-row")).map((row) => ({
        canvases: row.querySelectorAll("canvas").length,
        title: row.querySelector(".space-viewport-header, .space-title")?.textContent?.match(/\(([^)]*)\)/)?.[1] ?? null,
        text: row.querySelector(".doc-result-value")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
      }))
    );
    expect(rows[0]).toMatchObject({ canvases: 0, title: null });
    expect(rows[1]).toMatchObject({ canvases: 0, title: null });
    expect(rows[0].text).toMatch(/y\s*=\s*x/);
    expect(rows[1].text).toMatch(/p\s*=\s*c/);
    expect(rows[2]).toMatchObject({ canvases: 1, title: "x, y" });
    expect(rows[3]).toMatchObject({ canvases: 1, title: "c, p" });
  });
});
