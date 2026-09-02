import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';
const PROJECT_DIR = '/Users/noahslayton/projects/axine';
const INTEGRATOR_DOC_PATH = path.join(PROJECT_DIR, 'documents/integrator_comparison.ax');

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1200 }, deviceScaleFactor: 2 });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err));

  console.log('Navigating to Axine app at http://localhost:5173...');
  await page.goto('http://localhost:5173');
  await page.waitForSelector('#doc-textarea');
  await page.waitForTimeout(1000);

  const docContent = fs.readFileSync(INTEGRATOR_DOC_PATH, 'utf-8');

  // Load integrator_comparison.ax into the editor
  await page.evaluate(({ name, content }) => {
    const editor = window.editor;
    if (editor) {
      editor.setText(content);
      editor.setDocumentName(name);
    }
  }, { name: 'integrator_comparison.ax', content: docContent });

  // Wait for evaluation to complete
  await page.waitForTimeout(3500);

  // 1. Export HTML
  const exportedHtml = await page.evaluate(() => {
    const editor = window.editor;
    if (!editor) return '';
    const text = editor.textarea.value;
    const records = editor.state.getRecords();
    const currentTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    return window.Evaluator ? window.exportToHtml ? window.exportToHtml(editor.getDocumentName(), text, records, currentTheme) : '' : '';
  });

  // If window.exportToHtml not directly global, call export methods via exporter module imported in editor
  const htmlContent = await page.evaluate(async () => {
    const editor = window.editor;
    const text = editor.textarea.value;
    const records = editor.state.getRecords();
    const exporter = await import('/src/document/exporter.ts');
    return exporter.exportToHtml(editor.getDocumentName(), text, records, 'dark');
  });

  const htmlExportPath = path.join(ARTIFACT_DIR, 'integrator_comparison.html');
  fs.writeFileSync(htmlExportPath, htmlContent, 'utf-8');
  console.log('Saved integrator_comparison.html at', htmlExportPath);

  // 2. Export Markdown
  const mdExport = await page.evaluate(async () => {
    const editor = window.editor;
    const text = editor.textarea.value;
    const records = editor.state.getRecords();
    const exporter = await import('/src/document/exporter.ts');
    return exporter.exportToMarkdown(editor.getDocumentName(), text, records);
  });

  const mdExportPath = path.join(ARTIFACT_DIR, 'integrator_comparison.md');
  fs.writeFileSync(mdExportPath, mdExport.markdown, 'utf-8');
  console.log('Saved integrator_comparison.md at', mdExportPath);

  // Save plot assets if any
  const plotsDir = path.join(ARTIFACT_DIR, 'plots');
  if (!fs.existsSync(plotsDir)) fs.mkdirSync(plotsDir, { recursive: true });
  for (const img of mdExport.plotImages) {
    fs.writeFileSync(path.join(plotsDir, img.filename), img.svgString, 'utf-8');
  }

  // 3. Render HTML Export in page and take screenshot
  const htmlPage = await context.newPage();
  await htmlPage.goto(`file://${htmlExportPath}`);
  await htmlPage.waitForTimeout(800);
  await htmlPage.screenshot({ path: path.join(ARTIFACT_DIR, 'gate_e_html_export.png'), fullPage: true });
  console.log('Saved gate_e_html_export.png');

  // 4. Generate PDF and Print View screenshot
  await page.evaluate(() => {
    const editor = window.editor;
    if (editor) {
      editor.preparePrintView();
    }
  });

  // Emulate print media to capture exact print stylesheet
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(500);

  const pdfPath = path.join(ARTIFACT_DIR, 'integrator_comparison.pdf');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
  });
  console.log('Saved integrator_comparison.pdf at', pdfPath);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'gate_e_pdf_export.png'), fullPage: true });
  console.log('Saved gate_e_pdf_export.png');

  await browser.close();
  console.log('GATE E verification script completed successfully.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
