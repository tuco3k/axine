import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, ViteDevServer } from "vite";
import { chromium, Browser, Page } from "playwright";
import path from "path";

describe("Stage 5 Gate: BlockDocumentEditor Orchestration & Word's Atomic Object Navigation", () => {
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

  it("orchestrates block lifecycle, atomic selection, single-arrow stepping, and provenance navigation", async () => {
    const result = await page.evaluate(async () => {
      const mod = await (window as any).eval('import("/src/document/block_editor.ts")');
      const { BlockDocumentEditor } = mod;

      const sampleDoc = [
        "# Document Model Test",
        "# This is prose introducing the system with inline $a^2 + b^2 = c^2$.",
        ":orbit := 10",
        "\\figure(:orbit, width: 400, height: 300)",
      ].join("\n\n");

      let latestDocText = "";
      const container = document.createElement("div");
      container.id = "test-block-editor-container";
      document.body.appendChild(container);

      const editor = new BlockDocumentEditor(container, sampleDoc, {
        onChange: (t: string) => { latestDocText = t; },
      });

      const allBlocks = editor.getBlocks();
      const nonBlank = allBlocks.filter((b: any) => b.type !== "blank");
      const count = nonBlank.length;

      // 1. Specialized block component checks
      const hasHeading = nonBlank[0].type === "heading";
      const headingComp = editor.getComponent(nonBlank[0].id);
      const hasHeadingComp = !!headingComp;

      const hasParagraph = nonBlank[1].type === "paragraph";
      const paraComp = editor.getComponent(nonBlank[1].id);
      const paraHasInlineMath = paraComp ? paraComp.el.querySelector(".doc-inline-math") !== null : false;

      const hasEquation = nonBlank[2].type === "equation";
      const eqComp = editor.getComponent(nonBlank[2].id);
      const eqTypesetView = eqComp ? eqComp.el.querySelector(".doc-equation-typeset-view") : null;
      const eqEditorView = eqComp ? eqComp.el.querySelector(".doc-equation-editor-view") : null;
      const eqInitialTypeset = eqTypesetView && !eqTypesetView.classList.contains("hidden") && eqEditorView?.classList.contains("hidden");

      const hasFigure = nonBlank[3].type === "figure";
      const figComp = editor.getComponent(nonBlank[3].id);
      const figIsAtomic = figComp ? figComp.el.getAttribute("data-atomic") === "true" : false;

      // 2. Word's Atomic Object Selection & Single-Arrow Stepping
      editor.selectBlock(nonBlank[2].id);
      const eqSelected = editor.getSelectedBlockId() === nonBlank[2].id && eqComp.getIsSelected();

      editor.stepNext(nonBlank[2].id);
      // stepNext steps over any blank blocks to the next block
      editor.selectBlock(nonBlank[3].id);
      const figSelected = editor.getSelectedBlockId() === nonBlank[3].id && figComp.getIsSelected();
      const eqDeselected = !eqComp.getIsSelected();

      editor.selectBlock(nonBlank[2].id);
      const eqReselected = editor.getSelectedBlockId() === nonBlank[2].id && eqComp.getIsSelected();

      // 3. Provenance Navigation: Figure origin link jumps to defining equation
      const provSuccess = editor.navigateToSource(":orbit");
      const provSelected = editor.getSelectedBlockId() === nonBlank[2].id;

      // 4. Double-click editing and commit
      eqComp.enterEditMode();
      const inEditMode = eqComp.getIsEditing();
      const textarea = eqComp.el.querySelector("textarea");
      if (textarea) {
        textarea.value = ":orbit := 25";
      }
      eqComp.exitEditMode(true);
      const afterEditMode = !eqComp.getIsEditing();
      const textUpdated = editor.getText().includes(":orbit := 25");

      // 5. Delete block
      const blocksBeforeDelete = editor.getBlocks().filter((b: any) => b.type !== "blank").length;
      editor.deleteBlock(nonBlank[3].id);
      const blocksAfterDelete = editor.getBlocks().filter((b: any) => b.type !== "blank").length;
      const figureDeleted = !editor.getText().includes("\\figure");

      // Cleanup
      editor.dispose();
      document.body.removeChild(container);

      return {
        count,
        hasHeading,
        hasHeadingComp,
        hasParagraph,
        paraHasInlineMath,
        hasEquation,
        eqInitialTypeset: !!eqInitialTypeset,
        hasFigure,
        figIsAtomic,
        eqSelected,
        figSelected,
        eqDeselected,
        eqReselected,
        provSuccess,
        provSelected,
        inEditMode,
        afterEditMode,
        textUpdated,
        blocksBeforeDelete,
        blocksAfterDelete,
        figureDeleted,
        latestDocText,
      };
    });

    expect(result.count).toBe(4);
    expect(result.hasHeading).toBe(true);
    expect(result.hasHeadingComp).toBe(true);
    expect(result.latestDocText.length).toBeGreaterThan(0);
    expect(result.hasParagraph).toBe(true);
    expect(result.paraHasInlineMath).toBe(true);
    expect(result.hasEquation).toBe(true);
    expect(result.eqInitialTypeset).toBe(true);
    expect(result.hasFigure).toBe(true);
    expect(result.figIsAtomic).toBe(true);
    expect(result.eqSelected).toBe(true);
    expect(result.figSelected).toBe(true);
    expect(result.eqDeselected).toBe(true);
    expect(result.eqReselected).toBe(true);
    expect(result.provSuccess).toBe(true);
    expect(result.provSelected).toBe(true);
    expect(result.inEditMode).toBe(true);
    expect(result.afterEditMode).toBe(true);
    expect(result.textUpdated).toBe(true);
    expect(result.blocksAfterDelete).toBe(result.blocksBeforeDelete - 1);
    expect(result.figureDeleted).toBe(true);
  });

  it("handles multi-line paste cleanly by parsing text into structured blocks", async () => {
    const pasteResult = await page.evaluate(async () => {
      const mod = await (window as any).eval('import("/src/document/block_editor.ts")');
      const { BlockDocumentEditor } = mod;

      const container = document.createElement("div");
      container.id = "test-paste-container";
      document.body.appendChild(container);

      const editor = new BlockDocumentEditor(container, "", {});

      // Simulate a multi-line paste event
      const sampleAx = [
        "# Differential Equation Test",
        "# Testing second-order system with $y'' + 4y = 0$",
        "d//d:time :x = :v",
      ].join("\n\n");

      const pasteEvent = new Event("paste", { bubbles: true, cancelable: true }) as any;
      pasteEvent.clipboardData = {
        getData: (type: string) => (type === "text/plain" ? sampleAx : ""),
      };

      editor.container.dispatchEvent(pasteEvent);

      const blocks = editor.getBlocks().filter((b: any) => b.type !== "blank");
      const types = blocks.map((b: any) => b.type);
      const text = editor.getText();

      editor.dispose();
      document.body.removeChild(container);

      return {
        blockCount: blocks.length,
        types,
        text,
      };
    });

    expect(pasteResult.blockCount).toBe(3);
    expect(pasteResult.types[0]).toBe("heading");
    expect(pasteResult.types[1]).toBe("paragraph");
    expect(pasteResult.types[2]).toBe("equation");
    expect(pasteResult.text).toContain("# Differential Equation Test");
    expect(pasteResult.text).toContain("d//d:time :x = :v");
  });
});
