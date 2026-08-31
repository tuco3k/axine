import { DocumentState, DocumentLineRecord } from './document_state';
import { CORPUS_DOCUMENTS } from './corpus_data';
import { FuelLimits, Value, GraphValue, DerivationValue, SolveTraceValue } from '../core/types';
import { Canvas2DPlotter } from '../plot/canvas2d';
import { Surface3DPlotter } from '../plot/surface3d';
import { typesetMath } from '../core/math_typeset';
import { explainSymbol } from '../core/explainer';
import { MathPopover } from './popover';
import { ICONS } from '../styles/icons';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export class DocumentEditor {
  private container: HTMLElement;
  private state: DocumentState;
  private textarea!: HTMLTextAreaElement;
  private overlayEl!: HTMLElement;
  private caretEl!: HTMLElement;
  private lineNumbersEl!: HTMLElement;
  private gutterEl!: HTMLElement;
  private scopePanelEl!: HTMLElement;
  private tracePanelEl!: HTMLElement;
  private framesPanelEl!: HTMLElement;
  private statusBadge!: HTMLElement;
  private statsBadge!: HTMLElement;
  private activePlotter: Canvas2DPlotter | Surface3DPlotter | null = null;
  private activeTab: 'results' | 'visual' | 'scope' | 'trace' | 'frames' = 'results';
  private frames: { line: number; type: string; summary: string; timestamp: number }[] = [];
  private isPinned: boolean = false;
  private pinnedLine: number | null = null;
  private activeVisualLine: number = 0;
  public mathPopover: MathPopover;

  constructor(container: HTMLElement) {
    this.container = container;
    this.state = new DocumentState();
    this.mathPopover = new MathPopover();
    this.buildUI();
    this.bindEvents();
    this.state.subscribe((records, isEvaluating) => this.renderWorkPanel(records, isEvaluating));
  }

  private buildUI() {
    this.container.innerHTML = `
      <div class="doc-app-shell">
        <header class="doc-header">
          <div class="doc-brand">
            <span class="doc-logo">&int;dx</span>
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

            <button id="doc-run-btn" class="doc-btn primary" title="Run in Invoked Worker Pool">${ICONS.run} Run All</button>
            <button id="doc-stop-btn" class="doc-btn danger" title="Stop execution immediately (<100ms)">${ICONS.stop} Stop</button>
            <span id="doc-status-badge" class="doc-status-badge ready">Ambient</span>
            <span id="doc-stats-badge" class="doc-stats-badge">0 ms</span>
            <button id="doc-clear-btn" class="doc-btn">Clear</button>
            <button id="doc-theme-btn" class="doc-theme-btn" title="Toggle Light/Dark Theme">${ICONS.sun}</button>
          </div>
        </header>

        <main class="doc-editor-main">
          <div class="doc-pane-left">
            <div id="doc-line-numbers" class="doc-line-numbers"></div>
            <div class="doc-editor-surface">
              <div id="doc-typeset-overlay" class="doc-typeset-overlay" aria-hidden="true"></div>
              <div id="doc-caret" class="doc-custom-caret"></div>
              <textarea
                id="doc-textarea"
                class="doc-textarea"
                placeholder="Write math expressions, definitions (x := 5), claims, or prose..."
                spellcheck="false"
                autocomplete="off"
                autocapitalize="off"
              ></textarea>
            </div>
          </div>

          <div id="doc-splitter" class="doc-splitter" title="Drag to resize panel"></div>

          <div class="doc-pane-right">
            <div class="doc-work-panel-tabs">
              <button class="doc-tab-btn active" data-tab="results">Results</button>
              <button class="doc-tab-btn" data-tab="visual">Visual</button>
              <button class="doc-tab-btn" data-tab="scope">Scope</button>
              <button class="doc-tab-btn" data-tab="trace">Trace & Fuel</button>
              <button class="doc-tab-btn" data-tab="frames">Frames</button>
            </div>

            <div id="tab-results-panel" class="doc-tab-content active">
              <div id="doc-gutter" class="doc-gutter"></div>
            </div>

            <div id="tab-visual-panel" class="doc-tab-content">
              <div class="doc-visual-header">
                <div class="doc-visual-title-row">
                  <span id="visual-title" class="doc-panel-section-title">Visual Output</span>
                  <button id="visual-pin-btn" class="doc-pin-btn" title="Pin visual to current line">${ICONS.pin} Pin</button>
                </div>
                <div id="visual-meta" class="doc-visual-meta">Line 1: No visual content</div>
              </div>
              <div id="visual-body" class="doc-visual-body">
                <div id="visual-empty-state" class="doc-visual-empty">Select or type a plot or derivation to visualize</div>
                <div id="visual-canvas-wrapper" class="doc-visual-canvas-wrapper hidden">
                  <canvas id="visual-canvas"></canvas>
                </div>
                <div id="visual-derivation-wrapper" class="doc-visual-derivation-wrapper hidden">
                  <div id="visual-derivation-content" class="visual-derivation-tree"></div>
                </div>
              </div>
            </div>

            <div id="tab-scope-panel" class="doc-tab-content">
              <div class="doc-panel-section-title">Active Scope (Definitions)</div>
              <div id="doc-scope-list" class="doc-scope-list"></div>
            </div>

            <div id="tab-trace-panel" class="doc-tab-content">
              <div class="doc-panel-section-title">Execution Trace & Fuel Consumption</div>
              <div class="doc-trace-content">
                <div class="trace-metric">
                  <span class="trace-label">Ambient Worker Pool Duration:</span>
                  <span id="trace-duration" class="trace-value">0 ms</span>
                </div>
                <div class="trace-metric">
                  <span class="trace-label">Evaluated Lines:</span>
                  <span id="trace-line-count" class="trace-value">0</span>
                </div>
                <div class="trace-metric">
                  <span class="trace-label">Status:</span>
                  <span class="trace-value">Continuous Ambient Reactive</span>
                </div>
              </div>
            </div>

            <div id="tab-frames-panel" class="doc-tab-content">
              <div class="doc-panel-section-title">Captured Visual Frames</div>
              <div id="doc-frames-list" class="doc-frames-list"></div>
            </div>
          </div>
        </main>
      </div>
    `;

    this.textarea = this.container.querySelector('#doc-textarea') as HTMLTextAreaElement;
    this.overlayEl = this.container.querySelector('#doc-typeset-overlay') as HTMLElement;
    this.caretEl = this.container.querySelector('#doc-caret') as HTMLElement;
    this.lineNumbersEl = this.container.querySelector('#doc-line-numbers') as HTMLElement;
    this.gutterEl = this.container.querySelector('#doc-gutter') as HTMLElement;
    this.statusBadge = this.container.querySelector('#doc-status-badge') as HTMLElement;
    this.statsBadge = this.container.querySelector('#doc-stats-badge') as HTMLElement;
    this.scopePanelEl = this.container.querySelector('#doc-scope-list') as HTMLElement;
    this.framesPanelEl = this.container.querySelector('#doc-frames-list') as HTMLElement;

    // Apply persisted right pane width
    const savedWidth = localStorage.getItem('doc_panel_width');
    if (savedWidth) {
      const rightPane = this.container.querySelector('.doc-pane-right') as HTMLElement;
      if (rightPane) rightPane.style.width = savedWidth;
    }

    this.updateTypesetOverlay();
    this.updateCaret();
  }

  private bindEvents() {
    this.textarea.addEventListener('input', () => {
      this.updateTypesetOverlay();
      this.updateCaret();
      this.state.setText(this.textarea.value);
    });

    this.textarea.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.textarea.selectionStart;
        const end = this.textarea.selectionEnd;
        this.textarea.value = this.textarea.value.substring(0, start) + '  ' + this.textarea.value.substring(end);
        this.textarea.selectionStart = this.textarea.selectionEnd = start + 2;
        this.updateTypesetOverlay();
        this.updateCaret();
        this.state.setText(this.textarea.value);
      }
    });

    this.textarea.addEventListener('scroll', () => {
      const scrollTop = this.textarea.scrollTop;
      const scrollLeft = this.textarea.scrollLeft;
      this.lineNumbersEl.scrollTop = scrollTop;
      this.gutterEl.scrollTop = scrollTop;
      this.overlayEl.scrollTop = scrollTop;
      this.overlayEl.scrollLeft = scrollLeft;
      this.updateCaret();
    });

    this.textarea.addEventListener('focus', () => this.updateCaret());
    this.textarea.addEventListener('blur', () => this.updateCaret());
    this.textarea.addEventListener('select', () => this.updateCaret());

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
        this.updateTypesetOverlay();
        this.updateCaret();
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
      this.statusBadge.className = 'doc-status-badge stopped';
      this.statusBadge.textContent = `Stopped (${durationMs.toFixed(1)} ms)`;
    });

    // Clear button
    const clearBtn = this.container.querySelector('#doc-clear-btn') as HTMLButtonElement;
    clearBtn.addEventListener('click', () => {
      this.textarea.value = '';
      this.updateTypesetOverlay();
      this.updateCaret();
      this.state.setText('');
    });

    // Theme Toggle Button
    const themeBtn = this.container.querySelector('#doc-theme-btn') as HTMLButtonElement;
    themeBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', nextTheme);
      themeBtn.innerHTML = nextTheme === 'light' ? ICONS.moon : ICONS.sun;
      localStorage.setItem('math_notebook_theme', nextTheme);
      if (this.activePlotter) this.activePlotter.render();
    });

    // Draggable Splitter
    const splitter = this.container.querySelector('#doc-splitter') as HTMLElement;
    const rightPane = this.container.querySelector('.doc-pane-right') as HTMLElement;
    let isDragging = false;

    splitter.addEventListener('mousedown', () => {
      isDragging = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const containerRect = this.container.getBoundingClientRect();
      const newWidth = Math.max(300, Math.min(containerRect.width - 200, containerRect.right - e.clientX));
      rightPane.style.width = `${newWidth}px`;
      localStorage.setItem('doc_panel_width', `${newWidth}px`);
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        if (this.activePlotter) this.activePlotter.render();
      }
    });

    // Pin Control
    const pinBtn = this.container.querySelector('#visual-pin-btn') as HTMLButtonElement;
    pinBtn.addEventListener('click', () => {
      this.isPinned = !this.isPinned;
      pinBtn.innerHTML = this.isPinned ? `${ICONS.pinned} Pinned` : `${ICONS.pin} Pin`;
      pinBtn.classList.toggle('pinned', this.isPinned);
      if (this.isPinned) {
        this.pinnedLine = this.activeVisualLine;
      } else {
        this.pinnedLine = null;
        this.syncVisualToCursor();
      }
    });

    // Cursor synchronization
    const syncToCursor = () => {
      this.updateCaret();
      if (this.isPinned) return;
      const lineIdx = this.getCursorLineIndex();
      this.displayVisualForLine(lineIdx, false);
    };
    this.textarea.addEventListener('keyup', syncToCursor);
    this.textarea.addEventListener('click', syncToCursor);
    document.addEventListener('selectionchange', () => {
      if (document.activeElement === this.textarea) {
        this.updateCaret();
      }
    });

    // Explainable Math Clickable Elements
    this.container.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('.tm-clickable') as HTMLElement;
      if (!target) return;

      const symbol = target.getAttribute('data-symbol') || target.textContent || '';
      const parentType = target.getAttribute('data-parent-type') || '';
      const integrand = target.getAttribute('data-integrand') || '';
      const boundsLower = target.getAttribute('data-bounds-lower') || '';
      const boundsUpper = target.getAttribute('data-bounds-upper') || '';
      const varName = target.getAttribute('data-var') || 'x';

      // Find current line text from document
      const lineEl = target.closest('.doc-typeset-line');
      let lineText = '';
      if (lineEl) {
        const lineIdx = Array.from(this.overlayEl.querySelectorAll('.doc-typeset-line')).indexOf(lineEl);
        if (lineIdx !== -1) {
          lineText = this.textarea.value.split('\n')[lineIdx]?.trim() || '';
        }
      }

      const explanation = explainSymbol(symbol, {
        parentType,
        integrand,
        exprString: lineText,
        variableName: varName,
        bounds: { lower: boundsLower, upper: boundsUpper },
      });

      this.mathPopover.show(explanation, target);
    });

    this.bindSurfaceMouseEvents();
  }

  private bindSurfaceMouseEvents() {
    const surface = this.container.querySelector('.doc-editor-surface') as HTMLElement;
    if (!surface) return;
    let isDragging = false;
    let dragStartOffset = 0;

    const getOffsetFromMouseEvent = (e: MouseEvent): number => {
      const surfaceRect = this.overlayEl.getBoundingClientRect();
      const clickX = e.clientX - surfaceRect.left + this.overlayEl.scrollLeft;
      const clickY = e.clientY - surfaceRect.top + this.overlayEl.scrollTop;

      const lines = this.textarea.value.split('\n');
      const lineHeight = 24.5;
      const padTop = 10.5;

      let lineIdx = Math.floor((clickY - padTop) / lineHeight);
      lineIdx = Math.max(0, Math.min(lines.length - 1, lineIdx));

      const lineStr = lines[lineIdx] || '';
      const lineEls = this.overlayEl.querySelectorAll('.doc-typeset-line');
      const lineEl = lineEls[lineIdx] as HTMLElement;
      if (!lineEl) return 0;

      const charBoxes = this.getLineCharacterBoxes(lineEl, lineStr);
      let colOffset = 0;

      if (charBoxes.length === 0 || clickX <= charBoxes[0].left) {
        colOffset = 0;
      } else if (clickX >= charBoxes[charBoxes.length - 1].right) {
        colOffset = lineStr.length;
      } else {
        for (let i = 0; i < charBoxes.length; i++) {
          const box = charBoxes[i];
          if (clickX >= box.left && clickX <= box.right) {
            const mid = (box.left + box.right) / 2;
            colOffset = clickX < mid ? i : i + 1;
            break;
          } else if (i < charBoxes.length - 1 && clickX > box.right && clickX < charBoxes[i + 1].left) {
            colOffset = i + 1;
            break;
          }
        }
      }

      let docOffset = 0;
      for (let l = 0; l < lineIdx; l++) {
        docOffset += lines[l].length + 1;
      }
      docOffset += Math.max(0, Math.min(lineStr.length, colOffset));
      return docOffset;
    };

    surface.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.textarea.focus();

      dragStartOffset = getOffsetFromMouseEvent(e);
      this.textarea.setSelectionRange(dragStartOffset, dragStartOffset);
      this.updateCaret();
      isDragging = true;
    });

    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!isDragging) return;
      const currOffset = getOffsetFromMouseEvent(e);
      const start = Math.min(dragStartOffset, currOffset);
      const end = Math.max(dragStartOffset, currOffset);
      const dir = currOffset < dragStartOffset ? 'backward' : 'forward';
      this.textarea.setSelectionRange(start, end, dir);
      this.updateCaret();
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
      }
    });

    surface.addEventListener('dblclick', (e: MouseEvent) => {
      e.preventDefault();
      const offset = getOffsetFromMouseEvent(e);
      const text = this.textarea.value;
      let start = offset;
      let end = offset;
      while (start > 0 && /[a-zA-Z0-9_]/.test(text[start - 1])) start--;
      while (end < text.length && /[a-zA-Z0-9_]/.test(text[end])) end++;
      this.textarea.setSelectionRange(start, end);
      this.updateCaret();
    });
  }

  private getCursorLineIndex(): number {
    const textBefore = this.textarea.value.substring(0, this.textarea.selectionStart);
    return textBefore.split('\n').length - 1;
  }

  private syncVisualToCursor() {
    if (this.isPinned && this.pinnedLine !== null) {
      this.displayVisualForLine(this.pinnedLine, false);
      return;
    }
    const lineIdx = this.getCursorLineIndex();
    this.displayVisualForLine(lineIdx, false);
  }

  private renderWorkPanel(records: DocumentLineRecord[], isEvaluating: boolean) {
    if (this.state.getIsInvokedRunning()) {
      this.statusBadge.className = 'doc-status-badge evaluating';
      this.statusBadge.textContent = 'Invoked Running...';
    } else if (isEvaluating) {
      this.statusBadge.className = 'doc-status-badge evaluating';
      this.statusBadge.textContent = 'Ambient Evaluating...';
    } else {
      this.statusBadge.className = 'doc-status-badge ready';
      this.statusBadge.textContent = 'Ready';
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
      const rowContent = this.formatGutterRow(rec);
      gutterHtml += `
        <div class="doc-gutter-row" data-line="${i}">
          <span class="doc-gutter-lineno">L${i + 1}</span>
          <div class="doc-gutter-content">${rowContent}</div>
        </div>
      `;

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

    // Reciprocal hover highlighting between editor lines and gutter rows
    const gutterRows = this.gutterEl.querySelectorAll('.doc-gutter-row');
    gutterRows.forEach(row => {
      const lineIdxStr = (row as HTMLElement).getAttribute('data-line');
      const lineIdx = parseInt(lineIdxStr ?? '0', 10);
      row.addEventListener('mouseenter', () => {
        row.classList.add('hovered');
        const editorLine = this.overlayEl.querySelectorAll('.doc-typeset-line')[lineIdx];
        if (editorLine) editorLine.classList.add('hovered');
      });
      row.addEventListener('mouseleave', () => {
        row.classList.remove('hovered');
        const editorLine = this.overlayEl.querySelectorAll('.doc-typeset-line')[lineIdx];
        if (editorLine) editorLine.classList.remove('hovered');
      });
    });

    // Attach plot click handlers to focus Visual tab
    const plotButtons = this.gutterEl.querySelectorAll('.doc-plot-btn');
    plotButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const lineIdx = parseInt((btn as HTMLElement).getAttribute('data-line') ?? '0', 10);
        this.displayVisualForLine(lineIdx, true);
      });
    });

    // Row clicks also focus visual panel
    const rows = this.gutterEl.querySelectorAll('.doc-gutter-row');
    rows.forEach(row => {
      row.addEventListener('click', () => {
        const lineIdx = parseInt((row as HTMLElement).getAttribute('data-line') ?? '0', 10);
        this.displayVisualForLine(lineIdx, true);
      });
    });

    // Update active visual if unpinned or if currently in Visual tab
    this.syncVisualToCursor();

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

  public displayVisualForLine(lineIdx: number, switchTab: boolean = true) {
    this.activeVisualLine = lineIdx;
    const records = this.state.getRecords();
    let record = records[lineIdx];

    // If current line has no visual, find the nearest preceding visual or derivation
    if (!record || !record.result || (record.result.type !== 'graph' && record.result.type !== 'derivation')) {
      for (let k = lineIdx - 1; k >= 0; k--) {
        if (records[k]?.result?.type === 'graph' || records[k]?.result?.type === 'derivation') {
          record = records[k];
          break;
        }
      }
    }

    if (switchTab) {
      this.activeTab = 'visual';
      const tabButtons = this.container.querySelectorAll('.doc-tab-btn');
      tabButtons.forEach(b => {
        b.classList.toggle('active', (b as HTMLElement).getAttribute('data-tab') === 'visual');
      });
      this.container.querySelectorAll('.doc-tab-content').forEach(p => p.classList.remove('active'));
      const panel = this.container.querySelector('#tab-visual-panel');
      if (panel) panel.classList.add('active');
    }

    const titleEl = this.container.querySelector('#visual-title') as HTMLElement;
    const metaEl = this.container.querySelector('#visual-meta') as HTMLElement;
    const emptyStateEl = this.container.querySelector('#visual-empty-state') as HTMLElement;
    const canvasWrapper = this.container.querySelector('#visual-canvas-wrapper') as HTMLElement;
    const derivWrapper = this.container.querySelector('#visual-derivation-wrapper') as HTMLElement;
    const derivContent = this.container.querySelector('#visual-derivation-content') as HTMLElement;
    const canvas = this.container.querySelector('#visual-canvas') as HTMLCanvasElement;

    if (!record || !record.result || (record.result.type !== 'graph' && record.result.type !== 'derivation')) {
      if (titleEl) titleEl.textContent = 'Visual Output';
      if (metaEl) metaEl.textContent = `Line ${lineIdx + 1}: No visual content`;
      if (emptyStateEl) emptyStateEl.classList.remove('hidden');
      if (canvasWrapper) canvasWrapper.classList.add('hidden');
      if (derivWrapper) derivWrapper.classList.add('hidden');
      if (this.activePlotter) {
        this.activePlotter.dispose();
        this.activePlotter = null;
      }
      return;
    }

    if (emptyStateEl) emptyStateEl.classList.add('hidden');

    if (record.result.type === 'graph') {
      const graphVal = record.result as GraphValue;
      if (titleEl) titleEl.textContent = `Plot: ${graphVal.spec.kind}`;
      if (metaEl) metaEl.textContent = `Line ${lineIdx + 1}: ${graphVal.spec.dimensionality}D visualization`;

      if (derivWrapper) derivWrapper.classList.add('hidden');
      if (canvasWrapper) canvasWrapper.classList.remove('hidden');

      if (this.activePlotter) {
        this.activePlotter.dispose();
        this.activePlotter = null;
      }

      const spec = graphVal.spec;
      if (spec.dimensionality === 2 && (spec.surface || spec.parametric?.zExpr || spec.kind === 'surface' || spec.kind === 'pointcloud')) {
        this.activePlotter = new Surface3DPlotter(canvas, spec, {});
      } else {
        this.activePlotter = new Canvas2DPlotter(canvas, spec, {});
      }
      this.activePlotter.render();
    } else if (record.result.type === 'derivation') {
      const derivVal = record.result as DerivationValue;
      if (titleEl) titleEl.textContent = `Derivation: ${derivVal.targetVar ?? 'Expression'}`;
      if (metaEl) metaEl.textContent = `Line ${lineIdx + 1}: ${derivVal.steps.length} steps (${derivVal.verified ? 'Verified' : 'Unverified'})`;

      if (canvasWrapper) canvasWrapper.classList.add('hidden');
      if (derivWrapper) derivWrapper.classList.remove('hidden');
      if (this.activePlotter) {
        this.activePlotter.dispose();
        this.activePlotter = null;
      }

      if (derivContent) {
        derivContent.innerHTML = this.renderDerivationFull(derivVal);
      }
    }
  }

  public typesetMathReadOnly(raw: string): string {
    if (!raw) return '';
    return typesetMath(raw, { displayMode: true });
  }

  private renderDerivationFull(deriv: DerivationValue): string {
    let html = `<div class="visual-derivation-tree">`;
    html += `<div class="derivation-orig-eq">${this.typesetMathReadOnly(deriv.originalEquation)}</div>`;

    for (let i = 0; i < deriv.steps.length; i++) {
      const step = deriv.steps[i];
      const eqStr = step.after || step.equation || '';
      html += `
        <div class="derivation-step-card">
          <div class="step-card-header">
            <span class="step-num">Step ${i + 1}</span>
            <span class="step-rule-badge">${escapeHtml(step.rule)}</span>
          </div>
          <div class="step-card-eq">${this.typesetMathReadOnly(eqStr)}</div>
          <div class="step-card-just">${escapeHtml(step.justification)}</div>
          ${step.sideCondition ? `<div class="step-card-cond">${escapeHtml(step.sideCondition)}</div>` : ''}
        </div>
      `;

      if (step.branches && step.branches.length > 0) {
        html += `<div class="derivation-fork-container">`;
        for (const branch of step.branches) {
          html += `
            <div class="derivation-branch-column">
              <div class="branch-condition-header">${escapeHtml(branch.condition ?? 'Branch')}</div>
              ${branch.steps.map(bs => `
                <div class="branch-step-card">
                  <div class="branch-step-eq">${this.typesetMathReadOnly(bs.after || bs.equation || '')}</div>
                  <div class="branch-step-just">${escapeHtml(bs.justification)}</div>
                </div>
              `).join('')}
              <div class="branch-result">Root: ${this.formatValue(branch.result)}</div>
            </div>
          `;
        }
        html += `</div>`;
      }
    }

    if (deriv.roots && deriv.roots.length > 0) {
      html += `<div class="derivation-final-roots">Roots: ${deriv.roots.map(r => this.formatValue(r)).join(', ')}</div>`;
    }
    html += `</div>`;
    return html;
  }

  private addFrame(line: number, result: Value) {
    if (this.frames.some(f => f.line === line && f.type === result.type)) return;
    const summary = result.type === 'claim' ? (result as any).statement : this.formatValue(result);
    this.frames.push({
      id: this.nextFrameId++,
      line,
      type: result.type,
      summary,
      timestamp: Date.now(),
      value: result,
    });
    if (this.frames.length > 20) this.frames.shift();
  }

  private renderFrames() {
    const countEl = this.container.querySelector('#frame-count');
    if (countEl) countEl.textContent = `${this.frames.length}`;

    if (this.frames.length === 0) {
      this.framesPanelEl.innerHTML = `<div class="doc-frames-empty">No visual frames recorded</div>`;
      return;
    }

    let framesHtml = '';
    for (const frame of [...this.frames].reverse()) {
      framesHtml += `
        <div class="doc-frame-card" data-frame-id="${frame.id}">
          <div class="frame-card-header">
            <span class="frame-type">${frame.type}</span>
            <span class="frame-line">Line ${frame.line}</span>
            <span class="frame-time">${new Date(frame.timestamp).toLocaleTimeString()}</span>
          </div>
          <div class="frame-summary">${escapeHtml(frame.summary)}</div>
        </div>
      `;
    }
    this.framesPanelEl.innerHTML = framesHtml;
  }

  private formatGutterRow(rec: DocumentLineRecord): string {
    if (rec.type === 'PROSE') return '';
    if (rec.type === 'INCOMPLETE') return '<span class="doc-gutter-incomplete">...</span>';
    if (rec.type === 'ERROR') {
      return `<span class="doc-gutter-error" title="${escapeHtml(rec.error?.message ?? '')}">${ICONS.warning} ${escapeHtml(rec.error?.message ?? 'Error')}</span>`;
    }

    if (rec.result) {
      if (rec.result.type === 'graph') {
        return `<button class="doc-plot-btn" data-line="${rec.line - 1}">${ICONS.plot} View Plot (${rec.result.spec.kind})</button>`;
      }
      if (rec.result.type === 'derivation') {
        const deriv = rec.result as DerivationValue;
        return this.formatDerivationGutter(deriv);
      }
      if (rec.result.type === 'solve_trace') {
        const traceVal = rec.result as SolveTraceValue;
        return this.formatSolveTraceGutter(traceVal);
      }
      if (rec.result.type === 'claim') {
        const verified = (rec.result as any).verified;
        const kind = (rec.result as any).kind;
        return `<span class="doc-claim-badge ${verified ? 'verified' : 'unverified'}">[Claim ${kind}: ${verified ? 'Verified' : 'Unverified'}]</span>`;
      }
      return `<div class="doc-gutter-result"><span class="doc-result-value">${this.typesetMathReadOnly(this.formatValue(rec.result))}</span></div>`;
    }

    return '';
  }

  private formatDerivationGutter(deriv: DerivationValue): string {
    let html = `<div class="derivation">`;
    for (const step of deriv.steps) {
      const eqStr = step.after || step.equation || '';
      html += `
        <div class="derivation-step">
          <div class="step-main">
            <span class="step-eq">${this.typesetMathReadOnly(eqStr)}</span>
            <span class="step-rule">${escapeHtml(step.rule)}</span>
          </div>
          ${step.sideCondition ? `<div class="step-condition">${escapeHtml(step.sideCondition)}</div>` : ''}
        </div>
      `;
    }
    html += `</div>`;
    return html;
  }

  private formatSolveTraceGutter(trace: SolveTraceValue): string {
    let html = `<div class="solve-trace">`;
    html += `<div class="trace-header">${trace.method === 'newton' ? 'Newton' : 'Bisection'} (${trace.iterations.length} iters) x \u2248 ${escapeHtml(this.formatValue(trace.root))}</div>`;
    html += `<table class="trace-table"><thead><tr><th>Iter</th><th>x</th><th>f(x)</th><th>Error</th></tr></thead><tbody>`;
    for (const it of trace.iterations) {
      const xStr = it.x.toFixed(6);
      const fxStr = it.fx.toExponential(2);
      const errStr = it.error.toExponential(2);
      html += `<tr><td>${it.n}</td><td>${xStr}</td><td>${fxStr}</td><td>${errStr}</td></tr>`;
    }
    html += `</tbody></table></div>`;
    return html;
  }

  private getLineCharacterBoxes(lineEl: HTMLElement, lineStr: string): { left: number; right: number; char: string }[] {
    const surfaceRect = this.overlayEl.getBoundingClientRect();
    const padLeft = 7.0;
    const charWidth = 8.429;
    const boxes: { left: number; right: number; char: string }[] = [];

    for (let c = 0; c < lineEl.childNodes.length; c++) {
      const child = lineEl.childNodes[c];
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent || '';
        for (let i = 0; i < text.length; i++) {
          const range = document.createRange();
          range.setStart(child, i);
          range.setEnd(child, i + 1);
          const rects = range.getClientRects();
          if (rects.length > 0) {
            boxes.push({
              left: rects[0].left - surfaceRect.left + this.overlayEl.scrollLeft,
              right: rects[0].right - surfaceRect.left + this.overlayEl.scrollLeft,
              char: text[i],
            });
          } else {
            const l = padLeft + boxes.length * charWidth;
            boxes.push({ left: l, right: l + charWidth, char: text[i] });
          }
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const construct = el.getAttribute('data-construct');
        const srcLen = parseInt(el.getAttribute('data-src-len') || `${el.textContent?.length || 1}`, 10);
        const elRect = el.getBoundingClientRect();
        const elLeft = elRect.left - surfaceRect.left + this.overlayEl.scrollLeft;
        const elRight = elRect.right - surfaceRect.left + this.overlayEl.scrollLeft;

        if (construct === 'sup' || construct === 'sub') {
          const opSpan = el.querySelector('.typeset-op') as HTMLElement;
          const innerSpan = el.querySelector('.typeset-sup, .typeset-sub') as HTMLElement;
          const innerTextNode = innerSpan?.firstChild;
          const innerText = innerTextNode?.textContent || '';

          const opRect = opSpan ? opSpan.getBoundingClientRect() : elRect;
          const opLeft = opRect.left - surfaceRect.left + this.overlayEl.scrollLeft;
          const opRight = opRect.right - surfaceRect.left + this.overlayEl.scrollLeft;

          const innerRect = innerSpan ? innerSpan.getBoundingClientRect() : elRect;
          const innerLeft = innerRect.left - surfaceRect.left + this.overlayEl.scrollLeft;
          const innerRight = innerRect.right - surfaceRect.left + this.overlayEl.scrollLeft;

          // 1. Operator character (^ or _) has non-zero width from opLeft to opRight / innerLeft
          boxes.push({
            left: opLeft,
            right: opRight > opLeft ? opRight : innerLeft,
            char: lineStr[boxes.length] || '^',
          });

          // 2. Characters inside inner span
          if (innerTextNode && innerTextNode.nodeType === Node.TEXT_NODE) {
            for (let i = 0; i < innerText.length; i++) {
              const range = document.createRange();
              range.setStart(innerTextNode, i);
              range.setEnd(innerTextNode, i + 1);
              const rects = range.getClientRects();
              if (rects.length > 0) {
                boxes.push({
                  left: rects[0].left - surfaceRect.left + this.overlayEl.scrollLeft,
                  right: rects[0].right - surfaceRect.left + this.overlayEl.scrollLeft,
                  char: innerText[i],
                });
              } else {
                const subCharW = (innerRight - innerLeft) / Math.max(1, innerText.length);
                const l = innerLeft + i * subCharW;
                boxes.push({ left: l, right: l + subCharW, char: innerText[i] });
              }
            }
          }
        } else {
          // Plain inline construct (e.g. // or d//dx)
          const text = el.textContent || '';
          const textNode = el.firstChild;
          if (textNode && textNode.nodeType === Node.TEXT_NODE) {
            for (let i = 0; i < text.length; i++) {
              const range = document.createRange();
              range.setStart(textNode, i);
              range.setEnd(textNode, i + 1);
              const rects = range.getClientRects();
              if (rects.length > 0) {
                boxes.push({
                  left: rects[0].left - surfaceRect.left + this.overlayEl.scrollLeft,
                  right: rects[0].right - surfaceRect.left + this.overlayEl.scrollLeft,
                  char: text[i],
                });
              } else {
                const l = elLeft + (i / text.length) * (elRight - elLeft);
                const r = elLeft + ((i + 1) / text.length) * (elRight - elLeft);
                boxes.push({ left: l, right: r, char: text[i] });
              }
            }
          } else {
            for (let i = 0; i < srcLen; i++) {
              const l = elLeft + (i / srcLen) * (elRight - elLeft);
              const r = elLeft + ((i + 1) / srcLen) * (elRight - elLeft);
              boxes.push({ left: l, right: r, char: lineStr[boxes.length] || ' ' });
            }
          }
        }
      }
    }

    return boxes;
  }

  private updateCaret() {
    if (!this.caretEl || !this.overlayEl) return;

    if (document.activeElement !== this.textarea) {
      this.caretEl.style.display = 'none';
      return;
    }

    const pos = this.textarea.selectionDirection === 'backward'
      ? this.textarea.selectionStart
      : this.textarea.selectionEnd;

    const text = this.textarea.value;
    const textBefore = text.substring(0, pos);
    const lines = textBefore.split('\n');
    const lineIdx = lines.length - 1;
    const colIdx = lines[lineIdx].length;

    const allLines = text.split('\n');
    const lineStr = allLines[lineIdx] || '';

    const lineEls = this.overlayEl.querySelectorAll('.doc-typeset-line');
    const lineEl = lineEls[lineIdx] as HTMLElement;
    if (!lineEl) {
      this.caretEl.style.display = 'none';
      return;
    }

    const surfaceRect = this.overlayEl.getBoundingClientRect();
    const lineRect = lineEl.getBoundingClientRect();
    const charBoxes = this.getLineCharacterBoxes(lineEl, lineStr);

    let caretX = 0;
    let caretY = lineRect.top - surfaceRect.top + this.overlayEl.scrollTop;
    let caretH = 20;

    if (colIdx === 0) {
      caretX = charBoxes.length > 0 ? charBoxes[0].left : (lineRect.left - surfaceRect.left + this.overlayEl.scrollLeft);
    } else if (colIdx < charBoxes.length) {
      caretX = charBoxes[colIdx].left;
    } else if (charBoxes.length > 0) {
      caretX = charBoxes[charBoxes.length - 1].right;
    } else {
      caretX = lineRect.left - surfaceRect.left + this.overlayEl.scrollLeft + colIdx * 8.429;
    }

    this.caretEl.style.display = 'block';
    this.caretEl.style.left = `${caretX}px`;
    this.caretEl.style.top = `${caretY}px`;
    this.caretEl.style.height = `${Math.max(16, caretH)}px`;

    // Reset blink animation
    this.caretEl.classList.remove('blink');
    void this.caretEl.offsetWidth;
    this.caretEl.classList.add('blink');
  }

  private updateTypesetOverlay() {
    if (!this.overlayEl) return;
    const lines = this.textarea.value.split('\n');
    const html = lines.map(line => `<div class="doc-typeset-line">${this.typesetLine(line)}</div>`).join('');
    this.overlayEl.innerHTML = html;
  }

  private typesetLine(rawLine: string): string {
    if (!rawLine) return '<br>';

    try {
      // Check for comment starting with #
      const commentIdx = rawLine.indexOf('#');
      if (commentIdx !== -1) {
        const codePart = rawLine.substring(0, commentIdx);
        const commentPart = rawLine.substring(commentIdx);
        return (codePart ? this.typesetCode(codePart) : '') + `<span class="tok-comment">${escapeHtml(commentPart)}</span>`;
      }

      return this.typesetCode(rawLine);
    } catch (_err) {
      // Per-line fallback to plain monospace on error
      return `<span class="typeset-fallback">${escapeHtml(rawLine)}</span>`;
    }
  }

  private typesetCode(code: string): string {
    // Matches ONLY the 4 typeset constructs in SPEC 5.4 plus incomplete tokens:
    // 1. Reserved differential operators: d//dx, \u2202//\u2202x, d//dth (inline in editor)
    // 2. Fraction operator: // (inline in editor)
    // 3. Superscripts: ^(n+1), ^2, ^n, or trailing ^
    // 4. Subscripts: _(i+1), _1, _n, or trailing _
    const tokenRegex = /((?:d|\u2202)\/\/(?:d|\u2202)[a-zA-Z_][a-zA-Z0-9_]*)|(\/\/)|(\^(?:\([^\)]+\)|[a-zA-Z0-9]+))|(\^)|(_(?:\([^\)]+\)|[a-zA-Z0-9]+))|(_)|([^d\u2202\/^_#]+|.)/g;

    return code.replace(tokenRegex, (match, diffOp, fracOp, sup, trailingSup, sub, trailingSub, plain) => {
      if (diffOp) {
        return `<span class="typeset-box typeset-diff-inline" data-construct="diff">${escapeHtml(diffOp)}</span>`;
      }
      if (fracOp) {
        return `<span class="typeset-box typeset-frac-inline" data-construct="frac">//</span>`;
      }
      if (sup) {
        const exp = sup.slice(1);
        return `<span class="typeset-box typeset-sup-box" data-construct="sup"><span class="typeset-op typeset-op-sup">^</span><span class="typeset-sup">${escapeHtml(exp)}</span></span>`;
      }
      if (trailingSup) {
        return `<span class="typeset-box typeset-sup-box typeset-incomplete" data-construct="sup"><span class="typeset-sup dimmed">^</span></span>`;
      }
      if (sub) {
        const subText = sub.slice(1);
        return `<span class="typeset-box typeset-sub-box" data-construct="sub"><span class="typeset-op typeset-op-sub">_</span><span class="typeset-sub">${escapeHtml(subText)}</span></span>`;
      }
      if (trailingSub) {
        return `<span class="typeset-box typeset-sub-box typeset-incomplete" data-construct="sub"><span class="typeset-sub dimmed">_</span></span>`;
      }
      return escapeHtml(plain || match);
    });
  }

  public formatValue(val: Value): string {
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
        return `${val.method === 'newton' ? "Newton's" : 'Bisection'} root \u2248 ${this.formatValue(val.root)} (${val.iterations.length} iterations)`;
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
      case 'expression':
        return val.text;
      default:
        return String((val as any).value ?? val.type);
    }
  }

  public dispose() {
    if (this.activePlotter) {
      this.activePlotter.dispose();
      this.activePlotter = null;
    }
    this.mathPopover.dispose();
    this.state.dispose();
  }
}
