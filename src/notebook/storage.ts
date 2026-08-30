import { NotebookState } from './state';

const STORAGE_KEY_PREFIX = 'math_notebook_doc_';
const STORAGE_LIST_KEY = 'math_notebook_doc_list';
const LAST_ACTIVE_KEY = 'math_notebook_last_active';

export interface DocumentMeta {
  id: string;
  title: string;
  updatedAt: number;
}

export class NotebookStorage {
  public static listDocuments(): DocumentMeta[] {
    try {
      const raw = localStorage.getItem(STORAGE_LIST_KEY);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public static saveDocument(id: string, state: NotebookState): void {
    try {
      const docData = state.serialize();
      localStorage.setItem(STORAGE_KEY_PREFIX + id, docData);

      const docs = this.listDocuments().filter(d => d.id !== id);
      docs.unshift({
        id,
        title: state.title || 'Untitled',
        updatedAt: Date.now(),
      });
      localStorage.setItem(STORAGE_LIST_KEY, JSON.stringify(docs));
      localStorage.setItem(LAST_ACTIVE_KEY, id);
    } catch (e) {
      console.warn('LocalStorage save failed', e);
    }
  }

  public static loadDocument(id: string, state: NotebookState): boolean {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PREFIX + id);
      if (!raw) return false;
      state.deserialize(raw);
      localStorage.setItem(LAST_ACTIVE_KEY, id);
      return true;
    } catch {
      return false;
    }
  }

  public static deleteDocument(id: string): void {
    try {
      localStorage.removeItem(STORAGE_KEY_PREFIX + id);
      const docs = this.listDocuments().filter(d => d.id !== id);
      localStorage.setItem(STORAGE_LIST_KEY, JSON.stringify(docs));
    } catch {}
  }

  public static getLastActiveId(): string | null {
    try {
      return localStorage.getItem(LAST_ACTIVE_KEY);
    } catch {
      return null;
    }
  }

  public static exportJSON(state: NotebookState): void {
    const json = state.serialize();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(state.title || 'notebook').replace(/\s+/g, '_').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  public static importJSON(file: File, state: NotebookState): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string;
          state.deserialize(text);
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsText(file);
    });
  }
}
