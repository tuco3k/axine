import { describe, it, expect } from 'vitest';
import { evaluate } from '../core/evaluator';
import { createInitialEnvironment } from '../core/evaluator';
import { parse } from '../core/parser';
import { formatAST } from '../core/formatter';

describe('Part E: Pattern Rules', () => {
  it('parses and formats a user-defined pattern rule (Gate E)', () => {
    const source = 'rule d//dx (myfunc(u)) => myfunc\'(u) * d//dx(u) requires: u is differentiable';
    const ast = parse(source);
    expect(ast.type).toBe('RuleDecl');

    const formatted = formatAST(ast);
    expect(formatted).toContain("rule d//dx myfunc(u) => myfunc'(u) * d//dx u");
    expect(formatted).toContain('requires: u is differentiable');
  });

  it('an unverifiable user-rule result is DESCRIBED, not COMPUTED (Gate E requirement)', () => {
    const env = createInitialEnvironment();
    evaluate('rule d//dx (myfunc(u)) => myfunc\'(u) * d//dx(u) requires: u is differentiable', env);

    const { value: res } = evaluate('d//dx (myfunc(x))', env);
    expect(res.type).toBe('described');
    if (res.type === 'described') {
      expect(res.meaning).toContain('computed via unverified user rule');
      expect(res.meaning).toContain('requires: u is differentiable');
      expect(res.provenance).toBe('user-rule');
      expect(res.obstruction).toBe('requires-proof');
    }
  });

  it('a rule attempting to override a built-in operation or function errors (Gate E requirement)', () => {
    const env = createInitialEnvironment();
    
    // Attempting to override built-in derivative rule for sin
    expect(() => evaluate('rule d//dx (sin(u)) => cos(u)', env)).toThrowError(/Cannot override built-in rule for 'sin'/);

    // Attempting to override built-in function directly
    expect(() => evaluate('rule sin(x) => cos(x)', env)).toThrowError(/Cannot override built-in rule for 'sin'/);

    // Attempting to override built-in addition operator
    expect(() => evaluate('rule a + b => a * b', env)).toThrowError(/Cannot override built-in rule for '\+'/);
  });
});
