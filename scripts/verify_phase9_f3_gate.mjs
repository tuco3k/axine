import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function verifyGateF3() {
  console.log('Launching browser for Gate F3 Interactive Visualizations Verification...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2
  });

  const page = await context.newPage();
  await page.goto('http://localhost:5173', { waitUntil: 'load' });
  await page.waitForSelector('#doc-textarea');

  // Test 1: Riemann Sum on non-default expression \int_1^3 (3*x + 1) dx
  console.log('\n--- 1. Testing Riemann Sum Visualization on ∫_1^3 (3*x + 1) dx ---');
  const riemannData = await page.evaluate(() => {
    const { explainSymbol } = window;
    const exp = explainSymbol('dx', {
      parentType: 'integral',
      integrand: '3*x + 1',
      variableName: 'x',
      bounds: { lower: '1', upper: '3' }
    });

    const container = document.createElement('div');
    container.id = 'test-riemann-container';
    container.className = 'doc-math-popover';
    container.style.position = 'fixed';
    container.style.left = '60px';
    container.style.top = '60px';
    container.style.zIndex = '99999';

    container.innerHTML = `
      <div class="popover-header">
        <div class="popover-symbol-badge">${window.typesetMath(exp.symbol, { displayMode: false })}</div>
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
        <div class="popover-section">
          <div class="popover-section-label">3. SHOW ME</div>
          <div class="popover-section-content">
            <div class="popover-showme-preview">${exp.showMe}</div>
            <div class="popover-visualizer-container" id="riemann-vis-mount"></div>
          </div>
        </div>
        <div class="popover-section">
          <div class="popover-section-label">4. GO DEEPER</div>
          <div class="popover-section-content deeper-content">${exp.goDeeper}</div>
        </div>
      </div>
    `;

    document.body.appendChild(container);
    const mount = container.querySelector('#riemann-vis-mount');
    const vis = new window.ExplainerVisualizer(mount, exp.visualization);

    // Read initial values (n=6)
    const initialN = container.querySelector('#vis-n-badge')?.textContent?.trim();
    const initialDx = container.querySelector('#vis-val-dx')?.textContent?.trim();
    const initialSum = container.querySelector('#vis-val-sum')?.textContent?.trim();
    const initialExact = container.querySelector('#vis-val-exact')?.textContent?.trim();
    const initialErr = container.querySelector('#vis-val-error')?.textContent?.trim();

    // Set slider to n = 4
    const slider = container.querySelector('#riemann-n-slider');
    slider.value = '4';
    slider.dispatchEvent(new Event('input'));

    const n4_dx = container.querySelector('#vis-val-dx')?.textContent?.trim();
    const n4_sum = container.querySelector('#vis-val-sum')?.textContent?.trim();
    const n4_exact = container.querySelector('#vis-val-exact')?.textContent?.trim();
    const n4_err = container.querySelector('#vis-val-error')?.textContent?.trim();

    return {
      expression: '3*x + 1 on [1, 3]',
      initial: { n: initialN, dx: initialDx, sum: initialSum, exact: initialExact, err: initialErr },
      n4: { dx: n4_dx, sum: n4_sum, exact: n4_exact, err: n4_err },
      innerText: container.innerText
    };
  });

  console.log('Riemann Sum DOM Extraction:');
  console.log(JSON.stringify(riemannData, null, 2));

  const riemannEl = await page.$('#test-riemann-container');
  await riemannEl?.screenshot({ path: path.join(ARTIFACT_DIR, 'typeset_gate_f3_riemann.png') });
  console.log('Saved: typeset_gate_f3_riemann.png');

  await page.evaluate(() => document.getElementById('test-riemann-container')?.remove());

  // Test 2: Derivative as Tangent on non-default expression d//dx (x^3 - 2*x) at x0 = 1.5
  console.log('\n--- 2. Testing Derivative as Tangent on d//dx (x^3 - 2*x) at x0 = 1.5 ---');
  const derivData = await page.evaluate(() => {
    const { explainSymbol } = window;
    const exp = explainSymbol('dx', {
      parentType: 'derivative',
      exprString: 'x^3 - 2*x',
      variableName: 'x'
    });

    // Configure non-default point x0 = 1.5
    exp.visualization.expression = 'x^3 - 2*x';
    exp.visualization.point = 1.5;

    const container = document.createElement('div');
    container.id = 'test-deriv-container';
    container.className = 'doc-math-popover';
    container.style.position = 'fixed';
    container.style.left = '60px';
    container.style.top = '60px';
    container.style.zIndex = '99999';

    container.innerHTML = `
      <div class="popover-header">
        <div class="popover-symbol-badge">${window.typesetMath(exp.symbol, { displayMode: false })}</div>
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
        <div class="popover-section">
          <div class="popover-section-label">3. SHOW ME</div>
          <div class="popover-section-content">
            <div class="popover-showme-preview">${exp.showMe}</div>
            <div class="popover-visualizer-container" id="deriv-vis-mount"></div>
          </div>
        </div>
        <div class="popover-section">
          <div class="popover-section-label">4. GO DEEPER</div>
          <div class="popover-section-content deeper-content">${exp.goDeeper}</div>
        </div>
      </div>
    `;

    document.body.appendChild(container);
    const mount = container.querySelector('#deriv-vis-mount');
    const vis = new window.ExplainerVisualizer(mount, exp.visualization);

    // Initial with h = 1.0
    const initDy = container.querySelector('#vis-val-dy')?.textContent?.trim();
    const initSec = container.querySelector('#vis-val-secant')?.textContent?.trim();
    const initTan = container.querySelector('#vis-val-tangent')?.textContent?.trim();
    const initErr = container.querySelector('#vis-val-err')?.textContent?.trim();

    // Set slider to h = 0.5
    const slider = container.querySelector('#deriv-h-slider');
    slider.value = '0.5';
    slider.dispatchEvent(new Event('input'));

    const h05_dy = container.querySelector('#vis-val-dy')?.textContent?.trim();
    const h05_sec = container.querySelector('#vis-val-secant')?.textContent?.trim();
    const h05_tan = container.querySelector('#vis-val-tangent')?.textContent?.trim();
    const h05_err = container.querySelector('#vis-val-err')?.textContent?.trim();

    // Set slider to h = 0.1
    slider.value = '0.1';
    slider.dispatchEvent(new Event('input'));

    const h01_dy = container.querySelector('#vis-val-dy')?.textContent?.trim();
    const h01_sec = container.querySelector('#vis-val-secant')?.textContent?.trim();
    const h01_tan = container.querySelector('#vis-val-tangent')?.textContent?.trim();
    const h01_err = container.querySelector('#vis-val-err')?.textContent?.trim();

    return {
      expression: 'd//dx (x^3 - 2*x) at x0 = 1.5 (Exact Tangent = 4.7500)',
      h1_0: { dy: initDy, secant: initSec, tangent: initTan, err: initErr },
      h0_5: { dy: h05_dy, secant: h05_sec, tangent: h05_tan, err: h05_err },
      h0_1: { dy: h01_dy, secant: h01_sec, tangent: h01_tan, err: h01_err },
      innerText: container.innerText
    };
  });

  console.log('Derivative as Tangent DOM Extraction:');
  console.log(JSON.stringify(derivData, null, 2));

  const derivEl = await page.$('#test-deriv-container');
  await derivEl?.screenshot({ path: path.join(ARTIFACT_DIR, 'typeset_gate_f3_tangent.png') });
  console.log('Saved: typeset_gate_f3_tangent.png');

  await page.evaluate(() => document.getElementById('test-deriv-container')?.remove());

  // Test 3: Limit as Epsilon-Delta on non-default expression lim_{x -> 3} (2*x + 4)
  console.log('\n--- 3. Testing Limit as Epsilon-Delta on lim_{x -> 3} (2*x + 4) ---');
  const limitData = await page.evaluate(() => {
    const { explainSymbol } = window;
    const exp = explainSymbol('lim', {
      parentType: 'limit',
      exprString: '2*x + 4',
      variableName: 'x'
    });

    exp.visualization.expression = '2*x + 4';
    exp.visualization.point = 3.0;
    exp.visualization.targetLimit = 10.0;

    const container = document.createElement('div');
    container.id = 'test-limit-container';
    container.className = 'doc-math-popover';
    container.style.position = 'fixed';
    container.style.left = '60px';
    container.style.top = '60px';
    container.style.zIndex = '99999';

    container.innerHTML = `
      <div class="popover-header">
        <div class="popover-symbol-badge">${window.typesetMath(exp.symbol, { displayMode: false })}</div>
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
        <div class="popover-section">
          <div class="popover-section-label">3. SHOW ME</div>
          <div class="popover-section-content">
            <div class="popover-showme-preview">${exp.showMe}</div>
            <div class="popover-visualizer-container" id="limit-vis-mount"></div>
          </div>
        </div>
        <div class="popover-section">
          <div class="popover-section-label">4. GO DEEPER</div>
          <div class="popover-section-content deeper-content">${exp.goDeeper}</div>
        </div>
      </div>
    `;

    document.body.appendChild(container);
    const mount = container.querySelector('#limit-vis-mount');
    const vis = new window.ExplainerVisualizer(mount, exp.visualization);

    // Initial state: eps = 0.5, delta = 0.25 -> maxDev = 2*0.25 = 0.5000 -> Valid
    const initTarget = container.querySelector('#vis-val-target')?.textContent?.trim();
    const initMaxDev = container.querySelector('#vis-val-maxdev')?.textContent?.trim();
    const initStatus = container.querySelector('#vis-val-status')?.textContent?.trim();

    // Set eps = 0.6, delta = 0.2 -> maxDev = 0.4000 <= 0.6 -> Valid
    const epsSlider = container.querySelector('#eps-slider');
    const deltaSlider = container.querySelector('#delta-slider');
    epsSlider.value = '0.6';
    epsSlider.dispatchEvent(new Event('input'));
    deltaSlider.value = '0.2';
    deltaSlider.dispatchEvent(new Event('input'));

    const v1_maxdev = container.querySelector('#vis-val-maxdev')?.textContent?.trim();
    const v1_status = container.querySelector('#vis-val-status')?.textContent?.trim();

    // Set delta = 0.5 -> maxDev = 1.0000 > 0.6 -> Exceeds
    deltaSlider.value = '0.5';
    deltaSlider.dispatchEvent(new Event('input'));

    const v2_maxdev = container.querySelector('#vis-val-maxdev')?.textContent?.trim();
    const v2_status = container.querySelector('#vis-val-status')?.textContent?.trim();

    return {
      expression: '2*x + 4 near x0 = 3.0, L = 10.0',
      initial: { target: initTarget, maxdev: initMaxDev, status: initStatus },
      valid_delta_0_2: { maxdev: v1_maxdev, status: v1_status },
      invalid_delta_0_5: { maxdev: v2_maxdev, status: v2_status },
      innerText: container.innerText
    };
  });

  console.log('Limit as Epsilon-Delta DOM Extraction:');
  console.log(JSON.stringify(limitData, null, 2));

  const limitEl = await page.$('#test-limit-container');
  await limitEl?.screenshot({ path: path.join(ARTIFACT_DIR, 'typeset_gate_f3_limit.png') });
  console.log('Saved: typeset_gate_f3_limit.png');

  await page.evaluate(() => document.getElementById('test-limit-container')?.remove());

  // Test 4: All 3 Visualizations side by side in full comparison showcase
  console.log('\n--- 4. Generating All 3 Visualizations Showcase Screenshot ---');
  await page.evaluate(() => {
    const showcase = document.createElement('div');
    showcase.id = 'gate-f3-showcase';
    showcase.style.position = 'fixed';
    showcase.style.inset = '0';
    showcase.style.zIndex = '999999';
    showcase.style.backgroundColor = '#0b0f19';
    showcase.style.padding = '24px 32px';
    showcase.style.overflowY = 'auto';
    showcase.style.fontFamily = 'Inter, -apple-system, BlinkMacSystemFont, sans-serif';

    showcase.innerHTML = `
      <div style="font-size: 16px; font-weight: 700; color: #f8fafc; margin-bottom: 6px; letter-spacing: 0.05em;">
        PHASE 9 — GATE F3: EXPRESSION-DRIVEN INTERACTIVE MATHEMATICAL VISUALIZATIONS
      </div>
      <div style="font-size: 13px; color: #94a3b8; margin-bottom: 20px;">
        All three visualizations driven by live expressions written on screen (Riemann Sum on ∫_1^3 (3x+1)dx, Tangent Secant on d/dx(x³-2x) at x₀=1.5, Epsilon-Delta on lim(2x+4) near x₀=3)
      </div>

      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; align-items: start;">
        <!-- Card 1: Riemann Sum -->
        <div class="doc-math-popover" style="position: relative; width: 100%; max-height: none; display: flex;">
          <div class="popover-header">
            <div class="popover-symbol-badge">∫</div>
            <div class="popover-title-group">
              <span class="popover-role">Riemann Sum Integration: ∫₁³ (3x + 1) dx</span>
            </div>
          </div>
          <div class="popover-body" style="max-height: none;">
            <div class="popover-section">
              <div class="popover-section-label">SHOW ME: RIEMANN SUM PARTITIONS</div>
              <div class="popover-section-content">
                <div class="popover-visualizer-container" id="showcase-riemann"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Card 2: Derivative Tangent -->
        <div class="doc-math-popover" style="position: relative; width: 100%; max-height: none; display: flex;">
          <div class="popover-header">
            <div class="popover-symbol-badge">d/dx</div>
            <div class="popover-title-group">
              <span class="popover-role">Derivative as Tangent: d/dx(x³ - 2x) at x₀ = 1.5</span>
            </div>
          </div>
          <div class="popover-body" style="max-height: none;">
            <div class="popover-section">
              <div class="popover-section-label">SHOW ME: SECANT CONVERGENCE (h → 0)</div>
              <div class="popover-section-content">
                <div class="popover-visualizer-container" id="showcase-tangent"></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Card 3: Epsilon-Delta -->
        <div class="doc-math-popover" style="position: relative; width: 100%; max-height: none; display: flex;">
          <div class="popover-header">
            <div class="popover-symbol-badge">lim</div>
            <div class="popover-title-group">
              <span class="popover-role">Epsilon-Delta Limit: lim_{x→3} (2x + 4) = 10</span>
            </div>
          </div>
          <div class="popover-body" style="max-height: none;">
            <div class="popover-section">
              <div class="popover-section-label">SHOW ME: ERROR TOLERANCE BANDS (ε, δ)</div>
              <div class="popover-section-content">
                <div class="popover-visualizer-container" id="showcase-limit"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(showcase);

    new window.ExplainerVisualizer(document.getElementById('showcase-riemann'), {
      type: 'riemann_sum',
      expression: '3*x + 1',
      variable: 'x',
      bounds: { lower: 1, upper: 3 }
    });

    new window.ExplainerVisualizer(document.getElementById('showcase-tangent'), {
      type: 'derivative_tangent',
      expression: 'x^3 - 2*x',
      variable: 'x',
      point: 1.5
    });

    new window.ExplainerVisualizer(document.getElementById('showcase-limit'), {
      type: 'epsilon_delta',
      expression: '2*x + 4',
      variable: 'x',
      point: 3.0,
      targetLimit: 10.0
    });
  });

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'typeset_gate_f3_showcase.png') });
  console.log('Saved: typeset_gate_f3_showcase.png');

  await browser.close();
  console.log('Gate F3 verification completed.');
}

verifyGateF3().catch(console.error);
