import type { Project } from "./types";

export type FilterTab = {
  id: string;
  initialProject: Project;
  name: string;
  dirty: boolean;
};

export type Workspace = { tabs: FilterTab[]; activeId: string };

export type WorkspaceAction =
  | { type: "open"; tab: FilterTab }
  | { type: "select"; id: string }
  | { type: "update"; id: string; name: string; dirty: boolean }
  | { type: "close"; id: string; replacement?: FilterTab };

export function createFilterTab(project: Project): FilterTab {
  return {
    id: crypto.randomUUID(),
    initialProject: structuredClone(project),
    name: project.name,
    dirty: false,
  };
}

export function workspaceReducer(
  state: Workspace,
  action: WorkspaceAction,
): Workspace {
  switch (action.type) {
    case "open":
      return { tabs: [...state.tabs, action.tab], activeId: action.tab.id };
    case "select":
      return state.tabs.some((tab) => tab.id === action.id)
        ? { ...state, activeId: action.id }
        : state;
    case "update":
      return {
        ...state,
        tabs: state.tabs.map((tab) =>
          tab.id === action.id
            ? { ...tab, name: action.name, dirty: action.dirty }
            : tab,
        ),
      };
    case "close": {
      const index = state.tabs.findIndex((tab) => tab.id === action.id);
      if (index < 0) return state;
      const tabs = state.tabs.filter((tab) => tab.id !== action.id);
      if (!tabs.length) {
        return action.replacement
          ? { tabs: [action.replacement], activeId: action.replacement.id }
          : state;
      }
      return {
        tabs,
        activeId:
          state.activeId === action.id
            ? tabs[Math.min(index, tabs.length - 1)].id
            : state.activeId,
      };
    }
  }
}
