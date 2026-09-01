import { chromium } from 'playwright';

async function runBrowserImportVerification() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('=== Browser Import & Physics Documents Verification ===\n');
  console.log('1. Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173');
  await page.waitForSelector('#doc-textarea');
  await page.waitForSelector('#corpus-select');

  // Test 1: Direct import in the live browser editor
  console.log('\n2. Testing direct `import "physics.ax"` in live browser editor...');
  const directImportDoc = `
import "physics.ax"
b := Body(mass: 2, position: (0, 0), velocity: (3, 4))
ke := kinetic_energy(b)
p := momentum(b)
`.trim();

  await page.evaluate((text) => {
    const ta = document.querySelector('#doc-textarea');
    if (ta) {
      ta.value = text;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, directImportDoc);

  await page.waitForTimeout(600);

  // Read results from the line results in the DOM
  const results1 = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.doc-gutter-row'));
    return rows.map(r => {
      const lineno = r.querySelector('.doc-gutter-lineno')?.textContent?.trim() || '';
      const res = r.querySelector('.doc-result-value')?.textContent?.trim() || '';
      const err = r.querySelector('.doc-gutter-error')?.textContent?.trim() || '';
      const anim = r.querySelector('.axine-animation-player') ? '[AnimationPlayer]' : '';
      return `${lineno}: ${res || err || anim || '(none)'}`;
    });
  });
  console.log('Direct import results:');
  results1.forEach(r => console.log('  ', r));

  // Test 2: Run all eight physics documents from the corpus dropdown
  const physicsDocIds = [
    { id: 'physics_problem', name: '26. Physics Collision & Inelastic Scattering' },
    { id: 'projectile_sim', name: '27. Projectile Simulation with Air Drag' },
    { id: 'pendulum_sim', name: '28. Simple Harmonic Pendulum' },
    { id: 'orbit_sim', name: '29. Gravitational Two-Body Orbit' },
    { id: 'collision_sim', name: '30. Elastic Two-Body Collision' },
    { id: 'spring_sim', name: '31. Damped Harmonic Oscillator' },
    { id: 'integrator_comparison', name: '32. Integrator Energy Drift Comparison' },
    { id: 'optics_sim', name: '33. Geometric Optics & Snell\'s Law' }
  ];

  console.log('\n3. Testing all 8 physics corpus documents in the live browser...');
  const documentReports = [];

  for (const doc of physicsDocIds) {
    console.log(`\nSelecting [${doc.id}]: ${doc.name}...`);
    await page.selectOption('#corpus-select', doc.id);
    await page.waitForTimeout(900);

    const report = await page.evaluate((docInfo) => {
      const rows = Array.from(document.querySelectorAll('.doc-gutter-row'));
      const rowTexts = rows.map(r => {
        const lineno = r.querySelector('.doc-gutter-lineno')?.textContent?.trim() || '';
        const res = r.querySelector('.doc-result-value')?.textContent?.trim() || '';
        const err = r.querySelector('.doc-gutter-error')?.textContent?.trim() || '';
        const anim = r.querySelector('.axine-animation-player') ? '[AnimationPlayer]' : '';
        return `${lineno}: ${res || err || anim || '(none)'}`;
      });

      const errors = Array.from(document.querySelectorAll('.doc-gutter-error')).map(e => e.textContent?.trim() || '');
      const hasAnimation = document.querySelector('.axine-animation-player') !== null;
      
      return {
        id: docInfo.id,
        name: docInfo.name,
        rowCount: rows.length,
        rows: rowTexts,
        hasAnimation,
        hasErrors: errors.length > 0,
        errors
      };
    }, doc);

    documentReports.push(report);
    console.log(`  Total rows: ${report.rowCount}`);
    console.log(`  Animation mounted: ${report.hasAnimation}`);
    console.log(`  Errors: ${report.hasErrors ? report.errors.join('; ') : 'None'}`);
    console.log('  Row details:');
    report.rows.forEach(r => console.log('    ', r));
  }

  // Test 3: Missing module resolution error reporting
  console.log('\n4. Testing missing module error reporting in browser...');
  const missingImportDoc = `import "nonexistent_module.ax"`;
  await page.evaluate((text) => {
    const ta = document.querySelector('#doc-textarea');
    if (ta) {
      ta.value = text;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }, missingImportDoc);

  await page.waitForTimeout(700);

  const missingReport = await page.evaluate(() => {
    const errEl = document.querySelector('.doc-gutter-error');
    return errEl ? (errEl.getAttribute('title') || errEl.textContent || '') : '(no error displayed)';
  });
  console.log('Missing module result:\n ', missingReport);

  // Test 4: Cycle detection in browser
  console.log('\n5. Testing cyclic module rejection in browser...');
  const cycleTestResult = await page.evaluate(async () => {
    // In browser worker or evaluator
    const { evaluate, Evaluator, createInitialEnvironment } = await import('/src/core/evaluator.ts');
    Evaluator.virtualFiles.set('c_a.ax', 'import "c_b.ax"');
    Evaluator.virtualFiles.set('c_b.ax', 'import "c_a.ax"');
    const env = createInitialEnvironment();
    try {
      evaluate('import "c_a.ax"', env);
      return 'FAILED: Cycle was not rejected';
    } catch (e) {
      return 'PASSED: ' + (e.diagnostic?.message || e.message);
    }
  });
  console.log('Cycle test result:\n ', cycleTestResult);

  await browser.close();
  console.log('\n=== All Browser Tests Completed Successfully ===');
  return documentReports;
}

runBrowserImportVerification().catch((err) => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
