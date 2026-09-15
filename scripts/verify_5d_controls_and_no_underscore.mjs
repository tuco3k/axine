import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function run() {
  console.log('=== VERIFYING 5D SPACE CONTROLS & NO UNDERSCORE AXIS ===');
  console.log('1. Starting Vite development server on port 5202...');
  const server = await createServer({
    configFile: path.resolve(__dirname, '../vite.config.ts'),
    server: { port: 5202 },
  });
  await server.listen();
  console.log('Vite server running at http://localhost:5202');

  console.log('2. Launching Chromium...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  console.log('3. Navigating to Axine web app...');
  await page.goto('http://localhost:5202');
  await page.waitForFunction(() => typeof window.editor !== 'undefined');
  await page.waitForTimeout(300);

  console.log('4. Rendering 5D Manifold Space in a split pane...');
  await page.evaluate(() => {
    const wsFiles = {
      'manifold_5d.ax': '# 5D Space Manifold\na + b + c + x + y = 10\n',
    };

    const ws = {
      id: 'ws_5d_manifold',
      name: '5D Manifold Space',
      rootPath: '5D Manifold Space',
      files: new Map(Object.entries(wsFiles)),
      isVirtual: true,
      lastOpened: Date.now(),
    };

    window.editor.openWorkspace(ws, 'manifold_5d.ax');

    const { value: spaceVal } = window.evaluate('a + b + c + x + y = 10');
    console.log('Evaluated spaceVal:', spaceVal.dimension, spaceVal.coordinates);

    const pc = window.editor.paneContainer;
    const rootLeafId = pc.getLayout().root.id;

    const newLeafId = pc.split(rootLeafId, 'horizontal', 'after', {
      id: 'tab_5d_manifold',
      type: 'space',
      title: '5D Space (a, b, c, x, y)',
    });

    pc.render();

    const paneBodies = document.querySelectorAll('.pane-split-second .pane-body, .pane-body');
    const paneBody = paneBodies[paneBodies.length - 1];
    if (paneBody) {
      paneBody.innerHTML = '';
      const vp = new window.SpaceViewport(paneBody, spaceVal);
      window.current5DViewport = vp;
    } else {
      console.error('No paneBody found!');
    }
  });

  await page.waitForTimeout(600);

  console.log('5. Locating 5D Space Viewport in pane...');
  await page.waitForSelector('.space-viewport-container');

  // Verify dimension badge text
  const badgeText = await page.evaluate(() => {
    const badge = document.querySelector('.space-dimension-badge');
    return badge ? badge.textContent.trim() : null;
  });
  console.log('Badge text:', badgeText);
  if (!badgeText || !badgeText.includes('5D Space')) {
    throw new Error('Expected 5D Space badge, got: ' + badgeText);
  }
  if (badgeText.includes('_')) {
    throw new Error(`Illegal '_' found in dimension badge: ${badgeText}`);
  }

  // Verify select options for X-Axis and Y-Axis
  const selectOptions = await page.evaluate(() => {
    const selects = Array.from(document.querySelectorAll('.space-select'));
    return selects.map(s => Array.from(s.querySelectorAll('option')).map(o => o.value));
  });
  console.log('Select options for axes:', selectOptions);
  for (const opts of selectOptions) {
    if (opts.includes('_')) {
      throw new Error(`Illegal '_' axis option found in select: ${JSON.stringify(opts)}`);
    }
  }

  // Check computed styles of controls
  console.log('6. Verifying computed styles of form controls...');
  const styles = await page.evaluate(() => {
    const select = document.querySelector('.space-select');
    const label = document.querySelector('.space-axis-selectors label');
    const slider = document.querySelector('.space-range-slider');
    const sliderLabel = document.querySelector('.space-slider-label');
    const sliderVal = document.querySelector('.space-slider-value');

    const selectStyle = select ? window.getComputedStyle(select) : null;
    const labelStyle = label ? window.getComputedStyle(label) : null;
    const sliderStyle = slider ? window.getComputedStyle(slider) : null;
    const sliderLabelStyle = sliderLabel ? window.getComputedStyle(sliderLabel) : null;
    const sliderValStyle = sliderVal ? window.getComputedStyle(sliderVal) : null;

    return {
      select: selectStyle ? {
        backgroundColor: selectStyle.backgroundColor,
        color: selectStyle.color,
        border: selectStyle.border,
        borderRadius: selectStyle.borderRadius,
      } : null,
      label: labelStyle ? {
        color: labelStyle.color,
        fontSize: labelStyle.fontSize,
        fontWeight: labelStyle.fontWeight,
      } : null,
      slider: sliderStyle ? {
        cursor: sliderStyle.cursor,
      } : null,
      sliderLabel: sliderLabelStyle ? {
        color: sliderLabelStyle.color,
        fontSize: sliderLabelStyle.fontSize,
        fontFamily: sliderLabelStyle.fontFamily,
      } : null,
      sliderVal: sliderValStyle ? {
        color: sliderValStyle.color,
        fontSize: sliderValStyle.fontSize,
        fontFamily: sliderValStyle.fontFamily,
      } : null,
    };
  });
  console.log('Computed styles:', JSON.stringify(styles, null, 2));

  // Capture close-up screenshot of the 5D Space Viewport
  console.log('7. Capturing 5D Space Viewport screenshot...');
  const viewportEl = page.locator('.space-viewport-container');
  await viewportEl.screenshot({
    path: path.join(ARTIFACT_DIR, 'five_d_space_styled_controls.png'),
  });
  console.log('Saved: five_d_space_styled_controls.png');

  // Capture full window screenshot showing side-by-side editor and 5D space
  console.log('8. Capturing full application shell screenshot...');
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'five_d_space_full_app.png'),
    fullPage: false,
  });
  console.log('Saved: five_d_space_full_app.png');

  console.log('9. Closing browser and stopping server...');
  await browser.close();
  await server.close();
  console.log('=== VERIFICATION COMPLETED SUCCESSFULLY ===');
}

run().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
