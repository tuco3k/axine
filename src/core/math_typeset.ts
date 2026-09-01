/**
 * MathTypesetter — Zero-Dependency Read-Only Mathematical Typesetting Engine
 * 
 * Generates true mathematical typography via DOM and CSS conforming to
 * Cambridge/AMS conventions, KaTeX layout metrics, and TeXbook spacing rules.
 */

import { ASTNode } from './types';
import { formatAST } from './formatter';
import { BigFraction } from './numeric/rational';

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

export function rationalToApproxString(n: bigint, d: bigint, maxDecimals: number = 6): string {
  if (d === 0n) return 'NaN';
  const frac = new BigFraction(n, d);
  const v = frac.toNumber();
  if (Math.abs(v) < 1e-12) return '0';
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(maxDecimals).replace(/\.?0+$/, '');
}

export function renderLargeRationalHtml(n: bigint, d: bigint, _options?: TypesetOptions): string {
  const approxStr = rationalToApproxString(n, d, 6);
  const nStr = n.toString();
  const dStr = d.toString();

  return `<span class="tm-large-rational" data-exact-n="${nStr}" data-exact-d="${dStr}"><span class="tm-approx-val">${approxStr}</span><span class="tm-exact-badge" title="Exact: ${nStr}/${dStr}" role="button" tabindex="0" data-n="${nStr}" data-d="${dStr}">[exact]</span><span class="tm-exact-expanded hidden"><span class="tm-frac" role="math" aria-label="${nStr} / ${dStr}"><span class="tm-num-box"><span class="tm-num">${nStr}</span></span><span class="tm-frac-bar"><span class="tm-frac-slash">/</span></span><span class="tm-den-box"><span class="tm-num">${dStr}</span></span></span></span></span>`;
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
      return `<span class="tm-num">${escapeHtml(node.raw)}</span>`;
    }

    case 'Identifier': {
      const name = node.name;
      // Standard function names and constants
      if (['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'exp', 'ln', 'log', 'det', 'trace', 'dim', 'ker', 'rank', 'lim'].includes(name)) {
        return `<span class="tm-fn">${escapeHtml(name)}</span>`;
      }
      if (['pi', '\u03c0', 'e', 'inf', 'infinity', '\u221e'].includes(name)) {
        const symbol = name === 'pi' || name === '\u03c0' ? '&pi;' : (name.startsWith('inf') || name === '\u221e' ? '&infin;' : 'e');
        return `<span class="tm-const">${symbol}</span>`;
      }
      if (name.startsWith('Delta_') || name.startsWith('Delta')) {
        const sub = name.replace(/^Delta_?/, '');
        return `<span class="tm-var">&Delta;${escapeHtml(sub)}</span>`;
      }
      return `<span class="tm-var">${escapeHtml(name)}</span>`;
    }

    case 'BinaryOp': {
      const op = node.op;
      const leftHtml = typesetASTNode(node.left, options);
      const rightHtml = typesetASTNode(node.right, options);

      if (op === '/' || (op as any) === '//') {
        if (node.left.type === 'NumberLiteral' && node.right.type === 'NumberLiteral') {
          const numRaw = node.left.raw.replace(/_/g, '');
          const denRaw = node.right.raw.replace(/_/g, '');
          if (/^-?\d+$/.test(numRaw) && /^\d+$/.test(denRaw)) {
            if (numRaw.replace('-', '').length > 12 || denRaw.length > 12) {
              return renderLargeRationalHtml(BigInt(numRaw), BigInt(denRaw), options);
            }
          }
        }

        return `
          <span class="tm-frac" role="math" aria-label="${escapeHtml(formatAST(node.left))} / ${escapeHtml(formatAST(node.right))}">
            <span class="tm-num-box">${leftHtml}</span>
            <span class="tm-frac-bar"><span class="tm-frac-slash">/</span></span>
            <span class="tm-den-box">${rightHtml}</span>
          </span>
        `;
      }

      if (op === '^') {
        return `<span class="tm-base">${leftHtml}</span><sup class="tm-sup">${rightHtml}</sup>`;
      }

      let opSymbol = escapeHtml(op);
      let opClass = 'tm-bin';

      if (['=', '==', '!=', '<', '<=', '>', '>='].includes(op)) {
        opClass = 'tm-rel';
        if (op === '!=') opSymbol = '&ne;';
        else if (op === '<=') opSymbol = '&le;';
        else if (op === '>=') opSymbol = '&ge;';
        else if (op === '==') opSymbol = '=';
      } else if (op === '*') {
        opSymbol = '&sdot;';
      } else if (op === '-') {
        opSymbol = '&minus;';
      }

      return `<span class="tm-expr">${leftHtml}<span class="${opClass}">${opSymbol}</span>${rightHtml}</span>`;
    }

    case 'UnaryOp': {
      const argHtml = typesetASTNode(node.operand, options);
      const op = node.op === '-' ? '&minus;' : escapeHtml(node.op);
      return `<span class="tm-unary"><span class="tm-prefix-op">${op}</span>${argHtml}</span>`;
    }

    case 'FunctionCall': {
      const fnName = node.callee;

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

        const hasLimits = Boolean(lower || upper);

        return `
          <span class="tm-integral-wrap">
            <span class="tm-integral-block">
              <span class="tm-int-symbol tm-clickable" data-symbol="\u222b" data-parent-type="integral">&int;</span>
              ${hasLimits ? `
                <span class="tm-int-limits">
                  <span class="tm-int-upper">${upper}</span>
                  <span class="tm-int-lower">${lower}</span>
                </span>
              ` : ''}
            </span>
            <span class="tm-integrand">${integrand}</span>
            <span class="tm-diff tm-clickable" data-symbol="d${escapeHtml(varName)}" data-parent-type="integral"><span class="tm-diff-d">d</span><span class="tm-var">${escapeHtml(varName)}</span></span>
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
              <span class="tm-bigop-symbol tm-clickable" data-symbol="${isSum ? '\u03a3' : '\u03a0'}" data-parent-type="summation">${sym}</span>
            </span>
            <span class="tm-bigop-body">${body}</span>
          </span>
        `;
      }

      // Limit
      if (fnName === 'lim' || fnName === 'limit') {
        const body = node.args.length > 0 ? typesetASTNode(node.args[0], options) : '';
        const target = node.args.length > 1 ? typesetASTNode(node.args[1], options) : '';
        return `
          <span class="tm-lim-wrap">
            <span class="tm-fn tm-clickable" data-symbol="lim" data-parent-type="limit">lim</span>
            ${target ? `<sub class="tm-sub">${target}</sub>` : ''}
            ${body ? ` ${body}` : ''}
          </span>
        `;
      }

      const argsHtml = node.args.map(a => typesetASTNode(a, options)).join(', ');
      return `<span class="tm-call"><span class="tm-fn">${escapeHtml(fnName)}</span><span class="tm-paren">(</span>${argsHtml}<span class="tm-paren">)</span></span>`;
    }

    case 'Diff': {
      const sym = node.isPartial ? '&part;' : 'd';
      const opSym = node.isPartial ? '\u2202' : 'd';
      const varName = node.variable;
      const opHtml = `
        <span class="tm-frac tm-diff-frac">
          <span class="tm-num-box"><span class="tm-diff-d tm-clickable" data-symbol="${opSym}" data-parent-type="derivative">${sym}</span></span>
          <span class="tm-frac-bar"></span>
          <span class="tm-den-box"><span class="tm-diff tm-clickable" data-symbol="${opSym}${escapeHtml(varName)}" data-parent-type="derivative" data-var="${escapeHtml(varName)}"><span class="tm-diff-d">${sym}</span><span class="tm-var">${escapeHtml(varName)}</span></span></span>
        </span>
      `;
      if (node.expr) {
        return `${opHtml} ${typesetASTNode(node.expr, options)}`;
      }
      return opHtml;
    }

    case 'BigOp': {
      if (node.op === 'integral') {
        const lowerHtml = node.start ? typesetASTNode(node.start, options) : '';
        const upperHtml = node.end ? typesetASTNode(node.end, options) : '';
        const bodyHtml = typesetASTNode(node.body, options);
        const hasLimits = Boolean(lowerHtml || upperHtml);

        return `
          <span class="tm-integral-wrap">
            <span class="tm-integral-block">
              <span class="tm-int-symbol tm-clickable" data-symbol="\u222b" data-parent-type="integral"${hasLimits ? ` data-bounds-lower="${escapeHtml(node.start ? formatAST(node.start) : '')}" data-bounds-upper="${escapeHtml(node.end ? formatAST(node.end) : '')}"` : ''}>&int;</span>
              ${hasLimits ? `
                <span class="tm-int-limits">
                  <span class="tm-int-upper">${upperHtml}</span>
                  <span class="tm-int-lower">${lowerHtml}</span>
                </span>
              ` : ''}
            </span>
            <span class="tm-integrand">${bodyHtml}</span>
            <span class="tm-diff tm-clickable" data-symbol="d${escapeHtml(node.variable)}" data-parent-type="integral" data-integrand="${escapeHtml(formatAST(node.body))}" data-var="${escapeHtml(node.variable)}"><span class="tm-diff-d">d</span><span class="tm-var">${escapeHtml(node.variable)}</span></span>
          </span>
        `;
      }

      const isSum = node.op === 'sum';
      const sym = isSum ? '&sum;' : '&prod;';
      const lowerHtml = node.start ? `<span class="tm-var">${escapeHtml(node.variable)}</span>=<span class="tm-num">${typesetASTNode(node.start, options)}</span>` : '';
      const upperHtml = node.end ? typesetASTNode(node.end, options) : '';
      const bodyHtml = typesetASTNode(node.body, options);

      return `
        <span class="tm-bigop-wrap">
          <span class="tm-bigop-block">
            <span class="tm-bigop-symbol tm-clickable" data-symbol="${isSum ? '\u03a3' : '\u03a0'}" data-parent-type="summation">${sym}</span>
            <span class="tm-bigop-limits">
              <span class="tm-bigop-upper">${upperHtml}</span>
              <span class="tm-bigop-lower">${lowerHtml}</span>
            </span>
          </span>
          <span class="tm-bigop-body">${bodyHtml}</span>
        </span>
      `;
    }

    case 'Limit': {
      const varHtml = typesetASTNode({ type: 'Identifier', name: node.variable, span: node.span }, options);
      const targetHtml = typesetASTNode(node.target, options);
      const dirHtml = node.direction === 'right' ? '<sup>+</sup>' : (node.direction === 'left' ? '<sup>&minus;</sup>' : '');
      const exprHtml = typesetASTNode(node.expr, options);

      return `
        <span class="tm-lim-wrap">
          <span class="tm-fn tm-clickable" data-symbol="lim" data-parent-type="limit" data-var="${escapeHtml(node.variable)}" data-point="${escapeHtml(formatAST(node.target))}" data-direction="${node.direction}">lim</span>
          <sub class="tm-sub">${varHtml} &rarr; ${targetHtml}${dirHtml}</sub>
          <span class="tm-lim-body">${exprHtml}</span>
        </span>
      `;
    }

    case 'Tuple': {
      const items = node.elements.map(e => typesetASTNode(e, options)).join(', ');
      return `<span class="tm-paren">(</span>${items}<span class="tm-paren">)</span>`;
    }

    case 'List': {
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
 * Formats English prose strings preserving spaces and system font, while typesetting embedded $math$ fragments.
 */
export function typesetProseWithMath(text: string, options: TypesetOptions = { displayMode: false }): string {
  const parts = text.split('$');
  let html = '';
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      html += typesetStringExpression(parts[i], { ...options, displayMode: false });
    } else {
      html += `<span class="tm-prose">${escapeHtml(parts[i])}</span>`;
    }
  }
  return html;
}

