import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173');
  await page.waitForSelector('.doc-editor-surface', { timeout: 10000 });

  console.log('Loading derivation_export_demo.ax...');
  const demoCode = fs.readFileSync('/Users/noahslayton/projects/axine/documents/derivation_export_demo.ax', 'utf-8');
  await page.evaluate((code) => {
    const editor = window.editor;
    if (editor && editor.textarea) {
      editor.textarea.value = code;
      editor.textarea.dispatchEvent(new Event('input'));
    }
  }, demoCode);

  await page.waitForTimeout(4000);

  // Prepare print view
  await page.evaluate(() => {
    const editor = window.editor;
    if (editor) {
      editor.preparePrintView();
    }
  });

  const derivPdfPath = path.join(ARTIFACT_DIR, 'derivation_export_demo.pdf');
  await page.pdf({
    path: derivPdfPath,
    format: 'letter',
    margin: { top: '0.75in', bottom: '0.75in', left: '0.75in', right: '0.75in' },
    printBackground: true,
    displayHeaderFooter: false,
    preferCSSPageSize: true,
  });
  console.log('Generated Derivation Export PDF:', derivPdfPath);

  // Convert to PNGs
  execSync(`pdftoppm -png -r 150 "${derivPdfPath}" "${path.join(ARTIFACT_DIR, 'derivation_demo_page')}"`);

  // Extract text
  const txtPath = path.join(ARTIFACT_DIR, 'derivation_demo_extracted.txt');
  execSync(`pdftotext "${derivPdfPath}" "${txtPath}"`);
  const extractedText = fs.readFileSync(txtPath, 'utf-8');
  console.log('\n=== EXTRACTED PDF TEXT ===\n');
  console.log(extractedText);
  console.log('===========================\n');

  await browser.close();
}

main().catch((err) => {
  console.error('Error during verification:', err);
  process.exit(1);
});
