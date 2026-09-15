import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';
const PROJECT_DIR = path.resolve(__dirname, '..');

async function main() {
  const vite = spawn('npx', ['vite', '--port', '5190', '--strictPort'], {
    cwd: PROJECT_DIR,
    stdio: 'pipe',
  });

  await new Promise((resolve) => {
    vite.stdout.on('data', (d) => {
      const str = d.toString();
      if (str.includes('localhost:5190')) resolve(true);
    });
    setTimeout(resolve, 2500);
  });

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Opening http://localhost:5190...');
  await page.goto('http://localhost:5190');
  await page.waitForTimeout(1000);

  // Setup layout: Split into 2 panes (Left: Document, Right: Results)
  await page.evaluate(() => {
    const pc = window.editor?.paneContainer;
    if (pc) {
      const leafId = pc.getActivePaneId();
      pc.split(leafId, 'horizontal', 'after', {
        id: 'tab_results_main',
        type: 'results',
        title: 'Results',
      });
    }
  });
  await page.waitForTimeout(400);

  // Surface 2: Toolbar & Menus (+View and File menu open)
  console.log('Capturing Surface 2: Toolbar & Menus...');
  await page.click('#doc-file-menu-btn');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_before_surface2_toolbar_menus.png') });
  console.log('Saved audit_before_surface2_toolbar_menus.png');
  await page.click('body', { position: { x: 700, y: 500 } });
  await page.waitForTimeout(200);

  // Surface 3: Results Stream & Result Cards
  console.log('Capturing Surface 3: Results Stream & Result Cards...');
  const docContent = `# Exact rational arithmetic
1/3 + 1/3 + 1/3

# Algebraic derivation
\\isolate(2*x + 4 = 10, \\for x)

# 2D Space
{\\axis x, y; x^2 + y^2 = 4}

# Standing unreduced expression
:sin(x) + :cos(y) + z`;

  await page.evaluate((text) => {
    window.editor?.setText(text);
  }, docContent);
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_before_surface3_results_stream.png') });
  console.log('Saved audit_before_surface3_results_stream.png');

  // Surface 1: Spatial Inspector Panel (Dedicated Space tab with Inspector HUD & Popover)
  console.log('Capturing Surface 1: Spatial Inspector...');
  await page.evaluate(() => {
    const pc = window.editor?.paneContainer;
    if (pc) {
      const leaves = document.querySelectorAll('.pane-leaf-container');
      const rightLeafId = leaves[1]?.getAttribute('data-leaf-id');
      if (rightLeafId) {
        pc.openTab({
          id: 'tab_space_gate',
          type: 'space',
          title: 'Space: Circle',
          spaceLineIdx: 7,
          documentId: window.editor?.getActiveSession()?.id,
        }, rightLeafId);
      }
    }
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const vps = Array.from(window.editor?.paneContainer?.getAllSpaceViewports().values() || []);
    if (vps.length > 0) {
      const vp = vps[vps.length - 1];
      vp.inspectAtCoordinate(2, 0);
    }
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_before_surface1_inspector.png') });
  console.log('Saved audit_before_surface1_inspector.png');

  // Surface 4: Scope / Trace / Frames (Open Scope tab in right pane)
  console.log('Capturing Surface 4: Scope / Trace / Frames...');
  await page.evaluate(() => {
    const pc = window.editor?.paneContainer;
    if (pc) {
      const leaves = document.querySelectorAll('.pane-leaf-container');
      const rightLeafId = leaves[1]?.getAttribute('data-leaf-id');
      if (rightLeafId) {
        pc.openTab({
          id: 'tab_scope_1',
          type: 'scope',
          title: 'Scope',
        }, rightLeafId);
      }
    }
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_before_surface4_scope_trace_frames.png') });
  console.log('Saved audit_before_surface4_scope_trace_frames.png');

  // Surface 5: Viewport Overlays, Error Displays & Empty States
  console.log('Capturing Surface 5: Error Displays & Empty States...');
  // Switch right pane back to Results tab to show syntax errors
  await page.evaluate(() => {
    const pc = window.editor?.paneContainer;
    if (pc) {
      const leaves = document.querySelectorAll('.pane-leaf-container');
      const rightLeafId = leaves[1]?.getAttribute('data-leaf-id');
      if (rightLeafId) {
        pc.openTab({
          id: 'tab_results_main',
          type: 'results',
          title: 'Results',
        }, rightLeafId);
      }
    }
    window.editor?.setText(`\\axis x \\from -3 \\to 3\n1 / 0\nx := 5\n\\unknown_command`);
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'audit_before_surface5_error_displays.png') });
  console.log('Saved audit_before_surface5_error_displays.png');

  await browser.close();
  vite.kill();
  console.log('All 5 audit before screenshots captured successfully.');
  process.exit(0);
}

main().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});
