import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, ViteDevServer } from "vite";
import { chromium, Browser, Page } from "playwright";
import path from "path";

// The inspection panel, driven in the running app: it reports what the engine
// computed and where the relation is written, and nothing it did not compute.

describe("Inspection panel", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let page: Page;
  let baseUrl = "";

  beforeAll(async () => {
    server = await createServer({
      configFile: path.resolve(__dirname, "../../vite.config.ts"),
      server: { port: 0 },
    });
    await server.listen();
    baseUrl = "http://localhost:" + (server.httpServer!.address() as any).port;
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  }, 60000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (server) await server.close();
  });

  beforeEach(async () => {
    await page.goto(baseUrl);
    await page.evaluate(() => localStorage.clear());
    await page.goto(baseUrl);
    await page.waitForFunction(() => typeof (window as any).editor !== "undefined");
    await page.getByText("New Document").click();
    await page.waitForFunction(() => !!(window as any).editor?.blockEditor);
    // The relation is on document line 3, after an import and a prose line.
    await page.evaluate(() =>
      (window as any).editor.blockEditor.setText('\\import "lib/sqrt.ax"\nThe curve below:\n{\\axis x, y; y = :sqrt(x)}\nAfter.')
    );
    await page.waitForFunction(() => (window as any).editor.state.getRecords()[2]?.result?.type === "space");
  });

  async function openInspector(): Promise<string> {
    const canvas = page.locator("canvas").filter({ visible: true }).first();
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + 20, box.y + 20);
    await page.keyboard.press("Enter");
    await page.waitForSelector(".spatial-inspector-panel");
    return page.locator(".spatial-inspector-panel").innerText();
  }

  async function openResults() {
    await page.click("#doc-view-menu-btn");
    await page.getByText("Results (untitled)").click();
    await page.waitForSelector("canvas");
  }

  it("reports the computed residual and no library steps it did not compute", async () => {
    await openResults();
    const text = await openInspector();
    // 7.8 - sqrt(7.5) = 5.06139: the residual of y = :sqrt(x) at the reticle.
    expect(text).toMatch(/f\(7\.5, 7\.8\) = 5\.0614/);
    expect(text).toContain("Intermediate values are not recorded");
    expect(text).not.toMatch(/newton|iteration|converged/i);
  });

  it("names the document line the relation is written on, from Results and from a space tab", async () => {
    await openResults();
    expect(await openInspector()).toContain("Line 3");

    await page.click("#doc-view-menu-btn");
    await page.locator("#doc-view-dropdown").getByText(/^L3:/).click();
    await page.waitForFunction(() => document.querySelector(".pane-tab.active")?.textContent?.startsWith("L3"));
    expect(await openInspector()).toContain("Line 3");
  });

  it("goes to the relation's block when its line is clicked", async () => {
    await openResults();
    await openInspector();
    await page.locator(".spatial-jump-line-btn").click();
    await page.waitForFunction(() => document.querySelector(".pane-tab.active")?.textContent?.startsWith("untitled.ax"));
    const selected = await page.evaluate(() => {
      const ed = (window as any).editor;
      const id = document.querySelector<HTMLElement>(".doc-block.selected")?.dataset.blockId;
      return ed.blockEditor.getBlocks().find((b: any) => b.id === id)?.source;
    });
    expect(selected).toBe("{\\axis x, y; y = :sqrt(x)}");
  });

  it("closes from its close button", async () => {
    await openResults();
    await openInspector();
    await page.locator(".spatial-inspector-close-btn").click();
    expect(await page.locator(".spatial-inspector-panel").count()).toBe(0);
  });
});
