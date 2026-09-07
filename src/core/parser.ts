import {
  ASTNode,
  BigOpNode,
  BinaryOpNode,
  ClaimNode,
  DiffNode,
  EquivalenceNode,
  LimitNode,
  RegionIntegralNode,
  NablaOpNode,
  BracketOpNode,
  QuantifierNode,
  SetOpNode,
  IntervalNode,
  MatchCase,
  MatchNode,
  BuildNode,
  QuoteNode,
  UnquoteNode,
  Span,
  Token,
  TokenType,
} from './types';
import { createError } from './errors';
import { tokenize } from './tokenizer';


export const CONSTANTS = new Set([
  'true', 'false',
  'R', 'C', 'Z', 'Q', 'N',
  'Reals', 'Complexes', 'Integers', 'Rationals', 'Naturals',
  '\u211d', '\u2102', '\u2124', '\u211a', '\u2115' // ℝ, ℂ, ℤ, ℚ, ℕ
]);

// Precedence levels
export const PREC_NONE = 0;
export const PREC_WHERE = 4;
export const PREC_OR = 5;
export const PREC_AND = 6;
export const PREC_NOT = 7;
export const PREC_IN = 10;
export const PREC_COMPARE = 20;
export const PREC_ADD = 30;
export const PREC_BARE_CALL = 40;
export const PREC_EXPLICIT_MUL = 50;
export const PREC_IMPLICIT_MUL = 60;
export const PREC_UNARY = 70;
export const PREC_POW = 80;
export const PREC_POSTFIX = 90;

export interface ParserOptions {
  knownFunctions?: Set<string>;
  knownVariables?: Set<string>;
  source?: string;
}

export class Parser {
  private readonly tokens: Token[];
  private readonly source: string;
  private readonly knownFunctions: Set<string>;
  private readonly knownVariables: Set<string>;
  private pos: number = 0;
  private parsingIntegrand: boolean = false;
  private pipeDepth: number = 0;

  constructor(tokens: Token[], options?: ParserOptions) {
    this.tokens = tokens;
    this.source = options?.source ?? '';
    this.knownFunctions = new Set();
    if (options?.knownFunctions) {
      for (const fn of options.knownFunctions) {
        this.knownFunctions.add(fn);
      }
    }
    this.knownVariables = new Set(CONSTANTS);
    if (options?.knownVariables) {
      for (const v of options.knownVariables) {
        this.knownVariables.add(v);
      }
    }
  }

  public parse(): ASTNode {
    if (this.peek().type === 'EOF') {
      const span: Span = this.peek().span;
      throw createError('Empty expression', span, {
        expected: 'a valid mathematical expression or definition',
        suggestion: 'Type a mathematical formula such as 2 + 2 or f(x) := x^2',
        source: this.source,
      });
    }

    // Check for Assignment: variable := expr OR FunctionDef: f(x, y) := expr
    const def = this.tryParseDefinition();
    if (def) {
      this.expect('EOF', 'end of expression');
      return def;
    }

    const expr = this.parseExpression(PREC_NONE);
    this.expect('EOF', 'end of expression');
    return expr;
  }

  public parseProgram(): ASTNode {
    const statements: ASTNode[] = [];
    while (this.peek().type !== 'EOF') {
      const def = this.tryParseDefinition();
      if (def) {
        statements.push(def);
      } else {
        const expr = this.parseExpression(PREC_NONE);
        statements.push(expr);
      }
      if (this.peek().type === 'SEMICOLON') {
        this.advance();
      }
    }
    if (statements.length === 1) {
      return statements[0];
    }
    return {
      type: 'Block',
      statements,
      span: {
        start: 0,
        end: this.source.length,
        line: 1,
        col: 1,
      },
    };
  }

  private tryParseDefinition(): ASTNode | null {
    const startPos = this.pos;

    // Check for \axis X, Y, Z OR \axis[X, Y, Z]
    if (this.peek().type === 'AXIS') {
      const axisTok = this.advance();
      const hasBracket = this.peek().type === 'LBRACKET';
      if (hasBracket) {
        this.advance();
      }
      const axes: string[] = [];
      while (this.peek().type === 'IDENTIFIER') {
        const idTok = this.advance();
        axes.push(idTok.value);
        if (this.peek().type === 'COMMA') {
          this.advance();
        } else {
          break;
        }
      }
      let endPos = this.peek(-1).span.end;
      if (hasBracket) {
        const rBracket = this.expect('RBRACKET', ']');
        endPos = rBracket.span.end;
      }
      return {
        type: 'AxisDecl',
        axes,
        span: {
          start: axisTok.span.start,
          end: endPos,
          line: axisTok.span.line,
          col: axisTok.span.col,
        },
      };
    }

    // Check for claim <name> { ... }
    if (this.peek().type === 'CLAIM') {
      return this.parseClaim();
    }

    // Check for dimension <d1>, <d2>, ...
    if (this.peek().type === 'DIMENSION' && this.peek(1).type !== 'LPAREN') {
      const dimToken = this.advance();
      const dimensions: string[] = [];
      while (this.peek().type === 'IDENTIFIER') {
        dimensions.push(this.advance().value);
        if (this.peek().type === 'COMMA') {
          this.advance();
        } else {
          break;
        }
      }
      return {
        type: 'DimensionDecl',
        dimensions,
        span: {
          start: dimToken.span.start,
          end: this.peek(-1)?.span.end || dimToken.span.end,
          line: dimToken.span.line,
          col: dimToken.span.col,
        },
      };
    }

    // Check for unit <name> : <dimension> OR unit <name> = <expr>
    if (this.peek().type === 'UNIT') {
      const unitToken = this.advance();
      const nameToken = this.expect('IDENTIFIER', 'unit name');
      if (this.peek().type === 'COLON') {
        this.advance();
        const dimToken = this.expect('IDENTIFIER', 'dimension name');
        return {
          type: 'UnitDecl',
          name: nameToken.value,
          dimension: dimToken.value,
          span: {
            start: unitToken.span.start,
            end: dimToken.span.end,
            line: unitToken.span.line,
            col: unitToken.span.col,
          },
        };
      }
      if (this.peek().type === 'EQ' || this.peek().type === 'ASSIGN') {
        this.advance();
        const def = this.parseExpression(PREC_NONE);
        return {
          type: 'UnitDecl',
          name: nameToken.value,
          definition: def,
          span: {
            start: unitToken.span.start,
            end: def.span.end,
            line: unitToken.span.line,
            col: unitToken.span.col,
          },
        };
      }
    }

    // Check for operator (prefix|postfix|infix) <op> (params) := <body>
    if (this.peek().type === 'OPERATOR') {
      const opToken = this.advance();
      let fixity: 'infix' | 'prefix' | 'postfix' = 'infix';
      if (this.peek().type === 'PREFIX') {
        this.advance();
        fixity = 'prefix';
      } else if (this.peek().type === 'POSTFIX') {
        this.advance();
        fixity = 'postfix';
      } else if (this.peek().type === 'INFIX') {
        this.advance();
        fixity = 'infix';
      }

      const symToken = this.advance();
      const opSymbol = symToken.value;

      this.expect('LPAREN', '(');
      const params: string[] = [];
      while (this.peek().type !== 'RPAREN' && this.peek().type !== 'EOF') {
        const p = this.expect('IDENTIFIER', 'parameter name');
        params.push(p.value);
        if (this.peek().type === 'COMMA') this.advance();
      }
      this.expect('RPAREN', ')');
      if (this.peek().type === 'ASSIGN' || this.peek().type === 'EQ') {
        this.advance();
      }
      const body = this.parseExpression(PREC_NONE);
      let precedence: number | undefined;
      let associativity: 'left' | 'right' | undefined;

      while (this.peek().type === 'PRECEDENCE' || this.peek().type === 'ASSOCIATIVITY') {
        if (this.peek().type === 'PRECEDENCE') {
          this.advance();
          this.expect('COLON', ':');
          const precToken = this.expect('NUMBER', 'precedence number');
          precedence = parseFloat(precToken.value);
        } else if (this.peek().type === 'ASSOCIATIVITY') {
          this.advance();
          this.expect('COLON', ':');
          let assocVal = 'left';
          if (this.peek().type === 'IDENTIFIER') {
            const assocToken = this.advance();
            assocVal = assocToken.value.replace(/^:/, '');
          }
          associativity = assocVal === 'right' ? 'right' : 'left';
        }
      }

      return {
        type: 'OperatorDecl',
        op: opSymbol,
        fixity,
        params,
        body,
        precedence,
        associativity,
        span: {
          start: opToken.span.start,
          end: body.span.end,
          line: opToken.span.line,
          col: opToken.span.col,
        },
      };
    }

    // Check for kind <Name>(params) extends <Parent>(args) { ... }
    if (this.peek().type === 'KIND' && this.peek(1).type !== 'LPAREN' && this.peek(1).type !== 'COLON') {
      return this.parseKindDecl();
    }

    // Check for rule <name>: <pattern> = <replacement> (\requires <cond>) OR \rule <pattern> => <replacement>
    if (this.peek().type === 'RULE') {
      const ruleToken = this.advance();
      let ruleName: string | undefined;

      // Optional rule name: \rule name: ...
      if (this.peek().type === 'IDENTIFIER' && (this.peek(1).type === 'COLON')) {
        ruleName = this.advance().value;
        this.advance(); // consume ':'
      }

      const patTokens: Token[] = [];
      let depth = 0;
      while (this.peek().type !== 'EOF') {
        const t = this.peek().type;
        if (depth === 0 && (t === 'FAT_ARROW' || t === 'EQ' || t === 'ASSIGN')) {
          break;
        }
        if (t === 'LPAREN' || t === 'LBRACKET' || t === 'LBRACE') depth++;
        else if (t === 'RPAREN' || t === 'RBRACKET' || t === 'RBRACE') depth--;
        patTokens.push(this.advance());
      }
      this.advance(); // consume => or =

      const lastPatSpan = patTokens.length > 0 ? patTokens[patTokens.length - 1].span : ruleToken.span;
      patTokens.push({
        type: 'EOF',
        value: '',
        span: lastPatSpan,
        leadingWhitespace: false,
      });
      const patternParser = new Parser(patTokens, { source: this.source });
      const patternAST = patternParser.parseExpression(PREC_NONE);

      const replTokens: Token[] = [];
      let rdepth = 0;
      while (this.peek().type !== 'EOF') {
        const t = this.peek().type;
        if (rdepth === 0 && t === 'REQUIRES') {
          break;
        }
        if (t === 'LPAREN' || t === 'LBRACKET' || t === 'LBRACE') rdepth++;
        else if (t === 'RPAREN' || t === 'RBRACKET' || t === 'RBRACE') rdepth--;
        replTokens.push(this.advance());
      }
      const lastReplSpan = replTokens.length > 0 ? replTokens[replTokens.length - 1].span : ruleToken.span;
      replTokens.push({
        type: 'EOF',
        value: '',
        span: lastReplSpan,
        leadingWhitespace: false,
      });
      const replParser = new Parser(replTokens, { source: this.source });
      const replacementAST = replParser.parseExpression(PREC_NONE);

      let requiresAST: ASTNode | undefined;
      if (this.peek().type === 'REQUIRES') {
        this.advance();
        if (this.peek().type === 'COLON') this.advance();
        requiresAST = this.parseExpression(PREC_NONE);
      }

      return {
        type: 'RuleDecl',
        name: ruleName,
        pattern: patternAST,
        replacement: replacementAST,
        requires: requiresAST,
        span: {
          start: ruleToken.span.start,
          end: this.peek(-1)?.span.end || ruleToken.span.end,
          line: ruleToken.span.line,
          col: ruleToken.span.col,
        },
      };
    }

    // Check for module <name>
    if (this.peek().type === 'MODULE') {
      const modToken = this.advance();
      const nameToken = this.expect('IDENTIFIER', 'module name');
      return {
        type: 'ModuleDecl',
        name: nameToken.value,
        span: {
          start: modToken.span.start,
          end: nameToken.span.end,
          line: modToken.span.line,
          col: modToken.span.col,
        },
      };
    }

    // Check for export <sym1>, <sym2>
    if (this.peek().type === 'EXPORT') {
      const expToken = this.advance();
      const symbols: string[] = [];
      while (this.peek().type === 'IDENTIFIER' || this.isContextualKeyword(this.peek().type)) {
        symbols.push(this.advance().value);
        if (this.peek().type === 'COMMA') this.advance();
        else break;
      }
      return {
        type: 'Export',
        symbols,
        span: {
          start: expToken.span.start,
          end: this.peek(-1)?.span.end || expToken.span.end,
          line: expToken.span.line,
          col: expToken.span.col,
        },
      };
    }

    // Check for import "<path>" (as <name>)
    if (this.peek().type === 'IMPORT') {
      const impToken = this.advance();
      const pathToken = this.expect('STRING', 'module path');
      let asName: string | undefined;
      if (this.peek().type === 'AS') {
        this.advance();
        asName = this.expect('IDENTIFIER', 'alias name').value;
      }
      return {
        type: 'Import',
        path: pathToken.value,
        asName,
        span: {
          start: impToken.span.start,
          end: this.peek(-1)?.span.end || pathToken.span.end,
          line: impToken.span.line,
          col: impToken.span.col,
        },
      };
    }

    // Check for from "<path>" import <sym1>, <sym2>
    if (this.peek().type === 'FROM') {
      const fromToken = this.advance();
      const pathToken = this.expect('STRING', 'module path');
      this.expect('IMPORT', 'import');
      const symbols: string[] = [];
      while (this.peek().type === 'IDENTIFIER') {
        symbols.push(this.advance().value);
        if (this.peek().type === 'COMMA') this.advance();
        else break;
      }
      return {
        type: 'Import',
        path: pathToken.value,
        importedSymbols: symbols,
        span: {
          start: fromToken.span.start,
          end: this.peek(-1)?.span.end || pathToken.span.end,
          line: fromToken.span.line,
          col: fromToken.span.col,
        },
      };
    }

    // Check for view for <Type> := <viewFunction>
    if (this.peek().type === 'VIEW') {
      const viewToken = this.advance();
      if (this.peek().type === 'FOR') {
        this.advance();
      }
      const targetTypeToken = this.expect('IDENTIFIER', 'view target type name');
      if (this.peek().type === 'EQ' || this.peek().type === 'ASSIGN' || this.peek().type === 'GLOBAL_ASSIGN') {
        this.advance();
      }
      const viewFunction = this.parseExpression(PREC_NONE);
      return {
        type: 'ViewDecl',
        targetType: targetTypeToken.value,
        viewFunction,
        span: {
          start: viewToken.span.start,
          end: viewFunction.span.end,
          line: viewToken.span.line,
          col: viewToken.span.col,
        },
      };
    }

    if (this.peek().type === 'UNIMPORT') {
      const uTok = this.advance();
      let name = '';
      if (this.peek().type === 'IDENTIFIER') {
        const idTok = this.advance();
        name = idTok.value;
      }
      return {
        type: 'Unimport',
        name,
        span: {
          start: uTok.span.start,
          end: this.peek(-1).span.end,
          line: uTok.span.line,
          col: uTok.span.col,
        },
      };
    }

    // Check for unimport: ident- or :ident- on its own line / statement
    if (this.peek().type === 'IDENTIFIER') {
      let p = 0;
      let combinedName = '';
      while (this.peek(p).type === 'IDENTIFIER' && (p === 0 || !this.peek(p).leadingWhitespace)) {
        combinedName += this.peek(p).value;
        p++;
      }
      if (this.peek(p).type === 'MINUS' && !this.peek(p).leadingWhitespace) {
        const minusTok = this.peek(p);
        const nextTok = this.peek(p + 1);
        if (
          nextTok.type === 'EOF' ||
          nextTok.type === 'SEMICOLON' ||
          nextTok.type === 'RBRACE' ||
          nextTok.span.line > minusTok.span.line
        ) {
          const firstTok = this.peek();
          for (let i = 0; i <= p; i++) {
            this.advance();
          }
          return {
            type: 'Unimport',
            name: combinedName,
            span: {
              start: firstTok.span.start,
              end: minusTok.span.end,
              line: firstTok.span.line,
              col: firstTok.span.col,
            },
          };
        }
      }
    }

    // Check for f(x, y) = expr OR f(x, y) := expr OR f(x, y) :== expr
    if (
      this.peek().type === 'IDENTIFIER' &&
      this.peek(1).type === 'LPAREN'
    ) {
      const nameToken = this.peek();
      let p = 2;
      const params: string[] = [];
      let validSig = true;

      while (this.peek(p).type !== 'RPAREN' && this.peek(p).type !== 'EOF') {
        if (this.peek(p).type === 'IDENTIFIER') {
          params.push(this.peek(p).value);
          p++;
          if (this.peek(p).type === 'COMMA') {
            p++;
          } else if (this.peek(p).type !== 'RPAREN') {
            validSig = false;
            break;
          }
        } else {
          validSig = false;
          break;
        }
      }

      const nextTokType = this.peek(p + 1).type;
      const isColonPrefixed = nameToken.span.end - nameToken.span.start > nameToken.value.length;
      const isDefOp = nextTokType === 'ASSIGN' || nextTokType === 'GLOBAL_ASSIGN' || (nextTokType === 'EQ' && (nameToken.value.length > 1 || isColonPrefixed));

      if (validSig && this.peek(p).type === 'RPAREN' && isDefOp) {
        this.advance(); // consume name
        this.advance(); // consume (
        const paramNames: string[] = [];
        while (this.peek().type !== 'RPAREN') {
          const paramToken = this.expect('IDENTIFIER', 'parameter name');
          paramNames.push(paramToken.value);
          if (this.peek().type === 'COMMA') {
            this.advance();
          }
        }
        this.expect('RPAREN', ')');
        const defOpTok = this.advance(); // consume = or := or :==

        if (defOpTok.type === 'ASSIGN' || defOpTok.type === 'GLOBAL_ASSIGN' || nameToken.value.length > 1) {
          this.knownFunctions.add(nameToken.value);
        }
        const body = this.parseExpression(PREC_NONE);
        const span: Span = {
          start: nameToken.span.start,
          end: body.span.end,
          line: nameToken.span.line,
          col: nameToken.span.col,
        };
        return {
          type: 'FunctionDef',
          name: nameToken.value,
          params: paramNames,
          body,
          span,
        };
      }
    }

    // Check for variable :equiv expr or variable :== expr (Global assignment)
    if (this.peek().type === 'IDENTIFIER' && this.peek(1).type === 'GLOBAL_ASSIGN') {
      const targetToken = this.advance();
      this.advance(); // consume :equiv or :==
      const value = this.parseExpression(PREC_NONE);
      const span: Span = {
        start: targetToken.span.start,
        end: value.span.end,
        line: targetToken.span.line,
        col: targetToken.span.col,
      };
      return {
        type: 'GlobalAssignment',
        target: targetToken.value,
        value,
        span,
      };
    }

    // Check for variable := expr (Assignment)
    if (this.peek().type === 'IDENTIFIER' && this.peek(1).type === 'ASSIGN') {
      const targetToken = this.advance();
      this.advance(); // consume :=
      const value = this.parseExpression(PREC_NONE);
      const span: Span = {
        start: targetToken.span.start,
        end: value.span.end,
        line: targetToken.span.line,
        col: targetToken.span.col,
      };
      return {
        type: 'Assignment',
        target: targetToken.value,
        value,
        span,
      };
    }

    this.pos = startPos;
    return null;
  }

