import { createServer } from "vite";
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifactDir = "/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b";

async function main() {
  const server = await createServer({
    configFile: path.resolve(__dirname, "../vite.config.ts"),
    server: { port: 0 },
  });
  await server.listen();
  const port = server.httpServer.address().port;
  console.log("Vite server running on port " + port);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // 1. Gutter virtualization at 3 scroll positions
  await page.goto("http://localhost:" + port);
  await page.waitForFunction(() => typeof window.editor !== "undefined");

  const lines = [];
  for (let i = 0; i < 400; i++) {
    if (i % 25 === 0) {
      lines.push("{\\axis x, y; x^2 + y^2 = " + (i + 1) + "}");
    } else {
      lines.push(":val_" + i + " = " + i + " + 10");
    }
  }
  const docText = lines.join("\n");

  await page.evaluate(({ text }) => {
    const ed = window.editor;
    ed.openInitialDocument(text);
    const pc = ed.paneContainer;
    const rootLeafId = pc.getLayout().root.id;
    pc.split(rootLeafId, "horizontal", "after", {
      id: "tab_results_virt",
      type: "results",
      title: "Virtualization Results",
    });
    pc.render();
  }, { text: docText });

  await page.waitForFunction(() => !window.editor.state.getIsEvaluating(), { timeout: 15000 });

  // Pos 1: Top
  await page.evaluate(() => {
    const ta = document.querySelector("#doc-textarea");
    ta.scrollTop = 0;
    ta.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_scroll_pos1_top.png") });
  console.log("Captured pos1_top");

  // Pos 2: Middle
  await page.evaluate(() => {
    const ta = document.querySelector("#doc-textarea");
    ta.scrollTop = 3000;
    ta.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_scroll_pos2_mid.png") });
  console.log("Captured pos2_mid");

  // Pos 3: Bottom
  await page.evaluate(() => {
    const ta = document.querySelector("#doc-textarea");
    ta.scrollTop = 6500;
    ta.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_scroll_pos3_bottom.png") });
  console.log("Captured pos3_bottom");

  // 2. 5,000-line caret alignment mid-document
  await page.goto("http://localhost:" + port);
  await page.waitForFunction(() => typeof window.editor !== "undefined");

  const bigLines = [];
  for (let i = 0; i < 5000; i++) {
    bigLines.push(":var_" + i + " = " + (i * 2));
  }
  await page.evaluate(({ text }) => {
    window.editor.openInitialDocument(text);
  }, { text: bigLines.join("\n") });

  await page.waitForFunction(() => !window.editor.state.getIsEvaluating(), { timeout: 15000 });

  await page.evaluate(() => {
    window.editor.jumpToLine(2500);
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_caret_alignment_scrolled.png") });
  console.log("Captured caret_alignment_scrolled");

  // 3. Loose file opened in editor with synthetic workspace & tab
  await page.goto("http://localhost:" + port);
  await page.waitForFunction(() => typeof window.editor !== "undefined");

  await page.evaluate(async () => {
    const looseContent = "# Kepler Planetary Orbit Model\n\\module :kepler\n:G = 6.674e-11\n:M_sun = 1.989e30\n:mu = :G * :M_sun\n:a_earth = 1.496e11\n:T = 2 * 3.14159 * (:a_earth^3 / :mu)^(1/2)\n{\\axis x, y; x^2 + y^2 = 1}\n";
    const mockFile = {
      name: "kepler_orbit.ax",
      lastModified: Date.now(),
      text: async () => looseContent,
    };
    const mockHandle = {
      name: "kepler_orbit.ax",
      getFile: async () => mockFile,
      createWritable: async () => ({
        write: async () => {},
        close: async () => {},
      }),
    };
    window.showOpenFilePicker = async () => [mockHandle];

    const ed = window.editor;
    await ed.openDocument();
    const pc = ed.paneContainer;
    const rootLeafId = pc.getLayout().root.id;
    pc.split(rootLeafId, "horizontal", "after", {
      id: "tab_results_kepler",
      type: "results",
      title: "Kepler Results",
    });
    pc.render();
  });

  await page.waitForFunction(() => !window.editor.state.getIsEvaluating(), { timeout: 15000 });
  await page.screenshot({ path: path.join(artifactDir, "screenshot_loose_file_opened.png") });
  console.log("Captured loose_file_opened");

  await browser.close();
  await server.close();
  console.log("All screenshots captured successfully!");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
