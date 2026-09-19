import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const server = await createServer({
    configFile: path.resolve(__dirname, '../vite.config.ts'),
    server: { port: 5188 }
  });
  await server.listen();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });
  page.on('pageerror', err => {
    consoleLogs.push({ type: 'error', text: err.message });
  });

  // Launch fresh with empty localStorage
  await page.goto('http://localhost:5188', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const initialInfo = await page.evaluate(() => {
    return {
      hasWelcome: !!document.querySelector('.axine-welcome-screen'),
      tabs: Array.from(document.querySelectorAll('.pane-tab')).map(t => t.textContent?.trim()),
      activeTab: document.querySelector('.pane-tab.active')?.textContent?.trim(),
      hasBlockEditor: !!document.querySelector('#doc-block-editor'),
      hasTextarea: !!document.querySelector('#doc-textarea'),
      hasSurface: !!document.querySelector('.doc-editor-surface'),
      surfaceHidden: document.querySelector('.doc-editor-surface')?.classList.contains('hidden'),
      blockEditorHidden: document.querySelector('#doc-block-editor')?.classList.contains('hidden'),
      blockCount: document.querySelectorAll('.doc-block').length,
      activeElement: document.activeElement ? `${document.activeElement.tagName}.${document.activeElement.className}` : null,
      editorMode: window.editor?.editorMode,
      activeSessionId: window.editor?.activeSessionId,
      currentFileName: window.editor?.currentFileName,
    };
  });

  console.log('--- Initial Clean Launch Info ---');
  console.log(JSON.stringify(initialInfo, null, 2));

  // Now test what happens if we click New Document or if a workspace exists
  if (initialInfo.hasWelcome) {
    console.log('Welcome screen is present. Clicking #welcome-new-doc-btn...');
    const newDocBtn = await page.$('#welcome-new-doc-btn');
    if (newDocBtn) {
      await newDocBtn.click();
      await page.waitForTimeout(500);
    }
  }

  // Check state after opening document
  const docInfo = await page.evaluate(() => {
    const editor = window.editor;
    const blockEditor = editor?.blockEditor;
    const blockEl = document.querySelector('#doc-block-editor');
    const surfaceEl = document.querySelector('.doc-editor-surface');
    const textareaEl = document.querySelector('#doc-textarea');
    return {
      hasWelcome: !!document.querySelector('.axine-welcome-screen'),
      tabs: Array.from(document.querySelectorAll('.pane-tab')).map(t => t.textContent?.trim()),
      activeTab: document.querySelector('.pane-tab.active')?.textContent?.trim(),
      hasBlockEditor: !!blockEl,
      blockEditorHidden: blockEl?.classList.contains('hidden'),
      hasSurface: !!surfaceEl,
      surfaceHidden: surfaceEl?.classList.contains('hidden'),
      hasTextarea: !!textareaEl,
      textareaValue: textareaEl?.value,
      blockCount: document.querySelectorAll('.doc-block').length,
      blockTypes: Array.from(document.querySelectorAll('.doc-block')).map(b => b.className),
      blockHtml: blockEl?.innerHTML,
      activeElement: document.activeElement ? `${document.activeElement.tagName}.${document.activeElement.className}` : null,
      editorMode: editor?.editorMode,
      currentFileName: editor?.currentFileName,
    };
  });

  console.log('--- Document Tab State ---');
  console.log(JSON.stringify(docInfo, null, 2));

  // Now try to type
  console.log('Attempting to type "x = 42"...');
  await page.keyboard.type('x = 42');
  await page.waitForTimeout(300);

  const afterTyping = await page.evaluate(() => {
    const editor = window.editor;
    const blockEditor = editor?.blockEditor;
    return {
      editorText: editor?.getText?.() || editor?.state?.getText?.(),
      blockEditorText: blockEditor?.getText?.(),
      activeElement: document.activeElement ? `${document.activeElement.tagName}.${document.activeElement.className}` : null,
      blockHtml: document.querySelector('#doc-block-editor')?.innerHTML,
    };
  });
  console.log('--- After Typing Info ---');
  console.log(JSON.stringify(afterTyping, null, 2));

  console.log('--- Console logs captured ---');
  console.log(JSON.stringify(consoleLogs, null, 2));

  await browser.close();
  await server.close();
}

run().catch(console.error);
