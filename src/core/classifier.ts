import { ASTNode, Environment, Token } from './types';
import { BUILTIN_FUNCTIONS, CONSTANTS, parse } from './parser';
import { analyzeAST } from './analyzer';
import { Diagnostic } from './errors';
import { tokenize } from './tokenizer';

export type LineState = 'MATH' | 'DEFINITION' | 'PROSE' | 'INCOMPLETE' | 'ERROR';

export interface ClassificationResult {
  state: LineState;
  ast?: ASTNode;
  error?: Diagnostic;
  diagnostic?: Diagnostic;
  boundName?: string;
  isFunctionDef?: boolean;
}

export type LineClassification = ClassificationResult;

// -----------------------------------------------------------------------------
// Named Discrimination Predicates for PROSE vs ERROR
// -----------------------------------------------------------------------------

/**
 * Predicate 1: Checks if the line contains an assignment operator ':='
 */
export function hasAssignment(line: string): boolean {
  return line.includes(':=');
}

/**
 * Predicate 2: Checks if the line contains a call to a known builtin or defined function
 */
const BARE_MATH_FUNCS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh', 'ln', 'log', 'log2', 'exp', 'sqrt',
  'abs', 'floor', 'ceil', 'round',
]);

export function hasKnownFunctionCall(line: string, knownFunctions: Set<string> = BUILTIN_FUNCTIONS): boolean {
  for (const fn of knownFunctions) {
    // Check for "fn(" or "fn [" or "fn  ("
    const callPattern = new RegExp(`\\b${fn}\\s*[\\(\\[]`, 'i');
    if (callPattern.test(line)) {
      return true;
    }
    // Check for bare call with math arg e.g. "sin x", "cos 2", "ln n" (only single-letter variable or number)
    if (BARE_MATH_FUNCS.has(fn)) {
      const barePattern = new RegExp(`\\b${fn}\\s+(\\d+|[a-zA-Z]\\b|\\()`, 'i');
      if (barePattern.test(line)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Predicate 3: Checks if the line contains a digit adjacent to a mathematical operator
 * e.g. "3 +", "2*", "3 + * 4", "2 ++ 3", "10!", "5^", "+ 4"
 */
export function hasDigitAdjacentToOperator(line: string): boolean {
  // Operator adjacent to digit: [0-9]\s*[\+\-\*\/\%\^\!\=\<\>\×\÷\≤\≥\≠\√] or [\+\-\*\/\%\^\!\=\<\>\×\÷\≤\≥\≠\√]\s*[0-9]
  const pattern = /(\d\s*[\+\-\*\/\%\^\!\=\<\>\×\÷\≤\≥\≠\√]|[\+\-\*\/\%\^\!\=\<\>\×\÷\≤\≥\≠\√]\s*\d)/;
  return pattern.test(line);
}

/**
 * Predicate 4: Checks if more than half of the non-space characters in the line are math tokens
 */
export function hasHighMathTokenRatio(line: string, tokens?: Token[]): boolean {
  const nonSpaceChars = line.replace(/\s+/g, '');
  if (nonSpaceChars.length === 0) return false;

  let tokenList = tokens;
  if (!tokenList) {
    try {
      tokenList = tokenize(line);
    } catch {
      // If tokenization fails, fallback to character counting
      const mathChars = line.match(/[\d\+\-\*\/\%\^\!\=\<\>\(\)\[\]\,\:\.\_×÷≤≥≠√πτε]/g);
      const count = mathChars ? mathChars.length : 0;
      return count / nonSpaceChars.length > 0.5;
    }
  }

  let mathCharCount = 0;
  for (const tok of tokenList) {
    if (tok.type === 'EOF') continue;
    if (
      tok.type === 'NUMBER' ||
      tok.type === 'PLUS' ||
      tok.type === 'MINUS' ||
      tok.type === 'STAR' ||
      tok.type === 'SLASH' ||
      tok.type === 'PERCENT' ||
      tok.type === 'CARET' ||
      tok.type === 'BANG' ||
      tok.type === 'ASSIGN' ||
      tok.type === 'DOTDOT' ||
      tok.type === 'EQ' ||
      tok.type === 'NEQ' ||
      tok.type === 'LT' ||
      tok.type === 'LTE' ||
      tok.type === 'GT' ||
      tok.type === 'GTE' ||
      tok.type === 'LPAREN' ||
      tok.type === 'RPAREN' ||
      tok.type === 'COMMA' ||
      tok.type === 'SUPERSCRIPT_DIGITS' ||
      (tok.type === 'IDENTIFIER' && (BUILTIN_FUNCTIONS.has(tok.value) || CONSTANTS.has(tok.value) || tok.value.length === 1))
    ) {
      mathCharCount += tok.value.length;
    }
  }

  return mathCharCount / nonSpaceChars.length > 0.5;
}

/**
 * Checks if a non-parsing line is an incomplete prefix of a valid expression
 */
export function isPrefixOfValidExpression(line: string, _env: Environment = {}): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  // Trailing incomplete punctuation / operators
  const trailingIncomplete = /(:=|\+|-|\*|\/|%|\^|\(|\[|,|\.\.|in|step|->|if|then|else|and|or|not|=|<|>|<=|>=)$/;
  if (trailingIncomplete.test(trimmed)) {
    // Check if completing it can yield valid AST
    const completions = [
      ' 1',
      ' x',
      ' 1)',
      ' x)',
      ' 1]',
      ' 1..2)',
      ' n in 1..2)',
      ' 1 then 2 else 3',
    ];
    for (const c of completions) {
      try {
        parse(trimmed + c, { source: trimmed + c });
        return true;
      } catch {
        // continue
      }
    }
  }

  // Count unclosed parentheses / brackets
  let openParen = 0;
  let openBracket = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '(') openParen++;
    else if (ch === ')') openParen--;
    else if (ch === '[') openBracket++;
    else if (ch === ']') openBracket--;
    if (openParen < 0 || openBracket < 0) {
      return false; // unmatched closing paren is error
    }
  }

  if (openParen > 0 || openBracket > 0) {
    let suffix = '';
    for (let i = 0; i < openParen; i++) suffix += ')';
    for (let i = 0; i < openBracket; i++) suffix += ']';

    try {
      parse(trimmed + suffix, { source: trimmed + suffix });
      return true;
    } catch {
      // Try with dummy identifier before suffix
      try {
        parse(trimmed + ' 1' + suffix, { source: trimmed + ' 1' + suffix });
        return true;
      } catch {
        // Not a clean prefix
      }
    }
  }

  return false;
}

// -----------------------------------------------------------------------------
// Main Classifier
// -----------------------------------------------------------------------------

export function classifyLine(line: string, env: Environment = {}): ClassificationResult {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return { state: 'PROSE' };
  }

  const knownFunctions = new Set(BUILTIN_FUNCTIONS);
  const knownVariables = new Set(CONSTANTS);
  for (const [k, v] of Object.entries(env)) {
    if (v.type === 'function' || v.type === 'builtin') {
      knownFunctions.add(k);
    } else {
      knownVariables.add(k);
    }
  }

  // 1. Try to parse line as an expression or definition
  try {
    const ast = parse(trimmed, { knownFunctions, knownVariables, source: trimmed });

    // Validate AST through scope analyzer
    analyzeAST(ast, env, new Set(), trimmed);

    // If it's an assignment or function definition:
    if (ast.type === 'Assignment') {
      return { state: 'DEFINITION', ast, boundName: ast.target, isFunctionDef: false };
    }
    if (ast.type === 'FunctionDef') {
      return { state: 'DEFINITION', ast, boundName: ast.name, isFunctionDef: true };
    }

    return { state: 'MATH', ast };
  } catch (err: any) {
    // Parsing or analysis failed. Now discriminate between INCOMPLETE, ERROR, and PROSE.

    // Check INCOMPLETE
    if (isPrefixOfValidExpression(trimmed, env)) {
      return { state: 'INCOMPLETE' };
    }

    // Check ERROR vs PROSE discrimination rule:
    // A non-parsing, non-prefix line is ERROR if any of:
    // 1. it contains :=
    // 2. it contains a call to a known builtin or defined function
    // 3. it contains a digit adjacent to an operator (3 +, 2*)
    // 4. more than half its non-space characters are math tokens
    let tokens: Token[] | undefined;
    try {
      tokens = tokenize(trimmed);
    } catch {
      // Ignored
    }

    const isError =
      hasAssignment(trimmed) ||
      hasKnownFunctionCall(trimmed, knownFunctions) ||
      hasDigitAdjacentToOperator(trimmed) ||
      hasHighMathTokenRatio(trimmed, tokens);

    if (isError) {
      const diag: Diagnostic = err && err.diagnostic
        ? err.diagnostic
        : {
            message: err?.message || 'Syntax error',
            span: { start: 0, end: trimmed.length, line: 1, col: 1 },
            source: trimmed,
          };
      return { state: 'ERROR', error: diag };
    }

    return { state: 'PROSE' };
  }
}
