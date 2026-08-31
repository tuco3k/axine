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

  // Test expressions
  const testExpressions = [
    'x^2',
    'x^(n+1)',
    'x_1',
    'x^(n+1) // (2y_1)',
    'd//dx f(x)',
  ];

  console.log('=== Measuring Custom Caret vs Overlay Character Node Coordinates ===');

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

      for (let offset = 0; offset <= lineStr.length; offset++) {
        ta.setSelectionRange(offset, offset);
        ta.dispatchEvent(new Event('select'));

        // 1. Measured Custom Caret physical position
        const caretRect = caret.getBoundingClientRect();
        const surfaceRect = surface.getBoundingClientRect();
        const caretPhysicalX = caretRect.left - surfaceRect.left;

        // 2. Measured Overlay physical character position
        let targetNode = null;
        let targetOffset = 0;
        let curr = 0;
        function traverse(node) {
          if (targetNode) return;
          if (node.nodeType === Node.TEXT_NODE) {
            const len = node.textContent?.length || 0;
            if (curr + len >= offset) {
              targetNode = node;
              targetOffset = offset - curr;
              return;
            }
            curr += len;
          } else {
            for (let i = 0; i < node.childNodes.length; i++) {
              traverse(node.childNodes[i]);
              if (targetNode) return;
            }
          }
        }
        traverse(lineEl);

        let overlayTargetX = 0;
        if (targetNode) {
          const range = document.createRange();
          const maxLen = targetNode.textContent?.length || 0;
          range.setStart(targetNode, Math.min(targetOffset, maxLen));
          range.setEnd(targetNode, Math.min(targetOffset, maxLen));
          const rects = range.getClientRects();
          if (rects.length > 0) {
            overlayTargetX = rects[0].left - surfaceRect.left;
          } else {
            overlayTargetX = (targetNode.parentElement?.getBoundingClientRect().left || lineEl.getBoundingClientRect().left) - surfaceRect.left;
          }
        } else {
          overlayTargetX = lineEl.getBoundingClientRect().left - surfaceRect.left + offset * 8.429;
        }

        const err = Math.abs(caretPhysicalX - overlayTargetX);
        if (err > maxErr) maxErr = err;

        measurements.push({
          offset,
          char: lineStr[offset] || '<END>',
          caretX: Number(caretPhysicalX.toFixed(2)),
          overlayX: Number(overlayTargetX.toFixed(2)),
          err: Number(err.toFixed(2)),
        });
      }

      return {
        expr: lineStr,
        maxErr: Number(maxErr.toFixed(2)),
        measurements,
      };
    }, expr);

    console.log(`\nExpression: "${report.expr}" -> Max Error: ${report.maxErr}px`);
    console.table(report.measurements);
  }

  // =========================================================================
  // CLICK-TO-POSITION TEST: Real Mouse Clicks on Physical Rendered Glyphs
  // =========================================================================
  console.log('\n=== Running Real Mouse Click-to-Position Test (10 Sampled Rendered Glyphs) ===');
  const targetExpr = 'x^(n+1) // (2y_1)';
  await textarea.fill(targetExpr);
  await page.waitForTimeout(100);

  // Sample targets: 0:x, 1:^, 2:(, 3:n, 4:+, 5:1, 6:), 8:/, 12:2, 15:1
  const sampleTargets = [0, 1, 2, 3, 4, 5, 6, 8, 12, 15];
  const clickResults = [];

  for (const targetIdx of sampleTargets) {
    // Measure the physical screen coordinates of the target character's rendered bounding box
    const charBox = await page.evaluate((idx) => {
      const ov = document.getElementById('doc-typeset-overlay');
      const lineEl = ov.querySelector('.doc-typeset-line');
      let targetNode = null;
      let targetOffset = 0;
      let curr = 0;
      function traverse(node) {
        if (targetNode) return;
        if (node.nodeType === Node.TEXT_NODE) {
          const len = node.textContent?.length || 0;
          if (curr + len >= idx) {
            targetNode = node;
            targetOffset = idx - curr;
            return;
          }
          curr += len;
        } else {
          for (let i = 0; i < node.childNodes.length; i++) {
            traverse(node.childNodes[i]);
            if (targetNode) return;
          }
        }
      }
      traverse(lineEl);

      if (targetNode) {
        const range = document.createRange();
        range.setStart(targetNode, Math.min(targetOffset, targetNode.textContent.length));
        range.setEnd(targetNode, Math.min(targetOffset + 1, targetNode.textContent.length));
        const rect = range.getBoundingClientRect();
        return { x: rect.left, y: rect.top, width: rect.width || 8.4, height: rect.height || 20 };
      }
      return null;
    }, targetIdx);

    if (charBox) {
      // Physically click the center of the rendered glyph using Playwright mouse
      const clickX = charBox.x + charBox.width / 2;
      const clickY = charBox.y + charBox.height / 2;
      await page.mouse.click(clickX, clickY);
      await page.waitForTimeout(50);

      const resultingOffset = await page.evaluate(() => document.getElementById('doc-textarea').selectionStart);
      const clickedChar = targetExpr[resultingOffset] || '<END>';
      const targetChar = targetExpr[targetIdx] || '<END>';

      clickResults.push({
        targetOffset: targetIdx,
        targetChar,
        clickPixelX: Number(clickX.toFixed(1)),
        resultingOffset,
        clickedChar,
        offsetDiff: Math.abs(resultingOffset - targetIdx),
      });
    }
  }

  console.table(clickResults);

  // Capture final screenshots
  await textarea.fill('x^(n+1) // (2y_1)');
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'typeset_final_caret_inline.png') });
  console.log('Saved typeset_final_caret_inline.png');

  await browser.close();
  console.log('Verification finished successfully.');
}

runFullVerification().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
