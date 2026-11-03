import {
  memo,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Code2,
  Download,
  FileJson,
  FolderOpen,
  Grip,
  Info,
  Maximize,
  Minus,
  MousePointer2,
  Moon,
  Sun,
  Plus,
  Redo2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Undo2,
  Waves,
  X,
} from "lucide-react";
import { CircuitEditor } from "./components/CircuitEditor";
import { ProjectTabs } from "./components/ProjectTabs";
import { createFilterTab, workspaceReducer, type Workspace } from "./lib/workspace";
import { MAX_PROTOTYPE_ORDER, MAX_CAUER_ORDER, MAX_CIRCUIT_NODES, MAX_CIRCUIT_SECTIONS, nearestFilterOrder, cauerMinimumAttenuation } from "./lib/filter-limits";
import { useRemoteWorkspace } from "./lib/use-remote-workspace";
import { checkRevision, RemoteError, type RemoteController, type RemoteTab } from "./lib/remote-protocol";
import { ComponentValueInput } from "./components/ComponentValueInput";
import { ComponentRoundingControls } from "./components/ComponentRoundingControls";
import { DEFAULT_COMPONENT_PRECISION } from "./lib/component-rounding";
import { formatComponentLabel } from "./lib/component-units";
import { ResponsePlot } from "./components/ResponsePlot";
import type { FrequencyScale, MagnitudeScale } from "./lib/plot-scales";
import { Formula, MathView } from "./components/MathView";
import { SectionMatrixView } from "./components/SectionMatrixView";
import { ApproximationView } from "./components/ApproximationView";
import { ToleranceControls } from "./components/ToleranceControls";
import { TolerancePlot } from "./components/TolerancePlot";
import {
  defaultTolerance,
  designTolerance,
  toleranceEdges,
} from "./lib/tolerance";
import { filterApproximation } from "./lib/approximation";
import {
  analyzeNetwork,
  decibels,
  magnitude,
  type Complex,
  formatEngineering as engineering,
  sweepNetwork,
} from "./lib/network";
import { usePreferences } from "./lib/preferences";
type Translator = (de: string, en: string) => string;
import { synthesize } from "./lib/synthesis";
import { CIRCUIT_SPACING, snapCircuitCoordinate } from "./lib/circuit-layout";
import {
  bandEdges,
  filterDegree,
  isBandResponse,
  responseNames,
  MIN_RELATIVE_BANDWIDTH,
} from "./lib/frequency";
import {
  createCircuit,
  defaultSettings,
  downloadFile,
  orderedSections,
  parseProject,
} from "./lib/project";
import type {
  CircuitNode,
  CircuitWire,
  FilterFamily,
  FilterSettings,
  Project,
  Section,
  ToleranceSpec,
} from "./lib/types";

const AcknowledgementsPage = lazy(() => import("./components/AcknowledgementsPage"));
const isAcknowledgementsPage = () => window.location.hash.startsWith("#acknowledgements");

const familyNames: Record<FilterFamily, string> = {
  butterworth: "Butterworth",
  chebyshev: "Chebyshev I",
  cauer: "Cauer",
};
const getFamilyDescriptions = (t: Translator) => ({
  butterworth: t("Maximal flacher Durchlassbereich", "Maximally flat passband"),
  chebyshev: t("Welligkeit im Durchlassbereich", "Passband ripple"),
  cauer: t("Elliptisch · steile Filterflanken", "Elliptic · steep roll-off"),
});
const getPalette = (t: Translator) => [
  {
    key: "L-series",
    name: t("Induktivität", "Inductor"),
    label: "L",
    description: t("Serienzweig", "Series branch"),
    glyph: "coil",
  },
  {
    key: "C-shunt",
    name: t("Kapazität", "Capacitor"),
    label: "C",
    description: t("Querzweig nach Masse", "Shunt to ground"),
    glyph: "capacitor",
  },
  {
    key: "C-series",
    name: t("Kapazität", "Capacitor"),
    label: "C",
    description: t("Serienzweig", "Series branch"),
    glyph: "capacitor",
  },
  {
    key: "L-shunt",
    name: t("Induktivität", "Inductor"),
    label: "L",
    description: t("Querzweig nach Masse", "Shunt to ground"),
    glyph: "coil",
  },
  {
    key: "R-series",
    name: t("Widerstand", "Resistor"),
    label: "R",
    description: t("Serienzweig", "Series branch"),
    glyph: "resistor",
  },
  {
    key: "R-shunt",
    name: t("Widerstand", "Resistor"),
    label: "R",
    description: t("Querzweig nach Masse", "Shunt to ground"),
    glyph: "resistor",
  },
  {
    key: "LC-shunt-series",
    name: t("LC-Serienkreis", "Series LC resonator"),
    label: "LC",
    description: t("Querzweig · Sperrstelle", "Shunt · transmission zero"),
    glyph: "resonator",
  },
  {
    key: "LC-series-parallel",
    name: t("LC-Parallelkreis", "Parallel LC resonator"),
    label: "LC",
    description: t("Serienzweig · Sperrstelle", "Series · transmission zero"),
    glyph: "resonator",
  },
];
const initialSynthesis = synthesize(defaultSettings);
const initialProject: Project = {
  version: 1,
  name: "Mein erster Filter",
  settings: defaultSettings,
  ...createCircuit(initialSynthesis.sections),
  z2: initialSynthesis.z2,
  sweep: { min: 1e5, max: 1e7, points: 601 },
};
function Glyph({ kind }: { kind: string }) {
  return (
    <svg
      width="43"
      height="24"
      viewBox="0 0 48 26"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      {kind === "coil" ? (
        <path d="M1 14h8c0-13 7-13 7 0 0-13 7-13 7 0 0-13 7-13 7 0 0-13 7-13 7 0h10" />
      ) : kind === "capacitor" ? (
        <path d="M1 13h19m0-9v18m8-18v18m0-9h19" />
      ) : kind === "resistor" ? (
        <>
          <path d="M1 13h11m24 0h11" />
          <rect x="12" y="7" width="24" height="12" />
        </>
      ) : (
        <>
          <path d="M1 13h8m30 0h8M9 6h12m7 0h11M9 6v15h30V6m-18-4v8m7-8v8M17 21c0-10 7-10 7 0 0-10 7-10 7 0" />
        </>
      )}
    </svg>
  );
}
function PositiveInput({
  value,
  onChange,
  unit,
  min = 1e-12,
  max = 1e15,
  step = "any",
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  unit: string;
  min?: number;
  max?: number;
  step?: number | "any";
  label: string;
}) {
  const { t, number, language } = usePreferences();
  const [draft, setDraft] = useState(number(value, 7));
  const [invalid, setInvalid] = useState(false);
  const draftChanged = useRef(false);
  useEffect(() => {
    draftChanged.current = false;
    setDraft(number(value, 7));
    setInvalid(false);
  }, [value, language, number]);
  const commit = () => {
    if (!draftChanged.current) return;
    const n = Number(draft.replace(",", "."));
    if (Number.isFinite(n) && n >= min && n <= max) {
      setInvalid(false);
      draftChanged.current = false;
      onChange(n);
    } else {
      setInvalid(true);
    }
  };
  return (
    <div className={`number-field ${invalid ? "invalid" : ""}`}>
      <input
        aria-label={label}
        aria-invalid={invalid}
        type="text"
        inputMode="decimal"
        value={draft}
        onChange={(e) => {
          draftChanged.current = true;
          setDraft(e.target.value);
          setInvalid(false);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            draftChanged.current = false;
            setDraft(number(value, 7));
            setInvalid(false);
          }
        }}
        data-step={step}
        title={
          invalid
            ? t(
                `Wert zwischen ${number(min, 7)} und ${number(max, 7)} eingeben`,
                `Enter a value between ${number(min, 7)} and ${number(max, 7)}`,
              )
            : undefined
        }
      />
      <span>{unit}</span>
      {invalid && (
        <small className="field-error">
          {number(min, 7)} {t("bis", "to")} {number(max, 7)}
        </small>
      )}
    </div>
  );
}

function dbReadout(db: number, language: "de" | "en") {
  return db <= -160
    ? "≤ −160"
    : (Math.abs(db) < 0.005 ? 0 : db).toLocaleString(
        language === "de" ? "de-DE" : "en-US",
        {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
          useGrouping: false,
        },
      );
}

