import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testScale(page, lineCount, spaceCount) {
  const lines = [];
  lines.push(':r_seed = 1');
  const spaceInterval = Math.floor(lineCount / spaceCount);
  let spacesAdded = 0;

  for (let i = 1; i < lineCount; i++) {
    if (i % spaceInterval === 0 && spacesAdded < spaceCount) {
      spacesAdded++;
      lines.push(`{\\axis x, y; x^2 + y^2 = ${spacesAdded}}`);
    } else {
      lines.push(`# line ${i}: scalar comment or expression`);
    }
  }
  const text = lines.join('\n');

  console.log(`\n--- Testing ${lineCount} lines with ${spacesAdded} spaces ---`);

  const loadResult = await page.evaluate(async ({ text }) => {
    const t0 = performance.now();
    window.editor.openInitialDocument(text);

    const timeout = 60000;
    const startWait = performance.now();
    while (window.editor.state.getIsEvaluating()) {
      if (performance.now() - startWait > timeout) {
        return { error: 'Evaluation timeout (> 60s)' };
      }
      await new Promise(r => setTimeout(r, 100));
    }
    const t1 = performance.now();

    const gutterRows = document.querySelectorAll('.doc-gutter-row').length;
    const canvases = document.querySelectorAll('.space-viewport-canvas').length;

    return {
      evalTimeMs: t1 - t0,
      gutterRows,
      canvasesMounted: canvases,
    };
  }, { text });

  if (loadResult.error) {
    console.log(`FAILED: ${loadResult.error}`);
    return { lineCount, spaceCount: spacesAdded, error: loadResult.error };
  }

  // Measure keystroke-to-render latency
  const keystrokeResult = await page.evaluate(async () => {
    const textarea = document.querySelector('#doc-textarea');
    const start = performance.now();

    textarea.value = textarea.value + '\n:new_val = 999';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    // Wait for animation frame and DOM update
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
    const latency = performance.now() - start;

    return { latency };
  });

  // Measure worker response latency to complete that edit
  const reEvalTime = await page.evaluate(async () => {
    const t0 = performance.now();
    while (window.editor.state.getIsEvaluating()) {
      await new Promise(r => setTimeout(r, 10));
    }
    return performance.now() - t0;
  });

  console.log(`  Initial Load/Eval: ${loadResult.evalTimeMs.toFixed(1)}ms`);
  console.log(`  Gutter rows in DOM: ${loadResult.gutterRows}`);
  console.log(`  Keystroke-to-render latency (UI thread): ${keystrokeResult.latency.toFixed(2)}ms`);
  console.log(`  Subsequent re-evaluation settle time: ${reEvalTime.toFixed(1)}ms`);

  return {
    lineCount,
    spaceCount: spacesAdded,
    evalTimeMs: loadResult.evalTimeMs,
    keystrokeLatencyMs: keystrokeResult.latency,
    reEvalTimeMs: reEvalTime,
    gutterRows: loadResult.gutterRows,
  };
}

async function main() {
  const server = await createServer({
    configFile: path.resolve(__dirname, '../vite.config.ts'),
    server: { port: 5244 },
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto('http://localhost:5244');
  await page.waitForFunction(() => typeof window.editor !== 'undefined');

  const scales = [
    { lines: 15000, spaces: 500 },
    { lines: 25000, spaces: 1000 },
    { lines: 40000, spaces: 1500 },
    { lines: 60000, spaces: 2000 },
  ];

  const results = [];
  for (const s of scales) {
    try {
      const res = await testScale(page, s.lines, s.spaces);
      results.push(res);
      if (res.error || res.keystrokeLatencyMs > 50 || res.reEvalTimeMs > 5000) {
        console.log(`Ceiling reached at ~${s.lines} lines!`);
        break;
      }
    } catch (err) {
      console.error(`Error at ${s.lines} lines:`, err.message);
      results.push({ lineCount: s.lines, spaceCount: s.spaces, error: err.message });
      break;
    }
  }

  await browser.close();
  await server.close();

  console.log('\n=== ABSOLUTE CEILING BENCHMARK RESULTS ===');
  console.table(results);
}

main().catch(console.error);