  public parseExpression(precedence: number): ASTNode {
    return this.parseExpressionWithLeft(this.parsePrefix(), precedence);
  }

  public parseExpressionWithLeft(initialLeft: ASTNode, precedence: number): ASTNode {
    let left = initialLeft;

    while (true) {
      // Check for Postfix operators (! and superscript digits)
      if (this.peek().type === 'BANG' && precedence < PREC_POSTFIX) {
        const bangToken = this.advance();
        const span: Span = {
          start: left.span.start,
          end: bangToken.span.end,
          line: left.span.line,
          col: left.span.col,
        };
        left = {
          type: 'PostfixOp',
          op: '!',
          operand: left,
          span,
        };
        continue;
      }

      if (this.peek().type === 'SUPERSCRIPT_DIGITS' && precedence < PREC_POSTFIX) {
        const superToken = this.advance();
        const span: Span = {
          start: left.span.start,
          end: superToken.span.end,
          line: left.span.line,
          col: left.span.col,
        };
        left = {
          type: 'PostfixOp',
          op: 'superscript',
          operand: left,
          exponent: BigInt(superToken.value),
          span,
        };
        continue;
      }

      // Check for member access: left.property
      if (this.peek().type === 'DOT' && precedence < PREC_POSTFIX) {
        this.advance(); // consume .
        const propToken = this.advance();
        if (propToken.type !== 'IDENTIFIER') {
          throw createError(`Expected property identifier after '.'`, propToken.span, {
            expected: 'a valid property name (e.g. steps, result, after, before)',
            suggestion: 'Check member access syntax',
            source: this.source,
          });
        }
        const span: Span = {
          start: left.span.start,
          end: propToken.span.end,
          line: left.span.line,
          col: left.span.col,
        };
        left = {
          type: 'MemberAccess',
          target: left,
          property: propToken.value,
          span,
        };
        continue;
      }

      // Check for indexing: left[index]
      if (this.peek().type === 'LBRACKET' && precedence < PREC_POSTFIX) {
        this.advance(); // consume [
        const indexNode = this.parseExpression(PREC_NONE);
        const rBracket = this.expect('RBRACKET', ']');
        const span: Span = {
          start: left.span.start,
          end: rBracket.span.end,
          line: left.span.line,
          col: left.span.col,
        };
        if (left.type === 'Identifier' && left.name === 'E') {
          left = {
            type: 'Probability',
            op: 'expect',
            event: indexNode,
            span,
          };
        } else {
          left = {
            type: 'Index',
            target: left,
            index: indexNode,
            span,
          };
        }
        continue;
      }

      // Check for record with { field: val, ... }
      if (this.peek().type === 'WITH' && precedence < PREC_COMPARE) {
        this.advance(); // consume with
        this.expect('LBRACE', '{');
        const updates: { name: string; value: ASTNode }[] = [];
        while (this.peek().type !== 'RBRACE' && this.peek().type !== 'EOF') {
          const fieldToken = this.expect('IDENTIFIER', 'field name');
          this.expect('COLON', ':');
          const val = this.parseExpression(PREC_NONE);
          updates.push({ name: fieldToken.value, value: val });
          if (this.peek().type === 'COMMA') {
            this.advance();
          } else {
            break;
          }
        }
        const rBrace = this.expect('RBRACE', '}');
        left = {
          type: 'RecordWith',
          target: left,
          updates,
          span: {
            start: left.span.start,
            end: rBrace.span.end,
            line: left.span.line,
            col: left.span.col,
          },
        };
        continue;
      }

      // Check for postfix CUSTOM_OP (e.g. ° or trailing custom operator)
      if (this.peek().type === 'CUSTOM_OP') {
        const opTok = this.peek();
        const nextTok = this.peek(1);
        const isPostfix =
          opTok.value === '°' ||
          nextTok.type === 'EOF' ||
          nextTok.type === 'COMMA' ||
          nextTok.type === 'RPAREN' ||
          nextTok.type === 'RBRACKET' ||
          nextTok.type === 'RBRACE' ||
          nextTok.type === 'SEMICOLON' ||
          nextTok.type === 'EQ' ||
          nextTok.type === 'NEQ' ||
          nextTok.type === 'LT' ||
          nextTok.type === 'LTE' ||
          nextTok.type === 'GT' ||
          nextTok.type === 'GTE' ||
          nextTok.type === 'PLUS' ||
          nextTok.type === 'MINUS' ||
          nextTok.type === 'STAR' ||
          nextTok.type === 'SLASH';

        if (isPostfix && precedence < PREC_POSTFIX) {
          this.advance();
          left = {
            type: 'PostfixOp',
            op: opTok.value,
            operand: left,
            span: {
              start: left.span.start,
              end: opTok.span.end,
              line: left.span.line,
              col: left.span.col,
            },
          };
          continue;
        }
      }

      // Check for implicit multiplication before other infix ops
      if (this.canBeginImplicitMultiplication(left)) {
        const nextPrec = PREC_IMPLICIT_MUL;
        if (precedence < nextPrec) {
          const right = this.parseExpression(nextPrec);
          const span: Span = {
            start: left.span.start,
            end: right.span.end,
            line: left.span.line,
            col: left.span.col,
          };
          left = {
            type: 'BinaryOp',
            op: '*',
            left,
            right,
            isImplicit: true,
            span,
          };
          continue;
        }
      }

      // Infix binary BAR_SEP: a | b (divides / bitwise or)
      if (this.peek().type === 'BAR_SEP' && this.pipeDepth === 0 && precedence < PREC_COMPARE) {
        this.advance(); // consume |
        const right = this.parseExpression(PREC_COMPARE);
        const span: Span = {
          start: left.span.start,
          end: right.span.end,
          line: left.span.line,
          col: left.span.col,
        };
        left = {
          type: 'BinaryOp',
          op: '|',
          left,
          right,
          isImplicit: false,
          span,
        };
        continue;
      }

      // Infix operators
      const token = this.peek();
      const infixPrec = this.getInfixPrecedence(token.type);
      if (infixPrec <= precedence) {
        break;
      }

      this.advance();

      // Right-associative for '^', left-associative for others
      const rightPrec = token.type === 'CARET' ? infixPrec - 1 : infixPrec;

      // Handle '\where' constraint
      if (token.type === 'WHERE') {
        const cond = this.parseExpression(PREC_WHERE);
        const span: Span = {
          start: left.span.start,
          end: cond.span.end,
          line: left.span.line,
          col: left.span.col,
        };
        left = {
          type: 'Where',
          expr: left,
          condition: cond,
          span,
        };
        continue;
      }

      // Handle 'in' or '\in' or '\u2208' (Set membership / interval / range relation)
      if (token.type === 'IN' || token.type === 'SET_IN') {
        const varName = left.type === 'Identifier' ? left.name : undefined;

        // Check for Interval: [a, b], (a, b), [a, b), (a, b]
        if (this.peek().type === 'LBRACKET' || this.peek().type === 'LPAREN') {
          const isLeftClosed = this.peek().type === 'LBRACKET';
          this.advance(); // consume [ or (
          const startExpr = this.parseExpression(PREC_NONE);
          this.expect('COMMA', ',');
          const endExpr = this.parseExpression(PREC_NONE);
          const nextType = this.peek().type;
          let isRightClosed = true;
          let rDelimTok: Token;
          if (nextType === 'RBRACKET') {
            rDelimTok = this.advance();
            isRightClosed = true;
          } else if (nextType === 'RPAREN') {
            rDelimTok = this.advance();
            isRightClosed = false;
          } else {
            throw createError(`Expected ']' or ')' to close interval`, this.peek().span, {
              expected: "']' or ')'",
              source: this.source,
            });
          }

          let kind: IntervalNode['kind'] = 'closed';
          if (isLeftClosed && isRightClosed) kind = 'closed';
          else if (!isLeftClosed && !isRightClosed) kind = 'open';
          else if (!isLeftClosed && isRightClosed) kind = 'left_open';
          else kind = 'right_open';

          const isInfStart =
            (startExpr.type === 'Identifier' && (startExpr.name === 'inf' || startExpr.name === 'infty')) ||
            (startExpr.type === 'UnaryOp' && startExpr.op === '-' && startExpr.operand.type === 'Identifier' && (startExpr.operand.name === 'inf' || startExpr.operand.name === 'infty'));
          const isInfEnd = endExpr.type === 'Identifier' && (endExpr.name === 'inf' || endExpr.name === 'infty');

          const intervalNode: IntervalNode = {
            type: 'Interval',
            kind,
            start: startExpr,
            end: endExpr,
            variable: varName,
            isInfStart,
            isInfEnd,
            span: {
              start: left.span.start,
              end: rDelimTok.span.end,
              line: left.span.line,
              col: left.span.col,
            },
          };

          left = {
            type: 'SetOp',
            op: 'in',
            left,
            right: intervalNode,
            span: {
              start: left.span.start,
              end: rDelimTok.span.end,
              line: left.span.line,
              col: left.span.col,
            },
          };
          continue;
        }

        const rangeStart = this.parseExpression(PREC_IN);
        if (this.peek().type === 'DOTDOT') {
          this.advance();
          const rangeEnd = this.parseExpression(PREC_IN);
          let stepExpr: ASTNode | undefined;
          if (this.peek().type === 'STEP') {
            this.advance();
            stepExpr = this.parseExpression(PREC_IN);
          }
          const span: Span = {
            start: left.span.start,
            end: (stepExpr ?? rangeEnd).span.end,
            line: left.span.line,
            col: left.span.col,
          };
          left = {
            type: 'Range',
            variable: varName ?? '',
            start: rangeStart,
            end: rangeEnd,
            step: stepExpr,
            span,
          };
        } else {
          const span: Span = {
            start: left.span.start,
            end: rangeStart.span.end,
            line: left.span.line,
            col: left.span.col,
          };
          left = {
            type: 'SetOp',
            op: 'in',
            left,
            right: rangeStart,
            span,
          };
        }
        continue;
      }

      // Handle '..' for anonymous ranges: a..b (step c)
      if (token.type === 'DOTDOT') {
        const rangeEnd = this.parseExpression(PREC_IN);
        let stepExpr: ASTNode | undefined;
        if (this.peek().type === 'STEP') {
          this.advance();
          stepExpr = this.parseExpression(PREC_IN);
        }
        const span: Span = {
          start: left.span.start,
          end: (stepExpr ?? rangeEnd).span.end,
          line: left.span.line,
          col: left.span.col,
        };
        left = {
          type: 'Range',
          variable: '',
          start: left,
          end: rangeEnd,
          step: stepExpr,
          span,
        };
        continue;
      }

      if (token.type === 'DAGGER') {
        left = {
          type: 'MatrixPostfix',
          op: 'adjoint',
          target: left,
          span: {
            start: left.span.start,
            end: token.span.end,
            line: left.span.line,
            col: left.span.col,
          },
        };
        continue;
      }

      if (token.type === 'CARET') {
        // Check for ^T
        if (this.peek().type === 'IDENTIFIER' && (this.peek().value === 'T' || this.peek().value === 't')) {
          const tTok = this.advance();
          left = {
            type: 'MatrixPostfix',
            op: 'transpose',
            target: left,
            span: {
              start: left.span.start,
              end: tTok.span.end,
              line: left.span.line,
              col: left.span.col,
            },
          };
          continue;
        }
        // Check for ^\u2020 or ^dagger or ^adj
        if (
          this.peek().type === 'DAGGER' ||
          (this.peek().type === 'IDENTIFIER' && (this.peek().value === 'dagger' || this.peek().value === 'adj'))
        ) {
          const dagTok = this.advance();
          left = {
            type: 'MatrixPostfix',
            op: 'adjoint',
            target: left,
            span: {
              start: left.span.start,
              end: dagTok.span.end,
              line: left.span.line,
              col: left.span.col,
            },
          };
          continue;
        }
        // Check for ^-1 or ^(-1)
        if (this.peek().type === 'MINUS' && this.peek(1).type === 'NUMBER' && this.peek(1).value === '1') {
          this.advance(); // consume -
          const oneTok = this.advance(); // consume 1
          left = {
            type: 'MatrixPostfix',
            op: 'inverse',
            target: left,
            span: {
              start: left.span.start,
              end: oneTok.span.end,
              line: left.span.line,
              col: left.span.col,
            },
          };
          continue;
        }
        if (
          this.peek().type === 'LPAREN' &&
          this.peek(1).type === 'MINUS' &&
          this.peek(2).type === 'NUMBER' &&
          this.peek(2).value === '1' &&
          this.peek(3).type === 'RPAREN'
        ) {
          this.advance(); // (
          this.advance(); // -
          this.advance(); // 1
          const rParen = this.advance(); // )
          left = {
            type: 'MatrixPostfix',
            op: 'inverse',
            target: left,
            span: {
              start: left.span.start,
              end: rParen.span.end,
              line: left.span.line,
              col: left.span.col,
            },
          };
          continue;
        }
      }

      if (
        this.peek().type === 'PLUS' ||
        this.peek().type === 'STAR' ||
        this.peek().type === 'SLASH' ||
        this.peek().type === 'PERCENT' ||
        this.peek().type === 'CARET'
      ) {
        const nextOp = this.peek();
        throw createError(`Unexpected operator '${nextOp.value}' following '${token.value}'`, nextOp.span, {
          expected: 'an operand (number, variable, or parenthesized expression)',
          suggestion: `Remove the operator '${nextOp.value}' or wrap the operand in parentheses`,
          source: this.source,
        });
      }

      const right = this.parseExpression(rightPrec);
      const span: Span = {
        start: left.span.start,
        end: right.span.end,
        line: left.span.line,
        col: left.span.col,
      };

      if (token.type === 'WEDGE') {
        left = {
          type: 'DifferentialFormOp',
          op: 'wedge',
          operands: [left, right],
          span,
        };
        continue;
      }

      if (token.type === 'TENSOR_PROD' || token.type === 'DIRECT_SUM') {
        left = {
          type: 'TensorOp',
          op: token.type === 'TENSOR_PROD' ? 'tensor' : 'direct_sum',
          left,
          right,
          span,
        };
        continue;
      }

      if (
        token.type === 'SET_UNION' ||
        token.type === 'SET_INTERSECT' ||
        token.type === 'SET_DIFF' ||
        token.type === 'SET_SUBSET' ||
        token.type === 'SET_SUBSETEQ' ||
        token.type === 'SET_NOTIN'
      ) {
        const opMap: Record<string, SetOpNode['op']> = {
          SET_UNION: 'union',
          SET_INTERSECT: 'intersect',
          SET_DIFF: 'setminus',
          SET_SUBSET: 'subset',
          SET_SUBSETEQ: 'subseteq',
          SET_NOTIN: 'notin',
        };
        left = {
          type: 'SetOp',
          op: opMap[token.type] || 'union',
          left,
          right,
          span,
        };
        continue;
      }

      if (token.type === 'ISO' || token.type === 'HOMOTOPY' || token.type === 'EQUIV' || token.type === 'CONGRUENT') {
        const relMap: Record<string, EquivalenceNode['relation']> = {
          ISO: 'iso',
          HOMOTOPY: 'homotopy',
          EQUIV: 'equiv',
          CONGRUENT: 'equiv',
        };
        left = {
          type: 'Equivalence',
          relation: relMap[token.type] || 'equiv',
          left,
          right,
          span,
        };
        continue;
      }

      const op = this.tokenToBinaryOp(token);
      left = {
        type: 'BinaryOp',
        op,
        left,
        right,
        isImplicit: false,
        span,
      };
    }

    return left;
  }

