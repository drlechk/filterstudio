import { build } from "esbuild";

await build({ entryPoints: ["server/http.ts", "server/mcp-stdio.ts"], outdir: "dist-server", bundle: true, packages: "external", platform: "node", format: "esm", target: "node22", sourcemap: true });
