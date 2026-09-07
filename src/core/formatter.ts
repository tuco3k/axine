import { ASTNode, BinaryOpNode } from './types';
import {
  PREC_ADD,
  PREC_AND,
  PREC_BARE_CALL,
  PREC_COMPARE,
  PREC_EXPLICIT_MUL,
  PREC_IMPLICIT_MUL,
  PREC_IN,
  PREC_NONE,
  PREC_NOT,
  PREC_OR,
  PREC_POSTFIX,
  PREC_POW,
  PREC_UNARY,
} from './parser';

export function formatAST(node: ASTNode): string {
  return formatNode(node, PREC_NONE);
}

function getNodePrecedence(node: ASTNode): number {
  switch (node.type) {
    case 'NumberLiteral':
    case 'Identifier':
    case 'Tuple':
    case 'List':
      return 100;
    case 'FunctionCall':
      return node.isBare ? PREC_BARE_CALL : 100;
    case 'PostfixOp':
      return PREC_POSTFIX;
    case 'UnaryOp':
      return node.op === 'not' ? PREC_NOT : PREC_UNARY;
    case 'BinaryOp':
      if (node.isImplicit) return PREC_IMPLICIT_MUL;
      switch (node.op) {
        case '^': return PREC_POW;
        case '*':
        case '/':
        case '%': return PREC_EXPLICIT_MUL;
        case '+':
        case '-': return PREC_ADD;
        case '=':
        case '==':
        case '!=':
        case '<':
        case '<=':
        case '>':
        case '>=': return PREC_COMPARE;
        case 'in': return PREC_IN;
        case 'and': return PREC_AND;
        case 'or': return PREC_OR;
      }
      return PREC_NONE;
    case 'Index':
      return PREC_POSTFIX;
    case 'If':
    case 'Lambda':
    case 'NamedArg':
    case 'Assignment':
    case 'GlobalAssignment':
    case 'Block':
    case 'Diff':
    case 'BigOp':
    case 'Claim':
    case 'StringLiteral':
    case 'FunctionDef':
    case 'Quote':
    case 'Unquote':
    case 'Build':
    case 'Match':
    case 'RuleDecl':
    case 'Range':
    case 'AxisDecl':
    case 'Interval':
    case 'Set':
    case 'SetComprehension':
    case 'Multiset':
    case 'Fold':
    case 'Map':
      return PREC_NONE;
    default:
      return PREC_NONE;
  }
}

const KEYWORDS = new Set([
  'true', 'false', 'none', 'inf', 'infty', 'left', 'right'
]);

function formatIdent(name: string): string {
  if (name.length > 1 && !KEYWORDS.has(name) && /^[a-zA-Z_]/.test(name)) {
    return ':' + name;
  }
  return name;
}

