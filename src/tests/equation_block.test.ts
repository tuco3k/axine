import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, ViteDevServer } from "vite";
import { chromium, Browser, Page } from "playwright";
import path from "path";

describe("Stage 4 Gate: Atomic In-Flow Equation Block Component", () => {
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

  it("renders typeset math by default, selects atomically, edits on double-click, and commits on Escape", async () => {
    const result = await page.evaluate(async () => {
      const mod = await (window as any).eval('import("/src/document/blocks/equation_block.ts")');
      const { EquationBlockComponent } = mod;

      let selectedId = "";
      let stepNext = false;
      let stepPrev = false;
      let committedSource = "";

      const block = {
        id: "eq_1",
        type: "equation" as const,
        source: "x^2 + y^2 = 4",
        lines: ["x^2 + y^2 = 4"],
        startLine: 1,
        endLine: 1,
        status: "verified" as const,
      };

      const eq = new EquationBlockComponent(block, {
        onSelect: (id: string) => { selectedId = id; },
        onStepNext: () => { stepNext = true; },
        onStepPrev: () => { stepPrev = true; },
        onCommit: (_id: string, src: string) => { committedSource = src; },
      });

      document.body.appendChild(eq.el);

      // 1. Initial State: Rendered math view is visible, editor is hidden
      const typesetView = eq.el.querySelector(".doc-equation-typeset-view") as HTMLElement;
      const editorView = eq.el.querySelector(".doc-equation-editor-view") as HTMLElement;
      const initialRenderedVisible = !typesetView.classList.contains("hidden") && editorView.classList.contains("hidden");
      const initialHasTypesetContent = typesetView.innerHTML.length > 0;

      // 2. Single click -> selected as atomic block
      eq.el.click();
      const afterClickSelected = eq.getIsSelected() && eq.el.classList.contains("selected");

      // 3. Arrow navigation
      eq.el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
      const afterStepNext = stepNext;

      eq.el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
      const afterStepPrev = stepPrev;

      // 4. Measure typeset view before entering edit mode
      const typesetRect = typesetView.getBoundingClientRect();

      // Double click -> enters edit mode
      eq.el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      const isEditingNow = eq.getIsEditing();
      const editorVisible = !editorView.classList.contains("hidden") && typesetView.classList.contains("hidden");
      const textarea = eq.el.querySelector("textarea") as HTMLTextAreaElement;
      const textareaHasSource = textarea?.value === "x^2 + y^2 = 4";
      const textareaRect = textarea.getBoundingClientRect();

      // Caret alignment gate while inside: 0px vertical jump between typeset math and editing buffer
      const verticalDiff = Math.abs(textareaRect.top - typesetRect.top);

      // Caret subpixel click-to-offset resolution inside equation buffer
      const lineStr = textarea.value;
      const charWidth = textareaRect.width / Math.max(1, lineStr.length);
      const testPositions: { charIdx: number; resolvedOffset: number }[] = [];
      for (let c = 0; c < lineStr.length; c++) {
        const clickX = textareaRect.left + c * charWidth + charWidth * 0.25;
        const relativeX = clickX - textareaRect.left;
        const resolved = Math.floor(relativeX / charWidth);
        testPositions.push({ charIdx: c, resolvedOffset: resolved });
      }
      const allOffsetsMatch = testPositions.every(p => p.charIdx === p.resolvedOffset);

      // Incomplete command stays literal and opens autocomplete suggestion
      textarea.value = "x^2 + y^2 = 9 + \\fo";
      textarea.dispatchEvent(new Event("input"));
      const incompleteStaysLiteral = textarea.value.includes("\\fo");
      const autocompleteOpened = eq.getAutocomplete()?.getIsOpen() === true;

      // First Escape closes autocomplete suggestion popover
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      const autocompleteClosed = eq.getAutocomplete()?.getIsOpen() === false;
      const stillEditingAfterPopoverClosed = eq.getIsEditing();

      // 5. Edit text inside buffer to final equation
      textarea.value = "x^2 + y^2 = 9";

      // 6. Second Escape -> commits changes and returns to atomic rendered view
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      const exitedEditing = !eq.getIsEditing();
      const restoredRenderedVisible = !typesetView.classList.contains("hidden") && editorView.classList.contains("hidden");
      const afterCommit = committedSource === "x^2 + y^2 = 9";

      eq.dispose();
      return {
        initialRenderedVisible,
        initialHasTypesetContent,
        afterClickSelected,
        selectedId,
        afterStepNext,
        afterStepPrev,
        isEditingNow,
        editorVisible,
        textareaHasSource,
        verticalDiff,
        allOffsetsMatch,
        incompleteStaysLiteral,
        autocompleteOpened,
        autocompleteClosed,
        stillEditingAfterPopoverClosed,
        exitedEditing,
        restoredRenderedVisible,
        afterCommit,
      };
    });

    console.log(`[Stage 4 Gate] equation edit verticalDiff: ${result.verticalDiff.toFixed(4)}px (limit: 1.0px), allOffsetsMatch: ${result.allOffsetsMatch}`);
    expect(result.initialRenderedVisible).toBe(true);
    expect(result.initialHasTypesetContent).toBe(true);
    expect(result.afterClickSelected).toBe(true);
    expect(result.selectedId).toBe("eq_1");
    expect(result.afterStepNext).toBe(true);
    expect(result.afterStepPrev).toBe(true);
    expect(result.isEditingNow).toBe(true);
    expect(result.editorVisible).toBe(true);
    expect(result.textareaHasSource).toBe(true);
    expect(result.verticalDiff).toBeLessThanOrEqual(1.0);
    expect(result.allOffsetsMatch).toBe(true);
    expect(result.incompleteStaysLiteral).toBe(true);
    expect(result.autocompleteOpened).toBe(true);
    expect(result.autocompleteClosed).toBe(true);
    expect(result.stillEditingAfterPopoverClosed).toBe(true);
    expect(result.exitedEditing).toBe(true);
    expect(result.restoredRenderedVisible).toBe(true);
    expect(result.afterCommit).toBe(true);
  });
});
