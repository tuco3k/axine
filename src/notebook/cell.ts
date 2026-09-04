import { NotebookCell, NotebookState } from './state';
import { formatAST } from '../core/formatter';
import { Value, SpaceValue } from '../core/types';
import { GraphPlotEngine, SpaceViewport } from '../plot/engine';
import { AutocompleteEngine, AutocompleteItem } from './autocomplete';
import { ICONS } from '../styles/icons';

export class CellView {
  public readonly element: HTMLElement;
  private readonly cell: NotebookCell;
  private readonly state: NotebookState;
  private textarea!: HTMLTextAreaElement;
  private autocompletePopup!: HTMLElement;
  private outputContainer!: HTMLElement;

  constructor(cell: NotebookCell, state: NotebookState) {
    this.cell = cell;
    this.state = state;
    this.element = document.createElement('div');
    this.element.className = 'notebook-cell';
    this.element.dataset.cellId = cell.id;

    this.render();
  }

  private render(): void {
    this.element.innerHTML = '';

    // Cell controls / gutter
    const cellHeader = document.createElement('div');
    cellHeader.className = 'cell-header';

    const cellLabel = document.createElement('span');
    cellLabel.className = 'cell-label';
    const cellIndex = this.state.cells.findIndex(c => c.id === this.cell.id) + 1;
    cellLabel.textContent = `[${cellIndex}]`;

    const cellToolbar = document.createElement('div');
    cellToolbar.className = 'cell-actions';

    const btnRun = document.createElement('button');
    btnRun.className = 'action-btn run-btn';
    btnRun.title = 'Run cell (Enter)';
    btnRun.innerHTML = `${ICONS.run} Run`;
    btnRun.onclick = () => this.state.runCell(this.cell.id);

    const btnAdd = document.createElement('button');
    btnAdd.className = 'action-btn';
    btnAdd.title = 'Add cell below';
    btnAdd.textContent = '+';
    btnAdd.onclick = () => this.state.addCell(this.cell.id);

    const btnUp = document.createElement('button');
    btnUp.className = 'action-btn';
    btnUp.title = 'Move up';
    btnUp.innerHTML = ICONS.up;
    btnUp.onclick = () => this.state.moveCell(this.cell.id, 'up');

    const btnDown = document.createElement('button');
    btnDown.className = 'action-btn';
    btnDown.title = 'Move down';
    btnDown.innerHTML = ICONS.down;
    btnDown.onclick = () => this.state.moveCell(this.cell.id, 'down');

    const btnDel = document.createElement('button');
    btnDel.className = 'action-btn del-btn';
    btnDel.title = 'Delete cell';
    btnDel.innerHTML = ICONS.close;
    btnDel.onclick = () => this.state.removeCell(this.cell.id);

    cellToolbar.appendChild(btnRun);
    cellToolbar.appendChild(btnAdd);
    cellToolbar.appendChild(btnUp);
    cellToolbar.appendChild(btnDown);
    cellToolbar.appendChild(btnDel);

    cellHeader.appendChild(cellLabel);
    cellHeader.appendChild(cellToolbar);
    this.element.appendChild(cellHeader);

    // Input editor
    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'cell-input-wrapper';

    this.textarea = document.createElement('textarea');
    this.textarea.className = 'cell-input';
    this.textarea.value = this.cell.source;
    this.textarea.placeholder = 'Enter math expression (e.g. 2x, 1/3 + 1/3 + 1/3, graph(sin x))';
    this.textarea.rows = 1;
    this.autoGrow(this.textarea);

    this.autocompletePopup = document.createElement('div');
    this.autocompletePopup.className = 'autocomplete-popup hidden';
    inputWrapper.appendChild(this.textarea);
    inputWrapper.appendChild(this.autocompletePopup);
    this.element.appendChild(inputWrapper);

    this.setupEditorEvents();

    // Output container
    this.outputContainer = document.createElement('div');
    this.outputContainer.className = 'cell-output';
    this.element.appendChild(this.outputContainer);

    this.renderOutput();
  }

