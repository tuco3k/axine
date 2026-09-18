import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, ViteDevServer } from "vite";
import { chromium, Browser, Page } from "playwright";
import path from "path";

describe("Stage 3 Gate: Atomic In-Flow Figure Block Component", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let page: Page;
  let port: number;

  beforeAll(async () => {
    server = await createServer({
      configFile: path.resolve(__dirname, "../../vite.config.ts"),
      server: { port: 0 },
    });
    await server.listen();
    port = (server.httpServer!.address() as any).port;

    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  }, 30000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (server) await server.close();
  });

  beforeEach(async () => {
    await page.goto("http://localhost:" + port);
    await page.waitForFunction(() => typeof (window as any).editor !== "undefined");
  });

  it("selects atomic figure on click, handles single-arrow stepping, and navigates provenance", async () => {
    const result = await page.evaluate(async () => {
      // Import FigureBlockComponent dynamically in browser
      const mod = await (window as any).eval('import("/src/document/blocks/figure_block.ts")');
      const { FigureBlockComponent } = mod;

      let selectedId = "";
      let stepDirection = "";
      let navSource = "";
      let deletedId = "";

      const block = {
        id: "fig_1",
        type: "figure" as const,
        source: "\\figure(:orbit, width: 480, height: 320)",
        lines: ["\\figure(:orbit, width: 480, height: 320)"],
        startLine: 5,
        endLine: 5,
        status: "verified" as const,
        referencedSymbols: [":orbit"],
      };

      const fig = new FigureBlockComponent(block, {
        onSelect: (id: string) => { selectedId = id; },
        onStepNext: () => { stepDirection = "next"; },
        onStepPrev: () => { stepDirection = "prev"; },
        onNavigateToSource: (sym: string) => { navSource = sym; },
        onDeleteRequest: (id: string) => { deletedId = id; },
      });

      document.body.appendChild(fig.el);

      // 1. Click figure -> selected
      fig.el.click();
      const afterClickSelected = fig.getIsSelected() && fig.el.classList.contains("selected");

      // 2. ArrowDown -> steps over figure
      fig.el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
      const afterStepNext = stepDirection === "next";

      // 3. ArrowUp -> steps back over figure
      fig.el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
      const afterStepPrev = stepDirection === "prev";

      // 4. Click provenance button
      const provBtn = fig.el.querySelector(".doc-figure-prov-btn") as HTMLButtonElement;
      if (provBtn) provBtn.click();
      const afterProv = navSource === ":orbit";

      // 5. Scroll-safe interaction: click canvas enters navigation
      const vpContainer = fig.el.querySelector(".doc-figure-viewport-container") as HTMLElement;
      const initialInert = vpContainer.classList.contains("inert-scroll");

      vpContainer.click();
      const navigatingActive = fig.getIsNavigating() && !vpContainer.classList.contains("inert-scroll");

      // 6. Escape exits navigation
      fig.el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      const navigatingExited = !fig.getIsNavigating() && vpContainer.classList.contains("inert-scroll");

      // 7. Delete key requests deletion
      fig.el.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" }));
      const afterDelete = deletedId === "fig_1";

      fig.dispose();
      return {
        afterClickSelected,
        selectedId,
        afterStepNext,
        afterStepPrev,
        afterProv,
        initialInert,
        navigatingActive,
        navigatingExited,
        afterDelete,
      };
    });

    expect(result.afterClickSelected).toBe(true);
    expect(result.selectedId).toBe("fig_1");
    expect(result.afterStepNext).toBe(true);
    expect(result.afterStepPrev).toBe(true);
    expect(result.afterProv).toBe(true);
    expect(result.initialInert).toBe(true);
    expect(result.navigatingActive).toBe(true);
    expect(result.navigatingExited).toBe(true);
    expect(result.afterDelete).toBe(true);
  });
});
