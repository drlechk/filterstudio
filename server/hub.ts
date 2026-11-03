import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import { MAX_WINDOW_TABS, windowSchema } from "./schemas";
import { RemoteError, type RemoteCommand, type RemoteWindow } from "../src/lib/remote-protocol";

type Connection = { socket: WebSocket; snapshot: RemoteWindow };
type Pending = { connection: Connection; resolve: (snapshot: RemoteWindow) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

/** Shared by REST and MCP. Browser acknowledgements, not sends, complete writes. */
export class BrowserHub {
  private windows = new Map<string, Connection>();
  private pending = new Map<string, Pending>();
  constructor(private timeoutMs = 10_000) {}

  attach(socket: WebSocket) {
    let connection: Connection | undefined;
    let alive = true;
    socket.on("pong", () => { alive = true; });
    const heartbeat = setInterval(() => {
      if (!alive) { socket.terminate(); return; }
      alive = false;
      socket.ping();
    }, 30_000);
    heartbeat.unref();
    const handshake = setTimeout(() => socket.close(1008, "Snapshot required"), 5000);
    socket.on("message", raw => {
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === "snapshot" || message.type === "result") {
          const snapshot = windowSchema.parse(message.snapshot);
          if (connection && snapshot.id !== connection.snapshot.id) throw new Error("Window ID changed");
          if (!connection) {
            const previous = this.windows.get(snapshot.id);
            previous?.socket.close(1000, "Reconnected");
            connection = { socket, snapshot };
            this.windows.set(snapshot.id, connection);
            clearTimeout(handshake);
          }
          connection.snapshot = snapshot;
          if (message.type === "result") {
            const pending = this.pending.get(message.requestId);
            if (!pending || pending.connection !== connection) return;
            this.pending.delete(message.requestId);
            clearTimeout(pending.timer);
            if (message.error) pending.reject(new RemoteError([400, 404, 409, 422].includes(message.error.status) ? message.error.status : 422, String(message.error.message)));
            else pending.resolve(snapshot);
          }
        }
      } catch { socket.close(1008, "Invalid workspace message"); }
    });
    socket.on("error", () => socket.close());
    socket.on("close", () => {
      clearTimeout(handshake);
      clearInterval(heartbeat);
      if (!connection) return;
      if (this.windows.get(connection.snapshot.id) === connection) this.windows.delete(connection.snapshot.id);
      for (const [id, pending] of this.pending) {
        if (pending.connection !== connection) continue;
        clearTimeout(pending.timer);
        this.pending.delete(id);
        pending.reject(new RemoteError(503, "Browser disconnected. Reconnect and read the tab before retrying."));
      }
    });
  }

  list() {
    return [...this.windows.values()].map(({ snapshot }) => ({
      id: snapshot.id, activeTabId: snapshot.activeTabId,
      tabs: snapshot.tabs.map(tab => ({ id: tab.id, name: tab.project.name, revision: tab.revision, dirty: tab.dirty })),
    }));
  }
  get(id: string) {
    const connection = this.windows.get(id);
    if (!connection) throw new RemoteError(404, "Browser window not connected. Open Filterstudio on the local server and list windows again.");
    return connection.snapshot;
  }
  tab(windowId: string, tabId: string) {
    const tab = this.get(windowId).tabs.find(tab => tab.id === tabId);
    if (!tab) throw new RemoteError(404, "Filter tab not found. List windows again.");
    return tab;
  }
  async command(windowId: string, command: RemoteCommand) {
    const snapshot = this.get(windowId);
    if (command.action === "open" && snapshot.tabs.length >= MAX_WINDOW_TABS) throw new RemoteError(409, `This window already has ${MAX_WINDOW_TABS} tabs. Close a tab before creating another filter.`);
    const connection = this.windows.get(windowId)!;
    if ([...this.pending.values()].some(p => p.connection === connection)) throw new RemoteError(409, "Another edit is in progress in this window. Read its state and retry.");
    const requestId = randomUUID();
    return new Promise<RemoteWindow>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new RemoteError(504, "Browser did not acknowledge the command. Its outcome is unknown; read the tab before retrying."));
      }, this.timeoutMs);
      this.pending.set(requestId, { connection, resolve, reject, timer });
      connection.socket.send(JSON.stringify({ type: "command", requestId, command }), error => {
        if (!error || !this.pending.delete(requestId)) return;
        clearTimeout(timer);
        reject(new RemoteError(503, "Browser connection unavailable."));
      });
    });
  }
  close() { for (const connection of this.windows.values()) connection.socket.terminate(); }
}
