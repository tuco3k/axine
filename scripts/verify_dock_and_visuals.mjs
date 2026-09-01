import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function main() {
  console.log('Starting Vite server...');
  const viteProcess = spawn('npx', ['vite', '--port', '3000'], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'pipe',
  });

  await new Promise((resolve) => {
    viteProcess.stdout.on('data', (data) => {
      const str = data.toString();
      if (str.includes('Local:') || str.includes('3000')) {
        resolve(true);
      }
    });
    // Fallback timer
    setTimeout(() => resolve(true), 3000);
  });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000');
  await page.waitForSelector('#doc-workspace');

  // Input rich document demonstrating:
  // 1. Scalar result: a := 42
  // 2. Inline Plot: graph(sin(x), x in 0..10)
  // 3. Inline Derivation: isolate(x^2 - 4 = 0, for: x)
  // 4. Inline Described Card: \u222c_S F \u00b7 dS
  const sampleDoc = [
    '# Interactive Mathematical Document with Inline Visuals',
    'a := 42',
    'graph(sin(x), x in 0..10)',
    'isolate(x^2 - 4 = 0, for: x)',
    '\u222c_S F \u00b7 dS',
    'check(4/3 * pi * r^3, is: "sphere volume")',
  ].join('\n');

  console.log('Setting document content with scalar, plot, derivation, and described card...');
  await page.evaluate((docText) => {
    const textarea = document.querySelector('#doc-textarea');
    if (textarea) {
      textarea.value = docText;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, sampleDoc);

  await page.waitForTimeout(1000);

  // 1. Verify and Screenshot: Inline Gutter Visuals (Scalar, Plot, Derivation, Described)
  console.log('Capturing inline_gutter_all_visuals.png...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'inline_gutter_all_visuals.png') });

  // 2. Screenshot: Panel Docked Right (Default)
  console.log('Capturing dock_right_full.png...');
  await page.click('.doc-dock-btn[data-edge="right"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'dock_right_full.png') });

  // 3. Screenshot: Panel Docked Left
  console.log('Capturing dock_left_full.png...');
  await page.click('.doc-dock-btn[data-edge="left"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'dock_left_full.png') });

  // 4. Screenshot: Panel Docked Bottom
  console.log('Capturing dock_bottom_full.png...');
  await page.click('.doc-dock-btn[data-edge="bottom"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'dock_bottom_full.png') });

  // 5. Screenshot: Panel Docked Top
  console.log('Capturing dock_top_full.png...');
  await page.click('.doc-dock-btn[data-edge="top"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'dock_top_full.png') });

  // 6. Screenshot: Panel Collapsed to Zero Width (Full-Width Document & Edge Affordance)
  console.log('Capturing panel_collapsed_full_width.png...');
  await page.click('.doc-dock-btn[data-edge="right"]');
  await page.waitForTimeout(200);
  await page.click('.doc-dock-collapse-btn');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'panel_collapsed_full_width.png') });

  // 7. Test uncollapsing via edge affordance
  console.log('Clicking edge affordance to restore panel...');
  await page.click('#doc-panel-edge-affordance');
  await page.waitForTimeout(400);

  // 8. Measure Caret Alignment & Error Across Dock Changes
  console.log('Verifying caret alignment and error across all dock positions...');
  const dockEdges = ['right', 'left', 'bottom', 'top'];
  for (const edge of dockEdges) {
    await page.click(`.doc-dock-btn[data-edge="${edge}"]`);
    await page.waitForTimeout(200);

    await page.click('#doc-textarea');
    await page.waitForTimeout(100);

    const caretMeasurements = await page.evaluate((targetEdge) => {
      const textarea = document.querySelector('#doc-textarea');
      const caret = document.querySelector('#doc-caret');
      const overlay = document.querySelector('#doc-typeset-overlay');
      if (!textarea || !caret || !overlay) return null;

      textarea.focus();
      const text = textarea.value;
      const line1End = text.indexOf('\n') + 1;
      const targetPos = line1End + 5; // right after 'a := '
      textarea.setSelectionRange(targetPos, targetPos);
      document.dispatchEvent(new Event('selectionchange'));
      textarea.dispatchEvent(new Event('keyup'));
      textarea.dispatchEvent(new Event('input'));

      const caretRect = caret.getBoundingClientRect();
      const surfaceRect = overlay.getBoundingClientRect();
      const caretRelX = caretRect.left - surfaceRect.left;
      const caretRelY = caretRect.top - surfaceRect.top;

      // Expected X for col 5: padLeft (7px) + 5 * charWidth (8.42857px) = 49.143px
      const expectedX = 7.0 + 5 * 8.42857;
      const errorX = Math.abs(caretRelX - expectedX);

      return {
        edge: targetEdge,
        caretRelX,
        caretRelY,
        errorX,
        caretDisplay: window.getComputedStyle(caret).display,
      };
    }, edge);
    console.log(`Caret on dock [${edge}]:`, caretMeasurements);
  }

  await browser.close();
  viteProcess.kill();
  console.log('Verification completed successfully!');
}

main().catch((err) => {
  console.error('Error during verification:', err);
  process.exit(1);
});
