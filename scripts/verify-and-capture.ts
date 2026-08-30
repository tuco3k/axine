import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'path';
import fs from 'fs';

const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function run() {
  // Start Vite dev server programmatically
  const server = await createServer({
    server: { port: 5173 },
  });
  await server.listen();
  const url = 'http://localhost:5173';
  console.log(`Server running at ${url}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 800 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  // Helper to enter expressions and capture screenshot
  async function loadNotebookWithCells(cells: string[], screenshotName: string) {
    await page.goto(url);
    await page.waitForSelector('#cells-container');

    // Inject state directly via window or UI
    await page.evaluate((cellContents) => {
      // Clear localStorage
      localStorage.clear();
      const stateObj = {
        title: 'Verification Notebook',
        cells: cellContents.map((source, i) => ({ id: `vcell_${i}`, source })),
      };
      localStorage.setItem('math_notebook_doc_default_doc', JSON.stringify(stateObj));
      localStorage.setItem('math_notebook_last_active', 'default_doc');
    }, cells);

    await page.goto(url);
    await page.waitForSelector('.notebook-cell');
    // Wait for canvas or output to render
    await page.waitForTimeout(400);

    const outPath = path.join(ARTIFACT_DIR, screenshotName);
    await page.screenshot({ path: outPath, fullPage: true });
    console.log(`Saved screenshot: ${outPath}`);
  }

  // 1. Ambiguity Table Cases
  console.log('--- 1. Capturing Ambiguity Table ---');
  await loadNotebookWithCells([
    '# Ambiguity Table Row 1: 2x\nx := 5\n2x',
    '# Ambiguity Table Row 2: xy undeclared (rich suggestion)\nxy + 1',
    '# Ambiguity Table Row 2: xy declared\nxy := 42\nxy',
    '# Ambiguity Table Row 3: f(x+1) application when f is defined\nx := 3\nf(t) := t^2\nf(x+1)',
    '# Ambiguity Table Row 3: f(x+1) as f · (x+1) when f is not defined\nf := 4\nx := 2\nf(x+1)',
    '# Ambiguity Table Row 4: a / b c -> a / (b · c)\na := 12\nb := 2\nc := 3\na / b c',
    '# Ambiguity Table Row 5: sin x^2 -> sin(x^2)\nx := 0\nsin x^2',
    '# Ambiguity Table Row 6: 2^3^2 -> 2^(3^2) = 512\n2^3^2',
    '# Ambiguity Table Row 7: -x^2 -> -(x^2)\nx := 3\n-x^2',
  ], 'ambiguity_table.png');

  // 2. Plots
  console.log('--- 2. Capturing 2D Curve graph(2x) ---');
  await loadNotebookWithCells(['graph(2x)'], 'plot_2d_curve.png');

  console.log('--- 2. Capturing Multi-series graph(2x, x^2, ln x) ---');
  await loadNotebookWithCells(['graph(2x, x^2, ln x, x in 0.1..10)'], 'plot_multi_series.png');

  console.log('--- 2. Capturing Shared Axis Note graph(2x, y, 9z) ---');
  await loadNotebookWithCells(['graph(2x, y, 9z)'], 'plot_shared_axis_note.png');

  console.log('--- 2. Capturing Asymptote Breaking graph(tan x) ---');
  await loadNotebookWithCells(['graph(tan x, x in -5..5)'], 'plot_tan_asymptote.png');

  console.log('--- 2. Capturing Heatmap graph(sin x cos y) ---');
  await loadNotebookWithCells(['graph(sin x cos y, x in -5..5, y in -5..5)'], 'plot_heatmap.png');

  console.log('--- 2. Capturing 3D Surface ---');
  await page.click('button:has-text("3D Surface")');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'plot_surface_3d.png'), fullPage: true });

  console.log('--- 2. Capturing Parametric Curve graph((cos t, sin t), t in 0..tau) ---');
  await loadNotebookWithCells(['graph((cos t, sin t), t in 0..tau)'], 'plot_parametric.png');

  // 3. Error Messages with Underlined Source
  console.log('--- 3. Capturing 5 Rich Error Messages ---');
  await loadNotebookWithCells([
    '# Error 1: Undeclared multi-letter identifier\nvelocity + 10',
    '# Error 2: Division by zero\n100 / (5 - 5)',
    '# Error 3: Sqrt of negative in real mode\nsqrt(-16)',
    '# Error 4: Indeterminate form\n0^0',
    '# Error 5: Factorial of negative / non-integer\n(-5)!',
  ], 'error_messages.png');

  // 4. Persistence Test (Save & Reload)
  console.log('--- 4. Testing Document Persistence ---');
  await page.goto(url);
  await page.waitForSelector('#cells-container');
  // Type into cell
  await page.fill('.cell-input', 'total := 1/3 + 1/3 + 1/3\ntotal');
  await page.click('button.run-btn');
  await page.click('button:has-text("💾 Save")');
  await page.waitForTimeout(300);
  // Reload
  await page.reload();
  await page.waitForSelector('.notebook-cell');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'persistence_reload.png'), fullPage: true });

  await browser.close();
  await server.close();
  console.log('Verification and screenshot capture complete!');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
