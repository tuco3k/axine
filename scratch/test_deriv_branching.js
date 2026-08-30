import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });

  const docContent = `// First-class algebraic derivation with branching
d := isolate(x^2 = 4, for: x)
`;

  await page.fill('#doc-textarea', docContent);
  await page.waitForTimeout(600);

  // Click on the Visual tab
  await page.click('button[data-tab="visual"]');
  await page.waitForTimeout(500);

  const screenshotPath = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b/visual_panel_derivation_branching.png';
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Saved screenshot to ${screenshotPath}`);

  await browser.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
