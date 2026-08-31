import { chromium } from 'playwright';
import * as path from 'path';

const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function runLiveVerification() {
  console.log('Launching browser for in-context live editor visualization verification...');
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

  // Input 3 mathematical expressions into the live document editor
  const documentContent = [
    '∫ from 1 to 3 of (3*x + 1) dx',
    'd//dx (x^3 - 2*x)',
    'lim(x -> 3) (2*x + 4)'
  ].join('\n');

  await page.evaluate((content) => {
    const editor = window.editor;
    if (editor) {
      editor.textarea.value = content;
      editor.updateTypesetOverlay();
      editor.updateCaret();
      editor.state.setText(content);
    }
  }, documentContent);

  await page.waitForTimeout(300);

  // Helper to test each visualization in live context
  async function capturePopover(theme, lineIndex, artifactName) {
    // Set theme
    await page.evaluate((th) => {
      document.documentElement.setAttribute('data-theme', th);
    }, theme);

    await page.waitForTimeout(150);

    const extraction = await page.evaluate(({ lineIdx }) => {
      const editor = window.editor;
      const lines = document.querySelectorAll('.doc-typeset-line');
      const line = lines[lineIdx];
      if (!line) return { error: `Line ${lineIdx} not found in DOM` };

      // Dispatch click event on line to trigger popover
      line.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      const popover = document.getElementById('doc-math-popover');
      if (!popover || popover.classList.contains('hidden')) {
        return { error: 'Popover not open' };
      }

      // Read DOM metrics
      return {
        theme: document.documentElement.getAttribute('data-theme'),
        lineIndex: lineIdx + 1,
        lineText: editor?.textarea?.value?.split('\n')[lineIdx],
        role: popover.querySelector('.popover-role')?.textContent?.trim(),
        badge: popover.querySelector('.popover-symbol-badge')?.textContent?.trim(),
        sliderBadge: popover.querySelector('.vis-accent-badge')?.textContent?.trim(),
        metrics: Array.from(popover.querySelectorAll('.vis-metric')).map(m => ({
          key: m.querySelector('.vis-metric-key')?.textContent?.trim(),
          val: m.querySelector('.vis-metric-val')?.textContent?.trim()
        })),
        innerText: popover.innerText
      };
    }, { lineIdx: lineIndex });

    console.log(`\n=== Extracted Live DOM (${theme.toUpperCase()} - Line ${lineIndex + 1}) ===`);
    console.log(JSON.stringify(extraction, null, 2));

    await page.waitForTimeout(200);
    const savePath = path.join(ARTIFACT_DIR, artifactName);
    await page.screenshot({ path: savePath });
    console.log(`Saved screenshot: ${artifactName}`);

    return extraction;
  }

  // --- DARK THEME CAPTURES ---
  console.log('\n--- Capturing Dark Theme In Real Document Context ---');
  await capturePopover('dark', 0, 'typeset_f3_live_dark_riemann.png');
  await capturePopover('dark', 1, 'typeset_f3_live_dark_tangent.png');
  await capturePopover('dark', 2, 'typeset_f3_live_dark_limit.png');

  // --- LIGHT THEME CAPTURES ---
  console.log('\n--- Capturing Light Theme In Real Document Context ---');
  await capturePopover('light', 0, 'typeset_f3_live_light_riemann.png');
  await capturePopover('light', 1, 'typeset_f3_live_light_tangent.png');
  await capturePopover('light', 2, 'typeset_f3_live_light_limit.png');

  await browser.close();
  console.log('\nLive In-Context Editor Verification Completed Successfully.');
}

runLiveVerification().catch(console.error);
