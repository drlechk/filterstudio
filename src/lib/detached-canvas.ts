import { parseProject } from './project';
import { parseTolerance } from './tolerance';
import type { FilterSettings, Project, ToleranceSpec } from './types';

export type CanvasView = 'circuit' | 'wdf';
export type DetachedView = CanvasView | 'wdf-signal' | 'response' | 'wdf-response' | 'tolerance';
export type CanvasDesign = { settings: FilterSettings; tolerance: ToleranceSpec; mode: 'parameters' | 'tolerance' };
export type CanvasSnapshot = {
  project: Project; revision: number; available: boolean;
  canUndo: boolean; canRedo: boolean; busy: boolean;
  design?: CanvasDesign;
};
export type CanvasActions = {
  commit: (project: Project, coalesce: boolean) => void;
  undo: () => void; redo: () => void; focus: (view: DetachedView) => void;
  setTolerance?: (spec: ToleranceSpec) => void;
};
export type CanvasPublication = Omit<CanvasSnapshot, 'revision' | 'available'>;

/** One authoritative project/undo history. Child windows receive cached immutable
 * React snapshots; writes are revision-checked and executed in the owner window.
 */
export class CanvasSession {
  private snapshot: CanvasSnapshot;
  private actions: CanvasActions;
  private listeners = new Set<() => void>();
  constructor(publication: CanvasPublication, actions: CanvasActions) {
    this.snapshot = { ...publication, revision: 0, available: true };
    this.actions = actions;
  }
  getSnapshot = (): CanvasSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  publish(publication: CanvasPublication, actions: CanvasActions) {
    this.actions = actions;
    const previous = this.snapshot;
    const changed = previous.project !== publication.project || previous.design !== publication.design;
    if (previous.available && !changed && previous.canUndo === publication.canUndo && previous.canRedo === publication.canRedo && previous.busy === publication.busy) return;
    this.snapshot = { ...publication, available: true, revision: previous.revision + (changed ? 1 : 0) };
    this.emit();
  }
  disconnect() {
    if (!this.snapshot.available) return;
    this.snapshot = { ...this.snapshot, available: false };
    this.emit();
  }
  private emit() {
    // A child may have navigated away between publication and notification.
    for (const listener of this.listeners) { try { listener(); } catch { this.listeners.delete(listener); } }
  }
  private check(revision: number) {
    if (!this.snapshot.available) throw new Error('Die Verbindung zum ursprünglichen Projekt wurde geschlossen.');
    if (this.snapshot.busy) throw new Error('Das Filter wird gerade generiert. Bitte danach erneut versuchen.');
    if (revision !== this.snapshot.revision) throw new Error('Das Projekt wurde inzwischen geändert. Die aktuelle Ansicht wurde übernommen; bitte die Änderung erneut ausführen.');
  }
  commit(project: Project, revision: number, coalesce = false) {
    this.check(revision);
    this.actions.commit(parseProject(project), coalesce);
  }
  undo(revision: number) { this.check(revision); if (this.snapshot.canUndo) this.actions.undo(); }
  redo(revision: number) { this.check(revision); if (this.snapshot.canRedo) this.actions.redo(); }
  setTolerance(spec: ToleranceSpec, revision: number) {
    this.check(revision);
    this.actions.setTolerance?.(parseTolerance(spec));
  }
  focus(view: DetachedView) { if (this.snapshot.available) this.actions.focus(view); }
}

/** Accept our own immediately acknowledged writes before React renders again.
 * ReactFlow can remove edges and their node in successive synchronous callbacks.
 * Changes from another view are accepted only once its snapshot is rendered.
 */
export class CanvasWriter {
  private revision: number;
  constructor(private session: CanvasSession) { this.revision = session.getSnapshot().revision; }
  observe(revision: number) { this.revision = Math.max(this.revision, revision); }
  run(action: (revision: number) => void) {
    action(this.revision);
    this.revision = this.session.getSnapshot().revision;
  }
}

type CanvasRegistryWindow = Window & { filterstudioCanvasSessions?: Map<string, CanvasSession> };
export function canvasRegistry(owner: Window): Map<string, CanvasSession> {
  const typed = owner as CanvasRegistryWindow;
  return typed.filterstudioCanvasSessions ??= new Map();
}
export function findCanvasSession(child: Window, id: string): CanvasSession | null {
  try {
    const owner = child.opener as CanvasRegistryWindow | null;
    if (!owner || owner.closed || owner.location.origin !== child.location.origin) return null;
    return owner.filterstudioCanvasSessions?.get(id) ?? null;
  } catch { return null; }
}
export function detachedCanvasRoute(hash: string): { id: string; view: DetachedView } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const id = params.get('canvas');
  if (!id || !/^[\w-]{1,128}$/.test(id)) return null;
  const view = params.get('view');
  return { id, view: view === 'wdf' || view === 'wdf-signal' || view === 'response' || view === 'wdf-response' || view === 'tolerance' ? view : 'circuit' };
}
export function detachedCanvasUrl(currentUrl: string, id: string, view: DetachedView): string {
  const url = new URL(currentUrl);
  url.hash = new URLSearchParams({ canvas: id, view }).toString();
  return url.href;
}
