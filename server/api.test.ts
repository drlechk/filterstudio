import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createApp } from "./app";
import { BrowserHub } from "./hub";
import { checkRevision, type RemoteCommand, type RemoteWindow } from "../src/lib/remote-protocol";
import { defaultTolerance } from "../src/lib/tolerance";
import { createFilterTab } from "../src/lib/workspace";
import { MAX_WINDOW_TABS } from "./schemas";
import type { Project } from "../src/lib/types";

const server = createApp({ hub: new BrowserHub(250) });
let origin: string;
let project: Project;
beforeAll(async () => {
  server.httpServer.listen(0, "127.0.0.1");
  await once(server.httpServer, "listening");
  origin = `http://127.0.0.1:${(server.httpServer.address() as AddressInfo).port}`;
  const response = await request(server.httpServer).post("/api/filters/synthesize").send({});
  expect(response.status).toBe(200);
  project = response.body.project;
});
afterAll(() => server.close());

async function connectBrowser() {
  const socket = new WebSocket(origin.replace("http:", "ws:") + "/bridge", { origin });
  await once(socket, "open");
  const snapshot: RemoteWindow = { id: randomUUID(), activeTabId: "tab-one", tabs: [{ id: "tab-one", revision: 7, project, dirty: false, canUndo: false, canRedo: false, draft: { mode: "parameters", settings: project.settings, tolerance: defaultTolerance(project.settings), pending: false } }] };
  socket.send(JSON.stringify({ type: "snapshot", snapshot }));
  await expect.poll(() => server.hub.list().some(window => window.id === snapshot.id)).toBe(true);
  return { socket, snapshot };
}

function acknowledgeNewTabs({ socket, snapshot }: Awaited<ReturnType<typeof connectBrowser>>) {
  const commands: RemoteCommand[] = [];
  socket.on("message", raw => {
    const { command, requestId } = JSON.parse(raw.toString());
    commands.push(command);
    if (command.action !== "open") throw new Error("Expected a new tab, not an edit to an existing filter.");
    const created = createFilterTab(command.project);
    const project = created.initialProject;
    snapshot.tabs.push({ id: created.id, revision: 0, project, dirty: true, canUndo: false, canRedo: false,
      draft: { mode: project.tolerance ? "tolerance" : "parameters", settings: project.settings, tolerance: project.tolerance ?? defaultTolerance(project.settings), pending: false } });
    snapshot.activeTabId = created.id;
    socket.send(JSON.stringify({ type: "result", requestId, snapshot }));
  });
  return commands;
}

