/**
 * PaneContainer: Tiled Workspace Layout & Multi-Pane View Manager
 * 
 * Manages the egalitarian tab and pane system for Axine.
 * Every view is an equal tab: .ax document, space, scope, trace, frames.
 */

import {
  WorkspaceLayout,
  PaneNode,
  PaneLeaf,
  PaneSplit,
  TabData,
  PaneViewType,
  createDefaultLayout,
  pruneEmptyPanes,
  findLeaf,
  getAllLeaves,
  getAllTabs,
  addTabToLeaf,
  removeTabFromLeaf,
  splitPane,
  moveTab,
  splitAndMoveTab,
  serializeLayout,
  deserializeLayout,
} from './pane_tree';
import { SpaceViewport } from '../plot/space_viewport';
import { DocumentLineRecord } from '../document/document_state';
import { SpaceValue } from '../core/types';
import { WorkspaceManager, Workspace, WorkspaceFileItem } from '../document/workspace';
import { ICONS } from '../styles/icons';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export interface PaneContainerOptions {
  storageKey?: string;
  defaultDocName?: string;
  onLayoutChange?: (layout: WorkspaceLayout) => void;
  onActivePaneChange?: (paneId: string) => void;
  renderDocumentView?: (leafId: string, tab: TabData, container: HTMLElement) => HTMLElement | void;
  renderResultsView?: (leafId: string, tab: TabData, container: HTMLElement) => HTMLElement | void;
  getSpaceValueForLine?: (documentId: string | undefined, lineIdx: number) => SpaceValue | null;
  getAvailableSpaces?: () => { lineIdx: number; title: string; space: SpaceValue }[];
  getScopeData?: () => Map<string, { type: string; value: string; line: number; isShadowed?: boolean }>;
  getTraceData?: () => { durationMs: number; lineCount: number; status: string };
  getFramesData?: () => { id: number; line: number; type: string; summary: string; timestamp: number }[];
  getWorkspace?: () => Workspace | null;
  onOpenFile?: (filePath: string) => void;
  onNewFileInWorkspace?: (filePath: string) => Promise<void> | void;
  onNewFolderInWorkspace?: (folderPath: string) => Promise<void> | void;
  onRenameFileInWorkspace?: (oldPath: string, newPath: string) => Promise<void> | void;
  onDeleteFileInWorkspace?: (filePath: string) => Promise<void> | void;
  onNewDocumentTab?: () => TabData;
  onOpenDocument?: () => void;
  isDocumentDirty?: (docId?: string) => boolean;
  onJumpToSource?: (documentId: string | undefined, lineIdx: number) => void;
}

export class PaneContainer {
  private container: HTMLElement;
  private options: PaneContainerOptions;
  private layout: WorkspaceLayout;
  private storageKey: string;

  // Active space viewports keyed by tabId
  private spaceViewports: Map<string, SpaceViewport> = new Map();

  // Drag-and-drop state
  private draggingTab: { tabId: string; sourceLeafId: string } | null = null;

  // Cleanup callbacks for window event listeners
  private cleanups: (() => void)[] = [];

  constructor(container: HTMLElement, options: PaneContainerOptions = {}) {
    this.container = container;
    this.options = options;
    this.storageKey = options.storageKey || 'axine_workspace_layout_v1';

    // Load persisted layout or create default
    const loaded = this.loadPersistedLayout();
    this.layout = loaded ? { ...loaded, root: pruneEmptyPanes(loaded.root, options.defaultDocName || 'untitled.ax') } : createDefaultLayout(undefined, options.defaultDocName || 'untitled.ax');

    this.bindKeyboardShortcuts();
    this.render();
  }

  public getLayout(): WorkspaceLayout {
    return this.layout;
  }

  public setLayout(layout: WorkspaceLayout): void {
    this.layout = layout;
    this.saveLayout();
    this.render();
  }

  public getActivePaneId(): string {
    return this.layout.activePaneId;
  }

  public setActivePaneId(paneId: string): void {
    const leaf = findLeaf(this.layout.root, paneId);
    if (!leaf) return;
    this.layout.activePaneId = paneId;
    this.saveLayout();
    this.updateActivePaneVisuals();
    if (this.options.onActivePaneChange) {
      this.options.onActivePaneChange(paneId);
    }
  }

  public getSpaceViewport(tabId: string): SpaceViewport | undefined {
    return this.spaceViewports.get(tabId);
  }

  public getAllSpaceViewports(): Map<string, SpaceViewport> {
    return this.spaceViewports;
  }

  /**
   * Opens a tab in the active pane (or specified pane).
   */
  public openTab(tab: TabData, targetLeafId?: string): void {
    const leafId = targetLeafId || this.layout.activePaneId || getAllLeaves(this.layout.root)[0]?.id;
    if (!leafId) return;

    addTabToLeaf(this.layout.root, leafId, tab);
    this.layout.activePaneId = leafId;
    this.saveLayout();
    this.render();
  }

  /**
   * Closes a tab from a leaf pane.
   */
  public closeTab(leafId: string, tabId: string): void {
    // Dispose viewport if any
    const vp = this.spaceViewports.get(tabId);
    if (vp) {
      vp.dispose();
      this.spaceViewports.delete(tabId);
    }

    const { newRoot, removedLeafId } = removeTabFromLeaf(this.layout.root, leafId, tabId, this.options.defaultDocName || 'untitled.ax');
    this.layout.root = pruneEmptyPanes(newRoot, this.options.defaultDocName || 'untitled.ax');

    if ((removedLeafId && this.layout.activePaneId === removedLeafId) || !findLeaf(this.layout.root, this.layout.activePaneId)) {
      const remainingLeaves = getAllLeaves(this.layout.root);
      this.layout.activePaneId = remainingLeaves[0]?.id || '';
    }

    this.saveLayout();
    this.render();
  }

  /**
   * Splits a pane horizontally or vertically.
   */
  public split(leafId: string, direction: 'horizontal' | 'vertical', position: 'before' | 'after', newTab?: TabData): string {
    const { newRoot, newLeafId } = splitPane(this.layout.root, leafId, direction, position, newTab);
    this.layout.root = newRoot;
    this.layout.activePaneId = newLeafId;
    this.saveLayout();
    this.render();
    return newLeafId;
  }

