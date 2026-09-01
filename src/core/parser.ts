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
  Span,
  Token,
  TokenType,
} from './types';
import { createError } from './errors';
import { tokenize } from './tokenizer';

export const BUILTIN_FUNCTIONS = new Set([
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'sinh',
  'cosh',
  'tanh',
  'ln',
  'log',
  'log2',
  'exp',
  'sqrt',
  'abs',
  'floor',
  'ceil',
  'gamma',
  'round',
  'min',
  'max',
  'sum',
  'prod',
  'gcd',
  'lcm',
  'mod',
  'factorial',
  'float',
  'graph',
  // New builtins & universal primitives
  'range',
  'map',
  'filter',
  'fold',
  'iterate',
  'unfold',
  'least',
  'count',
  'length',
  'first',
  'last',
  'sort',
  'distinct',
  'zip',
  'take',
  'drop',
  'isprime',
  'nextprime',
  'divisors',
  'factorize',
  'totient',
  'powmod',
  'binomial',
  'find',
  'all',
  'any',
  'solve',
  'isolate',
  'simplify',
  'dimension',
  'check',
  'filter3d',
  'limit',
  'diff',
  'subsets',
  'permutations',
  'partitions',
  'random',
  'matrix',
  'det',
  'inverse',
  'transpose',
  'eigenvalues',
  'trace',
  'rank',
  'vertices',
  'edges',
  'degree',
  'neighbors',
  'chromatic',
  'clique',
  'isomorphic',
  'verify',
  'unknown',
  'kindof',
  'admits',
  'coerce',
  'convert',
  'norm',
  'inner',
  'card',
  'bar',
  'hat',
  'dot',
  'ddot',
  'P',
  'Prob',
  'E',
  'Var',
  'Cov',
  'grad',
  'del',
  'div',
  'curl',
  'laplacian',
  'wedge',
  'hodge',
  'star',
  'tensor',
  'direct_sum',
  'oplus',
  'limsup',
  'liminf',
]);

export const CONSTANTS = new Set([
  'pi', 'e', 'tau', 'phi', 'none', 'true', 'false',
  'R', 'C', 'Z', 'Q', 'N',
  'Reals', 'Complexes', 'Integers', 'Rationals', 'Naturals',
  '\u211d', '\u2102', '\u2124', '\u211a', '\u2115' // ℝ, ℂ, ℤ, ℚ, ℕ
]);

