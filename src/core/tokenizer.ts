import { Span, Token, TokenType } from './types';
import { createError } from './errors';

const SUPERSCRIPT_MAP: Record<string, string> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
};

export class Tokenizer {
  private readonly source: string;
  private pos: number = 0;
  private line: number = 1;
  private col: number = 1;

  constructor(source: string) {
    this.source = source;
  }

  public tokenize(): Token[] {
    const tokens: Token[] = [];
    let hadLeadingWhitespace = false;

    while (this.pos < this.source.length) {
      const char = this.source[this.pos];

      // Handle whitespace
      if (this.isWhitespace(char)) {
        hadLeadingWhitespace = true;
        this.advance();
        continue;
      }

      // Handle YAML frontmatter at document start (--- ... ---)
      if (this.pos === 0 && this.source.startsWith('---')) {
        hadLeadingWhitespace = true;
        this.pos += 3;
        this.col += 3;
        const endFm = this.source.indexOf('\n---', this.pos);
        if (endFm !== -1) {
          const fmSlice = this.source.slice(0, endFm + 4);
          const lines = fmSlice.split('\n');
          this.line += lines.length - 1;
          this.pos = endFm + 4;
          while (this.pos < this.source.length && this.source[this.pos] !== '\n') {
            this.pos++;
          }
          if (this.pos < this.source.length && this.source[this.pos] === '\n') {
            this.pos++;
            this.line++;
            this.col = 1;
          }
        }
        continue;
      }

      // Handle comments (# until end of line)
      if (char === '#') {
        hadLeadingWhitespace = true;
        while (this.pos < this.source.length && this.source[this.pos] !== '\n') {
          this.advance();
        }
        continue;
      }

      const startPos = this.pos;
      const startLine = this.line;
      const startCol = this.col;

      const leadingWhitespace = hadLeadingWhitespace;
      hadLeadingWhitespace = false;

      // Strings
      if (char === '"' || char === "'") {
        const token = this.readString(char, startPos, startLine, startCol, leadingWhitespace);
        tokens.push(token);
        continue;
      }

      // Numbers
      if (this.isDigit(char) || (char === '.' && this.isDigit(this.peek(1)) && this.peek(1) !== '.')) {
        const token = this.readNumber(startPos, startLine, startCol, leadingWhitespace);
        tokens.push(token);
        continue;
      }

      // Superscript digits
      if (this.isSuperscriptDigit(char)) {
        const token = this.readSuperscript(startPos, startLine, startCol, leadingWhitespace);
        tokens.push(token);
        continue;
      }

      if (char === '-' && this.peek(1) === '>') {
        this.advance();
        this.advance();
        tokens.push(this.makeToken('ARROW', '->', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }

      // Global assignment :equiv or :==
      if (char === ':' && this.peek(1) === '\u2261') {
        this.advance();
        this.advance();
        tokens.push(this.makeToken('GLOBAL_ASSIGN', ':\u2261', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === ':' && this.peek(1) === '=' && this.peek(2) === '=') {
        this.advance();
        this.advance();
        this.advance();
        tokens.push(this.makeToken('GLOBAL_ASSIGN', ':==', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }

      if (char === ':' && this.peek(1) === '=') {
        this.advance();
        this.advance();
        tokens.push(this.makeToken('ASSIGN', ':=', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }

      if (char === ':' && this.isIdentStart(this.peek(1))) {
        this.advance(); // consume ':'
        let name = '';
        while (this.pos < this.source.length && this.isIdentPart(this.source[this.pos])) {
          name += this.source[this.pos];
          this.advance();
        }
        tokens.push(this.makeToken('IDENTIFIER', name, startPos, startLine, startCol, leadingWhitespace));
        continue;
      }

      if (char === '\\' && this.isIdentStart(this.peek(1))) {
        this.advance(); // consume '\'
        let name = '';
        while (this.pos < this.source.length && /^[a-zA-Z0-9]$/.test(this.source[this.pos])) {
          name += this.source[this.pos];
          this.advance();
        }
        if (name === 'proved' && this.source.slice(this.pos, this.pos + 3) === '_by') {
          name += '_by';
          this.advance(); this.advance(); this.advance();
        } else if (name === 'direct' && this.source.slice(this.pos, this.pos + 4) === '_sum') {
          name += '_sum';
          this.advance(); this.advance(); this.advance(); this.advance();
        }
        if (name === 'in' || name === 'isin') {
          tokens.push(this.makeToken('IN', 'in', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'axis') {
          tokens.push(this.makeToken('AXIS', '\\axis', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'import') {
          tokens.push(this.makeToken('IMPORT', 'import', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'unimport') {
          tokens.push(this.makeToken('UNIMPORT', 'unimport', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'where') {
          tokens.push(this.makeToken('WHERE', 'where', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'if') {
          tokens.push(this.makeToken('IF', 'if', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'then') {
          tokens.push(this.makeToken('THEN', 'then', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'else') {
          tokens.push(this.makeToken('ELSE', 'else', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'and') {
          tokens.push(this.makeToken('AND', 'and', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'or') {
          tokens.push(this.makeToken('OR', 'or', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'not') {
          tokens.push(this.makeToken('NOT', 'not', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'claim') {
          tokens.push(this.makeToken('CLAIM', 'claim', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'statement') {
          tokens.push(this.makeToken('IDENTIFIER', 'statement', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'proved_by') {
          tokens.push(this.makeToken('IDENTIFIER', 'proved_by', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'relevance') {
          tokens.push(this.makeToken('IDENTIFIER', 'relevance', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'shadow') {
          tokens.push(this.makeToken('IDENTIFIER', 'shadow', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'expect') {
          tokens.push(this.makeToken('IDENTIFIER', 'expect', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'rule') {
          tokens.push(this.makeToken('RULE', 'rule', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'requires') {
          tokens.push(this.makeToken('REQUIRES', 'requires', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'module') {
          tokens.push(this.makeToken('MODULE', 'module', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'export') {
          tokens.push(this.makeToken('EXPORT', 'export', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'from') {
          tokens.push(this.makeToken('FROM', 'from', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'as') {
          tokens.push(this.makeToken('AS', 'as', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'is') {
          tokens.push(this.makeToken('IS', 'is', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'view') {
          tokens.push(this.makeToken('VIEW', 'view', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'for') {
          tokens.push(this.makeToken('FOR', 'for', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'step') {
          tokens.push(this.makeToken('STEP', 'step', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'record') {
          tokens.push(this.makeToken('RECORD', 'record', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'with') {
          tokens.push(this.makeToken('WITH', 'with', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'dimension') {
          tokens.push(this.makeToken('DIMENSION', 'dimension', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'unit') {
          tokens.push(this.makeToken('UNIT', 'unit', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'operator') {
          tokens.push(this.makeToken('OPERATOR', 'operator', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'prefix') {
          tokens.push(this.makeToken('PREFIX', 'prefix', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'postfix') {
          tokens.push(this.makeToken('POSTFIX', 'postfix', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'infix') {
          tokens.push(this.makeToken('INFIX', 'infix', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'precedence') {
          tokens.push(this.makeToken('PRECEDENCE', 'precedence', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'associativity') {
          tokens.push(this.makeToken('ASSOCIATIVITY', 'associativity', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'kind') {
          tokens.push(this.makeToken('KIND', 'kind', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'extends') {
          tokens.push(this.makeToken('EXTENDS', 'extends', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'operations') {
          tokens.push(this.makeToken('OPERATIONS', 'operations', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'axioms') {
          tokens.push(this.makeToken('AXIOMS', 'axioms', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'left') {
          tokens.push(this.makeToken('IDENTIFIER', 'left', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'right') {
          tokens.push(this.makeToken('IDENTIFIER', 'right', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'true') {
          tokens.push(this.makeToken('IDENTIFIER', 'true', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'false') {
          tokens.push(this.makeToken('IDENTIFIER', 'false', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'none') {
          tokens.push(this.makeToken('IDENTIFIER', 'none', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'notin') {
          tokens.push(this.makeToken('SET_NOTIN', '\u2209', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'inf' || name === 'infty') {
          tokens.push(this.makeToken('IDENTIFIER', 'inf', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'oint') {
          tokens.push(this.makeToken('CONTOUR_INTEGRAL', '\u222e', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'int') {
          tokens.push(this.makeToken('INTEGRAL', '\u222b', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'iint') {
          tokens.push(this.makeToken('DOUBLE_INTEGRAL', '\u222c', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'iiint') {
          tokens.push(this.makeToken('TRIPLE_INTEGRAL', '\u222d', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'otimes') {
          tokens.push(this.makeToken('TENSOR_PROD', '\u2297', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'oplus') {
          tokens.push(this.makeToken('DIRECT_SUM', '\u2295', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'forall') {
          tokens.push(this.makeToken('FORALL', '\u2200', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'exists') {
          if (this.pos < this.source.length && this.source[this.pos] === '!') {
            this.advance();
            tokens.push(this.makeToken('EXISTS_UNIQUE', '\u2203!', startPos, startLine, startCol, leadingWhitespace));
            continue;
          }
          tokens.push(this.makeToken('EXISTS', '\u2203', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'le' || name === 'leq') {
          tokens.push(this.makeToken('LTE', '<=', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'ge' || name === 'geq') {
          tokens.push(this.makeToken('GTE', '>=', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'ne' || name === 'neq') {
          tokens.push(this.makeToken('NEQ', '!=', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'subset') {
          tokens.push(this.makeToken('SET_SUBSET', '\u2282', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'subseteq') {
          tokens.push(this.makeToken('SET_SUBSETEQ', '\u2286', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'cup' || name === 'union') {
          tokens.push(this.makeToken('SET_UNION', '\u222a', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'cap' || name === 'intersect') {
          tokens.push(this.makeToken('SET_INTERSECT', '\u2229', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'setminus') {
          tokens.push(this.makeToken('SET_DIFF', '\\', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'iso') {
          tokens.push(this.makeToken('ISO', '\u2245', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'homotopic') {
          tokens.push(this.makeToken('HOMOTOPY', '\u2243', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'equiv') {
          tokens.push(this.makeToken('EQUIV', '\u2261', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'dagger' || name === 'adj') {
          tokens.push(this.makeToken('DAGGER', '\u2020', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'nabla' || name === 'grad' || name === 'del') {
          tokens.push(this.makeToken('NABLA', '\u2207', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'laplacian') {
          tokens.push(this.makeToken('LAPLACIAN', '\u2206', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'wedge') {
          tokens.push(this.makeToken('WEDGE', '\u2227', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'hodge' || name === 'star') {
          tokens.push(this.makeToken('HODGE_STAR', '\u22c6', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'tensor') {
          tokens.push(this.makeToken('TENSOR_PROD', '\u2297', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'direct_sum') {
          tokens.push(this.makeToken('DIRECT_SUM', '\u2295', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'cdot' || name === 'times') {
          tokens.push(this.makeToken('STAR', '*', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'solve') {
          tokens.push(this.makeToken('SOLVE', 'solve', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'isolate') {
          tokens.push(this.makeToken('ISOLATE', 'isolate', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'simplify') {
          tokens.push(this.makeToken('SIMPLIFY', 'simplify', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'check') {
          tokens.push(this.makeToken('CHECK', 'check', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'find') {
          tokens.push(this.makeToken('FIND', 'find', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'near') {
          tokens.push(this.makeToken('NEAR', 'near', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'dt') {
          tokens.push(this.makeToken('DT', 'dt', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'trace') {
          tokens.push(this.makeToken('TRACE', 'trace', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'until') {
          tokens.push(this.makeToken('UNTIL', 'until', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'max') {
          tokens.push(this.makeToken('MAX', 'max', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'to') {
          tokens.push(this.makeToken('TO', 'to', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'eps') {
          tokens.push(this.makeToken('EPS', 'eps', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'format') {
          tokens.push(this.makeToken('FORMAT', 'format', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'var') {
          tokens.push(this.makeToken('VAR', 'var', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        if (name === 'n') {
          tokens.push(this.makeToken('N_ARG', 'n', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        tokens.push(this.makeToken('BACKSLASH_IDENT', name, startPos, startLine, startCol, leadingWhitespace));
        continue;
      }

      // Double slash // for stacked fraction / differential
      if (char === '/' && this.peek(1) === '/') {
        this.advance();
        this.advance();
        tokens.push(this.makeToken('DOUBLE_SLASH', '//', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }

      if (char === '.' && this.peek(1) === '.') {
        this.advance();
        this.advance();
        tokens.push(this.makeToken('DOTDOT', '..', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }

      if (char === '=' && this.peek(1) === '>') {
        this.advance();
        this.advance();
        tokens.push(this.makeToken('FAT_ARROW', '=>', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }

      if (char === '=' && this.peek(1) === '=') {
        this.advance();
        this.advance();
        tokens.push(this.makeToken('EQ_EQ', '==', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }

      if (char === '!' && this.peek(1) === '=') {
        this.advance();
        this.advance();
        tokens.push(this.makeToken('NEQ', '!=', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }

      if (char === '<' && this.peek(1) === '=') {
        this.advance();
        this.advance();
        tokens.push(this.makeToken('LTE', '<=', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }

      if (char === '>' && this.peek(1) === '=') {
        this.advance();
        this.advance();
        tokens.push(this.makeToken('GTE', '>=', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }

      // Unicode comparisons & operators
      if (char === '\u2260') {
        this.advance();
        tokens.push(this.makeToken('NEQ', '!=', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u2264') {
        this.advance();
        tokens.push(this.makeToken('LTE', '<=', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u2265') {
        this.advance();
        tokens.push(this.makeToken('GTE', '>=', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '×') {
        this.advance();
        tokens.push(this.makeToken('STAR', '*', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '÷') {
        this.advance();
        tokens.push(this.makeToken('SLASH', '/', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u2212') { // Unicode minus U+2212
        this.advance();
        tokens.push(this.makeToken('MINUS', '-', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u221a') { // Unicode square root U+221A
        this.advance();
        tokens.push(this.makeToken('IDENTIFIER', ':sqrt', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === 'π') {
        this.advance();
        tokens.push(this.makeToken('IDENTIFIER', 'pi', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === 'τ') {
        this.advance();
        tokens.push(this.makeToken('IDENTIFIER', 'tau', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }

      if (char === '\u2261') {
        this.advance();
        tokens.push(this.makeToken('CONGRUENT', '\u2261', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u03a3') {
        this.advance();
        tokens.push(this.makeToken('SIGMA', '\u03a3', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u03a0') {
        this.advance();
        tokens.push(this.makeToken('PI_PROD', '\u03a0', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u222c') {
        this.advance();
        tokens.push(this.makeToken('DOUBLE_INTEGRAL', '\u222c', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u222d') {
        this.advance();
        tokens.push(this.makeToken('TRIPLE_INTEGRAL', '\u222d', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u222e') {
        this.advance();
        tokens.push(this.makeToken('CONTOUR_INTEGRAL', '\u222e', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u222b') {
        this.advance();
        tokens.push(this.makeToken('INTEGRAL', '\u222b', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u2207') {
        this.advance();
        if (this.pos < this.source.length && (this.source[this.pos] === '\u00b2' || this.source[this.pos] === '2')) {
          this.advance();
          tokens.push(this.makeToken('LAPLACIAN', '\u2207\u00b2', startPos, startLine, startCol, leadingWhitespace));
        } else {
          tokens.push(this.makeToken('NABLA', '\u2207', startPos, startLine, startCol, leadingWhitespace));
        }
        continue;
      }
      if (char === '\u2227') {
        this.advance();
        tokens.push(this.makeToken('WEDGE', '\u2227', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u22c6') {
        this.advance();
        tokens.push(this.makeToken('HODGE_STAR', '\u22c6', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u2297') {
        this.advance();
        tokens.push(this.makeToken('TENSOR_PROD', '\u2297', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u2295') {
        this.advance();
        tokens.push(this.makeToken('DIRECT_SUM', '\u2295', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u27e8') {
        this.advance();
        tokens.push(this.makeToken('LANGLE', '\u27e8', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u27e9') {
        this.advance();
        tokens.push(this.makeToken('RANGLE', '\u27e9', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u2016') {
        this.advance();
        tokens.push(this.makeToken('NORM_BAR', '\u2016', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u230a') {
        this.advance();
        tokens.push(this.makeToken('FLOOR_L', '\u230a', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u230b') {
        this.advance();
        tokens.push(this.makeToken('FLOOR_R', '\u230b', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u2308') {
        this.advance();
        tokens.push(this.makeToken('CEIL_L', '\u2308', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u2309') {
        this.advance();
        tokens.push(this.makeToken('CEIL_R', '\u2309', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u2200') {
        this.advance();
        tokens.push(this.makeToken('FORALL', '\u2200', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u2203') {
        this.advance();
        if (this.pos < this.source.length && this.source[this.pos] === '!') {
          this.advance();
          tokens.push(this.makeToken('EXISTS_UNIQUE', '\u2203!', startPos, startLine, startCol, leadingWhitespace));
        } else {
          tokens.push(this.makeToken('EXISTS', '\u2203', startPos, startLine, startCol, leadingWhitespace));
        }
        continue;
      }
      if (char === '\u2208') {
        this.advance();
        tokens.push(this.makeToken('SET_IN', '\u2208', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u2209') {
        this.advance();
        tokens.push(this.makeToken('SET_NOTIN', '\u2209', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u2282') {
        this.advance();
        tokens.push(this.makeToken('SET_SUBSET', '\u2282', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u2286') {
        this.advance();
        tokens.push(this.makeToken('SET_SUBSETEQ', '\u2286', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u222a') {
        this.advance();
        tokens.push(this.makeToken('SET_UNION', '\u222a', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u2229') {
        this.advance();
        tokens.push(this.makeToken('SET_INTERSECT', '\u2229', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u2216') {
        this.advance();
        tokens.push(this.makeToken('SET_DIFF', '\u2216', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u2245') {
        this.advance();
        tokens.push(this.makeToken('ISO', '\u2245', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u2243') {
        this.advance();
        tokens.push(this.makeToken('HOMOTOPY', '\u2243', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u223c') {
        this.advance();
        tokens.push(this.makeToken('EQUIV', '\u223c', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u2020') {
        this.advance();
        tokens.push(this.makeToken('DAGGER', '\u2020', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '|') {
        if (this.peek(1) === '|') {
          this.advance();
          this.advance();
          tokens.push(this.makeToken('NORM_BAR', '||', startPos, startLine, startCol, leadingWhitespace));
          continue;
        }
        this.advance();
        tokens.push(this.makeToken('BAR_SEP', '|', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '\u2202') {
        this.advance();
        tokens.push(this.makeToken('IDENTIFIER', '\u2202', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }

      // Single-character punctuation & operators
      switch (char) {
        case '+':
          this.advance();
          tokens.push(this.makeToken('PLUS', '+', startPos, startLine, startCol, leadingWhitespace));
          break;
        case '-':
          this.advance();
          tokens.push(this.makeToken('MINUS', '-', startPos, startLine, startCol, leadingWhitespace));
          break;
        case '*':
          this.advance();
          tokens.push(this.makeToken('STAR', '*', startPos, startLine, startCol, leadingWhitespace));
          break;
        case '/':
          this.advance();
          tokens.push(this.makeToken('SLASH', '/', startPos, startLine, startCol, leadingWhitespace));
          break;
        case '%':
          this.advance();
          tokens.push(this.makeToken('PERCENT', '%', startPos, startLine, startCol, leadingWhitespace));
          break;
        case '^':
          this.advance();
          tokens.push(this.makeToken('CARET', '^', startPos, startLine, startCol, leadingWhitespace));
          break;
        case '!':
          this.advance();
          tokens.push(this.makeToken('BANG', '!', startPos, startLine, startCol, leadingWhitespace));
          break;
        case '=':
          this.advance();
          tokens.push(this.makeToken('EQ', '=', startPos, startLine, startCol, leadingWhitespace));
          break;
        case '<':
          this.advance();
          tokens.push(this.makeToken('LT', '<', startPos, startLine, startCol, leadingWhitespace));
          break;
        case '>':
          this.advance();
          tokens.push(this.makeToken('GT', '>', startPos, startLine, startCol, leadingWhitespace));
          break;
        case '(':
          this.advance();
          tokens.push(this.makeToken('LPAREN', '(', startPos, startLine, startCol, leadingWhitespace));
          break;
        case ')':
          this.advance();
          tokens.push(this.makeToken('RPAREN', ')', startPos, startLine, startCol, leadingWhitespace));
          break;
        case '[':
          this.advance();
          tokens.push(this.makeToken('LBRACKET', '[', startPos, startLine, startCol, leadingWhitespace));
          break;
        case ']':
          this.advance();
          tokens.push(this.makeToken('RBRACKET', ']', startPos, startLine, startCol, leadingWhitespace));
          break;
        case '{':
          this.advance();
          tokens.push(this.makeToken('LBRACE', '{', startPos, startLine, startCol, leadingWhitespace));
          break;
        case '}':
          this.advance();
          tokens.push(this.makeToken('RBRACE', '}', startPos, startLine, startCol, leadingWhitespace));
          break;
        case ';':
          this.advance();
          tokens.push(this.makeToken('SEMICOLON', ';', startPos, startLine, startCol, leadingWhitespace));
          break;
        case ':':
          this.advance();
          tokens.push(this.makeToken('COLON', ':', startPos, startLine, startCol, leadingWhitespace));
          break;
        case ',':
          this.advance();
          tokens.push(this.makeToken('COMMA', ',', startPos, startLine, startCol, leadingWhitespace));
          break;
        case '.':
        case '\u00b7':
          this.advance();
          tokens.push(this.makeToken('DOT', '.', startPos, startLine, startCol, leadingWhitespace));
          break;
        default:
          if (this.isIdentStart(char)) {
            const wordTokens = this.readWordOrSplit(startPos, startLine, startCol, leadingWhitespace);
            for (const tok of wordTokens) {
              tokens.push(tok);
            }
          } else if (this.isCustomOpChar(char)) {
            this.advance();
            tokens.push(this.makeToken('CUSTOM_OP', char, startPos, startLine, startCol, leadingWhitespace));
          } else {
            const span: Span = {
              start: startPos,
              end: startPos + 1,
              line: startLine,
              col: startCol,
            };
            throw createError(
              `Unexpected character '${char}'`,
              span,
              {
                expected: 'a number, identifier, or mathematical operator',
                suggestion: `Remove or replace the character '${char}'`,
                source: this.source,
              }
            );
          }
      }
    }

    tokens.push({
      type: 'EOF',
      value: '',
      span: {
        start: this.pos,
        end: this.pos,
        line: this.line,
        col: this.col,
      },
      leadingWhitespace: hadLeadingWhitespace,
    });

    return tokens;
  }

  private readNumber(startPos: number, startLine: number, startCol: number, leadingWhitespace: boolean): Token {
    let raw = '';

    while (this.pos < this.source.length) {
      const char = this.source[this.pos];
      if (this.isDigit(char)) {
        raw += char;
        this.advance();
      } else if (char === '_') {
        if (raw.length === 0 || !this.isDigit(raw[raw.length - 1])) {
          break;
        }
        this.advance();
        if (this.pos >= this.source.length || !this.isDigit(this.source[this.pos])) {
          const span: Span = { start: startPos, end: this.pos, line: startLine, col: startCol };
          throw createError(
            `Invalid digit separator '_' in number`,
            span,
            {
              expected: 'digits following the separator',
              suggestion: 'Ensure digits appear on both sides of the underscore, e.g. 1_000_000',
              source: this.source,
            }
          );
        }
        raw += '_';
      } else if (char === '.') {
        if (this.peek(1) === '.') {
          break;
        }
        if (raw.includes('.')) {
          break;
        }
        raw += char;
        this.advance();
      } else if (char === 'e' || char === 'E') {
        let expStr = char;
        let p = 1;
        const nextChar = this.peek(p);
        if (nextChar === '+' || nextChar === '-') {
          expStr += nextChar;
          p++;
        }
        if (this.isDigit(this.peek(p))) {
          raw += expStr;
          for (let i = 0; i < p; i++) {
            this.advance();
          }
          while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
            raw += this.source[this.pos];
            this.advance();
          }
        }
        break;
      } else {
        break;
      }
    }

    return this.makeToken('NUMBER', raw, startPos, startLine, startCol, leadingWhitespace);
  }

  private readSuperscript(startPos: number, startLine: number, startCol: number, leadingWhitespace: boolean): Token {
    let digits = '';
    while (this.pos < this.source.length && this.isSuperscriptDigit(this.source[this.pos])) {
      digits += SUPERSCRIPT_MAP[this.source[this.pos]];
      this.advance();
    }
    return this.makeToken('SUPERSCRIPT_DIGITS', digits, startPos, startLine, startCol, leadingWhitespace);
  }

  private readWordOrSplit(startPos: number, startLine: number, startCol: number, leadingWhitespace: boolean): Token[] {
    let name = '';
    while (this.pos < this.source.length && this.isIdentPart(this.source[this.pos])) {
      name += this.source[this.pos];
      this.advance();
    }

    const result: Token[] = [];
        let curPos = startPos;
        let curCol = startCol;
        let i = 0;
        while (i < name.length) {
          let tokenStr = name[i];
          while (i + 1 < name.length && this.isCombiningDiacritic(name[i + 1])) {
            tokenStr += name[i + 1];
            i++;
          }
          const isNum = this.isDigit(tokenStr[0]);
          result.push({
            type: isNum ? 'NUMBER' : 'IDENTIFIER',
            value: tokenStr,
            span: {
              start: curPos,
              end: curPos + tokenStr.length,
              line: startLine,
              col: curCol,
            },
            leadingWhitespace: result.length === 0 ? leadingWhitespace : false,
          });
          curPos += tokenStr.length;
          curCol += tokenStr.length;
          i++;
        }
        return result;
  }

  private readString(quote: string, startPos: number, startLine: number, startCol: number, leadingWhitespace: boolean): Token {
    this.advance(); // skip opening quote
    let str = '';
    while (this.pos < this.source.length && this.source[this.pos] !== quote) {
      const char = this.source[this.pos];
      if (char === '\\' && this.pos + 1 < this.source.length) {
        this.advance();
        const esc = this.source[this.pos];
        if (esc === 'n') str += '\n';
        else if (esc === 't') str += '\t';
        else if (esc === 'r') str += '\r';
        else if (esc === '"') str += '"';
        else if (esc === "'") str += "'";
        else if (esc === '\\') str += '\\';
        else str += esc;
        this.advance();
      } else {
        str += char;
        this.advance();
      }
    }
    if (this.pos < this.source.length && this.source[this.pos] === quote) {
      this.advance(); // skip closing quote
    }
    return this.makeToken('STRING', str, startPos, startLine, startCol, leadingWhitespace);
  }

  private makeToken(
    type: TokenType,
    value: string,
    startPos: number,
    startLine: number,
    startCol: number,
    leadingWhitespace: boolean
  ): Token {
    return {
      type,
      value,
      span: {
        start: startPos,
        end: this.pos,
        line: startLine,
        col: startCol,
      },
      leadingWhitespace,
    };
  }

  private isWhitespace(char: string): boolean {
    return char === ' ' || char === '\t' || char === '\r' || char === '\n';
  }

  private isDigit(char?: string): boolean {
    return char !== undefined && char >= '0' && char <= '9';
  }

  private isSuperscriptDigit(char?: string): boolean {
    return char !== undefined && char in SUPERSCRIPT_MAP;
  }

  private isIdentStart(char: string): boolean {
    return (
      /^[a-zA-Z_]$/.test(char) ||
      (char >= '\u0370' && char <= '\u03ff') || // Greek letters
      char === '\u211d' || // R
      char === '\u2102' || // C
      char === '\u2124' || // Z
      char === '\u211a' || // Q
      char === '\u2115' || // N
      char === '\u2202'    // partial
    );
  }

  private isIdentPart(char: string): boolean {
    return (
      /^[a-zA-Z0-9_]$/.test(char) ||
      (char >= '\u0370' && char <= '\u03ff') || // Greek letters
      char === '\u0304' || // combining macron / overline
      char === '\u0302' || // combining circumflex / hat
      char === '\u0307' || // combining dot
      char === '\u0308' || // combining diaeresis / double dot
      char === '\u211d' ||
      char === '\u2102' ||
      char === '\u2124' ||
      char === '\u211a' ||
      char === '\u2115' ||
      char === "'" ||
      char === '\u2032'
    );
  }

  private isCombiningDiacritic(char: string): boolean {
    return (
      char === '\u0304' || // combining macron / bar
      char === '\u0302' || // combining circumflex / hat
      char === '\u0307' || // combining dot
      char === '\u0308' || // combining diaeresis / double dot
      char === "'" ||
      char === '\u2032'
    );
  }

  private isCustomOpChar(char: string): boolean {
    if (!char) return false;
    const code = char.codePointAt(0) ?? 0;
    return (
      (code >= 0x2200 && code <= 0x22ff) ||
      (code >= 0x2a00 && code <= 0x2aff) ||
      (code >= 0x27c0 && code <= 0x27ef) ||
      (code >= 0x2980 && code <= 0x29ff) ||
      (code >= 0x2190 && code <= 0x21ff) ||
      code === 0x00b0 || // °
      code === 0x00d7 || // ×
      code === 0x00f7 || // ÷
      char === '@' ||
      char === '~' ||
      char === '#' ||
      char === '$' ||
      char === '&' ||
      char === '?'
    );
  }

  private peek(offset: number = 0): string {
    const idx = this.pos + offset;
    if (idx >= this.source.length) return '';
    return this.source[idx];
  }

  private advance(): void {
    if (this.pos < this.source.length) {
      if (this.source[this.pos] === '\n') {
        this.line++;
        this.col = 1;
      } else {
        this.col++;
      }
      this.pos++;
    }
  }
}

export function tokenize(source: string): Token[] {
  return new Tokenizer(source).tokenize();
}