  private parsePrefix(): ASTNode {
    const token = this.peek();

    // Expression manipulation & Pattern matching (C1)
    if (token.type === 'MATCH') {
      return this.parseMatch();
    }
    if (token.type === 'BUILD') {
      return this.parseBuild();
    }
    if (token.type === 'QUOTE') {
      return this.parseQuote();
    }
    if (token.type === 'UNQUOTE') {
      return this.parseUnquote();
    }

    // Conditionals: if <cond> then <expr> else <expr>
    if (token.type === 'IF') {
      this.advance(); // consume if
      const condition = this.parseExpression(PREC_NONE);
      this.expect('THEN', 'then');
      const thenBranch = this.parseExpression(PREC_NONE);
      this.expect('ELSE', 'else');
      const elseBranch = this.parseExpression(PREC_NONE);
      const span: Span = {
        start: token.span.start,
        end: elseBranch.span.end,
        line: token.span.line,
        col: token.span.col,
      };
      return {
        type: 'If',
        condition,
        thenBranch,
        elseBranch,
        span,
      };
    }

    // Unary not
    if (token.type === 'NOT') {
      this.advance();
      const operand = this.parseExpression(PREC_NOT);
      const span: Span = {
        start: token.span.start,
        end: operand.span.end,
        line: token.span.line,
        col: token.span.col,
      };
      return {
        type: 'UnaryOp',
        op: 'not',
        operand,
        span,
      };
    }

    // Unary plus
    if (token.type === 'PLUS') {
      this.advance();
      const operand = this.parseExpression(PREC_UNARY);
      const span: Span = {
        start: token.span.start,
        end: operand.span.end,
        line: token.span.line,
        col: token.span.col,
      };
      return {
        type: 'UnaryOp',
        op: '+',
        operand,
        span,
      };
    }

    // Unary minus
    if (token.type === 'MINUS') {
      this.advance();
      const operand = this.parseExpression(PREC_UNARY);
      const span: Span = {
        start: token.span.start,
        end: operand.span.end,
        line: token.span.line,
        col: token.span.col,
      };
      return {
        type: 'UnaryOp',
        op: '-',
        operand,
        span,
      };
    }

    // String literal
    if (token.type === 'STRING') {
      this.advance();
      return {
        type: 'StringLiteral',
        value: token.value,
        span: token.span,
      };
    }

    // Block expression: { stmt1; stmt2; ... } or Set-builder: { x in S : P(x) }
    if (token.type === 'LBRACE') {
      return this.parseBlock();
    }

    // Function call syntax for search builtins and operator keywords: solve(...), isolate(...), simplify(...), check(...), find(...), wedge(...), etc.
    if (
      (token.type === 'SOLVE' ||
        token.type === 'ISOLATE' ||
        token.type === 'SIMPLIFY' ||
        token.type === 'CHECK' ||
        token.type === 'FIND' ||
        token.type === 'BACKSLASH_IDENT' ||
        token.type === 'WEDGE' ||
        token.type === 'TENSOR_PROD' ||
        token.type === 'DIRECT_SUM' ||
        token.type === 'HODGE_STAR' ||
        token.type === 'NABLA' ||
        token.type === 'LAPLACIAN') &&
      this.peek(1).type === 'LPAREN'
    ) {
      const tok = this.advance();
      return this.parseFunctionCallArgs(tok.value, tok.span);
    }
    if (token.type === 'BACKSLASH_IDENT') {
      const tok = this.advance();
      return {
        type: 'Identifier',
        name: tok.value,
        span: tok.span,
      };
    }

    // Multiple / Contour Integrals: double, triple, contour
    if (
      token.type === 'DOUBLE_INTEGRAL' ||
      token.type === 'TRIPLE_INTEGRAL' ||
      token.type === 'CONTOUR_INTEGRAL' ||
      (token.type === 'IDENTIFIER' &&
        (token.value === 'iint' ||
          token.value === 'iiint' ||
          token.value === 'oint' ||
          token.value.startsWith('iint_') ||
          token.value.startsWith('iiint_') ||
          token.value.startsWith('oint_')))
    ) {
      return this.parseRegionIntegral();
    }

    // Nabla & Laplacian
    if (token.type === 'NABLA' || token.type === 'LAPLACIAN') {
      return this.parseNabla();
    }

    // Hodge Star
    if (token.type === 'HODGE_STAR') {
      const starTok = this.advance();
      const operand = this.parseExpression(PREC_UNARY);
      return {
        type: 'DifferentialFormOp',
        op: 'hodge_star',
        operands: [operand],
        span: {
          start: starTok.span.start,
          end: operand.span.end,
          line: starTok.span.line,
          col: starTok.span.col,
        },
      };
    }

    // Bracket Operators: inner product, norm, floor, ceil, abs
    if (
      token.type === 'LANGLE' ||
      token.type === 'NORM_BAR' ||
      token.type === 'FLOOR_L' ||
      token.type === 'CEIL_L' ||
      token.type === 'BAR_SEP'
    ) {
      return this.parseBracketOp();
    }

    // Custom prefix operator
    if (token.type === 'CUSTOM_OP') {
      const opTok = this.advance();
      const operand = this.parseExpression(PREC_UNARY);
      return {
        type: 'UnaryOp',
        op: opTok.value,
        operand,
        span: {
          start: opTok.span.start,
          end: operand.span.end,
          line: opTok.span.line,
          col: opTok.span.col,
        },
      };
    }

    // User kind expression: kind LieAlgebra(dim, field) extends ...
    if (token.type === 'KIND' && this.peek(1).type !== 'LPAREN' && this.peek(1).type !== 'COLON') {
      return this.parseKindDecl();
    }

    // Quantifiers: forall, exists, exists_unique
    if (token.type === 'FORALL' || token.type === 'EXISTS' || token.type === 'EXISTS_UNIQUE') {
      return this.parseQuantifier();
    }

    // Big Operators: Σ, Π
    if (token.type === 'SIGMA' || token.type === 'PI_PROD') {
      return this.parseBigOp();
    }

    // Integral: \u222b or integral
    if (token.type === 'INTEGRAL' || (token.type === 'IDENTIFIER' && (token.value === 'integral' || token.value === ':integral' || token.value.startsWith('integral_') || token.value.startsWith(':integral_')))) {
      return this.parseIntegral();
    }

    // Record definition expression: record { mass, position, velocity }
    if (token.type === 'RECORD') {
      this.advance();
      this.expect('LBRACE', '{');
      const fields: string[] = [];
      while (this.peek().type !== 'RBRACE' && this.peek().type !== 'EOF') {
        const nextTok = this.peek();
        let fieldName = '';
        if (nextTok.type === 'IDENTIFIER' || this.isContextualKeyword(nextTok.type)) {
          fieldName = this.advance().value;
        } else {
          const fieldToken = this.expect('IDENTIFIER', 'field name');
          fieldName = fieldToken.value;
        }
        fields.push(fieldName);
        if (this.peek().type === 'COMMA') {
          this.advance();
        } else {
          break;
        }
      }
      const rBrace = this.expect('RBRACE', '}');
      return {
        type: 'RecordDef',
        fields,
        span: {
          start: token.span.start,
          end: rBrace.span.end,
          line: token.span.line,
          col: token.span.col,
        },
      };
    }

    // Number literal
    if (token.type === 'NUMBER') {
      this.advance();
      return {
        type: 'NumberLiteral',
        raw: token.value,
        span: token.span,
      };
    }

    // Limit: lim(x -> a, expr), lim sup, lim inf
    if (token.type === 'IDENTIFIER' && (token.value === 'lim' || token.value === ':lim' || token.value === 'limit' || token.value === ':limit' || token.value === 'limsup' || token.value === ':limsup' || token.value === 'liminf' || token.value === ':liminf') && (this.peek(1).type === 'LPAREN' || this.peek(1).type === 'IDENTIFIER')) {
      return this.parseLimit();
    }

    // Differential operator d//dx expr or \u2202//\u2202x expr or d/dx expr
    if (
      (token.value === 'd' || token.value === '\u2202') &&
      (this.peek(1).type === 'DOUBLE_SLASH' ||
        (this.peek(1).type === 'SLASH' &&
          this.peek(2).type === 'IDENTIFIER' &&
          (this.peek(2).value.startsWith('d') || this.peek(2).value.startsWith('\u2202')) &&
          this.peek(3).type !== 'EOF' &&
          this.peek(3).type !== 'COMMA' &&
          this.peek(3).type !== 'RPAREN' &&
          this.peek(3).type !== 'RBRACKET' &&
          this.peek(3).type !== 'RBRACE'))
    ) {
      return this.parseDiff();
    }

    // Lambdas: x -> expr
    if (token.type === 'IDENTIFIER' && this.peek(1).type === 'ARROW') {
      const paramToken = this.advance(); // consume param
      this.advance(); // consume ->
      const body = this.parseExpression(PREC_NONE);
      const span: Span = {
        start: paramToken.span.start,
        end: body.span.end,
        line: paramToken.span.line,
        col: paramToken.span.col,
      };
      return {
        type: 'Lambda',
        params: [paramToken.value],
        body,
        span,
      };
    }

    // Identifiers, Function Calls, Bare Function Applications
    if (
      token.type === 'IDENTIFIER' ||
      token.type === 'REQUIRES' ||
      token.type === 'FROM' ||
      token.type === 'AS' ||
      token.type === 'KIND' ||
      token.type === 'DIMENSION' ||
      token.type === 'UNIT' ||
      token.type === 'OPERATOR' ||
      token.type === 'PREFIX' ||
      token.type === 'POSTFIX' ||
      token.type === 'INFIX' ||
      token.type === 'PRECEDENCE' ||
      token.type === 'ASSOCIATIVITY' ||
      token.type === 'EXTENDS' ||
      token.type === 'OPERATIONS' ||
      token.type === 'AXIOMS' ||
      token.type === 'MODULE' ||
      token.type === 'EXPORT' ||
      token.type === 'IMPORT' ||
      token.type === 'IS' ||
      token.type === 'VIEW' ||
      token.type === 'FOR'
    ) {
      const name = token.value;

      // Special Expectation syntax: E[X]
      if (name === 'E' && this.peek(1).type === 'LBRACKET') {
        this.advance(); // consume E
        this.advance(); // consume [
        const event = this.parseExpression(PREC_NONE);
        const rBracket = this.expect('RBRACKET', ']');
        return {
          type: 'Probability',
          op: 'expect',
          event,
          span: {
            start: token.span.start,
            end: rBracket.span.end,
            line: token.span.line,
            col: token.span.col,
          },
        };
      }

      // Check for combining diacritics: x̄, x̂, ẋ, ẍ
      if (name.includes('\u0304')) {
        this.advance();
        const baseName = name.replace(/\u0304/g, '');
        return { type: 'DecoratedIdentifier', decoration: 'bar', name: baseName, span: token.span };
      }
      if (name.includes('\u0302')) {
        this.advance();
        const baseName = name.replace(/\u0302/g, '');
        return { type: 'DecoratedIdentifier', decoration: 'hat', name: baseName, span: token.span };
      }
      if (name.includes('\u0307')) {
        this.advance();
        const baseName = name.replace(/\u0307/g, '');
        return { type: 'DecoratedIdentifier', decoration: 'dot', name: baseName, span: token.span };
      }
      if (name.includes('\u0308')) {
        this.advance();
        const baseName = name.replace(/\u0308/g, '');
        return { type: 'DecoratedIdentifier', decoration: 'ddot', name: baseName, span: token.span };
      }

      const isKnownFunc =
        this.knownFunctions.has(name) ||
        name.startsWith(':');

      const isConstructor = /^[A-Z]/.test(name);

      // Check if followed immediately by '(' with standard call syntax
      if (this.peek(1).type === 'LPAREN') {
        const isColonPrefixed = token.span.end - token.span.start > name.length;
        if (isConstructor || name.length > 1 || isColonPrefixed || isKnownFunc) {
          // It is a defined function / builtin call / user function call: :sin(...) or MyConstructor(...) or :dist4(...)
          this.advance(); // consume func name
          return this.parseFunctionCallArgs(name, token.span);
        } else {
          // Single-letter identifier: f(x) is always f times x. No exceptions, no lookup, no mode.
          this.advance();
          return {
            type: 'Identifier',
            name,
            span: token.span,
          };
        }
      }

      // Check if it's a bare function application: e.g. sin x, ln x, sqrt x, isprime n
      if (isKnownFunc && this.canBeginExpression(this.peek(1).type)) {
        this.advance(); // consume function name
        const arg = this.parseExpression(PREC_BARE_CALL);
        const span: Span = {
          start: token.span.start,
          end: arg.span.end,
          line: token.span.line,
          col: token.span.col,
        };
        return {
          type: 'FunctionCall',
          callee: name,
          args: [arg],
          isBare: true,
          span,
        };
      }

      // Regular identifier
      this.advance();
      return {
        type: 'Identifier',
        name,
        span: token.span,
      };
    }

    // List literal: [1, 2, 3] or []
    if (token.type === 'LBRACKET') {
      this.advance(); // consume [
      if (this.peek().type === 'RBRACKET') {
        const rBracket = this.advance();
        const span: Span = {
          start: token.span.start,
          end: rBracket.span.end,
          line: token.span.line,
          col: token.span.col,
        };
        return {
          type: 'List',
          elements: [],
          span,
        };
      }

      const elements: ASTNode[] = [];
      while (true) {
        elements.push(this.parseExpression(PREC_NONE));
        if (this.peek().type === 'COMMA') {
          this.advance();
          if (this.peek().type === 'RBRACKET') break;
        } else {
          break;
        }
      }
      const rBracket = this.expect('RBRACKET', ']');
      const span: Span = {
        start: token.span.start,
        end: rBracket.span.end,
        line: token.span.line,
        col: token.span.col,
      };
      return {
        type: 'List',
        elements,
        span,
      };
    }

    // Parentheses, Tuples, or Multi-parameter Lambdas: (r, x) -> expr
    if (token.type === 'LPAREN') {
      // Lookahead for multi-param lambda: (r, x) -> ...
      const lambdaParams = this.tryLookaheadLambdaParams();
      if (lambdaParams) {
        this.advance(); // consume (
        while (this.peek().type !== 'RPAREN') {
          this.advance();
        }
        this.advance(); // consume )
        this.expect('ARROW', '->');
        const body = this.parseExpression(PREC_NONE);
        const span: Span = {
          start: token.span.start,
          end: body.span.end,
          line: token.span.line,
          col: token.span.col,
        };
        return {
          type: 'Lambda',
          params: lambdaParams,
          body,
          span,
        };
      }

      this.advance(); // consume (
      if (this.peek().type === 'RPAREN') {
        const rParen = this.advance();
        const span: Span = {
          start: token.span.start,
          end: rParen.span.end,
          line: token.span.line,
          col: token.span.col,
        };
        return {
          type: 'Tuple',
          elements: [],
          span,
        };
      }

      const first = this.parseExpression(PREC_NONE);

      if (this.peek().type === 'COMMA') {
        // Tuple: (first, second, ...)
        const elements: ASTNode[] = [first];
        while (this.peek().type === 'COMMA') {
          this.advance(); // consume ,
          if (this.peek().type === 'RPAREN') break;
          elements.push(this.parseExpression(PREC_NONE));
        }
        const rParen = this.expect('RPAREN', ')');
        const span: Span = {
          start: token.span.start,
          end: rParen.span.end,
          line: token.span.line,
          col: token.span.col,
        };
        return {
          type: 'Tuple',
          elements,
          span,
        };
      }

      const rParen = this.expect('RPAREN', ')');
      // Single expression in parens: preserve span
      first.span = {
        start: token.span.start,
        end: rParen.span.end,
        line: token.span.line,
        col: token.span.col,
      };
      return first;
    }

    throw createError(`Unexpected token '${token.value || token.type}'`, token.span, {
      expected: 'a number, identifier, unary operator (+, -, not), or opening parenthesis (',
      suggestion: 'Check for missing operands or unbalanced expressions',
      source: this.source,
    });
  }

