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

      // Global assignment :\u2261 or :==
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
        tokens.push(this.makeToken('EQ', '==', startPos, startLine, startCol, leadingWhitespace));
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
        tokens.push(this.makeToken('IDENTIFIER', 'sqrt', startPos, startLine, startCol, leadingWhitespace));
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
            const token = this.readIdentifier(startPos, startLine, startCol, leadingWhitespace);
            tokens.push(token);
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

  private readIdentifier(startPos: number, startLine: number, startCol: number, leadingWhitespace: boolean): Token {
    let name = '';
    while (this.pos < this.source.length && this.isIdentPart(this.source[this.pos])) {
      name += this.source[this.pos];
      this.advance();
    }

    switch (name) {
      case 'in':
        return this.makeToken('IN', name, startPos, startLine, startCol, leadingWhitespace);
      case 'step':
        return this.makeToken('STEP', name, startPos, startLine, startCol, leadingWhitespace);
      case 'if':
        return this.makeToken('IF', name, startPos, startLine, startCol, leadingWhitespace);
      case 'then':
        return this.makeToken('THEN', name, startPos, startLine, startCol, leadingWhitespace);
      case 'else':
        return this.makeToken('ELSE', name, startPos, startLine, startCol, leadingWhitespace);
      case 'and':
        return this.makeToken('AND', name, startPos, startLine, startCol, leadingWhitespace);
      case 'or':
        return this.makeToken('OR', name, startPos, startLine, startCol, leadingWhitespace);
      case 'not':
        return this.makeToken('NOT', name, startPos, startLine, startCol, leadingWhitespace);
      case 'claim':
        return this.makeToken('CLAIM', name, startPos, startLine, startCol, leadingWhitespace);
      case 'iint':
        return this.makeToken('DOUBLE_INTEGRAL', name, startPos, startLine, startCol, leadingWhitespace);
      case 'iiint':
        return this.makeToken('TRIPLE_INTEGRAL', name, startPos, startLine, startCol, leadingWhitespace);
      case 'oint':
        return this.makeToken('CONTOUR_INTEGRAL', name, startPos, startLine, startCol, leadingWhitespace);
      case 'grad':
      case 'del':
        return this.makeToken('NABLA', name, startPos, startLine, startCol, leadingWhitespace);
      case 'laplacian':
        return this.makeToken('LAPLACIAN', name, startPos, startLine, startCol, leadingWhitespace);
      case 'wedge':
        return this.makeToken('WEDGE', name, startPos, startLine, startCol, leadingWhitespace);
      case 'hodge':
      case 'star':
        return this.makeToken('HODGE_STAR', name, startPos, startLine, startCol, leadingWhitespace);
      case 'tensor':
        return this.makeToken('TENSOR_PROD', name, startPos, startLine, startCol, leadingWhitespace);
      case 'direct_sum':
      case 'oplus':
        return this.makeToken('DIRECT_SUM', name, startPos, startLine, startCol, leadingWhitespace);
      case 'forall':
        return this.makeToken('FORALL', name, startPos, startLine, startCol, leadingWhitespace);
      case 'exists':
        if (this.pos < this.source.length && this.source[this.pos] === '!') {
          this.advance();
          return this.makeToken('EXISTS_UNIQUE', name + '!', startPos, startLine, startCol, leadingWhitespace);
        }
        return this.makeToken('EXISTS', name, startPos, startLine, startCol, leadingWhitespace);
      case 'notin':
        return this.makeToken('SET_NOTIN', name, startPos, startLine, startCol, leadingWhitespace);
      case 'subset':
        return this.makeToken('SET_SUBSET', name, startPos, startLine, startCol, leadingWhitespace);
      case 'subseteq':
        return this.makeToken('SET_SUBSETEQ', name, startPos, startLine, startCol, leadingWhitespace);
      case 'union':
        return this.makeToken('SET_UNION', name, startPos, startLine, startCol, leadingWhitespace);
      case 'intersect':
        return this.makeToken('SET_INTERSECT', name, startPos, startLine, startCol, leadingWhitespace);
      case 'setminus':
        return this.makeToken('SET_DIFF', name, startPos, startLine, startCol, leadingWhitespace);
      case 'iso':
        return this.makeToken('ISO', name, startPos, startLine, startCol, leadingWhitespace);
      case 'homotopic':
        return this.makeToken('HOMOTOPY', name, startPos, startLine, startCol, leadingWhitespace);
      case 'equiv':
        return this.makeToken('EQUIV', name, startPos, startLine, startCol, leadingWhitespace);
      case 'dagger':
      case 'adj':
        return this.makeToken('DAGGER', name, startPos, startLine, startCol, leadingWhitespace);
      case 'record':
        return this.makeToken('RECORD', name, startPos, startLine, startCol, leadingWhitespace);
      case 'with':
        return this.makeToken('WITH', name, startPos, startLine, startCol, leadingWhitespace);
      case 'dimension':
        return this.makeToken('DIMENSION', name, startPos, startLine, startCol, leadingWhitespace);
      case 'unit':
        return this.makeToken('UNIT', name, startPos, startLine, startCol, leadingWhitespace);
      case 'operator':
        return this.makeToken('OPERATOR', name, startPos, startLine, startCol, leadingWhitespace);
      case 'prefix':
        return this.makeToken('PREFIX', name, startPos, startLine, startCol, leadingWhitespace);
      case 'postfix':
        return this.makeToken('POSTFIX', name, startPos, startLine, startCol, leadingWhitespace);
      case 'infix':
        return this.makeToken('INFIX', name, startPos, startLine, startCol, leadingWhitespace);
      case 'precedence':
        return this.makeToken('PRECEDENCE', name, startPos, startLine, startCol, leadingWhitespace);
      case 'associativity':
        return this.makeToken('ASSOCIATIVITY', name, startPos, startLine, startCol, leadingWhitespace);
      case 'kind':
        return this.makeToken('KIND', name, startPos, startLine, startCol, leadingWhitespace);
      case 'extends':
        return this.makeToken('EXTENDS', name, startPos, startLine, startCol, leadingWhitespace);
      case 'operations':
        return this.makeToken('OPERATIONS', name, startPos, startLine, startCol, leadingWhitespace);
      case 'axioms':
        return this.makeToken('AXIOMS', name, startPos, startLine, startCol, leadingWhitespace);
      case 'rule':
        return this.makeToken('RULE', name, startPos, startLine, startCol, leadingWhitespace);
      case 'requires':
        return this.makeToken('REQUIRES', name, startPos, startLine, startCol, leadingWhitespace);
      case 'module':
        return this.makeToken('MODULE', name, startPos, startLine, startCol, leadingWhitespace);
      case 'export':
        return this.makeToken('EXPORT', name, startPos, startLine, startCol, leadingWhitespace);
      case 'import':
        return this.makeToken('IMPORT', name, startPos, startLine, startCol, leadingWhitespace);
      case 'from':
        return this.makeToken('FROM', name, startPos, startLine, startCol, leadingWhitespace);
      case 'as':
        return this.makeToken('AS', name, startPos, startLine, startCol, leadingWhitespace);
      default:
        return this.makeToken('IDENTIFIER', name, startPos, startLine, startCol, leadingWhitespace);
    }
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
      char === '\u2115'
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
