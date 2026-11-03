import { describe, expect, it } from "vitest";
import { createCircuit, defaultSettings } from "./project";
import type { Project } from "./types";
import { createFilterTab, workspaceReducer, type Workspace } from "./workspace";

const project: Project = {
  version: 1,
  name: "Low-pass",
  settings: defaultSettings,
  ...createCircuit([{ id: "L1", kind: "L", connection: "series", value: 1e-6 }]),
  z2: 50,
  sweep: { min: 1e5, max: 1e7, points: 601 },
};

function initialWorkspace(): Workspace {
  const tab = createFilterTab(project);
  return { tabs: [tab], activeId: tab.id };
}

describe("multiple filter projects", () => {
  it("isolates nested project data, even when opening the same project twice", () => {
    const first = createFilterTab(project);
    const second = createFilterTab(project);
    expect(first.id).not.toBe(second.id);
    first.initialProject.settings.cutoff = 2e6;
    first.initialProject.nodes.find((node) => node.section)!.section!.value = 7e-6;
    first.initialProject.wires.length = 0;
    first.initialProject.sweep.min = 1e4;
    expect(second.initialProject).toEqual(project);
  });

  it("opens and selects another filter without replacing an existing unsaved filter", () => {
    let state = initialWorkspace();
    const firstId = state.activeId;
    state = workspaceReducer(state, { type: "update", id: firstId, name: "My experiment", dirty: true });
    const first = state.tabs[0];
    const imported = createFilterTab({ ...project, name: "High-pass", settings: { ...defaultSettings, response: "highpass" } });
    state = workspaceReducer(state, { type: "open", tab: imported });
    expect(state.activeId).toBe(imported.id);
    expect(state.tabs[0]).toBe(first);
    state = workspaceReducer(state, { type: "select", id: firstId });
    expect(state.activeId).toBe(firstId);
    expect(state.tabs.map(({ name, dirty }) => ({ name, dirty }))).toEqual([
      { name: "My experiment", dirty: true },
      { name: "High-pass", dirty: false },
    ]);
  });

  it("keeps the current filter when another tab closes and selects a neighbor when it closes", () => {
    let state = initialWorkspace();
    const first = state.tabs[0];
    const second = createFilterTab(project);
    const third = createFilterTab(project);
    state = workspaceReducer(state, { type: "open", tab: second });
    state = workspaceReducer(state, { type: "open", tab: third });
    state = workspaceReducer(state, { type: "close", id: first.id });
    expect(state.activeId).toBe(third.id);
    state = workspaceReducer(state, { type: "close", id: third.id });
    expect(state).toEqual({ tabs: [second], activeId: second.id });
  });

  it("selects the following filter when closing a middle tab", () => {
    let state = initialWorkspace();
    const second = createFilterTab(project);
    const third = createFilterTab(project);
    state = workspaceReducer(state, { type: "open", tab: second });
    state = workspaceReducer(state, { type: "open", tab: third });
    state = workspaceReducer(state, { type: "select", id: second.id });
    state = workspaceReducer(state, { type: "close", id: second.id });
    expect(state.activeId).toBe(third.id);
    expect(state.tabs).toHaveLength(2);
  });

  it("always retains an editable filter when the last tab closes", () => {
    const state = initialWorkspace();
    const replacement = createFilterTab({ ...project, name: "Filter 2" });
    expect(workspaceReducer(state, { type: "close", id: state.activeId })).toBe(state);
    expect(workspaceReducer(state, { type: "close", id: state.activeId, replacement })).toEqual({
      tabs: [replacement], activeId: replacement.id,
    });
  });

  it("ignores stale events for a closed tab", () => {
    const state = initialWorkspace();
    const id = createFilterTab(project).id;
    expect(workspaceReducer(state, { type: "select", id })).toBe(state);
    expect(workspaceReducer(state, { type: "close", id })).toBe(state);
    expect(workspaceReducer(state, { type: "update", id, name: "Closed", dirty: true })).toEqual(state);
  });
});
