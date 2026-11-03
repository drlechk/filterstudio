import type { FilterSettings, Project, ToleranceSpec } from "./types";

export type RemoteTab = {
  id: string;
  revision: number;
  project: Project;
  dirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  draft: { mode: "parameters" | "tolerance"; settings: FilterSettings; tolerance: ToleranceSpec; pending: boolean };
};
export type RemoteWindow = { id: string; activeTabId: string; tabs: RemoteTab[] };
export type TabCommand =
  | { action: "replace"; tabId: string; expectedRevision: number; project: Project }
  | { action: "undo" | "redo"; tabId: string; expectedRevision: number };
export type RemoteCommand = TabCommand
  | { action: "open"; project: Project }
  | { action: "select"; tabId: string };
export type RemoteController = { snapshot: () => RemoteTab; execute: (command: TabCommand) => void };

export class RemoteError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function checkRevision(tab: RemoteTab, expectedRevision: number) {
  if (tab.revision !== expectedRevision) {
    throw new RemoteError(409, "The tab changed. Read it again and retry with its current revision.");
  }
}
