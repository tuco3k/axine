import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function main() {
  console.log('=== CAPTURING LANGUAGE REFERENCE AT 3 SCROLL POSITIONS ===');
  const server = await createServer({
    configFile: path.resolve(__dirname, '../vite.config.ts'),
    server: { port: 5388 },
  });
  await server.listen();
  console.log('Server listening on http://localhost:5388');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  await page.goto('http://localhost:5388');
  await page.waitForFunction(() => typeof window.editor !== 'undefined');

  const content = fs.readFileSync('documents/language_reference.ax', 'utf8');

  console.log(`Loading language_reference.ax (${content.split('\n').length} lines)...`);
  const t0 = Date.now();
  await page.evaluate(({ text }) => {
    window.editor.openInitialDocument(text);
    const pc = window.editor.paneContainer;
    if (pc) {
      const rootLeafId = pc.getLayout().root.id;
      pc.split(rootLeafId, 'horizontal', 'after', {
        id: 'tab_results_lang',
        type: 'results',
        title: 'Results Gutter',
      });
      pc.render();
    }
  }, { text: content });

  // Wait for worker evaluation to complete
  await page.waitForFunction(() => !window.editor.state.getIsEvaluating(), { timeout: 30000 });
  const loadDuration = Date.now() - t0;
  console.log(`Loaded and evaluated in ${loadDuration}ms`);

  // Position 1: Top (scrollTop = 0)
  console.log('\n--- Capturing Position 1: Top (Lines 1–45) ---');
  await page.evaluate(() => {
    const gutter = document.querySelector('#doc-gutter');
    const textarea = document.querySelector('#doc-textarea');
    const overlay = document.querySelector('#doc-typeset-overlay');
    const lineNums = document.querySelector('#doc-line-numbers');
    if (gutter) gutter.scrollTop = 0;
    if (textarea) textarea.scrollTop = 0;
    if (overlay) overlay.scrollTop = 0;
    if (lineNums) lineNums.scrollTop = 0;
  });
  await page.waitForTimeout(600);
  const pos1Path = path.join(ARTIFACT_DIR, 'language_ref_pos1_top.png');
  await page.screenshot({ path: pos1Path });
  console.log(`Saved ${pos1Path}`);

  // Position 2: Middle (Line 333: Standing Expressions & Reductions)
  console.log('\n--- Capturing Position 2: Middle (Lines 333–365) ---');
  await page.evaluate(() => {
    const gutterRow = document.querySelector('.doc-gutter-row[data-line="333"]');
    gutterRow?.scrollIntoView({ block: 'start' });

    const textarea = document.querySelector('#doc-textarea');
    const overlay = document.querySelector('#doc-typeset-overlay');
    const lineNums = document.querySelector('#doc-line-numbers');
    if (textarea) {
      textarea.scrollTop = 8169;
      textarea.dispatchEvent(new Event('scroll'));
    }
    if (overlay) overlay.scrollTop = 8169;
    if (lineNums) lineNums.scrollTop = 8169;
  });
  await page.waitForTimeout(800);
  const pos2Path = path.join(ARTIFACT_DIR, 'language_ref_pos2_middle.png');
  await page.screenshot({ path: pos2Path });
  console.log(`Saved ${pos2Path}`);

  // Position 3: Bottom (Line 708: Sphere Slice 3D and 2D spaces)
  console.log('\n--- Capturing Position 3: Bottom (Lines 708–740, Worked Programs) ---');
  await page.evaluate(() => {
    const gutterRow = document.querySelector('.doc-gutter-row[data-line="709"]');
    gutterRow?.scrollIntoView({ block: 'start' });

    const textarea = document.querySelector('#doc-textarea');
    const overlay = document.querySelector('#doc-typeset-overlay');
    const lineNums = document.querySelector('#doc-line-numbers');
    if (textarea) {
      textarea.scrollTop = 17357;
      textarea.dispatchEvent(new Event('scroll'));
    }
    if (overlay) overlay.scrollTop = 17357;
    if (lineNums) lineNums.scrollTop = 17357;
  });
  await page.waitForTimeout(1000);
  const pos3Path = path.join(ARTIFACT_DIR, 'language_ref_pos3_bottom.png');
  await page.screenshot({ path: pos3Path });
  console.log(`Saved ${pos3Path}`);

  await browser.close();
  await server.close();
  console.log('\nAll 3 position screenshots captured successfully.');
}

main().catch(console.error);
