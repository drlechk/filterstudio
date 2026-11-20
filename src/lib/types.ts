export type Section = {
  id: string;
  kind: "R" | "L" | "C" | "LC";
  connection: "series" | "shunt";
  value: number;
  value2?: number;
  resonator?: "series" | "parallel";
  label?: string;
};
export type FilterFamily = "butterworth" | "chebyshev" | "chebyshev2" | "cauer" | "bessel" | "legendre" | "linkwitz-riley";
export type FilterResponse = "lowpass" | "highpass" | "bandpass" | "bandstop";
export type CauerVariant = 'b' | 'c';
export type FilterSettings = {
  /** Even-order elliptic class; absent selects equal-termination class C. */
  cauerVariant?: CauerVariant;
  family: FilterFamily;
  response: FilterResponse;
  /** First ladder branch; omitted in legacy files to retain the family's original topology. */
  ladderStart?: Section["connection"];
  order: number;
  cutoff: number;
  bandwidth?: number;
  impedance: number;
  /** Actual resistive load in ohms; omitted uses the prototype termination. */
  loadImpedance?: number;
  ripple: number;
  attenuation: number;
};
export type CircuitNode = {
  id: string;
  x: number;
  y: number;
  section?: Section;
  port?: "input" | "output";
};
export type CircuitWire = { id: string; source: string; target: string };
export type ToleranceSpec = {
  response: FilterResponse;
  passband: number[];
  stopband: number[];
  passbandLoss: number;
  stopbandLoss: number;
};
export type ComponentPrecision = number | "full";
export type WdfSettings = {
  sampleRate: number;
  rootId?: string;
  /** Single match frequency in Hz, strictly below Nyquist; omitted disables prewarping. */
  prewarpFrequency?: number;
};
export type Project = {
  version: 1;
  name: string;
  settings: FilterSettings;
  nodes: CircuitNode[];
  wires: CircuitWire[];
  z2: number;
  tolerance?: ToleranceSpec;
  /** Significant digits for component labels; omitted in legacy projects (4). */
  componentPrecision?: ComponentPrecision;
  /** WDF discretization and preferred root adaptor; absent in analog-only files. */
  wdf?: WdfSettings;
  sweep: { min: number; max: number; points: number };
};
