import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173');
  await page.waitForSelector('#doc-textarea');

  // Input an animation document
  const animDoc = `
traj := simulate(s -> (s[0] + 0.5, s[1] + 1.2 - 0.4 * s[0]), (0, 0), t in 0..10, dt: 0.05)
`.trim();

  console.log('Setting document text with simulation trajectory...');
  await page.evaluate((text) => {
    const textarea = document.querySelector('#doc-textarea');
    if (textarea) {
      textarea.value = text;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, animDoc);

  await page.waitForTimeout(600);

  // Check that the animation player is mounted in the work panel
  const player = await page.waitForSelector('.axine-animation-player');
  console.log('Found .axine-animation-player');

  // Screenshot initial animation state
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'animation_initial_state.png') });
  console.log('Saved animation_initial_state.png');

  // Click Play button
  const playBtn = await page.waitForSelector('.anim-btn-play');
  await playBtn.click();
  console.log('Clicked Play button...');

  // Wait 1.2 seconds of live animation playback
  await page.waitForTimeout(1200);

  // Take screenshot during active playback
  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'animation_during_playback.png') });
  console.log('Saved animation_during_playback.png');

  // Click Pause
  await playBtn.click();
  console.log('Clicked Pause...');
  await page.waitForTimeout(300);

  // Step forward twice
  const stepBtn = await page.waitForSelector('.anim-btn-step');
  await stepBtn.click();
  await page.waitForTimeout(100);
  await stepBtn.click();
  await page.waitForTimeout(200);

  // Scrub bar interaction: set to t = 6.0
  await page.evaluate(() => {
    const scrub = document.querySelector('.anim-scrub-bar');
    if (scrub) {
      scrub.value = '6.0';
      scrub.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await page.waitForTimeout(300);

  await page.screenshot({ path: path.join(ARTIFACT_DIR, 'animation_scrubbed_state.png') });
  console.log('Saved animation_scrubbed_state.png');

  await browser.close();
  console.log('Browser animation test complete!');
}

main().catch((err) => {
  console.error('Error in animation verify:', err);
  process.exit(1);
});
