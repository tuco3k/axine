// File Management: File System Access API with download/upload fallback, autosave, recent files

export interface RecentFileItem {
  name: string;
  lastOpened: number;
}

export interface AutosaveData {
  fileName: string;
  content: string;
  timestamp: number;
}

export interface OpenFileResult {
  name: string;
  content: string;
  handle?: FileSystemFileHandle;
  isDirty: boolean;
  recovered?: boolean;
}

export interface SaveFileResult {
  success: boolean;
  name: string;
  handle?: FileSystemFileHandle;
  isDirty: boolean;
  apiUsed: 'file-system-access' | 'download-fallback';
}

export class FileManager {
  private static RECENT_FILES_KEY = 'axine_recent_files';
  private static AUTOSAVE_PREFIX = 'axine_autosave_';

  public static isFileSystemAccessSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof (window as any).showOpenFilePicker === 'function' &&
      typeof (window as any).showSaveFilePicker === 'function'
    );
  }

  public static getRecentFiles(): RecentFileItem[] {
    try {
      if (typeof localStorage === 'undefined') return [];
      const data = localStorage.getItem(this.RECENT_FILES_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  public static addRecentFile(name: string): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const recents = this.getRecentFiles().filter(item => item.name !== name);
      recents.unshift({ name, lastOpened: Date.now() });
      localStorage.setItem(this.RECENT_FILES_KEY, JSON.stringify(recents.slice(0, 10)));
    } catch {
      // Ignore storage errors
    }
  }

  public static clearRecentFiles(): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(this.RECENT_FILES_KEY);
      }
    } catch {
      // Ignore
    }
  }

  public static getAutosave(fileName: string): AutosaveData | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(this.AUTOSAVE_PREFIX + fileName);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data && typeof data.content === 'string' && typeof data.timestamp === 'number') {
        return data;
      }
      return null;
    } catch {
      return null;
    }
  }

  public static saveAutosave(fileName: string, content: string): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const data: AutosaveData = {
        fileName,
        content,
        timestamp: Date.now(),
      };
      localStorage.setItem(this.AUTOSAVE_PREFIX + fileName, JSON.stringify(data));
    } catch {
      // Ignore quota errors
    }
  }

  public static clearAutosave(fileName: string): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.removeItem(this.AUTOSAVE_PREFIX + fileName);
    } catch {
      // Ignore
    }
  }

  public static async openFile(
    promptRecovery: (autosave: AutosaveData, fileDate: Date) => Promise<boolean> = async (as, fd) => {
      if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        return window.confirm(
          `A newer autosave from ${new Date(as.timestamp).toLocaleString()} was found for "${as.fileName}".\n\nDisk file date: ${fd.toLocaleString()}.\n\nWould you like to recover the unsaved autosave?`
        );
      }
      return false;
    }
  ): Promise<OpenFileResult | null> {
    if (this.isFileSystemAccessSupported()) {
      return this.openWithFileSystemAccess(promptRecovery);
    } else {
      return this.openWithFallback(promptRecovery);
    }
  }

  private static async openWithFileSystemAccess(
    promptRecovery: (autosave: AutosaveData, fileDate: Date) => Promise<boolean>
  ): Promise<OpenFileResult | null> {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [
          {
            description: 'Axine Document (*.ax)',
            accept: {
              'text/plain': ['.ax', '.axine', '.math', '.txt'],
            },
          },
        ],
        multiple: false,
      });

      if (!handle) return null;
      const file: File = await handle.getFile();
      const content = await file.text();
      const name = file.name || handle.name;

      this.addRecentFile(name);

      // Check autosave backstop
      const autosave = this.getAutosave(name);
      if (autosave && autosave.timestamp > file.lastModified && autosave.content !== content) {
        const shouldRecover = await promptRecovery(autosave, new Date(file.lastModified));
        if (shouldRecover) {
          return {
            name,
            content: autosave.content,
            handle,
            isDirty: true,
            recovered: true,
          };
        }
      }

      return {
        name,
        content,
        handle,
        isDirty: false,
        recovered: false,
      };
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return null; // User cancelled picker
      }
      console.warn('File System Access open failed, falling back to file input', err);
      return this.openWithFallback(promptRecovery);
    }
  }

  private static async openWithFallback(
    promptRecovery: (autosave: AutosaveData, fileDate: Date) => Promise<boolean>
  ): Promise<OpenFileResult | null> {
    return new Promise<OpenFileResult | null>((resolve) => {
      if (typeof document === 'undefined') {
        resolve(null);
        return;
      }

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.ax,.axine,.math,.txt';
      input.style.display = 'none';

      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }

        const reader = new FileReader();
        reader.onload = async () => {
          const content = String(reader.result || '');
          const name = file.name;
          FileManager.addRecentFile(name);

          const autosave = FileManager.getAutosave(name);
          if (autosave && autosave.timestamp > file.lastModified && autosave.content !== content) {
            const shouldRecover = await promptRecovery(autosave, new Date(file.lastModified));
            if (shouldRecover) {
              resolve({
                name,
                content: autosave.content,
                isDirty: true,
                recovered: true,
              });
              return;
            }
          }

          resolve({
            name,
            content,
            isDirty: false,
            recovered: false,
          });
        };
        reader.onerror = () => resolve(null);
        reader.readAsText(file);
      };

      document.body.appendChild(input);
      input.click();
      setTimeout(() => {
        if (input.parentNode) input.parentNode.removeChild(input);
      }, 60000);
    });
  }

  public static async saveFile(
    fileName: string,
    content: string,
    handle?: FileSystemFileHandle
  ): Promise<SaveFileResult> {
    if (handle && this.isFileSystemAccessSupported()) {
      try {
        const writable = await (handle as any).createWritable();
        await writable.write(content);
        await writable.close();
        this.clearAutosave(fileName);
        this.addRecentFile(fileName);
        return {
          success: true,
          name: fileName,
          handle,
          isDirty: false,
          apiUsed: 'file-system-access',
        };
      } catch (err) {
        console.warn('Writing to file handle failed, prompting Save As', err);
        return this.saveFileAs(fileName, content);
      }
    } else {
      return this.saveFileAs(fileName, content);
    }
  }

  public static async saveFileAs(
    defaultName: string,
    content: string
  ): Promise<SaveFileResult> {
    const suggestedName = defaultName.endsWith('.ax') ? defaultName : defaultName + '.ax';

    if (this.isFileSystemAccessSupported()) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName,
          types: [
            {
              description: 'Axine Document (*.ax)',
              accept: {
                'text/plain': ['.ax', '.axine', '.math', '.txt'],
              },
            },
          ],
        });

        if (!handle) {
          return {
            success: false,
            name: suggestedName,
            isDirty: true,
            apiUsed: 'file-system-access',
          };
        }

        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();

        const name = handle.name || suggestedName;
        this.clearAutosave(name);
        this.addRecentFile(name);

        return {
          success: true,
          name,
          handle,
          isDirty: false,
          apiUsed: 'file-system-access',
        };
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          return {
            success: false,
            name: suggestedName,
            isDirty: true,
            apiUsed: 'file-system-access',
          };
        }
        console.warn('File System Access save picker failed, falling back to download', err);
        return this.saveWithDownloadFallback(suggestedName, content);
      }
    } else {
      return this.saveWithDownloadFallback(suggestedName, content);
    }
  }

  private static saveWithDownloadFallback(fileName: string, content: string): SaveFileResult {
    if (typeof document === 'undefined') {
      return {
        success: false,
        name: fileName,
        isDirty: true,
        apiUsed: 'download-fallback',
      };
    }

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 1000);

    this.clearAutosave(fileName);
    this.addRecentFile(fileName);

    return {
      success: true,
      name: fileName,
      isDirty: false,
      apiUsed: 'download-fallback',
    };
  }
}
