/**
 * Pane Tree Data Structures & Tree Manipulation
 * 
 * Provides binary space partition (BSP) tiling tree model for Axine workspace panes.
 * Every view is an equal tab: .ax document, space, scope, trace, frames.
 */

export type PaneViewType = 'document' | 'results' | 'space' | 'scope' | 'trace' | 'frames';

export interface CameraState {
  viewMode: '1d' | '2d' | '3d';
  displayAxes: [string, string];
  fixedCoords: Record<string, number>;
  bounds2D: { minX: number; maxX: number; minY: number; maxY: number };
  bounds3D: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  angleX: number;
  angleZ: number;
  zoom3D: number;
  pan3DX: number;
  pan3DY: number;
}

export interface TabData {
  id: string;
  type: PaneViewType;
  title: string;
  documentId?: string;
  spaceLineIdx?: number;
  spaceExprText?: string;
  cameraState?: CameraState;
}

export interface PaneLeaf {
  type: 'leaf';
  id: string;
  tabs: TabData[];
  activeTabId: string;
}

export interface PaneSplit {
  type: 'split';
  id: string;
  direction: 'horizontal' | 'vertical'; // horizontal = side-by-side (left/right); vertical = stacked (top/bottom)
  ratio: number; // 0.0 - 1.0 (relative size of first child)
  first: PaneNode;
  second: PaneNode;
}

export type PaneNode = PaneLeaf | PaneSplit;

export interface WorkspaceLayout {
  version: 1;
  root: PaneNode;
  activePaneId: string;
}

/**
 * Creates a default workspace layout with a single code editor pane and results tab.
 */
export function createDefaultLayout(initialTabs?: TabData[], defaultDocName?: string): WorkspaceLayout {
  const docName = defaultDocName || 'untitled.ax';
  const leafId = 'pane_' + Math.random().toString(36).substring(2, 9);
  const defaultTabs: TabData[] = initialTabs && initialTabs.length > 0 ? initialTabs : [
    {
      id: 'tab_doc_main',
      type: 'document',
      title: docName,
    }
  ];

  const root: PaneLeaf = {
    type: 'leaf',
    id: leafId,
    tabs: defaultTabs,
    activeTabId: defaultTabs[0]?.id || '',
  };

  return {
    version: 1,
    root,
    activePaneId: leafId,
  };
}

/**
 * Finds a leaf pane by ID in the tree.
 */
export function findLeaf(node: PaneNode, leafId: string): PaneLeaf | null {
  if (node.type === 'leaf') {
    return node.id === leafId ? node : null;
  }
  return findLeaf(node.first, leafId) || findLeaf(node.second, leafId);
}

/**
 * Finds the parent split of a given node in the tree.
 */
export function findParentSplit(node: PaneNode, childId: string): { parent: PaneSplit; isFirst: boolean } | null {
  if (node.type === 'leaf') {
    return null;
  }
  if (node.first.id === childId) {
    return { parent: node, isFirst: true };
  }
  if (node.second.id === childId) {
    return { parent: node, isFirst: false };
  }
  return findParentSplit(node.first, childId) || findParentSplit(node.second, childId);
}

/**
 * Finds a tab by ID anywhere in the tree.
 */
export function findTab(node: PaneNode, tabId: string): { leaf: PaneLeaf; tab: TabData; index: number } | null {
  if (node.type === 'leaf') {
    const idx = node.tabs.findIndex(t => t.id === tabId);
    if (idx !== -1) {
      return { leaf: node, tab: node.tabs[idx], index: idx };
    }
    return null;
  }
  return findTab(node.first, tabId) || findTab(node.second, tabId);
}

/**
 * Collects all leaf panes from the tree.
 */
export function getAllLeaves(node: PaneNode): PaneLeaf[] {
  if (node.type === 'leaf') {
    return [node];
  }
  return [...getAllLeaves(node.first), ...getAllLeaves(node.second)];
}

/**
 * Collects all tabs across all panes in the tree.
 */
export function getAllTabs(node: PaneNode): TabData[] {
  return getAllLeaves(node).flatMap(leaf => leaf.tabs);
}

/**
 * Adds a tab to a specific leaf pane.
 */
