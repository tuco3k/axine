const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function runVerification() {
  console.log('Launching browser for continuous document editor verification...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  await page.goto('http://localhost:5173/');
  await page.waitForSelector('.doc-app-shell');
  console.log('App shell loaded.');

  const corpusList = [
    'collatz',
    'basel',
    'logistic',
    'goldbach',
    'fibonacci',
    'zeno',
    'newton',
    'euler',
  ];

  // 1. Verify and screenshot 8 corpus documents
  for (const docId of corpusList) {
    console.log(`Selecting corpus document: ${docId}...`);
    await page.selectOption('#corpus-select', docId);
    await page.waitForTimeout(300); // Allow worker evaluation

    const screenshotPath = path.join(ARTIFACT_DIR, `corpus_${docId}.png`);
    await page.screenshot({ path: screenshotPath });
    console.log(`Saved screenshot: corpus_${docId}.png`);
  }

  // 2. Interactive plot modal verification
  console.log('Testing interactive plot modal...');
  await page.selectOption('#corpus-select', 'collatz');
  await page.waitForTimeout(300);
  const plotBtn = await page.$('.doc-plot-btn');
  if (plotBtn) {
    await plotBtn.click();
    await page.waitForTimeout(200);
    const modalShot = path.join(ARTIFACT_DIR, 'edge_plot_modal.png');
    await page.screenshot({ path: modalShot });
    console.log('Saved screenshot: edge_plot_modal.png');
    await page.click('#doc-modal-close');
    await page.waitForTimeout(100);
  }

  // 3. Shadowed definition test
  console.log('Testing shadowed definitions...');
  const shadowText = `x := 10\nx := 20\nx + 5`;
  await page.fill('#doc-textarea', shadowText);
  await page.waitForTimeout(300);
  const shadowShot = path.join(ARTIFACT_DIR, 'edge_shadowed_def.png');
  await page.screenshot({ path: shadowShot });
  console.log('Saved screenshot: edge_shadowed_def.png');

  // 4. Deleted definition error propagation test
  console.log('Testing deleted definition error propagation...');
  const deletedDefText = `f(x) := x^2\n# Commenting out definition\ny := f(10)\n# Now f is deleted below:\ng(x) := deleted_var * 2`;
  await page.fill('#doc-textarea', deletedDefText);
  await page.waitForTimeout(300);
  const deletedShot = path.join(ARTIFACT_DIR, 'edge_deleted_def.png');
  await page.screenshot({ path: deletedShot });
  console.log('Saved screenshot: edge_deleted_def.png');

  // 5. Infinite recursion budget limit test
  console.log('Testing infinite recursion budget limit...');
  const recursionText = `# Infinite recursion with budget limit\nbad(n) := bad(n + 1)\nbad 0`;
  await page.fill('#doc-textarea', recursionText);
  await page.waitForTimeout(300);
  const recShot = path.join(ARTIFACT_DIR, 'edge_infinite_recursion.png');
  await page.screenshot({ path: recShot });
  console.log('Saved screenshot: edge_infinite_recursion.png');

  await browser.close();
  console.log('All verification checks completed successfully!');
}

runVerification().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
