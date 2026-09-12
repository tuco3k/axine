import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function run() {
  const server = await createServer({
    configFile: path.resolve(__dirname, '../vite.config.ts'),
    server: { port: 5198 }
  });
  await server.listen();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Clear localStorage before navigation
  await page.addInitScript(() => {
    localStorage.clear();
  });

  console.log('Navigating to http://localhost:5198...');
  await page.goto('http://localhost:5198');
  await page.waitForSelector('.doc-header');
  await page.waitForTimeout(1000);

  // 1. Check top chrome band height
  const header = await page.$('.doc-header');
  const headerBox = await header.boundingBox();
  console.log('Header height (target ~30px):', headerBox.height);

  // 2. Open File menu to verify Clear Document is inside File
  await page.click('#doc-file-menu-btn');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'file_menu_with_clear.png') });
  console.log('Saved file_menu_with_clear.png');

  // Close File menu
  await page.click('#doc-file-menu-btn');
  await page.waitForTimeout(200);

  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

  // 3. Open + View menu and open parabola space tab
  await page.evaluate(() => {
    const pc = window.editor.paneContainer;
    const available = window.editor.getAvailableSpaces();
    console.log('Available spaces count:', available.length);
    const parabolaSpace = available.find(s => s.lineIdx === 12 || s.title.includes('0.5 * g'));
    if (parabolaSpace) {
      console.log('Parabola space found:', parabolaSpace.lineIdx, parabolaSpace.title);
      console.log('Entity details:', parabolaSpace.space.entities[0]);
      const rootLeaf = pc.layout.root;
      if (rootLeaf.type === 'leaf') {
        pc.split(rootLeaf.id, 'horizontal', 'after', {
          id: 'tab_space_parabola',
          type: 'space',
          title: 'L13: {\\axis :time, :y; ...}',
          documentId: window.editor.activeSessionId,
          spaceLineIdx: parabolaSpace.lineIdx,
          spaceExprText: parabolaSpace.title,
        });
      }
      const vp = pc.spaceViewports.get('tab_space_parabola');
      if (vp) {
        console.log('Viewport camera state:', JSON.stringify(vp.getCameraState()));
      }
    }
  });
  await page.waitForTimeout(1000);

  // 4. Take full screenshot with parabola and document
  const mainScreenshotPath = path.join(ARTIFACT_DIR, 'parabola_and_compact_chrome_verified.png');
  await page.screenshot({ path: mainScreenshotPath });
  console.log('Saved parabola_and_compact_chrome_verified.png');

  // 5. Also take a close-up screenshot of the space canvas to examine the parabola curve
  const canvasEl = await page.$('.pane-space-viewport-wrapper');
  if (canvasEl) {
    await canvasEl.screenshot({ path: path.join(ARTIFACT_DIR, 'parabola_space_detail.png') });
    console.log('Saved parabola_space_detail.png');
  }

  // 6. Test closing pane to verify empty panes cannot exist and space redistributes
  await page.evaluate(() => {
    const pc = window.editor.paneContainer;
    // Close the parabola tab -> leaf disappears, document absorbs full workspace width
    pc.closeTab(pc.layout.activePaneId, 'tab_space_parabola');
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'pane_close_redistribute_verified.png') });
  console.log('Saved pane_close_redistribute_verified.png');

  await browser.close();
  await server.close();
  console.log('Visual verification complete!');
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
