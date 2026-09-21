import { createServer } from "vite";
import { chromium } from "playwright";
import path from "path";

const repoRoot = "/Users/noahslayton/projects/axine";
const artifactDir = "/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b";

async function run() {
  console.log("Starting Vite server on port 5198...");
  const server = await createServer({
    configFile: path.resolve(repoRoot, "vite.config.ts"),
    server: { port: 5198 },
  });
  await server.listen();
  const port = server.httpServer.address().port;
  console.log(`Vite server running at http://localhost:${port}`);

  const browser = await chromium.launch({ headless: true });

  // -------------------------------------------------------------------
  // 1. Autocomplete Dropdown Navigation & Cosine Similarity for Data Structures
  // -------------------------------------------------------------------
  console.log("\n=== 1. Testing Autocomplete Dropdown with Cosine-Sorted Data Structures ===");
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await page.goto(`http://localhost:${port}`);
    await page.waitForFunction(() => typeof window.editor !== "undefined");
    await page.evaluate(() => document.fonts.ready);

    const docText = [
      "# Autocomplete Navigation Test",
      "",
      "We begin our derivation by typing a command:",
      "",
      "x = 5",
    ].join("\n");

    await page.evaluate((text) => {
      window.editor.openInitialDocument(text);
      window.editor.setEditorMode("block");
    }, docText);
    await page.waitForTimeout(400);

    // Click on the paragraph block and type `\foo`
    await page.evaluate(() => {
      const blocks = Array.from(document.querySelectorAll(".doc-block"));
      const pBlock = blocks.find(b => b.classList.contains("doc-block-paragraph") && b.textContent.includes("We begin"));
      if (!pBlock) throw new Error("Paragraph block not found");
      pBlock.click();
      const textarea = pBlock.querySelector("textarea");
      if (textarea) {
        textarea.focus();
        textarea.value = "Here we test data structure matching: \\foo";
        textarea.selectionStart = textarea.value.length;
        textarea.selectionEnd = textarea.value.length;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    await page.waitForTimeout(400);

    // Inspect the popover
    const popoverData = await page.evaluate(() => {
      const popover = document.querySelector(".doc-autocomplete-popover:not(.hidden)");
      if (!popover) return { exists: false, items: [] };
      const items = Array.from(popover.querySelectorAll(".doc-autocomplete-item"));
      return {
        exists: true,
        display: window.getComputedStyle(popover).display,
        itemCount: items.length,
        items: items.map((el) => ({
          cmd: el.querySelector(".doc-autocomplete-cmd")?.textContent?.trim(),
          badge: el.querySelector(".doc-autocomplete-badge")?.textContent?.trim(),
          hasDsBadge: el.querySelector(".doc-autocomplete-badge-ds") !== null,
          isActive: el.classList.contains("active"),
        })),
      };
    });

    console.log(`Popover detected with ${popoverData.itemCount} items.`);
    const dsItems = popoverData.items.filter(i => i.hasDsBadge);
    console.log(`Found ${dsItems.length} data structure suggestions.`);
    console.log("First 8 items:", popoverData.items.slice(0, 8));

    const popoverScreenshot = path.join(artifactDir, "cosine_autocomplete_dropdown.png");
    await page.screenshot({ path: popoverScreenshot });
    console.log(`Saved screenshot: ${popoverScreenshot}`);

    // Now test navigating down 7 items via keyboard
    console.log("Navigating down with ArrowDown...");
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press("ArrowDown");
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(200);

    const activeItemAfterNav = await page.evaluate(() => {
      const active = document.querySelector(".doc-autocomplete-item.active");
      const popover = document.querySelector(".doc-autocomplete-popover");
      return {
        cmd: active?.querySelector(".doc-autocomplete-cmd")?.textContent?.trim(),
        badge: active?.querySelector(".doc-autocomplete-badge")?.textContent?.trim(),
        scrollTop: popover?.scrollTop,
      };
    });
    console.log("Active item after 7 ArrowDowns:", activeItemAfterNav);

    const popoverScrolledScreenshot = path.join(artifactDir, "cosine_autocomplete_scrolled.png");
    await page.screenshot({ path: popoverScrolledScreenshot });
    console.log(`Saved screenshot: ${popoverScrolledScreenshot}`);

    await page.close();
  }

  // -------------------------------------------------------------------
  // 2. Expanding Left Curly Brace for \\cases (Static & Editing)
  // -------------------------------------------------------------------
  console.log("\n=== 2. Testing Expanding Left Curly Brace for \\cases ===");
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await page.goto(`http://localhost:${port}`);
    await page.waitForFunction(() => typeof window.editor !== "undefined");
    await page.evaluate(() => document.fonts.ready);

    const casesDoc = [
      "# Piecewise Conditional Constructs",
      "",
      "A two-branch piecewise definition:",
      "",
      "\\cases(2) {",
      "  -x^2 + 4, x < 0;",
      "  x^2 + 4, x >= 0",
      "}",
      "",
      "A three-branch piecewise definition:",
      "",
      "\\cases(3) {",
      "  -\\frac{1}{2} * m * \\omega^2 * x^2, x < -a;",
      "  0, -a <= x <= a;",
      "  V_0 * \\exp(-k * x), x > a",
      "}",
    ].join("\n");

    await page.evaluate((text) => {
      window.editor.openInitialDocument(text);
      window.editor.setEditorMode("block");
    }, casesDoc);
    await page.waitForTimeout(500);

    // Measure brace heights vs branch heights in static mode
    const staticBraceMeasurements = await page.evaluate(() => {
      const wrappers = Array.from(document.querySelectorAll(".doc-slot-cases-wrapper"));
      return wrappers.map((w, idx) => {
        const brace = w.querySelector(".doc-cases-brace");
        const svg = brace?.querySelector(".doc-cases-brace-svg");
        const branches = w.querySelector(".doc-cases-branches");
        const braceRect = brace?.getBoundingClientRect();
        const svgRect = svg?.getBoundingClientRect();
        const branchesRect = branches?.getBoundingClientRect();
        return {
          index: idx,
          braceHeight: braceRect?.height,
          svgHeight: svgRect?.height,
          branchesHeight: branchesRect?.height,
          heightRatio: (svgRect?.height || 0) / (branchesRect?.height || 1),
        };
      });
    });

    console.log("Static Cases Brace Measurements:", staticBraceMeasurements);

    const casesStaticScreenshot = path.join(artifactDir, "cases_static_brace_expansion.png");
    await page.screenshot({ path: casesStaticScreenshot });
    console.log(`Saved screenshot: ${casesStaticScreenshot}`);

    // Enter edit mode on the 3-branch cases block
    console.log("Entering edit mode on 3-branch cases block...");
    await page.evaluate(() => {
      const blocks = Array.from(document.querySelectorAll(".doc-block"));
      const cases3Block = blocks.find(b => b.classList.contains("doc-block-slot") && b.textContent.includes("omega"));
      if (!cases3Block) throw new Error("3-branch cases block not found");
      cases3Block.click();
    });
    await page.waitForTimeout(400);

    const editBraceMeasurements = await page.evaluate(() => {
      const wrapper = document.querySelector(".doc-slot-cases-wrapper.editing");
      if (!wrapper) return null;
      const brace = wrapper.querySelector(".doc-cases-scaffold-brace");
      const svg = brace?.querySelector(".doc-cases-brace-svg");
      const branches = wrapper.querySelector(".doc-cases-scaffold-branches");
      const braceRect = brace?.getBoundingClientRect();
      const svgRect = svg?.getBoundingClientRect();
      const branchesRect = branches?.getBoundingClientRect();
      return {
        braceHeight: braceRect?.height,
        svgHeight: svgRect?.height,
        branchesHeight: branchesRect?.height,
        heightRatio: (svgRect?.height || 0) / (branchesRect?.height || 1),
      };
    });

    console.log("Edit Mode 3-Branch Cases Brace Measurements:", editBraceMeasurements);

    const cases3EditScreenshot = path.join(artifactDir, "cases_3branch_editing_brace_expansion.png");
    await page.screenshot({ path: cases3EditScreenshot });
    console.log(`Saved screenshot: ${cases3EditScreenshot}`);

    await page.close();
  }

  await browser.close();
  await server.close();
  console.log("\nAll browser verifications completed successfully!");
}

run().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
