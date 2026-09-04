import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DocumentEditor } from '../document/editor';
import { CORPUS_DOCUMENTS } from '../document/corpus_data';

// Robust recursive/stack-based DOM Mock for Node Vitest runner
class MockClassList {
  public classes: Set<string> = new Set();
  add(...cls: string[]) { cls.forEach(c => c && this.classes.add(c)); }
  remove(...cls: string[]) { cls.forEach(c => this.classes.delete(c)); }
  toggle(c: string, force?: boolean) {
    if (force !== undefined) {
      if (force) this.classes.add(c);
      else this.classes.delete(c);
      return force;
    }
    if (this.classes.has(c)) {
      this.classes.delete(c);
      return false;
    }
    this.classes.add(c);
    return true;
  }
  contains(c: string) { return this.classes.has(c); }
}

class MockElement {
  public tagName: string;
  public id: string = '';
  public className: string = '';
  public classList: MockClassList = new MockClassList();
  public style: Record<string, string> = {};
  public attributes: Map<string, string> = new Map();
  public children: MockElement[] = [];
  public parentElement: MockElement | null = null;
  public listeners: Map<string, Function[]> = new Map();
  public value: string = '';
  public selectionStart: number = 0;
  public selectionEnd: number = 0;
  public scrollTop: number = 0;
  public scrollLeft: number = 0;
  public textValue: string = '';
  private _innerHTML: string = '';

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get textContent(): string {
    if (this.children.length === 0) return this.textValue || this._innerHTML.replace(/<[^>]*>/g, '');
    return (this.textValue + ' ' + this.children.map(c => c.textContent).join(' ')).trim();
  }

  set textContent(val: string) {
    this.textValue = val;
    this._innerHTML = val;
    this.children = [];
  }

  get innerHTML(): string {
    return this._innerHTML;
  }

  set innerHTML(html: string) {
    this._innerHTML = html;
    this.children = [];
    this.textValue = '';
    this.parseHTMLString(html);
  }

