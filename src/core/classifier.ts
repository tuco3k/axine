import { ASTNode, Environment, Token } from './types';
import { CONSTANTS, parse } from './parser';
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

export function hasKnownFunctionCall(line: string, knownFunctions: Set<string> = new Set()): boolean {
  const allFuncs = new Set([...knownFunctions, ...BARE_MATH_FUNCS, 'sum', 'prod', 'min', 'max']);
  for (const fn of allFuncs) {
    // Check for "fn(" or "fn [" or "fn  ("
    const escapedFn = fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const callPattern = fn.startsWith(':')
      ? new RegExp(`(?:^|[^a-zA-Z0-9_])${escapedFn}\\s*[\\(\\[]`, 'i')
      : new RegExp(`\\b${escapedFn}\\s*[\\(\\[]`, 'i');
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
  // Operator adjacent to digit: [0-9]\s*[\+\-\*\/\%\^\!\=\<\>\×\÷\u2264\u2265\u2260\u221a] or [\+\-\*\/\%\^\!\=\<\>\×\÷\u2264\u2265\u2260\u221a]\s*[0-9]
  const pattern = /(\d\s*[\+\-\*\/\%\^\!\=\<\>\×\÷\u2264\u2265\u2260\u221a]|[\+\-\*\/\%\^\!\=\<\>\×\÷\u2264\u2265\u2260\u221a]\s*\d)/;
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
      const mathChars = line.match(/[\d\+\-\*\/\%\^\!\=\<\>\(\)\[\]\,\:\.\_×÷\u2264\u2265\u2260\u221aπτε]/g);
      const count = mathChars ? mathChars.length : 0;
      return count / nonSpaceChars.length > 0.5;
    }
  }

  let mathCharCount = 0;
  for (let i = 0; i < tokenList.length; i++) {
    const tok = tokenList[i];
    if (tok.type === 'EOF') continue;
    if (
      tok.type === 'NUMBER' ||
      tok.type === 'PLUS' ||
      tok.type === 'MINUS' ||
      tok.type === 'STAR' ||
      tok.type === 'SLASH' ||
      tok.type === 'DOUBLE_SLASH' ||
      tok.type === 'PERCENT' ||
      tok.type === 'CARET' ||
      tok.type === 'BANG' ||
      tok.type === 'ASSIGN' ||
      tok.type === 'GLOBAL_ASSIGN' ||
      tok.type === 'DOT' ||
      tok.type === 'DOTDOT' ||
      tok.type === 'EQ' ||
      tok.type === 'NEQ' ||
      tok.type === 'LT' ||
      tok.type === 'LTE' ||
      tok.type === 'GT' ||
      tok.type === 'GTE' ||
      tok.type === 'CONGRUENT' ||
      tok.type === 'LPAREN' ||
      tok.type === 'RPAREN' ||
      tok.type === 'LBRACKET' ||
      tok.type === 'RBRACKET' ||
      tok.type === 'LBRACE' ||
      tok.type === 'RBRACE' ||
      tok.type === 'COMMA' ||
      tok.type === 'SUPERSCRIPT_DIGITS' ||
      tok.type === 'INTEGRAL' ||
      tok.type === 'DOUBLE_INTEGRAL' ||
      tok.type === 'TRIPLE_INTEGRAL' ||
      tok.type === 'CONTOUR_INTEGRAL' ||
      tok.type === 'DIFF_OP' ||
      tok.type === 'NABLA' ||
      tok.type === 'LAPLACIAN' ||
      tok.type === 'WEDGE' ||
      tok.type === 'HODGE_STAR' ||
      tok.type === 'TENSOR_PROD' ||
      tok.type === 'DIRECT_SUM' ||
      tok.type === 'LANGLE' ||
      tok.type === 'RANGLE' ||
      tok.type === 'NORM_BAR' ||
      tok.type === 'FLOOR_L' ||
      tok.type === 'FLOOR_R' ||
      tok.type === 'CEIL_L' ||
      tok.type === 'CEIL_R' ||
      tok.type === 'FORALL' ||
      tok.type === 'EXISTS' ||
      tok.type === 'EXISTS_UNIQUE' ||
      tok.type === 'SET_IN' ||
      tok.type === 'SET_NOTIN' ||
      tok.type === 'SET_SUBSET' ||
      tok.type === 'SET_SUBSETEQ' ||
      tok.type === 'SET_UNION' ||
      tok.type === 'SET_INTERSECT' ||
      tok.type === 'SET_DIFF' ||
      tok.type === 'ISO' ||
      tok.type === 'HOMOTOPY' ||
      tok.type === 'EQUIV' ||
      tok.type === 'DAGGER' ||
      tok.type === 'FAT_ARROW' ||
      tok.type === 'ARROW' ||
      tok.type === 'SIGMA' ||
      tok.type === 'PI_PROD'
    ) {
      mathCharCount += tok.value.length;
    } else if (tok.type === 'IDENTIFIER') {
      if (CONSTANTS.has(tok.value)) {
        mathCharCount += tok.value.length;
      } else if (tok.value.length === 1) {
        const prevTok = i > 0 ? tokenList[i - 1] : undefined;
        const nextTok = i + 1 < tokenList.length ? tokenList[i + 1] : undefined;
        const isPartWord = (!tok.leadingWhitespace && prevTok && prevTok.type === 'IDENTIFIER') ||
                           (nextTok && nextTok.type === 'IDENTIFIER' && !nextTok.leadingWhitespace);
        if (!isPartWord) {
          mathCharCount += 1;
        }
      }
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

  // Unclosed brackets, { included: close them in order, with and without an
  // operand before the closers.
  const closers: string[] = [];
  const closerOf: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  let inString = false;
  for (const ch of trimmed) {
    if (inString) {
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch in closerOf) closers.push(closerOf[ch]);
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (closers.pop() !== ch) return false; // unmatched closing bracket is an error
    }
  }

  if (closers.length > 0) {
    const suffix = closers.reverse().join('');
    for (const operand of ['', ' 1', ' x']) {
      try {
        parse(trimmed + operand + suffix, { source: trimmed + operand + suffix });
        return true;
      } catch {
        // Not a clean prefix with this completion
      }
    }
  }

  return false;
}

