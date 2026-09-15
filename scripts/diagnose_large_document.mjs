import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  console.log('=== DIAGNOSING LARGE DOCUMENT RENDERING ===');
  const server = await createServer({
    configFile: path.resolve(__dirname, '../vite.config.ts'),
    server: { port: 5217 },
  });
  await server.listen();
  console.log('Vite server running at http://localhost:5217');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 }
  });

  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => {
    consoleLogs.push(`[PAGE_ERROR] ${err.message}\n${err.stack}`);
  });

  await page.goto('http://localhost:5217');
  await page.waitForFunction(() => typeof window.editor !== 'undefined');
  await page.waitForTimeout(300);

  // Generate a document of ~500 lines with 20 spaces
  let docLines = [];
  docLines.push('# Large Benchmark Document: 500 lines with 20 spaces');
  for (let s = 1; s <= 20; s++) {
    docLines.push(`## Section ${s}: Space ${s}`);
    docLines.push(`:a_${s} = ${s}`);
    docLines.push(`:b_${s} = ${s * 2}`);
    docLines.push(`:k_${s} = :a_${s} + :b_${s}`);
    docLines.push(`{\\axis x, y;`);
    docLines.push(`  x^2 + y^2 = ${s + 1}`);
    docLines.push(`  y = 0.${s} * x`);
    docLines.push(`}`);
    docLines.push(`:res_${s} = :k_${s} * 2`);
    for (let pad = 0; pad < 16; pad++) {
      docLines.push(`# commentary padding line ${pad} for space ${s}`);
    }
  }

  const sampleDoc = docLines.join('\n');
  console.log(`Generated benchmark document: ${docLines.length} lines, 20 spaces.`);

  console.log('\n--- 1. Opening ~500 lines document with 20 spaces in editor ---');
  const t0 = Date.now();
  await page.evaluate((text) => {
    window.__stats = {
      spaceViewportConstructed: 0,
      renderCalls: 0,
      renderWorkPanelCalls: 0,
    };
    if (window.SpaceViewport) {
      const origProtoRender = window.SpaceViewport.prototype.render;
      window.SpaceViewport.prototype.render = function(...args) {
        window.__stats.renderCalls++;
        return origProtoRender.apply(this, args);
      };
    }

    window.editor.openInitialDocument(text);
  }, sampleDoc);

  // Wait to let worker finish and UI settle
  console.log('Waiting for evaluation and rendering to settle...');
  let settleTime = 0;
  for (let w = 0; w < 40; w++) {
    await page.waitForTimeout(500);
    settleTime += 500;
    const isDone = await page.evaluate(() => !window.editor?.state?.getIsEvaluating?.());
    if (isDone) {
      console.log(`Settled after ~${settleTime}ms`);
      break;
    }
  }

  const editorState = await page.evaluate(() => {
    const editor = window.editor;
    const textarea = document.querySelector('#doc-textarea');
    const overlay = document.querySelector('#doc-typeset-overlay');
    const gutter = document.querySelector('#doc-gutter');
    const gutterRows = document.querySelectorAll('.doc-gutter-row');
    const spaceContainers = document.querySelectorAll('.doc-space-container');
    const canvases = document.querySelectorAll('.space-viewport-canvas');
    const records = editor?.state?.getRecords?.() || [];
    const isEvaluating = editor?.state?.getIsEvaluating?.();

    let evaluatedCount = 0;
    let errorCount = 0;
    let spaceResultsCount = 0;
    for (const r of records) {
      if (r.result || r.classification?.state === 'PROSE') evaluatedCount++;
      if (r.error) errorCount++;
      if (r.result && r.result.type === 'space') spaceResultsCount++;
    }

    // Inspect first few gutter rows and last few gutter rows
    const firstRowContent = gutterRows[0]?.textContent?.trim() || '';
    const midRowIndex = Math.floor(gutterRows.length / 2);
    const midRowContent = gutterRows[midRowIndex]?.textContent?.trim() || '';
    const lastRowContent = gutterRows[gutterRows.length - 1]?.textContent?.trim() || '';

    return {
      textareaValueLength: textarea?.value?.length ?? 0,
      textareaVisible: !!textarea && textarea.offsetHeight > 0,
      overlayLinesCount: overlay?.children?.length ?? 0,
      overlayVisible: !!overlay && overlay.offsetHeight > 0,
      overlayFirstLineHtml: overlay?.children?.[0]?.innerHTML?.slice(0, 100),
      gutterRowsCount: gutterRows.length,
      gutterVisible: !!gutter && gutter.offsetHeight > 0,
      firstRowContent,
      midRowIndex,
      midRowContent,
      lastRowContent,
      spaceContainersCount: spaceContainers.length,
      canvasesCount: canvases.length,
      totalRecords: records.length,
      evaluatedCount,
      errorCount,
      spaceResultsCount,
      isEvaluating,
      lastDurationMs: editor?.state?.getLastDurationMs?.(),
      stats: window.__stats,
    };
  });

  console.log('Editor State Analysis:');
  console.log(JSON.stringify(editorState, null, 2));

  console.log('\nConsole messages during load:');
  console.log(consoleLogs.slice(-25).join('\n') || '(no console logs)');

  // Measure keystroke latency
  console.log('\n--- 2. Measuring Keystroke Latency on 500-line doc ---');
  const keyLatency = await page.evaluate(async () => {
    const textarea = document.querySelector('#doc-textarea');
    if (!textarea) return { error: 'No textarea' };
    textarea.focus();

    // Reset render counter before typing
    window.__stats.renderCalls = 0;

    const tStart = performance.now();
    // Simulate typing a single character
    const startPos = textarea.selectionStart;
    textarea.value = textarea.value.slice(0, startPos) + 'x' + textarea.value.slice(startPos);
    textarea.selectionStart = textarea.selectionEnd = startPos + 1;
    
    // Trigger input event
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    // Wait until browser paints the keystroke
    await new Promise(resolve => requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    }));
    const tPaint = performance.now();

    return {
      keystrokePaintLatencyMs: tPaint - tStart,
      statsAfterKeystroke: window.__stats,
    };
  });
  console.log('Keystroke Latency Result:', keyLatency);

  // Observe how long background evaluation and gutter re-render take after the keystroke
  console.log('Observing post-keystroke re-evaluation...');
  const tKeyStart = Date.now();
  let keySettleTime = 0;
  for (let w = 0; w < 30; w++) {
    await page.waitForTimeout(300);
    keySettleTime += 300;
    const isDone = await page.evaluate(() => !window.editor?.state?.getIsEvaluating?.());
    if (isDone) {
      console.log(`Re-evaluation settled after ${keySettleTime}ms`);
      break;
    }
  }

  const postKeyStats = await page.evaluate(() => {
    return {
      stats: window.__stats,
      isEvaluating: window.editor?.state?.getIsEvaluating?.(),
      lastDurationMs: window.editor?.state?.getLastDurationMs?.(),
    };
  });
  console.log('Post-keystroke stats:', postKeyStats);

  // --- 3. Now test docs/LANGUAGE.md directly in the editor ---
  console.log('\n--- 3. Testing docs/LANGUAGE.md directly in the editor ---');
  const langDoc = fs.readFileSync(path.resolve(__dirname, '../docs/LANGUAGE.md'), 'utf8');
  console.log(`LANGUAGE.md size: ${langDoc.split('\n').length} lines, ${langDoc.length} bytes.`);

  consoleLogs.length = 0; // reset logs
  const tLang0 = Date.now();
  await page.evaluate((text) => {
    window.__stats = {
      spaceViewportConstructed: 0,
      renderCalls: 0,
      renderWorkPanelCalls: 0,
    };
    window.editor.openInitialDocument(text);
  }, langDoc);

  console.log('Waiting for LANGUAGE.md evaluation and rendering...');
  let langSettleTime = 0;
  let langTimedOut = false;
  for (let w = 0; w < 40; w++) {
    await page.waitForTimeout(500);
    langSettleTime += 500;
    const isDone = await page.evaluate(() => !window.editor?.state?.getIsEvaluating?.());
    if (isDone) {
      console.log(`LANGUAGE.md settled after ~${langSettleTime}ms`);
      break;
    }
    if (w === 39) langTimedOut = true;
  }

  const langEditorState = await page.evaluate(() => {
    const editor = window.editor;
    const textarea = document.querySelector('#doc-textarea');
    const overlay = document.querySelector('#doc-typeset-overlay');
    const gutter = document.querySelector('#doc-gutter');
    const gutterRows = document.querySelectorAll('.doc-gutter-row');
    const spaceContainers = document.querySelectorAll('.doc-space-container');
    const canvases = document.querySelectorAll('.space-viewport-canvas');
    const records = editor?.state?.getRecords?.() || [];
    const isEvaluating = editor?.state?.getIsEvaluating?.();

    let evaluatedCount = 0;
    let errorCount = 0;
    let spaceResultsCount = 0;
    const errorsList = [];
    for (let idx = 0; idx < records.length; idx++) {
      const r = records[idx];
      if (r.result || r.classification?.state === 'PROSE') evaluatedCount++;
      if (r.error) {
        errorCount++;
        if (errorsList.length < 5) {
          errorsList.push({ line: idx + 1, text: r.text, err: r.error.message });
        }
      }
      if (r.result && r.result.type === 'space') spaceResultsCount++;
    }

    return {
      textareaValueLength: textarea?.value?.length ?? 0,
      textareaVisible: !!textarea && textarea.offsetHeight > 0,
      overlayLinesCount: overlay?.children?.length ?? 0,
      gutterRowsCount: gutterRows.length,
      spaceContainersCount: spaceContainers.length,
      canvasesCount: canvases.length,
      totalRecords: records.length,
      evaluatedCount,
      errorCount,
      spaceResultsCount,
      sampleErrors: errorsList,
      isEvaluating,
      lastDurationMs: editor?.state?.getLastDurationMs?.(),
      stats: window.__stats,
    };
  });

  console.log('LANGUAGE.md Editor State:');
  console.log(JSON.stringify(langEditorState, null, 2));

  console.log('\nConsole messages during LANGUAGE.md:');
  console.log(consoleLogs.slice(-25).join('\n') || '(no console logs)');

  // --- 4. Finding the Ceiling (line count and space count) ---
  console.log('\n--- 4. Finding the working ceiling by line and space count ---');
  // We test increasing document sizes: (50 lines, 2 spaces), (100 lines, 5 spaces), (200 lines, 10 spaces), (300 lines, 15 spaces), (400 lines, 20 spaces)
  const tests = [
    { lines: 50, spaces: 2 },
    { lines: 100, spaces: 4 },
    { lines: 200, spaces: 8 },
    { lines: 300, spaces: 12 },
    { lines: 400, spaces: 16 },
    { lines: 500, spaces: 20 },
    { lines: 600, spaces: 25 },
  ];

  for (const t of tests) {
    const lines = [];
    const linesPerSpace = Math.floor(t.lines / t.spaces);
    for (let s = 1; s <= t.spaces; s++) {
      lines.push(`:a_${s} = ${s}`);
      lines.push(`{\\axis x, y; x^2 + y^2 = ${s + 1}; y = 0.${s} * x}`);
      for (let p = 2; p < linesPerSpace; p++) {
        lines.push(`# padding line ${p}`);
      }
    }
    while (lines.length < t.lines) {
      lines.push(`# trailing pad ${lines.length}`);
    }

    const docStr = lines.join('\n');
    const startT = performance.now();
    await page.evaluate((text) => {
      window.editor.openInitialDocument(text);
    }, docStr);

    let passed = false;
    let evalTime = 0;
    for (let w = 0; w < 20; w++) {
      await page.waitForTimeout(250);
      evalTime += 250;
      const isDone = await page.evaluate(() => !window.editor?.state?.getIsEvaluating?.());
      if (isDone) {
        passed = true;
        break;
      }
    }

    const summary = await page.evaluate(() => {
      const records = window.editor?.state?.getRecords?.() || [];
      const canvases = document.querySelectorAll('.space-viewport-canvas');
      return {
        totalRecords: records.length,
        canvases: canvases.length,
        lastDurationMs: window.editor?.state?.getLastDurationMs?.(),
      };
    });

    console.log(`Ceiling Test [${t.lines} lines, ${t.spaces} spaces]: Passed=${passed}, Settle=${evalTime}ms, Canvases=${summary.canvases}, EvalDuration=${summary.lastDurationMs}ms`);
  }

  await browser.close();
  await server.close();
  console.log('\n=== DIAGNOSIS COMPLETE ===');
}

run().catch(err => {
  console.error('Diagnostic run error:', err);
  process.exit(1);
});
