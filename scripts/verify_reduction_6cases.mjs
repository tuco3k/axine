import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'path';

const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function run() {
  console.log('Starting Vite server for reduction verification...');
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    server: { port: 5176 },
  });
  await server.listen();
  console.log('Vite server listening on http://localhost:5176');

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:5176/index.html...');
  await page.goto('http://localhost:5176/index.html');
  await page.waitForFunction(() => !!window.editor);

  const cases = [
    {
      id: 'case1_sqrt_neg1_lt_3',
      name: 'Case 1: sqrt(-1) < 3',
      code: 'sqrt(-1) < 3',
    },
    {
      id: 'case2_sqrt_neg1_plus_2_plus_2',
      name: 'Case 2: sqrt(-1) + 2 + 2',
      code: 'sqrt(-1) + 2 + 2',
    },
    {
      id: 'case3_2_plus_2',
      name: 'Case 3: 2 + 2',
      code: '2 + 2',
    },
    {
      id: 'case4_0_div_0',
      name: 'Case 4: 0/0',
      code: '0 / 0',
    },
    {
      id: 'case5_x_equals_0',
      name: 'Case 5: x = 0',
      code: 'x = 0',
    },
    {
      id: 'case6_infinite_loop',
      name: 'Case 6: Infinite loop / Budget exhaustion',
      code: 'f(x) := f(x) + 1\nf(0)',
    },
  ];

  const results = [];

  for (const tc of cases) {
    console.log(`\n========================================`);
    console.log(`Running ${tc.name}...`);
    
    // Set text in live editor
    await page.evaluate((code) => {
      window.editor.setText(code);
    }, tc.code);

    // Wait for evaluation and rendering
    await page.waitForTimeout(500);

    // Extract gutter HTML
    const gutterHtml = await page.evaluate(() => {
      const gutter = document.getElementById('doc-gutter');
      return gutter ? gutter.innerHTML : '';
    });

    const rowsHtml = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('.doc-gutter-row'));
      return rows.map((r, idx) => ({
        line: idx + 1,
        outerHTML: r.outerHTML,
        textContent: r.textContent?.trim() || '',
      }));
    });

    results.push({
      id: tc.id,
      name: tc.name,
      code: tc.code,
      gutterHtml,
      rows: rowsHtml,
    });

    // Capture screenshot of the full editor window
    const imgPath = path.join(ARTIFACT_DIR, `${tc.id}.png`);
    await page.screenshot({ path: imgPath });
    console.log(`Saved screenshot to ${imgPath}`);
    console.log(`Gutter Rows count: ${rowsHtml.length}`);
    rowsHtml.forEach(r => {
      console.log(`  [Line ${r.line}]: ${r.textContent}`);
    });
  }

  // Also capture a unified document screenshot containing multiple cases
  console.log(`\n========================================`);
  console.log(`Capturing unified document with all reduction cases...`);
  const unifiedCode = `# Axine: Evaluation is Reduction
sqrt(-1) < 3
sqrt(-1) + 2 + 2
2 + 2
0 / 0
x = 0`;
  await page.evaluate((code) => {
    window.editor.setText(code);
  }, unifiedCode);
  await page.waitForTimeout(600);
  const unifiedImgPath = path.join(ARTIFACT_DIR, 'unified_reduction_cases.png');
  await page.screenshot({ path: unifiedImgPath });
  console.log(`Saved unified screenshot to ${unifiedImgPath}`);

  await browser.close();
  await server.close();

  console.log('\n========================================');
  console.log('EXTRACTED DOM RESULTS FOR REPORT:');
  console.log(JSON.stringify(results, null, 2));
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
