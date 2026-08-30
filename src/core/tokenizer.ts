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

      // Global assignment :≡ or :==
      if (char === ':' && this.peek(1) === '≡') {
        this.advance();
        this.advance();
        tokens.push(this.makeToken('GLOBAL_ASSIGN', ':≡', startPos, startLine, startCol, leadingWhitespace));
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
      if (char === '≠') {
        this.advance();
        tokens.push(this.makeToken('NEQ', '!=', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '≤') {
        this.advance();
        tokens.push(this.makeToken('LTE', '<=', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '≥') {
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
      if (char === '−') { // Unicode minus U+2212
        this.advance();
        tokens.push(this.makeToken('MINUS', '-', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '√') { // Unicode square root U+221A
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

      if (char === '≡') {
        this.advance();
        tokens.push(this.makeToken('CONGRUENT', '≡', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === 'Σ') {
        this.advance();
        tokens.push(this.makeToken('SIGMA', 'Σ', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === 'Π') {
        this.advance();
        tokens.push(this.makeToken('PI_PROD', 'Π', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '∫') {
        this.advance();
        tokens.push(this.makeToken('INTEGRAL', '∫', startPos, startLine, startCol, leadingWhitespace));
        continue;
      }
      if (char === '∂') {
        this.advance();
        tokens.push(this.makeToken('IDENTIFIER', '∂', startPos, startLine, startCol, leadingWhitespace));
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
        default:
          if (this.isIdentStart(char)) {
            const token = this.readIdentifier(startPos, startLine, startCol, leadingWhitespace);
            tokens.push(token);
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
    return /^[a-zA-Z_]$/.test(char);
  }

  private isIdentPart(char: string): boolean {
    return /^[a-zA-Z0-9_]$/.test(char);
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
