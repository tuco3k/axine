import { NotebookState } from './state';
import { CellView } from './cell';
import { NotebookStorage } from './storage';
import { ICONS } from '../styles/icons';

export class NotebookApp {
  private state: NotebookState;
  private root: HTMLElement;
  private currentDocId: string;

  constructor(root: HTMLElement) {
    this.root = root;
    this.state = new NotebookState();
    this.currentDocId = NotebookStorage.getLastActiveId() || 'default_doc';

    this.init();
  }

  private init(): void {
    // Try loading saved document, or initialize with default tutorial cells
    const loaded = NotebookStorage.loadDocument(this.currentDocId, this.state);
    if (!loaded) {
      this.populateDefaultNotebook();
    }

    this.render();
    this.state.subscribe(() => this.renderCellsOnly());
  }

  private populateDefaultNotebook(): void {
    this.state.title = 'Math Notation Notebook';
    this.state.cells = [
      { id: 'c1', source: '# Exact Rational Arithmetic (1/3 + 1/3 + 1/3 = 1)\n1/3 + 1/3 + 1/3' },
      { id: 'c2', source: '# Ambiguity Resolution Rules\nx := 5\n2x' },
      { id: 'c3', source: 'f(t) := t^2 + 1\nf(x+1)' },
      { id: 'c4', source: '2^3^2' },
      { id: 'c5', source: '-x^2' },
      { id: 'c6', source: '# 2D Adaptive Curve Plot with Asymptote Breaking\ngraph(tan x, x in -5..5)' },
      { id: 'c7', source: '# Multi-series with Shared Horizontal Axis\ngraph(2x, y^2, ln z)' },
      { id: 'c8', source: '# Parametric Curve\ngraph((cos t, sin t), t in 0..tau)' },
      { id: 'c9', source: '# 2D Scalar Field (Heatmap & 3D Surface)\ngraph(sin x cos y, x in -5..5, y in -5..5)' },
    ];
    this.state.recomputeAll();
  }

  public render(): void {
    this.root.innerHTML = '';

    // Main App Layout
    const appContainer = document.createElement('div');
    appContainer.className = 'app-layout';

    // Dense Top Bar
    const topBar = document.createElement('header');
    topBar.className = 'top-bar';

    const titleInput = document.createElement('input');
    titleInput.className = 'doc-title-input';
    titleInput.value = this.state.title;
    titleInput.placeholder = 'Notebook Title';
    titleInput.oninput = () => {
      this.state.title = titleInput.value;
      NotebookStorage.saveDocument(this.currentDocId, this.state);
    };

    const toolbar = document.createElement('div');
    toolbar.className = 'top-toolbar';

    const btnRunAll = document.createElement('button');
    btnRunAll.className = 'tool-btn primary-btn';
    btnRunAll.innerHTML = `${ICONS.run} Run All`;
    btnRunAll.onclick = () => this.state.recomputeAll();

    const btnAddCell = document.createElement('button');
    btnAddCell.className = 'tool-btn';
    btnAddCell.textContent = '+ Add Cell';
    btnAddCell.onclick = () => this.state.addCell();

    const btnSave = document.createElement('button');
    btnSave.className = 'tool-btn';
    btnSave.innerHTML = `${ICONS.save} Save`;
    btnSave.onclick = () => {
      NotebookStorage.saveDocument(this.currentDocId, this.state);
      this.showToast('Saved to localStorage');
    };

    const btnExport = document.createElement('button');
    btnExport.className = 'tool-btn';
    btnExport.innerHTML = `${ICONS.export} Export`;
    btnExport.onclick = () => NotebookStorage.exportJSON(this.state);

    const importInput = document.createElement('input');
    importInput.type = 'file';
    importInput.accept = '.ax, .json';
    importInput.style.display = 'none';
    importInput.onchange = async () => {
      if (importInput.files && importInput.files[0]) {
        await NotebookStorage.importJSON(importInput.files[0], this.state);
        titleInput.value = this.state.title;
        this.showToast('Imported notebook');
      }
    };

    const btnImport = document.createElement('button');
    btnImport.className = 'tool-btn';
    btnImport.innerHTML = `${ICONS.import} Import`;
    btnImport.onclick = () => importInput.click();

    const btnClear = document.createElement('button');
    btnClear.className = 'tool-btn danger-btn';
    btnClear.textContent = 'Clear All';
    btnClear.onclick = () => {
      if (confirm('Clear all cells?')) {
        this.state.cells = [];
        this.state.addCell();
      }
    };

    toolbar.appendChild(btnRunAll);
    toolbar.appendChild(btnAddCell);
    toolbar.appendChild(btnSave);
    toolbar.appendChild(btnExport);
    toolbar.appendChild(btnImport);
    toolbar.appendChild(btnClear);
    toolbar.appendChild(importInput);

    topBar.appendChild(titleInput);
    topBar.appendChild(toolbar);
    appContainer.appendChild(topBar);

    // Main Cell Stream Container
    const cellsContainer = document.createElement('main');
    cellsContainer.id = 'cells-container';
    cellsContainer.className = 'cells-stream';
    appContainer.appendChild(cellsContainer);

    this.root.appendChild(appContainer);

    this.renderCellsOnly();
  }

  private renderCellsOnly(): void {
    const container = document.getElementById('cells-container');
    if (!container) return;

    container.innerHTML = '';
    for (const cell of this.state.cells) {
      const cellView = new CellView(cell, this.state);
      container.appendChild(cellView.element);
    }
  }

  private showToast(msg: string): void {
    const toast = document.createElement('div');
    toast.className = 'app-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }
}
