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
  category: "data_structure" | "math" | "greek" | "keyword" | "construct";
  keywords?: string[];
}

export const AUTOCOMPLETE_COMMANDS: AutocompleteItem[] = [
  // -------------------------------------------------------------
  // Data Structures
  // -------------------------------------------------------------
  {
    command: "\\cases",
    glyph: "{",
    label: "piecewise cases",
    description: "Piecewise branch data structure: conditional piecewise evaluation",
    category: "data_structure",
    keywords: ["cases", "piecewise", "branch", "conditional", "switch", "guard", "brace", "function", "data", "structure"],
  },
  {
    command: "\\table",
    glyph: "[+]",
    label: "table grid",
    description: "2D table data structure: discrete 2D grid matrix of data cells",
    category: "data_structure",
    keywords: ["table", "grid", "matrix", "2d", "spreadsheet", "cells", "data", "structure"],
  },
  {
    command: "\\matrix",
    glyph: "[ ]",
    label: "matrix",
    description: "Matrix data structure: 2D linear algebra numerical or symbolic array",
    category: "data_structure",
    keywords: ["matrix", "2d", "array", "linear", "algebra", "grid", "tensor", "vector", "data", "structure"],
  },
  {
    command: "\\list",
    glyph: "[ , ]",
    label: "list collection",
    description: "List data structure: ordered sequential collection of elements",
    category: "data_structure",
    keywords: ["list", "sequence", "collection", "array", "queue", "stack", "elements", "data", "structure"],
  },
  {
    command: "\\tuple",
    glyph: "( , )",
    label: "tuple construct",
    description: "Tuple data structure: fixed-arity heterogeneous ordered product",
    category: "data_structure",
    keywords: ["tuple", "product", "pair", "triple", "coordinates", "data", "structure"],
  },
  {
    command: "\\record",
    glyph: "{ : }",
    label: "record / struct",
    description: "Record data structure: key-value mapping with typed named fields",
    category: "data_structure",
    keywords: ["record", "struct", "fields", "dictionary", "object", "key", "value", "data", "structure"],
  },
  {
    command: "\\struct",
    glyph: "{ : }",
    label: "struct constructor",
    description: "Struct data structure: named product type schema definition",
    category: "data_structure",
    keywords: ["struct", "record", "schema", "type", "fields", "data", "structure"],
  },
  {
    command: "\\set",
    glyph: "{ | }",
    label: "set collection",
    description: "Set data structure: unique unordered collection or predicate comprehension",
    category: "data_structure",
    keywords: ["set", "unique", "collection", "membership", "comprehension", "data", "structure"],
  },
  {
    command: "\\multiset",
    glyph: "{* *}",
    label: "multiset / bag",
    description: "Multiset data structure: collection with element multiplicities",
    category: "data_structure",
    keywords: ["multiset", "bag", "collection", "multiplicities", "counts", "data", "structure"],
  },
  {
    command: "\\dict",
    glyph: "Map",
    label: "dictionary / map",
    description: "Dictionary data structure: associative key-to-value lookup table",
    category: "data_structure",
    keywords: ["dict", "dictionary", "map", "hash", "associative", "lookup", "data", "structure"],
  },
  {
    command: "\\vector",
    glyph: "< >",
    label: "vector",
    description: "Vector data structure: 1D spatial column or row coordinate vector",
    category: "data_structure",
    keywords: ["vector", "column", "row", "array", "1d", "coordinates", "spatial", "data", "structure"],
  },
  {
    command: "\\tensor",
    glyph: "(x)",
    label: "tensor",
    description: "Tensor data structure: multi-dimensional array with contravariant indices",
    category: "data_structure",
    keywords: ["tensor", "multidimensional", "array", "indices", "rank", "algebra", "data", "structure"],
  },
  {
    command: "\\series",
    glyph: "\u03a3",
    label: "series / sequence",
    description: "Series data structure: infinite or finite term sequence generator",
    category: "data_structure",
    keywords: ["series", "sequence", "progression", "stream", "recurrence", "data", "structure"],
  },
  {
    command: "\\tree",
    glyph: "/\\",
    label: "tree / hierarchy",
    description: "Tree data structure: hierarchical node-edge rooted acyclic graph",
    category: "data_structure",
    keywords: ["tree", "hierarchy", "nodes", "branches", "ast", "data", "structure"],
  },
  {
    command: "\\trajectory",
    glyph: "~",
    label: "state trajectory",
    description: "Trajectory data structure: continuous time-evolution sample path",
    category: "data_structure",
    keywords: ["trajectory", "time", "series", "simulation", "samples", "path", "ode", "motion", "data", "structure"],
  },
  {
    command: "\\space",
    glyph: "R^n",
    label: "coordinate space",
    description: "Space data structure: continuous manifold coordinate domain",
    category: "data_structure",
    keywords: ["space", "coordinate", "domain", "manifold", "continuous", "bounds", "data", "structure"],
  },
  {
    command: "\\figure",
    glyph: "[fig]",
    label: "in-flow figure",
    description: "Figure data structure: geometric visual scene coordinate viewport",
    category: "data_structure",
    keywords: ["figure", "scene", "plot", "drawing", "canvas", "viewport", "geometry", "data", "structure"],
  },
  {
    command: "\\derive",
    glyph: "|-",
    label: "derivation sequence",
    description: "Derivation data structure: verified formal equivalence deduction steps",
    category: "data_structure",
    keywords: ["derive", "derivation", "proof", "steps", "equivalence", "deduction", "rule", "data", "structure"],
  },
  {
    command: "\\form",
    glyph: "\u03c9",
    label: "differential form",
    description: "Differential form: exterior algebra anti-symmetric form construct",
    category: "construct",
    keywords: ["form", "differential", "exterior", "algebra", "wedge", "dx", "dy", "construct"],
  },

  // -------------------------------------------------------------
  // Logic & Sets
  // -------------------------------------------------------------
  { command: "\\forall", glyph: "\u2200", label: "for all", description: "Universal quantifier: asserts predicate holds across domain", category: "math", keywords: ["forall", "all", "universal", "quantifier"] },
  { command: "\\exists", glyph: "\u2203", label: "there exists", description: "Existential quantifier: asserts at least one satisfying element", category: "math", keywords: ["exists", "existential", "quantifier"] },
  { command: "\\in", glyph: "\u2208", label: "element of", description: "Set membership: tests if element belongs to set or list", category: "math", keywords: ["in", "element", "member", "set"] },
  { command: "\\notin", glyph: "\u2209", label: "not element of", description: "Non-membership: tests if element does not belong to set", category: "math", keywords: ["notin", "not", "element", "member"] },
  { command: "\\subset", glyph: "\u2282", label: "subset", description: "Strict subset: elements strictly contained in target set", category: "math", keywords: ["subset", "contained"] },
  { command: "\\subseteq", glyph: "\u2286", label: "subset or equal", description: "Subset or equal: elements contained in or equal to target set", category: "math", keywords: ["subseteq", "subset"] },
  { command: "\\cup", glyph: "\u222a", label: "union", description: "Set union: combines elements from both collections", category: "math", keywords: ["union", "join", "cup"] },
  { command: "\\cap", glyph: "\u2229", label: "intersection", description: "Set intersection: common elements across both collections", category: "math", keywords: ["intersection", "common", "cap"] },

  // -------------------------------------------------------------
  // Relations & Comparison
  // -------------------------------------------------------------
  { command: "\\le", glyph: "\u2264", label: "less than or equal", description: "Comparison: asserts left operand is less than or equal to right", category: "math", keywords: ["less", "equal", "comparison", "le"] },
  { command: "\\ge", glyph: "\u2265", label: "greater than or equal", description: "Comparison: asserts left operand is greater than or equal to right", category: "math", keywords: ["greater", "equal", "comparison", "ge"] },
  { command: "\\ne", glyph: "\u2260", label: "not equal", description: "Inequality: asserts operands are not numerically equal", category: "math", keywords: ["not", "equal", "inequality", "ne"] },
  { command: "\\approx", glyph: "\u2248", label: "approximately", description: "Approximation: asserts equivalence within numeric tolerance", category: "math", keywords: ["approx", "approximate", "tolerance"] },
  { command: "\\propto", glyph: "\u221d", label: "proportional to", description: "Proportionality: asserts linear scaling relationship", category: "math", keywords: ["proportional", "scales", "propto"] },

  // -------------------------------------------------------------
  // Arithmetic & Calculus
  // -------------------------------------------------------------
  { command: "\\sqrt", glyph: "\u221a", label: "square root", description: "Radical: principal square root operator", category: "math", keywords: ["sqrt", "root", "radical"] },
  { command: "\\times", glyph: "\u00d7", label: "multiplication cross", description: "Multiplication: cross product or arithmetic times", category: "math", keywords: ["times", "multiply", "cross"] },
  { command: "\\cdot", glyph: "\u00b7", label: "centered dot", description: "Multiplication: scalar product or centered multiplication dot", category: "math", keywords: ["cdot", "dot", "product"] },
  { command: "\\pm", glyph: "\u00b1", label: "plus-minus", description: "Sign: plus or minus tolerance range", category: "math", keywords: ["pm", "plus", "minus"] },
  { command: "\\mp", glyph: "\u2213", label: "minus-plus", description: "Sign: inverted minus-plus operator", category: "math", keywords: ["mp", "minus", "plus"] },
  { command: "\\" + "int", glyph: "\u222b", label: "integral", description: "Calculus: continuous accumulation over a domain", category: "math", keywords: ["int", "integral", "calculus"] },
  { command: "\\iint", glyph: "\u222c", label: "double integral", description: "Calculus: 2D area integral over planar region", category: "math", keywords: ["iint", "integral", "double", "area"] },
  { command: "\\iiint", glyph: "\u222d", label: "triple integral", description: "Calculus: 3D volume integral over spatial region", category: "math", keywords: ["iiint", "integral", "triple", "volume"] },
  { command: "\\oint", glyph: "\u222e", label: "contour integral", description: "Calculus: closed path contour line integral", category: "math", keywords: ["oint", "contour", "integral"] },
  { command: "\\" + "partial", glyph: "\u2202", label: "partial derivative", description: "Calculus: partial rate of change with respect to single variable", category: "math", keywords: ["partial", "derivative", "gradient"] },
  { command: "\\nabla", glyph: "\u2207", label: "nabla / del", description: "Calculus: spatial gradient vector differential operator", category: "math", keywords: ["nabla", "del", "gradient", "vector"] },
  { command: "\\" + "infty", glyph: "\u221e", label: "infinity", description: "Quantity: mathematical unbounded infinity", category: "math", keywords: ["infty", "infinity", "limit"] },

  // -------------------------------------------------------------
  // Greek Letters
  // -------------------------------------------------------------
  { command: "\\pi", glyph: "\u03c0", label: "pi", description: "Constant: ratio of circle circumference to diameter", category: "math", keywords: ["pi", "constant", "circle"] },
  { command: "\\tau", glyph: "\u03c4", label: "tau", description: "Constant: circle constant equal to 2*pi", category: "math", keywords: ["tau", "circle", "constant"] },
  { command: "\\theta", glyph: "\u03b8", label: "theta", description: "Variable: standard angular displacement coordinate", category: "math", keywords: ["theta", "angle", "polar"] },
  { command: "\\lambda", glyph: "\u03bb", label: "lambda", description: "Symbol: eigenvalue, wavelength, or anonymous function parameter", category: "math", keywords: ["lambda", "eigenvalue", "function"] },
  { command: "\\alpha", glyph: "\u03b1", label: "alpha", description: "Symbol: first Greek variable parameter", category: "math", keywords: ["alpha", "greek"] },
  { command: "\\beta", glyph: "\u03b2", label: "beta", description: "Symbol: second Greek variable parameter", category: "math", keywords: ["beta", "greek"] },
  { command: "\\gamma", glyph: "\u03b3", label: "gamma", description: "Symbol: gamma scaling parameter or function", category: "math", keywords: ["gamma", "greek"] },
  { command: "\\delta", glyph: "\u03b4", label: "delta", description: "Symbol: infinitesimal variation or Dirac delta function", category: "math", keywords: ["delta", "variation", "greek"] },
  { command: "\\sigma", glyph: "\u03c3", label: "sigma", description: "Symbol: standard deviation or stress parameter", category: "math", keywords: ["sigma", "deviation", "greek"] },
  { command: "\\omega", glyph: "\u03c9", label: "omega", description: "Symbol: angular frequency parameter", category: "math", keywords: ["omega", "frequency", "greek"] },
  { command: "\\mu", glyph: "\u03bc", label: "mu", description: "Symbol: arithmetic mean or friction coefficient", category: "math", keywords: ["mu", "mean", "friction", "greek"] },
  { command: "\\phi", glyph: "\u03d5", label: "phi", description: "Symbol: azimuthal phase angle or golden ratio", category: "math", keywords: ["phi", "phase", "angle", "greek"] },
  { command: "\\" + "Delta", glyph: "\u0394", label: "Delta", description: "Operator: discrete macroscopic finite difference", category: "math", keywords: ["delta", "difference"] },
  { command: "\\Sigma", glyph: "\u03a3", label: "Sigma", description: "Operator: sum over indexed sequence", category: "math", keywords: ["sigma", "sum", "series"] },
  { command: "\\Pi", glyph: "\u03a0", label: "Pi", description: "Operator: product over indexed sequence", category: "math", keywords: ["pi", "product"] },

  // -------------------------------------------------------------
  // Logic Connectives & Brackets
  // -------------------------------------------------------------
  { command: "\\wedge", glyph: "\u2227", label: "logical and", description: "Connective: Boolean conjunction operator", category: "math", keywords: ["wedge", "and", "logic"] },
  { command: "\\vee", glyph: "\u2228", label: "logical or", description: "Connective: Boolean disjunction operator", category: "math", keywords: ["vee", "or", "logic"] },
  { command: "\\neg", glyph: "\u00ac", label: "logical not", description: "Connective: Boolean negation operator", category: "math", keywords: ["neg", "not", "logic"] },
  { command: "\\lfloor", glyph: "\u230a", label: "left floor", description: "Bracket: opening greatest integer bracket", category: "math", keywords: ["lfloor", "floor", "bracket"] },
  { command: "\\rfloor", glyph: "\u230b", label: "right floor", description: "Bracket: closing greatest integer bracket", category: "math", keywords: ["rfloor", "floor", "bracket"] },
  { command: "\\lceil", glyph: "\u2308", label: "left ceiling", description: "Bracket: opening least integer bracket", category: "math", keywords: ["lceil", "ceiling", "bracket"] },
  { command: "\\rceil", glyph: "\u2309", label: "right ceiling", description: "Bracket: closing least integer bracket", category: "math", keywords: ["rceil", "ceiling", "bracket"] },
  { command: "\\otimes", glyph: "\u2297", label: "tensor product", description: "Algebra: tensor outer product operator", category: "math", keywords: ["otimes", "tensor", "product"] },
  { command: "\\oplus", glyph: "\u2295", label: "direct sum", description: "Algebra: direct sum module operator", category: "math", keywords: ["oplus", "direct", "sum"] },

  // -------------------------------------------------------------
  // Language Keywords & Flow
  // -------------------------------------------------------------
  { command: "\\axis", label: "coordinate space", description: "Geometry: declares continuous coordinate axes for numerical relations", category: "keyword", keywords: ["axis", "geometry", "coordinates"] },
  { command: "\\match", label: "pattern match", description: "Pattern: structural destructuring matching over expression ASTs", category: "keyword", keywords: ["match", "pattern", "case"] },
  { command: "\\case", label: "match case", description: "Branch: pattern branch condition in pattern match block", category: "keyword", keywords: ["case", "branch", "pattern"] },
  { command: "\\otherwise", label: "fallback case", description: "Fallback: default branch in pattern match block", category: "keyword", keywords: ["otherwise", "default", "fallback"] },
  { command: "\\quote", label: "quote expression AST", description: "Metaprogramming: treats expression code as first-class AST value", category: "keyword", keywords: ["quote", "ast", "metaprogramming"] },
  { command: "\\build", label: "build expression AST", description: "Metaprogramming: constructs dynamic expression tree from nodes", category: "keyword", keywords: ["build", "ast", "construct"] },
  { command: "\\if", label: "conditional if", description: "Branching: Boolean guard condition", category: "keyword", keywords: ["if", "conditional", "guard"] },
  { command: "\\then", label: "conditional then", description: "Branching: true evaluated branch expression", category: "keyword", keywords: ["then", "conditional", "branch"] },
  { command: "\\else", label: "conditional else", description: "Branching: false evaluated fallback branch expression", category: "keyword", keywords: ["else", "conditional", "fallback"] },
  { command: "\\with", label: "with block", description: "Scope: local scope definition block with scoped bindings", category: "keyword", keywords: ["with", "scope", "bindings"] },
  { command: "\\where", label: "where clause", description: "Scope: trailing qualification bindings clause", category: "keyword", keywords: ["where", "scope", "bindings"] },
];