describe("REST/OpenAPI", () => {
  it("documents every operation and serves Swagger without external assets or authentication", async () => {
    const spec = await request(server.httpServer).get("/openapi.json").expect(200);
    expect(spec.body.openapi).toBe("3.1.0");
    expect(spec.body.security).toEqual([]);
    const creation = spec.body.paths["/api/filters"].post;
    expect(creation.operationId).toBe("create_filter");
    expect(creation.tags).toContain("Browser tabs");
    expect(creation.requestBody.content["application/json"].schema.required ?? []).not.toContain("windowId");
    expect(creation.responses[200].content["application/json"].schema.properties.tab.properties.project).toBeDefined();
    for (const operation of server.operations) {
      const documented = spec.body.paths[operation.path][operation.method];
      expect(documented.operationId).toBe(operation.name);
      expect(documented.responses[200].content["application/json"].schema.type).toBe("object");
    }
    const docs = await request(server.httpServer).get("/docs").expect(200);
    expect(docs.text).toContain('/docs/assets/swagger-ui-bundle.js');
    expect(docs.text).not.toContain("https://");
    await request(server.httpServer).get("/docs/assets/swagger-ui.css").expect(200);
    await request(server.httpServer).get("/api/health").expect(200, { status: "ok", name: "Filterstudio", version: "1.0.0", authentication: "none" });
  });

  it("uses the real component values for analysis and rounds only explicitly", async () => {
    const originalValue = project.nodes[1].section!.value;
    const full = await request(server.httpServer).post("/api/filters/synthesize").send({ componentPrecision: 1 }).expect(200);
    expect(full.body.project.nodes[1].section.value).toBe(originalValue);
    const response = await request(server.httpServer).post("/api/filters/analyze").send({ project, frequencies: [0, 1e6, 2e6] }).expect(200);
    expect(response.body.samples[1].db.s21).toBeCloseTo(-3.0102999566, 7);
    expect(response.body.samples[0].s21.re).toBeCloseTo(1, 7);
    expect(response.body.latex.sections[0]).toContain("L_{1}=");
    expect(response.body.latex.sections[0]).toContain("Z_{1}(s)=s\\,L_{1}");
    expect(response.body.latex.sections[0]).toContain("\\mathbf{M}_{1}(p)");
    expect(response.body.latex.abcdDenominator).toBe("Q(p)=1");
    for (const key of ["A", "B", "C", "D"]) {
      expect(response.body.latex.abcdEntries[key]).toContain(`${key}(p)=\\frac{P_{${key}}(p)}{Q(p)}`);
    }
    expect(response.body.normalization).toContain("ascending powers");
    const rounded = await request(server.httpServer).post("/api/filters/round").send({ project, digits: 3 }).expect(200);
    expect(rounded.body.changedValues).toBeGreaterThan(0);
    expect(rounded.body.project.nodes[1].section.value).toBe(Number(originalValue.toPrecision(3)));
    expect(project.nodes[1].section!.value).toBe(originalValue);
  });

  it("handles band/tolerance designs and singular samples explicitly", async () => {
    const band = await request(server.httpServer).post("/api/filters/synthesize").send({ settings: { family: "cauer", response: "bandstop", order: 3, cutoff: 1e6, bandwidth: 2e5 } }).expect(200);
    const response = await request(server.httpServer).post("/api/filters/analyze").send({ project: band.body.project, frequencies: [0, 1e6] }).expect(200);
    expect(response.body.samples).toHaveLength(2);
    expect(response.body.samples[1].db.s21).toBeLessThan(-100);
    const tolerance = { response: "lowpass", passband: [1e6], stopband: [2e6], passbandLoss: 1, stopbandLoss: 40 };
    const generated = await request(server.httpServer).post("/api/filters/synthesize").send({ settings: { family: "chebyshev" }, tolerance }).expect(200);
    expect(generated.body.project.tolerance).toEqual(tolerance);
    expect(generated.body.project.settings.order).toBe(5);
  });

  it("synthesizes and analyzes the maximum supported orders, including expanded Cauer band circuits", async () => {
    for (const family of ['butterworth', 'chebyshev', 'chebyshev2', 'cauer']) {
      const order = family === 'cauer' ? 19 : family === 'chebyshev2' ? 11 : 20;
      for (const response of ['lowpass', 'bandpass']) {
        const generated = await request(server.httpServer).post('/api/filters/synthesize').send({ settings: { family, order, response, cutoff: 1e6, bandwidth: .5e6, attenuation: 80 } }).expect(200);
        const candidate = generated.body.project;
        expect(candidate.settings.order).toBe(order);
        if (family === 'cauer' && response === 'bandpass') expect(candidate.nodes).toHaveLength(30);
        await request(server.httpServer).post('/api/filters/validate').send({ project: candidate }).expect(200);
        const analyzed = await request(server.httpServer).post('/api/filters/analyze').send({ project: candidate, frequencies: [1e6] }).expect(200);
        const expected = response === 'lowpass' ? (family === 'butterworth' ? -3.0102999566 : family === 'chebyshev2' ? -80 : -.5) : (family === 'chebyshev' ? -.5 : 0);
        expect(analyzed.body.samples[0].db.s21).toBeCloseTo(expected, 5);
      }
    }
    await request(server.httpServer).post('/api/filters/synthesize').send({ settings: { order: 21 } }).expect(400);
    await request(server.httpServer).post('/api/filters/synthesize').send({ settings: { family: 'cauer', order: 20 } }).expect(422);
  });

  it("supports inverse Chebyshev stopband edges, tolerance masks and project validation", async () => {
    const generated = await request(server.httpServer).post('/api/filters/synthesize').send({ settings: { family: 'chebyshev2', order: 5, attenuation: 40 } }).expect(200);
    const candidate = generated.body.project;
    await request(server.httpServer).post('/api/filters/validate').send({ project: candidate }).expect(200);
    const analyzed = await request(server.httpServer).post('/api/filters/analyze').send({ project: candidate, frequencies: [0, 1e6, 1e6 / Math.cos(Math.PI / 10)] }).expect(200);
    expect(analyzed.body.samples[0].db.s21).toBeCloseTo(0, 7);
    expect(analyzed.body.samples[1].db.s21).toBeCloseTo(-40, 7);
    expect(analyzed.body.samples[2].db.s21).toBeLessThan(-150);
    const tolerance = { response: 'lowpass', passband: [1e6], stopband: [2e6], passbandLoss: 1, stopbandLoss: 40 };
    const masked = await request(server.httpServer).post('/api/filters/synthesize').send({ settings: { family: 'chebyshev2' }, tolerance }).expect(200);
    expect(masked.body.project.settings).toMatchObject({ family: 'chebyshev2', order: 5, attenuation: 40 });
    expect(masked.body.project.tolerance).toEqual(tolerance);
    for (const settings of [{ order: 2 }, { order: 13 }, { order: 5, attenuation: 20 }]) {
      await request(server.httpServer).post('/api/filters/synthesize').send({ settings: { family: 'chebyshev2', ...settings } }).expect(422);
      await request(server.httpServer).post('/api/filters/validate').send({ project: { ...candidate, settings: { ...candidate.settings, ...settings } } }).expect(400);
    }
  });

  it("rejects invalid requests, nonfinite/coupled settings, bad topology and unsupported rounding", async () => {
    await request(server.httpServer).post("/api/filters/synthesize").set("Content-Type", "application/json").send("{").expect(400);
    await request(server.httpServer).post("/api/filters/synthesize").send({ typo: true }).expect(400);
    await request(server.httpServer).post("/api/filters/synthesize").send({ settings: { cutoff: null } }).expect(400);
    await request(server.httpServer).post("/api/filters/synthesize").send({ settings: { family: "cauer", order: 4 } }).expect(422);
    await request(server.httpServer).post("/api/filters/synthesize").send({ settings: { response: "bandpass", bandwidth: 1 } }).expect(422);
    await request(server.httpServer).post("/api/filters/round").send({ project, digits: 0 }).expect(400);
    await request(server.httpServer).post("/api/filters/analyze").send({ project, frequencies: [1], sweep: project.sweep }).expect(400);
    await request(server.httpServer).post("/api/filters/analyze").send({ project, sweep: { ...project.sweep, points: 1000000 } }).expect(400);
    const incomplete = { ...project, wires: [] };
    const valid = await request(server.httpServer).post("/api/filters/validate").send({ project: incomplete }).expect(200);
    expect(valid.body.analyzable).toBe(false);
    await request(server.httpServer).post("/api/filters/analyze").send({ project: incomplete }).expect(422);
  });

  it("blocks untrusted browser origins and hosts without requiring credentials", async () => {
    await request(server.httpServer).get("/api/windows").set("Origin", "https://example.com").expect(403);
    await request(server.httpServer).get("/api/windows").set("Host", "example.com").expect(403);
    await request(server.httpServer).get("/api/windows").set("Origin", "null").expect(403);
    await request(server.httpServer).get("/api/windows").set("Origin", origin).expect(200);
    await request(server.httpServer).get("/mcp").expect(405);
    await request(server.httpServer).get("/api/missing").expect(404);
  });
});

