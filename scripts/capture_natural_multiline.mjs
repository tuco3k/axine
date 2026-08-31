import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function captureMultiLineComparison() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://localhost:5173');
  await page.waitForSelector('#doc-textarea');

  const textarea = await page.$('#doc-textarea');

  // Input multi-line equations of similar structure to compare natural-width alignment
  const docText = `# Multi-line equations with varying exponent and subscript widths
x^2 + y^2 = 25
x^3 + y^3 = 100
x^(n+1) + y^(n+1) = z^(n+1)
x_1 + x_2 + x_3 = 0
x_(i+1) // (2y_1) = 4`;

  await textarea.fill(docText);
  await page.waitForTimeout(500);

  const screenshotPath = path.join(ARTIFACT_DIR, 'typeset_natural_width_multiline.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`Saved screenshot: ${screenshotPath}`);

  await browser.close();
}

captureMultiLineComparison().catch(console.error);
