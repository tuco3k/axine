import { chromium } from 'playwright';
import { createServer } from 'vite';
import { resolve } from 'path';

async function run() {
  console.log('Starting Vite server for Viewport Capture Rule verification...');
  const server = await createServer({
    configFile: resolve(process.cwd(), 'vite.config.ts'),
    server: { port: 5179 },
  });
  await server.listen();
  const address = server.httpServer.address();
  const port = address.port;
  console.log(`Vite server running at http://localhost:${port}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1300, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  try {
    console.log('Navigating to Axine app...');
    await page.goto(`http://localhost:${port}`);
    await page.waitForSelector('.doc-editor-surface', { timeout: 10000 });

    // Mount an egalitarian Results stream with 3 spaces
    console.log('Mounting Results stream with 3 sequential spaces...');
    await page.evaluate(() => {
      const SpaceViewport = (window).SpaceViewport;

      // Create scrollable stream container
      const stream = document.createElement('div');
      stream.id = 'test-results-stream';
      stream.style.position = 'fixed';
      stream.style.top = '60px';
      stream.style.right = '20px';
      stream.style.width = '420px';
      stream.style.height = '500px';
      stream.style.overflowY = 'auto';
      stream.style.background = '#18181b';
      stream.style.border = '1px solid #3f3f46';
      stream.style.borderRadius = '6px';
      stream.style.padding = '12px';
      stream.style.display = 'flex';
      stream.style.flexDirection = 'column';
      stream.style.gap = '16px';
      stream.style.zIndex = '9999';

      const createSpace = (source, fn, minX = -5, maxX = 5, minY = -5, maxY = 5) => {
        const ent = {
          coordinates: ['x', 'y'],
          ast: null,
          compiledFn: fn,
          dimension: 2,
          source,
          cachedContours: {
            polylines: [{ points: [[minX, minX], [0, 0], [maxX, maxX]], closed: false }],
            bounds: { minX, maxX, minY, maxY },
            sampleCount: 10,
          },
        };
        return {
          type: 'space',
          coordinates: ['x', 'y'],
          dimension: 2,
          entities: [ent],
          coordinateBounds: { x: [minX, maxX], y: [minY, maxY] },
        };
      };

      const s1 = createSpace('y = x', (x, y) => y - x);
      const s2 = createSpace('y = x^2', (x, y) => y - x * x);
      const s3 = createSpace('y = :sqrt(x)', (x, y) => y - Math.sqrt(Math.max(0, x)), 0, 10, 0, 5);

      const spaces = [s1, s2, s3];
      const viewports = [];

      spaces.forEach((space, idx) => {
        const row = document.createElement('div');
        row.className = 'test-space-row';
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.gap = '4px';

        const label = document.createElement('div');
        label.style.fontSize = '11px';
        label.style.color = '#a1a1aa';
        label.textContent = `Space ${idx + 1}: ${space.entities[0].source}`;
        row.appendChild(label);

        const container = document.createElement('div');
        container.className = 'space-viewport-container';
        container.style.width = '100%';
        container.style.height = '240px';
        container.style.position = 'relative';
        container.style.border = '1px solid #27272a';
        container.style.borderRadius = '4px';
        container.style.overflow = 'hidden';
        row.appendChild(container);

        const vp = new SpaceViewport(container, space);
        viewports.push(vp);
        stream.appendChild(row);
      });

      // Extra spacer to enable full scrolling past space 3
      const spacer = document.createElement('div');
      spacer.style.height = '300px';
      spacer.style.display = 'flex';
      spacer.style.alignItems = 'center';
      spacer.style.justifyContent = 'center';
      spacer.style.color = '#71717a';
      spacer.textContent = 'End of Results Stream';
      stream.appendChild(spacer);

      document.body.appendChild(stream);
      (window).testStream = stream;
      (window).testViewports = viewports;
    });

    await page.waitForTimeout(400);

    const getStreamState = async () => {
      return await page.evaluate(() => {
        const stream = (window).testStream;
        const vps = (window).testViewports;
        return {
          scrollTop: stream.scrollTop,
          cameras: vps.map((vp) => ({
            bounds: { ...vp.getCameraState().bounds2D },
            isCaptured: vp.getIsCaptured(),
          })),
        };
      });
    };

    // -------------------------------------------------------------
    // Scenario 1: Scroll stream past three spaces, no Shift
    // -> None zoom or rotate, stream scrolls
    // -------------------------------------------------------------
    console.log('\n--- Scenario 1: Unshifted Scroll Past 3 Spaces ---');
    const state0 = await getStreamState();
    console.log(`Initial Stream scrollTop: ${state0.scrollTop}`);
    console.log('Initial Space 1 bounds:', state0.cameras[0].bounds);
    console.log('Initial Space 2 bounds:', state0.cameras[1].bounds);
    console.log('Initial Space 3 bounds:', state0.cameras[2].bounds);

    const spaceRows = await page.$$('.test-space-row');
    const space2Box = await spaceRows[1].boundingBox();

    if (space2Box) {
      console.log(`Hovering Space 2 at (${space2Box.x + space2Box.width / 2}, ${space2Box.y + space2Box.height / 2}) and wheel scrolling...`);
      await page.mouse.move(space2Box.x + space2Box.width / 2, space2Box.y + space2Box.height / 2);
      await page.mouse.wheel(0, 200);
    }
    await page.waitForTimeout(300);

    const state1 = await getStreamState();
    console.log(`Stream scrollTop after unshifted wheel: ${state1.scrollTop} (was ${state0.scrollTop})`);

    if (state1.scrollTop <= state0.scrollTop) {
      throw new Error(`Results stream did not scroll! scrollTop was ${state0.scrollTop}, now ${state1.scrollTop}`);
    }

    for (let i = 0; i < 3; i++) {
      const span0 = state0.cameras[i].bounds.maxX - state0.cameras[i].bounds.minX;
      const span1 = state1.cameras[i].bounds.maxX - state1.cameras[i].bounds.minX;
      console.log(`Space ${i + 1} span: ${span0.toFixed(4)} -> ${span1.toFixed(4)}, captured: ${state1.cameras[i].isCaptured}`);
      if (Math.abs(span1 - span0) > 1e-4) {
        throw new Error(`Space ${i + 1} zoomed during unshifted scroll! It must remain inert.`);
      }
      if (state1.cameras[i].isCaptured) {
        throw new Error(`Space ${i + 1} was captured without a click! It must remain inert.`);
      }
    }
    console.log('✓ Scenario 1 Verified: Stream scrolled past spaces without zooming or capturing any of them.');

    // -------------------------------------------------------------
    // Scenario 2: Hover one and Shift-scroll
    // -> That space zooms, stream does NOT scroll
    // -------------------------------------------------------------
    console.log('\n--- Scenario 2: Hover + Shift-Wheel Quick Look ---');
    const state1BeforeShift = await getStreamState();
    const scrollBeforeShift = state1BeforeShift.scrollTop;
    const space2SpanBeforeShift = state1BeforeShift.cameras[1].bounds.maxX - state1BeforeShift.cameras[1].bounds.minX;

    const space2BoxUpdated = await spaceRows[1].boundingBox();
    if (space2BoxUpdated) {
      console.log('Hovering Space 2, holding Shift, and wheel scrolling...');
      await page.mouse.move(space2BoxUpdated.x + space2BoxUpdated.width / 2, space2BoxUpdated.y + space2BoxUpdated.height / 2);
      await page.keyboard.down('Shift');
      await page.mouse.wheel(0, 150);
      await page.keyboard.up('Shift');
    }
    await page.waitForTimeout(300);

    const state2 = await getStreamState();
    const scrollAfterShift = state2.scrollTop;
    const space2SpanAfterShift = state2.cameras[1].bounds.maxX - state2.cameras[1].bounds.minX;

    console.log(`Stream scrollTop before: ${scrollBeforeShift}, after Shift-wheel: ${scrollAfterShift}`);
    console.log(`Space 2 span before: ${space2SpanBeforeShift.toFixed(4)}, after Shift-wheel: ${space2SpanAfterShift.toFixed(4)}`);
    console.log(`Space 2 captured: ${state2.cameras[1].isCaptured} (should be false)`);

    if (scrollAfterShift !== scrollBeforeShift) {
      throw new Error(`Stream scrolled during Shift-wheel! (was ${scrollBeforeShift}, now ${scrollAfterShift})`);
    }
    if (space2SpanAfterShift <= space2SpanBeforeShift) {
      throw new Error('Space 2 did not zoom during Shift-wheel!');
    }
    if (state2.cameras[1].isCaptured) {
      throw new Error('Space 2 was captured by Shift-scroll! Shift-scroll must remain a quick look without committing.');
    }
    console.log('✓ Scenario 2 Verified: Space 2 zoomed cleanly, stream scroll was prevented, space remained uncaptured.');

    // -------------------------------------------------------------
    // Scenario 3: Release Shift and keep scrolling
    // -> Stream scrolls again
    // -------------------------------------------------------------
    console.log('\n--- Scenario 3: Release Shift & Resume Normal Stream Scroll ---');
    if (space2BoxUpdated) {
      console.log('Scrolling wheel without Shift...');
      await page.mouse.wheel(0, 150);
    }
    await page.waitForTimeout(300);

    const state3 = await getStreamState();
    console.log(`Stream scrollTop after releasing Shift: ${state3.scrollTop} (was ${scrollAfterShift})`);
    const space2SpanAfterNormal = state3.cameras[1].bounds.maxX - state3.cameras[1].bounds.minX;
    console.log(`Space 2 span: ${space2SpanAfterNormal.toFixed(4)} (should match ${space2SpanAfterShift.toFixed(4)})`);

    if (state3.scrollTop <= scrollAfterShift) {
      throw new Error('Stream did not resume scrolling after Shift was released!');
    }
    if (Math.abs(space2SpanAfterNormal - space2SpanAfterShift) > 1e-4) {
      throw new Error('Space 2 zoomed when wheel was used without Shift!');
    }
    console.log('✓ Scenario 3 Verified: Releasing Shift resumed normal stream scrolling without zooming.');

    // -------------------------------------------------------------
    // Scenario 4: Click to capture, hold Shift for temporary release
    // -------------------------------------------------------------
    console.log('\n--- Scenario 4: Click to Capture & Shift Temporary Release ---');
    const space2BoxCurrent = await spaceRows[1].boundingBox();
    if (space2BoxCurrent) {
      console.log('Clicking Space 2 to capture...');
      await page.mouse.click(space2BoxCurrent.x + space2BoxCurrent.width / 2, space2BoxCurrent.y + space2BoxCurrent.height / 2);
    }
    await page.waitForTimeout(300);

    const state4 = await getStreamState();
    console.log(`Space 2 captured state: ${state4.cameras[1].isCaptured} (should be true)`);
    if (!state4.cameras[1].isCaptured) {
      throw new Error('Space 2 was not captured on click!');
    }

    console.log('Holding Shift while captured...');
    await page.keyboard.down('Shift');
    await page.waitForTimeout(200);

    const isShiftCursorActive = await page.evaluate(() => {
      const vp2 = (window).testViewports[1];
      const canvas = vp2.container.querySelector('.space-viewport-canvas');
      return canvas?.classList.contains('shift-cursor') && vp2.isCameraFrozen && vp2.isShiftHeld;
    });
    console.log(`Shift temporary release active (shift-cursor & camera frozen): ${isShiftCursorActive} (should be true)`);
    if (!isShiftCursorActive) {
      throw new Error('Shift cursor / camera freeze not active when Shift is held on captured space!');
    }

    await page.keyboard.up('Shift');
    await page.waitForTimeout(200);

    const isShiftCursorRemoved = await page.evaluate(() => {
      const vp2 = (window).testViewports[1];
      const canvas = vp2.container.querySelector('.space-viewport-canvas');
      return !canvas?.classList.contains('shift-cursor') && !vp2.isCameraFrozen && !vp2.isShiftHeld;
    });
    console.log(`Shift temporary release ended on key release: ${isShiftCursorRemoved} (should be true)`);
    if (!isShiftCursorRemoved) {
      throw new Error('Shift release did not unfreeze camera or clear shift-cursor!');
    }
    console.log('✓ Scenario 4 Verified: Click captured space, Shift temporary release worked smoothly.');

    // -------------------------------------------------------------
    // Scenario 5: Escape leaves entirely
    // -------------------------------------------------------------
    console.log('\n--- Scenario 5: Escape Leaves Entirely ---');
    console.log('Pressing Escape...');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    const state5 = await getStreamState();
    console.log(`Space 2 captured after Escape: ${state5.cameras[1].isCaptured} (should be false)`);
    if (state5.cameras[1].isCaptured) {
      throw new Error('Space 2 remained captured after Escape!');
    }

    // Verify scrolling works past the space again
    const scrollBeforeFinalWheel = state5.scrollTop;
    const space2SpanBeforeFinal = state5.cameras[1].bounds.maxX - state5.cameras[1].bounds.minX;

    const space2BoxFinal = await spaceRows[1].boundingBox();
    if (space2BoxFinal) {
      console.log('Wheel scrolling after Escape...');
      await page.mouse.move(space2BoxFinal.x + space2BoxFinal.width / 2, space2BoxFinal.y + space2BoxFinal.height / 2);
      await page.mouse.wheel(0, 100);
    }
    await page.waitForTimeout(300);

    const state6 = await getStreamState();
    const scrollAfterFinalWheel = state6.scrollTop;
    const space2SpanAfterFinal = state6.cameras[1].bounds.maxX - state6.cameras[1].bounds.minX;

    console.log(`Stream scrollTop before: ${scrollBeforeFinalWheel}, after: ${scrollAfterFinalWheel}`);
    console.log(`Space 2 span: ${space2SpanBeforeFinal.toFixed(4)} -> ${space2SpanAfterFinal.toFixed(4)}`);

    if (scrollAfterFinalWheel <= scrollBeforeFinalWheel) {
      throw new Error('Stream did not scroll after Escape uncaptured space!');
    }
    if (Math.abs(space2SpanAfterFinal - space2SpanBeforeFinal) > 1e-4) {
      throw new Error('Space 2 zoomed after Escape release!');
    }
    console.log('✓ Scenario 5 Verified: Escape released capture entirely and normal stream scrolling works.');

    // Capture visual screenshot
    await page.screenshot({
      path: '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b/viewport_capture_stream_verification.png',
    });
    console.log('\nSaved verification screenshot: viewport_capture_stream_verification.png');

    console.log('\n======================================================');
    console.log('ALL 5 VIEWPORT CAPTURE RULE SCENARIOS VERIFIED 100%!');
    console.log('======================================================');

  } catch (err) {
    console.error('Verification failed:', err);
    throw err;
  } finally {
    await browser.close();
    await server.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
