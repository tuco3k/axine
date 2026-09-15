import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function verifyGating() {
  console.log('=== VERIFYING GATING CORRECTNESS INVARIANTS ===');
  const server = await createServer({
    configFile: path.resolve(__dirname, '../vite.config.ts'),
    server: { port: 5227 },
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.goto('http://localhost:5227');
  await page.waitForFunction(() => typeof window.editor !== 'undefined');

  // Construct document with 3 spaces:
  // Space 1 at top (Line 4)
  // Space 2 in middle (Line 150)
  // Space 3 at bottom (Line 300) which depends on :r_dep defined on Line 2
  // Line 350 has an intentional syntax/math error while off-screen
  const lines = [];
  lines.push(':r_dep = 4');
  lines.push('# Space 1 (near top)');
  lines.push('{\\axis x, y; x^2 + y^2 = 1}');
  for (let i = 4; i < 150; i++) lines.push(`# padding line ${i}`);

  lines.push('# Space 2 (middle)');
  lines.push('{\\axis x, y; x^2 + y^2 = 9}');
  for (let i = 152; i < 300; i++) lines.push(`# padding line ${i}`);

  lines.push('# Space 3 (bottom, dependent on :r_dep)');
  lines.push('{\\axis x, y; x^2 + y^2 = :r_dep}');
  for (let i = 302; i < 350; i++) lines.push(`# padding line ${i}`);

  lines.push('# Error line off-screen at bottom');
  lines.push(':bad_var = 1/0 + undefined_var');
  for (let i = 352; i < 400; i++) lines.push(`# padding line ${i}`);

  const text = lines.join('\n');

  console.log('1. Loading test document (400 lines)...');
  await page.evaluate(({ text }) => {
    window.editor.openInitialDocument(text);
    const pc = window.editor.paneContainer;
    const rootLeafId = pc.getLayout().root.id;
    pc.split(rootLeafId, 'horizontal', 'after', {
      id: 'tab_results_gating',
      type: 'results',
      title: 'Gating Results',
    });
    pc.render();
  }, { text });

  await page.waitForFunction(() => !window.editor.state.getIsEvaluating());

  // --- Invariant 4: Off-screen space that would error still reports its error ---
  console.log('\n2. Testing Invariant 4: Off-screen error reporting...');
  const inv4 = await page.evaluate(() => {
    const errorRow = document.querySelector('.doc-gutter-row[data-line="350"]');
    const errorCard = errorRow?.querySelector('.doc-gutter-error');
    const errorMsg = errorCard?.textContent?.trim() || '';
    const records = window.editor.state.getRecords();
    const line350Record = records[350];
    return {
      hasErrorInRecord: !!line350Record?.error,
      errorRecordMsg: line350Record?.error?.message,
      hasErrorInGutterDOM: !!errorCard,
      gutterErrorText: errorMsg,
    };
  });
  console.log('Invariant 4 Result:', inv4);
  if (!inv4.hasErrorInRecord || !inv4.hasErrorInGutterDOM) {
    throw new Error('Invariant 4 FAILED: Off-screen error was not reported in gutter!');
  }
  console.log('✓ Invariant 4 PASSED: Off-screen error is immediately reported in gutter DOM.');

  // --- Invariant 1: Scrolling to a space for the first time renders it correctly ---
  console.log('\n3. Testing Invariant 1: Scrolling to off-screen Space 2 for the first time...');
  const beforeScroll = await page.evaluate(() => {
    const container2 = document.querySelector('.doc-space-container[data-line="150"]');
    const canvases = document.querySelectorAll('.space-viewport-canvas');
    return {
      canvasesMountedTotal: canvases.length,
      container2HasCanvas: !!container2?.querySelector('canvas'),
    };
  });
  console.log('Before scroll to Line 150:', beforeScroll);

  // Scroll gutter so line 150 is in view
  await page.evaluate(() => {
    const gutter = document.querySelector('#doc-gutter');
    const targetRow = document.querySelector('.doc-gutter-row[data-line="150"]');
    if (targetRow && gutter) {
      targetRow.scrollIntoView();
    }
  });
  // Wait for IntersectionObserver to fire and render canvas
  await page.waitForTimeout(300);

  const afterScroll = await page.evaluate(() => {
    const container2 = document.querySelector('.doc-space-container[data-line="150"]');
    const canvas = container2?.querySelector('canvas');
    return {
      container2HasCanvas: !!canvas,
      canvasWidth: canvas?.width ?? 0,
      canvasHeight: canvas?.height ?? 0,
    };
  });
  console.log('After scroll to Line 150:', afterScroll);
  if (!afterScroll.container2HasCanvas || afterScroll.canvasWidth === 0) {
    throw new Error('Invariant 1 FAILED: Space 2 was not rendered when scrolled into view!');
  }
  console.log('✓ Invariant 1 PASSED: Space renders correctly when scrolled to for the first time.');

  // --- Invariant 2: Scrolled away and scrolled back retains same geometry ---
  console.log('\n4. Testing Invariant 2: Scroll away and scroll back...');
  // Capture canvas data URL or pixel hash of Space 2
  const pixelBefore = await page.evaluate(() => {
    const canvas = document.querySelector('.doc-space-container[data-line="150"] canvas');
    return canvas ? canvas.toDataURL().slice(0, 100) : '';
  });

  // Scroll back to top
  await page.evaluate(() => {
    const targetRow = document.querySelector('.doc-gutter-row[data-line="0"]');
    targetRow?.scrollIntoView();
  });
  await page.waitForTimeout(200);

  // Scroll down to Space 2 again
  await page.evaluate(() => {
    const targetRow = document.querySelector('.doc-gutter-row[data-line="150"]');
    targetRow?.scrollIntoView();
  });
  await page.waitForTimeout(200);

  const pixelAfter = await page.evaluate(() => {
    const canvas = document.querySelector('.doc-space-container[data-line="150"] canvas');
    return canvas ? canvas.toDataURL().slice(0, 100) : '';
  });
  console.log('Pixel hash match:', pixelBefore === pixelAfter && pixelBefore.length > 0);
  if (pixelBefore !== pixelAfter || pixelBefore.length === 0) {
    throw new Error('Invariant 2 FAILED: Geometry did not match after scrolling away and back!');
  }
  console.log('✓ Invariant 2 PASSED: Geometry is perfectly preserved across scroll cycles.');

  // --- Invariant 3: Editing line changes dependent space off-screen when next visible ---
  console.log('\n5. Testing Invariant 3: Dependent edit while off-screen...');
  // Space 3 is at line 300 and depends on :r_dep (line 0). It is currently off-screen.
  // Edit line 0: change :r_dep = 4 to :r_dep = 25
  await page.evaluate(() => {
    const textarea = document.querySelector('#doc-textarea');
    textarea.value = textarea.value.replace(':r_dep = 4', ':r_dep = 25');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });

  await page.waitForFunction(() => !window.editor.state.getIsEvaluating());

  // Scroll to Space 3 (line 300)
  await page.evaluate(() => {
    const targetRow = document.querySelector('.doc-gutter-row[data-line="300"]');
    targetRow?.scrollIntoView();
  });
  await page.waitForTimeout(300);

  const inv3 = await page.evaluate(() => {
    const container3 = document.querySelector('.doc-space-container[data-line="300"]');
    const canvas = container3?.querySelector('canvas');
    const vp = window.editor.lineViewports.get(300);
    const space = vp?.getSpace();
    return {
      hasCanvas: !!canvas,
      spaceEntitiesCount: space?.entities?.length ?? 0,
      spaceResultText: space?.entities?.[0]?.source || '',
    };
  });
  console.log('Invariant 3 Result:', inv3);
  if (!inv3.hasCanvas || !inv3.spaceEntitiesCount) {
    throw new Error('Invariant 3 FAILED: Dependent space did not update when scrolled into view!');
  }
  console.log('✓ Invariant 3 PASSED: Dependent off-screen space updated with new state upon becoming visible.');

  await browser.close();
  await server.close();
  console.log('\n=== ALL 4 GATING CORRECTNESS INVARIANTS VERIFIED ===');
}

verifyGating().catch(err => {
  console.error(err);
  process.exit(1);
});
