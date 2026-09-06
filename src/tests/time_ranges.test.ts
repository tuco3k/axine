import { describe, it, expect } from 'vitest';
import { parse } from '../core/parser';
import { evaluate, createInitialEnvironment } from '../core/evaluator';
import { sampleSlice } from '../core/sampler';
import { SpaceValue } from '../core/types';

describe('Phase D: Time \\and Ranges (:time \\and Intervals)', () => {
  it('parses interval notation correctly for closed, open, half-open, \\and infinite intervals', () => {
    // 1. [0, 10]
    const s0 = parse('x \\in [0, 10]');
    expect(s0.type).toBe('SetOp');
    if (s0.type === 'SetOp') {
      expect(s0.op).toBe('in');
      expect((s0.right as any).kind).toBe('closed');
    }

    // 2. (0, 5)
    const s1 = parse('y \\in (0, 5)');
    expect(s1.type).toBe('SetOp');
    if (s1.type === 'SetOp') {
      expect(s1.op).toBe('in');
      expect((s1.right as any).kind).toBe('open');
    }

    // 3. [1, 20)
    const s2 = parse('z \\in [1, 20)');
    expect(s2.type).toBe('SetOp');
    if (s2.type === 'SetOp') {
      expect(s2.op).toBe('in');
      expect((s2.right as any).kind).toBe('right_open');
    }

    // 4. [0, \\inf)
    const s4 = parse('u \\in [0, \\inf)');
    expect(s4.type).toBe('SetOp');
    if (s4.type === 'SetOp') {
      expect(s4.op).toBe('in');
      expect((s4.right as any).isInfEnd).toBe(true);
    }
  });

  it('evaluates block containing :time \\in [0, 10] into Space \\with coordinateBounds \\and timeVariable', () => {
    const env = createInitialEnvironment();
    const src = `{\n  :time \\in [0, 10]\n  y = 3^:time + 4*:time\n}`;

    const { value } = evaluate(src, env);
    expect(value.type).toBe('space');

    const space = value as SpaceValue;
    expect(space.coordinateBounds).toBeDefined();
    expect(space.coordinateBounds?.['time'] || space.coordinateBounds?.[':time']).toEqual([0, 10]);
    expect(space.timeVariable).toBe('time');
    expect(space.coordinates).toContain('time');
    expect(space.coordinates).toContain('y');
  });

  it('measures scrubbing frame time for relation along :time \\axis (< 16.6ms)', () => {
    const env = createInitialEnvironment();
    const src = `{\n  :time \\in [0, 10]\n  y = 3^:time + 4*:time\n}`;

    const { value } = evaluate(src, env);
    const space = value as SpaceValue;
    expect(space.entities.length).toBeGreaterThan(0);

    const compiledFn = space.entities[0].compiledFn;
    expect(compiledFn).toBeDefined();

    // Simulate slider scrubbing across 100 frames along :time axis
    const frames = 100;
    const times: number[] = [];

    for (let i = 0; i < frames; i++) {
      const tVal = (i / (frames - 1)) * 10;
      const t0 = performance.now();
      const res = sampleSlice(
        compiledFn!,
        space.coordinates,
        ['y', 'time'],
        { time: tVal },
        { y: [-10, 100], time: [0, 10] },
        100
      );
      const elapsed = performance.now() - t0;
      times.push(elapsed);
      expect(res).toBeDefined();
    }

    const avgFrameTime = times.reduce((a, b) => a + b, 0) / frames;
    const maxFrameTime = Math.max(...times);

    console.log(`\n--- TIME AXIS SCRUB PERFORMANCE ---`);
    console.log(`• Average frame time: ${avgFrameTime.toFixed(3)} ms`);
    console.log(`• Max frame time: ${maxFrameTime.toFixed(3)} ms`);
    console.log(`• Target: < 16.6 ms (60 FPS)`);

    expect(avgFrameTime).toBeLessThan(16.6);
    expect(maxFrameTime).toBeLessThan(50.0);
  });
});
