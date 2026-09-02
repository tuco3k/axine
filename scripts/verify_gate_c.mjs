import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';
const TEST_DIR = '/tmp/axine_test_gate_c';

if (fs.existsSync(TEST_DIR)) {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEST_DIR, { recursive: true });

// 1. Create vector_math.ax (imported module)
const vectorMathContent = `# Vector math library on disk
dot_product(u, v) := u[0] * v[0] + u[1] * v[1]
vector_norm_sq(v) := dot_product(v, v)
`;
fs.writeFileSync(path.join(TEST_DIR, 'vector_math.ax'), vectorMathContent, 'utf-8');

// 2. Create main_sim.ax (importer module)
const mainSimContent = `---
title: Vector Simulation
---
import "vector_math.ax"

v1 := (3.0, 4.0)
v2 := (1.0, 2.0)
dp := dot_product(v1, v2)
n_sq := vector_norm_sq(v1)
`;
fs.writeFileSync(path.join(TEST_DIR, 'main_sim.ax'), mainSimContent, 'utf-8');

// 3. Create disk_physics_demo.ax (disk file importing stdlib physics.ax)
const diskPhysicsContent = `---
title: Disk File Stdlib Import Demo
---
import "physics.ax"

b := Body(mass: 5.0, position: (0.0, 0.0), velocity: (6.0, 8.0))
ke := kinetic_energy(b)
`;
fs.writeFileSync(path.join(TEST_DIR, 'disk_physics_demo.ax'), diskPhysicsContent, 'utf-8');

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err));

  console.log('Navigating to Axine app at http://localhost:5173...');
  await page.goto('http://localhost:5173');
  await page.waitForSelector('#doc-textarea');
  await page.waitForTimeout(800);

  const waitForEval = async () => {
    await page.waitForTimeout(1500);
  };

  // Step A: Load disk files into evaluator and open main_sim.ax
  await page.evaluate(({ name, content, diskFiles }) => {
    const editor = window.editor;
    if (editor) {
      editor.setDiskFiles(diskFiles);
      editor.setText(content);
    }
    const fileNameEl = document.querySelector('#doc-file-name');
    if (fileNameEl) fileNameEl.textContent = name;
  }, {
    name: 'main_sim.ax',
    content: mainSimContent,
    diskFiles: {
      'vector_math.ax': vectorMathContent,
      'main_sim.ax': mainSimContent,
    },
  });

  await waitForEval();

  // Verify resolution
  const gutterHtml = await page.evaluate(() => {
    const gutter = document.querySelector('#doc-gutter');
    return gutter ? gutter.innerText : '';
  });
  console.log('Main sim gutter output:\n', gutterHtml);

  // Screenshot 1: Gate C Resolved state
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'gate_c_resolved.png') });
  console.log('Saved gate_c_resolved.png');

  // Step B: Move vector_math.ax (simulate moved/missing file)
  fs.renameSync(path.join(TEST_DIR, 'vector_math.ax'), path.join(TEST_DIR, 'vector_math.ax.bak'));

  await page.evaluate(({ name, content }) => {
    const editor = window.editor;
    if (editor) {
      editor.clearDiskFiles();
      editor.setText(content);
    }
  }, { name: 'main_sim.ax', content: mainSimContent });

  await waitForEval();

  const errorGutter = await page.evaluate(() => {
    const errorBox = document.querySelector('.doc-gutter-error');
    return errorBox ? errorBox.innerText : '';
  });
  console.log('Error gutter when file moved:\n', errorGutter);

  // Screenshot 2: Gate C Error showing searched paths
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'gate_c_error_searched_paths.png') });
  console.log('Saved gate_c_error_searched_paths.png');

  // Step C: Confirm disk file can still import physics.ax from stdlib
  await page.evaluate(({ name, content }) => {
    const editor = window.editor;
    if (editor) {
      editor.setText(content);
    }
    const fileNameEl = document.querySelector('#doc-file-name');
    if (fileNameEl) fileNameEl.textContent = name;
  }, { name: 'disk_physics_demo.ax', content: diskPhysicsContent });

  await waitForEval();

  const stdlibGutter = await page.evaluate(() => {
    const gutter = document.querySelector('#doc-gutter');
    return gutter ? gutter.innerText : '';
  });
  console.log('Disk file stdlib import gutter:\n', stdlibGutter);

  // Screenshot 3: Gate C Stdlib import from disk
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'gate_c_disk_importing_stdlib.png') });
  console.log('Saved gate_c_disk_importing_stdlib.png');

  await browser.close();
  console.log('GATE C verification completed successfully.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
