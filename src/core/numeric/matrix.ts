import { ListValue, MatrixValue, Span, Value } from '../types';
import { addValues, divValues, makeUnknown, mulValues, subValues, valueToNumber } from './tower';
import { createError } from '../errors';

export function matrixFromList(list: ListValue, span?: Span): MatrixValue {
  if (list.elements.length === 0) {
    return { type: 'matrix', rows: 0, cols: 0, data: [] };
  }
  // Check if it's a 2D list: [[1, 2], [3, 4]]
  if (list.elements[0].type === 'list') {
    const rows = list.elements.length;
    const cols = (list.elements[0] as ListValue).elements.length;
    const data: Value[][] = [];
    for (let r = 0; r < rows; r++) {
      const rowItem = list.elements[r];
      if (rowItem.type !== 'list') {
        throw createError('Matrix rows must all be lists', span ?? { start: 0, end: 0, line: 1, col: 1 });
      }
      if (rowItem.elements.length !== cols) {
        throw createError(`Matrix rows must have equal length (expected ${cols}, got ${rowItem.elements.length})`, span ?? { start: 0, end: 0, line: 1, col: 1 });
      }
      data.push([...rowItem.elements]);
    }
    return { type: 'matrix', rows, cols, data };
  }

  // 1D list as 1-column vector: [[x1], [x2], ...]
  const rows = list.elements.length;
  const data: Value[][] = list.elements.map(el => [el]);
  return { type: 'matrix', rows, cols: 1, data };
}

