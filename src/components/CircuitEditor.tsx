import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  ViewportPortal,
  Position,
  useReactFlow,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeProps,
  type Connection,
} from "@xyflow/react";
import type { CircuitNode, CircuitWire, ComponentPrecision, Section } from "../lib/types";
import { usePreferences } from "../lib/preferences";
import { formatComponentLabel, type ComponentQuantity } from "../lib/component-units";
import {
  CIRCUIT_GRID,
  CIRCUIT_SNAP_GRID,
  droppedComponentPosition,
  snapCircuitPosition,
} from "../lib/circuit-layout";
import {
  CIRCUIT_NODE_HEIGHT,
  COMPONENT_WIDTH,
  GROUND_CLEARANCE,
  groundGeometry,
  LOAD_BRANCH_X,
  PORT_WIDTH,
  shuntGeometry,
  SIGNAL_Y,
  SOURCE_BRANCH_X,
  type GroundGeometry,
} from "../lib/ground-geometry";
import "@xyflow/react/dist/style.css";
import "./CircuitEditor.css";

type CircuitData = {
  section?: Section;
  port?: "input" | "output";
  returnY?: number;
  precision: ComponentPrecision;
  index: number;
  [key: string]: unknown;
};
type FlowNode = Node<CircuitData, "circuit" | "groundBounds">;
export type CircuitEditorProps = {
  id: string;
  active: boolean;
  precision: ComponentPrecision;
  nodes: CircuitNode[];
  wires: CircuitWire[];
  selectedId: string | null;
  onChange: (nodes: CircuitNode[], wires: CircuitWire[]) => void;
  onSelect: (id: string | null) => void;
  onDropSection: (kind: string, position: { x: number; y: number }) => void;
  fitKey: number;
};

function Glyph({
  kind,
  x,
  y,
  rotation = 0,
  scale = 1,
}: {
  kind: "R" | "L" | "C";
  x: number;
  y: number;
  rotation?: number;
  scale?: number;
}) {
  const { circuitSymbols } = usePreferences();
  const european = circuitSymbols === "european";
  return (
    <g
      transform={`translate(${x} ${y}) rotate(${rotation}) scale(${scale})`}
      className="circuit-glyph"
    >
      {kind === "R" && (
        <>
          <path d="M-30 0H-23M23 0H30" />
          {european
            ? <rect x="-23" y="-8" width="46" height="16" />
            : <path d="M-23 0l2.3-8 4.6 16 4.6-16 4.6 16 4.6-16 4.6 16 4.6-16 4.6 16 4.6-16 4.6 16 2.3-8" />}
        </>
      )}
      {kind === "C" && <path d="M-30 0H-5M5 0H30M-5-13V13M5-13V13" />}
      {kind === "L" && (european ? <>
        <path d="M-30 0H-23M23 0H30" />
        <path d="M-23-8H23V8H-23Z" fill="currentColor" />
      </> : <path d="M-30 0h2c0-15 14-15 14 0c0-15 14-15 14 0c0-15 14-15 14 0c0-15 14-15 14 0h2" />)}
    </g>
  );
}
function ComponentSymbol({
  section,
  returnY,
}: {
  section: Section;
  returnY: number;
}) {
  const isShunt = section.connection === "shunt";
  const { centerY, terminalY } = shuntGeometry(returnY);
  if (section.kind !== "LC")
    return isShunt ? (
      <>
        <path
          d={`M0 48H126M63 48V${centerY - 21}M63 ${centerY + 21}V${terminalY}`}
        />
        <circle cx="63" cy="48" r="2.6" className="junction" />
        <Glyph
          kind={section.kind}
          x={63}
          y={centerY}
          rotation={90}
          scale={0.7}
        />
      </>
    ) : (
      <>
        <path d="M0 48H33M93 48H126" />
        <Glyph kind={section.kind} x={63} y={48} />
      </>
    );
  const parallel = section.resonator === "parallel";
  if (isShunt && !parallel)
    return (
      <>
        <path
          d={`M0 48H126M63 48V${centerY - 26.4}M63 ${centerY + 26.4}V${terminalY}`}
        />
        <circle cx="63" cy="48" r="2.6" className="junction" />
        <Glyph kind="L" x={63} y={centerY - 13.2} rotation={90} scale={0.44} />
        <Glyph kind="C" x={63} y={centerY + 13.2} rotation={90} scale={0.44} />
      </>
    );
  if (isShunt)
    return (
      <>
        <path
          d={`M0 48H126M63 48V${centerY - 20}M42 ${centerY - 20}H84M42 ${centerY + 20}H84M63 ${centerY + 20}V${terminalY}`}
        />
        <circle cx="63" cy="48" r="2.6" className="junction" />
        <Glyph kind="L" x={42} y={centerY} rotation={90} scale={2 / 3} />
        <Glyph kind="C" x={84} y={centerY} rotation={90} scale={2 / 3} />
      </>
    );
  if (parallel)
    return (
      <>
        <path d="M0 48H28V29H33M28 48V67H33M93 29H98V67H93M98 48H126" />
        <Glyph kind="L" x={63} y={29} />
        <Glyph kind="C" x={63} y={67} />
        <circle cx="28" cy="48" r="2" className="junction" />
        <circle cx="98" cy="48" r="2" className="junction" />
      </>
    );
  return (
    <>
      <path d="M0 48H7M119 48H126" />
      <Glyph kind="L" x={35} y={48} scale={0.93} />
      <Glyph kind="C" x={91} y={48} scale={0.93} />
    </>
  );
}

