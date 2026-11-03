import { z } from "zod";
import { createCircuit, defaultSettings, orderedSections, parseProject } from "../src/lib/project";
import { synthesize } from "../src/lib/synthesis";
import { analyzeNetwork, decibels, phaseDegrees, sweepNetwork } from "../src/lib/network";
import { bandEdges, isBandResponse } from "../src/lib/frequency";
import { designTolerance } from "../src/lib/tolerance";
import { roundComponentValues } from "../src/lib/component-rounding";
import { checkRevision, RemoteError } from "../src/lib/remote-protocol";
import { BrowserHub } from "./hub";
import { digitsSchema, idSchema, precisionSchema, projectSchema, sectionSchema, settingsSchema, sweepSchema, tabSchema, toleranceSchema, windowSchema } from "./schemas";

export type Operation = {
  name: string; description: string; method: "get" | "post" | "put" | "patch";
  path: string; input: z.ZodObject; output: z.ZodType; readOnly: boolean; destructive?: boolean;
  run: (input: unknown) => Promise<Record<string, unknown>>;
};
function operation<S extends z.ZodRawShape>(
  name: string, description: string, method: Operation["method"], path: string,
  input: z.ZodObject<S>, output: z.ZodType, readOnly: boolean,
  run: (input: z.infer<z.ZodObject<S>>) => unknown | Promise<unknown>,
  options: { destructive?: boolean } = {},
): Operation {
  return { name, description, method, path, input, output, readOnly, ...options, async run(raw) {
    const parsed = input.parse(raw);
    try { return output.parse(await run(parsed)) as Record<string, unknown>; }
    catch (error) {
      if (error instanceof RemoteError) throw error;
      throw new RemoteError(422, error instanceof Error ? error.message : "Unable to process filter.");
    }
  } };
}

const numeric = z.number().nullable().describe("null means a singular or numerically unrepresentable value; see warnings.");
const complex = z.object({ re: numeric, im: numeric });
const polynomial = z.array(numeric);
const rational = z.object({ num: polynomial, den: polynomial });
const abcd = <T extends z.ZodType>(entry: T) => z.object({ A: entry, B: entry, C: entry, D: entry });
const scattering = <T extends z.ZodType>(entry: T) => z.object({ s11: entry, s12: entry, s21: entry, s22: entry });
const analysisSchema = z.object({
  fRef: z.number(), z1: z.number(), z2: z.number(), lossless: z.boolean(),
  normalization: z.string(), abcd: abcd(rational), scattering: scattering(rational),
  denominator: polynomial, numerators: scattering(polynomial), characteristic: rational,
  latex: z.object({ abcd: z.string(), abcdEntries: abcd(z.string()), abcdDenominator: z.string(), s: z.string(), numerators: scattering(z.string()), denominator: z.string(), sections: z.array(z.string()), characteristic: z.string(), characteristicResponse: z.string().optional() }),
  samples: z.array(z.object({ frequency: z.number(), ...scattering(complex).shape, abcd: abcd(complex), db: scattering(numeric), phaseDegrees: scattering(numeric) })),
  warnings: z.array(z.string()),
});
const generatedSchema = z.object({ project: projectSchema, notes: z.array(z.string()) });
const generationInput = z.object({ name: z.string().max(120).default("New filter"), settings: settingsSchema.partial().strict().default({}), componentPrecision: precisionSchema.optional(), tolerance: toleranceSchema.optional() }).strict();
const target = { windowId: idSchema, tabId: idSchema };
const revision = { ...target, expectedRevision: z.number().int().nonnegative().describe("Required revision from get_filter_tab. Stale writes return 409; read again before retrying.") };

function generateProject({ name, settings: overrides, componentPrecision, tolerance }: z.infer<typeof generationInput>) {
  let settings = { ...defaultSettings, ...overrides };
  if (tolerance) {
    const design = designTolerance(tolerance, settings.family, settings.impedance);
    if (!design.settings) throw new Error(`Tolerance design is not realizable (${design.issue}; required order: ${design.minimumOrder ?? "unknown"}).`);
    settings = design.settings;
  }
  const edges = isBandResponse(settings.response) ? bandEdges(settings) : null;
  const sweep = { min: edges ? Math.max(edges.lower / 3, edges.lower - 2 * settings.bandwidth!) : settings.cutoff / 10, max: edges ? edges.upper + 2 * settings.bandwidth! : settings.cutoff * 10, points: edges ? 1001 : 401 };
  // Validate coupled parameters before invoking the synthesis algorithm.
  const base = parseProject({ version: 1, name, settings, componentPrecision, tolerance, ...createCircuit([]), z2: settings.impedance, sweep });
  const result = synthesize(settings);
  return { project: parseProject({ ...base, ...createCircuit(result.sections), z2: result.z2 }), notes: result.notes };
}