function formatNode(node: ASTNode, parentPrec: number): string {
  switch (node.type) {
    case 'NumberLiteral': {
      return node.raw;
    }
    case 'StringLiteral': {
      return `"${node.value}"`;
    }
    case 'Identifier': {
      return formatIdent(node.name);
    }
    case 'Tuple': {
      return `(${node.elements.map(e => formatNode(e, PREC_NONE)).join(', ')})`;
    }
    case 'List': {
      return `[${node.elements.map(e => formatNode(e, PREC_NONE)).join(', ')}]`;
    }
    case 'Block': {
      return `{\n  ${node.statements.map(s => formatNode(s, PREC_NONE)).join(';\n  ')}\n}`;
    }
    case 'Range': {
      let res = `${formatIdent(node.variable)} \\in ${formatNode(node.start, PREC_IN)}..${formatNode(node.end, PREC_IN)}`;
      if (node.step) {
        res += ` \\step ${formatNode(node.step, PREC_IN)}`;
      }
      return res;
    }
    case 'Diff': {
      const op = node.isPartial ? '\u2202//\u2202' : 'd//d';
      return `${op}${formatIdent(node.variable)} ${formatNode(node.expr, PREC_UNARY)}`;
    }
    case 'BigOp': {
      if (node.op === 'integral') {
        const diffVar = node.variable.length > 1 ? `d:${node.variable}` : `d${node.variable}`;
        if (node.start && node.end) {
          return `\u222b_${formatNode(node.start, PREC_POSTFIX)}^${formatNode(node.end, PREC_POSTFIX)} ${formatNode(node.body, PREC_NONE)} ${diffVar}`;
        }
        return `\u222b ${formatNode(node.body, PREC_NONE)} ${diffVar}`;
      }
      const sym = node.op === 'sum' ? 'Σ' : 'Π';
      const startStr = node.start ? formatNode(node.start, PREC_IN) : '1';
      const endStr = node.end ? formatNode(node.end, PREC_IN) : 'n';
      return `${sym}(${formatIdent(node.variable)} \\in ${startStr}..${endStr}, ${formatNode(node.body, PREC_NONE)})`;
    }
    case 'Limit': {
      const dirStr = node.direction === 'right' ? '+' : (node.direction === 'left' ? '-' : '');
      return `lim(${formatIdent(node.variable)} -> ${formatNode(node.target, PREC_NONE)}${dirStr}, ${formatNode(node.expr, PREC_NONE)})`;
    }
    case 'Claim': {
      return `\\claim ${node.name} {\n  \\statement: "${node.statement}",\n  \\proved_by: "${node.provedBy}",\n  \\relevance: "${node.relevance}",\n  \\kind: "${node.kind}",\n  \\shadow: ${formatNode(node.shadow, PREC_NONE)},\n  \\expect: ${formatNode(node.expect, PREC_NONE)}\n}`;
    }
    case 'If': {
      const res = `\\if ${formatNode(node.condition, PREC_NONE)} \\then ${formatNode(node.thenBranch, PREC_NONE)} \\else ${formatNode(node.elseBranch, PREC_NONE)}`;
      if (parentPrec > PREC_NONE) {
        return `(${res})`;
      }
      return res;
    }
    case 'Lambda': {
      const paramsStr = node.params.length === 1 ? formatIdent(node.params[0]) : `(${node.params.map(formatIdent).join(', ')})`;
      const res = `${paramsStr} -> ${formatNode(node.body, PREC_NONE)}`;
      if (parentPrec > PREC_NONE) {
        return `(${res})`;
      }
      return res;
    }
    case 'NamedArg': {
      return `\\${node.name.replace(/^[:\\]/, '')} ${formatNode(node.value, PREC_NONE)}`;
    }
    case 'Unimport': {
      return `\\unimport ${formatIdent(node.name)}`;
    }
    case 'Assignment': {
      return `${formatIdent(node.target)} = ${formatNode(node.value, PREC_NONE)}`;
    }
    case 'GlobalAssignment': {
      return `${formatIdent(node.target)} = ${formatNode(node.value, PREC_NONE)}`;
    }
    case 'FunctionDef': {
      return `${formatIdent(node.name)}(${node.params.map(formatIdent).join(', ')}) = ${formatNode(node.body, PREC_NONE)}`;
    }
    case 'FunctionCall': {
      const calleeStr = formatIdent(node.callee);
      if (node.isBare && node.args.length === 1) {
        const argStr = formatNode(node.args[0], PREC_BARE_CALL);
        const res = `${calleeStr}(${argStr})`;
        if (parentPrec > PREC_BARE_CALL) {
          return `(${res})`;
        }
        return res;
      }
      return `${calleeStr}(${node.args.map(a => formatNode(a, PREC_NONE)).join(', ')})`;
    }
    case 'PostfixOp': {
      if (node.op === '!') {
        const operandStr = formatNode(node.operand, PREC_POSTFIX);
        return `${operandStr}!`;
      }
      if (node.op === '°') {
        const operandStr = formatNode(node.operand, PREC_POSTFIX);
        return `${operandStr}°`;
      }
      if (node.op === 'superscript') {
        const operandStr = formatNode(node.operand, PREC_POSTFIX);
        const expStr = toSuperscript(node.exponent?.toString() ?? '2');
        return `${operandStr}${expStr}`;
      }
      const operandStr = formatNode(node.operand, PREC_POSTFIX);
      return `${operandStr} ${node.op}`;
    }
    case 'UnaryOp': {
      if (node.op === 'not') {
        const operandStr = formatNode(node.operand, PREC_NOT);
        const res = `\\not ${operandStr}`;
        if (parentPrec > PREC_NOT) return `(${res})`;
        return res;
      }
      const myPrec = PREC_UNARY;
      if (node.op === '-' && node.operand.type === 'BinaryOp' && node.operand.op === '^') {
        return `-(${formatNode(node.operand, PREC_NONE)})`;
      }
      const operandStr = formatNode(node.operand, myPrec);
      const space = (node.op.length > 1 || /^[a-zA-Z]/.test(node.op)) ? ' ' : '';
      const res = `${node.op}${space}${operandStr}`;
      if (parentPrec > myPrec) {
        return `(${res})`;
      }
      return res;
    }
    case 'MemberAccess': {
      return `${formatNode(node.target, PREC_POSTFIX)}.${formatIdent(node.property)}`;
    }
    case 'RecordDef': {
      return `\\record { ${node.fields.map(formatIdent).join(', ')} }`;
    }
    case 'RecordWith': {
      const updatesStr = node.updates.map(u => `${formatIdent(u.name)}: ${formatNode(u.value, PREC_NONE)}`).join(', ');
      return `${formatNode(node.target, PREC_COMPARE)} \\with { ${updatesStr} }`;
    }
    case 'DimensionDecl': {
      return `\\dimension ${node.dimensions.map(formatIdent).join(', ')}`;
    }
    case 'UnitDecl': {
      if (node.dimension) {
        return `\\unit ${formatIdent(node.name)} : ${formatIdent(node.dimension)}`;
      }
      return `\\unit ${formatIdent(node.name)} = ${formatNode(node.definition!, PREC_NONE)}`;
    }
    case 'OperatorDecl': {
      const fixStr = node.fixity !== 'infix' ? `\\${node.fixity} ` : '';
      let res = `\\operator ${fixStr}${node.op} (${node.params.join(', ')}) = ${formatNode(node.body, PREC_NONE)}`;
      if (node.precedence !== undefined) res += ` \\precedence: ${node.precedence}`;
      if (node.associativity) res += ` \\associativity: :${node.associativity}`;
      return res;
    }
    case 'KindDecl': {
      const paramStr = node.params.length > 0 ? `(${node.params.map(formatIdent).join(', ')})` : '';
      const extStr = node.extendsKind ? ` \\extends ${formatIdent(node.extendsKind.name)}${node.extendsKind.args.length > 0 ? `(${node.extendsKind.args.map(formatIdent).join(', ')})` : ''}` : '';
      let body = '';
      if (node.operations.length > 0) {
        body += `\\operations: [${node.operations.map(formatIdent).join(', ')}]`;
      }
      if (node.axioms.length > 0) {
        if (body) body += ', ';
        body += `\\axioms: [${node.axioms.map(a => `"${a}"`).join(', ')}]`;
      }
      return `\\kind ${formatIdent(node.name)}${paramStr}${extStr} { ${body} }`;
    }
    case 'RuleDecl': {
      let res = `\\rule ${formatNode(node.pattern, PREC_NONE)} => ${formatNode(node.replacement, PREC_NONE)}`;
      if (node.requires) res += ` \\requires: ${formatNode(node.requires, PREC_NONE)}`;
      return res;
    }
    case 'ModuleDecl': {
      return `\\module ${formatIdent(node.name)}`;
    }
    case 'Export': {
      return `\\export ${node.symbols.map(formatIdent).join(', ')}`;
    }
    case 'Import': {
      if (node.importedSymbols) {
        return `\\from "${node.path}" \\import ${node.importedSymbols.map(formatIdent).join(', ')}`;
      }
      return `\\import "${node.path}"${node.asName ? ` \\as ${formatIdent(node.asName)}` : ''}`;
    }
    case 'Index': {
      return `${formatNode(node.target, PREC_POSTFIX)}[${formatNode(node.index, PREC_NONE)}]`;
    }
    case 'RegionIntegral': {
      const sym =
        node.integralType === 'double'
          ? '\u222c'
          : node.integralType === 'triple'
          ? '\u222d'
          : node.integralType === 'contour'
          ? '\u222e'
          : '\u222b';
      const reg = formatNode(node.region, PREC_NONE);
      return `${sym}_${reg} ${formatNode(node.integrand, PREC_NONE)} ${node.differential}`;
    }
    case 'NablaOp': {
      if (node.op === 'laplacian') return `\u2207\u00b2 ${formatNode(node.target, PREC_UNARY)}`;
      if (node.op === 'div') return `\u2207\u00b7 ${formatNode(node.target, PREC_UNARY)}`;
      if (node.op === 'curl') return `\u2207\u00d7 ${formatNode(node.target, PREC_UNARY)}`;
      return `\u2207 ${formatNode(node.target, PREC_UNARY)}`;
    }
    case 'DifferentialFormOp': {
      if (node.op === 'hodge_star') return `\u22c6 ${formatNode(node.operands[0], PREC_UNARY)}`;
      if (node.op === 'exterior_derivative') return `d ${formatNode(node.operands[0], PREC_UNARY)}`;
      return `${formatNode(node.operands[0], PREC_EXPLICIT_MUL)} \u2227 ${formatNode(node.operands[1], PREC_EXPLICIT_MUL)}`;
    }
    case 'TensorOp': {
      const sym = node.op === 'tensor' ? '\u2297' : '\u2295';
      return `${formatNode(node.left, PREC_ADD)} ${sym} ${formatNode(node.right, PREC_ADD)}`;
    }
    case 'BracketOp': {
      if (node.op === 'inner_product') return `\u27e8${formatNode(node.operands[0], PREC_NONE)}, ${formatNode(node.operands[1], PREC_NONE)}\u27e9`;
      if (node.op === 'norm') return `\u2016${formatNode(node.operands[0], PREC_NONE)}\u2016`;
      if (node.op === 'floor') return `\u230a${formatNode(node.operands[0], PREC_NONE)}\u230b`;
      if (node.op === 'ceil') return `\u2308${formatNode(node.operands[0], PREC_NONE)}\u2309`;
      return `|${formatNode(node.operands[0], PREC_NONE)}|`;
    }
    case 'Quantifier': {
      const qSym = node.quantifier === 'forall' ? '\u2200' : node.quantifier === 'exists_unique' ? '\u2203!' : '\u2203';
      return `${qSym} ${node.variable} \u2208 ${formatNode(node.domain, PREC_NONE)}, ${formatNode(node.predicate, PREC_NONE)}`;
    }
    case 'SetOp': {
      const symMap: Record<string, string> = {
        union: '\u222a',
        intersect: '\u2229',
        setminus: '\u2216',
        subset: '\u2282',
        subseteq: '\u2286',
        in: '\u2208',
        notin: '\u2209',
      };
      return `${formatNode(node.left, PREC_ADD)} ${symMap[node.op] || node.op} ${formatNode(node.right, PREC_ADD)}`;
    }
    case 'SetBuilder': {
      return `{ ${node.variable} \u2208 ${formatNode(node.domain, PREC_NONE)} : ${formatNode(node.predicate, PREC_NONE)} }`;
    }
    case 'Equivalence': {
      const symMap: Record<string, string> = {
        iso: '\u2245',
        homotopy: '\u2243',
        equiv: '\u223c',
      };
      return `${formatNode(node.left, PREC_COMPARE)} ${symMap[node.relation] || node.relation} ${formatNode(node.right, PREC_COMPARE)}`;
    }
    case 'DecoratedIdentifier': {
      const diacriticMap: Record<string, string> = {
        bar: '\u0304',
        hat: '\u0302',
        dot: '\u0307',
        ddot: '\u0308',
      };
      return `${node.name}${diacriticMap[node.decoration] || ''}`;
    }
    case 'MatrixPostfix': {
      if (node.op === 'transpose') return `${formatNode(node.target, PREC_POSTFIX)}^T`;
      if (node.op === 'adjoint') return `${formatNode(node.target, PREC_POSTFIX)}^\u2020`;
      return `${formatNode(node.target, PREC_POSTFIX)}^-1`;
    }
    case 'Probability': {
      if (node.op === 'expect') return `E[${formatNode(node.event, PREC_NONE)}]`;
      if (node.op === 'variance') return `Var(${formatNode(node.event, PREC_NONE)})`;
      if (node.op === 'covariance') return `Cov(${formatNode(node.event, PREC_NONE)}, ${formatNode(node.condition!, PREC_NONE)})`;
      if (node.condition) return `P(${formatNode(node.event, PREC_NONE)} | ${formatNode(node.condition, PREC_NONE)})`;
      return `P(${formatNode(node.event, PREC_NONE)})`;
    }
    case 'Interval': {
      const lBracket = (node.kind === 'closed' || node.kind === 'right_open') ? '[' : '(';
      const rBracket = (node.kind === 'closed' || node.kind === 'left_open') ? ']' : ')';
      const startStr = formatNode(node.start, PREC_NONE);
      const endStr = formatNode(node.end, PREC_NONE);
      if (node.variable) {
        return `${formatIdent(node.variable)} \u2208 ${lBracket}${startStr}, ${endStr}${rBracket}`;
      }
      return `${lBracket}${startStr}, ${endStr}${rBracket}`;
    }
    case 'AxisDecl': {
      return `\\axis ${node.axes.map(formatIdent).join(', ')}`;
    }
    case 'Where': {
      return `${formatNode(node.expr, PREC_NONE)} \\where ${formatNode(node.condition, PREC_NONE)}`;
    }
    case 'Quote': {
      return `\\quote(${formatNode(node.expr, PREC_NONE)})`;
    }
    case 'Unquote': {
      return `\\unquote(${formatNode(node.expr, PREC_NONE)})`;
    }
    case 'Build': {
      if (node.nodeType === 'Template' && node.template) {
        return `\\build { ${formatNode(node.template, PREC_NONE)} }`;
      }
      if (node.args) {
        return `\\build :${node.nodeType}(${node.args.map(a => formatNode(a, PREC_NONE)).join(', ')})`;
      }
      return `\\build :${node.nodeType}`;
    }
    case 'Match': {
      const casesStr = node.cases.map(c => `  \\case ${formatNode(c.pattern, PREC_NONE)}${c.guard ? ` \\if ${formatNode(c.guard, PREC_NONE)}` : ''}: ${formatNode(c.body, PREC_NONE)}`).join(',\n');
      const otherwiseStr = node.otherwise ? `,\n  \\otherwise: ${formatNode(node.otherwise, PREC_NONE)}` : '';
      return `\\match ${formatNode(node.expr, PREC_NONE)} {\n${casesStr}${otherwiseStr}\n}`;
    }
    case 'Set': {
      return `\\set { ${node.elements.map(e => formatNode(e, PREC_NONE)).join(', ')} }`;
    }
    case 'SetComprehension': {
      let res = `\\set { ${formatNode(node.expr, PREC_NONE)} \\for ${formatIdent(node.variable)} \\in ${formatNode(node.domain, PREC_NONE)}`;
      if (node.condition) {
        res += ` \\where ${formatNode(node.condition, PREC_NONE)}`;
      }
      res += ' }';
      return res;
    }
    case 'Multiset': {
      return `\\multiset { ${node.elements.map(e => formatNode(e, PREC_NONE)).join(', ')} }`;
    }
    case 'Fold': {
      const opStr = (node.op.type === 'Identifier' && !node.op.name.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/))
        ? `(${node.op.name})`
        : (node.op.type === 'Lambda' ? `(${formatNode(node.op, PREC_NONE)})` : formatNode(node.op, PREC_NONE));
      return `\\fold ${opStr} \\over ${formatNode(node.collection, PREC_NONE)} \\from ${formatNode(node.initial, PREC_NONE)}`;
    }
    case 'Map': {
      const fnStr = node.fn.type === 'Lambda' ? `(${formatNode(node.fn, PREC_NONE)})` : formatNode(node.fn, PREC_NONE);
      return `\\map ${fnStr} \\over ${formatNode(node.collection, PREC_NONE)}`;
    }
    case 'BinaryOp': {
      return formatBinaryOp(node, parentPrec);
    }
    default:
      return '';
  }
}

