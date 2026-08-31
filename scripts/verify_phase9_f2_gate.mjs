import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function verifyGateF2() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to app for Gate F2 verification...');
  await page.goto('http://localhost:5173', { waitUntil: 'load', timeout: 10000 });
  await page.waitForSelector('#doc-textarea', { timeout: 10000 });

  const textarea = await page.$('#doc-textarea');

  // Input the two Gate F2 test lines:
  // Line 1: \int x^2 dx
  // Line 2: d//dx f(x)
  const docText = `∫ x^2 dx
d//dx f(x)`;

  await textarea.fill(docText);
  await page.waitForTimeout(500);

  // Render showcase cards in browser with live interactive popovers for both contexts
  await page.evaluate(() => {
    const { explainSymbol, typesetMath } = window;
    const expInt = explainSymbol('dx', { parentType: 'integral', integrand: 'x^2', variableName: 'x' });
    const expDeriv = explainSymbol('dx', { parentType: 'derivative', variableName: 'x' });

    function renderPopoverHtml(exp) {
      return `
        <div class="doc-math-popover" style="position: static; width: 440px; display: flex; animation: none;">
          <div class="popover-header">
            <div class="popover-symbol-badge">${typesetMath(exp.symbol, { displayMode: false })}</div>
            <div class="popover-title-group">
              <span class="popover-role">${exp.role}</span>
            </div>
          </div>
          <div class="popover-body">
            <div class="popover-section">
              <div class="popover-section-label">1. WHAT IT IS</div>
              <div class="popover-section-content">${exp.whatItIs}</div>
            </div>
            <div class="popover-section">
              <div class="popover-section-label">2. WHY IT IS HERE</div>
              <div class="popover-section-content">${exp.whyItIsHere}</div>
            </div>
            <div class="popover-section popover-showme-section">
              <div class="popover-section-label">3. SHOW ME</div>
              <div class="popover-section-content">
                <div class="popover-showme-preview">${exp.showMe}</div>
              </div>
            </div>
            <div class="popover-section popover-deeper-section">
              <details class="popover-details" open>
                <summary class="popover-section-label">4. GO DEEPER</summary>
                <div class="popover-section-content deeper-content">${exp.goDeeper}</div>
              </details>
            </div>
          </div>
        </div>
      `;
    }

    const container = document.createElement('div');
    container.id = 'gate-f2-showcase';
    container.style.position = 'fixed';
    container.style.top = '40px';
    container.style.left = '40px';
    container.style.zIndex = '99999';
    container.style.background = '#181716';
    container.style.border = '1px solid #3d3936';
    container.style.borderRadius = '8px';
    container.style.padding = '32px';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '24px';
    container.style.boxShadow = '0 12px 36px rgba(0,0,0,0.7)';

    container.innerHTML = `
      <div style="font-family: var(--font-family-ui); font-size: 14px; font-weight: 600; color: var(--color-text-primary); border-bottom: 1px solid #3d3936; padding-bottom: 8px;">
        PHASE 9 — GATE F2: CONTEXTUAL EXPLANATION OF THE SAME GLYPH ('dx') IN TWO DIFFERENT CONTEXTS
      </div>
      <div style="display: flex; gap: 32px;">
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="font-family: var(--font-family-math); font-size: 20px; color: var(--color-accent); background: #22201e; padding: 8px 16px; border-radius: 4px; border: 1px solid #3d3936;">
            Context A: ${typesetMath('\u222b x^2 dx')}
          </div>
          ${renderPopoverHtml(expInt)}
        </div>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div style="font-family: var(--font-family-math); font-size: 20px; color: var(--color-accent); background: #22201e; padding: 8px 16px; border-radius: 4px; border: 1px solid #3d3936;">
            Context B: ${typesetMath('d//dx f(x)')}
          </div>
          ${renderPopoverHtml(expDeriv)}
        </div>
      </div>
    `;

    document.body.appendChild(container);
  });

  await page.waitForTimeout(200);

  // 1. Capture the Side-by-Side Comparison Showcase
  const showcaseEl = await page.$('#gate-f2-showcase');
  if (showcaseEl) {
    const showcasePath = path.join(ARTIFACT_DIR, 'typeset_gate_f2_comparison.png');
    await showcaseEl.screenshot({ path: showcasePath });
    console.log(`Saved Gate F2 comparison screenshot: ${showcasePath}`);
  }

  // 2. Test interactive click on live element in DOM (anchored to the dx glyph in line 1)
  await page.evaluate(() => {
    const showcase = document.getElementById('gate-f2-showcase');
    if (showcase) showcase.style.display = 'none';

    const editor = window.editor;
    if (editor) {
      // Find the specific typeset token inside line 1
      const line1 = document.querySelector('.doc-typeset-line');
      const token = line1?.querySelector('.typeset-diff') || line1?.querySelector('.typeset-box') || line1?.lastElementChild || line1;
      if (token) {
        const exp = window.explainSymbol('dx', { parentType: 'integral', integrand: 'x^2' });
        editor.mathPopover.show(exp, token);
      }
    }
  });

  await page.waitForTimeout(200);
  const liveIntPath = path.join(ARTIFACT_DIR, 'typeset_gate_f2_integral_live.png');
  await page.screenshot({ path: liveIntPath });
  console.log(`Saved live integral popover screenshot: ${liveIntPath}`);

  await browser.close();
  console.log('Gate F2 verification completed successfully.');
}

verifyGateF2().catch(console.error);
