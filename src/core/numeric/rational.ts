import { Span } from '../types';
import { createError } from '../errors';

export class BigFraction {
  public readonly n: bigint;
  public readonly d: bigint;

  constructor(n: bigint, d: bigint = 1n, span?: Span) {
    if (d === 0n) {
      throw createError(
        'Division by zero',
        span ?? { start: 0, end: 0, line: 1, col: 1 },
        {
          expected: 'a non-zero denominator',
          suggestion: 'Ensure denominator expression does not evaluate to zero',
        }
      );
    }

    if (d < 0n) {
      n = -n;
      d = -d;
    }

    if (n === 0n) {
      this.n = 0n;
      this.d = 1n;
    } else {
      const g = BigFraction.gcd(n < 0n ? -n : n, d);
      this.n = n / g;
      this.d = d / g;
    }
  }

  public static fromInt(n: bigint | number): BigFraction {
    return new BigFraction(BigInt(n), 1n);
  }

  public static fromString(raw: string, span?: Span): BigFraction {
    const clean = raw.replace(/_/g, '');
    if (clean.includes('.')) {
      const [intPart, decPart] = clean.split('.');
      const denominator = 10n ** BigInt(decPart.length);
      const numerator = BigInt(intPart) * denominator + (BigInt(intPart) < 0n ? -BigInt(decPart) : BigInt(decPart));
      return new BigFraction(numerator, denominator, span);
    }
    if (clean.includes('e') || clean.includes('E')) {
      const [basePart, expPart] = clean.split(/[eE]/);
      const baseFrac = BigFraction.fromString(basePart, span);
      const exp = BigInt(expPart);
      if (exp >= 0n) {
        return baseFrac.mul(new BigFraction(10n ** exp, 1n, span), span);
      } else {
        return baseFrac.div(new BigFraction(10n ** (-exp), 1n, span), span);
      }
    }
    return new BigFraction(BigInt(clean), 1n, span);
  }

  public static gcd(a: bigint, b: bigint): bigint {
    while (b !== 0n) {
      const t = b;
      b = a % b;
      a = t;
    }
    return a;
  }

  public isZero(): boolean {
    return this.n === 0n;
  }

  public isInteger(): boolean {
    return this.d === 1n;
  }

  public isPositive(): boolean {
    return this.n > 0n;
  }

  public isNegative(): boolean {
    return this.n < 0n;
  }

  public equals(other: BigFraction): boolean {
    return this.n === other.n && this.d === other.d;
  }

  public add(other: BigFraction, span?: Span): BigFraction {
    return new BigFraction(this.n * other.d + other.n * this.d, this.d * other.d, span);
  }

  public sub(other: BigFraction, span?: Span): BigFraction {
    return new BigFraction(this.n * other.d - other.n * this.d, this.d * other.d, span);
  }

  public mul(other: BigFraction, span?: Span): BigFraction {
    return new BigFraction(this.n * other.n, this.d * other.d, span);
  }

  public div(other: BigFraction, span?: Span): BigFraction {
    if (other.n === 0n) {
      throw createError('Division by zero', span ?? { start: 0, end: 0, line: 1, col: 1 }, {
        expected: 'a non-zero divisor',
        suggestion: 'Check the divisor expression',
      });
    }
    return new BigFraction(this.n * other.d, this.d * other.n, span);
  }

  public neg(span?: Span): BigFraction {
    return new BigFraction(-this.n, this.d, span);
  }

  public abs(span?: Span): BigFraction {
    return new BigFraction(this.n < 0n ? -this.n : this.n, this.d, span);
  }

  public powInt(exp: bigint, span?: Span): BigFraction {
    if (this.n === 0n && exp === 0n) {
      throw createError('Indeterminate form: 0^0 is undefined', span ?? { start: 0, end: 0, line: 1, col: 1 }, {
        expected: 'a well-defined non-zero base or exponent',
        suggestion: 'Avoid raising 0 to the 0th power',
      });
    }
    if (exp === 0n) {
      return new BigFraction(1n, 1n, span);
    }
    if (this.n === 0n) {
      if (exp < 0n) {
        throw createError('Division by zero in 0^(negative power)', span ?? { start: 0, end: 0, line: 1, col: 1 }, {
          expected: 'a non-zero base for negative exponents',
          suggestion: 'Check base and exponent values',
        });
      }
      return new BigFraction(0n, 1n, span);
    }
    if (exp > 0n) {
      return new BigFraction(this.n ** exp, this.d ** exp, span);
    }
    const posExp = -exp;
    return new BigFraction(this.d ** posExp, this.n ** posExp, span);
  }

  /**
   * Tries to compute the exact integer square root. Returns null if not a perfect rational square.
   */
  public exactSqrt(): BigFraction | null {
    if (this.n < 0n) return null;
    const numSqrt = BigFraction.integerSquareRoot(this.n);
    if (numSqrt === null) return null;
    const denSqrt = BigFraction.integerSquareRoot(this.d);
    if (denSqrt === null) return null;
    return new BigFraction(numSqrt, denSqrt);
  }

  public static integerSquareRoot(n: bigint): bigint | null {
    if (n < 0n) return null;
    if (n === 0n) return 0n;
    if (n === 1n) return 1n;

    // Newton-Raphson for BigInt integer square root
    let x0 = n / 2n;
    if (x0 !== 0n) {
      let x1 = (x0 + n / x0) / 2n;
      while (x1 < x0) {
        x0 = x1;
        x1 = (x0 + n / x0) / 2n;
      }
      if (x0 * x0 === n) {
        return x0;
      }
    }
    return null;
  }

  public toNumber(): number {
    if (this.d === 0n) return this.n > 0n ? Infinity : this.n < 0n ? -Infinity : NaN;
    const absN = this.n < 0n ? -this.n : this.n;
    const numDigits = absN.toString().length;
    const denDigits = this.d.toString().length;
    if (numDigits > 250 || denDigits > 250) {
      const maxD = Math.max(numDigits, denDigits);
      const scale = BigInt(Math.max(0, maxD - 50));
      const divisor = 10n ** scale;
      const scaledN = Number(this.n / divisor);
      const scaledD = Number(this.d / divisor);
      return scaledN / scaledD;
    }
    return Number(this.n) / Number(this.d);
  }

  public toString(): string {
    if (this.d === 1n) {
      return this.n.toString();
    }
    return `${this.n}/${this.d}`;
  }

  public compareTo(other: BigFraction): number {
    const diff = this.n * other.d - other.n * this.d;
    if (diff < 0n) return -1;
    if (diff > 0n) return 1;
    return 0;
  }
}
