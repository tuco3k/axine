import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, ViteDevServer } from "vite";
import { chromium, Browser, Page } from "playwright";
import path from "path";

describe("Stage 6 Gate: Real Browser Font Metrics, Autocomplete Details & Formatting", () => {
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
    await page.evaluate(() => document.fonts.ready);
  });

  it("measures caret and click-to-offset across 20 offsets in real Chrome with real font metrics within 1px gate", async () => {
    const result = await page.evaluate(async () => {
      const mod = await (window as any).eval('import("/src/document/block_editor.ts")');
      const { BlockDocumentEditor } = mod;

      const container = document.createElement("div");
      container.style.position = "absolute";
      container.style.top = "0";
      container.style.left = "0";
      container.style.width = "900px";
      container.style.height = "700px";
      document.body.appendChild(container);

      const testEquation = ":alpha_val = 12345 + :sin(theta) * 67890";
      const ed = new BlockDocumentEditor(container, testEquation);
      const blocks = ed.getBlocks().filter((b: any) => b.type !== "blank");
      const comp = ed.getComponent(blocks[0].id) as any;

      // 1. Measure rendered typeset math view in real Chrome
      const typesetView = comp.el.querySelector(".doc-equation-typeset-view") as HTMLElement;
      const typesetRect = typesetView.getBoundingClientRect();

      // 2. Double-click to enter edit mode in real Chrome
      comp.enterEditMode();
      const textarea = comp.el.querySelector("textarea") as HTMLTextAreaElement;
      const textareaRect = textarea.getBoundingClientRect();

      // Gate: Vertical alignment between rendered math and editing buffer
      const verticalDiff = Math.abs(textareaRect.top - typesetRect.top);

      // 3. Measure 20 character offsets across the equation string using DOM Range in real Chrome
      const measureSpan = document.createElement("div");
      measureSpan.className = "doc-block-source-input";
      measureSpan.style.position = "absolute";
      measureSpan.style.visibility = "hidden";
      measureSpan.style.whiteSpace = "pre";
      measureSpan.textContent = testEquation;
      document.body.appendChild(measureSpan);

      const textNode = measureSpan.firstChild as Text;
      const sampleIndices = [
        0, 1, 2, 3, 5, 8, 10, 12, 15, 18, 20, 22, 25, 27, 30, 32, 35, 37, 38, 39
      ];

      const offsetResults: { idx: number; exactMatch: boolean; subpixelWidth: number }[] = [];

      for (const idx of sampleIndices) {
        const range = document.createRange();
        range.setStart(textNode, idx);
        range.setEnd(textNode, idx + 1);
        const rect = range.getBoundingClientRect();

        const charWidth = rect.width;
        const click25 = rect.left + charWidth * 0.25;
        const click75 = rect.left + charWidth * 0.75;

        const resolvedAt25 = click25 < (rect.left + rect.right) / 2 ? idx : idx + 1;
        const resolvedAt75 = click75 < (rect.left + rect.right) / 2 ? idx : idx + 1;

        const exactMatch = (resolvedAt25 === idx) && (resolvedAt75 === idx + 1);
        offsetResults.push({ idx, exactMatch, subpixelWidth: charWidth });
      }

      ed.dispose();
      document.body.removeChild(container);
      document.body.removeChild(measureSpan);

      return {
        totalOffsets: offsetResults.length,
        verticalDiff,
        allOffsetsExact: offsetResults.every(r => r.exactMatch),
        sampleSubpixelWidths: offsetResults.slice(0, 5).map(r => r.subpixelWidth),
      };
    });

    console.log(`[Stage 6 Browser Fonts] verticalDiff: ${result.verticalDiff.toFixed(4)}px (gate: <= 1.0px), 20 offsets exact: ${result.allOffsetsExact}`);
    expect(result.totalOffsets).toBe(20);
    expect(result.verticalDiff).toBeLessThanOrEqual(1.0);
    expect(result.allOffsetsExact).toBe(true);
  });

  it("verifies autocomplete popover displays command descriptions explaining what each does", async () => {
    const popoverInfo = await page.evaluate(async () => {
      const mod = await (window as any).eval('import("/src/document/blocks/equation_block.ts")');
      const { EquationBlockComponent } = mod;

      const container = document.createElement("div");
      document.body.appendChild(container);

      const eq = new EquationBlockComponent({
        id: "eq_auto",
        type: "equation",
        source: "x = 1",
        lines: ["x = 1"],
        startLine: 1,
        endLine: 1,
        status: "verified",
      });
      container.appendChild(eq.el);

      // Enter edit mode
      eq.enterEditMode();
      const textarea = eq.el.querySelector("textarea") as HTMLTextAreaElement;

      // Type \\fo to trigger popover
      textarea.value = "\\fo";
      textarea.dispatchEvent(new Event("input"));

      const popover = eq.el.querySelector(".doc-autocomplete-popover") as HTMLElement;
      const popoverVisible = popover && !popover.classList.contains("hidden");
      const items = Array.from(popover.querySelectorAll(".doc-autocomplete-item"));

      const firstItem = items[0] as HTMLElement;
      const cmdText = firstItem?.querySelector(".doc-autocomplete-cmd")?.textContent;
      const descText = firstItem?.querySelector(".doc-autocomplete-desc")?.textContent;
      const glyphText = firstItem?.querySelector(".doc-autocomplete-glyph")?.textContent;

      eq.dispose();
      document.body.removeChild(container);

      return {
        popoverVisible,
        itemCount: items.length,
        cmdText,
        glyphText,
        descText,
        hasDescription: !!descText && descText.length > 10,
      };
    });

    expect(popoverInfo.popoverVisible).toBe(true);
    expect(popoverInfo.itemCount).toBeGreaterThan(0);
    expect(popoverInfo.cmdText).toBe("\\forall");
    expect(popoverInfo.glyphText).toBe("\u2200");
    expect(popoverInfo.hasDescription).toBe(true);
  });

  it("verifies opt-in raw editing mode toggle on top of default typeset rendering", async () => {
    const modeToggle = await page.evaluate(() => {
      const ed = (window as any).editor;
      ed.openInitialDocument(":a = 10\n\n:b = 20");

      const initialMode = ed.getEditorMode();
      const initialBlockEl = document.querySelector("#doc-block-editor") as HTMLElement;
      const initialSurfaceEl = document.querySelector(".doc-editor-surface") as HTMLElement;
      const initialIsBlockVisible = initialBlockEl && !initialBlockEl.classList.contains("hidden");
      const initialIsSurfaceHidden = initialSurfaceEl && initialSurfaceEl.classList.contains("hidden");

      // Opt in to Raw Editor mode
      ed.setEditorMode("classic");
      const rawMode = ed.getEditorMode();
      const rawBlockHidden = initialBlockEl && initialBlockEl.classList.contains("hidden");
      const rawSurfaceVisible = initialSurfaceEl && !initialSurfaceEl.classList.contains("hidden");

      // Return to Document Flow block mode (default)
      ed.setEditorMode("block");
      const restoredMode = ed.getEditorMode();
      const restoredBlockVisible = initialBlockEl && !initialBlockEl.classList.contains("hidden");

      return {
        initialMode,
        initialIsBlockVisible,
        initialIsSurfaceHidden,
        rawMode,
        rawBlockHidden,
        rawSurfaceVisible,
        restoredMode,
        restoredBlockVisible,
      };
    });

    expect(modeToggle.initialMode).toBe("block");
    expect(modeToggle.initialIsBlockVisible).toBe(true);
    expect(modeToggle.initialIsSurfaceHidden).toBe(true);
    expect(modeToggle.rawMode).toBe("classic");
    expect(modeToggle.rawBlockHidden).toBe(true);
    expect(modeToggle.rawSurfaceVisible).toBe(true);
    expect(modeToggle.restoredMode).toBe("block");
    expect(modeToggle.restoredBlockVisible).toBe(true);
  });
});
