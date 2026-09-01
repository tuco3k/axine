import { TrajectoryValue, TrajectorySample, Value } from '../types';
import { valueToNumber } from '../numeric/tower';
import { createError } from '../errors';

export function interpolateState(sA: Value, sB: Value, alpha: number): Value {
  if (alpha <= 0) return sA;
  if (alpha >= 1) return sB;

  // 1. Quantities
  if (sA.type === 'quantity' && sB.type === 'quantity') {
    if (sA.unit !== sB.unit) {
      throw createError(`Cannot interpolate between incompatible units: '${sA.unit}' and '${sB.unit}'`, {
        start: 0,
        end: 0,
        line: 1,
        col: 1,
      }, {
        expected: `consistent unit '${sA.unit}'`,
        suggestion: `Ensure state samples maintain uniform dimensional units`,
      });
    }
    const mag = interpolateState(sA.magnitude, sB.magnitude, alpha);
    return {
      type: 'quantity',
      magnitude: mag,
      unit: sA.unit,
      dimensions: { ...sA.dimensions },
    };
  }

  // 2. Rationals / Floats
  if ((sA.type === 'rational' || sA.type === 'float') && (sB.type === 'rational' || sB.type === 'float')) {
    const vA = valueToNumber(sA);
    const vB = valueToNumber(sB);
    const interpolated = vA + alpha * (vB - vA);
    return { type: 'float', value: interpolated };
  }

  // 3. Tuples / Vectors
  if (sA.type === 'tuple' && sB.type === 'tuple') {
    if (sA.elements.length !== sB.elements.length) return sA;
    const interpolatedElements = sA.elements.map((elA, idx) =>
      interpolateState(elA, sB.elements[idx], alpha)
    );
    return { type: 'tuple', elements: interpolatedElements };
  }

  // 4. Records
  if (sA.type === 'record' && sB.type === 'record') {
    if (sA.typeName !== sB.typeName) return sA;
    const fields: Record<string, Value> = {};
    for (const [k, vA] of Object.entries(sA.fields)) {
      const vB = sB.fields[k];
      if (vB !== undefined) {
        fields[k] = interpolateState(vA, vB, alpha);
      } else {
        fields[k] = vA;
      }
    }
    return { type: 'record', typeName: sA.typeName, fields };
  }

  // 5. Lists
  if (sA.type === 'list' && sB.type === 'list') {
    if (sA.elements.length !== sB.elements.length) return sA;
    const interpolatedElements = sA.elements.map((elA, idx) =>
      interpolateState(elA, sB.elements[idx], alpha)
    );
    return { type: 'list', elements: interpolatedElements };
  }

  // Fallback: discrete step
  return alpha < 0.5 ? sA : sB;
}

export function getTrajectoryStateAt(traj: TrajectoryValue, t: number): Value {
  const samples = traj.samples;
  if (!samples || samples.length === 0) {
    return { type: 'none' };
  }
  if (samples.length === 1 || t <= samples[0].t) {
    return samples[0].state;
  }
  if (t >= samples[samples.length - 1].t) {
    return samples[samples.length - 1].state;
  }

  // Binary search for interval
  let low = 0;
  let high = samples.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (samples[mid].t <= t && (mid === samples.length - 1 || samples[mid + 1].t > t)) {
      const sA = samples[mid];
      const sB = samples[mid + 1];
      if (!sB || sA.t === sB.t) return sA.state;
      const alpha = (t - sA.t) / (sB.t - sA.t);
      return interpolateState(sA.state, sB.state, alpha);
    } else if (samples[mid].t > t) {
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return samples[samples.length - 1].state;
}

export function mapTrajectory(
  traj: TrajectoryValue,
  fn: (state: Value) => Value
): TrajectoryValue {
  const mappedSamples: TrajectorySample[] = traj.samples.map(s => ({
    t: s.t,
    state: fn(s.state),
  }));

  const firstState = mappedSamples[0]?.state;
  let stateKind = 'Value';
  if (firstState) {
    if (firstState.type === 'record') stateKind = firstState.typeName;
    else if (firstState.type === 'tuple') stateKind = `Vector(${firstState.elements.length})`;
    else if (firstState.type === 'quantity') stateKind = `Quantity(${firstState.unit})`;
    else if (firstState.type === 'rational' || firstState.type === 'float') stateKind = 'Scalar';
  }

  return {
    type: 'trajectory',
    stateKind,
    tStart: traj.tStart,
    tEnd: traj.tEnd,
    samples: mappedSamples,
    sourceInfo: {
      source: traj.sourceInfo.source,
      integrator: traj.sourceInfo.integrator,
      dt: traj.sourceInfo.dt,
      errorEstimate: traj.sourceInfo.errorEstimate,
    },
    units: traj.units,
  };
}

export function exportTrajectory(traj: TrajectoryValue, format: 'csv' | 'json'): string {
  if (format === 'json') {
    return JSON.stringify({
      stateKind: traj.stateKind,
      tStart: traj.tStart,
      tEnd: traj.tEnd,
      sourceInfo: traj.sourceInfo,
      samples: traj.samples.map(s => ({
        t: s.t,
        state: serializeValueForExport(s.state),
      })),
    }, null, 2);
  }

  // CSV format
  const samples = traj.samples;
  if (samples.length === 0) return 't\n';

  const firstState = samples[0].state;
  let headers = ['t'];
  let extractRow: (t: number, s: Value) => (string | number)[] = (t, s) => [t, valueToNumber(s)];

  if (firstState.type === 'tuple') {
    headers = ['t', ...firstState.elements.map((_, i) => `x${i + 1}`)];
    extractRow = (t, s) => {
      if (s.type === 'tuple') return [t, ...s.elements.map(e => valueToNumber(e))];
      return [t, valueToNumber(s)];
    };
  } else if (firstState.type === 'record') {
    const fieldKeys = Object.keys(firstState.fields);
    headers = ['t', ...fieldKeys];
    extractRow = (t, s) => {
      if (s.type === 'record') return [t, ...fieldKeys.map(k => valueToNumber(s.fields[k] || { type: 'none' }))];
      return [t, valueToNumber(s)];
    };
  }

  const rows = [headers.join(',')];
  for (const s of samples) {
    rows.push(extractRow(s.t, s.state).join(','));
  }
  return rows.join('\n');
}

function serializeValueForExport(val: Value): any {
  if (!val) return null;
  switch (val.type) {
    case 'rational': return Number(val.n) / Number(val.d);
    case 'float': return val.value;
    case 'boolean': return val.value;
    case 'string': return val.value;
    case 'tuple': return val.elements.map(serializeValueForExport);
    case 'list': return val.elements.map(serializeValueForExport);
    case 'record': {
      const obj: Record<string, any> = { __type: val.typeName };
      for (const [k, v] of Object.entries(val.fields)) obj[k] = serializeValueForExport(v);
      return obj;
    }
    case 'quantity': return { magnitude: serializeValueForExport(val.magnitude), unit: val.unit };
    default: return valueToNumber(val);
  }
}
