import { ellipticPrototype } from "./synthesis";
import type { FilterFamily, FilterSettings } from "./types";

/** Only explicitly sourced entries belong here. A valid naming convention alone
 * is not evidence that a particular catalog entry exists. Never construct codes
 * from settings or round arbitrary values to a nearby published entry.
 */
export type CatalogReference = {
  family: FilterFamily;
  /** Verbatim published designation; null if the source only gives a table row. */
  code: string | null;
  order: number;
  ripple?: number;
  reflectionPercent?: number;
  modularAngle?: number;
  sourceTitle: string;
  sourceUrl: string;
  location: [string, string];
};

export const catalogSources = {
  zverev: "https://www.wiley-vch.de/en/?isbn=978-0-471-74942-4&option=com_eshop&view=product",
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


/** Verified against the cited sources on 2026-11-09. This is a deliberately
 * bounded collection, not a claim of complete coverage of any handbook.
 * LibreTexts Table 1 explicitly contains n=2…9; Table 2 contains each of the
 * listed ripple columns for n=3,5,7. These rows do NOT print B/C catalog codes.
 * Zverev explicitly names the two CC codes in the text on pp. 144–145.
 */
export const verifiedCatalogReferences: readonly CatalogReference[] = [
  ...[2, 3, 4, 5, 6, 7, 8, 9].map(order => ({
    family: "butterworth" as const, code: null, order,
    sourceTitle: "LibreTexts · Butterworth and Chebyshev Filters",
    sourceUrl: catalogSources.lcTables,
    location: [`Tabelle 1, Spalte n = ${order}`, `Table 1, column n = ${order}`] as [string, string],
  })),
  ...[3, 5, 7].flatMap(order => [0.1, 0.2, 1, 3].map(ripple => ({
    family: "chebyshev" as const, code: null, order, ripple,
    sourceTitle: "LibreTexts · Butterworth and Chebyshev Filters",
    sourceUrl: catalogSources.lcTables,
    location: [`Tabelle 2, n = ${order}, Ripple = ${ripple} dB`, `Table 2, n = ${order}, ripple = ${ripple} dB`] as [string, string],
  }))),
  {
    family: "cauer", code: "CC 03 20 30", order: 3, reflectionPercent: 20, modularAngle: 30,
    sourceTitle: "A. I. Zverev · Handbook of Filter Synthesis (1967)",
    sourceUrl: "https://djvu.online/file/psqt9VKt94sk0#:~:text=CC%2003%2020%2030",
    location: ["S. 144, Text zu Abb. 5.6", "p. 144, discussion of Fig. 5.6"],
  },
  {
    family: "cauer", code: "CC 05 20 30", order: 5, reflectionPercent: 20, modularAngle: 30,
    sourceTitle: "A. I. Zverev · Handbook of Filter Synthesis (1967)",
    sourceUrl: "https://djvu.online/file/psqt9VKt94sk0#:~:text=CC%2005%2020%2030",
    location: ["S. 144–145, Text zu Abb. 5.7", "pp. 144–145, discussion of Fig. 5.7"],
  },
];

/** Numerical equality tolerance only; never a nearest-table-entry search.
 * Frequencies and impedances are excluded because the reference describes the
 * normalized low-pass prototype, including for high-pass/band transformations.
 */
export function catalogReference(settings: FilterSettings): CatalogReference | null {
  const candidates = verifiedCatalogReferences.filter(entry =>
    entry.family === settings.family && entry.order === settings.order);
  if (!candidates.length) return null;
  if (settings.family === "butterworth") return candidates[0];
  if (!Number.isFinite(settings.ripple) || settings.ripple <= 0) return null;
  if (settings.family === "chebyshev")
    return candidates.find(entry => Math.abs(entry.ripple! - settings.ripple) <= 1e-10) ?? null;
  if (!Number.isFinite(settings.attenuation) || settings.attenuation <= settings.ripple) return null;
  const reflectionPercent = 100 * Math.sqrt(-Math.expm1(-settings.ripple * Math.LN10 / 10));
  const stopbandRatio = ellipticPrototype(settings.order, settings.ripple, settings.attenuation).stopbandRatio;
  const modularAngle = Math.asin(1 / stopbandRatio) * 180 / Math.PI;
  if (!Number.isFinite(modularAngle)) return null;
  return candidates.find(entry => Math.abs(entry.reflectionPercent! - reflectionPercent) <= 1e-8 &&
    Math.abs(entry.modularAngle! - modularAngle) <= 1e-8) ?? null;
}
