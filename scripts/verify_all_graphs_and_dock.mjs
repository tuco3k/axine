import { chromium } from 'playwright';
import path from 'path';

const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173');
  await page.waitForSelector('#doc-textarea');
  await page.waitForSelector('#corpus-select');

  // Helper to set editor content and wait for evaluation & render
  async function setDoc(content) {
    await page.evaluate((text) => {
      const ta = document.querySelector('#doc-textarea');
      if (ta) {
        ta.value = text;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, content);
    await page.waitForTimeout(800);
  }

  // Helper to get canvas metrics
  async function getCanvasMetrics() {
    return page.evaluate(() => {
      const canvas = document.querySelector('.doc-inline-canvas');
      if (!canvas) return null;
      const dpr = window.devicePixelRatio;
      return {
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        dpr,
        expectedWidth: Math.round(canvas.clientWidth * dpr),
        expectedHeight: Math.round(canvas.clientHeight * dpr),
        widthMatch: canvas.width === Math.round(canvas.clientWidth * dpr),
        heightMatch: canvas.height === Math.round(canvas.clientHeight * dpr),
      };
    });
  }

  console.log('\n--- 1. Testing Canvas Backing Dimensions at All 4 Dock Positions ---');
  await setDoc('graph(2x)');

  const edges = ['right', 'bottom', 'left', 'top'];
  for (const edge of edges) {
    console.log(`Setting dock edge to "${edge}"...`);
    await page.evaluate((e) => {
      const btn = document.querySelector(`.doc-dock-btn[data-edge="${e}"]`);
      btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, edge);
    await page.waitForTimeout(500);

    const metrics = await getCanvasMetrics();
    console.log(`  [Dock: ${edge}]`, metrics);
    if (!metrics?.widthMatch || !metrics?.heightMatch) {
      throw new Error(`Canvas backing dimension mismatch for dock "${edge}": ${JSON.stringify(metrics)}`);
    }
  }

  // Restore right dock
  await page.evaluate(() => {
    const btn = document.querySelector(`.doc-dock-btn[data-edge="right"]`);
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(400);

  console.log('\n--- 2. Screenshot & Verify graph(orbit27) (Collatz) ---');
  await page.selectOption('#corpus-select', 'collatz');
  await page.waitForTimeout(800);
  const collatzMetrics = await getCanvasMetrics();
  console.log('Collatz canvas metrics:', collatzMetrics);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'graph_orbit27_fixed.png') });
  console.log('Saved graph_orbit27_fixed.png');

  console.log('\n--- 3. Screenshot & Verify graph(2x) ---');
  await setDoc('graph(2x)');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'graph_2x.png') });
  console.log('Saved graph_2x.png');

  console.log('\n--- 4. Screenshot & Verify graph(tan x, x in -5..5) ---');
  await setDoc('graph(tan x, x in -5..5)');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'graph_tan_x.png') });
  console.log('Saved graph_tan_x.png');

  console.log('\n--- 5. Screenshot & Verify graph(sin x cos y, x in -3..3, y in -3..3) ---');
  await setDoc('graph(sin x cos y, x in -3..3, y in -3..3)');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'graph_sin_x_cos_y.png') });
  console.log('Saved graph_sin_x_cos_y.png');

  console.log('\n--- 6. Screenshot & Verify Integrator Energy Comparison Curves ---');
  await page.selectOption('#corpus-select', 'integrator_comparison');
  await page.waitForTimeout(1000);

  // Scroll gutter so line 25 (the multi-curve energy plot) is in full view
  await page.evaluate(() => {
    const plotRow = document.querySelector('.doc-gutter-row[data-line="24"]');
    plotRow?.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await page.waitForTimeout(500);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'integrator_energy_curves.png') });
  console.log('Saved integrator_energy_curves.png');

  await browser.close();
  console.log('\n=== All Graph Screenshots & Dock Verifications Completed ===');
}

main().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
