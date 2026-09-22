import { createServer } from "vite";
import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const artifactDir = "/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b";

async function run() {
  console.log("Starting Vite dev server...");
  const server = await createServer({
    configFile: path.resolve(__dirname, "../vite.config.ts"),
    server: { port: 5188 },
  });
  await server.listen();
  console.log("Vite server listening on port 5188");

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    await page.goto("http://localhost:5188");

    // Check for welcome screen and click New Document
    const welcomeBtn = await page.$("#welcome-new-doc-btn");
    if (welcomeBtn) {
      console.log("Clicking New Document on welcome screen...");
      await welcomeBtn.click();
    }

    await page.waitForSelector(".doc-block-editor");
    await page.waitForTimeout(200);

    console.log("1. Single-click top line to type problem title...");
    const firstBlock = await page.waitForSelector(".doc-block");
    await firstBlock.click();
    await page.waitForTimeout(150);

    // Type problem heading
    await page.keyboard.type("# Differential Equations: Assignment 3");
    await page.waitForTimeout(200);

    // Enter to step to next block
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);

    console.log("2. Type prose problem description...");
    await page.keyboard.type("Solve the second-order linear initial value problem:");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);

    // Save screenshot 1: Title and problem description
    await page.screenshot({ path: path.join(artifactDir, "ode_step1_title_and_problem.png") });
    console.log("Saved ode_step1_title_and_problem.png");

    console.log("3. Type ODE into equation block using primes...");
    await page.keyboard.type("y\x27\x27 + 4y\x27 + 13y = ");
    await page.waitForTimeout(150);
    await page.keyboard.type("0");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);

    // Click back into equation block to demonstrate single-click editing in MathLive
    const eqBlock = await page.$(".doc-block-equation");
    if (eqBlock) {
      await eqBlock.click();
      await page.waitForTimeout(200);
    }
    await page.screenshot({ path: path.join(artifactDir, "ode_step2_ode_mathfield_editing.png") });
    console.log("Saved ode_step2_ode_mathfield_editing.png");

    // Arrow down across the seam into the next block
    console.log("4. Arrow down across seam into prose block...");
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(200);

    // Type prose explanation in prose block
    await page.keyboard.type("The characteristic equation with trial solution y = e^{rt} is:");
    await page.waitForTimeout(200);

    await page.screenshot({ path: path.join(artifactDir, "ode_step3_seam_arrow_to_prose.png") });
    console.log("Saved ode_step3_seam_arrow_to_prose.png");

    // Press Enter to step to next block
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);

    console.log("5. Type characteristic equation...");
    await page.keyboard.type("r^2 + 4r + 13 = ");
    await page.waitForTimeout(150);
    await page.keyboard.type("0");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);

    await page.screenshot({ path: path.join(artifactDir, "ode_step4_characteristic_equation.png") });
    console.log("Saved ode_step4_characteristic_equation.png");

    console.log("6. Type roots and solution...");
    await page.keyboard.type("Solving roots via quadratic formula gives r = -2 \\pm 3i.");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);

    await page.keyboard.type("With initial values y(0) = 2 and y\x27(0) = -1, the unique solution is:");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);

    // Analytical solution equation:
    // 1. Type LHS and = to trigger auto-transformation into equation block
    await page.keyboard.type("y(t) = ");
    await page.waitForTimeout(150);

    // 2. Now inside MathLive math-field: type e^(-2t), ArrowRight to exit exponent, and remaining factors
    await page.keyboard.type("e^(-2t)");
    await page.waitForTimeout(50);
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(50);
    await page.keyboard.type(" * (2cos(3t) + sin(3t))");
    await page.waitForTimeout(200);

    // Commit equation block and step to next block
    await page.keyboard.press("Enter");
    await page.waitForTimeout(200);

    await page.screenshot({ path: path.join(artifactDir, "ode_step5_final_particular_solution.png") });
    console.log("Saved ode_step5_final_particular_solution.png");

    console.log("7. Test backslash autocomplete dropdown...");
    // Current block is ready for typing: test \fo
    await page.keyboard.type("\\fo");
    await page.waitForTimeout(300);

    await page.screenshot({ path: path.join(artifactDir, "ode_step6_autocomplete_dropdown.png") });
    console.log("Saved ode_step6_autocomplete_dropdown.png");

    console.log("Authoring flow completed successfully!");
  } finally {
    await browser.close();
    await server.close();
  }
}

run().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
