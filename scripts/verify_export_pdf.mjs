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

  // 1. Verify thrown_ball.ax
  console.log('Loading thrown_ball.ax...');
  const thrownBallCode = fs.readFileSync('/Users/noahslayton/projects/axine/documents/thrown_ball.ax', 'utf-8');
  await page.evaluate((code) => {
    const editor = window.editor;
    if (editor && editor.textarea) {
      editor.textarea.value = code;
      editor.textarea.dispatchEvent(new Event('input'));
    }
  }, thrownBallCode);

  await page.waitForTimeout(3000);

  await page.evaluate(() => {
    const editor = window.editor;
    if (editor) {
      editor.preparePrintView();
    }
  });

  const thrownBallPdfPath = path.join(ARTIFACT_DIR, 'thrown_ball_verified.pdf');
  await page.pdf({
    path: thrownBallPdfPath,
    format: 'letter',
    margin: { top: '0.75in', bottom: '0.75in', left: '0.75in', right: '0.75in' },
    printBackground: true,
    displayHeaderFooter: false,
    preferCSSPageSize: true,
  });
  console.log('Generated PDF:', thrownBallPdfPath);
  execSync(`pdftoppm -png -r 150 "${thrownBallPdfPath}" "${path.join(ARTIFACT_DIR, 'thrown_ball_page')}"`);

  // 2. Multi-page document: three_page_lab_report.ax
  console.log('Loading three_page_lab_report.ax...');
  const labCode = fs.readFileSync('/Users/noahslayton/projects/axine/documents/three_page_lab_report.ax', 'utf-8');
  await page.evaluate((code) => {
    const editor = window.editor;
    if (editor && editor.textarea) {
      editor.textarea.value = code;
      editor.textarea.dispatchEvent(new Event('input'));
    }
  }, labCode);

  await page.waitForTimeout(4000);

  await page.evaluate(() => {
    const editor = window.editor;
    if (editor) {
      editor.preparePrintView();
    }
  });

  const labPdfPath = path.join(ARTIFACT_DIR, 'lab_report_3page_verified.pdf');
  await page.pdf({
    path: labPdfPath,
    format: 'letter',
    margin: { top: '0.75in', bottom: '0.75in', left: '0.75in', right: '0.75in' },
    printBackground: true,
    displayHeaderFooter: false,
    preferCSSPageSize: true,
  });
  console.log('Generated 3-Page Lab Report PDF:', labPdfPath);
  execSync(`pdftoppm -png -r 150 "${labPdfPath}" "${path.join(ARTIFACT_DIR, 'lab_page')}"`);

  await browser.close();
  console.log('Multi-page verification completed.');
}

main().catch((err) => {
  console.error('Error during verification:', err);
  process.exit(1);
});
