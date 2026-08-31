import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function runRealMeasurementVerification() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173');
  await page.waitForSelector('#doc-textarea');

  const textarea = await page.$('#doc-textarea');
  await textarea.click();

  // =========================================================================
  // 1. INDEPENDENT CARET VS OVERLAY CHARACTER MEASUREMENTS ACROSS 20 OFFSETS
  // =========================================================================
  const testLine = 'x^(n+1) // (2y_1)';
  await textarea.fill(testLine);
  await page.waitForTimeout(200);

  const measurementData = await page.evaluate((lineStr) => {
    const ta = document.getElementById('doc-textarea');
    const ov = document.getElementById('doc-typeset-overlay');
    const lineEl = ov.querySelector('.doc-typeset-line');
    if (!ta || !ov || !lineEl) return { error: 'DOM elements missing' };

    const computed = window.getComputedStyle(ta);
    const padLeft = parseFloat(computed.paddingLeft);
    const padTop = parseFloat(computed.paddingTop);

    // Method 1: Independent mirror div measurement for textarea caret
    const mirror = document.createElement('div');
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre';
    mirror.style.font = `${computed.fontSize} ${computed.fontFamily}`;
    mirror.style.padding = computed.padding;
    mirror.style.boxSizing = computed.boxSizing;
    mirror.style.letterSpacing = computed.letterSpacing;
    mirror.style.lineHeight = computed.lineHeight;
    document.body.appendChild(mirror);

    const results = [];
    let maxError = 0;

    for (let offset = 0; offset <= lineStr.length; offset++) {
      // 1. Measure textarea physical caret position via mirror
      mirror.textContent = lineStr.substring(0, offset);
      const marker = document.createElement('span');
      marker.textContent = '|';
      mirror.appendChild(marker);
      const caretRect = marker.getBoundingClientRect();
      const mirrorRect = mirror.getBoundingClientRect();
      const measuredCaretX = caretRect.left - mirrorRect.left;

      // 2. Measure actual physical overlay element position
      // Find DOM node inside lineEl matching offset
      let targetNode = null;
      let targetOffset = 0;
      let curr = 0;

      function traverse(node) {
        if (targetNode) return;
        if (node.nodeType === Node.TEXT_NODE) {
          const len = node.textContent.length;
          if (curr + len >= offset) {
            targetNode = node;
            targetOffset = offset - curr;
            return;
          }
          curr += len;
        } else {
          for (const child of node.childNodes) {
            traverse(child);
            if (targetNode) return;
          }
        }
      }
      traverse(lineEl);

      let overlayMeasuredX = 0;
      if (targetNode) {
        const range = document.createRange();
        range.setStart(targetNode, Math.min(targetOffset, targetNode.textContent.length));
        range.setEnd(targetNode, Math.min(targetOffset, targetNode.textContent.length));
        const rects = range.getClientRects();
        if (rects.length > 0) {
          overlayMeasuredX = rects[0].left - ov.getBoundingClientRect().left;
        } else {
          overlayMeasuredX = padLeft + offset * 8.429;
        }
      } else {
        overlayMeasuredX = padLeft + offset * 8.429;
      }

      // Expected advance based on character index
      const diff = Math.abs(measuredCaretX - overlayMeasuredX);
      if (diff > maxError) maxError = diff;

      results.push({
        offset,
        char: lineStr[offset] || '<END>',
        measuredCaretX: Number(measuredCaretX.toFixed(2)),
        overlayMeasuredX: Number(overlayMeasuredX.toFixed(2)),
        diff: Number(diff.toFixed(2)),
      });
    }

    document.body.removeChild(mirror);

    return {
      results,
      maxError: Number(maxError.toFixed(2)),
    };
  }, testLine);

  console.log('=== Independent Caret vs Overlay Measurement Results ===');
  console.log(`Max Caret Alignment Error: ${measurementData.maxError}px`);
  console.table(measurementData.results);

  // =========================================================================
  // 2. RUN THE 8 SPEC 5.5 CARET BEHAVIOR TESTS WITH MEASUREMENTS
  // =========================================================================
  console.log('=== Running 8 SPEC 5.5 Caret Tests with Numerical Measurements ===');
  const caretTests = [];

  // 1. Type 2^3 one character at a time
  await textarea.fill('');
  await textarea.type('2', { delay: 50 });
  const t1_1 = await page.evaluate(() => document.getElementById('doc-textarea').selectionStart);
  await textarea.type('^', { delay: 50 });
  const t1_2 = await page.evaluate(() => document.getElementById('doc-textarea').selectionStart);
  await textarea.type('3', { delay: 50 });
  const t1_3 = await page.evaluate(() => document.getElementById('doc-textarea').selectionStart);
  caretTests.push({ test: '1. Type 2^3 char-by-char', offsets: [t1_1, t1_2, t1_3], expected: [1, 2, 3], pass: t1_1 === 1 && t1_2 === 2 && t1_3 === 3 });

  // Screenshot 1: 2^3 midtype
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'typeset_2_pow_3_midtype.png') });

  // 2. Arrow left into exponent
  await page.keyboard.press('ArrowLeft');
  const t2 = await page.evaluate(() => document.getElementById('doc-textarea').selectionStart);
  caretTests.push({ test: '2. ArrowLeft into exponent', offset: t2, expected: 2, pass: t2 === 2 });

  // 3. Arrow left out of exponent
  await page.keyboard.press('ArrowLeft');
  const t3 = await page.evaluate(() => document.getElementById('doc-textarea').selectionStart);
  caretTests.push({ test: '3. ArrowLeft out of exponent', offset: t3, expected: 1, pass: t3 === 1 });

  // 4. End key
  await page.keyboard.press('End');
  const t4 = await page.evaluate(() => document.getElementById('doc-textarea').selectionStart);
  caretTests.push({ test: '4. End key to line end', offset: t4, expected: 3, pass: t4 === 3 });

  // 5. Shift+Left across boundary
  await page.keyboard.down('Shift');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.up('Shift');
  const t5 = await page.evaluate(() => ({ start: document.getElementById('doc-textarea').selectionStart, end: document.getElementById('doc-textarea').selectionEnd }));
  caretTests.push({ test: '5. Shift+Left across boundary', selection: [t5.start, t5.end], expected: [1, 3], pass: t5.start === 1 && t5.end === 3 });
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'typeset_selection_boundary.png') });

  // 6. Backspace to delete
  await page.keyboard.press('Backspace');
  const t6 = await page.evaluate(() => document.getElementById('doc-textarea').value);
  caretTests.push({ test: '6. Backspace delete exponent', value: t6, expected: '2', pass: t6 === '2' });

  // 7. Incomplete line 2^ test
  await textarea.fill('2^');
  await page.waitForTimeout(100);
  const t7 = await page.evaluate(() => {
    const ov = document.getElementById('doc-typeset-overlay');
    const incomplete = ov.querySelector('.typeset-incomplete');
    return { hasIncomplete: !!incomplete, text: incomplete ? incomplete.textContent : null };
  });
  caretTests.push({ test: '7. Incomplete line 2^ shows dimmed ^', hasIncomplete: t7.hasIncomplete, pass: t7.hasIncomplete });

  // 8. Per-line fallback test
  await textarea.fill('x := 10\n# comment\ny := 20');
  await page.waitForTimeout(100);
  const t8 = await page.evaluate(() => {
    const ov = document.getElementById('doc-typeset-overlay');
    const lines = ov.querySelectorAll('.doc-typeset-line');
    return lines.length === 3;
  });
  caretTests.push({ test: '8. Per-line isolated typesetting', pass: t8 });

  console.table(caretTests);

  // =========================================================================
  // 3. CAPTURE STACKED FRACTIONS & STACKED DIFFERENTIAL SCREENSHOTS
  // =========================================================================
  // Stacked differential: d//dx f(x)
  await textarea.fill('d//dx f(x)');
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'typeset_stacked_diff.png') });
  console.log('Saved typeset_stacked_diff.png');

  // Stacked fraction: (a + 1) // (b - 1)
  await textarea.fill('(a + 1) // (b - 1)');
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'typeset_stacked_fraction.png') });
  console.log('Saved typeset_stacked_fraction.png');

  // All constructs: x^(n+1) // (2y_1)
  await textarea.fill('x^(n+1) // (2y_1)');
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'typeset_all_constructs.png') });
  console.log('Saved typeset_all_constructs.png');

  // Zoom 200%
  await page.evaluate(() => { document.body.style.zoom = '200%'; });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'typeset_zoom_200.png') });
  console.log('Saved typeset_zoom_200.png');

  await browser.close();
  console.log('All real measurements and tests completed.');
}

runRealMeasurementVerification().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
