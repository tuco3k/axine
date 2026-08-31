import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function testTypesetOverlay() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173');
  await page.waitForSelector('#doc-textarea');

  const testDocument = `// Projectile Motion & Elevated Launch
g := 9.81
v0 := 50
h0 := 10
theta := 0.7665

// Trajectory equation with superscripts
y(x) := h0 + tan(theta) * x - (g // (2 * v0^2 * cos(theta)^2)) * x^2
t_land := isolate(h0 + v0 * sin(theta) * t - 4.905 * t^2 = 0, for: t)

// Solved optimal angle
opt_theta := solve(d//dth R(th), for: th, near: 0.75)
`;

  // Focus textarea and type the test document
  console.log('Focusing textarea and typing document...');
  const textarea = await page.$('#doc-textarea');
  await textarea.fill(testDocument);
  await page.waitForTimeout(300);

  // Measure caret alignment and overlay registration
  console.log('Testing 1px caret and text registration...');
  const alignmentResult = await page.evaluate(() => {
    const textarea = document.getElementById('doc-textarea');
    const overlay = document.getElementById('doc-typeset-overlay');
    if (!textarea || !overlay) return { error: 'Elements not found' };

    const taRect = textarea.getBoundingClientRect();
    const ovRect = overlay.getBoundingClientRect();

    const rectOffsetDiffX = Math.abs(taRect.left - ovRect.left);
    const rectOffsetDiffY = Math.abs(taRect.top - ovRect.top);

    // Compute styles
    const taStyle = window.getComputedStyle(textarea);
    const ovStyle = window.getComputedStyle(overlay);

    const fontMatch = taStyle.fontFamily === ovStyle.fontFamily;
    const sizeMatch = taStyle.fontSize === ovStyle.fontSize;
    const lineMatch = taStyle.lineHeight === ovStyle.lineHeight;
    const padLeftMatch = taStyle.paddingLeft === ovStyle.paddingLeft;
    const padTopMatch = taStyle.paddingTop === ovStyle.paddingTop;

    // Check individual lines
    const lines = overlay.querySelectorAll('.doc-typeset-line');
    const lineCount = lines.length;

    // Character offset width checks
    const sampleLine = lines[6]; // y(x) := h0 + tan(theta) * x - (g // (2 * v0^2 * cos(theta)^2)) * x^2
    const sampleText = sampleLine ? sampleLine.textContent : '';

    return {
      taRect: { left: taRect.left, top: taRect.top, width: taRect.width, height: taRect.height },
      ovRect: { left: ovRect.left, top: ovRect.top, width: ovRect.width, height: ovRect.height },
      rectOffsetDiffX,
      rectOffsetDiffY,
      taFont: taStyle.fontFamily,
      ovFont: ovStyle.fontFamily,
      taSize: taStyle.fontSize,
      ovSize: ovStyle.fontSize,
      taLineHeight: taStyle.lineHeight,
      ovLineHeight: ovStyle.lineHeight,
      taPadding: `${taStyle.paddingTop} ${taStyle.paddingRight} ${taStyle.paddingBottom} ${taStyle.paddingLeft}`,
      ovPadding: `${ovStyle.paddingTop} ${ovStyle.paddingRight} ${ovStyle.paddingBottom} ${ovStyle.paddingLeft}`,
      fontMatch,
      sizeMatch,
      lineMatch,
      padLeftMatch,
      padTopMatch,
      lineCount,
      sampleText,
    };
  });

  console.log('Alignment evaluation result:', JSON.stringify(alignmentResult, null, 2));

  // Capture screenshot in Dark Theme
  const darkPath = path.join(ARTIFACT_DIR, 'typeset_input_dark.png');
  await page.screenshot({ path: darkPath });
  console.log('Saved typeset_input_dark.png');

  // Toggle to Light Theme
  console.log('Toggling to light theme...');
  await page.click('#doc-theme-btn');
  await page.waitForTimeout(300);

  const lightPath = path.join(ARTIFACT_DIR, 'typeset_input_light.png');
  await page.screenshot({ path: lightPath });
  console.log('Saved typeset_input_light.png');

  await browser.close();
  console.log('Test completed successfully.');
}

testTypesetOverlay().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
