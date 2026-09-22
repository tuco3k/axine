import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, ViteDevServer } from "vite";
import { chromium, Browser, Page } from "playwright";
import path from "path";

describe("Unified File Presentation & Clipboard Processing Gate", () => {
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

  it("selects all blocks across the document via selectAll() and copies the full .ax file", async () => {
    const result = await page.evaluate(async () => {
      const mod = await (window as any).eval('import("/src/document/block_editor.ts")');
      const { BlockDocumentEditor } = mod;

      const sampleDoc = [
        "# Differential Equations Assignment",
        "# Solve the following initial value problem:",
        "y'' + 4y' + 13y = 0",
        "y(0) = 2",
      ].join("\n\n");

      const container = document.createElement("div");
      document.body.appendChild(container);
      const editor = new BlockDocumentEditor(container, sampleDoc);

      // Trigger selectAll()
      editor.selectAll();
      const allSelectedClass = editor.pageSheet.classList.contains("all-selected");
      const blockCount = editor.getBlocks().length;
      const selectedBlockCount = editor.pageSheet.querySelectorAll(".doc-block-range-selected").length;

      // Simulate copy event
      let copiedText = "";
      const copyEvt = new Event("copy", { bubbles: true, cancelable: true }) as any;
      copyEvt.clipboardData = {
        setData: (type: string, data: string) => {
          if (type === "text/plain") copiedText = data;
        },
      };
      editor.container.dispatchEvent(copyEvt);

      // Deselect
      editor.deselectAll();
      const afterDeselectCount = editor.pageSheet.querySelectorAll(".doc-block-range-selected").length;

      editor.dispose();
      document.body.removeChild(container);

      return {
        allSelectedClass,
        blockCount,
        selectedBlockCount,
        copiedText,
        afterDeselectCount,
      };
    });

    expect(result.allSelectedClass).toBe(true);
    expect(result.selectedBlockCount).toBe(result.blockCount);
    expect(result.copiedText).toContain("# Differential Equations Assignment");
    expect(result.copiedText).toContain("y'' + 4y' + 13y = 0");
    expect(result.copiedText).toContain("y(0) = 2");
    expect(result.afterDeselectCount).toBe(0);
  });

  it("replaces the entire document when pasting while all blocks are selected", async () => {
    const result = await page.evaluate(async () => {
      const mod = await (window as any).eval('import("/src/document/block_editor.ts")');
      const { BlockDocumentEditor } = mod;

      const initialDoc = [
        "# Old Document Heading",
        "x = 10",
      ].join("\n\n");

      const newDoc = [
        "# New Replacement Heading",
        "# Prose explaining the replacement",
        "y'' + 4y = 0",
      ].join("\n\n");

      const container = document.createElement("div");
      document.body.appendChild(container);
      const editor = new BlockDocumentEditor(container, initialDoc);

      // Select all
      editor.selectAll();

      // Paste new document
      const pasteEvt = new Event("paste", { bubbles: true, cancelable: true }) as any;
      pasteEvt.clipboardData = {
        getData: (type: string) => (type === "text/plain" ? newDoc : ""),
      };
      editor.container.dispatchEvent(pasteEvt);

      const text = editor.getText();
      const blocks = editor.getBlocks().filter((b: any) => b.type !== "blank");
      const types = blocks.map((b: any) => b.type);

      editor.dispose();
      document.body.removeChild(container);

      return {
        text,
        types,
        blockCount: blocks.length,
      };
    });

    expect(result.blockCount).toBe(3);
    expect(result.types).toEqual(["heading", "paragraph", "equation"]);
    expect(result.text).toContain("# New Replacement Heading");
    expect(result.text).toContain("y'' + 4y = 0");
    expect(result.text).not.toContain("# Old Document Heading");
  });

  it("clears document on Backspace or Delete when all blocks are selected", async () => {
    const result = await page.evaluate(async () => {
      const mod = await (window as any).eval('import("/src/document/block_editor.ts")');
      const { BlockDocumentEditor } = mod;

      const initialDoc = [
        "# Document to Clear",
        "y = 42",
      ].join("\n\n");

      const container = document.createElement("div");
      document.body.appendChild(container);
      const editor = new BlockDocumentEditor(container, initialDoc);

      editor.selectAll();

      const backspaceEvt = new KeyboardEvent("keydown", {
        key: "Backspace",
        bubbles: true,
        cancelable: true,
      });
      editor.container.dispatchEvent(backspaceEvt);

      const textAfterBackspace = editor.getText();
      const blocks = editor.getBlocks();

      editor.dispose();
      document.body.removeChild(container);

      return {
        textAfterBackspace,
        blockCount: blocks.length,
      };
    });

    expect(result.textAfterBackspace.trim()).toBe("");
  });

  it("selects a multi-block range and copies only that range", async () => {
    const result = await page.evaluate(async () => {
      const mod = await (window as any).eval('import("/src/document/block_editor.ts")');
      const { BlockDocumentEditor } = mod;

      const doc = [
        "# Section 1",
        "# Block 2 prose",
        "x = 1",
        "y = 2",
        "z = 3",
      ].join("\n\n");

      const container = document.createElement("div");
      document.body.appendChild(container);
      const editor = new BlockDocumentEditor(container, doc);

      // Select range of middle blocks (index 2 to 4)
      editor.selectRange(2, 4);

      let copiedText = "";
      const copyEvt = new Event("copy", { bubbles: true, cancelable: true }) as any;
      copyEvt.clipboardData = {
        setData: (type: string, data: string) => {
          if (type === "text/plain") copiedText = data;
        },
      };
      editor.container.dispatchEvent(copyEvt);

      editor.dispose();
      document.body.removeChild(container);

      return {
        copiedText,
      };
    });

    expect(result.copiedText.length).toBeGreaterThan(0);
    expect(result.copiedText).not.toContain("# Section 1");
  });

  it("intercepts whole-file paste even when a paragraph or equation is in edit mode", async () => {
    const result = await page.evaluate(async () => {
      const mod = await (window as any).eval('import("/src/document/block_editor.ts")');
      const { BlockDocumentEditor } = mod;

      const initialDoc = "# Initial Heading\n\nInitial paragraph";
      const wholeFile = [
        "---",
        ":title: Damped Oscillator",
        "---",
        "",
        "# Damped Harmonic Oscillator",
        "",
        "# Solving second order linear ODE:",
        "",
        "y'' + 4y' + 13y = 0",
      ].join("\n");

      const container = document.createElement("div");
      document.body.appendChild(container);
      const editor = new BlockDocumentEditor(container, initialDoc);

      // Enter edit mode on paragraph block
      const paraBlock = editor.getBlocks().find((b: any) => b.type === "paragraph");
      const comp = editor.getComponent(paraBlock.id);
      comp.enterEditMode();

      // Dispatch paste inside the active textarea
      const pasteEvt = new Event("paste", { bubbles: true, cancelable: true }) as any;
      pasteEvt.clipboardData = {
        getData: (type: string) => (type === "text/plain" ? wholeFile : ""),
      };
      comp.el.dispatchEvent(pasteEvt);

      const text = editor.getText();
      const hasHeading = text.includes("# Damped Harmonic Oscillator");
      const hasODE = text.includes("y'' + 4y' + 13y = 0");

      editor.dispose();
      document.body.removeChild(container);

      return {
        hasHeading,
        hasODE,
        text,
      };
    });

    expect(result.hasHeading).toBe(true);
    expect(result.hasODE).toBe(true);
  });

  it("moves through text boxes backwards when holding delete on empty box", async () => {
    const result = await page.evaluate(async () => {
      const mod = await (window as any).eval('import("/src/document/block_editor.ts")');
      const { BlockDocumentEditor } = mod;

      const initialDoc = "# Section 1\ny = 2x + 1\nFinal note";
      const container = document.createElement("div");
      document.body.appendChild(container);
      const editor = new BlockDocumentEditor(container, initialDoc);

      const initialCount = editor.getBlocks().length;

      // 1. Enter edit mode on last block (paragraph)
      const lastBlock = editor.getBlocks()[initialCount - 1];
      const lastComp = editor.getComponent(lastBlock.id);
      lastComp.enterEditMode();

      // Simulate deleting all text on paragraph
      const ta = lastComp.el.querySelector("textarea") as HTMLTextAreaElement;
      ta.value = "";

      // Dispatch Backspace (holding delete without shift)
      const bsEvt1 = new KeyboardEvent("keydown", { key: "Backspace", shiftKey: false, bubbles: true, cancelable: true });
      ta.dispatchEvent(bsEvt1);

      // Paragraph should be deleted, now initialCount - 1 blocks left
      const countAfter1 = editor.getBlocks().length;
      const activeBlockAfter1 = editor.getSelectedBlockId();
      const eqBlock = editor.getBlocks()[countAfter1 - 1];
      const eqComp = editor.getComponent(eqBlock.id);
      const isEqEditing = eqComp.getIsEditing();

      // Clear equation and dispatch Backspace again without shift
      if (eqComp.mfEl) {
        eqComp.mfEl.value = "";
      } else if (eqComp.textarea) {
        eqComp.textarea.value = "";
      }
      const activeEl = eqComp.mfEl || eqComp.textarea || eqComp.el;
      const bsEvt2 = new KeyboardEvent("keydown", { key: "Backspace", shiftKey: false, bubbles: true, cancelable: true });
      activeEl.dispatchEvent(bsEvt2);

      // Equation should be deleted, only heading remains and is in edit mode
      const countAfter2 = editor.getBlocks().length;
      const headingBlock = editor.getBlocks()[0];
      const headingComp = editor.getComponent(headingBlock.id);
      const isHeadingEditing = headingComp.getIsEditing();

      editor.dispose();
      document.body.removeChild(container);

      return {
        initialCount,
        countAfter1,
        activeBlockAfter1,
        eqBlockId: eqBlock.id,
        isEqEditing,
        countAfter2,
        isHeadingEditing,
      };
    });

    expect(result.countAfter1).toBe(result.initialCount - 1);
    expect(result.activeBlockAfter1).toBe(result.eqBlockId);
    expect(result.isEqEditing).toBe(true);
    expect(result.countAfter2).toBe(result.initialCount - 2);
    expect(result.isHeadingEditing).toBe(true);
  });

  it("stops at the start of the block and does not delete or go to previous line when shift is held", async () => {
    const result = await page.evaluate(async () => {
      const mod = await (window as any).eval('import("/src/document/block_editor.ts")');
      const { BlockDocumentEditor } = mod;

      const initialDoc = "# Section 1\nParagraph text";
      const container = document.createElement("div");
      document.body.appendChild(container);
      const editor = new BlockDocumentEditor(container, initialDoc);

      const initialCount = editor.getBlocks().length;
      const paraBlock = editor.getBlocks()[initialCount - 1];
      const comp = editor.getComponent(paraBlock.id);
      comp.enterEditMode();

      const ta = comp.el.querySelector("textarea") as HTMLTextAreaElement;
      ta.value = "";

      // Dispatch Shift+Backspace
      const shiftBsEvt = new KeyboardEvent("keydown", { key: "Backspace", shiftKey: true, bubbles: true, cancelable: true });
      ta.dispatchEvent(shiftBsEvt);

      // Block count must still be unchanged (stopped before going to previous line)
      const countAfter = editor.getBlocks().length;
      const isStillEditing = comp.getIsEditing();

      editor.dispose();
      document.body.removeChild(container);

      return {
        initialCount,
        countAfter,
        isStillEditing,
      };
    });

    expect(result.countAfter).toBe(result.initialCount);
    expect(result.isStillEditing).toBe(true);
  });

  it("maintains highlighting when letting go of mouse (mouseup) until the next mouse click", async () => {
    const result = await page.evaluate(async () => {
      const mod = await (window as any).eval('import("/src/document/block_editor.ts")');
      const { BlockDocumentEditor } = mod;

      const initialDoc = "# Heading\n\nParagraph 1\n\nParagraph 2\n\nParagraph 3";
      const container = document.createElement("div");
      document.body.appendChild(container);
      const editor = new BlockDocumentEditor(container, initialDoc);

      // Start drag on block 1
      editor.selectRange(1, 2);
      const initialSelectedCount = editor.pageSheet.querySelectorAll(".doc-block-range-selected").length;

      // Simulate mouseup (letting go of what you are highlighting)
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      const afterMouseUpSelectedCount = editor.pageSheet.querySelectorAll(".doc-block-range-selected").length;

      // Simulate the next mouse click outside the selection
      const nextClickEvt = new MouseEvent("click", { bubbles: true, cancelable: true });
      editor.container.dispatchEvent(nextClickEvt);
      const afterNextClickSelectedCount = editor.pageSheet.querySelectorAll(".doc-block-range-selected").length;

      editor.dispose();
      document.body.removeChild(container);

      return {
        initialSelectedCount,
        afterMouseUpSelectedCount,
        afterNextClickSelectedCount,
      };
    });

    expect(result.initialSelectedCount).toBe(2);
    expect(result.afterMouseUpSelectedCount).toBe(2); // Stays highlighted after letting go
    expect(result.afterNextClickSelectedCount).toBe(0); // Cleared on next mouse click
  });
});

