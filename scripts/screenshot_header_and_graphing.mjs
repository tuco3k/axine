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
  const lineNumbers = await page.$$('.doc-line-number');
  console.log('Line numbers count:', lineNumbers.length);
  const overlayLines = await page.$$('.doc-typeset-line');
  console.log('Overlay lines count:', overlayLines.length);

  // 4c: Test graph(2x)
  console.log('Testing graph(2x)...');
  await page.evaluate(() => {
    (window).editor.setText('graph(2x)');
  });
  await page.waitForTimeout(500);
  await page.click('#doc-run-btn');
  await page.waitForTimeout(600);

  // Take screenshot with 2D graph
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'graph_2x.png') });
  console.log('Saved graph_2x.png');

  // 4c: Test graph(sin x cos y, x in -3..3, y in -3..3)
  console.log('Testing graph(sin x cos y, x in -3..3, y in -3..3)...');
  await page.evaluate(() => {
    (window).editor.setText('graph(sin x cos y, x in -3..3, y in -3..3)');
  });
  await page.waitForTimeout(500);
  await page.click('#doc-run-btn');
  await page.waitForTimeout(600);

  // Take screenshot with 3D graph
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'graph_3d_surface.png') });
  console.log('Saved graph_3d_surface.png');

  await browser.close();
  await server.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
