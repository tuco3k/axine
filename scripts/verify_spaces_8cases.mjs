import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'path';

const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function run() {
  console.log('Starting Vite server for spaces verification...');
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    server: { port: 5174 },
  });
  await server.listen();
  console.log('Vite server listening on http://localhost:5174');

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1200, height: 800 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:5174/test_spaces.html...');
  await page.goto('http://localhost:5174/test_spaces.html');
  await page.waitForFunction(() => window.ready === true);

  const testCases = [
    {
      id: 'case1_x_equals_0',
      title: '1. x = 0 (1D free variable, 2D line)',
      code: 'x = 0',
    },
    {
      id: 'case2_y_equals_x_sq',
      title: '2. y = x^2 (2D parabola)',
      code: 'y = x^2',
    },
    {
      id: 'case3_circle_x2_y2_4',
      title: '3. x^2 + y^2 = 4 (2D circle)',
      code: 'x^2 + y^2 = 4',
    },
    {
      id: 'case4_sphere_x2_y2_z2_4',
      title: '4. x^2 + y^2 + z^2 = 4 (3D sphere)',
      code: 'x^2 + y^2 + z^2 = 4',
    },
    {
      id: 'case5_sine_y_sin_x',
      title: '5. y = sin(x) (2D sine wave)',
      code: 'y = sin(x)',
    },
    {
      id: 'case6_4d_slice_sliders',
      title: '6. { y = x^2 ; v = u^2 } (4 variables, 2D slice with 2 sliders)',
      code: `{\n  y = x^2\n  v = u^2\n}`,
    },
    {
      id: 'case7_nested_spaces',
      title: '7. { x = 0 ; { y = x^2 } } (nested spaces)',
      code: `{\n  x = 0\n  {\n    y = x^2\n  }\n}`,
    },
    {
      id: 'case8_sqrt_neg1_lt_3',
      title: '8. sqrt(-1) < 3 (numeric/undefined result, no canvas)',
      code: 'sqrt(-1) < 3',
    },
  ];

  for (const tc of testCases) {
    console.log(`Rendering ${tc.id}: ${tc.title}...`);
    await page.evaluate((test) => {
      const mount = document.getElementById('mount');
      mount.innerHTML = '';

      const box = document.createElement('div');
      box.className = 'test-container';
      box.id = test.id;

      const title = document.createElement('div');
      title.className = 'test-title';
      title.textContent = test.title;
      box.appendChild(title);

      const target = document.createElement('div');
      target.className = 'mount-point';
      box.appendChild(target);
      mount.appendChild(box);

      const env = (window).createInitialEnvironment();
      const { value } = (window).evaluate(test.code, env);

      if (value.type === 'space') {
        const vp = new (window).SpaceViewport(target, value, {
          width: 760,
          height: 320,
        });
        (window).currentVp = vp;
      } else {
        const msg = document.createElement('div');
        msg.className = 'no-canvas-message';
        msg.style.padding = '24px';
        msg.style.color = '#94a3b8';
        msg.style.fontStyle = 'italic';
        msg.textContent = `Evaluated to ${value.type} (no canvas rendered)`;
        target.appendChild(msg);
      }
    }, tc);

    await page.waitForTimeout(300);
    const boxEl = await page.$(`#${tc.id}`);
    if (boxEl) {
      const imgPath = path.join(ARTIFACT_DIR, `${tc.id}.png`);
      await boxEl.screenshot({ path: imgPath });
      console.log(`Saved screenshot: ${imgPath}`);
    }
  }

  // Also capture 3D sphere rotation
  console.log('Capturing 3D sphere orbit rotation...');
  await page.evaluate(() => {
    const mount = document.getElementById('mount');
    mount.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'test-container';
    box.id = 'case4_rotated';
    const title = document.createElement('div');
    title.className = 'test-title';
    title.textContent = '4b. x^2 + y^2 + z^2 = 4 (3D sphere - rotated isometric view)';
    box.appendChild(title);
    const target = document.createElement('div');
    target.className = 'mount-point';
    box.appendChild(target);
    mount.appendChild(box);

    const env = (window).createInitialEnvironment();
    const { value } = (window).evaluate('x^2 + y^2 + z^2 = 4', env);
    const vp = new (window).SpaceViewport(target, value, { width: 760, height: 320 });
    vp.rotate3D(0.6, 0.8);
  });
  await page.waitForTimeout(300);
  const sphereRotEl = await page.$('#case4_rotated');
  if (sphereRotEl) {
    const imgPath = path.join(ARTIFACT_DIR, 'case4_sphere_rotated.png');
    await sphereRotEl.screenshot({ path: imgPath });
    console.log(`Saved screenshot: ${imgPath}`);
  }

  // Also capture 4D slider scrubbing
  console.log('Capturing 4D slider scrubbing...');
  await page.evaluate(() => {
    const mount = document.getElementById('mount');
    mount.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'test-container';
    box.id = 'case6_scrubbed';
    const title = document.createElement('div');
    title.className = 'test-title';
    title.textContent = '6b. { y = x^2 ; v = u^2 } (4D space - slider u scrubbed to 1.8)';
    box.appendChild(title);
    const target = document.createElement('div');
    target.className = 'mount-point';
    box.appendChild(target);
    mount.appendChild(box);

    const env = (window).createInitialEnvironment();
    const { value } = (window).evaluate('{\n  y = x^2\n  v = u^2\n}', env);
    const vp = new (window).SpaceViewport(target, value, {
      width: 760,
      height: 320,
      fixedCoords: { u: 1.8, v: 3.24 },
    });
  });
  await page.waitForTimeout(300);
  const sliderScrubEl = await page.$('#case6_scrubbed');
  if (sliderScrubEl) {
    const imgPath = path.join(ARTIFACT_DIR, 'case6_4d_slice_scrubbed.png');
    await sliderScrubEl.screenshot({ path: imgPath });
    console.log(`Saved screenshot: ${imgPath}`);
  }

  await browser.close();
  await server.close();
  console.log('All 8 cases + interactive states captured successfully.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
