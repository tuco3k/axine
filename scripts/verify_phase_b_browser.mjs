import { chromium } from 'playwright';
import * as path from 'path';

const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

const phaseBTestDoc = `---
title: Phase B Pure Relational Verification
---

# 1. g = 9.8 then g * 2 (evaluates to 19.6)
{
  g = 9.8
  g * 2
}

# 2. x = 0 alone (1D Space with coordinate ['x'])
x = 0

# 3. x = 0 then x * 2 (evaluates to 0 in lexical scope)
{
  x = 0
  x * 2
}

# 4. x = 0, y = 0 in one block (2 constraints in 2D space ['x', 'y'])
{
  x = 0
  y = 0
}

# 5. x = 0, x = 1 (contradiction 0 = 1, relations stand unreduced)
{
  x = 0
  x = 1
}

# 6. Unimport :k-
{
  :k = 100
  :k-
}
`;

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173');
  await page.waitForSelector('#doc-textarea');
  await page.waitForTimeout(800);

  // Load Phase B verification document
  await page.evaluate((content) => {
    const textarea = document.querySelector('#doc-textarea');
    if (textarea) {
      textarea.value = content;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, phaseBTestDoc);

  await page.waitForTimeout(1000);

  // Extract Gutter DOM rows
  const gutterData = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.doc-gutter-row'));
    return rows.map((r, idx) => ({
      index: idx,
      text: r.innerText.replace(/\s+/g, ' ').trim(),
      html: r.innerHTML,
    }));
  });

  console.log('\n=== EXTRACTED LIVE GUTTER DOM ROWS ===');
  gutterData.forEach(g => {
    if (g.text.length > 0) {
      console.log(`[Gutter Row ${g.index + 1}]: ${g.text}`);
    }
  });

  // Capture screenshot artifact
  const screenshotPath = path.join(ARTIFACT_DIR, 'phase_b_gate_verification.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`\nCaptured screenshot artifact at: ${screenshotPath}`);

  await browser.close();
  console.log('Browser verification completed successfully.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