describe("new filter creation", () => {
  it("explains missing windows without claiming a filter was created", async () => {
    const response = await request(server.httpServer).post("/api/filters").send({}).expect(503);
    expect(response.body.error.message).toContain("Open Filterstudio");
    await request(server.httpServer).post("/api/filters").send({ windowId: randomUUID() }).expect(404);
    expect(server.hub.list()).toEqual([]);
  });

  it("creates default and custom filters in distinct active tabs while preserving an unsaved draft", async () => {
    const browser = await connectBrowser();
    const { socket, snapshot } = browser;
    try {
      snapshot.tabs[0].dirty = true;
      snapshot.tabs[0].draft = { ...snapshot.tabs[0].draft, settings: { ...project.settings, order: 9 }, pending: true };
      socket.send(JSON.stringify({ type: "snapshot", snapshot }));
      await expect.poll(() => server.hub.tab(snapshot.id, "tab-one").draft.pending).toBe(true);
      const original = structuredClone(snapshot.tabs[0]);
      const commands = acknowledgeNewTabs(browser);
      const first = await request(server.httpServer).post("/api/filters").send({}).expect(200);
      expect(first.body.windowId).toBe(snapshot.id);
      expect(first.body.tab.project).toEqual(project);
      expect(first.body.tab).toMatchObject({ dirty: true, revision: 0, canUndo: false, canRedo: false });
      const settings = { family: "chebyshev", order: 20, response: "bandpass", cutoff: 2e6, bandwidth: 5e5 };
      const second = await request(server.httpServer).post("/api/filters").send({ name: "New band filter", settings, componentPrecision: 1 }).expect(200);
      expect(second.body.tab.project.settings).toMatchObject(settings);
      expect(second.body.tab.project.name).toBe("New band filter");
      expect(second.body.tab.project.componentPrecision).toBe(1);
      const reference = await request(server.httpServer).post("/api/filters/synthesize").send({ settings }).expect(200);
      expect(second.body.tab.project.nodes).toEqual(reference.body.project.nodes);
      expect(second.body.tab.id).not.toBe(first.body.tab.id);
      expect(snapshot.tabs).toHaveLength(3);
      expect(snapshot.tabs[0]).toEqual(original);
      expect(snapshot.activeTabId).toBe(second.body.tab.id);
      expect(commands).toHaveLength(2);
      const retrieved = await request(server.httpServer).get(`/api/windows/${snapshot.id}/tabs/${second.body.tab.id}`).expect(200);
      expect(retrieved.body.tab).toEqual(second.body.tab);
    } finally { socket.close(); await once(socket, "close"); }
  });

  it("requires a window choice when several are connected and targets only that window", async () => {
    const first = await connectBrowser(), second = await connectBrowser();
    try {
      const firstCommands = acknowledgeNewTabs(first), secondCommands = acknowledgeNewTabs(second);
      const ambiguous = await request(server.httpServer).post("/api/filters").send({}).expect(409);
      expect(ambiguous.body.error.message).toContain("windowId");
      expect(firstCommands).toHaveLength(0);
      expect(secondCommands).toHaveLength(0);
      const created = await request(server.httpServer).post("/api/filters").send({ windowId: second.snapshot.id, name: "Selected window" }).expect(200);
      expect(created.body.windowId).toBe(second.snapshot.id);
      expect(first.snapshot.tabs).toHaveLength(1);
      expect(second.snapshot.tabs).toHaveLength(2);
      expect(firstCommands).toHaveLength(0);
      expect(secondCommands).toHaveLength(1);
    } finally {
      const closed = [once(first.socket, "close"), once(second.socket, "close")];
      first.socket.close(); second.socket.close(); await Promise.all(closed);
    }
  });

  it("validates settings before opening a tab and rejects full windows without disconnecting them", async () => {
    const browser = await connectBrowser();
    const { socket, snapshot } = browser;
    try {
      const commands = acknowledgeNewTabs(browser);
      await request(server.httpServer).post("/api/filters").send({ settings: { order: 21 } }).expect(400);
      await request(server.httpServer).post("/api/filters").send({ settings: { family: "cauer", order: 20 } }).expect(422);
      await request(server.httpServer).post("/api/filters").send({ settings: { response: "bandpass" } }).expect(422);
      await request(server.httpServer).post("/api/filters").send({ unexpected: true }).expect(400);
      expect(commands).toHaveLength(0);
      const original = snapshot.tabs[0];
      snapshot.tabs = Array.from({ length: MAX_WINDOW_TABS }, (_, i) => ({ ...original, id: i ? `tab-${i}` : "tab-one" }));
      socket.send(JSON.stringify({ type: "snapshot", snapshot }));
      await expect.poll(() => server.hub.get(snapshot.id).tabs.length).toBe(MAX_WINDOW_TABS);
      const full = await request(server.httpServer).post("/api/filters").send({}).expect(409);
      expect(full.body.error.message).toContain("Close a tab");
      expect(commands).toHaveLength(0);
      expect(socket.readyState).toBe(WebSocket.OPEN);
    } finally { socket.close(); await once(socket, "close"); }
  });

  it("reports unacknowledged or ineffective creation instead of returning an existing filter", async () => {
    const { socket, snapshot } = await connectBrowser();
    try {
      await request(server.httpServer).post("/api/filters").send({}).expect(504);
      socket.on("message", raw => {
        const { requestId } = JSON.parse(raw.toString());
        socket.send(JSON.stringify({ type: "result", requestId, snapshot }));
      });
      const unchanged = await request(server.httpServer).post("/api/filters").send({}).expect(409);
      expect(unchanged.body.error.message).toContain("did not confirm");
      expect(snapshot.tabs).toHaveLength(1);
    } finally { socket.close(); await once(socket, "close"); }
  });

  it.each(["http", "stdio"] as const)("creates a tolerance-designed filter with a real MCP %s client", async transport => {
    const client = new Client({ name: `create-${transport}-test`, version: "1" });
    const browser = await connectBrowser();
    const { socket, snapshot } = browser;
    try {
      const commands = acknowledgeNewTabs(browser);
      await client.connect(transport === "http" ? new StreamableHTTPClientTransport(new URL("/mcp", origin))
        : new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", "server/mcp-stdio.ts"], env: { FILTERSTUDIO_URL: origin }, stderr: "pipe" }));
      const tool = (await client.listTools()).tools.find(tool => tool.name === "create_filter");
      expect(tool?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false, idempotentHint: false });
      const tolerance = { response: "lowpass", passband: [1e6], stopband: [2e6], passbandLoss: 1, stopbandLoss: 40 };
      const result = await client.callTool({ name: "create_filter", arguments: { name: "Created through MCP", settings: { family: "chebyshev" }, tolerance, componentPrecision: "full" } });
      expect(result.isError).toBeFalsy();
      const created = result.structuredContent as { windowId: string; tab: RemoteWindow["tabs"][number]; notes: string[] };
      expect(created.windowId).toBe(snapshot.id);
      expect(created.tab.id).toBe(snapshot.activeTabId);
      expect(created.tab.project).toMatchObject({ name: "Created through MCP", tolerance, componentPrecision: "full", settings: { family: "chebyshev", order: 5 } });
      expect(created.notes.length).toBeGreaterThan(0);
      expect(snapshot.tabs).toHaveLength(2);
      expect(snapshot.tabs[0].project).toEqual(project);
      expect(commands).toHaveLength(1);
      const fetched = await client.callTool({ name: "get_filter_tab", arguments: { windowId: created.windowId, tabId: created.tab.id } });
      expect(fetched.structuredContent).toEqual({ tab: created.tab });
    } finally { await client.close(); socket.close(); await once(socket, "close"); }
  });
});

