import { chromium } from 'playwright';
import * as path from 'path';

const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function verifyItems() {
  console.log('Launching browser for Item 1, 2, and 3 verification...');
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

  // --- ITEM 1: THEME TOGGLE CLICK TEST IN DARK MODE ---
  console.log('\n=== ITEM 1: Testing Theme Toggle in Dark Mode ===');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await page.waitForTimeout(100);

  const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  console.log('Initial Theme:', initialTheme);

  // Click the theme button directly via Playwright
  const themeBtn = await page.$('#doc-theme-btn');
  await themeBtn?.click();
  await page.waitForTimeout(150);

  const themeAfterClick = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  console.log('Theme after 1st click:', themeAfterClick);

  await themeBtn?.click();
  await page.waitForTimeout(150);
  const themeAfterSecondClick = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  console.log('Theme after 2nd click:', themeAfterSecondClick);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'typeset_f3_theme_toggle_verified.png') });
  console.log('Saved: typeset_f3_theme_toggle_verified.png');

  // --- ITEM 2: THREE MATHEMATICAL SPELLINGS OF THE SAME INTEGRAL ---
  console.log('\n=== ITEM 2: Testing 3 Distinct Integral Spellings ===');
  const integralSpellings = [
    { name: 'BigOp AST Syntax', expr: '∫(3*x + 1, x in 1..3)' },
    { name: 'Function Call AST Syntax', expr: 'integral(3*x + 1, 1, 3, x)' },
    { name: 'Typeset Sub/Superscript Notation', expr: '∫_1^3 (3*x + 1) dx' }
  ];

  const spellingExtractions = [];

  for (let i = 0; i < integralSpellings.length; i++) {
    const sp = integralSpellings[i];
    await page.evaluate((text) => {
      const editor = window.editor;
      editor.textarea.value = text;
      editor.updateTypesetOverlay();
      editor.updateCaret();
      editor.state.setText(text);
    }, sp.expr);

    await page.waitForTimeout(150);

    const data = await page.evaluate(() => {
      const line = document.querySelector('.doc-typeset-line');
      line?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      const popover = document.getElementById('doc-math-popover');
      return {
        role: popover?.querySelector('.popover-role')?.textContent?.trim(),
        badge: popover?.querySelector('.popover-symbol-badge')?.textContent?.trim(),
        sliderBadge: popover?.querySelector('.vis-accent-badge')?.textContent?.trim(),
        metrics: Array.from(popover?.querySelectorAll('.vis-metric') || []).map(m => ({
          key: m.querySelector('.vis-metric-key')?.textContent?.trim(),
          val: m.querySelector('.vis-metric-val')?.textContent?.trim()
        }))
      };
    });

    console.log(`\nSpelling ${i + 1} (${sp.name}): "${sp.expr}"`);
    console.log(JSON.stringify(data, null, 2));
    spellingExtractions.push({ spelling: sp.expr, name: sp.name, data });
  }

  // --- ITEM 3: RIEMANN SAMPLING RULE SWITCHING (LEFT, MIDPOINT, RIGHT) ---
  console.log('\n=== ITEM 3: Testing Sampling Rules (Left, Midpoint, Right) ===');
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
  console.log('\n--- Switching to Left Rule ---');
  const leftData = await page.evaluate(() => {
    const leftBtn = document.querySelector('.vis-seg-btn[data-rule="left"]');
    leftBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const popover = document.getElementById('doc-math-popover');
    return {
      activeRule: popover?.querySelector('.vis-seg-btn.active')?.textContent?.trim(),
      metrics: Array.from(popover?.querySelectorAll('.vis-metric') || []).map(m => ({
        key: m.querySelector('.vis-metric-key')?.textContent?.trim(),
        val: m.querySelector('.vis-metric-val')?.textContent?.trim()
      }))
    };
  });
  console.log('Left Rule DOM Extraction:', JSON.stringify(leftData, null, 2));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'typeset_f3_riemann_rule_left.png') });
  console.log('Saved: typeset_f3_riemann_rule_left.png');

  // 2. Rule: Midpoint
  console.log('\n--- Switching to Midpoint Rule ---');
  const midData = await page.evaluate(() => {
    const midBtn = document.querySelector('.vis-seg-btn[data-rule="midpoint"]');
    midBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const popover = document.getElementById('doc-math-popover');
    return {
      activeRule: popover?.querySelector('.vis-seg-btn.active')?.textContent?.trim(),
      metrics: Array.from(popover?.querySelectorAll('.vis-metric') || []).map(m => ({
        key: m.querySelector('.vis-metric-key')?.textContent?.trim(),
        val: m.querySelector('.vis-metric-val')?.textContent?.trim()
      }))
    };
  });
  console.log('Midpoint Rule DOM Extraction:', JSON.stringify(midData, null, 2));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'typeset_f3_riemann_rule_midpoint.png') });
  console.log('Saved: typeset_f3_riemann_rule_midpoint.png');

  // 3. Rule: Right
  console.log('\n--- Switching to Right Rule ---');
  const rightData = await page.evaluate(() => {
    const rightBtn = document.querySelector('.vis-seg-btn[data-rule="right"]');
    rightBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const popover = document.getElementById('doc-math-popover');
    return {
      activeRule: popover?.querySelector('.vis-seg-btn.active')?.textContent?.trim(),
      metrics: Array.from(popover?.querySelectorAll('.vis-metric') || []).map(m => ({
        key: m.querySelector('.vis-metric-key')?.textContent?.trim(),
        val: m.querySelector('.vis-metric-val')?.textContent?.trim()
      }))
    };
  });
  console.log('Right Rule DOM Extraction:', JSON.stringify(rightData, null, 2));
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'typeset_f3_riemann_rule_right.png') });
  console.log('Saved: typeset_f3_riemann_rule_right.png');

  await browser.close();
  console.log('\nVerification of Items 1, 2, and 3 completed successfully.');
}

verifyItems().catch(console.error);
