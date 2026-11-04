export type Section = {
  id: string;
  kind: "R" | "L" | "C" | "LC";
  connection: "series" | "shunt";
  value: number;
  value2?: number;
  resonator?: "series" | "parallel";
  label?: string;
};
export type FilterFamily = "butterworth" | "chebyshev" | "chebyshev2" | "cauer";
export type FilterResponse = "lowpass" | "highpass" | "bandpass" | "bandstop";
export type FilterSettings = {
  family: FilterFamily;
  response: FilterResponse;
  order: number;
  cutoff: number;
  bandwidth?: number;
  impedance: number;
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
  sweep: { min: number; max: number; points: number };
};