export function matrixAdd(a: MatrixValue, b: MatrixValue, span?: Span): MatrixValue {
  if (a.rows !== b.rows || a.cols !== b.cols) {
    throw createError(`Matrix dimension mismatch for addition: ${a.rows}x${a.cols} + ${b.rows}x${b.cols}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
  }
  const data: Value[][] = [];
  for (let r = 0; r < a.rows; r++) {
    const row: Value[] = [];
    for (let c = 0; c < a.cols; c++) {
      row.push(addValues(a.data[r][c], b.data[r][c], span));
    }
    data.push(row);
  }
  return { type: 'matrix', rows: a.rows, cols: a.cols, data };
}

export function matrixSub(a: MatrixValue, b: MatrixValue, span?: Span): MatrixValue {
  if (a.rows !== b.rows || a.cols !== b.cols) {
    throw createError(`Matrix dimension mismatch for subtraction: ${a.rows}x${a.cols} - ${b.rows}x${b.cols}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
  }
  const data: Value[][] = [];
  for (let r = 0; r < a.rows; r++) {
    const row: Value[] = [];
    for (let c = 0; c < a.cols; c++) {
      row.push(subValues(a.data[r][c], b.data[r][c], span));
    }
    data.push(row);
  }
  return { type: 'matrix', rows: a.rows, cols: a.cols, data };
}

export function matrixMul(a: MatrixValue, b: MatrixValue, span?: Span): MatrixValue {
  if (a.cols !== b.rows) {
    throw createError(`Matrix dimension mismatch for multiplication: ${a.rows}x${a.cols} * ${b.rows}x${b.cols}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
  }
  const rows = a.rows;
  const cols = b.cols;
  const data: Value[][] = [];

  for (let r = 0; r < rows; r++) {
    const row: Value[] = [];
    for (let c = 0; c < cols; c++) {
      let sum: Value = { type: 'rational', n: 0n, d: 1n };
      for (let k = 0; k < a.cols; k++) {
        const prod = mulValues(a.data[r][k], b.data[k][c], span);
        sum = addValues(sum, prod, span);
      }
      row.push(sum);
    }
    data.push(row);
  }
  return { type: 'matrix', rows, cols, data };
}

export function matrixScalarMul(s: Value, m: MatrixValue, span?: Span): MatrixValue {
  const data: Value[][] = [];
  for (let r = 0; r < m.rows; r++) {
    const row: Value[] = [];
    for (let c = 0; c < m.cols; c++) {
      row.push(mulValues(s, m.data[r][c], span));
    }
    data.push(row);
  }
  return { type: 'matrix', rows: m.rows, cols: m.cols, data };
}

export function matrixTranspose(m: MatrixValue): MatrixValue {
  const data: Value[][] = [];
  for (let c = 0; c < m.cols; c++) {
    const row: Value[] = [];
    for (let r = 0; r < m.rows; r++) {
      row.push(m.data[r][c]);
    }
    data.push(row);
  }
  return { type: 'matrix', rows: m.cols, cols: m.rows, data };
}

export function matrixTrace(m: MatrixValue, span?: Span): Value {
  if (m.rows !== m.cols) {
    throw createError(`Trace requires a square matrix, got ${m.rows}x${m.cols}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
  }
  let sum: Value = { type: 'rational', n: 0n, d: 1n };
  for (let i = 0; i < m.rows; i++) {
    sum = addValues(sum, m.data[i][i], span);
  }
  return sum;
}

export function matrixDet(m: MatrixValue, span?: Span): Value {
  if (m.rows !== m.cols) {
    throw createError(`Determinant requires a square matrix, got ${m.rows}x${m.cols}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
  }
  const n = m.rows;
  if (n === 0) return { type: 'rational', n: 1n, d: 1n };
  if (n === 1) return m.data[0][0];
  if (n === 2) {
    const ad = mulValues(m.data[0][0], m.data[1][1], span);
    const bc = mulValues(m.data[0][1], m.data[1][0], span);
    return subValues(ad, bc, span);
  }

  // Gaussian elimination with exact fraction arithmetic
  const a: Value[][] = m.data.map(row => [...row]);
  let sign = 1n;

  for (let col = 0; col < n; col++) {
    // Find pivot
    let pivotRow = col;
    while (pivotRow < n && isZero(a[pivotRow][col], span)) {
      pivotRow++;
    }
    if (pivotRow === n) {
      return { type: 'rational', n: 0n, d: 1n }; // Singular matrix
    }
    if (pivotRow !== col) {
      const temp = a[col];
      a[col] = a[pivotRow];
      a[pivotRow] = temp;
      sign = -sign;
    }

    const pivot = a[col][col];
    for (let r = col + 1; r < n; r++) {
      if (!isZero(a[r][col], span)) {
        const factor = divValues(a[r][col], pivot, span);
        for (let c = col; c < n; c++) {
          a[r][c] = subValues(a[r][c], mulValues(factor, a[col][c], span), span);
        }
      }
    }
  }

  let det: Value = { type: 'rational', n: sign, d: 1n };
  for (let i = 0; i < n; i++) {
    det = mulValues(det, a[i][i], span);
  }
  return det;
}

export function matrixInverse(m: MatrixValue, span?: Span): MatrixValue {
  if (m.rows !== m.cols) {
    throw createError(`Inverse requires a square matrix, got ${m.rows}x${m.cols}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
  }
  const n = m.rows;
  // Augmented matrix [A | I]
  const aug: Value[][] = [];
  for (let r = 0; r < n; r++) {
    const row: Value[] = [...m.data[r]];
    for (let c = 0; c < n; c++) {
      row.push({ type: 'rational', n: r === c ? 1n : 0n, d: 1n });
    }
    aug.push(row);
  }

  // Gauss-Jordan elimination
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    while (pivotRow < n && isZero(aug[pivotRow][col], span)) {
      pivotRow++;
    }
    if (pivotRow === n) {
      throw createError('Matrix is singular and cannot be inverted', span ?? { start: 0, end: 0, line: 1, col: 1 });
    }
    if (pivotRow !== col) {
      const temp = aug[col];
      aug[col] = aug[pivotRow];
      aug[pivotRow] = temp;
    }

    const pivot = aug[col][col];
    for (let c = 0; c < 2 * n; c++) {
      aug[col][c] = divValues(aug[col][c], pivot, span);
    }

    for (let r = 0; r < n; r++) {
      if (r !== col && !isZero(aug[r][col], span)) {
        const factor = aug[r][col];
        for (let c = 0; c < 2 * n; c++) {
          aug[r][c] = subValues(aug[r][c], mulValues(factor, aug[col][c], span), span);
        }
      }
    }
  }

  const invData: Value[][] = [];
  for (let r = 0; r < n; r++) {
    invData.push(aug[r].slice(n));
  }
  return { type: 'matrix', rows: n, cols: n, data: invData };
}

export function matrixRank(m: MatrixValue, span?: Span): Value {
  const rows = m.rows;
  const cols = m.cols;
  const a: Value[][] = m.data.map(row => [...row]);
  let rank = 0;

  for (let col = 0; col < cols && rank < rows; col++) {
    let pivotRow = rank;
    while (pivotRow < rows && isZero(a[pivotRow][col], span)) {
      pivotRow++;
    }
    if (pivotRow === rows) continue;

    if (pivotRow !== rank) {
      const temp = a[rank];
      a[rank] = a[pivotRow];
      a[pivotRow] = temp;
    }

    const pivot = a[rank][col];
    for (let r = 0; r < rows; r++) {
      if (r !== rank && !isZero(a[r][col], span)) {
        const factor = divValues(a[r][col], pivot, span);
        for (let c = col; c < cols; c++) {
          a[r][c] = subValues(a[r][c], mulValues(factor, a[rank][c], span), span);
        }
      }
    }
    rank++;
  }
  return { type: 'rational', n: BigInt(rank), d: 1n };
}

export function matrixEigenvalues(m: MatrixValue, span?: Span): Value {
  if (m.rows !== m.cols) {
    throw createError(`Eigenvalues require a square matrix, got ${m.rows}x${m.cols}`, span ?? { start: 0, end: 0, line: 1, col: 1 });
  }
  if (m.rows === 1) {
    return { type: 'list', elements: [m.data[0][0]] };
  }
  if (m.rows === 2) {
    // Characteristic polynomial: λ^2 - tr(A)λ + det(A) = 0
    const tr = valueToNumber(matrixTrace(m, span), span);
    const det = valueToNumber(matrixDet(m, span), span);
    const disc = tr * tr - 4 * det;
    if (disc >= 0) {
      const sqrtDisc = Math.sqrt(disc);
      const l1 = (tr + sqrtDisc) / 2;
      const l2 = (tr - sqrtDisc) / 2;
      return {
        type: 'list',
        elements: [
          { type: 'float', value: l1 },
          { type: 'float', value: l2 },
        ],
      };
    }
    // Complex eigenvalues -> return unknown(requires-unavailable-theory)
    return makeUnknown('requires-unavailable-theory', 'Complex eigenvalues require complex number field (C)');
  }

  // QR algorithm for nxn matrices with convergence check
  let a: number[][] = m.data.map(row => row.map(v => valueToNumber(v, span)));
  const n = m.rows;
  let converged = false;

  for (let iter = 0; iter < 100; iter++) {
    // Gram-Schmidt QR decomposition
    const Q: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    const R: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

    for (let j = 0; j < n; j++) {
      let v: number[] = a.map(row => row[j]);
      for (let i = 0; i < j; i++) {
        let dot = 0;
        for (let k = 0; k < n; k++) dot += Q[k][i] * a[k][j];
        R[i][j] = dot;
        for (let k = 0; k < n; k++) v[k] -= dot * Q[k][i];
      }
      let norm = Math.hypot(...v);
      R[j][j] = norm;
      if (norm > 1e-12) {
        for (let k = 0; k < n; k++) Q[k][j] = v[k] / norm;
      }
    }

    // A_next = R * Q
    const aNext: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        let sum = 0;
        for (let k = 0; k < n; k++) sum += R[r][k] * Q[k][c];
        aNext[r][c] = sum;
      }
    }

    // Check convergence: sum of lower triangular elements < 1e-9
    let lowerNorm = 0;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < r; c++) {
        lowerNorm += Math.abs(aNext[r][c]);
      }
    }
    a = aNext;
    if (lowerNorm < 1e-9) {
      converged = true;
      break;
    }
  }

  if (!converged) {
    return makeUnknown('no-convergence', 'QR eigenvalue iteration did not converge within 100 iterations');
  }

  const elements: Value[] = [];
  for (let i = 0; i < n; i++) {
    elements.push({ type: 'float', value: a[i][i] });
  }
  return { type: 'list', elements };
}

function isZero(val: Value, span?: Span): boolean {
  if (val.type === 'rational') return val.n === 0n;
  if (val.type === 'float') return Math.abs(val.value) < 1e-12;
  const n = valueToNumber(val, span);
  return Math.abs(n) < 1e-12;
}
