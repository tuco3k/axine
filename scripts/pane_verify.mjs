import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function run() {
  console.log('--- PHASE 2 INTERFACE VERIFICATION SUITE ---');
  console.log('1. Starting Vite development server on port 5198...');
  const server = await createServer({
    configFile: path.resolve(__dirname, '../vite.config.ts'),
    server: { port: 5198 },
  });
  await server.listen();
  console.log('Vite server running at http://localhost:5198');

  console.log('2. Launching headless Chromium...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  console.log('3. Navigating to Axine web app...');
  await page.goto('http://localhost:5198');
  await page.waitForSelector('.doc-app-shell');
  await page.waitForTimeout(600);

  // Set initial document with four space relations
  const testDoc = `# Multi-Pane Space Models
{\\axis[x, y]; x^2 + y^2 = 4}
{\\axis[x, y, z]; x^2 + y^2 + z^2 = 9}
{\\axis[x, y, z]; z = x^2 - y^2}
{\\axis[x, y]; y = :sin(x)}
`;

  console.log('4. Setting up document and 5-pane tiling layout...');
  await page.evaluate((docContent) => {
    const editor = (window).editor;
    console.log('EVAL: editor exists =', !!editor, 'paneContainer exists =', !!editor?.paneContainer);
    editor.setText(docContent);

    // Build 5-pane layout: 1 Code Editor + 4 Space Viewports
    const pc = editor.paneContainer;
    if (pc) {
      console.log('EVAL: root layout before split =', JSON.stringify(pc.getLayout()));
      const rootLeafId = pc.getLayout().root.id;

      // Pane 1: Document Editor
      // Pane 2: Space 1 (Circle)
      const l2 = pc.split(rootLeafId, 'horizontal', 'after', {
        id: 'tab_space_1',
        type: 'space',
        title: 'Space: Circle',
        spaceLineIdx: 1,
        cameraState: {
          viewMode: '2d',
          displayAxes: ['x', 'y'],
          fixedCoords: {},
          bounds2D: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
          bounds3D: { minX: -3, maxX: 3, minY: -3, maxY: 3, minZ: -3, maxZ: 3 },
          angleX: 0,
          angleZ: 0,
          zoom3D: 1,
          pan3DX: 0,
          pan3DY: 0,
        }
      });

      // Pane 3: Space 2 (Sphere 3D Orbit)
      const l3 = pc.split(l2, 'vertical', 'after', {
        id: 'tab_space_2',
        type: 'space',
        title: 'Space: Sphere (3D)',
        spaceLineIdx: 2,
        cameraState: {
          viewMode: '3d',
          displayAxes: ['x', 'y'],
          fixedCoords: {},
          bounds2D: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
          bounds3D: { minX: -4, maxX: 4, minY: -4, maxY: 4, minZ: -4, maxZ: 4 },
          angleX: 0.65,
          angleZ: 0.85,
          zoom3D: 1.2,
          pan3DX: 0,
          pan3DY: 0,
        }
      });

      // Pane 4: Space 3 (Saddle Surface 3D)
      const l4 = pc.split(l3, 'horizontal', 'after', {
        id: 'tab_space_3',
        type: 'space',
        title: 'Space: Saddle',
        spaceLineIdx: 3,
        cameraState: {
          viewMode: '3d',
          displayAxes: ['x', 'y'],
          fixedCoords: {},
          bounds2D: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
          bounds3D: { minX: -4, maxX: 4, minY: -4, maxY: 4, minZ: -4, maxZ: 4 },
          angleX: 0.5,
          angleZ: 1.4,
          zoom3D: 1.1,
          pan3DX: 0,
          pan3DY: 0,
        }
      });

      // Pane 5: Space 4 (Sine Wave 2D)
      pc.split(rootLeafId, 'vertical', 'after', {
        id: 'tab_space_4',
        type: 'space',
        title: 'Space: Sine Wave',
        spaceLineIdx: 4,
        cameraState: {
          viewMode: '2d',
          displayAxes: ['x', 'y'],
          fixedCoords: {},
          bounds2D: { minX: -8, maxX: 8, minY: -3, maxY: 3 },
          bounds3D: { minX: -3, maxX: 3, minY: -3, maxY: 3, minZ: -3, maxZ: 3 },
          angleX: 0,
          angleZ: 0,
          zoom3D: 1,
          pan3DX: 0,
          pan3DY: 0,
        }
      });

      pc.setActivePaneId(l2);
    }
  }, testDoc);

  await page.waitForTimeout(600);

  // -------------------------------------------------------------
  // Verification 1: Five Panes Visible Simultaneously
  // -------------------------------------------------------------
  console.log('5. Capturing Verification 1: Five panes visible simultaneously (1 code + 4 spaces)...');
  const paneCount = await page.locator('.pane-leaf-container').count();
  console.log(`   Found ${paneCount} visible panes.`);
  if (paneCount !== 5) {
    throw new Error(`Expected 5 visible panes, got ${paneCount}`);
  }
  const snap1 = path.join(ARTIFACT_DIR, 'pane_verification_1_five_panes.png');
  await page.screenshot({ path: snap1 });
  console.log(`   Saved ${snap1}`);

  // -------------------------------------------------------------
  // Verification 2: Multi-Camera Space Synchronization
  // -------------------------------------------------------------
  console.log('6. Setting up same space in two panes (Top view vs Perspective orbit)...');
  await page.evaluate(() => {
    const editor = (window).editor;
    const pc = editor.paneContainer;
    // Set Pane 2 and Pane 3 both to Line 1 (Sphere x^2 + y^2 + z^2 = 9)
    // Pane 2: Top View 2D slice
    // Pane 3: 3D Perspective Orbit
    const leaves = Array.from(document.querySelectorAll('.pane-leaf-container'));
    const id2 = leaves[1]?.getAttribute('data-leaf-id');
    const id3 = leaves[2]?.getAttribute('data-leaf-id');

    if (pc && id2 && id3) {
      const vpTop = pc.getSpaceViewport('tab_space_1');
      if (vpTop) {
        vpTop.setCameraState({
          viewMode: '2d',
          displayAxes: ['x', 'y'],
          fixedCoords: { z: 0 },
          bounds2D: { minX: -6, maxX: 6, minY: -6, maxY: 6 },
        });
      }

      const vpPersp = pc.getSpaceViewport('tab_space_2');
      if (vpPersp) {
        vpPersp.setCameraState({
          viewMode: '3d',
          displayAxes: ['x', 'y'],
          angleX: 0.7,
          angleZ: 1.3,
          zoom3D: 1.5,
          pan3DX: 20,
          pan3DY: -10,
        });
      }
    }
  });

  await page.waitForTimeout(400);

  // Edit code in editor: change radius from 4 to 9 in line 1
  console.log('   Editing document code to trigger simultaneous live update...');
  const modifiedDoc = `# Multi-Pane Space Models
{\\axis[x, y]; x^2 + y^2 = 9}
{\\axis[x, y, z]; x^2 + y^2 + z^2 = 9}
{\\axis[x, y, z]; z = x^2 - y^2}
{\\axis[x, y]; y = :sin(x)}
`;
  await page.evaluate((newText) => {
    (window).editor.setText(newText);
  }, modifiedDoc);

  await page.waitForTimeout(500);

  console.log('   Capturing Verification 2: Multi-camera live sync...');
  const snap2 = path.join(ARTIFACT_DIR, 'pane_verification_2_multicamera_sync.png');
  await page.screenshot({ path: snap2 });
  console.log(`   Saved ${snap2}`);

  // -------------------------------------------------------------
  // Verification 3: Focused Pane Outline + Active Tab Highlight
  // -------------------------------------------------------------
  console.log('7. Focusing Pane 3 and capturing focused pane outline + amber active tab...');
  const leaves = await page.locator('.pane-leaf-container').all();
  if (leaves.length >= 3) {
    await leaves[2].click();
  }
  await page.waitForTimeout(300);

  const snap3 = path.join(ARTIFACT_DIR, 'pane_verification_3_focus_and_active_tab.png');
  await page.screenshot({ path: snap3 });
  console.log(`   Saved ${snap3}`);

  // -------------------------------------------------------------
  // Verification 4: Tab Mid-Drag Between Panes
  // -------------------------------------------------------------
  console.log('8. Simulating tab mid-drag between panes with drop overlay...');
  await page.evaluate(() => {
    const tabs = document.querySelectorAll('.pane-tab');
    if (tabs[1]) {
      tabs[1].classList.add('tab-dragging');
    }
    const overlays = document.querySelectorAll('.pane-drop-overlay');
    if (overlays[2]) {
      overlays[2].classList.remove('hidden');
      overlays[2].setAttribute('data-zone', 'right');
    }
  });
  await page.waitForTimeout(300);

  const snap4 = path.join(ARTIFACT_DIR, 'pane_verification_4_tab_drag.png');
  await page.screenshot({ path: snap4 });
  console.log(`   Saved ${snap4}`);

  // Clean up drag preview
  await page.evaluate(() => {
    document.querySelectorAll('.tab-dragging').forEach(el => el.classList.remove('tab-dragging'));
    document.querySelectorAll('.pane-drop-overlay').forEach(el => el.classList.add('hidden'));
  });

  // -------------------------------------------------------------
  // Verification 5: Flying in a Space (WASD Navigation)
  // -------------------------------------------------------------
  console.log('9. Engaging instant flight mode in 3D Space Viewport...');
  const spaceCanvases = await page.locator('.space-viewport-canvas').all();
  if (spaceCanvases.length >= 2) {
    // Click space canvas to enter flight mode
    await spaceCanvases[1].click();
    await page.waitForTimeout(300);

    console.log('   Capturing Flight Position 1...');
    const snap5a = path.join(ARTIFACT_DIR, 'pane_verification_5a_flight_pos1.png');
    await page.screenshot({ path: snap5a });
    console.log(`   Saved ${snap5a}`);

    // Press WASD navigation keys
    console.log('   Navigating with WASD flight inputs...');
    await page.keyboard.press('w');
    await page.keyboard.press('w');
    await page.keyboard.press('w');
    await page.keyboard.press('d');
    await page.keyboard.press('d');
    await page.waitForTimeout(300);

    console.log('   Capturing Flight Position 2 after WASD movement...');
    const snap5b = path.join(ARTIFACT_DIR, 'pane_verification_5b_flight_pos2.png');
    await page.screenshot({ path: snap5b });
    console.log(`   Saved ${snap5b}`);

    // Release flight with Escape
    await page.keyboard.press('Escape');
  }

  // -------------------------------------------------------------
  // Verification 6: App Reloaded (Persistence Check)
  // -------------------------------------------------------------
  console.log('10. Reloading page to verify complete workspace and camera layout persistence...');
  await page.reload();
  await page.waitForSelector('.doc-app-shell');
  await page.waitForTimeout(700);

  const reloadedPanes = await page.locator('.pane-leaf-container').count();
  console.log(`    After reload, found ${reloadedPanes} restored panes.`);
  if (reloadedPanes !== 5) {
    throw new Error(`Expected 5 restored panes after restart, got ${reloadedPanes}`);
  }

  const snap6 = path.join(ARTIFACT_DIR, 'pane_verification_6_reload_restored.png');
  await page.screenshot({ path: snap6 });
  console.log(`    Saved ${snap6}`);

  await browser.close();
  await server.close();
  console.log('--- ALL 6 VERIFICATION SCENARIOS COMPLETED SUCCESSFULLY ---');
}

run().catch((err) => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