/**
 * Typesets mathematical string notation into HTML cleanly without tag pollution.
 */
export function typesetStringExpression(expr: string, options: TypesetOptions = { displayMode: true }): string {
  if (!expr) return '';
  let trimmed = expr.trim();

  // 0. Handle unknown(...) results and Verified/Not prose
  if (trimmed.startsWith('unknown(') && trimmed.endsWith(')')) {
    const inner = trimmed.slice(8, -1);
    const commaIdx = inner.indexOf(',');
    if (commaIdx !== -1) {
      const reason = inner.substring(0, commaIdx).trim();
      let detail = inner.substring(commaIdx + 1).trim();
      if (detail.startsWith('"') && detail.endsWith('"')) {
        detail = detail.slice(1, -1);
      } else if (detail.startsWith("'") && detail.endsWith("'")) {
        detail = detail.slice(1, -1);
      }
      return `<span class="tm-unknown">unknown(${escapeHtml(reason)}, ${typesetProseWithMath(detail, options)})</span>`;
    } else {
      return `<span class="tm-unknown">unknown(${escapeHtml(inner)})</span>`;
    }
  }

  if (trimmed.startsWith('Verified:') || trimmed.startsWith('Not ')) {
    return typesetProseWithMath(trimmed, options);
  }

  // 0.5 Pure Rational: A/B or A//B
  const pureFracMatch = trimmed.match(/^(-?\d+)\s*(?:\/\/|\/)\s*(\d+)$/);
  if (pureFracMatch) {
    const num = pureFracMatch[1];
    const den = pureFracMatch[2];
    if (num.replace('-', '').length > 12 || den.length > 12) {
      return renderLargeRationalHtml(BigInt(num), BigInt(den), options);
    }
    return `
      <span class="tm-frac" role="math" aria-label="${escapeHtml(num)} / ${escapeHtml(den)}">
        <span class="tm-num-box"><span class="tm-num">${escapeHtml(num)}</span></span>
        <span class="tm-frac-bar"><span class="tm-frac-slash">/</span></span>
        <span class="tm-den-box"><span class="tm-num">${escapeHtml(den)}</span></span>
      </span>
    `;
  }

  // Strip matching outer parentheses if whole expression is wrapped: ( A ) -> A
  while (isWrappedInMatchingParens(trimmed)) {
    trimmed = trimmed.slice(1, -1).trim();
  }

  // 1. Matrix: [[a, b, c], [d, e, f], [g, h, i]]
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

  // 2. Top-level Relation operators (=, ==, !=, <=, >=, <, >, :=, ->)
  const relInfo = findTopLevelRelation(trimmed);
  if (relInfo !== null) {
    const { index, length, op } = relInfo;
    const left = trimmed.substring(0, index).trim();
    const right = trimmed.substring(index + length).trim();

    let sym = escapeHtml(op);
    if (op === '!=') sym = '&ne;';
    else if (op === '<=') sym = '&le;';
    else if (op === '>=') sym = '&ge;';
    else if (op === '==') sym = '=';
    else if (op === '->') sym = '&rarr;';

    return `${typesetStringExpression(left, options)} <span class="tm-rel">${sym}</span> ${typesetStringExpression(right, options)}`;
  }

  // 3. Limit operator: lim(Delta_x -> 0) (Delta_y // Delta_x) or lim_(Delta_x -> 0)
  const limMatch = trimmed.match(/^lim(?:_([^\s]+)|\(([^)]+)\))?\s*([\s\S]*)$/);
  if (limMatch && (limMatch[1] || limMatch[2] || limMatch[3])) {
    const sub = limMatch[1] || limMatch[2];
    const rest = limMatch[3]?.trim();
    const subHtml = sub ? `<sub class="tm-sub">${typesetStringExpression(sub, options)}</sub>` : '';
    const restHtml = rest ? ` ${typesetStringExpression(rest, options)}` : '';
    return `<span class="tm-fn tm-clickable" data-symbol="lim" data-parent-type="limit">lim</span>${subHtml}${restHtml}`;
  }

  // 4. Definite / Indefinite Integrals: \u222b ... dx or \u222b_a^b ... dx
  const intMatch = trimmed.match(/^(?:integral|\u222b)(?:_([0-9a-zA-Z\u221e\-]+)|\s*([0-9a-zA-Z\u221e\-]+))?\s*(?:\^(?:\{([^}]+)\}|\(?([0-9a-zA-Z\u221e\+\-]+)\)?))?\s+([\s\S]+?)\s+(d[a-zA-Z_][a-zA-Z0-9_]*)$/);
  if (intMatch) {
    const lower = intMatch[1] || intMatch[2];
    const upper = intMatch[3] || intMatch[4];
    const body = intMatch[5];
    const diff = intMatch[6];
    const varName = diff.startsWith('d') ? diff.slice(1) : diff;

    const hasLimits = Boolean(lower || upper);
    const lowerHtml = lower ? (lower === 'inf' || lower === '\u221e' ? '&infin;' : typesetStringExpression(lower, options)) : '';
    const upperHtml = upper ? (upper === 'inf' || upper === '\u221e' ? '&infin;' : typesetStringExpression(upper, options)) : '';
    const bodyHtml = typesetStringExpression(body, options);

    return `
      <span class="tm-integral-wrap">
        <span class="tm-integral-block">
          <span class="tm-int-symbol tm-clickable" data-symbol="\u222b" data-parent-type="integral"${hasLimits ? ` data-bounds-lower="${escapeHtml(lower || '')}" data-bounds-upper="${escapeHtml(upper || '')}"` : ''}>&int;</span>
          ${hasLimits ? `
            <span class="tm-int-limits">
              <span class="tm-int-lower">${lowerHtml}</span>
              <span class="tm-int-upper">${upperHtml}</span>
            </span>
          ` : ''}
        </span>
        <span class="tm-integrand">${bodyHtml}</span>
        <span class="tm-diff tm-clickable" data-symbol="d${escapeHtml(varName)}" data-parent-type="integral" data-integrand="${escapeHtml(body)}" data-var="${escapeHtml(varName)}"><span class="tm-diff-d">d</span><span class="tm-var">${escapeHtml(varName)}</span></span>
      </span>
    `;
  }

  // 5. Differentials with operand: d//dx f(x) or \u2202//\u2202x f(x, y) or stand-alone d//dx
  const diffMatch = trimmed.match(/^((?:d|\u2202)\/\/(?:d|\u2202)([a-zA-Z_][a-zA-Z0-9_]*))(?:\s+([\s\S]+))?$/);
  if (diffMatch) {
    const isPartial = diffMatch[1].startsWith('\u2202');
    const varName = diffMatch[2];
    const operand = diffMatch[3]?.trim();
    const sym = isPartial ? '&part;' : 'd';
    const opSym = isPartial ? '\u2202' : 'd';

    const opHtml = `
      <span class="tm-frac tm-diff-frac">
        <span class="tm-num-box"><span class="tm-diff-d tm-clickable" data-symbol="${opSym}" data-parent-type="derivative">${sym}</span></span>
        <span class="tm-frac-bar"><span class="tm-frac-slash">/</span></span>
        <span class="tm-den-box"><span class="tm-diff tm-clickable" data-symbol="${opSym}${escapeHtml(varName)}" data-parent-type="derivative" data-var="${escapeHtml(varName)}"><span class="tm-diff-d">${sym}</span><span class="tm-var">${escapeHtml(varName)}</span></span></span>
      </span>
    `;

    if (operand) {
      return `${opHtml} ${typesetStringExpression(operand, options)}`;
    }
    return opHtml;
  }

  // 6. Binary Multiplication of terms containing fractions (e.g. (dz // du) * (du // dx))
  if (trimmed.includes(' * ')) {
    const factors = trimmed.split(' * ');
    return factors.map(f => typesetStringExpression(f.trim(), options)).join(' <span class="tm-bin">&sdot;</span> ');
  }

  // 7. Top-level Fractions: A // B
  const fracIdx = findTopLevelFrac(trimmed);
  if (fracIdx !== -1) {
    let num = trimmed.substring(0, fracIdx).trim();
    let den = trimmed.substring(fracIdx + 2).trim();
    if (num.startsWith('(') && num.endsWith(')')) num = num.slice(1, -1).trim();
    if (den.startsWith('(') && den.endsWith(')')) den = den.slice(1, -1).trim();

    if (/^-?\d+$/.test(num) && /^\d+$/.test(den) && (num.replace('-', '').length > 12 || den.length > 12)) {
      return renderLargeRationalHtml(BigInt(num), BigInt(den), options);
    }

    return `
      <span class="tm-frac" role="math" aria-label="${escapeHtml(num)} / ${escapeHtml(den)}">
        <span class="tm-num-box">${typesetStringExpression(num, options)}</span>
        <span class="tm-frac-bar"><span class="tm-frac-slash">/</span></span>
        <span class="tm-den-box">${typesetStringExpression(den, options)}</span>
      </span>
    `;
  }

  // 8. Square root: sqrt(...) or \u221a(...)
  const sqrtMatch = trimmed.match(/^(?:sqrt|\u221a)\s*(?:\(([\s\S]+)\)|\{([\s\S]+)\})$/);
  if (sqrtMatch) {
    const inside = sqrtMatch[1] || sqrtMatch[2];
    return `
      <span class="tm-sqrt">
        <span class="tm-sqrt-surd">&radic;</span>
        <span class="tm-radicand">${typesetStringExpression(inside, options)}</span>
      </span>
    `;
  }

  // 9. Tokenize simple inline expressions with operators, variables, superscripts
  return tokenizeAndRenderMath(trimmed, options);
}

