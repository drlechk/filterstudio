import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BrowserHub } from "./hub";
import { createOperations } from "./operations";
import { createOpenApi } from "./openapi";
import { createMcpServer } from "./mcp";
import { RemoteError } from "../src/lib/remote-protocol";

// Forward all operations to the running HTTP server so all clients see the same windows.
// stdout belongs exclusively to the MCP transport.
const base = new URL(process.env.FILTERSTUDIO_URL ?? "http://127.0.0.1:4310");
if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.pathname !== "/" || base.search || base.hash) throw new Error("FILTERSTUDIO_URL must be an HTTP(S) origin without credentials or path.");
const operations = createOperations(new BrowserHub());
const server = createMcpServer(operations, createOpenApi(operations), async (operation, raw) => {
  const args = operation.input.parse(raw) as Record<string, unknown>;
  const body = { ...args };
  const path = operation.path.replace(/\{([^}]+)\}/g, (_match, key: string) => { delete body[key]; return encodeURIComponent(String(args[key])); });
  let response: Response;
  try {
    response = await fetch(new URL(path, base), { method: operation.method.toUpperCase(), headers: { "Content-Type": "application/json" }, ...(operation.method !== "get" ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000) });
  } catch { throw new RemoteError(503, `Cannot reach Filterstudio at ${base.origin}. Start npm start (or npm run dev:server), then retry. After a write timeout, read the tab before retrying.`); }
  const result = await response.json();
  if (!response.ok) throw new RemoteError(response.status, result.error?.message ?? `HTTP ${response.status}`);
  return result;
});
await server.connect(new StdioServerTransport());
