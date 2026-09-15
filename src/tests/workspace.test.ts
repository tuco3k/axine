import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkspaceManager, Workspace } from '../document/workspace';
import { WelcomeScreen } from '../document/welcome_screen';
import { Evaluator } from '../core/evaluator';
import { DocumentEditor } from '../document/editor';
import { PaneContainer } from '../notebook/pane_container';
import { DocumentState } from '../document/document_state';
import { valueToNumber } from '../core/numeric/tower';

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
  private _className: string = '';
  public classList: MockClassList = new MockClassList();
  get className(): string {
    return this._className;
  }
  set className(val: string) {
    this._className = val;
    this.classList = new MockClassList();
    if (val) {
      val.split(/\s+/).forEach(c => { if (c) this.classList.add(c); });
    }
  }

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
  public onclick: any = null;
  public href: string = '';
  public src: string = '';
  public alt: string = '';
  public title: string = '';
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
    if (name === 'src') return this.src || this.attributes.get('src') || null;
    if (name === 'href') return this.href || this.attributes.get('href') || null;
    if (name === 'id') return this.id || this.attributes.get('id') || null;
    if (name === 'alt') return this.alt || this.attributes.get('alt') || null;
    if (name === 'title') return this.title || this.attributes.get('title') || null;
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
    if (name === 'class') {
      this.className = value;
    } else if (name === 'id') {
      this.id = value;
    } else if (name === 'src') {
      this.src = value;
    } else if (name === 'href') {
      this.href = value;
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
    if (this.onclick) {
      this.onclick({ stopPropagation: () => {} });
    }
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

      const idMatch = remaining.match(/#([a-zA-Z0-9\-_]+)/);
      if (idMatch) {
        if (el.id !== idMatch[1]) return false;
        remaining = remaining.replace(idMatch[0], '');
      }

      const attrMatches = remaining.matchAll(/\[([a-zA-Z0-9\-_]+)(?:=["']([^"']*)["'])?\]/g);
      for (const am of attrMatches) {
        const attr = am[1];
        if (!el.attributes.has(attr)) return false;
        if (am[2] !== undefined && el.attributes.get(attr) !== am[2]) return false;
        remaining = remaining.replace(am[0], '');
      }

      const classMatches = remaining.matchAll(/\.([a-zA-Z0-9\-_]+)/g);
      for (const cm of classMatches) {
        if (!el.classList.contains(cm[1])) return false;
        remaining = remaining.replace(cm[0], '');
      }

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

describe('WorkspaceManager', () => {
  beforeEach(() => {
    const mockStorage = new MockLocalStorage();
    (globalThis as any).localStorage = mockStorage;
    (globalThis as any).window = { localStorage: mockStorage };
    Evaluator.clearWorkspaceFiles();
  });

  afterEach(() => {
    localStorage.clear();
    Evaluator.clearWorkspaceFiles();
  });

  it('creates and persists virtual workspaces', () => {
    const ws = WorkspaceManager.createVirtualWorkspace('Physics Lab', {
      'main.ax': 'x = 10\ny = x * 2',
      'lib/math_utils.ax': 'sq(v) = v * v',
    });

    expect(ws.id).toMatch(/^vws_/);
    expect(ws.name).toBe('Physics Lab');
    expect(ws.isVirtual).toBe(true);
    expect(ws.files.size).toBe(2);
    expect(ws.files.get('main.ax')).toBe('x = 10\ny = x * 2');
    expect(ws.files.get('lib/math_utils.ax')).toBe('sq(v) = v * v');

    // Loaded from localStorage
    const loaded = WorkspaceManager.loadVirtualWorkspace(ws.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.name).toBe('Physics Lab');
    expect(loaded?.files.get('main.ax')).toBe('x = 10\ny = x * 2');
    expect(loaded?.files.get('lib/math_utils.ax')).toBe('sq(v) = v * v');
  });

  it('manages active workspace and recents list', () => {
    expect(WorkspaceManager.getActiveWorkspaceId()).toBeNull();
    expect(WorkspaceManager.getRecentWorkspaces()).toEqual([]);

    const ws = WorkspaceManager.createVirtualWorkspace('Project Alpha');
    expect(WorkspaceManager.getActiveWorkspaceId()).toBe(ws.id);

    const recents = WorkspaceManager.getRecentWorkspaces();
    expect(recents.length).toBe(1);
    expect(recents[0].id).toBe(ws.id);
    expect(recents[0].name).toBe('Project Alpha');

    WorkspaceManager.clearActiveWorkspace();
    expect(WorkspaceManager.getActiveWorkspaceId()).toBeNull();
  });

  it('builds a hierarchical file tree from flat paths', () => {
    const files = new Map<string, string>([
      ['root_doc.ax', 'a = 1'],
      ['lib/algebra/solve.ax', 'solve_linear(m, c) = -c / m'],
      ['lib/geometry.ax', 'area(w, h) = w * h'],
      ['experiments/exp1.ax', 'test = 42'],
    ]);

    const tree = WorkspaceManager.buildFileTree(files);

    // Folders come first, then files alphabetically
    expect(tree.length).toBe(3); // experiments (dir), lib (dir), root_doc.ax (file)
    expect(tree[0].name).toBe('experiments');
    expect(tree[0].isDirectory).toBe(true);
    expect(tree[0].children?.length).toBe(1);
    expect(tree[0].children?.[0].name).toBe('exp1.ax');

    expect(tree[1].name).toBe('lib');
    expect(tree[1].isDirectory).toBe(true);
    expect(tree[1].children?.length).toBe(2); // algebra (dir), geometry.ax (file)
    expect(tree[1].children?.[0].name).toBe('algebra');
    expect(tree[1].children?.[0].isDirectory).toBe(true);
    expect(tree[1].children?.[0].children?.[0].name).toBe('solve.ax');
    expect(tree[1].children?.[1].name).toBe('geometry.ax');

    expect(tree[2].name).toBe('root_doc.ax');
    expect(tree[2].isDirectory).toBe(false);
  });

  it('performs file CRUD operations', async () => {
    const ws = WorkspaceManager.createVirtualWorkspace('Test WS', {
      'alpha.ax': '1 + 1',
    });

    // Create file
    await WorkspaceManager.createFile(ws, 'beta.ax', '2 + 2');
    expect(ws.files.get('beta.ax')).toBe('2 + 2');

    // Create folder
    await WorkspaceManager.createFolder(ws, 'sub');
    expect(ws.files.has('sub/.keep')).toBe(true);

    // Rename item
    await WorkspaceManager.renameItem(ws, 'beta.ax', 'gamma.ax');
    expect(ws.files.has('beta.ax')).toBe(false);
    expect(ws.files.get('gamma.ax')).toBe('2 + 2');

    // Read and Write file
    const content = await WorkspaceManager.readFile(ws, 'gamma.ax');
    expect(content).toBe('2 + 2');

    await WorkspaceManager.writeFile(ws, 'gamma.ax', '3 + 3');
    expect(ws.files.get('gamma.ax')).toBe('3 + 3');

    // Delete item
    await WorkspaceManager.deleteItem(ws, 'gamma.ax');
    expect(ws.files.has('gamma.ax')).toBe(false);
  });
});

describe('Module Resolution with Workspaces', () => {
  beforeEach(() => {
    Evaluator.clearWorkspaceFiles();
  });

  afterEach(() => {
    Evaluator.clearWorkspaceFiles();
  });

  it('resolves workspace-relative imports', () => {
    const wsFiles = new Map<string, string>([
      ['lib/sqrt.ax', '\\module :sqrt\n:my_sqrt(x) = x^0.5\n\\export :my_sqrt'],
      ['models/sim.ax', '\\import "lib/sqrt.ax"\n:res = :my_sqrt(16)'],
    ]);

    Evaluator.setWorkspaceFiles(wsFiles, 'MyWorkspace');

    const state = new DocumentState('\\import "lib/sqrt.ax"\n:res = :my_sqrt(25)');
    const records = state.getRecords();
    const resRec = records.find(r => r.boundName === ':res' || r.boundName === 'res');
    expect(resRec).toBeDefined();
    expect(resRec?.result).toBeDefined();
    expect(valueToNumber(resRec!.result!)).toBe(5);
  });

  it('resolves file-relative imports with workspace precedence', () => {
    const wsFiles = new Map<string, string>([
      ['components/helper.ax', ':factor = 100'],
      ['components/calc.ax', '\\import "helper.ax"\n:ans = :factor * 2'],
    ]);

    Evaluator.setWorkspaceFiles(wsFiles, 'MyWorkspace');

    const state = new DocumentState('\\import "components/calc.ax"\n:final = :ans + 5');
    const records = state.getRecords();
    const finalRec = records.find(r => r.boundName === ':final' || r.boundName === 'final');
    expect(finalRec).toBeDefined();
    expect(finalRec?.result).toBeDefined();
    expect(valueToNumber(finalRec!.result!)).toBe(205);
  });

  it('falls back to bundled stdlib if not in workspace', () => {
    const wsFiles = new Map<string, string>();
    Evaluator.setWorkspaceFiles(wsFiles, 'MyWorkspace');

    const state = new DocumentState('\\import "lib/abs.ax"\n:v := :abs(-42)');
    const records = state.getRecords();
    const vRec = records.find(r => r.boundName === ':v' || r.boundName === 'v');
    expect(vRec).toBeDefined();
    expect(vRec?.result).toBeDefined();
    expect(valueToNumber(vRec!.result!)).toBe(42);
  });

  it('reports searched paths when module is not found', () => {
    const wsFiles = new Map<string, string>();
    Evaluator.setWorkspaceFiles(wsFiles, 'MyWorkspace');

    const state = new DocumentState('\\import "non_existent.ax"');
    const records = state.getRecords();
    expect(records[0].error).toBeDefined();
    expect(records[0].error?.message).toContain("Cannot find module 'non_existent.ax'");
    expect(records[0].error?.message).toContain('Resolution failed:');
  });
});

describe('WelcomeScreen Component', () => {
  let container: MockElement;

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
    localStorage.clear();
  });

  it('renders logo, recent workspaces, start buttons, and documentation link', () => {
    WorkspaceManager.addRecentWorkspace({
      id: 'ws_test_1',
      name: 'Orbital Mechanics',
      path: '/home/user/orbital',
      isVirtual: false,
      lastOpened: Date.now() - 3600000,
      fileCount: 4,
    });

    const onOpenFolder = vi.fn();
    const onNewDocument = vi.fn();
    const onOpenRecent = vi.fn();

    const welcome = new WelcomeScreen(container as any, {
      onOpenFolder,
      onNewDocument,
      onOpenRecent,
    });

    welcome.render();

    // Verify logo and title
    const logo = container.querySelector('.axine-welcome-logo') as MockElement;
    expect(logo).not.toBeNull();
    expect(logo.getAttribute('src')).toBe('/logo.png');

    const title = container.querySelector('.axine-welcome-title');
    expect(title?.textContent).toBe('Axine');

    // Verify recent workspaces
    const recentItem = container.querySelector('.axine-welcome-recent-item') as MockElement;
    expect(recentItem).not.toBeNull();
    expect(recentItem.textContent).toContain('Orbital Mechanics');
    expect(recentItem.textContent).toContain('/home/user/orbital');

    recentItem.click();
    expect(onOpenRecent).toHaveBeenCalledWith(expect.objectContaining({ name: 'Orbital Mechanics' }));

    // Verify start buttons
    const openFolderBtn = container.querySelector('#welcome-open-folder-btn') as MockElement;
    expect(openFolderBtn).not.toBeNull();
    openFolderBtn.click();
    expect(onOpenFolder).toHaveBeenCalled();

    const newDocBtn = container.querySelector('#welcome-new-doc-btn') as MockElement;
    expect(newDocBtn).not.toBeNull();
    newDocBtn.click();
    expect(onNewDocument).toHaveBeenCalled();

    // Verify documentation link
    const docLink = container.querySelector('.axine-welcome-doc-link') as MockElement;
    expect(docLink).not.toBeNull();
    expect(docLink.getAttribute('href')).toBe('https://axine.org/documentation');
    expect(docLink.textContent).toBe('axine.org/documentation');
  });
});

