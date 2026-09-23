import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, ViteDevServer } from "vite";
import { chromium, Browser, Page } from "playwright";
import fs from "fs";
import path from "path";
import { processDocumentLines } from "../core/worker";
import { Evaluator } from "../core/evaluator";

// Gate: opening an equation and leaving it without editing must leave the
// document byte-identical. Every equation block in every documents/*.ax file
// is clicked with a real mouse event, Escape is pressed, and the document
// text read back from the running editor is compared to the file on disk.

const DOCUMENTS_DIR = path.resolve(__dirname, "../../documents");

function listAxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...listAxFiles(p));
    else if (p.endsWith(".ax")) out.push(p);
  }
  return out.sort();
}

function countErrors(text: string): number {
  let errors = 0;
  processDocumentLines(1, text.split("\n"), (res) => {
    if (res.error) errors++;
  });
  return errors;
}

describe("Equation source identity: click + Escape without editing", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let page: Page;
  let baseUrl = "";
  const files = listAxFiles(DOCUMENTS_DIR);

  beforeAll(async () => {
    for (const p of files) {
      Evaluator.virtualFiles.set(path.relative(DOCUMENTS_DIR, p), fs.readFileSync(p, "utf8"));
    }
    server = await createServer({
      configFile: path.resolve(__dirname, "../../vite.config.ts"),
      server: { port: 0 },
    });
    await server.listen();
    const port = (server.httpServer!.address() as any).port;
    baseUrl = "http://localhost:" + port;
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  }, 60000);

  // Every test starts from a freshly loaded app with no stored workspace, so no
  // timers or focus state carry over from the previous test.
  beforeEach(async () => {
    await page.goto(baseUrl);
    await page.evaluate(() => localStorage.clear());
    await page.goto(baseUrl);
    await page.waitForFunction(() => typeof (window as any).editor !== "undefined");
    await page.getByText("New Document").click();
    await page.waitForFunction(() => !!(window as any).editor?.blockEditor);
  });

  afterAll(async () => {
    if (browser) await browser.close();
    if (server) await server.close();
  });

  it("leaves every document in documents/ byte-identical and evaluating identically", async () => {
    const failures: string[] = [];
    let equationsClicked = 0;

    for (const file of files) {
      const rel = path.relative(DOCUMENTS_DIR, file);
      const original = fs.readFileSync(file, "utf8");
      await page.evaluate((src) => (window as any).editor.blockEditor.setText(src), original);

      const equations = page.locator(".doc-block-equation");
      const count = await equations.count();
      for (let i = 0; i < count; i++) {
        const eq = equations.nth(i);
        await eq.scrollIntoViewIfNeeded();
        await eq.click();
        await page.waitForFunction(
          (idx) => {
            const el = document.querySelectorAll(".doc-block-equation")[idx];
            return !!el && el.classList.contains("editing") && document.activeElement?.tagName === "MATH-FIELD";
          },
          i,
          { timeout: 5000 }
        );
        await page.keyboard.press("Escape");
        await page.waitForFunction(
          (idx) => !document.querySelectorAll(".doc-block-equation")[idx]?.classList.contains("editing"),
          i,
          { timeout: 5000 }
        );
        equationsClicked++;
      }

      const after: string = await page.evaluate(() => (window as any).editor.blockEditor.getText());
      if (after !== original) {
        const a = original.split("\n");
        const b = after.split("\n");
        const diffs: string[] = [];
        for (let l = 0; l < Math.max(a.length, b.length); l++) {
          if (a[l] !== b[l]) diffs.push(`  L${l + 1}: ${JSON.stringify(a[l])} -> ${JSON.stringify(b[l])}`);
        }
        failures.push(`${rel}: ${diffs.length} lines changed after ${count} equations\n${diffs.slice(0, 3).join("\n")}`);
        continue;
      }

      const before = countErrors(original);
      const afterErrors = countErrors(after);
      if (before !== afterErrors) {
        failures.push(`${rel}: error count ${before} -> ${afterErrors}`);
      }
    }

    expect(equationsClicked).toBeGreaterThan(500);
    expect(failures).toEqual([]);
  }, 600000);

  // Documents chosen for identifiers with '_', ':'-prefixed names, d//d
  // operators, \if/\then/\else chains, \unit and \record lines.
  const EXIT_SAMPLE = [
    "homework09_structural_induction.ax",
    "physics.ax",
    "three_page_lab_report.ax",
    "derivation_export_demo.ax",
    "pendulum.ax",
  ];

  const exits: { name: string; leave: (page: Page, idx: number) => Promise<void> }[] = [
    { name: "Enter", leave: async (p) => { await p.keyboard.press("Enter"); } },
    { name: "ArrowDown", leave: async (p) => { await p.keyboard.press("ArrowDown"); } },
    {
      name: "click another block",
      leave: async (p, idx) => {
        // Click the nearest prose or heading block next to the equation.
        await p.evaluate((i) => {
          document.querySelectorAll("[data-gate-target]").forEach((el) => el.removeAttribute("data-gate-target"));
          const eq = document.querySelectorAll(".doc-block-equation")[i];
          const isText = (el: Element | null) => !!el && (el.classList.contains("doc-block-heading") || el.classList.contains("doc-block-paragraph"));
          let target: Element | null = eq.previousElementSibling;
          while (target && !isText(target)) target = target.previousElementSibling;
          if (!target) {
            target = eq.nextElementSibling;
            while (target && !isText(target)) target = target.nextElementSibling;
          }
          target?.setAttribute("data-gate-target", "1");
        }, idx);
        await p.locator("[data-gate-target]").click();
        // Close the clicked text block before the next equation is clicked. Two
        // separate defects make the next click miss otherwise: a click within a
        // few milliseconds of a text block taking focus is lost to its deferred
        // focus handling (COHESION_AUDIT.md A1), and a heading is 12px taller
        // while editing, so the layout shifts under the pointer when it closes.
        // Neither affects source identity, which is what this test measures.
        await p.waitForFunction(() => {
          const a = document.activeElement;
          return !!a && a.tagName !== "MATH-FIELD" && !!a.closest(".doc-block-heading, .doc-block-paragraph");
        });
        await p.waitForTimeout(150);
        await p.keyboard.press("Escape");
        await p.waitForFunction(() => !document.querySelector(".doc-block-heading.editing, .doc-block-paragraph.editing"));
      },
    },
  ];

  for (const exit of exits) {
    it(`leaves the source byte-identical when an unedited equation is left with ${exit.name}`, async () => {
      const failures: string[] = [];
      for (const rel of EXIT_SAMPLE) {
        const original = fs.readFileSync(path.join(DOCUMENTS_DIR, rel), "utf8");
        await page.evaluate((src) => (window as any).editor.blockEditor.setText(src), original);
        const count = await page.locator(".doc-block-equation").count();
        for (let i = 0; i < count; i++) {
          const eq = page.locator(".doc-block-equation").nth(i);
          await eq.scrollIntoViewIfNeeded();
          await eq.click();
          await page.waitForFunction(() => document.activeElement?.tagName === "MATH-FIELD", undefined, { timeout: 5000 });
          await exit.leave(page, i);
          // Enter and ArrowDown step into the next block, which may itself be an
          // equation that opens; only the equation just left must be closed.
          await page.waitForFunction(
            (idx) => !document.querySelectorAll(".doc-block-equation")[idx]?.classList.contains("editing"),
            i,
            { timeout: 5000 }
          );
        }
        const after: string = await page.evaluate(() => (window as any).editor.blockEditor.getText());
        if (after !== original) failures.push(rel);
      }
      expect(failures).toEqual([]);
    }, 300000);
  }

  it("writes a real edit to the source, and restores the original bytes when the edit is undone by hand", async () => {
    const original = ":y_pos = 3\n\nd//d:time :x = 10.0";
    await page.evaluate((src) => (window as any).editor.blockEditor.setText(src), original);

    const eq = page.locator(".doc-block-equation").first();
    await eq.click();
    await page.waitForFunction(() => document.activeElement?.tagName === "MATH-FIELD");
    await page.keyboard.press("End");
    await page.keyboard.type("4");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".doc-block-equation.editing"));
    const reverted: string = await page.evaluate(() => (window as any).editor.blockEditor.getText());
    expect(reverted).toBe(original);

    await eq.click();
    await page.waitForFunction(() => document.activeElement?.tagName === "MATH-FIELD");
    await page.keyboard.press("End");
    await page.keyboard.type("4");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".doc-block-equation.editing"));
    const edited: string = await page.evaluate(() => (window as any).editor.blockEditor.getText());
    expect(edited).not.toBe(original);
    expect(edited.split("\n")[0]).toMatch(/34$/);
  }, 60000);
});
