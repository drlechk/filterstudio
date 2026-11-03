/** Display units only; frequencies in projects and API requests always use Hz. */
export const frequencyUnits = [
  { symbol: "Hz", scale: 1 },
  { symbol: "kHz", scale: 1e3 },
  { symbol: "MHz", scale: 1e6 },
  { symbol: "GHz", scale: 1e9 },
] as const;
export type FrequencyUnit = (typeof frequencyUnits)[number]["symbol"];
export const frequencyUnitScale = (unit: FrequencyUnit): number =>
  frequencyUnits.find(candidate => candidate.symbol === unit)!.scale;
export const isFrequencyUnit = (value: string): value is FrequencyUnit =>
  frequencyUnits.some(candidate => candidate.symbol === value);