  private parseHTMLString(html: string) {
    const tokenRegex = /<!--[\s\S]*?-->|<(?:\/([a-zA-Z0-9\-]+)|([a-zA-Z0-9\-]+)([^>]*?)(\/)?)>|([^<]+)/g;
    let match;
    const stack: MockElement[] = [this];

    while ((match = tokenRegex.exec(html)) !== null) {
      const isClose = match[1];
      const isOpen = match[2];
      const attrStr = match[3] || '';
      const isSelfClosing = match[4] || ['INPUT', 'IMG', 'BR', 'HR'].includes((isOpen || '').toUpperCase());
      const textChunk = match[5];

      if (isClose) {
        if (stack.length > 1) {
          stack.pop();
        }
      } else if (isOpen) {
        const child = new MockElement(isOpen);
        child.parentElement = stack[stack.length - 1];

        // Parse attributes
        const attrRegex = /([a-zA-Z0-9\-]+)(?:=["']([^"']*)["'])?/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
          const name = attrMatch[1];
          const val = attrMatch[2] !== undefined ? attrMatch[2] : '';
          child.setAttribute(name, val);
        }

        stack[stack.length - 1].children.push(child);
        if (!isSelfClosing) {
          stack.push(child);
        }
      } else if (textChunk) {
        const trimmed = textChunk.trim();
        if (trimmed) {
          stack[stack.length - 1].textValue += (stack[stack.length - 1].textValue ? ' ' : '') + trimmed;
        }
      }
    }
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
    if (name === 'class') {
      this.className = value;
      this.classList = new MockClassList();
      value.split(/\s+/).forEach(c => { if (c) this.classList.add(c); });
    } else if (name === 'id') {
      this.id = value;
    }
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }

  appendChild(child: MockElement) {
    child.parentElement = this;
    this.children.push(child);
  }

  removeChild(child: MockElement) {
    this.children = this.children.filter(c => c !== child);
    if (child.parentElement === this) {
      child.parentElement = null;
    }
    return child;
  }

  remove() {
    if (this.parentElement) {
      this.parentElement.removeChild(this);
    }
  }

  addEventListener(event: string, handler: Function) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(handler);
  }

  removeEventListener(event: string, handler: Function) {
    if (!this.listeners.has(event)) return;
    const list = this.listeners.get(event)!.filter(h => h !== handler);
    this.listeners.set(event, list);
  }

  dispatchEvent(event: { type: string; stopPropagation?: Function }) {
    const handlers = this.listeners.get(event.type) || [];
    for (const h of handlers) h(event);
  }

  click() {
    this.dispatchEvent({ type: 'click', stopPropagation: () => {} });
  }

  focus() {}
  blur() {}
  setSelectionRange(start: number, end: number) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }

  getBoundingClientRect() {
    return { top: 0, bottom: 600, left: 0, right: 1000, width: 1000, height: 600, x: 0, y: 0 };
  }

  querySelector(selector: string): MockElement | null {
    const results = this.querySelectorAll(selector);
    return results[0] || null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const testMatch = (el: MockElement, subSel: string): boolean => {
      let remaining = subSel;

      // 1. Check ID
      const idMatch = remaining.match(/#([a-zA-Z0-9\-_]+)/);
      if (idMatch) {
        if (el.id !== idMatch[1]) return false;
        remaining = remaining.replace(idMatch[0], '');
      }

      // 2. Check Data Attributes [attr="val"] or [attr]
      const attrMatches = remaining.matchAll(/\[([a-zA-Z0-9\-_]+)(?:=["']([^"']*)["'])?\]/g);
      for (const am of attrMatches) {
        const attr = am[1];
        if (!el.attributes.has(attr)) return false;
        if (am[2] !== undefined && el.attributes.get(attr) !== am[2]) return false;
        remaining = remaining.replace(am[0], '');
      }

      // 3. Check Classes (.cls)
      const classMatches = remaining.matchAll(/\.([a-zA-Z0-9\-_]+)/g);
      for (const cm of classMatches) {
        if (!el.classList.contains(cm[1])) return false;
        remaining = remaining.replace(cm[0], '');
      }

      // 4. Check Tag Name
      remaining = remaining.trim();
      if (remaining && remaining !== '*') {
        if (el.tagName.toLowerCase() !== remaining.toLowerCase()) return false;
      }

      return true;
    };

    const findMatchesForSegment = (roots: MockElement[], segment: string): MockElement[] => {
      const found: MockElement[] = [];
      const traverse = (node: MockElement) => {
        for (const child of node.children) {
          if (testMatch(child, segment)) {
            found.push(child);
          }
          traverse(child);
        }
      };
      for (const root of roots) {
        traverse(root);
      }
      return found;
    };

    const parts = selector.trim().split(/\s+/);
    let current = [this as MockElement];
    for (const part of parts) {
      current = findMatchesForSegment(current, part);
    }
    return current;
  }

  getContext() {
    const ctx: any = {
      canvas: this,
      measureText: (text: string) => ({ width: (text || '').length * 8 }),
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    };
    return new Proxy(ctx, {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (typeof prop === 'string' && (prop.startsWith('is') || prop.startsWith('has'))) return () => false;
        return () => {};
      },
      set(target, prop, value) {
        target[prop] = value;
        return true;
      },
    });
  }
}

class MockLocalStorage {
  private store: Map<string, string> = new Map();
  getItem(key: string): string | null { return this.store.get(key) ?? null; }
  setItem(key: string, value: string): void { this.store.set(key, String(value)); }
  removeItem(key: string): void { this.store.delete(key); }
  clear(): void { this.store.clear(); }
}

