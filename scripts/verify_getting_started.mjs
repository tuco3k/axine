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
  await page.waitForTimeout(1000);

  // 1. Screenshot "Getting started: a thrown ball" (loaded by default)
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'getting_started_thrown_ball.png') });
  console.log('Saved getting_started_thrown_ball.png');

  // 2. Load user's error example to test multiline error wrapping
  const errorDoc = `# Error example test
import "physics.ax"

b := Body(radius: 0.5, mass: 1.0, position: (0.0, 0.0), velocity: (10.0, 15.0))
traj := simulate(b -> gravity_step(b, 0.05), b, t in 0..3, dt: 0.05)
`;

  await page.evaluate((text) => {
    const ta = document.querySelector('#doc-textarea');
    if (ta) {
      ta.value = text;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, errorDoc);

  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'multiline_error_wrapping.png') });
  console.log('Saved multiline_error_wrapping.png');

  await browser.close();
  console.log('Screenshots completed.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
