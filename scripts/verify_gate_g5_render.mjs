import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function run() {
  console.log('Launching browser for Gate G5 notation rendering verification...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 2
  });

  const page = await context.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  await page.goto('http://localhost:3000', { waitUntil: 'load' });
  await page.waitForSelector('#doc-textarea');

  const documentContent = [
    '# Representation Layer Notation Classes',
    '\u222c_S F \u00b7 dS',
    '\u222e_C F \u00b7 dr',
    '\u222d_V f dV',
    '\u222b e^(-x^2) dx',
    '\u2207 f',
    '\u2207 \u00b7 F',
    '\u2207 \u00d7 F',
    '\u2207\u00b2 f',
    'u \u2227 v',
    '\u22c6 w',
    'u \u2297 v',
    'u \u2295 v',
    '\u27e8u, v\u27e9',
    '\u2016v\u2016',
    '\u2200 x \u2208 \u211d, x^2 >= 0',
    'A \u222a B',
    '{ x \u2208 \u211d : x > 0 }',
    'G \u2245 H',
    'A^T',
    'A^\u2020',
    'P(A | B)',
    'E[X]',
    '(x^2 + 2*x + 1) / (x - 3)'
  ].join('\n');

  console.log('Populating editor with comprehensive notation document...');
  await page.evaluate((text) => {
    const textarea = document.querySelector('#doc-textarea');
    if (textarea) {
      textarea.value = text;
      textarea.dispatchEvent(new Event('input'));
    }
  }, documentContent);

  await page.waitForTimeout(500);

  // Click Run button to execute full evaluation
  const runBtn = await page.$('#doc-run-btn');
  if (runBtn) {
    console.log('Clicking Run...');
    await runBtn.click();
  }
  await page.waitForTimeout(600);

  // Screenshot full workspace
  const screenshotPath = path.join(ARTIFACT_DIR, 'gate_g5_notation_rendering.png');
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`Saved full workspace screenshot to ${screenshotPath}`);

  // Switch to Visual tab and focus line 2 (\u222c_S F · dS)
  const visualTabBtn = await page.$('.doc-tab-btn[data-tab="visual"]');
  if (visualTabBtn) {
    console.log('Switching to Visual work panel tab...');
    await visualTabBtn.click();
  }

  await page.evaluate(() => {
    const editor = window.editor;
    if (editor) {
      editor.displayVisualForLine(1, false);
    }
  });
  await page.waitForTimeout(400);

  const visualScreenshotPath = path.join(ARTIFACT_DIR, 'gate_g5_visual_pane.png');
  await page.screenshot({ path: visualScreenshotPath, fullPage: false });
  console.log(`Saved visual pane screenshot to ${visualScreenshotPath}`);

  await browser.close();
  console.log('Gate G5 rendering verification complete.');
}

run().catch(err => {
  console.error('Gate G5 verification failed:', err);
  process.exit(1);
});
