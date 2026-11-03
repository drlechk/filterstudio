import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { RemoteError, type RemoteCommand, type RemoteWindow } from "./remote-protocol";

/** Optional same-origin connection. Static deployments never connect to a backend. */
export function useRemoteWorkspace(snapshot: () => RemoteWindow, execute: (command: RemoteCommand) => void) {
  const current = useRef({ snapshot, execute });
  current.current = { snapshot, execute };
  const socketRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const publish = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "snapshot", snapshot: current.current.snapshot() }));
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV && !document.querySelector('meta[name="filterstudio-api"][content="enabled"]')) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    async function connect() {
      try {
        const health = await fetch("/api/health", { signal: abort.signal });
        if (!health.ok || (await health.json()).name !== "Filterstudio") throw new Error("Backend unavailable");
        if (disposed) return;
        const url = new URL("/bridge", location.href);
        url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
        const socket = new WebSocket(url);
        socketRef.current = socket;
        socket.onopen = () => { if (!disposed) { setConnected(true); publish(); } };
        socket.onmessage = event => {
          let requestId: string | undefined;
          try {
            const message = JSON.parse(event.data);
            if (message.type !== "command" || typeof message.requestId !== "string") return;
            requestId = message.requestId;
            flushSync(() => current.current.execute(message.command));
            socket.send(JSON.stringify({ type: "result", requestId, snapshot: current.current.snapshot() }));
          } catch (error) {
            socket.send(JSON.stringify({ type: "result", requestId, snapshot: current.current.snapshot(), error: { status: error instanceof RemoteError ? error.status : 422, message: error instanceof Error ? error.message : "Invalid command" } }));
          }
        };
        socket.onerror = () => socket.close();
        socket.onclose = () => {
          if (socketRef.current === socket) socketRef.current = null;
          if (!disposed) { setConnected(false); timer = setTimeout(connect, 3000); }
        };
      } catch {
        if (!disposed) { setConnected(false); timer = setTimeout(connect, 10_000); }
      }
    }
    void connect();
    return () => { disposed = true; abort.abort(); clearTimeout(timer); socketRef.current?.close(); socketRef.current = null; };
  }, [publish]);
  return { connected, publish };
}
