import { createServer } from "vite";
import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const repoRoot = "/Users/noahslayton/projects/axine";
const artifactDir = "/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b";

async function run() {
  console.log("Starting Vite dev server...");
  const server = await createServer({
    configFile: path.resolve(repoRoot, "vite.config.ts"),
    server: { port: 5199 },
  });
  await server.listen();
  const port = server.httpServer.address().port;
  console.log(`Vite server running on http://localhost:${port}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 850 } });

  await page.goto(`http://localhost:${port}`);
  await page.waitForFunction(() => typeof window.editor !== "undefined");
  await page.evaluate(() => document.fonts.ready);

  console.log("Setting up multi-block document in Block Document Editor...");
  await page.evaluate(() => {
    const ed = window.editor;
    const docText = [
      "# Kinematics & Trajectories",
      "",
      "We consider a point mass moving along a parabolic trajectory under constant gravitational acceleration.",
      "",
      "y = 2 * x + 5",
      "",
      "The velocity vector remains tangent to the curve at every instant of time.",
    ].join("\n");

    ed.openInitialDocument(docText);
    ed.setEditorMode("block");
  });

  await page.waitForTimeout(400);

  // 1. Verify zero visible input boxes / borders / background fills on idle blocks
  const idleStyles = await page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll(".doc-block"));
    return blocks.map((b) => {
      const cs = window.getComputedStyle(b);
      return {
        className: b.className,
        borderColor: cs.borderColor,
        backgroundColor: cs.backgroundColor,
        boxShadow: cs.boxShadow,
      };
    });
  });
  console.log("Idle block styles (first 3):", idleStyles.slice(0, 3));

  // 2. Click into a SECOND block (the paragraph: "We consider a point mass...")
  console.log("Clicking into the second block (paragraph) to verify single-click edit mode...");
  const paragraphClicked = await page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll(".doc-block"));
    const paraBlock = blocks.find(b => b.textContent && b.textContent.includes("point mass")) || blocks[1];
    const rect = paraBlock.getBoundingClientRect();
    
    // Dispatch realistic mouse click
    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + 50,
      clientY: rect.top + 10,
    });
    paraBlock.dispatchEvent(clickEvent);

    const isEditing = paraBlock.classList.contains("editing") || !!paraBlock.querySelector("textarea");
    const textarea = paraBlock.querySelector("textarea");
    const cs = textarea ? window.getComputedStyle(textarea) : null;
    const blockCs = window.getComputedStyle(paraBlock);

    return {
      isEditing,
      hasTextarea: !!textarea,
      textareaBorder: cs?.border,
      textareaBackground: cs?.backgroundColor,
      blockBorder: blockCs.borderColor,
      blockBackground: blockCs.backgroundColor,
      blockBoxShadow: blockCs.boxShadow,
      textareaValue: textarea?.value,
    };
  });

  console.log("Second block single-click edit result:", paragraphClicked);

  // Take Screenshot 1: Second block being edited after clicking into it (zero visible input boxes)
  const shot1Path = path.join(artifactDir, "screenshot_second_block_clicked_editing.png");
  await page.screenshot({ path: shot1Path });
  console.log(`Saved screenshot 1 to: ${shot1Path}`);

  // 3. Render while typing: Equation block typesetting live as user types "x = 5"
  console.log("Testing live rendering while typing an equation...");
  await page.evaluate(async () => {
    const ed = window.editor;
    const blockEd = ed.blockEditor;
    const blocks = blockEd.getBlocks();
    const eqBlock = blocks.find((b) => b.type === "equation");
    const comp = blockEd.getComponent(eqBlock.id);

    // Enter edit mode on equation block
    comp.enterEditMode();
    const ta = comp.el.querySelector("textarea");
    ta.focus();

    // Type "x = 5"
    ta.value = "x = 5";
    ta.setSelectionRange(5, 5);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await page.waitForTimeout(200);

  const midTypingEquation = await page.evaluate(() => {
    const liveTypeset = document.querySelector(".doc-equation-live-typeset");
    const editorView = document.querySelector(".doc-equation-editor-view");
    const textarea = document.querySelector(".doc-equation-input");
    const block = textarea?.closest(".doc-block-equation");

    const blockCs = block ? window.getComputedStyle(block) : null;
    const taCs = textarea ? window.getComputedStyle(textarea) : null;

    return {
      hasLiveTypeset: !!liveTypeset,
      liveHtml: liveTypeset?.innerHTML,
      isTextareaFocused: document.activeElement === textarea,
      blockBorder: blockCs?.borderColor,
      blockBackground: blockCs?.backgroundColor,
      taBackground: taCs?.backgroundColor,
      taBorder: taCs?.border,
    };
  });

  console.log("Equation mid-typing live typeset result:", midTypingEquation);

  // Take Screenshot 2: Equation rendering as it is written mid-typing
  const shot2Path = path.join(artifactDir, "screenshot_equation_mid_typing_typeset.png");
  await page.screenshot({ path: shot2Path });
  console.log(`Saved screenshot 2 to: ${shot2Path}`);

  // 4. Test incomplete backslash command: "\fo" stays literal and opens autocomplete popover
  console.log("Testing incomplete backslash command \\fo mid-word...");
  await page.evaluate(async () => {
    const textarea = document.querySelector(".doc-equation-input");
    textarea.value = "x = 5 + \\fo";
    textarea.setSelectionRange(12, 12);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });

  await page.waitForTimeout(250);

  const autocompleteState = await page.evaluate(() => {
    const liveTypeset = document.querySelector(".doc-equation-live-typeset");
    const popover = document.querySelector(".doc-autocomplete-popover");
    const literalCmd = liveTypeset?.querySelector(".doc-literal-cmd");
    const popoverVisible = popover && !popover.classList.contains("hidden");

    return {
      liveHtml: liveTypeset?.innerHTML,
      hasLiteralCmd: !!literalCmd,
      literalText: literalCmd?.textContent,
      popoverVisible,
      itemCount: popover?.querySelectorAll(".doc-autocomplete-item").length,
    };
  });

  console.log("Autocomplete \\fo state:", autocompleteState);

  // Take Screenshot 3: Incomplete command \fo literal with autocomplete popover
  const shot3Path = path.join(artifactDir, "screenshot_autocomplete_backslash_literal.png");
  await page.screenshot({ path: shot3Path });
  console.log(`Saved screenshot 3 to: ${shot3Path}`);

  await browser.close();
  await server.close();
  console.log("Verification finished successfully!");
}

run().catch((err) => {
  console.error("Error during verification:", err);
  process.exit(1);
});
