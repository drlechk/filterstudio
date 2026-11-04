import { bandEdges, isBandResponse, MIN_RELATIVE_BANDWIDTH } from "./frequency";
import { ellipticK, ellipticPrototype } from "./synthesis";
import { CAUER_ORDERS, CHEBYSHEV_II_ORDERS, MAX_PROTOTYPE_ORDER, cauerMinimumAttenuation, chebyshevIIMinimumAttenuation } from "./filter-limits";
import type { FilterFamily, FilterSettings, ToleranceSpec } from "./types";

export const MIN_MASK_FREQUENCY = 1;
export const MAX_MASK_FREQUENCY = 1e12;
export type Edge = {
  band: "passband" | "stopband";
  index: number;
  frequency: number;
  symbol: string;
};
export type ToleranceIssue = "frequencies" | "attenuation" | "order" | "range";
export type ToleranceDesign = {
  settings: FilterSettings | null;
  minimumOrder: number | null;
  stopbandRatio: number | null;
  issue: ToleranceIssue | null;
};

export function toleranceEdges(spec: ToleranceSpec): Edge[] {
  const band = isBandResponse(spec.response);
  return (["passband", "stopband"] as const)
    .flatMap((key) =>
      spec[key].map((frequency, index) => ({
        band: key,
        index,
        frequency,
        symbol: `${key === "passband" ? "fₚ" : "fₛ"}${band ? (index === 0 ? "₁" : "₂") : ""}`,
      })),
    )
    .sort((a, b) => a.frequency - b.frequency);
}

export function validateTolerance(spec: ToleranceSpec): ToleranceIssue | null {
  const count = isBandResponse(spec.response) ? 2 : 1;
  if (
    !["lowpass", "highpass", "bandpass", "bandstop"].includes(spec.response) ||
    spec.passband.length !== count ||
    spec.stopband.length !== count ||
    [...spec.passband, ...spec.stopband].some(
      (f) =>
        !Number.isFinite(f) || f < MIN_MASK_FREQUENCY || f > MAX_MASK_FREQUENCY,
    )
  )
    return "frequencies";
  const p = spec.passband,
    s = spec.stopband;
  const ordered =
    spec.response === "lowpass"
      ? p[0] < s[0]
      : spec.response === "highpass"
        ? s[0] < p[0]
        : spec.response === "bandpass"
          ? s[0] < p[0] && p[0] < p[1] && p[1] < s[1]
          : p[0] < s[0] && s[0] < s[1] && s[1] < p[1];
  if (!ordered) return "frequencies";
  if (
    !Number.isFinite(spec.passbandLoss) ||
    spec.passbandLoss < 0.1 ||
    spec.passbandLoss > 3 ||
    !Number.isFinite(spec.stopbandLoss) ||
    spec.stopbandLoss < 20 ||
    spec.stopbandLoss > 80
  )
    return "attenuation";
  return null;
}

export function defaultTolerance(settings: FilterSettings): ToleranceSpec {
  // Keep a fresh mask within the editable range even for projects at its limits.
  const center = Math.max(4, Math.min(2e11, settings.cutoff));
  const edges = isBandResponse(settings.response)
    ? bandEdges({ cutoff: center, bandwidth: settings.bandwidth ?? center / 2 })
    : null;
  let passband = [center],
    stopband = [settings.response === "highpass" ? center / 2 : center * 2];
  if (edges) {
    passband =
      settings.response === "bandpass"
        ? [edges.lower, edges.upper]
        : [center / 2, center * 2];
    stopband =
      settings.response === "bandpass"
        ? [edges.lower / 2, edges.upper * 2]
        : [edges.lower, edges.upper];
  }
  const result = {
    response: settings.response,
    passband,
    stopband,
    passbandLoss: settings.ripple,
    stopbandLoss: settings.attenuation,
  };
  if (validateTolerance(result))
    return {
      response: settings.response,
      passband: isBandResponse(settings.response)
        ? settings.response === "bandpass"
          ? [0.8e6, 1.2e6]
          : [0.5e6, 2e6]
        : [1e6],
      stopband: isBandResponse(settings.response)
        ? settings.response === "bandpass"
          ? [0.4e6, 2.4e6]
          : [0.8e6, 1.2e6]
        : [settings.response === "highpass" ? 0.5e6 : 2e6],
      passbandLoss: 0.5,
      stopbandLoss: 40,
    };
  return result;
}

export function moveToleranceEdge(
  spec: ToleranceSpec,
  band: Edge["band"],
  index: number,
  frequency: number,
): ToleranceSpec {
  if (!Number.isFinite(frequency)) return spec;
  const edges = toleranceEdges(spec),
    position = edges.findIndex((e) => e.band === band && e.index === index);
  if (position < 0) return spec;
  const min = position
    ? edges[position - 1].frequency * (1 + 1e-6)
    : MIN_MASK_FREQUENCY;
  const max =
    position < edges.length - 1
      ? edges[position + 1].frequency / (1 + 1e-6)
      : MAX_MASK_FREQUENCY;
  if (min > max) return spec;
  const values = [...spec[band]];
  values[index] = Math.max(min, Math.min(max, frequency));
  return { ...spec, [band]: values };
}

/** Analog prototype order, with fixed passband edges for band transformations.
 * Definitions: scipy.signal.buttord / cheb1ord / ellipord (analog=True).
 * Butterworth uses the inferred 3 dB frequency, not the specified passband edge.
 */