// -----------------------------------------------------------------------------
// What a line is
// -----------------------------------------------------------------------------

/**
 * What a line of an .ax document is, decided from its text alone. This is the
 * single classification: the evaluator evaluates exactly the lines it calls
 * math, and the document shows the others as prose. It does not depend on
 * what earlier lines defined, so a line reads the same before and after
 * evaluation.
 *
 *   blank       empty or whitespace
 *   comment     starts with #
 *   prose       text; not evaluated
 *   math        an expression, definition or command; evaluated (a malformed
 *               one is reported as an error, never shown as prose)
 *   incomplete  the start of an expression that the next line may finish
 */
export type LineKind = 'blank' | 'comment' | 'prose' | 'math' | 'incomplete';

// A ':'-prefixed name applied to arguments. Only Axine writes this.
function hasColonCall(line: string): boolean {
  return /(?:^|[^A-Za-z0-9_])(:[A-Za-z_][A-Za-z0-9_]*)\s*\(/.test(line);
}

// Statements and declarations are Axine whatever words they contain.
const STATEMENT_NODE_TYPES = new Set([
  'Assignment', 'FunctionDef', 'ModuleDecl', 'Import', 'Export', 'UnitDecl', 'DimensionDecl',
  'Claim', 'RuleDecl', 'ViewDecl', 'OperatorDecl', 'KindDecl', 'RecordDef', 'RecordWith',
]);

// Text that parses as an expression but reads as words: two or more bare
// words outside strings, and none of the marks of an expression.
function readsAsProse(trimmed: string, ast: ASTNode): boolean {
  if (STATEMENT_NODE_TYPES.has(ast.type) || (ast.type === 'BinaryOp' && (ast as any).op === '=')) return false;
  const outsideStrings = trimmed.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  const bareProseWords = outsideStrings.match(/(?<![:\\])\b[a-zA-Z]{2,}\b/g) || [];
  return (
    bareProseWords.length >= 2 &&
    !hasAssignment(trimmed) &&
    !hasKnownFunctionCall(trimmed) &&
    !hasColonCall(trimmed) &&
    !hasDigitAdjacentToOperator(trimmed) &&
    !hasHighMathTokenRatio(trimmed)
  );
}

// Text that does not parse but carries the marks of an expression, so it is a
// malformed expression rather than prose.
function readsAsMath(trimmed: string): boolean {
  if (/^\\[A-Za-z]/.test(trimmed)) return true;
  let tokens: Token[] | undefined;
  try {
    tokens = tokenize(trimmed);
  } catch {
    // Counted from characters below.
  }
  return (
    hasAssignment(trimmed) ||
    hasKnownFunctionCall(trimmed) ||
    hasColonCall(trimmed) ||
    hasDigitAdjacentToOperator(trimmed) ||
    hasHighMathTokenRatio(trimmed, tokens)
  );
}

export function lineKind(source: string): LineKind {
  const trimmed = source.trim();
  if (!trimmed) return 'blank';
  if (trimmed.startsWith('#')) return 'comment';
  // Prose carries inline mathematics between $ signs; Axine has no $ token.
  if (/\$[^$\n]+\$/.test(trimmed)) return 'prose';
  try {
    const ast = parse(trimmed, { source: trimmed });
    return readsAsProse(trimmed, ast) ? 'prose' : 'math';
  } catch {
    if (isPrefixOfValidExpression(trimmed)) return 'incomplete';
    return readsAsMath(trimmed) ? 'math' : 'prose';
  }
}

/**
 * The kind of mathematics in a unit already known to be math: a definition,
 * an expression, an unfinished expression, or an error. Uses the environment
 * of earlier definitions. Never returns PROSE.
 */
export function analyzeMath(source: string, env: Environment = {}): ClassificationResult {
  const trimmed = source.trim();

  const knownFunctions = new Set<string>();
  const knownVariables = new Set(CONSTANTS);
  for (const [k, v] of Object.entries(env)) {
    if (v.type === 'function' || v.type === 'builtin' || (v as any).type === 'forall_rule' || v.type === 'lambda') {
      knownFunctions.add(k);
    } else {
      knownVariables.add(k);
    }
  }

  try {
    const ast = parse(trimmed, { knownFunctions, knownVariables, source: trimmed });

    // Validate AST through scope analyzer
    analyzeAST(ast, env, new Set(), trimmed);

    // If it's an assignment or function/module/statement definition:
    if (ast.type === 'Assignment') {
      return { state: 'DEFINITION', ast, boundName: ast.target, isFunctionDef: false };
    }
    if (ast.type === 'BinaryOp' && ast.op === '=') {
      if (ast.left.type === 'Identifier') {
        return { state: 'DEFINITION', ast, boundName: ast.left.name, isFunctionDef: false };
      } else if (ast.right.type === 'Identifier') {
        return { state: 'DEFINITION', ast, boundName: ast.right.name, isFunctionDef: false };
      }
    }
    if (ast.type === 'FunctionDef') {
      return { state: 'DEFINITION', ast, boundName: ast.name, isFunctionDef: true };
    }
    if (
      ast.type === 'ModuleDecl' ||
      ast.type === 'Import' ||
      ast.type === 'Export' ||
      ast.type === 'UnitDecl' ||
      ast.type === 'DimensionDecl' ||
      ast.type === 'Claim' ||
      ast.type === 'RuleDecl' ||
      ast.type === 'ViewDecl' ||
      ast.type === 'OperatorDecl' ||
      ast.type === 'KindDecl' ||
      ast.type === 'RecordDef' ||
      ast.type === 'RecordWith'
    ) {
      return { state: 'DEFINITION', ast };
    }

    return { state: 'MATH', ast };
  } catch (err: any) {
    if (isPrefixOfValidExpression(trimmed, env)) {
      return { state: 'INCOMPLETE' };
    }
    const diag: Diagnostic = err && err.diagnostic
      ? err.diagnostic
      : {
          message: err?.message || 'Syntax error',
          span: { start: 0, end: trimmed.length, line: 1, col: 1 },
          source: trimmed,
        };
    return { state: 'ERROR', error: diag };
  }
}

/**
 * Classifies one line: prose by lineKind, otherwise the kind of mathematics.
 */
export function classifyLine(line: string, env: Environment = {}): ClassificationResult {
  const kind = lineKind(line);
  if (kind === 'blank' || kind === 'comment' || kind === 'prose') {
    return { state: 'PROSE' };
  }
  if (kind === 'incomplete') {
    return { state: 'INCOMPLETE' };
  }
  return analyzeMath(line, env);
}
