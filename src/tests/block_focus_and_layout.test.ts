import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, ViteDevServer } from "vite";
import { chromium, Browser, Page } from "playwright";
import path from "path";

// Focus and layout of document blocks while editing, driven with real mouse
// and keyboard events. No pauses: each action follows the previous one as fast
// as the browser delivers events.

describe("Block focus and layout while editing", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let page: Page;
  let baseUrl = "";

  beforeAll(async () => {
    server = await createServer({
      configFile: path.resolve(__dirname, "../../vite.config.ts"),
      server: { port: 0 },
    });
    await server.listen();
    baseUrl = "http://localhost:" + (server.httpServer!.address() as any).port;
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  }, 60000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (server) await server.close();
  });

  beforeEach(async () => {
    await page.goto(baseUrl);
    await page.evaluate(() => localStorage.clear());
    await page.goto(baseUrl);
    await page.waitForFunction(() => typeof (window as any).editor !== "undefined");
    await page.getByText("New Document").click();
    await page.waitForFunction(() => !!(window as any).editor?.blockEditor);
  });

  const load = (src: string) => page.evaluate((s) => (window as any).editor.blockEditor.setText(s), src);
  const documentText = (): Promise<string> => page.evaluate(() => (window as any).editor.blockEditor.getText());

  it("puts a key typed immediately after clicking an equation into that equation", async () => {
    await load("Prose.\n:p = 1");
    await page.locator(".doc-block-equation").click();
    await page.keyboard.press("End");
    await page.keyboard.type("9");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".doc-block-equation.editing"));
    expect(await documentText()).toBe("Prose.\n:p = 19");
  });

  it("puts a key typed immediately after clicking an equation into it while a paragraph is being edited", async () => {
    await load("Prose.\n:p = 1\nMore prose.");
    await page.locator(".doc-block-paragraph").first().click();
    await page.locator(".doc-block-equation").click();
    await page.keyboard.press("End");
    await page.keyboard.type("9");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".doc-block-equation.editing"));
    expect(await documentText()).toBe("Prose.\n:p = 19\nMore prose.");
    // The paragraph left behind did not take focus back.
    expect(await page.evaluate(() => document.activeElement?.closest(".doc-block-paragraph"))).toBeNull();
  });

  it("keeps keys typed into an equation when another equation is clicked before the first took focus", async () => {
    await load(":y_pos = 3\n:w = 2");
    await page.locator(".doc-block-equation").nth(0).click();
    await page.keyboard.press("End");
    await page.keyboard.type(" + :z_1");
    await page.locator(".doc-block-equation").nth(1).click();
    await page.keyboard.press("End");
    await page.keyboard.type(" / 4");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector(".doc-block-equation.editing"));
    expect(await documentText()).toBe(":y_pos = 3 + :z_1\n:w = 2 / 4");
  });

  it("opens the equation clicked right after a heading, not a neighbour", async () => {
    await load("## Section\n:a = 1\n:b = 2");
    const target = page.locator(".doc-block-equation").nth(0);
    const targetId = await target.getAttribute("data-block-id");
    await page.locator(".doc-block-heading").click();
    await target.click();
    await page.waitForFunction(() => document.activeElement?.tagName === "MATH-FIELD");
    const openId = await page.evaluate(() => (document.activeElement as HTMLElement).closest<HTMLElement>("[data-block-id]")?.dataset.blockId);
    expect(openId).toBe(targetId);
  });

  it("keeps a heading the same height while it is edited, at every level", async () => {
    await load("# One\n## Two\n### Three\nProse.");
    for (let i = 0; i < 3; i++) {
      const heading = page.locator(".doc-block-heading").nth(i);
      const idle = (await heading.boundingBox())!.height;
      await heading.click();
      await page.waitForFunction((idx) => document.querySelectorAll(".doc-block-heading")[idx].classList.contains("editing"), i);
      const editing = (await heading.boundingBox())!.height;
      await page.keyboard.press("Escape");
      expect(editing).toBeCloseTo(idle, 1);
    }
  });

  it("marks a paragraph as editing exactly while it is edited", async () => {
    await load("Prose one.\n\nProse two.");
    const paragraph = page.locator(".doc-block-paragraph").first();
    expect(await paragraph.evaluate((el) => el.classList.contains("editing"))).toBe(false);
    await paragraph.click();
    expect(await paragraph.evaluate((el) => el.classList.contains("editing"))).toBe(true);
    await page.keyboard.press("Escape");
    expect(await paragraph.evaluate((el) => el.classList.contains("editing"))).toBe(false);
  });
});
