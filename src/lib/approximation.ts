import {
  polyAdd,
  polyMultiply,
  polynomialLatex,
  polyScale,
  type Polynomial,
} from "./network";
import { ellipticPrototype } from "./synthesis";
import { hasHalfPowerCutoff, isMonotonicFamily, monotonicPrototype } from "./monotonic";
import { linkwitzRileyPrototype } from "./linkwitz-riley";
import type { FilterSettings } from "./types";

export type FilterApproximation = {
  numerator: Polynomial;
  denominator: Polynomial;
  /** Whether numerator/denominator represents F or F². */
  characteristicPower: 1 | 2;
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
    hasHalfPowerCutoff(family) || family === "linkwitz-riley"
      ? 1
      : Math.sqrt(Math.expm1(((family === "chebyshev2" ? attenuation : ripple) * Math.LN10) / 10));
  let symbol: string;
  if (family === "linkwitz-riley") {
    linkwitzRileyPrototype(order); // Validate the even prototype order.
    numerator = Array<number>(2 * order + 1).fill(0);
    numerator[order] = 2; numerator[2 * order] = 1;
    symbol = `F_{${order}}^2(\\Omega)`;
  } else if (isMonotonicFamily(family)) {
    const prototype = monotonicPrototype(family, order);
    numerator = Array<number>(2 * order + 1).fill(0);
    prototype.loss.forEach((coefficient, i) => { numerator[2 * i] = coefficient; });
    symbol = `F_{${order}}^2(\\Omega)=${family === "bessel" ? "Q" : "L"}_{${order}}(\\Omega^2)`;
  } else if (family === "butterworth") {
    numerator = [...Array<number>(order).fill(0), 1];
    symbol = `F_{${order}}(\\Omega)`;
  } else if (family === "chebyshev") {
    numerator = chebyshevPolynomial(order);
    symbol = `F_{${order}}(\\Omega)=T_{${order}}(\\Omega)`;
  } else if (family === "chebyshev2") {
    numerator = [...Array<number>(order).fill(0), 1];
    denominator = chebyshevPolynomial(order).reverse();
    while (denominator.length > 1 && denominator.at(-1) === 0) denominator.pop();
    stopbandRatio = 1;
    symbol = `F_{${order}}(\\Omega)=\\frac{1}{T_{${order}}(1/\\Omega)}`;
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
  let recurrence =
    family === "chebyshev" || family === "chebyshev2"
      ? "\\\\ T_0(\\Omega)=1,\\quad T_1(\\Omega)=\\Omega,\\quad T_{k+1}(\\Omega)=2\\Omega T_k(\\Omega)-T_{k-1}(\\Omega)"
      : "";
  if (family === "bessel") {
    const alpha = monotonicPrototype(family, order).alpha;
    recurrence = `\\\\ H_{\\mathrm{ref}}(q)=\\frac{\\theta_{${order}}(0)}{\\theta_{${order}}(\\alpha_{${order}}q)},\\quad \\alpha_{${order}}\\approx ${scalarLatex(alpha)}`
      + `\\\\ \\theta_n(q)=\\sum_{k=0}^{n}\\frac{(2n-k)!}{2^{n-k}(n-k)!\\,k!}q^k,\\quad Q_n(\\Omega^2)=\\left|\\frac{\\theta_n(j\\alpha_n\\Omega)}{\\theta_n(0)}\\right|^2-1`;
  }
  if (family === "linkwitz-riley") {
    recurrence = `\\\\ H_{\\mathrm{ref}}(q)=\\left[H_{\\mathrm{Butterworth},${order / 2}}(q)\\right]^2,\\quad |H_{\\mathrm{ref}}(j\\Omega)|=\\frac{1}{1+\\Omega^{${order}}}`
      + `\\\\ 20\\log_{10}|H_{\\mathrm{ref}}(j)|=-20\\log_{10}2\\approx -6.0206\\,\\mathrm{dB}`;
  }
  const parameter =
    hasHalfPowerCutoff(family) || family === "linkwitz-riley"
      ? "\\epsilon=1"
      : family === "chebyshev2" ? `\\epsilon=\\sqrt{10^{R_s/10}-1}\\approx ${scalarLatex(epsilon)},\\quad R_s=${scalarLatex(attenuation)}\\,\\mathrm{dB}`
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
    characteristicPower: isMonotonicFamily(family) || family === "linkwitz-riley" ? 2 : 1,
    epsilon,
    stopbandRatio,
    latex: {
      characteristic: `\\begin{gathered}${symbol}=${expression}${recurrence}\\end{gathered}`,
      response: `\\begin{gathered}G_{\\mathrm{ideal}}(\\Omega)=\\begin{cases}1,&|\\Omega|<1\\\\0,&|\\Omega|>1\\end{cases}\\qquad G_{\\mathrm{ref}}(\\Omega)=|S_{21,\\mathrm{ref}}|^2=\\frac{1}{1+\\epsilon^2 F_{${order}}^2(\\Omega)}\\\\${parameter}\\end{gathered}`,
      mapping: `\\begin{gathered}x=\\frac{f}{f_0},\\quad p=\\frac{s}{2\\pi f_0}=jx,\\quad q=j\\Omega\\\\${transforms[0]},\\qquad ${transforms[1]}${band ? `,\\qquad b=\\frac{B}{f_0}=${scalarLatex(bandwidth! / cutoff)}` : ""}\\end{gathered}`,
    },
  };
}