export default function App() {
  const { t } = usePreferences();
  const [showAcknowledgements, setShowAcknowledgements] = useState(isAcknowledgementsPage);
  const acknowledgementsReturnFocus = useRef<HTMLElement | null>(null);
  const openAcknowledgements = useCallback(() => {
    acknowledgementsReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.location.hash = "acknowledgements";
  }, []);
  const closeAcknowledgements = useCallback(() => {
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    setShowAcknowledgements(false);
  }, []);
  useEffect(() => {
    const update = () => setShowAcknowledgements(isAcknowledgementsPage());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    if (showAcknowledgements || !acknowledgementsReturnFocus.current) return;
    const frame = requestAnimationFrame(() => acknowledgementsReturnFocus.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [showAcknowledgements]);
  const [workspace, dispatch] = useReducer(
    workspaceReducer,
    undefined,
    (): Workspace => {
      const tab = createFilterTab({
        ...initialProject,
        name: t("Mein erster Filter", "My first filter"),
      });
      return { tabs: [tab], activeId: tab.id };
    },
  );
  const nextNumber = useRef(2);
  const [windowId] = useState(() => crypto.randomUUID());
  const controllers = useRef(new Map<string, RemoteController>());
  const registerRemote = useCallback((id: string, controller: RemoteController | null) => {
    if (controller) controllers.current.set(id, controller);
    else controllers.current.delete(id);
  }, []);
  const remote = useRemoteWorkspace(
    () => ({ id: windowId, activeTabId: workspace.activeId, tabs: workspace.tabs.flatMap(tab => {
      const controller = controllers.current.get(tab.id);
      return controller ? [controller.snapshot()] : [];
    }) }),
    command => {
      if (command.action === "open") {
        const tab = createFilterTab(parseProject(command.project));
        dispatch({ type: "open", tab: { ...tab, dirty: true } });
      } else {
        const controller = controllers.current.get(command.tabId);
        if (!controller) throw new RemoteError(404, "Tab no longer exists.");
        if (command.action === "select") dispatch({ type: "select", id: command.tabId });
        else controller.execute(command);
      }
    },
  );
  useEffect(() => { remote.publish(); }, [workspace, remote.publish]);
  const newTab = () =>
    createFilterTab({
      ...initialProject,
      name: `Filter ${nextNumber.current++}`,
    });
  const openProject = useCallback((project: Project) => {
    dispatch({ type: "open", tab: createFilterTab(project) });
  }, []);
  const updateTab = useCallback((id: string, name: string, dirty: boolean) => {
    dispatch({ type: "update", id, name, dirty });
  }, []);
  const hasUnsavedChanges = workspace.tabs.some((tab) => tab.dirty);
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);
  function closeTab(id: string) {
    const tab = workspace.tabs.find((tab) => tab.id === id);
    if (!tab) return;
    if (
      tab.dirty &&
      !window.confirm(
        t(
          `„${tab.name || "Unbenannter Filter"}“ enthält ungesicherte Änderungen oder einen noch nicht generierten Entwurf. Tab wirklich schließen?`,
          `“${tab.name || "Untitled filter"}” has unsaved changes or a design that has not been generated yet. Close this tab?`,
        ),
      )
    ) return;
    dispatch({
      type: "close",
      id,
      replacement: workspace.tabs.length === 1 ? newTab() : undefined,
    });
  }
  return <>
    {showAcknowledgements && <Suspense fallback={<main className="acknowledgements-page" aria-busy="true">{t("Danksagung wird geladen …", "Loading acknowledgements …")}</main>}>
      <AcknowledgementsPage onBack={closeAcknowledgements} />
    </Suspense>}
    {workspace.tabs.map((tab) => (
    // Keep each editor mounted to retain its drafts, undo history and viewport.
    <FilterWorkspace
      key={tab.id}
      tabId={tab.id}
      active={!showAcknowledgements && tab.id === workspace.activeId}
      startingProject={tab.initialProject}
      startingDirty={tab.dirty}
      registerRemote={registerRemote}
      publishRemote={remote.publish}
      remoteConnected={remote.connected}
      onOpenProject={openProject}
      onTabChange={updateTab}
      onOpenAcknowledgements={openAcknowledgements}
      navigation={
        tab.id === workspace.activeId && (
          <ProjectTabs
            tabs={workspace.tabs}
            activeId={workspace.activeId}
            onSelect={(id) => dispatch({ type: "select", id })}
            onNew={() => dispatch({ type: "open", tab: newTab() })}
            onClose={closeTab}
          />
        )
      }
    />
  ))}
  </>;
}

const FilterWorkspace = memo(function FilterWorkspace({
  tabId,
  active,
  startingProject,
  startingDirty,
  registerRemote,
  publishRemote,
  remoteConnected,
  onOpenProject,
  onTabChange,
  onOpenAcknowledgements,
  navigation,
}: {
  tabId: string;
  active: boolean;
  startingProject: Project;
  startingDirty: boolean;
  registerRemote: (id: string, controller: RemoteController | null) => void;
  publishRemote: () => void;
  remoteConnected: boolean;
  onOpenProject: (project: Project) => void;
  onTabChange: (id: string, name: string, dirty: boolean) => void;
  onOpenAcknowledgements: () => void;
  navigation: ReactNode;
}) {
  const { language, setLanguage, theme, setTheme, t, translate, number } =
    usePreferences();
  const familyDescriptions = getFamilyDescriptions(t);
  const palette = getPalette(t);
  const responseLabels =
    language === "de"
      ? responseNames
      : {
          lowpass: "Low-pass",
          highpass: "High-pass",
          bandpass: "Band-pass",
          bandstop: "Band-stop",
        };
  const formatEngineering = (value: number, unit = "", digits = 4) =>
    engineering(value, unit, digits, language === "de" ? "de-DE" : "en-US");
  const [project, setProject] = useState<Project>(startingProject);
  const [settings, setSettings] = useState<FilterSettings>(
    startingProject.settings,
  );
  const [designMode, setDesignMode] = useState<"parameters" | "tolerance">(
    startingProject.tolerance ? "tolerance" : "parameters",
  );
  const [toleranceDraft, setToleranceDraft] = useState<ToleranceSpec>(() =>
    startingProject.tolerance ?? defaultTolerance(startingProject.settings),
  );
  const [history, setHistory] = useState<Project[]>([]),
    [future, setFuture] = useState<Project[]>([]);
  const [paletteTab, setPaletteTab] = useState<"generator" | "elements">(
    "generator",
  );
  const [resultTab, setResultTab] = useState<
    "response" | "chain" | "polynomials" | "bom" | "tolerance"
  >(startingProject.tolerance ? "tolerance" : "response");
  const [plotMode, setPlotMode] = useState<"magnitude" | "phase">("magnitude");
  const [frequencyScale, setFrequencyScale] = useState<FrequencyScale>("log");
  const [magnitudeScale, setMagnitudeScale] = useState<MagnitudeScale>("db");
  const plotScales = { frequencyScale, magnitudeScale, onFrequencyScaleChange: setFrequencyScale, onMagnitudeScaleChange: setMagnitudeScale };
  const scatteringReadout = (value?: Complex) => !value ? "—" : magnitudeScale === "db"
    ? `${dbReadout(decibels(value), language)} dB` : number(magnitude(value), 6);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fitKey, setFitKey] = useState(0);
  const [toast, setToast] = useState("");
  const [showHelp, setShowHelp] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const changeStamp = useRef(0);
  const [edited, setEdited] = useState(startingDirty);
  const [showRounding, setShowRounding] = useState(false);
  const componentPrecision = project.componentPrecision ?? DEFAULT_COMPONENT_PRECISION;
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4200);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    if (!active || (!showHelp && !showExport)) return;
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowHelp(false);
        setShowExport(false);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [active, showHelp, showExport]);
  useEffect(() => {
    if (!active) {
      setShowHelp(false);
      setShowExport(false);
    }
  }, [active]);
  function commit(next: Project, coalesce = false) {
    if (!coalesce || Date.now() - changeStamp.current > 700) {
      setHistory((h) => [...h.slice(-39), project]);
    }
    changeStamp.current = Date.now();
    setFuture([]);
    setProject(next);
    setEdited(true);
  }
  function undo() {
    if (!history.length) return;
    setFuture((f) => [project, ...f]);
    const previous = history[history.length - 1];
    setProject(previous);
    restoreDesign(previous);
    setHistory(history.slice(0, -1));
    setSelectedId(null);
    setEdited(true);
  }
  function redo() {
    if (!future.length) return;
    setHistory((h) => [...h, project]);
    setProject(future[0]);
    restoreDesign(future[0]);
    setFuture(future.slice(1));
    setSelectedId(null);
    setEdited(true);
  }
  const evaluation = useMemo(() => {
    try {
      const sections = orderedSections(project.nodes, project.wires);
      return {
        sections,
        analysis: analyzeNetwork(sections, {
          fRef: project.settings.cutoff,
          z1: project.settings.impedance,
          z2: project.z2,
        }),
        error: null,
      };
    } catch (e) {
      return {
        sections: [],
        analysis: null,
        error:
          e instanceof Error
            ? e.message
            : "Die Schaltung konnte nicht ausgewertet werden.",
      };
    }
  }, [
    project.nodes,
    project.wires,
    project.settings.cutoff,
    project.settings.impedance,
    project.z2,
  ]);
  const analysis = evaluation.analysis;
  const selected = project.nodes.find((n) => n.id === selectedId);
  const circuitIsEmpty =
    !project.nodes.some((node) => node.section) && project.wires.length === 0;
  const atCutoff = analysis?.evaluate(project.settings.cutoff);
  const title = `${familyNames[project.settings.family]}-${responseLabels[project.settings.response]}`;
  const bandMode = isBandResponse(settings.response);
  const draftBand = bandMode ? bandEdges(settings) : null;
  const projectBand = isBandResponse(project.settings.response)
    ? bandEdges(project.settings)
    : undefined;
  const atBandEdges =
    analysis && projectBand
      ? [
          analysis.evaluate(projectBand.lower),
          analysis.evaluate(projectBand.upper),
        ]
      : null;
  const bandTooNarrow =
    bandMode &&
    settings.bandwidth! / settings.cutoff <
      MIN_RELATIVE_BANDWIDTH * (1 - 1e-12);
  const reference = useMemo(() => {
    try {
      return synthesize(project.settings);
    } catch {
      return null;
    }
  }, [project.settings]);
  const matchesPrototype = Boolean(
    reference &&
    analysis &&
    reference.z2 === project.z2 &&
    reference.sections.length === evaluation.sections.length &&
    reference.sections.every((s, i) => {
      const actual = evaluation.sections[i];
      return (
        s.kind === actual.kind &&
        s.connection === actual.connection &&
        s.value === actual.value &&
        s.value2 === actual.value2 &&
        s.resonator === actual.resonator
      );
    }),
  );
  const approximation = useMemo(
    () => (reference ? filterApproximation(project.settings) : null),
    [reference, project.settings],
  );
  const toleranceDesign = useMemo(
    () => designTolerance(toleranceDraft, settings.family, settings.impedance),
    [toleranceDraft, settings.family, settings.impedance],
  );
  const tolerancePreview = useMemo(() => {
    if (!toleranceDesign.settings || designMode !== "tolerance")
      return { analysis: null, error: null };
    try {
      const proposed = toleranceDesign.settings;
      const result = synthesize(proposed);
      return {
        analysis: analyzeNetwork(result.sections, {
          fRef: proposed.cutoff,
          z1: proposed.impedance,
          z2: result.z2,
        }),
        error: null,
      };
    } catch (error) {
      return {
        analysis: null,
        error:
          error instanceof Error ? error.message : "Synthese nicht möglich.",
      };
    }
  }, [toleranceDesign, designMode]);
  const generatorDirty =
    JSON.stringify(settings) !== JSON.stringify(project.settings) ||
    (designMode === "tolerance" &&
      JSON.stringify(toleranceDraft) !== JSON.stringify(project.tolerance));
  useEffect(() => {
    onTabChange(tabId, project.name, edited || generatorDirty);
  }, [onTabChange, tabId, project.name, edited, generatorDirty]);
  const remoteRevision = useRef({ revision: 0, project, settings, toleranceDraft, designMode });
  const previous = remoteRevision.current;
  if (previous.project !== project || previous.settings !== settings || previous.toleranceDraft !== toleranceDraft || previous.designMode !== designMode) {
    remoteRevision.current = { revision: previous.revision + 1, project, settings, toleranceDraft, designMode };
  }
  useLayoutEffect(() => {
    const snapshot = (): RemoteTab => ({ id: tabId, revision: remoteRevision.current.revision, project, dirty: edited || generatorDirty, canUndo: history.length > 0, canRedo: future.length > 0,
      draft: { mode: designMode, settings, tolerance: toleranceDraft, pending: generatorDirty },
    });
    registerRemote(tabId, { snapshot, execute: command => {
      checkRevision(snapshot(), command.expectedRevision);
      if (generating) throw new RemoteError(409, "Filter generation is in progress. Read the tab and retry.");
      if (command.action === "replace") {
        const next = parseProject(command.project);
        commit(next);
        restoreDesign(next);
        setSelectedId(null);
        setNotes([]);
        setFitKey(key => key + 1);
      } else if (command.action === "undo") {
        if (!history.length) throw new RemoteError(409, "Nothing to undo.");
        undo();
      } else if (command.action === "redo") {
        if (!future.length) throw new RemoteError(409, "Nothing to redo.");
        redo();
      } else throw new RemoteError(400, "Unknown command.");
      setToast(t("Änderung über API/MCP übernommen", "API/MCP change applied"));
    } });
  });
  useLayoutEffect(() => () => registerRemote(tabId, null), [registerRemote, tabId]);
  useEffect(() => { publishRemote(); }, [publishRemote, project, settings, toleranceDraft, designMode, edited, generatorDirty, history, future]);
  function restoreDesign(next: Project) {
    setSettings(next.settings);
    setToleranceDraft(next.tolerance ?? defaultTolerance(next.settings));
    setDesignMode(next.tolerance ? "tolerance" : "parameters");
    setResultTab(next.tolerance ? "tolerance" : "response");
  }
  function selectDesignMode(mode: "parameters" | "tolerance") {
    setDesignMode(mode);
    if (mode === "tolerance") setResultTab("tolerance");
    else if (resultTab === "tolerance") setResultTab("response");
  }
  function updateSettings(patch: Partial<FilterSettings>) {
    const next = { ...settings, ...patch };
    if (
      patch.response &&
      isBandResponse(patch.response) &&
      !isBandResponse(settings.response)
    ) {
      next.cutoff = Math.max(2, Math.min(5e11, next.cutoff));
      next.bandwidth = next.cutoff / 2;
    }
    next.order = nearestFilterOrder(next.family, next.order);
    if (next.family === "cauer")
      next.attenuation = Math.max(cauerMinimumAttenuation(next.order), next.attenuation);
    if (patch.response && patch.response !== toleranceDraft.response) {
      setToleranceDraft({
        ...defaultTolerance(next),
        passbandLoss: toleranceDraft.passbandLoss,
        stopbandLoss: toleranceDraft.stopbandLoss,
      });
    }
    setSettings(next);
  }
  async function generate() {
    const chosen =
      designMode === "tolerance" ? toleranceDesign.settings : settings;
    if (!chosen || (designMode === "tolerance" && tolerancePreview.error))
      return;
    const chosenBand = isBandResponse(chosen.response);
    const mask = designMode === "tolerance" ? toleranceDraft : undefined;
    const maskEdges = mask ? toleranceEdges(mask) : null;
    setGenerating(true);
    await new Promise((resolve) => setTimeout(resolve, 20));
    try {
      const result = synthesize(chosen);
      commit({
        ...project,
        settings: { ...chosen },
        tolerance: mask,
        ...createCircuit(result.sections),
        z2: result.z2,
        sweep: {
          ...project.sweep,
          min: maskEdges
            ? maskEdges[0].frequency / 2
            : chosenBand
              ? Math.max(
                  bandEdges(chosen).lower / 3,
                  bandEdges(chosen).lower - 2 * chosen.bandwidth!,
                )
              : chosen.cutoff / 10,
          max: maskEdges
            ? maskEdges[maskEdges.length - 1].frequency * 2
            : chosenBand
              ? bandEdges(chosen).upper + 2 * chosen.bandwidth!
              : chosen.cutoff * 10,
          points: chosenBand
            ? Math.max(1001, project.sweep.points)
            : project.sweep.points,
        },
      });
      setSettings(chosen);
      setNotes(result.notes);
      setSelectedId(null);
      setFitKey((k) => k + 1);
      setToast("Schaltung generiert. Alle Ergebnisse sind aktualisiert.");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Synthese nicht möglich.");
    } finally {
      setGenerating(false);
    }
  }
  function addSection(key: string, position?: { x: number; y: number }) {
    if (project.nodes.length >= MAX_CIRCUIT_NODES) {
      setToast(t(`Maximal ${MAX_CIRCUIT_SECTIONS} Zweitore pro Schaltung.`, `A circuit can contain up to ${MAX_CIRCUIT_SECTIONS} two-ports.`));
      return;
    }
    const [kind, connection, resonator] = key.split("-");
    if (
      !["R", "L", "C", "LC"].includes(kind) ||
      !["series", "shunt"].includes(connection)
    )
      return;
    const id = crypto.randomUUID();
    const usedLabels = new Set(project.nodes.map((n) => n.section?.label));
    let count = 1;
    while (usedLabels.has(`${kind}${count}`)) count++;
    const section: Section = {
      id,
      kind: kind as Section["kind"],
      connection: connection as Section["connection"],
      value:
        kind === "R"
          ? 50
          : kind === "C"
            ? 1 /
              (2 *
                Math.PI *
                project.settings.cutoff *
                project.settings.impedance)
            : project.settings.impedance /
              (2 * Math.PI * project.settings.cutoff),
      label: `${kind}${count}`,
    };
    if (kind === "LC") {
      section.value2 =
        1 /
        (2 * Math.PI * project.settings.cutoff * project.settings.impedance);
      section.resonator = resonator === "parallel" ? "parallel" : "series";
    }
    const output = project.nodes.find((n) => n.port === "output")!;
    const node: CircuitNode = {
      id,
      section,
      x: position?.x ?? snapCircuitCoordinate(output.x),
      y: position?.y ?? output.y,
    };
    let nodes = [...project.nodes, node],
      wires = project.wires;
    if (!position) {
      const incoming = wires.find((w) => w.target === output.id);
      if (incoming)
        wires = [
          ...wires.filter((w) => w !== incoming),
          { id: `wire-${id}-a`, source: incoming.source, target: id },
          { id: `wire-${id}-b`, source: id, target: output.id },
        ];
      else if (circuitIsEmpty) {
        const input = project.nodes.find((n) => n.port === "input")!;
        wires = [
          { id: `wire-${id}-a`, source: input.id, target: id },
          { id: `wire-${id}-b`, source: id, target: output.id },
        ];
      }
      nodes = nodes.map((n) =>
        n.id === output.id ? { ...n, x: node.x + CIRCUIT_SPACING } : n,
      );
      setFitKey((k) => k + 1);
    }
    commit({ ...project, nodes, wires });
    setSelectedId(id);
    setNotes([]);
    if (position)
      setToast(
        "Bauelement platziert. Verbinde die beiden Anschlüsse mit der Schaltung.",
      );
  }
  function updateSection(patch: Partial<Section>) {
    if (!selected?.section) return;
    commit({
      ...project,
      nodes: project.nodes.map((n) =>
        n.id === selected.id
          ? { ...n, section: { ...n.section!, ...patch } }
          : n,
      ),
    });
    setNotes([]);
  }
  function removeSelected() {
    if (!selected?.section) return;
    commit({
      ...project,
      nodes: project.nodes.filter((n) => n.id !== selected.id),
      wires: project.wires.filter(
        (w) => w.source !== selected.id && w.target !== selected.id,
      ),
    });
    setSelectedId(null);
  }
  function clearCircuit() {
    if (circuitIsEmpty || generating) return;
    commit({
      ...project,
      nodes: project.nodes.filter((node) => node.port),
      wires: [],
    });
    setSelectedId(null);
    setNotes([]);
    setPaletteTab("elements");
    setResultTab("response");
    setFitKey((key) => key + 1);
    setToast(
      t(
        "Schaltung geleert. Mit Rückgängig kannst du sie wiederherstellen.",
        "Circuit cleared. Use Undo to restore it.",
      ),
    );
  }
  function save() {
    downloadFile(
      `${project.name.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "filter"}.filterstudio.json`,
      JSON.stringify(project, null, 2),
      "application/json",
    );
    setEdited(false);
    setToast("Projekt als JSON heruntergeladen.");
    setShowExport(false);
  }
  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1e6) throw new Error("Die Datei ist größer als 1 MB.");
      const next = parseProject(JSON.parse(await file.text()));
      onOpenProject(next);
    } catch (e) {
      setToast(
        e instanceof Error
          ? e.message
          : "Die Datei konnte nicht gelesen werden.",
      );
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  function exportLatex() {
    if (!analysis) return;
    const referenceLatex = approximation
      ? `% Design reference: ${project.settings.family}, n=${project.settings.order}; circuit matches prototype: ${matchesPrototype}\n\\section*{${t("Approximationsgrundlage", "Approximation basis")}: ${familyNames[project.settings.family]}}\n${matchesPrototype ? t("Die Schaltung entspricht dem erzeugten Prototyp.", "The circuit matches the generated prototype.") : t("Entwurfsreferenz: Die aktuelle Schaltung oder ihre Torimpedanzen weichen vom erzeugten Prototyp ab.", "Design reference: the current circuit or its port impedances differ from the generated prototype.")}\n${Object.values(
          approximation.latex,
        )
          .map((latex) => `\\[\n${latex}\n\\]`)
          .join(
            "\n",
          )}\n\\section*{${t("Polynome und Matrizen der Schaltung", "Circuit polynomials and matrices")}}\n`
      : "";
    downloadFile(
      t("filterstudio-matrizen.tex", "filterstudio-matrices.tex"),
      `% Filterstudio; p = s/(2*pi*${analysis.fRef}); Z1=${analysis.z1} ohm; Z2=${analysis.z2} ohm\n\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n${referenceLatex}${[
        ...analysis.latex.sections,
        analysis.latex.abcd,
        analysis.latex.s,
        ...Object.values(analysis.latex.numerators),
        analysis.latex.denominator,
        analysis.latex.characteristic,
        analysis.latex.characteristicResponse,
      ]
        .filter(Boolean)
        .map((latex) => `\\[\n${latex}\n\\]`)
        .join("\n")}\n\\end{document}\n`,
    );
    setShowExport(false);
  }
  function exportTouchstone() {
    if (!analysis) return;
    const data = sweepNetwork(
      analysis,
      project.sweep.min,
      project.sweep.max,
      project.sweep.points,
      frequencyScale,
    );
    const version2 = project.z2 !== project.settings.impedance;
    const lines = version2
      ? [
          "[Version] 2.0",
          `# Hz S RI R ${analysis.z1}`,
          "[Number of Ports] 2",
          `[Number of Frequencies] ${data.length}`,
          "[Two-Port Data Order] 21_12",
          `[Reference] ${analysis.z1} ${analysis.z2}`,
          "[Network Data]",
        ]
      : [
          `! Filterstudio ideal lumped-element circuit`,
          `# Hz S RI R ${analysis.z1}`,
        ];
    for (const d of data)
      lines.push(
        [
          d.frequency,
          d.s11.re,
          d.s11.im,
          d.s21.re,
          d.s21.im,
          d.s12.re,
          d.s12.im,
          d.s22.re,
          d.s22.im,
        ]
          .map((v) => v.toExponential(10))
          .join(" "),
      );
    if (version2) lines.push("[End]");
    downloadFile("filter.s2p", lines.join("\n"));
    setShowExport(false);
  }
  return (
    <div className="app-shell" hidden={!active}>
      <header className="app-header">
        <a
          className="brand"
          href="./"
          aria-label={t("Filterstudio Startseite", "Filterstudio home")}
        >
          <span className="brand-mark">
            <Activity size={25} strokeWidth={2} />
          </span>
          <span>
            filter<span className="brand-light">studio</span>
            <sup>β</sup>
          </span>
        </a>
        <nav aria-label={t("Hauptnavigation", "Main navigation")}>
          <button className="nav-item active">
            <SlidersHorizontal size={15} /> {t("Entwerfen", "Design")}
          </button>
          <button className="nav-item" onClick={() => setShowHelp(true)}>
            <BookOpen size={15} /> {t("Grundlagen", "Fundamentals")}
          </button>
        </nav>
        <div className="header-right">
          <div className="preferences-controls">
            <select
              className="language-select"
              aria-label={t("Sprache", "Language")}
              value={language}
              onChange={(e) =>
                setLanguage(e.target.value === "en" ? "en" : "de")
              }
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
            <button
              className="theme-toggle"
              aria-pressed={theme === "dark"}
              aria-label={
                theme === "dark"
                  ? t("Helles Design aktivieren", "Switch to light mode")
                  : t("Dunkles Design aktivieren", "Switch to dark mode")
              }
              title={
                theme === "dark"
                  ? t("Helles Design aktivieren", "Switch to light mode")
                  : t("Dunkles Design aktivieren", "Switch to dark mode")
              }
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
          <span className="local-status">
            <i /> {remoteConnected ? t("API/MCP verbunden", "API/MCP connected") : t("Lokal im Browser", "Runs in your browser")}
          </span>
          <button
            className="icon-button help-button"
            title={t("Hilfe und Grundlagen", "Help and fundamentals")}
            aria-label={t("Hilfe und Grundlagen", "Help and fundamentals")}
            onClick={() => setShowHelp(true)}
          >
            <CircleHelp size={19} />
          </button>
          <button
            className="button secondary"
            onClick={() => fileRef.current?.click()}
          >
            <FolderOpen size={15} /> {t("Öffnen", "Open")}
          </button>
          <div className="export-container">
            <button
              className="button primary"
              onClick={() => setShowExport(!showExport)}
            >
              <ArrowDownToLine size={15} /> {t("Exportieren", "Export")}{" "}
              <ChevronDown size={13} />
            </button>
            {showExport && (
              <div className="export-menu">
                <button onClick={save}>
                  <FileJson size={17} />
                  <span>
                    {t("Projekt speichern", "Save project")}
                    <small>
                      {t(
                        "JSON · später weiterbearbeiten",
                        "JSON · continue editing later",
                      )}
                    </small>
                  </span>
                </button>
                <button onClick={exportLatex} disabled={!analysis}>
                  <Code2 size={17} />
                  <span>
                    {t("LaTeX exportieren", "Export LaTeX")}
                    <small>
                      {t(
                        "Kettenmatrizen & S-Matrix",
                        "ABCD matrices & S-matrix",
                      )}
                    </small>
                  </span>
                </button>
                <button onClick={exportTouchstone} disabled={!analysis}>
                  <Waves size={17} />
                  <span>
                    {t("Touchstone exportieren", "Export Touchstone")}
                    <small>
                      {t("S-Parameter als .s2p", "S-parameters as .s2p")}
                    </small>
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => void importFile(e.target.files?.[0])}
        />
      </header>
      {navigation}
      <section
        role="tabpanel"
        id={`filter-panel-${tabId}`}
        aria-labelledby={`filter-tab-${tabId}`}
        tabIndex={0}
      >
      <div className="project-header">
        <div>
          <div className="breadcrumb">
            <span>{t("Arbeitsbereich", "Workspace")}</span>
            <ChevronRight size={12} />
            <input
              aria-label={t("Projektname", "Project name")}
              value={project.name}
              maxLength={120}
              onChange={(e) => {
                setProject({ ...project, name: e.target.value });
                setEdited(true);
              }}
            />
            {edited && (
              <span
                className="unsaved-dot"
                title={t(
                  "Änderungen noch nicht heruntergeladen",
                  "Changes not downloaded yet",
                )}
              />
            )}
          </div>
          <div className="project-title">
            <h1>
              {matchesPrototype
                ? title
                : t("Eigener Filterentwurf", "Custom filter design")}
            </h1>
            <span className="order-badge">
              {matchesPrototype
                ? t(
                    `${filterDegree(project.settings)}. Ordnung`,
                    `Order ${filterDegree(project.settings)}`,
                  )
                : t("RLC-Kaskade", "RLC cascade")}
            </span>
          </div>
        </div>
        <div className="project-summary">
          <span>
            <b>{formatEngineering(project.settings.cutoff, "Hz")}</b>{" "}
            {projectBand
              ? t("Mittenfrequenz", "Center frequency")
              : t("Bezugsfrequenz", "Reference frequency")}
          </span>
          <span>
            <b>{formatEngineering(project.settings.impedance, "Ω")}</b>{" "}
            {t("Tor 1", "Port 1")}
          </span>
          <span>
            <b>{project.nodes.filter((n) => n.section).length}</b>{" "}
            {t("Zweitore", "Two-port sections")}
          </span>
        </div>
      </div>
      <main className="studio-layout">
        <aside className="sidebar">
          <div className="sidebar-tabs">
            <button
              onClick={() => setPaletteTab("generator")}
              className={paletteTab === "generator" ? "active" : ""}
            >
              <Sparkles size={15} /> Generator
            </button>
            <button
              onClick={() => setPaletteTab("elements")}
              className={paletteTab === "elements" ? "active" : ""}
            >
              <Grip size={15} /> {t("Bauelemente", "Components")}
            </button>
          </div>
          {paletteTab === "generator" ? (
            <div className="generator">
              <div className="section-eyebrow">
                {t("01 / FILTERCHARAKTERISTIK", "01 / FILTER CHARACTERISTIC")}
              </div>
              <div className="family-list">
                {(["butterworth", "chebyshev", "cauer"] as FilterFamily[]).map(
                  (family, i) => (
                    <button
                      key={family}
                      className={`family-option ${settings.family === family ? "selected" : ""}`}
                      onClick={() =>
                        updateSettings({
                          family,
                        })
                      }
                    >
                      <span className="family-curve">
                        <svg width="33" height="24" viewBox="0 0 35 25">
                          <path
                            d={
                              i === 0
                                ? "M2 5C17 5 18 5 22 10S26 21 33 22"
                                : i === 1
                                  ? "M2 6Q5 1 9 6T17 6Q21 2 23 10T33 23"
                                  : "M2 6Q5 1 9 6T17 6Q21 1 22 12L24 23Q27 13 29 23L33 19"
                            }
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          />
                        </svg>
                      </span>
                      <span>
                        <strong>{familyNames[family]}</strong>
                        <small>{familyDescriptions[family]}</small>
                      </span>
                      <span className="radio-dot">
                        {settings.family === family && <span />}
                      </span>
                    </button>
                  ),
                )}
              </div>
              <label className="field-label">
                {t("Filtertyp", "Response type")}
              </label>
              <div
                className="segmented response-type"
                aria-label={t("Filtertyp", "Response type")}
              >
                {(["lowpass", "highpass", "bandpass", "bandstop"] as const).map(
                  (response) => (
                    <button
                      key={response}
                      className={settings.response === response ? "active" : ""}
                      aria-pressed={settings.response === response}
                      onClick={() => updateSettings({ response })}
                    >
                      {responseLabels[response]}
                    </button>
                  ),
                )}
              </div>
              <div className="sidebar-divider" />
              <div className="section-eyebrow">
                {t("02 / ENTWURF", "02 / DESIGN")}
              </div>
              <div
                className="segmented design-mode"
                aria-label={t("Entwurfsmodus", "Design mode")}
              >
                <button
                  className={designMode === "parameters" ? "active" : ""}
                  aria-pressed={designMode === "parameters"}
                  onClick={() => selectDesignMode("parameters")}
                >
                  {t("Parameter", "Parameters")}
                </button>
                <button
                  className={designMode === "tolerance" ? "active" : ""}
                  aria-pressed={designMode === "tolerance"}
                  onClick={() => selectDesignMode("tolerance")}
                >
                  {t("Toleranzschema", "Tolerance mask")}
                </button>
              </div>
              {designMode === "tolerance" ? (
                <ToleranceControls
                  spec={toleranceDraft}
                  design={toleranceDesign}
                  family={settings.family}
                  onChange={setToleranceDraft}
                />
              ) : (
                <>
                  <div className="order-label">
                    <label htmlFor={`order-${tabId}`}>
                      {bandMode
                        ? t("Prototypordnung", "Prototype order")
                        : t("Filterordnung", "Filter order")}{" "}
                      <span>n</span>
                    </label>
                    <div className="stepper">
                      <button
                        aria-label={t(
                          "Filterordnung verringern",
                          "Decrease filter order",
                        )}
                        disabled={
                          settings.order <=
                          (settings.family === "cauer" ? 3 : 1)
                        }
                        onClick={() =>
                          updateSettings({
                            order:
                              settings.order -
                              (settings.family === "cauer" ? 2 : 1),
                          })
                        }
                      >
                        <Minus size={12} />
                      </button>
                      <b>{settings.order}</b>
                      <button
                        aria-label={t(
                          "Filterordnung erhöhen",
                          "Increase filter order",
                        )}
                        disabled={
                          settings.order >=
                          (settings.family === "cauer" ? MAX_CAUER_ORDER : MAX_PROTOTYPE_ORDER)
                        }
                        onClick={() =>
                          updateSettings({
                            order:
                              settings.order +
                              (settings.family === "cauer" ? 2 : 1),
                          })
                        }
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </div>
                  <input
                    id={`order-${tabId}`}
                    aria-label={
                      bandMode
                        ? t("Prototypordnung", "Prototype order")
                        : t("Filterordnung", "Filter order")
                    }
                    className="order-range"
                    type="range"
                    min={settings.family === "cauer" ? 3 : 1}
                    max={settings.family === "cauer" ? MAX_CAUER_ORDER : MAX_PROTOTYPE_ORDER}
                    step={settings.family === "cauer" ? 2 : 1}
                    value={settings.order}
                    onChange={(e) =>
                      updateSettings({ order: Number(e.target.value) })
                    }
                  />
                  <div className="range-labels">
                    <span>{settings.family === "cauer" ? "3" : "1"}</span>
                    <span>{settings.family === "cauer" ? MAX_CAUER_ORDER : MAX_PROTOTYPE_ORDER}</span>
                  </div>
                  {draftBand ? (
                    <>
                      <p className="band-order-note">
                        {t(
                          `n = ${settings.order} → Bandfilter ${filterDegree(settings)}. Ordnung`,
                          `n = ${settings.order} → band filter of order ${filterDegree(settings)}`,
                        )}
                      </p>
                      <div className="parameter-field">
                        <label className="field-label">
                          {t("Untere Bandgrenze", "Lower band edge")}{" "}
                          <span>f₁</span>
                        </label>
                        <PositiveInput
                          label={t(
                            "Untere Bandgrenze in MHz",
                            "Lower band edge in MHz",
                          )}
                          value={draftBand.lower / 1e6}
                          unit="MHz"
                          min={1e-6}
                          max={(draftBand.upper / 1e6) * (1 - 1e-8)}
                          onChange={(n) =>
                            updateSettings({
                              cutoff: Math.sqrt(n * 1e6 * draftBand.upper),
                              bandwidth: draftBand.upper - n * 1e6,
                            })
                          }
                        />
                      </div>
                      <div className="parameter-field">
                        <label className="field-label">
                          {t("Obere Bandgrenze", "Upper band edge")}{" "}
                          <span>f₂</span>
                        </label>
                        <PositiveInput
                          label={t(
                            "Obere Bandgrenze in MHz",
                            "Upper band edge in MHz",
                          )}
                          value={draftBand.upper / 1e6}
                          unit="MHz"
                          min={(draftBand.lower / 1e6) * (1 + 1e-8)}
                          max={1e6}
                          onChange={(n) =>
                            updateSettings({
                              cutoff: Math.sqrt(n * 1e6 * draftBand.lower),
                              bandwidth: n * 1e6 - draftBand.lower,
                            })
                          }
                        />
                      </div>
                      <div className="band-summary">
                        <span>
                          {t("Mittenfrequenz f₀", "Center frequency f₀")}{" "}
                          <b>{formatEngineering(settings.cutoff, "Hz")}</b>
                        </span>
                        <span>
                          {t("Bandbreite B", "Bandwidth B")}{" "}
                          <b>{formatEngineering(settings.bandwidth!, "Hz")}</b>
                        </span>
                        <small>
                          {t("Grenzen bei", "Edges at")}{" "}
                          {settings.family === "butterworth"
                            ? `−${number(3.01)}`
                            : `−${number(settings.ripple)}`}{" "}
                          dB · f₀ = √(f₁ f₂)
                        </small>
                      </div>
                      {bandTooNarrow && (
                        <p className="band-validation" role="status">
                          {t(
                            `Die Bandbreite muss mindestens ${number(100 * MIN_RELATIVE_BANDWIDTH)} % der Mittenfrequenz betragen.`,
                            `Bandwidth must be at least ${number(100 * MIN_RELATIVE_BANDWIDTH)}% of the center frequency.`,
                          )}
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="parameter-field">
                      <label className="field-label">
                        {settings.family === "butterworth"
                          ? t("Grenzfrequenz", "Cutoff frequency")
                          : t("Durchlassgrenze", "Passband edge")}{" "}
                        <span>f₀</span>
                      </label>
                      <PositiveInput
                        label={t(
                          "Grenzfrequenz in MHz",
                          "Cutoff frequency in MHz",
                        )}
                        value={settings.cutoff / 1e6}
                        unit="MHz"
                        min={1e-6}
                        max={1e6}
                        onChange={(n) => updateSettings({ cutoff: n * 1e6 })}
                      />
                    </div>
                  )}
                </>
              )}
              <div className="parameter-field">
                <label className="field-label">
                  {t("Bezugsimpedanz", "Reference impedance")} <span>Z₀</span>
                </label>
                <PositiveInput
                  label={t(
                    "Bezugsimpedanz in Ohm",
                    "Reference impedance in ohms",
                  )}
                  value={settings.impedance}
                  unit="Ω"
                  min={0.01}
                  max={1e6}
                  onChange={(n) => updateSettings({ impedance: n })}
                />
              </div>
              {designMode === "parameters" &&
                settings.family !== "butterworth" && (
                  <div className="parameter-field">
                    <label className="field-label">
                      {t("Durchlasswelligkeit", "Passband ripple")}{" "}
                      <span>Rₚ</span>
                    </label>
                    <PositiveInput
                      label={t(
                        "Durchlasswelligkeit in dB",
                        "Passband ripple in dB",
                      )}
                      value={settings.ripple}
                      unit="dB"
                      min={0.1}
                      max={3}
                      onChange={(n) => updateSettings({ ripple: n })}
                    />
                  </div>
                )}
              {designMode === "parameters" && settings.family === "cauer" && (
                <div className="parameter-field">
                  <label className="field-label">
                    {t("Sperrdämpfung", "Stopband attenuation")} <span>Rₛ</span>
                  </label>
                  <PositiveInput
                    label={t(
                      "Sperrdämpfung in dB",
                      "Stopband attenuation in dB",
                    )}
                    value={settings.attenuation}
                    unit="dB"
                    min={cauerMinimumAttenuation(settings.order)}
                    max={80}
                    onChange={(n) => updateSettings({ attenuation: n })}
                  />
                </div>
              )}
              <button
                className="generate-button"
                onClick={() => void generate()}
                disabled={
                  generating ||
                  (designMode === "tolerance"
                    ? !toleranceDesign.settings ||
                      Boolean(tolerancePreview.error)
                    : bandTooNarrow)
                }
              >
                <Sparkles size={16} />
                {generating
                  ? t("Berechne Schaltung …", "Calculating circuit …")
                  : t("Schaltung generieren", "Generate circuit")}
                <ArrowRight size={16} />
              </button>
              <p className="generator-footnote">
                {generatorDirty
                  ? t(
                      "Neue Parameter bereit. Generieren ersetzt die aktuelle Schaltung.",
                      "New parameters ready. Generating replaces the current circuit.",
                    )
                  : t(
                      "Erzeugt eine editierbare LC-Leiterschaltung.",
                      "Creates an editable LC ladder circuit.",
                    )}
              </p>
              {designMode === "parameters" &&
                notes.length > 0 &&
                !generatorDirty && (
                  <div className="synthesis-notes">
                    {notes.map((n, i) => (
                      <p key={i}>{translate(n)}</p>
                    ))}
                  </div>
                )}
            </div>
          ) : (
            <div className="element-palette">
              <div className="section-eyebrow">
                {t(
                  "BAUSTEINE FÜR DEINEN FILTER",
                  "BUILDING BLOCKS FOR YOUR FILTER",
                )}
              </div>
              <p className="palette-intro">
                {t(
                  "In die Schaltung ziehen oder per Klick vor dem Ausgang einfügen.",
                  "Drag onto the canvas or click to insert before the output.",
                )}
              </p>
              {palette.map((p) => (
                <button
                  className="palette-item"
                  key={p.key}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/filterstudio", p.key);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => addSection(p.key)}
                >
                  <span className="palette-glyph">
                    <Glyph kind={p.glyph} />
                  </span>
                  <span>
                    <strong>{p.name}</strong>
                    <small>{p.description}</small>
                  </span>
                  <Grip size={14} />
                </button>
              ))}
            </div>
          )}
          <div className="learning-tip">
            <span className="tip-icon">
              <BookOpen size={17} />
            </span>
            <div>
              <strong>
                {t(
                  "Vom Entwurf zum Verständnis.",
                  "From design to understanding.",
                )}
              </strong>
              <p>
                {t(
                  "Ändere ein Bauelement und beobachte, wie sich der Frequenzgang verändert.",
                  "Change a component and observe how the frequency response changes.",
                )}
              </p>
              <button onClick={() => setShowHelp(true)}>
                {t("So funktioniert’s", "How it works")}{" "}
                <ArrowRight size={12} />
              </button>
            </div>
          </div>
          <div className="sidebar-footer">
            <button className="acknowledgements-button" onClick={onOpenAcknowledgements}>
              <BookOpen size={14} aria-hidden="true" /> Acknowledgements
              <ArrowRight size={12} aria-hidden="true" />
            </button>
          </div>
        </aside>
        <div className="workspace">
          <section
            className="circuit-panel"
            aria-label={t("Schaltung", "Circuit")}
          >
            <div className="panel-toolbar">
              <div className="panel-title">
                <span className="mini-icon">
                  <MousePointer2 size={14} />
                </span>
                <h2>{t("Schaltung", "Circuit")}</h2>
                <span
                  className={`live-badge ${circuitIsEmpty ? "empty" : evaluation.error ? "warning" : ""}`}
                >
                  <i />
                  {circuitIsEmpty
                    ? t("Leer", "Empty")
                    : evaluation.error
                      ? t("Offen", "Open circuit")
                      : "Live"}
                </span>
              </div>
              <div className="canvas-actions">
                <span className="canvas-hint">
                  {t(
                    "Anklicken, verschieben, verbinden",
                    "Select, move, connect",
                  )}
                </span>
                <button
                  className="circuit-rounding-button"
                  aria-expanded={showRounding}
                  aria-controls={`component-rounding-${tabId}`}
                  onClick={() => setShowRounding((show) => !show)}
                >
                  <SlidersHorizontal size={15} />
                  {t("Rundung", "Rounding")}
                </button>
                <button
                  className="circuit-clear-button"
                  onClick={clearCircuit}
                  disabled={circuitIsEmpty || generating}
                  title={t(
                    "Alle Bauelemente und Signalverbindungen entfernen. Rückgängig ist möglich.",
                    "Remove all components and signal connections. This can be undone.",
                  )}
                >
                  <Trash2 size={15} />
                  {t("Schaltung leeren", "Clear circuit")}
                </button>
                <span className="toolbar-separator" />
                <button
                  className="icon-button"
                  onClick={undo}
                  disabled={!history.length}
                  aria-label={t("Rückgängig", "Undo")}
                  title={t("Rückgängig", "Undo")}
                >
                  <Undo2 size={16} />
                </button>
                <button
                  className="icon-button"
                  onClick={redo}
                  disabled={!future.length}
                  aria-label={t("Wiederholen", "Redo")}
                  title={t("Wiederholen", "Redo")}
                >
                  <Redo2 size={16} />
                </button>
                <span className="toolbar-separator" />
                <button
                  className="icon-button"
                  aria-label={t("Schaltung einpassen", "Fit circuit to view")}
                  title={t("Schaltung einpassen", "Fit circuit to view")}
                  onClick={() => setFitKey((k) => k + 1)}
                >
                  <Maximize size={16} />
                </button>
              </div>
            </div>
            <ComponentRoundingControls
              id={`component-rounding-${tabId}`}
              open={showRounding}
              nodes={project.nodes}
              precision={componentPrecision}
              disabled={generating}
              onPrecisionChange={(componentPrecision) => commit({ ...project, componentPrecision })}
              onRound={(nodes) => {
                commit({ ...project, nodes });
                setToast(t(
                  "Bauteilwerte gerundet. Rückgängig stellt die vorherigen Werte wieder her.",
                  "Component values rounded. Undo restores the previous values.",
                ));
              }}
            />
            <div className={`canvas-area ${selected ? "has-inspector" : ""}`}>
              <div className="canvas-inner">
                <CircuitEditor
                  id={tabId}
                  active={active}
                  precision={componentPrecision}
                  nodes={project.nodes}
                  wires={project.wires}
                  selectedId={selectedId}
                  onChange={(nodes: CircuitNode[], wires: CircuitWire[]) =>
                    commit({ ...project, nodes, wires }, true)
                  }
                  onSelect={setSelectedId}
                  onDropSection={addSection}
                  fitKey={fitKey}
                />
                <div className="canvas-corner-label">
                  {project.nodes.filter((n) => n.section).length === 0
                    ? t(
                        "DEIN EXPERIMENT BEGINNT HIER",
                        "YOUR EXPERIMENT STARTS HERE",
                      )
                    : t("ANALOGE LEITERSCHALTUNG", "ANALOG LADDER CIRCUIT")}
                </div>
              </div>
              {selected && (
                <aside className="component-inspector">
                  <div className="inspector-title">
                    <h3>
                      {selected.section?.label ??
                        (selected.port === "input"
                          ? t("Tor 1", "Port 1")
                          : t("Tor 2", "Port 2"))}
                    </h3>
                    <button
                      className="icon-button"
                      onClick={() => setSelectedId(null)}
                      aria-label={t(
                        "Eigenschaften schließen",
                        "Close properties",
                      )}
                    >
                      <X size={15} />
                    </button>
                  </div>
                  {selected.section ? (
                    <>
                      <span className="inspector-type">
                        {selected.section.kind === "L"
                          ? t("Induktivität", "Inductor")
                          : selected.section.kind === "C"
                            ? t("Kapazität", "Capacitor")
                            : selected.section.kind === "R"
                              ? t("Widerstand", "Resistor")
                              : t("LC-Resonator", "LC resonator")}
                      </span>
                      <label className="field-label">
                        {selected.section.kind === "C"
                          ? t("Kapazität", "Capacitance")
                          : selected.section.kind === "R"
                            ? t("Widerstand", "Resistance")
                            : t("Induktivität", "Inductance")}
                      </label>
                      <ComponentValueInput
                        key={`${selected.id}:value`}
                        label={t("Bauteilwert", "Component value")}
                        quantity={
                          selected.section.kind === "LC"
                            ? "L"
                            : selected.section.kind
                        }
                        value={selected.section.value}
                        onChange={(value) => updateSection({ value })}
                      />
                      {selected.section.kind === "LC" && (
                        <>
                          <label className="field-label">
                            {t("Kapazität", "Capacitance")}
                          </label>
                          <ComponentValueInput
                            key={`${selected.id}:value2`}
                            label={t(
                              "Resonator-Kapazität",
                              "Resonator capacitance",
                            )}
                            quantity="C"
                            value={selected.section.value2!}
                            onChange={(value2) => updateSection({ value2 })}
                          />
                          <label className="field-label">Resonator</label>
                          <select
                            aria-label={t("Resonatorart", "Resonator type")}
                            value={selected.section.resonator}
                            onChange={(e) =>
                              updateSection({
                                resonator: e.target
                                  .value as Section["resonator"],
                              })
                            }
                          >
                            <option value="series">
                              {t("Serienresonanz", "Series resonance")}
                            </option>
                            <option value="parallel">
                              {t("Parallelresonanz", "Parallel resonance")}
                            </option>
                          </select>
                        </>
                      )}
                      <label className="field-label">
                        {t("Anordnung", "Configuration")}
                      </label>
                      <select
                        aria-label={t(
                          "Bauteilanordnung",
                          "Component configuration",
                        )}
                        value={selected.section.connection}
                        onChange={(e) =>
                          updateSection({
                            connection: e.target.value as Section["connection"],
                          })
                        }
                      >
                        <option value="series">
                          {t("Serienzweig", "Series branch")}
                        </option>
                        <option value="shunt">
                          {t("Querzweig nach Masse", "Shunt to ground")}
                        </option>
                      </select>
                      <button
                        className="delete-component"
                        onClick={removeSelected}
                      >
                        <Trash2 size={13} />{" "}
                        {t("Bauelement entfernen", "Remove component")}
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="inspector-type">
                        {t("Reelle Bezugsimpedanz", "Real reference impedance")}
                      </p>
                      <PositiveInput
                        label={t("Torimpedanz", "Port impedance")}
                        value={
                          selected.port === "input"
                            ? project.settings.impedance
                            : project.z2
                        }
                        unit="Ω"
                        min={0.01}
                        max={selected.port === "input" ? 1e6 : 1e9}
                        onChange={(n) =>
                          selected.port === "input"
                            ? commit({
                                ...project,
                                settings: { ...project.settings, impedance: n },
                              })
                            : commit({ ...project, z2: n })
                        }
                      />
                      <p className="inspector-note">
                        {t(
                          "Die S-Parameter werden mit dieser Torimpedanz neu berechnet.",
                          "S-parameters are recalculated using this port impedance.",
                        )}
                      </p>
                    </>
                  )}
                </aside>
              )}
            </div>
            <div className="circuit-caption">
              <span>
                <span className="caption-dot" />
                {evaluation.error
                  ? t(
                      "Verbinde alle Bauelemente zu einer durchgehenden Kaskade.",
                      "Connect all components into a continuous cascade.",
                    )
                  : t(
                      "Ideale Bauelemente · Änderungen werden sofort berechnet",
                      "Ideal components · changes are calculated instantly",
                    )}
              </span>
              <span>
                Z₁ = {formatEngineering(project.settings.impedance, "Ω")}
                <span className="caption-slash">/</span>Z₂ ={" "}
                {formatEngineering(project.z2, "Ω")}
              </span>
            </div>
          </section>
          <section
            className="results-panel"
            aria-label={t("Analyseergebnisse", "Analysis results")}
          >
            <div className="results-toolbar">
              <div
                className="result-tabs"
                role="tablist"
                aria-label={t("Analyseansicht", "Analysis view")}
              >
                {(
                  [
                    {
                      id: "response",
                      label: t("S-Parameter", "S-parameters"),
                      icon: Activity,
                    },
                    {
                      id: "tolerance",
                      label: t("Toleranzschema", "Tolerance mask"),
                      icon: SlidersHorizontal,
                    },
                    {
                      id: "chain",
                      label: t("Kettenmatrizen", "ABCD matrices"),
                      icon: Code2,
                    },
                    {
                      id: "polynomials",
                      label: t("Polynome", "Polynomials"),
                      icon: Waves,
                    },
                    {
                      id: "bom",
                      label: t("Bauteilliste", "Component list"),
                      icon: SlidersHorizontal,
                    },
                  ] as const
                ).map((t) => (
                  <button
                    role="tab"
                    aria-selected={resultTab === t.id}
                    className={resultTab === t.id ? "active" : ""}
                    key={t.id}
                    onClick={() => {
                      setResultTab(t.id);
                      if (t.id === "tolerance") {
                        setDesignMode("tolerance");
                        setPaletteTab("generator");
                      }
                    }}
                  >
                    <t.icon size={14} />
                    {t.label}
                  </button>
                ))}
              </div>
              <span className="auto-label">
                <span />{" "}
                {t("Automatisch aktualisiert", "Automatically updated")}
              </span>
            </div>
            {resultTab === "tolerance" ? (
              <TolerancePlot
                {...plotScales}
                spec={toleranceDraft}
                design={toleranceDesign}
                preview={tolerancePreview.analysis}
                previewError={tolerancePreview.error}
                actual={analysis}
                onChange={setToleranceDraft}
              />
            ) : !analysis ? (
              <div className="empty-analysis">
                <Activity size={31} />
                <h3>
                  {circuitIsEmpty
                    ? t(
                        "Dein Arbeitsbereich ist leer.",
                        "Your workspace is empty.",
                      )
                    : t("Verbinde deine Schaltung.", "Connect your circuit.")}
                </h3>
                <p>
                  {circuitIsEmpty
                    ? t(
                        "Füge Bauelemente aus der Bibliothek hinzu oder generiere einen neuen Filter. Mit Rückgängig stellst du die vorherige Schaltung wieder her.",
                        "Add components from the library or generate a new filter. Use Undo to restore the previous circuit.",
                      )
                    : translate(evaluation.error ?? "")}
                </p>
                <button
                  className="small-button"
                  onClick={() =>
                    circuitIsEmpty
                      ? setPaletteTab("elements")
                      : setShowHelp(true)
                  }
                >
                  {circuitIsEmpty
                    ? t("Bauelemente hinzufügen", "Add components")
                    : t(
                        "Verbindungen erklärt",
                        "How to connect components",
                      )}{" "}
                  <ArrowRight size={13} />
                </button>
              </div>
            ) : resultTab === "response" ? (
              <div className="response-content">
                <div className="response-heading">
                  <div>
                    <h2>{t("Frequenzgang", "Frequency response")}</h2>
                    <p>
                      {t(
                        "Transmission und Reflexion deiner Schaltung.",
                        "Transmission and reflection of your circuit.",
                      )}
                    </p>
                  </div>
                  <div className="segmented plot-mode">
                    <button
                      className={plotMode === "magnitude" ? "active" : ""}
                      onClick={() => setPlotMode("magnitude")}
                    >
                      {t("Betrag", "Magnitude")}
                    </button>
                    <button
                      className={plotMode === "phase" ? "active" : ""}
                      onClick={() => setPlotMode("phase")}
                    >
                      Phase
                    </button>
                  </div>
                </div>
                <ResponsePlot
                  {...plotScales}
                  analysis={analysis}
                  {...project.sweep}
                  cutoff={project.settings.cutoff}
                  band={projectBand}
                  mode={plotMode}
                  onExport={(text) =>
                    downloadFile(
                      "filterstudio-s-parameter.csv",
                      text,
                      "text/csv",
                    )
                  }
                />
                <div className="response-footer">
                  <div className="sweep-settings">
                    <span>{t("Frequenzbereich", "Frequency range")}</span>
                    <PositiveInput
                      label={t(
                        "Startfrequenz in MHz",
                        "Start frequency in MHz",
                      )}
                      value={project.sweep.min / 1e6}
                      unit="MHz"
                      min={1e-9}
                      max={(project.sweep.max / 1e6) * 0.999}
                      onChange={(n) =>
                        commit({
                          ...project,
                          sweep: { ...project.sweep, min: n * 1e6 },
                        })
                      }
                    />
                    <span>–</span>
                    <PositiveInput
                      label={t("Endfrequenz in MHz", "End frequency in MHz")}
                      value={project.sweep.max / 1e6}
                      unit="MHz"
                      min={(project.sweep.min / 1e6) * 1.001}
                      max={1e9}
                      onChange={(n) =>
                        commit({
                          ...project,
                          sweep: { ...project.sweep, max: n * 1e6 },
                        })
                      }
                    />
                  </div>
                  <div className="band-readouts">
                    {atBandEdges && (
                      <>
                        {atBandEdges.map((point, i) => (
                          <span className="cutoff-readout" key={i}>
                            {t("S₂₁ bei", "S₂₁ at")} {i === 0 ? "f₁" : "f₂"}{" "}
                            <b>{scatteringReadout(point.s21)}</b>
                          </span>
                        ))}
                      </>
                    )}
                    <span className="cutoff-readout">
                      {t("S₂₁ bei f₀", "S₂₁ at f₀")}{" "}
                      <b>
                        {scatteringReadout(atCutoff?.s21)}
                      </b>
                    </span>
                  </div>
                </div>
              </div>
            ) : resultTab === "chain" ? (
              <div className="math-content">
                <div className="math-intro">
                  <h2>
                    {t(
                      "Von Bauelementen zur Kettenmatrix",
                      "From components to the ABCD matrix",
                    )}
                  </h2>
                  <p>
                    {t(
                      "Die Reihenfolge entspricht dem Signalweg von Tor 1 zu Tor 2.",
                      "The order follows the signal path from port 1 to port 2.",
                    )}
                  </p>
                  <Formula
                    latex={
                      "\\begin{pmatrix}V_1\\\\I_1\\end{pmatrix}=\\mathbf{M}\\begin{pmatrix}V_2\\\\-I_2\\end{pmatrix},\\qquad \\mathbf{M}=\\mathbf{M}_1\\mathbf{M}_2\\cdots\\mathbf{M}_N"
                    }
                  />
                  <span className="normalization">
                    p = s / (2π · {formatEngineering(analysis.fRef, "Hz")}
                    {t(
                      ") · Ströme an beiden Toren ins Zweitor",
                      ") · currents enter the network at both ports",
                    )}
                  </span>
                  <p>
                    {t(
                      "Die Teilmatrizen zeigen die gespeicherten Bauteilwerte und deren Einsetzung in SI-Einheiten. ≈ kennzeichnet zur Anzeige auf sieben signifikante Stellen gerundete Koeffizienten; gerechnet wird mit voller Zahlenpräzision. Die Indizes Rᵢ, Lᵢ und Cᵢ beziehen sich auf die jeweilige Teilmatrix.",
                      "Section matrices show the stored component values and their substitution in SI units. ≈ marks coefficients rounded to seven significant digits for display; calculations use full numeric precision. The indices Rᵢ, Lᵢ and Cᵢ refer to the corresponding section matrix.",
                    )}
                  </p>
                </div>
                <MathView
                  title={t(
                    "Gesamte Kettenmatrix M(p)",
                    "Overall ABCD matrix M(p)",
                  )}
                  latex={analysis.latex.abcd}
                  description={t(
                    "A und D dimensionslos · B in Ω · C in S",
                    "A and D dimensionless · B in Ω · C in S",
                  )}
                />
                {analysis.sectionDerivations.map((derivation, i) => (
                  <SectionMatrixView
                    key={evaluation.sections[i].id}
                    section={evaluation.sections[i]}
                    index={i + 1}
                    derivation={derivation}
                  />
                ))}
              </div>
            ) : resultTab === "polynomials" ? (
              <div className="math-content">
                <div className="math-intro">
                  <h2>
                    {t(
                      "Charakteristische Funktion und S-Polynome",
                      "Characteristic function and S-polynomials",
                    )}
                  </h2>
                  <p>
                    {t(
                      "Approximationsfunktion Fₙ(Ω) des Prototyps sowie charakteristische Funktion Ψ(p) und S-Polynome der aktuellen Schaltung.",
                      "Prototype approximation function Fₙ(Ω), plus the characteristic function Ψ(p) and S-polynomials of the current circuit.",
                    )}
                  </p>
                  <span className="normalization">
                    p = s / (2π · {formatEngineering(analysis.fRef, "Hz")}
                    {t(
                      ") · p = j f / f₀ auf der Frequenzachse",
                      ") · p = j f / f₀ along the frequency axis",
                    )}
                  </span>
                </div>
                <ApproximationView
                  approximation={approximation}
                  settings={project.settings}
                  matchesPrototype={matchesPrototype}
                />
                <h3 className="circuit-polynomials-heading">
                  {t(
                    "Polynome der aktuellen Schaltung",
                    "Polynomials of the current circuit",
                  )}
                </h3>
                <MathView
                  title={t(
                    "Charakteristische Funktion Ψ(p)",
                    "Characteristic function Ψ(p)",
                  )}
                  latex={analysis.latex.characteristic}
                  description={t(
                    "Quotient aus Eingangsreflexion und Transmission der aktuellen Schaltung. Der gemeinsame Nenner D(p) kürzt sich; Bauteilwerte und beide Torimpedanzen gehen ein.",
                    "Ratio of input reflection to transmission for the current circuit. The common denominator D(p) cancels; component values and both port impedances are included.",
                  )}
                />
                {analysis.latex.characteristicResponse ? (
                  <MathView
                    title={t(
                      "Zusammenhang mit dem Frequenzgang",
                      "Relationship to the frequency response",
                    )}
                    latex={analysis.latex.characteristicResponse}
                    description={t(
                      "Für diese verlustlose LC-Schaltung gilt |S₁₁|² + |S₂₁|² = 1. An Nullstellen von S₂₁ besitzt Ψ gegebenenfalls einen Pol; gemeinsame Faktoren sind als Grenzwert zu behandeln.",
                      "For this lossless LC circuit, |S₁₁|² + |S₂₁|² = 1. Ψ may have poles at transmission zeros; common factors must be evaluated by their limit.",
                    )}
                  />
                ) : (
                  <p className="approximation-status is-reference">
                    {t(
                      "Die Schaltung enthält Widerstände. Ψ(p) bleibt der Quotient S₁₁/S₂₁; die verlustlose Beziehung |S₂₁|² = 1/(1 + |Ψ|²) gilt hier nicht. Den Dämpfungsverlauf bestimmt die vollständige S-Matrix.",
                      "The circuit contains resistors. Ψ(p) remains the ratio S₁₁/S₂₁; the lossless relation |S₂₁|² = 1/(1 + |Ψ|²) does not apply here. The attenuation response is determined by the full S-matrix.",
                    )}
                  </p>
                )}
                <MathView
                  title={t("Streumatrix S(p)", "Scattering matrix S(p)")}
                  latex={analysis.latex.s}
                  description={`${t("Jeder Eintrag ist Sᵢⱼ(p) = Nᵢⱼ(p)/D(p). Die Zählerpolynome und der gemeinsame Nenner sind unten einzeln angegeben. Für diese reziproke Schaltung gilt N₁₂(p) = N₂₁(p).", "Each entry is Sᵢⱼ(p) = Nᵢⱼ(p)/D(p). The numerator polynomials and common denominator are listed separately below. For this reciprocal circuit, N₁₂(p) = N₂₁(p).")} ${t("Leistungswellen", "Power waves")} · Z₁ = ${formatEngineering(analysis.z1, "Ω")} · Z₂ = ${formatEngineering(analysis.z2, "Ω")}`}
                />
                {([
                  ["s11", "N₁₁(p)"],
                  ["s12", "N₁₂(p)"],
                  ["s21", "N₂₁(p)"],
                  ["s22", "N₂₂(p)"],
                ] as const).map(([key, label]) => (
                  <MathView
                    key={key}
                    title={`${t("Zählerpolynom", "Numerator polynomial")} ${label}`}
                    latex={analysis.latex.numerators[key]}
                  />
                ))}
                <MathView
                  title={t(
                    "Gemeinsames Nennerpolynom D(p)",
                    "Common denominator polynomial D(p)",
                  )}
                  latex={analysis.latex.denominator}
                />
                <div className="polynomial-table">
                  <h3>
                    {t("Polynomkoeffizienten", "Polynomial coefficients")}
                  </h3>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>{t("Potenz", "Power")}</th>
                          <th>D(p)</th>
                          <th>N₁₁(p)</th>
                          <th>N₁₂(p)</th>
                          <th>N₂₁(p)</th>
                          <th>N₂₂(p)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from(
                          {
                            length: Math.max(
                              analysis.denominator.length,
                              ...Object.values(analysis.numerators).map(
                                (p) => p.length,
                              ),
                            ),
                          },
                          (_, i) => (
                            <tr key={i}>
                              <td>
                                p<sup>{i}</sup>
                              </td>
                              {[
                                analysis.denominator,
                                analysis.numerators.s11,
                                analysis.numerators.s12,
                                analysis.numerators.s21,
                                analysis.numerators.s22,
                              ].map((p, j) => (
                                <td key={j}>
                                  {Number(
                                    (p[i] ?? 0).toPrecision(8),
                                  ).toString()}
                                </td>
                              ))}
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="table-note">
                    {t(
                      "Koeffizienten numerisch in doppelter Genauigkeit. Gemeinsame Faktoren können erhalten bleiben; die Darstellung ist nicht zwingend minimal.",
                      "Coefficients use double-precision arithmetic. Common factors may remain; the representation is not necessarily minimal.",
                    )}{" "}
                    {projectBand &&
                      t(
                        "Bei schmalen Bandfiltern können ausmultiplizierte Polynome numerisch empfindlich sein. Der Frequenzgang wird direkt aus den einzelnen Zweitoren berechnet.",
                        "Expanded polynomials can be numerically sensitive for narrow-band filters. The frequency response is calculated directly from the individual two-port sections.",
                      )}
                  </p>
                </div>
              </div>
            ) : (
              <div className="bom-content">
                <div className="response-heading">
                  <div>
                    <h2>
                      {t(
                        "Bauelemente im Signalweg",
                        "Components along the signal path",
                      )}
                    </h2>
                    <p>
                      {t(
                        "Werte der aktuellen Schaltung, in physikalischen Einheiten.",
                        "Values in the current circuit, in physical units.",
                      )}
                    </p>
                  </div>
                  <button
                    className="small-button"
                    onClick={() =>
                      downloadFile(
                        t(
                          "filterstudio-bauelemente.csv",
                          "filterstudio-components.csv",
                        ),
                        [
                          t(
                            "Bezeichnung,Typ,Anordnung,Wert_SI,Kapazitaet_F",
                            "Label,Type,Configuration,Value_SI,Capacitance_F",
                          ),
                          ...evaluation.sections.map((s) =>
                            [
                              s.label ?? s.id,
                              s.kind,
                              s.connection,
                              s.value,
                              s.value2 ?? "",
                            ].join(","),
                          ),
                        ].join("\n"),
                        "text/csv",
                      )
                    }
                  >
                    <Download size={14} /> CSV
                  </button>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{t("Bauelement", "Component")}</th>
                        <th>{t("Typ", "Type")}</th>
                        <th>{t("Anordnung", "Configuration")}</th>
                        <th>{t("Wert", "Value")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evaluation.sections.map((s, i) => (
                        <tr
                          key={s.id}
                          onClick={() => setSelectedId(s.id)}
                          className="clickable-row"
                        >
                          <td>
                            <b>{s.label ?? `Z${i + 1}`}</b>
                          </td>
                          <td>
                            {s.kind === "LC"
                              ? s.resonator === "series"
                                ? t("LC-Serienkreis", "Series LC resonator")
                                : t("LC-Parallelkreis", "Parallel LC resonator")
                              : s.kind === "L"
                                ? t("Induktivität", "Inductor")
                                : s.kind === "C"
                                  ? t("Kapazität", "Capacitor")
                                  : t("Widerstand", "Resistor")}
                          </td>
                          <td>
                            {s.connection === "series"
                              ? t("Serienzweig", "Series branch")
                              : t("Querzweig", "Shunt branch")}
                          </td>
                          <td>
                            {formatComponentLabel(
                              s.value,
                              s.kind === "LC" ? "L" : s.kind,
                              language,
                              componentPrecision,
                            )}
                            {s.kind === "LC" &&
                              ` / ${formatComponentLabel(s.value2!, "C", language, componentPrecision)}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="bom-note">
                  <Info size={16} />
                  <p>
                    {t(
                      "Ideales konzentriertes RLC-Modell. Bauteiltoleranzen, parasitäre Effekte und Verluste realer Spulen und Kondensatoren sind nicht enthalten.",
                      "Ideal lumped-element RLC model. Component tolerances, parasitics, and losses in real inductors and capacitors are not included.",
                    )}
                  </p>
                </div>
              </div>
            )}
          </section>
          <footer className="workspace-footer">
            <span>
              <span className="tiny-brand">ƒ</span>{" "}
              {t(
                "Ein Werkzeug zum Entdecken und Verstehen.",
                "A tool for exploration and understanding.",
              )}
            </span>
            <button onClick={() => setShowHelp(true)}>
              {t("Modell & Methoden", "Model & methods")}{" "}
              <ArrowRight size={12} />
            </button>
            <span>
              {remoteConnected ? t("Mit lokalem Server verbunden.", "Connected to the local server.") : t(
                "Kein Server. Deine Daten bleiben hier.",
                "No server. Your data stays here.",
              )}
            </span>
          </footer>
        </div>
      </main>
      </section>
      {active && toast && (
        <div className="toast" role="status">
          <Info size={17} />
          <span>{translate(toast)}</span>
          <button
            aria-label={t("Hinweis schließen", "Dismiss notification")}
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {active && showHelp && (
        <div className="modal-backdrop" onClick={() => setShowHelp(false)}>
          <section
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label={t("Hilfe schließen", "Close help")}
              onClick={() => setShowHelp(false)}
            >
              <X size={20} />
            </button>
            <span className="section-eyebrow">
              {t("DAS KLEINE FILTERLABOR", "YOUR ANALOG FILTER LAB")}
            </span>
            <h2 id="help-title">
              {t(
                "Ausprobieren. Beobachten. Verstehen.",
                "Experiment. Observe. Understand.",
              )}
            </h2>
            <p className="help-lead">
              {t(
                "Filterstudio verbindet eine editierbare Schaltung mit ihrer mathematischen Beschreibung. Alle Ergebnisse entstehen direkt in deinem Browser.",
                "Filterstudio connects an editable circuit to its mathematical description. All results are computed directly in your browser.",
              )}
            </p>
            <div className="help-steps">
              <article>
                <span>01</span>
                <h3>{t("Entwirf einen Filter", "Design a filter")}</h3>
                <p>
                  {t(
                    "Wähle die Charakteristik und die Parameter. „Schaltung generieren“ erstellt eine LC-Leiter und ersetzt die aktuelle Schaltung. Rückgängig bringt sie zurück.",
                    "Choose the characteristic and parameters. Generate circuit creates an LC ladder and replaces the current circuit. Undo restores it.",
                  )}
                </p>
              </article>
              <article>
                <span>02</span>
                <h3>{t("Verändere die Schaltung", "Modify the circuit")}</h3>
                <p>
                  {t(
                    "Klicke ein Bauelement an, um seinen Wert zu ändern. Ziehe neue Elemente auf die Fläche. Klicke eine Verbindung an und drücke Entf; ziehe danach von einem rechten Anschluss zum nächsten linken Anschluss. Ein Klick in der Palette fügt direkt vor Tor 2 ein.",
                    "Select a component to change its value. Drag new elements onto the canvas. Select a connection and press Delete; then drag from a right-hand terminal to the next left-hand terminal. Clicking a palette item inserts it immediately before port 2.",
                  )}
                </p>
              </article>
              <article>
                <span>03</span>
                <h3>{t("Untersuche das Ergebnis", "Explore the result")}</h3>
                <p>
                  {t(
                    "S₂₁ beschreibt die Transmission, S₁₁ die Eingangsreflexion. Die übrigen Parameter zeigen die Gegenrichtung. LaTeX und Koeffizienten stehen in den Ergebnistabs bereit.",
                    "S₂₁ describes transmission and S₁₁ input reflection. The other parameters describe the reverse direction. LaTeX and coefficients are available in the results tabs.",
                  )}
                </p>
              </article>
            </div>
            <div className="help-methods">
              <h3>{t("Das verwendete Modell", "The underlying model")}</h3>
              <p>
                {t(
                  "Serienimpedanzen und Queradmittanzen werden als Zweitore mit gemeinsamer Masse kaskadiert. Jedes Tor besitzt einen Signal- und einen Masseanschluss. Die durchgehende untere Masseleitung verbindet beide Tore und alle Querzweige. Die Signalverbindungen bestimmen die Reihenfolge. Freie Brückenschaltungen und Rückkopplungen sind nicht Teil dieses Editors.",
                  "Series impedances and shunt admittances are cascaded as two-port networks with a common ground. Each port has a signal terminal and a return terminal. The continuous bottom return connects both ports and every shunt branch. Signal connections determine their order. Arbitrary bridge circuits and feedback loops are outside this editor’s scope.",
                )}
              </p>
              <p>
                {t(
                  "Beim Tief- und Hochpass ist f₀ bei Butterworth die −3,01-dB-Grenze; bei Chebyshev I und Cauer die Durchlassgrenze mit der gewählten Welligkeit. Bei Chebyshev gerader Ordnung wird die erforderliche Ausgangsimpedanz automatisch eingestellt. Butterworth und Chebyshev unterstützen n = 1–20, Cauer die ungeraden Prototypordnungen 3–19. Die LC-Werte werden numerisch synthetisiert und geprüft.",
                  "For low-pass and high-pass filters, f₀ is the −3.01 dB cutoff for Butterworth and the specified passband edge for Chebyshev I and elliptic filters. Even-order Chebyshev filters automatically receive the required output impedance. Butterworth and Chebyshev support n = 1–20; elliptic filters support odd prototype orders 3–19. LC values are numerically synthesized and verified.",
                )}
              </p>
              <p>
                {t(
                  "Bandpass und Bandsperre verwenden zwei Bandgrenzen f₁ und f₂. Es gilt f₀ = √(f₁ f₂) und B = f₂ − f₁. Die Grenzen liegen bei Butterworth bei −3,01 dB und bei Chebyshev I/Cauer bei −Rₚ dB. Beim Bandpass liegt der Durchlass zwischen den Grenzen, bei der Bandsperre außerhalb. Die Filterordnung verdoppelt sich gegenüber dem Tiefpass-Prototyp auf 2n; die normierte Polynomvariable bleibt p = s/(2πf₀).",
                  "Band-pass and band-stop filters use two band edges, f₁ and f₂, with f₀ = √(f₁ f₂) and B = f₂ − f₁. The edges are at −3.01 dB for Butterworth and −Rₚ dB for Chebyshev I and elliptic filters. Band-pass filters transmit between the edges; band-stop filters transmit outside them. The filter order doubles to 2n relative to the low-pass prototype; the normalized polynomial variable remains p = s/(2πf₀).",
                )}
              </p>
              <p>
                {t(
                  "Die Kettenmatrix verknüpft [V₁, I₁] mit [V₂, −I₂]. Die S-Matrix verwendet Leistungswellen mit reellen positiven Bezugsimpedanzen. Für die idealen reziproken Bauelemente gilt S₁₂ = S₂₁. Die Polynome sind in p = s/(2πf₀) normiert.",
                  "The ABCD matrix relates [V₁, I₁] to [V₂, −I₂]. The S-matrix uses power waves with real, positive reference impedances. The ideal reciprocal components satisfy S₁₂ = S₂₁. Polynomials are normalized using p = s/(2πf₀).",
                )}
              </p>
              <p>
                {t(
                  "Die Anzeige ist eine Modellrechnung mit Gleitkommazahlen, kein Nachweis für reale Bauteile. Änderungen werden erst durch einen JSON-Download dauerhaft gesichert.",
                  "This is a floating-point model calculation, not validation of physical components. Download a JSON project to save your circuit changes permanently.",
                )}
              </p>
              <div className="source-links">
                <a
                  href="https://eceweb1.rutgers.edu/~orfanidi/intro2sp/2e/orfanidis-isp2e-1up.pdf"
                  target="_blank"
                  rel="noreferrer"
                >
                  Orfanidis · Elliptic Filter Design ↗
                </a>
                <a
                  href="https://eng.libretexts.org/Bookshelves/Electrical_Engineering/Electronics/Microwave_and_RF_Design_III_-_Networks_(Steer)/02%3A_Chapter_2/2.7%3A_Scattering_Parameter_Two-Port_Relationships"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t(
                    "Steer · Zweitorparameter ↗",
                    "Steer · Two-port parameters ↗",
                  )}
                </a>
              </div>
            </div>
            <button
              className="button primary"
              onClick={() => setShowHelp(false)}
            >
              {t("Zurück ins Studio", "Back to the studio")}{" "}
              <ArrowRight size={15} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
});
