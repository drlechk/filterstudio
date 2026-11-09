import { ellipticPrototype } from "./synthesis";
import type { FilterFamily, FilterSettings } from "./types";

/** Zverev, Handbook of Filter Synthesis, ch. 5: B n, C n ρ, CC n ρ θ.
 * ρ is the maximum passband reflection in percent; θ = asin(1 / Ωs).
 * These are computed lookup coordinates, not verified entries in a printed table.
 * Alternative P/T/C notation: Kumar & Ahmad (2009), section 2.8, p. 18.
 */
export type CatalogReference = {
  code: string;
  alternative: string;
  order: number;
  reflectionPercent?: number;
  modularAngle?: number;
  stopbandRatio?: number;
  fractional: boolean;
};

const coordinate = (value: number) => {
  if (Math.abs(value - Math.round(value)) < 1e-8) return String(Math.round(value)).padStart(2, "0");
  return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
};

export function catalogReference(settings: FilterSettings): CatalogReference | null {
  const { family, order, ripple, attenuation } = settings;
  if (!["butterworth", "chebyshev", "cauer"].includes(family)) return null;
  if (!Number.isInteger(order) || order < 1) return null;
  const n = String(order).padStart(2, "0");
  if (family === "butterworth")
    return { code: `B ${n}`, alternative: `P ${n}`, order, fractional: false };
  if (!Number.isFinite(ripple) || ripple <= 0) return null;
  const reflectionPercent = 100 * Math.sqrt(-Math.expm1(-ripple * Math.LN10 / 10));
  let stopbandRatio: number | undefined, modularAngle: number | undefined;
  if (family === "cauer") {
    if (order < 3 || order % 2 === 0 || !Number.isFinite(attenuation) || attenuation <= ripple) return null;
    // Use the realized prototype, not the requested mask edge: rounding the order
    // up (or enforcing a ladder's minimum attenuation) changes its modular angle.
    stopbandRatio = ellipticPrototype(order, ripple, attenuation).stopbandRatio;
    if (!Number.isFinite(stopbandRatio) || stopbandRatio <= 1) return null;
    modularAngle = Math.asin(1 / stopbandRatio) * 180 / Math.PI;
  }
  const coordinates = `${n} ${coordinate(reflectionPercent)}${modularAngle === undefined ? "" : ` ${coordinate(modularAngle)}`}`;
  return {
    code: `${family === "cauer" ? "CC" : "C"} ${coordinates}`,
    alternative: `${family === "cauer" ? "C" : "T"} ${coordinates}`,
    order, reflectionPercent, modularAngle, stopbandRatio,
    fractional: [reflectionPercent, modularAngle].some(value => value !== undefined && Math.abs(value - Math.round(value)) >= 1e-8),
  };
}

export const catalogSources = {
  zverev: "https://www.wiley-vch.de/en/?isbn=978-0-471-74942-4&option=com_eshop&view=product",
  notation: "https://www.diva-portal.org/smash/get/diva2:274001/FULLTEXT01.pdf#page=30",
  lcTables: "https://eng.libretexts.org/Courses/Fontys_University_of_Applied_Sciences/Telecommunications/04:_Filters/4.07:_Butterworth_and_Chebyshev_Filters",
  poleTables: "https://www.analog.com/en/resources/app-notes/an-649.html",
  cauerNotation: "https://www.analog.com/media/en/training-seminars/design-handbooks/P2%20Ch5_final_PtA.pdf#page=26",
  cauerTables: "https://uodiyala.edu.iq/uploads/PDF%20ELIBRARY%20UODIYALA/EL46/Analog_and_Digital_Filter_Design_2E.pdf#page=120",
  inverseTables: "https://uodiyala.edu.iq/uploads/PDF%20ELIBRARY%20UODIYALA/EL46/Analog_and_Digital_Filter_Design_2E.pdf#page=75",
} as const;

export function catalogTableSource(family: FilterFamily): "lcTables" | "poleTables" | "cauerTables" | "inverseTables" | "zverev" | null {
  if (family === "butterworth" || family === "chebyshev") return "lcTables";
  if (family === "bessel") return "poleTables";
  if (family === "cauer") return "cauerTables";
  if (family === "chebyshev2") return "inverseTables";
  if (family === "linkwitz-riley") return null;
  return "zverev";
}
