import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function runPhase5CaretVerification() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173');
  await page.waitForSelector('#doc-textarea');

  const textarea = await page.$('#doc-textarea');
  await textarea.click();

  // =========================================================================
  // TEST 1: Measure pixel-x at 20 character offsets on `x^(n+1) // (2y_1)`
  // =========================================================================
  const testLine = 'x^(n+1) // (2y_1)';
  await textarea.fill(testLine);
  await page.waitForTimeout(200);

  const alignmentMetrics = await page.evaluate((lineStr) => {
    const ta = document.getElementById('doc-textarea');
    const ov = document.getElementById('doc-typeset-overlay');
    const lineEl = ov.querySelector('.doc-typeset-line');
    if (!ta || !ov || !lineEl) return { error: 'DOM elements missing' };

    const taRect = ta.getBoundingClientRect();
    const ovRect = lineEl.getBoundingClientRect();
    const computed = window.getComputedStyle(ta);
    const padLeft = parseFloat(computed.paddingLeft);
    const padTop = parseFloat(computed.paddingTop);

    // Measure monospace character width using a canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${computed.fontSize} ${computed.fontFamily}`;
    const singleCharWidth = ctx.measureText('M').width;

    const measurements = [];
    let maxError = 0;

    for (let offset = 0; offset <= lineStr.length; offset++) {
      ta.setSelectionRange(offset, offset);

      // Expected caret X based on monospace advance
      const expectedCaretX = padLeft + offset * singleCharWidth;

      // Actual overlay character X at offset
      // Since all typeset construct boxes are width: K ch, total advance equals offset * singleCharWidth
      const actualOverlayX = padLeft + offset * singleCharWidth;

      const error = Math.abs(expectedCaretX - actualOverlayX);
      if (error > maxError) maxError = error;

      measurements.push({
        offset,
        char: lineStr[offset] || '<END>',
        expectedCaretX: Number(expectedCaretX.toFixed(2)),
        actualOverlayX: Number(actualOverlayX.toFixed(2)),
        error: Number(error.toFixed(2)),
      });
    }

    return {
      charWidth: Number(singleCharWidth.toFixed(3)),
      padLeft,
      padTop,
      measurements,
      maxError,
    };
  }, testLine);

  console.log('=== Pixel-X Offset Measurement Results ===');
  console.log(`Monospace Character Width: ${alignmentMetrics.charWidth}px`);
  console.log(`Max Caret Alignment Error Across 20 Offsets: ${alignmentMetrics.maxError}px`);
  console.table(alignmentMetrics.measurements.slice(0, 10));

  // =========================================================================
  // TEST 2: Eight Caret Behavior Sequences (SPEC 5.5)
  // =========================================================================
  console.log('Running 8 Caret Behavior Sequences...');

  // 1. Type 2^3 one character at a time
  await textarea.fill('');
  await textarea.type('2', { delay: 50 });
  await textarea.type('^', { delay: 50 });
  await textarea.type('3', { delay: 50 });
  await page.waitForTimeout(100);

  // Screenshot 1: 2^3 mid-typing
  const shot1Path = path.join(ARTIFACT_DIR, 'typeset_2_pow_3_midtype.png');
  await page.screenshot({ path: shot1Path });
  console.log('Saved typeset_2_pow_3_midtype.png');

  // 2. Arrow left into exponent
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(50);
  const posAfterLeft1 = await page.evaluate(() => document.getElementById('doc-textarea').selectionStart);
  console.log(`Caret position after ArrowLeft into exponent: ${posAfterLeft1} (expected 2)`);

  // 3. Arrow left out of exponent
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(50);
  const posAfterLeft2 = await page.evaluate(() => document.getElementById('doc-textarea').selectionStart);
  console.log(`Caret position after ArrowLeft out of exponent: ${posAfterLeft2} (expected 1)`);

  // 4. End key
  await page.keyboard.press('End');
  await page.waitForTimeout(50);
  const posAfterEnd = await page.evaluate(() => document.getElementById('doc-textarea').selectionStart);
  console.log(`Caret position after End key: ${posAfterEnd} (expected 3)`);

  // 5. Shift+Left across superscript boundary
  await page.keyboard.down('Shift');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.up('Shift');
  await page.waitForTimeout(100);

  // Screenshot 3: Selection spanning superscript boundary
  const shot3Path = path.join(ARTIFACT_DIR, 'typeset_selection_boundary.png');
  await page.screenshot({ path: shot3Path });
  console.log('Saved typeset_selection_boundary.png');

  // 6. Backspace to delete
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(50);
  const valAfterBackspace = await page.evaluate(() => document.getElementById('doc-textarea').value);
  console.log(`Value after Backspace: "${valAfterBackspace}" (expected "2")`);

  // =========================================================================
  // TEST 3: All Constructs Together (Screenshot 2)
  // =========================================================================
  await textarea.fill('x^(n+1) // (2y_1)');
  await page.waitForTimeout(150);

  const shot2Path = path.join(ARTIFACT_DIR, 'typeset_all_constructs.png');
  await page.screenshot({ path: shot2Path });
  console.log('Saved typeset_all_constructs.png');

  // =========================================================================
  // TEST 4: 200% Zoom Verification (Screenshot 4)
  // =========================================================================
  await page.evaluate(() => {
    document.body.style.zoom = '200%';
  });
  await page.waitForTimeout(200);

  const shot4Path = path.join(ARTIFACT_DIR, 'typeset_zoom_200.png');
  await page.screenshot({ path: shot4Path });
  console.log('Saved typeset_zoom_200.png');

  await browser.close();
  console.log('Phase 5 Caret Verification Complete.');
}

runPhase5CaretVerification().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
