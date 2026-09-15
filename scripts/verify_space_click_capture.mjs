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
    server: { port: 5199 }
  });
  await server.listen();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Clear localStorage before navigation
  await page.addInitScript(() => {
    localStorage.clear();
  });

  console.log('Navigating to http://localhost:5199...');
  await page.goto('http://localhost:5199');
  await page.waitForSelector('.doc-header');
  await page.waitForTimeout(1000);

  // Open Parabola space in a split pane
  await page.evaluate(() => {
    const pc = window.editor.paneContainer;
    const available = window.editor.getAvailableSpaces();
    const parabolaSpace = available.find(s => s.lineIdx === 12 || s.title.includes('0.5 * g'));
    if (parabolaSpace) {
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
    }
  });

  await page.waitForTimeout(800);

  // Release capture initially so space starts UNCAPTURED
  await page.evaluate(() => {
    const pc = window.editor.paneContainer;
    const vp = pc.spaceViewports.get('tab_space_parabola');
    if (vp) vp.releaseCapture();
  });
  await page.waitForTimeout(300);

  const spaceCanvas = await page.$('.space-viewport-canvas');
  if (!spaceCanvas) {
    throw new Error('Space canvas not found in DOM');
  }

  // Verify initially uncaptured
  const initialState = await page.evaluate(() => {
    const pc = window.editor.paneContainer;
    const vp = pc.spaceViewports.get('tab_space_parabola');
    return {
      isCaptured: vp.isCaptured,
      hasReticle: vp.getReticlePos() !== null,
      hasInspection: vp.getInspectionResult() !== null
    };
  });
  console.log('Initial Space State (should be uncaptured):', initialState);

  // Step 1: FIRST CLICK (uncaptured space) -> captures space, nothing is selected
  const canvasBox = await spaceCanvas.boundingBox();
  console.log('Canvas bounding box:', canvasBox);

  // Click at the center of canvas
  const clickX = canvasBox.x + canvasBox.width * 0.5;
  const clickY = canvasBox.y + canvasBox.height * 0.5;

  await page.mouse.click(clickX, clickY);
  await page.waitForTimeout(400);

  const firstClickState = await page.evaluate(() => {
    const pc = window.editor.paneContainer;
    const vp = pc.spaceViewports.get('tab_space_parabola');
    return {
      isCaptured: vp.isCaptured,
      hasReticle: vp.getReticlePos() !== null,
      hasInspection: vp.getInspectionResult() !== null,
      activePaneId: pc.layout.activePaneId,
    };
  });
  console.log('State after First Click:', firstClickState);

  // Screenshot 1: First click captures space, nothing selected
  const shot1Path = path.join(ARTIFACT_DIR, 'space_first_click_captured_unselected.png');
  await page.screenshot({ path: shot1Path });
  console.log('Saved screenshot 1 to', shot1Path);

  // Step 2: SECOND CLICK (while already captured) -> selects a point on the parabola curve
  const peakPos = await page.evaluate(() => {
    const pc = window.editor.paneContainer;
    const vp = pc.spaceViewports.get('tab_space_parabola');
    const b = vp.bounds2D;
    const canvas = vp.getCanvas();
    const rect = canvas.getBoundingClientRect();
    const worldX = 1.5;
    const worldY = 11.475;
    const screenX = rect.left + ((worldX - b.minX) / (b.maxX - b.minX)) * rect.width;
    const screenY = rect.top + rect.height - ((worldY - b.minY) / (b.maxY - b.minY)) * rect.height;
    return { screenX, screenY };
  });

  console.log('Clicking on curve at:', peakPos);
  await page.mouse.click(peakPos.screenX, peakPos.screenY);
  await page.waitForTimeout(400);

  const secondClickState = await page.evaluate(() => {
    const pc = window.editor.paneContainer;
    const vp = pc.spaceViewports.get('tab_space_parabola');
    return {
      isCaptured: vp.isCaptured,
      reticlePos: vp.getReticlePos(),
      inspectionResult: vp.getInspectionResult() ? {
        worldCoord: vp.getInspectionResult().worldCoord,
        isExactGeometryHit: vp.getInspectionResult().isExactGeometryHit,
        entity: vp.getInspectionResult().hitEntities[0]?.relationExpr
      } : null
    };
  });
  console.log('State after Second Click:', secondClickState);

  // Screenshot 2: Second click selects point
  const shot2Path = path.join(ARTIFACT_DIR, 'space_second_click_point_selected.png');
  await page.screenshot({ path: shot2Path });
  console.log('Saved screenshot 2 to', shot2Path);

  // Step 3: Verify Escape key releases capture and clears point selection
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  const escapeState = await page.evaluate(() => {
    const pc = window.editor.paneContainer;
    const vp = pc.spaceViewports.get('tab_space_parabola');
    return {
      isCaptured: vp.isCaptured,
      hasReticle: vp.getReticlePos() !== null,
      hasInspection: vp.getInspectionResult() !== null
    };
  });
  console.log('State after Escape (should be uncaptured and unselected):', escapeState);

  await browser.close();
  await server.close();
  console.log('Verification finished successfully!');
}

run().catch(err => {
  console.error('Error running verification:', err);
  process.exit(1);
});
