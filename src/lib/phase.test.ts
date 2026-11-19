import { describe, expect, it } from 'vitest';
import { phaseAxis, phaseValues, unwrapPhase, validPhase } from './phase';

describe('phase unwrapping', () => {
  it('recovers the analytic phase of eight cascaded first-order lowpasses over multiple turns', () => {
    const expected = Array.from({ length: 1001 }, (_, i) => -8 * Math.atan(10 ** (-3 + 6 * i / 1000)) * 180 / Math.PI);
    const wrapped = expected.map(degrees => validPhase({ re: Math.cos(degrees * Math.PI / 180), im: Math.sin(degrees * Math.PI / 180) }));
    const result = unwrapPhase(wrapped);
    result.forEach((degrees, i) => expect(degrees).toBeCloseTo(expected[i], 10));
    expect(result.at(-1)).toBeLessThan(-719);
    expect(phaseValues(wrapped, 'wrapped')).toEqual(wrapped);
  });

  it('unwraps both directions and preserves exact half turns', () => {
    expect(unwrapPhase([170, -170, -90, 0, 90, 170, -170])).toEqual([170, 190, 270, 360, 450, 530, 550]);
    expect(unwrapPhase([-170, 170, 90, 0, -90, -170, 170])).toEqual([-170, -190, -270, -360, -450, -530, -550]);
    expect(unwrapPhase([0, 180, 0, -180, 0])).toEqual([0, 180, 0, -180, 0]);
  });

  it('restarts after zeros or invalid samples without inventing continuity', () => {
    expect(validPhase({ re: 0, im: 0 })).toBeNull();
    expect(validPhase({ re: NaN, im: 1 })).toBeNull();
    expect(validPhase(undefined)).toBeNull();
    expect(unwrapPhase([170, -170, null, -170, 170, NaN, 170, -170, Infinity, 0]))
      .toEqual([170, 190, null, -170, -190, null, 170, 190, null, 0]);
    expect(unwrapPhase([])).toEqual([]);
  });

  it('keeps full turns visible with bounded tick counts and a usable empty axis', () => {
    const values = [-2879, null, 721];
    const axis = phaseAxis(values, 'unwrapped');
    expect(axis.lower).toBeLessThanOrEqual(-2879);
    expect(axis.upper).toBeGreaterThanOrEqual(721);
    expect(axis.ticks.length).toBeLessThanOrEqual(8);
    expect(phaseAxis(values, 'wrapped')).toEqual({ lower: -180, upper: 180, ticks: [-180, -90, 0, 90, 180] });
    for (const values of [[], [null], [0], [NaN]]) {
      const { lower, upper } = phaseAxis(values, 'unwrapped');
      expect(upper).toBeGreaterThan(lower);
    }
  });
});
