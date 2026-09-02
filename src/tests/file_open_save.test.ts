import { describe, it, expect, beforeEach } from 'vitest';
import { FileManager, AutosaveData } from '../document/file_manager';
import { DocumentEditor } from '../document/editor';

// In-memory localStorage mock for Node environment
const storage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => { storage[key] = String(value); },
  removeItem: (key: string) => { delete storage[key]; },
  clear: () => { Object.keys(storage).forEach(k => delete storage[k]); },
};

(globalThis as any).localStorage = mockLocalStorage;

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
  }

  addEventListener(event: string, handler: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(handler);
  }

  removeEventListener(event: string, handler: Function) {
    const list = this.listeners.get(event);
    if (list) {
      this.listeners.set(event, list.filter(h => h !== handler));
    }
  }

  dispatchEvent(evt: any) {
    const handlers = this.listeners.get(evt.type);
    if (handlers) {
      handlers.forEach(h => h(evt));
    }
    return true;
  }

  querySelector(selector: string): MockElement | null {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];

    const matchesSelector = (el: MockElement, sel: string): boolean => {
      if (sel.startsWith('#')) {
        return el.id === sel.slice(1);
      }
      if (sel.startsWith('.')) {
        return el.classList.contains(sel.slice(1));
      }
      if (sel.startsWith('[') && sel.endsWith(']')) {
        const attrContent = sel.slice(1, -1);
        if (attrContent.includes('=')) {
          const [name, val] = attrContent.split('=');
          const cleanVal = val.replace(/['"]/g, '');
          return el.getAttribute(name) === cleanVal;
        }
        return el.attributes.has(attrContent);
      }
      return el.tagName.toLowerCase() === sel.toLowerCase();
    };

    const traverse = (el: MockElement) => {
      for (const child of el.children) {
        if (matchesSelector(child, selector)) {
          results.push(child);
        }
        traverse(child);
      }
    };

    traverse(this);
    return results;
  }

  contains(other: any): boolean {
    if (other === this) return true;
    let curr = other?.parentElement;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentElement;
    }
    return false;
  }

  getBoundingClientRect() {
    return { top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 };
  }
}

(globalThis as any).document = {
  createElement: (tag: string) => new MockElement(tag),
  addEventListener: () => {},
  removeEventListener: () => {},
  body: new MockElement('BODY'),
  title: '',
};

(globalThis as any).window = (globalThis as any).window || {};
(globalThis as any).window.addEventListener = (globalThis as any).window.addEventListener || (() => {});
(globalThis as any).window.removeEventListener = (globalThis as any).window.removeEventListener || (() => {});

(globalThis as any).Event = class {
  public type: string;
  public bubbles: boolean;
  constructor(type: string, opts?: any) {
    this.type = type;
    this.bubbles = opts?.bubbles ?? false;
  }
};

