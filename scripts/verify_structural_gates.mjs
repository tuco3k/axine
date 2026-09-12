import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function run() {
  console.log('--- PHASE 2.2 STRUCTURAL SAMPLING VISUAL GATES ---');
  console.log('1. Starting Vite server on port 5199...');
  const server = await createServer({
    configFile: path.resolve(__dirname, '../vite.config.ts'),
    server: { port: 5199 },
  });
  await server.listen();
  console.log('Vite server running at http://localhost:5199');

  console.log('2. Launching headless Chromium...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1200, height: 800 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  console.log('3. Navigating to Axine app...');
  await page.goto('http://localhost:5199');
  await page.waitForTimeout(600);

  const gates = [
    {
      id: 'structural_gate_1_vector_space',
      title: 'Gate 1: Relation over User-Defined Vector Space (:Vec2 Circle)',
      code: `{\n  \\axis[x, y];\n  :Vec2 := \\record { :x, :y };\n  v := :Vec2(:x: x, :y: y);\n  v.:x^2 + v.:y^2 = 4\n}`,
    },
    {
      id: 'structural_gate_2_complex_number',
      title: 'Gate 2: Relation over User-Defined Complex Number ((z \u2297 z).:re = 1 Hyperbola)',
      code: `{\n  \\axis[x, y];\n  :Complex := \\record { :re, :im };\n  \\operator \\infix \u2297 (a, b) := :Complex(:re: a.:re * b.:re - a.:im * b.:im, :im: a.:re * b.:im + a.:im * b.:re);\n  z := :Complex(:re: x, :im: y);\n  (z \u2297 z).:re = 1\n}`,
    },
    {
      id: 'structural_gate_3_overloaded_operator',
      title: 'Gate 3: Relation using Overloaded + Operator (x + y = 0 where + is redefined as a * b - 4)',
      code: `{\n  \\axis[x, y];\n  \\operator \\infix + (a, b) := a * b - 4;\n  x + y = 0\n}`,
    },
    {
      id: 'structural_gate_4_collection_result',
      title: 'Gate 4: Collection with Record Views (:Particle Circle & Arrow Views, Point Set)',
      code: `{\n  \\axis[x, y];\n  :Particle := \\record { :pos, :vel };\n  \\view \\for :Particle := p -> [:circle(p.:pos, 0.4), :arrow(p.:pos, p.:vel)];\n  :p1 := :Particle(:pos: (-2, -1), :vel: (1, 2));\n  :p2 := :Particle(:pos: (1, 1), :vel: (-1, 1));\n  :pts := \\set { (0, 0), (2, -2) };\n}`,
    },
  ];

  for (const gate of gates) {
    console.log(`\nRendering ${gate.id}: ${gate.title}...`);
    await page.evaluate((g) => {
      document.body.innerHTML = `
        <div style="padding: 24px; background: #0f172a; min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <div style="max-width: 860px; margin: 0 auto; background: #1e293b; border: 1px solid #334155; border-radius: 8px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
            <div style="padding: 16px 20px; background: #0f172a; border-bottom: 1px solid #334155;">
              <h2 style="margin: 0; font-size: 16px; font-weight: 600; color: #f8fafc;">${g.title}</h2>
              <pre style="margin: 8px 0 0 0; font-size: 13px; color: #fbbf24; font-family: monospace; line-height: 1.4; white-space: pre-wrap;">${g.code}</pre>
            </div>
            <div id="viewport-mount" style="padding: 16px; background: #1e293b; display: flex; justify-content: center;"></div>
          </div>
        </div>
      `;

      const mount = document.getElementById('viewport-mount');
      const env = (window).createInitialEnvironment();
      const { value } = (window).evaluate(g.code, env);

      if (value.type === 'space') {
        const vp = new (window).SpaceViewport(mount, value, {
          width: 800,
          height: 460,
        });
        (window).currentVp = vp;
      }
    }, gate);

    await page.waitForTimeout(400);
    const cardEl = await page.$('div[style*="max-width: 860px"]');
    if (cardEl) {
      const imgPath = path.join(ARTIFACT_DIR, `${gate.id}.png`);
      await cardEl.screenshot({ path: imgPath });
      console.log(`Saved screenshot: ${imgPath}`);
    }
  }

  console.log('\nAll visual gate screenshots captured successfully!');
  await browser.close();
  await server.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
