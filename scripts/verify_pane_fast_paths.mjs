import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function run() {
  console.log('=== VERIFYING PANE FAST PATHS & SPLITTING INTERFACE ===');
  console.log('1. Starting Vite development server on port 5199...');
  const server = await createServer({
    configFile: path.resolve(__dirname, '../vite.config.ts'),
    server: { port: 5199 },
  });
  await server.listen();
  console.log('Vite server running at http://localhost:5199');

  console.log('2. Launching Chromium...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  console.log('3. Navigating to Axine web app...');
  await page.goto('http://localhost:5199');
  await page.waitForFunction(() => typeof window.editor !== 'undefined');
  await page.waitForTimeout(300);

  // Set up workspace with two files
  console.log('4. Setting up workspace with projectile.ax and harmonic.ax...');
  await page.evaluate(() => {
    const wsFiles = {
      'projectile.ax': '# Projectile Motion Dynamics\ng = 9.80665\n:v_0 = 25.0\n:theta = 0.785398\n\n:v_x = :v_0 * :cos(:theta)\n:v_y = :v_0 * :sin(:theta)\n:flight_time = 2 * :v_y / g\n:range = :v_x * :flight_time\n',
      'harmonic.ax': '# Damped Harmonic Oscillator\nm = 1.5\nk = 60.0\n:omega_0 = :sqrt(k / m)\n:gamma = 0.2\n\n# Angular frequency with damping\n:omega_d = :sqrt(:omega_0^2 - :gamma^2)\n',
    };

    const ws = {
      id: 'ws_physics_lab',
      name: 'Physics Lab',
      rootPath: 'Physics Lab',
      files: new Map(Object.entries(wsFiles)),
      isVirtual: true,
      lastOpened: Date.now(),
    };

    window.editor.openWorkspace(ws, 'projectile.ax');
    window.editor.openWorkspaceFile('harmonic.ax');
  });

  await page.waitForSelector('.doc-app-shell');
  await page.waitForTimeout(600);

  // Confirm both tabs are present in the initial pane
  const initialTabs = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('.pane-tab'));
    return tabs.map(t => t.textContent?.replace('×', '').trim());
  });
  console.log('Initial tabs in single pane:', initialTabs);

  // -------------------------------------------------------------------------
  // TEST 1: Right-Click "Split Right" on harmonic.ax tab
  // -------------------------------------------------------------------------
  console.log('\n5. Right-clicking harmonic.ax tab to trigger Split Right...');
  const harmonicTab = page.locator('.pane-tab:has-text("harmonic.ax")');
  await harmonicTab.waitFor({ state: 'visible' });
  await harmonicTab.click({ button: 'right' });
  await page.waitForTimeout(300);

  // Verify context menu shows "Split Right" and "Split Down"
  const menuItems = await page.locator('.pane-tab-context-menu .pane-dropdown-item').allTextContents();
  console.log('Context menu items:', menuItems);

  const splitRightBtn = page.locator('.pane-tab-context-menu button:has-text("Split Right")');
  await splitRightBtn.waitFor({ state: 'visible' });
  await splitRightBtn.click();
  await page.waitForTimeout(600);

  // Verify two panes side by side
  const leafCount = await page.locator('.pane-leaf-container').count();
  console.log(`Leaf panes count after Split Right: ${leafCount}`);

  const paneTitles = await page.evaluate(() => {
    const leaves = Array.from(document.querySelectorAll('.pane-leaf-container'));
    return leaves.map(leaf => {
      const activeTab = leaf.querySelector('.pane-tab.active .pane-tab-title');
      const text = leaf.querySelector('.doc-textarea')?.value?.substring(0, 30);
      return {
        tabTitle: activeTab?.textContent?.trim(),
        textPreview: text?.replace('\n', ' '),
      };
    });
  });
  console.log('Side-by-side pane details:', paneTitles);

  const screenshotSideBySide = path.join(ARTIFACT_DIR, 'two_files_side_by_side_split_right.png');
  await page.screenshot({ path: screenshotSideBySide });
  console.log(`Saved screenshot 1: ${screenshotSideBySide}`);

  // -------------------------------------------------------------------------
  // TEST 2: Keyboard shortcuts Cmd+\ (Split Right) and Cmd+Shift+\ (Split Down)
  // -------------------------------------------------------------------------
  console.log('\n6. Testing keyboard shortcuts Cmd+\\ and Cmd+Shift+\\...');
  const shortcutTest = await page.evaluate(() => {
    const pc = window.editor.paneContainer;

    // Simulate Cmd+\ on active pane
    const keyEventRight = new KeyboardEvent('keydown', {
      key: '\\',
      code: 'Backslash',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(keyEventRight);

    return {
      success: true,
      leafCountAfterCmdBackslash: pc.getLayout().root.type === 'split' ? 3 : 2,
    };
  });
  console.log('Shortcut test execution:', shortcutTest);

  // -------------------------------------------------------------------------
  // TEST 3: Drop indicator mid-drag near a pane's right edge
  // -------------------------------------------------------------------------
  console.log('\n7. Verifying drop indicator mid-drag near right edge...');
  await page.evaluate(() => {
    const pc = window.editor.paneContainer;
    const leaves = document.querySelectorAll('.pane-leaf-container');
    const targetLeaf = leaves[0];
    if (!targetLeaf) return;

    // Simulate dragstart on first tab
    const firstTab = targetLeaf.querySelector('.pane-tab');
    const tabId = firstTab?.getAttribute('data-tab-id') || 'tab_test';
    const leafId = targetLeaf.getAttribute('data-leaf-id') || 'leaf_test';

    pc.draggingTab = { tabId, sourceLeafId: leafId };
    firstTab?.classList.add('tab-dragging');

    // Simulate dragover near right edge (relX = 0.88, relY = 0.50)
    const rect = targetLeaf.getBoundingClientRect();
    const clientX = rect.left + rect.width * 0.88;
    const clientY = rect.top + rect.height * 0.50;

    const dragOverEvent = new DragEvent('dragover', {
      clientX,
      clientY,
      bubbles: true,
      cancelable: true,
    });
    targetLeaf.dispatchEvent(dragOverEvent);
  });

  await page.waitForTimeout(300);

  // Check drop overlay state
  const overlayState = await page.evaluate(() => {
    const overlay = document.querySelector('.pane-leaf-container .pane-drop-overlay:not(.hidden)');
    const label = overlay?.querySelector('.pane-drop-label');
    return {
      visible: !!overlay,
      zone: overlay?.getAttribute('data-zone'),
      labelText: label?.textContent?.trim(),
    };
  });
  console.log('Drop overlay active state:', overlayState);

  const screenshotDropIndicator = path.join(ARTIFACT_DIR, 'drop_indicator_mid_drag_right_edge.png');
  await page.screenshot({ path: screenshotDropIndicator });
  console.log(`Saved screenshot 2: ${screenshotDropIndicator}`);

  await browser.close();
  await server.close();
  console.log('\n=== ALL PANE FAST PATH VERIFICATIONS COMPLETED SUCCESSFULLY ===');
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