export function addTabToLeaf(root: PaneNode, leafId: string, tab: TabData, atIndex?: number): boolean {
  const leaf = findLeaf(root, leafId);
  if (!leaf) return false;

  // Prevent duplicate tab IDs
  const existingIdx = leaf.tabs.findIndex(t => t.id === tab.id);
  if (existingIdx !== -1) {
    leaf.activeTabId = tab.id;
    return true;
  }

  if (typeof atIndex === 'number' && atIndex >= 0 && atIndex <= leaf.tabs.length) {
    leaf.tabs.splice(atIndex, 0, tab);
  } else {
    leaf.tabs.push(tab);
  }
  leaf.activeTabId = tab.id;
  return true;
}

/**
 * Recursively prunes empty leaf panes from the tree, promoting sibling panes.
 * If the root is a single empty leaf, initializes a default document tab.
 */
export function pruneEmptyPanes(node: PaneNode, defaultDocName: string = 'thrown_ball.ax'): PaneNode {
  if (node.type === 'leaf') {
    if (node.tabs.length === 0) {
      const defaultTab: TabData = {
        id: 'tab_doc_' + Math.random().toString(36).substring(2, 9),
        type: 'document',
        title: defaultDocName,
      };
      return {
        ...node,
        tabs: [defaultTab],
        activeTabId: defaultTab.id,
      };
    }
    return node;
  }

  // Recursively prune children
  const first = pruneEmptyPanes(node.first, defaultDocName);
  const second = pruneEmptyPanes(node.second, defaultDocName);

  // If first child is empty leaf (and not root), promote second
  if (first.type === 'leaf' && first.tabs.length === 0) {
    return second;
  }
  // If second child is empty leaf (and not root), promote first
  if (second.type === 'leaf' && second.tabs.length === 0) {
    return first;
  }

  return {
    ...node,
    first,
    second,
  };
}

/**
 * Removes a tab from a leaf pane. If leaf becomes empty, prunes the leaf from the tree
 * and redistributes its space to neighbor panes.
 */
export function removeTabFromLeaf(
  root: PaneNode,
  leafId: string,
  tabId: string,
  defaultDocName: string = 'thrown_ball.ax'
): { newRoot: PaneNode; removedLeafId?: string } {
  const leaf = findLeaf(root, leafId);
  if (!leaf) {
    return { newRoot: root };
  }

  const tabIdx = leaf.tabs.findIndex(t => t.id === tabId);
  if (tabIdx !== -1) {
    leaf.tabs.splice(tabIdx, 1);
  }

  // Update active tab if needed
  if (leaf.activeTabId === tabId) {
    const nextIdx = Math.min(tabIdx, leaf.tabs.length - 1);
    leaf.activeTabId = leaf.tabs[nextIdx]?.id || '';
  }

  // If leaf still has tabs, root is unchanged
  if (leaf.tabs.length > 0) {
    return { newRoot: root };
  }

  // If this leaf is the root and empty, create a clean default document tab
  if (root.id === leafId) {
    const defaultTab: TabData = {
      id: 'tab_doc_' + Math.random().toString(36).substring(2, 9),
      type: 'document',
      title: defaultDocName,
    };
    leaf.tabs = [defaultTab];
    leaf.activeTabId = defaultTab.id;
    return { newRoot: root };
  }

  // Leaf is empty and has a parent split -> prune this leaf and promote sibling
  const parentInfo = findParentSplit(root, leafId);
  if (!parentInfo) {
    return { newRoot: root };
  }

  const sibling = parentInfo.isFirst ? parentInfo.parent.second : parentInfo.parent.first;

  // If parent is the root, sibling becomes new root
  if (root.id === parentInfo.parent.id) {
    return { newRoot: sibling, removedLeafId: leafId };
  }

  // Otherwise, replace parent split in grandparent with sibling
  const grandParentInfo = findParentSplit(root, parentInfo.parent.id);
  if (!grandParentInfo) {
    return { newRoot: sibling, removedLeafId: leafId };
  }

  if (grandParentInfo.isFirst) {
    grandParentInfo.parent.first = sibling;
  } else {
    grandParentInfo.parent.second = sibling;
  }

  return { newRoot: root, removedLeafId: leafId };
}

/**
 * Splits a leaf pane either horizontally (left/right) or vertically (top/bottom)
 * placing a new tab in the new pane.
 */
