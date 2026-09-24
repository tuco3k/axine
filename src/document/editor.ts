import { DocumentState, DocumentLineRecord } from './document_state';
import { Value, DerivationValue, SolveTraceValue, DescribedValue, TrajectoryValue, SpaceValue } from '../core/types';
import { SpaceViewport } from '../plot/space_viewport';
import { AnimationPlayer } from '../plot/animation_player';
import { typesetMath, typesetSourceLine, TypesetOptions } from '../core/math_typeset';
import { createInitialEnvironment, Evaluator } from '../core/evaluator';
import { formatKind } from '../core/kinds';
import { ICONS } from '../styles/icons';
import { FileManager, OpenFileResult, SaveFileResult } from './file_manager';
import { exportToHtml, exportToMarkdown, parseFrontMatter, renderSVGSpaceToString } from './exporter';
import { PaneContainer } from '../notebook/pane_container';
import { TabData, updateDocumentTabTitles, findLeaf, getAllLeaves, getAllTabs } from '../notebook/pane_tree';
import { WorkspaceManager, Workspace, RecentWorkspace } from './workspace';
import { WelcomeScreen } from './welcome_screen';
import { AutocompleteController, AutocompleteTarget } from './autocomplete';
import { BlockDocumentEditor } from './block_editor';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export const UNICODE_MATH_MAP: Record<string, string> = {
  '\u222e': '\\oint',
  '\u2297': '\\otimes',
  '\u2295': '\\oplus',
  '\u230a': '\\lfloor',
  '\u230b': '\\rfloor',
  '\u2308': '\\lceil',
  '\u2309': '\\rceil',
  '\u2200': '\\forall',
  '\u2203': '\\exists',
  '\u2208': '\\in',
  '\u2209': '\\notin',
  '\u2264': '\\le',
  '\u2265': '\\ge',
  '\u2260': '\\ne',
  '\u221a': '\\sqrt',
  '\u221e': '\\' + 'infty',
  '\u222a': '\\cup',
  '\u2229': '\\cap',
  '\u2282': '\\subset',
  '\u2286': '\\subseteq',
  '\u2207': '\\nabla',
  '\u00d7': '\\times',
  '\u00b7': '\\cdot',
  '\u222b': '\\' + 'int',
  '\u222c': '\\iint',
  '\u222d': '\\iiint',
  '\u03c0': '\\pi',
  '\u03c4': '\\tau',
  '\u03d5': '\\phi',
  '\u03b8': '\\theta',
  '\u03bb': '\\lambda',
  '\u03b1': '\\alpha',
  '\u03b2': '\\beta',
  '\u03b3': '\\gamma',
  '\u03c9': '\\omega',
  '\u03c3': '\\sigma',
  '\u03bc': '\\mu',
  '\u03b4': '\\delta',
  '\u0394': '\\' + 'Delta',
  '\u03a3': '\\Sigma',
  '\u03a0': '\\Pi',
  '\u00b1': '\\pm',
  '\u2213': '\\mp',
  '\u2248': '\\approx',
  '\u221d': '\\propto',
  '\u2227': '\\wedge',
  '\u2228': '\\vee',
  '\u00ac': '\\neg',
  '\u2202': '\\' + 'partial',
};

export function replaceUnicodeMathSymbols(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (UNICODE_MATH_MAP[char]) {
      result += UNICODE_MATH_MAP[char];
    } else {
      result += char;
    }
  }
  return result;
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

export interface DocumentSession {
  id: string;
  name: string;
  handle?: FileSystemFileHandle;
  state: DocumentState;
  savedContent: string;
  isDirty: boolean;
  scrollPosition: { scrollTop: number; scrollLeft: number };
  caretPosition: { selectionStart: number; selectionEnd: number; selectionDirection: 'forward' | 'backward' | 'none' };
  dockLayout: DockLayoutState;
  activeTab: 'results' | 'scope' | 'trace' | 'frames';
  pinnedLines: Set<number>;
  collapsedLines: Set<number>;
  expandedPlots: Set<number>;
  diskFiles?: Record<string, string>;
}

export class DocumentEditor {
  private container: HTMLElement;
  private state!: DocumentState;
  private textarea!: HTMLTextAreaElement;
  private overlayEl!: HTMLElement;
  private caretEl!: HTMLElement;
  private lineNumbersEl!: HTMLElement;
  private gutterEl!: HTMLElement;
  private scopePanelEl!: HTMLElement;
  private framesPanelEl!: HTMLElement;
  private statsBadge!: HTMLElement;
  private workspaceEl!: HTMLElement;
  private panelEl!: HTMLElement;
  private edgeAffordanceEl!: HTMLElement;
  private fileNameEl!: HTMLElement;
  private dirtyBadgeEl!: HTMLElement;

  private sessions: Map<string, DocumentSession> = new Map();
  private sessionOrder: string[] = [];
  private activeSessionId: string = '';

  private currentFileName: string = 'untitled.ax';
  private currentFileHandle?: FileSystemFileHandle;
  private savedContent: string = '';
  private isDirty: boolean = false;
  private autosaveDebounceTimer: any = null;

  private activeWorkspace: Workspace | null = null;
  private welcomeScreen: WelcomeScreen | null = null;
  private wsUnsubscribe?: () => void;
  private autocomplete: AutocompleteController | null = null;
  public blockEditor: BlockDocumentEditor | null = null;
  private editorMode: 'block' | 'classic' = 'block';

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
  private isSurfaceDragging: boolean = false;
  private surfaceDragStartOffset: number = 0;
  private expandedPlots: Set<number> = new Set();
  private lineViewports: Map<number, SpaceViewport> = new Map();
  private pinnedViewports: Map<number, SpaceViewport> = new Map();
  private animationPlayers: Map<number, AnimationPlayer> = new Map();
  private pinnedAnimationPlayers: Map<number, AnimationPlayer> = new Map();
  private spaceObserver: IntersectionObserver | null = null;
  private spaceValuesByLine: Map<number, SpaceValue> = new Map();
  private pendingSpaceUpdates: Set<number> = new Set();
  private prevOverlayLines: string[] = [];
  private gutterEventsBound: boolean = false;
  private renderedStartLine: number = 0;
  private renderedEndLine: number = 0;
  private cachedGutterRecords: DocumentLineRecord[] = [];
  public paneContainer?: PaneContainer;

  constructor(container: HTMLElement, initialText?: string) {
    this.container = container;
    this.loadDockLayout();

    if (initialText !== undefined) {
      this.openInitialDocument(initialText);
    } else {
      const activeWsId = WorkspaceManager.getActiveWorkspaceId();
      let loadedWs: Workspace | null = null;
      if (activeWsId && activeWsId.startsWith('vws_')) {
        loadedWs = WorkspaceManager.loadVirtualWorkspace(activeWsId);
      }
      if (loadedWs) {
        this.openWorkspace(loadedWs);
      } else {
        this.showWelcomeScreen();
      }
    }
  }

  public showWelcomeScreen(): void {
    if (this.welcomeScreen) {
      this.welcomeScreen.dispose();
    }
    this.container.innerHTML = '';
    this.welcomeScreen = new WelcomeScreen(this.container, {
      onOpenFolder: async () => {
        const ws = await WorkspaceManager.openDirectoryPicker();
        if (ws) {
          this.openWorkspace(ws);
        }
      },
      onOpenFile: async () => {
        await this.openDocument();
      },
      onNewDocument: () => {
        const ws = WorkspaceManager.createVirtualWorkspace('Scratch', { 'untitled.ax': '' });
        this.openWorkspace(ws, 'untitled.ax');
      },
      onOpenRecent: async (recent: RecentWorkspace) => {
        if (recent.isVirtual) {
          const ws = WorkspaceManager.loadVirtualWorkspace(recent.id);
          if (ws) {
            this.openWorkspace(ws);
          }
        } else {
          const ws = await WorkspaceManager.openDirectoryPicker();
          if (ws) {
            this.openWorkspace(ws);
          }
        }
      },
    });
    this.welcomeScreen.render();
  }

  public openWorkspace(ws: Workspace, activeFilePath?: string): void {
    if (this.welcomeScreen) {
      this.welcomeScreen.dispose();
      this.welcomeScreen = null;
    }
    this.activeWorkspace = ws;
    WorkspaceManager.setActiveWorkspaceId(ws.id);
    WorkspaceManager.syncToEvaluator(ws);

    this.sessions.clear();
    this.sessionOrder = [];

    // Determine initial file to open
    let initialFileName = activeFilePath;
    let initialFileContent = '';

    if (initialFileName && ws.files.has(initialFileName)) {
      initialFileContent = ws.files.get(initialFileName) || '';
    } else {
      const axFiles = Array.from(ws.files.keys()).filter(k => k.endsWith('.ax') && !k.startsWith('.'));
      if (axFiles.length > 0) {
        initialFileName = axFiles[0];
        initialFileContent = ws.files.get(initialFileName) || '';
      } else {
        initialFileName = 'untitled.ax';
        initialFileContent = '';
        ws.files.set(initialFileName, initialFileContent);
        WorkspaceManager.saveVirtualWorkspace(ws);
      }
    }

    this.currentFileName = initialFileName;
    this.currentFileHandle = ws.handle;
    this.savedContent = initialFileContent;
    this.isDirty = false;
    this.state = new DocumentState(initialFileContent);

    const initialSessionId = 'sess_' + Math.random().toString(36).substring(2, 9);
    const initialSession: DocumentSession = {
      id: initialSessionId,
      name: this.currentFileName,
      handle: ws.handle,
      state: this.state,
      savedContent: initialFileContent,
      isDirty: false,
      scrollPosition: { scrollTop: 0, scrollLeft: 0 },
      caretPosition: { selectionStart: 0, selectionEnd: 0, selectionDirection: 'none' },
      dockLayout: JSON.parse(JSON.stringify(this.dockLayout)),
      activeTab: 'results',
      pinnedLines: new Set(),
      collapsedLines: new Set(this.collapsedLines),
      expandedPlots: new Set(),
    };
    this.sessions.set(initialSessionId, initialSession);
    this.sessionOrder.push(initialSessionId);
    this.activeSessionId = initialSessionId;

    this.buildUI(initialFileContent);
    this.applyDockLayout();
    this.bindTopBarAndGlobalEvents();
    this.bindEditorSurfaceEvents();
    this.initPaneContainer();

    this.state.subscribe((records, isEvaluating) => {
      if (this.paneContainer) {
        this.paneContainer.updateSpaces(records);
      } else if (this.activeSessionId === initialSessionId) {
        this.renderWorkPanel(records, isEvaluating);
      }
    });

    if (!this.wsUnsubscribe) {
      this.wsUnsubscribe = WorkspaceManager.subscribe((_updatedWs) => {
        this.paneContainer?.updateTreePanes();
      });
    }

    this.updateSessionTabs();
    this.state.setText(initialFileContent);
  }

  public openInitialDocument(initialText: string): void {
    const docText = initialText;
    this.currentFileName = 'untitled.ax';
    this.savedContent = docText;
    this.isDirty = false;
    this.state = new DocumentState(docText);

    const initialSessionId = 'sess_' + Math.random().toString(36).substring(2, 9);
    const initialSession: DocumentSession = {
      id: initialSessionId,
      name: this.currentFileName,
      handle: undefined,
      state: this.state,
      savedContent: docText,
      isDirty: false,
      scrollPosition: { scrollTop: 0, scrollLeft: 0 },
      caretPosition: { selectionStart: 0, selectionEnd: 0, selectionDirection: 'none' },
      dockLayout: JSON.parse(JSON.stringify(this.dockLayout)),
      activeTab: 'results',
      pinnedLines: new Set(),
      collapsedLines: new Set(this.collapsedLines),
      expandedPlots: new Set(),
    };
    this.sessions.set(initialSessionId, initialSession);
    this.sessionOrder.push(initialSessionId);
    this.activeSessionId = initialSessionId;

    this.buildUI(docText);
    this.applyDockLayout();
    this.bindTopBarAndGlobalEvents();
    this.bindEditorSurfaceEvents();
    this.initPaneContainer();
    this.state.subscribe((records, isEvaluating) => {
      if (this.paneContainer) {
        this.paneContainer.updateSpaces(records);
      } else if (this.activeSessionId === initialSessionId) {
        this.renderWorkPanel(records, isEvaluating);
      }
    });
    this.updateSessionTabs();
    this.state.setText(docText);
  }

  public closeWorkspace(): void {
    WorkspaceManager.clearActiveWorkspace();
    this.activeWorkspace = null;
    this.showWelcomeScreen();
  }

