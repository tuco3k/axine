import { chromium } from 'playwright';
import path from 'path';

const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:5173 with deviceScaleFactor=2...');
  await page.goto('http://localhost:5173');
  await page.waitForSelector('#corpus-select');

  console.log('Selecting Collatz (1)...');
  await page.selectOption('#corpus-select', 'collatz');
  await page.waitForTimeout(800);

  const canvasMetrics = await page.evaluate(() => {
    const canvas = document.querySelector('.doc-inline-canvas');
    if (!canvas) return null;
    return {
      clientWidth: canvas.clientWidth,
      clientHeight: canvas.clientHeight,
      offsetWidth: canvas.offsetWidth,
      offsetHeight: canvas.offsetHeight,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      dpr: window.devicePixelRatio,
      containerWidth: canvas.parentElement?.clientWidth,
      containerHeight: canvas.parentElement?.clientHeight,
    };
  });

  console.log('=== Canvas Dimensions at Render Time (Before Fix) ===');
  console.log(JSON.stringify(canvasMetrics, null, 2));

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'collatz_before_fix.png') });
  console.log('Saved collatz_before_fix.png');

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
