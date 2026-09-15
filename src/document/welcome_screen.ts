/**
 * Welcome Screen Component
 * 
 * Displayed on launch when no workspace is active.
 * Shows:
 *  - the logo
 *  - recent workspaces, most recent first
 *  - Open Folder
 *  - New Document
 *  - link to documentation at axine.org/documentation
 * 
 * Strict VOICE.md & DESIGN.md adherence: informative, exact, unhurried, no cheer, no tips.
 */

import { WorkspaceManager, RecentWorkspace } from './workspace';
import { ICONS } from '../styles/icons';

export interface WelcomeScreenOptions {
  onOpenFolder: () => Promise<void>;
  onOpenFile?: () => Promise<void> | void;
  onNewDocument: () => void;
  onOpenRecent: (recent: RecentWorkspace) => Promise<void>;
}

export class WelcomeScreen {
  private container: HTMLElement;
  private options: WelcomeScreenOptions;
  private element: HTMLElement | null = null;

  constructor(container: HTMLElement, options: WelcomeScreenOptions) {
    this.container = container;
    this.options = options;
  }

  public render(): void {
    this.container.innerHTML = '';

    const root = document.createElement('div');
    root.className = 'axine-welcome-screen';
    this.element = root;

    const inner = document.createElement('div');
    inner.className = 'axine-welcome-inner';

    // 1. Logo and Header
    const brandHeader = document.createElement('div');
    brandHeader.className = 'axine-welcome-brand';

    const logo = document.createElement('img');
    logo.src = '/logo.png';
    logo.alt = 'Axine';
    logo.className = 'axine-welcome-logo';

    const title = document.createElement('div');
    title.className = 'axine-welcome-title';
    title.textContent = 'Axine';

    brandHeader.appendChild(logo);
    brandHeader.appendChild(title);
    inner.appendChild(brandHeader);

    // 2. Main Content Grid: Recent Workspaces & Actions
    const contentGrid = document.createElement('div');
    contentGrid.className = 'axine-welcome-grid';

    // Left Column: Recent Workspaces
    const recentCol = document.createElement('div');
    recentCol.className = 'axine-welcome-recents-col';

    const recentHeader = document.createElement('div');
    recentHeader.className = 'axine-welcome-section-title';
    recentHeader.textContent = 'Recent workspaces';
    recentCol.appendChild(recentHeader);

    const recents = WorkspaceManager.getRecentWorkspaces();
    const recentsList = document.createElement('div');
    recentsList.className = 'axine-welcome-recents-list';

    if (recents.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.className = 'axine-welcome-empty';
      emptyItem.textContent = 'No recent workspaces';
      recentsList.appendChild(emptyItem);
    } else {
      recents.forEach(rec => {
        const item = document.createElement('button');
        item.className = 'axine-welcome-recent-item';

        const mainInfo = document.createElement('div');
        mainInfo.className = 'axine-welcome-recent-main';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'axine-welcome-recent-name';
        nameSpan.textContent = rec.name;

        const pathSpan = document.createElement('span');
        pathSpan.className = 'axine-welcome-recent-path';
        pathSpan.textContent = rec.path || (rec.isVirtual ? 'Virtual workspace' : '');

        mainInfo.appendChild(nameSpan);
        if (rec.path) mainInfo.appendChild(pathSpan);

        const timeSpan = document.createElement('span');
        timeSpan.className = 'axine-welcome-recent-time';
        timeSpan.textContent = this.formatTimestamp(rec.lastOpened);

        item.appendChild(mainInfo);
        item.appendChild(timeSpan);

        item.onclick = () => {
          this.options.onOpenRecent(rec);
        };

        recentsList.appendChild(item);
      });
    }

    recentCol.appendChild(recentsList);
    contentGrid.appendChild(recentCol);

    // Right Column: Actions
    const actionCol = document.createElement('div');
    actionCol.className = 'axine-welcome-actions-col';

    const actionHeader = document.createElement('div');
    actionHeader.className = 'axine-welcome-section-title';
    actionHeader.textContent = 'Start';
    actionCol.appendChild(actionHeader);

    const actionsList = document.createElement('div');
    actionsList.className = 'axine-welcome-actions-list';

    const openFolderBtn = document.createElement('button');
    openFolderBtn.className = 'axine-welcome-action-btn';
    openFolderBtn.id = 'welcome-open-folder-btn';
    openFolderBtn.innerHTML = `
      <span class="axine-welcome-btn-icon">${ICONS.open || ''}</span>
      <span class="axine-welcome-btn-label">Open Folder</span>
    `;
    openFolderBtn.onclick = () => {
      this.options.onOpenFolder();
    };
    actionsList.appendChild(openFolderBtn);

    const openFileBtn = document.createElement('button');
    openFileBtn.className = 'axine-welcome-action-btn';
    openFileBtn.id = 'welcome-open-file-btn';
    openFileBtn.innerHTML = `
      <span class="axine-welcome-btn-icon">${ICONS.open || ''}</span>
      <span class="axine-welcome-btn-label">Open File</span>
    `;
    openFileBtn.onclick = () => {
      this.options.onOpenFile?.();
    };
    actionsList.appendChild(openFileBtn);

    const newDocBtn = document.createElement('button');
    newDocBtn.className = 'axine-welcome-action-btn';
    newDocBtn.id = 'welcome-new-doc-btn';
    newDocBtn.innerHTML = `
      <span class="axine-welcome-btn-icon">${ICONS.newFile || ''}</span>
      <span class="axine-welcome-btn-label">New Document</span>
    `;
    newDocBtn.onclick = () => {
      this.options.onNewDocument();
    };
    actionsList.appendChild(newDocBtn);

    actionCol.appendChild(actionsList);
    contentGrid.appendChild(actionCol);

    inner.appendChild(contentGrid);

    // 3. Documentation Link Footer
    const footer = document.createElement('div');
    footer.className = 'axine-welcome-footer';

    const docLink = document.createElement('a');
    docLink.className = 'axine-welcome-doc-link';
    docLink.href = 'https://axine.org/documentation';
    docLink.target = '_blank';
    docLink.rel = 'noopener noreferrer';
    docLink.textContent = 'axine.org/documentation';

    footer.appendChild(docLink);
    inner.appendChild(footer);

    root.appendChild(inner);
    this.container.appendChild(root);
  }

  private formatTimestamp(ts: number): string {
    const diffMs = Date.now() - ts;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(ts).toLocaleDateString();
  }

  public dispose(): void {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
      this.element = null;
    }
  }
}
