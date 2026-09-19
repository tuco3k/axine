import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function main() {
  const server = await createServer({
    configFile: path.resolve(__dirname, '../vite.config.ts'),
    server: { port: 5189 }
  });
  await server.listen();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:5189...');
  await page.goto('http://localhost:5189');
  await page.waitForFunction(() => typeof window.editor !== 'undefined');

  // Test document with \table and \cases
  const docText = `# General Slot Mechanism Demo

\\table(2, 2) {
  \\cos(\\theta), -\\sin(\\theta);
  \\sin(\\theta), \\cos(\\theta)
}

# Piecewise Continuous Function

\\cases(2) {
  x^2 + 1, x >= 0;
  1 - x, x < 0
}
`;

  await page.evaluate(({ text }) => {
    const editor = window.editor;
    editor.openInitialDocument(text);
  }, { text: docText });

  await page.waitForTimeout(600);

  // 1. Capture Table in Rendered State
  console.log('Capturing Table rendered state...');
  const tableEl = await page.waitForSelector('.doc-block-table');
  await tableEl.screenshot({ path: path.join(ARTIFACT_DIR, 'slot_table_rendered.png') });
  console.log('Saved slot_table_rendered.png');

  // 2. Double-click Table to enter Edit Mode with targetable slots
  console.log('Entering edit mode on Table...');
  await tableEl.dblclick();
  await page.waitForTimeout(300);
  await tableEl.screenshot({ path: path.join(ARTIFACT_DIR, 'slot_table_editing.png') });
  console.log('Saved slot_table_editing.png');

  // Exit Table edit mode via Escape
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 3. Capture Cases in Rendered State
  console.log('Capturing Cases rendered state...');
  const casesEl = await page.waitForSelector('.doc-block-cases');
  await casesEl.screenshot({ path: path.join(ARTIFACT_DIR, 'slot_cases_rendered.png') });
  console.log('Saved slot_cases_rendered.png');

  // 4. Double-click Cases to enter Edit Mode with targetable slots
  console.log('Entering edit mode on Cases...');
  await casesEl.dblclick();
  await page.waitForTimeout(300);
  await casesEl.screenshot({ path: path.join(ARTIFACT_DIR, 'slot_cases_editing.png') });
  console.log('Saved slot_cases_editing.png');

  // Exit Cases edit mode
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Also capture full IDE view with both commands rendered in document flow
  console.log('Capturing full document flow view...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'slot_mechanism_document_flow.png') });
  console.log('Saved slot_mechanism_document_flow.png');

  await browser.close();
  await server.close();
  console.log('All screenshots captured successfully!');
}

main().catch(err => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
