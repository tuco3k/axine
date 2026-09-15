import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  console.log('=== PRECISE DIAGNOSTIC: 500-LINE DOC WITH 15+ SPACES & RESULTS PANE ===');
  const server = await createServer({
    configFile: path.resolve(__dirname, '../vite.config.ts'),
    server: { port: 5219 },
  });
  await server.listen();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 }
  });

  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => consoleLogs.push(`[PAGE_ERR] ${err.message}`));
  page.on('crash', () => consoleLogs.push(`[PAGE_CRASH]`));

  await page.goto('http://localhost:5219');
  await page.waitForFunction(() => typeof window.editor !== 'undefined');

  // Build a 500-line document with 20 spaces
  const lines = [];
  lines.push('# Benchmark: 500 lines, 20 spaces');
  for (let s = 1; s <= 20; s++) {
    lines.push(`## Section ${s}`);
    lines.push(`:a_${s} = ${s}`);
    lines.push(`:b_${s} = ${s * 2}`);
    lines.push(`{\\axis x, y; x^2 + y^2 = ${s + 1}; y = 0.${s} * x}`);
    lines.push(`:k_${s} = :a_${s} + :b_${s}`);
    for (let p = 5; p < 25; p++) {
      lines.push(`# padding line ${p} in section ${s}`);
    }
  }
  const docText = lines.join('\n');
  console.log(`Document has ${lines.length} lines.`);

  // Set up instrumentation before document load
  await page.evaluate(() => {
    window.__stats = {
      spaceViewportConstructed: 0,
      renderCalls: 0,
      samples2DCount: 0,
    };

    if (window.SpaceViewport) {
      const origProtoRender = window.SpaceViewport.prototype.render;
      window.SpaceViewport.prototype.render = function(...args) {
        window.__stats.renderCalls++;
        return origProtoRender.apply(this, args);
      };
    }
  });

  console.log('Opening document and setting up side-by-side split...');
  const t0 = Date.now();
  await page.evaluate((text) => {
    // Open document
    window.editor.openInitialDocument(text);

    // Split pane to have Editor on left and Results on right
    const pc = window.editor.paneContainer;
    const rootLeafId = pc.getLayout().root.id;
    pc.split(rootLeafId, 'horizontal', 'after', {
      id: 'tab_results_bench',
      type: 'results',
      title: 'Benchmark Results',
    });
    pc.render();
  }, docText);

  console.log('Waiting for evaluation and render to complete...');
  let settleMs = 0;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(250);
    settleMs += 250;
    const evaluating = await page.evaluate(() => window.editor?.state?.getIsEvaluating?.());
    if (!evaluating) break;
  }
  console.log(`Settled in ~${settleMs}ms`);

  const report = await page.evaluate(() => {
    const textarea = document.querySelector('#doc-textarea');
    const overlay = document.querySelector('#doc-typeset-overlay');
    const gutter = document.querySelector('#doc-gutter');
    const gutterRows = document.querySelectorAll('.doc-gutter-row');
    const spaceContainers = document.querySelectorAll('.doc-space-container');
    const canvases = document.querySelectorAll('.space-viewport-canvas');
    const records = window.editor?.state?.getRecords?.() || [];

    // Check which gutter rows have results
    let rowsWithResult = 0;
    let rowsWithSpace = 0;
    let rowsWithError = 0;
    let firstGutterText = '';
    let lastGutterText = '';

    gutterRows.forEach((r, idx) => {
      const text = r.textContent?.trim() || '';
      if (text) {
        rowsWithResult++;
        if (!firstGutterText) firstGutterText = `Row ${idx + 1}: ${text.slice(0, 40)}`;
        lastGutterText = `Row ${idx + 1}: ${text.slice(0, 40)}`;
      }
      if (r.querySelector('.doc-space-container')) rowsWithSpace++;
      if (r.querySelector('.doc-gutter-error')) rowsWithError++;
    });

    return {
      textRendered: !!textarea && textarea.value.length > 0,
      textareaVisible: !!textarea && textarea.offsetHeight > 0,
      overlayLinesRendered: overlay?.children?.length ?? 0,
      overlayVisible: !!overlay && overlay.offsetHeight > 0,
      gutterFound: !!gutter,
      gutterVisible: !!gutter && gutter.offsetHeight > 0,
      totalGutterRows: gutterRows.length,
      rowsWithResult,
      rowsWithSpace,
      rowsWithError,
      firstGutterText,
      lastGutterText,
      canvasesRendered: canvases.length,
      stats: window.__stats,
      totalRecords: records.length,
      lastDurationMs: window.editor?.state?.getLastDurationMs?.(),
    };
  });

  console.log('Diagnostic Report:', JSON.stringify(report, null, 2));
  console.log('Console logs:', consoleLogs.slice(-20).join('\n') || '(none)');

  // Measure keystroke latency
  console.log('\nMeasuring Keystroke Latency...');
  const keyLatency = await page.evaluate(async () => {
    const textarea = document.querySelector('#doc-textarea');
    if (!textarea) return { error: 'No textarea' };
    textarea.focus();

    window.__stats.renderCalls = 0;
    const tStart = performance.now();

    // Type one character
    const pos = textarea.selectionStart;
    textarea.value = textarea.value.slice(0, pos) + 'x' + textarea.value.slice(pos);
    textarea.selectionStart = textarea.selectionEnd = pos + 1;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    // Wait for paint
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    const tPaint = performance.now();

    return {
      keystrokeInputLatencyMs: tPaint - tStart,
      renderCallsImmediatelyAfterKey: window.__stats.renderCalls,
    };
  });
  console.log('Keystroke Latency Result:', keyLatency);

  // Measure time until background evaluation completes and gutter re-renders
  let postKeySettle = 0;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(100);
    postKeySettle += 100;
    const evaluating = await page.evaluate(() => window.editor?.state?.getIsEvaluating?.());
    if (!evaluating) break;
  }
  console.log(`Post-keystroke re-evaluation took ~${postKeySettle}ms`);

  const postKeyReport = await page.evaluate(() => {
    return {
      renderCallsTotal: window.__stats.renderCalls,
      canvases: document.querySelectorAll('.space-viewport-canvas').length,
    };
  });
  console.log('Post-keystroke Render Stats:', postKeyReport);

  await browser.close();
  await server.close();
}

run().catch(console.error);