  private tryLookaheadLambdaParams(): string[] | null {
    let p = 1;
    const params: string[] = [];
    while (this.peek(p).type !== 'RPAREN' && this.peek(p).type !== 'EOF') {
      if (this.peek(p).type === 'IDENTIFIER') {
        params.push(this.peek(p).value);
        p++;
        if (this.peek(p).type === 'COMMA') {
          p++;
        } else if (this.peek(p).type !== 'RPAREN') {
          return null;
        }
      } else {
        return null;
      }
    }
    if (this.peek(p).type === 'RPAREN' && this.peek(p + 1).type === 'ARROW') {
      return params;
    }
    return null;
  }

  private parseFunctionCallArgs(callee: string, calleeSpan: Span): ASTNode {
    this.expect('LPAREN', '(');
    const args: ASTNode[] = [];

    // Special probability notation P(A | B) or P(A)
    if (callee === 'P' || callee === 'Prob') {
      let event = this.parseExpression(PREC_NONE);
      let condition: ASTNode | undefined;
      if (event.type === 'BinaryOp' && event.op === '|') {
        condition = event.right;
        event = event.left;
      } else if (this.peek().type === 'BAR_SEP') {
        this.advance(); // consume |
        condition = this.parseExpression(PREC_NONE);
      }
      const rParen = this.expect('RPAREN', ')');
      return {
        type: 'Probability',
        op: 'prob',
        event,
        condition,
        span: {
          start: calleeSpan.start,
          end: rParen.span.end,
          line: calleeSpan.line,
          col: calleeSpan.col,
        },
      };
    }

    if (this.peek().type !== 'RPAREN') {
      while (true) {
        const isNamedKeyword = (t: Token) => {
          if (!t) return false;
          return [
            'FOR', 'FROM', 'IS', 'WITH', 'STEP', 'IN',
            'NEAR', 'DT', 'TRACE', 'UNTIL', 'MAX', 'TO', 'EPS', 'N_ARG', 'FORMAT', 'VAR', 'BACKSLASH_IDENT'
          ].includes(t.type);
        };

        // Check for named argument: \keyword value OR \keyword: value OR name: value
        if (this.peek().type !== 'RPAREN' && isNamedKeyword(this.peek())) {
          const nameTok = this.advance();
          if (this.peek().type === 'COLON' || this.peek().type === 'EQ') {
            this.advance();
          }
          const val = this.parseExpression(PREC_NONE);
          const span: Span = {
            start: nameTok.span.start,
            end: val.span.end,
            line: nameTok.span.line,
            col: nameTok.span.col,
          };
          args.push({
            type: 'NamedArg',
            name: nameTok.value,
            value: val,
            span,
          });
        } else if (this.peek().type !== 'RPAREN' && this.peek(1).type === 'COLON') {
          const nameTok = this.advance();
          this.advance(); // consume :
          const val = this.parseExpression(PREC_NONE);
          const span: Span = {
            start: nameTok.span.start,
            end: val.span.end,
            line: nameTok.span.line,
            col: nameTok.span.col,
          };
          args.push({
            type: 'NamedArg',
            name: nameTok.value.replace(/^:/, ''),
            value: val,
            span,
          });
        } else {
          // Check for malformed bounded summation sum(1/n^2, 1..1000)
          if (
            (callee === 'sum' || callee === 'prod') &&
            args.length >= 1 &&
            this.peek().type === 'NUMBER' &&
            this.peek(1).type === 'DOTDOT'
          ) {
            throw createError(
              `Missing binding variable in bounded ${callee}. Expected 'n in ${this.peek().value}..', got '${this.peek().value}..'`,
              this.peek().span,
              {
                expected: `a binding variable like 'n in 1..1000'`,
                suggestion: `Write ${callee}(..., n in 1..1000)`,
                source: this.source,
              }
            );
          }

          args.push(this.parseExpression(PREC_NONE));
        }

        if (this.peek().type === 'COMMA') {
          this.advance();
        } else {
          break;
        }
      }
    }

    const rParen = this.expect('RPAREN', ')');
    const span: Span = {
      start: calleeSpan.start,
      end: rParen.span.end,
      line: calleeSpan.line,
      col: calleeSpan.col,
    };

    const calleeKey = callee.replace(/^:/, '');
    // ASCII representation mapping to identical AST nodes
    if ((calleeKey === 'bar' || calleeKey === 'hat' || calleeKey === 'dot' || calleeKey === 'ddot') && args.length === 1 && args[0].type === 'Identifier') {
      return {
        type: 'DecoratedIdentifier',
        decoration: calleeKey,
        name: args[0].name,
        span,
      };
    }
    if (calleeKey === 'norm') {
      return { type: 'BracketOp', op: 'norm', operands: args, span };
    }
    if (calleeKey === 'inner') {
      return { type: 'BracketOp', op: 'inner_product', operands: args, span };
    }
    if (calleeKey === 'card') {
      return { type: 'BracketOp', op: 'card', operands: args, span };
    }
    if (calleeKey === 'grad' || calleeKey === 'del') {
      return { type: 'NablaOp', op: 'grad', target: args[0], span };
    }
    if (calleeKey === 'div') {
      return { type: 'NablaOp', op: 'div', target: args[0], span };
    }
    if (calleeKey === 'curl') {
      return { type: 'NablaOp', op: 'curl', target: args[0], span };
    }
    if (calleeKey === 'laplacian') {
      return { type: 'NablaOp', op: 'laplacian', target: args[0], span };
    }
    if (calleeKey === 'hodge' || calleeKey === 'star') {
      return { type: 'DifferentialFormOp', op: 'hodge_star', operands: args, span };
    }
    if (calleeKey === 'wedge') {
      return { type: 'DifferentialFormOp', op: 'wedge', operands: args, span };
    }
    if (calleeKey === 'tensor') {
      return { type: 'TensorOp', op: 'tensor', left: args[0], right: args[1], span };
    }
    if (calleeKey === 'direct_sum' || calleeKey === 'oplus') {
      return { type: 'TensorOp', op: 'direct_sum', left: args[0], right: args[1], span };
    }
    if (calleeKey === 'E') {
      return { type: 'Probability', op: 'expect', event: args[0], span };
    }
    if (calleeKey === 'Var') {
      return { type: 'Probability', op: 'variance', event: args[0], span };
    }
    if (calleeKey === 'Cov') {
      return { type: 'Probability', op: 'covariance', event: args[0], condition: args[1], span };
    }

    return {
      type: 'FunctionCall',
      callee,
      args,
      isBare: false,
      span,
    };
  }

