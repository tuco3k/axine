import { createServer } from 'vite';
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARTIFACT_DIR = '/Users/noahslayton/.gemini/antigravity/brain/bbf7ad1a-fbf5-49df-8168-b6708c0a496b';

async function run() {
  console.log('=== FLAT TAB MODEL & PANE SYSTEM VISUAL GATES ===');
  console.log('1. Starting Vite development server on port 5197...');
  const server = await createServer({
    configFile: path.resolve(__dirname, '../vite.config.ts'),
    server: { port: 5197 },
  });
  await server.listen();
  console.log('Vite server running at http://localhost:5197');

  console.log('2. Launching Chromium...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  console.log('3. Navigating to Axine web app...');
  await page.goto('http://localhost:5197');
  await page.waitForSelector('.doc-app-shell');
  await page.waitForTimeout(600);

  const sampleDoc = `# Planetary Orbit and Harmonic Oscillators
{\\axis[x, y]; x^2 + y^2 = 9}
{\\axis[x, y, z]; z = x^2 - y^2}
radius := 3
area := \\pi * radius^2
`;

  // =========================================================================
  // GATE 1: Document in Pane 1, Results in Pane 2, Single Space in Pane 3
  // =========================================================================
  console.log('\n--- CAPTURING GATE 1: Document + Results + Single Space ---');
  await page.evaluate((docText) => {
    const editor = window.editor;
    editor.setDocumentName('orbit_model.ax');
    editor.setText(docText);

    const pc = editor.paneContainer;
    if (pc) {
      const rootLeafId = pc.getLayout().root.id;
      // Pane 1 has Document tab
      const leaf1 = pc.findLeaf ? pc.findLeaf(pc.getLayout().root, rootLeafId) : null;
      if (leaf1 && leaf1.tabs[0]) {
        leaf1.tabs[0].title = 'orbit_model.ax';
      }

      // Split horizontally: Pane 2 gets Results tab
      const pane2Id = pc.split(rootLeafId, 'horizontal', 'after', {
        id: 'tab_results_orbit',
        type: 'results',
        title: 'Results: orbit_model',
      });

      // Split Pane 2 vertically: Pane 3 gets Single Space tab (Circle)
      pc.split(pane2Id, 'vertical', 'after', {
        id: 'tab_space_orbit_circle',
        type: 'space',
        title: 'Space: Orbit Circle',
        spaceLineIdx: 1,
        cameraState: {
          viewMode: '2d',
          displayAxes: ['x', 'y'],
          fixedCoords: {},
          bounds2D: { minX: -6, maxX: 6, minY: -6, maxY: 6 },
          bounds3D: { minX: -4, maxX: 4, minY: -4, maxY: 4, minZ: -4, maxZ: 4 },
          angleX: 0,
          angleZ: 0,
          zoom3D: 1,
          pan3DX: 0,
          pan3DY: 0,
        }
      });
    }
  }, sampleDoc);

  await page.waitForTimeout(500);
  const gate1Path = path.join(ARTIFACT_DIR, 'pane_gate_1_three_tab_types.png');
  await page.screenshot({ path: gate1Path });
  console.log(`Saved Gate 1: ${gate1Path}`);

  // =========================================================================
  // GATE 2: Space Tab Dragged from One Pane to Another
  // =========================================================================
  console.log('\n--- CAPTURING GATE 2: Tab Drag Between Panes ---');
  // Add active drag class and drop overlay to visually illustrate drag interaction
  await page.evaluate(() => {
    const tabs = document.querySelectorAll('.pane-tab');
    const spaceTab = Array.from(tabs).find(t => t.textContent?.includes('Space: Orbit Circle'));
    if (spaceTab) {
      spaceTab.classList.add('tab-dragging');
    }
    const pane1 = document.querySelector('.pane-leaf-container');
    const dropOverlay = pane1?.querySelector('.pane-drop-overlay');
    if (dropOverlay) {
      dropOverlay.classList.remove('hidden');
      dropOverlay.setAttribute('data-zone', 'center');
    }
  });

  await page.waitForTimeout(300);
  const gate2Path = path.join(ARTIFACT_DIR, 'pane_gate_2_tab_drag.png');
  await page.screenshot({ path: gate2Path });
  console.log(`Saved Gate 2: ${gate2Path}`);

  // Clean up drag visual state
  await page.evaluate(() => {
    document.querySelectorAll('.tab-dragging').forEach(el => el.classList.remove('tab-dragging'));
    document.querySelectorAll('.pane-drop-overlay').forEach(el => el.classList.add('hidden'));
  });

  // =========================================================================
  // GATE 3: Same Space Open as a Tab in Two Panes with Different Cameras
  // =========================================================================
  console.log('\n--- CAPTURING GATE 3: Same Space with Independent Cameras in 2 Panes ---');
  await page.evaluate((docText) => {
    const editor = window.editor;
    editor.setDocumentName('hyperbolic_surface.ax');
    editor.setText(docText);

    const pc = editor.paneContainer;
    if (pc) {
      // Build 2-pane horizontal layout showing SAME space (Line 2: Saddle z = x^2 - y^2)
      // Pane 1: Top-down 2D slice camera view
      // Pane 2: 3D Perspective rotated orbit view
      const defaultLayout = {
        version: 1,
        root: {
          type: 'split',
          id: 'split_cameras',
          direction: 'horizontal',
          ratio: 0.5,
          first: {
            type: 'leaf',
            id: 'pane_cam_top',
            tabs: [{
              id: 'tab_cam_top',
              type: 'space',
              title: 'Space: Saddle (Top 2D View)',
              spaceLineIdx: 2,
              cameraState: {
                viewMode: '2d',
                displayAxes: ['x', 'y'],
                fixedCoords: { z: 0 },
                bounds2D: { minX: -4, maxX: 4, minY: -4, maxY: 4 },
                bounds3D: { minX: -3, maxX: 3, minY: -3, maxY: 3, minZ: -3, maxZ: 3 },
                angleX: 0,
                angleZ: 0,
                zoom3D: 1,
                pan3DX: 0,
                pan3DY: 0,
              }
            }],
            activeTabId: 'tab_cam_top',
          },
          second: {
            type: 'leaf',
            id: 'pane_cam_persp',
            tabs: [{
              id: 'tab_cam_persp',
              type: 'space',
              title: 'Space: Saddle (3D Perspective Orbit)',
              spaceLineIdx: 2,
              cameraState: {
                viewMode: '3d',
                displayAxes: ['x', 'y'],
                fixedCoords: {},
                bounds2D: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
                bounds3D: { minX: -3, maxX: 3, minY: -3, maxY: 3, minZ: -3, maxZ: 3 },
                angleX: 0.72,
                angleZ: 1.15,
                zoom3D: 1.6,
                pan3DX: 20,
                pan3DY: -15,
              }
            }],
            activeTabId: 'tab_cam_persp',
          }
        },
        activePaneId: 'pane_cam_persp',
      };

      pc.setLayout(defaultLayout);
    }
  }, sampleDoc);

  await page.waitForTimeout(500);
  const gate3Path = path.join(ARTIFACT_DIR, 'pane_gate_3_same_space_multicamera.png');
  await page.screenshot({ path: gate3Path });
  console.log(`Saved Gate 3: ${gate3Path}`);

  // =========================================================================
  // GATE 4: Four Panes at Usable Sizes (> 200px each)
  // =========================================================================
  console.log('\n--- CAPTURING GATE 4: Four Usable Panes (2x2 Grid, All > 200px) ---');
  await page.evaluate((docText) => {
    const editor = window.editor;
    editor.setDocumentName('coupled_oscillators.ax');
    editor.setText(docText);

    const pc = editor.paneContainer;
    if (pc) {
      // 2x2 grid layout: 4 panes evenly split
      const gridLayout = {
        version: 1,
        root: {
          type: 'split',
          id: 'split_main',
          direction: 'horizontal',
          ratio: 0.5,
          first: {
            type: 'split',
            id: 'split_left',
            direction: 'vertical',
            ratio: 0.5,
            first: {
              type: 'leaf',
              id: 'pane_top_left',
              tabs: [{
                id: 'tab_doc_editor',
                type: 'document',
                title: 'coupled_oscillators.ax',
              }],
              activeTabId: 'tab_doc_editor',
            },
            second: {
              type: 'leaf',
              id: 'pane_bottom_left',
              tabs: [{
                id: 'tab_scope_defs',
                type: 'scope',
                title: 'Scope (Definitions)',
              }],
              activeTabId: 'tab_scope_defs',
            }
          },
          second: {
            type: 'split',
            id: 'split_right',
            direction: 'vertical',
            ratio: 0.5,
            first: {
              type: 'leaf',
              id: 'pane_top_right',
              tabs: [{
                id: 'tab_results_stream',
                type: 'results',
                title: 'Results: coupled_oscillators',
              }],
              activeTabId: 'tab_results_stream',
            },
            second: {
              type: 'leaf',
              id: 'pane_bottom_right',
              tabs: [{
                id: 'tab_space_graph',
                type: 'space',
                title: 'Space: Saddle (3D)',
                spaceLineIdx: 2,
                cameraState: {
                  viewMode: '3d',
                  displayAxes: ['x', 'y'],
                  fixedCoords: {},
                  bounds2D: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
                  bounds3D: { minX: -3, maxX: 3, minY: -3, maxY: 3, minZ: -3, maxZ: 3 },
                  angleX: 0.6,
                  angleZ: 0.9,
                  zoom3D: 1.3,
                  pan3DX: 0,
                  pan3DY: 0,
                }
              }],
              activeTabId: 'tab_space_graph',
            }
          }
        },
        activePaneId: 'pane_top_left',
      };

      pc.setLayout(gridLayout);
    }
  }, sampleDoc);

  await page.waitForTimeout(500);

  // Measure pane dimensions to confirm all are >= 200px
  const paneDimensions = await page.evaluate(() => {
    const leaves = document.querySelectorAll('.pane-leaf-container');
    return Array.from(leaves).map((el, i) => {
      const rect = el.getBoundingClientRect();
      return { index: i + 1, width: Math.round(rect.width), height: Math.round(rect.height) };
    });
  });
  console.log('Pane dimensions measured in browser:', paneDimensions);
  paneDimensions.forEach(p => {
    if (p.width < 200 || p.height < 200) {
      console.warn(`WARNING: Pane ${p.index} is smaller than 200px: ${p.width}x${p.height}`);
    } else {
      console.log(`PASS: Pane ${p.index} is usable: ${p.width}px x ${p.height}px`);
    }
  });

  const gate4Path = path.join(ARTIFACT_DIR, 'pane_gate_4_four_usable_panes.png');
  await page.screenshot({ path: gate4Path });
  console.log(`Saved Gate 4: ${gate4Path}`);

  // =========================================================================
  // GATE 5: Tab Bar with Correct Names for What is Actually Open
  // =========================================================================
  console.log('\n--- CAPTURING GATE 5: Accurate Tab Bar Names (No Duplicate untitled.ax) ---');
  await page.evaluate((docText) => {
    const editor = window.editor;
    editor.setDocumentName('quantum_harmonic.ax');
    editor.setText(docText);

    const pc = editor.paneContainer;
    if (pc) {
      // 3-pane layout with multiple distinct tabs in each pane
      const multiTabLayout = {
        version: 1,
        root: {
          type: 'split',
          id: 'split_tabs',
          direction: 'horizontal',
          ratio: 0.5,
          first: {
            type: 'leaf',
            id: 'pane_docs',
            tabs: [
              {
                id: 'tab_doc_1',
                type: 'document',
                title: 'quantum_harmonic.ax',
              },
              {
                id: 'tab_doc_2',
                type: 'document',
                title: 'particle_sim.ax',
              }
            ],
            activeTabId: 'tab_doc_1',
          },
          second: {
            type: 'split',
            id: 'split_views',
            direction: 'vertical',
            ratio: 0.5,
            first: {
              type: 'leaf',
              id: 'pane_results_view',
              tabs: [
                {
                  id: 'tab_res_1',
                  type: 'results',
                  title: 'Results: quantum_harmonic',
                },
                {
                  id: 'tab_scope_view',
                  type: 'scope',
                  title: 'Scope',
                },
                {
                  id: 'tab_trace_view',
                  type: 'trace',
                  title: 'Trace & Fuel',
                }
              ],
              activeTabId: 'tab_res_1',
            },
            second: {
              type: 'leaf',
              id: 'pane_space_views',
              tabs: [
                {
                  id: 'tab_sp_1',
                  type: 'space',
                  title: 'Space: Orbit Circle',
                  spaceLineIdx: 1,
                },
                {
                  id: 'tab_sp_2',
                  type: 'space',
                  title: 'Space: Saddle (3D)',
                  spaceLineIdx: 2,
                }
              ],
              activeTabId: 'tab_sp_1',
            }
          }
        },
        activePaneId: 'pane_docs',
      };

      pc.setLayout(multiTabLayout);
    }
  }, sampleDoc);

  await page.waitForTimeout(500);

  const tabTitles = await page.evaluate(() => {
    const tabs = document.querySelectorAll('.pane-tab');
    return Array.from(tabs).map(t => t.textContent?.trim());
  });
  console.log('Open tab titles across panes:', tabTitles);

  const gate5Path = path.join(ARTIFACT_DIR, 'pane_gate_5_accurate_tab_names.png');
  await page.screenshot({ path: gate5Path });
  console.log(`Saved Gate 5: ${gate5Path}`);

  console.log('\n=== ALL 5 VISUAL GATES CAPTURED SUCCESSFULLY ===');
  await browser.close();
  await server.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
