import { DocumentState, DocumentLineRecord } from './document_state';
import { CORPUS_DOCUMENTS } from './corpus_data';
import { Value, GraphValue, DerivationValue, SolveTraceValue, DescribedValue, TrajectoryValue } from '../core/types';
import { Canvas2DPlotter } from '../plot/canvas2d';
import { Surface3DPlotter } from '../plot/surface3d';
import { AnimationPlayer } from '../plot/animation_player';
import { typesetMath } from '../core/math_typeset';
import { explainSymbol } from '../core/explainer';
import { analyzeAndParse, createInitialEnvironment, evaluate, Evaluator } from '../core/evaluator';
import { formatAST } from '../core/formatter';
import { valueToNumber } from '../core/numeric/tower';
import { formatKind } from '../core/kinds';
import { MathPopover } from './popover';
import { ICONS } from '../styles/icons';
import { FileManager, OpenFileResult, SaveFileResult } from './file_manager';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export type DockEdge = 'right' | 'left' | 'bottom' | 'top';

export interface DockLayoutState {
  edge: DockEdge;
  width: number;
  height: number;
  collapsed: boolean;
  edgeSizes: {
    right: number;
    left: number;
    bottom: number;
    top: number;
  };
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
  private framesPanelEl!: HTMLElement;
  private statusBadge!: HTMLElement;
  private statsBadge!: HTMLElement;
  private workspaceEl!: HTMLElement;
  private panelEl!: HTMLElement;
  private edgeAffordanceEl!: HTMLElement;
  private fileNameEl!: HTMLElement;
  private dirtyBadgeEl!: HTMLElement;

  private currentFileName: string = 'untitled.ax';
  private currentFileHandle?: FileSystemFileHandle;
  private savedContent: string = '';
  private isDirty: boolean = false;
  private autosaveDebounceTimer: any = null;

  private dockLayout: DockLayoutState = {
    edge: 'right',
    width: 480,
    height: 300,
    collapsed: false,
    edgeSizes: {
      right: 480,
      left: 480,
      bottom: 300,
      top: 300,
    },
  };

  private activeTab: 'results' | 'scope' | 'trace' | 'frames' = 'results';
  private frames: { id: number; line: number; type: string; summary: string; timestamp: number; value: Value }[] = [];
  private nextFrameId: number = 0;
  private pinnedLines: Set<number> = new Set();
  private collapsedLines: Set<number> = new Set();
  private expandedPlots: Set<number> = new Set();
  private linePlotters: Map<number, Canvas2DPlotter | Surface3DPlotter> = new Map();
  private pinnedPlotters: Map<number, Canvas2DPlotter | Surface3DPlotter> = new Map();
  private animationPlayers: Map<number, AnimationPlayer> = new Map();
  private pinnedAnimationPlayers: Map<number, AnimationPlayer> = new Map();
  public mathPopover: MathPopover;

  constructor(container: HTMLElement, initialText?: string) {
    this.container = container;
    const docText = initialText ?? (CORPUS_DOCUMENTS[0]?.content || '');
    this.currentFileName = initialText !== undefined ? 'untitled.ax' : (CORPUS_DOCUMENTS[0]?.id ? `${CORPUS_DOCUMENTS[0].id}.ax` : 'untitled.ax');
    this.savedContent = docText;
    this.isDirty = false;
    this.state = new DocumentState(docText);
    this.mathPopover = new MathPopover();
    this.loadDockLayout();
    this.buildUI(docText);
    this.applyDockLayout();
    this.bindEvents();
    this.state.subscribe((records, isEvaluating) => this.renderWorkPanel(records, isEvaluating));
    this.state.setText(docText);
  }

