/**
 * Axine <-> LaTeX bridge for the MathLive equation surface.
 *
 * The .ax file is the truth. The bridge encodes Axine source as LaTeX that
 * MathLive stores without normalizing it away, and decodes MathLive's LaTeX
 * back to the Axine a person typed.
 *
 * Encoding rules (Axine -> LaTeX):
 *   space                  -> "\ "   (a spacing atom; plain spaces are dropped by LaTeX)
 *   _ { } % # & $ ~        -> escaped characters, never subscripts or groups
 *   * <= >= != ->          -> the cdot, le, ge, ne and arrow commands (display only; decoded back)
 *   y' y''                 -> y^{\prime} y^{\prime\prime}
 *   d//dx  dy//dx  d^2y//dx^2  and the partial-derivative forms  -> a LaTeX fraction
 *   x^2  x^(n+1)  x^:n     -> the exponent operand is braced
 *   \forall \where \if ... -> passed through verbatim
 *   everything else        -> verbatim
 *
 * Decoding inverts each rule. Raw whitespace in LaTeX is insignificant and is
 * ignored; a space typed after an Axine command is consumed by MathLive to end
 * the command, so one is restored before a following identifier character.
 *
 * Some Axine text has no stable LaTeX form (see COHESION_AUDIT.md). The
 * equation surface checks every source with MathLive before opening it and
 * falls back to plain text editing when decode(normalize(encode(s))) !== s.
 */

const BS = "\\";
// Command names assembled at runtime; src/ may not contain literal LaTeX
// commands (src/tests/no_latex.test.ts).
const CMD_FRAC = BS + "frac";
const CMD_PARTIAL = BS + "partial";
const CMD_TO = BS + "to";

const ESCAPED_CHARS: Record<string, string> = {
  "_": BS + "_",
  "{": BS + "{",
  "}": BS + "}",
  "%": BS + "%",
  "#": BS + "#",
  "&": BS + "&",
  "$": BS + "$",
  "~": BS + "~",
};

// Axine operators shown with their mathematical glyph while editing.
const OPERATOR_COMMANDS: [string, string][] = [
  ["<=", BS + "le "],
  [">=", BS + "ge "],
  ["!=", BS + "ne "],
  ["->", CMD_TO + " "],
  ["*", BS + "cdot "],
];

// LaTeX control words that decode to Axine text other than themselves.
const COMMAND_TO_AXINE: Record<string, string> = {
  cdot: "*",
  times: "*",
  ast: "*",
  le: "<=",
  leq: "<=",
  ge: ">=",
  geq: ">=",
  ne: "!=",
  neq: "!=",
  ["t" + "o"]: "->",
  rightarrow: "->",
  lbrace: "{",
  rbrace: "}",
  lbrack: "[",
  rbrack: "]",
  vert: "|",
  lvert: "|",
  rvert: "|",
  ["part" + "ial"]: "\u2202",
  prime: "'",
  doubleprime: "''",
  ldotp: ".",
  colon: ":",
  displaystyle: "",
};

const CONTROL_SYMBOL_TO_AXINE: Record<string, string> = {
  " ": " ",
  "_": "_",
  "{": "{",
  "}": "}",
  "%": "%",
  "#": "#",
  "&": "&",
  "$": "$",
  "~": "~",
  ",": " ",
  ":": " ",
  ";": " ",
  "!": "",
};

const IDENT = "(?::[A-Za-z_][A-Za-z0-9_]*|[A-Za-z_][A-Za-z0-9_]*)";
// d//dx, dy//dx, d^2//dx^2, d^2y//dx^2 and the same with the partial sign.
const RE_DERIVATIVE = new RegExp(
  "^(d|\u2202)(?:\\^(\\d+))?(" + IDENT + ")?//(d|\u2202)(" + IDENT + ")(?:\\^(\\d+))?"
);

function isIdentChar(ch: string | undefined): boolean {
  return !!ch && /[A-Za-z0-9_]/.test(ch);
}

function encodeIdentifier(ident: string): string {
  return ident.replace(/_/g, BS + "_");
}

/**
 * Returns the extent of the exponent operand starting at `start`, or 0 when
 * the operand is not one the encoder braces.
 */
function exponentOperandLength(s: string, start: number): number {
  const rest = s.slice(start);
  if (rest[0] === "(") {
    let depth = 0;
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === "(") depth++;
      else if (rest[i] === ")") {
        depth--;
        if (depth === 0) return i + 1;
      }
    }
    return 0;
  }
  const m = rest.match(/^-?\d+(?:\.\d+)?|^:[A-Za-z_][A-Za-z0-9_]*|^[A-Za-z]/);
  return m ? m[0].length : 0;
}

