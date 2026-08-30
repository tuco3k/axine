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
    case 'Range':
      return PREC_NONE;
    default:
      return PREC_NONE;
  }
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
      return node.name;
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
      let res = `${node.variable} in ${formatNode(node.start, PREC_IN)}..${formatNode(node.end, PREC_IN)}`;
      if (node.step) {
        res += ` step ${formatNode(node.step, PREC_IN)}`;
      }
      return res;
    }
    case 'Diff': {
      const op = node.isPartial ? '∂//∂' : 'd//d';
      return `${op}${node.variable} ${formatNode(node.expr, PREC_UNARY)}`;
    }
    case 'BigOp': {
      const sym = node.op === 'sum' ? 'Σ' : (node.op === 'prod' ? 'Π' : '∫');
      return `${sym}(${node.variable} in ${formatNode(node.start, PREC_IN)}..${formatNode(node.end, PREC_IN)}, ${formatNode(node.body, PREC_NONE)})`;
    }
    case 'Claim': {
      return `claim ${node.name} {\n  statement: "${node.statement}",\n  proved_by: "${node.provedBy}",\n  relevance: "${node.relevance}",\n  kind: "${node.kind}",\n  shadow: ${formatNode(node.shadow, PREC_NONE)},\n  expect: ${formatNode(node.expect, PREC_NONE)}\n}`;
    }
    case 'If': {
      const res = `if ${formatNode(node.condition, PREC_NONE)} then ${formatNode(node.thenBranch, PREC_NONE)} else ${formatNode(node.elseBranch, PREC_NONE)}`;
      if (parentPrec > PREC_NONE) {
        return `(${res})`;
      }
      return res;
    }
    case 'Lambda': {
      const paramsStr = node.params.length === 1 ? node.params[0] : `(${node.params.join(', ')})`;
      const res = `${paramsStr} -> ${formatNode(node.body, PREC_NONE)}`;
      if (parentPrec > PREC_NONE) {
        return `(${res})`;
      }
      return res;
    }
    case 'NamedArg': {
      return `${node.name}: ${formatNode(node.value, PREC_NONE)}`;
    }
    case 'Assignment': {
      return `${node.target} := ${formatNode(node.value, PREC_NONE)}`;
    }
    case 'GlobalAssignment': {
      return `${node.target} :≡ ${formatNode(node.value, PREC_NONE)}`;
    }
    case 'FunctionDef': {
      return `${node.name}(${node.params.join(', ')}) := ${formatNode(node.body, PREC_NONE)}`;
    }
    case 'FunctionCall': {
      if (node.isBare && node.args.length === 1) {
        const argStr = formatNode(node.args[0], PREC_BARE_CALL);
        const res = `${node.callee}(${argStr})`;
        if (parentPrec > PREC_BARE_CALL) {
          return `(${res})`;
        }
        return res;
      }
      return `${node.callee}(${node.args.map(a => formatNode(a, PREC_NONE)).join(', ')})`;
    }
    case 'PostfixOp': {
      if (node.op === '!') {
        const operandStr = formatNode(node.operand, PREC_POSTFIX);
        return `${operandStr}!`;
      }
      if (node.op === 'superscript') {
        const operandStr = formatNode(node.operand, PREC_POSTFIX);
        const expStr = toSuperscript(node.exponent?.toString() ?? '2');
        return `${operandStr}${expStr}`;
      }
      return formatNode(node.operand, PREC_POSTFIX);
    }
    case 'UnaryOp': {
      if (node.op === 'not') {
        const operandStr = formatNode(node.operand, PREC_NOT);
        const res = `not ${operandStr}`;
        if (parentPrec > PREC_NOT) return `(${res})`;
        return res;
      }
      const myPrec = PREC_UNARY;
      if (node.op === '-' && node.operand.type === 'BinaryOp' && node.operand.op === '^') {
        return `-(${formatNode(node.operand, PREC_NONE)})`;
      }
      const operandStr = formatNode(node.operand, myPrec);
      const res = `${node.op}${operandStr}`;
      if (parentPrec > myPrec) {
        return `(${res})`;
      }
      return res;
    }
    case 'Index': {
      return `${formatNode(node.target, PREC_POSTFIX)}[${formatNode(node.index, PREC_NONE)}]`;
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
