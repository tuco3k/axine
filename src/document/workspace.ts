/**
 * Workspace Management & Filesystem Integration
 * 
 * Manages workspaces (physical directory handles via File System Access API or
 * virtual localStorage-backed workspaces), file trees, recent workspace persistence,
 * and synchronizing workspace files into the evaluator for module resolution.
 */

import { Evaluator } from '../core/evaluator';

export interface WorkspaceFileItem {
  name: string;
  path: string; // relative path from workspace root, e.g. "lib/sqrt.ax"
  isDirectory: boolean;
  children?: WorkspaceFileItem[];
  content?: string;
}

export interface Workspace {
  id: string;
  name: string;
  path?: string;
  isVirtual: boolean;
  handle?: any; // FileSystemDirectoryHandle
  files: Map<string, string>; // relative path -> content
}

export interface RecentWorkspace {
  id: string;
  name: string;
  path?: string;
  isVirtual: boolean;
  lastOpened: number;
  fileCount: number;
}

export class WorkspaceManager {
  private static RECENT_WORKSPACES_KEY = 'axine_recent_workspaces';
  private static ACTIVE_WORKSPACE_KEY = 'axine_active_workspace';
  private static VIRTUAL_WS_PREFIX = 'axine_virtual_ws_';

  private static listeners: Set<(ws: Workspace) => void> = new Set();

