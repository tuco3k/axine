import { describe, it, expect } from 'vitest';
import { tokenize } from '../core/tokenizer';

describe('Tokenizer', () => {
  it('tokenizes simple integers and decimals', () => {
    const tokens = tokenize('42 3.14 1e-9 1_000_000');
    expect(tokens.map(t => [t.type, t.value])).toEqual([
      ['NUMBER', '42'],
      ['NUMBER', '3.14'],
      ['NUMBER', '1e-9'],
      ['NUMBER', '1_000_000'],
      ['EOF', ''],
    ]);
  });

  it('handles unicode operators and symbols', () => {
    const tokens = tokenize('2 × 3 ÷ 4 \u2264 5 \u2265 6 \u2260 7 \u2212 8 \u221a9 π τ');
    expect(tokens.map(t => [t.type, t.value])).toEqual([
      ['NUMBER', '2'],
      ['STAR', '*'],
      ['NUMBER', '3'],
      ['SLASH', '/'],
      ['NUMBER', '4'],
      ['LTE', '<='],
      ['NUMBER', '5'],
      ['GTE', '>='],
      ['NUMBER', '6'],
      ['NEQ', '!='],
      ['NUMBER', '7'],
      ['MINUS', '-'],
      ['NUMBER', '8'],
      ['IDENTIFIER', 'sqrt'],
      ['NUMBER', '9'],
      ['IDENTIFIER', 'pi'],
      ['IDENTIFIER', 'tau'],
      ['EOF', ''],
    ]);
  });

  it('tokenizes superscripts', () => {
    const tokens = tokenize('x² + y³');
    expect(tokens.map(t => [t.type, t.value])).toEqual([
      ['IDENTIFIER', 'x'],
      ['SUPERSCRIPT_DIGITS', '2'],
      ['PLUS', '+'],
      ['IDENTIFIER', 'y'],
      ['SUPERSCRIPT_DIGITS', '3'],
      ['EOF', ''],
    ]);
  });

  it('tokenizes assignments and ranges', () => {
    const tokens = tokenize('f(x) := x^2, x in -10..10 step 0.01');
    expect(tokens.map(t => [t.type, t.value])).toEqual([
      ['IDENTIFIER', 'f'],
      ['LPAREN', '('],
      ['IDENTIFIER', 'x'],
      ['RPAREN', ')'],
      ['ASSIGN', ':='],
      ['IDENTIFIER', 'x'],
      ['CARET', '^'],
      ['NUMBER', '2'],
      ['COMMA', ','],
      ['IDENTIFIER', 'x'],
      ['IN', 'in'],
      ['MINUS', '-'],
      ['NUMBER', '10'],
      ['DOTDOT', '..'],
      ['NUMBER', '10'],
      ['STEP', 'step'],
      ['NUMBER', '0.01'],
      ['EOF', ''],
    ]);
  });
});