export function splitPane(
  root: PaneNode,
  targetLeafId: string,
  direction: 'horizontal' | 'vertical',
  position: 'before' | 'after',
  newTab?: TabData
): { newRoot: PaneNode; newLeafId: string } {
  const targetLeaf = findLeaf(root, targetLeafId);
  if (!targetLeaf) {
    return { newRoot: root, newLeafId: '' };
  }

  const newLeafId = 'pane_' + Math.random().toString(36).substring(2, 9);
  const targetFirstTab = targetLeaf.tabs[0];
  const complementaryType: PaneViewType = targetFirstTab?.type === 'document' ? 'results' : 'document';
  const complementaryTitle = complementaryType === 'results'
    ? (targetFirstTab?.title ? `${targetFirstTab.title.replace(/\.ax$/, '')} — Results` : 'Results')
    : (targetFirstTab?.documentId ? `${targetFirstTab.documentId}.ax` : 'thrown_ball.ax');

  const initialTabs = newTab ? [newTab] : (targetLeaf.tabs.length > 1
    ? [targetLeaf.tabs.pop()!]
    : [{ id: 'tab_' + Math.random().toString(36).substring(2, 9), type: complementaryType, title: complementaryTitle } as TabData]);

  if (targetLeaf.tabs.length > 0 && !targetLeaf.tabs.some(t => t.id === targetLeaf.activeTabId)) {
    targetLeaf.activeTabId = targetLeaf.tabs[0].id;
  }

  const newLeaf: PaneLeaf = {
    type: 'leaf',
    id: newLeafId,
    tabs: initialTabs,
    activeTabId: initialTabs[0]?.id || '',
  };

  const splitId = 'split_' + Math.random().toString(36).substring(2, 9);
  const firstChild = position === 'before' ? newLeaf : targetLeaf;
  const secondChild = position === 'before' ? targetLeaf : newLeaf;

  const newSplit: PaneSplit = {
    type: 'split',
    id: splitId,
    direction,
    ratio: 0.5,
    first: firstChild,
    second: secondChild,
  };

  if (root.id === targetLeafId) {
    return { newRoot: newSplit, newLeafId };
  }

  const parentInfo = findParentSplit(root, targetLeafId);
  if (!parentInfo) {
    return { newRoot: newSplit, newLeafId };
  }

  if (parentInfo.isFirst) {
    parentInfo.parent.first = newSplit;
  } else {
    parentInfo.parent.second = newSplit;
  }

  return { newRoot: root, newLeafId };
}

/**
 * Moves a tab from a source leaf to a target leaf at an optional index.
 */
export function moveTab(
  root: PaneNode,
  sourceLeafId: string,
  tabId: string,
  targetLeafId: string,
  targetIndex?: number
): { newRoot: PaneNode } {
  const sourceLeaf = findLeaf(root, sourceLeafId);
  const targetLeaf = findLeaf(root, targetLeafId);
  if (!sourceLeaf || !targetLeaf) return { newRoot: root };

  const tabIdx = sourceLeaf.tabs.findIndex(t => t.id === tabId);
  if (tabIdx === -1) return { newRoot: root };

  const [tab] = sourceLeaf.tabs.splice(tabIdx, 1);

  if (sourceLeaf.activeTabId === tabId) {
    const nextIdx = Math.min(tabIdx, sourceLeaf.tabs.length - 1);
    sourceLeaf.activeTabId = sourceLeaf.tabs[nextIdx]?.id || '';
  }

  // Insert into target leaf
  if (typeof targetIndex === 'number' && targetIndex >= 0 && targetIndex <= targetLeaf.tabs.length) {
    targetLeaf.tabs.splice(targetIndex, 0, tab);
  } else {
    targetLeaf.tabs.push(tab);
  }
  targetLeaf.activeTabId = tab.id;

  // If source leaf became empty, prune it and promote sibling
  if (sourceLeaf.tabs.length === 0 && sourceLeafId !== targetLeafId) {
    const collapsed = removeTabFromLeaf(root, sourceLeafId, '__noop__');
    return { newRoot: pruneEmptyPanes(collapsed.newRoot) };
  }

  return { newRoot: root };
}