  public static subscribe(listener: (ws: Workspace) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public static notifyChange(ws: Workspace): void {
    this.syncToEvaluator(ws);
    this.listeners.forEach(fn => fn(ws));
  }

  public static isFileSystemAccessSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof (window as any).showDirectoryPicker === 'function'
    );
  }

  public static getRecentWorkspaces(): RecentWorkspace[] {
    try {
      if (typeof localStorage === 'undefined') return [];
      const data = localStorage.getItem(this.RECENT_WORKSPACES_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  public static addRecentWorkspace(ws: RecentWorkspace): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const recents = this.getRecentWorkspaces().filter(r => r.id !== ws.id && r.path !== ws.path);
      recents.unshift(ws);
      localStorage.setItem(this.RECENT_WORKSPACES_KEY, JSON.stringify(recents.slice(0, 10)));
    } catch {
      // Ignore quota errors
    }
  }

  public static removeRecentWorkspace(id: string): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const recents = this.getRecentWorkspaces().filter(r => r.id !== id);
      localStorage.setItem(this.RECENT_WORKSPACES_KEY, JSON.stringify(recents));
      if (this.getActiveWorkspaceId() === id) {
        this.clearActiveWorkspace();
      }
    } catch {
      // Ignore
    }
  }

  public static getActiveWorkspaceId(): string | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      return localStorage.getItem(this.ACTIVE_WORKSPACE_KEY);
    } catch {
      return null;
    }
  }

  public static setActiveWorkspaceId(id: string | null): void {
    try {
      if (typeof localStorage === 'undefined') return;
      if (id) {
        localStorage.setItem(this.ACTIVE_WORKSPACE_KEY, id);
      } else {
        localStorage.removeItem(this.ACTIVE_WORKSPACE_KEY);
      }
    } catch {
      // Ignore
    }
  }

  public static clearActiveWorkspace(): void {
    this.setActiveWorkspaceId(null);
    Evaluator.clearWorkspaceFiles();
  }

  public static syncToEvaluator(ws: Workspace): void {
    Evaluator.setWorkspaceFiles(ws.files, ws.path || ws.name);
  }

  /**
   * Prompts user to pick a folder using File System Access API.
   */
  public static async openDirectoryPicker(): Promise<Workspace | null> {
    if (!this.isFileSystemAccessSupported()) {
      // Create a virtual workspace when directory picker is unavailable
      const name = typeof window !== 'undefined' ? (window.prompt('Enter workspace name:', 'My Workspace') || 'workspace') : 'workspace';
      return this.createVirtualWorkspace(name);
    }

    try {
      const handle = await (window as any).showDirectoryPicker();
      if (!handle) return null;

      const ws = await this.loadFromDirectoryHandle(handle);
      this.setActiveWorkspaceId(ws.id);
      this.addRecentWorkspace({
        id: ws.id,
        name: ws.name,
        path: ws.path,
        isVirtual: false,
        lastOpened: Date.now(),
        fileCount: ws.files.size,
      });
      this.syncToEvaluator(ws);
      return ws;
    } catch (err: any) {
      if (err?.name === 'AbortError') return null;
      console.warn('showDirectoryPicker failed, falling back to virtual workspace', err);
      return this.createVirtualWorkspace('workspace');
    }
  }

  public static async loadFromDirectoryHandle(handle: any): Promise<Workspace> {
    const files = new Map<string, string>();
    const name = handle.name || 'Workspace';
    const id = 'fs_' + name.toLowerCase().replace(/[^a-z0-9_]/g, '_');

    async function scanDir(dirHandle: any, currentPath: string) {
      for await (const entry of dirHandle.values()) {
        const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
        if (entry.kind === 'file') {
          if (entry.name.endsWith('.ax') || entry.name.endsWith('.txt') || entry.name.endsWith('.math')) {
            const file = await entry.getFile();
            const text = await file.text();
            files.set(entryPath, text);
          }
        } else if (entry.kind === 'directory') {
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'dist') {
            await scanDir(entry, entryPath);
          }
        }
      }
    }

    try {
      await scanDir(handle, '');
    } catch (e) {
      console.warn('Error scanning directory handle:', e);
    }

    const ws: Workspace = {
      id,
      name,
      path: name,
      isVirtual: false,
      handle,
      files,
    };

    return ws;
  }

  /**
   * Creates an in-memory/localStorage virtual workspace.
   */
  public static createVirtualWorkspace(
    name: string,
    initialFiles: Record<string, string> = {}
  ): Workspace {
    const id = 'vws_' + Math.random().toString(36).substring(2, 9);
    const files = new Map<string, string>();

    for (const [k, v] of Object.entries(initialFiles)) {
      files.set(k.replace(/\\/g, '/'), v);
    }

    const ws: Workspace = {
      id,
      name,
      path: name,
      isVirtual: true,
      files,
    };

    this.saveVirtualWorkspace(ws);
    this.setActiveWorkspaceId(id);
    this.addRecentWorkspace({
      id: ws.id,
      name: ws.name,
      path: ws.path,
      isVirtual: true,
      lastOpened: Date.now(),
      fileCount: ws.files.size,
    });
    this.syncToEvaluator(ws);

    return ws;
  }

  /**
   * Creates a synthetic single-file workspace rooted at the file's parent directory.
   */
  public static createSyntheticWorkspace(
    fileName: string,
    content: string,
    handle?: any,
    parentDirName?: string
  ): Workspace {
    const baseName = fileName.replace(/^.*[\\/]/, '');
    const parentName = parentDirName || (fileName.includes('/') ? fileName.split('/')[0] : `${baseName.replace(/\.ax$/, '')}'s folder`);
    const id = 'syn_' + Math.random().toString(36).substring(2, 9);
    const files = new Map<string, string>();
    files.set(baseName, content);

    const ws: Workspace = {
      id,
      name: parentName,
      path: parentName,
      isVirtual: !handle,
      handle,
      files,
    };

    this.setActiveWorkspaceId(id);
    this.addRecentWorkspace({
      id: ws.id,
      name: ws.name,
      path: ws.path,
      isVirtual: ws.isVirtual,
      lastOpened: Date.now(),
      fileCount: ws.files.size,
    });
    this.syncToEvaluator(ws);

    return ws;
  }

  public static loadVirtualWorkspace(id: string): Workspace | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(this.VIRTUAL_WS_PREFIX + id);
      if (!raw) return null;
      const data = JSON.parse(raw);
      const files = new Map<string, string>();
      if (data.files && typeof data.files === 'object') {
        for (const [k, v] of Object.entries(data.files)) {
          files.set(k, String(v));
        }
      }
      return {
        id: data.id || id,
        name: data.name || 'Workspace',
        path: data.path || data.name || 'Workspace',
        isVirtual: true,
        files,
      };
    } catch {
      return null;
    }
  }

  public static saveVirtualWorkspace(ws: Workspace): void {
    if (!ws.isVirtual) return;
    try {
      if (typeof localStorage === 'undefined') return;
      const filesObj: Record<string, string> = {};
      for (const [k, v] of ws.files.entries()) {
        filesObj[k] = v;
      }
      const data = {
        id: ws.id,
        name: ws.name,
        path: ws.path,
        files: filesObj,
      };
      localStorage.setItem(this.VIRTUAL_WS_PREFIX + ws.id, JSON.stringify(data));
    } catch {
      // Ignore quota errors
    }
  }

  /**
   * Builds a hierarchical tree structure from flat file map.
   */
  public static buildFileTree(files: Map<string, string>): WorkspaceFileItem[] {
    const rootItems: WorkspaceFileItem[] = [];
    const dirMap = new Map<string, WorkspaceFileItem>();

    // Helper to get or create folder node
    function getOrCreateDir(dirPath: string): WorkspaceFileItem {
      if (dirMap.has(dirPath)) return dirMap.get(dirPath)!;

      const parts = dirPath.split('/');
      const name = parts[parts.length - 1];
      const node: WorkspaceFileItem = {
        name,
        path: dirPath,
        isDirectory: true,
        children: [],
      };
      dirMap.set(dirPath, node);

      if (parts.length === 1) {
        rootItems.push(node);
      } else {
        const parentPath = parts.slice(0, -1).join('/');
        const parent = getOrCreateDir(parentPath);
        parent.children = parent.children || [];
        parent.children.push(node);
      }
      return node;
    }

    // Sort paths alphabetically
    const sortedPaths = Array.from(files.keys()).sort();

    for (const filePath of sortedPaths) {
      const parts = filePath.split('/');
      const fileName = parts[parts.length - 1];
      const content = files.get(filePath);

      const fileItem: WorkspaceFileItem = {
        name: fileName,
        path: filePath,
        isDirectory: false,
        content,
      };

      if (parts.length === 1) {
        rootItems.push(fileItem);
      } else {
        const parentDir = parts.slice(0, -1).join('/');
        const dirNode = getOrCreateDir(parentDir);
        dirNode.children = dirNode.children || [];
        dirNode.children.push(fileItem);
      }
    }

    // Sort items: folders first, then files alphabetically
    function sortTree(items: WorkspaceFileItem[]) {
      items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      for (const item of items) {
        if (item.children) {
          sortTree(item.children);
        }
      }
    }

    sortTree(rootItems);
    return rootItems;
  }

  // --- CRUD File Operations ---

  public static async createFile(ws: Workspace, filePath: string, content: string = ''): Promise<boolean> {
    const cleanPath = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const normalized = cleanPath.endsWith('.ax') ? cleanPath : cleanPath + '.ax';

    ws.files.set(normalized, content);

    if (ws.handle && !ws.isVirtual) {
      try {
        const parts = normalized.split('/');
        let currentDir = ws.handle;
        for (let i = 0; i < parts.length - 1; i++) {
          currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true });
        }
        const fileHandle = await currentDir.getFileHandle(parts[parts.length - 1], { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
      } catch (e) {
        console.warn('Physical file creation error:', e);
      }
    }

    if (ws.isVirtual) {
      this.saveVirtualWorkspace(ws);
    }

    this.notifyChange(ws);
    return true;
  }

  public static async createFolder(ws: Workspace, folderPath: string): Promise<boolean> {
    const cleanPath = folderPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!cleanPath) return false;

    if (ws.handle && !ws.isVirtual) {
      try {
        const parts = cleanPath.split('/');
        let currentDir = ws.handle;
        for (const p of parts) {
          currentDir = await currentDir.getDirectoryHandle(p, { create: true });
        }
      } catch (e) {
        console.warn('Physical folder creation error:', e);
      }
    }

    // For virtual workspaces, creating an empty folder can be represented by a dummy placeholder or recorded in files
    const placeholder = `${cleanPath}/.keep`;
    if (!ws.files.has(placeholder)) {
      ws.files.set(placeholder, '');
    }

    if (ws.isVirtual) {
      this.saveVirtualWorkspace(ws);
    }

    this.notifyChange(ws);
    return true;
  }

  public static async renameItem(ws: Workspace, oldPath: string, newPath: string): Promise<boolean> {
    const cleanOld = oldPath.replace(/\\/g, '/');
    const cleanNew = newPath.replace(/\\/g, '/');

    const entriesToUpdate: [string, string][] = [];
    for (const [k, v] of ws.files.entries()) {
      if (k === cleanOld) {
        entriesToUpdate.push([k, v]);
      } else if (k.startsWith(cleanOld + '/')) {
        entriesToUpdate.push([k, v]);
      }
    }

    if (entriesToUpdate.length === 0) return false;

    for (const [k, v] of entriesToUpdate) {
      ws.files.delete(k);
      const replacedPath = k === cleanOld ? cleanNew : cleanNew + k.substring(cleanOld.length);
      ws.files.set(replacedPath, v);
    }

    if (ws.isVirtual) {
      this.saveVirtualWorkspace(ws);
    }

    this.notifyChange(ws);
    return true;
  }

  public static async deleteItem(ws: Workspace, itemPath: string): Promise<boolean> {
    const cleanPath = itemPath.replace(/\\/g, '/');

    const keysToDelete: string[] = [];
    for (const k of ws.files.keys()) {
      if (k === cleanPath || k.startsWith(cleanPath + '/')) {
        keysToDelete.push(k);
      }
    }

    if (keysToDelete.length === 0) return false;

    for (const k of keysToDelete) {
      ws.files.delete(k);
    }

    if (ws.isVirtual) {
      this.saveVirtualWorkspace(ws);
    }

    this.notifyChange(ws);
    return true;
  }

  public static async readFile(ws: Workspace, filePath: string): Promise<string | null> {
    const clean = filePath.replace(/\\/g, '/');
    if (ws.files.has(clean)) {
      return ws.files.get(clean)!;
    }
    const withAx = clean.endsWith('.ax') ? clean : clean + '.ax';
    if (ws.files.has(withAx)) {
      return ws.files.get(withAx)!;
    }
    return null;
  }

  public static async writeFile(ws: Workspace, filePath: string, content: string): Promise<boolean> {
    const clean = filePath.replace(/\\/g, '/');
    ws.files.set(clean, content);

    if (ws.handle && !ws.isVirtual) {
      try {
        if (typeof ws.handle.createWritable === 'function') {
          // Direct file handle (synthetic single-file workspace)
          const writable = await ws.handle.createWritable();
          await writable.write(content);
          await writable.close();
        } else if (typeof ws.handle.getDirectoryHandle === 'function' || typeof ws.handle.getFileHandle === 'function') {
          const parts = clean.split('/');
          let currentDir = ws.handle;
          for (let i = 0; i < parts.length - 1; i++) {
            currentDir = await currentDir.getDirectoryHandle(parts[i], { create: true });
          }
          const fileHandle = await currentDir.getFileHandle(parts[parts.length - 1], { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(content);
          await writable.close();
        }
      } catch (e) {
        console.warn('Physical file write error:', e);
      }
    }

    if (ws.isVirtual) {
      this.saveVirtualWorkspace(ws);
    }

    this.notifyChange(ws);
    return true;
  }
}
