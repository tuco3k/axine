import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'path';

const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function run() {
  console.log('Starting Vite server for BEFORE audit screenshots...');
  const server = await createServer({
    configFile: resolve(process.cwd(), 'vite.config.ts'),
    server: { port: 5182 },
  });
  await server.listen();
  const address = server.httpServer.address();
  const port = address.port;
  console.log(`Vite server running at http://localhost:${port}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  try {
    await page.goto(`http://localhost:${port}`);
    await page.waitForSelector('.doc-editor-surface', { timeout: 10000 });

    // -------------------------------------------------------------
    // Surface 1: Spatial Inspector Panel (HUD)
    // -------------------------------------------------------------
    console.log('Capturing Surface 1: Spatial Inspector Panel...');
    const docSphere = [
      '# 3D Sphere Surface Space',
      '{\\axis x, y, z; x^2 + y^2 + z^2 = 9}',
    ].join('\n');

    await page.evaluate((text) => {
      const editor = (window).editor;
      if (editor) editor.setText(text);
    }, docSphere);
    await page.click('#doc-run-btn');
    await page.waitForTimeout(600);

    // Open 3D Space Tab
    await page.click('#doc-view-menu-btn');
    await page.waitForSelector('#doc-view-dropdown:not(.hidden)');
    const viewItems3D = await page.$$('#doc-view-dropdown .doc-file-menu-item');
    for (const btn of viewItems3D) {
      const text = await btn.textContent();
      if (text && (text.includes('x^2 + y^2 + z^2') || text.includes('L2:'))) {
        await btn.click();
        break;
      }
    }
    await page.waitForTimeout(600);

    // Inspect 3D surface point
    await page.evaluate(() => {
      const pc = (window).editor?.paneContainer;
      const vps = Array.from(pc?.getAllSpaceViewports().values() || []);
      const vp3d = vps.find(v => v.viewMode === '3d') || vps[vps.length - 1];
      if (vp3d) {
        vp3d.inspectAtCoordinate(0.0, 0.0, 3.0);
      }
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(ARTIFACT_DIR, 'audit_after_surface1_inspector.png') });
    console.log('Saved audit_after_surface1_inspector.png');

    // -------------------------------------------------------------
    // Surface 2: Toolbar, File & +View Menus, and Tab Bar
    // -------------------------------------------------------------
    console.log('Capturing Surface 2: Toolbar, File Menu & Tab Bar...');
    // Switch back to document tab
    await page.evaluate(() => {
      const firstTab = document.querySelector('.pane-tab, .doc-session-tab');
      if (firstTab) firstTab.click();
    });
    await page.waitForTimeout(300);

    // Open File Menu dropdown
    await page.click('#doc-file-menu-btn');
    await page.waitForSelector('#doc-file-dropdown:not(.hidden)');
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(ARTIFACT_DIR, 'audit_after_surface2_toolbar_menus.png') });
    console.log('Saved audit_after_surface2_toolbar_menus.png');
    // Dismiss menu
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // -------------------------------------------------------------
    // Surface 3: Results Stream & Result Cards (Derivations & Standing)
    // -------------------------------------------------------------
    console.log('Capturing Surface 3: Results Stream & Cards...');
    await page.evaluate(() => {
      const firstTab = document.querySelector('.pane-tab, .doc-session-tab');
      if (firstTab) firstTab.click();
    });
    await page.waitForTimeout(200);

    const docDeriv = [
      '# Mechanics & Step-by-Step Derivation',
      'x = 5',
      'y = 12',
      'r = :sqrt(x^2 + y^2)',
      '\\expand r',
      '{x^2 + y^2 = 25}',
    ].join('\n');

    await page.evaluate((text) => {
      const editor = (window).editor;
      if (editor) editor.setText(text);
    }, docDeriv);
    await page.click('#doc-run-btn');
    await page.waitForTimeout(600);

    // Open Results View
    await page.click('#doc-view-menu-btn');
    await page.waitForSelector('#doc-view-dropdown:not(.hidden)');
    const resultsMenuBtn = await page.$('#doc-view-dropdown .doc-file-menu-item:has-text("Results")');
    if (resultsMenuBtn) await resultsMenuBtn.click();
    await page.waitForTimeout(400);

    await page.screenshot({ path: resolve(ARTIFACT_DIR, 'audit_after_surface3_results_stream.png') });
    console.log('Saved audit_after_surface3_results_stream.png');

    // -------------------------------------------------------------
    // Surface 4: Scope / Explainer Popover
    // -------------------------------------------------------------
    console.log('Capturing Surface 4: Explainer Popover...');
    await page.evaluate(() => {
      const firstTab = document.querySelector('.pane-tab, .doc-session-tab');
      if (firstTab) firstTab.click();
    });
    await page.waitForTimeout(200);

    const docIntegral = [
      '# Calculus Definite Integral',
      '\\int_0^2 x^2 dx',
    ].join('\n');

    await page.evaluate((text) => {
      const editor = (window).editor;
      if (editor) editor.setText(text);
    }, docIntegral);
    await page.click('#doc-run-btn');
    await page.waitForTimeout(600);

    // Trigger math popover on 'dx' symbol
    await page.evaluate(() => {
      const popover = (window).editor?.mathPopover;
      const targetEl = document.querySelector('.doc-editor-surface') || document.body;
      if (popover && targetEl) {
        const { explainSymbol } = window;
        const explanation = explainSymbol ? explainSymbol('dx', { parentType: 'integral', exprString: '\\int_0^2 x^2 dx' }) : {
          symbol: 'dx',
          role: 'Differential Integration Element',
          whatItIs: 'An infinitesimal displacement increment along the integration coordinate axis x.',
          whyItIsHere: 'Specifies the active integration variable and scales differential partitioning slices in definite integration.',
          showMe: '\\lim_{\\Delta x \\to 0} \\sum f(x_i) \\Delta x',
          goDeeper: 'In differential geometry, dx denotes the dual basis 1-form corresponding to the coordinate vector field \\partial/\\partial x.',
        };
        popover.show(explanation, targetEl);
      }
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(ARTIFACT_DIR, 'audit_after_surface4_popover.png') });
    console.log('Saved audit_after_surface4_popover.png');
    // Hide popover
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // -------------------------------------------------------------
    // Surface 5: Error Displays & Empty States
    // -------------------------------------------------------------
    console.log('Capturing Surface 5: Error Displays & Empty States...');
    await page.evaluate(() => {
      const firstTab = document.querySelector('.pane-tab, .doc-session-tab');
      if (firstTab) firstTab.click();
    });
    await page.waitForTimeout(200);

    const docError = [
      '# Syntax & Semantic Error Handling',
      'y = 4 + * 5',
      'z = 10 / 0',
      'w = undefined_function(12)',
    ].join('\n');

    await page.evaluate((text) => {
      const editor = (window).editor;
      if (editor) editor.setText(text);
    }, docError);
    await page.click('#doc-run-btn');
    await page.waitForTimeout(600);

    // Open Results View
    await page.click('#doc-view-menu-btn');
    await page.waitForSelector('#doc-view-dropdown:not(.hidden)');
    const errorResultsBtn = await page.$('#doc-view-dropdown .doc-file-menu-item:has-text("Results")');
    if (errorResultsBtn) await errorResultsBtn.click();
    await page.waitForTimeout(400);

    await page.screenshot({ path: resolve(ARTIFACT_DIR, 'audit_after_surface5_error_displays.png') });
    console.log('Saved audit_after_surface5_error_displays.png');

  } catch (err) {
    console.error('Error in capture script:', err);
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
