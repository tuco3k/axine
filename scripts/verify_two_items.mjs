import { chromium } from 'playwright';
import * as path from 'path';

const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function verifyTwoItems() {
  console.log('Launching browser for Item 1 & 2 verification...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2
  });

  const page = await context.newPage();
  await page.goto('http://localhost:5173', { waitUntil: 'load' });
  await page.waitForSelector('#doc-textarea');

  // --- ITEM 2: ELEMENT-FROM-POINT HIT TEST ---
  console.log('\n=== ITEM 2: Hit Test on #doc-theme-btn via elementFromPoint ===');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.waitForTimeout(100);

  const hitTestReport = await page.evaluate(() => {
    const btn = document.querySelector('#doc-theme-btn');
    if (!btn) return { error: 'Button not found' };
    const rect = btn.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const testPoints = [
      { name: 'Center', x: centerX, y: centerY },
      { name: 'Top-Left', x: rect.left + 2, y: rect.top + 2 },
      { name: 'Top-Right', x: rect.right - 2, y: rect.top + 2 },
      { name: 'Bottom-Left', x: rect.left + 2, y: rect.bottom - 2 },
      { name: 'Bottom-Right', x: rect.right - 2, y: rect.bottom - 2 },
    ];

    const results = testPoints.map(pt => {
      const el = document.elementFromPoint(pt.x, pt.y);
      return {
        point: pt.name,
        coords: `(${pt.x.toFixed(1)}, ${pt.y.toFixed(1)})`,
        hitTag: el?.tagName,
        hitId: el?.id,
        hitClass: el?.className,
        isButtonOrChild: el === btn || btn.contains(el)
      };
    });

    return {
      btnBoundingRect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom
      },
      results
    };
  });

  console.log('Hit Test Report:');
  console.log(JSON.stringify(hitTestReport, null, 2));

  // --- ITEM 1: DYNAMIC SHOW ME TEXT FOR SAMPLING RULES ---
  console.log('\n=== ITEM 1: Testing Dynamic SHOW ME Explanation Text ===');
  await page.evaluate(() => {
    const editor = window.editor;
    const text = '∫_1^3 (3*x + 1) dx';
    editor.textarea.value = text;
    editor.updateTypesetOverlay();
    editor.updateCaret();
    editor.state.setText(text);
    const line = document.querySelector('.doc-typeset-line');
    line?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });

  await page.waitForTimeout(200);

  // 1. Rule: Left
  const leftReport = await page.evaluate(() => {
    const leftBtn = document.querySelector('.vis-seg-btn[data-rule="left"]');
    leftBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const popover = document.getElementById('doc-math-popover');
    const showMePreview = popover?.querySelector('.popover-showme-preview');
    return {
      activeRule: popover?.querySelector('.vis-seg-btn.active')?.textContent?.trim(),
      showMeText: showMePreview?.textContent?.trim(),
      showMeHtml: showMePreview?.innerHTML?.trim(),
      metrics: Array.from(popover?.querySelectorAll('.vis-metric') || []).map(m => ({
        key: m.querySelector('.vis-metric-key')?.textContent?.trim(),
        val: m.querySelector('.vis-metric-val')?.textContent?.trim()
      }))
    };
  });
  console.log('\n[Rule: Left]');
  console.log('SHOW ME Text:', leftReport.showMeText);
  console.log('Metrics:', JSON.stringify(leftReport.metrics));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'typeset_f3_showme_left.png') });

  // 2. Rule: Midpoint
  const midReport = await page.evaluate(() => {
    const midBtn = document.querySelector('.vis-seg-btn[data-rule="midpoint"]');
    midBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const popover = document.getElementById('doc-math-popover');
    const showMePreview = popover?.querySelector('.popover-showme-preview');
    return {
      activeRule: popover?.querySelector('.vis-seg-btn.active')?.textContent?.trim(),
      showMeText: showMePreview?.textContent?.trim(),
      showMeHtml: showMePreview?.innerHTML?.trim(),
      metrics: Array.from(popover?.querySelectorAll('.vis-metric') || []).map(m => ({
        key: m.querySelector('.vis-metric-key')?.textContent?.trim(),
        val: m.querySelector('.vis-metric-val')?.textContent?.trim()
      }))
    };
  });
  console.log('\n[Rule: Midpoint]');
  console.log('SHOW ME Text:', midReport.showMeText);
  console.log('Metrics:', JSON.stringify(midReport.metrics));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'typeset_f3_showme_midpoint.png') });

  // 3. Rule: Right
  const rightReport = await page.evaluate(() => {
    const rightBtn = document.querySelector('.vis-seg-btn[data-rule="right"]');
    rightBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const popover = document.getElementById('doc-math-popover');
    const showMePreview = popover?.querySelector('.popover-showme-preview');
    return {
      activeRule: popover?.querySelector('.vis-seg-btn.active')?.textContent?.trim(),
      showMeText: showMePreview?.textContent?.trim(),
      showMeHtml: showMePreview?.innerHTML?.trim(),
      metrics: Array.from(popover?.querySelectorAll('.vis-metric') || []).map(m => ({
        key: m.querySelector('.vis-metric-key')?.textContent?.trim(),
        val: m.querySelector('.vis-metric-val')?.textContent?.trim()
      }))
    };
  });
  console.log('\n[Rule: Right]');
  console.log('SHOW ME Text:', rightReport.showMeText);
  console.log('Metrics:', JSON.stringify(rightReport.metrics));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'typeset_f3_showme_right.png') });

  // Verification Assertions
  if (leftReport.showMeText === midReport.showMeText || midReport.showMeText === rightReport.showMeText) {
    throw new Error('Assertion failed: SHOW ME texts are identical across rules!');
  }
  if (!leftReport.showMeText.includes('Left Riemann sum') || !leftReport.showMeText.includes('underestimate')) {
    throw new Error('Assertion failed: Left rule text missing expected description');
  }
  if (!midReport.showMeText.includes('Midpoint Riemann sum') || !midReport.showMeText.includes('Exact on linear functions')) {
    throw new Error('Assertion failed: Midpoint rule text missing expected description');
  }
  if (!rightReport.showMeText.includes('Right Riemann sum') || !rightReport.showMeText.includes('overestimate')) {
    throw new Error('Assertion failed: Right rule text missing expected description');
  }

  console.log('\nAll assertions PASSED: SHOW ME text follows selected sampling rule dynamically.');
  await browser.close();
}

verifyTwoItems().catch(err => {
  console.error(err);
  process.exit(1);
});
