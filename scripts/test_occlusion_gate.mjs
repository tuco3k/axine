import { chromium } from 'playwright';
import path from 'path';

const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function run() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173');
  await page.waitForSelector('#doc-textarea');

  const doc = `# Part E.3 Composed 3D Single Scene Occlusion Gate
graph(sin(x) * cos(y), 0.5 * (x - y), x in -3..3, y in -3..3)`;
  await page.fill('#doc-textarea', doc);
  await page.waitForTimeout(800);

  const plotBtn = await page.waitForSelector('.doc-plot-btn');
  await plotBtn.click();
  await page.waitForTimeout(600);

  const targetPath = path.join(ARTIFACT_DIR, 'occlusion_gate_composed_scene.png');
  await page.screenshot({ path: targetPath });
  console.log('Captured new screenshot:', targetPath);

  await browser.close();
}

run().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