  /**
   * Splits a tab out of a leaf pane into a new pane beside or below it.
   */
  public splitTab(
    leafId: string,
    tabId: string,
    direction: 'horizontal' | 'vertical',
    position: 'before' | 'after' = 'after'
  ): string | null {
    const leaf = findLeaf(this.layout.root, leafId);
    if (!leaf) return null;
    const tab = leaf.tabs.find(t => t.id === tabId);
    if (!tab) return null;

    const { newRoot, newLeafId } = splitAndMoveTab(
      this.layout.root,
      leafId,
      tabId,
      leafId,
      direction,
      position
    );
    this.layout.root = newRoot;
    if (newLeafId) {
      this.layout.activePaneId = newLeafId;
    }
    this.saveLayout();
    this.render();
    return newLeafId || null;
  }

  /**
   * Fast-path split for the currently active pane and its active tab.
   * Cmd/Ctrl + \ (horizontal / right) or Cmd/Ctrl + Shift + \ (vertical / down).
   */
  public splitActiveTab(
    direction: 'horizontal' | 'vertical',
    position: 'before' | 'after' = 'after'
  ): string | null {
    let activeLeaf = findLeaf(this.layout.root, this.layout.activePaneId);
    if (!activeLeaf) {
      const leaves = getAllLeaves(this.layout.root);
      if (leaves.length === 0) return null;
      activeLeaf = leaves[0];
    }
    const activeTab = activeLeaf.tabs.find(t => t.id === activeLeaf.activeTabId) || activeLeaf.tabs[0];
    if (!activeTab) return null;

    return this.splitTab(activeLeaf.id, activeTab.id, direction, position);
  }

  private bindKeyboardShortcuts(): void {
    if (typeof window === 'undefined') return;

    const keydownHandler = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      const isBackslash = e.key === '\\' || e.key === '|' || e.code === 'Backslash';
      if (!isCmdOrCtrl || !isBackslash) return;

      e.preventDefault();
      e.stopPropagation();

      if (e.shiftKey) {
        // Cmd/Ctrl + Shift + \ : split down
        this.splitActiveTab('vertical', 'after');
      } else {
        // Cmd/Ctrl + \ : split right
        this.splitActiveTab('horizontal', 'after');
      }
    };