/**
 * Computes character n-grams and whole word tokens with term weights.
 */
function getNGramsAndWords(text: string): Map<string, number> {
  const map = new Map<string, number>();
  const clean = text.toLowerCase();

  // 1. Whole words (weight 3.0)
  const words = clean.split(/[^a-z0-9]+/);
  for (const w of words) {
    if (w.length > 0) {
      map.set(w, (map.get(w) || 0) + 3.0);
    }
  }

  // 2. Character 2-grams (weight 1.0)
  for (let i = 0; i < clean.length - 1; i++) {
    const gram = clean.substring(i, i + 2);
    if (!gram.includes(" ")) {
      map.set(gram, (map.get(gram) || 0) + 1.0);
    }
  }

  // 3. Character 3-grams (weight 2.0)
  for (let i = 0; i < clean.length - 2; i++) {
    const gram = clean.substring(i, i + 3);
    if (!gram.includes(" ")) {
      map.set(gram, (map.get(gram) || 0) + 2.0);
    }
  }

  return map;
}

/**
 * Computes cosine similarity between two term/n-gram frequency vectors:
 * cos(vA, vB) = (vA . vB) / (||vA|| * ||vB||)
 */
export function computeCosineSimilarity(vecA: Map<string, number>, vecB: Map<string, number>): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [key, valA] of vecA.entries()) {
    normA += valA * valA;
    const valB = vecB.get(key);
    if (valB !== undefined) {
      dotProduct += valA * valB;
    }
  }

  for (const valB of vecB.values()) {
    normB += valB * valB;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function getCandidateProfileText(item: AutocompleteItem): string {
  const cmd = item.command.replace(/^\\+/, "");
  const kw = item.keywords ? item.keywords.join(" ") : "";
  return `${cmd} ${cmd} ${item.label} ${item.label} ${kw} ${item.description} ${item.category}`;
}

export function findMatchingCommands(prefix: string): AutocompleteItem[] {
  if (!prefix.startsWith("\\")) return [];
  const q = prefix.replace(/^\\+/, "").toLowerCase();

  // If user just typed "\" alone:
  // Return all data structures first, then all remaining commands
  if (q === "") {
    return [...AUTOCOMPLETE_COMMANDS].sort((a, b) => {
      if (a.category === "data_structure" && b.category !== "data_structure") return -1;
      if (b.category === "data_structure" && a.category !== "data_structure") return 1;
      return a.command.localeCompare(b.command);
    });
  }

  const queryVec = getNGramsAndWords(q);

  // Score all candidate commands using cosine similarity
  const scored = AUTOCOMPLETE_COMMANDS.map((item, originalIndex) => {
    const rawCmd = item.command.replace(/^\\+/, "").toLowerCase();
    const itemVec = getNGramsAndWords(getCandidateProfileText(item));
    let cosSim = computeCosineSimilarity(queryVec, itemVec);

    const isExactPrefix = rawCmd.startsWith(q);
    if (isExactPrefix) {
      cosSim += 2.0;
    } else if (rawCmd.includes(q)) {
      cosSim += 1.0;
    } else if (item.label.toLowerCase().includes(q)) {
      cosSim += 0.5;
    }

    // Ensure all data structures have a positive baseline score so ALL data structures are navigable!
    if (item.category === "data_structure") {
      cosSim = Math.max(cosSim, 0.0001);
    }

    return { item, score: cosSim, isExactPrefix, originalIndex };
  });

  // Filter out items with 0 score (retaining all data structures)
  const filtered = scored.filter((s) => s.score > 0 || s.item.category === "data_structure");

  // Sort: prefix matches first (prioritizing data structures, then alphabetical), then strictly by cosine similarity
  filtered.sort((a, b) => {
    if (a.isExactPrefix && b.isExactPrefix) {
      if (a.item.category === "data_structure" && b.item.category !== "data_structure") return -1;
      if (b.item.category === "data_structure" && a.item.category !== "data_structure") return 1;
      return a.item.command.localeCompare(b.item.command);
    }
    if (a.isExactPrefix) return -1;
    if (b.isExactPrefix) return 1;

    if (Math.abs(b.score - a.score) > 1e-6) {
      return b.score - a.score;
    }
    if (a.item.category === "data_structure" && b.item.category !== "data_structure") return -1;
    if (b.item.category === "data_structure" && a.item.category !== "data_structure") return 1;
    return a.item.command.localeCompare(b.item.command);
  });

  return filtered.map((s) => s.item);
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
  private currentTarget: AutocompleteTarget | null = null;

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

  // `input` is the InputEvent that changed the text. When it says what
  // happened, the list opens only for a command's own character (a letter or
  // \) just typed, and only if that character is the one before the caret
  // now: MathLive sometimes reports an insertion again after a later
  // deletion. A deletion, a digit or a paste narrows or closes an open list
  // but never opens one. A change that does not say (no inputType) is
  // checked as before.
  public checkPrefix(target: AutocompleteTarget, input?: { inputType?: string; data?: string | null }): boolean {
    const text = target.getValue();
    const caret = target.getSelectionStart();
    const textBefore = text.substring(0, caret);
    if (!this.isOpen && input?.inputType) {
      const typed = input.inputType === "insertText" ? input.data ?? "" : "";
      if (!/[A-Za-z\\]$/.test(typed) || !textBefore.endsWith(typed)) return false;
    }
    this.currentTarget = target;

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
    this.currentTarget = target;
    if (this.popoverEl) {
      this.renderPopover();

      if (target.getCaretCoordinates) {
        const coords = target.getCaretCoordinates();
        this.popoverEl.style.left = coords.x + "px";
        this.popoverEl.style.top = coords.y + "px";
      }

      this.popoverEl.classList.remove("hidden");
    }
  }

  public close() {
    this.isOpen = false;
    this.matches = [];
    this.selectedIndex = 0;
    this.currentTarget = null;
    if (this.popoverEl) {
      this.popoverEl.classList.add("hidden");
    }
  }

  private renderPopover() {
    if (!this.popoverEl) return;
    this.popoverEl.innerHTML = "";

    for (let i = 0; i < this.matches.length; i++) {
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

      if (item.category === "data_structure") {
        const badge = document.createElement("span");
        badge.className = "doc-autocomplete-badge doc-autocomplete-badge-ds";
        badge.textContent = "data structure";
        row.appendChild(badge);
      }

      const descSpan = document.createElement("span");
      descSpan.className = "doc-autocomplete-desc";
      descSpan.textContent = item.description || item.label;
      row.appendChild(descSpan);

      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.selectedIndex = i;
        if (this.currentTarget) {
          this.accept(this.currentTarget);
        }
      });

      this.popoverEl.appendChild(row);
    }

    // Scroll active element into view if needed
    const activeEl = this.popoverEl.querySelector(".doc-autocomplete-item.active") as HTMLElement | null;
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }

  public handleKeydown(e: KeyboardEvent, target: AutocompleteTarget): boolean {
    if (!this.isOpen) return false;
    this.currentTarget = target;

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
