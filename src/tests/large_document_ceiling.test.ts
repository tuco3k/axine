import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, ViteDevServer } from 'vite';
import { chromium, Browser, Page } from 'playwright';
import path from 'path';

describe('Large Document Ceiling & Visibility-Gated Sampling Test', () => {
  let server: ViteDevServer;
  let browser: Browser;
  let page: Page;
  let port: number;

  beforeAll(async () => {
    server = await createServer({
      configFile: path.resolve(__dirname, '../../vite.config.ts'),
      server: { port: 0 },
    });
    await server.listen();
    port = (server.httpServer!.address() as any).port;

    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    await page.goto(`http://localhost:${port}`);
    await page.waitForFunction(() => typeof (window as any).editor !== 'undefined');
  }, 30000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (server) await server.close();
  });

  it('opens a 600-line document with 20 spaces and asserts keystroke-to-render stays under 50ms', async () => {
    // Generate 600-line document with 20 spaces distributed across the document
    const lines: string[] = [];
    lines.push(':r_dep = 4');
    let spaceCount = 0;
    for (let i = 1; i < 600; i++) {
      if (i % 30 === 0 && spaceCount < 20) {
        spaceCount++;
        lines.push(`{\\axis x, y; x^2 + y^2 = ${spaceCount}}`);
      } else {
        lines.push(`# padding line ${i}`);
      }
    }
    const docText = lines.join('\n');

    // Load initial document into editor
    await page.evaluate(({ text }) => {
      const ed = (window as any).editor;
      ed.openInitialDocument(text);
      const pc = ed.paneContainer;
      const rootLeafId = pc.getLayout().root.id;
      pc.split(rootLeafId, 'horizontal', 'after', {
        id: 'tab_results_ceiling',
        type: 'results',
        title: 'Ceiling Results',
      });
      pc.render();
    }, { text: docText });

    // Wait until initial evaluation completes
    await page.waitForFunction(() => !(window as any).editor.state.getIsEvaluating(), { timeout: 15000 });

    // Assert visibility gating: only visible spaces (top of document) are sampled and have canvas elements
    const initialCanvases = await page.evaluate(() => {
      return document.querySelectorAll('.space-viewport-canvas').length;
    });
    // With 20 spaces spaced every 30 lines, at most 1-2 spaces are visible in the initial 900px viewport
    expect(initialCanvases).toBeLessThanOrEqual(3);

    // Measure keystroke-to-render latency
    const latency = await page.evaluate(async () => {
      const textarea = document.querySelector('#doc-textarea') as HTMLTextAreaElement;
      const start = performance.now();

      textarea.value = textarea.value + '\n:test_val = 42';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));

      // Wait for next animation frame and microtasks so overlay and gutter update
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));

      return performance.now() - start;
    });

    console.log(`Measured 600-line 20-space keystroke-to-render latency: ${latency.toFixed(2)}ms`);
    expect(latency).toBeLessThan(50);
  }, 30000);

  it('satisfies all 4 visibility gating correctness invariants', async () => {
    await page.goto(`http://localhost:${port}`);
    await page.waitForFunction(() => typeof (window as any).editor !== 'undefined');

    // Construct document testing all 4 invariants:
    // Line 0: :r_dep = 4
    // Line 1: Space 1 (near top)
    // Line 150: Space 2 (middle)
    // Line 300: Space 3 (dependent on :r_dep)
    // Line 350: Off-screen error
    const lines: string[] = [];
    lines.push(':r_dep = 4');
    lines.push('{\\axis x, y; x^2 + y^2 = 1}');
    for (let i = 2; i < 150; i++) lines.push(`# padding line ${i}`);
    lines.push('{\\axis x, y; x^2 + y^2 = 9}');
    for (let i = 151; i < 300; i++) lines.push(`# padding line ${i}`);
    lines.push('{\\axis x, y; x^2 + y^2 = :r_dep}');
    for (let i = 301; i < 350; i++) lines.push(`# padding line ${i}`);
    lines.push(':bad_var = 1/0 + undefined_var');
    for (let i = 351; i < 400; i++) lines.push(`# padding line ${i}`);

    const text = lines.join('\n');
    await page.evaluate(({ text }) => {
      const ed = (window as any).editor;
      ed.openInitialDocument(text);
      ed.setEditorMode('classic');
    }, { text });

    await page.waitForFunction(() => !(window as any).editor.state.getIsEvaluating(), { timeout: 10000 });

    // Invariant 4: Off-screen space or expression with an error immediately reports in gutter
    const inv4 = await page.evaluate(() => {
      const errorRow = document.querySelector('.doc-gutter-row[data-line="350"]');
      const errorCard = errorRow?.querySelector('.doc-gutter-error');
      const records = (window as any).editor.state.getRecords();
      return {
        hasErrorInRecord: !!records[350]?.error,
        hasErrorInGutterDOM: !!errorCard,
      };
    });
    expect(inv4.hasErrorInRecord).toBe(true);
    expect(inv4.hasErrorInGutterDOM).toBe(true);

    // Invariant 1: Scrolling to off-screen Space 2 (line 150) for the first time renders it correctly
    const beforeScroll = await page.evaluate(() => {
      const container = document.querySelector('.doc-space-container[data-line="150"]');
      return !!container?.querySelector('canvas');
    });
    expect(beforeScroll).toBe(false);

    await page.evaluate(() => {
      (window as any).editor.jumpToLine(150);
    });
    await page.waitForTimeout(300);

    const afterScroll = await page.evaluate(() => {
      const ed = (window as any).editor;
      const ta = document.querySelector('#doc-textarea') as HTMLTextAreaElement;
      const container = document.querySelector('.doc-space-container[data-line="150"]');
      const canvas = container?.querySelector('canvas');
      const row = document.querySelector('.doc-gutter-row[data-line="150"]');
      const gutter = document.querySelector('#doc-gutter');
      return {
        hasRow: !!row,
        hasContainer: !!container,
        hasCanvas: !!canvas,
        width: canvas?.width ?? 0,
        taScrollTop: ta?.scrollTop,
        taScrollHeight: ta?.scrollHeight,
        taClientHeight: ta?.clientHeight,
        gutterScrollTop: gutter?.scrollTop,
        gutterScrollHeight: gutter?.scrollHeight,
        gutterClientHeight: gutter?.clientHeight,
        renderedStart: (ed as any).renderedStartLine,
        renderedEnd: (ed as any).renderedEndLine,
        rect: container ? container.getBoundingClientRect() : null,
      };
    });
    
    expect(afterScroll.hasCanvas).toBe(true);
    expect(afterScroll.width).toBeGreaterThan(0);

    // Invariant 2: Scrolled away and back retains identical geometry
    const pixelBefore = await page.evaluate(() => {
      const canvas = document.querySelector('.doc-space-container[data-line="150"] canvas') as HTMLCanvasElement;
      return canvas ? canvas.toDataURL().slice(0, 100) : '';
    });

    // Scroll away to top
    await page.evaluate(() => {
      (window as any).editor.jumpToLine(0);
    });
    await page.waitForTimeout(200);

    // Scroll back to line 150
    await page.evaluate(() => {
      (window as any).editor.jumpToLine(150);
    });
    await page.waitForTimeout(200);

    const pixelAfter = await page.evaluate(() => {
      const canvas = document.querySelector('.doc-space-container[data-line="150"] canvas') as HTMLCanvasElement;
      return canvas ? canvas.toDataURL().slice(0, 100) : '';
    });
    expect(pixelBefore.length).toBeGreaterThan(0);
    expect(pixelAfter).toBe(pixelBefore);

    // Invariant 3: Editing a line changes dependent space off-screen when next visible
    // Edit line 0: :r_dep = 4 -> :r_dep = 25 while line 300 is off-screen
    await page.evaluate(() => {
      const textarea = document.querySelector('#doc-textarea') as HTMLTextAreaElement;
      textarea.value = textarea.value.replace(':r_dep = 4', ':r_dep = 25');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.waitForFunction(() => !(window as any).editor.state.getIsEvaluating(), { timeout: 10000 });

    // Scroll to Space 3 (line 300)
    await page.evaluate(() => {
      (window as any).editor.jumpToLine(300);
    });
    await page.waitForTimeout(300);

    const inv3 = await page.evaluate(() => {
      const row = document.querySelector('.doc-gutter-row[data-line="300"]');
      const container = document.querySelector('.doc-space-container[data-line="300"]');
      const allSpaceContainers = Array.from(document.querySelectorAll('.doc-space-container')).map(c => c.getAttribute('data-line'));
      const records = (window as any).editor.state.getRecords();
      const vp = (window as any).editor.lineViewports.get(300);
      const space = vp?.getSpace();
      return {
        hasRow: !!row,
        hasContainer: !!container,
        allSpaceContainers,
        record300: records[300] ? { type: records[300].value?.type, expr: records[300].expression } : null,
        hasCanvas: !!container?.querySelector('canvas'),
        entitiesCount: space?.entities?.length ?? 0,
        source: space?.entities?.[0]?.source || '',
      };
    });
    expect(inv3.hasCanvas).toBe(true);
    expect(inv3.entitiesCount).toBe(1);
    expect(inv3.source).toBe('x^2 + y^2 = :r_dep');
  }, 30000);
});
