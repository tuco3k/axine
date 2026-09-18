/**
 * Autocomplete controller for Axine commands and mathematical symbols.
 *
 * Rules:
 * 1. Incomplete commands stay literal: typing \fo shows \fo.
 * 2. Autocomplete lists matching commands; ArrowUp/ArrowDown selects; Tab/Enter accepts.
 * 3. Rendering happens only after acceptance.
 */

export interface AutocompleteItem {
  command: string;
  glyph?: string;
  label: string;
  category: "math" | "keyword" | "construct";
}

export const AUTOCOMPLETE_COMMANDS: AutocompleteItem[] = [
  // Logic & Sets
  { command: "\\forall", glyph: "\u2200", label: "for all", category: "math" },
  { command: "\\exists", glyph: "\u2203", label: "there exists", category: "math" },
  { command: "\\in", glyph: "\u2208", label: "element of", category: "math" },
  { command: "\\notin", glyph: "\u2209", label: "not element of", category: "math" },
  { command: "\\subset", glyph: "\u2282", label: "subset", category: "math" },
  { command: "\\subseteq", glyph: "\u2286", label: "subset or equal", category: "math" },
  { command: "\\cup", glyph: "\u222a", label: "union", category: "math" },
  { command: "\\cap", glyph: "\u2229", label: "intersection", category: "math" },
  { command: "\\set", label: "set builder", category: "construct" },

  // Relations & Comparison
  { command: "\\le", glyph: "\u2264", label: "less than or equal", category: "math" },
  { command: "\\ge", glyph: "\u2265", label: "greater than or equal", category: "math" },
  { command: "\\ne", glyph: "\u2260", label: "not equal", category: "math" },
  { command: "\\approx", glyph: "\u2248", label: "approximately", category: "math" },
  { command: "\\propto", glyph: "\u221d", label: "proportional to", category: "math" },

  // Arithmetic & Calculus
  { command: "\\sqrt", glyph: "\u221a", label: "square root", category: "math" },
  { command: "\\times", glyph: "\u00d7", label: "multiplication cross", category: "math" },
  { command: "\\cdot", glyph: "\u00b7", label: "centered dot", category: "math" },
  { command: "\\pm", glyph: "\u00b1", label: "plus-minus", category: "math" },
  { command: "\\mp", glyph: "\u2213", label: "minus-plus", category: "math" },
  { command: "\\" + "int", glyph: "\u222b", label: "integral", category: "math" },
  { command: "\\iint", glyph: "\u222c", label: "double integral", category: "math" },
  { command: "\\iiint", glyph: "\u222d", label: "triple integral", category: "math" },
  { command: "\\oint", glyph: "\u222e", label: "contour integral", category: "math" },
  { command: "\\" + "partial", glyph: "\u2202", label: "partial derivative", category: "math" },
  { command: "\\nabla", glyph: "\u2207", label: "nabla / del", category: "math" },
  { command: "\\" + "infty", glyph: "\u221e", label: "infinity", category: "math" },

  // Greek Letters
  { command: "\\pi", glyph: "\u03c0", label: "pi", category: "math" },
  { command: "\\tau", glyph: "\u03c4", label: "tau", category: "math" },
  { command: "\\theta", glyph: "\u03b8", label: "theta", category: "math" },
  { command: "\\lambda", glyph: "\u03bb", label: "lambda", category: "math" },
  { command: "\\alpha", glyph: "\u03b1", label: "alpha", category: "math" },
  { command: "\\beta", glyph: "\u03b2", label: "beta", category: "math" },
  { command: "\\gamma", glyph: "\u03b3", label: "gamma", category: "math" },
  { command: "\\delta", glyph: "\u03b4", label: "delta", category: "math" },
  { command: "\\sigma", glyph: "\u03c3", label: "sigma", category: "math" },
  { command: "\\omega", glyph: "\u03c9", label: "omega", category: "math" },
  { command: "\\mu", glyph: "\u03bc", label: "mu", category: "math" },
  { command: "\\phi", glyph: "\u03d5", label: "phi", category: "math" },
  { command: "\\" + "Delta", glyph: "\u0394", label: "Delta", category: "math" },
  { command: "\\Sigma", glyph: "\u03a3", label: "Sigma", category: "math" },
  { command: "\\Pi", glyph: "\u03a0", label: "Pi", category: "math" },

  // Logic Connectives & Brackets
  { command: "\\wedge", glyph: "\u2227", label: "logical and", category: "math" },
  { command: "\\vee", glyph: "\u2228", label: "logical or", category: "math" },
  { command: "\\neg", glyph: "\u00ac", label: "logical not", category: "math" },
  { command: "\\lfloor", glyph: "\u230a", label: "left floor", category: "math" },
  { command: "\\rfloor", glyph: "\u230b", label: "right floor", category: "math" },
  { command: "\\lceil", glyph: "\u2308", label: "left ceiling", category: "math" },
  { command: "\\rceil", glyph: "\u2309", label: "right ceiling", category: "math" },
  { command: "\\otimes", glyph: "\u2297", label: "tensor product", category: "math" },
  { command: "\\oplus", glyph: "\u2295", label: "direct sum", category: "math" },

  // Language Keywords & Flow
  { command: "\\figure", label: "in-flow figure", category: "keyword" },
  { command: "\\derive", label: "equivalence derivation", category: "keyword" },
  { command: "\\axis", label: "coordinate space", category: "keyword" },
  { command: "\\match", label: "pattern match", category: "keyword" },
  { command: "\\case", label: "match case", category: "keyword" },
  { command: "\\otherwise", label: "fallback case", category: "keyword" },
  { command: "\\quote", label: "quote expression AST", category: "keyword" },
  { command: "\\build", label: "build expression AST", category: "keyword" },
  { command: "\\list", label: "list collection", category: "construct" },
  { command: "\\tuple", label: "tuple construct", category: "construct" },
  { command: "\\if", label: "conditional if", category: "keyword" },
  { command: "\\then", label: "conditional then", category: "keyword" },
  { command: "\\else", label: "conditional else", category: "keyword" },
  { command: "\\with", label: "with block", category: "keyword" },
  { command: "\\where", label: "where clause", category: "keyword" },
];