describe('Phase 13 Part B: File Open, Save, Save As & Autosave Backstop', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it('correctly tracks and persists recent files', () => {
    expect(FileManager.getRecentFiles()).toEqual([]);

    FileManager.addRecentFile('problem_set_1.ax');
    FileManager.addRecentFile('physics.ax');

    const recents = FileManager.getRecentFiles();
    expect(recents.length).toBe(2);
    expect(recents[0].name).toBe('physics.ax');
    expect(recents[1].name).toBe('problem_set_1.ax');

    // Adding same file moves it to the top without duplicating
    FileManager.addRecentFile('problem_set_1.ax');
    const updated = FileManager.getRecentFiles();
    expect(updated.length).toBe(2);
    expect(updated[0].name).toBe('problem_set_1.ax');
    expect(updated[1].name).toBe('physics.ax');
  });

  it('saves and clears autosave backstop in localStorage', () => {
    const fileName = 'test_homework.ax';
    const content = '# Homework 3\nx := 42\n';

    expect(FileManager.getAutosave(fileName)).toBeNull();

    FileManager.saveAutosave(fileName, content);
    const autosave = FileManager.getAutosave(fileName);
    expect(autosave).not.toBeNull();
    expect(autosave?.fileName).toBe(fileName);
    expect(autosave?.content).toBe(content);
    expect(autosave?.timestamp).toBeGreaterThan(0);

    FileManager.clearAutosave(fileName);
    expect(FileManager.getAutosave(fileName)).toBeNull();
  });

  it('prompts recovery when a newer autosave exists on file open', async () => {
    const fileName = 'lab_report.ax';
    const diskContent = '# Original disk content\nx := 1\n';
    const unsavedContent = '# Edited autosaved content\nx := 100\n';

    // Store a newer autosave
    const autosaveTime = Date.now();
    localStorage.setItem(
      'axine_autosave_' + fileName,
      JSON.stringify({
        fileName,
        content: unsavedContent,
        timestamp: autosaveTime,
      })
    );

    // Mock FileSystemAccess on window
    const mockFile = {
      name: fileName,
      lastModified: autosaveTime - 5000, // disk file is older than autosave
      text: async () => diskContent,
    };
    const mockHandle = {
      name: fileName,
      getFile: async () => mockFile,
      createWritable: async () => ({
        write: async () => {},
        close: async () => {},
      }),
    };

    (globalThis as any).window = (globalThis as any).window || {};
    (globalThis.window as any).showOpenFilePicker = async () => [mockHandle];
    (globalThis.window as any).showSaveFilePicker = async () => mockHandle;

    let prompted = false;
    let recoveryAccepted = true;
    const promptRecovery = async (as: AutosaveData, _fd: Date) => {
      prompted = true;
      expect(as.content).toBe(unsavedContent);
      return recoveryAccepted;
    };

    // Case 1: User accepts recovery
    recoveryAccepted = true;
    const res1 = await FileManager.openFile(promptRecovery);
    expect(prompted).toBe(true);
    expect(res1?.content).toBe(unsavedContent);
    expect(res1?.isDirty).toBe(true);
    expect(res1?.recovered).toBe(true);

    // Case 2: User rejects recovery -> disk content is loaded
    recoveryAccepted = false;
    const res2 = await FileManager.openFile(promptRecovery);
    expect(res2?.content).toBe(diskContent);
    expect(res2?.isDirty).toBe(false);
    expect(res2?.recovered).toBe(false);
  });

  it('saves content directly back to existing FileSystemFileHandle', async () => {
    let writtenText = '';
    let closed = false;

    const mockHandle: any = {
      name: 'solution.ax',
      createWritable: async () => ({
        write: async (text: string) => {
          writtenText = text;
        },
        close: async () => {
          closed = true;
        },
      }),
    };

    (globalThis.window as any).showOpenFilePicker = async () => [mockHandle];
    (globalThis.window as any).showSaveFilePicker = async () => mockHandle;

    const saveRes = await FileManager.saveFile('solution.ax', '# New calculation\ny := 99', mockHandle);
    expect(saveRes.success).toBe(true);
    expect(saveRes.apiUsed).toBe('file-system-access');
    expect(writtenText).toBe('# New calculation\ny := 99');
    expect(closed).toBe(true);
    expect(saveRes.isDirty).toBe(false);
  });

  it('updates dirty indicator on edit and clears on save in DocumentEditor', async () => {
    // Mount editor in a mock DOM container
    const container = document.createElement('div');
    const initialText = '# Test Document\nx := 10\n';
    const editor = new DocumentEditor(container as any, initialText);

    expect(editor.getIsDirty()).toBe(false);
    expect(editor.getDocumentName()).toBe('untitled.ax');

    const dirtyBadge = container.querySelector('#doc-dirty-badge');
    expect(dirtyBadge?.classList.contains('hidden')).toBe(true);

    // Edit text
    const textarea = container.querySelector('#doc-textarea') as HTMLTextAreaElement;
    textarea.value = '# Test Document\nx := 20\n';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    expect(editor.getIsDirty()).toBe(true);
    expect(dirtyBadge?.classList.contains('hidden')).toBe(false);

    // Save document with mock FSA
    let written = '';
    const mockHandle: any = {
      name: 'test_doc.ax',
      createWritable: async () => ({
        write: async (t: string) => { written = t; },
        close: async () => {},
      }),
    };
    (globalThis.window as any).showSaveFilePicker = async () => mockHandle;

    const saveResult = await editor.saveDocumentAs();
    expect(saveResult.success).toBe(true);
    expect(written).toBe('# Test Document\nx := 20\n');
    expect(editor.getIsDirty()).toBe(false);
    expect(dirtyBadge?.classList.contains('hidden')).toBe(true);
    expect(editor.getDocumentName()).toBe('test_doc.ax');
  });
});
