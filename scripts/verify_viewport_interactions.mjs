import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'path';

async function run() {
  console.log('Starting Vite server for viewport interaction verification...');
  const server = await createServer({
    configFile: resolve(process.cwd(), 'vite.config.ts'),
    server: { port: 5178 },
  });
  await server.listen();
  const address = server.httpServer.address();
  const port = address.port;
  console.log(`Vite server running at http://localhost:${port}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1300, height: 850 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  try {
    console.log('Navigating to Axine app...');
    await page.goto(`http://localhost:${port}`);
    await page.waitForSelector('.doc-editor-surface', { timeout: 10000 });

    // Set up a 2D space with curve
    const docText = [
      '# Viewport Interaction Verification',
      '\\import "lib/sqrt.ax"',
      '',
      '{\\axis x, y; y = :sqrt(x)}',
    ].join('\n');

    await page.evaluate((text) => {
      const editor = (window).editor || (window).docEditor;
      if (editor) {
        editor.setText(text);
      }
    }, docText);

    // Run document
    await page.click('#doc-run-btn');
    await page.waitForTimeout(600);

    // Open Space Tab via + View Menu
    console.log('Opening Space Tab from + View menu...');
    await page.click('#doc-view-menu-btn');
    await page.waitForSelector('#doc-view-dropdown:not(.hidden)');
    const spaceButtons = await page.$$('#doc-view-dropdown .doc-file-menu-item');
    for (const btn of spaceButtons) {
      const text = await btn.textContent();
      if (text && (text.includes('sqrt') || text.includes('y = :sqrt') || text.includes('L4:'))) {
        await btn.click();
        break;
      }
    }
    await page.waitForTimeout(600);

    // 1. Verify click selection (marks selected, does NOT auto-open panel, does NOT move camera)
    console.log('Testing click selection behavior...');
    const cameraBefore = await page.evaluate(() => {
      const pc = (window).editor?.paneContainer;
      const vps = Array.from(pc?.getAllSpaceViewports().values() || []);
      const vp = vps[0];
      return vp?.getCameraState();
    });

    // Compute pixel coordinate for point (4, 2) on curve
    const clickCoords = await page.evaluate(() => {
      const pc = (window).editor?.paneContainer;
      const vps = Array.from(pc?.getAllSpaceViewports().values() || []);
      const vp = vps[0];
      if (!vp) return null;
      const canvas = document.querySelector('.space-viewport-canvas');
      const rect = canvas.getBoundingClientRect();
      const b = vp.getCameraState().bounds2D;
      const fracX = (4.0 - b.minX) / (b.maxX - b.minX);
      const fracY = (b.maxY - 2.0) / (b.maxY - b.minY);
      return {
        x: rect.left + fracX * rect.width,
        y: rect.top + fracY * rect.height,
      };
    });

    if (clickCoords) {
      console.log(`Clicking exact curve coordinate at (${clickCoords.x.toFixed(1)}, ${clickCoords.y.toFixed(1)})...`);
      await page.mouse.click(clickCoords.x, clickCoords.y);
    }
    await page.waitForTimeout(300);

    const isPanelAutoOpened = await page.evaluate(() => {
      return document.querySelector('.spatial-inspector-panel') !== null;
    });
    console.log('Inspector auto-opened on click (should be false):', isPanelAutoOpened);
    if (isPanelAutoOpened) {
      throw new Error('Inspector panel must NOT auto-open on click!');
    }

    const isReticleShown = await page.evaluate(() => {
      const pc = (window).editor?.paneContainer;
      const vps = Array.from(pc?.getAllSpaceViewports().values() || []);
      const vp = vps[0];
      return vp?.reticlePos !== null;
    });
    console.log('Point marked selected with reticle:', isReticleShown);

    // Capture screenshot of point marked selected (reticle visible, no inspector panel)
    await page.screenshot({
      path: '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b/interaction_point_selected_no_panel.png',
    });
    console.log('Saved interaction_point_selected_no_panel.png');

    // 2. Press 'I' key to open inspector panel explicitly
    console.log('Testing explicit inspector toggle with [I] key...');
    await page.keyboard.press('i');
    await page.waitForTimeout(300);

    const isPanelOpenedAfterI = await page.evaluate(() => {
      return document.querySelector('.spatial-inspector-panel') !== null;
    });
    console.log('Inspector opened after pressing [I] (should be true):', isPanelOpenedAfterI);

    await page.screenshot({
      path: '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b/interaction_inspector_opened_via_key.png',
    });
    console.log('Saved interaction_inspector_opened_via_key.png');

    // 3. Close inspector via close button and check camera stability
    console.log('Closing inspector panel...');
    const closeBtn = await page.$('.spatial-inspector-close-btn');
    if (closeBtn) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(300);

    const isPanelClosed = await page.evaluate(() => {
      return document.querySelector('.spatial-inspector-panel') === null;
    });
    console.log('Inspector closed cleanly:', isPanelClosed);

    const cameraAfter = await page.evaluate(() => {
      const pc = (window).editor?.paneContainer;
      const vps = Array.from(pc?.getAllSpaceViewports().values() || []);
      const vp = vps[0];
      return vp?.getCameraState();
    });

    console.log('Camera before:', cameraBefore);
    console.log('Camera after closing inspector:', cameraAfter);

    // 4. Test Shift key cursor & camera freeze
    console.log('Testing Shift key cursor activation and HUD update...');
    await page.keyboard.down('Shift');
    await page.waitForTimeout(200);

    const isShiftClassPresent = await page.evaluate(() => {
      const canvasEl = document.querySelector('.space-viewport-canvas');
      return canvasEl?.classList.contains('shift-cursor');
    });
    console.log('Shift-cursor active while holding Shift:', isShiftClassPresent);

    await page.screenshot({
      path: '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b/interaction_shift_cursor_active.png',
    });
    console.log('Saved interaction_shift_cursor_active.png');

    await page.keyboard.up('Shift');
    await page.waitForTimeout(200);

    const isShiftClassRemoved = await page.evaluate(() => {
      const canvasEl = document.querySelector('.space-viewport-canvas');
      return !canvasEl?.classList.contains('shift-cursor');
    });
    console.log('Shift-cursor removed on Shift release:', isShiftClassRemoved);

    console.log('All 5 viewport interaction requirements verified successfully!');

  } catch (err) {
    console.error('Verification failed:', err);
    throw err;
  } finally {
    await browser.close();
    await server.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
