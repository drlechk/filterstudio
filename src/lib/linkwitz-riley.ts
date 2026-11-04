import prototypes from "./linkwitz-riley-prototypes.json";
import { LINKWITZ_RILEY_ORDERS } from "./filter-limits";

/** H(q) = 1 / B_(n/2)(q)^2, normalized to -6.0206 dB at |Ω| = 1.
 * Positive LC ladders with equal terminations, extracted at up to 500-digit precision.
 * The complete ladder realizes the squared transfer, including interstage loading.
 * Definition: https://www.linkwitzlab.com/crossovers.htm
 */
export function linkwitzRileyPrototype(order: number) {
  if (!LINKWITZ_RILEY_ORDERS.includes(order)) throw new Error("Linkwitz–Riley unterstützt gerade Grade von 2 bis 100.");
  return prototypes[order / 2 - 1];
}
