import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { CanvasSession, CanvasWriter, canvasRegistry, detachedCanvasUrl, findCanvasSession, type CanvasActions, type CanvasPublication, type DetachedView } from './detached-canvas';

export function useCanvasHost(publication: CanvasPublication, actions: CanvasActions, enabled: boolean) {
  const [id] = useState(() => crypto.randomUUID());
  const sessionRef = useRef<CanvasSession | null>(null);
  const children = useRef(new Set<Window>());
  const current = useRef({ publication, actions });
  current.current = { publication, actions };
  // Flush owner updates before returning from a child write, so its next action
  // cannot race a still-pending parent React render.
  const publish = useCallback(() => {
    const { publication, actions } = current.current;
    const synchronous: CanvasActions = {
      commit: (project, coalesce) => flushSync(() => actions.commit(project, coalesce)),
      undo: () => flushSync(actions.undo), redo: () => flushSync(actions.redo),
      setTolerance: spec => flushSync(() => actions.setTolerance?.(spec)),
      focus: view => { actions.focus(view); window.focus(); },
    };
    if (!sessionRef.current) sessionRef.current = new CanvasSession(publication, synchronous);
    else sessionRef.current.publish(publication, synchronous);
    canvasRegistry(window).set(id, sessionRef.current);
  }, [id]);
  useLayoutEffect(() => { if (enabled) publish(); });
  useEffect(() => {
    if (!enabled) return;
    publish();
    const disconnect = () => { sessionRef.current?.disconnect(); canvasRegistry(window).delete(id); };
    window.addEventListener('pagehide', disconnect);
    window.addEventListener('pageshow', publish);
    return () => {
      window.removeEventListener('pagehide', disconnect);
      window.removeEventListener('pageshow', publish);
      disconnect();
    };
  }, [enabled, id, publish]);
  const open = useCallback((view: DetachedView, destination: 'window' | 'tab'): boolean => {
    const expected = detachedCanvasUrl(window.location.href, id, view);
    for (const existing of children.current) {
      try {
        if (existing.closed) { children.current.delete(existing); continue; }
        if (existing.location.href === expected) { existing.focus(); return true; }
      } catch { children.current.delete(existing); /* The window navigated to another origin. */ }
    }
    const child = window.open(expected, '_blank', destination === 'window' ? 'popup=yes,width=1280,height=850,resizable=yes,scrollbars=yes' : undefined);
    if (!child) return false;
    children.current.add(child);
    child.focus();
    return true;
  }, [id]);
  return { open };
}

export function useDetachedCanvas(id: string) {
  const [session] = useState(() => findCanvasSession(window, id));
  const [writer] = useState(() => session ? new CanvasWriter(session) : null);
  const [ownerClosed, setOwnerClosed] = useState(false);
  const subscribe = useCallback((notify: () => void) => {
    if (!session) return () => {};
    let unsubscribe = session.subscribe(notify);
    const hide = () => unsubscribe();
    const show = () => { unsubscribe(); unsubscribe = session.subscribe(notify); notify(); };
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', show);
    return () => {
      unsubscribe();
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', show);
    };
  }, [session]);
  const getSnapshot = useCallback(() => session?.getSnapshot() ?? null, [session]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useLayoutEffect(() => { if (snapshot) writer?.observe(snapshot.revision); }, [snapshot, writer]);
  useEffect(() => {
    const poll = window.setInterval(() => {
      const current = findCanvasSession(window, id);
      setOwnerClosed(!current || current !== session);
    }, 1000);
    return () => window.clearInterval(poll);
  }, [id, session]);
  return { session, writer, snapshot, connected: !!session && !!snapshot?.available && !ownerClosed };
}
