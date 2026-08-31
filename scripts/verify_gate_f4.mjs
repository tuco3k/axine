import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function run() {
  console.log('Launching browser for Gate F4 acceptance case verification...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2
  });

  const page = await context.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  await page.goto('http://localhost:5173', { waitUntil: 'load' });
  await page.waitForSelector('#doc-textarea');

  const testInput = 'check(3/4 * pi * r^2, is: "sphere volume")';
  console.log(`Setting document source: ${testInput}`);

  await page.evaluate((text) => {
    const editor = window.appEditor;
    if (editor) {
      editor.setSource(text);
    } else {
      const textarea = document.querySelector('#doc-textarea');
      if (textarea) {
        textarea.value = text;
        textarea.dispatchEvent(new Event('input'));
      }
    }
  }, testInput);

  await page.waitForTimeout(300);

  // Click Run All
  const runBtn = await page.$('#doc-run-btn');
  if (runBtn) {
    console.log('Clicking Run All...');
    await runBtn.click();
  }
  await page.waitForTimeout(400);

  // Click on the typeset line in document overlay to open Popover
  console.log('Clicking typeset line in overlay...');
  await page.evaluate(() => {
    const line = document.querySelector('.doc-typeset-line');
    if (line) {
      line.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    }
  });

  await page.waitForTimeout(400);

  // Extract Popover DOM contents and visual panel state
  const extractedData = await page.evaluate(() => {
    const popover = document.getElementById('doc-math-popover');
    const popoverVisible = popover && !popover.classList.contains('hidden');

    const popoverHeader = popover?.querySelector('.popover-header')?.innerText?.trim() || '';
    const popoverBody = popover?.querySelector('.popover-body')?.innerText?.trim() || '';
    const popoverShowMe = popover?.querySelector('.popover-showme-preview')?.innerText?.trim() || '';
    const popoverFullText = popover?.innerText || '';

    // Check popover canvas
    const popoverCanvas = popover?.querySelector('#popover-vis-canvas');

    // Visual Panel contents
    const visualTitle = document.getElementById('visual-title')?.innerText?.trim() || '';
    const visualDeriv = document.getElementById('visual-derivation-content')?.innerText?.trim() || '';
    const gutterResult = document.querySelector('.doc-gutter-result')?.innerText?.trim() || '';

    return {
      popoverVisible,
      popoverHeader,
      popoverShowMe,
      popoverFullText,
      hasPopoverCanvas: Boolean(popoverCanvas),
      visualTitle,
      visualDeriv,
      gutterResult
    };
  });

  console.log('\n=== Extracted Live DOM Verification ===');
  console.log(JSON.stringify(extractedData, null, 2));

  // Save screenshot
  const screenshotPath = path.join(ARTIFACT_DIR, 'typeset_gate_f4_acceptance.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`Saved screenshot to ${screenshotPath}`);

  await browser.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
