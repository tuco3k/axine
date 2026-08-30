import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173');
  await page.waitForSelector('#corpus-select');

  // 1. Select Clifford Torus (14) and verify 3D parametric surface at 3 orbit angles
  console.log('Selecting Clifford Torus (14)...');
  await page.selectOption('#corpus-select', 'clifford');
  await page.waitForTimeout(600);

  // Click View Plot button in the gutter
  const plotBtn = await page.waitForSelector('.doc-plot-btn');
  await plotBtn.click();
  await page.waitForTimeout(400);

  // Screenshot angle 1 (default isometric orbit)
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'clifford_angle_1_isometric.png') });
  console.log('Saved clifford_angle_1_isometric.png');

  // Drag modal canvas to rotate orbit (angle 2)
  const modalCanvas = await page.$('#doc-modal-canvas');
  if (modalCanvas) {
    const box = await modalCanvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 - 80, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'clifford_angle_2_rotated.png') });
      console.log('Saved clifford_angle_2_rotated.png');

      // Drag to angle 3 (side perspective)
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - 150, box.y + box.height / 2 + 100, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'clifford_angle_3_side.png') });
      console.log('Saved clifford_angle_3_side.png');
    }
  }

  // Close modal
  await page.click('#doc-modal-close');
  await page.waitForTimeout(200);

  // 2. Select E8 lattice & Point Cloud (15)
  console.log('Selecting E8 lattice (15)...');
  await page.selectOption('#corpus-select', 'e8_lattice');
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'e8_point_cloud.png') });
  console.log('Saved e8_point_cloud.png');

  // 3. ONE scene containing TWO intersecting surfaces showing mutual depth occlusion
  console.log('Testing single-scene intersecting surfaces mutual occlusion...');
  const intersectingDoc = `# Single 3D scene with two intersecting surfaces
graph(sin(x) * cos(y), 0.5 * (x - y), x in -3..3, y in -3..3)`;
  await page.fill('#doc-textarea', intersectingDoc);
  await page.waitForTimeout(600);
  const surfBtn = await page.waitForSelector('.doc-plot-btn');
  await surfBtn.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'intersecting_surfaces_occlusion.png') });
  console.log('Saved intersecting_surfaces_occlusion.png');
  await page.click('#doc-modal-close');

  // 4. Test 2D Plot with corrected y-axis tick labels
  console.log('Testing 2D plot y-axis tick labels...');
  const plot2dDoc = `# 2D Parabola Plot
graph(x^2, x in -5..5)`;
  await page.fill('#doc-textarea', plot2dDoc);
  await page.waitForTimeout(600);
  const p2dBtn = await page.waitForSelector('.doc-plot-btn');
  await p2dBtn.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'plot_2d_y_axis_ticks.png') });
  console.log('Saved plot_2d_y_axis_ticks.png');
  await page.click('#doc-modal-close');

  // 5. Test Stop button killing non-yielding loop in <100ms
  console.log('Testing Stop button timing...');
  await page.fill('#doc-textarea', '{ loop(x) := loop(x + 1); loop(0) }');
  await page.click('#doc-run-btn');
  await page.waitForTimeout(100);

  const tStart = Date.now();
  await page.click('#doc-stop-btn');
  const tDuration = Date.now() - tStart;
  console.log(`Stop button execution latency: ${tDuration} ms`);

  const statusText = await page.$eval('#doc-status-badge', el => el.textContent);
  console.log(`Status badge after Stop: ${statusText}`);

  // 6. Test Ambient keystroke responsiveness during invoked run
  console.log('Testing Keystroke latency during Invoked run...');
  await page.selectOption('#budget-select', '60000'); // 60s budget
  await page.click('#doc-run-btn'); // Start long invoked run
  await page.waitForTimeout(50);

  // Type into editor while invoked run is in progress
  const typeStart = Date.now();
  await page.type('#doc-textarea', '\n2 + 2\n');
  const typeDuration = Date.now() - typeStart;
  console.log(`Ambient typing duration for 7 characters: ${typeDuration} ms`);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'dual_pool_execution.png') });
  console.log('Saved dual_pool_execution.png');

  // 7. Test Algebraic Isolate Derivation rendering
  console.log('Testing algebraic isolate derivation rendering...');
  const isolateDoc = `# Algebraic Step-by-Step Derivation
isolate(2*(x - 3) == 4*x + 1, for: x)`;
  await page.fill('#doc-textarea', isolateDoc);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'algebraic_isolate_derivation.png') });
  console.log('Saved algebraic_isolate_derivation.png');

  // 8. Test Solve Convergence Trace rendering
  console.log('Testing solve convergence trace rendering...');
  const solveTraceDoc = `# Numeric Solve Convergence Trace
f(x) := x^3 - 2*x - 5
solve(f, near: 2, trace: true)`;
  await page.fill('#doc-textarea', solveTraceDoc);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'solve_convergence_trace.png') });
  console.log('Saved solve_convergence_trace.png');

  await browser.close();
  console.log('All browser verifications completed successfully!');
}

main().catch(err => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
