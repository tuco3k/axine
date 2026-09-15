import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'path';

async function diagnose() {
  const server = await createServer({
    configFile: '/Users/noahslayton/projects/axine/vite.config.ts',
    server: { port: 5220 },
  });
  await server.listen();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => consoleLogs.push(`[PAGE_ERR] ${err.message}`));

  await page.goto('http://localhost:5220');
  await page.waitForFunction(() => typeof window.editor !== 'undefined');

  // Create a 600-line document with 20 spaces
  const lines = [];
  lines.push('# Benchmark document: 600 lines, 20 spaces');
  for (let s = 1; s <= 20; s++) {
    lines.push(`## Section ${s}`);
    lines.push(`:a_${s} = ${s}`);
    lines.push(`:b_${s} = ${s * 2}`);
    lines.push(`{\\axis x, y; x^2 + y^2 = ${s + 1}; y = 0.${s} * x}`);
    lines.push(`:k_${s} = :a_${s} + :b_${s}`);
    for (let p = 5; p < 30; p++) {
      lines.push(`# line ${p} in section ${s}: padding scalar ${s * 100 + p}`);
    }
  }
  const text = lines.join('\n');

  console.log(`Document has ${lines.length} lines.`);

  await page.evaluate((docText) => {
    window.editor.openInitialDocument(docText);
    const pc = window.editor.paneContainer;
    if (pc) {
      const rootLeafId = pc.getLayout().root.id;
      pc.split(rootLeafId, 'horizontal', 'after', {
        id: 'tab_results_diag',
        type: 'results',
        title: 'Results',
      });
      pc.render();
    }
  }, text);

  // Wait for evaluation to settle
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(200);
    const evaling = await page.evaluate(() => window.editor.state.getIsEvaluating());
    if (!evaling) break;
  }

  console.log('\n--- INITIAL STATE ---');
  const initialState = await page.evaluate(() => {
    const gutter = document.querySelector('#doc-gutter');
    const textarea = document.querySelector('#doc-textarea');
    const overlay = document.querySelector('#doc-typeset-overlay');
    const panel = document.querySelector('#doc-work-panel');
    const resultsPanel = document.querySelector('#tab-results-panel');
    const resultsPane = document.querySelector('.doc-results-pane');

    const gutterRows = Array.from(document.querySelectorAll('.doc-gutter-row'));
    const visibleGutterRows = gutterRows.filter(r => {
      const rect = r.getBoundingClientRect();
      const gutterRect = gutter.getBoundingClientRect();
      return rect.bottom > gutterRect.top && rect.top < gutterRect.bottom;
    }).map(r => ({
      line: r.getAttribute('data-line'),
      top: r.getBoundingClientRect().top,
      height: r.getBoundingClientRect().height,
      text: r.textContent.trim().slice(0, 30),
    }));

    return {
      textarea: {
        scrollTop: textarea.scrollTop,
        scrollHeight: textarea.scrollHeight,
        clientHeight: textarea.clientHeight,
      },
      overlay: {
        scrollTop: overlay.scrollTop,
        scrollHeight: overlay.scrollHeight,
        clientHeight: overlay.clientHeight,
      },
      gutter: {
        scrollTop: gutter.scrollTop,
        scrollHeight: gutter.scrollHeight,
        clientHeight: gutter.clientHeight,
      },
      visibleGutterRowCount: visibleGutterRows.length,
      firstVisibleLine: visibleGutterRows[0]?.line,
      lastVisibleLine: visibleGutterRows[visibleGutterRows.length - 1]?.line,
      visibleGutterRowsSample: visibleGutterRows.slice(0, 5),
    };
  });
  console.log(JSON.stringify(initialState, null, 2));

  // TEST 1: Scroll the textarea down to 2000px
  console.log('\n--- TEST 1: SCROLL TEXTAREA TO 2000px ---');
  await page.evaluate(() => {
    const ta = document.querySelector('#doc-textarea');
    ta.scrollTop = 2000;
    ta.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(100);

  const afterTaScroll = await page.evaluate(() => {
    const gutter = document.querySelector('#doc-gutter');
    const textarea = document.querySelector('#doc-textarea');
    const overlay = document.querySelector('#doc-typeset-overlay');
    const gutterRows = Array.from(document.querySelectorAll('.doc-gutter-row'));
    const visibleGutterRows = gutterRows.filter(r => {
      const rect = r.getBoundingClientRect();
      const gutterRect = gutter.getBoundingClientRect();
      return rect.bottom > gutterRect.top && rect.top < gutterRect.bottom;
    }).map(r => ({
      line: r.getAttribute('data-line'),
      top: r.getBoundingClientRect().top,
      height: r.getBoundingClientRect().height,
      text: r.textContent.trim().slice(0, 30),
    }));

    return {
      textareaScrollTop: textarea.scrollTop,
      overlayScrollTop: overlay.scrollTop,
      gutterScrollTop: gutter.scrollTop,
      firstVisibleLine: visibleGutterRows[0]?.line,
      lastVisibleLine: visibleGutterRows[visibleGutterRows.length - 1]?.line,
      visibleCount: visibleGutterRows.length,
      visibleGutterRowsSample: visibleGutterRows.slice(0, 5),
    };
  });
  console.log('After textarea scroll:', JSON.stringify(afterTaScroll, null, 2));

  // TEST 2: Scroll the gutter directly to 3000px
  console.log('\n--- TEST 2: SCROLL GUTTER DIRECTLY TO 3000px ---');
  await page.evaluate(() => {
    const gutter = document.querySelector('#doc-gutter');
    gutter.scrollTop = 3000;
    gutter.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(100);

  const afterGutterScroll = await page.evaluate(() => {
    const gutter = document.querySelector('#doc-gutter');
    const textarea = document.querySelector('#doc-textarea');
    const overlay = document.querySelector('#doc-typeset-overlay');
    const gutterRows = Array.from(document.querySelectorAll('.doc-gutter-row'));
    const visibleGutterRows = gutterRows.filter(r => {
      const rect = r.getBoundingClientRect();
      const gutterRect = gutter.getBoundingClientRect();
      return rect.bottom > gutterRect.top && rect.top < gutterRect.bottom;
    }).map(r => ({
      line: r.getAttribute('data-line'),
      top: r.getBoundingClientRect().top,
      height: r.getBoundingClientRect().height,
      text: r.textContent.trim().slice(0, 30),
    }));

    return {
      textareaScrollTop: textarea.scrollTop,
      overlayScrollTop: overlay.scrollTop,
      gutterScrollTop: gutter.scrollTop,
      firstVisibleLine: visibleGutterRows[0]?.line,
      lastVisibleLine: visibleGutterRows[visibleGutterRows.length - 1]?.line,
      visibleCount: visibleGutterRows.length,
      visibleGutterRowsSample: visibleGutterRows.slice(0, 5),
    };
  });
  console.log('After gutter scroll:', JSON.stringify(afterGutterScroll, null, 2));

  // TEST 3: Caret position test at different scroll positions
  console.log('\n--- TEST 3: CARET AND CLICK ACCURACY AT SCROLL POSITIONS ---');
  await page.evaluate(() => {
    const ta = document.querySelector('#doc-textarea');
    ta.scrollTop = 0;
    ta.dispatchEvent(new Event('scroll'));
  });
  await page.waitForTimeout(100);

  // Measure caret on line 0
  const caretLine0 = await page.evaluate(() => {
    const ta = document.querySelector('#doc-textarea');
    const caret = document.querySelector('#doc-caret');
    const ov = document.querySelector('#doc-typeset-overlay');
    const surface = ov.parentElement;
    ta.focus();
    ta.setSelectionRange(0, 0);
    ta.dispatchEvent(new Event('select'));

    const caretRect = caret.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    return {
      caretLeft: caretRect.left - surfaceRect.left,
      caretTop: caretRect.top - surfaceRect.top,
      caretStyleTop: caret.style.top,
      caretStyleLeft: caret.style.left,
    };
  });
  console.log('Caret Line 0 (scrollTop = 0):', caretLine0);

  // Now scroll textarea down 500px, and place selection on a line currently in view
  const scrollOffset = 500;
  const lineAt500 = Math.floor((scrollOffset + 100) / 24.5);
  console.log(`Testing line ${lineAt500} when scrollTop = ${scrollOffset}`);

  await page.evaluate(({ scrollOffset, lineAt500 }) => {
    const ta = document.querySelector('#doc-textarea');
    ta.scrollTop = scrollOffset;
    ta.dispatchEvent(new Event('scroll'));

    const lines = ta.value.split('\n');
    let offset = 0;
    for (let i = 0; i < lineAt500; i++) {
      offset += lines[i].length + 1;
    }
    ta.focus();
    ta.setSelectionRange(offset, offset);
    ta.dispatchEvent(new Event('select'));
  }, { scrollOffset, lineAt500 });
  await page.waitForTimeout(100);

  const caretScrolled = await page.evaluate(({ lineAt500 }) => {
    const ta = document.querySelector('#doc-textarea');
    const caret = document.querySelector('#doc-caret');
    const ov = document.querySelector('#doc-typeset-overlay');
    const surface = ov.parentElement;
    const lineEl = ov.querySelectorAll('.doc-typeset-line')[lineAt500];

    const caretRect = caret.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    const lineRect = lineEl.getBoundingClientRect();

    return {
      taScrollTop: ta.scrollTop,
      ovScrollTop: ov.scrollTop,
      lineRectTop: lineRect.top - surfaceRect.top,
      caretPhysicalTop: caretRect.top - surfaceRect.top,
      caretStyleTop: caret.style.top,
      errY: Math.abs((caretRect.top - surfaceRect.top) - (lineRect.top - surfaceRect.top)),
    };
  }, { lineAt500 });
  console.log('Caret Line when scrolled 500px:', caretScrolled);

  // Test mouse click at lineAt500
  console.log('\n--- TEST 4: CLICK ACCURACY WHEN SCROLLED 500px ---');
  const clickTest = await page.evaluate(({ lineAt500 }) => {
    const ov = document.querySelector('#doc-typeset-overlay');
    const lineEl = ov.querySelectorAll('.doc-typeset-line')[lineAt500];
    const rect = lineEl.getBoundingClientRect();
    return {
      clickX: rect.left + 50,
      clickY: rect.top + 10,
      lineText: lineEl.textContent,
    };
  }, { lineAt500 });

  await page.mouse.click(clickTest.clickX, clickTest.clickY);
  await page.waitForTimeout(100);

  const clickResult = await page.evaluate(({ lineAt500 }) => {
    const ta = document.querySelector('#doc-textarea');
    const lines = ta.value.split('\n');
    let running = 0;
    let clickedLine = 0;
    let clickedCol = 0;
    for (let i = 0; i < lines.length; i++) {
      if (ta.selectionStart >= running && ta.selectionStart <= running + lines[i].length) {
        clickedLine = i;
        clickedCol = ta.selectionStart - running;
        break;
      }
      running += lines[i].length + 1;
    }
    return {
      selectionStart: ta.selectionStart,
      expectedLine: lineAt500,
      clickedLine,
      clickedCol,
      landedLineText: lines[clickedLine],
    };
  }, { lineAt500 });
  console.log('Click result when scrolled 500px:', clickResult);

  await browser.close();
  await server.close();
}

diagnose().catch(err => {
  console.error(err);
  process.exit(1);
});
