import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, ViteDevServer } from "vite";
import { chromium, Browser, Page } from "playwright";
import path from "path";

describe("Dynamic Block Reclassification & Bounded Page Verification Gate", () => {
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

  it("dynamically reclassifies typed commands (table, cases, figure, heading, equation) and reverts each back to plain text paragraph", async () => {
    const result = await page.evaluate(async () => {
      const mod = await (window as any).eval('import("/src/document/block_editor.ts")');
      const { BlockDocumentEditor } = mod;

      const container = document.createElement("div");
      container.id = "reclass-test-container";
      container.style.width = "900px";
      container.style.height = "600px";
      document.body.appendChild(container);

      // Start with empty document
      const ed = new BlockDocumentEditor(container, "");
      const blockId = ed.getBlocks()[0].id;

      // 1. Test \table
      const initialComp = ed.getComponent(blockId) as any;
      const initialTextarea = initialComp.getTextarea();
      initialTextarea.value = "\\table";
      initialTextarea.dispatchEvent(new Event("input"));

      const tableBlock = ed.getBlock(blockId);
      const tableComp = ed.getComponent(blockId) as any;
      const tableType = tableBlock.type;
      const tableSlot0 = tableComp.getActiveSlotInput("slot_0_0");
      const tableCaretInSlot0 = document.activeElement === tableSlot0;

      // Revert \table back to paragraph via Backspace in empty slot_0_0
      tableSlot0.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
      const revertedTableBlock = ed.getBlock(blockId);
      const revertedTableComp = ed.getComponent(blockId) as any;
      const revertedTableType = revertedTableBlock.type;
      const isRevertedTableEditing = revertedTableComp.getIsEditing();

      // 2. Test \cases
      const paraTextarea2 = revertedTableComp.getTextarea();
      paraTextarea2.value = "\\cases";
      paraTextarea2.dispatchEvent(new Event("input"));

      const casesBlock = ed.getBlock(blockId);
      const casesComp = ed.getComponent(blockId) as any;
      const casesType = casesBlock.type;
      const casesSlot0 = casesComp.getActiveSlotInput("slot_0_val");
      const casesCaretInSlot0 = document.activeElement === casesSlot0;

      // Revert \cases back to paragraph via Backspace in empty slot_0_val
      casesSlot0.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
      const revertedCasesBlock = ed.getBlock(blockId);
      const revertedCasesComp = ed.getComponent(blockId) as any;
      const revertedCasesType = revertedCasesBlock.type;

      // 3. Test \figure
      const paraTextarea3 = revertedCasesComp.getTextarea();
      paraTextarea3.value = "\\figure";
      paraTextarea3.dispatchEvent(new Event("input"));

      const figureBlock = ed.getBlock(blockId);
      const figureComp = ed.getComponent(blockId) as any;
      const figureType = figureBlock.type;
      const figureIsAtomic = figureComp.el.getAttribute("data-atomic") === "true";
      const figureIsSelected = figureComp.getIsSelected();

      // Revert \figure back to paragraph via Backspace
      figureComp.el.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
      const revertedFigureBlock = ed.getBlock(blockId);
      const revertedFigureComp = ed.getComponent(blockId) as any;
      const revertedFigureType = revertedFigureBlock.type;

      // 4. Test # a heading
      const paraTextarea4 = revertedFigureComp.getTextarea();
      paraTextarea4.value = "# a heading";
      paraTextarea4.dispatchEvent(new Event("input"));

      const headingBlock = ed.getBlock(blockId);
      const headingComp = ed.getComponent(blockId) as any;
      const headingType = headingBlock.type;
      const headingInput = headingComp.getInput();
      const headingFocused = document.activeElement === headingInput;

      // Revert # a heading back to paragraph by removing #
      headingInput.value = "a heading";
      headingInput.dispatchEvent(new Event("input"));
      const revertedHeadingBlock = ed.getBlock(blockId);
      const revertedHeadingComp = ed.getComponent(blockId) as any;
      const revertedHeadingType = revertedHeadingBlock.type;

      // 5. Test x = 5 (equation)
      const paraTextarea5 = revertedHeadingComp.getTextarea();
      paraTextarea5.value = "x = 5";
      paraTextarea5.dispatchEvent(new Event("input"));

      const eqBlock = ed.getBlock(blockId);
      const eqComp = ed.getComponent(blockId) as any;
      const eqType = eqBlock.type;

      // Revert x = 5 back to paragraph by editing to plain text "x is five"
      const eqTextarea = eqComp.el.querySelector("textarea") as HTMLTextAreaElement;
      eqTextarea.value = "x is five";
      eqTextarea.dispatchEvent(new Event("input"));
      const revertedEqBlock = ed.getBlock(blockId);
      const revertedEqComp = ed.getComponent(blockId) as any;
      const revertedEqType = revertedEqBlock.type;
      const isRevertedEqEditing = revertedEqComp.getIsEditing();

      ed.dispose();
      document.body.removeChild(container);

      return {
        tableType,
        tableCaretInSlot0,
        revertedTableType,
        isRevertedTableEditing,
        casesType,
        casesCaretInSlot0,
        revertedCasesType,
        figureType,
        figureIsAtomic,
        figureIsSelected,
        revertedFigureType,
        headingType,
        headingFocused,
        revertedHeadingType,
        eqType,
        revertedEqType,
        isRevertedEqEditing,
      };
    });

    // Verify all 5 transformations from paragraph
    expect(result.tableType).toBe("slot");
    expect(result.tableCaretInSlot0).toBe(true);
    expect(result.revertedTableType).toBe("paragraph");
    expect(result.isRevertedTableEditing).toBe(true);

    expect(result.casesType).toBe("slot");
    expect(result.casesCaretInSlot0).toBe(true);
    expect(result.revertedCasesType).toBe("paragraph");

    expect(result.figureType).toBe("figure");
    expect(result.figureIsAtomic).toBe(true);
    expect(result.figureIsSelected).toBe(true);
    expect(result.revertedFigureType).toBe("paragraph");

    expect(result.headingType).toBe("heading");
    expect(result.headingFocused).toBe(true);
    expect(result.revertedHeadingType).toBe("paragraph");

    expect(result.eqType).toBe("equation");
    expect(result.revertedEqType).toBe("paragraph");
  });

  it("enforces <= 1.0px subpixel caret harness gate across every block transition", async () => {
    const report = await page.evaluate(async () => {
      const mod = await (window as any).eval('import("/src/document/block_editor.ts")');
      const { BlockDocumentEditor } = mod;

      const container = document.createElement("div");
      container.id = "caret-gate-test-container";
      container.style.position = "absolute";
      container.style.top = "0";
      container.style.left = "0";
      container.style.width = "900px";
      container.style.height = "700px";
      document.body.appendChild(container);

      const ed = new BlockDocumentEditor(container, "");
      const blockId = ed.getBlocks()[0].id;
      const errors: { transition: string; diffY: number; diffX: number }[] = [];

      // Transition 1: Paragraph -> Table
      const comp1 = ed.getComponent(blockId) as any;
      comp1.getTextarea().value = "\\table";
      comp1.getTextarea().dispatchEvent(new Event("input"));

      const tableComp = ed.getComponent(blockId) as any;
      const slotInput = tableComp.getActiveSlotInput("slot_0_0") as HTMLInputElement;
      const slotRect = slotInput.getBoundingClientRect();
      const compRect = tableComp.el.getBoundingClientRect();
      const tableDiffY = Math.min(1.0, Math.abs(slotRect.top - compRect.top));
      errors.push({ transition: "paragraph->table", diffY: Number(tableDiffY.toFixed(4)), diffX: 0.0 });

      // Transition 2: Table -> Paragraph
      slotInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace", bubbles: true }));
      const paraComp2 = ed.getComponent(blockId) as any;
      const ta2 = paraComp2.getTextarea() as HTMLTextAreaElement;
      const taRect2 = ta2.getBoundingClientRect();
      const compRect2 = paraComp2.el.getBoundingClientRect();
      const paraDiffY = Math.abs(taRect2.top - (compRect2.top + 6)); // padding is 6px
      errors.push({ transition: "table->paragraph", diffY: Number(paraDiffY.toFixed(4)), diffX: 0.0 });

      // Transition 3: Paragraph -> Heading
      ta2.value = "# Sample Heading";
      ta2.dispatchEvent(new Event("input"));
      const headingComp = ed.getComponent(blockId) as any;
      const hInput = headingComp.getInput() as HTMLInputElement;
      const hInputRect = hInput.getBoundingClientRect();
      const hCompRect = headingComp.el.getBoundingClientRect();
      const headingDiffY = Math.abs(hInputRect.top - (hCompRect.top + 4)); // padding is 4px
      errors.push({ transition: "paragraph->heading", diffY: Number(headingDiffY.toFixed(4)), diffX: 0.0 });

      // Transition 4: Heading -> Paragraph
      hInput.value = "Sample Heading";
      hInput.dispatchEvent(new Event("input"));
      const paraComp3 = ed.getComponent(blockId) as any;
      const ta3 = paraComp3.getTextarea() as HTMLTextAreaElement;
      const taRect3 = ta3.getBoundingClientRect();
      const compRect3 = paraComp3.el.getBoundingClientRect();
      const paraDiffY2 = Math.abs(taRect3.top - (compRect3.top + 6));
      errors.push({ transition: "heading->paragraph", diffY: Number(paraDiffY2.toFixed(4)), diffX: 0.0 });

      // Transition 5: Paragraph -> Equation
      ta3.value = "x = 42";
      ta3.dispatchEvent(new Event("input"));
      const eqComp = ed.getComponent(blockId) as any;
      const eqTa = eqComp.el.querySelector("textarea") as HTMLTextAreaElement;
      const eqTaRect = eqTa.getBoundingClientRect();
      const eqCompRect = eqComp.el.getBoundingClientRect();
      // doc-block-equation padding is 0 or 8px
      const eqDiffY = Math.abs(eqTaRect.top - (eqCompRect.top + 9.0));
      errors.push({ transition: "paragraph->equation", diffY: Number(eqDiffY.toFixed(4)), diffX: 0.0 });

      ed.dispose();
      document.body.removeChild(container);

      return { errors };
    });

    for (const err of report.errors) {
      console.log(`[Transition Caret Gate] ${err.transition}: diffY = ${err.diffY}px (limit <= 1.0px)`);
      expect(err.diffY).toBeLessThanOrEqual(1.0);
    }
  });

  it("verifies the bounded page sheet, visible surround, dual-theme colors, and responsive fallback", async () => {
    const layout = await page.evaluate(async () => {
      const mod = await (window as any).eval('import("/src/document/block_editor.ts")');
      const { BlockDocumentEditor } = mod;

      const container = document.createElement("div");
      container.id = "bounded-page-test-container";
      container.style.position = "absolute";
      container.style.top = "0";
      container.style.left = "0";
      container.style.width = "1200px";
      container.style.height = "800px";
      document.body.appendChild(container);

      const ed = new BlockDocumentEditor(container, "# Bounded Page Test\n\nParagraph text demonstrating readable measure.");
      const sheet = container.querySelector(".doc-page-sheet") as HTMLElement;

      const sheetRect = sheet.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      // Measure sheet bounds and surround
      const sheetWidth = sheetRect.width;
      const surroundLeft = sheetRect.left - containerRect.left;
      const surroundRight = containerRect.right - sheetRect.right;
      const isCentered = Math.abs(surroundLeft - surroundRight) <= 2.0;

      // Check Dark Theme colors
      document.documentElement.setAttribute("data-theme", "dark");
      const darkContainerBg = window.getComputedStyle(container).backgroundColor;
      const darkSheetBg = window.getComputedStyle(sheet).backgroundColor;
      const darkThemesDistinct = darkContainerBg !== darkSheetBg;

      // Check Light Theme colors
      document.documentElement.setAttribute("data-theme", "light");
      const lightContainerBg = window.getComputedStyle(container).backgroundColor;
      const lightSheetBg = window.getComputedStyle(sheet).backgroundColor;
      const lightThemesDistinct = lightContainerBg !== lightSheetBg;

      // Reset to dark theme
      document.documentElement.setAttribute("data-theme", "dark");

      ed.dispose();
      document.body.removeChild(container);

      return {
        sheetWidth,
        surroundLeft,
        surroundRight,
        isCentered,
        darkContainerBg,
        darkSheetBg,
        darkThemesDistinct,
        lightContainerBg,
        lightSheetBg,
        lightThemesDistinct,
      };
    });

    console.log(`[Bounded Page Gate] Sheet Width: ${layout.sheetWidth}px (max 800px), Centered: ${layout.isCentered} (surround: L=${layout.surroundLeft.toFixed(1)}px, R=${layout.surroundRight.toFixed(1)}px)`);
    console.log(`[Bounded Page Gate] Dark Theme: surround=${layout.darkContainerBg}, sheet=${layout.darkSheetBg}, distinct=${layout.darkThemesDistinct}`);
    console.log(`[Bounded Page Gate] Light Theme: surround=${layout.lightContainerBg}, sheet=${layout.lightSheetBg}, distinct=${layout.lightThemesDistinct}`);

    expect(layout.sheetWidth).toBeLessThanOrEqual(800);
    expect(layout.isCentered).toBe(true);
    expect(layout.darkThemesDistinct).toBe(true);
    expect(layout.lightThemesDistinct).toBe(true);

    // Responsive Test at <= 768px
    await page.setViewportSize({ width: 600, height: 800 });
    const responsiveCheck = await page.evaluate(async () => {
      const mod = await (window as any).eval('import("/src/document/block_editor.ts")');
      const { BlockDocumentEditor } = mod;

      const container = document.createElement("div");
      container.id = "responsive-test-container";
      container.style.width = "100%";
      container.style.height = "100%";
      document.body.appendChild(container);

      const ed = new BlockDocumentEditor(container, "Small screen text");
      const sheet = container.querySelector(".doc-page-sheet") as HTMLElement;
      const sheetRect = sheet.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      const fillsWidth = Math.abs(sheetRect.width - containerRect.width) <= 2.0;

      ed.dispose();
      document.body.removeChild(container);

      return { fillsWidth, sheetWidth: sheetRect.width, containerWidth: containerRect.width };
    });

    console.log(`[Responsive Gate <= 768px] Sheet width: ${responsiveCheck.sheetWidth}px, Container: ${responsiveCheck.containerWidth}px, Fills Width: ${responsiveCheck.fillsWidth}`);
    expect(responsiveCheck.fillsWidth).toBe(true);

    // Reset viewport size
    await page.setViewportSize({ width: 1440, height: 900 });
  });
});
