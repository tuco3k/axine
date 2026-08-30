import { DocumentState, DocumentLineRecord } from './document_state';
import { CORPUS_DOCUMENTS } from './corpus_data';
import { Value } from '../core/types';
import { Canvas2DPlotter } from '../plot/canvas2d';
import { Surface3DPlotter } from '../plot/surface3d';

export class DocumentEditor {
  private container: HTMLElement;
  private state: DocumentState;
  private textarea!: HTMLTextAreaElement;
  private lineNumbersEl!: HTMLElement;
  private gutterEl!: HTMLElement;
  private statusBadge!: HTMLElement;
  private statsBadge!: HTMLElement;
  private modalEl!: HTMLElement;
  private scopePanelEl!: HTMLElement;
  private framesPanelEl!: HTMLElement;
  private activeTab: 'results' | 'scope' | 'trace' | 'frames' = 'results';
  private activePlotter: Canvas2DPlotter | Surface3DPlotter | null = null;
  private frames: Array<{ id: number; line: number; type: string; summary: string; timestamp: Date; result: Value }> = [];

  constructor(container: HTMLElement, initialText?: string) {
    this.container = container;
    const defaultText = initialText ?? CORPUS_DOCUMENTS[0].content;
    this.state = new DocumentState(defaultText);
    this.buildUI();
    this.bindEvents();
    this.state.subscribe((records, isEvaluating) => this.renderWorkPanel(records, isEvaluating));
  }

  private buildUI() {
    this.container.innerHTML = `
      <div class="doc-app-shell">
        <header class="doc-header">
          <div class="doc-brand">
            <span class="doc-logo">∫dx</span>
            <span class="doc-app-title">Live Document Editor</span>
          </div>

          <div class="doc-corpus-select-wrapper">
            <label for="corpus-select">Corpus:</label>
            <select id="corpus-select" class="doc-corpus-select">
              ${CORPUS_DOCUMENTS.map(doc => `<option value="${doc.id}">[${doc.category}] ${doc.title}</option>`).join('')}
            </select>
          </div>

          <div class="doc-header-actions">
            <div class="doc-budget-selector">
              <label for="budget-select">Budget:</label>
              <select id="budget-select" class="doc-budget-select">
                <option value="250">250 ms (Ambient)</option>
                <option value="1000">1 s</option>
                <option value="10000" selected>10 s (Invoked)</option>
                <option value="60000">1 min</option>
                <option value="600000">10 min</option>
                <option value="unbounded">Unbounded</option>
              </select>
            </div>

            <button id="doc-run-btn" class="doc-btn primary" title="Run in Invoked Worker Pool">▶ Run All</button>
            <button id="doc-stop-btn" class="doc-btn danger" title="Stop execution immediately (<100ms)">⏹ Stop</button>
            <span id="doc-status-badge" class="doc-status-badge ready">● Ambient</span>
            <span id="doc-stats-badge" class="doc-stats-badge">0 ms</span>
            <button id="doc-clear-btn" class="doc-btn">Clear</button>
          </div>
        </header>

        <main class="doc-editor-main">
          <div class="doc-pane-left">
            <div id="doc-line-numbers" class="doc-line-numbers"></div>
            <textarea
              id="doc-textarea"
              class="doc-textarea"
              placeholder="Write math expressions, definitions (x := 5), claims, or prose..."
              spellcheck="false"
              autocomplete="off"
              autocapitalize="off"
            >${this.state.getText()}</textarea>
          </div>

          <div class="doc-pane-right">
            <div class="doc-work-panel-tabs">
              <button class="doc-tab-btn active" data-tab="results">Results</button>
              <button class="doc-tab-btn" data-tab="scope">Scope</button>
              <button class="doc-tab-btn" data-tab="trace">Trace & Fuel</button>
              <button class="doc-tab-btn" data-tab="frames">Frames (<span id="frame-count">0</span>)</button>
            </div>

            <div id="tab-results-panel" class="doc-tab-content active">
              <div id="doc-gutter" class="doc-gutter"></div>
            </div>

            <div id="tab-scope-panel" class="doc-tab-content">
              <div class="doc-panel-section-title">Active Scope Symbols</div>
              <div id="doc-scope-list" class="doc-scope-list"></div>
            </div>

            <div id="tab-trace-panel" class="doc-tab-content">
              <div class="doc-panel-section-title">Execution Telemetry & Fuel</div>
              <div id="doc-trace-content" class="doc-trace-content">
                <div class="trace-metric">
                  <span class="trace-label">Ambient Worker Pool:</span>
                  <span class="trace-value">Active (250ms / 2M steps budget)</span>
                </div>
                <div class="trace-metric">
                  <span class="trace-label">Invoked Worker Pool:</span>
                  <span class="trace-value">Ready (Independent thread)</span>
                </div>
                <div class="trace-metric">
                  <span class="trace-label">Total Execution Duration:</span>
                  <span id="trace-duration" class="trace-value">0 ms</span>
                </div>
                <div class="trace-metric">
                  <span class="trace-label">Total Evaluated Lines:</span>
                  <span id="trace-line-count" class="trace-value">0</span>
                </div>
              </div>
            </div>

            <div id="tab-frames-panel" class="doc-tab-content">
              <div class="doc-panel-section-title">Frame Ring Buffer (Last 20)</div>
              <div id="doc-frames-list" class="doc-frames-list"></div>
            </div>
          </div>
        </main>

        <div id="doc-plot-modal" class="doc-plot-modal hidden">
          <div class="doc-modal-content">
            <div class="doc-modal-header">
              <span id="doc-modal-title">Interactive Plot</span>
              <button id="doc-modal-close" class="doc-modal-close-btn">&times;</button>
            </div>
            <div class="doc-modal-body">
              <canvas id="doc-modal-canvas"></canvas>
            </div>
          </div>
        </div>
      </div>
    `;

    this.textarea = this.container.querySelector('#doc-textarea') as HTMLTextAreaElement;
    this.lineNumbersEl = this.container.querySelector('#doc-line-numbers') as HTMLElement;
    this.gutterEl = this.container.querySelector('#doc-gutter') as HTMLElement;
    this.statusBadge = this.container.querySelector('#doc-status-badge') as HTMLElement;
    this.statsBadge = this.container.querySelector('#doc-stats-badge') as HTMLElement;
    this.modalEl = this.container.querySelector('#doc-plot-modal') as HTMLElement;
    this.scopePanelEl = this.container.querySelector('#doc-scope-list') as HTMLElement;
    this.framesPanelEl = this.container.querySelector('#doc-frames-list') as HTMLElement;
  }

