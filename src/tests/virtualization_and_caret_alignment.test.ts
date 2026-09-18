import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, ViteDevServer } from "vite";
import { chromium, Browser, Page } from "playwright";
import path from "path";

describe("Virtualization Scrolling & 5,000-Line Caret Alignment Test", () => {
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

  it("virtualizes gutter cards and updates visible slice and spacers across scrolling", async () => {
    // Generate 400-line document with expressions and spaces
    const lines: string[] = [];
    for (let i = 0; i < 400; i++) {
      if (i % 25 === 0) {
        lines.push("{\\axis x, y; x^2 + y^2 = " + (i + 1) + "}");
      } else {
        lines.push(":val_" + i + " = " + i + " + 10");
      }
    }
    const docText = lines.join("\n");

    await page.evaluate(({ text }) => {
      const ed = (window as any).editor;
      ed.openInitialDocument(text);
      ed.setEditorMode("classic");
      const pc = ed.paneContainer;
      const rootLeafId = pc.getLayout().root.id;
      pc.split(rootLeafId, "horizontal", "after", {
        id: "tab_results_virt",
        type: "results",
        title: "Virtualization Results",
      });
      pc.render();
    }, { text: docText });

    await page.waitForFunction(() => !(window as any).editor.state.getIsEvaluating(), { timeout: 15000 });

    // Scroll Position 1: Top (scrollTop = 0)
    const pos1 = await page.evaluate(() => {
      const ed = (window as any).editor;
      const ta = document.querySelector("#doc-textarea") as HTMLTextAreaElement;
      ta.scrollTop = 0;
      ta.dispatchEvent(new Event("scroll"));
      const topSpacer = document.querySelector(".doc-gutter-spacer-top") as HTMLElement;
      const bottomSpacer = document.querySelector(".doc-gutter-spacer-bottom") as HTMLElement;
      const renderedRows = Array.from(document.querySelectorAll(".doc-gutter-row")).map(r => Number(r.getAttribute("data-line")));
      return {
        scrollTop: ta.scrollTop,
        topSpacerHeight: parseFloat(topSpacer?.style.height || "0"),
        bottomSpacerHeight: parseFloat(bottomSpacer?.style.height || "0"),
        renderedRows,
        startLine: (ed as any).renderedStartLine,
        endLine: (ed as any).renderedEndLine,
      };
    });

    expect(pos1.topSpacerHeight).toBe(0);
    expect(pos1.bottomSpacerHeight).toBeGreaterThan(5000);
    expect(pos1.renderedRows).toContain(0);
    expect(pos1.renderedRows).not.toContain(350);

    // Scroll Position 2: Middle (scrollTop = 2500)
    const pos2 = await page.evaluate(async () => {
      const ed = (window as any).editor;
      const ta = document.querySelector("#doc-textarea") as HTMLTextAreaElement;
      ta.scrollTop = 2500;
      ta.dispatchEvent(new Event("scroll"));
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)));
      const topSpacer = document.querySelector(".doc-gutter-spacer-top") as HTMLElement;
      const bottomSpacer = document.querySelector(".doc-gutter-spacer-bottom") as HTMLElement;
      const renderedRows = Array.from(document.querySelectorAll(".doc-gutter-row")).map(r => Number(r.getAttribute("data-line")));
      return {
        scrollTop: ta.scrollTop,
        topSpacerHeight: parseFloat(topSpacer?.style.height || "0"),
        bottomSpacerHeight: parseFloat(bottomSpacer?.style.height || "0"),
        renderedRows,
        startLine: (ed as any).renderedStartLine,
        endLine: (ed as any).renderedEndLine,
      };
    });

    expect(pos2.topSpacerHeight).toBeGreaterThan(1000);
    expect(pos2.renderedRows).not.toContain(0);
    expect(pos2.renderedRows).toContain(Math.floor((pos2.startLine + pos2.endLine) / 2));

    // Scroll Position 3: Further down (scrollTop = 5000)
    const pos3 = await page.evaluate(async () => {
      const ed = (window as any).editor;
      const ta = document.querySelector("#doc-textarea") as HTMLTextAreaElement;
      ta.scrollTop = 5000;
      ta.dispatchEvent(new Event("scroll"));
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)));
      const topSpacer = document.querySelector(".doc-gutter-spacer-top") as HTMLElement;
      const bottomSpacer = document.querySelector(".doc-gutter-spacer-bottom") as HTMLElement;
      const renderedRows = Array.from(document.querySelectorAll(".doc-gutter-row")).map(r => Number(r.getAttribute("data-line")));
      return {
        scrollTop: ta.scrollTop,
        topSpacerHeight: parseFloat(topSpacer?.style.height || "0"),
        bottomSpacerHeight: parseFloat(bottomSpacer?.style.height || "0"),
        renderedRows,
        startLine: (ed as any).renderedStartLine,
        endLine: (ed as any).renderedEndLine,
      };
    });

    expect(pos3.topSpacerHeight).toBeGreaterThan(pos2.topSpacerHeight);
    expect(pos3.renderedRows[0]).toBeGreaterThan(pos2.renderedRows[0]);
  });

  it("aligns caret within 1px across 5,000 lines and places caret correctly on 3 click positions", async () => {
    // Generate 5,000 lines
    const lines: string[] = [];
    for (let i = 0; i < 5000; i++) {
      lines.push(":var_" + i + " = " + (i * 2));
    }
    const docText = lines.join("\n");

    await page.evaluate(({ text }) => {
      const ed = (window as any).editor;
      ed.openInitialDocument(text);
      ed.setEditorMode("classic");
    }, { text: docText });

    await page.waitForFunction(() => !(window as any).editor.state.getIsEvaluating(), { timeout: 15000 });

    // Jump to line 2500 mid-document and assert caret alignment within 1px
    const alignCheck = await page.evaluate(() => {
      const ed = (window as any).editor;
      ed.jumpToLine(2500);

      const caret = document.querySelector("#doc-caret") as HTMLElement;
      const overlayLines = document.querySelectorAll(".doc-typeset-line");
      const targetLine = overlayLines[2500] as HTMLElement;

      const caretRect = caret.getBoundingClientRect();
      const lineRect = targetLine.getBoundingClientRect();

      return {
        caretTop: caretRect.top,
        lineTop: lineRect.top,
        diffY: Math.abs(caretRect.top - lineRect.top),
      };
    });

    expect(alignCheck.diffY).toBeLessThanOrEqual(1.0);

    // Test 3 click positions: Line 10, Line 2500, Line 4900
    const testLines = [10, 2500, 4900];
    for (const lineIdx of testLines) {
      await page.evaluate((targetLineIdx) => {
        (window as any).editor.jumpToLine(targetLineIdx);
      }, lineIdx);
      await page.waitForTimeout(100);

      const coords = await page.evaluate((targetLineIdx) => {
        const overlayLines = document.querySelectorAll(".doc-typeset-line");
        const targetLineEl = overlayLines[targetLineIdx] as HTMLElement;
        let remaining = 6;
        let targetNode: Node | null = null;
        let nodeOffset = 0;

        function walk(node: Node) {
          if (targetNode) return;
          if (node.nodeType === Node.TEXT_NODE) {
            const len = node.textContent?.length || 0;
            if (remaining < len) {
              targetNode = node;
              nodeOffset = remaining;
            } else {
              remaining -= len;
            }
          } else {
            for (let i = 0; i < node.childNodes.length; i++) {
              walk(node.childNodes[i]);
            }
          }
        }
        walk(targetLineEl);

        const range = document.createRange();
        range.setStart(targetNode!, nodeOffset);
        range.setEnd(targetNode!, nodeOffset + 1);
        const rect = range.getBoundingClientRect();
        return {
          x: rect.left + rect.width * 0.25,
          y: (rect.top + rect.bottom) / 2,
        };
      }, lineIdx);

      await page.mouse.click(coords.x, coords.y);

      const actualOffset = await page.evaluate(() => {
        return (window as any).editor.textarea.selectionStart;
      });

      let expectedOffset = 0;
      for (let l = 0; l < lineIdx; l++) {
        expectedOffset += lines[l].length + 1;
      }
      expectedOffset += 6;

      expect(actualOffset).toBe(expectedOffset);
    }
  }, 30000);
});
