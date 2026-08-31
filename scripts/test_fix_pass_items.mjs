import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function testFixPass() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Testing Fix Pass Items...');
  await page.goto('http://localhost:5173');
  await page.waitForSelector('#doc-textarea');

  const textarea = await page.$('#doc-textarea');

  // Input derivation test document with x^2 = 4 and x^2 - 5x + 6 = 0
  const docText = `x^2 = 4
x^2 - 5x + 6 = 0
z = x^2 + y^2, x in -2..2, y in -2..2`;

  await textarea.fill(docText);
  await page.waitForTimeout(500);

  // 1. Verify Gutter Line Numbers and Left-Alignment
  const gutterInfo = await page.evaluate(() => {
    const rows = document.querySelectorAll('.doc-gutter-row');
    const results = [];
    rows.forEach(r => {
      const lineNo = r.querySelector('.doc-gutter-lineno')?.textContent;
      const content = r.querySelector('.doc-gutter-content')?.textContent;
      const style = window.getComputedStyle(r);
      results.push({
        lineNo,
        justify: style.justifyContent,
        hasBorder: style.borderBottomWidth !== '0px',
      });
    });
    return results;
  });

  console.log('Gutter Verification:', gutterInfo);

  // 2. Click line 1 derivation and inspect Derivation Panel Typesetting
  await page.click('.doc-gutter-row[data-line="0"]');
  await page.waitForTimeout(300);

  const derivationHtml = await page.evaluate(() => {
    const derivContent = document.getElementById('visual-derivation-content');
    return {
      origEq: derivContent?.querySelector('.derivation-orig-eq')?.innerHTML,
      hasSup: !!derivContent?.querySelector('.ro-sup'),
      hasFraction: !!derivContent?.querySelector('.ro-frac'),
    };
  });

  console.log('Derivation Panel Typesetting:', derivationHtml);

  // 3. Click line 3 3D surface plot
  await page.click('.doc-gutter-row[data-line="2"]');
  await page.waitForTimeout(400);

  // Capture screenshot of the 3D surface scene and the work panel
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'fix_pass_3d_and_derivation.png') });
  console.log('Saved fix_pass_3d_and_derivation.png');

  // 4. Test Reciprocal Hover Highlighting
  const hoverCheck = await page.evaluate(() => {
    const row0 = document.querySelector('.doc-gutter-row[data-line="0"]');
    row0?.dispatchEvent(new MouseEvent('mouseenter'));
    const line0 = document.querySelector('.doc-typeset-line:nth-child(1)');
    const lineHovered = line0?.classList.contains('hovered');
    row0?.dispatchEvent(new MouseEvent('mouseleave'));
    return { lineHovered };
  });

  console.log('Reciprocal Hover Check:', hoverCheck);

  await browser.close();
}

testFixPass().catch(console.error);
