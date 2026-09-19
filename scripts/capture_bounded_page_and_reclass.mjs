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
    server: { port: 5195 }
  });
  await server.listen();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:5195...');
  await page.goto('http://localhost:5195');
  await page.waitForFunction(() => typeof window.editor !== 'undefined');

  const docText = `# Bounded Page & Mathematical Typography

# This document demonstrates the centered bounded sheet with visible surround, fixed measure, and typed insert commands.

x = 5

\\table(2, 2) {
  a, b;
  c, d
}

\\cases(2) {
  -x, x < 0;
  x, x >= 0
}

\\figure(:graph, width: 480, height: 280)
`;

  await page.evaluate(({ text }) => {
    window.editor.openInitialDocument(text);
  }, { text: docText });

  await page.waitForTimeout(600);

  // 1. Capture Dark Theme Bounded Page
  console.log('Capturing Dark Theme Bounded Page...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'bounded_page_dark_theme.png') });

  // 2. Switch to Light Theme and Capture
  console.log('Switching to Light Theme...');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
  });
  await page.waitForTimeout(300);
  console.log('Capturing Light Theme Bounded Page...');
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'bounded_page_light_theme.png') });

  // 3. Capture Responsive Narrow Window (< 768px)
  console.log('Testing Responsive Viewport (640px)...');
  await page.setViewportSize({ width: 640, height: 900 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'bounded_page_responsive_narrow.png') });

  await browser.close();
  await server.close();
  console.log('All screenshots captured successfully!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