function PortTermination({ input, returnY }: { input: boolean; returnY: number }) {
  const centerY = (SIGNAL_Y + returnY) / 2;
  if (input) {
    const resistorX = (SOURCE_BRANCH_X + 24) / 2;
    return <g className="port-termination">
      <path d={`M${SOURCE_BRANCH_X} ${centerY - 18}V${SIGNAL_Y}H${resistorX - 24}M${resistorX + 24} ${SIGNAL_Y}H19M${SOURCE_BRANCH_X} ${centerY + 18}V${returnY}H19`} />
      <Glyph kind="R" x={resistorX} y={SIGNAL_Y} scale={0.8} />
      <text x={resistorX} y={SIGNAL_Y - 18} textAnchor="middle">R1</text>
      <circle className="voltage-source" cx={SOURCE_BRANCH_X} cy={centerY} r="18" />
      <path d={`M${SOURCE_BRANCH_X - 10} ${centerY}c3-9 7-9 10 0s7 9 10 0`} />
      <text x={SOURCE_BRANCH_X - 27} y={centerY + 4} textAnchor="end">Vₛ</text>
    </g>;
  }
  return <g className="port-termination">
    <path d={`M57 ${SIGNAL_Y}H${LOAD_BRANCH_X}V${centerY - 24}M${LOAD_BRANCH_X} ${centerY + 24}V${returnY}H57`} />
    <Glyph kind="R" x={LOAD_BRANCH_X} y={centerY} rotation={90} scale={0.8} />
    <text x={LOAD_BRANCH_X + 18} y={centerY + 4}>R2</text>
  </g>;
}