  private parseBlock(): ASTNode {
    const lBrace = this.expect('LBRACE', '{');

    // Check for Set-builder: { x in S : P(x) } or { x \u2208 S | P(x) }
    if (this.peek().type === 'IDENTIFIER' && (this.peek(1).type === 'SET_IN' || this.peek(1).type === 'IN')) {
      let isSetBuilder = false;
      let k = this.pos + 2;
      let depth = 0;
      while (k < this.tokens.length && this.tokens[k].type !== 'RBRACE' && this.tokens[k].type !== 'SEMICOLON' && this.tokens[k].type !== 'EOF') {
        if (this.tokens[k].type === 'LBRACE' || this.tokens[k].type === 'LPAREN' || this.tokens[k].type === 'LBRACKET') depth++;
        else if (this.tokens[k].type === 'RBRACE' || this.tokens[k].type === 'RPAREN' || this.tokens[k].type === 'RBRACKET') depth--;
        else if (depth === 0 && (this.tokens[k].type === 'COLON' || this.tokens[k].type === 'BAR_SEP')) {
          isSetBuilder = true;
          break;
        }
        k++;
      }

      if (isSetBuilder) {
        const varTok = this.advance();
        this.advance(); // in or \u2208
        const domain = this.parseExpression(PREC_COMPARE);
        if (this.peek().type === 'COLON' || this.peek().type === 'BAR_SEP') {
          this.advance();
        }
        const predicate = this.parseExpression(PREC_NONE);
        const rBrace = this.expect('RBRACE', '}');
        return {
          type: 'SetBuilder',
          variable: varTok.value,
          domain,
          predicate,
          span: {
            start: lBrace.span.start,
            end: rBrace.span.end,
            line: lBrace.span.line,
            col: lBrace.span.col,
          },
        };
      }
    }

    // Lookahead inside block to pre-register function names in knownFunctions
    let p = this.pos;
    let braceDepth = 1;
    while (p < this.tokens.length && braceDepth > 0) {
      if (this.tokens[p].type === 'LBRACE') braceDepth++;
      else if (this.tokens[p].type === 'RBRACE') braceDepth--;
      else if (
        braceDepth === 1 &&
        this.tokens[p].type === 'IDENTIFIER' &&
        p + 1 < this.tokens.length &&
        this.tokens[p + 1].type === 'LPAREN'
      ) {
        const fnName = this.tokens[p].value;
        let q = p + 2;
        while (q < this.tokens.length && this.tokens[q].type !== 'RPAREN' && this.tokens[q].type !== 'EOF') {
          q++;
        }
        if (q + 1 < this.tokens.length && (this.tokens[q + 1].type === 'ASSIGN' || this.tokens[q + 1].type === 'GLOBAL_ASSIGN' || (this.tokens[q + 1].type === 'EQ' && fnName.length > 1))) {
          this.knownFunctions.add(fnName);
        }
      }
      p++;
    }

    const statements: ASTNode[] = [];

    while (this.peek().type !== 'RBRACE' && this.peek().type !== 'EOF') {
      const def = this.tryParseDefinition();
      if (def) {
        statements.push(def);
      } else {
        const expr = this.parseExpression(PREC_NONE);
        statements.push(expr);
      }
      if (this.peek().type === 'SEMICOLON') {
        this.advance();
      }
    }

    const rBrace = this.expect('RBRACE', '}');
    return {
      type: 'Block',
      statements,
      span: {
        start: lBrace.span.start,
        end: rBrace.span.end,
        line: lBrace.span.line,
        col: lBrace.span.col,
      },
    };
  }

  private parseRegionIntegral(): RegionIntegralNode {
    const opTok = this.advance();
    let integralType: RegionIntegralNode['integralType'] = 'double';
    if (opTok.type === 'TRIPLE_INTEGRAL' || opTok.value === 'iiint' || opTok.value.startsWith('iiint_')) {
      integralType = 'triple';
    } else if (opTok.type === 'CONTOUR_INTEGRAL' || opTok.value === 'oint' || opTok.value.startsWith('oint_')) {
      integralType = 'contour';
    }

    let region: ASTNode = {
      type: 'Identifier',
      name: integralType === 'triple' ? 'V' : integralType === 'contour' ? 'C' : 'S',
      span: opTok.span,
    };

    if (opTok.value.includes('_')) {
      const name = opTok.value.split('_')[1];
      if (name) {
        region = { type: 'Identifier', name, span: opTok.span };
      }
    } else if (this.peek().type === 'IDENTIFIER' && this.peek().value === '_' && this.peek(1).type === 'IDENTIFIER') {
      const underTok = this.advance();
      if (this.peek().value === '\u2202' && this.peek(1).type === 'IDENTIFIER') {
        this.advance();
        const oTok = this.advance();
        region = {
          type: 'Identifier',
          name: '\u2202' + oTok.value,
          span: { start: underTok.span.start, end: oTok.span.end, line: underTok.span.line, col: underTok.span.col },
        };
      } else {
        const regTok = this.advance();
        region = { type: 'Identifier', name: regTok.value, span: regTok.span };
      }
    } else if (this.peek().type === 'IDENTIFIER' && this.peek().value.startsWith('_')) {
      const regTok = this.advance();
      const name = regTok.value.slice(1);
      region = { type: 'Identifier', name: name || (integralType === 'triple' ? 'V' : integralType === 'contour' ? 'C' : 'S'), span: regTok.span };
    }

    const prevParsing = this.parsingIntegrand;
    this.parsingIntegrand = true;
    const integrand = this.parseExpression(PREC_NONE);
    this.parsingIntegrand = prevParsing;

    let differential = integralType === 'triple' ? 'dV' : integralType === 'contour' ? 'dr' : 'dS';
    if (this.isBinder()) {
      const binder = this.consumeBinder();
      differential = 'd' + binder.variable;
    }

    return {
      type: 'RegionIntegral',
      integralType,
      region,
      integrand,
      differential,
      span: {
        start: opTok.span.start,
        end: integrand.span.end,
        line: opTok.span.line,
        col: opTok.span.col,
      },
    };
  }

