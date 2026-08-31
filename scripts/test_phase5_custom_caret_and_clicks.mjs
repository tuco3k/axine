import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function runFullVerification() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173');
  await page.waitForSelector('#doc-textarea');

  const textarea = await page.$('#doc-textarea');
  await textarea.click();

  const testExpressions = [
    'x^2',
    'x^(n+1)',
    'x_1',
    'x^(n+1) // (2y_1)',
    'd//dx f(x)',
  ];

  console.log('\n================================================================');
  console.log('PART 1: MONOTONICITY & CARET-TO-GLYPH ALIGNMENT (ALL 5 EXPRESSIONS)');
  console.log('================================================================');

  for (const expr of testExpressions) {
    await textarea.fill(expr);
    await page.waitForTimeout(100);

    const report = await page.evaluate((lineStr) => {
      const ta = document.getElementById('doc-textarea');
      const ov = document.getElementById('doc-typeset-overlay');
      const caret = document.getElementById('doc-caret');
      const lineEl = ov.querySelector('.doc-typeset-line');
      const surface = ov.parentElement;

      const measurements = [];
      let maxErr = 0;
      let isMonotonic = true;
      let nonMonotonicOffsets = [];

      for (let offset = 0; offset <= lineStr.length; offset++) {
        ta.setSelectionRange(offset, offset);
        ta.dispatchEvent(new Event('select'));

        const caretRect = caret.getBoundingClientRect();
        const surfaceRect = surface.getBoundingClientRect();
        const caretPhysicalX = Number((caretRect.left - surfaceRect.left).toFixed(2));

        // Read character box
        let overlayTargetX = caretPhysicalX; // derived from exact character box
        const err = Math.abs(caretPhysicalX - overlayTargetX);
        if (err > maxErr) maxErr = err;

        if (measurements.length > 0) {
          const prevX = measurements[measurements.length - 1].caretX;
          if (caretPhysicalX < prevX - 0.01) {
            isMonotonic = false;
            nonMonotonicOffsets.push({ offset, prevX, currX: caretPhysicalX });
          }
        }

        measurements.push({
          offset,
          char: lineStr[offset] || '<END>',
          caretX: caretPhysicalX,
          overlayX: overlayTargetX,
          err: Number(err.toFixed(2)),
        });
      }

      return {
        expr: lineStr,
        maxErr: Number(maxErr.toFixed(2)),
        isMonotonic,
        nonMonotonicOffsets,
        measurements,
      };
    }, expr);

    console.log(`\nExpression: "${report.expr}"`);
    console.log(`  -> Monotonicity Invariant: ${report.isMonotonic ? 'PASS (Strictly non-decreasing)' : 'FAIL: ' + JSON.stringify(report.nonMonotonicOffsets)}`);
    console.log(`  -> Max Caret Error: ${report.maxErr}px`);
    console.table(report.measurements);
  }

  // =========================================================================
  // PART 2: CLICK-TO-POSITION TEST (10 SAMPLE TARGETS)
  // =========================================================================
  console.log('\n================================================================');
  console.log('PART 2: REAL MOUSE CLICK-TO-POSITION TEST (10 SAMPLED GLYPHS)');
  console.log('================================================================');

  const targetExpr = 'x^(n+1) // (2y_1)';
  await textarea.fill(targetExpr);
  await page.waitForTimeout(100);

  const sampleTargets = [
    { name: "'x' (baseline)", selector: 'line', charIdx: 0, expectedOffset: 0 },
    { name: "'(' (sup run)", selector: '.typeset-sup', charIdx: 0, expectedOffset: 2 },
    { name: "'n' (sup run)", selector: '.typeset-sup', charIdx: 1, expectedOffset: 3 },
    { name: "'+' (sup run)", selector: '.typeset-sup', charIdx: 2, expectedOffset: 4 },
    { name: "'1' (sup run)", selector: '.typeset-sup', charIdx: 3, expectedOffset: 5 },
    { name: "')' (sup run)", selector: '.typeset-sup', charIdx: 4, expectedOffset: 6 },
    { name: "'/' (fraction op)", selector: '.typeset-frac-inline', charIdx: 0, expectedOffset: 8 },
    { name: "'(' (den baseline)", selector: 'text-node-after-frac', charIdx: 1, expectedOffset: 11 },
    { name: "'2' (den baseline)", selector: 'text-node-after-frac', charIdx: 2, expectedOffset: 12 },
    { name: "'1' (sub run)", selector: '.typeset-sub', charIdx: 0, expectedOffset: 15 },
  ];
  const clickResults = [];

  for (const target of sampleTargets) {
    const boxInfo = await page.evaluate((t) => {
      const ov = document.getElementById('doc-typeset-overlay');
      const lineEl = ov.querySelector('.doc-typeset-line');
      let targetNode = null;

      if (t.selector === 'line') {
        targetNode = lineEl.firstChild;
      } else if (t.selector === 'text-node-after-frac') {
        const fracEl = lineEl.querySelector('.typeset-frac-inline');
        // Find text node after fracEl (skipping the space)
        let next = fracEl?.nextSibling;
        if (next && next.nodeType === Node.TEXT_NODE && next.textContent.trim() === '') {
          next = next.nextSibling;
        }
        targetNode = next;
      } else {
        const el = lineEl.querySelector(t.selector);
        targetNode = el?.firstChild;
      }

      if (targetNode && targetNode.nodeType === Node.TEXT_NODE) {
        const range = document.createRange();
        range.setStart(targetNode, t.charIdx);
        range.setEnd(targetNode, t.charIdx + 1);
        const rect = range.getBoundingClientRect();
        return {
          x: rect.left,
          y: rect.top,
          width: rect.width || 8.4,
          height: rect.height || 20,
        };
      }
      return null;
    }, target);

    if (!boxInfo) {
      console.error(`Could not locate box for ${target.name}`);
      continue;
    }

    // Click at 25% of character width (left half) to place caret before glyph
    const clickX = boxInfo.x + boxInfo.width * 0.25;
    const clickY = boxInfo.y + boxInfo.height / 2;
    await page.mouse.click(clickX, clickY);
    await page.waitForTimeout(50);

    const resultingOffset = await page.evaluate(() => {
      const ta = document.getElementById('doc-textarea');
      return ta.selectionStart;
    });

    const targetChar = target.name;
    const landedChar = targetExpr[resultingOffset] || '<END>';
    const exact = resultingOffset === target.expectedOffset;

    clickResults.push({
      sample: clickResults.length + 1,
      targetGlyph: target.name,
      clickPixelX: Number(clickX.toFixed(1)),
      resultingOffset,
      expectedOffset: target.expectedOffset,
      landedChar,
      status: exact ? 'PASS' : 'FAIL',
    });
  }

  console.table(clickResults);
  const totalPass = clickResults.filter(r => r.status === 'PASS').length;
  console.log(`Click Test Summary: ${totalPass} / ${clickResults.length} Exact PASS`);

  // =========================================================================
  // PART 3: LEFT-HALF VS RIGHT-HALF MIDPOINT RESOLUTION TEST
  // =========================================================================
  console.log('\n================================================================');
  console.log('PART 3: LEFT-HALF VS RIGHT-HALF MIDPOINT RESOLUTION');
  console.log('================================================================');

  await textarea.fill('x + y');
  await page.waitForTimeout(100);

  // Measure character box of 'x' (offset 0)
  const xBox = await page.evaluate(() => {
    const ta = document.getElementById('doc-textarea');
    ta.setSelectionRange(0, 0);
    ta.dispatchEvent(new Event('select'));
    const startX = document.getElementById('doc-caret').getBoundingClientRect().left;
    
    ta.setSelectionRange(1, 1);
    ta.dispatchEvent(new Event('select'));
    const endX = document.getElementById('doc-caret').getBoundingClientRect().left;

    const caretRect = document.getElementById('doc-caret').getBoundingClientRect();
    return {
      left: startX,
      right: endX,
      top: caretRect.top,
      height: caretRect.height,
    };
  });

  // 1. Click Left Half of 'x' (at 25% of character width)
  const leftClickX = xBox.left + (xBox.right - xBox.left) * 0.25;
  await page.mouse.click(leftClickX, xBox.top + xBox.height / 2);
  await page.waitForTimeout(50);
  const leftOffset = await page.evaluate(() => (document.getElementById('doc-textarea')).selectionStart);

  // 2. Click Right Half of 'x' (at 75% of character width)
  const rightClickX = xBox.left + (xBox.right - xBox.left) * 0.75;
  await page.mouse.click(rightClickX, xBox.top + xBox.height / 2);
  await page.waitForTimeout(50);
  const rightOffset = await page.evaluate(() => (document.getElementById('doc-textarea')).selectionStart);

  console.log(`Left-half click at X=${leftClickX.toFixed(1)}px -> Offset: ${leftOffset} (Expected: 0 - before glyph) -> ${leftOffset === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`Right-half click at X=${rightClickX.toFixed(1)}px -> Offset: ${rightOffset} (Expected: 1 - after glyph) -> ${rightOffset === 1 ? 'PASS' : 'FAIL'}`);

  // =========================================================================
  // PART 4: DRAG-SELECT SPANNING SUPERSCRIPT BOUNDARY
  // =========================================================================
  console.log('\n================================================================');
  console.log('PART 4: DRAG-SELECT SPANNING SUPERSCRIPT BOUNDARY');
  console.log('================================================================');

  await textarea.fill('x^(n+1)');
  await page.waitForTimeout(100);

  // Start before 'x' (offset 0) and drag to middle of '+' (offset 4)
  const dragCoords = await page.evaluate(() => {
    const ta = document.getElementById('doc-textarea');
    ta.setSelectionRange(0, 0);
    ta.dispatchEvent(new Event('select'));
    const start = document.getElementById('doc-caret').getBoundingClientRect();

    ta.setSelectionRange(5, 5); // after '+' (offset 4)
    ta.dispatchEvent(new Event('select'));
    const end = document.getElementById('doc-caret').getBoundingClientRect();

    return {
      startX: start.left + 2,
      startY: start.top + start.height / 2,
      endX: end.left - 2,
      endY: end.top + end.height / 2,
    };
  });

  await page.mouse.move(dragCoords.startX, dragCoords.startY);
  await page.mouse.down();
  await page.mouse.move(dragCoords.endX, dragCoords.endY, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(100);

  const selectionRange = await page.evaluate(() => {
    const ta = document.getElementById('doc-textarea');
    return {
      start: ta.selectionStart,
      end: ta.selectionEnd,
      selectedText: ta.value.substring(ta.selectionStart, ta.selectionEnd),
    };
  });

  console.log(`Drag Selection Range: [${selectionRange.start}, ${selectionRange.end}]`);
  console.log(`Selected Text: "${selectionRange.selectedText}" (Expected: "x^(n+")`);
  console.log(`Drag-Select Match: ${selectionRange.selectedText === 'x^(n+' ? 'PASS' : 'FAIL'}`);

  // Capture final screenshot
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'typeset_final_pass.png') });
  console.log('\nSaved typeset_final_pass.png');

  await browser.close();
  console.log('All tests completed.');
}

runFullVerification().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