function CircuitComponent({ data, selected }: NodeProps<FlowNode>) {
  const { t, language, showSourceAndLoad } = usePreferences();
  if (data.port) {
    const input = data.port === "input",
      terminalX = input ? 24 : 52,
      arrowX = input ? 10 : 66,
      returnY = data.returnY ?? CIRCUIT_NODE_HEIGHT,
      portHeight = returnY + 12;
    return (
      <div
        className={`circuit-port ${input ? "input" : "output"}`}
        style={{ height: portHeight }}
        aria-label={
          input
            ? showSourceAndLoad ? t(
                "Tor 1, Eingang mit Signal- und Masseanschluss sowie Spannungsquelle und Innenwiderstand R1",
                "Port 1, input with signal and return terminals, voltage source and source resistance R1",
              ) : t(
                "Tor 1, Eingang mit Signal- und Masseanschluss",
                "Port 1, input with signal and return terminals",
              )
            : showSourceAndLoad ? t(
                "Tor 2, Ausgang mit Signal- und Masseanschluss sowie Lastwiderstand R2",
                "Port 2, output with signal and return terminals and load resistance R2",
              ) : t(
                "Tor 2, Ausgang mit Signal- und Masseanschluss",
                "Port 2, output with signal and return terminals",
              )
        }
      >
        <span className="circuit-port-label">
          {t("TOR", "PORT")} {input ? "1" : "2"}
        </span>
        <span className="circuit-port-caption">
          {input ? t("Eingang", "Input") : t("Ausgang", "Output")}
        </span>
        <svg
          width={PORT_WIDTH}
          height={portHeight}
          viewBox={`0 0 ${PORT_WIDTH} ${portHeight}`}
          aria-hidden="true"
        >
          {showSourceAndLoad && <PortTermination input={input} returnY={returnY} />}
          <path
            className="port-conductor"
            d={input ? "M29 48H76" : "M0 48H47"}
          />
          <circle
            className="port-terminal signal-terminal"
            cx={terminalX}
            cy={SIGNAL_Y}
            r="5"
          />
          <path
            className="port-voltage-arrow"
            d={`M${arrowX} ${SIGNAL_Y + 15}V${returnY - 14}m-3-4 3 4 3-4`}
          />
          <text
            className="port-voltage-label"
            x={input ? 28 : 48}
            y={(SIGNAL_Y + returnY) / 2 + 4}
            textAnchor="middle"
          >
            V{input ? "₁" : "₂"}
          </text>
          <text className="port-polarity" x={arrowX} y="52" textAnchor="middle">
            +
          </text>
          <text
            className="port-polarity"
            x={arrowX}
            y={returnY + 4}
            textAnchor="middle"
          >
            −
          </text>
        </svg>
        <Handle
          type={input ? "source" : "target"}
          position={input ? Position.Right : Position.Left}
          style={{ top: SIGNAL_Y }}
        />
      </div>
    );
  }
  const section = data.section!;
  const returnY = data.returnY ?? CIRCUIT_NODE_HEIGHT + GROUND_CLEARANCE;
  const componentHeight =
    section.connection === "shunt"
      ? shuntGeometry(returnY).terminalY + 12
      : CIRCUIT_NODE_HEIGHT;
  const label = section.label || `${section.kind}${data.index}`;
  const values: { value: number; quantity: ComponentQuantity }[] = [
    { value: section.value, quantity: section.kind === "LC" ? "L" : section.kind },
    ...(section.kind === "LC" ? [{ value: section.value2!, quantity: "C" as const }] : []),
  ];
  const exactValue = values.map(({ value, quantity }) =>
    formatComponentLabel(value, quantity, language, "full"),
  ).join(" / ");
  const precise = data.precision === "full" || data.precision > 8;
  return (
    <div
      className={`circuit-component ${selected ? "is-selected" : ""} ${section.connection === "shunt" ? "is-shunt" : ""} ${section.kind === "LC" ? "is-resonator" : ""} ${precise ? "precise-values" : ""}`}
      style={{ height: componentHeight }}
      title={`${label}: ${exactValue} · ${section.connection === "series" ? t("Serienzweig", "Series branch") : t("Querzweig", "Shunt branch")}`}
    >
      <span className="circuit-component-label">{label}</span>
      <svg
        width={COMPONENT_WIDTH}
        height={componentHeight}
        viewBox={`0 0 ${COMPONENT_WIDTH} ${componentHeight}`}
        aria-hidden="true"
      >
        <ComponentSymbol section={section} returnY={returnY} />
      </svg>
      <span className="circuit-component-value">
        {values.map(({ value, quantity }) => (
          <span key={quantity}>{formatComponentLabel(value, quantity, language, data.precision)}</span>
        ))}
      </span>
      <Handle
        type="target"
        position={Position.Left}
        style={{ top: SIGNAL_Y }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ top: SIGNAL_Y }}
      />
    </div>
  );
}

function GroundBounds() {
  return <div className="ground-bounds" />;
}
const nodeTypes = { circuit: CircuitComponent, groundBounds: GroundBounds };