    window.addEventListener('keydown', keydownHandler);
    this.cleanups.push(() => window.removeEventListener('keydown', keydownHandler));
  }

  /**
   * Updates all space tabs in response to code evaluation.
   */
  public updateSpaces(_records?: DocumentLineRecord[]): void {
    getAllTabs(this.layout.root).forEach(tab => {
      if (tab.type === 'space' && typeof tab.spaceLineIdx === 'number') {
        const vp = this.spaceViewports.get(tab.id);
        if (vp && this.options.getSpaceValueForLine) {
          const newSpace = this.options.getSpaceValueForLine(tab.documentId, tab.spaceLineIdx);
          if (newSpace) {
            vp.updateSpace(newSpace);
          }
        }
      }
    });

    // Also update results tabs and inspector tabs
    this.updateResultsPanes();
    this.updateInspectorPanes();
  }

  /**
   * Re-renders active results views across all panes.
   */
  public updateResultsPanes(): void {
    const leaves = getAllLeaves(this.layout.root);
    leaves.forEach(leaf => {
      const activeTab = leaf.tabs.find(t => t.id === leaf.activeTabId);
      if (!activeTab || activeTab.type !== 'results') return;

      const paneEl = this.container.querySelector(`.pane-leaf-container[data-leaf-id="${leaf.id}"]`);
      const bodyEl = paneEl?.querySelector('.pane-body') as HTMLElement;
      if (!bodyEl) return;

      if (this.options.renderResultsView) {
        this.options.renderResultsView(leaf.id, activeTab, bodyEl);
      }
    });
  }

  /**
   * Re-renders inspector views (scope, trace, frames).
   */
  public updateInspectorPanes(): void {
    const leaves = getAllLeaves(this.layout.root);
    leaves.forEach(leaf => {
      const activeTab = leaf.tabs.find(t => t.id === leaf.activeTabId);
      if (!activeTab) return;

      const paneEl = this.container.querySelector(`.pane-leaf-container[data-leaf-id="${leaf.id}"]`);
      const bodyEl = paneEl?.querySelector('.pane-body') as HTMLElement;
      if (!bodyEl) return;

      if (activeTab.type === 'scope') {
        this.renderScopeView(bodyEl);
      } else if (activeTab.type === 'trace') {
        this.renderTraceView(bodyEl);
      } else if (activeTab.type === 'frames') {
        this.renderFramesView(bodyEl);
      }
    });
  }

  public saveLayout(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageKey, serializeLayout(this.layout));
      }
      if (this.options.onLayoutChange) {
        this.options.onLayoutChange(this.layout);
      }
    } catch {
      // Ignore storage errors
    }
  }

  private loadPersistedLayout(): WorkspaceLayout | null {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(this.storageKey);
        if (saved) {
          return deserializeLayout(saved);
        }
      }
    } catch {
      // Ignore
    }
    return null;
  }

  /**
   * Main render loop building the DOM structure for the pane tree.
   */
  public render(): void {
    if (typeof document === 'undefined') return;
    this.cleanups.forEach(fn => fn());
    this.cleanups = [];

    this.container.innerHTML = '';
    this.container.className = 'doc-pane-tree-root';

    const rootEl = this.renderNode(this.layout.root);
    this.container.appendChild(rootEl);

    this.updateActivePaneVisuals();
  }

  private renderNode(node: PaneNode): HTMLElement {
    if (node.type === 'leaf') {
      return this.renderLeaf(node);
    }
    return this.renderSplit(node);
  }

  private renderSplit(split: PaneSplit): HTMLElement {
    const splitEl = document.createElement('div');
    splitEl.className = `pane-split-container pane-split-${split.direction}`;
    splitEl.setAttribute('data-split-id', split.id);

    const firstWrapper = document.createElement('div');
    firstWrapper.className = 'pane-split-child pane-split-first';
    const firstPct = (split.ratio * 100).toFixed(2);
    const secondPct = ((1 - split.ratio) * 100).toFixed(2);

    if (split.direction === 'horizontal') {
      firstWrapper.style.flex = `0 0 calc(${firstPct}% - 2px)`;
      firstWrapper.style.width = `calc(${firstPct}% - 2px)`;
      firstWrapper.style.height = '100%';
    } else {
      firstWrapper.style.flex = `0 0 calc(${firstPct}% - 2px)`;
      firstWrapper.style.height = `calc(${firstPct}% - 2px)`;
      firstWrapper.style.width = '100%';
    }
    firstWrapper.appendChild(this.renderNode(split.first));

    const divider = document.createElement('div');
    divider.className = `pane-divider pane-divider-${split.direction}`;
    divider.setAttribute('title', 'Drag to resize panes (double-click to reset)');

    const secondWrapper = document.createElement('div');
    secondWrapper.className = 'pane-split-child pane-split-second';
    if (split.direction === 'horizontal') {
      secondWrapper.style.flex = `0 0 calc(${secondPct}% - 2px)`;
      secondWrapper.style.width = `calc(${secondPct}% - 2px)`;
      secondWrapper.style.height = '100%';
    } else {
      secondWrapper.style.flex = `0 0 calc(${secondPct}% - 2px)`;
      secondWrapper.style.height = `calc(${secondPct}% - 2px)`;
      secondWrapper.style.width = '100%';
    }
    secondWrapper.appendChild(this.renderNode(split.second));

    // Wire splitter drag & double-click
    this.bindSplitter(divider, split, firstWrapper, secondWrapper, splitEl);

    splitEl.appendChild(firstWrapper);
    splitEl.appendChild(divider);
    splitEl.appendChild(secondWrapper);
    return splitEl;
  }

  private bindSplitter(
    divider: HTMLElement,
    split: PaneSplit,
    firstChild: HTMLElement,
    secondChild: HTMLElement,
    parentContainer: HTMLElement
  ): void {
    let isDragging = false;

    const updateSizes = (ratio: number) => {
      const firstPct = (ratio * 100).toFixed(2);
      const secondPct = ((1 - ratio) * 100).toFixed(2);
      if (split.direction === 'horizontal') {
        firstChild.style.flex = `0 0 calc(${firstPct}% - 2px)`;
        firstChild.style.width = `calc(${firstPct}% - 2px)`;
        secondChild.style.flex = `0 0 calc(${secondPct}% - 2px)`;
        secondChild.style.width = `calc(${secondPct}% - 2px)`;
      } else {
        firstChild.style.flex = `0 0 calc(${firstPct}% - 2px)`;
        firstChild.style.height = `calc(${firstPct}% - 2px)`;
        secondChild.style.flex = `0 0 calc(${secondPct}% - 2px)`;
        secondChild.style.height = `calc(${secondPct}% - 2px)`;
      }
      split.ratio = ratio;
      this.spaceViewports.forEach(vp => vp.render());
    };

    // Double-click boundary to distribute evenly (50%/50%)
    const onDblClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      updateSizes(0.5);
      this.saveLayout();
    };
    divider.addEventListener('dblclick', onDblClick);

    // Mouse down starts dragging
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      isDragging = true;
      document.body.style.cursor = split.direction === 'horizontal' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
      divider.classList.add('active');
    };
    divider.addEventListener('mousedown', onMouseDown);

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const rect = parentContainer.getBoundingClientRect();

      const minDimensionPx = 60; // Minimum pane size to prevent collapsing to unusable
      let newRatio = 0.5;

      if (split.direction === 'horizontal') {
        const totalW = rect.width;
        if (totalW > 0) {
          const minRatio = Math.min(0.45, Math.max(0.05, minDimensionPx / totalW));
          const maxRatio = Math.max(0.55, Math.min(0.95, (totalW - minDimensionPx) / totalW));
          const offset = e.clientX - rect.left;
          newRatio = Math.max(minRatio, Math.min(maxRatio, offset / totalW));
        }
      } else {
        const totalH = rect.height;
        if (totalH > 0) {
          const minRatio = Math.min(0.45, Math.max(0.05, minDimensionPx / totalH));
          const maxRatio = Math.max(0.55, Math.min(0.95, (totalH - minDimensionPx) / totalH));
          const offset = e.clientY - rect.top;
          newRatio = Math.max(minRatio, Math.min(maxRatio, offset / totalH));
        }
      }

      updateSizes(newRatio);
    };

    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        divider.classList.remove('active');
        this.saveLayout();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);

      this.cleanups.push(() => {
        divider.removeEventListener('dblclick', onDblClick);
        divider.removeEventListener('mousedown', onMouseDown);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      });
    }
  }

  private renderLeaf(leaf: PaneLeaf): HTMLElement {
    const leafEl = document.createElement('div');
    leafEl.className = 'pane-leaf-container';
    leafEl.setAttribute('data-leaf-id', leaf.id);

    // Click to focus
    leafEl.addEventListener('mousedown', () => {
      this.setActivePaneId(leaf.id);
    });

    // 1. Tab Bar Header
    const header = document.createElement('div');
    header.className = 'pane-tab-bar';

    const tabsList = document.createElement('div');
    tabsList.className = 'pane-tabs';

    leaf.tabs.forEach((tab, index) => {
      const isActive = tab.id === leaf.activeTabId;
      const isDirty = tab.type === 'document' && (this.options.isDocumentDirty?.(tab.documentId) ?? false);

      const tabEl = document.createElement('div');
      tabEl.className = `pane-tab ${isActive ? 'active' : ''}`;
      tabEl.setAttribute('data-tab-id', tab.id);
      tabEl.setAttribute('draggable', 'true');
      tabEl.setAttribute('title', tab.title);

      // Icon by view type
      const iconSpan = document.createElement('span');
      iconSpan.className = 'pane-tab-icon';
      iconSpan.textContent = this.getTabIconText(tab.type);
      tabEl.appendChild(iconSpan);

      // Title (double click to inline rename)
      const titleSpan = document.createElement('span');
      titleSpan.className = 'pane-tab-title';
      titleSpan.textContent = tab.title;

      titleSpan.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        this.makeTabTitleEditable(titleSpan, tab);
      });
      tabEl.appendChild(titleSpan);

      // Dirty dot
      if (isDirty) {
        const dirtyDot = document.createElement('span');
        dirtyDot.className = 'pane-tab-dirty-dot';
        dirtyDot.setAttribute('title', 'Unsaved changes');
        tabEl.appendChild(dirtyDot);
      }

      // Close button
      const closeBtn = document.createElement('button');
      closeBtn.className = 'pane-tab-close-btn';
      closeBtn.innerHTML = '&times;';
      closeBtn.setAttribute('title', 'Close tab');
      closeBtn.onclick = (e) => {
        e.stopPropagation();
        this.closeTab(leaf.id, tab.id);
      };
      tabEl.appendChild(closeBtn);

      // Tab activation
      tabEl.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.pane-tab-close-btn')) return;
        leaf.activeTabId = tab.id;
        this.setActivePaneId(leaf.id);
        this.saveLayout();
        this.render();
      });

      // Right-click context menu on tab
      tabEl.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this.showTabContextMenu(e.clientX, e.clientY, leaf.id, tab);
      });

      // Drag and drop setup
      this.bindTabDragAndDrop(tabEl, leaf.id, tab.id, index);

      tabsList.appendChild(tabEl);
    });

    header.appendChild(tabsList);
    leafEl.appendChild(header);

    // 2. Pane Content Body
    const body = document.createElement('div');
    body.className = 'pane-body';

    const activeTab = leaf.tabs.find(t => t.id === leaf.activeTabId) || leaf.tabs[0];
    if (activeTab) {
      this.renderTabContent(body, leaf.id, activeTab);
    }

    leafEl.appendChild(body);

    // 3. Drop Zone Overlay for Splitting
    const dropOverlay = document.createElement('div');
    dropOverlay.className = 'pane-drop-overlay hidden';
    const dropLabel = document.createElement('div');
    dropLabel.className = 'pane-drop-label';
    dropOverlay.appendChild(dropLabel);
    leafEl.appendChild(dropOverlay);

    this.bindPaneDropZones(leafEl, dropOverlay, dropLabel, leaf.id);
    return leafEl;
  }

  public getTargetPaneForNewTab(): string {
    const active = this.layout.activePaneId;
    if (active && findLeaf(this.layout.root, active)) {
      return active;
    }
    const leaves = getAllLeaves(this.layout.root);
    if (leaves.length > 0) {
      return leaves[0].id;
    }
    return '';
  }

  private makeTabTitleEditable(titleSpan: HTMLElement, tab: TabData): void {
    const originalTitle = tab.title;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'pane-tab-rename-input';
    input.value = originalTitle;

    const commitRename = () => {
      const newTitle = input.value.trim() || originalTitle;
      tab.title = newTitle;
      titleSpan.textContent = newTitle;
      this.saveLayout();
    };

    input.addEventListener('blur', commitRename);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        input.blur();
      } else if (e.key === 'Escape') {
        input.value = originalTitle;
        input.blur();
      }
    });

    titleSpan.innerHTML = '';
    titleSpan.appendChild(input);
    input.focus();
    input.select();
  }

  public showTabContextMenu(x: number, y: number, leafId: string, tab: TabData): void {
    document.querySelectorAll('.pane-tab-context-menu').forEach(el => el.remove());

    const menu = document.createElement('div');
    menu.className = 'pane-tab-context-menu';
    menu.style.left = `${Math.min(x, typeof window !== 'undefined' ? window.innerWidth - 240 : x)}px`;
    menu.style.top = `${Math.min(y, typeof window !== 'undefined' ? window.innerHeight - 320 : y)}px`;

    // 1. Related views for this document
    if (tab.type === 'document') {
      const docBaseName = tab.title.replace(/\.ax$/, '');

      const sectionTitle = document.createElement('div');
      sectionTitle.className = 'pane-dropdown-section-title';
      sectionTitle.textContent = 'Views';
      menu.appendChild(sectionTitle);

      // Results Stream
      const resItem = document.createElement('button');
      resItem.className = 'pane-dropdown-item';
      resItem.innerHTML = `<span>Results (${escapeHtml(docBaseName)})</span>`;
      resItem.addEventListener('click', () => {
        menu.remove();
        this.openTab({
          id: 'tab_results_' + Math.random().toString(36).substring(2, 9),
          type: 'results',
          title: `${docBaseName} — Results`,
          documentId: tab.documentId,
        }, leafId);
      });
      menu.appendChild(resItem);

      // Scope
      const scopeItem = document.createElement('button');
      scopeItem.className = 'pane-dropdown-item';
      scopeItem.innerHTML = `<span>Scope</span>`;
      scopeItem.addEventListener('click', () => {
        menu.remove();
        this.openTab({
          id: 'tab_scope_' + Math.random().toString(36).substring(2, 9),
          type: 'scope',
          title: 'Scope',
          documentId: tab.documentId,
        }, leafId);
      });
      menu.appendChild(scopeItem);

      // Trace
      const traceItem = document.createElement('button');
      traceItem.className = 'pane-dropdown-item';
      traceItem.innerHTML = `<span>Trace</span>`;
      traceItem.addEventListener('click', () => {
        menu.remove();
        this.openTab({
          id: 'tab_trace_' + Math.random().toString(36).substring(2, 9),
          type: 'trace',
          title: 'Trace',
          documentId: tab.documentId,
        }, leafId);
      });
      menu.appendChild(traceItem);

      // Frames
      const framesItem = document.createElement('button');
      framesItem.className = 'pane-dropdown-item';
      framesItem.innerHTML = `<span>Frames</span>`;
      framesItem.addEventListener('click', () => {
        menu.remove();
        this.openTab({
          id: 'tab_frames_' + Math.random().toString(36).substring(2, 9),
          type: 'frames',
          title: 'Frames',
          documentId: tab.documentId,
        }, leafId);
      });
      menu.appendChild(framesItem);

      // 2. Spaces in this document
      const spaces = this.options.getAvailableSpaces?.() || [];
      if (spaces.length > 0) {
        const spaceSection = document.createElement('div');
        spaceSection.className = 'pane-dropdown-section-title';
        spaceSection.textContent = 'Spaces';
        menu.appendChild(spaceSection);

        spaces.forEach(sp => {
          const item = document.createElement('button');
          item.className = 'pane-dropdown-item';
          const cleanTitle = sp.title.length > 25 ? sp.title.substring(0, 24) + '…' : sp.title;
          item.innerHTML = `<span>L${sp.lineIdx + 1}: ${escapeHtml(cleanTitle)}</span>`;
          item.addEventListener('click', () => {
            menu.remove();
            this.openTab({
              id: 'tab_space_' + Math.random().toString(36).substring(2, 9),
              type: 'space',
              title: `L${sp.lineIdx + 1}: ${cleanTitle}`,
              documentId: tab.documentId,
              spaceLineIdx: sp.lineIdx,
              spaceExprText: sp.title,
            }, leafId);
          });
          menu.appendChild(item);
        });
      }

      const div = document.createElement('div');
      div.className = 'doc-file-menu-divider';
      menu.appendChild(div);
    }

    // Split operations on this tab
    const splitRightItem = document.createElement('button');
    splitRightItem.className = 'pane-dropdown-item';
    splitRightItem.innerHTML = `<span>Split Right</span>`;
    splitRightItem.addEventListener('click', () => {
      menu.remove();
      this.splitTab(leafId, tab.id, 'horizontal', 'after');
    });
    menu.appendChild(splitRightItem);

    const splitDownItem = document.createElement('button');
    splitDownItem.className = 'pane-dropdown-item';
    splitDownItem.innerHTML = `<span>Split Down</span>`;
    splitDownItem.addEventListener('click', () => {
      menu.remove();
      this.splitTab(leafId, tab.id, 'vertical', 'after');
    });
    menu.appendChild(splitDownItem);

    const closeItem = document.createElement('button');
    closeItem.className = 'pane-dropdown-item';
    closeItem.innerHTML = `<span>Close tab</span>`;
    closeItem.addEventListener('click', () => {
      menu.remove();
      this.closeTab(leafId, tab.id);
    });
    menu.appendChild(closeItem);

    if (typeof document !== 'undefined') {
      document.body.appendChild(menu);

      const dismissHandler = (e: MouseEvent) => {
        if (!menu.contains(e.target as Node)) {
          menu.remove();
          document.removeEventListener('click', dismissHandler);
          document.removeEventListener('contextmenu', dismissHandler);
        }
      };
      setTimeout(() => {
        document.addEventListener('click', dismissHandler);
        document.addEventListener('contextmenu', dismissHandler);
      }, 10);
    }
  }

  private getTabIconText(_type: PaneViewType): string {
    return '';
  }

  public populateNewTabMenu(dropdown: HTMLElement, targetLeafId?: string): void {
    const leafId = targetLeafId || this.getTargetPaneForNewTab();
    dropdown.innerHTML = '';

    const activeDocTab = getAllTabs(this.layout.root).find(t => t.type === 'document');
    const docFileName = activeDocTab?.title || 'untitled.ax';
    const docBaseName = docFileName.replace(/\.ax$/, '');

    // 1. Documents section
    const docSection = document.createElement('div');
    docSection.className = 'doc-file-menu-section-title';
    docSection.textContent = 'Document & results';
    dropdown.appendChild(docSection);

    const newDocItem = document.createElement('button');
    newDocItem.className = 'doc-file-menu-item';
    newDocItem.innerHTML = `<span>New document (.ax)</span>`;
    newDocItem.onclick = () => {
      dropdown.classList.add('hidden');
      const newTab: TabData = this.options.onNewDocumentTab?.() || {
        id: 'tab_' + Math.random().toString(36).substring(2, 9),
        type: 'document',
        title: 'untitled.ax',
      };
      this.openTab(newTab, leafId || undefined);
    };
    dropdown.appendChild(newDocItem);

    const resultsItem = document.createElement('button');
    resultsItem.className = 'doc-file-menu-item';
    resultsItem.innerHTML = `<span>Results (${escapeHtml(docBaseName)})</span>`;
    resultsItem.onclick = () => {
      dropdown.classList.add('hidden');
      this.openTab({
        id: 'tab_results_' + Math.random().toString(36).substring(2, 9),
        type: 'results',
        title: `${docBaseName} — Results`,
        documentId: activeDocTab?.documentId,
      }, leafId || undefined);
    };
    dropdown.appendChild(resultsItem);

    // 2. Spaces section
    const spaces = this.options.getAvailableSpaces?.() || [];
    if (spaces.length > 0) {
      const divider = document.createElement('div');
      divider.className = 'doc-file-menu-divider';
      dropdown.appendChild(divider);

      const spaceSection = document.createElement('div');
      spaceSection.className = 'doc-file-menu-section-title';
      spaceSection.textContent = 'Spaces';
      dropdown.appendChild(spaceSection);

      spaces.forEach(sp => {
        const item = document.createElement('button');
        item.className = 'doc-file-menu-item';
        const rawLine = sp.title.trim() || `Line ${sp.lineIdx + 1}`;
        const cleanTitle = rawLine.length > 25 ? rawLine.substring(0, 24) + '…' : rawLine;
        item.innerHTML = `<span>L${sp.lineIdx + 1}: ${escapeHtml(cleanTitle)}</span>`;
        item.onclick = () => {
          dropdown.classList.add('hidden');
          const spaceTab: TabData = {
            id: 'tab_space_' + Math.random().toString(36).substring(2, 9),
            type: 'space',
            title: `L${sp.lineIdx + 1}: ${cleanTitle}`,
            documentId: activeDocTab?.documentId,
            spaceLineIdx: sp.lineIdx,
            spaceExprText: sp.title,
          };
          this.openTab(spaceTab, leafId || undefined);
        };
        dropdown.appendChild(item);
      });
    }

    // 3. Inspectors section
    const divider2 = document.createElement('div');
    divider2.className = 'doc-file-menu-divider';
    dropdown.appendChild(divider2);

    const inspSection = document.createElement('div');
    inspSection.className = 'doc-file-menu-section-title';
    inspSection.textContent = 'Inspectors';
    dropdown.appendChild(inspSection);

    const scopeItem = document.createElement('button');
    scopeItem.className = 'doc-file-menu-item';
    scopeItem.innerHTML = '<span>Scope</span>';
    scopeItem.onclick = () => {
      dropdown.classList.add('hidden');
      this.openTab({
        id: 'tab_scope_' + Math.random().toString(36).substring(2, 9),
        type: 'scope',
        title: 'Scope',
        documentId: activeDocTab?.documentId,
      }, leafId || undefined);
    };
    dropdown.appendChild(scopeItem);

    const traceItem = document.createElement('button');
    traceItem.className = 'doc-file-menu-item';
    traceItem.innerHTML = '<span>Trace</span>';
    traceItem.onclick = () => {
      dropdown.classList.add('hidden');
      this.openTab({
        id: 'tab_trace_' + Math.random().toString(36).substring(2, 9),
        type: 'trace',
        title: 'Trace',
        documentId: activeDocTab?.documentId,
      }, leafId || undefined);
    };
    dropdown.appendChild(traceItem);

    const framesItem = document.createElement('button');
    framesItem.className = 'doc-file-menu-item';
    framesItem.innerHTML = '<span>Frames</span>';
    framesItem.onclick = () => {
      dropdown.classList.add('hidden');
      this.openTab({
        id: 'tab_frames_' + Math.random().toString(36).substring(2, 9),
        type: 'frames',
        title: 'Frames',
        documentId: activeDocTab?.documentId,
      }, leafId || undefined);
    };
    dropdown.appendChild(framesItem);

    // 4. Workspace & Files section
    const divider3 = document.createElement('div');
    divider3.className = 'doc-file-menu-divider';
    dropdown.appendChild(divider3);

    const wsSection = document.createElement('div');
    wsSection.className = 'doc-file-menu-section-title';
    wsSection.textContent = 'Workspace';
    dropdown.appendChild(wsSection);

    const fileTreeItem = document.createElement('button');
    fileTreeItem.className = 'doc-file-menu-item';
    fileTreeItem.innerHTML = '<span>Files</span>';
    fileTreeItem.onclick = () => {
      dropdown.classList.add('hidden');
      this.openTab({
        id: 'tab_tree_' + Math.random().toString(36).substring(2, 9),
        type: 'tree',
        title: 'Files',
      }, leafId || undefined);
    };
    dropdown.appendChild(fileTreeItem);
  }

  private renderTabContent(body: HTMLElement, leafId: string, tab: TabData): void {
    body.innerHTML = '';

    if (tab.type === 'document') {
      if (this.options.renderDocumentView) {
        this.options.renderDocumentView(leafId, tab, body);
      } else {
        body.innerHTML = '<div class="doc-editor-placeholder">Document Editor</div>';
      }
      return;
    }

    if (tab.type === 'results') {
      if (this.options.renderResultsView) {
        this.options.renderResultsView(leafId, tab, body);
      } else {
        body.innerHTML = '<div class="doc-results-placeholder">Results Stream</div>';
      }
      return;
    }

    if (tab.type === 'space') {
      const spaceContainer = document.createElement('div');
      spaceContainer.className = 'pane-space-viewport-wrapper';
      body.appendChild(spaceContainer);

      let spaceVal: SpaceValue | null = null;
      if (typeof tab.spaceLineIdx === 'number' && this.options.getSpaceValueForLine) {
        spaceVal = this.options.getSpaceValueForLine(tab.documentId, tab.spaceLineIdx);
      }

      if (!spaceVal) {
        // Fallback default 2D/3D space
        spaceVal = {
          type: 'space',
          dimension: 2,
          coordinates: ['x', 'y'],
          entities: [],
        };
      }

      // Instantiate or retrieve viewport with tab's isolated camera state
      const vp = new SpaceViewport(spaceContainer, spaceVal, {
        initialCameraState: tab.cameraState,
        onCameraChange: (newCamera) => {
          tab.cameraState = newCamera;
          this.saveLayout();
        },
        onJumpToSource: (lineIdx) => {
          this.options.onJumpToSource?.(tab.documentId, lineIdx);
        },
      });

      this.spaceViewports.set(tab.id, vp);
      return;
    }

    if (tab.type === 'scope') {
      this.renderScopeView(body);
      return;
    }

    if (tab.type === 'trace') {
      this.renderTraceView(body);
      return;
    }

    if (tab.type === 'frames') {
      this.renderFramesView(body);
      return;
    }

    if (tab.type === 'tree') {
      this.renderTreeView(body);
      return;
    }
  }

  public updateTreePanes(): void {
    const leaves = getAllLeaves(this.layout.root);
    leaves.forEach(leaf => {
      const activeTab = leaf.tabs.find(t => t.id === leaf.activeTabId);
      if (!activeTab || activeTab.type !== 'tree') return;

      const paneEl = this.container.querySelector(`.pane-leaf-container[data-leaf-id="${leaf.id}"]`);
      const bodyEl = paneEl?.querySelector('.pane-body') as HTMLElement;
      if (!bodyEl) return;

      this.renderTreeView(bodyEl);
    });
  }

  private renderTreeView(container: HTMLElement): void {
    container.innerHTML = '';
    const treeWrapper = document.createElement('div');
    treeWrapper.className = 'pane-tree-view';

    // Header / Toolbar
    const header = document.createElement('div');
    header.className = 'pane-tree-header';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'pane-tree-title';
    titleSpan.textContent = 'Files';
    header.appendChild(titleSpan);

    const actionsBar = document.createElement('div');
    actionsBar.className = 'pane-tree-actions';

    const newFileBtn = document.createElement('button');
    newFileBtn.className = 'pane-tree-btn';
    newFileBtn.title = 'New file';
    newFileBtn.innerHTML = `${ICONS.newFile || ''}<span>File</span>`;
    newFileBtn.onclick = async (e) => {
      e.stopPropagation();
      const fileName = typeof window !== 'undefined' ? window.prompt('New file name (e.g. model.ax):', 'model.ax') : 'model.ax';
      if (fileName) {
        const cleanName = fileName.endsWith('.ax') ? fileName : fileName + '.ax';
        await this.options.onNewFileInWorkspace?.(cleanName);
        this.renderTreeView(container);
      }
    };
    actionsBar.appendChild(newFileBtn);

    const newFolderBtn = document.createElement('button');
    newFolderBtn.className = 'pane-tree-btn';
    newFolderBtn.title = 'New folder';
    newFolderBtn.innerHTML = `${ICONS.newFolder || ''}<span>Folder</span>`;
    newFolderBtn.onclick = async (e) => {
      e.stopPropagation();
      const folderName = typeof window !== 'undefined' ? window.prompt('New folder name:', 'lib') : 'lib';
      if (folderName) {
        await this.options.onNewFolderInWorkspace?.(folderName);
        this.renderTreeView(container);
      }
    };
    actionsBar.appendChild(newFolderBtn);

    header.appendChild(actionsBar);
    treeWrapper.appendChild(header);

    // Tree Body
    const treeBody = document.createElement('div');
    treeBody.className = 'pane-tree-body';

    const workspace = this.options.getWorkspace?.();
    const filesMap: Map<string, string> = workspace?.files || new Map();
    const treeItems = WorkspaceManager.buildFileTree(filesMap);

    if (treeItems.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'pane-tree-empty';
      emptyDiv.textContent = 'No files in workspace';
      treeBody.appendChild(emptyDiv);
    } else {
      const renderNodes = (nodes: WorkspaceFileItem[], parentEl: HTMLElement, level: number = 0) => {
        nodes.forEach(node => {
          if (node.name === '.keep') return;

          const row = document.createElement('div');
          row.className = `pane-tree-row ${node.isDirectory ? 'is-directory' : 'is-file'}`;
          row.style.paddingLeft = `${10 + level * 14}px`;

          const labelContainer = document.createElement('div');
          labelContainer.className = 'pane-tree-label-container';

          const iconSpan = document.createElement('span');
          iconSpan.className = 'pane-tree-icon';
          iconSpan.innerHTML = node.isDirectory ? ICONS.folder : ICONS.file;
          labelContainer.appendChild(iconSpan);

          const nameSpan = document.createElement('span');
          nameSpan.className = 'pane-tree-name';
          nameSpan.textContent = node.name;
          labelContainer.appendChild(nameSpan);

          row.appendChild(labelContainer);

          // Actions
          const rowActions = document.createElement('div');
          rowActions.className = 'pane-tree-row-actions';

          const renameBtn = document.createElement('button');
          renameBtn.className = 'pane-tree-row-btn';
          renameBtn.title = 'Rename';
          renameBtn.textContent = 'Rename';
          renameBtn.onclick = async (e) => {
            e.stopPropagation();
            const newName = typeof window !== 'undefined' ? window.prompt('Rename to:', node.name) : '';
            if (newName && newName !== node.name) {
              const parts = node.path.split('/');
              parts[parts.length - 1] = newName;
              const newPath = parts.join('/');
              await this.options.onRenameFileInWorkspace?.(node.path, newPath);
              this.renderTreeView(container);
            }
          };
          rowActions.appendChild(renameBtn);

          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'pane-tree-row-btn delete-btn';
          deleteBtn.title = 'Delete';
          deleteBtn.textContent = 'Delete';
          deleteBtn.onclick = async (e) => {
            e.stopPropagation();
            const confirmed = typeof window !== 'undefined' ? window.confirm(`Delete ${node.name}?`) : true;
            if (confirmed) {
              await this.options.onDeleteFileInWorkspace?.(node.path);
              this.renderTreeView(container);
            }
          };
          rowActions.appendChild(deleteBtn);

          row.appendChild(rowActions);

          if (!node.isDirectory) {
            row.onclick = () => {
              this.options.onOpenFile?.(node.path);
            };
          }

          parentEl.appendChild(row);

          if (node.isDirectory && node.children && node.children.length > 0) {
            const childContainer = document.createElement('div');
            childContainer.className = 'pane-tree-children';
            renderNodes(node.children, childContainer, level + 1);
            parentEl.appendChild(childContainer);

            labelContainer.onclick = () => {
              childContainer.classList.toggle('collapsed');
            };
          }
        });
      };

      renderNodes(treeItems, treeBody, 0);
    }

    treeWrapper.appendChild(treeBody);
    container.appendChild(treeWrapper);
  }

  private renderScopeView(container: HTMLElement): void {
    const scopeData = this.options.getScopeData?.() || new Map();
    let html = '<div class="pane-inspector-view"><div class="doc-panel-section-title">Scope</div>';
    if (scopeData.size === 0) {
      html += '<div class="doc-scope-empty">No definitions in scope</div>';
    } else {
      scopeData.forEach((info, name) => {
        html += `
          <div class="doc-scope-item">
            <div class="scope-item-header">
              <span class="scope-name">${name}</span>
              <span class="scope-type">${info.type}</span>
              <span class="scope-line">Line ${info.line}</span>
              ${info.isShadowed ? '<span class="doc-shadowed-badge">shadowed</span>' : ''}
            </div>
            <div class="scope-val">${info.value}</div>
          </div>
        `;
      });
    }
    html += '</div>';
    container.innerHTML = html;
  }

  private renderTraceView(container: HTMLElement): void {
    const trace = this.options.getTraceData?.() || { durationMs: 0, lineCount: 0, status: 'Ready' };
    container.innerHTML = `
      <div class="pane-inspector-view">
        <div class="doc-panel-section-title">Trace</div>
        <div class="doc-trace-content">
          <div class="trace-metric">
            <span class="trace-label">Duration:</span>
            <span class="trace-value">${trace.durationMs.toFixed(1)} ms</span>
          </div>
          <div class="trace-metric">
            <span class="trace-label">Evaluated lines:</span>
            <span class="trace-value">${trace.lineCount}</span>
          </div>
          <div class="trace-metric">
            <span class="trace-label">Status:</span>
            <span class="trace-value">${trace.status}</span>
          </div>
        </div>
      </div>
    `;
  }

  private renderFramesView(container: HTMLElement): void {
    const frames = this.options.getFramesData?.() || [];
    let html = '<div class="pane-inspector-view"><div class="doc-panel-section-title">Frames</div>';
    if (frames.length === 0) {
      html += '<div class="doc-scope-empty">No frames recorded</div>';
    } else {
      html += '<div class="doc-frames-list">';
      frames.forEach(f => {
        html += `
          <div class="doc-frame-item">
            <div class="frame-header">
              <span class="frame-id">#${f.id}</span>
              <span class="frame-type">${f.type}</span>
              <span class="frame-time">${new Date(f.timestamp).toLocaleTimeString()}</span>
            </div>
            <div class="frame-summary">${f.summary}</div>
          </div>
        `;
      });
      html += '</div>';
    }
    html += '</div>';
    container.innerHTML = html;
  }

  private bindTabDragAndDrop(tabEl: HTMLElement, leafId: string, tabId: string, index: number): void {
    tabEl.addEventListener('dragstart', (e: DragEvent) => {
      this.draggingTab = { tabId, sourceLeafId: leafId };
      tabEl.classList.add('tab-dragging');
      e.dataTransfer?.setData('text/plain', JSON.stringify({ tabId, sourceLeafId: leafId }));
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
      }
    });

    tabEl.addEventListener('dragend', () => {
      this.draggingTab = null;
      tabEl.classList.remove('tab-dragging');
      this.hideAllDropOverlays();
    });

    tabEl.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      tabEl.classList.add('tab-dragover');
    });

    tabEl.addEventListener('dragleave', () => {
      tabEl.classList.remove('tab-dragover');
    });

    tabEl.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      tabEl.classList.remove('tab-dragover');

      if (this.draggingTab) {
        const { newRoot } = moveTab(
          this.layout.root,
          this.draggingTab.sourceLeafId,
          this.draggingTab.tabId,
          leafId,
          index
        );
        this.layout.root = newRoot;
        this.layout.activePaneId = leafId;
        this.saveLayout();
        this.render();
      }
    });
  }

  private bindPaneDropZones(
    leafEl: HTMLElement,
    dropOverlay: HTMLElement,
    dropLabel: HTMLElement,
    leafId: string
  ): void {
    leafEl.addEventListener('dragover', (e: DragEvent) => {
      if (!this.draggingTab) {
        const data = e.dataTransfer?.getData('text/plain');
        if (data) {
          try {
            this.draggingTab = JSON.parse(data);
          } catch {}
        }
      }
      if (!this.draggingTab) return;

      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

      const rect = leafEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const relX = Math.max(0, Math.min(1, x / rect.width));
      const relY = Math.max(0, Math.min(1, y / rect.height));

      // Distance to four edges
      const distLeft = relX;
      const distRight = 1 - relX;
      const distTop = relY;
      const distBottom = 1 - relY;
      const minDist = Math.min(distLeft, distRight, distTop, distBottom);

      dropOverlay.classList.remove('hidden');

      // Edge threshold: within 25% of any boundary triggers edge split
      if (minDist < 0.25) {
        if (minDist === distRight) {
          dropOverlay.setAttribute('data-zone', 'right');
          dropLabel.textContent = 'Split Right';
        } else if (minDist === distBottom) {
          dropOverlay.setAttribute('data-zone', 'bottom');
          dropLabel.textContent = 'Split Down';
        } else if (minDist === distLeft) {
          dropOverlay.setAttribute('data-zone', 'left');
          dropLabel.textContent = 'Split Left';
        } else {
          dropOverlay.setAttribute('data-zone', 'top');
          dropLabel.textContent = 'Split Up';
        }
      } else {
        // In the middle: adds to this pane's tab bar
        dropOverlay.setAttribute('data-zone', 'center');
        dropLabel.textContent = 'Add to Tab Bar';
      }
    });

    leafEl.addEventListener('dragleave', (e: DragEvent) => {
      if (!leafEl.contains(e.relatedTarget as Node)) {
        dropOverlay.classList.add('hidden');
      }
    });

    leafEl.addEventListener('drop', (e: DragEvent) => {
      if (!this.draggingTab) {
        const data = e.dataTransfer?.getData('text/plain');
        if (data) {
          try {
            this.draggingTab = JSON.parse(data);
          } catch {}
        }
      }
      if (!this.draggingTab) return;

      e.preventDefault();
      e.stopPropagation();
      dropOverlay.classList.add('hidden');

      const zone = dropOverlay.getAttribute('data-zone') || 'center';
      const { tabId, sourceLeafId } = this.draggingTab;

      let newLeafId: string | undefined;

      if (zone === 'left') {
        const res = splitAndMoveTab(this.layout.root, sourceLeafId, tabId, leafId, 'horizontal', 'before');
        this.layout.root = res.newRoot;
        newLeafId = res.newLeafId;
      } else if (zone === 'right') {
        const res = splitAndMoveTab(this.layout.root, sourceLeafId, tabId, leafId, 'horizontal', 'after');
        this.layout.root = res.newRoot;
        newLeafId = res.newLeafId;
      } else if (zone === 'top') {
        const res = splitAndMoveTab(this.layout.root, sourceLeafId, tabId, leafId, 'vertical', 'before');
        this.layout.root = res.newRoot;
        newLeafId = res.newLeafId;
      } else if (zone === 'bottom') {
        const res = splitAndMoveTab(this.layout.root, sourceLeafId, tabId, leafId, 'vertical', 'after');
        this.layout.root = res.newRoot;
        newLeafId = res.newLeafId;
      } else {
        // Middle: append to tabs in leaf
        const res = moveTab(this.layout.root, sourceLeafId, tabId, leafId);
        this.layout.root = res.newRoot;
        newLeafId = leafId;
      }

      if (newLeafId) {
        this.layout.activePaneId = newLeafId;
      }
      this.saveLayout();
      this.render();
    });
  }

  private hideAllDropOverlays(): void {
    this.container.querySelectorAll('.pane-drop-overlay').forEach(el => el.classList.add('hidden'));
    this.container.querySelectorAll('.pane-tab').forEach(el => el.classList.remove('tab-dragover'));
  }

  private updateActivePaneVisuals(): void {
    const leaves = this.container.querySelectorAll('.pane-leaf-container');
    leaves.forEach(el => {
      const id = el.getAttribute('data-leaf-id');
      el.classList.toggle('focused', id === this.layout.activePaneId);
    });
  }

  public dispose(): void {
    this.cleanups.forEach(fn => fn());
    this.cleanups = [];
    this.spaceViewports.forEach(vp => vp.dispose());
    this.spaceViewports.clear();
    this.container.innerHTML = '';
  }
}