// Precedence levels
export const PREC_NONE = 0;
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

  constructor(tokens: Token[], options?: ParserOptions) {
    this.tokens = tokens;
    this.source = options?.source ?? '';
    this.knownFunctions = new Set(BUILTIN_FUNCTIONS);
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

  private tryParseDefinition(): ASTNode | null {
    const startPos = this.pos;

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
          const assocToken = this.expect('IDENTIFIER', 'left or right');
          associativity = assocToken.value === 'right' ? 'right' : 'left';
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
    if (this.peek().type === 'KIND' && this.peek(1).type !== 'LPAREN') {
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

    // Check for rule <pattern> => <replacement> (requires: <cond>)
    if (this.peek().type === 'RULE') {
      const ruleToken = this.advance();
      const patTokens: Token[] = [];
      while (this.peek().type !== 'FAT_ARROW' && this.peek().type !== 'EOF') {
        patTokens.push(this.advance());
      }
      this.expect('FAT_ARROW', '=>');
      const patternParser = new Parser(patTokens, { source: this.source });
      const patternAST = patternParser.parseExpression(PREC_NONE);

      const replTokens: Token[] = [];
      while (this.peek().type !== 'REQUIRES' && this.peek().type !== 'EOF') {
        replTokens.push(this.advance());
      }
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
      while (this.peek().type === 'IDENTIFIER') {
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

    // Check for f(x, y) := expr OR f(x, y) :\u2261 expr
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

      if (validSig && this.peek(p).type === 'RPAREN' && (this.peek(p + 1).type === 'ASSIGN' || this.peek(p + 1).type === 'GLOBAL_ASSIGN')) {
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
        this.advance(); // consume := or :\u2261

        this.knownFunctions.add(nameToken.value);
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

    // Check for variable :\u2261 expr or variable :== expr (Global assignment)
    if (this.peek().type === 'IDENTIFIER' && this.peek(1).type === 'GLOBAL_ASSIGN') {
      const targetToken = this.advance();
      this.advance(); // consume :\u2261 or :==
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

    // Check for variable := expr (Local/standard assignment)
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
      if (this.canBeginImplicitMultiplication()) {
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

      // Infix operators
      const token = this.peek();
      const infixPrec = this.getInfixPrecedence(token.type);
      if (infixPrec <= precedence) {
        break;
      }

      this.advance();

      // Right-associative for '^', left-associative for others
      const rightPrec = token.type === 'CARET' ? infixPrec - 1 : infixPrec;

      // Handle 'in' for ranges: x in a..b (step c) or x in collection
      if (token.type === 'IN') {
        if (left.type !== 'Identifier') {
          throw createError(`Expected variable before 'in'`, left.span, {
            expected: 'a variable name (e.g. x in -10..10)',
            suggestion: `Replace '${this.source.slice(left.span.start, left.span.end)}' with a variable name`,
            source: this.source,
          });
        }
        const varName = left.name;
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
            variable: varName,
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
        token.type === 'SET_IN' ||
        token.type === 'SET_NOTIN'
      ) {
        const opMap: Record<string, SetOpNode['op']> = {
          SET_UNION: 'union',
          SET_INTERSECT: 'intersect',
          SET_DIFF: 'setminus',
          SET_SUBSET: 'subset',
          SET_SUBSETEQ: 'subseteq',
          SET_IN: 'in',
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

      if (token.type === 'ISO' || token.type === 'HOMOTOPY' || token.type === 'EQUIV') {
        const relMap: Record<string, EquivalenceNode['relation']> = {
          ISO: 'iso',
          HOMOTOPY: 'homotopy',
          EQUIV: 'equiv',
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

    // Function call syntax for operator keywords: wedge(...), tensor(...), direct_sum(...), hodge(...), star(...), grad(...), del(...), laplacian(...)
    if (
      (token.type === 'WEDGE' ||
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

    // Bracket Operators: inner product, norm, floor, ceil
    if (
      token.type === 'LANGLE' ||
      token.type === 'NORM_BAR' ||
      token.type === 'FLOOR_L' ||
      token.type === 'CEIL_L'
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

    // Quantifiers: forall, exists, exists_unique
    if (token.type === 'FORALL' || token.type === 'EXISTS' || token.type === 'EXISTS_UNIQUE') {
      return this.parseQuantifier();
    }

    // Big Operators: Σ, Π
    if (token.type === 'SIGMA' || token.type === 'PI_PROD') {
      return this.parseBigOp();
    }

    // Integral: \u222b or integral
    if (token.type === 'INTEGRAL' || (token.type === 'IDENTIFIER' && (token.value === 'integral' || token.value.startsWith('integral_')))) {
      return this.parseIntegral();
    }

    // Record definition expression: record { mass, position, velocity }
    if (token.type === 'RECORD') {
      this.advance();
      this.expect('LBRACE', '{');
      const fields: string[] = [];
      while (this.peek().type !== 'RBRACE' && this.peek().type !== 'EOF') {
        const fieldToken = this.expect('IDENTIFIER', 'field name');
        fields.push(fieldToken.value);
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
    if (token.type === 'IDENTIFIER' && (token.value === 'lim' || token.value === 'limit' || token.value === 'limsup' || token.value === 'liminf') && (this.peek(1).type === 'LPAREN' || this.peek(1).type === 'IDENTIFIER')) {
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
      token.type === 'IMPORT'
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

      const isKnownFunc = this.knownFunctions.has(name) || /^[A-Z]/.test(name);

      // Check if followed immediately by '(' with standard call syntax
      if (this.peek(1).type === 'LPAREN') {
        if (isKnownFunc) {
          // It is a defined function / builtin call: f(...)
          this.advance(); // consume func name
          return this.parseFunctionCallArgs(name, token.span);
        } else {
          // Not a defined function: implicit multiplication f · (x+1)
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
      const event = this.parseExpression(PREC_NONE);
      let condition: ASTNode | undefined;
      if (this.peek().type === 'BAR_SEP') {
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
        // Check for named argument: name: value
        if (this.peek().type !== 'RPAREN' && this.peek(1).type === 'COLON') {
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
            name: nameTok.value,
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

    // ASCII representation mapping to identical AST nodes
    if ((callee === 'bar' || callee === 'hat' || callee === 'dot' || callee === 'ddot') && args.length === 1 && args[0].type === 'Identifier') {
      return {
        type: 'DecoratedIdentifier',
        decoration: callee,
        name: args[0].name,
        span,
      };
    }
    if (callee === 'norm') {
      return { type: 'BracketOp', op: 'norm', operands: args, span };
    }
    if (callee === 'inner') {
      return { type: 'BracketOp', op: 'inner_product', operands: args, span };
    }
    if (callee === 'card') {
      return { type: 'BracketOp', op: 'card', operands: args, span };
    }
    if (callee === 'grad' || callee === 'del') {
      return { type: 'NablaOp', op: 'grad', target: args[0], span };
    }
    if (callee === 'div') {
      return { type: 'NablaOp', op: 'div', target: args[0], span };
    }
    if (callee === 'curl') {
      return { type: 'NablaOp', op: 'curl', target: args[0], span };
    }
    if (callee === 'laplacian') {
      return { type: 'NablaOp', op: 'laplacian', target: args[0], span };
    }
    if (callee === 'hodge' || callee === 'star') {
      return { type: 'DifferentialFormOp', op: 'hodge_star', operands: args, span };
    }
    if (callee === 'wedge') {
      return { type: 'DifferentialFormOp', op: 'wedge', operands: args, span };
    }
    if (callee === 'tensor') {
      return { type: 'TensorOp', op: 'tensor', left: args[0], right: args[1], span };
    }
    if (callee === 'direct_sum' || callee === 'oplus') {
      return { type: 'TensorOp', op: 'direct_sum', left: args[0], right: args[1], span };
    }
    if (callee === 'E') {
      return { type: 'Probability', op: 'expect', event: args[0], span };
    }
    if (callee === 'Var') {
      return { type: 'Probability', op: 'variance', event: args[0], span };
    }
    if (callee === 'Cov') {
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
        if (q + 1 < this.tokens.length && (this.tokens[q + 1].type === 'ASSIGN' || this.tokens[q + 1].type === 'GLOBAL_ASSIGN')) {
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
    } else if (this.peek().type === 'IDENTIFIER' && this.peek().value.startsWith('_')) {
      const regTok = this.advance();
      const name = regTok.value.slice(1);
      region = { type: 'Identifier', name: name || 'S', span: regTok.span };
    }

    const prevParsing = this.parsingIntegrand;
    this.parsingIntegrand = true;
    const integrand = this.parseExpression(PREC_NONE);
    this.parsingIntegrand = prevParsing;

    let differential = integralType === 'triple' ? 'dV' : integralType === 'contour' ? 'dr' : 'dS';
    if (
      this.peek().type === 'IDENTIFIER' &&
      (this.peek().value.startsWith('d') ||
        this.peek().value.startsWith('dr') ||
        this.peek().value.startsWith('dS') ||
        this.peek().value.startsWith('dV'))
    ) {
      const diffTok = this.advance();
      differential = diffTok.value;
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

    throw createError(`Invalid bracket operator '${token.value}'`, token.span);
  }

  private parseQuantifier(): QuantifierNode {
    const qTok = this.advance();
    const quantifier: QuantifierNode['quantifier'] =
      qTok.type === 'FORALL' ? 'forall' : qTok.type === 'EXISTS_UNIQUE' ? 'exists_unique' : 'exists';

    const varTok = this.expect('IDENTIFIER', 'quantified variable');
    if (this.peek().type === 'SET_IN' || this.peek().type === 'IN') {
      this.advance();
    }
    const domain = this.parseExpression(PREC_COMPARE);
    if (this.peek().type === 'COMMA' || this.peek().type === 'COLON' || this.peek().type === 'BAR_SEP') {
      this.advance();
    }
    const predicate = this.parseExpression(PREC_NONE);
    return {
      type: 'Quantifier',
      quantifier,
      variable: varTok.value,
      domain,
      predicate,
      span: {
        start: qTok.span.start,
        end: predicate.span.end,
        line: qTok.span.line,
        col: qTok.span.col,
      },
    };
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
      const key = keyTok.value;
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
      let vTok = this.advance().value;
      if (vTok.startsWith('d') || vTok.startsWith('\u2202')) vTok = vTok.slice(1);
      if (vTok) varName = vTok;
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
        if (this.isBinderToken(this.peek())) {
          const binder = this.advance();
          variable = binder.value.slice(1);
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

    if (opTok.type === 'IDENTIFIER' && opTok.value.startsWith('integral_')) {
      subVal = opTok.value.slice(9);
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
    if (this.isBinderToken(this.peek())) {
      const binder = this.advance();
      variable = binder.value.slice(1);
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

  private canBeginImplicitMultiplication(): boolean {
    const token = this.peek();
    if (this.parsingIntegrand && this.isBinderToken(token)) {
      return false;
    }
    return this.canBeginExpression(token.type);
  }

  private isBinderToken(token: Token): boolean {
    if (token.type !== 'IDENTIFIER') return false;
    const val = token.value;
    if (val.length < 2 || val[0] !== 'd') return false;
    if (val === 'det' || val === 'dim') return false;
    return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(val.slice(1));
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
      type === 'CLAIM'
    );
  }

  private getInfixPrecedence(type: TokenType): number {
    switch (type) {
      case 'OR':
        return PREC_OR;
      case 'AND':
        return PREC_AND;
      case 'IN':
      case 'DOTDOT':
        return PREC_IN;
      case 'EQ':
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
      case 'EQ': return token.value === '==' ? '==' : '=';
      case 'CONGRUENT': return '==';
      case 'NEQ': return '!=';
      case 'LT': return '<';
      case 'LTE': return '<=';
      case 'GT': return '>';
      case 'GTE': return '>=';
      case 'IN': return 'in';
      case 'AND': return 'and';
      case 'OR': return 'or';
      default:
        throw createError(`Invalid binary operator '${token.value}'`, token.span, {
          expected: '+, -, *, /, %, ^, and, or, or comparison operators',
          suggestion: 'Check operator syntax',
          source: this.source,
        });
    }
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
    if (token.type !== type) {
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