function isWrappedInMatchingParens(str: string): boolean {
  if (!str.startsWith('(') || !str.endsWith(')')) return false;
  let depth = 0;
  for (let i = 0; i < str.length - 1; i++) {
    if (str[i] === '(') depth++;
    else if (str[i] === ')') depth--;
    if (depth === 0) return false;
  }
  return true;
}

function findTopLevelRelation(str: string): { index: number; length: number; op: string } | null {
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (depth === 0) {
      if (str.startsWith('==', i)) return { index: i, length: 2, op: '==' };
      if (str.startsWith('!=', i)) return { index: i, length: 2, op: '!=' };
      if (str.startsWith('<=', i)) return { index: i, length: 2, op: '<=' };
      if (str.startsWith('>=', i)) return { index: i, length: 2, op: '>=' };
      if (str.startsWith(':=', i)) return { index: i, length: 2, op: ':=' };
      if (str.startsWith('->', i)) return { index: i, length: 2, op: '->' };
      if (ch === '=' && str[i - 1] !== ':' && str[i + 1] !== '=') return { index: i, length: 1, op: '=' };
      if (ch === '<' && str[i + 1] !== '=') return { index: i, length: 1, op: '<' };
      if (ch === '>' && str[i + 1] !== '=') return { index: i, length: 1, op: '>' };
    }
  }
  return null;
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
  const tokenRegex = /(-?\b\d+\s*\/\s*\d+\b)|(sqrt\((?:[^()]+|\([^()]*\))*\))|(\^(?:\{[^}]+\}|\([^)]+\)|[a-zA-Z0-9*+\-]+))|(_(?:\{[^}]+\}|\([^)]+\)|[a-zA-Z0-9*+\-]+))|(&Delta;[a-zA-Z_][a-zA-Z0-9_]*|&Delta;)|(&rarr;|&infin;)|(<=|>=|!=|==|=|<|>|:=|\u2264|\u2265|\u2260|\u2261|->)|(\+|\-|\*|&minus;|&sdot;)|(\b\d+(?:\.\d+)?\b)|(\b(?:sin|cos|tan|ln|exp|det|sqrt|pi|inf)\b)|(\b[a-zA-Z][a-zA-Z0-9]*\b)|([()[\],'{}:])/g;

  let out = '';
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(str)) !== null) {
    const [, fracTok, sqrtTok, supTok, subTok, deltaTok, entityTok, relTok, binTok, numTok, fnTok, identTok, puncTok] = match;

    if (fracTok) {
      const [numRaw, denRaw] = fracTok.split('/').map(s => s.trim());
      if (/^-?\d+$/.test(numRaw) && /^\d+$/.test(denRaw)) {
        if (numRaw.replace('-', '').length > 12 || denRaw.length > 12) {
          out += renderLargeRationalHtml(BigInt(numRaw), BigInt(denRaw), options);
        } else {
          out += `<span class="tm-frac" role="math" aria-label="${escapeHtml(numRaw)} / ${escapeHtml(denRaw)}"><span class="tm-num-box"><span class="tm-num">${escapeHtml(numRaw)}</span></span><span class="tm-frac-bar"><span class="tm-frac-slash">/</span></span><span class="tm-den-box"><span class="tm-num">${escapeHtml(denRaw)}</span></span></span>`;
        }
      } else {
        out += escapeHtml(fracTok);
      }
    } else if (sqrtTok) {
      const inside = sqrtTok.replace(/^sqrt\(/, '').replace(/\)$/, '');
      out += `<span class="tm-sqrt"><span class="tm-sqrt-surd">&radic;</span><span class="tm-radicand">${typesetStringExpression(inside, options)}</span></span>`;
    } else if (supTok) {
      let exp = supTok.slice(1);
      if ((exp.startsWith('(') && exp.endsWith(')')) || (exp.startsWith('{') && exp.endsWith('}'))) exp = exp.slice(1, -1);
      out += `<sup class="tm-sup">${typesetStringExpression(exp, options)}</sup>`;
    } else if (subTok) {
      let sub = subTok.slice(1);
      if ((sub.startsWith('(') && sub.endsWith(')')) || (sub.startsWith('{') && sub.endsWith('}'))) sub = sub.slice(1, -1);
      out += `<sub class="tm-sub">${typesetStringExpression(sub, options)}</sub>`;
    } else if (deltaTok) {
      out += `<span class="tm-var">${deltaTok}</span>`;
    } else if (entityTok) {
      out += `<span class="tm-const">${entityTok}</span>`;
    } else if (relTok) {
      let sym = escapeHtml(relTok);
      if (relTok === '<=' || relTok === '\u2264') sym = '&le;';
      else if (relTok === '>=' || relTok === '\u2265') sym = '&ge;';
      else if (relTok === '!=' || relTok === '\u2260') sym = '&ne;';
      else if (relTok === '==') sym = '=';
      else if (relTok === '->') sym = '&rarr;';
      out += `<span class="tm-rel">${sym}</span>`;
    } else if (binTok) {
      const sym = binTok === '-' || binTok === '&minus;' ? '&minus;' : (binTok === '*' || binTok === '&sdot;' ? '&sdot;' : escapeHtml(binTok));
      out += `<span class="tm-bin">${sym}</span>`;
    } else if (numTok) {
      out += `<span class="tm-num">${escapeHtml(numTok)}</span>`;
    } else if (fnTok) {
      if (fnTok === 'pi') out += `<span class="tm-const">&pi;</span>`;
      else if (fnTok === 'inf') out += `<span class="tm-const">&infin;</span>`;
      else if (fnTok === 'lim') out += `<span class="tm-fn tm-clickable" data-symbol="lim" data-parent-type="limit">${escapeHtml(fnTok)}</span>`;
      else out += `<span class="tm-fn">${escapeHtml(fnTok)}</span>`;
    } else if (identTok) {
      if (identTok === 'sum' || identTok === '\u03a3') {
        out += `<span class="tm-bigop-symbol tm-clickable" data-symbol="\u03a3" data-parent-type="summation">&sum;</span>`;
      } else if (identTok.startsWith('d') && identTok.length > 1) {
        out += `<span class="tm-diff tm-clickable" data-symbol="${escapeHtml(identTok)}" data-parent-type="differential">${escapeHtml(identTok)}</span>`;
      } else if (identTok.startsWith('Delta')) {
        const sub = identTok.replace(/^Delta_?/, '');
        out += `<span class="tm-var">&Delta;${escapeHtml(sub)}</span>`;
      } else {
        out += `<span class="tm-var">${escapeHtml(identTok)}</span>`;
      }
    } else if (puncTok) {
      if (puncTok === "'") out += `<span class="tm-prime">&prime;</span>`;
      else if (puncTok === '(' || puncTok === ')') out += `<span class="tm-paren">${escapeHtml(puncTok)}</span>`;
      else if (puncTok === '[' || puncTok === ']') out += `<span class="tm-bracket">${escapeHtml(puncTok)}</span>`;
      else out += escapeHtml(puncTok);
    }
  }

  return out || escapeHtml(str);
}
