import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, ViteDevServer } from "vite";
import { chromium, Browser, Page } from "playwright";
import fs from "fs";
import path from "path";
import { processDocumentLines } from "../core/worker";
import { Evaluator } from "../core/evaluator";

// Gate: the equation surface never changes source text a person did not
// change. Every equation block in every documents/*.ax file is opened with a
// real mouse click in Chromium and closed again, with and without a neutral
// edit, and the document text read back from the running editor is compared
// byte for byte with the file on disk. Edits that should change the source
// must produce exactly the characters typed.

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

function lineDiff(original: string, after: string): string[] {
  const a = original.split("\n");
  const b = after.split("\n");
  const diffs: string[] = [];
  for (let l = 0; l < Math.max(a.length, b.length); l++) {
    if (a[l] !== b[l]) diffs.push(`  L${l + 1}: ${JSON.stringify(a[l])} -> ${JSON.stringify(b[l])}`);
  }
  return diffs;
}

type Surface = { surface: "math" | "text"; reason: string };

async function equationIds(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>(".doc-block-equation")).map((el) => el.dataset.blockId!)
  );
}

// Clicks the block and waits until its editing surface has focus.
async function openBlock(page: Page, id: string): Promise<Surface> {
  const block = page.locator(`[data-block-id="${id}"]`);
  await block.scrollIntoViewIfNeeded();
  await block.click();
  const handle = await page.waitForFunction(
    (blockId) => {
      const el = document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
      const a = document.activeElement;
      if (!el || !a || !el.contains(a)) return null;
      if (a.tagName === "MATH-FIELD") return { surface: "math", reason: "" };
      if (a.tagName === "TEXTAREA") return { surface: "text", reason: el.dataset.textEditReason ?? "" };
      return null;
    },
    id,
    { timeout: 5000 }
  );
  return (await handle.jsonValue()) as Surface;
}

async function waitClosed(page: Page, id: string): Promise<void> {
  await page.waitForFunction(
    (blockId) => !document.querySelector(`[data-block-id="${blockId}"]`)?.classList.contains("editing"),
    id,
    { timeout: 5000 }
  );
}

