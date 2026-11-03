import { describe, expect, it } from "vitest";
import katex from "katex";
import { renderToStaticMarkup } from "react-dom/server";
import { analyzeNetwork, rationalLatex } from "./network";
import type { Section } from "./types";
import { PreferencesProvider } from "./preferences";
import { SectionMatrixView } from "../components/SectionMatrixView";

const prototypes = [
  { kind: "R", value: 2, z: { re: 2, im: 0 }, y: { re: .5, im: 0 }, impedance: "R_{1}", admittance: "\\frac{1}{R_{1}}", title: "Resistor" },
  { kind: "L", value: 2, z: { re: 0, im: 2 }, y: { re: 0, im: -.5 }, impedance: "s\\,L_{1}", admittance: "\\frac{1}{s\\,L_{1}}", title: "Inductor" },
  { kind: "C", value: .25, z: { re: 0, im: -4 }, y: { re: 0, im: .25 }, impedance: "\\frac{1}{s\\,C_{1}}", admittance: "s\\,C_{1}", title: "Capacitor" },
  { kind: "LC", resonator: "series", value: 2, value2: .25, z: { re: 0, im: -2 }, y: { re: 0, im: .5 }, impedance: "s\\,L_{1}+\\frac{1}{s\\,C_{1}}", admittance: "\\frac{s\\,C_{1}}{1+s^2\\,L_{1}\\,C_{1}}", title: "Series LC resonator" },
  { kind: "LC", resonator: "parallel", value: 2, value2: .25, z: { re: 0, im: 4 }, y: { re: 0, im: -.25 }, impedance: "\\frac{s\\,L_{1}}{1+s^2\\,L_{1}\\,C_{1}}", admittance: "\\frac{1}{s\\,L_{1}}+s\\,C_{1}", title: "Parallel LC resonator" },
] as const;
const cases = prototypes.flatMap(prototype => (["series", "shunt"] as const).map(connection => ({ ...prototype, connection })));

describe("component-to-chain-matrix explanations", () => {
  it.each(cases)("explains $title in a $connection branch using the computed matrix entry", item => {
    const section: Section = { ...item, id: "component", label: "Custom component" };
    const fRef = 1 / (2 * Math.PI); // ω0 = 1 rad/s; analytic impedances above use s=j.
    const analysis = analyzeNetwork([section], { fRef, z1: 50 });
    const latex = analysis.latex.sections[0];
    const shunt = section.connection === "shunt", symbol = shunt ? "Y_{1}" : "Z_{1}";
    const entry = shunt ? analysis.abcd.C : analysis.abcd.B;
    const expected = shunt ? item.y : item.z;
    const numeric = analysis.evaluate(fRef).abcd[shunt ? "C" : "B"];
    expect(numeric.re).toBeCloseTo(expected.re, 12);
    expect(numeric.im).toBeCloseTo(expected.im, 12);
    expect(latex).toContain(`Z_{1}(s)=${item.impedance}`);
    if (shunt) expect(latex).toContain(`Y_{1}(s)=\\frac{1}{Z_{1}(s)}=${item.admittance}`);
    expect(latex).toContain("s=\\omega_0 p");
    expect(latex).toContain(`f_0=${fRef}`);
    if (item.kind !== "R") expect(latex).toContain(`2\\pi\\cdot ${fRef}`);
    expect(latex).toContain(`\\approx\\left(${rationalLatex(entry)}\\right)\\,${shunt ? "\\mathrm{S}" : "\\Omega"}`);
    expect(latex).toContain(shunt ? `\\begin{pmatrix}1&0\\\\${symbol}(p)&1\\end{pmatrix}` : `\\begin{pmatrix}1&${symbol}(p)\\\\0&1\\end{pmatrix}`);
    expect(() => katex.renderToString(latex, { throwOnError: true, strict: "error", displayMode: true })).not.toThrow();
    const markup = renderToStaticMarkup(<PreferencesProvider><SectionMatrixView section={section} index={1} derivation={analysis.sectionDerivations[0]} /></PreferencesProvider>);
    expect(markup).toContain(item.title);
    expect(markup).toContain("Custom component");
    expect(markup).toContain(shunt ? "C = Y(p) = 1/Z(p)" : "B = Z(p)");
    expect(markup).toContain("Values used:");
    if (item.kind === "LC") {
      expect(markup).toContain(item.resonator === "parallel" ? "internally in parallel" : "internally in series");
      expect(latex).toContain("L_{1}=2\\,\\mathrm{H}");
      expect(latex).toContain("C_{1}=0.25\\,\\mathrm{F}");
    }
    expect(markup).not.toContain("katex-error");
  });

  it("preserves the complete stored value and updates the substitution after a component edit", () => {
    const component: Section = { id: "C", kind: "C", connection: "shunt", value: 5.123456789012345e-9 };
    const analyze = (section: Section) => analyzeNetwork([section], { fRef: 1e6, z1: 50 });
    const first = analyze(component);
    expect(first.latex.sections[0]).toContain("C_{1}=5.123456789012345\\cdot 10^{-9}\\,\\mathrm{F}");
    expect(first.latex.sections[0]).toContain("\\left(5.123456789012345\\cdot 10^{-9}\\right)");
    const updated = analyze({ ...component, value: 1e-9 });
    expect(updated.latex.sections[0]).toContain("C_{1}=1\\cdot 10^{-9}\\,\\mathrm{F}");
    expect(updated.latex.sections[0]).not.toContain("5.123456789012345");
    expect(updated.abcd.C.num[1]).toBeCloseTo(2 * Math.PI * 1e6 * 1e-9, 12);
  });

  it("uses the signal-path matrix index instead of injecting user labels into LaTeX", () => {
    const components: Section[] = [
      { id: "first", kind: "L", connection: "series", value: 1e-6, label: "Arbitrary name" },
      { id: "second", kind: "C", connection: "shunt", value: 1e-9, label: "<b>Label</b>" },
    ];
    const analysis = analyzeNetwork(components, { fRef: 1e6, z1: 50 });
    expect(analysis.latex.sections[1]).toContain("C_{2}=");
    expect(analysis.latex.sections[1]).toContain("\\mathbf{M}_{2}(p)");
    expect(analysis.latex.sections[1]).not.toContain("Label");
    const markup = renderToStaticMarkup(<PreferencesProvider><SectionMatrixView section={components[1]} index={2} derivation={analysis.sectionDerivations[1]} /></PreferencesProvider>);
    expect(markup).toContain("&lt;b&gt;Label&lt;/b&gt;");
    expect(markup).not.toContain("<b>Label</b>");
  });
});
