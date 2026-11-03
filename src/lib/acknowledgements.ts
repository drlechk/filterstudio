export const acknowledgementGroups = [
  { id: "browser", de: "Oberfläche und Schriften", en: "Interface and fonts" },
  { id: "server", de: "API und MCP-Server", en: "API and MCP server" },
  { id: "development", de: "Entwicklung und Tests", en: "Development and testing" },
] as const;

type ProjectCredit = {
  name: string;
  group: (typeof acknowledgementGroups)[number]["id"];
  packages: string[];
  url: string;
  source: string;
  de: string;
  en: string;
};

/** Optional Python tools used only to generate independent regression fixtures. */
export const referenceLibraries = [
  { name: "SciPy", version: "1.17.1", license: "BSD-3-Clause", url: "https://scipy.org/", source: "https://github.com/scipy/scipy", de: "Unabhängige elliptische Referenzfilter für die gespeicherten Testdaten; keine Laufzeitabhängigkeit.", en: "Independent elliptic reference filters for checked-in test data; not a runtime dependency." },
  { name: "NumPy", version: "2.4.6", license: "BSD-3-Clause", url: "https://numpy.org/", source: "https://github.com/numpy/numpy", de: "Frequenzarrays und komplexe Zahlen bei der Erzeugung der Referenzdaten; keine Laufzeitabhängigkeit.", en: "Frequency arrays and complex numbers during reference-data generation; not a runtime dependency." },
];

