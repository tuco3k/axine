import { chromium } from 'playwright';

async function extractPopoverText() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto('http://localhost:5173', { waitUntil: 'load' });
  await page.waitForSelector('#doc-textarea');

  const rawExtracted = await page.evaluate(() => {
    const { explainSymbol, typesetMath } = window;
    const expInt = explainSymbol('dx', { parentType: 'integral', integrand: 'x^2', variableName: 'x' });
    const expDeriv = explainSymbol('dx', { parentType: 'derivative', variableName: 'x' });

    function renderPopover(exp) {
      const container = document.createElement('div');
      container.className = 'doc-math-popover';
      container.innerHTML = `
        <div class="popover-header">
          <div class="popover-symbol-badge">${typesetMath(exp.symbol, { displayMode: false })}</div>
          <div class="popover-title-group">
            <span class="popover-role">${exp.role}</span>
          </div>
        </div>
        <div class="popover-body">
          <div class="popover-section" data-section="whatItIs">
            <div class="popover-section-label">1. WHAT IT IS</div>
            <div class="popover-section-content">${exp.whatItIs}</div>
          </div>
          <div class="popover-section" data-section="whyItIsHere">
            <div class="popover-section-label">2. WHY IT IS HERE</div>
            <div class="popover-section-content">${exp.whyItIsHere}</div>
          </div>
          <div class="popover-section" data-section="showMe">
            <div class="popover-section-label">3. SHOW ME</div>
            <div class="popover-section-content">${exp.showMe}</div>
          </div>
          <div class="popover-section" data-section="goDeeper">
            <div class="popover-section-label">4. GO DEEPER</div>
            <div class="popover-section-content">${exp.goDeeper}</div>
          </div>
        </div>
      `;
      document.body.appendChild(container);

      const res = {
        innerText: container.innerText,
        sections: {
          badge: container.querySelector('.popover-symbol-badge')?.innerText,
          role: container.querySelector('.popover-role')?.innerText,
          whatItIs: container.querySelector('[data-section="whatItIs"] .popover-section-content')?.innerText,
          whyItIsHere: container.querySelector('[data-section="whyItIsHere"] .popover-section-content')?.innerText,
          showMe: container.querySelector('[data-section="showMe"] .popover-section-content')?.innerText,
          goDeeper: container.querySelector('[data-section="goDeeper"] .popover-section-content')?.innerText,
        },
        rawHTML: container.innerHTML
      };

      document.body.removeChild(container);
      return res;
    }

    return {
      contextA: renderPopover(expInt),
      contextB: renderPopover(expDeriv),
    };
  });

  console.log('=== RAW EXTRACTED DOM TEXT: CONTEXT A (INTEGRAL) ===');
  console.log(rawExtracted.contextA.innerText);
  console.log('\n--- Context A Broken Down by Section ---');
  console.log(JSON.stringify(rawExtracted.contextA.sections, null, 2));

  console.log('\n=== RAW EXTRACTED DOM TEXT: CONTEXT B (DERIVATIVE) ===');
  console.log(rawExtracted.contextB.innerText);
  console.log('\n--- Context B Broken Down by Section ---');
  console.log(JSON.stringify(rawExtracted.contextB.sections, null, 2));

  await browser.close();
}

extractPopoverText().catch(console.error);
