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

      // 4. Double click -> enters edit mode
      eq.el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      const isEditingNow = eq.getIsEditing();
      const editorVisible = !editorView.classList.contains("hidden") && typesetView.classList.contains("hidden");
      const textarea = eq.el.querySelector("textarea") as HTMLTextAreaElement;
      const textareaHasSource = textarea?.value === "x^2 + y^2 = 4";

      // 5. Edit text inside buffer
      if (textarea) {
        textarea.value = "x^2 + y^2 = 9";
      }

      // 6. Escape -> commits changes and returns to atomic rendered view
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
        exitedEditing,
        restoredRenderedVisible,
        afterCommit,
      };
    });

    expect(result.initialRenderedVisible).toBe(true);
    expect(result.initialHasTypesetContent).toBe(true);
    expect(result.afterClickSelected).toBe(true);
    expect(result.selectedId).toBe("eq_1");
    expect(result.afterStepNext).toBe(true);
    expect(result.afterStepPrev).toBe(true);
    expect(result.isEditingNow).toBe(true);
    expect(result.editorVisible).toBe(true);
    expect(result.textareaHasSource).toBe(true);
    expect(result.exitedEditing).toBe(true);
    expect(result.restoredRenderedVisible).toBe(true);
    expect(result.afterCommit).toBe(true);
  });
});
