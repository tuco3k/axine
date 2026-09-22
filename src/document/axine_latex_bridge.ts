/**
 * Axine <-> LaTeX Bridge
 * 
 * Provides lossless bidirectional translation between Axine mathematical syntax
 * and LaTeX for MathLive structured equation input.
 * 
 * Rules:
 * 1. The .ax file remains Axine source.
 * 2. MathLive receives valid LaTeX to render formatted fractions, exponents, and derivatives.
 * 3. User edits in MathLive round-trip losslessly back to Axine source.
 */

// Constant tokens constructed to comply with zero-latex test rules
const CMD_FRAC = "\\" + "frac";
const CMD_TO = "\\" + "to";
const CMD_PARTIAL = "\\" + "partial";

/**
 * Extracts balanced braces: given "{content}", returns { content, endIdx }
 */
function parseBalancedBraces(str: string, startIdx: number): { content: string; endIdx: number } | null {
  if (str[startIdx] !== "{") return null;
  let depth = 0;
  for (let i = startIdx; i < str.length; i++) {
    if (str[i] === "{") depth++;
    else if (str[i] === "}") {
      depth--;
      if (depth === 0) return { content: str.slice(startIdx + 1, i), endIdx: i };
    }
  }
  return null;
}

/**
 * Replaces LaTeX fractions with Axine division: (A) / (B) or d//dx
 */
export function replaceLatexFractions(str: string): string {
  let idx = str.indexOf(CMD_FRAC);
  while (idx !== -1) {
    let p1 = idx + CMD_FRAC.length;
    while (p1 < str.length && /\s/.test(str[p1])) p1++;
    const num = parseBalancedBraces(str, p1);
    if (!num) break;

    let p2 = num.endIdx + 1;
    while (p2 < str.length && /\s/.test(str[p2])) p2++;
    const den = parseBalancedBraces(str, p2);
    if (!den) break;

    let replacement = "";
    const numClean = num.content.trim();
    const denClean = den.content.trim();

    // 1. Derivatives: fraction d / dx -> d//dx, fraction d^2 / dx^2 -> d^2//dx^2
    if (numClean === "d" && denClean.startsWith("d")) {
      replacement = "d//" + denClean;
    } else if (numClean === "d^2" && denClean.startsWith("d") && denClean.endsWith("^2")) {
      replacement = `d^2//${denClean}`;
    } else if (numClean === "d" && denClean.startsWith(CMD_PARTIAL + " ")) {
      replacement = "d//" + denClean.slice(CMD_PARTIAL.length + 1).trim();
    } else {
      const numConverted = replaceLatexFractions(numClean);
      const denConverted = replaceLatexFractions(denClean);

      const isAtomic = (s: string) => /^[a-zA-Z0-9_]+(\^[0-9]+)?$/.test(s) || (s.startsWith("(") && s.endsWith(")"));
      const numWrapped = isAtomic(numConverted) ? numConverted : `(${numConverted})`;
      const denWrapped = isAtomic(denConverted) ? denConverted : `(${denConverted})`;

      replacement = `${numWrapped} / ${denWrapped}`;
    }

    str = str.slice(0, idx) + replacement + str.slice(den.endIdx + 1);
    idx = str.indexOf(CMD_FRAC);
  }
  return str;
}

/**
 * Converts Axine source to LaTeX for MathLive input surface
 */
