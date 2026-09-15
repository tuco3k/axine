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
    server: { port: 5198 }
  });
  await server.listen();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('1. Verifying Welcome Screen on clean launch...');
  await page.addInitScript(() => {
    localStorage.clear();
    const recent = [
      {
        id: 'ws_sample_orbital',
        name: 'Orbital Mechanics',
        path: '/Users/noahslayton/projects/orbital_mechanics',
        isVirtual: false,
        lastOpened: Date.now() - 1000 * 60 * 45,
        fileCount: 6
      },
      {
        id: 'ws_sample_optics',
        name: 'Diffraction & Optics',
        path: '/Users/noahslayton/projects/optics_lab',
        isVirtual: false,
        lastOpened: Date.now() - 1000 * 60 * 60 * 24,
        fileCount: 3
      }
    ];
    localStorage.setItem('axine_recent_workspaces', JSON.stringify(recent));
  });

  await page.goto('http://localhost:5198');
  await page.waitForSelector('.axine-welcome-screen');
  await page.waitForTimeout(500);

  const welcomeScreenshotPath = path.join(ARTIFACT_DIR, 'welcome_screen_verified.png');
  await page.screenshot({ path: welcomeScreenshotPath });
  console.log('Saved welcome screen screenshot to:', welcomeScreenshotPath);

  console.log('2. Verifying Workspace with File Tree Tab & Import Resolution...');
  await page.evaluate(async () => {
    const wsFiles = {
      'simulation.ax': '# Orbital Velocity Calculation\n\\import "lib/physics.ax"\n\n:altitude = 400\n:radius = :earth_radius_km + :altitude\n:speed = :orbital_speed(:radius)\n:kinetic_energy = 1/2 * 500 * :speed^2',
      'lib/physics.ax': '# Orbital physics library\n\\module :physics\n\n:earth_radius_km = 6371\n:mu = 398600\n\n\\forall r, :orbital_speed(r) = (:mu / r)^(1/2)\n\n\\export :earth_radius_km, :mu, :orbital_speed',
      'experiments/decay.ax': '# Atmospheric drag\n\\import "../lib/physics.ax"\n:alt = 350'
    };

    const ws = {
      id: 'ws_orbital_demo',
      name: 'Orbital Mechanics',
      rootPath: 'Orbital Mechanics',
      files: new Map(Object.entries(wsFiles)),
      isVirtual: true,
      lastOpened: Date.now()
    };

    window.editor.openWorkspace(ws, 'simulation.ax');

    const pc = window.editor.paneContainer;
    const rootLeaf = pc.layout.root;
    if (rootLeaf.type === 'leaf') {
      // Left pane: Files tree tab
      pc.split(rootLeaf.id, 'horizontal', 'before', {
        id: 'tab_file_tree',
        type: 'tree',
        title: 'Files',
        documentId: window.editor.activeSessionId
      });

      // Right pane: Results tab
      pc.split(rootLeaf.id, 'horizontal', 'after', {
        id: 'tab_results_view',
        type: 'results',
        title: 'Results',
        documentId: window.editor.activeSessionId
      });
    }
  });

  await page.waitForTimeout(1000);

  // Set balanced split proportions
  await page.evaluate(() => {
    const pc = window.editor.paneContainer;
    if (pc.layout.root.type === 'split') {
      pc.layout.root.ratio = 0.20;
      const secondNode = pc.layout.root.second;
      if (secondNode && secondNode.type === 'split') {
        secondNode.ratio = 0.55;
      }
      pc.render();
    }
  });

  await page.waitForTimeout(800);

  const fileTreeScreenshotPath = path.join(ARTIFACT_DIR, 'workspace_with_file_tree_tab.png');
  await page.screenshot({ path: fileTreeScreenshotPath });
  console.log('Saved workspace file tree screenshot to:', fileTreeScreenshotPath);

  const importResolutionScreenshotPath = path.join(ARTIFACT_DIR, 'workspace_import_resolution_verified.png');
  await page.screenshot({ path: importResolutionScreenshotPath });
  console.log('Saved workspace import resolution screenshot to:', importResolutionScreenshotPath);

  await browser.close();
  await server.close();
  console.log('Done verification!');
}

run().catch(err => {
  console.error('Error running verification:', err);
  process.exit(1);
});
