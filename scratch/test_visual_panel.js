import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  const docContent = `// Composed 3D surface visualization
graph(sin(x) * cos(y), 0.5 * (x - y), x in -3..3, y in -3..3)

// First-class algebraic derivation with branching
d := isolate(x^2 = 4, for: x)
`;

  await page.fill('#doc-textarea', docContent);
  await page.waitForTimeout(600);

  // Focus line 2 (index 1) for 3D plot
  await page.evaluate(() => {
    const editor = window.editor;
    if (editor) editor.displayVisualForLine(1, true);
  });
  await page.waitForTimeout(500);

  const screenshotPath = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b/visual_panel_3d_and_document.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Saved screenshot to ${screenshotPath}`);

  // Focus line 5 (index 4) for derivation with branches
  await page.evaluate(() => {
    const editor = window.editor;
    if (editor) editor.displayVisualForLine(4, true);
  });
  await page.waitForTimeout(500);

  const derivPath = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b/visual_panel_derivation_branching.png';
  await page.screenshot({ path: derivPath, fullPage: true });
  console.log(`Saved screenshot to ${derivPath}`);

  await browser.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