export function createOperations(hub: BrowserHub): Operation[] {
  const mutate = async (args: z.infer<z.ZodObject<typeof revision>>, project: unknown) => {
    const next = parseProject(project);
    checkRevision(hub.tab(args.windowId, args.tabId), args.expectedRevision);
    const window = await hub.command(args.windowId, { action: "replace", tabId: args.tabId, expectedRevision: args.expectedRevision, project: next });
    return { tab: window.tabs.find(tab => tab.id === args.tabId)! };
  };
  return [
    operation("create_filter", "Create a new filter and open it in a new active browser tab in one step, preserving existing tabs. Uses SI units and unrounded component values. Defaults: Butterworth low-pass, order 5, 1 MHz, 50 ohms. Optional tolerance determines settings and order. Omit windowId only when exactly one browser window is connected; otherwise select one using list_filter_windows. Requires the local editor to be open. Returns windowId, the acknowledged new tab (id, revision, project) and synthesis notes. Not saved to disk. Each call creates another tab; after a timeout, list tabs before retrying.", "post", "/api/filters",
      generationInput.extend({ windowId: idSchema.optional().describe("Target connected browser window. Optional if exactly one window is connected; multiple windows return 409 unless selected explicitly.") }),
      z.object({ windowId: idSchema, tab: tabSchema, notes: z.array(z.string()) }), false,
      async ({ windowId, ...input }) => {
        if (windowId === undefined) {
          const windows = hub.list();
          if (!windows.length) throw new RemoteError(503, "No browser window connected. Open Filterstudio on the local server first. Use synthesize_filter for a project without an open browser.");
          if (windows.length > 1) throw new RemoteError(409, "Multiple browser windows are connected. Use list_filter_windows (GET /api/windows) and provide windowId.");
          windowId = windows[0].id;
        }
        const previousIds = new Set(hub.get(windowId).tabs.map(tab => tab.id));
        const generated = generateProject(input);
        const window = await hub.command(windowId, { action: "open", project: generated.project });
        const tab = window.tabs.find(tab => tab.id === window.activeTabId && !previousIds.has(tab.id));
        if (!tab) throw new RemoteError(409, "The browser did not confirm a new active tab. List its tabs before retrying.");
        return { windowId, tab, notes: generated.notes };
      }, { destructive: false }),
    operation("synthesize_filter", "Generate an unrounded filter project using SI units. Defaults: Butterworth low-pass, order 5, 1 MHz, 50 ohms. Does not change browser tabs. Optional tolerance determines settings and order.", "post", "/api/filters/synthesize",
      generationInput, generatedSchema, true, generateProject),
    operation("validate_filter", "Validate a Filterstudio JSON project and report whether its topology can be analyzed. Incomplete circuits may be valid project files.", "post", "/api/filters/validate",
      z.object({ project: projectSchema }).strict(), z.object({ project: projectSchema, analyzable: z.boolean(), topologyError: z.string().nullable() }), true,
      ({ project }) => {
        let topologyError: string | null = null;
        try { orderedSections(project.nodes, project.wires); } catch (error) { topologyError = (error as Error).message; }
        return { project: parseProject(project), analyzable: topologyError === null, topologyError };
      }),
    operation("analyze_filter", "Calculate ABCD/S matrices, normalized polynomials, LaTeX and numeric samples using actual stored values. Frequencies are Hz. Defaults to one sample at cutoff; optionally request a logarithmic sweep. Singular/unrepresentable numbers are null with warnings; dB floor is -160.", "post", "/api/filters/analyze",
      z.object({ project: projectSchema, frequencies: z.array(z.number().min(0).max(1e15)).min(1).max(128).optional(), sweep: sweepSchema.optional() }).strict().refine(v => !(v.frequencies && v.sweep), "Choose frequencies or sweep, not both."), analysisSchema, true,
      ({ project, frequencies, sweep }) => {
        const analysis = analyzeNetwork(orderedSections(project.nodes, project.wires), { fRef: project.settings.cutoff, z1: project.settings.impedance, z2: project.z2 });
        const { evaluate, ...symbolic } = analysis;
        const samples = sweep ? sweepNetwork(analysis, sweep.min, sweep.max, sweep.points) : (frequencies ?? [project.settings.cutoff]).map(frequency => ({ frequency, ...evaluate(frequency) }));
        const warnings: string[] = [];
        const result = JSON.parse(JSON.stringify({ ...symbolic, normalization: "Coefficients in ascending powers of p = s / (2*pi*fRef); component values in SI units.", samples: samples.map(sample => ({ ...sample,
          db: Object.fromEntries((["s11", "s12", "s21", "s22"] as const).map(key => [key, decibels(sample[key])])),
          phaseDegrees: Object.fromEntries((["s11", "s12", "s21", "s22"] as const).map(key => [key, phaseDegrees(sample[key])])),
        })) }, (_key, value) => {
          if (typeof value === "number" && !Number.isFinite(value)) { warnings[0] = "Some values are singular or exceed floating-point range and are represented as null."; return null; }
          return value;
        }));
        return { ...result, warnings };
      }),
    operation("round_filter", "Explicitly round stored R/L/C values (both LC values) to 1–15 significant digits. Returns a copy; does not change browser tabs or display precision.", "post", "/api/filters/round",
      z.object({ project: projectSchema, digits: digitsSchema }).strict(), z.object({ project: projectSchema, changedValues: z.number().int() }), true,
      ({ project, digits }) => { const rounded = roundComponentValues(project.nodes, digits); return { project: { ...project, nodes: rounded.nodes }, changedValues: rounded.changedValues }; }),
    operation("list_filter_windows", "List connected browser windows and filter tabs. Open the local server's app first. IDs change after a browser reload; projects live in the browser, not on disk.", "get", "/api/windows",
      z.object({}).strict(), z.object({ windows: z.array(z.object({ id: idSchema, activeTabId: idSchema, tabs: z.array(z.object({ id: idSchema, name: z.string(), revision: z.number(), dirty: z.boolean() })) })) }), true,
      () => ({ windows: hub.list() })),
    operation("get_filter_tab", "Read a tab's full project, current revision, undo/redo availability and ungenerated draft. Read before editing. Project is the actual circuit; draft controls may differ.", "get", "/api/windows/{windowId}/tabs/{tabId}",
      z.object(target).strict(), z.object({ tab: tabSchema }), true, ({ windowId, tabId }) => ({ tab: hub.tab(windowId, tabId) })),
    operation("open_filter_tab", "Open a project in a new active tab in a connected browser window. Does not save to disk. Returns the acknowledged window state.", "post", "/api/windows/{windowId}/tabs",
      z.object({ windowId: idSchema, project: projectSchema }).strict(), z.object({ window: windowSchema }), false,
      async ({ windowId, project }) => ({ window: await hub.command(windowId, { action: "open", project: parseProject(project) }) })),
    operation("select_filter_tab", "Activate an existing filter tab in the browser.", "post", "/api/windows/{windowId}/tabs/{tabId}/select",
      z.object(target).strict(), z.object({ window: windowSchema }), false,
      async ({ windowId, tabId }) => { hub.tab(windowId, tabId); return { window: await hub.command(windowId, { action: "select", tabId }) }; }),
    operation("replace_filter_tab", "Replace the tab's project and generator draft. Creates one undo step and marks the tab unsaved. Requires its current revision, including any draft edits.", "put", "/api/windows/{windowId}/tabs/{tabId}",
      z.object({ ...revision, project: projectSchema }).strict(), z.object({ tab: tabSchema }), false,
      args => mutate(args, args.project)),
    operation("update_filter_component", "Update a component's SI values, label or connection. Preserves the rest of the circuit. Like other edits, resets ungenerated draft controls to project settings and creates an undo step.", "patch", "/api/windows/{windowId}/tabs/{tabId}/components/{componentId}",
      z.object({ ...revision, componentId: idSchema, changes: sectionSchema.pick({ value: true, value2: true, label: true, connection: true, resonator: true }).partial().strict().refine(v => Object.keys(v).length > 0, "At least one change is required.") }).strict(), z.object({ tab: tabSchema }), false,
      args => {
        const { project } = hub.tab(args.windowId, args.tabId);
        const node = project.nodes.find(node => node.id === args.componentId && node.section);
        if (!node?.section) throw new RemoteError(404, "Component not found.");
        if (node.section.kind !== "LC" && (args.changes.value2 !== undefined || args.changes.resonator !== undefined)) throw new RemoteError(422, "value2 and resonator apply only to LC components.");
        return mutate(args, { ...project, nodes: project.nodes.map(n => n === node ? { ...n, section: { ...n.section, ...args.changes } } : n) });
      }),
    operation("round_filter_tab", "Explicitly round all stored component values in a live tab, with undo. Display precision stays unchanged; ungenerated draft controls reset to project settings.", "post", "/api/windows/{windowId}/tabs/{tabId}/round",
      z.object({ ...revision, digits: digitsSchema }).strict(), z.object({ tab: tabSchema }), false,
      args => { const { project } = hub.tab(args.windowId, args.tabId); return mutate(args, { ...project, nodes: roundComponentValues(project.nodes, args.digits).nodes }); }),
    operation("set_filter_display_precision", "Change component label precision (1–15 significant digits or full). Stored component values are unchanged. Creates an undo step and resets ungenerated draft controls to project settings.", "post", "/api/windows/{windowId}/tabs/{tabId}/precision",
      z.object({ ...revision, precision: precisionSchema }).strict(), z.object({ tab: tabSchema }), false,
      args => mutate(args, { ...hub.tab(args.windowId, args.tabId).project, componentPrecision: args.precision })),
    ...(["undo", "redo"] as const).map(action => operation(`${action}_filter_tab`, `${action === "undo" ? "Undo" : "Redo"} one edit in the live tab. Requires the current revision.`, "post", `/api/windows/{windowId}/tabs/{tabId}/${action}`,
      z.object(revision).strict(), z.object({ tab: tabSchema }), false, async args => {
        checkRevision(hub.tab(args.windowId, args.tabId), args.expectedRevision);
        const window = await hub.command(args.windowId, { action, tabId: args.tabId, expectedRevision: args.expectedRevision });
        return { tab: window.tabs.find(tab => tab.id === args.tabId)! };
      })),
  ];
}
