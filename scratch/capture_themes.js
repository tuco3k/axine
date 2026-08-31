import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173');
  await page.waitForSelector('#doc-textarea', { timeout: 5000 });

  const docContent = `// Mathematical IDE Design System Demo
// 1. Surface plot with depth cueing
graph(sin(x) * cos(y), 0.5 * (x - y), x in -3..3, y in -3..3)

// 2. First-class algebraic derivation with branching
d := isolate(x^2 = 4, for: x)

// 3. Simplified polynomial expression
simp := simplify(3*x + 2*x - 4, in: x)
`;

  await page.fill('#doc-textarea', docContent);
  await page.waitForTimeout(600);

  // Focus line 3 (index 2) to show 3D plot
  await page.evaluate(() => {
    const editor = window.editor;
    if (editor) editor.displayVisualForLine(2, true);
  });
  await page.waitForTimeout(600);

  // Dark Theme Screenshot
  const darkPath = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b/theme_dark.png';
  await page.screenshot({ path: darkPath, fullPage: true });
  console.log(`Saved dark theme to ${darkPath}`);

  // Toggle to Light Theme
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    const editor = window.editor;
    if (editor && editor.activePlotter) editor.activePlotter.render();
  });
  await page.waitForTimeout(600);

  // Light Theme Screenshot
  const lightPath = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b/theme_light.png';
  await page.screenshot({ path: lightPath, fullPage: true });
  console.log(`Saved light theme to ${lightPath}`);

  await browser.close();
}

main().catch(err => {
  console.error('Error in main:', err);
  process.exit(1);
});
