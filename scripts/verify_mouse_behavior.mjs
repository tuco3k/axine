import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function run() {
  const server = await createServer({
    configFile: path.resolve(__dirname, '../vite.config.ts'),
    server: { port: 5197 }
  });
  await server.listen();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Clear localStorage before navigation
  await page.addInitScript(() => {
    localStorage.clear();
  });

  console.log('Navigating to Axine app...');
  await page.goto('http://localhost:5197');
  await page.waitForSelector('.axine-welcome-screen');

  // Open a test workspace with 1D, 2D, 3D relations
  await page.evaluate(() => {
    const wsFiles = {
      'spaces_test.ax': '# 1D, 2D, and 3D spaces with independent variable names\n\nx = 0\n\nv = u^2\n\na^2 + b^2 + c^2 = 4'
    };

    const ws = {
      id: 'ws_spaces_verify',
      name: 'Spaces Verification',
      rootPath: 'Spaces Verification',
      files: new Map(Object.entries(wsFiles)),
      isVirtual: true,
      lastOpened: Date.now()
    };

    window.editor.openWorkspace(ws, 'spaces_test.ax');
  });

  await page.waitForTimeout(1000);

  // ==========================================
  // 1D SPACE VERIFICATION
  // ==========================================
  console.log('--- Verifying 1D Space ---');
  await page.evaluate(() => {
    const pc = window.editor.paneContainer;
    const available = window.editor.getAvailableSpaces();
    const space1D = available.find(s => s.space.dimension === 1);
    const rootLeaf = pc.layout.root;
    if (rootLeaf.type === 'leaf') {
      pc.split(rootLeaf.id, 'horizontal', 'after', {
        id: 'tab_space_1d',
        type: 'space',
        title: '1D: x = 0',
        documentId: window.editor.activeSessionId,
        spaceLineIdx: space1D ? space1D.lineIdx : 2,
        spaceExprText: 'x = 0'
      });
    }
  });

  await page.waitForTimeout(600);

  // 1D: 1. Click to capture (uncaptured -> captured)
  await page.evaluate(() => {
    const pc = window.editor.paneContainer;
    const vp = pc.spaceViewports.get('tab_space_1d');
    vp.capture();
  });
  await page.waitForTimeout(300);

  // Screenshot 1D Before Movement (captured, nothing selected)
  const p1dBefore = path.join(ARTIFACT_DIR, '1d_before_mouse_movement.png');
  await page.screenshot({ path: p1dBefore });
  console.log('Saved 1d_before_mouse_movement.png');

  // 1D: 2. Mouse movement while captured -> pans along axis without button held
  await page.evaluate(() => {
    const pc = window.editor.paneContainer;
    const vp = pc.spaceViewports.get('tab_space_1d');
    const initialBounds = { ...vp.getCameraState().bounds2D };
    window.dispatchEvent(new MouseEvent('mousemove', { movementX: 80, movementY: 0, clientX: 400, clientY: 200 }));
    const pannedBounds = vp.getCameraState().bounds2D;
    console.log('1D Pan check:', initialBounds.minX, '->', pannedBounds.minX, 'Selected:', vp.getReticlePos());
  });
  await page.waitForTimeout(300);

  // Screenshot 1D After Movement (camera panned, nothing selected)
  const p1dAfter = path.join(ARTIFACT_DIR, '1d_after_mouse_movement.png');
  await page.screenshot({ path: p1dAfter });
  console.log('Saved 1d_after_mouse_movement.png');

  // 1D: 3. Shift + click to select point
  await page.evaluate(() => {
    const pc = window.editor.paneContainer;
    const vp = pc.spaceViewports.get('tab_space_1d');
    const canvas = vp.getCanvas();
    const rect = canvas.getBoundingClientRect();
    
    // Press Shift
    vp.container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
    
    // Click on canvas at x = 0 (after pan)
    const bounds = vp.getCameraState().bounds2D;
    const clickPx = rect.left + ((0 - bounds.minX) / (bounds.maxX - bounds.minX)) * rect.width;
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: clickPx, clientY: rect.top + rect.height / 2, button: 0, shiftKey: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: clickPx, clientY: rect.top + rect.height / 2, button: 0, shiftKey: true }));
  });
  await page.waitForTimeout(300);

  // Screenshot 1D Shift+Click Selection
  const p1dSelect = path.join(ARTIFACT_DIR, '1d_shift_click_selected.png');
  await page.screenshot({ path: p1dSelect });
  console.log('Saved 1d_shift_click_selected.png');

  // ==========================================
  // 2D SPACE VERIFICATION
  // ==========================================
  console.log('--- Verifying 2D Space ---');
  await page.evaluate(() => {
    const pc = window.editor.paneContainer;
    const available = window.editor.getAvailableSpaces();
    const space2D = available.find(s => s.space.dimension === 2);
    
    pc.openTab({
      id: 'tab_space_2d',
      type: 'space',
      title: '2D: v = u^2',
      documentId: window.editor.activeSessionId,
      spaceLineIdx: space2D ? space2D.lineIdx : 4,
      spaceExprText: 'v = u^2'
    });
  });

  await page.waitForTimeout(600);

  // 2D: 1. Click to capture
  await page.evaluate(() => {
    const pc = window.editor.paneContainer;
    const vp = pc.spaceViewports.get('tab_space_2d');
    vp.capture();
  });
  await page.waitForTimeout(300);

  // Screenshot 2D Before Movement (captured, nothing selected)
  const p2dBefore = path.join(ARTIFACT_DIR, '2d_before_mouse_movement.png');
  await page.screenshot({ path: p2dBefore });
  console.log('Saved 2d_before_mouse_movement.png');

  // 2D: 2. Mouse movement while captured -> pans 2D view without button held
  await page.evaluate(() => {
    const pc = window.editor.paneContainer;
    const vp = pc.spaceViewports.get('tab_space_2d');
    const initialBounds = { ...vp.getCameraState().bounds2D };
    window.dispatchEvent(new MouseEvent('mousemove', { movementX: 70, movementY: 50, clientX: 450, clientY: 250 }));
    const pannedBounds = vp.getCameraState().bounds2D;
    console.log('2D Pan check:', initialBounds, '->', pannedBounds, 'Selected:', vp.getReticlePos());
  });
  await page.waitForTimeout(300);

  // Screenshot 2D After Movement (camera panned, nothing selected)
  const p2dAfter = path.join(ARTIFACT_DIR, '2d_after_mouse_movement.png');
  await page.screenshot({ path: p2dAfter });
  console.log('Saved 2d_after_mouse_movement.png');

  // 2D: 3. Shift + click to select point on parabola
  await page.evaluate(() => {
    const pc = window.editor.paneContainer;
    const vp = pc.spaceViewports.get('tab_space_2d');
    const canvas = vp.getCanvas();
    const rect = canvas.getBoundingClientRect();
    
    // Press Shift
    vp.container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
    
    const bounds = vp.getCameraState().bounds2D;
    const spanX = bounds.maxX - bounds.minX;
    const spanY = bounds.maxY - bounds.minY;
    const targetU = -2;
    const targetV = 4;
    const clickPxX = rect.left + ((targetU - bounds.minX) / spanX) * rect.width;
    const clickPxY = rect.top + ((bounds.maxY - targetV) / spanY) * rect.height;

    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: clickPxX, clientY: clickPxY, button: 0, shiftKey: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: clickPxX, clientY: clickPxY, button: 0, shiftKey: true }));
  });
  await page.waitForTimeout(300);

  // Screenshot 2D Shift+Click Selection
  const p2dSelect = path.join(ARTIFACT_DIR, '2d_shift_click_selected.png');
  await page.screenshot({ path: p2dSelect });
  console.log('Saved 2d_shift_click_selected.png');

  // ==========================================
  // 3D SPACE VERIFICATION
  // ==========================================
  console.log('--- Verifying 3D Space ---');
  await page.evaluate(() => {
    const pc = window.editor.paneContainer;
    const available = window.editor.getAvailableSpaces();
    const space3D = available.find(s => s.space.dimension === 3);
    
    pc.openTab({
      id: 'tab_space_3d',
      type: 'space',
      title: '3D: Sphere',
      documentId: window.editor.activeSessionId,
      spaceLineIdx: space3D ? space3D.lineIdx : 6,
      spaceExprText: 'a^2 + b^2 + c^2 = 4'
    });
  });

  await page.waitForTimeout(600);

  // 3D: 1. Click to capture
  await page.evaluate(() => {
    const pc = window.editor.paneContainer;
    const vp = pc.spaceViewports.get('tab_space_3d');
    vp.capture();
  });
  await page.waitForTimeout(300);

  // Screenshot 3D Before Movement (captured, initial look angle, nothing selected)
  const p3dBefore = path.join(ARTIFACT_DIR, '3d_before_mouse_movement.png');
  await page.screenshot({ path: p3dBefore });
  console.log('Saved 3d_before_mouse_movement.png');

  // 3D: 2. Mouse movement while captured -> looks around without button held
  await page.evaluate(() => {
    const pc = window.editor.paneContainer;
    const vp = pc.spaceViewports.get('tab_space_3d');
    const initialCam = { angleZ: vp.getCameraState().angleZ, angleX: vp.getCameraState().angleX };
    window.dispatchEvent(new MouseEvent('mousemove', { movementX: 120, movementY: -60, clientX: 500, clientY: 200 }));
    const movedCam = { angleZ: vp.getCameraState().angleZ, angleX: vp.getCameraState().angleX };
    console.log('3D Look check:', initialCam, '->', movedCam, 'Selected:', vp.getReticlePos());
  });
  await page.waitForTimeout(300);

  // Screenshot 3D After Movement (camera rotated / looked around, nothing selected)
  const p3dAfter = path.join(ARTIFACT_DIR, '3d_after_mouse_movement.png');
  await page.screenshot({ path: p3dAfter });
  console.log('Saved 3d_after_mouse_movement.png');

  // 3D: 3. Shift + click to select surface point
  await page.evaluate(() => {
    const pc = window.editor.paneContainer;
    const vp = pc.spaceViewports.get('tab_space_3d');
    const canvas = vp.getCanvas();
    const rect = canvas.getBoundingClientRect();
    
    // Press Shift
    vp.container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
    
    // Click on 3D sphere surface
    canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, button: 0, shiftKey: true }));
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, button: 0, shiftKey: true }));
  });
  await page.waitForTimeout(300);

  // Screenshot 3D Shift+Click Selection
  const p3dSelect = path.join(ARTIFACT_DIR, '3d_shift_click_selected.png');
  await page.screenshot({ path: p3dSelect });
  console.log('Saved 3d_shift_click_selected.png');

  // ==========================================
  // SHIFT RELEASE DISCARD DELTA VERIFICATION
  // ==========================================
  console.log('--- Verifying Shift Release Delta Discard (No Camera Jump) ---');
  const shiftDeltaJump = await page.evaluate(() => {
    const pc = window.editor.paneContainer;
    const vp = pc.spaceViewports.get('tab_space_3d');
    
    // Hold Shift
    vp.container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
    const angleBeforeLongMove = { angleZ: vp.getCameraState().angleZ, angleX: vp.getCameraState().angleX };

    // Move mouse 600px while Shift is held (camera frozen)
    window.dispatchEvent(new MouseEvent('mousemove', { movementX: 600, movementY: 400, clientX: 900, clientY: 600 }));
    const angleDuringShift = { angleZ: vp.getCameraState().angleZ, angleX: vp.getCameraState().angleX };

    // Release Shift
    vp.container.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }));

    // Send first frame mouse movement (which has large residual delta)
    window.dispatchEvent(new MouseEvent('mousemove', { movementX: 500, movementY: 300, clientX: 950, clientY: 650 }));
    const angleAfterFirstFrame = { angleZ: vp.getCameraState().angleZ, angleX: vp.getCameraState().angleX };

    return {
      angleBefore: angleBeforeLongMove,
      angleDuring: angleDuringShift,
      angleAfterFirstFrame: angleAfterFirstFrame,
      didJump: angleAfterFirstFrame.angleZ !== angleBeforeLongMove.angleZ || angleAfterFirstFrame.angleX !== angleBeforeLongMove.angleX
    };
  });

  console.log('Shift release jump test result:', shiftDeltaJump);

  await browser.close();
  await server.close();
  console.log('All verification complete!');
}

run().catch(err => {
  console.error('Error running verification:', err);
  process.exit(1);
});