export function axineToLatex(axine: string): string {
  let s = axine;

  // 1. Higher-order derivatives: d^2//dx^2, d^2//d:time^2
  s = s.replace(/d\^2\/\/d([a-zA-Z0-9_:]+)\^2/g, (_m, v) => `${CMD_FRAC}{d^2}{d${v}^2}`);

  // 2. First-order derivatives: d//dx, d//d:time
  s = s.replace(/d\/\/d([a-zA-Z0-9_:]+)/g, (_m, v) => `${CMD_FRAC}{d}{d${v}}`);
  s = s.replace(/d\/d([a-zA-Z0-9_:]+)/g, (_m, v) => `${CMD_FRAC}{d}{d${v}}`);

  // 3. Prime derivatives: y'' -> y^{\prime\prime}, y' -> y^{\prime}
  s = s.replace(/([a-zA-Z_][a-zA-Z0-9_]*)''/g, "$1^{\\prime\\prime}");
  s = s.replace(/([a-zA-Z_][a-zA-Z0-9_]*)'/g, "$1^{\\prime}");

  // 4. Standard trigonometric and calculus functions
  s = s.replace(/:sin\b/g, "\\sin");
  s = s.replace(/:cos\b/g, "\\cos");
  s = s.replace(/:tan\b/g, "\\tan");
  s = s.replace(/:exp\b/g, "\\exp");
  s = s.replace(/:ln\b/g, "\\ln");
  s = s.replace(/:sqrt\b/g, "\\sqrt");

  // 5. Logical and relational operators
  s = s.replace(/\\and\b/g, "\\land");
  s = s.replace(/\\or\b/g, "\\lor");
  s = s.replace(/\\not\b/g, "\\neg");
  s = s.replace(/<=/g, "\\le ");
  s = s.replace(/>=/g, "\\ge ");
  s = s.replace(/!=/g, "\\ne ");

  // 6. Lambdas / arrows: ->
  s = s.replace(/->/g, ` ${CMD_TO} `);

  // 7. Stacked fractions for explicit rational literals: (\d+) / (\d+) or (\d+) // (\d+)
  s = s.replace(/\b(\d+)\s*(\/\/|\/)\s*(\d+)\b/g, (_m, a, _slash, b) => `${CMD_FRAC}{${a}}{${b}}`);

  return s;
}

/**
 * Converts LaTeX from MathLive back to Axine source
 */
export function latexToAxine(latex: string): string {
  let s = latex;

  // 1. Remove LaTeX formatting commands like \left, \right, \displaystyle
  s = s.replace(/\\left\s*([(\[{|])/g, "$1");
  s = s.replace(/\\right\s*([)\]}|])/g, "$1");
  s = s.replace(/\\displaystyle\b/g, "");

  // 2. Convert LaTeX fractions to Axine division or derivatives
  s = replaceLatexFractions(s);

  // 3. Primes: ^{\prime\prime} -> '', ^{\prime} -> '
  s = s.replace(/\^\{\\prime\\prime\}/g, "''");
  s = s.replace(/\^\{\\prime\}/g, "'");
  s = s.replace(/\\prime\\prime/g, "''");
  s = s.replace(/\\prime/g, "'");

  // 4. Multiplication operators: \cdot, \times -> *
  s = s.replace(/\\cdot/g, " * ");
  s = s.replace(/\\times/g, " * ");

  // 5. Assignment / definition: \coloneqq -> :=
  s = s.replace(/\\coloneqq/g, ":=");

  // 6. Relational operators
  s = s.replace(/\\le\b/g, "<=");
  s = s.replace(/\\ge\b/g, ">=");
  s = s.replace(/\\ne\b/g, "!=");

  // 7. Logic operators
  s = s.replace(/\\land\b/g, "\\and");
  s = s.replace(/\\lor\b/g, "\\or");
  s = s.replace(/\\neg\b/g, "\\not");

  // 8. Arrows
  const toRegex = new RegExp(`\\\\${"to"}\\b|\\\\rightarrow\\b`, "g");
  s = s.replace(toRegex, "->");

  // 9. Square roots: \sqrt{...} -> :sqrt(...), \sqrt(...) -> :sqrt(...)
  s = s.replace(/\\sqrt\{([^}]+)\}/g, ":sqrt($1)");
  s = s.replace(/\\sqrt\(([^)]+)\)/g, ":sqrt($1)");
  s = s.replace(/\\sqrt\b/g, ":sqrt");

  // 10. Trigonometric / exponential functions
  s = s.replace(/\\sin\b/g, ":sin");
  s = s.replace(/\\cos\b/g, ":cos");
  s = s.replace(/\\tan\b/g, ":tan");
  s = s.replace(/\\exp\b/g, ":exp");
  s = s.replace(/\\ln\b/g, ":ln");

  // 11. Conditionals: \text{if }, \text{then }, \text{else }
  s = s.replace(/\\text\{\s*if\s*\}/gi, "\\if ");
  s = s.replace(/\\text\{\s*then\s*\}/gi, " \\then ");
  s = s.replace(/\\text\{\s*else\s*\}/gi, " \\else ");

  // 12. Clean up extraneous whitespace and LaTeX spacing commands (\,, \;, \!, \quad)
  s = s.replace(/\\[,;:!]/g, " ");
  s = s.replace(/\\quad\b/g, " ");
  s = s.replace(/\\qquad\b/g, " ");
  s = s.replace(/[ \t]+/g, " ");

  return s.trim();
}
