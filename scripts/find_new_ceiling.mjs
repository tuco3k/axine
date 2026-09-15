import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testScale(page, lineCount, spaceCount) {
  // Generate document
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
  const tStart = Date.now();

  const loadResult = await page.evaluate(async ({ text }) => {
    const t0 = performance.now();
    window.editor.openInitialDocument(text);

    // Wait until evaluation finishes or timeout
    const timeout = 30000;
    const startWait = performance.now();
    while (window.editor.state.getIsEvaluating()) {
      if (performance.now() - startWait > timeout) {
        return { error: 'Evaluation timeout (> 30s)' };
      }
      await new Promise(r => setTimeout(r, 50));
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
    return { lineCount, spaceCount: spacesAdded, error: loadResult.error, latency: null };
  }

  // Now measure keystroke-to-render latency
  const keystrokeResult = await page.evaluate(async () => {
    const textarea = document.querySelector('#doc-textarea');
    const start = performance.now();

    // Type a character
    textarea.value = textarea.value + '\n:new_val = 999';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    // Wait for next animation frame
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
    const latency = performance.now() - start;

    return {
      latency,
    };
  });

  console.log(`  Initial Load/Eval: ${loadResult.evalTimeMs.toFixed(1)}ms`);
  console.log(`  Canvases mounted in view: ${loadResult.canvasesMounted} / ${spacesAdded}`);
  console.log(`  Keystroke-to-render latency: ${keystrokeResult.latency.toFixed(2)}ms`);

  return {
    lineCount,
    spaceCount: spacesAdded,
    evalTimeMs: loadResult.evalTimeMs,
    canvasesMounted: loadResult.canvasesMounted,
    latency: keystrokeResult.latency,
    ok: keystrokeResult.latency < 50,
  };
}

async function main() {
  const server = await createServer({
    configFile: path.resolve(__dirname, '../vite.config.ts'),
    server: { port: 5233 },
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto('http://localhost:5233');
  await page.waitForFunction(() => typeof window.editor !== 'undefined');

  const scales = [
    { lines: 600, spaces: 20 },
    { lines: 1000, spaces: 40 },
    { lines: 2000, spaces: 60 },
    { lines: 3000, spaces: 100 },
    { lines: 5000, spaces: 150 },
    { lines: 7500, spaces: 200 },
    { lines: 10000, spaces: 300 },
  ];

  const results = [];
  for (const s of scales) {
    try {
      const res = await testScale(page, s.lines, s.spaces);
      results.push(res);
      if (res.error || res.latency > 100) {
        console.log(`Ceiling reached at ~${s.lines} lines!`);
        break;
      }
    } catch (err) {
      console.error(`Crashed at ${s.lines} lines:`, err.message);
      results.push({ lineCount: s.lines, spaceCount: s.spaces, error: err.message });
      break;
    }
  }

  await browser.close();
  await server.close();

  console.log('\n=== FINAL CEILING RESULTS SUMMARY ===');
  console.table(results);
}

main().catch(console.error);
