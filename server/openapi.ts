import { z } from "zod";
import { errorSchema } from "./schemas";
import type { Operation } from "./operations";

export function createOpenApi(operations: Operation[]) {
  const paths: Record<string, Record<string, unknown>> = {};
  const schema = (value: z.ZodType) => z.toJSONSchema(value, { target: "draft-2020-12", io: "input" });
  for (const operation of operations) {
    const parameters = [...operation.path.matchAll(/\{([^}]+)\}/g)].map(match => match[1]);
    const bodyFields = Object.fromEntries(Object.entries(operation.input.shape).filter(([key]) => !parameters.includes(key)));
    (paths[operation.path] ??= {})[operation.method] = {
      operationId: operation.name,
      summary: operation.name.replaceAll("_", " "), description: operation.description,
      tags: [operation.path.startsWith("/api/windows") || operation.name === "create_filter" ? "Browser tabs" : "Filter calculations"],
      parameters: parameters.map(name => ({ name, in: "path", required: true, schema: schema(operation.input.shape[name]) })),
      ...(Object.keys(bodyFields).length ? { requestBody: { required: true, content: { "application/json": { schema: schema(z.object(bodyFields).strict()) } } } } : {}),
      responses: {
        "200": { description: "Completed result. Browser writes are acknowledged by the editor.", content: { "application/json": { schema: schema(operation.output) } } },
        ...Object.fromEntries([[400, "Invalid request"], [403, "Untrusted host or browser origin"], [404, "Window, tab or component not found"], [409, "Stale revision, edit in progress, or explicit window selection required"], [422, "Filter cannot be processed"], [503, "Browser disconnected or no window connected"], [504, "Browser acknowledgement timed out; read current state before retrying"]].map(([code, description]) => [code, { description, content: { "application/json": { schema: schema(errorSchema) } } }])),
      },
    };
  }
  paths["/api/health"] = { get: { operationId: "health", summary: "Server health", tags: ["Server"], responses: { "200": { description: "Server is running", content: { "application/json": { schema: schema(z.object({ status: z.literal("ok"), name: z.literal("Filterstudio"), version: z.literal("1.0.0"), authentication: z.literal("none") })) } } } } } };
  return {
    openapi: "3.1.0", info: { title: "Filterstudio API", version: "1.0.0", description: "Local filter design, analysis and live browser control. No authentication or API keys. All frequencies in Hz; component values in SI units. Browser projects are in memory and are not saved by the server. Cross-field validation uses the same project parser as the editor. MCP tools at /mcp share these operations; /mcp is JSON-RPC, not a REST endpoint." },
    servers: [{ url: "/" }], security: [], paths,
  };
}