describe('Layout, Multi-Edge Docking, and Inline Visuals', () => {
  let container: MockElement;
  let editor: DocumentEditor;

  beforeEach(() => {
    const mockStorage = new MockLocalStorage();
    const mockDoc = new MockElement('document');
    const mockBody = new MockElement('body');
    const mockDocElement = new MockElement('html');

    mockDoc.appendChild(mockDocElement);
    mockDoc.appendChild(mockBody);

    (globalThis as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      devicePixelRatio: 1,
      localStorage: mockStorage,
    };
    (globalThis as any).document = {
      createElement: (tag: string) => new MockElement(tag),
      body: mockBody,
      documentElement: mockDocElement,
      activeElement: null,
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    (globalThis as any).localStorage = mockStorage;

    container = new MockElement('div');
    mockBody.appendChild(container);
  });

  afterEach(() => {
    if (editor) {
      editor.dispose();
    }
    container.remove();
  });

  it('maintains full height editor pane alongside work panel (no vertical collapse)', () => {
    const docText = `x := 42\ny := x + 8`;
    editor = new DocumentEditor(container as any, docText);

    const workspace = container.querySelector('#doc-workspace');
    const editorPane = container.querySelector('.doc-pane-left');
    const workPanel = container.querySelector('#doc-work-panel');
    const splitter = container.querySelector('#doc-splitter');

    expect(workspace).toBeTruthy();
    expect(editorPane).toBeTruthy();
    expect(workPanel).toBeTruthy();
    expect(splitter).toBeTruthy();

    expect(workspace?.getAttribute('data-dock')).toBe('right');
    expect(workPanel?.style.display).toBe('flex');
    expect(workPanel?.style.width).toBe('480px');
  });

  it('persists dock edge and size per orientation (Right, Bottom, Left, Top)', () => {
    editor = new DocumentEditor(container as any, 'f(x) := sin(x)\ngraph(f(x), x in 0..10)');

    // 1. Default is Right dock with 480px width
    const workspace = container.querySelector('#doc-workspace');
    const workPanel = container.querySelector('#doc-work-panel');
    expect(workspace?.getAttribute('data-dock')).toBe('right');
    expect(workPanel?.style.width).toBe('480px');

    // 2. Dock Bottom
    editor.setDockEdge('bottom');
    expect(workspace?.getAttribute('data-dock')).toBe('bottom');
    expect(workPanel?.style.width).toBe('100%');
    expect(workPanel?.style.height).toBe('300px');

    // Check localStorage persistence
    const saved1 = JSON.parse(localStorage.getItem('doc_dock_layout') || '{}');
    expect(saved1.edge).toBe('bottom');
    expect(saved1.edgeSizes.bottom).toBe(300);

    // 3. Dock Left
    editor.setDockEdge('left');
    expect(workspace?.getAttribute('data-dock')).toBe('left');
    expect(workPanel?.style.width).toBe('480px');
    expect(workPanel?.style.height).toBe('100%');

    // 4. Dock Top
    editor.setDockEdge('top');
    expect(workspace?.getAttribute('data-dock')).toBe('top');
    expect(workPanel?.style.width).toBe('100%');
    expect(workPanel?.style.height).toBe('300px');

    // 5. Cycle dock edge: Top -> Right -> Bottom -> Left -> Top
    editor.cycleDockEdge();
    expect(workspace?.getAttribute('data-dock')).toBe('right');
  });

  it('allows collapsing panel to zero width with persistent edge affordance', () => {
    editor = new DocumentEditor(container as any, 'a := 5');

    const workspace = container.querySelector('#doc-workspace');
    const workPanel = container.querySelector('#doc-work-panel');
    const affordance = container.querySelector('#doc-panel-edge-affordance');

    expect(workspace?.classList.contains('panel-collapsed')).toBe(false);

    // Toggle collapse
    editor.togglePanelCollapse();
    expect(workspace?.classList.contains('panel-collapsed')).toBe(true);
    expect(workPanel?.style.display).toBe('none');

    // Verify localStorage
    const saved = JSON.parse(localStorage.getItem('doc_dock_layout') || '{}');
    expect(saved.collapsed).toBe(true);

    // Clicking edge affordance un-collapses
    affordance?.click();
    expect(workspace?.classList.contains('panel-collapsed')).toBe(false);
    expect(workPanel?.style.display).toBe('flex');
  });

  it('renders plots, derivations, described cards, and scalars inline in Results gutter', () => {
    const docText = [
      'a := 15',
      'graph(sin(x), x in 0..10)',
      'isolate(x^2 - 4 = 0, for: x)',
      '\u222c_S F \u00b7 dS',
    ].join('\n');

    editor = new DocumentEditor(container as any, docText);

    // Verify Visual tab is removed, only 4 tabs remain
    const tabs = container.querySelectorAll('.doc-tab-btn').map(b => b.getAttribute('data-tab'));
    expect(tabs).toEqual(['results', 'scope', 'trace', 'frames']);
    expect(tabs).not.toContain('visual');

    const gutter = container.querySelector('#doc-gutter');
    const rows = gutter?.querySelectorAll('.doc-gutter-row') || [];
    expect(rows.length).toBe(4);

    // Line 1: Scalar
    const scalarVal = rows[0].querySelector('.doc-result-value');
    expect(scalarVal).toBeTruthy();
    expect(scalarVal?.textContent).toContain('15');

    // Line 2: Inline Plot / Space
    const rec1 = (editor as any).state.getRecords()[1];
    expect(rec1?.result?.type).toMatch(/graph|space/);
    const plotCanvas = rows[1].querySelector('.doc-inline-canvas') || rows[1].querySelector('.doc-space-container');
    expect(plotCanvas).toBeTruthy();
    expect(rows[1].textContent).toMatch(/Plot|Space/);

    // Line 3: Inline Derivation
    const derivTree = rows[2].querySelector('.visual-derivation-tree');
    expect(derivTree).toBeTruthy();
    expect(rows[2].textContent).toContain('Derivation');

    // Line 4: Inline Described Card
    const descPane = rows[3].querySelector('.visual-described-pane');
    expect(descPane).toBeTruthy();
    expect(rows[3].textContent).toContain('needs-parameterization');
  });

  it('supports pinning visual items into top pinned slot and unpinning', () => {
    const docText = [
      'graph(cos(x), x in 0..5)',
      'isolate(x^2 = 9, for: x)',
    ].join('\n');

    editor = new DocumentEditor(container as any, docText);

    const pinnedContainer = container.querySelector('#doc-pinned-visuals');
    expect(pinnedContainer?.classList.contains('empty')).toBe(true);

    // Pin line 1 (plot)
    const pinBtnLine0 = container.querySelector('.doc-gutter-row[data-line="0"] .doc-gutter-pin-btn');
    expect(pinBtnLine0).toBeTruthy();
    pinBtnLine0?.click();

    // Pinned container should now have 1 item
    expect(pinnedContainer?.classList.contains('empty')).toBe(false);
    expect(pinnedContainer?.querySelectorAll('.doc-pinned-item').length).toBe(1);

    // Pin line 2 (derivation)
    const pinBtnLine1 = container.querySelector('.doc-gutter-row[data-line="1"] .doc-gutter-pin-btn');
    expect(pinBtnLine1).toBeTruthy();
    pinBtnLine1?.click();
    expect(pinnedContainer?.querySelectorAll('.doc-pinned-item').length).toBe(2);

    // Unpin line 1 via unpin button in pinned header
    const unpinBtn = pinnedContainer?.querySelector('.doc-unpin-btn[data-line="0"]');
    expect(unpinBtn).toBeTruthy();
    unpinBtn?.click();

    expect(pinnedContainer?.querySelectorAll('.doc-pinned-item').length).toBe(1);
  });

  it('supports expanding and collapsing individual gutter rows with persisted collapse', () => {
    const docText = 'graph(sin(x), x in 0..10)';
    editor = new DocumentEditor(container as any, docText);

    const row = container.querySelector('.doc-gutter-row[data-line="0"]');
    const visualEl = row?.querySelector('.doc-inline-canvas') || row?.querySelector('.doc-space-container');
    expect(visualEl).toBeTruthy();

    // Collapse line 0
    const collapseBtn = row?.querySelector('.doc-gutter-collapse-btn');
    expect(collapseBtn).toBeTruthy();
    collapseBtn?.click();

    // Canvas should no longer be visible; summary should be displayed
    const collapsedRow = container.querySelector('.doc-gutter-row[data-line="0"]');
    const collapsedVisualEl = collapsedRow?.querySelector('.doc-inline-canvas') || collapsedRow?.querySelector('.doc-space-container');
    expect(collapsedVisualEl).toBeFalsy();
    expect(collapsedRow?.querySelector('.doc-gutter-collapsed-summary')).toBeTruthy();

    // Check localStorage persistence for collapsed lines
    const savedCollapsed = JSON.parse(localStorage.getItem('doc_collapsed_lines') || '[]');
    expect(savedCollapsed).toContain(0);

    // Expand line 0 again
    const expandBtn = collapsedRow?.querySelector('.doc-gutter-collapse-btn');
    expandBtn?.click();
    const expandedRow = container.querySelector('.doc-gutter-row[data-line="0"]');
    const expandedVisualEl = expandedRow?.querySelector('.doc-inline-canvas') || expandedRow?.querySelector('.doc-space-container');
    expect(expandedVisualEl).toBeTruthy();
  });

  it('asserts the editor pane rendered line count matches the loaded document line count', () => {
    const multiLineDoc = [
      '# Line 1',
      'a := 10',
      'b := 20',
      'c := a + b',
      'd := c * 2',
      'graph(2x)',
      'd',
    ].join('\n');

    editor = new DocumentEditor(container as any, multiLineDoc);

    const lineNumElements = container.querySelectorAll('.doc-line-num');
    expect(lineNumElements.length).toBe(7);

    const statsBadge = container.querySelector('#doc-stats-badge');
    expect(statsBadge?.textContent).toContain('7 lines');

    const textarea = container.querySelector('#doc-textarea') as any;
    expect(textarea?.value.split('\n').length).toBe(7);
  });

  it('asserts default startup without args initializes line count to CORPUS_DOCUMENTS[0] line count', () => {
    // Mount editor with no initialText (simulating page launch)
    editor = new DocumentEditor(container as any);

    const expectedLineCount = CORPUS_DOCUMENTS[0].content.split('\n').length;
    const lineNumElements = container.querySelectorAll('.doc-line-num');
    expect(lineNumElements.length).toBe(expectedLineCount);

    const statsBadge = container.querySelector('#doc-stats-badge');
    expect(statsBadge?.textContent).toContain(`${expectedLineCount} lines`);

    const textarea = container.querySelector('#doc-textarea') as any;
    expect(textarea?.value.split('\n').length).toBe(expectedLineCount);
  });

  it('asserts dock menu dropdown toggles and selects dock edges', () => {
    editor = new DocumentEditor(container as any, 'graph(2x)');

    const dockMenuBtn = container.querySelector('#doc-dock-menu-btn');
    const dockDropdown = container.querySelector('#doc-dock-dropdown');
    expect(dockMenuBtn).toBeTruthy();
    expect(dockDropdown).toBeTruthy();
    expect(dockDropdown?.classList.contains('hidden')).toBe(true);

    // Click to open dropdown
    dockMenuBtn?.click();
    expect(dockDropdown?.classList.contains('hidden')).toBe(false);

    // Select dock left
    const leftBtn = dockDropdown?.querySelector('.doc-dock-btn[data-edge="left"]');
    leftBtn?.click();

    const workspace = container.querySelector('#doc-workspace');
    expect(workspace?.getAttribute('data-dock')).toBe('left');
    expect(dockDropdown?.classList.contains('hidden')).toBe(true);
  });
});