  private parseNabla(): NablaOpNode {
    const opTok = this.advance();
    if (opTok.type === 'LAPLACIAN') {
      const target = this.parseExpression(PREC_UNARY);
      return {
        type: 'NablaOp',
        op: 'laplacian',
        target,
        span: {
          start: opTok.span.start,
          end: target.span.end,
          line: opTok.span.line,
          col: opTok.span.col,
        },
      };
    }

    let op: 'grad' | 'div' | 'curl' = 'grad';
    if (this.peek().type === 'DOT' || this.peek().type === 'STAR') {
      const sep = this.advance();
      if (sep.type === 'DOT') {
        op = 'div';
      } else {
        op = 'curl';
      }
    }
    const target = this.parseExpression(PREC_UNARY);
    return {
      type: 'NablaOp',
      op,
      target,
      span: {
        start: opTok.span.start,
        end: target.span.end,
        line: opTok.span.line,
        col: opTok.span.col,
      },
    };
  }

  private parseBracketOp(): BracketOpNode {
    const token = this.peek();
    if (token.type === 'LANGLE') {
      this.advance(); // consume \u27e8
      const u = this.parseExpression(PREC_NONE);
      this.expect('COMMA', ',');
      const v = this.parseExpression(PREC_NONE);
      const rAngle = this.expect('RANGLE', '\u27e9');
      return {
        type: 'BracketOp',
        op: 'inner_product',
        operands: [u, v],
        span: {
          start: token.span.start,
          end: rAngle.span.end,
          line: token.span.line,
          col: token.span.col,
        },
      };
    }

    if (token.type === 'NORM_BAR') {
      this.advance(); // consume \u2016
      const v = this.parseExpression(PREC_NONE);
      const rNorm = this.expect('NORM_BAR', '\u2016 or ||');
      return {
        type: 'BracketOp',
        op: 'norm',
        operands: [v],
        span: {
          start: token.span.start,
          end: rNorm.span.end,
          line: token.span.line,
          col: token.span.col,
        },
      };
    }

    if (token.type === 'FLOOR_L') {
      this.advance();
      const v = this.parseExpression(PREC_NONE);
      const r = this.expect('FLOOR_R', '\u230b');
      return {
        type: 'BracketOp',
        op: 'floor',
        operands: [v],
        span: { start: token.span.start, end: r.span.end, line: token.span.line, col: token.span.col },
      };
    }

    if (token.type === 'CEIL_L') {
      this.advance();
      const v = this.parseExpression(PREC_NONE);
      const r = this.expect('CEIL_R', '\u2309');
      return {
        type: 'BracketOp',
        op: 'ceil',
        operands: [v],
        span: { start: token.span.start, end: r.span.end, line: token.span.line, col: token.span.col },
      };
    }

    if (token.type === 'BAR_SEP') {
      this.advance(); // consume |
      this.pipeDepth++;
      const v = this.parseExpression(PREC_NONE);
      this.pipeDepth--;
      const rBar = this.expect('BAR_SEP', '|');
      return {
        type: 'BracketOp',
        op: 'abs',
        operands: [v],
        span: {
          start: token.span.start,
          end: rBar.span.end,
          line: token.span.line,
          col: token.span.col,
        },
      };
    }

    throw createError(`Invalid bracket operator '${token.value}'`, token.span);
  }

  private parseQuantifier(): QuantifierNode {
    const qTok = this.advance();
    const quantifier =
      qTok.type === 'FORALL' ? 'forall' : qTok.type === 'EXISTS_UNIQUE' ? 'exists_unique' : 'exists';

    const vars: Token[] = [this.expect('IDENTIFIER', 'quantified variable')];
    while (this.peek().type === 'COMMA') {
      const savedPos = this.pos;
      this.advance();
      if (this.peek().type === 'IDENTIFIER') {
        const nextNext = this.tokens[this.pos + 1];
        if (
          nextNext &&
          (nextNext.type === 'LPAREN' ||
            nextNext.type === 'ASSIGN' ||
            nextNext.type === 'EQ')
        ) {
          this.pos = savedPos;
          break;
        }
        vars.push(this.advance());
      } else {
        this.pos = savedPos;
        break;
      }
    }

    let domain: ASTNode = {
      type: 'Identifier',
      name: 'R',
      span: vars[0].span,
    };
    if (this.peek().type === 'SET_IN' || this.peek().type === 'IN') {
      this.advance();
      domain = this.parseExpression(PREC_COMPARE);
    }
    if (this.peek().type === 'COMMA' || this.peek().type === 'COLON' || this.peek().type === 'BAR_SEP') {
      this.advance();
    }
    const predicate = this.parseExpression(PREC_NONE);

    let result: ASTNode = predicate;
    for (let i = vars.length - 1; i >= 0; i--) {
      result = {
        type: 'Quantifier',
        quantifier,
        variable: vars[i].value,
        domain,
        predicate: result,
        span: {
          start: qTok.span.start,
          end: predicate.span.end,
          line: qTok.span.line,
          col: qTok.span.col,
        },
      };
    }
    return result as QuantifierNode;
  }

  private parseClaim(): ClaimNode {
    const claimTok = this.expect('CLAIM', 'claim');
    const nameTok = this.expect('IDENTIFIER', 'claim name');
    this.expect('LBRACE', '{');
    let statement = '';
    let provedBy = '';
    let relevance = '';
    let kind: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' = 'A';
    let shadow: ASTNode = { type: 'NumberLiteral', raw: '1', span: claimTok.span };
    let expectNode: ASTNode = { type: 'Identifier', name: 'true', span: claimTok.span };

    while (this.peek().type !== 'RBRACE' && this.peek().type !== 'EOF') {
      const nextTok = this.peek();
      if (nextTok.type !== 'IDENTIFIER' && nextTok.type !== 'KIND') {
        throw createError(
          `Unexpected token '${nextTok.value || nextTok.type}'. Expected claim field (statement, proved_by, relevance, kind, shadow, expect)`,
          nextTok.span
        );
      }
      const keyTok = this.advance();
      this.expect('COLON', ':');
      const key = keyTok.value.replace(/^:/, '');
      if (key === 'statement') {
        const val = this.parseExpression(PREC_NONE);
        statement = val.type === 'StringLiteral' ? val.value : (val.type === 'Identifier' ? val.name : '');
      } else if (key === 'proved_by' || key === 'provedBy') {
        const val = this.parseExpression(PREC_NONE);
        provedBy = val.type === 'StringLiteral' ? val.value : (val.type === 'Identifier' ? val.name : '');
      } else if (key === 'relevance') {
        const val = this.parseExpression(PREC_NONE);
        relevance = val.type === 'StringLiteral' ? val.value : (val.type === 'Identifier' ? val.name : '');
      } else if (key === 'kind') {
        const val = this.parseExpression(PREC_NONE);
        kind = (val.type === 'StringLiteral' ? val.value : (val.type === 'Identifier' ? val.name : 'A')) as any;
      } else if (key === 'shadow') {
        shadow = this.parseExpression(PREC_NONE);
      } else if (key === 'expect') {
        expectNode = this.parseExpression(PREC_NONE);
      } else {
        this.parseExpression(PREC_NONE);
      }
      if (this.peek().type === 'COMMA' || this.peek().type === 'SEMICOLON') {
        this.advance();
      }
    }
    const rBrace = this.expect('RBRACE', '}');
    if (!relevance || relevance.trim().length === 0) {
      throw createError(
        "claim requires a 'relevance' field stating why this shadow's truth is entailed by the theorem",
        claimTok.span
      );
    }
    return {
      type: 'Claim',
      name: nameTok.value,
      statement,
      provedBy,
      relevance,
      kind,
      shadow,
      expect: expectNode,
      span: {
        start: claimTok.span.start,
        end: rBrace.span.end,
        line: claimTok.span.line,
        col: claimTok.span.col,
      },
    };
  }

  private parseBigOp(): BigOpNode {
    const opTok = this.advance();
    const op: 'sum' | 'prod' | 'integral' =
      opTok.type === 'SIGMA' ? 'sum' : (opTok.type === 'PI_PROD' ? 'prod' : 'integral');

    // Syntax: Σ(i in 1..n, body) or Σ_{i=1}^n body or Σ(body, i in 1..n)
    this.expect('LPAREN', '(');
    let variable = 'i';
    let start: ASTNode = { type: 'NumberLiteral', raw: '1', span: opTok.span };
    let end: ASTNode = { type: 'NumberLiteral', raw: '10', span: opTok.span };
    let body: ASTNode;

    const firstArg = this.parseExpression(PREC_NONE);
    if (firstArg.type === 'Range') {
      variable = firstArg.variable || 'i';
      start = firstArg.start;
      end = firstArg.end;
      this.expect('COMMA', ',');
      body = this.parseExpression(PREC_NONE);
    } else {
      body = firstArg;
      this.expect('COMMA', ',');
      const secondArg = this.parseExpression(PREC_NONE);
      if (secondArg.type === 'Range') {
        variable = secondArg.variable || 'i';
        start = secondArg.start;
        end = secondArg.end;
      }
    }
    const rParen = this.expect('RPAREN', ')');
    return {
      type: 'BigOp',
      op,
      variable,
      start,
      end,
      body,
      span: {
        start: opTok.span.start,
        end: rParen.span.end,
        line: opTok.span.line,
        col: opTok.span.col,
      },
    };
  }

  private parseDiff(): DiffNode {
    const dTok = this.advance(); // d or \u2202
    const isPartial = dTok.value === '\u2202';
    this.advance(); // // or /
    let varName = 'x';
    if (this.peek().type === 'IDENTIFIER') {
      if ((this.peek().value === 'd' || this.peek().value === '\u2202') && this.peek(1).type === 'IDENTIFIER') {
        this.advance(); // consume 'd' or '\u2202'
        varName = this.advance().value;
      } else {
        let vTok = this.advance().value;
        if (vTok.startsWith('d') || vTok.startsWith('\u2202')) vTok = vTok.slice(1);
        if (vTok) varName = vTok;
      }
    }
    let expr: ASTNode;
    if (this.peek().type === 'IDENTIFIER' && this.peek(1).type === 'LPAREN') {
      const fnTok = this.advance();
      const fnCall = this.parseFunctionCallArgs(fnTok.value, fnTok.span);
      expr = this.parseExpressionWithLeft(fnCall, PREC_IMPLICIT_MUL);
    } else {
      expr = this.parseExpression(PREC_IMPLICIT_MUL);
    }
    return {
      type: 'Diff',
      variable: varName,
      expr,
      isPartial,
      span: {
        start: dTok.span.start,
        end: expr.span.end,
        line: dTok.span.line,
        col: dTok.span.col,
      },
    };
  }

