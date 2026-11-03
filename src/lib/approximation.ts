import {
  polyAdd,
  polyMultiply,
  polynomialLatex,
  polyScale,
  type Polynomial,
} from "./network";
import { ellipticPrototype } from "./synthesis";
import type { FilterSettings } from "./types";

export type FilterApproximation = {
  numerator: Polynomial;
  denominator: Polynomial;
  epsilon: number;
  stopbandRatio?: number;
  latex: { characteristic: string; response: string; mapping: string };
};

/** Chebyshev polynomials of the first kind, in ascending powers of real Ω. */
export function chebyshevPolynomial(order: number): Polynomial {
  let previous = [1],
    current = [0, 1];
  if (order === 0) return previous;
  for (let n = 2; n <= order; n++) {
    const next = polyAdd(
      polyMultiply([0, 2], current),
      polyScale(previous, -1),
    );
    previous = current;
    current = next;
  }
  return current;
}

const scalarLatex = (value: number) => polynomialLatex([value]);

/**
 * Classical characteristic functions: |S21,ref|² = 1 / (1 + ε² F_n(Ω)²).
 * This is the design reference, independent of edits to the actual circuit.
 * Cauer uses the odd elliptic rational function normalized to R_n(1)=1:
 * reflection roots sn(2jK/n,m), poles 1/(sqrt(m) sn(2jK/n,m)).
 * The existing prototype provides the poles and 1/sqrt(m), avoiding a second
 * elliptic-function implementation. See Wolfram's EllipticRationalR reference:
 * https://resources.wolframcloud.com/FunctionRepository/resources/EllipticRationalR/
 */
export function filterApproximation(
  settings: FilterSettings,
): FilterApproximation {
  const { family, order, ripple, attenuation, response, bandwidth, cutoff } =
    settings;
  let numerator: Polynomial = [],
    denominator: Polynomial = [1];
  let stopbandRatio: number | undefined;
  const epsilon =
    family === "butterworth"
      ? 1
      : Math.sqrt(Math.expm1((ripple * Math.LN10) / 10));
  let symbol: string;
  if (family === "butterworth") {
    numerator = [...Array<number>(order).fill(0), 1];
    symbol = `F_{${order}}(\\Omega)`;
  } else if (family === "chebyshev") {
    numerator = chebyshevPolynomial(order);
    symbol = `F_{${order}}(\\Omega)=T_{${order}}(\\Omega)`;
  } else {
    const prototype = ellipticPrototype(order, ripple, attenuation);
    stopbandRatio = prototype.stopbandRatio;
    numerator = [0, 1];
    let normalization = 1;
    for (const pole of prototype.zeros) {
      const root = stopbandRatio / pole;
      numerator = polyMultiply(numerator, [-root * root, 0, 1]);
      denominator = polyMultiply(denominator, [1, 0, -1 / (pole * pole)]);
      // Evaluate the normalization in factored form: expanded high-order
      // polynomials lose precision when their alternating terms nearly cancel.
      normalization *= ((1 - 1 / pole) * (1 + 1 / pole)) / ((1 - root) * (1 + root));
    }
    numerator = polyScale(numerator, normalization);
    symbol = `F_{${order}}(\\Omega)=R_{${order}}(\\Omega)`;
  }
  const expression =
    denominator.length === 1
      ? polynomialLatex(numerator, "\\Omega")
      : `\\frac{${polynomialLatex(numerator, "\\Omega")}}{${polynomialLatex(denominator, "\\Omega")}}`;
  const recurrence =
    family === "chebyshev"
      ? "\\\\ T_0(\\Omega)=1,\\quad T_1(\\Omega)=\\Omega,\\quad T_{k+1}(\\Omega)=2\\Omega T_k(\\Omega)-T_{k-1}(\\Omega)"
      : "";
  const parameter =
    family === "butterworth"
      ? "\\epsilon=1"
      : `\\epsilon=\\sqrt{10^{R_p/10}-1}\\approx ${scalarLatex(epsilon)},\\quad R_p=${scalarLatex(ripple)}\\,\\mathrm{dB}${family === "cauer" ? `,\\quad R_s=${scalarLatex(attenuation)}\\,\\mathrm{dB}` : ""}`;
  const transforms = {
    lowpass: ["q=p", "\\Omega=x"],
    highpass: ["q=\\frac{1}{p}", "\\Omega=-\\frac{1}{x}"],
    bandpass: ["q=\\frac{p^2+1}{bp}", "\\Omega=\\frac{x^2-1}{bx}"],
    bandstop: ["q=\\frac{bp}{p^2+1}", "\\Omega=\\frac{bx}{1-x^2}"],
  }[response];
  const band = response === "bandpass" || response === "bandstop";
  return {
    numerator,
    denominator,
    epsilon,
    stopbandRatio,
    latex: {
      characteristic: `\\begin{gathered}${symbol}=${expression}${recurrence}\\end{gathered}`,
      response: `\\begin{gathered}G_{\\mathrm{ideal}}(\\Omega)=\\begin{cases}1,&|\\Omega|<1\\\\0,&|\\Omega|>1\\end{cases}\\qquad G_{\\mathrm{ref}}(\\Omega)=|S_{21,\\mathrm{ref}}|^2=\\frac{1}{1+\\epsilon^2 F_{${order}}^2(\\Omega)}\\\\${parameter}\\end{gathered}`,
      mapping: `\\begin{gathered}x=\\frac{f}{f_0},\\quad p=\\frac{s}{2\\pi f_0}=jx,\\quad q=j\\Omega\\\\${transforms[0]},\\qquad ${transforms[1]}${band ? `,\\qquad b=\\frac{B}{f_0}=${scalarLatex(bandwidth! / cutoff)}` : ""}\\end{gathered}`,
    },
  };
}
