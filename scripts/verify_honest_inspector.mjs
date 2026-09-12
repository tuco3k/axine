import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'path';

const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function run() {
  console.log('Starting Vite server for honest inspector verification...');
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

    const docText = [
      '# 3D Sphere Surface Space',
      '{\\axis x, y, z; x^2 + y^2 + z^2 = 9}',
    ].join('\n');

    await page.evaluate((text) => {
      const editor = (window).editor || (window).docEditor;
      if (editor) {
        editor.setText(text);
      }
    }, docText);

    // Click Run
    await page.click('#doc-run-btn');
    await page.waitForTimeout(800);

    // Open 3D Space Tab via + View Menu
    console.log('Opening 3D Space Tab...');
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

    // Inspect an actual mesh vertex from the cachedMesh
    console.log('Inspecting actual 3D mesh vertex...');
    const vertexInfo = await page.evaluate(() => {
      const pc = (window).editor?.paneContainer;
      const vps = Array.from(pc?.getAllSpaceViewports().values() || []);
      const vp3d = vps.find(v => v.viewMode === '3d') || vps[vps.length - 1];
      if (vp3d) {
        const ent = vp3d.space.entities[0];
        const mesh = ent?.cachedMesh;
        if (mesh && mesh.vertices && mesh.vertices.length > 0) {
          // Select a vertex with non-zero residual
          let targetVertex = mesh.vertices[0];
          let maxRes = -1;
          for (let i = 0; i < Math.min(mesh.vertices.length, 50); i++) {
            const v = mesh.vertices[i];
            const r = Math.abs(ent.compiledFn(v[0], v[1], v[2]));
            if (r > maxRes) {
              maxRes = r;
              targetVertex = v;
            }
          }
          vp3d.inspectAtCoordinate(targetVertex[0], targetVertex[1], targetVertex[2]);
          return {
            vertex: targetVertex,
            residual: ent.compiledFn(targetVertex[0], targetVertex[1], targetVertex[2]),
            gridResolution: mesh.resolution,
            gridStep: mesh.gridStep,
          };
        }
      }
      return null;
    });

    console.log('Inspected vertex info:', vertexInfo);
    await page.waitForTimeout(500);

    const panel = await page.waitForSelector('.spatial-inspector-panel', { timeout: 3000 });
    const panelText = await panel.innerText();

    console.log('\n================ VERBATIM PANEL TEXT ================');
    console.log(panelText);
    console.log('======================================================\n');

    // Verify assertions on verbatim text
    if (panelText.includes('Holds (f = 0)')) {
      throw new Error('Panel must NOT contain "Holds (f = 0)"');
    }
    if (panelText.includes('confirming no geometric locus exists')) {
      throw new Error('Panel must NOT contain "confirming no geometric locus exists"');
    }
    if (!panelText.includes('Grid:')) {
      throw new Error('Panel must display Grid resolution');
    }
    if (!panelText.includes('tolerance')) {
      throw new Error('Panel must mention tolerance');
    }

    const screenshotPath = resolve(ARTIFACT_DIR, 'honest_spatial_inspector_verification.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`Saved screenshot to: ${screenshotPath}`);

  } catch (err) {
    console.error('Error during verification:', err);
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
