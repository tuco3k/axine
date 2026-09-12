import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'path';

async function run() {
  console.log('Starting Vite server for visual verification...');
  const server = await createServer({
    configFile: resolve(process.cwd(), 'vite.config.ts'),
    server: { port: 5176 },
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

    // 1. Verify Top Bar: #corpus-select is removed, File menu and + View exist
    const corpusSelect = await page.$('#corpus-select');
    console.log('Corpus select element present:', corpusSelect !== null);
    if (corpusSelect !== null) {
      throw new Error('#corpus-select should have been removed');
    }

    // 2. Load a 2D Space document with library function (:sqrt)
    console.log('Setting up document with 2D library function space...');
    const docText = [
      '# Document with 1D, 2D, and 3D Spaces',
      '\\import "lib/sqrt.ax"',
      '',
      '# 1D Root Space',
      '{x^2 - 4 = 0}',
      '',
      '# 2D Curve with Library Function :sqrt',
      '{\\axis x, y; y = :sqrt(x)}',
      '',
      '# 3D Surface Sphere Space',
      '{\\axis x, y, z; x^2 + y^2 + z^2 = 9}',
    ].join('\n');

    await page.evaluate((text) => {
      const editor = (window).editor || (window).docEditor;
      if (editor) {
        editor.setText(text);
      } else {
        const textarea = document.querySelector('#doc-textarea');
        if (textarea) {
          textarea.value = text;
          textarea.dispatchEvent(new Event('input'));
        }
      }
    }, docText);

    // Click Run
    await page.click('#doc-run-btn');
    await page.waitForTimeout(600);

    // 3. Open 2D Space Tab via + View Menu
    console.log('Opening 2D Space Tab from + View menu...');
    await page.click('#doc-view-menu-btn');
    await page.waitForSelector('#doc-view-dropdown:not(.hidden)');
    const spaceButtons = await page.$$('#doc-view-dropdown .doc-file-menu-item');
    console.log(`Found ${spaceButtons.length} menu items in View dropdown`);

    // Click the 2D space item (L8: y = :sqrt(x))
    let clicked2D = false;
    for (const btn of spaceButtons) {
      const text = await btn.textContent();
      console.log('Dropdown item:', text);
      if (text && (text.includes('sqrt') || text.includes('L8:') || text.includes('axis x, y; y ='))) {
        await btn.click();
        clicked2D = true;
        break;
      }
    }
    if (!clicked2D && spaceButtons.length > 5) {
      await spaceButtons[5].click();
    }
    await page.waitForTimeout(600);

    // 4. Test 2D Inspection by clicking on the curve y = :sqrt(x) at x = 4, y = 2
    console.log('Performing 2D inspection on canvas at x=4, y=2...');
    await page.evaluate(() => {
      const pc = (window).editor?.paneContainer;
      const vps = Array.from(pc?.getAllSpaceViewports().values() || []);
      console.log('Found space viewports count:', vps.length);
      const vp2d = vps.find(v => v.viewMode === '2d') || vps[vps.length - 1];
      if (vp2d) {
        vp2d.inspectAtCoordinate(4.0, 2.0);
      }
    });
    await page.waitForTimeout(400);

    // Screenshot 2D Inspection
    await page.screenshot({
      path: '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b/gate1_2d_inspection.png',
    });
    console.log('Saved 2D inspection screenshot');

    // Extract Layer 3 reduction trace for 2D library function point
    const reductionText = await page.evaluate(() => {
      const panel = document.querySelector('.spatial-inspector-panel');
      if (!panel) return 'No panel found';
      return panel.innerText;
    });
    console.log('\n================ ACTUAL LAYER 3 REDUCTION TRACE ================');
    console.log(reductionText);
    console.log('=================================================================\n');

    // 5. Open 1D Root Space Tab
    console.log('Opening 1D Space Tab...');
    await page.click('#doc-view-menu-btn');
    await page.waitForSelector('#doc-view-dropdown:not(.hidden)');
    const viewItems = await page.$$('#doc-view-dropdown .doc-file-menu-item');
    for (const btn of viewItems) {
      const text = await btn.textContent();
      if (text && (text.includes('x^2 - 4') || text.includes('L5:'))) {
        await btn.click();
        break;
      }
    }
    await page.waitForTimeout(600);

    // Inspect 1D point at root x = 2
    console.log('Performing 1D inspection at root x=2...');
    await page.evaluate(() => {
      const pc = (window).editor?.paneContainer;
      const vps = Array.from(pc?.getAllSpaceViewports().values() || []);
      const vp1d = vps.find(v => v.viewMode === '1d') || vps[0];
      if (vp1d) {
        vp1d.inspectAtCoordinate(2.0);
      }
    });
    await page.waitForTimeout(400);

    await page.screenshot({
      path: '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b/gate2_1d_inspection.png',
    });
    console.log('Saved 1D inspection screenshot');

    // 6. Open 3D Space Tab
    console.log('Opening 3D Space Tab...');
    await page.click('#doc-view-menu-btn');
    await page.waitForSelector('#doc-view-dropdown:not(.hidden)');
    const viewItems3D = await page.$$('#doc-view-dropdown .doc-file-menu-item');
    for (const btn of viewItems3D) {
      const text = await btn.textContent();
      if (text && (text.includes('x^2 + y^2 + z^2') || text.includes('L11:') || text.includes('L10:'))) {
        await btn.click();
        break;
      }
    }
    await page.waitForTimeout(600);

    // Inspect 3D surface point on sphere (x=0, y=0, z=3)
    console.log('Performing 3D inspection at (0, 0, 3)...');
    await page.evaluate(() => {
      const pc = (window).editor?.paneContainer;
      const vps = Array.from(pc?.getAllSpaceViewports().values() || []);
      const vp3d = vps.find(v => v.viewMode === '3d') || vps[vps.length - 1];
      if (vp3d) {
        vp3d.inspectAtCoordinate(0.0, 0.0, 3.0);
      }
    });
    await page.waitForTimeout(400);

    await page.screenshot({
      path: '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b/gate3_3d_inspection.png',
    });
    console.log('Saved 3D inspection screenshot');

    // Full workspace screenshot with split pane
    await page.screenshot({
      path: '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b/full_workspace_inspection.png',
    });
    console.log('Saved full workspace inspection screenshot');

  } catch (err) {
    console.error('Visual verification error:', err);
    throw err;
  } finally {
    await browser.close();
    await server.close();
    console.log('Visual verification complete.');
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
