import { createServer } from "vite";
import { chromium } from "playwright";
import path from "path";

const repoRoot = "/Users/noahslayton/projects/axine";
const artifactDir = "/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b";

async function run() {
  console.log("Starting Vite dev server on port 5195...");
  const server = await createServer({
    configFile: path.resolve(repoRoot, "vite.config.ts"),
    server: { port: 5195 },
  });
  await server.listen();
  const port = server.httpServer.address().port;
  console.log(`Vite server running on http://localhost:${port}`);

  const browser = await chromium.launch({ headless: true });

  // -------------------------------------------------------------
  // Scenario 1: Blank Document Cursor Placement & Scrollbar Absence
  // -------------------------------------------------------------
  console.log("--- 1. Testing Blank Document Cursor Placement & Scrollbar Absence ---");
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await page.goto(`http://localhost:${port}`);
    await page.waitForFunction(() => typeof window.editor !== "undefined");
    await page.evaluate(() => document.fonts.ready);

    await page.evaluate(() => {
      window.editor.openInitialDocument("");
      window.editor.setEditorMode("block");
    });
    await page.waitForTimeout(400);

    const blockInfo = await page.evaluate(() => {
      const firstBlock = document.querySelector(".doc-block-paragraph");
      if (!firstBlock) return { found: false };
      firstBlock.click();
      const textarea = firstBlock.querySelector("textarea");
      if (textarea) {
        textarea.focus();
      }
      const cs = textarea ? window.getComputedStyle(textarea) : null;
      return {
        found: true,
        hasTextarea: !!textarea,
        overflowX: cs?.overflowX,
        overflowY: cs?.overflowY,
        resize: cs?.resize,
        scrollbarWidth: cs?.scrollbarWidth,
        height: cs?.height,
        scrollHeight: textarea?.scrollHeight,
        clientHeight: textarea?.clientHeight,
      };
    });
    console.log("Blank document block info:", blockInfo);

    // Hover mouse over the document text area right where the user cursor was
    await page.mouse.move(300, 150);
    await page.waitForTimeout(200);

    const blankDocScreenshot = path.join(artifactDir, "robustness_1_blank_document_no_scrollbar.png");
    await page.screenshot({ path: blankDocScreenshot });
    console.log(`Saved screenshot: ${blankDocScreenshot}`);

    // Scenario 2: Multi-line within the same session
    console.log("--- 2. Testing Multi-line Paragraph Wrapping & Auto-expansion ---");
    await page.evaluate(() => {
      const textarea = document.querySelector(".doc-paragraph-input");
      if (textarea) {
        textarea.value = "In classical mechanics, kinematics describes the motion of points, bodies (objects), and systems of bodies without considering the forces that cause them to move. When a particle moves in three-dimensional space, its instantaneous velocity is given by the time derivative of the position vector, and acceleration is the second time derivative. Here we demonstrate smooth, natural soft-wrapping across multiple lines with zero scrollbars or ugly horizontal overflow clipping.";
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await page.waitForTimeout(300);

    const multilineInfo = await page.evaluate(() => {
      const textarea = document.querySelector(".doc-paragraph-input");
      const cs = textarea ? window.getComputedStyle(textarea) : null;
      return {
        scrollHeight: textarea?.scrollHeight,
        clientHeight: textarea?.clientHeight,
        overflowX: cs?.overflowX,
        overflowY: cs?.overflowY,
        lines: textarea?.value.length,
      };
    });
    console.log("Multi-line textarea info:", multilineInfo);

    await page.mouse.move(400, 200);
    await page.waitForTimeout(200);

    const multilineScreenshot = path.join(artifactDir, "robustness_2_multiline_paragraph.png");
    await page.screenshot({ path: multilineScreenshot });
    console.log(`Saved screenshot: ${multilineScreenshot}`);

    await page.close();
  }

  // -------------------------------------------------------------
  // Scenario 3: Live Math Typesetting & Autocomplete Caret Popover
  // -------------------------------------------------------------
  console.log("--- 3. Testing Live Math Typesetting & Autocomplete Caret Popover ---");
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await page.goto(`http://localhost:${port}`);
    await page.waitForFunction(() => typeof window.editor !== "undefined");
    await page.evaluate(() => document.fonts.ready);

    const docText = [
      "# Hamiltonian & Harmonic Oscillator",
      "",
      "We express the total energy of the oscillator in canonical coordinates:",
      "",
      "H = p^2 / (2 * m) + (k * x^2) / 2",
      "",
      "The phase trajectory forms an ellipse with invariant area in action-angle space.",
    ].join("\n");

    await page.evaluate((text) => {
      window.editor.openInitialDocument(text);
      window.editor.setEditorMode("block");
    }, docText);
    await page.waitForTimeout(500);

    // Enter edit mode on equation block and type backslash command
    await page.evaluate(() => {
      const blocks = Array.from(document.querySelectorAll(".doc-block"));
      const eqBlock = blocks.find(b => b.classList.contains("doc-block-equation"));
      if (eqBlock) {
        eqBlock.click();
        const textarea = eqBlock.querySelector("textarea");
        if (textarea) {
          textarea.focus();
          textarea.value = "H = p^2 / (2 * m) + \\fo";
          textarea.selectionStart = textarea.value.length;
          textarea.selectionEnd = textarea.value.length;
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
    });
    await page.waitForTimeout(400);

    const popoverInfo = await page.evaluate(() => {
      const popover = document.querySelector(".doc-autocomplete-popover");
      const cs = popover ? window.getComputedStyle(popover) : null;
      const rect = popover?.getBoundingClientRect();
      const liveTypeset = document.querySelector(".doc-equation-live-typeset");
      return {
        exists: !!popover,
        display: cs?.display,
        top: rect?.top,
        left: rect?.left,
        visible: !!popover && cs?.display !== "none",
        typesetHtml: liveTypeset?.innerHTML,
      };
    });
    console.log("Equation autocomplete popover info:", popoverInfo);

    const mathScreenshot = path.join(artifactDir, "robustness_3_math_typeset_and_autocomplete.png");
    await page.screenshot({ path: mathScreenshot });
    console.log(`Saved screenshot: ${mathScreenshot}`);

    await page.close();
  }

  // -------------------------------------------------------------
  // Scenario 4: Slot Mechanism (Table & Cases)
  // -------------------------------------------------------------
  console.log("--- 4. Testing Slot Mechanism (Table & Cases) ---");
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await page.goto(`http://localhost:${port}`);
    await page.waitForFunction(() => typeof window.editor !== "undefined");
    await page.evaluate(() => document.fonts.ready);

    const docText = [
      "# Piecewise Potentials & Data",
      "",
      "\\cases(3) {",
      "  -V_0, x < 0;",
      "  0, 0 <= x <= a;",
      "  V_1, x > a",
      "}",
      "",
      "\\table(3, 3) {",
      "  1, 2.50, 9.81;",
      "  2, 5.00, 19.62;",
      "  3, 7.50, 29.43",
      "}",
    ].join("\n");

    await page.evaluate((text) => {
      window.editor.openInitialDocument(text);
      window.editor.setEditorMode("block");
    }, docText);
    await page.waitForTimeout(500);

    // Focus one slot input
    await page.evaluate(() => {
      const slotInput = document.querySelector(".doc-slot-input");
      if (slotInput) {
        slotInput.focus();
      }
    });
    await page.waitForTimeout(300);

    const slotScreenshot = path.join(artifactDir, "robustness_4_slot_blocks.png");
    await page.screenshot({ path: slotScreenshot });
    console.log(`Saved screenshot: ${slotScreenshot}`);

    // Scenario 5: Light Theme
    console.log("--- 5. Testing Light Theme ---");
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "light");
    });
    await page.waitForTimeout(300);
    const lightScreenshot = path.join(artifactDir, "robustness_5_light_theme.png");
    await page.screenshot({ path: lightScreenshot });
    console.log(`Saved screenshot: ${lightScreenshot}`);

    // Scenario 6: Dark Theme
    console.log("--- 6. Testing Dark Theme ---");
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });
    await page.waitForTimeout(300);
    const darkScreenshot = path.join(artifactDir, "robustness_6_dark_theme.png");
    await page.screenshot({ path: darkScreenshot });
    console.log(`Saved screenshot: ${darkScreenshot}`);

    await page.close();
  }

  await browser.close();
  await server.close();
  console.log("Verification finished successfully!");
}

run().catch((err) => {
  console.error("Verification script failed:", err);
  process.exit(1);
});
