import { build } from "esbuild";
import { copyFile } from "node:fs/promises";

await build({ entryPoints: ["server/http.ts", "server/mcp-stdio.ts"], outdir: "dist-server", bundle: true, packages: "external", platform: "node", format: "esm", target: "node22", sourcemap: true });
for (const name of ["LICENSE", "NOTICE"]) {
  await copyFile(new URL(`../${name}`, import.meta.url), new URL(`../dist-server/${name}`, import.meta.url));
}
