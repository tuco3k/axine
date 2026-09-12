import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDefaultLayout,
  findLeaf,
  findTab,
  getAllLeaves,
  getAllTabs,
  addTabToLeaf,
  removeTabFromLeaf,
  splitPane,
  moveTab,
  splitAndMoveTab,
  serializeLayout,
  deserializeLayout,
  WorkspaceLayout,
  TabData,
} from '../notebook/pane_tree';
import { SpaceViewport } from '../plot/space_viewport';
import { SpaceValue } from '../core/types';

describe('Phase 2 Interface: Tiling Pane & Equal Tab System', () => {
  it('initializes default layout with a single code editor pane', () => {
    const layout = createDefaultLayout();
    expect(layout.version).toBe(1);
    expect(layout.root.type).toBe('leaf');

    const leaves = getAllLeaves(layout.root);
    expect(leaves.length).toBe(1);
    expect(leaves[0].tabs.length).toBe(1);
    expect(leaves[0].tabs[0].type).toBe('document');
    expect(leaves[0].activeTabId).toBe(leaves[0].tabs[0].id);
  });

  it('splits a pane horizontally and vertically into multiple tiled panes', () => {
    const layout = createDefaultLayout();
    const rootLeafId = layout.root.id;

    // Split 1: Horizontal split -> 2 panes
    const spaceTab1: TabData = {
      id: 'tab_space_1',
      type: 'space',
      title: 'Space 1',
      spaceLineIdx: 0,
    };
    const { newRoot: root2, newLeafId: leaf2 } = splitPane(layout.root, rootLeafId, 'horizontal', 'after', spaceTab1);
    expect(root2.type).toBe('split');
    expect(getAllLeaves(root2).length).toBe(2);

    // Split 2: Vertical split on leaf2 -> 3 panes
    const spaceTab2: TabData = {
      id: 'tab_space_2',
      type: 'space',
      title: 'Space 2',
      spaceLineIdx: 1,
    };
    const { newRoot: root3, newLeafId: leaf3 } = splitPane(root2, leaf2, 'vertical', 'after', spaceTab2);
    expect(getAllLeaves(root3).length).toBe(3);

    // Split 3: Horizontal split on leaf3 -> 4 panes
    const spaceTab3: TabData = {
      id: 'tab_space_3',
      type: 'space',
      title: 'Space 3',
      spaceLineIdx: 2,
    };
    const { newRoot: root4 } = splitPane(root3, leaf3, 'horizontal', 'after', spaceTab3);
    expect(getAllLeaves(root4).length).toBe(4);

    // Split 4: Vertical split on rootLeafId -> 5 panes visible simultaneously
    const spaceTab4: TabData = {
      id: 'tab_space_4',
      type: 'space',
      title: 'Space 4',
      spaceLineIdx: 3,
    };
    const { newRoot: root5 } = splitPane(root4, rootLeafId, 'vertical', 'before', spaceTab4);
    
    const leaves5 = getAllLeaves(root5);
    expect(leaves5.length).toBe(5);

    const tabs5 = getAllTabs(root5);
    expect(tabs5.length).toBe(5);
    expect(tabs5.filter(t => t.type === 'space').length).toBe(4);
    expect(tabs5.filter(t => t.type === 'document').length).toBe(1);
  });

  it('moves tabs between panes and re-indexes them cleanly', () => {
    const layout = createDefaultLayout();
    const leaf1 = layout.root.id;

    const spaceTab: TabData = { id: 'tab_s1', type: 'space', title: 'Space 1' };
    const { newRoot, newLeafId: leaf2 } = splitPane(layout.root, leaf1, 'horizontal', 'after', spaceTab);

    const scopeTab: TabData = { id: 'tab_scope', type: 'scope', title: 'Scope' };
    addTabToLeaf(newRoot, leaf1, scopeTab);

    expect(findLeaf(newRoot, leaf1)?.tabs.length).toBe(2);
    expect(findLeaf(newRoot, leaf2)?.tabs.length).toBe(1);

    // Move scopeTab from leaf1 to leaf2
    const { newRoot: rootMoved } = moveTab(newRoot, leaf1, 'tab_scope', leaf2, 0);
    const leaf1After = findLeaf(rootMoved, leaf1);
    const leaf2After = findLeaf(rootMoved, leaf2);

    expect(leaf1After?.tabs.length).toBe(1);
    expect(leaf2After?.tabs.length).toBe(2);
    expect(leaf2After?.tabs[0].id).toBe('tab_scope');
  });

  it('auto-collapses a pane when its last tab is removed or dragged out', () => {
    const layout = createDefaultLayout();
    const leaf1 = layout.root.id;

    const spaceTab: TabData = { id: 'tab_s1', type: 'space', title: 'Space 1' };
    const { newRoot, newLeafId: leaf2 } = splitPane(layout.root, leaf1, 'horizontal', 'after', spaceTab);

    expect(getAllLeaves(newRoot).length).toBe(2);

    // Close the only tab in leaf2
    const { newRoot: collapsedRoot, removedLeafId } = removeTabFromLeaf(newRoot, leaf2, 'tab_s1');
    expect(removedLeafId).toBe(leaf2);
    expect(collapsedRoot.type).toBe('leaf');
    expect(getAllLeaves(collapsedRoot).length).toBe(1);
    expect(collapsedRoot.id).toBe(leaf1);
  });

  it('splits and moves a tab via edge drag (splitAndMoveTab)', () => {
    const layout = createDefaultLayout();
    const leaf1 = layout.root.id;

    const spaceTab: TabData = { id: 'tab_s1', type: 'space', title: 'Space 1' };
    addTabToLeaf(layout.root, leaf1, spaceTab);

    expect(findLeaf(layout.root, leaf1)?.tabs.length).toBe(2);

    // Drag spaceTab to right edge of leaf1
    const { newRoot } = splitAndMoveTab(layout.root, leaf1, 'tab_s1', leaf1, 'horizontal', 'after');
    const leaves = getAllLeaves(newRoot);
    expect(leaves.length).toBe(2);
    expect(leaves[0].tabs.length).toBe(1);
    expect(leaves[1].tabs.length).toBe(1);
    expect(leaves[1].tabs[0].id).toBe('tab_s1');
  });

  it('serializes and deserializes 5-pane layout with isolated camera states intact', () => {
    const layout = createDefaultLayout();
    const leaf1 = layout.root.id;

    const cameraStateTop: any = {
      viewMode: '2d',
      displayAxes: ['x', 'y'],
      fixedCoords: {},
      bounds2D: { minX: -10, maxX: 10, minY: -10, maxY: 10 },
      bounds3D: { minX: -3, maxX: 3, minY: -3, maxY: 3, minZ: -3, maxZ: 3 },
      angleX: 0.1,
      angleZ: 0.0,
      zoom3D: 1.0,
      pan3DX: 0,
      pan3DY: 0,
    };

    const cameraStatePerspective: any = {
      viewMode: '3d',
      displayAxes: ['x', 'y'],
      fixedCoords: {},
      bounds2D: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
      bounds3D: { minX: -3, maxX: 3, minY: -3, maxY: 3, minZ: -3, maxZ: 3 },
      angleX: 0.65,
      angleZ: 1.25,
      zoom3D: 1.85,
      pan3DX: 45,
      pan3DY: -20,
    };

    const tabTop: TabData = {
      id: 'tab_top_view',
      type: 'space',
      title: 'Top View',
      spaceLineIdx: 0,
      cameraState: cameraStateTop,
    };

    const tabPersp: TabData = {
      id: 'tab_persp_view',
      type: 'space',
      title: 'Perspective View',
      spaceLineIdx: 0,
      cameraState: cameraStatePerspective,
    };

    const { newRoot: r2, newLeafId: l2 } = splitPane(layout.root, leaf1, 'horizontal', 'after', tabTop);
    const { newRoot: r3, newLeafId: l3 } = splitPane(r2, l2, 'vertical', 'after', tabPersp);

    const fullLayout: WorkspaceLayout = {
      version: 1,
      root: r3,
      activePaneId: l3,
    };

    const serialized = serializeLayout(fullLayout);
    expect(typeof serialized).toBe('string');
    expect(serialized.length).toBeGreaterThan(100);

    const restored = deserializeLayout(serialized);
    expect(restored).not.toBeNull();
    expect(restored?.version).toBe(1);
    expect(restored?.activePaneId).toBe(l3);

    const restoredLeaves = getAllLeaves(restored!.root);
    expect(restoredLeaves.length).toBe(3);

    const topTabRestored = findTab(restored!.root, 'tab_top_view');
    expect(topTabRestored?.tab.cameraState?.bounds2D.minX).toBe(-10);
    expect(topTabRestored?.tab.cameraState?.bounds2D.maxX).toBe(10);

    const perspTabRestored = findTab(restored!.root, 'tab_persp_view');
    expect(perspTabRestored?.tab.cameraState?.angleX).toBe(0.65);
    expect(perspTabRestored?.tab.cameraState?.angleZ).toBe(1.25);
    expect(perspTabRestored?.tab.cameraState?.zoom3D).toBe(1.85);
    expect(perspTabRestored?.tab.cameraState?.pan3DX).toBe(45);
  });

  it('supports unprivileged flat tab model with Document, Results, and Space tabs at the same level', () => {
    const layout = createDefaultLayout();
    const pane1 = layout.root.id;

    // Split into 3 panes: Pane 1 = Document, Pane 2 = Results, Pane 3 = Space
    const resultsTab: TabData = {
      id: 'tab_results_main',
      type: 'results',
      title: 'Results: main',
    };
    const { newRoot: r2, newLeafId: pane2 } = splitPane(layout.root, pane1, 'horizontal', 'after', resultsTab);

    const spaceTab: TabData = {
      id: 'tab_space_circle',
      type: 'space',
      title: 'Space: Circle',
      spaceLineIdx: 2,
    };
    const { newRoot: r3 } = splitPane(r2, pane2, 'vertical', 'after', spaceTab);

    const leaves = getAllLeaves(r3);
    expect(leaves.length).toBe(3);

    const tabTypes = leaves.map(l => l.tabs[0].type);
    expect(tabTypes).toContain('document');
    expect(tabTypes).toContain('results');
    expect(tabTypes).toContain('space');

    // No pane has nested panels: each pane holds equal flat tabs
    const allTabs = getAllTabs(r3);
    expect(allTabs.length).toBe(3);
    expect(allTabs.find(t => t.id === 'tab_results_main')?.title).toBe('Results: main');
    expect(allTabs.find(t => t.id === 'tab_space_circle')?.title).toBe('Space: Circle');
  });

  it('generates complementary results tab when splitting a document pane without duplicate untitled.ax', () => {
    const layout = createDefaultLayout();
    const pane1 = layout.root.id;
    findLeaf(layout.root, pane1)!.tabs[0].title = 'particle_sim.ax';

    // Split without passing newTab: should create a complementary 'results' tab named 'Results: particle_sim'
    const { newRoot } = splitPane(layout.root, pane1, 'horizontal', 'after');
    const leaves = getAllLeaves(newRoot);
    expect(leaves.length).toBe(2);

    expect(leaves[0].tabs[0].type).toBe('document');
    expect(leaves[0].tabs[0].title).toBe('particle_sim.ax');

    expect(leaves[1].tabs[0].type).toBe('results');
    expect(leaves[1].tabs[0].title).toBe('particle_sim — Results');
  });
});

