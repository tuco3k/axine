/**
 * MathTypesetter — Zero-Dependency Read-Only Mathematical Typesetting Engine
 * 
 * Generates true mathematical typography via DOM and CSS conforming to
 * Cambridge/AMS conventions, KaTeX layout metrics, and TeXbook spacing rules.
 */

import { ASTNode } from './types';

export interface TypesetOptions {
  displayMode?: boolean; // display (large limits, stacked fractions) vs inline
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Typesets an ASTNode or mathematical string expression into rich HTML.
 */
export function typesetMath(input: ASTNode | string, options: TypesetOptions = { displayMode: true }): string {
  if (typeof input !== 'string') {
    return typesetASTNode(input, options);
  }
  return typesetStringExpression(input, options);
}

function typesetASTNode(node: ASTNode, options: TypesetOptions): string {
  if (!node) return '';

  switch (node.type) {
    case 'NumberLiteral': {
      const valStr = typeof node.value === 'object' ? `${node.value.n}/${node.value.d}` : `${node.value}`;
      return `<span class="tm-num">${escapeHtml(valStr)}</span>`;
    }

    case 'Identifier': {
      const name = node.name;
      // Standard function names and constants
      if (['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'exp', 'ln', 'log', 'det', 'trace', 'dim', 'ker', 'rank'].includes(name)) {
        return `<span class="tm-fn">${escapeHtml(name)}</span>`;
      }
      if (['pi', '\u03c0', 'e', 'inf', 'infinity', '\u221e'].includes(name)) {
        const symbol = name === 'pi' || name === '\u03c0' ? '&pi;' : (name.startsWith('inf') || name === '\u221e' ? '&infin;' : 'e');
        return `<span class="tm-const">${symbol}</span>`;
      }
      return `<span class="tm-var">${escapeHtml(name)}</span>`;
    }

    case 'BinaryOp': {
      const op = node.op;
      const leftHtml = typesetASTNode(node.left, options);
      const rightHtml = typesetASTNode(node.right, options);

      if (op === '/' || op === '//') {
        return `
          <span class="tm-frac">
            <span class="tm-num-box">${leftHtml}</span>
            <span class="tm-frac-bar"></span>
            <span class="tm-den-box">${rightHtml}</span>
          </span>
        `;
      }

      if (op === '^') {
        return `<span class="tm-base">${leftHtml}</span><sup class="tm-sup">${rightHtml}</sup>`;
      }

      let opSymbol = escapeHtml(op);
      let opClass = 'tm-bin';

      if (['=', '==', '!=', '\u2260', '<', '<=', '\u2264', '>', '>=', '\u2265', ':=', '\u2261'].includes(op)) {
        opClass = 'tm-rel';
        if (op === '!=' || op === '\u2260') opSymbol = '&ne;';
        else if (op === '<=' || op === '\u2264') opSymbol = '&le;';
        else if (op === '>=' || op === '\u2265') opSymbol = '&ge;';
        else if (op === '==') opSymbol = '=';
      } else if (op === '*') {
        opSymbol = '&sdot;';
      } else if (op === '-') {
        opSymbol = '&minus;';
      }

      return `<span class="tm-expr">${leftHtml}<span class="${opClass}">${opSymbol}</span>${rightHtml}</span>`;
    }

    case 'UnaryOp': {
      const argHtml = typesetASTNode(node.argument, options);
      const op = node.op === '-' ? '&minus;' : escapeHtml(node.op);
      return `<span class="tm-unary"><span class="tm-prefix-op">${op}</span>${argHtml}</span>`;
    }

    case 'FunctionCall': {
      const callee = node.callee;
      if (callee.type === 'Identifier') {
        const fnName = callee.name;

        // Square root
        if (fnName === 'sqrt' && node.args.length === 1) {
          const radicand = typesetASTNode(node.args[0], options);
          return `
            <span class="tm-sqrt">
              <span class="tm-sqrt-surd">&radic;</span>
              <span class="tm-radicand">${radicand}</span>
            </span>
          `;
        }

        // Integral
        if (fnName === 'integral' || fnName === '\u222b') {
          const integrand = typesetASTNode(node.args[0], options);
          let lower = '';
          let upper = '';
          let varName = 'x';

          if (node.args.length >= 3) {
            lower = typesetASTNode(node.args[1], options);
            upper = typesetASTNode(node.args[2], options);
          }
          if (node.args.length >= 4 && node.args[3].type === 'Identifier') {
            varName = node.args[3].name;
          }

          return `
            <span class="tm-integral-wrap">
              <span class="tm-integral-block">
                <span class="tm-int-symbol">&int;</span>
                ${(lower || upper) ? `
                  <span class="tm-int-limits">
                    <span class="tm-int-upper">${upper}</span>
                    <span class="tm-int-lower">${lower}</span>
                  </span>
                ` : ''}
              </span>
              <span class="tm-integrand">${integrand}</span>
              <span class="tm-diff"><span class="tm-diff-d">d</span><span class="tm-var">${escapeHtml(varName)}</span></span>
            </span>
          `;
        }

        // Summation / Product
        if (fnName === 'sum' || fnName === 'prod' || fnName === '\u03a3' || fnName === '\u03a0') {
          const body = typesetASTNode(node.args[0], options);
          const isSum = fnName === 'sum' || fnName === '\u03a3';
          const sym = isSum ? '&sum;' : '&prod;';
          return `
            <span class="tm-bigop-wrap">
              <span class="tm-bigop-block">
                <span class="tm-bigop-symbol">${sym}</span>
              </span>
              <span class="tm-bigop-body">${body}</span>
            </span>
          `;
        }
      }

      const calleeHtml = typesetASTNode(node.callee, options);
      const argsHtml = node.args.map(a => typesetASTNode(a, options)).join(', ');
      return `<span class="tm-call">${calleeHtml}<span class="tm-paren">(</span>${argsHtml}<span class="tm-paren">)</span></span>`;
    }

    case 'Tuple': {
      const items = node.elements.map(e => typesetASTNode(e, options)).join(', ');
      return `<span class="tm-paren">(</span>${items}<span class="tm-paren">)</span>`;
    }

    case 'List': {
      // Check if this is a 2D matrix (list of lists of numbers/expressions)
      const isMatrix = node.elements.length > 0 && node.elements.every(e => e.type === 'List');
      if (isMatrix) {
        const rows = node.elements.map(rowNode => {
          const cells = (rowNode as any).elements.map((cellNode: ASTNode) => {
            return `<span class="tm-matrix-cell">${typesetASTNode(cellNode, options)}</span>`;
          }).join('');
          return `<div class="tm-matrix-row">${cells}</div>`;
        }).join('');

        const colCount = ((node.elements[0] as any).elements?.length) || 1;
        return `
          <span class="tm-matrix">
            <span class="tm-matrix-delim tm-delim-left"></span>
            <span class="tm-matrix-grid" style="grid-template-columns: repeat(${colCount}, auto);">
              ${rows}
            </span>
            <span class="tm-matrix-delim tm-delim-right"></span>
          </span>
        `;
      }

      const items = node.elements.map(e => typesetASTNode(e, options)).join(', ');
      return `<span class="tm-bracket">[</span>${items}<span class="tm-bracket">]</span>`;
    }

    default:
      return `<span class="tm-fallback">${escapeHtml(JSON.stringify(node))}</span>`;
  }
}

/**
 * Typesets mathematical string notation into HTML cleanly without tag pollution.
 */
export function typesetStringExpression(expr: string, options: TypesetOptions = { displayMode: true }): string {
  if (!expr) return '';
  const trimmed = expr.trim();

  // 1. Matrix equation / product: A * x = b or A x = b
  if ((trimmed.includes(' = ') || trimmed.includes(' * ') || trimmed.includes('=')) && trimmed.includes('[[')) {
    const parts = trimmed.split(/(\s*=\s*|\s*\*\s*)/);
    if (parts.length > 1) {
      return parts.map(p => {
        const t = p.trim();
        if (t === '=') return `<span class="tm-rel">=</span>`;
        if (t === '*') return `<span class="tm-bin">&sdot;</span>`;
        return typesetStringExpression(t, options);
      }).join(' ');
    }
  }

  // 2. Matrix: [[a, b, c], [d, e, f], [g, h, i]]
  if (trimmed.startsWith('[') && trimmed.endsWith(']') && trimmed.includes('[', 1)) {
    const matrixMatch = trimmed.match(/^\[\s*(\[\s*.+?\s*\](?:\s*,\s*\[\s*.+?\s*\])*)\s*\]$/s);
    if (matrixMatch) {
      const rowsRaw = matrixMatch[1].match(/\[\s*([^\[\]]+?)\s*\]/g);
      if (rowsRaw && rowsRaw.length > 0) {
        let maxCols = 0;
        const parsedRows = rowsRaw.map((rStr: string) => {
          const inner = rStr.replace(/^\[\s*/, '').replace(/\s*\]$/, '');
          const items = inner.split(',').map((it: string) => it.trim());
          if (items.length > maxCols) maxCols = items.length;
          return items;
        });

        const rowsHtml = parsedRows.map(items => {
          const cells = items.map((it: string) => {
            return `<span class="tm-matrix-cell">${typesetStringExpression(it, options)}</span>`;
          }).join('');
          return `<div class="tm-matrix-row">${cells}</div>`;
        }).join('');

        return `
          <span class="tm-matrix">
            <span class="tm-matrix-delim tm-delim-left"></span>
            <span class="tm-matrix-grid" style="grid-template-columns: repeat(${maxCols}, auto);">
              ${rowsHtml}
            </span>
            <span class="tm-matrix-delim tm-delim-right"></span>
          </span>
        `;
      }
    }
  }

  // 3. Definite / Indefinite Integrals: integral_0^inf ... dx
  const intMatch = trimmed.match(/^(?:\\int|\u222b)(?:_([0-9a-zA-Z\u221e\-]+)|\s*([0-9a-zA-Z\u221e\-]+))?\s*(?:\^(?:\{([^}]+)\}|\(?([0-9a-zA-Z\u221e\+\-]+)\)?))?\s+([\s\S]+?)\s+(d[a-zA-Z_][a-zA-Z0-9_]*)$/);
  if (intMatch) {
    const lower = intMatch[1] || intMatch[2] || '0';
    const upper = intMatch[3] || intMatch[4] || 'inf';
    const body = intMatch[5];
    const diff = intMatch[6];
    const varName = diff.startsWith('d') ? diff.slice(1) : diff;

    const lowerHtml = lower === 'inf' || lower === '\u221e' ? '&infin;' : typesetStringExpression(lower, options);
    const upperHtml = upper === 'inf' || upper === '\u221e' ? '&infin;' : typesetStringExpression(upper, options);
    const bodyHtml = typesetStringExpression(body, options);

    return `
      <span class="tm-integral-wrap">
        <span class="tm-integral-block">
          <span class="tm-int-symbol">&int;</span>
          <span class="tm-int-limits">
            <span class="tm-int-upper">${upperHtml}</span>
            <span class="tm-int-lower">${lowerHtml}</span>
          </span>
        </span>
        <span class="tm-integrand">${bodyHtml}</span>
        <span class="tm-diff"><span class="tm-diff-d">d</span><span class="tm-var">${escapeHtml(varName)}</span></span>
      </span>
    `;
  }

  // 4. Fractions: A // B or (A) // (B)
  const fracIdx = findTopLevelFrac(trimmed);
  if (fracIdx !== -1) {
    let num = trimmed.substring(0, fracIdx).trim();
    let den = trimmed.substring(fracIdx + 2).trim();
    if (num.startsWith('(') && num.endsWith(')')) num = num.slice(1, -1).trim();
    if (den.startsWith('(') && den.endsWith(')')) den = den.slice(1, -1).trim();

    return `
      <span class="tm-frac">
        <span class="tm-num-box">${typesetStringExpression(num, options)}</span>
        <span class="tm-frac-bar"></span>
        <span class="tm-den-box">${typesetStringExpression(den, options)}</span>
      </span>
    `;
  }

  // 5. Square root: sqrt(...) or \sqrt{...}
  const sqrtMatch = trimmed.match(/^(?:sqrt|\\sqrt|\u221a)\s*(?:\(([\s\S]+)\)|\{([\s\S]+)\})$/);
  if (sqrtMatch) {
    const inside = sqrtMatch[1] || sqrtMatch[2];
    return `
      <span class="tm-sqrt">
        <span class="tm-sqrt-surd">&radic;</span>
        <span class="tm-radicand">${typesetStringExpression(inside, options)}</span>
      </span>
    `;
  }

  // 6. Tokenize simple inline expressions with operators, variables, superscripts
  return tokenizeAndRenderMath(trimmed, options);
}

function findTopLevelFrac(str: string): number {
  let depth = 0;
  for (let i = 0; i < str.length - 1; i++) {
    const ch = str[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (depth === 0 && ch === '/' && str[i + 1] === '/') {
      return i;
    }
  }
  return -1;
}

function tokenizeAndRenderMath(str: string, options: TypesetOptions): string {
  // Token patterns:
  // 1. sqrt(...)
  // 2. ^(n+1) or ^2
  // 3. _(i+1) or _1
  // 4. Relation operators (=, <=, >=, !=, <, >)
  // 5. Binary operators (+, -, *)
  // 6. Numbers (123, 3.14)
  // 7. Functions (sin, cos, ln, exp)
  // 8. Variables (x, y, theta)
  // 9. Parentheses & punctuation

  const tokenRegex = /(sqrt\((?:[^()]+|\([^()]*\))*\))|(\^(?:\([^)]+\)|[a-zA-Z0-9]+))|(_(?:\([^)]+\)|[a-zA-Z0-9]+))|(<=|>=|!=|==|=|<|>|:=|\u2264|\u2265|\u2260|\u2261)|(\+|\-|\*|&minus;|&sdot;)|(\b\d+(?:\.\d+)?\b)|(\b(?:sin|cos|tan|ln|exp|det|sqrt|pi|inf)\b)|(\b[a-zA-Z_][a-zA-Z0-9_]*\b)|([()[\],])/g;

