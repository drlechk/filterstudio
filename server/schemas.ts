import { z } from "zod";
import { parseProject } from "../src/lib/project";
import { MAX_PROTOTYPE_ORDER, MAX_CIRCUIT_NODES } from "../src/lib/filter-limits";

export const idSchema = z.string().min(1).max(128);
export const digitsSchema = z.number().int().min(1).max(15);
export const precisionSchema = z.union([digitsSchema, z.literal("full")]);
const frequency = z.number().min(1).max(1e12);
const value = z.number().positive().max(1e15);
export const settingsSchema = z.object({
  family: z.enum(["butterworth", "chebyshev", "chebyshev2", "cauer", "bessel", "legendre"]),
  response: z.enum(["lowpass", "highpass", "bandpass", "bandstop"]),
  order: z.number().int().min(1).max(MAX_PROTOTYPE_ORDER).describe("Prototype order: 1–20 for Butterworth/Chebyshev I/Bessel/Legendre; odd 3–19 for Cauer (>= 40 dB at n >= 7); odd 1–11 for Chebyshev II (>= 30 dB at n=5, >= 60 dB at n=7/9, 80 dB at n=11). Band filters have order 2n."),
  cutoff: frequency.describe("Reference/center frequency in Hz. Butterworth/Bessel/Legendre use the half-power cutoff (-3.0103 dB). Chebyshev II uses the stopband edge at -attenuation dB; its bandwidth is measured between stopband edges."),
  bandwidth: z.number().positive().max(1e12).optional().describe("Required for band filters; at least 0.1% of cutoff. Band edges must be in 1 Hz–1 THz."),
  impedance: z.number().min(0.01).max(1e6).describe("Input reference impedance in ohms."),
  ripple: z.number().min(0.1).max(3).describe("Passband ripple in dB for Chebyshev I/Cauer; unused by other families in parameter synthesis."),
  attenuation: z.number().min(20).max(80).describe("Stopband attenuation in dB for Chebyshev II/Cauer; unused by other families in parameter synthesis."),
});
export const toleranceSchema = z.object({
  response: settingsSchema.shape.response,
  passband: z.array(frequency).min(1).max(2),
  stopband: z.array(frequency).min(1).max(2),
  passbandLoss: z.number().min(0.1).max(3),
  stopbandLoss: z.number().min(20).max(80),
});
export const sectionSchema = z.object({
  id: idSchema, kind: z.enum(["R", "L", "C", "LC"]),
  connection: z.enum(["series", "shunt"]),
  value: value.describe("R in ohms, L/LC in henries, C in farads."),
  value2: value.optional().describe("LC capacitance in farads; required for LC."),
  resonator: z.enum(["series", "parallel"]).optional(),
  label: z.string().max(40).optional(),
});
export const sweepSchema = z.object({ min: z.number().min(0.001).max(1e15), max: z.number().min(0.001).max(1e15), points: z.number().int().min(50).max(2001) });
export const projectSchema = z.object({
  version: z.literal(1), name: z.string().max(120), settings: settingsSchema,
  nodes: z.array(z.object({
    id: idSchema, x: z.number().min(-1e6).max(1e6), y: z.number().min(-1e6).max(1e6),
    section: sectionSchema.optional(), port: z.enum(["input", "output"]).optional(),
  })).min(2).max(MAX_CIRCUIT_NODES),
  wires: z.array(z.object({ id: idSchema, source: idSchema, target: idSchema })).max(MAX_CIRCUIT_NODES),
  z2: z.number().min(0.01).max(1e9), tolerance: toleranceSchema.optional(),
  componentPrecision: precisionSchema.optional(), sweep: sweepSchema,
}).superRefine((project, context) => {
  try { parseProject(project); }
  catch (error) { context.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Invalid project" }); }
});
export const tabSchema = z.object({
  id: idSchema, revision: z.number().int().nonnegative(), project: projectSchema,
  dirty: z.boolean(), canUndo: z.boolean(), canRedo: z.boolean(),
  // Draft controls may temporarily be outside the final project's domain limits.
  draft: z.object({ mode: z.enum(["parameters", "tolerance"]), settings: z.object({
    ...settingsSchema.shape, order: z.number(), cutoff: z.number(), bandwidth: z.number().optional(),
    impedance: z.number(), ripple: z.number(), attenuation: z.number(),
  }), tolerance: z.object({ ...toleranceSchema.shape, passband: z.array(z.number()).max(2), stopband: z.array(z.number()).max(2), passbandLoss: z.number(), stopbandLoss: z.number() }), pending: z.boolean() }),
});
export const MAX_WINDOW_TABS = 100;
export const windowSchema = z.object({ id: z.uuid(), activeTabId: idSchema, tabs: z.array(tabSchema).min(1).max(MAX_WINDOW_TABS) }).superRefine((window, ctx) => {
  if (new Set(window.tabs.map(tab => tab.id)).size !== window.tabs.length || !window.tabs.some(tab => tab.id === window.activeTabId)) ctx.addIssue({ code: "custom", message: "Invalid tab IDs" });
});
export const errorSchema = z.object({ error: z.object({ status: z.number(), message: z.string() }) });
