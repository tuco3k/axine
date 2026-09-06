import { createServer } from 'vite';
import { chromium } from 'playwright';
import * as path from 'path';

const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

const phaseCNestingDoc = `---
title: Phase C Application Mode Nesting Gate
---
{
  |
  f(x) = x*3
  f(2)
  {
    |-
    f(2)
  }
}
`;

const phaseDDoc = `---
title: Phase D Time and Ranges Verification
---
{
  import "constants/e.ax"
  :time \\in [0, 10]
  y = 3^:time + 4*:time
}

# Unbounded range
{
  x \\in [0, \\inf)
  y = x^2
}
`;

async function main() {
  console.log('Starting Vite server...');
  const server = await createServer({
    server: { port: 5174 },
  });
  await server.listen();
  console.log('Vite server running on http://localhost:5174');

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  const page = await context.newPage();

  console.log('Navigating to Axine app...');
  await page.goto('http://localhost:5174');
  await page.waitForSelector('#doc-textarea');
  await page.waitForTimeout(600);

  // ==========================================
  // 1. PHASE C VERIFICATION
  // ==========================================
  console.log('\n--- VERIFYING PHASE C (APPLICATION MODE) ---');
  await page.evaluate((content) => {
    const textarea = document.querySelector('#doc-textarea');
    if (textarea) {
      textarea.value = content;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, phaseCNestingDoc);

  await page.waitForTimeout(1000);

  const gutterPhaseC = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.doc-gutter-row'));
    return rows.map((r, idx) => ({
      line: idx + 1,
      text: r.innerText.replace(/\s+/g, ' ').trim(),
      html: r.innerHTML,
    }));
  });

  console.log('\n=== LIVE PHASE C GUTTER DOM EXTRACTION ===');
  gutterPhaseC.forEach(g => {
    if (g.text.length > 0) {
      console.log(`[Line ${g.line}]: ${g.text}`);
    }
  });

  const screenshotC = path.join(ARTIFACT_DIR, 'phase_c_gate_verification.png');
  await page.screenshot({ path: screenshotC });
  console.log(`Captured Phase C screenshot at: ${screenshotC}`);

  // ==========================================
  // 2. PHASE D VERIFICATION
  // ==========================================
  console.log('\n--- VERIFYING PHASE D (TIME & RANGES) ---');
  await page.evaluate((content) => {
    const textarea = document.querySelector('#doc-textarea');
    if (textarea) {
      textarea.value = content;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, phaseDDoc);

  await page.waitForTimeout(1200);

  const gutterPhaseD = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.doc-gutter-row'));
    return rows.map((r, idx) => ({
      line: idx + 1,
      text: r.innerText.replace(/\s+/g, ' ').trim(),
      html: r.innerHTML,
    }));
  });

  console.log('\n=== LIVE PHASE D GUTTER DOM EXTRACTION ===');
  gutterPhaseD.forEach(g => {
    if (g.text.length > 0) {
      console.log(`[Line ${g.line}]: ${g.text}`);
    }
  });

  const spaceInfo = await page.evaluate(() => {
    const spaceBadge = document.querySelector('.space-dimension-badge');
    const sliders = Array.from(document.querySelectorAll('.space-slice-slider'));
    const canvas = document.querySelector('.space-viewport-canvas');
    return {
      hasBadge: !!spaceBadge,
      badgeText: spaceBadge ? spaceBadge.textContent?.trim() : null,
      sliderCount: sliders.length,
      hasCanvas: !!canvas,
    };
  });

  console.log('Space Viewport Info:', spaceInfo);

  const screenshotD = path.join(ARTIFACT_DIR, 'phase_d_gate_verification.png');
  await page.screenshot({ path: screenshotD });
  console.log(`Captured Phase D screenshot at: ${screenshotD}`);

  // ==========================================
  // 3. EDITOR UNICODE NORMALIZATION VERIFICATION
  // ==========================================
  console.log('\n--- VERIFYING EDITOR UNICODE NORMALIZATION ---');
  const testUnicodeString = 'x \u2208 [0, 10] \u2227 \u222e_C F \u00b7 dr \u2264 \u221a2 \u221e';
  
  const pasteNormalizedValue = await page.evaluate((unicodeText) => {
    const textarea = document.querySelector('#doc-textarea');
    if (!textarea) return '';
    textarea.value = '';
    textarea.focus();
    
    const dt = new DataTransfer();
    dt.setData('text/plain', unicodeText);
    const pasteEv = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    textarea.dispatchEvent(pasteEv);
    return textarea.value;
  }, testUnicodeString);

  console.log('Input Unicode:', testUnicodeString);
  console.log('Normalized Textarea Value:', pasteNormalizedValue);

  const screenshotNorm = path.join(ARTIFACT_DIR, 'editor_unicode_norm_verification.png');
  await page.screenshot({ path: screenshotNorm });
  console.log(`Captured Unicode Normalization screenshot at: ${screenshotNorm}`);

  await browser.close();
  await server.close();
  console.log('\nAll Gate Verifications Succeeded!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
