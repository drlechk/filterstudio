import type { FilterResponse, FilterSettings } from "./types";

export const MIN_RELATIVE_BANDWIDTH = 0.001;
export const isBandResponse = (response: FilterResponse): boolean =>
  response === "bandpass" || response === "bandstop";
/** cutoff is the geometric center for a band filter; bandwidth is upper - lower. */
export function bandEdges(
  settings: Pick<FilterSettings, "cutoff" | "bandwidth">,
): { lower: number; upper: number } {
  const { cutoff, bandwidth } = settings;
  if (
    !(cutoff > 0) ||
    !Number.isFinite(cutoff) ||
    bandwidth === undefined ||
    !(bandwidth > 0) ||
    !Number.isFinite(bandwidth)
  )
    throw new Error(
      "Mittenfrequenz und Bandbreite müssen endlich und positiv sein.",
    );
  const upper = Math.hypot(cutoff, bandwidth / 2) + bandwidth / 2;
  // Avoid cancellation in the lower root for very wide bands.
  const lower = cutoff * (cutoff / upper);
  return { lower, upper };
}
export const filterDegree = (
  settings: Pick<FilterSettings, "response" | "order">,
): number => settings.order * (isBandResponse(settings.response) ? 2 : 1);
export const responseNames: Record<FilterResponse, string> = {
  lowpass: "Tiefpass",
  highpass: "Hochpass",
  bandpass: "Bandpass",
  bandstop: "Bandsperre",
};
