import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { acknowledgements, acknowledgementGroups, referenceLibraries } from "../src/lib/acknowledgements";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");
const manifest = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json")) as { packages: Record<string, { version: string; license?: string; dev?: boolean }> };
const direct = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).sort();
const credited = acknowledgements.flatMap(project => project.packages).sort();
if (JSON.stringify(direct) !== JSON.stringify(credited)) throw new Error("Update src/lib/acknowledgements.ts to cover every direct dependency exactly once.");
const inventory = new Map<string, { name: string; version: string; license: string; url: string; direct: boolean; development: boolean }>();
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path) continue;
  const name = path.split("node_modules/").at(-1)!;
  const key = `${name}@${entry.version}`;
  const previous = inventory.get(key);
  inventory.set(key, {
    name, version: entry.version, license: entry.license ?? "Not declared",
    url: `https://www.npmjs.com/package/${name}/v/${entry.version}`,
    direct: previous?.direct || (direct.includes(name) && path === `node_modules/${name}`),
    development: previous ? previous.development && Boolean(entry.dev) : Boolean(entry.dev),
  });
}
const packages = [...inventory.values()].sort((a, b) => a.name.localeCompare(b.name, "en") || a.version.localeCompare(b.version, "en"));
const packageLabel = (name: string) => {
  const entry = lock.packages[`node_modules/${name}`];
  if (!entry) throw new Error(`Missing locked package: ${name}`);
  return `[\`${name}@${entry.version}\`](https://www.npmjs.com/package/${name}/v/${entry.version})`;
};
const section = [
  "## Credits", "",
  "Filterstudio is built with the following open-source projects. Thank you to their authors and maintainers. The same overview is available through **Credits** at the bottom of the editor's left sidebar, or directly at `#acknowledgements`.", "",
  ...acknowledgementGroups.flatMap(group => [
    `### ${group.en}`, "", "| Project | Packages used | Purpose | License identifiers |", "| --- | --- | --- | --- |",
    ...acknowledgements.filter(project => project.group === group.id).map(project => `| [${project.name}](${project.url}) · [Source](${project.source}) | ${project.packages.map(packageLabel).join(", ")} | ${project.en} | ${[...new Set(project.packages.map(name => lock.packages[`node_modules/${name}`].license ?? "Not declared"))].join(", ")} |`), "",
  ]),
  "### Reference-data generation", "",
  "These optional Python libraries generate the checked-in numerical test fixtures. They are not required to build or run Filterstudio or to run its tests.", "",
  "| Project | Version | Purpose | License identifier |", "| --- | --- | --- | --- |",
  ...referenceLibraries.map(project => `| [${project.name}](${project.url}) · [Source](${project.source}) | ${project.version} | ${project.en} | ${project.license} |`), "",
  "### Complete dependency inventory", "",
  `All **${packages.length} package/version combinations** recorded in the lockfile, including transitive, development and platform-specific dependencies, are listed with package links and license identifiers in [THIRD_PARTY_PACKAGES.md](THIRD_PARTY_PACKAGES.md). They can also be searched on the Credits page. This inventory includes build/server tools that are not shipped in the browser bundle. License identifiers come from package metadata in \`package-lock.json\`; the upstream packages contain the full license texts and notices.`, "",
  "The runtime and package manager are [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/). Mathematical references are credited separately in the filter synthesis and network analysis sections above.", "",
  "After changing dependencies, run `npm run acknowledgements`. It updates this section, the complete inventory and the frontend data from the shared project catalogue and lockfile. The development server and browser build also run this command automatically. `npm run acknowledgements:check` checks that these files are current and every direct dependency is credited.",
].join("\n");
const start = "<!-- acknowledgements:start -->", end = "<!-- acknowledgements:end -->";
const readme = read("README.md");
const startIndex = readme.indexOf(start), endIndex = readme.indexOf(end);
if ((startIndex >= 0) !== (endIndex >= 0) || (startIndex >= 0 && endIndex < startIndex)) throw new Error("Invalid README acknowledgements markers.");
const updatedReadme = startIndex < 0 ? `${readme.trimEnd()}\n\n${start}\n${section}\n${end}\n` : `${readme.slice(0, startIndex)}${start}\n${section}\n${end}${readme.slice(endIndex + end.length)}`;
const fullInventory = ["# Third-party packages", "", "Generated from `package-lock.json` by `npm run acknowledgements`. Versions and license identifiers refer to the locked packages; see the linked package pages for upstream source and full notices. Includes optional platform-specific packages, which may not be installed on every machine.", "", "| Package | Version | Dependency | Usage | License identifier |", "| --- | --- | --- | --- | --- |", ...packages.map(p => `| [${p.name}](${p.url}) | ${p.version} | ${p.direct ? "Direct" : "Transitive"} | ${p.development ? "Development" : "Runtime / shared"} | ${p.license} |`), ""].join("\n");
const output = { "README.md": updatedReadme, "THIRD_PARTY_PACKAGES.md": fullInventory, "src/data/third-party-packages.json": `${JSON.stringify(packages, null, 2)}\n` };
const check = process.argv.includes("--check");
for (const [path, content] of Object.entries(output)) {
  const url = new URL(path, root);
  if (existsSync(url) && readFileSync(url, "utf8") === content) continue;
  if (check) throw new Error(`${path} is out of date. Run npm run acknowledgements.`);
  mkdirSync(fileURLToPath(new URL(".", url)), { recursive: true });
  writeFileSync(url, content);
}
console.log(`Acknowledgements: ${direct.length} direct packages, ${packages.length} total package/version combinations ${check ? "checked" : "updated"}.`);
