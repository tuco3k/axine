import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, ViteDevServer } from "vite";
import { chromium, Browser, Page } from "playwright";
import path from "path";
import { processDocumentLines } from "../core/worker";
import { exportToHtml } from "../document/exporter";
import { DocumentLineRecord } from "../document/document_state";

// \isolate and \simplify show their answer, not the step list of the solver
// behind them, until they are rebuilt from the step operations.

const DOC = ["\\isolate(x^2 - 5*x + 6 = 0, \\for x)", "\\simplify((x^2 - 1)/(x - 1))"].join("\n");

describe("\\isolate and \\simplify step lists", () => {
  it("are not in the HTML export; the roots and the excluded value are", () => {
    const records: DocumentLineRecord[] = [];
    processDocumentLines(1, DOC.split("\n"), (res) => {
      records[res.lineIndex] = { ...res, text: res.line, isEvaluating: false };
    });
    expect((records[0].result as any).steps.length).toBeGreaterThan(0);
    const html = exportToHtml("solve.ax", DOC, records, "light");
    expect(html).not.toContain('class="export-step-card"');
    expect(html).not.toContain('class="export-branch-step-card"');
    expect(html).not.toMatch(/COLLECT|collect-like-terms/i);
    expect(html).toMatch(/Roots:<\/span> 2, 3|Roots:<\/span> 3, 2/);
    expect(html).toMatch(/Excluded:<\/span> x = 1/);
  });

  describe("in the Results view", () => {
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
      page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
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

    it("show the equation and the answer, with no step cards", async () => {
      await page.evaluate((t) => (window as any).editor.blockEditor.setText(t), DOC);
      await page.waitForFunction(() => (window as any).editor.state.getRecords()[1]?.result?.type === "derivation");
      await page.click("#doc-view-menu-btn");
      await page.getByText("Results (untitled)").click();
      await page.waitForSelector(".visual-derivation-tree");
      const shown = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".visual-derivation-tree")).map((el) => ({
          stepCards: el.querySelectorAll(".derivation-step-card, .branch-step-card").length,
          text: (el as HTMLElement).innerText,
        }))
      );
      expect(shown.length).toBe(2);
      expect(shown.every((s) => s.stepCards === 0)).toBe(true);
      expect(shown[0].text).toMatch(/x = (2 or 3|3 or 2)/);
      expect(shown[1].text).toContain("Excluded: x = 1");
    });
  });
});