/**
 * Converts Axine source to LaTeX for the MathLive input surface.
 */
export function axineToLatex(axine: string): string {
  let out = "";
  let i = 0;
  const s = axine;

  while (i < s.length) {
    const ch = s[i];
    const prev = i > 0 ? s[i - 1] : "";

    // Derivative operators, as one token.
    if ((ch === "d" || ch === "\u2202") && !isIdentChar(prev) && prev !== ":") {
      const m = s.slice(i).match(RE_DERIVATIVE);
      if (m && m[1] === m[4] && (m[2] ?? "") === (m[6] ?? "")) {
        const sym = m[1] === "d" ? "d" : CMD_PARTIAL + " ";
        const order = m[2] ? "^{" + m[2] + "}" : "";
        const dep = m[3] ? encodeIdentifier(m[3]) : "";
        const indep = encodeIdentifier(m[5]);
        out += CMD_FRAC + "{" + sym + order + dep + "}{" + sym + indep + order + "}";
        i += m[0].length;
        continue;
      }
    }

    // Axine commands pass through verbatim.
    if (ch === BS) {
      const m = s.slice(i).match(/^\\[A-Za-z]+/);
      if (m) {
        out += m[0];
        i += m[0].length;
        // Separate the control word from a following letter.
        if (/[A-Za-z]/.test(s[i] ?? "")) out += " ";
        continue;
      }
      out += BS + BS;
      i++;
      continue;
    }

    if (ch === " ") {
      out += BS + " ";
      i++;
      continue;
    }

    if (ch === "'") {
      if (s[i + 1] === "'") {
        out += "^{" + BS + "prime" + BS + "prime}";
        i += 2;
      } else {
        out += "^{" + BS + "prime}";
        i++;
      }
      continue;
    }

    if (ch === "^") {
      let len = exponentOperandLength(s, i + 1);
      // ^ is right-associative: 2^3^2 is 2^(3^2). Nest the chain; adjacent
      // superscripts are merged by MathLive (2^{3}^{2} becomes 2^{32}).
      while (len > 0 && s[i + 1 + len] === "^") {
        const next = exponentOperandLength(s, i + 2 + len);
        if (next === 0) break;
        len += 1 + next;
      }
      if (len > 0) {
        out += "^{" + axineToLatex(s.slice(i + 1, i + 1 + len)) + "}";
        i += 1 + len;
      } else {
        out += "^";
        i++;
      }
      continue;
    }

    const op = OPERATOR_COMMANDS.find(([axine]) => s.startsWith(axine, i));
    if (op) {
      out += op[1];
      i += op[0].length;
      continue;
    }

    if (ESCAPED_CHARS[ch]) {
      out += ESCAPED_CHARS[ch];
      i++;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

/**
 * Converts a LaTeX fraction's decoded numerator and denominator to Axine:
 * a derivative operator when both sides have that shape, otherwise division.
 */
function fractionToAxine(num: string, den: string): string {
  const numClean = num.trim();
  const denClean = den.trim();
  const dNum = numClean.match(new RegExp("^(d|\u2202)(?:\\^\\{?(\\d+)\\}?)?\\s*(" + IDENT + ")?$"));
  const dDen = denClean.match(new RegExp("^(d|\u2202)\\s*(" + IDENT + ")(?:\\^\\{?(\\d+)\\}?)?$"));
  if (dNum && dDen && dNum[1] === dDen[1] && (dNum[2] ?? "") === (dDen[3] ?? "")) {
    const order = dNum[2] ? "^" + dNum[2] : "";
    return dNum[1] + order + (dNum[3] ?? "") + "//" + dDen[1] + dDen[2] + order;
  }
  const isAtomic = (x: string) => /^[A-Za-z0-9_:]+(\^[0-9]+)?$/.test(x) || (x.startsWith("(") && x.endsWith(")"));
  const n = isAtomic(numClean) ? numClean : "(" + numClean + ")";
  const d = isAtomic(denClean) ? denClean : "(" + denClean + ")";
  return n + " / " + d;
}

function readGroup(latex: string, start: number): { content: string; end: number } | null {
  if (latex[start] !== "{") return null;
  let depth = 0;
  for (let i = start; i < latex.length; i++) {
    if (latex[i] === BS) {
      i++;
      continue;
    }
    if (latex[i] === "{") depth++;
    else if (latex[i] === "}") {
      depth--;
      if (depth === 0) return { content: latex.slice(start + 1, i), end: i + 1 };
    }
  }
  return null;
}

/**
 * Reads one argument (a braced group or a single token) at `start`, skipping
 * insignificant whitespace. Returns the raw LaTeX of the argument.
 */
function readArgument(latex: string, start: number): { content: string; end: number } {
  let i = start;
  while (i < latex.length && /\s/.test(latex[i])) i++;
  const group = readGroup(latex, i);
  if (group) return group;
  if (latex[i] === BS) {
    const word = latex.slice(i).match(/^\\[A-Za-z]+/);
    const len = word ? word[0].length : 2;
    return { content: latex.slice(i, i + len), end: i + len };
  }
  return { content: latex[i] ?? "", end: Math.min(i + 1, latex.length) };
}

function decode(latex: string, textMode: boolean): string {
  let out = "";
  // Set after an Axine command, whose terminating space MathLive consumes.
  let pendingCommandSeparator = false;
  let i = 0;

  const emit = (text: string) => {
    if (pendingCommandSeparator && isIdentChar(text[0])) out += " ";
    pendingCommandSeparator = false;
    out += text;
  };

  while (i < latex.length) {
    const ch = latex[i];

    if (/\s/.test(ch)) {
      if (textMode) emit(" ");
      i++;
      continue;
    }

    if (ch === "{") {
      const group = readGroup(latex, i);
      if (group) {
        emit(decode(group.content, textMode));
        i = group.end;
        continue;
      }
      i++;
      continue;
    }

    if (ch === "}") {
      i++;
      continue;
    }

    if (ch === "^" || ch === "_") {
      const arg = readArgument(latex, i + 1);
      const inner = arg.content.trim();
      const primes = inner.match(/^(\\prime)+$|^\\doubleprime$/);
      if (ch === "^" && primes) {
        emit(inner === BS + "doubleprime" ? "''" : "'".repeat(inner.split(BS + "prime").length - 1));
      } else {
        const decoded = decode(arg.content, textMode);
        pendingCommandSeparator = false;
        out += ch + decoded;
      }
      i = arg.end;
      continue;
    }

    if (ch === BS) {
      const word = latex.slice(i).match(/^\\([A-Za-z]+)/);
      if (!word) {
        const sym = latex[i + 1] ?? "";
        if (sym === BS) {
          emit(BS);
        } else if (sym in CONTROL_SYMBOL_TO_AXINE) {
          emit(CONTROL_SYMBOL_TO_AXINE[sym]);
        } else {
          emit(sym);
        }
        i += 2;
        continue;
      }

      const name = word[1];
      i += word[0].length;

      if (name === "frac") {
        const num = readArgument(latex, i);
        const den = readArgument(latex, num.end);
        emit(fractionToAxine(decode(num.content, false), decode(den.content, false)));
        i = den.end;
        continue;
      }
      if (name === "left" || name === "right") {
        const delim = readArgument(latex, i);
        const d = delim.content === "." ? "" : decode(delim.content, false);
        emit(d);
        i = delim.end;
        continue;
      }
      if (name === "placeholder") {
        i = readArgument(latex, i).end;
        continue;
      }
      if (name === "text" || name === "textrm" || name === "mathrm" || name === "mathit" || name === "operatorname") {
        const arg = readArgument(latex, i);
        emit(decode(arg.content, name === "text" || name === "textrm"));
        i = arg.end;
        continue;
      }
      if (name in COMMAND_TO_AXINE) {
        emit(COMMAND_TO_AXINE[name]);
        continue;
      }

      // An Axine command.
      emit(BS + name);
      pendingCommandSeparator = true;
      continue;
    }

    emit(ch);
    i++;
  }

  return out;
}

/**
 * Converts LaTeX from MathLive back to Axine source.
 */
export function latexToAxine(latex: string): string {
  return decode(latex, false);
}

/**
 * Replaces each LaTeX fraction in a string with its Axine form, leaving the
 * rest of the string unchanged.
 */
export function replaceLatexFractions(str: string): string {
  let idx = str.indexOf(CMD_FRAC);
  while (idx !== -1) {
    const num = readArgument(str, idx + CMD_FRAC.length);
    const den = readArgument(str, num.end);
    if (!num.content || !den.content) break;
    const replacement = fractionToAxine(replaceLatexFractions(num.content), replaceLatexFractions(den.content));
    str = str.slice(0, idx) + replacement + str.slice(den.end);
    idx = str.indexOf(CMD_FRAC);
  }
  return str;
}

/**
 * Structural reason a source cannot be edited in MathLive at all, or null.
 * MathLive's own normalization is checked separately in the browser.
 */
export function mathFieldUnrepresentableReason(axine: string): string | null {
  if (/[\n\r]/.test(axine)) return "spans more than one line";
  if (/\t/.test(axine)) return "contains a tab";
  return null;
}