  let out = '';
  let lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(str)) !== null) {
    const [full, sqrtTok, supTok, subTok, relTok, binTok, numTok, fnTok, identTok, puncTok] = match;

    if (sqrtTok) {
      const inside = sqrtTok.replace(/^sqrt\(/, '').replace(/\)$/, '');
      out += `<span class="tm-sqrt"><span class="tm-sqrt-surd">&radic;</span><span class="tm-radicand">${typesetStringExpression(inside, options)}</span></span>`;
    } else if (supTok) {
      let exp = supTok.slice(1);
      if (exp.startsWith('(') && exp.endsWith(')')) exp = exp.slice(1, -1);
      out += `<sup class="tm-sup">${typesetStringExpression(exp, options)}</sup>`;
    } else if (subTok) {
      let sub = subTok.slice(1);
      if (sub.startsWith('(') && sub.endsWith(')')) sub = sub.slice(1, -1);
      out += `<sub class="tm-sub">${typesetStringExpression(sub, options)}</sub>`;
    } else if (relTok) {
      let sym = escapeHtml(relTok);
      if (relTok === '<=' || relTok === '\u2264') sym = '&le;';
      else if (relTok === '>=' || relTok === '\u2265') sym = '&ge;';
      else if (relTok === '!=' || relTok === '\u2260') sym = '&ne;';
      else if (relTok === '==') sym = '=';
      out += `<span class="tm-rel">${sym}</span>`;
    } else if (binTok) {
      const sym = binTok === '-' || binTok === '&minus;' ? '&minus;' : (binTok === '*' || binTok === '&sdot;' ? '&sdot;' : escapeHtml(binTok));
      out += `<span class="tm-bin">${sym}</span>`;
    } else if (numTok) {
      out += `<span class="tm-num">${escapeHtml(numTok)}</span>`;
    } else if (fnTok) {
      if (fnTok === 'pi') out += `<span class="tm-const">&pi;</span>`;
      else if (fnTok === 'inf') out += `<span class="tm-const">&infin;</span>`;
      else out += `<span class="tm-fn">${escapeHtml(fnTok)}</span>`;
    } else if (identTok) {
      out += `<span class="tm-var">${escapeHtml(identTok)}</span>`;
    } else if (puncTok) {
      if (puncTok === '(' || puncTok === ')') out += `<span class="tm-paren">${escapeHtml(puncTok)}</span>`;
      else if (puncTok === '[' || puncTok === ']') out += `<span class="tm-bracket">${escapeHtml(puncTok)}</span>`;
      else out += escapeHtml(puncTok);
    }
  }

  return out || escapeHtml(str);
}
