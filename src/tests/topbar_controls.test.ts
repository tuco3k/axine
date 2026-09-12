import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DocumentEditor } from '../document/editor';
import { CORPUS_DOCUMENTS } from '../document/corpus_data';

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
  public nodeType: number = 1;
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
      const isSelfClosing = Boolean(match[4]) || attrStr.trim().endsWith('/') || ['INPUT', 'IMG', 'BR', 'HR', 'PATH', 'RECT', 'LINE', 'CIRCLE', 'POLYGON', 'POLYLINE'].includes((isOpen || '').toUpperCase());
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

  contains(other: MockElement | null): boolean {
    if (!other) return false;
    if (other === this) return true;
    let curr: MockElement | null = other;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentElement;
    }
    return false;
  }

  closest(selector: string): MockElement | null {
    let curr: MockElement | null = this;
    while (curr) {
      if (curr.classList.contains(selector.replace(/^\./, ''))) return curr;
      if (curr.id && '#' + curr.id === selector) return curr;
      if (curr.tagName.toLowerCase() === selector.toLowerCase()) return curr;
      curr = curr.parentElement;
    }
    return null;
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

  dispatchEvent(event: { type: string; stopPropagation?: Function; target?: any }) {
    event.target = event.target || this;
    const handlers = this.listeners.get(event.type) || [];
    let stopped = false;
    const origStop = event.stopPropagation;
    event.stopPropagation = () => {
      stopped = true;
      if (origStop) origStop();
    };

    for (const h of handlers) {
      h(event);
    }

    if (!stopped && this.parentElement) {
      this.parentElement.dispatchEvent(event);
    }
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

describe('Top-Bar Control Responsiveness & Live Handlers after Typing', () => {
  let container: MockElement;
  let mockDoc: MockElement;
  let mockDocElement: MockElement;
  let editor: DocumentEditor;

  beforeEach(() => {
    const mockStorage = new MockLocalStorage();
    mockDoc = new MockElement('document');
    const mockBody = new MockElement('body');
    mockDocElement = new MockElement('html');

    mockDoc.appendChild(mockDocElement);
    mockDoc.appendChild(mockBody);

    (globalThis as any).window = {
      addEventListener: (event: string, handler: Function) => {
        mockDoc.addEventListener(event, handler);
      },
      removeEventListener: (event: string, handler: Function) => {
        mockDoc.removeEventListener(event, handler);
      },
      devicePixelRatio: 1,
      localStorage: mockStorage,
    };
    (globalThis as any).document = {
      createElement: (tag: string) => new MockElement(tag),
      body: mockBody,
      documentElement: mockDocElement,
      activeElement: null,
      addEventListener: (event: string, handler: Function) => {
        mockDoc.addEventListener(event, handler);
      },
      removeEventListener: (event: string, handler: Function) => {
        mockDoc.removeEventListener(event, handler);
      },
      querySelectorAll: (sel: string) => mockDoc.querySelectorAll(sel),
      querySelector: (sel: string) => mockDoc.querySelector(sel),
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

  it('asserts every top-bar control has live handler initially and after ten simulated keystrokes', () => {
    const initialDoc = 'x := 10\ny := 20';
    editor = new DocumentEditor(container as any, initialDoc);

    const fileMenuBtn = container.querySelector('#doc-file-menu-btn');
    const fileDropdown = container.querySelector('#doc-file-dropdown');
    const viewMenuBtn = container.querySelector('#doc-view-menu-btn');
    const viewDropdown = container.querySelector('#doc-view-dropdown');
    const runBtn = container.querySelector('#doc-run-btn');
    const themeBtn = container.querySelector('#doc-theme-btn');
    const corpusSelect = container.querySelector('#corpus-select');
    const budgetSelect = container.querySelector('#budget-select');

    expect(fileMenuBtn).toBeTruthy();
    expect(fileDropdown).toBeTruthy();
    expect(viewMenuBtn).toBeTruthy();
    expect(viewDropdown).toBeTruthy();
    expect(runBtn).toBeTruthy();
    expect(themeBtn).toBeTruthy();
    expect(corpusSelect).toBeNull();
    expect(budgetSelect).toBeTruthy();

    // 1. Test initial control functionality
    // A) File Menu
    expect(fileDropdown?.classList.contains('hidden')).toBe(true);
    fileMenuBtn?.click();
    expect(fileDropdown?.classList.contains('hidden')).toBe(false);
    fileMenuBtn?.click();
    expect(fileDropdown?.classList.contains('hidden')).toBe(true);

    // B) + View Menu
    expect(viewDropdown?.classList.contains('hidden')).toBe(true);
    viewMenuBtn?.click();
    expect(viewDropdown?.classList.contains('hidden')).toBe(false);
    viewMenuBtn?.click();
    expect(viewDropdown?.classList.contains('hidden')).toBe(true);

    // C) Theme Toggle
    const htmlTheme1 = mockDocElement.getAttribute('data-theme') || 'dark';
    themeBtn?.click();
    const htmlTheme2 = mockDocElement.getAttribute('data-theme');
    expect(htmlTheme2).not.toBe(htmlTheme1);

    // D) Run Button
    let runInvokedCalled = false;
    const origRunInvoked = editor['state'].runInvoked.bind(editor['state']);
    editor['state'].runInvoked = (limits: any) => {
      runInvokedCalled = true;
      return origRunInvoked(limits);
    };
    runBtn?.click();
    expect(runInvokedCalled).toBe(true);
    runInvokedCalled = false;

    // 2. Simulate 10 sequential keystrokes in the editor textarea
    const textarea = container.querySelector('#doc-textarea') as MockElement;
    expect(textarea).toBeTruthy();

    for (let k = 1; k <= 10; k++) {
      textarea.value += `\n# Keystroke ${k}\nz_${k} = ${k} * 2`;
      textarea.dispatchEvent({ type: 'input', stopPropagation: () => {} });
    }

    // 3. Re-verify ALL top-bar controls after the 10 keystrokes
    // A) File Menu still opens/closes
    expect(fileDropdown?.classList.contains('hidden')).toBe(true);
    fileMenuBtn?.click();
    expect(fileDropdown?.classList.contains('hidden')).toBe(false);
    fileMenuBtn?.click();
    expect(fileDropdown?.classList.contains('hidden')).toBe(true);

    // B) + View Menu still opens/closes
    expect(viewDropdown?.classList.contains('hidden')).toBe(true);
    viewMenuBtn?.click();
    expect(viewDropdown?.classList.contains('hidden')).toBe(false);
    viewMenuBtn?.click();
    expect(viewDropdown?.classList.contains('hidden')).toBe(true);

    // C) Theme Toggle still flips theme
    themeBtn?.click();
    const htmlTheme3 = mockDocElement.getAttribute('data-theme');
    expect(htmlTheme3).toBe(htmlTheme1);

    // D) Run Button still fires
    runBtn?.click();
    expect(runInvokedCalled).toBe(true);

    // E) Egalitarian Pane Tab switching & closing
    const pc = editor.paneContainer;
    expect(pc).toBeTruthy();
    pc?.openTab({
      id: 'tab_test_scope',
      type: 'scope',
      title: 'Scope (Definitions)',
    });
    const paneTabs = container.querySelectorAll('.pane-tab');
    expect(paneTabs.length).toBeGreaterThan(1);
    const scopeTab = paneTabs.find(t => t.textContent.includes('Scope'));
    expect(scopeTab).toBeTruthy();
    scopeTab?.click();
    expect(scopeTab?.classList.contains('active')).toBe(true);

    // F) New File button inside File dropdown
    const newFileBtn = container.querySelector('#doc-new-file-btn');
    expect(newFileBtn).toBeTruthy();
    newFileBtn?.click();
    expect(editor.getDocumentName()).toBe('untitled.ax');
  });

  it('verifies right-clicking a document tab provides related views, spaces, and split pane actions', () => {
    const docWithSpace = [
      'g = 9.8',
      '{\\axis :time, :y; :y = 15.0 * :time - 0.5 * g * :time^2}',
    ].join('\n');

    editor = new DocumentEditor(container as any, docWithSpace);
    const pc = editor.paneContainer;
    expect(pc).toBeTruthy();

    const spaces = editor.getAvailableSpaces();
    expect(spaces.length).toBe(2);
    expect(spaces.some(s => s.lineIdx === 1)).toBe(true);

    // Test context menu generation for document tab
    const docTab = {
      id: 'tab_test_doc',
      type: 'document' as const,
      title: 'thrown_ball.ax',
      documentId: 'sess_test',
    };

    pc?.showTabContextMenu(100, 100, 'leaf_1', docTab);

    const contextMenu = mockDoc.querySelector('.pane-tab-context-menu');
    expect(contextMenu).toBeTruthy();

    const items = contextMenu?.querySelectorAll('.pane-dropdown-item').map(it => it.textContent) || [];
    expect(items.some(t => t.includes('Results Stream'))).toBe(true);
    expect(items.some(t => t.includes('Scope (Definitions)'))).toBe(true);
    expect(items.some(t => t.includes('Execution Trace & Fuel'))).toBe(true);
    expect(items.some(t => t.includes('Captured Visual Frames'))).toBe(true);
    expect(items.some(t => t.includes('L2:'))).toBe(true);
    expect(items.some(t => t.includes('Split Pane Right'))).toBe(true);
    expect(items.some(t => t.includes('Split Pane Down'))).toBe(true);
    expect(items.some(t => t.includes('Close Tab'))).toBe(true);
  });
});