/**
 * Drags a tab to an edge of a pane, splitting the target pane and docking the tab in the new split.
 */
export function splitAndMoveTab(
  root: PaneNode,
  sourceLeafId: string,
  tabId: string,
  targetLeafId: string,
  direction: 'horizontal' | 'vertical',
  position: 'before' | 'after'
): { newRoot: PaneNode } {
  const sourceLeaf = findLeaf(root, sourceLeafId);
  if (!sourceLeaf) return { newRoot: root };

  const tabIdx = sourceLeaf.tabs.findIndex(t => t.id === tabId);
  if (tabIdx === -1) return { newRoot: root };

  const [tab] = sourceLeaf.tabs.splice(tabIdx, 1);

  if (sourceLeaf.activeTabId === tabId) {
    const nextIdx = Math.min(tabIdx, sourceLeaf.tabs.length - 1);
    sourceLeaf.activeTabId = sourceLeaf.tabs[nextIdx]?.id || '';
  }

  // If sourceLeaf is also targetLeaf and now has 0 tabs, we must populate a complementary tab for sourceLeaf so that split doesn't leave an empty pane
  if (sourceLeafId === targetLeafId && sourceLeaf.tabs.length === 0) {
    const complementaryType: PaneViewType = tab.type === 'document' ? 'results' : 'document';
    const complementaryTitle = complementaryType === 'results'
      ? (tab.title ? `${tab.title.replace(/\.ax$/, '')} — Results` : 'Results')
      : (tab.documentId ? `${tab.documentId}.ax` : 'thrown_ball.ax');
    const compTab: TabData = {
      id: 'tab_' + Math.random().toString(36).substring(2, 9),
      type: complementaryType,
      title: complementaryTitle,
      documentId: tab.documentId,
    };
    sourceLeaf.tabs.push(compTab);
    sourceLeaf.activeTabId = compTab.id;
  }

  // Split target leaf with tab
  const splitRes = splitPane(root, targetLeafId, direction, position, tab);

  // If source leaf became empty, prune it and promote sibling
  if (sourceLeaf.tabs.length === 0 && sourceLeafId !== targetLeafId) {
    const collapsed = removeTabFromLeaf(splitRes.newRoot, sourceLeafId, '__noop__');
    return { newRoot: pruneEmptyPanes(collapsed.newRoot) };
  }

  return { newRoot: pruneEmptyPanes(splitRes.newRoot) };
}

/**
 * Serializes workspace layout to JSON string.
 */
export function serializeLayout(layout: WorkspaceLayout): string {
  return JSON.stringify(layout);
}

/**
 * Deserializes workspace layout from JSON string with schema validation.
 */
export function deserializeLayout(json: string): WorkspaceLayout | null {
  try {
    const parsed = JSON.parse(json);
    if (!parsed || parsed.version !== 1 || !parsed.root || typeof parsed.activePaneId !== 'string') {
      return null;
    }

    function validateNode(node: any): boolean {
      if (!node || typeof node !== 'object' || typeof node.id !== 'string') return false;
      if (node.type === 'leaf') {
        return Array.isArray(node.tabs) && node.tabs.length > 0 && typeof node.activeTabId === 'string';
      }
      if (node.type === 'split') {
        return (
          (node.direction === 'horizontal' || node.direction === 'vertical') &&
          typeof node.ratio === 'number' &&
          validateNode(node.first) &&
          validateNode(node.second)
        );
      }
      return false;
    }

    if (validateNode(parsed.root)) {
      const prunedRoot = pruneEmptyPanes(parsed.root);
      return {
        ...parsed,
        root: prunedRoot,
      } as WorkspaceLayout;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

/**
 * Synchronizes tab titles for a document and its results tabs across the tree.
 */
export function updateDocumentTabTitles(root: PaneNode, docId: string, newDocName: string): void {
  const tabs = getAllTabs(root);
  const baseName = newDocName.replace(/\.ax$/, '');
  tabs.forEach(tab => {
    if (tab.documentId === docId || !tab.documentId) {
      if (tab.type === 'document') {
        tab.title = newDocName;
        tab.documentId = docId;
      } else if (tab.type === 'results') {
        tab.title = `${baseName} — Results`;
        tab.documentId = docId;
      }
    }
  });
}