describe("MCP", () => {
  it("initializes a real HTTP client, lists tools/resources, calculates and reports tool errors", async () => {
    const client = new Client({ name: "test", version: "1" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", origin)));
      const list = await client.listTools();
      expect(list.tools.map(tool => tool.name).sort()).toEqual(server.operations.map(operation => operation.name).sort());
      const result = await client.callTool({ name: "synthesize_filter", arguments: { name: "MCP filter" } });
      expect(result.isError).toBeFalsy();
      expect((result.structuredContent as { project: Project }).project.name).toBe("MCP filter");
      const invalid = await client.callTool({ name: "synthesize_filter", arguments: { settings: { family: "cauer", order: 4 } } });
      expect(invalid.isError).toBe(true);
      const resource = await client.readResource({ uri: "filterstudio://openapi" });
      expect(JSON.parse((resource.contents[0] as { text: string }).text).openapi).toBe("3.1.0");
    } finally { await client.close(); }
  });

  it("supports the stdio entry point and shares the HTTP server state", async () => {
    const client = new Client({ name: "stdio-test", version: "1" });
    const { socket, snapshot } = await connectBrowser();
    try {
      await client.connect(new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", "server/mcp-stdio.ts"], env: { FILTERSTUDIO_URL: origin }, stderr: "pipe" }));
      const result = await client.callTool({ name: "list_filter_windows", arguments: {} });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toEqual((await request(server.httpServer).get("/api/windows")).body);
      expect((result.structuredContent as { windows: { id: string }[] }).windows.some(window => window.id === snapshot.id)).toBe(true);
      const calculated = await client.callTool({ name: "synthesize_filter", arguments: { settings: { order: 3 } } });
      expect((calculated.structuredContent as { project: Project }).project.settings.order).toBe(3);
    } finally { await client.close(); socket.close(); await once(socket, "close"); }
  });
});

describe("live browser bridge", () => {
  it("acknowledges writes, preserves other components, and rejects stale revisions on both sides", async () => {
    const { socket, snapshot } = await connectBrowser();
    try {
      socket.on("message", raw => {
        const { command, requestId } = JSON.parse(raw.toString());
        snapshot.tabs[0] = { ...snapshot.tabs[0], project: command.project, revision: 8, dirty: true, canUndo: true };
        socket.send(JSON.stringify({ type: "result", requestId, snapshot }));
      });
      const path = `/api/windows/${snapshot.id}/tabs/tab-one`;
      const updated = await request(server.httpServer).patch(`${path}/components/${project.nodes[1].id}`).send({ expectedRevision: 7, changes: { value: 1e-5, label: "Changed" } }).expect(200);
      expect(updated.body.tab.revision).toBe(8);
      expect(updated.body.tab.project.nodes[1].section.value).toBe(1e-5);
      expect(updated.body.tab.project.nodes[2]).toEqual(project.nodes[2]);
      expect(updated.body.tab.canUndo).toBe(true);
      await request(server.httpServer).post(`${path}/round`).send({ expectedRevision: 7, digits: 2 }).expect(409);
      expect(() => checkRevision(snapshot.tabs[0], 7)).toThrow(/changed/);
      await request(server.httpServer).get(path).expect(200);
      await request(server.httpServer).patch(`${path}/components/missing`).send({ expectedRevision: 8, changes: { value: 1 } }).expect(404);
    } finally { socket.close(); await once(socket, "close"); }
  });

  it("reports timeout, concurrent edits and disconnected windows instead of claiming success", async () => {
    const { socket, snapshot } = await connectBrowser();
    const pending = server.hub.command(snapshot.id, { action: "select", tabId: "tab-one" });
    await expect(server.hub.command(snapshot.id, { action: "select", tabId: "tab-one" })).rejects.toMatchObject({ status: 409 });
    await expect(pending).rejects.toMatchObject({ status: 504 });
    const disconnected = server.hub.command(snapshot.id, { action: "select", tabId: "tab-one" });
    const rejection = expect(disconnected).rejects.toMatchObject({ status: 503 });
    socket.close();
    await rejection;
    await expect.poll(() => server.hub.list().some(window => window.id === snapshot.id)).toBe(false);
  });

  it("propagates browser-side conflicts if a manual edit races the request", async () => {
    const { socket, snapshot } = await connectBrowser();
    try {
      socket.on("message", raw => {
        const { requestId } = JSON.parse(raw.toString());
        snapshot.tabs[0].revision = 8;
        socket.send(JSON.stringify({ type: "result", requestId, snapshot, error: { status: 409, message: "The tab changed." } }));
      });
      await request(server.httpServer).post(`/api/windows/${snapshot.id}/tabs/tab-one/round`).send({ expectedRevision: 7, digits: 2 }).expect(409);
      expect(server.hub.tab(snapshot.id, "tab-one").revision).toBe(8);
    } finally { socket.close(); await once(socket, "close"); }
  });
});
