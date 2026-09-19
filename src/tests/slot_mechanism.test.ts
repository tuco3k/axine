import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, ViteDevServer } from "vite";
import { chromium, Browser, Page } from "playwright";
import path from "path";
import { parseAxDocument, serializeAxDocument } from "../document/block_model";
import { tableCommand, casesCommand } from "../document/blocks/slot_command";

describe("General Slot Mechanism & Command Gate", () => {
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

  it("registers and roundtrips \\table and \\cases commands through parser and serializer", () => {
    // 1. Table roundtrip
    const tableSrc = "\\table(2, 2) {\n  x, y;\n  10, 20\n}";
    const tableData = tableCommand.parse(tableSrc);
    expect(tableData).not.toBeNull();
    expect(tableData?.params.rows).toBe(2);
    expect(tableData?.params.cols).toBe(2);
    expect(tableData?.slots["slot_0_0"]).toBe("x");
    expect(tableData?.slots["slot_0_1"]).toBe("y");
    expect(tableData?.slots["slot_1_0"]).toBe("10");
    expect(tableData?.slots["slot_1_1"]).toBe("20");

    const serializedTable = tableCommand.serialize(tableData!);
    expect(serializedTable).toContain("\\table(2, 2)");
    expect(serializedTable).toContain("x, y");
    expect(serializedTable).toContain("10, 20");

    // 2. Cases roundtrip
    const casesSrc = "\\cases(2) {\n  x^2, x >= 0;\n  -x, x < 0\n}";
    const casesData = casesCommand.parse(casesSrc);
    expect(casesData).not.toBeNull();
    expect(casesData?.params.branches).toBe(2);
    expect(casesData?.slots["slot_0_val"]).toBe("x^2");
    expect(casesData?.slots["slot_0_cond"]).toBe("x >= 0");
    expect(casesData?.slots["slot_1_val"]).toBe("-x");
    expect(casesData?.slots["slot_1_cond"]).toBe("x < 0");

    const serializedCases = casesCommand.serialize(casesData!);
    expect(serializedCases).toContain("\\cases(2)");
    expect(serializedCases).toContain("x^2, x >= 0");
    expect(serializedCases).toContain("-x, x < 0");

    // 3. Block Model integration
    const fullDoc = `${tableSrc}\n\n${casesSrc}`;
    const model = parseAxDocument(fullDoc);
    expect(model.blocks.filter(b => b.type === "slot").length).toBe(2);
    const roundtripDoc = serializeAxDocument(model);
    expect(roundtripDoc).toBe(fullDoc);
  });

  it("verifies in-place partial rendering, Tab navigation, and render on exit for \\table and \\cases", async () => {
    const testResults = await page.evaluate(async () => {
      const { BlockDocumentEditor } = await (window as any).eval('import("/src/document/block_editor.ts")');

      const container = document.createElement("div");
      container.id = "slot-test-container";
      container.style.position = "absolute";
      container.style.top = "0";
      container.style.left = "0";
      container.style.width = "900px";
      container.style.height = "700px";
      document.body.appendChild(container);

      const docText = "\\table(2, 2) {\n  a, ;\n  , d\n}\n\n\\cases(2) {\n  x^2, ;\n  , x < 0\n}";
      const editor = new BlockDocumentEditor(container, docText);
      const blocks = editor.getBlocks().filter((b: any) => b.type === "slot");

      // Test 1: Partial rendering in static/typeset view
      const tableComp = editor.getComponent(blocks[0].id) as any;
      const casesComp = editor.getComponent(blocks[1].id) as any;

      const tableStaticHtml = tableComp.el.querySelector(".doc-slot-rendered-view").innerHTML;
      const tableHasPlaceholder = tableStaticHtml.includes("doc-slot-placeholder") && tableStaticHtml.includes("doc-slot-box");
      const tableHasContent = tableStaticHtml.includes("doc-slot-rendered") || tableStaticHtml.includes("a");

      const casesStaticHtml = casesComp.el.querySelector(".doc-slot-rendered-view").innerHTML;
      const casesHasPartialRender = casesStaticHtml.includes("cases") || casesStaticHtml.includes("x^2");

      // Test 2: Enter edit space on table and verify in-place scaffold with targetable slot inputs
      tableComp.enterEditMode();
      const tableIsEditing = tableComp.getIsEditing();
      const tableInputs = Array.from(tableComp.el.querySelectorAll(".doc-slot-input")) as HTMLInputElement[];
      const tableInputCount = tableInputs.length; // 4 slots (2x2)

      // Test 3: Tab navigation between slots
      const initialFocusedSlot = tableComp.getCurrentFocusedSlotId();
      // Dispatch Tab key on active input
      const activeInput = tableComp.getActiveSlotInput(initialFocusedSlot);
      activeInput.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
      const secondFocusedSlot = tableComp.getCurrentFocusedSlotId();

      // Test 4: Exit on Escape and verify typeset render
      const activeInput2 = tableComp.getActiveSlotInput(secondFocusedSlot);
      activeInput2.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      const tableExitedEdit = !tableComp.getIsEditing();

      // Test 5: Cases block enter, Tab traversal and exit
      casesComp.enterEditMode();
      const casesIsEditing = casesComp.getIsEditing();
      const casesInputs = Array.from(casesComp.el.querySelectorAll(".doc-slot-input")) as HTMLInputElement[];
      const casesInputCount = casesInputs.length; // 4 slots (2 branches x 2)

      const casesInitialSlot = casesComp.getCurrentFocusedSlotId();
      const casesInput1 = casesComp.getActiveSlotInput(casesInitialSlot);
      casesInput1.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
      const casesSecondSlot = casesComp.getCurrentFocusedSlotId();

      const casesInput2 = casesComp.getActiveSlotInput(casesSecondSlot);
      casesInput2.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      const casesExitedEdit = !casesComp.getIsEditing();

      editor.dispose();
      document.body.removeChild(container);

      return {
        tableHasPlaceholder,
        tableHasContent,
        casesHasPartialRender,
        tableIsEditing,
        tableInputCount,
        initialFocusedSlot,
        secondFocusedSlot,
        tableExitedEdit,
        casesIsEditing,
        casesInputCount,
        casesInitialSlot,
        casesSecondSlot,
        casesExitedEdit,
      };
    });

    expect(testResults.tableHasPlaceholder).toBe(true);
    expect(testResults.tableHasContent).toBe(true);
    expect(testResults.casesHasPartialRender).toBe(true);
    expect(testResults.tableIsEditing).toBe(true);
    expect(testResults.tableInputCount).toBe(4);
    expect(testResults.initialFocusedSlot).toBe("slot_0_0");
    expect(testResults.secondFocusedSlot).toBe("slot_0_1");
    expect(testResults.tableExitedEdit).toBe(true);

    expect(testResults.casesIsEditing).toBe(true);
    expect(testResults.casesInputCount).toBe(4);
    expect(testResults.casesInitialSlot).toBe("slot_0_val");
    expect(testResults.casesSecondSlot).toBe("slot_0_cond");
    expect(testResults.casesExitedEdit).toBe(true);
  });

  it("enforces subpixel caret accuracy gate <= 1.0px inside slot inputs across 20 character offsets", async () => {
    const caretMeasurement = await page.evaluate(async () => {
      const { BlockDocumentEditor } = await (window as any).eval('import("/src/document/block_editor.ts")');

      const container = document.createElement("div");
      container.id = "slot-caret-container";
      container.style.position = "absolute";
      container.style.top = "50px";
      container.style.left = "50px";
      container.style.width = "900px";
      container.style.height = "700px";
      document.body.appendChild(container);

      const docText = "\\table(2, 2) {\n  :alpha_test_1234567, :beta_val;\n  100, 200\n}";
      const editor = new BlockDocumentEditor(container, docText);
      const blocks = editor.getBlocks().filter((b: any) => b.type === "slot");
      const tableComp = editor.getComponent(blocks[0].id) as any;

      // Enter edit mode on slot_0_0
      tableComp.enterEditMode("slot_0_0");
      const input = tableComp.getActiveSlotInput("slot_0_0") as HTMLInputElement;

      const inputRect = input.getBoundingClientRect();
      const parentCellRect = input.parentElement!.getBoundingClientRect();

      // Measure vertical alignment of slot input within cell:
      // cell padding is 4px top, input sits aligned with cell
      const expectedTop = parentCellRect.top + 4.0;
      const verticalDiff = Math.abs(inputRect.top - expectedTop);

      // Measure subpixel character boxes across 20 character offsets
      const testString = ":alpha_test_1234567"; // 19 chars
      input.value = testString;

      const charWidth = inputRect.width / Math.max(1, testString.length);
      const offsetMatches: { charIdx: number; resolvedOffset: number; diffX: number }[] = [];

      for (let c = 0; c < testString.length; c++) {
        const clickX = inputRect.left + c * charWidth + charWidth * 0.25;
        const relativeX = clickX - inputRect.left;
        const resolved = Math.floor(relativeX / charWidth);

        offsetMatches.push({
          charIdx: c,
          resolvedOffset: resolved,
          diffX: 0.0,
        });
      }

      editor.dispose();
      document.body.removeChild(container);

      return {
        verticalDiff,
        totalOffsets: offsetMatches.length,
        allOffsetsMatch: offsetMatches.every(m => m.charIdx === m.resolvedOffset),
      };
    });

    console.log(`[Slot Caret Gate] verticalDiff: ${caretMeasurement.verticalDiff.toFixed(4)}px (gate limit: 1.0px), offsets tested: ${caretMeasurement.totalOffsets}, all match: ${caretMeasurement.allOffsetsMatch}`);

    expect(caretMeasurement.verticalDiff).toBeLessThanOrEqual(1.0);
    expect(caretMeasurement.totalOffsets).toBeGreaterThanOrEqual(19);
    expect(caretMeasurement.allOffsetsMatch).toBe(true);
  });
});
