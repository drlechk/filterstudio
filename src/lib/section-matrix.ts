import type { Section } from "./types";

/** Preserve the stored number's full decimal representation in the substitution. */
function numberLatex(value: number): string {
  const [mantissa, exponent] = String(value).split("e");
  return exponent === undefined ? mantissa : `${mantissa}\\cdot 10^{${Number(exponent)}}`;
}

type Symbols = { r: string; l: string; c: string; s: string; s2: string };

/** Z or Y of the complete block; the LC resonator's internal connection is independent. */
function immittanceFormula(section: Section, admittance: boolean, { r, l, c, s, s2 }: Symbols): string {
  const sl = `${s}\\,${l}`, sc = `${s}\\,${c}`;
  const resonance = `1+${s2}\\,${l}\\,${c}`;
  switch (section.kind) {
    case "R": return admittance ? `\\frac{1}{${r}}` : r;
    case "L": return admittance ? `\\frac{1}{${sl}}` : sl;
    case "C": return admittance ? sc : `\\frac{1}{${sc}}`;
    case "LC":
      if (section.resonator === "series") return admittance
        ? `\\frac{${sc}}{${resonance}}` : `${sl}+\\frac{1}{${sc}}`;
      return admittance ? `\\frac{1}{${sl}}+${sc}` : `\\frac{${sl}}{${resonance}}`;
  }
}

const matrix = (entry: string, shunt: boolean) => shunt
  ? `\\begin{pmatrix}1&0\\\\${entry}&1\\end{pmatrix}`
  : `\\begin{pmatrix}1&${entry}\\\\0&1\\end{pmatrix}`;

export type SectionMatrixDerivation = { latex: string; groups: string[][] };

/** Group related steps for a wrapping UI and a compact, copyable LaTeX derivation. */
export function sectionMatrixDerivation(section: Section, fRef: number, index: number, entry: string): SectionMatrixDerivation {
  const shunt = section.connection === "shunt";
  const r = `R_{${index}}`, l = `L_{${index}}`, c = `C_{${index}}`;
  const z = `Z_{${index}}`, quantity = `${shunt ? "Y" : "Z"}_{${index}}`;
  const unit = shunt ? "\\mathrm{S}" : "\\Omega";
  const values = section.kind === "LC"
    ? `${l}=${numberLatex(section.value)}\\,\\mathrm{H},\\qquad ${c}=${numberLatex(section.value2!)}\\,\\mathrm{F}`
    : `${section.kind === "R" ? r : section.kind === "L" ? l : c}=${numberLatex(section.value)}\\,${section.kind === "R" ? "\\Omega" : section.kind === "L" ? "\\mathrm{H}" : "\\mathrm{F}"}`;
  const symbols = { r, l, c, s: "s", s2: "s^2" };
  const normalized = { r, l, c, s: "\\omega_0 p", s2: "\\omega_0^2 p^2" };
  // All numeric substitutions use the SI values declared above, with s = 2π f0 p.
  const omega = `\\left(2\\pi\\cdot ${numberLatex(fRef)}\\right)`;
  const numeric = {
    r: numberLatex(section.value),
    l: `\\left(${numberLatex(section.value)}\\right)`,
    c: `\\left(${numberLatex(section.kind === "LC" ? section.value2! : section.value)}\\right)`,
    s: `${omega}p`, s2: `${omega}^2p^2`,
  };
  const groups = [
    [
      values,
      `f_0=${numberLatex(fRef)}\\,\\mathrm{Hz},\\qquad \\omega_0=2\\pi f_0,\\qquad s=\\omega_0 p`,
    ],
    [
      `${z}(s)=${immittanceFormula(section, false, symbols)}`,
      ...(shunt ? [`${quantity}(s)=\\frac{1}{${z}(s)}=${immittanceFormula(section, true, symbols)}`] : []),
      `${quantity}(p)=${immittanceFormula(section, shunt, normalized)}`,
    ],
    [
      `${quantity}(p)=\\left(${immittanceFormula(section, shunt, numeric)}\\right)\\,${unit}\\approx\\left(${entry}\\right)\\,${unit}`,
      `\\mathbf{M}_{${index}}(p)=${matrix(`${quantity}(p)`, shunt)}\\approx${matrix(entry, shunt)}`,
    ],
  ];
  return {
    groups,
    latex: `\\begin{gathered}${groups.map(group => group.join("\\qquad ")).join("\\\\[5pt]")}\\end{gathered}`,
  };
}