describe('File Tree Tab in PaneContainer', () => {
  let container: MockElement;
  let paneContainer: PaneContainer;
  let testWorkspace: Workspace;

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

    testWorkspace = {
      id: 'ws_unit_test',
      name: 'Unit Test WS',
      path: '/test/ws',
      isVirtual: true,
      files: new Map<string, string>([
        ['index.ax', 'x = 1'],
        ['lib/calc.ax', 'y = 2'],
      ]),
    };
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders file tree inside a pane and responds to click actions', async () => {
    const onOpenFile = vi.fn();
    const onNewFileInWorkspace = vi.fn();
    const onNewFolderInWorkspace = vi.fn();
    const onRenameFileInWorkspace = vi.fn();
    const onDeleteFileInWorkspace = vi.fn();

    paneContainer = new PaneContainer(container as any, {
      getWorkspace: () => testWorkspace,
      onOpenFile,
      onNewFileInWorkspace,
      onNewFolderInWorkspace,
      onRenameFileInWorkspace,
      onDeleteFileInWorkspace,
    });

    // Open a Files (tree) tab
    paneContainer.openTab({
      id: 'tab_tree_test',
      type: 'tree',
      title: 'Files',
    });

    const treeView = container.querySelector('.pane-tree-view');
    expect(treeView).not.toBeNull();

    // Verify rows rendered
    const rows = container.querySelectorAll('.pane-tree-row');
    expect(rows.length).toBeGreaterThanOrEqual(2);

    const fileRow = Array.from(rows).find(r => r.textContent?.includes('index.ax')) as MockElement;
    expect(fileRow).not.toBeNull();

    fileRow.click();
    expect(onOpenFile).toHaveBeenCalledWith('index.ax');
  });
});

