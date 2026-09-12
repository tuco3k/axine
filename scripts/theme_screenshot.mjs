import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function run() {
  console.log('Starting Vite server...');
  const server = await createServer({
    configFile: path.resolve(__dirname, '../vite.config.ts'),
    server: { port: 5199 }
  });
  await server.listen();
  console.log('Vite listening on port 5199');

  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to app...');
  await page.goto('http://localhost:5199');
  await page.waitForSelector('.doc-brand');
  await page.waitForTimeout(500);

  // Dark Theme Screenshot
  console.log('Capturing Dark theme screenshot...');
  const darkPath1 = path.join(__dirname, '../scratch/theme_dark.png');
  const darkPath2 = path.join(ARTIFACT_DIR, 'theme_dark.png');
  await page.screenshot({ path: darkPath1, fullPage: false });
  fs.copyFileSync(darkPath1, darkPath2);
  console.log('Saved Dark screenshots:', darkPath1, darkPath2);

  // Toggle to Light Theme
  console.log('Toggling theme to light...');
  await page.click('#doc-theme-btn');
  await page.waitForTimeout(500);

  // Light Theme Screenshot
  console.log('Capturing Light theme screenshot...');
  const lightPath1 = path.join(__dirname, '../scratch/theme_light.png');
  const lightPath2 = path.join(ARTIFACT_DIR, 'theme_light.png');
  await page.screenshot({ path: lightPath1, fullPage: false });
  fs.copyFileSync(lightPath1, lightPath2);
  console.log('Saved Light screenshots:', lightPath1, lightPath2);

  await browser.close();
  await server.close();
  console.log('Done!');
}

run().catch(err => {
  console.error('Error during screenshot capture:', err);
  process.exit(1);
});