  private parseIntegral(): ASTNode {
    const opTok = this.advance();
    let start: ASTNode | undefined;
    let end: ASTNode | undefined;
    let variable = 'x';
    let body: ASTNode;

    // Check if function call style: \u222b(body, x in a..b) or integral(body, x in a..b)
    if (this.peek().type === 'LPAREN' && opTok.value !== 'integral_' && !opTok.value.startsWith('integral_')) {
      this.expect('LPAREN', '(');
      const firstArg = this.parseExpression(PREC_NONE);
      if (this.peek().type === 'COMMA') {
        this.advance(); // consume comma
        const secondArg = this.parseExpression(PREC_NONE);
        let thirdArg: ASTNode | undefined;
        let fourthArg: ASTNode | undefined;
        if (this.peek().type === 'COMMA') {
          this.advance();
          thirdArg = this.parseExpression(PREC_NONE);
        }
        if (this.peek().type === 'COMMA') {
          this.advance();
          fourthArg = this.parseExpression(PREC_NONE);
        }
        const rParen = this.expect('RPAREN', ')');

        if (firstArg.type === 'Range') {
          variable = firstArg.variable || 'x';
          start = firstArg.start;
          end = firstArg.end;
          body = secondArg;
        } else if (secondArg.type === 'Range') {
          variable = secondArg.variable || 'x';
          start = secondArg.start;
          end = secondArg.end;
          body = firstArg;
        } else if (thirdArg !== undefined) {
          // integral(body, lower, upper, var)
          body = firstArg;
          start = secondArg;
          end = thirdArg;
          if (fourthArg && fourthArg.type === 'Identifier') {
            variable = fourthArg.name;
          }
        } else {
          body = firstArg;
        }

        return {
          type: 'BigOp',
          op: 'integral',
          variable,
          start,
          end,
          body,
          span: {
            start: opTok.span.start,
            end: rParen.span.end,
            line: opTok.span.line,
            col: opTok.span.col,
          },
        };
      } else {
        // Parenthesized integrand without comma, e.g. integral(x^2) dx
        const rParen = this.expect('RPAREN', ')');
        body = firstArg;
        if (this.isBinder()) {
          const binder = this.consumeBinder();
          variable = binder.variable;
          return {
            type: 'BigOp',
            op: 'integral',
            variable,
            start,
            end,
            body,
            span: {
              start: opTok.span.start,
              end: binder.span.end,
              line: opTok.span.line,
              col: opTok.span.col,
            },
          };
        }
        return {
          type: 'BigOp',
          op: 'integral',
          variable,
          start,
          end,
          body,
          span: {
            start: opTok.span.start,
            end: rParen.span.end,
            line: opTok.span.line,
            col: opTok.span.col,
          },
        };
      }
    }

    // Check for subscript limits on integral symbol: \u222b_a^b or integral_a^b or integral_{a}^{b}
    let subVal: string | null = null;
    const subSpan = opTok.span;

    if (opTok.type === 'IDENTIFIER' && (opTok.value.startsWith('integral_') || opTok.value.startsWith(':integral_'))) {
      subVal = opTok.value.replace(/^:?integral_/, '');
    }

    if (subVal !== null) {
      if (subVal === '') {
        this.expect('LBRACE', '{');
        start = this.parseExpression(PREC_NONE);
        this.expect('RBRACE', '}');
      } else {
        if (/^\d+$/.test(subVal)) {
          start = { type: 'NumberLiteral', raw: subVal, span: subSpan };
        } else {
          start = { type: 'Identifier', name: subVal, span: subSpan };
        }
      }

      // Check for superscript ^upper
      if (this.peek().type === 'CARET') {
        this.advance();
        if (this.peek().type === 'LBRACE') {
          this.advance();
          end = this.parseExpression(PREC_NONE);
          this.expect('RBRACE', '}');
        } else {
          const endTok = this.advance();
          if (endTok.type === 'NUMBER') {
            end = { type: 'NumberLiteral', raw: endTok.value, span: endTok.span };
          } else if (endTok.type === 'IDENTIFIER') {
            end = { type: 'Identifier', name: endTok.value, span: endTok.span };
          }
        }
      }
    } else if (this.peek().type === 'IDENTIFIER' && this.peek().value.startsWith('_')) {
      const nextTok = this.advance();
      const sub = nextTok.value.slice(1);
      if (sub === '') {
        if (this.peek().type === 'LBRACE') {
          this.advance();
          start = this.parseExpression(PREC_NONE);
          this.expect('RBRACE', '}');
        } else if (this.peek().type === 'NUMBER') {
          const numTok = this.advance();
          start = { type: 'NumberLiteral', raw: numTok.value, span: numTok.span };
        } else {
          const idTok = this.advance();
          start = { type: 'Identifier', name: idTok.value, span: idTok.span };
        }
      } else {
        if (/^\d+$/.test(sub)) {
          start = { type: 'NumberLiteral', raw: sub, span: nextTok.span };
        } else {
          start = { type: 'Identifier', name: sub, span: nextTok.span };
        }
      }

      // Check for superscript ^upper
      if (this.peek().type === 'CARET') {
        this.advance();
        if (this.peek().type === 'LBRACE') {
          this.advance();
          end = this.parseExpression(PREC_NONE);
          this.expect('RBRACE', '}');
        } else {
          const endTok = this.advance();
          if (endTok.type === 'NUMBER') {
            end = { type: 'NumberLiteral', raw: endTok.value, span: endTok.span };
          } else if (endTok.type === 'IDENTIFIER') {
            end = { type: 'Identifier', name: endTok.value, span: endTok.span };
          }
        }
      }
    }

    // Parse the integrand with early binder termination
    const prevParsing = this.parsingIntegrand;
    this.parsingIntegrand = true;
    body = this.parseExpression(PREC_NONE);
    this.parsingIntegrand = prevParsing;

    let endSpan = body.span;

    // Check and consume binder token (e.g. dx, dy, dt, dS)
    if (this.isBinder()) {
      const binder = this.consumeBinder();
      variable = binder.variable;
      endSpan = binder.span;
    }

    if (!end && start && start.type === 'Identifier') {
      return {
        type: 'RegionIntegral',
        integralType: 'single',
        region: start,
        integrand: body,
        differential: 'd' + variable,
        span: {
          start: opTok.span.start,
          end: endSpan.end,
          line: opTok.span.line,
          col: opTok.span.col,
        },
      };
    }

    return {
      type: 'BigOp',
      op: 'integral',
      variable,
      start,
      end,
      body,
      span: {
        start: opTok.span.start,
        end: endSpan.end,
        line: opTok.span.line,
        col: opTok.span.col,
      },
    };
  }

  private parseKindDecl(): ASTNode {
    const kindToken = this.advance();
    const nameToken = this.expect('IDENTIFIER', 'kind name');
    const params: string[] = [];
    if (this.peek().type === 'LPAREN') {
      this.advance();
      while (this.peek().type !== 'RPAREN' && this.peek().type !== 'EOF') {
        params.push(this.expect('IDENTIFIER', 'parameter').value);
        if (this.peek().type === 'COMMA') this.advance();
      }
      this.expect('RPAREN', ')');
    }
    let extendsKind: { name: string; args: string[] } | undefined;
    if (this.peek().type === 'EXTENDS') {
      this.advance();
      const extName = this.expect('IDENTIFIER', 'parent kind name').value;
      const extArgs: string[] = [];
      if (this.peek().type === 'LPAREN') {
        this.advance();
        while (this.peek().type !== 'RPAREN' && this.peek().type !== 'EOF') {
          extArgs.push(this.expect('IDENTIFIER', 'argument').value);
          if (this.peek().type === 'COMMA') this.advance();
        }
        this.expect('RPAREN', ')');
      }
      extendsKind = { name: extName, args: extArgs };
    }

    this.expect('LBRACE', '{');
    const operations: string[] = [];
    const axioms: string[] = [];

    while (this.peek().type !== 'RBRACE' && this.peek().type !== 'EOF') {
      if (this.peek().type === 'OPERATIONS') {
        this.advance();
        this.expect('COLON', ':');
        this.expect('LBRACKET', '[');
        while (this.peek().type !== 'RBRACKET' && this.peek().type !== 'EOF') {
          operations.push(this.advance().value);
          if (this.peek().type === 'COMMA') this.advance();
        }
        this.expect('RBRACKET', ']');
      } else if (this.peek().type === 'AXIOMS') {
        this.advance();
        this.expect('COLON', ':');
        this.expect('LBRACKET', '[');
        while (this.peek().type !== 'RBRACKET' && this.peek().type !== 'EOF') {
          axioms.push(this.expect('STRING', 'axiom description').value);
          if (this.peek().type === 'COMMA') this.advance();
        }
        this.expect('RBRACKET', ']');
      } else {
        this.advance();
      }
      if (this.peek().type === 'COMMA') this.advance();
    }
    const rBrace = this.expect('RBRACE', '}');

    return {
      type: 'KindDecl',
      name: nameToken.value,
      params,
      extendsKind,
      operations,
      axioms,
      span: {
        start: kindToken.span.start,
        end: rBrace.span.end,
        line: kindToken.span.line,
        col: kindToken.span.col,
      },
    };
  }

  private parseLimit(): LimitNode {
    const limTok = this.advance(); // lim, limit, limsup, liminf
    if (this.peek().type === 'IDENTIFIER' && (this.peek().value === 'sup' || this.peek().value === 'inf')) {
      this.advance(); // consume sup or inf
    }
    this.expect('LPAREN', '(');

    const varTok = this.expect('IDENTIFIER', 'a variable identifier');
    const variable = varTok.value;

    this.expect('ARROW', '->');

    let target: ASTNode;
    let direction: 'two-sided' | 'left' | 'right' = 'two-sided';

    const targetTok = this.peek();
    if (targetTok.type === 'NUMBER' || targetTok.type === 'IDENTIFIER') {
      this.advance();
      target = {
        type: targetTok.type === 'NUMBER' ? 'NumberLiteral' : 'Identifier',
        name: targetTok.value,
        raw: targetTok.value,
        span: targetTok.span,
      } as any;

      if (this.peek().type === 'PLUS') {
        this.advance();
        direction = 'right';
      } else if (this.peek().type === 'MINUS') {
        this.advance();
        direction = 'left';
      }
    } else {
      target = this.parseExpression(PREC_NONE);
    }

    this.expect('COMMA', ',');

    const expr = this.parseExpression(PREC_NONE);
    const rParen = this.expect('RPAREN', ')');

    return {
      type: 'Limit',
      variable,
      target,
      direction,
      expr,
      span: {
        start: limTok.span.start,
        end: rParen.span.end,
        line: limTok.span.line,
        col: limTok.span.col,
      },
    };
  }

  private canBeginImplicitMultiplication(left?: ASTNode): boolean {
    const token = this.peek();
    if (token.type === 'NORM_BAR') {
      return false;
    }
    if (this.parsingIntegrand && this.isBinder()) {
      return false;
    }
    if (left && token.span.line > left.span.line) {
      return false;
    }
    return this.canBeginExpression(token.type);
  }

  private isContextualKeyword(type: TokenType): boolean {
    return [
      'DIMENSION', 'UNIT', 'MODULE', 'EXPORT', 'IMPORT', 'FROM', 'AS', 'KIND',
      'STEP', 'WITH', 'RECORD', 'IS', 'EXTENDS', 'OPERATIONS', 'AXIOMS', 'RULE', 'REQUIRES',
      'VIEW', 'FOR'
    ].includes(type);
  }

  private isBinder(): boolean {
    const tok0 = this.peek();
    if (tok0.type !== 'IDENTIFIER') return false;
    const val = tok0.value;
    if (val.length >= 2 && val.startsWith('d')) {
      if (val === 'det' || val === 'dim') return false;
      return true;
    }
    if (val === 'd') {
      const tok1 = this.peek(1);
      if (tok1.type === 'IDENTIFIER') {
        return true;
      }
    }
    return false;
  }

  private consumeBinder(): { variable: string; span: Span } {
    const tok0 = this.advance();
    if (tok0.value.length >= 2 && tok0.value.startsWith('d')) {
      return {
        variable: tok0.value.slice(1),
        span: tok0.span,
      };
    }
    if (tok0.value === 'd' && this.peek().type === 'IDENTIFIER') {
      const tok1 = this.advance();
      return {
        variable: tok1.value,
        span: {
          start: tok0.span.start,
          end: tok1.span.end,
          line: tok0.span.line,
          col: tok0.span.col,
        },
      };
    }
    return {
      variable: 'x',
      span: tok0.span,
    };
  }

  private canBeginExpression(type: TokenType): boolean {
    return (
      type === 'NUMBER' ||
      type === 'STRING' ||
      type === 'IDENTIFIER' ||
      type === 'LPAREN' ||
      type === 'LBRACKET' ||
      type === 'LBRACE' ||
      type === 'IF' ||
      type === 'NOT' ||
      type === 'SIGMA' ||
      type === 'PI_PROD' ||
      type === 'INTEGRAL' ||
      type === 'CONTOUR_INTEGRAL' ||
      type === 'DOUBLE_INTEGRAL' ||
      type === 'TRIPLE_INTEGRAL' ||
      type === 'NABLA' ||
      type === 'LAPLACIAN' ||
      type === 'HODGE_STAR' ||
      type === 'FORALL' ||
      type === 'EXISTS' ||
      type === 'EXISTS_UNIQUE' ||
      type === 'LANGLE' ||
      type === 'NORM_BAR' ||
      type === 'FLOOR_L' ||
      type === 'CEIL_L' ||
      type === 'CLAIM' ||
      type === 'SOLVE' ||
      type === 'ISOLATE' ||
      type === 'SIMPLIFY' ||
      type === 'CHECK' ||
      type === 'FIND' ||
      type === 'BACKSLASH_IDENT'
    );
  }