describe('DocumentEditor Workspace Lifecycle', () => {
  let container: MockElement;

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
    localStorage.clear();
  });

  it('launches Welcome Screen when no workspace is active and no initial text provided', () => {
    new DocumentEditor(container as any);
    const welcome = container.querySelector('.axine-welcome-screen');
    expect(welcome).not.toBeNull();
  });

  it('launches Document Editor directly when initialText is explicitly provided', () => {
    const editor = new DocumentEditor(container as any, 'a = 123');
    const welcome = container.querySelector('.axine-welcome-screen');
    expect(welcome).toBeNull();

    const appShell = container.querySelector('.doc-app-shell');
    expect(appShell).not.toBeNull();
    expect(editor.getText()).toBe('a = 123');
  });

  it('opens workspace, allows saving files, and returns to welcome screen on close', async () => {
    const ws = WorkspaceManager.createVirtualWorkspace('My Science Project', {
      'sim.ax': 'speed = 50',
    });
    WorkspaceManager.clearActiveWorkspace();

    const editor = new DocumentEditor(container as any);
    expect(container.querySelector('.axine-welcome-screen')).not.toBeNull();

    editor.openWorkspace(ws, 'sim.ax');
    expect(container.querySelector('.axine-welcome-screen')).toBeNull();
    expect(container.querySelector('.doc-app-shell')).not.toBeNull();
    expect(editor.getText()).toBe('speed = 50');

    // Edit text and save
    editor.setText('speed = 75');
    await editor.saveDocument();
    expect(ws.files.get('sim.ax')).toBe('speed = 75');
    expect(editor.getIsDirty()).toBe(false);

    // Close workspace
    editor.closeWorkspace();
    expect(container.querySelector('.axine-welcome-screen')).not.toBeNull();
    expect(WorkspaceManager.getActiveWorkspaceId()).toBeNull();
  });
});