function GroundRail({ geometry }: { geometry: GroundGeometry }) {
  const { t } = usePreferences();
  const { rail, connections, bounds } = geometry;
  const label = t(
    "Durchgehende gemeinsame Masseleitung beider Tore und aller Querzweige",
    "Continuous common return connecting both ports and every shunt branch",
  );
  return (
    <ViewportPortal>
      <svg
        className="circuit-ground-layer"
        width={bounds.width}
        height={bounds.height}
        viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
        style={{ left: bounds.x, top: bounds.y }}
        role="img"
        aria-label={label}
      >
        <title>{label}</title>
        <path
          className="common-return-rail"
          d={`M${rail.left} ${rail.y}H${rail.right}`}
        />
        {connections
          .filter((connection) => connection.kind === "shunt")
          .map((connection) => (
            <g key={connection.nodeId}>
              <path
                className="return-lead"
                d={`M${connection.x} ${connection.fromY}V${rail.y}`}
              />
              <circle
                className="return-junction"
                cx={connection.x}
                cy={rail.y}
                r="2.2"
              />
            </g>
          ))}
        {connections
          .filter((connection) => connection.kind === "port")
          .map((connection) => (
            <circle
              key={connection.nodeId}
              className="port-terminal return-terminal"
              cx={connection.x}
              cy={rail.y}
              r="5"
            />
          ))}
      </svg>
    </ViewportPortal>
  );
}