describe("Equation source identity", () => {
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

  async function loadDocument(src: string): Promise<void> {
    await page.evaluate((s) => (window as any).editor.blockEditor.setText(s), src);
  }

  async function documentText(): Promise<string> {
    return page.evaluate(() => (window as any).editor.blockEditor.getText());
  }

  it("leaves every document in documents/ byte-identical and evaluating identically after click + Escape", async () => {
    const failures: string[] = [];
    let opened = 0;

    for (const file of files) {
      const rel = path.relative(DOCUMENTS_DIR, file);
      const original = fs.readFileSync(file, "utf8");
      await loadDocument(original);
      for (const id of await equationIds(page)) {
        await openBlock(page, id);
        await page.keyboard.press("Escape");
        await waitClosed(page, id);
        opened++;
      }
      const after = await documentText();
      if (after !== original) {
        const diffs = lineDiff(original, after);
        failures.push(`${rel}: ${diffs.length} lines changed\n${diffs.slice(0, 3).join("\n")}`);
        continue;
      }
      const before = countErrors(original);
      const afterErrors = countErrors(after);
      if (before !== afterErrors) failures.push(`${rel}: error count ${before} -> ${afterErrors}`);
    }

    expect(opened).toBeGreaterThan(500);
    expect(failures).toEqual([]);
  }, 900000);

  it("leaves every equation byte-identical after a character is typed and deleted", async () => {
    const failures: string[] = [];
    const textSurfaces: string[] = [];
    let edited = 0;

    for (const file of files) {
      const rel = path.relative(DOCUMENTS_DIR, file);
      const original = fs.readFileSync(file, "utf8");
      await loadDocument(original);
      for (const id of await equationIds(page)) {
        const surface = await openBlock(page, id);
        if (surface.surface === "text") {
          const firstLine = (await page.locator(`[data-block-id="${id}"] textarea`).inputValue()).split("\n")[0];
          textSurfaces.push(`${rel} (${surface.reason}): ${firstLine.slice(0, 50)}`);
        }
        await page.keyboard.type("7");
        await page.keyboard.press("Backspace");
        await page.keyboard.press("Escape");
        await waitClosed(page, id);
        edited++;
      }
      const after = await documentText();
      if (after !== original) {
        const diffs = lineDiff(original, after);
        failures.push(`${rel}: ${diffs.length} lines changed\n${diffs.slice(0, 3).join("\n")}`);
      }
    }

    console.log(`[typed-and-deleted] ${edited} equations; ${textSurfaces.length} edited as text:\n  ${textSurfaces.join("\n  ")}`);
    expect(edited).toBeGreaterThan(500);
    expect(failures).toEqual([]);
    // Only multi-line equation blocks may fall back to text editing; a
    // single-line equation on the text surface means the bridge lost a construct.
    expect(textSurfaces.filter((t) => !t.includes("spans more than one line"))).toEqual([]);
  }, 900000);

  // Each case: starting source, keys pressed after clicking into the equation,
  // and the exact source a person pressing those keys has written.
  const EDITS: { name: string; source: string; keys: string[]; expected: string }[] = [
    { name: "append a digit", source: ":y_pos = 3", keys: ["End", "4"], expected: ":y_pos = 34" },
    {
      name: "change an operator",
      source: ":total = :a + :b",
      keys: ["End", "ArrowLeft", "ArrowLeft", "ArrowLeft", "Backspace", "-"],
      expected: ":total = :a - :b",
    },
    { name: "add a term", source: "d//d:time :x = 10.0", keys: ["End", " + :v_0"], expected: "d//d:time :x = 10.0 + :v_0" },
    { name: "add a term after an exponent", source: "\\forall x, :sq(x) = x^2", keys: ["End", " + 1"], expected: "\\forall x, :sq(x) = x^2 + 1" },
    { name: "type a division", source: ":half = 1", keys: ["End", " / 2"], expected: ":half = 1 / 2" },
    { name: "type a multiplication", source: ":area = :r", keys: ["End", " * :r"], expected: ":area = :r * :r" },
    { name: "type a command", source: ":s = 1", keys: ["End", " \\in S"], expected: ":s = 1 \\in S" },
    { name: "extend primes", source: "y'' + 4*y' = 0", keys: ["End", " + y"], expected: "y'' + 4*y' = 0 + y" },
  ];

  for (const edit of EDITS) {
    it(`writes exactly what was typed: ${edit.name}`, async () => {
      await loadDocument(edit.source);
      const [id] = await equationIds(page);
      const surface = await openBlock(page, id);
      expect(surface.surface).toBe("math");
      for (const k of edit.keys) {
        if (/^[A-Z][A-Za-z]+$/.test(k)) await page.keyboard.press(k);
        else await page.keyboard.type(k);
      }
      await page.keyboard.press("Escape");
      await waitClosed(page, id);
      expect(await documentText()).toBe(edit.expected);
    }, 60000);
  }

  it("keeps every line when a multi-line prose block is edited so it starts with a heading marker", async () => {
    const original = "Intro.\n\n#first line\nsecond line\nthird line";
    await loadDocument(original);
    const block = page.locator(".doc-block-paragraph", { hasText: "first line" });
    expect(await block.count()).toBe(1);
    await block.click();
    await page.waitForFunction(() => document.activeElement?.tagName === "TEXTAREA");
    // Put the caret after "#" and type a space: the text now starts with "# ".
    await page.evaluate(() => (document.activeElement as HTMLTextAreaElement).setSelectionRange(1, 1));
    await page.keyboard.type(" ");
    await page.keyboard.press("Escape");
    expect(await documentText()).toBe("Intro.\n\n# first line\nsecond line\nthird line");
  }, 60000);

  it("restores the original bytes when an edit is undone by hand", async () => {
    const original = ":y_pos = 3\n\nd//d:time :x = 10.0";
    await loadDocument(original);
    const [id] = await equationIds(page);
    await openBlock(page, id);
    await page.keyboard.press("End");
    await page.keyboard.type("4");
    await page.keyboard.press("Backspace");
    await page.keyboard.press("Escape");
    await waitClosed(page, id);
    expect(await documentText()).toBe(original);
  }, 60000);

  // Documents chosen for identifiers with '_', ':'-prefixed names, d//d
  // operators, \if/\then/\else chains, \unit and \record lines.
  const EXIT_SAMPLE = [
    "homework09_structural_induction.ax",
    "physics.ax",
    "three_page_lab_report.ax",
    "derivation_export_demo.ax",
    "pendulum.ax",
  ];

  // Enter and ArrowDown leave a MathLive field. In a multi-line equation on the
  // text surface they add and move between lines instead; those blocks are
  // covered by the Escape and click cases.
  const exits: { name: string; mathOnly: boolean; leave: (id: string) => Promise<void> }[] = [
    { name: "Enter", mathOnly: true, leave: async () => page.keyboard.press("Enter") },
    { name: "ArrowDown", mathOnly: true, leave: async () => page.keyboard.press("ArrowDown") },
    {
      name: "click another block",
      mathOnly: false,
      leave: async (id) => {
        // Click the nearest prose or heading block next to the equation.
        const targetId = await page.evaluate((blockId) => {
          const eq = document.querySelector(`[data-block-id="${blockId}"]`)!;
          const isText = (el: Element | null) =>
            !!el && (el.classList.contains("doc-block-heading") || el.classList.contains("doc-block-paragraph"));
          let t: Element | null = eq.previousElementSibling;
          while (t && !isText(t)) t = t.previousElementSibling;
          if (!t) {
            t = eq.nextElementSibling;
            while (t && !isText(t)) t = t.nextElementSibling;
          }
          return (t as HTMLElement | null)?.dataset.blockId ?? null;
        }, id);
        if (!targetId) return;
        // The next equation is clicked immediately, while this text block is
        // still being edited.
        await page.locator(`[data-block-id="${targetId}"]`).click();
      },
    },
  ];

  for (const exit of exits) {
    it(`leaves the source byte-identical when an unedited equation is left with ${exit.name}`, async () => {
      const failures: string[] = [];
      for (const rel of EXIT_SAMPLE) {
        const original = fs.readFileSync(path.join(DOCUMENTS_DIR, rel), "utf8");
        await loadDocument(original);
        for (const id of await equationIds(page)) {
          const surface = await openBlock(page, id);
          if (exit.mathOnly && surface.surface !== "math") {
            await page.keyboard.press("Escape");
          } else {
            await exit.leave(id);
          }
          await waitClosed(page, id);
        }
        if ((await documentText()) !== original) failures.push(rel);
      }
      expect(failures).toEqual([]);
    }, 300000);
  }
});
