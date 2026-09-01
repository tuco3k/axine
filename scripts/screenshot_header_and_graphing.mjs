import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'path';

const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function main() {
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    server: { port: 5174 },
  });
  await server.listen();

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:5174...');
  await page.goto('http://localhost:5174');
  await page.waitForSelector('.doc-header');

  // Screenshot the header specifically
  const header = await page.$('.doc-header');
  if (header) {
    await header.screenshot({ path: path.join(ARTIFACT_DIR, 'header_axine.png') });
    console.log('Saved header_axine.png');
  }

  // Full page screenshot of initial state
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'initial_app_state.png') });
  console.log('Saved initial_app_state.png');

  // Investigate Bug 4a: Editor pane state
  const editorHTML = await page.$eval('.doc-pane-left', el => el.innerHTML);
  console.log('Editor pane innerHTML length:', editorHTML.length);
  const textareaVal = await page.$eval('#doc-textarea', el => (el).value);
  console.log('Textarea value length:', textareaVal.length);
  const lineNumbers = await page.$$('.doc-line-num');
  console.log('Line numbers count:', lineNumbers.length);
  const overlayLines = await page.$$('.doc-typeset-line');
  console.log('Overlay lines count:', overlayLines.length);

  // 4c: Test document containing BOTH graph(2x) and graph(sin x cos y, x in -3..3, y in -3..3)
  console.log('Testing combined document with both graphs...');
  const combinedDoc = 'graph(2x)\ngraph(sin x cos y, x in -3..3, y in -3..3)';
  await page.evaluate((text) => {
    (window).editor.setText(text);
  }, combinedDoc);
  await page.waitForTimeout(600);
  await page.click('#doc-run-btn');
  await page.waitForTimeout(800);

  // Take full screenshot with both graphs
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'combined_both_graphs.png') });
  console.log('Saved combined_both_graphs.png');

  // Also screenshot the results panel specifically
  const resultsPanel = await page.$('#doc-work-panel');
  if (resultsPanel) {
    await resultsPanel.screenshot({ path: path.join(ARTIFACT_DIR, 'results_panel_both_graphs.png') });
    console.log('Saved results_panel_both_graphs.png');
  }

  await browser.close();
  await server.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
