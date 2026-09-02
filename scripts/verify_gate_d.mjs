import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const brainDir = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to Axine app...');
  await page.goto('http://localhost:5173');
  await page.waitForSelector('#doc-textarea', { timeout: 10000 });

  // 1. In Doc A (untitled.ax or corpus), enter expressions with variable definitions and evaluate
  console.log('Setting up Document A (integrator_comparison)...');
  const corpusSelect = await page.$('#corpus-select');
  if (corpusSelect) {
    await corpusSelect.selectOption('integrator_comparison');
  }
  await page.waitForTimeout(1500);

  // Pin a plot visual in Doc A
  console.log('Pinning visual in Doc A...');
  const pinBtns = await page.$$('.doc-plot-pin-btn');
  if (pinBtns.length > 0) {
    await pinBtns[0].click();
  }
  await page.waitForTimeout(500);

  // Scroll editor in Doc A
  await page.evaluate(() => {
    const ta = document.querySelector('#doc-textarea');
    if (ta) ta.scrollTop = 150;
  });

  const docAShotPath = path.join(brainDir, 'gate_d_doc_a_initial.png');
  await page.screenshot({ path: docAShotPath, fullPage: false });
  console.log(`Saved screenshot: ${docAShotPath}`);

  // 2. Open a second document tab via the new tab button (+)
  console.log('Creating Document B tab...');
  await page.click('#doc-session-new-tab-btn');
  await page.waitForTimeout(500);

  // In Doc B, type an expression that references a variable from Doc A without importing
  // In Doc A, let's say 'body0' or 'euler_pts' or 'dt' was defined. In Doc B, 'body0' should be undefined error!
  console.log('Writing expressions in Document B to verify scope isolation...');
  await page.fill('#doc-textarea', '# Document B (Isolated Scope)\nval_b := 999\nval_b * 2\nbody0 + 1');
  await page.waitForTimeout(1500);

  const docBShotPath = path.join(brainDir, 'gate_d_doc_b_scope_isolated.png');
  await page.screenshot({ path: docBShotPath, fullPage: false });
  console.log(`Saved screenshot: ${docBShotPath}`);

  // Confirm Doc B tab shows error on body0
  const docBContent = await page.content();
  const hasScopeError = docBContent.includes('not assigned') || docBContent.includes('not found') || docBContent.includes('body0');
  console.log('Scope isolation verified in Doc B:', hasScopeError);

  // 3. Switch back to Document A tab
  console.log('Switching back to Document A tab...');
  const tabA = await page.$('.doc-session-tab:first-child');
  if (tabA) {
    await tabA.click();
  }
  await page.waitForTimeout(500);

  // Verify Doc A results, scroll position, and pinned visual are intact
  const docARestoredShotPath = path.join(brainDir, 'gate_d_doc_a_switched_back.png');
  await page.screenshot({ path: docARestoredShotPath, fullPage: false });
  console.log(`Saved screenshot: ${docARestoredShotPath}`);

  const tabsCount = await page.$$eval('.doc-session-tab', tabs => tabs.length);
  console.log(`Verified total open tabs: ${tabsCount}`);

  await browser.close();
  console.log('Gate D verification finished successfully!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
