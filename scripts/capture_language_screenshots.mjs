import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function run() {
  console.log('=== CAPTURING LANGUAGE DOCUMENTATION SCREENSHOTS ===');
  console.log('1. Starting Vite development server on port 5215...');
  const server = await createServer({
    configFile: path.resolve(__dirname, '../vite.config.ts'),
    server: { port: 5215 },
  });
  await server.listen();
  console.log('Vite server running at http://localhost:5215');

  console.log('2. Launching Chromium...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  console.log('3. Navigating to Axine web app...');
  await page.goto('http://localhost:5215');
  await page.waitForFunction(() => typeof window.editor !== 'undefined');
  await page.waitForTimeout(400);

  // --- Capture Program 2: Sphere Slice ---
  console.log('4. Rendering Program 2: Sphere Slice...');
  const prog2Source = `# sphere_slice.ax — Sphere intersected by an inclined plane constraint
# 3D spherical shell constrained by an affine slicing plane
{\\axis x, y, z;
  x^2 + y^2 + z^2 = 9
  z = 0.5 * x + 1
}

# 2D projection on the (x, y) coordinate plane
{\\axis x, y;
  x^2 + y^2 + (0.5 * x + 1)^2 = 9
}

# Planar intersection geometry:
# Center of cross-section circle is at x = -0.4, z = 0.8
:x_c = -2/5
:z_c = 0.5 * :x_c + 1

# Squared radius of cross-section disk: R^2 - d^2
:r_sq = 9 - (:x_c^2 + :z_c^2)
:r_sq_float = :float(:r_sq)

# Point on boundary at x = 0: y^2 + 1 = 9 => y^2 = 8
:y_sq = 9 - :z_c^2 - 0
:y_bound = :float(:y_sq)
`;

  await page.evaluate((source) => {
    const wsFiles = {
      'sphere_slice.ax': source,
    };
    const ws = {
      id: 'ws_prog2',
      name: 'Sphere Slice',
      rootPath: 'Sphere Slice',
      files: new Map(Object.entries(wsFiles)),
      isVirtual: true,
      lastOpened: Date.now(),
    };
    window.editor.openWorkspace(ws, 'sphere_slice.ax');

    const { value: spaceVal } = window.evaluate('{\\axis x, y, z; x^2 + y^2 + z^2 = 9; z = 0.5 * x + 1}');
    const pc = window.editor.paneContainer;
    const rootLeafId = pc.getLayout().root.id;

    const newLeafId = pc.split(rootLeafId, 'horizontal', 'after', {
      id: 'tab_sphere_slice',
      type: 'space',
      title: '3D Space (x, y, z)',
    });
    pc.render();

    const paneBodies = document.querySelectorAll('.pane-split-second .pane-body, .pane-body');
    const paneBody = paneBodies[paneBodies.length - 1];
    if (paneBody) {
      paneBody.innerHTML = '';
      const vp = new window.SpaceViewport(paneBody, spaceVal);
      window.currentViewport = vp;
    }
  }, prog2Source);

  await page.waitForTimeout(1000);
  console.log('Capturing program2_sphere_slice.png...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'program2_sphere_slice.png') });

  // --- Capture Program 3: Damped Oscillator ---
  console.log('5. Rendering Program 3: Damped Oscillator...');
  const prog3Source = `# damped_oscillator.ax — Damped harmonic oscillator differential relation
\\import "lib/exp.ax"
\\import "lib/trig.ax"

m = 1.0
k = 9.0
c = 0.6

# System parameters:
# omega_0 = sqrt(k/m) = 3.0
# gamma = c / (2*m) = 0.3
# omega_d = sqrt(3^2 - 0.3^2) = sqrt(8.91) ~= 2.984962
:gamma = 0.3
:omega_d = 2.984962
:x0 = 2.0

# Coupled first-order differential equations of motion
d//d:time :x = :vx
d//d:time :vx = -(k / m) * :x - (c / m) * :vx

# Analytic position trajectory manifold over continuous time
{\\axis :time, :x;
  :x = :x0 * :exp(-:gamma * :time) * :cos(:omega_d * :time)
}

# State evaluated at t = 1.0s
:x_1 = :x0 * :exp(-:gamma * 1.0) * :cos(:omega_d * 1.0)
:x_1_approx = :float(:x_1)
`;

  await page.evaluate((source) => {
    const wsFiles = {
      'damped_oscillator.ax': source,
    };
    const ws = {
      id: 'ws_prog3',
      name: 'Damped Oscillator',
      rootPath: 'Damped Oscillator',
      files: new Map(Object.entries(wsFiles)),
      isVirtual: true,
      lastOpened: Date.now(),
    };
    window.editor.openWorkspace(ws, 'damped_oscillator.ax');

    const env = window.createInitialEnvironment();
    window.evaluate('\\import "lib/exp.ax"', env);
    window.evaluate('\\import "lib/trig.ax"', env);
    const { value: spaceVal } = window.evaluate('{\\axis :time, :x; :x = 2.0 * :exp(-0.3 * :time) * :cos(2.984962 * :time)}', env);

    const pc = window.editor.paneContainer;
    const rootLeafId = pc.getLayout().root.id;

    const newLeafId = pc.split(rootLeafId, 'horizontal', 'after', {
      id: 'tab_damped_oscillator',
      type: 'space',
      title: 'Space (:time, :x)',
    });
    pc.render();

    const paneBodies = document.querySelectorAll('.pane-split-second .pane-body, .pane-body');
    const paneBody = paneBodies[paneBodies.length - 1];
    if (paneBody) {
      paneBody.innerHTML = '';
      const vp = new window.SpaceViewport(paneBody, spaceVal);
      window.currentViewport = vp;
    }
  }, prog3Source);

  await page.waitForTimeout(1000);
  console.log('Capturing program3_damped_oscillator.png...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'program3_damped_oscillator.png') });

  console.log('6. Cleaning up...');
  await browser.close();
  await server.close();
  console.log('Done!');
}

run().catch((err) => {
  console.error('Error running screenshot capture:', err);
  process.exit(1);
});
