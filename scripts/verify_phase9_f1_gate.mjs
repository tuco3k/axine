import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function verifyGateF1() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to app...');
  await page.goto('http://localhost:5173');
  await page.waitForSelector('#doc-textarea');

  const textarea = await page.$('#doc-textarea');

  // Input the two Gate F1 test expressions into the notebook document:
  // 1. Definite Integral: ∫₀^∞ (x^2 + 1) // sqrt(x^3 - 1) dx
  // 2. 3x3 Matrix Equation: [[1, 2, 3], [0, 1, 4], [5, 6, 0]] * [[x], [y], [z]] = [[1], [0], [0]]
  const docText = `∫_0^inf (x^2 + 1) // sqrt(x^3 - 1) dx
[[1, 2, 3], [0, 1, 4], [5, 6, 0]] * [[x], [y], [z]] = [[1], [0], [0]]`;

  await textarea.fill(docText);
  await page.waitForTimeout(600);

  // 1. Capture the Full Workspace Screenshot
  const fullWorkspacePath = path.join(ARTIFACT_DIR, 'typeset_gate_f1_workspace.png');
  await page.screenshot({ path: fullWorkspacePath });
  console.log(`Saved full workspace screenshot: ${fullWorkspacePath}`);

  // 2. Capture isolated element screenshot of Gutter Results
  const gutterEl = await page.$('#tab-results-panel');
  if (gutterEl) {
    const gutterPath = path.join(ARTIFACT_DIR, 'typeset_gate_f1_gutter.png');
    await gutterEl.screenshot({ path: gutterPath });
    console.log(`Saved gutter screenshot: ${gutterPath}`);
  }

  // 3. Render and capture isolated high-resolution cards for the integral and matrix
  await page.evaluate(() => {
    // Append dedicated showcase container in document body for crystal-clear inspection
    let showcase = document.getElementById('gate-f1-showcase');
    if (!showcase) {
      showcase = document.createElement('div');
      showcase.id = 'gate-f1-showcase';
      showcase.style.position = 'fixed';
      showcase.style.top = '60px';
      showcase.style.left = '60px';
      showcase.style.zIndex = '99999';
      showcase.style.background = '#181716';
      showcase.style.border = '1px solid #3d3936';
      showcase.style.borderRadius = '6px';
      showcase.style.padding = '32px 48px';
      showcase.style.display = 'flex';
      showcase.style.flexDirection = 'column';
      showcase.style.gap = '36px';
      showcase.style.boxShadow = '0 10px 30px rgba(0,0,0,0.6)';
      document.body.appendChild(showcase);
    }

    const typeset = window.typesetMath;
    const integralHtml = typeset ? typeset('∫_0^inf (x^2 + 1) // sqrt(x^3 - 1) dx') : '';
    const matrixHtml = typeset ? typeset('[[1, 2, 3], [0, 1, 4], [5, 6, 0]] * [[x], [y], [z]] = [[1], [0], [0]]') : '';

    showcase.innerHTML = `
      <div style="font-family: var(--font-family-ui); font-size: 13px; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #3d3936; padding-bottom: 8px;">
        Phase 9 — Gate F1 Read-Only Typeset Mathematical Renderings
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <span style="font-family: var(--font-family-ui); font-size: 12px; color: var(--color-text-tertiary);">1. Definite Integral with Stacked Fraction & Radical:</span>
        <div id="showcase-integral" style="font-size: 26px; padding: 12px 0;">${integralHtml}</div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <span style="font-family: var(--font-family-ui); font-size: 12px; color: var(--color-text-tertiary);">2. 3×3 Matrix Equation with Extensible Delimiters:</span>
        <div id="showcase-matrix" style="font-size: 24px; padding: 12px 0;">${matrixHtml}</div>
      </div>
    `;
  });

  await page.waitForTimeout(200);
  const showcaseEl = await page.$('#gate-f1-showcase');
  if (showcaseEl) {
    const showcasePath = path.join(ARTIFACT_DIR, 'typeset_gate_f1_showcase.png');
    await showcaseEl.screenshot({ path: showcasePath });
    console.log(`Saved showcase screenshot: ${showcasePath}`);
  }

  await browser.close();
  console.log('Gate F1 verification capture complete.');
}

verifyGateF1().catch(console.error);
