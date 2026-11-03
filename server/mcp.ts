import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { RemoteError } from "../src/lib/remote-protocol";
import type { Operation } from "./operations";

export function apiError(error: unknown) {
  if (error instanceof z.ZodError) return { status: 400, message: error.issues.map(issue => `${issue.path.join(".") || "request"}: ${issue.message}`).join("; ") };
  if (error instanceof RemoteError) return { status: error.status, message: error.message };
  return { status: 500, message: "Internal server error." };
}

export function createMcpServer(operations: Operation[], openapi: unknown, execute?: (operation: Operation, args: unknown) => Promise<Record<string, unknown>>) {
  const server = new McpServer({ name: "filterstudio", version: "1.0.0" }, {
    instructions: "Filterstudio uses SI units and full numeric precision. Use create_filter to design a new filter and open it in a new active browser tab in one call. If exactly one window is connected, windowId can be omitted; otherwise use list_filter_windows to select it. Existing tabs are preserved. Each create_filter call creates another tab; after a timeout list tabs before retrying. Use synthesize_filter to return a project without changing browser tabs, or open_filter_tab for an existing project. For live edits, get_filter_tab and pass its current revision. Check pending drafts before replacing a tab. Project edits are undoable but not saved to disk. For standalone analysis no browser is needed. No authentication or API key is required.",
  });
  for (const operation of operations) {
    server.registerTool(operation.name, {
      description: operation.description, inputSchema: operation.input,
      annotations: { readOnlyHint: operation.readOnly, destructiveHint: operation.destructive ?? !operation.readOnly, idempotentHint: operation.readOnly, openWorldHint: false },
    }, async args => {
      try {
        const result = await (execute ? execute(operation, args) : operation.run(args));
        return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result };
      } catch (error) {
        return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ error: apiError(error) }) }] };
      }
    });
  }
  server.registerResource("openapi", "filterstudio://openapi", { description: "Full REST endpoint documentation (OpenAPI 3.1).", mimeType: "application/json" }, async uri => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(openapi) }] }));
  return server;
}
