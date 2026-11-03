import { fileURLToPath } from "node:url";
import { createApp } from "./app";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 4310);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer from 1 to 65535.");
const extraHosts = (process.env.FILTERSTUDIO_ALLOWED_HOSTS ?? "").split(",").map(value => value.trim()).filter(Boolean);
const server = createApp({ distDir: fileURLToPath(new URL("../dist/", import.meta.url)), allowedHosts: [...extraHosts, ...(host !== "0.0.0.0" && host !== "::" ? [host] : [])] });
server.httpServer.on("error", error => { console.error(`Filterstudio: ${error.message}`); process.exitCode = 1; });
server.httpServer.listen(port, host, () => {
  const address = `http://${host.includes(":") ? `[${host}]` : host}:${port}`;
  console.log(`Filterstudio: ${address}\nSwagger UI: ${address}/docs\nOpenAPI: ${address}/openapi.json\nMCP: ${address}/mcp\nAuthentication: none`);
});
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => server.close());
