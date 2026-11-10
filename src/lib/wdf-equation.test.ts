import { describe, expect, it } from 'vitest';
import katex from 'katex';
import { buildWdfEquation, numericWdfEquation, wdfNumberLatex, type WdfEquation } from './wdf-equation';
import { WdfExpressions, expressionLatex } from './wdf-expression';
import { buildWdf, createWdfProcessor, type WdfModel } from './wdf';
import { buildWdfSignalFlow, compactAdaptor, createSignalFlowProcessor } from './wdf-signal-flow';
import { createCircuit, defaultSettings } from './project';
import { synthesize } from './synthesis';
import type { FilterSettings, Section } from './types';

const circuit = (sections: Section[], z1 = 50, z2 = 75) => ({ settings: { ...defaultSettings, cutoff: 2000, impedance: z1 }, z2, ...createCircuit(sections) });
const mixed: Section[] = [
  { id: 'r', kind: 'R', connection: 'series', value: 25 },
  { id: 'l', kind: 'L', connection: 'series', value: .002 },
  { id: 'c', kind: 'C', connection: 'shunt', value: 1e-6 },
  { id: 'lc1', kind: 'LC', connection: 'shunt', resonator: 'series', value: .001, value2: 1e-6 },
  { id: 'lc2', kind: 'LC', connection: 'series', resonator: 'parallel', value: .002, value2: 2e-6 },
];

function verifyResidual(model: WdfModel, equation: WdfEquation, count = 96) {
  const processor = createSignalFlowProcessor(buildWdfSignalFlow(model));
  const x = Array.from({ length: count }, (_, i) => (i === 0 ? 1 : 0) + .2 * Math.sin(i * .93) + .1 * Math.cos(i * .217));
  const y = x.map(processor.process);
  for (let n = 0; n < count; n++) {
    const lhs = equation.denominator.map((a, k) => a * (y[n - k] ?? 0));
    const rhs = equation.numerator.map((b, k) => b * (x[n - k] ?? 0));
    const residual = lhs.reduce((a, b) => a + b, 0) - rhs.reduce((a, b) => a + b, 0);
    const bound = [...lhs, ...rhs].reduce((sum, term) => sum + Math.abs(term), 0);
    expect(Math.abs(residual)).toBeLessThan(2e-12 * Math.max(1e-15, bound));
  }
  if (equation.coefficients) {
    const lead = equation.coefficients.denominator[0].value;
    for (const key of ['numerator', 'denominator'] as const) equation.coefficients[key].forEach((c, i) => {
      expect(c.value / lead).toBeCloseTo(equation[key][i], 10);
    });
  }
}