describe('Phase 2 Navigation: Instant Flight & Multi-Camera Space Viewport', () => {
  let mockContainer: any;
  const mockSpace: SpaceValue = {
    type: 'space',
    dimension: 3,
    coordinates: ['x', 'y', 'z'],
    entities: [
      {
        coordinates: ['x', 'y', 'z'],
        dimension: 3,
        ast: { type: 'Literal', value: 0 } as any,
        source: 'x^2 + y^2 + z^2 = 9',
        compiledFn: (x, y, z) => x * x + y * y + z * z - 9,
      }
    ],
  };

  beforeEach(() => {
    mockContainer = {
      innerHTML: '',
      className: '',
      tabIndex: 0,
      classList: {
        add: () => {},
        remove: () => {},
        toggle: () => {},
        contains: () => false,
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      querySelector: () => null,
      querySelectorAll: () => [],
      appendChild: () => {},
      blur: () => {},
    };
  });

  it('exposes independent camera state getters and setters per viewport instance', () => {
    const vp1 = new SpaceViewport(mockContainer, mockSpace);
    const vp2 = new SpaceViewport(mockContainer, mockSpace);

    // Initial camera states
    const cam1 = vp1.getCameraState();
    const cam2 = vp2.getCameraState();

    expect(cam1.viewMode).toBe('3d');
    expect(cam2.viewMode).toBe('3d');

    // Modify camera 1 to top-down 2D slice
    vp1.setCameraState({
      viewMode: '2d',
      displayAxes: ['x', 'y'],
      bounds2D: { minX: -8, maxX: 8, minY: -8, maxY: 8 },
    });

    // Modify camera 2 to 3D perspective orbit
    vp2.setCameraState({
      viewMode: '3d',
      angleX: 0.8,
      angleZ: 1.5,
      zoom3D: 2.2,
      pan3DX: 30,
    });

    // Verify cameras are completely isolated
    expect(vp1.getCameraState().viewMode).toBe('2d');
    expect(vp1.getCameraState().bounds2D.minX).toBe(-8);

    expect(vp2.getCameraState().viewMode).toBe('3d');
    expect(vp2.getCameraState().angleX).toBe(0.8);
    expect(vp2.getCameraState().angleZ).toBe(1.5);
    expect(vp2.getCameraState().zoom3D).toBe(2.2);
    expect(vp2.getCameraState().pan3DX).toBe(30);

    vp1.dispose();
    vp2.dispose();
  });

  it('updates underlying space model in real time across viewports while preserving independent cameras', () => {
    const vpTop = new SpaceViewport(mockContainer, mockSpace, {
      initialCameraState: {
        viewMode: '2d',
        displayAxes: ['x', 'y'],
        fixedCoords: { z: 0 },
        bounds2D: { minX: -6, maxX: 6, minY: -6, maxY: 6 },
        bounds3D: { minX: -3, maxX: 3, minY: -3, maxY: 3, minZ: -3, maxZ: 3 },
        angleX: 0,
        angleZ: 0,
        zoom3D: 1,
        pan3DX: 0,
        pan3DY: 0,
      }
    });

    const vpPersp = new SpaceViewport(mockContainer, mockSpace, {
      initialCameraState: {
        viewMode: '3d',
        displayAxes: ['x', 'y'],
        fixedCoords: {},
        bounds2D: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
        bounds3D: { minX: -3, maxX: 3, minY: -3, maxY: 3, minZ: -3, maxZ: 3 },
        angleX: 0.75,
        angleZ: 1.2,
        zoom3D: 2.0,
        pan3DX: 50,
        pan3DY: -10,
      }
    });

    // Updated space representing edited document: radius expanded from 3 to 5 (x^2 + y^2 + z^2 = 25)
    const updatedSpace: SpaceValue = {
      type: 'space',
      dimension: 3,
      coordinates: ['x', 'y', 'z'],
      entities: [
        {
          coordinates: ['x', 'y', 'z'],
          dimension: 3,
          ast: { type: 'Literal', value: 0 } as any,
          source: 'x^2 + y^2 + z^2 = 25',
          compiledFn: (x, y, z) => x * x + y * y + z * z - 25,
        }
      ],
    };

    vpTop.updateSpace(updatedSpace);
    vpPersp.updateSpace(updatedSpace);

    // Verify cameras remained unaltered
    expect(vpTop.getCameraState().viewMode).toBe('2d');
    expect(vpTop.getCameraState().bounds2D.minX).toBe(-6);

    expect(vpPersp.getCameraState().viewMode).toBe('3d');
    expect(vpPersp.getCameraState().angleX).toBe(0.75);
    expect(vpPersp.getCameraState().angleZ).toBe(1.2);
    expect(vpPersp.getCameraState().zoom3D).toBe(2.0);
    expect(vpPersp.getCameraState().pan3DX).toBe(50);

    vpTop.dispose();
    vpPersp.dispose();
  });

  it('guarantees empty panes cannot exist and redistributes space to neighbors', () => {
    const layout = createDefaultLayout();
    const leaf1 = layout.root.id;

    // Create 3-way split: leaf1, leaf2, leaf3
    const { newRoot: root2, newLeafId: leaf2 } = splitPane(layout.root, leaf1, 'horizontal', 'after', { id: 't2', type: 'results', title: 'Results' });
    const { newRoot: root3, newLeafId: leaf3 } = splitPane(root2, leaf2, 'vertical', 'after', { id: 't3', type: 'scope', title: 'Scope' });

    expect(getAllLeaves(root3).length).toBe(3);

    // Close t3 in leaf3 -> leaf3 is pruned, leaf2 absorbs its space
    const { newRoot: rootAfterLeaf3 } = removeTabFromLeaf(root3, leaf3, 't3');
    expect(getAllLeaves(rootAfterLeaf3).length).toBe(2);
    expect(findLeaf(rootAfterLeaf3, leaf3)).toBeNull();

    // Close t2 in leaf2 -> leaf2 is pruned, leaf1 becomes sole root
    const { newRoot: rootAfterLeaf2 } = removeTabFromLeaf(rootAfterLeaf3, leaf2, 't2');
    expect(getAllLeaves(rootAfterLeaf2).length).toBe(1);
    expect(rootAfterLeaf2.type).toBe('leaf');
    expect(findLeaf(rootAfterLeaf2, leaf2)).toBeNull();

    // Close the document tab in leaf1 -> resets to clean default document tab, never empty
    const { newRoot: finalRoot } = removeTabFromLeaf(rootAfterLeaf2, leaf1, 'tab_doc_main');
    expect(getAllLeaves(finalRoot).length).toBe(1);
    expect(finalRoot.type).toBe('leaf');
    expect((finalRoot as any).tabs.length).toBe(1);
    expect((finalRoot as any).tabs[0].type).toBe('document');
  });
});