function Canvas(props: CircuitEditorProps) {
  const {
    id,
    active,
    precision,
    nodes,
    wires,
    selectedId,
    onChange,
    onSelect,
    onDropSection,
    fitKey,
  } = props;
  const { t, theme, number, showSourceAndLoad } = usePreferences();
  const { screenToFlowPosition, fitView } = useReactFlow<FlowNode>();
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);
  const lastFit = useRef<{ key: number; showSourceAndLoad: boolean } | null>(null);
  const modelRef = useRef({ nodes, wires });
  modelRef.current = { nodes, wires };
  const commit = (nextNodes: CircuitNode[], nextWires: CircuitWire[]) => {
    modelRef.current = { nodes: nextNodes, wires: nextWires };
    onChange(nextNodes, nextWires);
  };
  const ground = useMemo(() => groundGeometry(nodes, showSourceAndLoad), [nodes, showSourceAndLoad]);
  const boundsId = useMemo(() => {
    let id = "__filterstudio_ground_bounds";
    while (nodes.some((node) => node.id === id)) id += "_";
    return id;
  }, [nodes]);
  const flowNodes = useMemo<FlowNode[]>(() => {
    const modelNodes: FlowNode[] = nodes.map((n, i) => ({
      id: n.id,
      type: "circuit",
      position: { x: n.x, y: n.y },
      measured: {
        width: n.port ? PORT_WIDTH : COMPONENT_WIDTH,
        height:
          n.port && ground
            ? ground.rail.y - n.y + 12
            : n.section?.connection === "shunt" && ground
              ? shuntGeometry(ground.rail.y - n.y).terminalY + 12
              : CIRCUIT_NODE_HEIGHT,
      },
      data: {
        precision,
        section: n.section,
        port: n.port,
        index: i,
        returnY: ground ? ground.rail.y - n.y : undefined,
      },
      selected: selectedId === n.id,
      deletable: !n.port,
      domAttributes: {
        "aria-roledescription": n.port
          ? t("Tor", "port")
          : t("Bauelement", "component"),
      },
      ariaLabel: n.port
        ? `${t("Tor", "Port")} ${n.port === "input" ? "1" : "2"}, ${t("Signal- und Masseanschluss", "signal and return terminals")}`
        : `${n.section?.label ?? n.section?.kind}, ${n.section?.connection === "series" ? t("Serienzweig", "series branch") : t("Querzweig", "shunt branch")}`,
    }));
    if (ground)
      modelNodes.push({
        id: boundsId,
        type: "groundBounds",
        position: { x: ground.bounds.x, y: ground.bounds.y },
        data: { index: -1, precision },
        width: ground.bounds.width,
        height: ground.bounds.height,
        measured: { width: ground.bounds.width, height: ground.bounds.height },
        style: {
          width: ground.bounds.width,
          height: ground.bounds.height,
          opacity: 0,
          pointerEvents: "none",
        },
        zIndex: -1,
        selectable: false,
        draggable: false,
        connectable: false,
        deletable: false,
        focusable: false,
        domAttributes: { "aria-hidden": true },
      });
    return modelNodes;
  }, [nodes, selectedId, ground, boundsId, t, precision]);
  const flowEdges = useMemo<Edge[]>(() => {
    const label = (id: string) => {
      const node = nodes.find((n) => n.id === id);
      return node?.port
        ? `${t("Tor", "Port")} ${node.port === "input" ? "1" : "2"}`
        : (node?.section?.label ?? node?.section?.kind ?? id);
    };
    return wires.map((w) => ({
      ...w,
      type: "smoothstep",
      selected: selectedEdges.includes(w.id),
      style: { strokeWidth: 1.6 },
      interactionWidth: 18,
      domAttributes: { "aria-roledescription": t("Verbindung", "connection") },
      ariaLabel: `${t("Verbindung von", "Connection from")} ${label(w.source)} ${t("nach", "to")} ${label(w.target)}`,
    }));
  }, [wires, selectedEdges, nodes, t]);
  useEffect(() => {
    if (!active || (lastFit.current?.key === fitKey && lastFit.current.showSourceAndLoad === showSourceAndLoad)) return;
    const timer = window.setTimeout(() => {
      lastFit.current = { key: fitKey, showSourceAndLoad };
      void fitView({
        duration: 320,
        padding: 0.18,
        maxZoom: 1.18,
        minZoom: 0.005,
      });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [active, fitKey, fitView, showSourceAndLoad]);

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const { source, target } = connection;
      if (
        !source ||
        !target ||
        source === target ||
        wires.some((w) => w.source === source || w.target === target)
      )
        return false;
      const sourceNode = nodes.find((n) => n.id === source),
        targetNode = nodes.find((n) => n.id === target);
      if (
        !sourceNode ||
        !targetNode ||
        sourceNode.port === "output" ||
        targetNode.port === "input"
      )
        return false;
      let current = target;
      const visited = new Set<string>();
      while (current && !visited.has(current)) {
        if (current === source) return false;
        visited.add(current);
        current = wires.find((w) => w.source === current)?.target ?? "";
      }
      return true;
    },
    [nodes, wires],
  );

  return (
    <div
      className="circuit-canvas"
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        event.preventDefault();
        const kind = event.dataTransfer.getData("application/filterstudio");
        if (!kind) return;
        const position = screenToFlowPosition(
          { x: event.clientX, y: event.clientY },
          { snapToGrid: false },
        );
        onDropSection(
          kind,
          droppedComponentPosition(position, modelRef.current.nodes),
        );
      }}
    >
      <ReactFlow<FlowNode>
        id={id}
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        colorMode={theme}
        onNodesChange={(changes) => {
          const selected = changes.find(
            (c) => c.type === "select" && c.selected && c.id !== boundsId,
          );
          if (selected?.type === "select") {
            onSelect(selected.id);
            setSelectedEdges([]);
          } else if (
            changes.some(
              (c) => c.type === "select" && !c.selected && c.id === selectedId,
            )
          )
            onSelect(null);
          const positionOrRemove = changes.filter(
            (c) =>
              (c.type === "position" || c.type === "remove") &&
              c.id !== boundsId,
          );
          if (positionOrRemove.length) {
            if (
              positionOrRemove.some(
                (c) => c.type === "remove" && c.id === selectedId,
              )
            )
              onSelect(null);
            const next = applyNodeChanges(positionOrRemove, flowNodes);
            const ids = new Set(next.map((n) => n.id));
            const movingIds = new Set(
              positionOrRemove.flatMap((change) =>
                change.type === "position" && change.position
                  ? [change.id]
                  : [],
              ),
            );
            const stationaryNodes = modelRef.current.nodes.filter(
              (node) => ids.has(node.id) && !movingIds.has(node.id),
            );
            commit(
              modelRef.current.nodes
                .filter((n) => ids.has(n.id))
                .map((n) => {
                  if (!movingIds.has(n.id)) return n;
                  const flow = next.find((f) => f.id === n.id)!;
                  return {
                    ...n,
                    ...snapCircuitPosition(flow.position, stationaryNodes),
                  };
                }),
              modelRef.current.wires.filter(
                (w) => ids.has(w.source) && ids.has(w.target),
              ),
            );
          }
        }}
        onEdgesChange={(changes) => {
          const next = applyEdgeChanges(changes, flowEdges);
          setSelectedEdges(next.filter((e) => e.selected).map((e) => e.id));
          if (changes.some((c) => c.type === "select" && c.selected))
            onSelect(null);
          if (changes.some((c) => c.type === "remove")) {
            const ids = new Set(next.map((e) => e.id));
            commit(
              modelRef.current.nodes,
              modelRef.current.wires.filter((w) => ids.has(w.id)),
            );
          }
        }}
        onConnect={(connection) => {
          if (isValidConnection(connection))
            commit(modelRef.current.nodes, [
              ...modelRef.current.wires,
              {
                id: `wire-${crypto.randomUUID()}`,
                source: connection.source,
                target: connection.target,
              },
            ]);
        }}
        isValidConnection={isValidConnection}
        onNodeClick={(_, node) => {
          if (node.id !== boundsId) {
            onSelect(node.id);
            setSelectedEdges([]);
          }
        }}
        onEdgeClick={() => onSelect(null)}
        onPaneClick={() => {
          onSelect(null);
          setSelectedEdges([]);
        }}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1.18, minZoom: 0.005 }}
        minZoom={0.005}
        maxZoom={2}
        snapToGrid
        snapGrid={CIRCUIT_SNAP_GRID}
        deleteKeyCode={active ? ["Backspace", "Delete"] : null}
        disableKeyboardA11y={!active}
        connectionRadius={24}
        connectionLineStyle={{
          stroke: "var(--accent, #e96342)",
          strokeWidth: 1.6,
        }}
        defaultEdgeOptions={{ type: "smoothstep" }}
        aria-label={t(
          "Interaktiver Schaltungseditor",
          "Interactive circuit editor",
        )}
        ariaLabelConfig={{
          "node.a11yDescription.default": t(
            "Mit Eingabe oder Leertaste auswählen. Pfeiltasten verschieben das Bauelement; Entf löscht es. Escape hebt die Auswahl auf.",
            "Press Enter or Space to select. Arrow keys move the component; Delete removes it. Escape clears the selection.",
          ),
          "node.a11yDescription.keyboardDisabled": t(
            "Bauelement auswählen, um seine Eigenschaften zu bearbeiten.",
            "Select a component to edit its properties.",
          ),
          "node.a11yDescription.ariaLiveMessage": ({ direction, x, y }) => {
            const directions: Record<string, string> = {
              left: t("links", "left"),
              right: t("rechts", "right"),
              up: t("oben", "up"),
              down: t("unten", "down"),
            };
            return t(
              `Bauelement nach ${directions[direction] ?? direction} verschoben. Position ${number(x)}, ${number(y)}.`,
              `Component moved ${directions[direction] ?? direction}. Position ${number(x)}, ${number(y)}.`,
            );
          },
          "edge.a11yDescription.default": t(
            "Mit Eingabe oder Leertaste auswählen. Entf löscht die Verbindung. Escape hebt die Auswahl auf.",
            "Press Enter or Space to select. Delete removes the connection. Escape clears the selection.",
          ),
          "controls.ariaLabel": t("Ansicht des Schaltplans", "Circuit view"),
          "controls.zoomIn.ariaLabel": t("Vergrößern", "Zoom in"),
          "controls.zoomOut.ariaLabel": t("Verkleinern", "Zoom out"),
          "controls.fitView.ariaLabel": t(
            "Gesamte Schaltung anzeigen",
            "Fit the entire circuit",
          ),
          "controls.interactive.ariaLabel": t(
            "Bearbeitung umschalten",
            "Toggle editing",
          ),
          "minimap.ariaLabel": t("Schaltungsübersicht", "Circuit overview"),
          "handle.ariaLabel": t("Anschluss verbinden", "Connect terminal"),
        }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          color="var(--circuit-grid, #d6d9d6)"
          gap={CIRCUIT_GRID}
          size={1}
        />
        {ground && <GroundRail geometry={ground} />}
        <Controls position="bottom-left" showInteractive={false} />
      </ReactFlow>
      <div className="circuit-canvas-note">
        <span /> {t("Zweitor-Kaskade", "Two-port cascade")} <i>·</i>{" "}
        {t("gemeinsame Masse", "common return")}
      </div>
    </div>
  );
}
export function CircuitEditor(props: CircuitEditorProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}