  public openWorkspaceFile(filePath: string): void {
    for (const [sessId, sess] of this.sessions.entries()) {
      if (sess.name === filePath) {
        this.switchToSession(sessId);
        if (this.paneContainer) {
          const allTabs = getAllTabs(this.paneContainer.getLayout().root);
          const tab = allTabs.find(t => t.documentId === sessId || (t.type === 'document' && t.title === filePath));
          if (tab) {
            const leaves = getAllLeaves(this.paneContainer.getLayout().root);
            for (const leaf of leaves) {
              if (leaf.tabs.some(t => t.id === tab.id)) {
                leaf.activeTabId = tab.id;
                this.paneContainer.setActivePaneId(leaf.id);
                break;
              }
            }
          }
          this.paneContainer.render();
        }
        return;
      }
    }

    const content = this.activeWorkspace?.files.get(filePath) ?? '';
    const sess = this.createSession(filePath, content);
    this.switchToSession(sess.id);

    if (this.paneContainer) {
      const activeLeafId = this.paneContainer.getActivePaneId();
      const activeLeaf = findLeaf(this.paneContainer.getLayout().root, activeLeafId);
      if (activeLeaf && activeLeaf.tabs.length === 1 && activeLeaf.tabs[0].type === 'document' && activeLeaf.tabs[0].title === 'untitled.ax' && !this.isDirty) {
        activeLeaf.tabs[0].title = filePath;
        activeLeaf.tabs[0].documentId = sess.id;
        activeLeaf.activeTabId = activeLeaf.tabs[0].id;
      } else {
        const newTab: TabData = {
          id: 'tab_doc_' + Math.random().toString(36).substring(2, 9),
          type: 'document',
          title: filePath,
          documentId: sess.id,
        };
        this.paneContainer.openTab(newTab, activeLeafId || undefined);
      }
      this.paneContainer.render();
    }
  }

