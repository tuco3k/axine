import {
  ASTNode,
  AssignmentNode,
  BigOpNode,
  BinaryOpNode,
  BlockNode,
  ClaimNode,
  DiffNode,
  FunctionCallNode,
  FunctionDefNode,
  GlobalAssignmentNode,
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
]);

export const CONSTANTS = new Set(['pi', 'e', 'tau', 'phi', 'none', 'true', 'false']);

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

  private tryParseDefinition(): AssignmentNode | GlobalAssignmentNode | FunctionDefNode | ClaimNode | null {
    const startPos = this.pos;

    // Check for claim <name> { ... }
    if (this.peek().type === 'CLAIM') {
      return this.parseClaim();
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
        left = {
          type: 'Index',
          target: left,
          index: indexNode,
          span,
        };
        continue;
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
            type: 'Range',
            variable: varName,
            start: rangeStart,
            end: rangeStart,
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

    // Block expression: { stmt1; stmt2; ... }
    if (token.type === 'LBRACE') {
      return this.parseBlock();
    }

    // Big Operators: Σ, Π, \u222b
    if (token.type === 'SIGMA' || token.type === 'PI_PROD' || token.type === 'INTEGRAL') {
      return this.parseBigOp();
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

    // Differential operator d//dx expr or \u2202//\u2202x expr
    if ((token.value === 'd' || token.value === '\u2202') && (this.peek(1).type === 'DOUBLE_SLASH' || this.peek(1).type === 'SLASH')) {
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
    if (token.type === 'IDENTIFIER') {
      const name = token.value;
      const isKnownFunc = this.knownFunctions.has(name);

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

  private parseFunctionCallArgs(callee: string, calleeSpan: Span): FunctionCallNode {
    this.expect('LPAREN', '(');
    const args: ASTNode[] = [];

    if (this.peek().type !== 'RPAREN') {
      while (true) {
        // Check for named argument: name: value
        if ((this.peek().type === 'IDENTIFIER' || this.peek().type === 'IN' || this.peek().type === 'STEP' || this.peek().type === 'NOT') && this.peek(1).type === 'COLON') {
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
    return {
      type: 'FunctionCall',
      callee,
      args,
      isBare: false,
      span,
    };
  }

  private parseBlock(): BlockNode {
    const lBrace = this.expect('LBRACE', '{');

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
      const keyTok = this.expect('IDENTIFIER', 'claim field (statement, proved_by, relevance, kind, shadow, expect)');
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

  private canBeginImplicitMultiplication(): boolean {
    const token = this.peek();
    return this.canBeginExpression(token.type);
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
        return PREC_COMPARE;
      case 'PLUS':
      case 'MINUS':
        return PREC_ADD;
      case 'STAR':
      case 'SLASH':
      case 'DOUBLE_SLASH':
      case 'PERCENT':
        return PREC_EXPLICIT_MUL;
      case 'CARET':
        return PREC_POW;
      default:
        return PREC_NONE;
    }
  }

  private tokenToBinaryOp(token: Token): BinaryOpNode['op'] {
    switch (token.type) {
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