  private getInfixPrecedence(type: TokenType): number {
    switch (type) {
      case 'WHERE':
        return PREC_WHERE;
      case 'OR':
        return PREC_OR;
      case 'AND':
        return PREC_AND;
      case 'IN':
      case 'DOTDOT':
        return PREC_IN;
      case 'EQ':
      case 'EQ_EQ':
      case 'NEQ':
      case 'LT':
      case 'LTE':
      case 'GT':
      case 'GTE':
      case 'CONGRUENT':
      case 'ISO':
      case 'HOMOTOPY':
      case 'EQUIV':
      case 'SET_IN':
      case 'SET_NOTIN':
      case 'SET_SUBSET':
      case 'SET_SUBSETEQ':
      case 'IS':
        return PREC_COMPARE;
      case 'PLUS':
      case 'MINUS':
      case 'SET_UNION':
      case 'SET_INTERSECT':
      case 'SET_DIFF':
      case 'TENSOR_PROD':
      case 'DIRECT_SUM':
        return PREC_ADD;
      case 'STAR':
      case 'SLASH':
      case 'DOUBLE_SLASH':
      case 'PERCENT':
      case 'WEDGE':
        return PREC_EXPLICIT_MUL;
      case 'CARET':
      case 'DAGGER':
        return PREC_POW;
      case 'CUSTOM_OP':
        return 45;
      default:
        return PREC_NONE;
    }
  }

  private tokenToBinaryOp(token: Token): BinaryOpNode['op'] {
    switch (token.type) {
      case 'CUSTOM_OP': return token.value;
      case 'PLUS': return '+';
      case 'MINUS': return '-';
      case 'STAR': return '*';
      case 'SLASH': return '/';
      case 'DOUBLE_SLASH': return '/';
      case 'PERCENT': return '%';
      case 'CARET': return '^';
      case 'EQ': return '=';
      case 'EQ_EQ': return '==';
      case 'NEQ': return '!=';
      case 'LT': return '<';
      case 'LTE': return '<=';
      case 'GT': return '>';
      case 'GTE': return '>=';
      case 'IN': return 'in';
      case 'AND': return 'and';
      case 'OR': return 'or';
      case 'IS': return 'is';
      default:
        throw createError(`Invalid binary operator '${token.value}'`, token.span, {
          expected: '+, -, *, /, %, ^, and, or, or comparison operators',
          suggestion: 'Check operator syntax',
          source: this.source,
        });
    }
  }

  private parseQuote(): QuoteNode {
    const quoteToken = this.advance(); // consume \quote
    let expr: ASTNode;
    if (this.peek().type === 'LPAREN') {
      this.advance();
      expr = this.parseExpression(PREC_NONE);
      this.expect('RPAREN', ')');
    } else if (this.peek().type === 'LBRACE') {
      this.advance();
      expr = this.parseExpression(PREC_NONE);
      this.expect('RBRACE', '}');
    } else {
      expr = this.parsePrefix();
    }
    return {
      type: 'Quote',
      expr,
      span: {
        start: quoteToken.span.start,
        end: expr.span.end,
        line: quoteToken.span.line,
        col: quoteToken.span.col,
      },
    };
  }

  private parseUnquote(): UnquoteNode {
    const unquoteToken = this.advance(); // consume \unquote
    let expr: ASTNode;
    if (this.peek().type === 'LPAREN') {
      this.advance();
      expr = this.parseExpression(PREC_NONE);
      this.expect('RPAREN', ')');
    } else if (this.peek().type === 'LBRACE') {
      this.advance();
      expr = this.parseExpression(PREC_NONE);
      this.expect('RBRACE', '}');
    } else {
      expr = this.parsePrefix();
    }
    return {
      type: 'Unquote',
      expr,
      span: {
        start: unquoteToken.span.start,
        end: expr.span.end,
        line: unquoteToken.span.line,
        col: unquoteToken.span.col,
      },
    };
  }

  private parseBuild(): BuildNode {
    const buildToken = this.advance(); // consume \build
    if (this.peek().type === 'LBRACE') {
      this.advance();
      const template = this.parseExpression(PREC_NONE);
      const rbrace = this.expect('RBRACE', '}');
      return {
        type: 'Build',
        nodeType: 'Template',
        args: [],
        template,
        span: {
          start: buildToken.span.start,
          end: rbrace.span.end,
          line: buildToken.span.line,
          col: buildToken.span.col,
        },
      };
    }
    if (this.peek().type === 'LPAREN') {
      this.advance();
      const template = this.parseExpression(PREC_NONE);
      const rparen = this.expect('RPAREN', ')');
      return {
        type: 'Build',
        nodeType: 'Template',
        args: [],
        template,
        span: {
          start: buildToken.span.start,
          end: rparen.span.end,
          line: buildToken.span.line,
          col: buildToken.span.col,
        },
      };
    }

    let nodeType = 'Template';
    if (this.peek().type === 'IDENTIFIER') {
      nodeType = this.advance().value;
    }
    this.expect('LPAREN', '(');
    const args: ASTNode[] = [];
    while (this.peek().type !== 'RPAREN' && this.peek().type !== 'EOF') {
      args.push(this.parseExpression(PREC_NONE));
      if (this.peek().type === 'COMMA') {
        this.advance();
      } else {
        break;
      }
    }
    const rparen = this.expect('RPAREN', ')');
    return {
      type: 'Build',
      nodeType,
      args,
      span: {
        start: buildToken.span.start,
        end: rparen.span.end,
        line: buildToken.span.line,
        col: buildToken.span.col,
      },
    };
  }

  private parseMatch(): MatchNode {
    const matchToken = this.advance(); // consume \match
    const exprTokens: Token[] = [];
    let depth = 0;
    while (this.peek().type !== 'EOF') {
      const t = this.peek().type;
      if (t === 'LPAREN' || t === 'LBRACKET') depth++;
      else if (t === 'RPAREN' || t === 'RBRACKET') depth--;
      else if (t === 'LBRACE') {
        if (depth === 0) break;
        depth++;
      } else if (t === 'RBRACE') {
        depth--;
      }
      exprTokens.push(this.advance());
    }
    const lastExprSpan = exprTokens.length > 0 ? exprTokens[exprTokens.length - 1].span : matchToken.span;
    exprTokens.push({ type: 'EOF', value: '', span: lastExprSpan, leadingWhitespace: false });
    const exprParser = new Parser(exprTokens, { source: this.source });
    const expr = exprParser.parseExpression(PREC_NONE);

    this.expect('LBRACE', '{');
    const cases: MatchCase[] = [];
    let otherwise: ASTNode | undefined;

    while (this.peek().type !== 'RBRACE' && this.peek().type !== 'EOF') {
      if (this.peek().type === 'CASE') {
        const caseTok = this.advance(); // consume \case
        const patTokens: Token[] = [];
        let pdepth = 0;
        while (this.peek().type !== 'EOF') {
          const t = this.peek().type;
          if (t === 'LPAREN' || t === 'LBRACKET' || t === 'LBRACE') pdepth++;
          else if (t === 'RPAREN' || t === 'RBRACKET' || t === 'RBRACE') pdepth--;
          if (pdepth === 0 && (t === 'COLON' || t === 'IF' || t === 'REQUIRES' || t === 'WHERE')) {
            break;
          }
          patTokens.push(this.advance());
        }
        const lastPatSpan = patTokens.length > 0 ? patTokens[patTokens.length - 1].span : caseTok.span;
        patTokens.push({
          type: 'EOF',
          value: '',
          span: lastPatSpan,
          leadingWhitespace: false,
        });
        const patParser = new Parser(patTokens, { source: this.source });
        const pattern = patParser.parseExpression(PREC_NONE);

        let guard: ASTNode | undefined;
        if (this.peek().type === 'IF' || this.peek().type === 'REQUIRES' || this.peek().type === 'WHERE') {
          this.advance();
          const guardTokens: Token[] = [];
          let gdepth = 0;
          while (this.peek().type !== 'EOF') {
            const t = this.peek().type;
            if (gdepth === 0 && t === 'COLON') break;
            if (t === 'LPAREN' || t === 'LBRACKET' || t === 'LBRACE') gdepth++;
            else if (t === 'RPAREN' || t === 'RBRACKET' || t === 'RBRACE') gdepth--;
            guardTokens.push(this.advance());
          }
          const lastGuardSpan = guardTokens.length > 0 ? guardTokens[guardTokens.length - 1].span : caseTok.span;
          guardTokens.push({ type: 'EOF', value: '', span: lastGuardSpan, leadingWhitespace: false });
          const guardParser = new Parser(guardTokens, { source: this.source });
          guard = guardParser.parseExpression(PREC_NONE);
        }

        this.expect('COLON', ':');
        const bodyTokens: Token[] = [];
        let bdepth = 0;
        while (this.peek().type !== 'EOF') {
          const t = this.peek().type;
          if (bdepth === 0 && (t === 'COMMA' || t === 'RBRACE' || t === 'CASE' || t === 'OTHERWISE')) {
            break;
          }
          if (t === 'LPAREN' || t === 'LBRACKET' || t === 'LBRACE') bdepth++;
          else if (t === 'RPAREN' || t === 'RBRACKET' || t === 'RBRACE') bdepth--;
          bodyTokens.push(this.advance());
        }
        const lastBodySpan = bodyTokens.length > 0 ? bodyTokens[bodyTokens.length - 1].span : caseTok.span;
        bodyTokens.push({ type: 'EOF', value: '', span: lastBodySpan, leadingWhitespace: false });
        const bodyParser = new Parser(bodyTokens, { source: this.source });
        const body = bodyParser.parseExpression(PREC_NONE);

        cases.push({
          pattern,
          body,
          guard,
          span: {
            start: caseTok.span.start,
            end: body.span.end,
            line: caseTok.span.line,
            col: caseTok.span.col,
          },
        });
        if (this.peek().type === 'COMMA') this.advance();
      } else if (this.peek().type === 'OTHERWISE') {
        this.advance();
        this.expect('COLON', ':');
        const othTokens: Token[] = [];
        let odepth = 0;
        while (this.peek().type !== 'EOF') {
          const t = this.peek().type;
          if (odepth === 0 && (t === 'COMMA' || t === 'RBRACE' || t === 'CASE' || t === 'OTHERWISE')) {
            break;
          }
          if (t === 'LPAREN' || t === 'LBRACKET' || t === 'LBRACE') odepth++;
          else if (t === 'RPAREN' || t === 'RBRACKET' || t === 'RBRACE') odepth--;
          othTokens.push(this.advance());
        }
        const lastOthSpan = othTokens.length > 0 ? othTokens[othTokens.length - 1].span : matchToken.span;
        othTokens.push({ type: 'EOF', value: '', span: lastOthSpan, leadingWhitespace: false });
        const othParser = new Parser(othTokens, { source: this.source });
        otherwise = othParser.parseExpression(PREC_NONE);
        if (this.peek().type === 'COMMA') this.advance();
      } else {
        break;
      }
    }
    const rbrace = this.expect('RBRACE', '}');
    return {
      type: 'Match',
      expr,
      cases,
      otherwise,
      span: {
        start: matchToken.span.start,
        end: rbrace.span.end,
        line: matchToken.span.line,
        col: matchToken.span.col,
      },
    };
  }

  private peek(offset: number = 0): Token {
    const idx = this.pos + offset;
    if (idx >= this.tokens.length) {
      return this.tokens[this.tokens.length - 1];
    }
    return this.tokens[idx];
  }

  private advance(): Token {
    const token = this.peek();
    if (this.pos < this.tokens.length) {
      this.pos++;
    }
    return token;
  }

  private expect(type: TokenType, expectedDescription: string): Token {
    const token = this.peek();
    if (token.type !== type && !(type === 'IDENTIFIER' && token.type === 'BACKSLASH_IDENT')) {
      throw createError(`Unexpected token '${token.value || token.type}'. Expected ${expectedDescription}`, token.span, {
        expected: expectedDescription,
        suggestion: `Insert ${expectedDescription} here`,
        source: this.source,
      });
    }
    return this.advance();
  }
}

export function parse(source: string, options?: ParserOptions): ASTNode {
  const tokens = tokenize(source);
  const parser = new Parser(tokens, { ...options, source });
  return parser.parse();
}

export function parseProgram(source: string, options?: ParserOptions): ASTNode {
  let cleanSource = source;
  if (cleanSource.startsWith('---')) {
    const endIdx = cleanSource.indexOf('---', 3);
    if (endIdx !== -1) {
      cleanSource = cleanSource.slice(endIdx + 3);
    }
  }
  const tokens = tokenize(cleanSource);
  const parser = new Parser(tokens, { ...options, source: cleanSource });
  return parser.parseProgram();
}