  private setupEditorEvents(): void {
    this.textarea.addEventListener('input', () => {
      this.autoGrow(this.textarea);
      this.state.updateCellSource(this.cell.id, this.textarea.value);
      this.handleAutocomplete();
    });

    this.textarea.addEventListener('keydown', (e) => {
      // Enter evaluates, Shift+Enter inserts newline
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.hideAutocomplete();
        this.state.runCell(this.cell.id);
      } else if (e.key === 'Escape') {
        this.hideAutocomplete();
      }
    });

    this.textarea.addEventListener('blur', () => {
      setTimeout(() => this.hideAutocomplete(), 200);
    });
  }

  private handleAutocomplete(): void {
    const text = this.textarea.value;
    const pos = this.textarea.selectionStart;
    const leftText = text.slice(0, pos);
    const match = leftText.match(/([a-zA-Z0-9_]+)$/);

    if (!match || match[1].length < 1) {
      this.hideAutocomplete();
      return;
    }

    const prefix = match[1];
    const suggestions = AutocompleteEngine.getSuggestions(prefix, this.state.env);

    if (suggestions.length === 0) {
      this.hideAutocomplete();
      return;
    }

    this.showAutocomplete(suggestions, prefix, pos);
  }

  private showAutocomplete(suggestions: AutocompleteItem[], prefix: string, cursorOffset: number): void {
    this.autocompletePopup.innerHTML = '';
    this.autocompletePopup.classList.remove('hidden');

    for (const item of suggestions.slice(0, 8)) {
      const row = document.createElement('div');
      row.className = 'autocomplete-item';

      const nameEl = document.createElement('span');
      nameEl.className = 'item-name';
      nameEl.textContent = item.name;

      const kindEl = document.createElement('span');
      kindEl.className = `item-kind kind-${item.kind}`;
      kindEl.textContent = item.kind;

      row.appendChild(nameEl);
      row.appendChild(kindEl);

      row.onmousedown = (e) => {
        e.preventDefault();
        this.applyAutocomplete(item.name, prefix, cursorOffset);
      };

      this.autocompletePopup.appendChild(row);
    }
  }

  private applyAutocomplete(name: string, prefix: string, cursorOffset: number): void {
    const text = this.textarea.value;
    const before = text.slice(0, cursorOffset - prefix.length);
    const after = text.slice(cursorOffset);
    this.textarea.value = before + name + after;
    this.textarea.selectionStart = this.textarea.selectionEnd = before.length + name.length;
    this.state.updateCellSource(this.cell.id, this.textarea.value);
    this.hideAutocomplete();
    this.textarea.focus();
  }

  private hideAutocomplete(): void {
    this.autocompletePopup.classList.add('hidden');
    this.autocompletePopup.innerHTML = '';
  }

  private autoGrow(textarea: HTMLTextAreaElement): void {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(34, textarea.scrollHeight)}px`;
  }

  public renderOutput(): void {
    this.outputContainer.innerHTML = '';

    if (this.cell.error) {
      // Diagnostic error view with underlined source
      const errorBox = document.createElement('div');
      errorBox.className = 'error-display';

      const msg = document.createElement('div');
      msg.className = 'error-message';
      msg.textContent = `Error: ${this.cell.error.message}`;
      errorBox.appendChild(msg);

      // Underlined source code
      const formattedSnippet = this.cell.error.format(this.cell.source);
      const pre = document.createElement('pre');
      pre.className = 'error-code-snippet';
      pre.textContent = formattedSnippet;
      errorBox.appendChild(pre);

      this.outputContainer.appendChild(errorBox);
      return;
    }

    if (!this.cell.ast || this.cell.value === undefined) {
      return;
    }

    // 1. Normalized Parse Output
    const normalizedParse = formatAST(this.cell.ast);
    const normBox = document.createElement('div');
    normBox.className = 'output-row normalized-row';

    const normBadge = document.createElement('span');
    normBadge.className = 'output-badge badge-parse';
    normBadge.textContent = 'parsed';

    const normText = document.createElement('span');
    normText.className = 'output-content';
    normText.textContent = normalizedParse;

    normBox.appendChild(normBadge);
    normBox.appendChild(normText);
    this.outputContainer.appendChild(normBox);

    // 2. Evaluated Value Output
    const valBox = document.createElement('div');
    valBox.className = 'output-row value-row';

    const valBadge = document.createElement('span');
    valBadge.className = `output-badge badge-${this.cell.value.type}`;
    valBadge.textContent = this.cell.value.type;

    const valText = document.createElement('span');
    valText.className = 'output-content';
    valText.textContent = this.formatValue(this.cell.value);

    valBox.appendChild(valBadge);
    valBox.appendChild(valText);
    this.outputContainer.appendChild(valBox);

    // 3. Space View if SpaceValue or Graph View if GraphValue
    if (this.cell.value.type === 'space') {
      const spaceVal = this.cell.value as SpaceValue;
      if (spaceVal.dimension > 0 || spaceVal.entities.length > 0) {
        const spaceContainer = document.createElement('div');
        this.outputContainer.appendChild(spaceContainer);
        new SpaceViewport(spaceContainer, spaceVal);
      }
    } else if (this.cell.value.type === 'graph') {
      const graphContainer = document.createElement('div');
      this.outputContainer.appendChild(graphContainer);
      new GraphPlotEngine(graphContainer, this.cell.value.spec, this.state.env);
    }
  }

  private formatValue(val: Value): string {
    switch (val.type) {
      case 'space':
        return `${val.dimension}D Space (${val.coordinates.join(', ')})`;
      case 'rational':
        if (val.d === 1n) return `${val.n}`;
        return `${val.n}/${val.d}`;
      case 'float':
        return Number.isInteger(val.value) ? `${val.value}.0` : `${val.value}`;
      case 'boolean':
        return val.value ? 'true' : 'false';
      case 'tuple':
        return `(${val.elements.map((e: Value) => this.formatValue(e)).join(', ')})`;
      case 'range':
        return `${val.variable} in [${val.start}, ${val.end}]${val.step ? ` step ${val.step}` : ''}`;
      case 'function':
        return `function ${val.name}(${val.params.join(', ')})`;
      case 'list':
        return `[${val.elements.map((e: Value) => this.formatValue(e)).join(', ')}]`;
      case 'lambda':
        return `lambda (${val.params.join(', ')})`;
      case 'none':
        return 'none';
      case 'undefined':
        return 'undefined';
      case 'expression':
        return val.text;
      case 'builtin':
        return `builtin ${val.name}`;
      case 'graph':
        return `Plot: ${val.spec.kind}`;
      case 'kind':
        return `Kind: ${val.kind.name}`;
      case 'described':
        return `[Described: ${val.namedOperation || val.operation || 'unevaluable'}]`;
      case 'set_value':
        return val.standardName || `Set(${val.isInfinite ? 'infinite' : (val.elements ?? []).length})`;
      case 'record': {
        const fieldsStr = Object.entries(val.fields)
          .map(([k, v]) => `${k}: ${this.formatValue(v)}`)
          .join(', ');
        return `${val.typeName}(${fieldsStr})`;
      }
      case 'record_constructor':
        return `record ${val.name} { ${val.fieldNames.join(', ')} }`;
      case 'quantity':
        return `${this.formatValue(val.magnitude)} ${val.unit}`;
      case 'module': {
        const keys = Object.keys(val.exports);
        if (keys.length === 0) return `module ${val.name}`;
        return `module ${val.name} { ${keys.join(', ')} }`;
      }
      default:
        return String((val as any).value ?? (val as any).type);
    }
  }
}
