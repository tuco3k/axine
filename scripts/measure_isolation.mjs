import { chromium } from 'playwright';

async function measureIsolation() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://localhost:5173');
  await page.waitForSelector('#doc-textarea');

  const textarea = await page.$('#doc-textarea');
  await textarea.click();

  // 1. Measure x^(n+1) in isolation
  const line1 = 'x^(n+1)';
  await textarea.fill(line1);
  await page.waitForTimeout(200);

  const res1 = await page.evaluate((lineStr) => {
    const ta = document.getElementById('doc-textarea');
    const ov = document.getElementById('doc-typeset-overlay');
    const lineEl = ov.querySelector('.doc-typeset-line');
    const computed = window.getComputedStyle(ta);
    const padLeft = parseFloat(computed.paddingLeft);

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
    for (let offset = 0; offset <= lineStr.length; offset++) {
      mirror.textContent = lineStr.substring(0, offset);
      const marker = document.createElement('span');
      marker.textContent = '|';
      mirror.appendChild(marker);
      const caretRect = marker.getBoundingClientRect();
      const mirrorRect = mirror.getBoundingClientRect();
      const measuredCaretX = caretRect.left - mirrorRect.left;

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

      const diff = Math.abs(measuredCaretX - overlayMeasuredX);
      results.push({
        offset,
        char: lineStr[offset] || '<END>',
        measuredCaretX: Number(measuredCaretX.toFixed(2)),
        overlayMeasuredX: Number(overlayMeasuredX.toFixed(2)),
        diff: Number(diff.toFixed(2)),
      });
    }

    document.body.removeChild(mirror);
    return results;
  }, line1);

  console.log('=== Isolation Test: x^(n+1) ===');
  console.table(res1);

  // 2. Measure x^2 in isolation
  const line2 = 'x^2';
  await textarea.fill(line2);
  await page.waitForTimeout(200);

  const res2 = await page.evaluate((lineStr) => {
    const ta = document.getElementById('doc-textarea');
    const ov = document.getElementById('doc-typeset-overlay');
    const lineEl = ov.querySelector('.doc-typeset-line');
    const computed = window.getComputedStyle(ta);
    const padLeft = parseFloat(computed.paddingLeft);

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
    for (let offset = 0; offset <= lineStr.length; offset++) {
      mirror.textContent = lineStr.substring(0, offset);
      const marker = document.createElement('span');
      marker.textContent = '|';
      mirror.appendChild(marker);
      const caretRect = marker.getBoundingClientRect();
      const mirrorRect = mirror.getBoundingClientRect();
      const measuredCaretX = caretRect.left - mirrorRect.left;

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

      const diff = Math.abs(measuredCaretX - overlayMeasuredX);
      results.push({
        offset,
        char: lineStr[offset] || '<END>',
        measuredCaretX: Number(measuredCaretX.toFixed(2)),
        overlayMeasuredX: Number(overlayMeasuredX.toFixed(2)),
        diff: Number(diff.toFixed(2)),
      });
    }

    document.body.removeChild(mirror);
    return results;
  }, line2);

  console.log('=== Isolation Test: x^2 ===');
  console.table(res2);

  await browser.close();
}

measureIsolation().catch(console.error);
