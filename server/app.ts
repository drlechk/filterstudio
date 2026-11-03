import express from "express";
import type { ErrorRequestHandler } from "express";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import swaggerUi from "swagger-ui-dist";
import { WebSocketServer } from "ws";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { BrowserHub } from "./hub";
import { createOperations } from "./operations";
import { createOpenApi } from "./openapi";
import { apiError, createMcpServer } from "./mcp";

const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
export function isTrustedRequest(host: string | undefined, origin: string | undefined, allowedHosts: Set<string>, requireOrigin = false) {
  try {
    if (!host || !allowedHosts.has(new URL(`http://${host}`).hostname.toLowerCase())) return false;
    if (!origin) return !requireOrigin;
    const url = new URL(origin);
    return ["http:", "https:"].includes(url.protocol) && allowedHosts.has(url.hostname.toLowerCase());
  } catch { return false; }
}

export function createApp(options: { distDir?: string; allowedHosts?: string[]; hub?: BrowserHub } = {}) {
  const hub = options.hub ?? new BrowserHub();
  const operations = createOperations(hub);
  const openapi = createOpenApi(operations);
  const app = express();
  app.disable("x-powered-by");
  const allowedHosts = new Set([...loopback, ...(options.allowedHosts ?? []).map(host => host.toLowerCase())]);
  app.use((req, res, next) => {
    if (!isTrustedRequest(req.headers.host, req.headers.origin, allowedHosts)) {
      res.status(403).json({ error: { status: 403, message: "Untrusted host or browser origin." } }); return;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.get("/api/health", (_req, res) => res.json({ status: "ok", name: "Filterstudio", version: "1.0.0", authentication: "none" }));
  app.get("/openapi.json", (_req, res) => res.json(openapi));
  app.get(["/docs", "/docs/", "/swagger", "/swagger/"], (_req, res) => {
    res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Filterstudio API</title><link rel="stylesheet" href="/docs/assets/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="/docs/assets/swagger-ui-bundle.js"></script><script src="/docs/assets/swagger-ui-standalone-preset.js"></script><script>SwaggerUIBundle({url:"/openapi.json",dom_id:"#swagger-ui",presets:[SwaggerUIBundle.presets.apis,SwaggerUIStandalonePreset],layout:"StandaloneLayout",validatorUrl:null,tryItOutEnabled:true});</script></body></html>`);
  });
  app.use("/docs/assets", express.static(swaggerUi.getAbsoluteFSPath(), { index: false }));
  for (const operation of operations) {
    const path = operation.path.replace(/\{([^}]+)\}/g, ":$1");
    app[operation.method](path, async (req, res, next) => {
      try {
        if (req.body !== undefined && (typeof req.body !== "object" || req.body === null || Array.isArray(req.body))) { res.status(400).json({ error: { status: 400, message: "Expected a JSON object." } }); return; }
        const result = await operation.run({ ...req.body, ...req.params });
        res.json(result);
      } catch (error) { next(error); }
    });
  }
  app.post("/mcp", async (req, res, next) => {
    const server = createMcpServer(operations, openapi);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { void server.close().catch(() => {}); });
    try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
    catch (error) { if (!res.headersSent) next(error); }
  });
  app.all("/mcp", (_req, res) => {
    res.setHeader("Allow", "POST");
    res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Stateless Streamable HTTP uses POST; no legacy SSE endpoint." }, id: null });
  });
  const distDir = options.distDir ?? resolve("dist");
  app.get(["/", "/index.html"], (_req, res) => {
    const path = resolve(distDir, "index.html");
    if (!existsSync(path)) { res.status(503).type("text").send("Build the browser app with npm run build, or open the Vite dev URL after npm run dev."); return; }
    res.type("html").send(readFileSync(path, "utf8").replace("</head>", '<meta name="filterstudio-api" content="enabled"></head>'));
  });
  app.use(express.static(distDir, { index: false }));
  app.use((_req, res) => res.status(404).json({ error: { status: 404, message: "Endpoint not found. See /docs or /openapi.json." } }));
  const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const result = error.type === "entity.parse.failed" ? { status: 400, message: "Invalid JSON." } : error.type === "entity.too.large" ? { status: 413, message: "Request exceeds the 1 MB limit." } : apiError(error);
    res.status(result.status).json({ error: result });
  };
  app.use(errorHandler);
  const httpServer = createServer(app);
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 });
  sockets.on("connection", socket => hub.attach(socket));
  httpServer.on("upgrade", (req, socket, head) => {
    if (req.url !== "/bridge" || !isTrustedRequest(req.headers.host, req.headers.origin, allowedHosts, true)) { socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); socket.destroy(); return; }
    sockets.handleUpgrade(req, socket, head, ws => sockets.emit("connection", ws, req));
  });
  const closeSockets = () => { for (const socket of sockets.clients) socket.terminate(); };
  httpServer.on("close", () => { closeSockets(); hub.close(); sockets.close(); });
  return { app, httpServer, hub, operations, openapi, close: () => { closeSockets(); hub.close(); httpServer.close(); httpServer.closeAllConnections(); } };
}