  private bindEvents() {
    this.textarea.addEventListener('input', () => {
      this.state.setText(this.textarea.value);
    });

    this.textarea.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.textarea.selectionStart;
        const end = this.textarea.selectionEnd;
        this.textarea.value = this.textarea.value.substring(0, start) + '  ' + this.textarea.value.substring(end);
        this.textarea.selectionStart = this.textarea.selectionEnd = start + 2;
        this.state.setText(this.textarea.value);
      }
    });

    this.textarea.addEventListener('scroll', () => {
      const scrollTop = this.textarea.scrollTop;
      this.lineNumbersEl.scrollTop = scrollTop;
      this.gutterEl.scrollTop = scrollTop;
    });

    // Work Panel Tabs Switcher
    const tabButtons = this.container.querySelectorAll('.doc-tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = (btn as HTMLElement).getAttribute('data-tab') as any;
        this.activeTab = tab;
        this.container.querySelectorAll('.doc-tab-content').forEach(p => p.classList.remove('active'));
        const panel = this.container.querySelector(`#tab-${tab}-panel`);
        if (panel) panel.classList.add('active');
      });
    });

    // Corpus selector
    const selectEl = this.container.querySelector('#corpus-select') as HTMLSelectElement;
    selectEl.addEventListener('change', () => {
      const doc = CORPUS_DOCUMENTS.find(d => d.id === selectEl.value);
      if (doc) {
        this.textarea.value = doc.content;
        this.state.setText(doc.content);
      }
    });

    // Run All (Invoked) with chosen budget
    const runBtn = this.container.querySelector('#doc-run-btn') as HTMLButtonElement;
    const budgetSelect = this.container.querySelector('#budget-select') as HTMLSelectElement;
    runBtn.addEventListener('click', () => {
      const val = budgetSelect?.value ?? '10000';
      const timeoutMs = val === 'unbounded' ? 3600000 : parseInt(val, 10);
      const maxSteps = val === 'unbounded' ? 1000000000 : (timeoutMs <= 1000 ? 5000000 : 100000000);
      const limits = {
        timeoutMs,
        maxSteps,
        maxDepth: 5000,
        maxBigIntDigits: 100000,
        maxMemoryElements: 1000000,
      };
      this.state.runInvoked(limits);
    });

    const stopBtn = this.container.querySelector('#doc-stop-btn') as HTMLButtonElement;
    stopBtn.addEventListener('click', () => {
      const { durationMs } = this.state.stop();
      this.statusBadge.className = 'doc-status-badge';
      this.statusBadge.textContent = `● Stopped (${durationMs.toFixed(1)} ms)`;
    });

    // Clear button
    const clearBtn = this.container.querySelector('#doc-clear-btn') as HTMLButtonElement;
    clearBtn.addEventListener('click', () => {
      this.textarea.value = '';
      this.state.setText('');
    });

    // Modal close
    const closeBtn = this.container.querySelector('#doc-modal-close') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => this.closePlotModal());
    this.modalEl.addEventListener('click', (e) => {
      if (e.target === this.modalEl) this.closePlotModal();
    });
  }

  private renderWorkPanel(records: DocumentLineRecord[], isEvaluating: boolean) {
    if (this.state.getIsInvokedRunning()) {
      this.statusBadge.className = 'doc-status-badge evaluating';
      this.statusBadge.textContent = '● Invoked Running...';
    } else if (isEvaluating) {
      this.statusBadge.className = 'doc-status-badge evaluating';
      this.statusBadge.textContent = '● Ambient Evaluating...';
    } else {
      this.statusBadge.className = 'doc-status-badge ready';
      this.statusBadge.textContent = '● Ready';
      this.statsBadge.textContent = `${this.state.getLastDurationMs()} ms (${records.length} lines)`;
    }

    const activePanel = this.container.querySelector(`#tab-${this.activeTab}-panel`);
    if (activePanel && !activePanel.classList.contains('active')) {
      this.container.querySelectorAll('.doc-tab-content').forEach(p => p.classList.remove('active'));
      activePanel.classList.add('active');
    }

    // 1. Line Numbers
    let lineNumsHtml = '';
    for (let i = 0; i < records.length; i++) {
      lineNumsHtml += `<div class="doc-line-num">${i + 1}</div>`;
    }
    this.lineNumbersEl.innerHTML = lineNumsHtml;

    // 2. Results Gutter
    let gutterHtml = '';
    const activeSymbols: Map<string, { type: string; value: string; line: number; isShadowed?: boolean }> = new Map();

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      gutterHtml += `<div class="doc-gutter-row" data-line="${i}">${this.formatGutterRow(rec)}</div>`;

      if (rec.boundName && rec.result) {
        activeSymbols.set(rec.boundName, {
          type: rec.result.type,
          value: this.formatValue(rec.result),
          line: i + 1,
          isShadowed: rec.isShadowed,
        });
      }

      if (rec.result && (rec.result.type === 'graph' || rec.result.type === 'matrix' || rec.result.type === 'claim')) {
        this.addFrame(i + 1, rec.result);
      }
    }
    this.gutterEl.innerHTML = gutterHtml;

    // Attach plot click handlers
    const plotButtons = this.gutterEl.querySelectorAll('.doc-plot-btn');
    plotButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const lineIdx = parseInt((btn as HTMLElement).getAttribute('data-line') ?? '0', 10);
        const record = records[lineIdx];
        if (record && record.result && record.result.type === 'graph') {
          this.openPlotModal(record.result);
        }
      });
    });

    // 3. Scope Tab
    let scopeHtml = '';
    if (activeSymbols.size === 0) {
      scopeHtml = `<div class="doc-scope-empty">No user definitions in scope</div>`;
    } else {
      activeSymbols.forEach((info, name) => {
        scopeHtml += `
          <div class="doc-scope-item">
            <div class="scope-item-header">
              <span class="scope-name">${escapeHtml(name)}</span>
              <span class="scope-type">${info.type}</span>
              <span class="scope-line">Line ${info.line}</span>
              ${info.isShadowed ? '<span class="doc-shadowed-badge">shadowed</span>' : ''}
            </div>
            <div class="scope-val">${escapeHtml(info.value)}</div>
          </div>
        `;
      });
    }
    this.scopePanelEl.innerHTML = scopeHtml;

    // 4. Trace Tab
    const durationEl = this.container.querySelector('#trace-duration');
    const lineCountEl = this.container.querySelector('#trace-line-count');
    if (durationEl) durationEl.textContent = `${this.state.getLastDurationMs()} ms`;
    if (lineCountEl) lineCountEl.textContent = `${records.length}`;

    // 5. Frames Tab
    this.renderFrames();
  }

  private addFrame(line: number, result: Value) {
    if (this.frames.some(f => f.line === line && f.type === result.type)) return;
    const summary = result.type === 'claim' ? (result as any).statement : this.formatValue(result);
    this.frames.unshift({
      id: Date.now() + Math.random(),
      line,
      type: result.type,
      summary,
      timestamp: new Date(),
      result,
    });
    if (this.frames.length > 20) this.frames.pop();
    const frameCountEl = this.container.querySelector('#frame-count');
    if (frameCountEl) frameCountEl.textContent = `${this.frames.length}`;
  }

  private renderFrames() {
    if (this.frames.length === 0) {
      this.framesPanelEl.innerHTML = `<div class="doc-scope-empty">No visualization frames recorded</div>`;
      return;
    }
    let framesHtml = '';
    for (const frame of this.frames) {
      framesHtml += `
        <div class="doc-frame-card">
          <div class="frame-header">
            <span class="frame-badge">${frame.type.toUpperCase()}</span>
            <span class="frame-line">Line ${frame.line}</span>
            <span class="frame-time">${frame.timestamp.toLocaleTimeString()}</span>
          </div>
          <div class="frame-summary">${escapeHtml(frame.summary)}</div>
        </div>
      `;
    }
    this.framesPanelEl.innerHTML = framesHtml;
  }

  private formatGutterRow(rec: DocumentLineRecord): string {
    if (rec.classification.state === 'PROSE') {
      return `<span class="doc-gutter-prose"></span>`;
    }

    if (rec.classification.state === 'INCOMPLETE') {
      return `<span class="doc-gutter-incomplete">...</span>`;
    }

    if (rec.classification.state === 'ERROR') {
      const msg = rec.error?.message ?? 'Syntax error';
      return `
        <div class="doc-gutter-error" title="${escapeHtml(msg)}">
          <span class="doc-error-tag">Error</span>
          <span class="doc-error-msg">${escapeHtml(msg)}</span>
        </div>
      `;
    }

    if (rec.result) {
      let noticeHtml = '';
      if ('notice' in rec.result && rec.result.notice) {
        noticeHtml = `<span class="doc-notice-badge" title="${escapeHtml(rec.result.notice)}">notice: float approx</span>`;
      }

      let shadowedHtml = '';
      if (rec.isShadowed) {
        shadowedHtml = `<span class="doc-shadowed-badge" title="Variable was re-defined and shadowed">(shadowed)</span>`;
      }

      if (rec.result.type === 'graph') {
        return `
          <div class="doc-gutter-result graph">
            <button class="doc-plot-btn" data-line="${rec.lineIndex}">📈 View Plot (${rec.result.spec.kind})</button>
          </div>
        `;
      }

      if (rec.result.type === 'claim') {
        const claim = rec.result as any;
        const statusClass = claim.verified ? 'verified' : (claim.shadowVal?.type === 'unknown' ? 'unknown' : 'falsified');
        const statusIcon = claim.verified ? '✓ Verified' : (claim.shadowVal?.type === 'unknown' ? `? Unknown (${claim.shadowVal.reason})` : '✗ Falsified');
        return `
          <div class="doc-gutter-claim ${statusClass}">
            <span class="claim-badge">${statusIcon}</span>
            <span class="claim-title">${escapeHtml(claim.name)}</span>
          </div>
        `;
      }

      if (rec.result.type === 'unknown') {
        const unk = rec.result as any;
        return `
          <div class="doc-gutter-unknown" title="${escapeHtml(unk.detail ?? unk.reason)}">
            <span class="unknown-badge">? unknown(${unk.reason})</span>
          </div>
        `;
      }

      if (rec.result.type === 'matrix') {
        return `
          <div class="doc-gutter-result matrix">
            <span class="matrix-badge">Matrix [${rec.result.rows}x${rec.result.cols}]</span>
            <span class="doc-result-value">${escapeHtml(this.formatValue(rec.result))}</span>
          </div>
        `;
      }

      if (rec.result.type === 'derivation') {
        const deriv = rec.result;
        return `
          <div class="doc-gutter-result derivation">
            <div class="derivation-steps">
              ${deriv.steps.map(step => `
                <div class="derivation-step">
                  <div class="step-main">
                    <span class="step-eq">${escapeHtml(step.equation)}</span>
                    <span class="step-rule" title="${escapeHtml(step.justification)}">${escapeHtml(step.rule)}</span>
                  </div>
                  ${step.sideCondition ? `<div class="step-condition">${escapeHtml(step.sideCondition)}</div>` : ''}
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      if (rec.result.type === 'solve_trace') {
        const traceVal = rec.result;
        return `
          <div class="doc-gutter-result solve-trace">
            <div class="trace-header">
              <span class="matrix-badge">${traceVal.method === 'newton' ? 'Newton' : 'Bisection'} (${traceVal.iterations.length} iters)</span>
              <span class="doc-result-value">x ≈ ${escapeHtml(this.formatValue(traceVal.root))}</span>
            </div>
            <div class="trace-table-wrapper">
              <table class="trace-table">
                <thead>
                  <tr>
                    <th>Iter</th>
                    <th>x</th>
                    <th>f(x)</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  ${traceVal.iterations.slice(0, 10).map(it => `
                    <tr>
                      <td>${it.n}</td>
                      <td>${it.x.toFixed(6)}</td>
                      <td>${it.fx.toExponential(2)}</td>
                      <td>${it.error.toExponential(2)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `;
      }

      const formattedVal = this.formatValue(rec.result);
      return `
        <div class="doc-gutter-result">
          ${shadowedHtml}
          ${noticeHtml}
          <span class="doc-result-value">${escapeHtml(formattedVal)}</span>
        </div>
      `;
    }

    return '';
  }

  private formatValue(val: Value): string {
    switch (val.type) {
      case 'rational':
        if (val.d === 1n) return val.n.toString();
        return `${val.n}/${val.d}`;
      case 'float': {
        const v = Math.abs(val.value) < 1e-12 ? 0 : val.value;
        return Number.isInteger(v) ? v.toString() : v.toFixed(6).replace(/\.?0+$/, '');
      }
      case 'boolean':
        return val.value ? 'true' : 'false';
      case 'none':
        return 'none';
      case 'unknown':
        return `unknown(${val.reason}${val.detail ? `, "${val.detail}"` : ''})`;
      case 'claim':
        return `[Claim ${(val as any).name}: ${(val as any).verified ? 'Verified' : 'Unverified'}]`;
      case 'derivation': {
        if (val.specialCase === 'no-solution') return 'no solution';
        if (val.specialCase === 'all-real') return 'all real numbers (identity)';
        if (val.roots.length === 1) return `${val.targetVar} = ${this.formatValue(val.roots[0])}`;
        if (val.roots.length > 1) return `${val.targetVar} = ${val.roots.map(r => this.formatValue(r)).join(' or ')}`;
        return `[Derivation: ${val.steps.length} steps]`;
      }
      case 'solve_trace':
        return `${val.method === 'newton' ? "Newton's" : 'Bisection'} root ≈ ${this.formatValue(val.root)} (${val.iterations.length} iterations)`;
      case 'matrix':
        return `[${val.data.map(row => '[' + row.map(cell => this.formatValue(cell)).join(', ') + ']').join(', ')}]`;
      case 'tuple':
        return `(${val.elements.map(e => this.formatValue(e)).join(', ')})`;
      case 'list': {
        if (val.elements.length > 8) {
          const head = val.elements.slice(0, 4).map(e => this.formatValue(e)).join(', ');
          return `[${head}, ... ${val.elements.length} items]`;
        }
        return `[${val.elements.map(e => this.formatValue(e)).join(', ')}]`;
      }
      case 'function':
        return `[Function ${val.name}(${val.params.join(', ')})]`;
      case 'lambda':
        return `[Lambda (${val.params.join(', ')})]`;
      default:
        return String((val as any).value ?? val.type);
    }
  }

  private openPlotModal(graphVal: any) {
    if (this.activePlotter) {
      this.activePlotter.dispose();
      this.activePlotter = null;
    }

    this.modalEl.classList.remove('hidden');
    const canvas = this.modalEl.querySelector('#doc-modal-canvas') as HTMLCanvasElement;
    const titleEl = this.modalEl.querySelector('#doc-modal-title') as HTMLElement;
    titleEl.textContent = `Interactive Plot: ${graphVal.spec.kind}`;

    const spec = graphVal.spec;
    if (spec.dimensionality === 2 && (spec.surface || spec.parametric?.zExpr || spec.kind === 'surface' || spec.kind === 'pointcloud')) {
      this.activePlotter = new Surface3DPlotter(canvas, spec, {});
    } else {
      this.activePlotter = new Canvas2DPlotter(canvas, spec, {});
    }
    this.activePlotter.render();
  }

  private closePlotModal() {
    if (this.activePlotter) {
      this.activePlotter.dispose();
      this.activePlotter = null;
    }
    this.modalEl.classList.add('hidden');
  }

  public dispose() {
    this.closePlotModal();
    this.state.dispose();
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
