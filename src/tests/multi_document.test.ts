import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentEditor } from '../document/editor';
import { createInitialEnvironment, evaluate } from '../core/evaluator';
import { processDocumentLines } from '../core/worker';

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
    if (this.listeners.has(event)) {
      this.listeners.set(event, this.listeners.get(event)!.filter(h => h !== handler));
    }
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

  closest(selector: string): MockElement | null {
    if (selector.startsWith('.')) {
      const cls = selector.substring(1);
      if (this.classList.contains(cls)) return this;
    }
    if (this.parentElement) return this.parentElement.closest(selector);
    return null;
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

describe('Phase 13 Part D: Multiple Documents & Tabs', () => {
  let container: MockElement;
  let mockDocElement: MockElement;

  beforeEach(() => {
    const mockStorage = new MockLocalStorage();
    const mockDoc = new MockElement('document');
    const mockBody = new MockElement('body');
    mockDocElement = new MockElement('html');

    mockDoc.appendChild(mockDocElement);
    mockDoc.appendChild(mockBody);

    (globalThis as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      devicePixelRatio: 1,
      localStorage: mockStorage,
      confirm: () => true,
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

  it('maintains strict scope isolation between separate document sessions', () => {
    // Document A has its own environment
    const envA = createInitialEnvironment();
    evaluate('x := 42', envA);
    const resA = evaluate('x * 2', envA);
    expect(resA.value.type).toBe('rational');
    expect((resA.value as any).n).toBe(84n);

    // Document B has its own fresh environment
    const envB = createInitialEnvironment();
    expect(() => {
      evaluate('x + 1', envB);
    }).toThrow();

    // Verify via processDocumentLines
    const linesA = ['x := 42', 'x * 2'];
    const resultsA: any[] = [];
    processDocumentLines(1, linesA, (msg) => resultsA.push(msg));
    expect(resultsA[0].boundName).toBe('x');
    expect(resultsA[1].result.type).toBe('rational');

    const linesB = ['x + 1'];
    const resultsB: any[] = [];
    processDocumentLines(2, linesB, (msg) => resultsB.push(msg));
    expect(resultsB[0].error).toBeDefined();
    expect(resultsB[0].error.message).toContain("Variable 'x' is not assigned a value");
  });

  it('supports creating multiple tab sessions with independent names and states', () => {
    const editor = new DocumentEditor(container as any, 'a := 10\na * 2');
    editor.setDocumentName('doc_a.ax');

    const sessionsBefore = editor.getSessions();
    expect(sessionsBefore.length).toBe(1);
    expect(sessionsBefore[0].name).toBe('doc_a.ax');

    // Open second document session
    const sessB = editor.createSession('doc_b.ax', 'b := 20\nb * 3');
    const sessionsAfter = editor.getSessions();
    expect(sessionsAfter.length).toBe(2);
    expect(sessionsAfter[1].name).toBe('doc_b.ax');
    expect(sessionsAfter[1].id).toBe(sessB.id);
  });

  it('preserves scroll position, caret position, dock state, and pinned visuals across tab switches', () => {
    const editor = new DocumentEditor(container as any, 'x := 100\ny := 200\nz := 300\nw := 400');
    editor.setDocumentName('doc_first.ax');
    const sessAId = editor.getActiveSession()!.id;

    // Modify state of doc A: dock edge, caret, scroll, pinned visuals
    editor.setDockEdge('bottom');
    (editor as any).pinnedLines.add(1);
    (editor as any).textarea.selectionStart = 5;
    (editor as any).textarea.selectionEnd = 8;
    (editor as any).textarea.scrollTop = 120;

    // Create and switch to doc B
    const sessB = editor.openSession('doc_second.ax', 'p := 1\nq := 2');
    expect(editor.getActiveSession()!.id).toBe(sessB.id);
    expect(editor.getDocumentName()).toBe('doc_second.ax');

    // Modify state of doc B
    editor.setDockEdge('left');
    (editor as any).pinnedLines.add(0);
    (editor as any).textarea.selectionStart = 2;
    (editor as any).textarea.selectionEnd = 3;
    (editor as any).textarea.scrollTop = 40;

    // Switch back to doc A
    editor.switchToSession(sessAId);
    expect(editor.getActiveSession()!.id).toBe(sessAId);
    expect(editor.getDocumentName()).toBe('doc_first.ax');

    // Confirm doc A state was preserved
    expect((editor as any).dockLayout.edge).toBe('bottom');
    expect((editor as any).pinnedLines.has(1)).toBe(true);
    expect((editor as any).pinnedLines.has(0)).toBe(false);
    expect((editor as any).textarea.selectionStart).toBe(5);
    expect((editor as any).textarea.selectionEnd).toBe(8);
    expect((editor as any).textarea.scrollTop).toBe(120);

    // Switch back to doc B
    editor.switchToSession(sessB.id);
    expect(editor.getActiveSession()!.id).toBe(sessB.id);
    expect(editor.getDocumentName()).toBe('doc_second.ax');

    // Confirm doc B state was preserved
    expect((editor as any).dockLayout.edge).toBe('left');
    expect((editor as any).pinnedLines.has(0)).toBe(true);
    expect((editor as any).pinnedLines.has(1)).toBe(false);
    expect((editor as any).textarea.selectionStart).toBe(2);
    expect((editor as any).textarea.selectionEnd).toBe(3);
    expect((editor as any).textarea.scrollTop).toBe(40);
  });

  it('closing a tab cleans up the session and switches to remaining tab', () => {
    const editor = new DocumentEditor(container as any, 'alpha := 1');
    editor.setDocumentName('tab1.ax');
    const sess1Id = editor.getActiveSession()!.id;

    const sess2 = editor.openSession('tab2.ax', 'beta := 2');
    expect(editor.getSessions().length).toBe(2);
    expect(editor.getActiveSession()!.id).toBe(sess2.id);

    // Close active tab2
    const closed = editor.closeSession(sess2.id);
    expect(closed).toBe(true);
    expect(editor.getSessions().length).toBe(1);
    expect(editor.getActiveSession()!.id).toBe(sess1Id);
    expect(editor.getDocumentName()).toBe('tab1.ax');
  });
});