export function findMatchingCommands(prefix: string): AutocompleteItem[] {
  if (!prefix.startsWith("\\")) return [];
  const lower = prefix.toLowerCase();
  return AUTOCOMPLETE_COMMANDS.filter(cmd => cmd.command.toLowerCase().startsWith(lower));
}

export interface AutocompleteTarget {
  getValue(): string;
  setValue(val: string): void;
  getSelectionStart(): number;
  setSelection(start: number, end: number): void;
  getCaretCoordinates?(): { x: number; y: number };
}

export class AutocompleteController {
  private popoverEl: HTMLElement | null = null;
  private matches: AutocompleteItem[] = [];
  private selectedIndex: number = 0;
  private prefixStart: number = -1;
  private prefixText: string = "";
  private isOpen: boolean = false;
  private container: HTMLElement;
  private onAcceptCallback?: (acceptedCommand: string) => void;

  constructor(container: HTMLElement, onAccept?: (cmd: string) => void) {
    this.container = container;
    this.onAcceptCallback = onAccept;
    this.createPopover();
  }

  private createPopover() {
    if (typeof document === "undefined" || !this.container) return;
    this.popoverEl = document.createElement("div");
    this.popoverEl.className = "doc-autocomplete-popover hidden";
    this.container.appendChild(this.popoverEl);
  }

  public getIsOpen(): boolean {
    return this.isOpen;
  }

  public getMatches(): AutocompleteItem[] {
    return this.matches;
  }

  public getSelectedIndex(): number {
    return this.selectedIndex;
  }

  public checkPrefix(target: AutocompleteTarget): boolean {
    const text = target.getValue();
    const caret = target.getSelectionStart();
    const textBefore = text.substring(0, caret);

    // Match trailing backslash command: \\([a-zA-Z]*)$
    const match = textBefore.match(/(\\[a-zA-Z]*)$/);
    if (!match) {
      this.close();
      return false;
    }

    this.prefixText = match[1];
    this.prefixStart = caret - this.prefixText.length;
    this.matches = findMatchingCommands(this.prefixText);

    if (this.matches.length === 0) {
      this.close();
      return false;
    }

    this.selectedIndex = 0;
    this.open(target);
    return true;
  }

  public open(target: AutocompleteTarget) {
    this.isOpen = true;
    if (this.popoverEl) {
      this.renderPopover();

      if (target.getCaretCoordinates) {
        const coords = target.getCaretCoordinates();
        this.popoverEl.style.left = coords.x + "px";
        this.popoverEl.style.top = (coords.y + 24) + "px";
      }

      this.popoverEl.classList.remove("hidden");
    }
  }

  public close() {
    this.isOpen = false;
    this.matches = [];
    this.selectedIndex = 0;
    if (this.popoverEl) {
      this.popoverEl.classList.add("hidden");
    }
  }

  private renderPopover() {
    if (!this.popoverEl) return;
    this.popoverEl.innerHTML = "";

    const maxItems = Math.min(8, this.matches.length);
    for (let i = 0; i < maxItems; i++) {
      const item = this.matches[i];
      const row = document.createElement("div");
      row.className = "doc-autocomplete-item" + (i === this.selectedIndex ? " active" : "");
      row.setAttribute("data-index", i.toString());

      if (item.glyph) {
        const glyphSpan = document.createElement("span");
        glyphSpan.className = "doc-autocomplete-glyph";
        glyphSpan.textContent = item.glyph;
        row.appendChild(glyphSpan);
      }

      const cmdSpan = document.createElement("span");
      cmdSpan.className = "doc-autocomplete-cmd";
      cmdSpan.textContent = item.command;
      row.appendChild(cmdSpan);

      const labelSpan = document.createElement("span");
      labelSpan.className = "doc-autocomplete-label";
      labelSpan.textContent = item.label;
      row.appendChild(labelSpan);

      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.selectedIndex = i;
      });

      this.popoverEl.appendChild(row);
    }
  }

  public handleKeydown(e: KeyboardEvent, target: AutocompleteTarget): boolean {
    if (!this.isOpen) return false;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      this.selectedIndex = (this.selectedIndex + 1) % this.matches.length;
      this.renderPopover();
      return true;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      this.selectedIndex = (this.selectedIndex - 1 + this.matches.length) % this.matches.length;
      this.renderPopover();
      return true;
    }

    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      this.accept(target);
      return true;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      this.close();
      return true;
    }

    return false;
  }

  public accept(target: AutocompleteTarget): boolean {
    if (!this.isOpen || this.matches.length === 0) return false;
    const selected = this.matches[this.selectedIndex];
    if (!selected) return false;

    const text = target.getValue();
    const caret = target.getSelectionStart();

    // Replace prefix with completed command
    const before = text.substring(0, this.prefixStart);
    const after = text.substring(caret);
    const replacement = selected.command;

    target.setValue(before + replacement + after);
    const newCaret = this.prefixStart + replacement.length;
    target.setSelection(newCaret, newCaret);

    this.close();
    if (this.onAcceptCallback) {
      this.onAcceptCallback(replacement);
    }
    return true;
  }

  public dispose() {
    if (this.popoverEl && this.popoverEl.parentElement) {
      this.popoverEl.parentElement.removeChild(this.popoverEl);
      this.popoverEl = null;
    }
  }
}
