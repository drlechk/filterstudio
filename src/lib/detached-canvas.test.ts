import { describe, expect, it, vi } from 'vitest';
import { CanvasSession, CanvasWriter, canvasRegistry, detachedCanvasRoute, detachedCanvasUrl, findCanvasSession, type CanvasActions } from './detached-canvas';
import { createCircuit, defaultSettings } from './project';
import { defaultTolerance } from './tolerance';
import type { Project } from './types';

const project: Project = { version: 1, name: 'Filter', settings: defaultSettings,
  ...createCircuit([{ id: 'L1', kind: 'L', connection: 'series', value: 1e-6 }]),
  z2: 50, sweep: { min: 1e5, max: 1e7, points: 501 } };
const publication = { project, canUndo: false, canRedo: false, busy: false };
const actions = (): CanvasActions => ({ commit: vi.fn(), undo: vi.fn(), redo: vi.fn(), focus: vi.fn() });

describe('shared detached canvas sessions', () => {
  it('shares pending tolerance designs with plots and protects edits against stale drafts', () => {
    const commands = { ...actions(), setTolerance: vi.fn() };
    const design = { settings: defaultSettings, tolerance: defaultTolerance(defaultSettings), mode: 'tolerance' as const };
    const session = new CanvasSession({ ...publication, design }, commands);
    const changed = { ...design.tolerance, stopbandLoss: 60 };
    session.setTolerance(changed, 0);
    expect(commands.setTolerance).toHaveBeenCalledWith(changed);
    expect(commands.commit).not.toHaveBeenCalled();
    session.publish({ ...publication, design: { ...design, tolerance: changed } }, commands);
    expect(session.getSnapshot().project).toBe(project);
    expect(session.getSnapshot().design?.tolerance).toEqual(changed);
    expect(() => session.setTolerance(design.tolerance, 0)).toThrow('inzwischen geändert');
    expect(() => session.setTolerance({ ...changed, stopbandLoss: -1 }, 1)).toThrow();
    expect(commands.setTolerance).toHaveBeenCalledTimes(1);
    for (const view of ['response', 'wdf-response', 'tolerance'] as const) {
      session.focus(view);
      expect(commands.focus).toHaveBeenLastCalledWith(view);
    }
    session.disconnect();
    expect(() => session.setTolerance(changed, 1)).toThrow('geschlossen');
  });

  it('allows compound edits from one child while rejecting unseen changes from another', () => {
    const commands = actions();
    const session = new CanvasSession(publication, commands);
    commands.commit = next => session.publish({ ...publication, project: next, canUndo: true }, commands);
    const first = new CanvasWriter(session), second = new CanvasWriter(session);
    // ReactFlow deletes edges before nodes, without rendering between callbacks.
    first.run(revision => session.commit({ ...project, wires: [] }, revision, true));
    first.run(revision => session.commit({ ...project, wires: [], nodes: project.nodes.filter(n => n.port) }, revision, true));
    expect(session.getSnapshot().project.nodes).toHaveLength(2);
    expect(session.getSnapshot().revision).toBe(2);
    expect(() => second.run(revision => session.commit(project, revision))).toThrow('inzwischen geändert');
    second.observe(session.getSnapshot().revision);
    second.run(revision => session.undo(revision));
    expect(commands.undo).toHaveBeenCalledTimes(1);
    // An older rendering cannot undo the acknowledgment of a successful write.
    first.observe(0);
    first.run(revision => session.commit(project, revision));
    expect(session.getSnapshot().project).toEqual(project);
  });

  it('keeps a cached snapshot and publishes only meaningful changes', () => {
    const first = actions(), latest = actions();
    const session = new CanvasSession(publication, first), notify = vi.fn();
    const initial = session.getSnapshot(), unsubscribe = session.subscribe(notify);
    session.publish(publication, latest);
    expect(session.getSnapshot()).toBe(initial);
    expect(notify).not.toHaveBeenCalled();
    session.commit(project, 0, true);
    expect(latest.commit).toHaveBeenCalledWith(project, true);
    expect(first.commit).not.toHaveBeenCalled();
    session.publish({ ...publication, canUndo: true }, latest);
    expect(session.getSnapshot().revision).toBe(0);
    expect(notify).toHaveBeenCalledTimes(1);
    unsubscribe();
    session.publish({ ...publication, project: { ...project, name: 'Updated' } }, latest);
    expect(session.getSnapshot().revision).toBe(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('rejects stale child writes and undo/redo after the owner has changed', () => {
    const commands = actions(), session = new CanvasSession(publication, commands);
    const changed = { ...project, wdf: { sampleRate: 4e6 } };
    session.publish({ ...publication, project: changed, canUndo: true, canRedo: true }, commands);
    expect(() => session.commit(project, 0)).toThrow('inzwischen geändert');
    expect(() => session.undo(0)).toThrow('inzwischen geändert');
    expect(() => session.redo(0)).toThrow('inzwischen geändert');
    expect(commands.commit).not.toHaveBeenCalled();
    expect(commands.undo).not.toHaveBeenCalled();
    expect(commands.redo).not.toHaveBeenCalled();
    expect(session.getSnapshot().project).toBe(changed);
    session.commit({ ...changed, z2: 75 }, 1);
    expect(commands.commit).toHaveBeenCalledWith({ ...changed, z2: 75 }, false);
    session.undo(1); session.redo(1); session.focus('wdf');
    expect(commands.undo).toHaveBeenCalledTimes(1);
    expect(commands.redo).toHaveBeenCalledTimes(1);
    expect(commands.focus).toHaveBeenCalledWith('wdf');
  });

  it('validates child data and blocks changes during generation', () => {
    const commands = actions(), session = new CanvasSession(publication, commands);
    expect(() => session.commit({ ...project, z2: -1 }, 0)).toThrow();
    session.undo(0); session.redo(0);
    expect(commands.undo).not.toHaveBeenCalled();
    expect(commands.redo).not.toHaveBeenCalled();
    session.publish({ ...publication, busy: true }, commands);
    expect(() => session.commit(project, 0)).toThrow('generiert');
    expect(() => session.undo(0)).toThrow('generiert');
    expect(commands.commit).not.toHaveBeenCalled();
  });

  it('retains the last project for recovery after closing the owner', () => {
    const commands = actions(), session = new CanvasSession(publication, commands), notify = vi.fn();
    session.subscribe(notify);
    session.disconnect(); session.disconnect();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot()).toMatchObject({ project, available: false });
    expect(() => session.commit(project, 0)).toThrow('geschlossen');
    expect(() => session.undo(0)).toThrow('geschlossen');
    session.focus('circuit');
    expect(commands.focus).not.toHaveBeenCalled();
    // A page restored from the browser's back/forward cache can reconnect.
    session.publish(publication, commands);
    expect(session.getSnapshot().available).toBe(true);
    expect(session.getSnapshot().revision).toBe(0);
  });
});

describe('detached canvas addressing', () => {
  it('addresses circuit, WDF and their plots independently, including the tolerance mask', () => {
    const views = ['circuit', 'wdf', 'response', 'wdf-response', 'tolerance'] as const;
    const urls = views.map(view => detachedCanvasUrl('https://example.test/filterstudio/', 'same-project', view));
    expect(new Set(urls).size).toBe(5);
    urls.forEach((url, i) => expect(detachedCanvasRoute(new URL(url).hash)).toEqual({ id: 'same-project', view: views[i] }));
  });

  it('keeps deployment path and query, carrying only session identity and view in the hash', () => {
    const url = detachedCanvasUrl('https://example.test/filterstudio/?preview=1#acknowledgements', 'project-123', 'wdf');
    expect(url).toBe('https://example.test/filterstudio/?preview=1#canvas=project-123&view=wdf');
    expect(detachedCanvasRoute(new URL(url).hash)).toEqual({ id: 'project-123', view: 'wdf' });
    expect(detachedCanvasRoute('#canvas=id')).toEqual({ id: 'id', view: 'circuit' });
    for (const hash of ['', '#acknowledgements', '#canvas=', '#canvas=a/b', `#canvas=${'x'.repeat(129)}`]) expect(detachedCanvasRoute(hash)).toBeNull();
  });
  it('only finds a matching session in a live same-origin opener', () => {
    const session = new CanvasSession(publication, actions());
    const owner = { closed: false, location: { origin: 'https://example.test' } } as Window;
    const child = { opener: owner, location: { origin: 'https://example.test' } } as Window;
    canvasRegistry(owner).set('a', session);
    expect(findCanvasSession(child, 'a')).toBe(session);
    expect(findCanvasSession(child, 'b')).toBeNull();
    expect(findCanvasSession({ ...child, opener: null } as Window, 'a')).toBeNull();
    expect(findCanvasSession({ ...child, location: { origin: 'https://other.test' } } as Window, 'a')).toBeNull();
    expect(findCanvasSession({ ...child, opener: { ...owner, closed: true } } as Window, 'a')).toBeNull();
    const blocked = { get opener() { throw new Error('Cross-origin access blocked'); } } as unknown as Window;
    expect(findCanvasSession(blocked, 'a')).toBeNull();
  });
});