export function designTolerance(
  spec: ToleranceSpec,
  family: FilterFamily,
  impedance: number,
): ToleranceDesign {
  const issue = validateTolerance(spec);
  if (issue)
    return { settings: null, minimumOrder: null, stopbandRatio: null, issue };
  const [p1, p2] = spec.passband,
    { response, passbandLoss: ap, stopbandLoss: as } = spec;
  const band = isBandResponse(response);
  const center = band ? Math.sqrt(p1 * p2) : p1;
  const width = band ? p2 - p1 : 0;
  const stopbandRatio = Math.min(
    ...spec.stopband.map((f) =>
      response === "lowpass"
        ? f / p1
        : response === "highpass"
          ? p1 / f
          : response === "bandpass"
            ? Math.abs((f * f - center * center) / (width * f))
            : Math.abs((width * f) / (center * center - f * f)),
    ),
  );
  const ep2 = Math.expm1((ap * Math.LN10) / 10),
    es2 = Math.expm1((as * Math.LN10) / 10);
  const ratio = es2 / ep2;
  const m = 1 / (stopbandRatio * stopbandRatio),
    m1 = ep2 / es2;
  const fractional =
    family === "butterworth"
      ? Math.log(ratio) / (2 * Math.log(stopbandRatio))
      : family === "chebyshev" || family === "chebyshev2"
        ? Math.acosh(Math.sqrt(ratio)) / Math.acosh(stopbandRatio)
        : (ellipticK(m) * ellipticK(1 - m1)) /
          (ellipticK(1 - m) * ellipticK(m1));
  const minimumOrder = Math.max(1, Math.ceil(fractional - 1e-10));
  let order = minimumOrder,
    attenuation = as;
  if (family === "cauer") {
    // Choose the smallest supported odd prototype satisfying the mask.
    order =
      CAUER_ORDERS.find((n) => {
        const rs = Math.max(cauerMinimumAttenuation(n), as);
        return (
          ellipticPrototype(n, ap, rs).stopbandRatio <=
          stopbandRatio * (1 + 1e-12)
        );
      }) ?? 0;
    if (order) attenuation = Math.max(cauerMinimumAttenuation(order), as);
  } else if (family === "chebyshev2") {
    order = CHEBYSHEV_II_ORDERS.find(n => {
      const rs = Math.max(chebyshevIIMinimumAttenuation(n), as);
      return Math.cosh(Math.acosh(Math.sqrt(Math.expm1(rs * Math.LN10 / 10) / ep2)) / n) <= stopbandRatio * (1 + 1e-12);
    }) ?? 0;
    if (order) attenuation = Math.max(chebyshevIIMinimumAttenuation(order), as);
  }
  if (!Number.isFinite(order) || order < 1 || order > MAX_PROTOTYPE_ORDER)
    return { settings: null, minimumOrder, stopbandRatio, issue: "order" };
  const scale =
    family === "butterworth" ? Math.exp(-Math.log(ep2) / (2 * order))
      : family === "chebyshev2" ? Math.cosh(Math.acosh(Math.sqrt(Math.expm1(attenuation * Math.LN10 / 10) / ep2)) / order) : 1;
  const cutoff =
    response === "lowpass"
      ? center * scale
      : response === "highpass"
        ? center / scale
        : center;
  const bandwidth =
    response === "bandpass"
      ? width * scale
      : response === "bandstop"
        ? width / scale
        : undefined;
  const settings: FilterSettings = {
    family,
    response,
    order,
    cutoff,
    impedance,
    ripple: ap,
    attenuation,
    ...(band ? { bandwidth } : {}),
  };
  let inRange = Number.isFinite(cutoff) && cutoff >= 1 && cutoff <= 1e12;
  if (band) {
    const edges = bandEdges(settings);
    inRange &&=
      bandwidth! <= 1e12 &&
      bandwidth! / cutoff >= MIN_RELATIVE_BANDWIDTH * (1 - 1e-12) &&
      edges.lower >= 1 &&
      edges.upper <= 1e12;
  }
  return {
    settings: inRange ? settings : null,
    minimumOrder,
    stopbandRatio,
    issue: inRange ? null : "range",
  };
}

export function toleranceRegions(
  spec: ToleranceSpec,
  min: number,
  max: number,
) {
  const [p1, p2] = spec.passband,
    [s1, s2] = spec.stopband;
  const passband: [number, number][] =
    spec.response === "lowpass"
      ? [[min, p1]]
      : spec.response === "highpass"
        ? [[p1, max]]
        : spec.response === "bandpass"
          ? [[p1, p2]]
          : [
              [min, p1],
              [p2, max],
            ];
  const stopband: [number, number][] =
    spec.response === "lowpass"
      ? [[s1, max]]
      : spec.response === "highpass"
        ? [[min, s1]]
        : spec.response === "bandpass"
          ? [
              [min, s1],
              [s2, max],
            ]
          : [[s1, s2]];
  return { passband, stopband };
}

export function parseTolerance(raw: unknown): ToleranceSpec {
  const value = raw as Partial<ToleranceSpec> | null;
  if (
    !value ||
    !Array.isArray(value.passband) ||
    !Array.isArray(value.stopband) ||
    typeof value.response !== "string" ||
    typeof value.passbandLoss !== "number" ||
    typeof value.stopbandLoss !== "number"
  )
    throw new Error("Ungültiges Toleranzschema in der Datei.");
  const spec: ToleranceSpec = {
    response: value.response,
    passband: [...value.passband],
    stopband: [...value.stopband],
    passbandLoss: value.passbandLoss,
    stopbandLoss: value.stopbandLoss,
  };
  if (validateTolerance(spec))
    throw new Error("Ungültiges Toleranzschema in der Datei.");
  return spec;
}
