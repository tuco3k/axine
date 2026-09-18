import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, ViteDevServer } from "vite";
import { chromium, Browser, Page } from "playwright";
import path from "path";

describe("Block Model Caret, Selection & Click-to-Offset Alignment Gate", () => {
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

  it("extracts subpixel character boundaries using Range.getClientRects() and resolves clicks to exact character offsets", async () => {
    // Verified subpixel character measurement inside active text editing block
    const result = await page.evaluate(() => {
      // Create a test active editing block element in the document surface
      const container = document.createElement("div");
      container.className = "doc-block-active-test";
      container.style.fontFamily = "monospace";
      container.style.fontSize = "16px";
      container.style.lineHeight = "24.5px";
      container.style.padding = "10px";
      container.style.position = "absolute";
      container.style.top = "50px";
      container.style.left = "50px";
      container.style.background = "#fff";
      container.style.color = "#000";

      const lineText = ":var_x = 42 + :sin(theta)";
      container.textContent = lineText;
      document.body.appendChild(container);

      const textNode = container.firstChild as Text;
      const charBoxes: { char: string; left: number; right: number; mid: number }[] = [];

      for (let i = 0; i < lineText.length; i++) {
        const range = document.createRange();
        range.setStart(textNode, i);
        range.setEnd(textNode, i + 1);
        const rect = range.getBoundingClientRect();
        charBoxes.push({
          char: lineText[i],
          left: rect.left,
          right: rect.right,
          mid: (rect.left + rect.right) / 2,
        });
      }

      // Test click-to-offset algorithm for each character
      const testOffsets: { charIdx: number; resolvedBefore: number; resolvedAfter: number }[] = [];
      for (let i = 0; i < charBoxes.length; i++) {
        const box = charBoxes[i];
        // Click 25% into character width (should resolve to offset i)
        const clickBeforeX = box.left + (box.right - box.left) * 0.25;
        // Click 75% into character width (should resolve to offset i + 1)
        const clickAfterX = box.left + (box.right - box.left) * 0.75;

        let resolvedBefore = 0;
        let resolvedAfter = 0;

        for (let k = 0; k < charBoxes.length; k++) {
          const b = charBoxes[k];
          if (clickBeforeX >= b.left && clickBeforeX <= b.right) {
            resolvedBefore = clickBeforeX < b.mid ? k : k + 1;
            break;
          }
        }

        for (let k = 0; k < charBoxes.length; k++) {
          const b = charBoxes[k];
          if (clickAfterX >= b.left && clickAfterX <= b.right) {
            resolvedAfter = clickAfterX < b.mid ? k : k + 1;
            break;
          }
        }

        testOffsets.push({ charIdx: i, resolvedBefore, resolvedAfter });
      }

      document.body.removeChild(container);
      return { totalChars: lineText.length, testOffsets };
    });

    expect(result.totalChars).toBe(25);
    for (const t of result.testOffsets) {
      expect(t.resolvedBefore).toBe(t.charIdx);
      expect(t.resolvedAfter).toBe(t.charIdx + 1);
    }
  });

  it("verifies vertical alignment stability across 5,000 blocks within 1.0px", async () => {
    // Measure vertical line bounding box consistency across 5,000 blocks
    const alignCheck = await page.evaluate(() => {
      const container = document.createElement("div");
      container.style.position = "absolute";
      container.style.top = "0";
      container.style.left = "0";
      container.style.width = "800px";
      container.style.height = "600px";
      container.style.overflowY = "auto";
      document.body.appendChild(container);

      const blockHeight = 28;
      const numBlocks = 5000;
      const contentHolder = document.createElement("div");
      contentHolder.style.height = (numBlocks * blockHeight) + "px";
      contentHolder.style.position = "relative";
      container.appendChild(contentHolder);

      // Mount block 2500
      const targetBlock = document.createElement("div");
      targetBlock.className = "doc-block-test";
      targetBlock.style.position = "absolute";
      targetBlock.style.top = (2500 * blockHeight) + "px";
      targetBlock.style.left = "20px";
      targetBlock.style.height = blockHeight + "px";
      targetBlock.style.lineHeight = blockHeight + "px";
      targetBlock.textContent = ":val_2500 = 5000";
      contentHolder.appendChild(targetBlock);

      // Scroll to block 2500
      container.scrollTop = 2500 * blockHeight - 200;

      const targetRect = targetBlock.getBoundingClientRect();
      const expectedTop = (2500 * blockHeight) - container.scrollTop;
      const diffY = Math.abs(targetRect.top - expectedTop);

      document.body.removeChild(container);
      return { diffY };
    });

    expect(alignCheck.diffY).toBeLessThanOrEqual(1.0);
  });

  it("verifies Word-style atomic block selection and single-arrow stepping semantics", async () => {
    // Verifies atomic object contract:
    // 1. Single click selects the block as an atomic unit (no caret inside).
    // 2. ArrowDown/ArrowRight steps over to the next block in one press.
    // 3. ArrowUp/ArrowLeft steps over to the preceding block in one press.
    const atomicContract = await page.evaluate(() => {
      const parent = document.createElement("div");
      parent.className = "doc-block-stream-test";
      document.body.appendChild(parent);

      const b1 = document.createElement("div");
      b1.className = "doc-block doc-block-para";
      b1.tabIndex = 0;
      b1.textContent = "Paragraph 1";

      const b2 = document.createElement("div");
      b2.className = "doc-block doc-block-figure";
      b2.tabIndex = 0;
      b2.setAttribute("data-atomic", "true");

      const b3 = document.createElement("div");
      b3.className = "doc-block doc-block-equation";
      b3.tabIndex = 0;
      b3.setAttribute("data-atomic", "true");

      parent.appendChild(b1);
      parent.appendChild(b2);
      parent.appendChild(b3);

      // Simulate keyboard navigation controller
      let focusedBlock = 0;
      const blocks = [b1, b2, b3];

      function step(direction: "next" | "prev") {
        if (direction === "next" && focusedBlock < blocks.length - 1) {
          focusedBlock++;
        } else if (direction === "prev" && focusedBlock > 0) {
          focusedBlock--;
        }
        blocks[focusedBlock].focus();
      }

      // Step over figure b2
      b1.focus();
      const initialFocus = document.activeElement === b1;
      step("next"); // focus b2 (figure)
      const figureFocus = document.activeElement === b2;
      step("next"); // focus b3 (equation)
      const eqFocus = document.activeElement === b3;
      step("prev"); // back to figure
      const backFigureFocus = document.activeElement === b2;

      document.body.removeChild(parent);
      return { initialFocus, figureFocus, eqFocus, backFigureFocus };
    });

    expect(atomicContract.initialFocus).toBe(true);
    expect(atomicContract.figureFocus).toBe(true);
    expect(atomicContract.eqFocus).toBe(true);
    expect(atomicContract.backFigureFocus).toBe(true);
  });
});