describe('WDF input/output difference equation', () => {
  it('reproduces actual samples with the explicit direct-form equation, including the source/load voltage factor', () => {
    const model = buildWdf(circuit(mixed.slice(0, 3)), 48000), equation = buildWdfEquation(model);
    const processor = createWdfProcessor(model), inputs: number[] = [], outputs: number[] = [];
    for (let n = 0; n < 128; n++) {
      inputs.push(n === 0 ? 1 : .2 * Math.sin(n * .59));
      const output = equation.numerator.reduce((sum, b, k) => sum + b * (inputs[n - k] ?? 0), 0)
        - equation.denominator.slice(1).reduce((sum, a, k) => sum + a * (outputs[n - k - 1] ?? 0), 0);
      outputs.push(output);
      expect(output).toBeCloseTo(processor.process(inputs[n]), 11);
    }
  });

  it('matches the executable graph for every root, both resonators, resistors and sample-rate changes', () => {
    const p = circuit(mixed);
    for (const fs of [8000, 48000, 96000]) {
      const original = buildWdf(p, fs), baseline = buildWdfEquation(original);
      for (const root of original.adaptors) {
        const model = buildWdf(p, fs, root.id), equation = buildWdfEquation(model);
        verifyResidual(model, equation);
        equation.denominator.forEach((value, i) => expect(value).toBeCloseTo(baseline.denominator[i], 11));
        equation.numerator.forEach((value, i) => expect(value).toBeCloseTo(baseline.numerator[i], 12));
      }
    }
  });

  it.each(['butterworth', 'chebyshev', 'chebyshev2', 'cauer', 'bessel', 'legendre', 'linkwitz-riley'] as const)(
    'supports %s in both ladder orientations and all four responses', family => {
      for (const response of ['lowpass', 'highpass', 'bandpass', 'bandstop'] as const) for (const ladderStart of ['series', 'shunt'] as const) {
        const settings: FilterSettings = { ...defaultSettings, family, response, ladderStart, order: family === 'cauer' || family === 'chebyshev2' ? 3 : 4, cutoff: 2000, bandwidth: 1000 };
        const { sections, z2 } = synthesize(settings);
        const model = buildWdf({ ...createCircuit(sections), settings, z2 }, 48000);
        verifyResidual(model, buildWdfEquation(model));
      }
    },
  );

  it('handles direct and purely resistive networks without spurious delay terms', () => {
    for (const sections of [[], [mixed[0]], [{ ...mixed[0], connection: 'shunt' as const }]]) {
      const model = buildWdf(circuit(sections), 48000), equation = buildWdfEquation(model);
      expect(equation.order).toBe(0);
      expect(equation.denominator).toEqual([1]);
      expect(equation.numerator[0]).toBeCloseTo(createWdfProcessor(model).process(1), 14);
      expect(equation.symbolic.latex).not.toContain('[n-');
      verifyResidual(model, equation);
    }
  });

  it('cancels shared endpoint factors exactly, including the extra Cauer state', () => {
    const settings: FilterSettings = { ...defaultSettings, cutoff: 2000, family: 'cauer', order: 3 };
    const { sections, z2 } = synthesize(settings);
    const cauer = buildWdf({ ...createCircuit(sections), settings, z2 }, 48000);
    expect(cauer.elements.filter(e => e.kind === 'L' || e.kind === 'C')).toHaveLength(4);
    const equation = buildWdfEquation(cauer);
    expect(equation.order).toBe(3);
    verifyResidual(cauer, equation);
    for (const kind of ['L', 'C'] as const) for (const connection of ['series', 'shunt'] as const) {
      const model = buildWdf(circuit([
        { id: 'a', kind, connection, value: kind === 'L' ? .001 : 1e-6 },
        { id: 'b', kind, connection, value: kind === 'L' ? .002 : 2e-6 },
      ]), 48000);
      const combined = buildWdfEquation(model);
      expect(combined.order).toBe(1);
      verifyResidual(model, combined);
    }
  });

  it('uses exactly the retained local gamma names from the adaptor drawings, also after rerooting', () => {
    const p = circuit(mixed);
    for (const root of buildWdf(p, 48000).adaptors) {
      const model = buildWdf(p, 48000, root.id), equation = buildWdfEquation(model);
      const expected = model.adaptors.flatMap(a => compactAdaptor(a).multipliers.map((_, i) => `\\gamma_{${i + 1},\\mathrm{${a.label}}}`));
      const actual = [...new Set(equation.symbolic.latex.match(/\\gamma_\{\d+,\\mathrm\{[SP]\d+\}\}/g))];
      // Some source-side resistive adaptor coefficients cancel entirely.
      expect(actual.length).toBeGreaterThan(0);
      expect(actual.every(name => expected.includes(name))).toBe(true);
      for (const adaptor of model.adaptors) for (const port of adaptor.ports) {
        expect(equation.symbolic.latex).not.toContain(port.coefficient.toPrecision(10));
      }
      for (const formula of equation.symbolic.groups.flat()) expect(() => katex.renderToString(formula, { throwOnError: true })).not.toThrow();
    }
  });

  it('keeps a 200-delay filter finite and compact using exact polynomial groups', () => {
    const settings: FilterSettings = { ...defaultSettings, order: 100, response: 'bandpass', cutoff: 2000, bandwidth: 1000 };
    const { sections, z2 } = synthesize(settings);
    const p = { ...createCircuit(sections), settings, z2 };
    for (const root of ['adaptor:' + sections[0].id, 'resonator:' + sections.at(-1)!.id]) {
      const model = buildWdf(p, 48000, root), equation = buildWdfEquation(model);
      expect(equation.order).toBe(200);
      expect(equation.coefficients).toBeUndefined();
      expect([...equation.numerator, ...equation.denominator].every(Number.isFinite)).toBe(true);
      expect(equation.symbolic.latex.length).toBeLessThan(100000);
      expect(equation.symbolic.latex).toContain('[q^k]');
      verifyResidual(model, equation, 256);
      for (const formula of equation.symbolic.groups.flat()) expect(() => katex.renderToString(formula, { throwOnError: true, strict: false })).not.toThrow();
    }
  });

  it('rounds only the final equation to the configured significant digits and emits valid LaTeX', () => {
    const equation = buildWdfEquation(buildWdf(circuit(mixed.slice(1, 2)), 48000));
    const before = structuredClone(equation);
    expect(wdfNumberLatex(.123456789, 3, 'de')).toBe('0{,}123');
    expect(wdfNumberLatex(1.23456789e-14, 4)).toBe('1.235\\cdot 10^{-14}');
    expect(wdfNumberLatex(.123456789, 'full')).toBe('0.123456789');
    for (const precision of [1, 4, 15, 'full'] as const) for (const language of ['de', 'en'] as const) {
      const latex = numericWdfEquation(equation, precision, language).latex;
      expect(latex).not.toMatch(/NaN|Infinity/);
      expect(latex.includes('\\simeq')).toBe(precision !== 'full');
      expect(() => katex.renderToString(latex, { throwOnError: true })).not.toThrow();
    }
    expect(equation).toEqual(before);
    expect(numericWdfEquation(equation, 2).latex).not.toBe(numericWdfEquation(equation, 8).latex);
  });

  it('combines exact symbolic terms without treating small gamma values as zero', () => {
    const math = new WdfExpressions(), gamma = math.symbol('\\gamma_{1,\\mathrm{S1}}', 1e-30);
    const complement = math.add(math.constant(2), math.multiply(math.constant(-1), gamma));
    expect(expressionLatex(math.add(complement, gamma))).toBe('2');
    expect(expressionLatex(math.multiply(math.constant(.5), math.add(math.constant(2), math.multiply(math.constant(-2), gamma)))))
      .toContain('\\gamma_{1,\\mathrm{S1}}');
  });
});