/** Direct dependencies are grouped by upstream project; the complete inventory comes from the lockfile. */
export const acknowledgements: ProjectCredit[] = [
  { name: "React & React DOM", group: "browser", packages: ["react", "react-dom"], url: "https://react.dev/", source: "https://github.com/react/react", de: "Komponenten, Zustandsverwaltung und Darstellung der Oberfläche.", en: "Components, application state and interface rendering." },
  { name: "React Flow / xyflow", group: "browser", packages: ["@xyflow/react"], url: "https://reactflow.dev/", source: "https://github.com/xyflow/xyflow", de: "Interaktiver Schaltungseditor mit Knoten, Verbindungen, Zoom und Verschieben.", en: "Interactive circuit editor with nodes, connections, zooming and panning." },
  { name: "KaTeX", group: "browser", packages: ["katex"], url: "https://katex.org/", source: "https://github.com/KaTeX/KaTeX", de: "Darstellung mathematischer Formeln und Matrizen.", en: "Typesetting mathematical formulas and matrices." },
  { name: "MathJax", group: "browser", packages: ["mathjax-full"], url: "https://www.mathjax.org/", source: "https://github.com/mathjax/MathJax-src", de: "Vektorformeln für die Schaltungsvorschau und den lokalen PDF-Export.", en: "Vector equations for circuit previews and local PDF export." },
  { name: "jsPDF", group: "browser", packages: ["jspdf"], url: "https://github.com/parallax/jsPDF", source: "https://github.com/parallax/jsPDF", de: "PDF-Erzeugung direkt im Browser.", en: "PDF creation directly in the browser." },
  { name: "svg2pdf.js", group: "browser", packages: ["svg2pdf.js"], url: "https://github.com/yWorks/svg2pdf.js", source: "https://github.com/yWorks/svg2pdf.js", de: "Umwandlung der Schaltungs- und Formelgrafiken in PDF-Vektoren.", en: "Converting circuit and equation graphics to PDF vectors." },
  { name: "Lucide", group: "browser", packages: ["lucide-react"], url: "https://lucide.dev/", source: "https://github.com/lucide-icons/lucide", de: "SVG-Symbole für Bedienelemente und Navigation.", en: "SVG icons for controls and navigation." },
  { name: "DM Sans / Fontsource", group: "browser", packages: ["@fontsource-variable/dm-sans"], url: "https://fontsource.org/fonts/dm-sans", source: "https://github.com/fontsource/font-files/tree/main/fonts/variable/dm-sans", de: "Lokal eingebundene variable Schrift für Texte und Bedienelemente.", en: "Locally bundled variable typeface for text and controls." },
  { name: "Manrope / Fontsource", group: "browser", packages: ["@fontsource-variable/manrope"], url: "https://fontsource.org/fonts/manrope", source: "https://github.com/fontsource/font-files/tree/main/fonts/variable/manrope", de: "Lokal eingebundene variable Schrift für Überschriften und die Wortmarke.", en: "Locally bundled variable typeface for headings and the wordmark." },
  { name: "Model Context Protocol TypeScript SDK", group: "server", packages: ["@modelcontextprotocol/sdk"], url: "https://modelcontextprotocol.io/", source: "https://github.com/modelcontextprotocol/typescript-sdk", de: "MCP-Werkzeuge sowie HTTP- und stdio-Anbindung für LLM-Apps.", en: "MCP tools and HTTP/stdio connections for LLM apps." },
  { name: "Express", group: "server", packages: ["express"], url: "https://expressjs.com/", source: "https://github.com/expressjs/express", de: "Lokaler HTTP-Server und REST-Endpunkte.", en: "Local HTTP server and REST endpoints." },
  { name: "Zod", group: "server", packages: ["zod"], url: "https://zod.dev/", source: "https://github.com/colinhacks/zod", de: "Validierung der API-Eingaben und gemeinsame Schemata für OpenAPI und MCP.", en: "API input validation and shared schemas for OpenAPI and MCP." },
  { name: "Swagger UI", group: "server", packages: ["swagger-ui-dist"], url: "https://swagger.io/open-source/swagger-ui/", source: "https://github.com/swagger-api/swagger-ui", de: "Interaktive Dokumentation der OpenAPI-Endpunkte.", en: "Interactive documentation of the OpenAPI endpoints." },
  { name: "ws", group: "server", packages: ["ws"], url: "https://github.com/websockets/ws", source: "https://github.com/websockets/ws", de: "WebSocket-Verbindung zwischen lokalem Server und offenen Filter-Tabs.", en: "WebSocket connection between the local server and open filter tabs." },
  { name: "TypeScript", group: "development", packages: ["typescript"], url: "https://www.typescriptlang.org/", source: "https://github.com/microsoft/TypeScript", de: "Typsystem und statische Prüfung des Quellcodes.", en: "Type system and static checking of the source code." },
  { name: "Vite & React plugin", group: "development", packages: ["vite", "@vitejs/plugin-react"], url: "https://vite.dev/", source: "https://github.com/vitejs/vite", de: "Entwicklungsserver, React-Aktualisierung und Produktions-Build der Weboberfläche.", en: "Development server, React refresh and production build of the browser app." },
  { name: "esbuild", group: "development", packages: ["esbuild"], url: "https://esbuild.github.io/", source: "https://github.com/evanw/esbuild", de: "Bündelung des HTTP-Servers und der stdio-MCP-Anbindung.", en: "Bundling the HTTP server and stdio MCP bridge." },
  { name: "tsx", group: "development", packages: ["tsx"], url: "https://tsx.hirok.io/", source: "https://github.com/privatenumber/tsx", de: "Ausführung von TypeScript im Entwicklungsserver und in Hilfsskripten.", en: "Running TypeScript in the development server and utility scripts." },
  { name: "Vitest", group: "development", packages: ["vitest"], url: "https://vitest.dev/", source: "https://github.com/vitest-dev/vitest", de: "Tests der Filterberechnung, Projekte und Schnittstellen.", en: "Tests for filter calculations, projects and integrations." },
  { name: "Supertest", group: "development", packages: ["supertest"], url: "https://github.com/forwardemail/supertest", source: "https://github.com/forwardemail/supertest", de: "HTTP-Integrationstests der REST-Endpunkte und der Swagger-Auslieferung.", en: "HTTP integration tests for REST endpoints and Swagger delivery." },
  { name: "DefinitelyTyped", group: "development", packages: ["@types/express", "@types/katex", "@types/node", "@types/react", "@types/react-dom", "@types/supertest", "@types/swagger-ui-dist", "@types/ws"], url: "https://definitelytyped.org/", source: "https://github.com/DefinitelyTyped/DefinitelyTyped", de: "TypeScript-Typdefinitionen für die verwendeten Bibliotheken und Node.js.", en: "TypeScript definitions for the libraries used here and Node.js." },
];
