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
  description: string;
  category: "math" | "greek" | "keyword" | "construct";
}

export const AUTOCOMPLETE_COMMANDS: AutocompleteItem[] = [
  // Logic & Sets
  { command: "\\forall", glyph: "\u2200", label: "for all", description: "Universal quantifier: asserts predicate holds across domain", category: "math" },
  { command: "\\exists", glyph: "\u2203", label: "there exists", description: "Existential quantifier: asserts at least one satisfying element", category: "math" },
  { command: "\\in", glyph: "\u2208", label: "element of", description: "Set membership: tests if element belongs to set or list", category: "math" },
  { command: "\\notin", glyph: "\u2209", label: "not element of", description: "Non-membership: tests if element does not belong to set", category: "math" },
  { command: "\\subset", glyph: "\u2282", label: "subset", description: "Strict subset: elements strictly contained in target set", category: "math" },
  { command: "\\subseteq", glyph: "\u2286", label: "subset or equal", description: "Subset or equal: elements contained in or equal to target set", category: "math" },
  { command: "\\cup", glyph: "\u222a", label: "union", description: "Set union: combines elements from both collections", category: "math" },
  { command: "\\cap", glyph: "\u2229", label: "intersection", description: "Set intersection: common elements across both collections", category: "math" },
  { command: "\\set", label: "set builder", description: "Set builder: constructs mathematical set from predicate", category: "construct" },

  // Relations & Comparison
  { command: "\\le", glyph: "\u2264", label: "less than or equal", description: "Comparison: asserts left operand is less than or equal to right", category: "math" },
  { command: "\\ge", glyph: "\u2265", label: "greater than or equal", description: "Comparison: asserts left operand is greater than or equal to right", category: "math" },
  { command: "\\ne", glyph: "\u2260", label: "not equal", description: "Inequality: asserts operands are not numerically equal", category: "math" },
  { command: "\\approx", glyph: "\u2248", label: "approximately", description: "Approximation: asserts equivalence within numeric tolerance", category: "math" },
  { command: "\\propto", glyph: "\u221d", label: "proportional to", description: "Proportionality: asserts linear scaling relationship", category: "math" },

  // Arithmetic & Calculus
  { command: "\\sqrt", glyph: "\u221a", label: "square root", description: "Radical: principal square root operator", category: "math" },
  { command: "\\times", glyph: "\u00d7", label: "multiplication cross", description: "Multiplication: cross product or arithmetic times", category: "math" },
  { command: "\\cdot", glyph: "\u00b7", label: "centered dot", description: "Multiplication: scalar product or centered multiplication dot", category: "math" },
  { command: "\\pm", glyph: "\u00b1", label: "plus-minus", description: "Sign: plus or minus tolerance range", category: "math" },
  { command: "\\mp", glyph: "\u2213", label: "minus-plus", description: "Sign: inverted minus-plus operator", category: "math" },
  { command: "\\" + "int", glyph: "\u222b", label: "integral", description: "Calculus: continuous accumulation over a domain", category: "math" },
  { command: "\\iint", glyph: "\u222c", label: "double integral", description: "Calculus: 2D area integral over planar region", category: "math" },
  { command: "\\iiint", glyph: "\u222d", label: "triple integral", description: "Calculus: 3D volume integral over spatial region", category: "math" },
  { command: "\\oint", glyph: "\u222e", label: "contour integral", description: "Calculus: closed path contour line integral", category: "math" },
  { command: "\\" + "partial", glyph: "\u2202", label: "partial derivative", description: "Calculus: partial rate of change with respect to single variable", category: "math" },
  { command: "\\nabla", glyph: "\u2207", label: "nabla / del", description: "Calculus: spatial gradient vector differential operator", category: "math" },
  { command: "\\" + "infty", glyph: "\u221e", label: "infinity", description: "Quantity: mathematical unbounded infinity", category: "math" },

  // Greek Letters
  { command: "\\pi", glyph: "\u03c0", label: "pi", description: "Constant: ratio of circle circumference to diameter", category: "math" },
  { command: "\\tau", glyph: "\u03c4", label: "tau", description: "Constant: circle constant equal to 2*pi", category: "math" },
  { command: "\\theta", glyph: "\u03b8", label: "theta", description: "Variable: standard angular displacement coordinate", category: "math" },
  { command: "\\lambda", glyph: "\u03bb", label: "lambda", description: "Symbol: eigenvalue, wavelength, or anonymous function parameter", category: "math" },
  { command: "\\alpha", glyph: "\u03b1", label: "alpha", description: "Symbol: first Greek variable parameter", category: "math" },
  { command: "\\beta", glyph: "\u03b2", label: "beta", description: "Symbol: second Greek variable parameter", category: "math" },
  { command: "\\gamma", glyph: "\u03b3", label: "gamma", description: "Symbol: gamma scaling parameter or function", category: "math" },
  { command: "\\delta", glyph: "\u03b4", label: "delta", description: "Symbol: infinitesimal variation or Dirac delta function", category: "math" },
  { command: "\\sigma", glyph: "\u03c3", label: "sigma", description: "Symbol: standard deviation or stress parameter", category: "math" },
  { command: "\\omega", glyph: "\u03c9", label: "omega", description: "Symbol: angular frequency parameter", category: "math" },
  { command: "\\mu", glyph: "\u03bc", label: "mu", description: "Symbol: arithmetic mean or friction coefficient", category: "math" },
  { command: "\\phi", glyph: "\u03d5", label: "phi", description: "Symbol: azimuthal phase angle or golden ratio", category: "math" },
  { command: "\\" + "Delta", glyph: "\u0394", label: "Delta", description: "Operator: discrete macroscopic finite difference", category: "math" },
  { command: "\\Sigma", glyph: "\u03a3", label: "Sigma", description: "Operator: sum over indexed sequence", category: "math" },
  { command: "\\Pi", glyph: "\u03a0", label: "Pi", description: "Operator: product over indexed sequence", category: "math" },

  // Logic Connectives & Brackets
  { command: "\\wedge", glyph: "\u2227", label: "logical and", description: "Connective: Boolean conjunction operator", category: "math" },
  { command: "\\vee", glyph: "\u2228", label: "logical or", description: "Connective: Boolean disjunction operator", category: "math" },
  { command: "\\neg", glyph: "\u00ac", label: "logical not", description: "Connective: Boolean negation operator", category: "math" },
  { command: "\\lfloor", glyph: "\u230a", label: "left floor", description: "Bracket: opening greatest integer bracket", category: "math" },
  { command: "\\rfloor", glyph: "\u230b", label: "right floor", description: "Bracket: closing greatest integer bracket", category: "math" },
  { command: "\\lceil", glyph: "\u2308", label: "left ceiling", description: "Bracket: opening least integer bracket", category: "math" },
  { command: "\\rceil", glyph: "\u2309", label: "right ceiling", description: "Bracket: closing least integer bracket", category: "math" },
  { command: "\\otimes", glyph: "\u2297", label: "tensor product", description: "Algebra: tensor outer product operator", category: "math" },
  { command: "\\oplus", glyph: "\u2295", label: "direct sum", description: "Algebra: direct sum module operator", category: "math" },

  // Language Keywords & Flow
  { command: "\\figure", label: "in-flow figure", description: "Viewport: embeds interactive geometric coordinate canvas in document flow", category: "keyword" },
  { command: "\\derive", label: "equivalence derivation", description: "Derivation: validates step-by-step algebraic relation equality", category: "keyword" },
  { command: "\\axis", label: "coordinate space", description: "Geometry: declares continuous coordinate axes for numerical relations", category: "keyword" },
  { command: "\\match", label: "pattern match", description: "Pattern: structural destructuring matching over expression ASTs", category: "keyword" },
  { command: "\\case", label: "match case", description: "Branch: pattern branch condition in pattern match block", category: "keyword" },
  { command: "\\otherwise", label: "fallback case", description: "Fallback: default branch in pattern match block", category: "keyword" },
  { command: "\\quote", label: "quote expression AST", description: "Metaprogramming: treats expression code as first-class AST value", category: "keyword" },
  { command: "\\build", label: "build expression AST", description: "Metaprogramming: constructs dynamic expression tree from nodes", category: "keyword" },
  { command: "\\list", label: "list collection", description: "Collection: ordered sequential list literal constructor", category: "construct" },
  { command: "\\tuple", label: "tuple construct", description: "Construct: fixed-arity heterogeneous ordered tuple", category: "construct" },
  { command: "\\if", label: "conditional if", description: "Branching: Boolean guard condition", category: "keyword" },
  { command: "\\then", label: "conditional then", description: "Branching: true evaluated branch expression", category: "keyword" },
  { command: "\\else", label: "conditional else", description: "Branching: false evaluated fallback branch expression", category: "keyword" },
  { command: "\\with", label: "with block", description: "Scope: local scope definition block with scoped bindings", category: "keyword" },
  { command: "\\where", label: "where clause", description: "Scope: trailing qualification bindings clause", category: "keyword" },
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

      const descSpan = document.createElement("span");
      descSpan.className = "doc-autocomplete-desc";
      descSpan.textContent = item.description || item.label;
      row.appendChild(descSpan);

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
