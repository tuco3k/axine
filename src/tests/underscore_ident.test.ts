import { describe, it, expect } from 'vitest';
import { tokenize } from '../core/tokenizer';

describe('Underscore Identifier Rules', () => {
  it('disallows bare underscore as an identifier', () => {
    expect(() => tokenize('_')).toThrow(/Unexpected character '_'/);
    expect(() => tokenize('_ = 5')).toThrow(/Unexpected character '_'/);
    expect(() => tokenize('x + _')).toThrow(/Unexpected character '_'/);
  });

  it('disallows underscore inside un-prefixed words (implicit product position)', () => {
    expect(() => tokenize('omega_d')).toThrow(/Unexpected character '_'/);
    expect(() => tokenize('v_0')).toThrow(/Unexpected character '_'/);
    expect(() => tokenize('flight_time')).toThrow(/Unexpected character '_'/);
    expect(() => tokenize('omega_d = :sqrt(omega_0^2 - gamma^2)')).toThrow(/Unexpected character '_'/);
  });

  it('allows underscores inside colon-prefixed identifiers', () => {
    const tokens1 = tokenize(':omega_d');
    expect(tokens1.map(t => [t.type, t.value])).toEqual([
      ['IDENTIFIER', 'omega_d'],
      ['EOF', ''],
    ]);

    const tokens2 = tokenize(':v_0 := 25.0');
    expect(tokens2.map(t => [t.type, t.value])).toEqual([
      ['IDENTIFIER', 'v_0'],
      ['ASSIGN', ':='],
      ['NUMBER', '25.0'],
      ['EOF', ''],
    ]);

    const tokens3 = tokenize(':flight_time := 2 * :v_y / g');
    expect(tokens3.map(t => [t.type, t.value])).toEqual([
      ['IDENTIFIER', 'flight_time'],
      ['ASSIGN', ':='],
      ['NUMBER', '2'],
      ['STAR', '*'],
      ['IDENTIFIER', 'v_y'],
      ['SLASH', '/'],
      ['IDENTIFIER', 'g'],
      ['EOF', ''],
    ]);
  });

  it('preserves numeric digit separators', () => {
    const tokens = tokenize('1_000_000');
    expect(tokens.map(t => [t.type, t.value])).toEqual([
      ['NUMBER', '1_000_000'],
      ['EOF', ''],
    ]);
  });

  it('preserves integral subscripts', () => {
    const tokens = tokenize('\u222c_S F \u00b7 dS');
    expect(tokens.map(t => [t.type, t.value])).toEqual([
      ['DOUBLE_INTEGRAL', '\u222c'],
      ['IDENTIFIER', '_'],
      ['IDENTIFIER', 'S'],
      ['IDENTIFIER', 'F'],
      ['DOT', '.'],
      ['IDENTIFIER', 'd'],
      ['IDENTIFIER', 'S'],
      ['EOF', ''],
    ]);
  });
});
