/**
 * Gate F4 DOM Extraction - verify check() popover and detail panel content
 * Uses evaluate() to programmatically trigger and extract popover/panel content.
 */
import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Type expression into textarea via evaluate
  await page.evaluate(() => {
    const ta = document.querySelector('textarea') as HTMLTextAreaElement;
    if (ta) {
      ta.value = 'check(3/4 * pi * r^2, is: "sphere volume")';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await page.waitForTimeout(400);

  // Press Enter to evaluate  
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);

  // Extract the output value text
  const outputText = await page.evaluate(() => {
    const outputs = document.querySelectorAll('.output-value, .doc-output-line, [class*="output"]');
    return Array.from(outputs).map(el => (el as HTMLElement).innerText).join('\n');
  });
  console.log('=== OUTPUT LINE TEXT ===');
  console.log(outputText || '(no output found)');

  // Try to trigger popover by clicking on overlay construct with force
  // First, find what constructs exist
  const constructInfo = await page.evaluate(() => {
    const constructs = document.querySelectorAll('.tm-fn, .tm-construct, [data-construct], .doc-typeset-line span');
    return Array.from(constructs).map(el => ({
      tag: el.tagName,
      class: el.className,
      text: (el as HTMLElement).innerText?.substring(0, 50)
    }));
  });
  console.log('\n=== CONSTRUCTS FOUND ===');
  console.log(JSON.stringify(constructInfo, null, 2));

  // Try clicking overlay with force: true
  const checkConstruct = await page.$('.tm-fn');
  if (checkConstruct) {
    await checkConstruct.click({ force: true });
    await page.waitForTimeout(600);
  } else {
    // Fall back: click on the typeset line
    const firstLine = await page.$('.doc-typeset-line');
    if (firstLine) {
      await firstLine.click({ force: true });
      await page.waitForTimeout(600);
    }
  }

  // Extract popover content
  const popoverContent = await page.evaluate(() => {
    const popover = document.querySelector('.math-popover');
    if (!popover || popover.classList.contains('hidden')) {
      return null;
    }
    const role = popover.querySelector('.popover-role')?.textContent || '';
    const sections: Record<string, string> = {};
    popover.querySelectorAll('.popover-section').forEach(s => {
      const label = s.querySelector('.popover-section-label')?.textContent || '';
      const content = s.querySelector('.popover-section-content')?.textContent || '';
      sections[label] = content;
    });
    const showMe = popover.querySelector('.popover-showme-preview')?.textContent || '';
    return { role, sections, showMe };
  });

  if (popoverContent) {
    console.log('\n=== POPOVER EXTRACTION ===');
    console.log(`Role: ${popoverContent.role}`);
    for (const [label, content] of Object.entries(popoverContent.sections)) {
      console.log(`\n--- ${label} ---`);
      console.log(content);
    }
    console.log('\n=== RAW SHOW ME innerText ===');
    console.log(popoverContent.showMe);
  } else {
    console.log('\nPopover not visible after click. Trying output line click for detail panel...');
    
    // Click on the output line to trigger detail panel
    const outputEl = await page.$('.output-value, .doc-output-line');
    if (outputEl) {
      await outputEl.click({ force: true });
      await page.waitForTimeout(600);
    }
  }

  // Extract detail panel content (renderCheckResultFull)
  const detailContent = await page.evaluate(() => {
    const tree = document.querySelector('.visual-derivation-tree');
    if (!tree) return null;
    return (tree as HTMLElement).innerText;
  });

  if (detailContent) {
    console.log('\n=== DETAIL PANEL innerText ===');
    console.log(detailContent);
  }

  // Also try: directly invoke explainSymbol from the window and examine its output
  // This tests the code path without UI interaction
  const explainerOutput = await page.evaluate(() => {
    // The module is bundled by Vite, try to access through the editor instance
    const editor = (window as any).__editorInstance;
    if (!editor) return 'No editor instance found on window';
    return 'Editor found but cannot directly call explainSymbol from browser context';
  });
  console.log('\n=== EDITOR INSTANCE CHECK ===');
  console.log(explainerOutput);

  // Take screenshot
  await page.screenshot({ path: 'gate_f4_dom_verify.png', fullPage: true });
  console.log('\nScreenshot saved: gate_f4_dom_verify.png');

  await browser.close();
})();