  public getActiveWorkspace(): Workspace | null {
    return this.activeWorkspace;
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

    // Trigger viewport re-renders so canvas widths match
    this.lineViewports.forEach(p => p.render());
    this.pinnedViewports.forEach(p => p.render());
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

  public getSessions(): DocumentSession[] {
    return this.sessionOrder.map(id => this.sessions.get(id)!).filter(Boolean);
  }

  public getActiveSession(): DocumentSession | undefined {
    return this.sessions.get(this.activeSessionId);
  }

  public createSession(name: string, content: string, handle?: FileSystemFileHandle, diskFiles?: Record<string, string>): DocumentSession {
    const id = 'sess_' + Math.random().toString(36).substring(2, 9);
    const state = new DocumentState(content);
    if (diskFiles) {
      state.setDiskFiles(diskFiles);
    }
    const session: DocumentSession = {
      id,
      name,
      handle,
      state,
      savedContent: content,
      isDirty: false,
      scrollPosition: { scrollTop: 0, scrollLeft: 0 },
      caretPosition: { selectionStart: 0, selectionEnd: 0, selectionDirection: 'none' },
      dockLayout: JSON.parse(JSON.stringify(this.dockLayout)),
      activeTab: 'results',
      pinnedLines: new Set(),
      collapsedLines: new Set(this.collapsedLines),
      expandedPlots: new Set(),
      diskFiles,
    };
    state.subscribe((records, isEvaluating) => {
      if (this.paneContainer) {
        this.paneContainer.updateSpaces(records);
      } else if (this.activeSessionId === id) {
        this.renderWorkPanel(records, isEvaluating);
      }
    });
    this.sessions.set(id, session);
    this.sessionOrder.push(id);
    this.updateSessionTabs();
    return session;
  }

  public openSession(name: string, content: string, handle?: FileSystemFileHandle, diskFiles?: Record<string, string>): DocumentSession {
    const sess = this.createSession(name, content, handle, diskFiles);
    this.switchToSession(sess.id);
    return sess;
  }

  public switchToSession(sessionId: string): void {
    if (sessionId === this.activeSessionId) return;
    const prev = this.sessions.get(this.activeSessionId);
    if (prev) {
      prev.savedContent = this.savedContent;
      prev.isDirty = this.isDirty;
      prev.scrollPosition = {
        scrollTop: this.textarea ? this.textarea.scrollTop : 0,
        scrollLeft: this.textarea ? this.textarea.scrollLeft : 0,
      };
      prev.caretPosition = {
        selectionStart: this.textarea ? this.textarea.selectionStart : 0,
        selectionEnd: this.textarea ? this.textarea.selectionEnd : 0,
        selectionDirection: this.textarea ? this.textarea.selectionDirection : 'none',
      };
      prev.dockLayout = JSON.parse(JSON.stringify(this.dockLayout));
      prev.activeTab = this.activeTab;
      prev.pinnedLines = new Set(this.pinnedLines);
      prev.collapsedLines = new Set(this.collapsedLines);
      prev.expandedPlots = new Set(this.expandedPlots);
    }

    const next = this.sessions.get(sessionId);
    if (!next) return;

    this.activeSessionId = sessionId;
    this.state = next.state;
    this.currentFileName = next.name;
    this.currentFileHandle = next.handle;
    this.savedContent = next.savedContent;
    this.isDirty = next.isDirty;
    this.pinnedLines = new Set(next.pinnedLines);
    this.collapsedLines = new Set(next.collapsedLines);
    this.expandedPlots = new Set(next.expandedPlots);
    this.dockLayout = JSON.parse(JSON.stringify(next.dockLayout));
    this.activeTab = next.activeTab;

    // Update work panel tab buttons
    this.container.querySelectorAll('.doc-tab-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-tab') === next.activeTab);
    });
    this.container.querySelectorAll('.doc-tab-content').forEach(c => {
      c.classList.toggle('active', c.id === `tab-${next.activeTab}-panel`);
    });

    this.applyDockLayout();

    if (this.textarea) {
      this.textarea.value = next.state.getText();
      if (this.blockEditor) {
        this.blockEditor.setText(next.state.getText());
      }
      this.updateTypesetOverlay();
      this.textarea.setSelectionRange(
        next.caretPosition.selectionStart,
        next.caretPosition.selectionEnd,
        next.caretPosition.selectionDirection
      );
      this.textarea.scrollTop = next.scrollPosition.scrollTop;
      this.textarea.scrollLeft = next.scrollPosition.scrollLeft;
      if (this.overlayEl) {
        this.overlayEl.scrollTop = next.scrollPosition.scrollTop;
        this.overlayEl.scrollLeft = next.scrollPosition.scrollLeft;
      }
      if (this.lineNumbersEl) {
        this.lineNumbersEl.scrollTop = next.scrollPosition.scrollTop;
      }
      if (this.gutterEl) {
        this.gutterEl.scrollTop = next.scrollPosition.scrollTop;
      }
      this.updateCaret();
    }

    this.updateFileInfo();
    this.updateSessionTabs();

    // Render work panel immediately from cached state without re-evaluating from scratch
    this.renderWorkPanel(next.state.getRecords(), next.state.getIsEvaluating());
  }

  public closeSession(sessionId: string): boolean {
    const sess = this.sessions.get(sessionId);
    if (!sess) return false;
    if (sess.isDirty) {
      if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        if (!window.confirm(`Save changes to "${sess.name}" before closing?`)) {
          return false;
        }
      }
    }
    sess.state.dispose();
    this.sessions.delete(sessionId);
    const idx = this.sessionOrder.indexOf(sessionId);
    if (idx !== -1) {
      this.sessionOrder.splice(idx, 1);
    }

    if (this.activeSessionId === sessionId) {
      if (this.sessionOrder.length > 0) {
        const nextIdx = Math.min(idx, this.sessionOrder.length - 1);
        this.switchToSession(this.sessionOrder[nextIdx]);
      } else {
        const newSess = this.createSession('untitled.ax', '');
        this.switchToSession(newSess.id);
      }
    } else {
      this.updateSessionTabs();
    }
    return true;
  }

  public updateSessionTabs(): void {
    const tabContainer = this.container.querySelector('#doc-session-tabs');
    if (!tabContainer) return;

    tabContainer.innerHTML = this.sessionOrder.map(id => {
      const sess = this.sessions.get(id);
      if (!sess) return '';
      const isActive = id === this.activeSessionId;
      const dirty = (id === this.activeSessionId ? this.isDirty : sess.isDirty);
      return `
        <div class="doc-session-tab ${isActive ? 'active' : ''}" data-session-id="${id}" title="${escapeHtml(sess.name)}">
          <span class="doc-session-tab-title">${escapeHtml(sess.name)}</span>
          <span class="doc-session-tab-dirty-dot ${dirty ? '' : 'hidden'}" title="Unsaved changes"></span>
          <button class="doc-session-tab-close-btn" data-close-session-id="${id}" title="Close tab">&times;</button>
        </div>
      `;
    }).join('');

    tabContainer.querySelectorAll('.doc-session-tab').forEach(tabEl => {
      tabEl.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.doc-session-tab-close-btn')) return;
        const sessId = (tabEl as HTMLElement).getAttribute('data-session-id');
        if (sessId) {
          this.switchToSession(sessId);
        }
      });
    });

    tabContainer.querySelectorAll('.doc-session-tab-close-btn').forEach(closeBtn => {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const sessId = (closeBtn as HTMLElement).getAttribute('data-close-session-id');
        if (sessId) {
          this.closeSession(sessId);
        }
      });
    });
  }

  public setText(text: string): void {
    if (this.textarea) {
      this.textarea.value = text;
      this.updateTypesetOverlay();
      this.updateCaret();
      this.state.setText(text);
      const curr = this.sessions.get(this.activeSessionId);
      if (curr) {
        curr.savedContent = text;
      }
    }
  }

  public getText(): string {
    return this.textarea ? this.textarea.value : this.savedContent;
  }

  public getDocumentName(): string {
    return this.currentFileName;
  }

  public setDocumentName(name: string): void {
    this.currentFileName = name;
    const curr = this.sessions.get(this.activeSessionId);
    if (curr) {
      curr.name = name;
    }
    this.updateFileInfo();
    this.updateSessionTabs();
    if (this.paneContainer) {
      const layout = this.paneContainer.getLayout();
      updateDocumentTabTitles(layout.root, this.activeSessionId, name, new Set(this.sessions.keys()));
      this.paneContainer.saveLayout();
      this.paneContainer.render();
    }
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
    const res = await FileManager.openFile();
    if (!res) return null;

    if (!this.activeWorkspace) {
      const ws = WorkspaceManager.createSyntheticWorkspace(res.name, res.content, res.handle);
      this.openWorkspace(ws, res.name);
      return res;
    }

    // Active workspace exists: add file to workspace
    this.activeWorkspace.files.set(res.name, res.content);
    WorkspaceManager.notifyChange(this.activeWorkspace);

    const curr = this.sessions.get(this.activeSessionId);
    let targetSessionId = '';
    if (curr && curr.name === 'untitled.ax' && !curr.isDirty && curr.state.getText().trim() === '') {
      curr.name = res.name;
      curr.handle = res.handle;
      curr.savedContent = res.recovered ? '' : res.content;
      curr.isDirty = res.isDirty;
      this.currentFileName = res.name;
      this.currentFileHandle = res.handle;
      this.savedContent = curr.savedContent;
      this.isDirty = curr.isDirty;
      this.setText(res.content);
      this.updateFileInfo();
      this.updateRecentFilesMenu();
      this.updateSessionTabs();
      targetSessionId = curr.id;
    } else {
      const sess = this.createSession(res.name, res.content, res.handle);
      sess.savedContent = res.recovered ? '' : res.content;
      sess.isDirty = res.isDirty;
      this.switchToSession(sess.id);
      this.updateRecentFilesMenu();
      targetSessionId = sess.id;
    }

    if (this.welcomeScreen) {
      this.welcomeScreen.dispose();
      this.welcomeScreen = null;
    }

    if (this.paneContainer) {
      const layout = this.paneContainer.getLayout();
      const leaves = getAllLeaves(layout.root);
      const activeLeaf = findLeaf(layout.root, layout.activePaneId) || leaves[0];
      if (activeLeaf) {
        const existingTab = activeLeaf.tabs.find(t => t.documentId === targetSessionId || (t.type === 'document' && t.title === 'untitled.ax'));
        if (existingTab && curr && targetSessionId === curr.id) {
          existingTab.title = res.name;
          existingTab.documentId = targetSessionId;
          activeLeaf.activeTabId = existingTab.id;
        } else {
          this.paneContainer.openTab({
            id: 'tab_doc_' + Math.random().toString(36).substring(2, 9),
            type: 'document',
            title: res.name,
            documentId: targetSessionId,
          }, activeLeaf.id);
        }
      }
      this.paneContainer.updateTreePanes();
      this.paneContainer.render();
    }

    return res;
  }

  public async saveDocument(): Promise<SaveFileResult> {
    const text = this.textarea ? this.textarea.value : this.savedContent;
    if (this.activeWorkspace) {
      await WorkspaceManager.writeFile(this.activeWorkspace, this.currentFileName, text);
      this.savedContent = text;
      this.isDirty = false;
      const curr = this.sessions.get(this.activeSessionId);
      if (curr) {
        curr.savedContent = text;
        curr.isDirty = false;
      }
      this.updateFileInfo();
      this.updateRecentFilesMenu();
      this.updateSessionTabs();
      this.paneContainer?.render();
      return {
        success: true,
        name: this.currentFileName,
        handle: undefined,
        isDirty: false,
        apiUsed: 'file-system-access',
      };
    }

    const res = await FileManager.saveFile(this.currentFileName, text, this.currentFileHandle);
    if (res.success) {
      this.currentFileName = res.name;
      this.currentFileHandle = res.handle;
      this.savedContent = text;
      this.isDirty = false;
      const curr = this.sessions.get(this.activeSessionId);
      if (curr) {
        curr.name = res.name;
        curr.handle = res.handle;
        curr.savedContent = text;
        curr.isDirty = false;
      }
      this.updateFileInfo();
      this.updateRecentFilesMenu();
      this.updateSessionTabs();
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
      const curr = this.sessions.get(this.activeSessionId);
      if (curr) {
        curr.name = res.name;
        curr.handle = res.handle;
        curr.savedContent = text;
        curr.isDirty = false;
      }
      this.updateFileInfo();
      this.updateRecentFilesMenu();
      this.updateSessionTabs();
    }
    return res;
  }

  public setDiskFiles(files: Record<string, string>): void {
    const curr = this.sessions.get(this.activeSessionId);
    if (curr) {
      curr.diskFiles = { ...files };
    }
    this.state.setDiskFiles(files);
  }

  public clearDiskFiles(): void {
    const curr = this.sessions.get(this.activeSessionId);
    if (curr) {
      curr.diskFiles = undefined;
    }
    this.state.clearDiskFiles();
  }

  public newDocument(): void {
    const sess = this.createSession('untitled.ax', '');
    this.switchToSession(sess.id);
  }

  public preparePrintView(): void {
    const printView = this.container.querySelector('#doc-print-view');
    if (!printView) return;
    const text = this.textarea ? this.textarea.value : '';
    const records = this.state.getRecords();
    const { frontMatter } = parseFrontMatter(text);
    const firstLineComment = records[0]?.text.trim().startsWith('#') ? records[0].text.trim().replace(/^#+\s*/, '') : '';
    const title = frontMatter.title || firstLineComment || this.currentFileName.replace(/\.ax$/, '') || 'Axine Document';
    const isStepsCollapsed = frontMatter.steps === 'collapsed';

    let html = `
      <div class="doc-print-header">
        <div class="doc-print-title">${escapeHtml(title)}</div>
        <div class="doc-print-meta">
          ${frontMatter.course ? `<span><strong>Course:</strong> ${escapeHtml(frontMatter.course)}</span>` : ''}
          ${frontMatter.author ? `<span><strong>Author:</strong> ${escapeHtml(frontMatter.author)}</span>` : ''}
          ${frontMatter.date ? `<span><strong>Date:</strong> ${escapeHtml(frontMatter.date)}</span>` : ''}
        </div>
      </div>
    `;

    let inFm = text.split('\n')[0]?.trim() === '---';
    let fmDone = !inFm;

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      const raw = rec?.text ?? '';
      if (!fmDone) {
        if (i > 0 && raw.trim() === '---') fmDone = true;
        continue;
      }

      const trimmed = raw.trim();

      if (trimmed.startsWith('### ')) {
        html += `<h3 class="doc-print-h3">${escapeHtml(trimmed.slice(4))}</h3>`;
        continue;
      }
      if (trimmed.startsWith('## ')) {
        html += `<h2 class="doc-print-h2">${escapeHtml(trimmed.slice(3))}</h2>`;
        continue;
      }
      if (trimmed.startsWith('#')) {
        const commentText = trimmed.replace(/^#+\s*/, '');
        html += `<div class="doc-print-prose">${escapeHtml(commentText)}</div>`;
        continue;
      }
      if (!trimmed) {
        html += `<div class="doc-print-empty-line" style="height:8px;"></div>`;
        continue;
      }

      let resHtml = '';
      if (rec?.result) {
        if (rec.result.type === 'space') {
          const spaceVal = rec.result as SpaceValue;
          if (spaceVal.dimension > 0 || spaceVal.entities.length > 0) {
            const svg = renderSVGSpaceToString(spaceVal, { width: 580, height: 260, theme: 'light' });
            resHtml = `<div class="doc-print-plot">${svg}</div>`;
          } else if (spaceVal.resultVal) {
            const formatted = this.formatValue(spaceVal.resultVal);
            const typeset = typesetMath(formatted, { displayMode: false, inlineFractions: true });
            resHtml = `<div class="doc-print-math">${typeset}</div>`;
          }
        } else if (rec.result.type === 'derivation') {
          if (isStepsCollapsed) {
            const formatted = this.formatValue(rec.result);
            const typeset = typesetMath(formatted, { displayMode: false, inlineFractions: true });
            resHtml = `<div class="doc-print-math">${typeset}</div>`;
          } else {
            resHtml = `<div class="doc-print-derivation">${this.renderDerivationFull(rec.result as DerivationValue, { displayMode: false, inlineFractions: true })}</div>`;
          }
        } else if (rec.result.type === 'check_result') {
          if (isStepsCollapsed) {
            const formatted = this.formatValue(rec.result);
            const typeset = typesetMath(formatted, { displayMode: false, inlineFractions: true });
            resHtml = `<div class="doc-print-math">${typeset}</div>`;
          } else {
            resHtml = `<div class="doc-print-derivation">${this.renderCheckResultFull(rec.result, { displayMode: false, inlineFractions: true })}</div>`;
          }
        } else {
          const formatted = this.formatValue(rec.result);
          const typeset = typesetMath(formatted, { displayMode: false, inlineFractions: true });
          resHtml = `<div class="doc-print-math">${typeset}</div>`;
        }
      } else if (rec?.error) {
        resHtml = `<div class="doc-print-error" style="color:#d32f2f;">${escapeHtml(rec.error.message)}</div>`;
      }

      const typesetSource = typesetSourceLine(raw, { displayMode: false, inlineFractions: true });

      html += `
        <div class="doc-print-line-row">
          <div class="doc-print-source">${typesetSource}</div>
          ${resHtml ? `<div class="doc-print-result">${resHtml}</div>` : ''}
        </div>
      `;
    }

    printView.innerHTML = html;
  }

  public exportHtml(): void {
    const text = this.textarea ? this.textarea.value : '';
    const records = this.state.getRecords();
    const currentTheme = (typeof document !== 'undefined' && document.documentElement?.getAttribute('data-theme') === 'light') ? 'light' : 'dark';
    const html = exportToHtml(this.currentFileName, text, records, currentTheme);
    const exportName = this.currentFileName.replace(/\.ax$/, '') + '.html';

    if (typeof document !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  public exportMarkdown(): void {
    const text = this.textarea ? this.textarea.value : '';
    const records = this.state.getRecords();
    const { markdown } = exportToMarkdown(this.currentFileName, text, records);
    const exportName = this.currentFileName.replace(/\.ax$/, '') + '.md';

    if (typeof document !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  public printPdf(): void {
    this.preparePrintView();
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  }

  public updateDirtyIndicator(): void {
    if (this.dirtyBadgeEl) {
      this.dirtyBadgeEl.classList.toggle('hidden', !this.isDirty);
    }
    if (typeof document !== 'undefined') {
      document.title = `${this.isDirty ? '* ' : ''}${this.currentFileName}`;
    }
  }

  public updateFileInfo(): void {
    if (this.fileNameEl) {
      this.fileNameEl.textContent = this.currentFileName;
    }
    this.updateDirtyIndicator();
    if (this.paneContainer) {
      const layout = this.paneContainer.getLayout();
      updateDocumentTabTitles(layout.root, this.activeSessionId, this.currentFileName, new Set(this.sessions.keys()));
      this.paneContainer.saveLayout();
      this.paneContainer.render();
    }
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

  private closeAllDropdowns(): void {
    this.container.querySelectorAll('.doc-file-dropdown, .doc-dock-dropdown').forEach(el => {
      el.classList.add('hidden');
    });
  }

  private buildUI(initialText?: string) {
    const rawText = initialText ?? '';
    this.container.innerHTML = `
      <div class="doc-app-shell">
        <header class="doc-header">
          <div class="doc-brand" title="Axine">
            <img class="doc-logo-img" src="/logo.png" alt="Axine" />
          </div>

          <div class="doc-file-menu-wrapper">
            <button id="doc-file-menu-btn" class="doc-btn" title="File">
              File
              <svg width="8" height="8" viewBox="0 0 12 12" fill="currentColor"><path d="M2 4L6 8L10 4Z" /></svg>
            </button>
            <div id="doc-file-dropdown" class="doc-file-dropdown hidden">
              <button id="doc-new-file-btn" class="doc-file-menu-item">
                <span>New file</span>
              </button>
              <button id="doc-open-file-btn" class="doc-file-menu-item">
                <span>Open File...</span>
                <span class="doc-file-menu-shortcut">Cmd+O</span>
              </button>
              <button id="doc-open-folder-btn" class="doc-file-menu-item">
                <span>Open Folder...</span>
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
              <button id="doc-close-workspace-btn" class="doc-file-menu-item">
                <span>Close Workspace</span>
              </button>
              <button id="doc-clear-file-btn" class="doc-file-menu-item">
                <span>Clear document</span>
              </button>
              <button id="doc-copy-file-btn" class="doc-file-menu-item">
                <span>Copy document</span>
                <span class="doc-file-menu-shortcut">Cmd+A, Cmd+C</span>
              </button>
              <div class="doc-file-menu-divider"></div>
              <div class="doc-file-menu-section-title">Export</div>
              <button id="doc-export-html-btn" class="doc-file-menu-item">
                <span>Export HTML...</span>
              </button>
              <button id="doc-export-pdf-btn" class="doc-file-menu-item">
                <span>Print / PDF...</span>
                <span class="doc-file-menu-shortcut">Cmd+P</span>
              </button>
              <button id="doc-export-md-btn" class="doc-file-menu-item">
                <span>Export Markdown...</span>
              </button>
              <div class="doc-file-menu-divider"></div>
              <div class="doc-file-menu-section-title">Recent files</div>
              <div id="doc-recent-files-list"></div>
            </div>
            <span id="doc-dirty-badge" class="doc-dirty-badge ${this.isDirty ? '' : 'hidden'}" style="display:none"></span>
          </div>

          <div class="doc-file-menu-wrapper doc-view-menu-wrapper">
            <button id="doc-view-menu-btn" class="doc-btn" title="View">
              + View
              <svg width="8" height="8" viewBox="0 0 12 12" fill="currentColor"><path d="M2 4L6 8L10 4Z" /></svg>
            </button>
            <div id="doc-view-dropdown" class="doc-file-dropdown hidden"></div>
          </div>

          <div class="doc-file-menu-wrapper doc-mode-menu-wrapper">
            <button id="doc-mode-toggle-btn" class="doc-btn" title="Toggle Document Flow / Raw Editor">
              ${this.editorMode === 'block' ? 'Raw Editor' : 'Document Flow'}
            </button>
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
            <button id="doc-run-btn" class="doc-btn doc-btn-runnable" title="Run (Cmd+Enter)">
              ${ICONS.run} Run
            </button>
          </div>
          <div class="doc-toolbar-right">
            <span id="doc-stats-badge" class="doc-stats-badge">Ready</span>
            <button id="doc-theme-btn" class="doc-btn doc-btn-icon" title="Theme">
              ${ICONS.sun}
            </button>
          </div>
        </header>

        <main id="doc-workspace" class="doc-workspace" data-dock="right">
          <div class="doc-pane-left">
            <div id="doc-print-view" class="doc-print-view"></div>
            <div id="doc-line-numbers" class="doc-line-numbers ${this.editorMode === 'block' ? 'hidden' : ''}"></div>
            <div id="doc-block-editor" class="doc-block-editor ${this.editorMode === 'block' ? '' : 'hidden'}"></div>
            <div class="doc-editor-surface ${this.editorMode === 'block' ? 'hidden' : ''}">
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

          <div id="doc-splitter" class="doc-splitter" title="Resize panel"></div>

          <div id="doc-panel-edge-affordance" class="doc-panel-edge-affordance" title="Show panel (Cmd+B)"></div>

          <div id="doc-work-panel" class="doc-work-panel">
            <div class="doc-work-panel-header">
              <div class="doc-work-panel-tabs">
                <button class="doc-tab-btn active" data-tab="results">Results</button>
                <button class="doc-tab-btn" data-tab="scope">Scope</button>
                <button class="doc-tab-btn" data-tab="trace">Trace & Fuel</button>
                <button class="doc-tab-btn" data-tab="frames">Frames</button>
              </div>
              <div class="doc-dock-menu-wrapper">
                <button id="doc-dock-menu-btn" class="doc-dock-menu-btn" title="Dock (Cmd+Shift+D)">
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
                  <button class="doc-dock-collapse-btn" title="Collapse panel (Cmd+B)">Hide Panel</button>
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
    this.statsBadge = this.container.querySelector('#doc-stats-badge') as HTMLElement;
    this.scopePanelEl = this.container.querySelector('#doc-scope-list') as HTMLElement;
    this.framesPanelEl = this.container.querySelector('#doc-frames-list') as HTMLElement;
    this.fileNameEl = this.container.querySelector('#doc-file-name') as HTMLElement;
    this.dirtyBadgeEl = this.container.querySelector('#doc-dirty-badge') as HTMLElement;

    this.updateTypesetOverlay();
    this.updateCaret();
    this.updateFileInfo();

    const blockEditorEl = this.container.querySelector('#doc-block-editor') as HTMLElement;
    if (blockEditorEl) {
      this.blockEditor = new BlockDocumentEditor(blockEditorEl, rawText, {
        onChange: (newText: string) => {
          if (this.textarea && this.textarea.value !== newText) {
            this.textarea.value = newText;
            this.handleInputChange(true);
          }
        },
      });
    }

    if (this.container) {
      this.autocomplete = new AutocompleteController(this.container, () => this.handleInputChange());
    }
  }

  public setEditorMode(mode: 'block' | 'classic'): void {
    this.editorMode = mode;
    const blockEl = this.container.querySelector('#doc-block-editor') as HTMLElement;
    const surfaceEl = this.container.querySelector('.doc-editor-surface') as HTMLElement;
    const lineNumsEl = this.container.querySelector('#doc-line-numbers') as HTMLElement;
    const btn = this.container.querySelector('#doc-mode-toggle-btn') as HTMLElement;

    if (mode === 'block') {
      blockEl?.classList.remove('hidden');
      surfaceEl?.classList.add('hidden');
      lineNumsEl?.classList.add('hidden');
      if (btn) btn.textContent = 'Raw Editor';
      if (this.blockEditor && this.textarea) {
        this.blockEditor.setText(this.textarea.value);
      }
    } else {
      blockEl?.classList.add('hidden');
      surfaceEl?.classList.remove('hidden');
      lineNumsEl?.classList.remove('hidden');
      if (btn) btn.textContent = 'Document Flow';
      if (this.blockEditor && this.textarea) {
        this.textarea.value = this.blockEditor.getText();
        this.handleInputChange(true);
      }
    }
  }

  public getEditorMode(): 'block' | 'classic' {
    return this.editorMode;
  }

  private handleInputChange(skipBlockSync: boolean = false) {
    if (!skipBlockSync && this.blockEditor && this.textarea) {
      if (this.blockEditor.getText() !== this.textarea.value) {
        this.blockEditor.setText(this.textarea.value);
      }
    }
    this.updateTypesetOverlay();
    this.updateCaret();
    this.isDirty = this.textarea.value !== this.savedContent;
    const curr = this.sessions.get(this.activeSessionId);
    if (curr) {
      curr.isDirty = this.isDirty;
    }
    this.updateDirtyIndicator();
    this.updateSessionTabs();
    this.scheduleAutosave();
    this.state.setText(this.textarea.value);
  }

  private bindTopBarAndGlobalEvents() {
    // New Tab Button
    const newTabBtn = this.container.querySelector('#doc-session-new-tab-btn');
    newTabBtn?.addEventListener('click', () => {
      this.newDocument();
    });

    // Mode Toggle Button
    const modeBtn = this.container.querySelector('#doc-mode-toggle-btn');
    modeBtn?.addEventListener('click', () => {
      this.setEditorMode(this.editorMode === 'block' ? 'classic' : 'block');
    });

    // File Menu dropdown toggle
    const fileMenuBtn = this.container.querySelector('#doc-file-menu-btn');
    const fileDropdown = this.container.querySelector('#doc-file-dropdown');
    const viewMenuBtn = this.container.querySelector('#doc-view-menu-btn');
    const viewDropdown = this.container.querySelector('#doc-view-dropdown') as HTMLElement;

    if (fileMenuBtn && fileDropdown) {
      fileMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        viewDropdown?.classList.add('hidden');
        this.updateRecentFilesMenu();
        fileDropdown.classList.toggle('hidden');
      });
      document.addEventListener('click', (e) => {
        if (!fileDropdown.contains(e.target as Node) && !fileMenuBtn.contains(e.target as Node)) {
          fileDropdown.classList.add('hidden');
        }
      });
    }

    if (viewMenuBtn && viewDropdown) {
      viewMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileDropdown?.classList.add('hidden');
        if (this.paneContainer) {
          this.paneContainer.populateNewTabMenu(viewDropdown);
        }
        viewDropdown.classList.toggle('hidden');
      });
      document.addEventListener('click', (e) => {
        if (!viewDropdown.contains(e.target as Node) && !viewMenuBtn.contains(e.target as Node)) {
          viewDropdown.classList.add('hidden');
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

    const openFolderBtn = this.container.querySelector('#doc-open-folder-btn');
    openFolderBtn?.addEventListener('click', async () => {
      fileDropdown?.classList.add('hidden');
      const ws = await WorkspaceManager.openDirectoryPicker();
      if (ws) {
        this.openWorkspace(ws);
      }
    });

    const closeWsBtn = this.container.querySelector('#doc-close-workspace-btn');
    closeWsBtn?.addEventListener('click', () => {
      fileDropdown?.classList.add('hidden');
      this.closeWorkspace();
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

    const exportHtmlBtn = this.container.querySelector('#doc-export-html-btn');
    exportHtmlBtn?.addEventListener('click', () => {
      fileDropdown?.classList.add('hidden');
      this.exportHtml();
    });

    const exportPdfBtn = this.container.querySelector('#doc-export-pdf-btn');
    exportPdfBtn?.addEventListener('click', () => {
      fileDropdown?.classList.add('hidden');
      this.printPdf();
    });

    const exportMdBtn = this.container.querySelector('#doc-export-md-btn');
    exportMdBtn?.addEventListener('click', () => {
      fileDropdown?.classList.add('hidden');
      this.exportMarkdown();
    });

    // Work Panel Tabs Switcher
    const tabButtons = this.container.querySelectorAll('.doc-tab-btn');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        tabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = (btn as HTMLElement).getAttribute('data-tab') as any;
        this.activeTab = tab;
        const curr = this.sessions.get(this.activeSessionId);
        if (curr) {
          curr.activeTab = tab;
        }
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
        if (!dockDropdown.contains(e.target as Node) && !dockMenuBtn.contains(e.target as Node)) {
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
      // Cmd+A / Ctrl+A : Document-wide select all in block mode
      if ((e.key === 'a' || e.key === 'A') && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        if (this.editorMode === 'block' && this.blockEditor) {
          const el = document.activeElement as HTMLElement;
          const isInput =
            el instanceof HTMLInputElement ||
            el instanceof HTMLTextAreaElement ||
            el?.tagName?.toLowerCase() === 'math-field' ||
            Boolean(el?.closest?.('math-field'));
          if (!isInput) {
            e.preventDefault();
            this.blockEditor.selectAll();
            return;
          }
        }
      }
      // Cmd+W / Ctrl+W : Close Tab
      if ((e.key === 'w' || e.key === 'W') && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        this.closeSession(this.activeSessionId);
      }
      // Cmd+T / Ctrl+T or Cmd+N / Ctrl+N : New Document Tab
      if (((e.key === 't' || e.key === 'T') || (e.key === 'n' || e.key === 'N')) && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        this.newDocument();
      }
      // Ctrl+Tab / Ctrl+Shift+Tab : Cycle Document Tabs
      if (e.key === 'Tab' && e.ctrlKey) {
        e.preventDefault();
        if (this.sessionOrder.length > 1) {
          const currentIdx = this.sessionOrder.indexOf(this.activeSessionId);
          const delta = e.shiftKey ? -1 : 1;
          const nextIdx = (currentIdx + delta + this.sessionOrder.length) % this.sessionOrder.length;
          this.switchToSession(this.sessionOrder[nextIdx]);
        }
      }
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
      // Cmd+P / Ctrl+P : Print / PDF Export
      if ((e.key === 'p' || e.key === 'P') && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        this.printPdf();
      }
      // Cmd+B / Ctrl+B : Toggle collapse
      if ((e.key === 'b' || e.key === 'B') && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        this.togglePanelCollapse();
      }
      // Cmd+\ / Ctrl+\ : Split Active Pane Right
      if ((e.key === '\\' || e.code === 'Backslash') && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        this.paneContainer?.splitActiveTab('horizontal', 'after');
      }
      // Cmd+Shift+\ / Ctrl+Shift+\ : Split Active Pane Down
      if ((e.key === '\\' || e.key === '|' || e.code === 'Backslash') && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        this.paneContainer?.splitActiveTab('vertical', 'after');
      }
      // Cmd+Shift+D / Ctrl+Shift+D / Alt+D : Cycle dock edge
      if ((e.key === 'd' || e.key === 'D') && ((e.metaKey && e.shiftKey) || (e.ctrlKey && e.shiftKey) || e.altKey)) {
        e.preventDefault();
        this.cycleDockEdge();
      }
      // Cmd+Enter / Ctrl+Enter : Run / Stop
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const runBtn = this.container.querySelector('#doc-run-btn') as HTMLButtonElement;
        runBtn?.click();
      }
    });

    window.addEventListener('beforeunload', (e: BeforeUnloadEvent) => {
      if (this.isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    // Run / Stop (merged into #doc-run-btn)
    const runBtn = this.container.querySelector('#doc-run-btn') as HTMLButtonElement;
    const budgetSelect = this.container.querySelector('#budget-select') as HTMLSelectElement;
    runBtn?.addEventListener('click', () => {
      if (this.state.getIsInvokedRunning()) {
        this.state.stop();
        this.renderWorkPanel(this.state.getRecords(), false);
        return;
      }
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

    // Clear button (in File menu)
    const clearFileBtn = this.container.querySelector('#doc-clear-file-btn') as HTMLButtonElement;
    clearFileBtn?.addEventListener('click', () => {
      this.closeAllDropdowns();
      if (this.textarea) {
        this.textarea.value = '';
        this.updateTypesetOverlay();
        this.updateCaret();
        this.state.setText('');
      }
      if (this.blockEditor) {
        this.blockEditor.setText('');
      }
    });

    // Copy document button (in File menu)
    const copyFileBtn = this.container.querySelector('#doc-copy-file-btn') as HTMLButtonElement;
    copyFileBtn?.addEventListener('click', async () => {
      this.closeAllDropdowns();
      const text = this.blockEditor ? this.blockEditor.getText() : (this.textarea ? this.textarea.value : '');
      try {
        await navigator.clipboard.writeText(text);
      } catch {}
      const label = copyFileBtn.querySelector('span');
      if (label) {
        const orig = label.textContent;
        label.textContent = 'Copied!';
        setTimeout(() => { label.textContent = orig; }, 1500);
      }
    });

    // Theme Toggle Button
    const themeBtn = this.container.querySelector('#doc-theme-btn') as HTMLButtonElement;
    themeBtn?.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', nextTheme);
      if (themeBtn) {
        themeBtn.innerHTML = nextTheme === 'light' ? ICONS.moon : ICONS.sun;
      }
      localStorage.setItem('math_notebook_theme', nextTheme);
      this.lineViewports.forEach(p => p.render());
      this.pinnedViewports.forEach(p => p.render());
      this.paneContainer?.getAllSpaceViewports().forEach(p => p.render());
    });

    // Multi-edge Draggable Splitter
    const splitter = this.container.querySelector('#doc-splitter') as HTMLElement;
    let isDragging = false;

    splitter?.addEventListener('mousedown', () => {
      isDragging = true;
      const isHorizontal = this.dockLayout.edge === 'bottom' || this.dockLayout.edge === 'top';
      document.body.style.cursor = isHorizontal ? 'row-resize' : 'col-resize';
      document.body.style.userSelect = 'none';
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isSurfaceDragging && this.textarea && this.overlayEl) {
        const currOffset = this.getOffsetFromMouseEvent(e);
        const start = Math.min(this.surfaceDragStartOffset, currOffset);
        const end = Math.max(this.surfaceDragStartOffset, currOffset);
        const dir = currOffset < this.surfaceDragStartOffset ? 'backward' : 'forward';
        this.textarea.setSelectionRange(start, end, dir);
        this.updateCaret();
      }

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
      if (this.isSurfaceDragging) {
        this.isSurfaceDragging = false;
      }
      if (isDragging) {
        isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        this.saveDockLayout();
        this.applyDockLayout();
      }
    });

    document.addEventListener('selectionchange', () => {
      if (document.activeElement === this.textarea) {
        this.updateCaret();
      }
    });
  }

  private bindEditorSurfaceEvents() {
    if (!this.textarea) return;
    if ((this.textarea as any).__axineEventsBound) return;
    (this.textarea as any).__axineEventsBound = true;

    this.textarea.addEventListener('beforeinput', (e: InputEvent) => {
      const data = (e as any).data;
      if (data && typeof data === 'string') {
        let hasUnicode = false;
        for (let i = 0; i < data.length; i++) {
          if (UNICODE_MATH_MAP[data[i]]) {
            hasUnicode = true;
            break;
          }
        }
        if (hasUnicode) {
          e.preventDefault();
          const transformed = replaceUnicodeMathSymbols(data);
          let inserted = false;
          try {
            if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
              inserted = document.execCommand('insertText', false, transformed);
            }
          } catch {}
          if (!inserted) {
            const start = this.textarea.selectionStart;
            const end = this.textarea.selectionEnd;
            const val = this.textarea.value;
            this.textarea.value = val.substring(0, start) + transformed + val.substring(end);
            this.textarea.selectionStart = this.textarea.selectionEnd = start + transformed.length;
            this.handleInputChange();
          }
        }
      }
    });

    this.textarea.addEventListener('paste', (e: ClipboardEvent) => {
      const pasteText = e.clipboardData?.getData('text');
      if (pasteText) {
        let hasUnicode = false;
        for (let i = 0; i < pasteText.length; i++) {
          if (UNICODE_MATH_MAP[pasteText[i]]) {
            hasUnicode = true;
            break;
          }
        }
        if (hasUnicode) {
          e.preventDefault();
          const transformed = replaceUnicodeMathSymbols(pasteText);
          let inserted = false;
          try {
            if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
              inserted = document.execCommand('insertText', false, transformed);
            }
          } catch {}
          if (!inserted) {
            const start = this.textarea.selectionStart;
            const end = this.textarea.selectionEnd;
            const val = this.textarea.value;
            this.textarea.value = val.substring(0, start) + transformed + val.substring(end);
            this.textarea.selectionStart = this.textarea.selectionEnd = start + transformed.length;
            this.handleInputChange();
          }
        }
      }
    });

    this.textarea.addEventListener('input', () => {
      const val = this.textarea.value;
      let hasUnicode = false;
      for (let i = 0; i < val.length; i++) {
        if (UNICODE_MATH_MAP[val[i]]) {
          hasUnicode = true;
          break;
        }
      }
      if (hasUnicode) {
        const start = this.textarea.selectionStart;
        const beforeCaret = val.substring(0, start);
        const transformedBeforeCaret = replaceUnicodeMathSymbols(beforeCaret);
        const transformed = replaceUnicodeMathSymbols(val);
        this.textarea.value = transformed;
        this.textarea.selectionStart = this.textarea.selectionEnd = transformedBeforeCaret.length;
      }
      this.handleInputChange();
      if (this.autocomplete) {
        this.autocomplete.checkPrefix(this.getAutocompleteTarget());
      }
    });

    this.textarea.addEventListener('keydown', (e: KeyboardEvent) => {
      if (this.autocomplete && this.autocomplete.handleKeydown(e, this.getAutocompleteTarget())) {
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.textarea.selectionStart;
        const end = this.textarea.selectionEnd;
        this.textarea.value = this.textarea.value.substring(0, start) + '  ' + this.textarea.value.substring(end);
        this.textarea.selectionStart = this.textarea.selectionEnd = start + 2;
        this.updateTypesetOverlay();
        this.updateCaret();
        this.isDirty = this.textarea.value !== this.savedContent;
        const curr = this.sessions.get(this.activeSessionId);
        if (curr) {
          curr.isDirty = this.isDirty;
        }
        this.updateDirtyIndicator();
        this.updateSessionTabs();
        this.scheduleAutosave();
        this.state.setText(this.textarea.value);
      }
    });

    this.textarea.addEventListener('scroll', () => {
      const scrollTop = this.textarea.scrollTop;
      const scrollLeft = this.textarea.scrollLeft;
      if (this.lineNumbersEl) this.lineNumbersEl.scrollTop = scrollTop;
      if (this.gutterEl) {
        const taMaxScroll = this.textarea.scrollHeight - this.textarea.clientHeight;
        const gutterMaxScroll = this.gutterEl.scrollHeight - this.gutterEl.clientHeight;
        if (taMaxScroll > 0 && gutterMaxScroll > 0) {
          const ratio = scrollTop / taMaxScroll;
          this.gutterEl.scrollTop = ratio * gutterMaxScroll;
        } else {
          this.gutterEl.scrollTop = scrollTop;
        }
        this.renderGutterSlice();
      }
      if (this.overlayEl) {
        this.overlayEl.scrollTop = scrollTop;
        this.overlayEl.scrollLeft = scrollLeft;
      }
      const session = this.sessions.get(this.activeSessionId);
      if (session) {
        session.scrollPosition = { scrollTop, scrollLeft };
      }
      this.updateCaret();
    });

    this.textarea.addEventListener('focus', () => this.updateCaret());
    this.textarea.addEventListener('blur', () => this.updateCaret());
    this.textarea.addEventListener('select', () => this.updateCaret());
    this.textarea.addEventListener('keyup', () => this.updateCaret());
    this.textarea.addEventListener('click', () => this.updateCaret());

    this.bindSurfaceMouseEvents();
  }

  private getAutocompleteTarget(): AutocompleteTarget {
    return {
      getValue: () => this.textarea?.value || '',
      setValue: (v: string) => {
        if (this.textarea) {
          this.textarea.value = v;
          this.handleInputChange();
        }
      },
      getSelectionStart: () => this.textarea?.selectionStart || 0,
      setSelection: (start: number, end: number) => {
        if (this.textarea) {
          this.textarea.selectionStart = start;
          this.textarea.selectionEnd = end;
          this.updateCaret();
        }
      },
      getCaretCoordinates: () => {
        if (this.caretEl) {
          const left = parseFloat(this.caretEl.style.left || '0');
          const top = parseFloat(this.caretEl.style.top || '0');
          return { x: left, y: top + 24 };
        }
        return { x: 50, y: 50 };
      }
    };
  }

  private getOffsetFromMouseEvent(e: MouseEvent): number {
    if (!this.overlayEl || !this.textarea) return 0;
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
  }

  private bindSurfaceMouseEvents() {
    const surface = this.container.querySelector('.doc-editor-surface') as HTMLElement;
    if (!surface) return;

    surface.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.textarea?.focus();

      this.surfaceDragStartOffset = this.getOffsetFromMouseEvent(e);
      this.textarea?.setSelectionRange(this.surfaceDragStartOffset, this.surfaceDragStartOffset);
      this.updateCaret();
      this.isSurfaceDragging = true;
    });

    surface.addEventListener('dblclick', (e: MouseEvent) => {
      e.preventDefault();
      const offset = this.getOffsetFromMouseEvent(e);
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
    const runBtn = this.container.querySelector('#doc-run-btn') as HTMLButtonElement;
    if (runBtn) {
      if (this.state.getIsInvokedRunning()) {
        runBtn.className = 'doc-btn doc-btn-running';
        runBtn.innerHTML = `${ICONS.stop} Stop`;
        runBtn.title = 'Cancel running execution';
      } else if (isEvaluating) {
        runBtn.className = 'doc-btn doc-btn-running';
        runBtn.innerHTML = `${ICONS.stop} Stop`;
        runBtn.title = 'Cancel execution';
      } else {
        runBtn.className = 'doc-btn doc-btn-runnable';
        runBtn.innerHTML = `${ICONS.run} Run`;
        runBtn.title = 'Execute current document (Cmd+Enter / Ctrl+Enter)';
      }
    }

    if (this.statsBadge) {
      this.statsBadge.textContent = `${this.state.getLastDurationMs()} ms (${records.length} lines)`;
    }

    const activePanel = this.container.querySelector(`#tab-${this.activeTab}-panel`);
    if (activePanel && !activePanel.classList.contains('active')) {
      this.container.querySelectorAll('.doc-tab-content').forEach(p => p.classList.remove('active'));
      activePanel.classList.add('active');
    }

    // 1. Line Numbers
    if (this.lineNumbersEl) {
      let lineNumsHtml = '';
      for (let i = 0; i < records.length; i++) {
        lineNumsHtml += `<div class="doc-line-num">${i + 1}</div>`;
      }
      this.lineNumbersEl.innerHTML = lineNumsHtml;
    }

    // Clean up viewports for lines that are no longer spaces or are collapsed
    for (const [lineIdx, vp] of this.lineViewports.entries()) {
      const rec = records[lineIdx];
      if (!rec || !rec.result || rec.result.type !== 'space' || this.collapsedLines.has(lineIdx)) {
        vp.dispose();
        this.lineViewports.delete(lineIdx);
      }
    }
    this.pinnedViewports.forEach(p => p.dispose());
    this.pinnedViewports.clear();
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

        // Instantiate pinned viewports
        this.pinnedLines.forEach(lineIdx => {
          const rec = records[lineIdx];
          if (rec && rec.result && rec.result.type === 'space') {
            const spaceContainer = pinnedContainer.querySelector(`.doc-pinned-space-container[data-line="${lineIdx}"]`) as HTMLElement;
            if (spaceContainer) {
              const vp = new SpaceViewport(spaceContainer, rec.result as SpaceValue, this.viewportOptionsForLine(lineIdx));
              this.pinnedViewports.set(lineIdx, vp);
            }
          }
        });
      }
    }

    // 3. Results Gutter with inline visuals
    const activeSymbols: Map<string, { type: string; value: string; line: number; isShadowed?: boolean }> = new Map();

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      if (rec.boundName && rec.result) {
        activeSymbols.set(rec.boundName, {
          type: rec.result.type,
          value: this.formatValue(rec.result),
          line: i + 1,
          isShadowed: rec.isShadowed,
        });
      }

      if (rec.result && (rec.result.type === 'space' || rec.result.type === 'matrix' || rec.result.type === 'claim')) {
        this.addFrame(i + 1, rec.result);
      }
    }

    // Update space values by line and track dependent modifications
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      if (rec && rec.result && rec.result.type === 'space') {
        const spaceVal = rec.result as SpaceValue;
        const oldSpace = this.spaceValuesByLine.get(i);
        this.spaceValuesByLine.set(i, spaceVal);
        if (oldSpace && oldSpace !== spaceVal && this.lineViewports.has(i)) {
          this.pendingSpaceUpdates.add(i);
        }
      } else {
        this.spaceValuesByLine.delete(i);
        this.pendingSpaceUpdates.delete(i);
      }
    }

    if (this.gutterEl) {
      this.cachedGutterRecords = records;
      this.renderGutterSlice(true);
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
    if (this.scopePanelEl) {
      let scopeHtml = '';
      if (activeSymbols.size === 0) {
        scopeHtml = `<div class="doc-scope-empty">No definitions in scope</div>`;
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
    }

    // 5. Trace Tab
    const durationEl = this.container.querySelector('#trace-duration');
    const lineCountEl = this.container.querySelector('#trace-line-count');
    if (durationEl) durationEl.textContent = `${this.state.getLastDurationMs()} ms`;
    if (lineCountEl) lineCountEl.textContent = `${records.length}`;

    // 6. Frames Tab
    if (this.framesPanelEl) {
      this.renderFrames();
    }
  }

  private computeGutterRowHeights(records: DocumentLineRecord[]): number[] {
    const N = records.length;
    const heights = new Array<number>(N);
    for (let i = 0; i < N; i++) {
      const rec = records[i];
      const isCollapsed = this.collapsedLines.has(i);
      const isExpanded = this.expandedPlots.has(i);
      if (rec?.result?.type === 'space') {
        heights[i] = isCollapsed ? 29 : (isExpanded ? 360 : 210);
      } else if (rec?.result?.type === 'trajectory') {
        heights[i] = isCollapsed ? 29 : 180;
      } else if (rec?.error) {
        heights[i] = 48;
      } else if (rec?.classification?.state === 'PROSE' && !rec.result) {
        heights[i] = 29;
      } else {
        heights[i] = 34;
      }
    }
    return heights;
  }

  private renderGutterSlice(force: boolean = false): void {
    if (!this.gutterEl) return;
    const records = this.cachedGutterRecords;
    const N = records.length;
    if (N === 0) {
      this.gutterEl.innerHTML = '';
      return;
    }

    if (this.gutterEl && !(this.gutterEl as any).__axineScrollBound) {
      (this.gutterEl as any).__axineScrollBound = true;
      this.gutterEl.addEventListener('scroll', () => {
        this.renderGutterSlice();
      });
    }

    const heights = this.computeGutterRowHeights(records);
    const prefixOffsets = new Array<number>(N + 1);
    prefixOffsets[0] = 0;
    for (let i = 0; i < N; i++) {
      prefixOffsets[i + 1] = prefixOffsets[i] + heights[i];
    }
    const totalHeight = prefixOffsets[N];

    const isVirtualizable = N > 30 && typeof window !== 'undefined' && this.gutterEl.clientHeight > 0;

    let startIdx = 0;
    let endIdx = N - 1;

    if (isVirtualizable) {
      const scrollTop = this.gutterEl.scrollTop;
      const viewportHeight = this.gutterEl.clientHeight || 800;
      const overscan = 400;

      const minY = Math.max(0, scrollTop - overscan);
      const maxY = scrollTop + viewportHeight + overscan;

      while (startIdx < N - 1 && prefixOffsets[startIdx + 1] < minY) {
        startIdx++;
      }
      endIdx = startIdx;
      while (endIdx < N - 1 && prefixOffsets[endIdx] < maxY) {
        endIdx++;
      }
    }

    if (!force && startIdx === this.renderedStartLine && endIdx === this.renderedEndLine) {
      return;
    }

    this.renderedStartLine = startIdx;
    this.renderedEndLine = endIdx;

    const topSpacerHeight = prefixOffsets[startIdx];
    const bottomSpacerHeight = Math.max(0, totalHeight - prefixOffsets[endIdx + 1]);

    let gutterHtml = '';
    if (topSpacerHeight > 0) {
      gutterHtml += `<div class="doc-gutter-spacer-top" style="height: ${topSpacerHeight}px; width: 100%; flex-shrink: 0;"></div>`;
    }

    for (let i = startIdx; i <= endIdx; i++) {
      const rec = records[i];
      const isCollapsed = this.collapsedLines.has(i);
      const isExpanded = this.expandedPlots.has(i);
      const isPinned = this.pinnedLines.has(i);
      gutterHtml += this.formatGutterRow(rec, isCollapsed, isExpanded, isPinned);
    }

    if (bottomSpacerHeight > 0) {
      gutterHtml += `<div class="doc-gutter-spacer-bottom" style="height: ${bottomSpacerHeight}px; width: 100%; flex-shrink: 0;"></div>`;
    }

    const offscreenErrors: number[] = [];
    for (let i = 0; i < N; i++) {
      if ((i < startIdx || i > endIdx) && records[i]?.error) {
        offscreenErrors.push(i);
      }
    }
    if (offscreenErrors.length > 0) {
      gutterHtml += `<div class="doc-gutter-offscreen-errors" style="display: none;">`;
      for (const i of offscreenErrors) {
        gutterHtml += this.formatGutterRow(records[i], this.collapsedLines.has(i), this.expandedPlots.has(i), this.pinnedLines.has(i));
      }
      gutterHtml += `</div>`;
    }

    this.gutterEl.innerHTML = gutterHtml;

    this.attachGutterRowListeners(records);

    this.setupSpaceObserver();

    for (let i = startIdx; i <= endIdx; i++) {
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
  }

  private attachGutterRowListeners(_records?: DocumentLineRecord[]): void {
    if (!this.gutterEl) return;
    this.gutterEl.querySelectorAll('.doc-gutter-popout-btn').forEach(btn => {
      btn.addEventListener('click', (e: any) => {
        e.stopPropagation?.();
        const lineIdx = parseInt((btn as HTMLElement).getAttribute('data-line') ?? '0', 10);
        this.openSpaceAsTab(lineIdx);
      });
    });
    this.gutterEl.querySelectorAll('.doc-gutter-pin-btn').forEach(btn => {
      btn.addEventListener('click', (e: any) => {
        e.stopPropagation?.();
        const lineIdx = parseInt((btn as HTMLElement).getAttribute('data-line') ?? '0', 10);
        if (this.pinnedLines.has(lineIdx)) {
          this.pinnedLines.delete(lineIdx);
        } else {
          this.pinnedLines.add(lineIdx);
        }
        this.renderWorkPanel(this.state.getRecords(), false);
      });
    });
    this.gutterEl.querySelectorAll('.doc-gutter-collapse-btn').forEach(btn => {
      btn.addEventListener('click', (e: any) => {
        e.stopPropagation?.();
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
    this.gutterEl.querySelectorAll('.doc-gutter-expand-plot-btn').forEach(btn => {
      btn.addEventListener('click', (e: any) => {
        e.stopPropagation?.();
        const lineIdx = parseInt((btn as HTMLElement).getAttribute('data-line') ?? '0', 10);
        if (this.expandedPlots.has(lineIdx)) {
          this.expandedPlots.delete(lineIdx);
        } else {
          this.expandedPlots.add(lineIdx);
        }
        this.renderWorkPanel(this.state.getRecords(), false);
      });
    });

    this.bindGutterEventDelegation();
  }

  private bindGutterEventDelegation(): void {
    if (!this.gutterEl || this.gutterEventsBound) return;
    this.gutterEventsBound = true;

    // Reciprocal hover highlighting between editor lines and gutter rows
    this.gutterEl.addEventListener('mouseover', (e) => {
      const target = e.target as HTMLElement;
      const row = target.closest('.doc-gutter-row') as HTMLElement;
      if (row) {
        row.classList.add('hovered');
        const lineIdxStr = row.getAttribute('data-line');
        const lineIdx = parseInt(lineIdxStr ?? '-1', 10);
        if (lineIdx >= 0 && this.overlayEl) {
          const editorLine = this.overlayEl.querySelectorAll('.doc-typeset-line')[lineIdx];
          if (editorLine) editorLine.classList.add('hovered');
        }
      }
    });

    this.gutterEl.addEventListener('mouseout', (e) => {
      const target = e.target as HTMLElement;
      const row = target.closest('.doc-gutter-row') as HTMLElement;
      if (row) {
        row.classList.remove('hovered');
        const lineIdxStr = row.getAttribute('data-line');
        const lineIdx = parseInt(lineIdxStr ?? '-1', 10);
        if (lineIdx >= 0 && this.overlayEl) {
          const editorLine = this.overlayEl.querySelectorAll('.doc-typeset-line')[lineIdx];
          if (editorLine) editorLine.classList.remove('hovered');
        }
      }
    });

    // Action buttons click handling via event delegation
    this.gutterEl.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;

      const popoutBtn = target.closest('.doc-gutter-popout-btn') as HTMLElement;
      if (popoutBtn) {
        e.stopPropagation();
        const lineIdx = parseInt(popoutBtn.getAttribute('data-line') ?? '0', 10);
        this.openSpaceAsTab(lineIdx);
        return;
      }

      const pinBtn = target.closest('.doc-gutter-pin-btn') as HTMLElement;
      if (pinBtn) {
        e.stopPropagation();
        const lineIdx = parseInt(pinBtn.getAttribute('data-line') ?? '0', 10);
        if (this.pinnedLines.has(lineIdx)) {
          this.pinnedLines.delete(lineIdx);
        } else {
          this.pinnedLines.add(lineIdx);
        }
        this.renderWorkPanel(this.state.getRecords(), false);
        return;
      }

      const collapseBtn = target.closest('.doc-gutter-collapse-btn') as HTMLElement;
      if (collapseBtn) {
        e.stopPropagation();
        const lineIdx = parseInt(collapseBtn.getAttribute('data-line') ?? '0', 10);
        if (this.collapsedLines.has(lineIdx)) {
          this.collapsedLines.delete(lineIdx);
        } else {
          this.collapsedLines.add(lineIdx);
        }
        this.saveCollapsedLines();
        this.renderWorkPanel(this.state.getRecords(), false);
        return;
      }

      const expandPlotBtn = target.closest('.doc-gutter-expand-plot-btn') as HTMLElement;
      if (expandPlotBtn) {
        e.stopPropagation();
        const lineIdx = parseInt(expandPlotBtn.getAttribute('data-line') ?? '0', 10);
        if (this.expandedPlots.has(lineIdx)) {
          this.expandedPlots.delete(lineIdx);
        } else {
          this.expandedPlots.add(lineIdx);
        }
        this.renderWorkPanel(this.state.getRecords(), false);
        return;
      }

      const exactBadge = target.closest('.tm-exact-badge') as HTMLElement;
      if (exactBadge) {
        e.stopPropagation();
        const container = exactBadge.closest('.tm-large-rational');
        if (!container) return;
        const approx = container.querySelector('.tm-approx-val');
        const expanded = container.querySelector('.tm-exact-expanded');
        if (approx && expanded) {
          const isExpanded = !expanded.classList.contains('hidden');
          if (isExpanded) {
            expanded.classList.add('hidden');
            approx.classList.remove('hidden');
            exactBadge.textContent = '[exact]';
          } else {
            expanded.classList.remove('hidden');
            approx.classList.add('hidden');
            exactBadge.textContent = '[approx]';
          }
        }
        return;
      }
    });
  }

  private setupSpaceObserver(): void {
    if (!this.gutterEl) return;
    if (this.spaceObserver) {
      this.spaceObserver.disconnect();
      this.spaceObserver = null;
    }

    const spaceContainers = this.gutterEl.querySelectorAll('.doc-space-container');
    if (spaceContainers.length === 0) return;

    if (typeof IntersectionObserver !== 'undefined') {
      const scrollRoot: HTMLElement | null = this.gutterEl;

      this.spaceObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            const lineIdxStr = target.getAttribute('data-line');
            const lineIdx = parseInt(lineIdxStr ?? '-1', 10);
            if (lineIdx < 0) continue;

            const spaceVal = this.spaceValuesByLine.get(lineIdx);
            if (!spaceVal) continue;

            let vp = this.lineViewports.get(lineIdx);
            if (!vp || target.children.length === 0) {
              if (vp) vp.dispose();
              vp = new SpaceViewport(target, spaceVal, this.viewportOptionsForLine(lineIdx));
              this.lineViewports.set(lineIdx, vp);
              this.pendingSpaceUpdates.delete(lineIdx);
            } else if (this.pendingSpaceUpdates.has(lineIdx) || vp.getSpace() !== spaceVal) {
              this.pendingSpaceUpdates.delete(lineIdx);
              vp.updateSpace(spaceVal);
            }
          }
        }
      }, {
        root: scrollRoot,
        rootMargin: '250px 0px 250px 0px',
      });

      spaceContainers.forEach(container => {
        this.spaceObserver?.observe(container);
      });
    } else {
      // Fallback for test/headless environments without IntersectionObserver
      spaceContainers.forEach(container => {
        const target = container as HTMLElement;
        const lineIdxStr = target.getAttribute('data-line');
        const lineIdx = parseInt(lineIdxStr ?? '-1', 10);
        const spaceVal = this.spaceValuesByLine.get(lineIdx);
        if (spaceVal && (spaceVal.dimension > 0 || spaceVal.entities.length > 0 || (spaceVal.nestedSpaces && spaceVal.nestedSpaces.length > 0))) {
          let vp = this.lineViewports.get(lineIdx);
          if (!vp || target.children.length === 0) {
            if (vp) vp.dispose();
            vp = new SpaceViewport(target, spaceVal, this.viewportOptionsForLine(lineIdx));
            this.lineViewports.set(lineIdx, vp);
            this.pendingSpaceUpdates.delete(lineIdx);
          } else if (this.pendingSpaceUpdates.has(lineIdx) || vp.getSpace() !== spaceVal) {
            this.pendingSpaceUpdates.delete(lineIdx);
            vp.updateSpace(spaceVal);
          }
        }
      });
    }
  }

  private formatPinnedItem(rec: DocumentLineRecord): string {
    const lineIdx = rec.lineIndex;
    if (!rec.result) return '';

    if (rec.result.type === 'space') {
      const spaceVal = rec.result as SpaceValue;
      return `
        <div class="doc-pinned-item" data-line="${lineIdx}">
          <div class="doc-pinned-header">
            <span>Pinned: Line ${lineIdx + 1} (Space: ${spaceVal.dimension}D)</span>
            <button class="doc-unpin-btn" data-line="${lineIdx}">Unpin</button>
          </div>
          <div class="doc-pinned-space-container" data-line="${lineIdx}"></div>
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

  private renderCheckResultFull(checkVal: any, options: TypesetOptions = { displayMode: true }): string {
    let html = `<div class="visual-derivation-tree">`;
    html += `<div class="derivation-orig-eq">${this.typesetMathReadOnly(checkVal.actualExprString, options)}</div>`;

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
            <div class="step-card-eq">${this.typesetMathReadOnly(s.math, options)}</div>
            <div class="step-card-just">${escapeHtml(s.explanation)}</div>
          </div>
        `;
      }
    }

    html += `</div>`;
    return html;
  }

  public typesetMathReadOnly(raw: string, options: TypesetOptions = { displayMode: true }): string {
    if (!raw) return '';
    return typesetMath(raw, options);
  }

  private renderDerivationFull(deriv: DerivationValue, options: TypesetOptions = { displayMode: true }): string {
    let html = `<div class="visual-derivation-tree">`;
    const origEq = deriv.originalEquation || deriv.originalExprString || '';
    if (origEq) {
      html += `<div class="derivation-orig-eq">${this.typesetMathReadOnly(origEq, options)}</div>`;
    }

    for (let i = 0; i < deriv.steps.length; i++) {
      const step = deriv.steps[i];
      const eqStr = step.after || step.equation || '';
      html += `
        <div class="derivation-step-card">
          <div class="step-card-header">
            <span class="step-num">Step ${i + 1}</span>
            <span class="step-rule-badge">${escapeHtml(step.rule)}</span>
          </div>
          ${eqStr ? `<div class="step-card-eq">${this.typesetMathReadOnly(eqStr, options)}</div>` : ''}
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
                  <div class="branch-step-eq">${this.typesetMathReadOnly(bs.after || bs.equation || '', options)}</div>
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
    } else if (deriv.finalExprString) {
      html += `<div class="derivation-final-roots">Result: ${this.typesetMathReadOnly(deriv.finalExprString, options)}</div>`;
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
      this.framesPanelEl.innerHTML = `<div class="doc-frames-empty">No frames recorded</div>`;
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

    // 0. Space result
    if (rec.result.type === 'space') {
      const spaceVal = rec.result as SpaceValue;
      if (spaceVal.dimension === 0 && spaceVal.entities.length === 0 && (!spaceVal.nestedSpaces || spaceVal.nestedSpaces.length === 0)) {
        if (spaceVal.resultVal && spaceVal.resultVal.type !== 'none') {
          return `
            <div class="doc-gutter-row" data-line="${lineIdx}">
              <div class="doc-gutter-row-header">
                <span class="doc-gutter-lineno">L${lineIdx + 1}</span>
              </div>
              <div class="doc-gutter-content">
                <div class="doc-gutter-result"><span class="doc-result-value">${this.typesetMathReadOnly(this.formatValue(spaceVal.resultVal))}</span></div>
              </div>
            </div>
          `;
        }
        return `
          <div class="doc-gutter-row" data-line="${lineIdx}">
            <div class="doc-gutter-row-header">
              <span class="doc-gutter-lineno">L${lineIdx + 1}</span>
            </div>
            <div class="doc-gutter-content">
              <span class="doc-result-value">none</span>
            </div>
          </div>
        `;
      }

      const dimStr = `${spaceVal.dimension}D Space`;
      const collapseText = isCollapsed ? '+' : '\u2212';
      return `
        <div class="doc-gutter-row" data-line="${lineIdx}">
          <div class="doc-gutter-row-header">
            <span class="doc-gutter-lineno">L${lineIdx + 1} &bull; Space (${spaceVal.dimension}D)</span>
            <div class="doc-gutter-row-actions">
              <button class="doc-gutter-action-btn doc-gutter-popout-btn" data-line="${lineIdx}" title="Open as tab">Open as Tab</button>
              <button class="doc-gutter-action-btn doc-gutter-pin-btn ${isPinned ? 'pinned' : ''}" data-line="${lineIdx}" title="Pin to top">${isPinned ? 'Pinned' : 'Pin'}</button>
              ${!isCollapsed ? `<button class="doc-gutter-action-btn doc-gutter-expand-plot-btn" data-line="${lineIdx}" title="Resize viewport">${isExpandedPlot ? 'Compact' : 'Expand'}</button>` : ''}
              <button class="doc-gutter-action-btn doc-gutter-collapse-btn" data-line="${lineIdx}" title="Collapse row">${collapseText}</button>
            </div>
          </div>
          <div class="doc-gutter-content">
            ${isCollapsed
              ? `<div class="doc-gutter-collapsed-summary">[Collapsed ${dimStr}]</div>`
              : `<div class="doc-space-container ${isExpandedPlot ? 'expanded' : ''}" data-line="${lineIdx}"></div>`
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
              <button class="doc-gutter-action-btn doc-gutter-pin-btn ${isPinned ? 'pinned' : ''}" data-line="${lineIdx}" title="Pin to top">${isPinned ? 'Pinned' : 'Pin'}</button>
              <button class="doc-gutter-action-btn doc-gutter-collapse-btn" data-line="${lineIdx}" title="Collapse row">${collapseText}</button>
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
              <button class="doc-gutter-action-btn doc-gutter-pin-btn ${isPinned ? 'pinned' : ''}" data-line="${lineIdx}" title="Pin to top">${isPinned ? 'Pinned' : 'Pin'}</button>
              <button class="doc-gutter-action-btn doc-gutter-collapse-btn" data-line="${lineIdx}" title="Collapse row">${collapseText}</button>
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
              <button class="doc-gutter-action-btn doc-gutter-pin-btn ${isPinned ? 'pinned' : ''}" data-line="${lineIdx}" title="Pin to top">${isPinned ? 'Pinned' : 'Pin'}</button>
              <button class="doc-gutter-action-btn doc-gutter-collapse-btn" data-line="${lineIdx}" title="Collapse row">${collapseText}</button>
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
              <button class="doc-gutter-action-btn doc-gutter-pin-btn ${isPinned ? 'pinned' : ''}" data-line="${lineIdx}" title="Pin to top">${isPinned ? 'Pinned' : 'Pin'}</button>
              <button class="doc-gutter-action-btn doc-gutter-collapse-btn" data-line="${lineIdx}" title="Collapse row">${collapseText}</button>
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
              <button class="doc-gutter-action-btn doc-gutter-pin-btn ${isPinned ? 'pinned' : ''}" data-line="${lineIdx}" title="Pin to top">${isPinned ? 'Pinned' : 'Pin'}</button>
              <button class="doc-gutter-action-btn doc-gutter-collapse-btn" data-line="${lineIdx}" title="Collapse row">${collapseText}</button>
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
              left: rects[0].left - surfaceRect.left,
              right: rects[0].right - surfaceRect.left,
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
        const elLeft = elRect.left - surfaceRect.left;
        const elRight = elRect.right - surfaceRect.left;

        if (construct === 'sup' || construct === 'sub') {
          const opSpan = el.querySelector('.typeset-op') as HTMLElement;
          const innerSpan = el.querySelector('.typeset-sup, .typeset-sub') as HTMLElement;
          const innerTextNode = innerSpan?.firstChild;
          const innerText = innerTextNode?.textContent || '';

          const opRect = opSpan ? opSpan.getBoundingClientRect() : elRect;
          const opLeft = opRect.left - surfaceRect.left;
          const opRight = opRect.right - surfaceRect.left;

          const innerRect = innerSpan ? innerSpan.getBoundingClientRect() : elRect;
          const innerLeft = innerRect.left - surfaceRect.left;
          const innerRight = innerRect.right - surfaceRect.left;

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
                  left: rects[0].left - surfaceRect.left,
                  right: rects[0].right - surfaceRect.left,
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
                  left: rects[0].left - surfaceRect.left,
                  right: rects[0].right - surfaceRect.left,
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
    let caretY = lineRect.top - surfaceRect.top;
    let caretH = 20;

    if (colIdx === 0) {
      caretX = charBoxes.length > 0 ? charBoxes[0].left : (lineRect.left - surfaceRect.left);
    } else if (colIdx < charBoxes.length) {
      caretX = charBoxes[colIdx].left;
    } else if (charBoxes.length > 0) {
      caretX = charBoxes[charBoxes.length - 1].right;
    } else {
      caretX = lineRect.left - surfaceRect.left + colIdx * 8.429;
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
    if (!this.overlayEl || !this.textarea) return;
    const lines = this.textarea.value.split('\n');
    if (this.overlayEl.children.length === lines.length && this.prevOverlayLines.length === lines.length) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i] !== this.prevOverlayLines[i]) {
          const child = this.overlayEl.children[i] as HTMLElement;
          if (child) {
            child.innerHTML = this.typesetLine(lines[i]);
          }
          this.prevOverlayLines[i] = lines[i];
        }
      }
      return;
    }

    const html = lines.map(line => `<div class="doc-typeset-line">${this.typesetLine(line)}</div>`).join('');
    this.overlayEl.innerHTML = html;
    this.prevOverlayLines = [...lines];
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
    return formatValue(val);
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

  public initPaneContainer(): void {
    if (!this.workspaceEl) {
      console.warn('initPaneContainer: no workspaceEl');
      return;
    }
    // Only mount interactive PaneContainer in browser DOM environments
    if (typeof (this.container as any).nodeType !== 'number') {
      console.warn('initPaneContainer: nodeType is not number:', (this.container as any)?.nodeType);
      return;
    }

    try {
      this.paneContainer = new PaneContainer(this.workspaceEl, {
        storageKey: this.activeWorkspace ? ('axine_layout_' + this.activeWorkspace.id) : 'axine_workspace_layout_v1',
        defaultDocName: this.currentFileName || 'untitled.ax',
        onActivePaneChange: (paneId: string) => {
          if (!this.paneContainer) return;
          const leaf = findLeaf(this.paneContainer.getLayout().root, paneId);
          if (!leaf) return;
          const activeTab = leaf.tabs.find(t => t.id === leaf.activeTabId);
          if (activeTab && activeTab.type === 'document' && activeTab.documentId) {
            this.switchToSession(activeTab.documentId);
          }
        },
        renderDocumentView: (_leafId, tab, container) => {
          this.renderEditorOnly(container, tab.documentId);
        },
        renderResultsView: (_leafId, tab, container) => {
          this.renderResultsOnly(container, tab.documentId);
        },
        getSpaceValueForLine: (_docId, lineIdx) => {
          return this.getSpaceValueForLine(lineIdx);
        },
        getSourceStartLine: (_docId, lineIdx) => {
          return this.state.getRecords()[lineIdx]?.sourceStartLine;
        },
        getAvailableSpaces: () => {
          return this.getAvailableSpaces();
        },
        getScopeData: () => {
          return this.getActiveSymbolsMap();
        },
        getTraceData: () => {
          return {
            durationMs: this.state.getLastDurationMs(),
            lineCount: this.state.getRecords().length,
            status: this.state.getIsInvokedRunning() ? 'Invoked Running...' : (this.state.getIsEvaluating() ? 'Ambient Evaluating...' : 'Ready'),
          };
        },
        getFramesData: () => {
          return this.frames;
        },
        getWorkspace: () => {
          return this.activeWorkspace;
        },
        onOpenFile: (filePath: string) => {
          this.openWorkspaceFile(filePath);
        },
        onNewFileInWorkspace: async (filePath: string) => {
          if (this.activeWorkspace) {
            await WorkspaceManager.createFile(this.activeWorkspace, filePath, '');
            this.openWorkspaceFile(filePath);
          }
        },
        onNewFolderInWorkspace: async (folderPath: string) => {
          if (this.activeWorkspace) {
            await WorkspaceManager.createFolder(this.activeWorkspace, folderPath);
          }
        },
        onRenameFileInWorkspace: async (oldPath: string, newPath: string) => {
          if (this.activeWorkspace) {
            await WorkspaceManager.renameItem(this.activeWorkspace, oldPath, newPath);
            for (const s of this.sessions.values()) {
              if (s.name === oldPath) {
                s.name = newPath;
              }
            }
            if (this.currentFileName === oldPath) {
              this.currentFileName = newPath;
            }
            this.updateSessionTabs();
          }
        },
        onDeleteFileInWorkspace: async (filePath: string) => {
          if (this.activeWorkspace) {
            await WorkspaceManager.deleteItem(this.activeWorkspace, filePath);
          }
        },
        onNewDocumentTab: () => {
          const sess = this.createSession('untitled.ax', '');
          return {
            id: sess.id,
            type: 'document',
            title: sess.name,
            documentId: sess.id,
          };
        },
        onOpenDocument: () => {
          this.openDocument();
        },
        isDocumentDirty: (docId) => {
          const s = docId ? this.sessions.get(docId) : this.sessions.get(this.activeSessionId);
          return s?.isDirty ?? this.isDirty;
        },
        onJumpToSource: (docId, lineIdx) => {
          if (docId && docId !== this.activeSessionId) {
            this.switchToSession(docId);
          }
          this.jumpToLine(lineIdx);
        },
      });

      // Synchronize document tab titles with loaded document name
      const layout = this.paneContainer.getLayout();
      updateDocumentTabTitles(layout.root, this.activeSessionId, this.currentFileName, new Set(this.sessions.keys()));
      this.paneContainer.render();
      console.log('initPaneContainer: SUCCESS created paneContainer');
    } catch (err) {
      console.error('initPaneContainer ERROR:', err);
    }
  }

  public getAvailableSpaces(): { lineIdx: number; title: string; space: SpaceValue }[] {
    const records = this.state.getRecords();
    const list: { lineIdx: number; title: string; space: SpaceValue }[] = [];
    records.forEach((rec, idx) => {
      if (rec.result && rec.result.type === 'space') {
        const spaceVal = rec.result as SpaceValue;
        const title = rec.text.trim() || `${spaceVal.dimension}D Space`;
        list.push({ lineIdx: idx, title, space: spaceVal });
      }
    });
    return list;
  }

  // Inspector links from a space shown for a result line go to the document
  // line the relation was written on.
  private viewportOptionsForLine(lineIdx: number): { sourceStartLine?: number; onJumpToSource: (line: number) => void } {
    return {
      sourceStartLine: this.state.getRecords()[lineIdx]?.sourceStartLine,
      onJumpToSource: (line: number) => this.jumpToLine(line),
    };
  }

  public getSpaceValueForLine(lineIdx: number): SpaceValue | null {
    if (typeof lineIdx !== 'number') return null;
    const records = this.state.getRecords();
    const rec = records[lineIdx];
    if (rec && rec.result && rec.result.type === 'space') {
      return rec.result as SpaceValue;
    }
    return null;
  }

  public getActiveSymbolsMap(): Map<string, { type: string; value: string; line: number; isShadowed?: boolean }> {
    const records = this.state.getRecords();
    const activeSymbols: Map<string, { type: string; value: string; line: number; isShadowed?: boolean }> = new Map();
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      if (rec.boundName && rec.result) {
        activeSymbols.set(rec.boundName, {
          type: rec.result.type,
          value: this.formatValue(rec.result),
          line: i + 1,
          isShadowed: rec.isShadowed,
        });
      }
    }
    return activeSymbols;
  }

  public openSpaceAsTab(lineIdx: number): void {
    if (!this.paneContainer) return;
    const records = this.state.getRecords();
    const rec = records[lineIdx];
    const rawLine = rec?.text.trim() || `Line ${lineIdx + 1}`;
    const cleanTitle = rawLine.length > 25 ? rawLine.substring(0, 24) + '…' : rawLine;
    const spaceTitle = rec?.boundName ? `Space: ${rec.boundName}` : `L${lineIdx + 1}: ${cleanTitle}`;

    const spaceTab: TabData = {
      id: 'tab_space_' + Math.random().toString(36).substring(2, 9),
      type: 'space',
      title: spaceTitle,
      documentId: this.activeSessionId,
      spaceLineIdx: lineIdx,
      spaceExprText: rec?.text.trim(),
    };
    this.paneContainer.openTab(spaceTab);
  }

  public renderDocumentView(container: HTMLElement): void {
    this.renderEditorOnly(container);
  }

  public renderEditorOnly(container: HTMLElement, docId?: string): void {
    container.innerHTML = '';

    const session = (docId && this.sessions.get(docId)) || this.sessions.get(this.activeSessionId);
    const targetState = session?.state || this.state;
    const isCurrentActive = !docId || docId === this.activeSessionId || (!!docId && !this.sessions.has(docId));

    const paneLeft = document.createElement('div');
    paneLeft.className = 'doc-pane-left';

    const printView = document.createElement('div');
    printView.id = 'doc-print-view';
    printView.className = 'doc-print-view';

    const blockEditorEl = document.createElement('div');
    blockEditorEl.id = 'doc-block-editor';
    blockEditorEl.className = `doc-block-editor ${this.editorMode === 'block' ? '' : 'hidden'}`;

    const lineNumbers = document.createElement('div');
    lineNumbers.id = 'doc-line-numbers';
    lineNumbers.className = `doc-line-numbers ${this.editorMode === 'block' ? 'hidden' : ''}`;
    if (isCurrentActive) {
      this.lineNumbersEl = lineNumbers;
    }

    const editorSurface = document.createElement('div');
    editorSurface.className = `doc-editor-surface ${this.editorMode === 'block' ? 'hidden' : ''}`;

    const overlay = document.createElement('div');
    overlay.id = 'doc-typeset-overlay';
    overlay.className = 'doc-typeset-overlay';
    if (isCurrentActive) {
      this.overlayEl = overlay;
    }

    const caret = document.createElement('div');
    caret.id = 'doc-caret';
    caret.className = 'doc-caret';
    if (isCurrentActive) {
      this.caretEl = caret;
    }

    const textarea = document.createElement('textarea');
    textarea.id = 'doc-textarea';
    textarea.className = 'doc-textarea';
    textarea.placeholder = 'Write math expressions, definitions (x := 5), claims, or prose...';
    textarea.spellcheck = false;
    textarea.autocomplete = 'off';
    textarea.autocapitalize = 'off';
    textarea.value = targetState.getText();
    if (isCurrentActive) {
      this.textarea = textarea;
    }

    textarea.addEventListener('focus', () => {
      this.textarea = textarea;
      this.overlayEl = overlay;
      this.caretEl = caret;
      this.lineNumbersEl = lineNumbers;
      if (docId && docId !== this.activeSessionId && this.sessions.has(docId)) {
        this.switchToSession(docId);
      }
      this.bindEditorSurfaceEvents();
    });

    textarea.addEventListener('input', () => {
      targetState.setText(textarea.value);
      const lines = textarea.value.split('\n');
      overlay.innerHTML = lines.map(line => `<div class="doc-typeset-line">${this.typesetLine(line)}</div>`).join('');
    });

    textarea.addEventListener('scroll', () => {
      const scrollTop = textarea.scrollTop;
      const scrollLeft = textarea.scrollLeft;
      if (lineNumbers) lineNumbers.scrollTop = scrollTop;
      if (overlay) {
        overlay.scrollTop = scrollTop;
        overlay.scrollLeft = scrollLeft;
      }
      if (isCurrentActive && this.gutterEl) {
        const taMaxScroll = textarea.scrollHeight - textarea.clientHeight;
        const gutterMaxScroll = this.gutterEl.scrollHeight - this.gutterEl.clientHeight;
        if (taMaxScroll > 0 && gutterMaxScroll > 0) {
          const ratio = scrollTop / taMaxScroll;
          this.gutterEl.scrollTop = ratio * gutterMaxScroll;
        } else {
          this.gutterEl.scrollTop = scrollTop;
        }
        this.renderGutterSlice();
      }
      if (session) {
        session.scrollPosition = { scrollTop, scrollLeft };
      }
      if (isCurrentActive) {
        this.updateCaret();
      }
    });

    editorSurface.appendChild(overlay);
    editorSurface.appendChild(caret);
    editorSurface.appendChild(textarea);

    paneLeft.appendChild(printView);
    paneLeft.appendChild(lineNumbers);
    paneLeft.appendChild(blockEditorEl);
    paneLeft.appendChild(editorSurface);

    container.appendChild(paneLeft);

    if (session && session.scrollPosition) {
      textarea.scrollTop = session.scrollPosition.scrollTop;
      textarea.scrollLeft = session.scrollPosition.scrollLeft;
      overlay.scrollTop = session.scrollPosition.scrollTop;
      overlay.scrollLeft = session.scrollPosition.scrollLeft;
      lineNumbers.scrollTop = session.scrollPosition.scrollTop;
    }

    const textLines = targetState.getText().split('\n');
    overlay.innerHTML = textLines.map(line => `<div class="doc-typeset-line">${this.typesetLine(line)}</div>`).join('');
    if (isCurrentActive) {
      this.prevOverlayLines = [...textLines];
    }

    if (isCurrentActive) {
      if (this.blockEditor) {
        this.blockEditor.dispose();
      }
      this.blockEditor = new BlockDocumentEditor(blockEditorEl, targetState.getText(), {
        onChange: (newText: string) => {
          if (this.textarea && this.textarea.value !== newText) {
            this.textarea.value = newText;
            this.handleInputChange(true);
          }
        },
      });
      this.updateCaret();
      this.bindEditorSurfaceEvents();
      this.renderLineNumbers(targetState.getRecords());
    } else {
      const recs = targetState.getRecords();
      lineNumbers.innerHTML = recs.map((_r, i) => `<div class="doc-line-num">${i + 1}</div>`).join('');
    }
  }

  public jumpToLine(lineIdx: number): void {
    if (this.editorMode === 'block') {
      this.revealLineInBlocks(lineIdx);
      return;
    }
    if (!this.textarea || !document.body.contains(this.textarea)) {
      const liveTa = this.container.querySelector('#doc-textarea') as HTMLTextAreaElement;
      if (liveTa) {
        this.textarea = liveTa;
        this.overlayEl = this.container.querySelector('#doc-typeset-overlay') as HTMLElement;
        this.caretEl = this.container.querySelector('#doc-caret') as HTMLElement;
        this.lineNumbersEl = this.container.querySelector('#doc-line-numbers') as HTMLElement;
        this.bindEditorSurfaceEvents();
      }
    }
    if (!this.gutterEl || !document.body.contains(this.gutterEl)) {
      const liveGutter = this.container.querySelector('#doc-gutter') as HTMLElement;
      if (liveGutter) {
        this.gutterEl = liveGutter;
      }
    }
    if (!this.textarea) return;
    const lines = this.state.getText().split('\n');
    let charOffset = 0;
    for (let i = 0; i < lineIdx && i < lines.length; i++) {
      charOffset += lines[i].length + 1;
    }
    const targetLine = lines[lineIdx] || '';
    this.textarea.focus();
    this.textarea.setSelectionRange(charOffset, charOffset + targetLine.length);
    const lineHeight = 24.5;
    const padTop = 10.5;
    this.textarea.scrollTop = Math.max(0, padTop + lineIdx * lineHeight - 100);
    if (this.overlayEl) this.overlayEl.scrollTop = this.textarea.scrollTop;
    if (this.lineNumbersEl) this.lineNumbersEl.scrollTop = this.textarea.scrollTop;
    if (this.gutterEl) {
      const records = this.cachedGutterRecords.length > 0 ? this.cachedGutterRecords : this.state.getRecords();
      let gutterY = 0;
      if (records.length > 0) {
        const heights = this.computeGutterRowHeights(records);
        for (let i = 0; i < lineIdx && i < heights.length; i++) {
          gutterY += heights[i];
        }
      }
      this.gutterEl.scrollTop = Math.max(0, gutterY > 0 ? gutterY - 100 : this.textarea.scrollTop);
      this.renderGutterSlice();
    }
    this.updateCaret();
    this.textarea.dispatchEvent(new Event('scroll'));
  }

  // Shows the active document's tab and selects the block containing a line.
  private revealLineInBlocks(lineIdx: number): void {
    if (this.paneContainer) {
      const root = this.paneContainer.getLayout().root;
      for (const leaf of getAllLeaves(root)) {
        const tab = leaf.tabs.find(t => t.type === 'document' && t.documentId === this.activeSessionId);
        if (!tab) continue;
        if (leaf.activeTabId !== tab.id) {
          leaf.activeTabId = tab.id;
          this.paneContainer.setActivePaneId(leaf.id);
          this.paneContainer.render();
        }
        break;
      }
    }
    const blockId = this.blockEditor?.blockIdAtLine(lineIdx);
    if (this.blockEditor && blockId) {
      this.blockEditor.selectBlock(blockId);
      this.blockEditor.scrollToBlock(blockId);
    }
  }

  public renderResultsOnly(container: HTMLElement, _docId?: string): void {
    container.innerHTML = '';

    const resultsPane = document.createElement('div');
    resultsPane.className = 'doc-results-pane';

    const pinnedVisuals = document.createElement('div');
    pinnedVisuals.id = 'doc-pinned-visuals';
    pinnedVisuals.className = 'doc-pinned-visuals empty';

    const gutter = document.createElement('div');
    gutter.id = 'doc-gutter';
    gutter.className = 'doc-gutter';
    this.gutterEl = gutter;
    this.gutterEventsBound = false;

    resultsPane.appendChild(pinnedVisuals);
    resultsPane.appendChild(gutter);
    container.appendChild(resultsPane);

    this.renderWorkPanel(this.state.getRecords(), this.state.getIsEvaluating());
  }

  private renderLineNumbers(records: DocumentLineRecord[]): void {
    if (!this.lineNumbersEl) return;
    let lineNumsHtml = '';
    for (let i = 0; i < records.length; i++) {
      lineNumsHtml += `<div class="doc-line-num">${i + 1}</div>`;
    }
    this.lineNumbersEl.innerHTML = lineNumsHtml;
  }

  public dispose() {
    this.paneContainer?.dispose();
    this.lineViewports.forEach(p => p.dispose());
    this.lineViewports.clear();
    this.pinnedViewports.forEach(p => p.dispose());
    this.pinnedViewports.clear();
    this.animationPlayers.forEach(p => p.dispose());
    this.animationPlayers.clear();
    this.pinnedAnimationPlayers.forEach(p => p.dispose());
    this.pinnedAnimationPlayers.clear();
    this.welcomeScreen?.dispose();
    this.state?.dispose();
  }
}

export function formatValue(val: Value): string {
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
      if (val.roots.length === 1) return `${val.targetVar} = ${formatValue(val.roots[0])}`;
      if (val.roots.length > 1) return `${val.targetVar} = ${val.roots.map(r => formatValue(r)).join(' or ')}`;
      return `[Derivation: ${val.steps.length} steps]`;
    }
    case 'solve_trace':
      return `${val.method === 'newton' ? "Newton's" : 'Bisection'} root \u2248 ${formatValue(val.root)} (${val.iterations.length} iterations)`;
    case 'matrix':
      return `[${val.data.map(row => '[' + row.map(cell => formatValue(cell)).join(', ') + ']').join(', ')}]`;
    case 'tuple':
      return `(${val.elements.map(e => formatValue(e)).join(', ')})`;
    case 'list': {
      if (val.elements.length > 8) {
        const head = val.elements.slice(0, 4).map(e => formatValue(e)).join(', ');
        return `[${head}, ... ${val.elements.length} items]`;
      }
      return `[${val.elements.map(e => formatValue(e)).join(', ')}]`;
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
      if (val.isInfinite) return `Set(infinite, of=${val.elementKind ? formatKind(val.elementKind) : 'any'})`;
      return `Set(${(val.elements ?? []).map(e => formatValue(e)).join(', ')})`;
    case 'multiset':
      return `Multiset(${(val.elements ?? []).map(e => formatValue(e)).join(', ')})`;
    case 'record': {
      const fieldsStr = Object.entries(val.fields)
        .map(([k, v]) => `${k}: ${formatValue(v)}`)
        .join(', ');
      return `${val.typeName}(${fieldsStr})`;
    }
    case 'record_constructor':
      return `record ${val.name} { ${val.fieldNames.join(', ')} }`;
    case 'quantity':
      return `${formatValue(val.magnitude)} ${val.unit}`;
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