function formatBinaryOp(node: BinaryOpNode, parentPrec: number): string {
  const myPrec = getNodePrecedence(node);
  const isRightAssoc = node.op === '^';

  let leftPrec = myPrec;
  let rightPrec = myPrec;

  if (isRightAssoc) {
    leftPrec = myPrec + 1; // Left must be strictly tighter
    rightPrec = myPrec;    // Right can be equal
  } else {
    leftPrec = myPrec;     // Left can be equal
    rightPrec = myPrec + 1; // Right must be strictly tighter
  }

  let leftStr = formatNode(node.left, leftPrec);
  let rightStr = formatNode(node.right, rightPrec);

  // If node is division and right is implicit multiplication or multiplication, wrap in parens: a / (b · c)
  if (node.op === '/' && node.right.type === 'BinaryOp' && (node.right.isImplicit || node.right.op === '*')) {
    rightStr = `(${formatNode(node.right, PREC_NONE)})`;
  }

  // If node is exponentiation and right is exponentiation, e.g. 2^(3^2)
  if (node.op === '^' && node.right.type === 'BinaryOp' && node.right.op === '^') {
    rightStr = `(${formatNode(node.right, PREC_NONE)})`;
  }

  let res: string;
  if (node.isImplicit) {
    res = `${leftStr} · ${rightStr}`;
  } else if (node.op === '^') {
    res = `${leftStr}^${rightStr}`;
  } else if (node.op === 'and') {
    res = `${leftStr} \\and ${rightStr}`;
  } else if (node.op === 'or') {
    res = `${leftStr} \\or ${rightStr}`;
  } else if (node.op === 'in') {
    res = `${leftStr} \\in ${rightStr}`;
  } else if (node.op === 'is') {
    res = `${leftStr} \\is ${rightStr}`;
  } else {
    res = `${leftStr} ${node.op} ${rightStr}`;
  }

  if (parentPrec > myPrec) {
    return `(${res})`;
  }
  return res;
}

function toSuperscript(str: string): string {
  const map: Record<string, string> = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
    '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    '-': '⁻',
  };
  return str.split('').map(c => map[c] ?? c).join('');
}