  private loadDockLayout() {
    try {
      const saved = localStorage.getItem('doc_dock_layout');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          if (['right', 'left', 'bottom', 'top'].includes(parsed.edge)) {
            this.dockLayout.edge = parsed.edge;
          }
          if (typeof parsed.collapsed === 'boolean') {
            this.dockLayout.collapsed = parsed.collapsed;
          }
          if (parsed.edgeSizes && typeof parsed.edgeSizes === 'object') {
            this.dockLayout.edgeSizes = {
              right: parsed.edgeSizes.right || 480,
              left: parsed.edgeSizes.left || 480,
              bottom: parsed.edgeSizes.bottom || 300,
              top: parsed.edgeSizes.top || 300,
            };
          }
        }
      } else {
        const oldWidth = localStorage.getItem('doc_panel_width');
        if (oldWidth) {
          const num = parseInt(oldWidth, 10);
          if (!isNaN(num) && num > 100) {
            this.dockLayout.edgeSizes.right = num;
            this.dockLayout.edgeSizes.left = num;
          }
        }
      }
    } catch {
      // Ignore parse errors
    }

    try {
      const savedCollapsed = localStorage.getItem('doc_collapsed_lines');
      if (savedCollapsed) {
        const arr = JSON.parse(savedCollapsed);
        if (Array.isArray(arr)) {
          this.collapsedLines = new Set(arr);
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  private saveDockLayout() {
    try {
      localStorage.setItem('doc_dock_layout', JSON.stringify(this.dockLayout));
    } catch {
      // Ignore
    }
  }

  private saveCollapsedLines() {
    try {
      localStorage.setItem('doc_collapsed_lines', JSON.stringify(Array.from(this.collapsedLines)));
    } catch {
      // Ignore
    }
  }

  public applyDockLayout() {
    if (!this.workspaceEl || !this.panelEl) return;
    this.workspaceEl.setAttribute('data-dock', this.dockLayout.edge);
    this.workspaceEl.classList.toggle('panel-collapsed', this.dockLayout.collapsed);

    // Update dock buttons
    const dockBtns = this.container.querySelectorAll('.doc-dock-btn');
    dockBtns.forEach(btn => {
      const edge = (btn as HTMLElement).getAttribute('data-edge');
      btn.classList.toggle('active', edge === this.dockLayout.edge);
    });

    const collapseBtn = this.container.querySelector('.doc-dock-collapse-btn');
    if (collapseBtn) {
      collapseBtn.textContent = this.dockLayout.collapsed ? 'Show' : 'Hide';
    }

    if (this.dockLayout.collapsed) {
      this.panelEl.style.width = '0px';
      this.panelEl.style.height = '0px';
      this.panelEl.style.display = 'none';
    } else {
      this.panelEl.style.display = 'flex';
      const edge = this.dockLayout.edge;
      if (edge === 'right' || edge === 'left') {
        const w = this.dockLayout.edgeSizes[edge] || 480;
        this.panelEl.style.width = `${w}px`;
        this.panelEl.style.height = '100%';
      } else {
        const h = this.dockLayout.edgeSizes[edge] || 300;
        this.panelEl.style.width = '100%';
        this.panelEl.style.height = `${h}px`;
      }
    }

    // Trigger plotter re-renders so canvas widths match
    this.linePlotters.forEach(p => p.render());
    this.pinnedPlotters.forEach(p => p.render());
    this.updateCaret();
  }

  public setDockEdge(edge: DockEdge) {
    this.dockLayout.edge = edge;
    this.saveDockLayout();
    this.applyDockLayout();
  }

  public togglePanelCollapse() {
    this.dockLayout.collapsed = !this.dockLayout.collapsed;
    this.saveDockLayout();
    this.applyDockLayout();
  }

  public cycleDockEdge() {
    const cycle: DockEdge[] = ['right', 'bottom', 'left', 'top'];
    const currentIdx = cycle.indexOf(this.dockLayout.edge);
    const nextEdge = cycle[(currentIdx + 1) % cycle.length];
    this.setDockEdge(nextEdge);
  }

  public setText(text: string): void {
    if (this.textarea) {
      this.textarea.value = text;
      this.updateTypesetOverlay();
      this.updateCaret();
      this.state.setText(text);
    }
  }

  public getDocumentName(): string {
    return this.currentFileName;
  }

  public setDocumentName(name: string): void {
    this.currentFileName = name;
    this.updateFileInfo();
  }

  public getIsDirty(): boolean {
    return this.isDirty;
  }

  public confirmDiscardChanges(): boolean {
    if (!this.isDirty) return true;
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      return window.confirm(`You have unsaved changes in "${this.currentFileName}". Discard them?`);
    }
    return true;
  }

  public async openDocument(): Promise<OpenFileResult | null> {
    if (!this.confirmDiscardChanges()) return null;
    const res = await FileManager.openFile();
    if (!res) return null;
    this.currentFileName = res.name;
    this.currentFileHandle = res.handle;
    this.savedContent = res.recovered ? '' : res.content;
    this.isDirty = res.isDirty;
    this.setText(res.content);
    this.updateFileInfo();
    this.updateRecentFilesMenu();
    return res;
  }

  public async saveDocument(): Promise<SaveFileResult> {
    const text = this.textarea ? this.textarea.value : this.savedContent;
    const res = await FileManager.saveFile(this.currentFileName, text, this.currentFileHandle);
    if (res.success) {
      this.currentFileName = res.name;
      this.currentFileHandle = res.handle;
      this.savedContent = text;
      this.isDirty = false;
      this.updateFileInfo();
      this.updateRecentFilesMenu();
    }
    return res;
  }

  public async saveDocumentAs(): Promise<SaveFileResult> {
    const text = this.textarea ? this.textarea.value : this.savedContent;
    const res = await FileManager.saveFileAs(this.currentFileName, text);
    if (res.success) {
      this.currentFileName = res.name;
      this.currentFileHandle = res.handle;
      this.savedContent = text;
      this.isDirty = false;
      this.updateFileInfo();
      this.updateRecentFilesMenu();
    }
    return res;
  }

  public newDocument(): void {
    if (!this.confirmDiscardChanges()) return;
    this.currentFileName = 'untitled.ax';
    this.currentFileHandle = undefined;
    this.savedContent = '';
    this.isDirty = false;
    this.setText('');
    this.updateFileInfo();
  }

  public updateDirtyIndicator(): void {
    if (this.dirtyBadgeEl) {
      this.dirtyBadgeEl.classList.toggle('hidden', !this.isDirty);
    }
    if (typeof document !== 'undefined') {
      document.title = `${this.isDirty ? '* ' : ''}${this.currentFileName} - Axine`;
    }
  }

  public updateFileInfo(): void {
    if (this.fileNameEl) {
      this.fileNameEl.textContent = this.currentFileName;
    }
    this.updateDirtyIndicator();
  }

  private scheduleAutosave(): void {
    if (this.autosaveDebounceTimer) {
      clearTimeout(this.autosaveDebounceTimer);
    }
    this.autosaveDebounceTimer = setTimeout(() => {
      if (this.textarea) {
        FileManager.saveAutosave(this.currentFileName, this.textarea.value);
      }
    }, 1000);
  }

  private updateRecentFilesMenu(): void {
    const listEl = this.container.querySelector('#doc-recent-files-list');
    if (!listEl) return;
    const recents = FileManager.getRecentFiles();
    if (recents.length === 0) {
      listEl.innerHTML = '<div style="font-size:11px; color:var(--color-text-tertiary); padding:4px 8px;">(No recent files)</div>';
      return;
    }
    listEl.innerHTML = recents.map(r => `
      <button class="doc-file-menu-item doc-recent-file-btn" data-name="${escapeHtml(r.name)}" title="Last opened: ${new Date(r.lastOpened).toLocaleString()}">
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:140px;">${escapeHtml(r.name)}</span>
        <span style="font-size:10px; color:var(--color-text-tertiary);">${new Date(r.lastOpened).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </button>
    `).join('');

    const recentBtns = listEl.querySelectorAll('.doc-recent-file-btn');
    recentBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const name = (btn as HTMLElement).getAttribute('data-name');
        if (name) {
          const dropdown = this.container.querySelector('#doc-file-dropdown');
          dropdown?.classList.add('hidden');
          const autosave = FileManager.getAutosave(name);
          if (autosave) {
            if (!this.confirmDiscardChanges()) return;
            this.currentFileName = autosave.fileName;
            this.savedContent = autosave.content;
            this.isDirty = false;
            this.setText(autosave.content);
            this.updateFileInfo();
          } else {
            this.openDocument();
          }
        }
      });
    });
  }

  private buildUI(initialText?: string) {
    const rawText = initialText ?? (CORPUS_DOCUMENTS[0]?.content || '');
    this.container.innerHTML = `
      <div class="doc-app-shell">
        <header class="doc-header">
          <div class="doc-brand">
            <span class="doc-logo">&int;dx</span>
            <span class="doc-app-title">Axine</span>
          </div>

          <div class="doc-file-menu-wrapper">
            <button id="doc-file-menu-btn" class="doc-btn" title="File Menu (New, Open, Save)">
              File
              <svg width="8" height="8" viewBox="0 0 12 12" fill="currentColor"><path d="M2 4L6 8L10 4Z" /></svg>
            </button>
            <div id="doc-file-dropdown" class="doc-file-dropdown hidden">
              <button id="doc-new-file-btn" class="doc-file-menu-item">
                <span>New File</span>
              </button>
              <button id="doc-open-file-btn" class="doc-file-menu-item">
                <span>Open...</span>
                <span class="doc-file-menu-shortcut">Cmd+O</span>
              </button>
              <button id="doc-save-file-btn" class="doc-file-menu-item">
                <span>Save</span>
                <span class="doc-file-menu-shortcut">Cmd+S</span>
              </button>
              <button id="doc-save-as-file-btn" class="doc-file-menu-item">
                <span>Save As...</span>
                <span class="doc-file-menu-shortcut">Shift+Cmd+S</span>
              </button>
              <div class="doc-file-menu-divider"></div>
              <div class="doc-file-menu-section-title">Recent Files</div>
              <div id="doc-recent-files-list"></div>
            </div>
          </div>

          <div class="doc-file-info" title="Current document">
            <span id="doc-file-name" class="doc-file-name">${escapeHtml(this.currentFileName)}</span>
            <span id="doc-dirty-badge" class="doc-dirty-badge ${this.isDirty ? '' : 'hidden'}" title="Unsaved changes"><span class="doc-dirty-dot"></span></span>
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
            <button id="doc-run-btn" class="doc-btn doc-btn-primary" title="Execute current document (Cmd+Enter / Ctrl+Enter)">
              ${ICONS.run} Run
            </button>
            <button id="doc-stop-btn" class="doc-btn doc-btn-danger hidden" title="Cancel background execution">
              ${ICONS.stop} Stop
            </button>
            <button id="doc-clear-btn" class="doc-btn" title="Clear document text">Clear</button>
          </div>
          <div class="doc-toolbar-right">
            <span id="doc-stats-badge" class="doc-stats-badge">Ready</span>
            <span id="doc-status-badge" class="doc-status-badge ambient">Ambient Reactive</span>
            <button id="doc-theme-btn" class="doc-btn doc-btn-icon" title="Toggle dark/light theme">
              ${ICONS.sun}
            </button>
          </div>
        </header>

        <main id="doc-workspace" class="doc-workspace" data-dock="right">
          <div class="doc-pane-left">
            <div id="doc-line-numbers" class="doc-line-numbers"></div>
            <div class="doc-editor-surface">
              <div id="doc-typeset-overlay" class="doc-typeset-overlay"></div>
              <div id="doc-caret" class="doc-caret"></div>
              <textarea
                id="doc-textarea"
                class="doc-textarea"
                placeholder="Write math expressions, definitions (x := 5), claims, or prose..."
                spellcheck="false"
                autocomplete="off"
                autocapitalize="off"
              >${escapeHtml(rawText)}</textarea>
            </div>
          </div>

          <div id="doc-splitter" class="doc-splitter" title="Drag to resize panel"></div>

          <div id="doc-panel-edge-affordance" class="doc-panel-edge-affordance" title="Click to show panel (Cmd+B)"></div>

          <div id="doc-work-panel" class="doc-work-panel">
            <div class="doc-work-panel-header">
              <div class="doc-work-panel-tabs">
                <button class="doc-tab-btn active" data-tab="results">Results</button>
                <button class="doc-tab-btn" data-tab="scope">Scope</button>
                <button class="doc-tab-btn" data-tab="trace">Trace & Fuel</button>
                <button class="doc-tab-btn" data-tab="frames">Frames</button>
              </div>
              <div class="doc-dock-menu-wrapper">
                <button id="doc-dock-menu-btn" class="doc-dock-menu-btn" title="Dock & Layout Options (Cmd+Shift+D)">
                  <svg class="doc-dock-menu-icon" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="2" y="2" width="12" height="12" rx="1.5" />
                    <line x1="9" y1="2" x2="9" y2="14" />
                  </svg>
                  <svg class="doc-dock-menu-caret" width="9" height="9" viewBox="0 0 12 12" fill="currentColor">
                    <path d="M2 4L6 8L10 4Z" />
                  </svg>
                </button>
                <div id="doc-dock-dropdown" class="doc-dock-dropdown hidden">
                  <button class="doc-dock-btn" data-edge="left" title="Dock Left">
                    <svg class="doc-dock-btn-icon" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1" /><rect x="2" y="2" width="5" height="12" fill="currentColor" opacity="0.6" /></svg>
                    Dock Left
                  </button>
                  <button class="doc-dock-btn" data-edge="bottom" title="Dock Bottom">
                    <svg class="doc-dock-btn-icon" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1" /><rect x="2" y="9" width="12" height="5" fill="currentColor" opacity="0.6" /></svg>
                    Dock Bottom
                  </button>
                  <button class="doc-dock-btn" data-edge="top" title="Dock Top">
                    <svg class="doc-dock-btn-icon" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1" /><rect x="2" y="2" width="12" height="5" fill="currentColor" opacity="0.6" /></svg>
                    Dock Top
                  </button>
                  <button class="doc-dock-btn active" data-edge="right" title="Dock Right">
                    <svg class="doc-dock-btn-icon" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="12" height="12" rx="1" /><rect x="9" y="2" width="5" height="12" fill="currentColor" opacity="0.6" /></svg>
                    Dock Right
                  </button>
                  <div class="doc-dock-menu-divider"></div>
                  <button class="doc-dock-collapse-btn" title="Toggle panel collapse (Cmd+B)">Hide Panel</button>
                </div>
              </div>
            </div>

            <div id="tab-results-panel" class="doc-tab-content active">
              <div id="doc-pinned-visuals" class="doc-pinned-visuals empty"></div>
              <div id="doc-gutter" class="doc-gutter"></div>
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

    this.workspaceEl = this.container.querySelector('#doc-workspace') as HTMLElement;
    this.panelEl = this.container.querySelector('#doc-work-panel') as HTMLElement;
    this.edgeAffordanceEl = this.container.querySelector('#doc-panel-edge-affordance') as HTMLElement;
    this.textarea = this.container.querySelector('#doc-textarea') as HTMLTextAreaElement;
    this.textarea.value = rawText;
    this.overlayEl = this.container.querySelector('#doc-typeset-overlay') as HTMLElement;
    this.caretEl = this.container.querySelector('#doc-caret') as HTMLElement;
    this.lineNumbersEl = this.container.querySelector('#doc-line-numbers') as HTMLElement;
    this.gutterEl = this.container.querySelector('#doc-gutter') as HTMLElement;
    this.statusBadge = this.container.querySelector('#doc-status-badge') as HTMLElement;
    this.statsBadge = this.container.querySelector('#doc-stats-badge') as HTMLElement;
    this.scopePanelEl = this.container.querySelector('#doc-scope-list') as HTMLElement;
    this.framesPanelEl = this.container.querySelector('#doc-frames-list') as HTMLElement;
    this.fileNameEl = this.container.querySelector('#doc-file-name') as HTMLElement;
    this.dirtyBadgeEl = this.container.querySelector('#doc-dirty-badge') as HTMLElement;

    this.updateTypesetOverlay();
    this.updateCaret();
    this.updateFileInfo();
  }

  private bindEvents() {
    this.textarea.addEventListener('input', () => {
      this.updateTypesetOverlay();
      this.updateCaret();
      this.isDirty = this.textarea.value !== this.savedContent;
      this.updateDirtyIndicator();
      this.scheduleAutosave();
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
        this.isDirty = this.textarea.value !== this.savedContent;
        this.updateDirtyIndicator();
        this.scheduleAutosave();
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

    // File Menu dropdown toggle
    const fileMenuBtn = this.container.querySelector('#doc-file-menu-btn');
    const fileDropdown = this.container.querySelector('#doc-file-dropdown');
    if (fileMenuBtn && fileDropdown) {
      fileMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.updateRecentFilesMenu();
        fileDropdown.classList.toggle('hidden');
      });
      document.addEventListener('click', (e) => {
        if (!fileDropdown.contains(e.target as Node) && e.target !== fileMenuBtn) {
          fileDropdown.classList.add('hidden');
        }
      });
    }

    const newBtn = this.container.querySelector('#doc-new-file-btn');
    newBtn?.addEventListener('click', () => {
      fileDropdown?.classList.add('hidden');
      this.newDocument();
    });

    const openBtn = this.container.querySelector('#doc-open-file-btn');
    openBtn?.addEventListener('click', () => {
      fileDropdown?.classList.add('hidden');
      this.openDocument();
    });

    const saveBtn = this.container.querySelector('#doc-save-file-btn');
    saveBtn?.addEventListener('click', () => {
      fileDropdown?.classList.add('hidden');
      this.saveDocument();
    });

    const saveAsBtn = this.container.querySelector('#doc-save-as-file-btn');
    saveAsBtn?.addEventListener('click', () => {
      fileDropdown?.classList.add('hidden');
      this.saveDocumentAs();
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

    // Dock Menu dropdown toggle
    const dockMenuBtn = this.container.querySelector('#doc-dock-menu-btn');
    const dockDropdown = this.container.querySelector('#doc-dock-dropdown');
    if (dockMenuBtn && dockDropdown) {
      dockMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dockDropdown.classList.toggle('hidden');
      });
      document.addEventListener('click', (e) => {
        if (!dockDropdown.contains(e.target as Node) && e.target !== dockMenuBtn) {
          dockDropdown.classList.add('hidden');
        }
      });
    }

    // Dock Buttons in panel header dropdown
    const dockBtns = this.container.querySelectorAll('.doc-dock-btn');
    dockBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const edge = (btn as HTMLElement).getAttribute('data-edge') as DockEdge;
        if (edge) {
          this.setDockEdge(edge);
          dockDropdown?.classList.add('hidden');
        }
      });
    });

    // Collapse button in panel header dropdown
    const collapseBtn = this.container.querySelector('.doc-dock-collapse-btn');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => {
        this.togglePanelCollapse();
        dockDropdown?.classList.add('hidden');
      });
    }

    // Edge affordance click to restore
    if (this.edgeAffordanceEl) {
      this.edgeAffordanceEl.addEventListener('click', () => {
        this.togglePanelCollapse();
      });
    }

    // Global keyboard shortcuts
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      // Cmd+O / Ctrl+O : Open File
      if ((e.key === 'o' || e.key === 'O') && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        this.openDocument();
      }
      // Cmd+S / Ctrl+S : Save File
      if ((e.key === 's' || e.key === 'S') && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        this.saveDocument();
      }
      // Cmd+Shift+S / Ctrl+Shift+S : Save As File
      if ((e.key === 's' || e.key === 'S') && ((e.metaKey && e.shiftKey) || (e.ctrlKey && e.shiftKey))) {
        e.preventDefault();
        this.saveDocumentAs();
      }
      // Cmd+B / Ctrl+B / Cmd+\ / Ctrl+\ : Toggle collapse
      if ((e.key === 'b' || e.key === 'B' || e.key === '\\') && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        this.togglePanelCollapse();
      }
      // Cmd+Shift+D / Ctrl+Shift+D / Alt+D : Cycle dock edge
      if ((e.key === 'd' || e.key === 'D') && ((e.metaKey && e.shiftKey) || (e.ctrlKey && e.shiftKey) || e.altKey)) {
        e.preventDefault();
        this.cycleDockEdge();
      }
    });

    window.addEventListener('beforeunload', (e: BeforeUnloadEvent) => {
      if (this.isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    // Corpus selector
    const selectEl = this.container.querySelector('#corpus-select') as HTMLSelectElement;
    selectEl?.addEventListener('change', () => {
      const doc = CORPUS_DOCUMENTS.find(d => d.id === selectEl.value);
      if (doc) {
        if (!this.confirmDiscardChanges()) {
          // Restore previous select value
          const prevDoc = CORPUS_DOCUMENTS.find(d => `${d.id}.ax` === this.currentFileName || d.id === this.currentFileName);
          if (prevDoc) selectEl.value = prevDoc.id;
          return;
        }
        this.currentFileName = `${doc.id}.ax`;
        this.currentFileHandle = undefined;
        this.savedContent = doc.content;
        this.isDirty = false;
        this.setText(doc.content);
        this.updateFileInfo();
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
      this.linePlotters.forEach(p => p.render());
      this.pinnedPlotters.forEach(p => p.render());
    });

    // Multi-edge Draggable Splitter
    const splitter = this.container.querySelector('#doc-splitter') as HTMLElement;
    let isDragging = false;

    splitter.addEventListener('mousedown', () => {
      isDragging = true;
      const isHorizontal = this.dockLayout.edge === 'bottom' || this.dockLayout.edge === 'top';
      document.body.style.cursor = isHorizontal ? 'row-resize' : 'col-resize';
      document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging || !this.workspaceEl) return;
      const containerRect = this.workspaceEl.getBoundingClientRect();
      const edge = this.dockLayout.edge;

      if (edge === 'right') {
        const newWidth = containerRect.right - e.clientX;
        if (newWidth < 40) {
          this.dockLayout.collapsed = true;
          this.applyDockLayout();
          return;
        }
        this.dockLayout.collapsed = false;
        const clampedWidth = Math.max(200, Math.min(containerRect.width * 0.7, newWidth));
        this.dockLayout.edgeSizes.right = clampedWidth;
        this.panelEl.style.width = `${clampedWidth}px`;
      } else if (edge === 'left') {
        const newWidth = e.clientX - containerRect.left;
        if (newWidth < 40) {
          this.dockLayout.collapsed = true;
          this.applyDockLayout();
          return;
        }
        this.dockLayout.collapsed = false;
        const clampedWidth = Math.max(200, Math.min(containerRect.width * 0.7, newWidth));
        this.dockLayout.edgeSizes.left = clampedWidth;
        this.panelEl.style.width = `${clampedWidth}px`;
      } else if (edge === 'bottom') {
        const newHeight = containerRect.bottom - e.clientY;
        if (newHeight < 40) {
          this.dockLayout.collapsed = true;
          this.applyDockLayout();
          return;
        }
        this.dockLayout.collapsed = false;
        const clampedHeight = Math.max(150, Math.min(containerRect.height * 0.7, newHeight));
        this.dockLayout.edgeSizes.bottom = clampedHeight;
        this.panelEl.style.height = `${clampedHeight}px`;
      } else if (edge === 'top') {
        const newHeight = e.clientY - containerRect.top;
        if (newHeight < 40) {
          this.dockLayout.collapsed = true;
          this.applyDockLayout();
          return;
        }
        this.dockLayout.collapsed = false;
        const clampedHeight = Math.max(150, Math.min(containerRect.height * 0.7, newHeight));
        this.dockLayout.edgeSizes.top = clampedHeight;
        this.panelEl.style.height = `${clampedHeight}px`;
      }
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        this.saveDockLayout();
        this.applyDockLayout();
      }
    });

    // Cursor synchronization
    this.textarea.addEventListener('keyup', () => this.updateCaret());
    this.textarea.addEventListener('click', () => this.updateCaret());
    document.addEventListener('selectionchange', () => {
      if (document.activeElement === this.textarea) {
        this.updateCaret();
      }
    });

    // Explainable Math Click Handler on Editor Surface
    this.overlayEl.addEventListener('click', (e) => {
      const clickTarget = e.target as HTMLElement;
      const lineEl = clickTarget.closest('.doc-typeset-line') as HTMLElement;
      if (!lineEl) return;

      const lines = this.textarea.value.split('\n');
      const lineIdx = Array.from(this.overlayEl.querySelectorAll('.doc-typeset-line')).indexOf(lineEl);
      if (lineIdx === -1) return;

      const lineText = lines[lineIdx]?.trim() || '';
      if (!lineText) return;

      const clickableEl = (clickTarget.closest('.tm-clickable') as HTMLElement) || null;
      const constructEl = clickableEl || (clickTarget.closest('.typeset-box') as HTMLElement) || lineEl;

      let symbol = clickableEl?.dataset.symbol || 'dx';
      let parentType = clickableEl?.dataset.parentType || '';
      let varName = clickableEl?.dataset.var || 'x';
      let integrand = clickableEl?.dataset.integrand || '';
      let boundsLower: string | undefined = clickableEl?.dataset.boundsLower;
      let boundsUpper: string | undefined = clickableEl?.dataset.boundsUpper;
      let point: number | undefined = clickableEl?.dataset.point ? parseFloat(clickableEl.dataset.point) : undefined;
      let targetLimit: number | undefined;

      try {
        const env = createInitialEnvironment();
        const ast = analyzeAndParse(lineText, env);

        // 1. BigOp integral: \u222b x^2 dx or integral(3*x + 1, x in 1..3)
        if (ast.type === 'BigOp' && ast.op === 'integral') {
          parentType = parentType || 'integral';
          varName = ast.variable;
          symbol = symbol || `d${varName}`;
          integrand = formatAST(ast.body);
          if (ast.start) boundsLower = formatAST(ast.start);
          if (ast.end) boundsUpper = formatAST(ast.end);
        }
        // 2. LimitNode: lim(x -> 0, sin(x)/x)
        else if (ast.type === 'Limit') {
          parentType = parentType || 'limit';
          symbol = 'lim';
          varName = ast.variable;
          integrand = formatAST(ast.expr);
          try {
            point = valueToNumber(evaluate(formatAST(ast.target), env).value);
          } catch {
            point = 0;
          }
        }
        // 3. DiffNode: d//dx (x^3 - 2*x)
        else if (ast.type === 'Diff') {
          parentType = parentType || 'derivative';
          varName = ast.variable;
          symbol = symbol || `d${varName}`;
          integrand = formatAST(ast.expr);
          point = point ?? 1.5;
        }
        // 4. FunctionCall check: check(3/4 * pi * r^2, is: "sphere volume")
        else if (ast.type === 'FunctionCall' && ((ast as any).callee === 'check' || (ast as any).name === 'check')) {
          parentType = parentType || 'check';
          symbol = 'check';
          varName = 'r';
          integrand = lineText;
        }
      } catch {
        // Fallback for typeset math notation strings in editor
      }

      // Mathematical notation fallback if not standard AST node
      if (!parentType) {
        if (lineText.includes('d//') || lineText.startsWith('diff') || lineText.startsWith('d/dx')) {
          parentType = 'derivative';
          symbol = symbol || 'dx';
          const match = lineText.match(/d\/\/d([a-zA-Z_][a-zA-Z0-9_]*)\s*([\s\S]*)/);
          if (match) {
            varName = match[1] || 'x';
            integrand = match[2]?.replace(/^\(|\)$/g, '') || 'x^3 - 2*x';
            symbol = `d${varName}`;
          } else {
            integrand = 'x^3 - 2*x';
          }
          point = point ?? 1.5;
        } else if (lineText.startsWith('lim')) {
          parentType = 'limit';
          symbol = 'lim';
          const match = lineText.match(/lim(?:\(([a-zA-Z_][a-zA-Z0-9_]*)\s*->\s*([0-9a-zA-Z\.\-]+)\))?\s*([\s\S]*)/);
          if (match) {
            varName = match[1] || 'x';
            point = match[2] ? parseFloat(match[2]) : 3.0;
            integrand = match[3]?.replace(/^\(|\)$/g, '') || '2*x + 4';
          } else {
            point = 3.0;
            integrand = '2*x + 4';
          }
          targetLimit = 10.0;
        } else if (lineText.includes('\u222b') || lineText.startsWith('integral')) {
          parentType = 'integral';
          symbol = symbol || 'dx';
          const match = lineText.match(/(?:\u222b|integral)(?:_([0-9a-zA-Z\.\-]+))?(?:\^([0-9a-zA-Z\.\-]+))?\s+(?:from\s+([0-9a-zA-Z\.\-]+)\s+to\s+([0-9a-zA-Z\.\-]+)\s+of\s+)?([\s\S]+?)\s+(d[a-zA-Z_][a-zA-Z0-9_]*)/);
          if (match) {
            boundsLower = match[1] || match[3] || undefined;
            boundsUpper = match[2] || match[4] || undefined;
            integrand = match[5]?.replace(/^\(|\)$/g, '') || 'x^2';
            symbol = match[6] || 'dx';
            varName = symbol.startsWith('d') ? symbol.slice(1) : 'x';
          } else {
            integrand = 'x^2';
            symbol = 'dx';
          }
        } else if (lineText.includes('check(') || lineText.startsWith('check')) {
          parentType = 'check';
          symbol = 'check';
          varName = 'r';
          integrand = lineText;
        }
      }

      if (symbol) {
        const explanation = explainSymbol(symbol, {
          parentType,
          integrand: integrand || lineText,
          exprString: integrand || lineText,
          variableName: varName,
          bounds: boundsLower || boundsUpper ? { lower: boundsLower || '0', upper: boundsUpper || '1' } : undefined,
          point,
          targetLimit,
        });

        this.mathPopover.show(explanation, constructEl);
      }
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

  public getCursorLineIndex(): number {
    const textBefore = this.textarea.value.substring(0, this.textarea.selectionStart);
    return textBefore.split('\n').length - 1;
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

    // Clean up existing plotters and animation players
    this.linePlotters.forEach(p => p.dispose());
    this.linePlotters.clear();
    this.pinnedPlotters.forEach(p => p.dispose());
    this.pinnedPlotters.clear();
    this.animationPlayers.forEach(p => p.dispose());
    this.animationPlayers.clear();
    this.pinnedAnimationPlayers.forEach(p => p.dispose());
    this.pinnedAnimationPlayers.clear();

    // 2. Render Pinned Visuals Slot
    const pinnedContainer = this.container.querySelector('#doc-pinned-visuals') as HTMLElement;
    if (pinnedContainer) {
      if (this.pinnedLines.size === 0) {
        pinnedContainer.classList.add('empty');
        pinnedContainer.innerHTML = '';
      } else {
        pinnedContainer.classList.remove('empty');
        let pinnedHtml = '';
        this.pinnedLines.forEach(lineIdx => {
          const rec = records[lineIdx];
          if (!rec || !rec.result) return;
          pinnedHtml += this.formatPinnedItem(rec);
        });
        pinnedContainer.innerHTML = pinnedHtml;

        // Wire unpin buttons
        pinnedContainer.querySelectorAll('.doc-unpin-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const lineIdx = parseInt((btn as HTMLElement).getAttribute('data-line') ?? '0', 10);
            this.pinnedLines.delete(lineIdx);
            this.renderWorkPanel(this.state.getRecords(), false);
          });
        });

        // Instantiate pinned plotters
        this.pinnedLines.forEach(lineIdx => {
          const rec = records[lineIdx];
          if (rec && rec.result && rec.result.type === 'graph') {
            const canvas = pinnedContainer.querySelector(`.doc-pinned-canvas[data-line="${lineIdx}"]`) as HTMLCanvasElement;
            if (canvas) {
              const spec = (rec.result as GraphValue).spec;
              let plotter: Canvas2DPlotter | Surface3DPlotter;
              if (spec.dimensionality === 2 && (spec.surface || spec.parametric?.zExpr || spec.kind === 'surface' || spec.kind === 'pointcloud')) {
                plotter = new Surface3DPlotter(canvas, spec, {});
              } else {
                plotter = new Canvas2DPlotter(canvas, spec, {});
              }
              this.pinnedPlotters.set(lineIdx, plotter);
              plotter.render();
            }
          }
        });
      }
    }

    // 3. Results Gutter with inline visuals
    let gutterHtml = '';
    const activeSymbols: Map<string, { type: string; value: string; line: number; isShadowed?: boolean }> = new Map();

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      const isCollapsed = this.collapsedLines.has(i);
      const isExpanded = this.expandedPlots.has(i);
      const isPinned = this.pinnedLines.has(i);

      gutterHtml += this.formatGutterRow(rec, isCollapsed, isExpanded, isPinned);

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

    // Wire Pin buttons
    this.gutterEl.querySelectorAll('.doc-gutter-pin-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const lineIdx = parseInt((btn as HTMLElement).getAttribute('data-line') ?? '0', 10);
        if (this.pinnedLines.has(lineIdx)) {
          this.pinnedLines.delete(lineIdx);
        } else {
          this.pinnedLines.add(lineIdx);
        }
        this.renderWorkPanel(this.state.getRecords(), false);
      });
    });

    // Wire Collapse buttons
    this.gutterEl.querySelectorAll('.doc-gutter-collapse-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const lineIdx = parseInt((btn as HTMLElement).getAttribute('data-line') ?? '0', 10);
        if (this.collapsedLines.has(lineIdx)) {
          this.collapsedLines.delete(lineIdx);
        } else {
          this.collapsedLines.add(lineIdx);
        }
        this.saveCollapsedLines();
        this.renderWorkPanel(this.state.getRecords(), false);
      });
    });

    // Wire Plot size Expand / Compact buttons
    this.gutterEl.querySelectorAll('.doc-gutter-expand-plot-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const lineIdx = parseInt((btn as HTMLElement).getAttribute('data-line') ?? '0', 10);
        if (this.expandedPlots.has(lineIdx)) {
          this.expandedPlots.delete(lineIdx);
        } else {
          this.expandedPlots.add(lineIdx);
        }
        this.renderWorkPanel(this.state.getRecords(), false);
      });
    });

    // Wire Exact rational toggle badges
    this.gutterEl.querySelectorAll('.tm-exact-badge').forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation();
        const container = badge.closest('.tm-large-rational');
        if (!container) return;
        const approx = container.querySelector('.tm-approx-val');
        const expanded = container.querySelector('.tm-exact-expanded');
        if (approx && expanded) {
          const isExpanded = !expanded.classList.contains('hidden');
          if (isExpanded) {
            expanded.classList.add('hidden');
            approx.classList.remove('hidden');
            badge.textContent = '[exact]';
          } else {
            expanded.classList.remove('hidden');
            approx.classList.add('hidden');
            badge.textContent = '[approx]';
          }
        }
      });
    });

    // Instantiate and render all inline plotters for visible graph rows
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      if (rec && rec.result && rec.result.type === 'graph' && !this.collapsedLines.has(i)) {
        const canvas = this.gutterEl.querySelector(`.doc-inline-canvas[data-line="${i}"]`) as HTMLCanvasElement;
        if (canvas) {
          const spec = (rec.result as GraphValue).spec;
          let plotter: Canvas2DPlotter | Surface3DPlotter;
          if (spec.dimensionality === 2 && (spec.surface || spec.parametric?.zExpr || spec.kind === 'surface' || spec.kind === 'pointcloud')) {
            plotter = new Surface3DPlotter(canvas, spec, {});
          } else {
            plotter = new Canvas2DPlotter(canvas, spec, {});
          }
          this.linePlotters.set(i, plotter);
          plotter.render();
        }
      }
    }

    // Instantiate and mount all animation players for visible trajectory rows
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      if (rec && rec.result && rec.result.type === 'trajectory' && !this.collapsedLines.has(i)) {
        const container = this.gutterEl.querySelector(`.doc-inline-animation-container[data-line="${i}"]`) as HTMLElement;
        if (container) {
          const trajVal = rec.result as TrajectoryValue;
          const player = new AnimationPlayer(container, trajVal, {
            viewResolver: (state) => this.resolveViewForState(state),
          });
          this.animationPlayers.set(i, player);
        }
      }
    }

    // Mount pinned animation players
    for (const lineIdx of this.pinnedLines) {
      const rec = records[lineIdx];
      if (rec && rec.result && rec.result.type === 'trajectory') {
        const container = pinnedContainer?.querySelector(`.doc-pinned-animation-container[data-line="${lineIdx}"]`) as HTMLElement;
        if (container) {
          const trajVal = rec.result as TrajectoryValue;
          const player = new AnimationPlayer(container, trajVal, {
            viewResolver: (state) => this.resolveViewForState(state),
          });
          this.pinnedAnimationPlayers.set(lineIdx, player);
        }
      }
    }

    // 4. Scope Tab
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

    // 5. Trace Tab
    const durationEl = this.container.querySelector('#trace-duration');
    const lineCountEl = this.container.querySelector('#trace-line-count');
    if (durationEl) durationEl.textContent = `${this.state.getLastDurationMs()} ms`;
    if (lineCountEl) lineCountEl.textContent = `${records.length}`;

    // 6. Frames Tab
    this.renderFrames();
  }

  private formatPinnedItem(rec: DocumentLineRecord): string {
    const lineIdx = rec.lineIndex;
    if (!rec.result) return '';

    if (rec.result.type === 'graph') {
      const graphVal = rec.result as GraphValue;
      return `
        <div class="doc-pinned-item" data-line="${lineIdx}">
          <div class="doc-pinned-header">
            <span>Pinned: Line ${lineIdx + 1} (Plot: ${escapeHtml(graphVal.spec.kind)})</span>
            <button class="doc-unpin-btn" data-line="${lineIdx}">Unpin</button>
          </div>
          <canvas class="doc-pinned-canvas" data-line="${lineIdx}"></canvas>
        </div>
      `;
    }

    if (rec.result.type === 'derivation') {
      const derivVal = rec.result as DerivationValue;
      return `
        <div class="doc-pinned-item" data-line="${lineIdx}">
          <div class="doc-pinned-header">
            <span>Pinned: Line ${lineIdx + 1} (Derivation: ${escapeHtml(derivVal.targetVar ?? 'Roots')})</span>
            <button class="doc-unpin-btn" data-line="${lineIdx}">Unpin</button>
          </div>
          <div class="doc-inline-derivation-container">${this.renderDerivationFull(derivVal)}</div>
        </div>
      `;
    }

    if (rec.result.type === 'described') {
      const desc = rec.result as DescribedValue;
      return `
        <div class="doc-pinned-item" data-line="${lineIdx}">
          <div class="doc-pinned-header">
            <span>Pinned: Line ${lineIdx + 1} (${escapeHtml(formatKind(desc.kind))}: ${escapeHtml(desc.namedOperation || desc.operation)})</span>
            <button class="doc-unpin-btn" data-line="${lineIdx}">Unpin</button>
          </div>
          <div class="doc-inline-described-container">${this.renderDescribedFull(desc)}</div>
        </div>
      `;
    }

    if (rec.result.type === 'check_result') {
      const checkVal = rec.result as any;
      return `
        <div class="doc-pinned-item" data-line="${lineIdx}">
          <div class="doc-pinned-header">
            <span>Pinned: Line ${lineIdx + 1} (Check: ${escapeHtml(checkVal.targetQuantity)})</span>
            <button class="doc-unpin-btn" data-line="${lineIdx}">Unpin</button>
          </div>
          <div class="doc-inline-check-container">${this.renderCheckResultFull(checkVal)}</div>
        </div>
      `;
    }

    if (rec.result.type === 'trajectory') {
      const trajVal = rec.result as TrajectoryValue;
      return `
        <div class="doc-pinned-item" data-line="${lineIdx}">
          <div class="doc-pinned-header">
            <span>Pinned: Line ${lineIdx + 1} (Animation: ${escapeHtml(trajVal.stateKind)})</span>
            <button class="doc-unpin-btn" data-line="${lineIdx}">Unpin</button>
          </div>
          <div class="doc-pinned-animation-container" data-line="${lineIdx}"></div>
        </div>
      `;
    }

    return `
      <div class="doc-pinned-item" data-line="${lineIdx}">
        <div class="doc-pinned-header">
          <span>Pinned: Line ${lineIdx + 1}</span>
          <button class="doc-unpin-btn" data-line="${lineIdx}">Unpin</button>
        </div>
        <div class="doc-gutter-result"><span class="doc-result-value">${this.typesetMathReadOnly(this.formatValue(rec.result))}</span></div>
      </div>
    `;
  }

  private renderDescribedFull(desc: DescribedValue): string {
    const kindStr = formatKind(desc.kind);
    const opStr = desc.namedOperation || desc.operation;
    const meaningStr = desc.meaningInWords || desc.meaning;
    const reqStr = Array.isArray(desc.requires) ? desc.requires.join('; ') : desc.requires;
    const canDoList = Array.isArray(desc.canDo) ? desc.canDo : [desc.canDo];
    const relatedList = Array.isArray(desc.related) ? desc.related : (desc.related ? [desc.related] : []);

    let html = `<div class="visual-described-pane" data-kind="${escapeHtml(kindStr)}" data-op="${escapeHtml(opStr)}">`;
    html += `
      <div class="described-header-card">
        <div class="described-kind-badge">${escapeHtml(kindStr)}</div>
        <h3 class="described-title">${escapeHtml(opStr)}</h3>
        <p class="described-meaning">${escapeHtml(meaningStr)}</p>
      </div>

      <div class="described-section obstruction-section">
        <div class="section-label">Obstruction to Evaluation:</div>
        <div class="obstruction-badge">${escapeHtml(desc.obstruction)}</div>
      </div>

      <div class="described-section requires-section">
        <div class="section-label">Requires to Evaluate:</div>
        <div class="section-content">${escapeHtml(reqStr)}</div>
      </div>

      <div class="described-section cando-section">
        <div class="section-label">Operations Supported:</div>
        <ul class="cando-list">
          ${canDoList.map((item: string) => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      </div>

      ${relatedList.length > 0 ? `
        <div class="described-section related-section">
          <div class="section-label">Related Theorems & Concepts:</div>
          <div class="related-tags">
            ${relatedList.map((t: string) => `<span class="related-tag">${escapeHtml(t)}</span>`).join('')}
          </div>
        </div>
      ` : ''}
    </div>`;
    return html;
  }

  private renderCheckResultFull(checkVal: any): string {
    let html = `<div class="visual-derivation-tree">`;
    html += `<div class="derivation-orig-eq">${this.typesetMathReadOnly(checkVal.actualExprString)}</div>`;

    for (let i = 0; i < checkVal.messageLines.length; i++) {
      const line = checkVal.messageLines[i];
      html += `
        <div class="derivation-step-card">
          <div class="step-card-header">
            <span class="step-num">Part ${i + 1}</span>
            <span class="step-rule-badge">${i === 0 ? 'Verification' : i === 1 ? 'Dimension' : i === 2 ? 'Canonical' : i === 3 ? 'Derivation' : 'Actual'}</span>
          </div>
          <div class="step-card-just" style="font-size: 13px; color: var(--color-text-primary);">${escapeHtml(line)}</div>
        </div>
      `;
    }

    if (checkVal.derivationSteps && checkVal.derivationSteps.length > 0) {
      html += `<div class="check-derivation-header" style="margin-top: 12px; font-weight: 600; color: var(--color-text-primary);">Canonical Derivation Steps:</div>`;
      for (const s of checkVal.derivationSteps) {
        html += `
          <div class="derivation-step-card">
            <div class="step-card-header">
              <span class="step-num">Step ${s.step}</span>
              <span class="step-rule-badge">${escapeHtml(s.title)}</span>
            </div>
            <div class="step-card-eq">${this.typesetMathReadOnly(s.math)}</div>
            <div class="step-card-just">${escapeHtml(s.explanation)}</div>
          </div>
        `;
      }
    }

    html += `</div>`;
    return html;
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

  private formatGutterRow(rec: DocumentLineRecord, isCollapsed: boolean, isExpandedPlot: boolean, isPinned: boolean): string {
    const lineIdx = rec.lineIndex;
    if (rec.classification.state === 'PROSE') {
      return `
        <div class="doc-gutter-row" data-line="${lineIdx}">
          <div class="doc-gutter-row-header">
            <span class="doc-gutter-lineno">L${lineIdx + 1}</span>
          </div>
        </div>
      `;
    }

    if (rec.classification.state === 'INCOMPLETE') {
      return `
        <div class="doc-gutter-row" data-line="${lineIdx}">
          <div class="doc-gutter-row-header">
            <span class="doc-gutter-lineno">L${lineIdx + 1}</span>
          </div>
          <div class="doc-gutter-content"><span class="doc-gutter-incomplete">...</span></div>
        </div>
      `;
    }

    if (rec.classification.state === 'ERROR') {
      return `
        <div class="doc-gutter-row" data-line="${lineIdx}">
          <div class="doc-gutter-row-header">
            <span class="doc-gutter-lineno">L${lineIdx + 1}</span>
          </div>
          <div class="doc-gutter-content">
            <span class="doc-gutter-error" title="${escapeHtml(rec.error?.message ?? '')}">${ICONS.warning} ${escapeHtml(rec.error?.message ?? 'Error')}</span>
          </div>
        </div>
      `;
    }

    if (!rec.result) {
      return `
        <div class="doc-gutter-row" data-line="${lineIdx}">
          <div class="doc-gutter-row-header">
            <span class="doc-gutter-lineno">L${lineIdx + 1}</span>
          </div>
        </div>
      `;
    }

    // 1. Graph result
    if (rec.result.type === 'graph') {
      const graphVal = rec.result as GraphValue;
      const kindStr = graphVal.spec.kind;
      const collapseText = isCollapsed ? '+' : '\u2212';
      return `
        <div class="doc-gutter-row" data-line="${lineIdx}">
          <div class="doc-gutter-row-header">
            <span class="doc-gutter-lineno">L${lineIdx + 1} &bull; Plot (${escapeHtml(kindStr)})</span>
            <div class="doc-gutter-row-actions">
              <button class="doc-gutter-action-btn doc-gutter-pin-btn ${isPinned ? 'pinned' : ''}" data-line="${lineIdx}" title="Pin plot to top of panel">${isPinned ? 'Pinned' : 'Pin'}</button>
              ${!isCollapsed ? `<button class="doc-gutter-action-btn doc-gutter-expand-plot-btn" data-line="${lineIdx}" title="Toggle plot canvas size">${isExpandedPlot ? 'Compact' : 'Expand'}</button>` : ''}
              <button class="doc-gutter-action-btn doc-gutter-collapse-btn" data-line="${lineIdx}" title="Collapse/Expand row">${collapseText}</button>
            </div>
          </div>
          <div class="doc-gutter-content">
            ${isCollapsed
              ? `<div class="doc-gutter-collapsed-summary">[Collapsed Plot: ${escapeHtml(kindStr)}]</div>`
              : `<div class="doc-inline-plot-container"><canvas class="doc-inline-canvas ${isExpandedPlot ? 'expanded' : ''}" data-line="${lineIdx}"></canvas></div>`
            }
          </div>
        </div>
      `;
    }

    // 2. Derivation result
    if (rec.result.type === 'derivation') {
      const derivVal = rec.result as DerivationValue;
      const collapseText = isCollapsed ? '+' : '\u2212';
      return `
        <div class="doc-gutter-row" data-line="${lineIdx}">
          <div class="doc-gutter-row-header">
            <span class="doc-gutter-lineno">L${lineIdx + 1} &bull; Derivation (${escapeHtml(derivVal.targetVar ?? 'Roots')})</span>
            <div class="doc-gutter-row-actions">
              <button class="doc-gutter-action-btn doc-gutter-pin-btn ${isPinned ? 'pinned' : ''}" data-line="${lineIdx}" title="Pin derivation to top of panel">${isPinned ? 'Pinned' : 'Pin'}</button>
              <button class="doc-gutter-action-btn doc-gutter-collapse-btn" data-line="${lineIdx}" title="Collapse/Expand row">${collapseText}</button>
            </div>
          </div>
          <div class="doc-gutter-content">
            ${isCollapsed
              ? `<div class="doc-gutter-collapsed-summary">[Collapsed Derivation: ${derivVal.steps.length} steps (${derivVal.verified ? 'Verified' : 'Unverified'})]</div>`
              : `<div class="doc-inline-derivation-container">${this.renderDerivationFull(derivVal)}</div>`
            }
          </div>
        </div>
      `;
    }

    // 3. Described result
    if (rec.result.type === 'described') {
      const desc = rec.result as DescribedValue;
      const kindStr = formatKind(desc.kind);
      const opStr = desc.namedOperation || desc.operation;
      const collapseText = isCollapsed ? '+' : '\u2212';
      return `
        <div class="doc-gutter-row" data-line="${lineIdx}">
          <div class="doc-gutter-row-header">
            <span class="doc-gutter-lineno">L${lineIdx + 1} &bull; ${escapeHtml(kindStr)} (${escapeHtml(opStr)})</span>
            <div class="doc-gutter-row-actions">
              <button class="doc-gutter-action-btn doc-gutter-pin-btn ${isPinned ? 'pinned' : ''}" data-line="${lineIdx}" title="Pin described card to top of panel">${isPinned ? 'Pinned' : 'Pin'}</button>
              <button class="doc-gutter-action-btn doc-gutter-collapse-btn" data-line="${lineIdx}" title="Collapse/Expand row">${collapseText}</button>
            </div>
          </div>
          <div class="doc-gutter-content">
            ${isCollapsed
              ? `<div class="doc-described-card"><span class="described-kind-badge">${escapeHtml(kindStr)}</span> <span class="described-op">${escapeHtml(opStr)}</span></div>`
              : `<div class="doc-inline-described-container">${this.renderDescribedFull(desc)}</div>`
            }
          </div>
        </div>
      `;
    }

    // 4. Check result
    if (rec.result.type === 'check_result') {
      const checkVal = rec.result as any;
      const collapseText = isCollapsed ? '+' : '\u2212';
      return `
        <div class="doc-gutter-row" data-line="${lineIdx}">
          <div class="doc-gutter-row-header">
            <span class="doc-gutter-lineno">L${lineIdx + 1} &bull; Check (${escapeHtml(checkVal.targetQuantity)})</span>
            <div class="doc-gutter-row-actions">
              <button class="doc-gutter-action-btn doc-gutter-pin-btn ${isPinned ? 'pinned' : ''}" data-line="${lineIdx}" title="Pin check to top of panel">${isPinned ? 'Pinned' : 'Pin'}</button>
              <button class="doc-gutter-action-btn doc-gutter-collapse-btn" data-line="${lineIdx}" title="Collapse/Expand row">${collapseText}</button>
            </div>
          </div>
          <div class="doc-gutter-content">
            ${isCollapsed
              ? `<div class="doc-gutter-collapsed-summary">[Collapsed Check: ${checkVal.isValid ? 'Verified' : 'Dimensional Analysis'}]</div>`
              : `<div class="doc-inline-check-container">${this.renderCheckResultFull(checkVal)}</div>`
            }
          </div>
        </div>
      `;
    }

    // 5. Solve trace result
    if (rec.result.type === 'solve_trace') {
      const traceVal = rec.result as SolveTraceValue;
      const collapseText = isCollapsed ? '+' : '\u2212';
      return `
        <div class="doc-gutter-row" data-line="${lineIdx}">
          <div class="doc-gutter-row-header">
            <span class="doc-gutter-lineno">L${lineIdx + 1} &bull; Trace (${escapeHtml(traceVal.method)})</span>
            <div class="doc-gutter-row-actions">
              <button class="doc-gutter-action-btn doc-gutter-pin-btn ${isPinned ? 'pinned' : ''}" data-line="${lineIdx}" title="Pin trace to top of panel">${isPinned ? 'Pinned' : 'Pin'}</button>
              <button class="doc-gutter-action-btn doc-gutter-collapse-btn" data-line="${lineIdx}" title="Collapse/Expand row">${collapseText}</button>
            </div>
          </div>
          <div class="doc-gutter-content">
            ${isCollapsed
              ? `<div class="doc-gutter-collapsed-summary">[Collapsed Trace: ${traceVal.iterations.length} iters, root \u2248 ${escapeHtml(this.formatValue(traceVal.root))}]</div>`
              : this.formatSolveTraceGutter(traceVal)
            }
          </div>
        </div>
      `;
    }

    // 6. Trajectory Animation result
    if (rec.result.type === 'trajectory') {
      const trajVal = rec.result as TrajectoryValue;
      const collapseText = isCollapsed ? '+' : '\u2212';
      return `
        <div class="doc-gutter-row" data-line="${lineIdx}">
          <div class="doc-gutter-row-header">
            <span class="doc-gutter-lineno">L${lineIdx + 1} &bull; Animation (${escapeHtml(trajVal.stateKind)})</span>
            <div class="doc-gutter-row-actions">
              <button class="doc-gutter-action-btn doc-gutter-pin-btn ${isPinned ? 'pinned' : ''}" data-line="${lineIdx}" title="Pin animation to top of panel">${isPinned ? 'Pinned' : 'Pin'}</button>
              <button class="doc-gutter-action-btn doc-gutter-collapse-btn" data-line="${lineIdx}" title="Collapse/Expand row">${collapseText}</button>
            </div>
          </div>
          <div class="doc-gutter-content">
            ${isCollapsed
              ? `<div class="doc-gutter-collapsed-summary">[Collapsed Animation: ${escapeHtml(trajVal.stateKind)} (${trajVal.samples.length} samples)]</div>`
              : `<div class="doc-inline-animation-container" data-line="${lineIdx}"></div>`
            }
          </div>
        </div>
      `;
    }

    // 6. Scalar / Standard result
    return `
      <div class="doc-gutter-row" data-line="${lineIdx}">
        <div class="doc-gutter-row-header">
          <span class="doc-gutter-lineno">L${lineIdx + 1}</span>
        </div>
        <div class="doc-gutter-content">
          <div class="doc-gutter-result"><span class="doc-result-value">${this.typesetMathReadOnly(this.formatValue(rec.result))}</span></div>
        </div>
      </div>
    `;
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
      case 'dimension': {
        const entries = Object.entries(val.degrees).map(([k, v]) => `${k}: ${v}`).join(', ');
        return entries ? `{ ${entries} } (${val.interpretation})` : `0 (${val.interpretation})`;
      }
      case 'check_result': {
        if (val.isValid) return `Verified: ${val.targetQuantity}`;
        return `Not ${val.targetQuantity}: ${val.messageLines[1]?.replace(/^\d+\.\s*/, '') || 'Dimension mismatch'}`;
      }
      case 'kind':
        return formatKind(val.kind);
      case 'described':
        return `[Described: ${val.namedOperation || (val as any).operation || 'unevaluable'}]`;
      case 'set_value':
        if (val.standardName) return val.standardName;
        if (val.isInfinite) return `Set(infinite, of=${formatKind(val.elementKind)})`;
        return `Set(${(val.elements ?? []).map(e => this.formatValue(e)).join(', ')})`;
      case 'record': {
        const fieldsStr = Object.entries(val.fields)
          .map(([k, v]) => `${k}: ${this.formatValue(v)}`)
          .join(', ');
        return `${val.typeName}(${fieldsStr})`;
      }
      case 'record_constructor':
        return `record ${val.name} { ${val.fieldNames.join(', ')} }`;
      case 'quantity':
        return `${this.formatValue(val.magnitude)} ${val.unit}`;
      case 'module': {
        const keys = Object.keys(val.exports);
        if (keys.length === 0) return `module ${val.name}`;
        return `module ${val.name} { ${keys.join(', ')} }`;
      }
      case 'trajectory':
        return `Trajectory(${val.stateKind}, ${val.tStart}..${val.tEnd}, ${val.samples.length} samples)`;
      case 'drawing_primitive':
        return `Primitive(${val.primitive})`;
      case 'scene':
        return `Scene(${val.primitives.length} primitives)`;
      default:
        return String((val as any).value ?? val.type);
    }
  }

  private resolveViewForState(state: Value): Value | null {
    if (!state) return null;
    const views = (this.state as any)?.lastEnv?.__views__ || (window as any).__axine_views__;
    if (state.type === 'record' && views && views.has(state.typeName)) {
      const viewFn = views.get(state.typeName);
      if (viewFn) {
        try {
          const evaluator = new Evaluator(createInitialEnvironment());
          return (evaluator as any).evalCall(viewFn, [state]);
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  public dispose() {
    this.linePlotters.forEach(p => p.dispose());
    this.linePlotters.clear();
    this.pinnedPlotters.forEach(p => p.dispose());
    this.pinnedPlotters.clear();
    this.animationPlayers.forEach(p => p.dispose());
    this.animationPlayers.clear();
    this.pinnedAnimationPlayers.forEach(p => p.dispose());
    this.pinnedAnimationPlayers.clear();
    this.mathPopover.dispose();
    this.state.dispose();
  }
}

