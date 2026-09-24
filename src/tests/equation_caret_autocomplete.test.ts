import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, ViteDevServer } from "vite";
import { chromium, Browser, Page } from "playwright";
import path from "path";

// An equation with Axine commands MathLive does not know. Typing a character
// and deleting it, wherever the caret is, must not open the command list, and
// Escape must then leave the equation with its source unchanged.

const SOURCE = "\\forall s, :str_empty(s) = (\\card(s) = 0)";

describe("Equation caret and the command list", () => {
  let server: ViteDevServer;
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    server = await createServer({
      configFile: path.resolve(__dirname, "../../vite.config.ts"),
      server: { port: 0 },
    });
    await server.listen();
    const baseUrl = "http://localhost:" + (server.httpServer!.address() as any).port;
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(baseUrl);
    await page.evaluate(() => localStorage.clear());
    await page.goto(baseUrl);
    await page.waitForFunction(() => typeof (window as any).editor !== "undefined");
    await page.getByText("New Document").click();
    await page.waitForFunction(() => !!(window as any).editor?.blockEditor);
  }, 60000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (server) await server.close();
  });

  async function openEquation(): Promise<{ id: string; lastOffset: number }> {
    await page.evaluate((s) => (window as any).editor.blockEditor.setText(s), SOURCE);
    const id = await page.evaluate(() => document.querySelector<HTMLElement>(".doc-block-equation")!.dataset.blockId!);
    await page.locator(`[data-block-id="${id}"]`).click();
    await page.waitForFunction(() => document.activeElement?.tagName === "MATH-FIELD");
    const lastOffset = await page.evaluate(() => (document.activeElement as any).lastOffset as number);
    return { id, lastOffset };
  }

  const listOpen = () => page.evaluate(() => !!document.querySelector(".doc-autocomplete-popover:not(.hidden)"));
  const editing = (id: string) =>
    page.evaluate((b) => document.querySelector(`[data-block-id="${b}"]`)!.classList.contains("editing"), id);

  it("opens no command list for a character typed and deleted at any caret position, and Escape closes the equation", async () => {
    const { lastOffset } = await openEquation();
    await page.keyboard.press("Escape");
    const failures: string[] = [];

    // A digit never extends a command. A "q" typed anywhere in this source
    // does not complete one either: no command is spelled by the text before
    // the caret plus "q". The list opening means the caret was read at the
    // wrong place in the text.
    for (const [position, key] of Array.from({ length: lastOffset + 1 }, (_, p) => p).flatMap((p) => [[p, "7"], [p, "q"]] as [number, string][])) {
      const { id } = await openEquation();
      await page.evaluate((p) => { (document.activeElement as any).position = p; }, position);
      await page.keyboard.type(key);
      if (await listOpen()) failures.push(`position ${position}: list open after typing ${key}`);
      await page.keyboard.press("Backspace");
      if (await listOpen()) failures.push(`position ${position}: list open after Backspace`);
      await page.keyboard.press("Escape");
      if (await editing(id)) {
        failures.push(`position ${position}: still editing after Escape`);
        await page.keyboard.press("Escape");
      }
      const text = await page.evaluate(() => (window as any).editor.blockEditor.getText());
      if (text !== SOURCE) failures.push(`position ${position}: source became ${JSON.stringify(text)}`);
    }

    expect(lastOffset).toBeGreaterThan(10);
    expect(failures).toEqual([]);
  }, 120000);

  it("leaves the equation on Escape while a command is being typed", async () => {
    // Typing \ puts MathLive in its LaTeX mode; Escape still leaves the equation.
    const { id } = await openEquation();
    await page.keyboard.press("End");
    await page.keyboard.type(" \\ca");
    expect(await page.evaluate(() => (document.activeElement as any).mode)).toBe("latex");
    await page.keyboard.press("Escape");
    expect(await editing(id)).toBe(false);
  });
});
