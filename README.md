# Filterstudio

An interactive analog filter lab in your browser. Students can generate passive filters, modify their components, and explore the relationship between circuits, ABCD matrices, and S-parameters.

The browser application can run entirely as a static website: React and TypeScript are compiled into HTML, CSS, and JavaScript using Vite. Calculations, file imports, and exports run in the browser. An optional local Node.js server adds a REST API with OpenAPI/Swagger documentation and an MCP server for LLM apps, including control of open filter tabs. Neither mode requires a Filterstudio account, authentication, or an API key. Fonts and libraries are bundled locally, so the application does not depend on external CDN services at runtime. React Flow provides the circuit canvas, and KaTeX renders the formulas.

## Running locally

Requirements: Node.js 22.12+, 24, or 26+ and npm (recommended: Node.js 24 LTS).

```sh
npm install
npm run dev
```

Open the local URL printed in the terminal. When `package-lock.json` is available, use `npm ci` to install the locked dependencies reproducibly.

```sh
npm test
npm run build
npm run preview
```

`npm test` checks known filter responses, reciprocity, energy conservation, project validation, and REST/MCP/WebSocket integration. High-order Cauer tests compare complex responses against checked-in reference data generated independently with SciPy (`scripts/generate-elliptic-reference.py`); running the tests does not require Python. Integration tests open temporary loopback ports. `npm run build` checks TypeScript and writes the production website to `dist/` and the optional server to `dist-server/`. `npm run preview` serves only the website for local inspection. Open the app over HTTP; double-clicking `dist/index.html` is not supported because the app uses JavaScript modules.

## Local API, Swagger and MCP

Build and start the server from the project directory:

```sh
npm ci
npm run build
npm start
```

Keep this process running while using an LLM app. It serves both the editor and the API on **127.0.0.1:4310**:

| Address | Purpose |
| --- | --- |
| [http://127.0.0.1:4310/](http://127.0.0.1:4310/) | Editor with live API/MCP connection |
| [http://127.0.0.1:4310/docs](http://127.0.0.1:4310/docs) | Swagger UI, schemas and interactive **Try it out** (`/swagger` also works) |
| [http://127.0.0.1:4310/openapi.json](http://127.0.0.1:4310/openapi.json) | OpenAPI 3.1 specification |
| `http://127.0.0.1:4310/mcp` | MCP Streamable HTTP endpoint |
| [http://127.0.0.1:4310/api/health](http://127.0.0.1:4310/api/health) | Server health |

There is **no login, OAuth, bearer token or API key**. Leave authentication fields empty in clients. Swagger's scripts and styles are served locally. MCP uses stateless Streamable HTTP; it does not provide the older `/sse` transport. A separate stdio entry point supports desktop clients and forwards requests to this same running server.

For development, run `npm run dev:server` and `npm run dev` in two terminals. Vite proxies the API and browser connection to port 4310. Open the Vite URL; its header changes to **API/MCP connected** when the connection succeeds. The production editor connects when served by `npm start`. Static hosting and `npm run preview` remain browser-only.

`PORT` changes the server port and `HOST` changes the bind address. The default listens only on the local computer. Browser requests are checked for trusted host/origin; this is not user authentication. If intentionally binding to a network interface, include its hostname/IP in `FILTERSTUDIO_ALLOWED_HOSTS` (comma-separated). Everyone who can reach such an unauthenticated server can use its API and control connected editor tabs. The stdio bridge accepts `FILTERSTUDIO_URL`, for example `http://127.0.0.1:4311`; update client URLs and the Vite proxy in `vite.config.ts` if changing the port during development.

### Available operations

REST routes and MCP tools share input schemas, validation and the browser's calculation engine. Swagger documents the full request/response schemas and error responses. All frequencies are **Hz**, resistances **ohms**, inductances **henries**, and capacitances **farads**. LC blocks use `value` for inductance and `value2` for capacitance. Calculations keep floating-point precision; display precision does not round stored values.

| MCP tool | REST endpoint | Effect |
| --- | --- | --- |
| `create_filter` | `POST /api/filters` | Design a new filter and open it in a new active tab in one call; optional `windowId` selects the browser window |
| `synthesize_filter` | `POST /api/filters/synthesize` | Return a project and synthesis notes; optional tolerance-mask design |
| `validate_filter` | `POST /api/filters/validate` | Validate a project and check circuit continuity |
| `analyze_filter` | `POST /api/filters/analyze` | ABCD/S matrices, normalized polynomials, LaTeX and numeric samples |
| `round_filter` | `POST /api/filters/round` | Return a project with explicitly rounded component values |
| `list_filter_windows` | `GET /api/windows` | Connected browser windows, their tab IDs, names and revisions |
| `get_filter_tab` | `GET /api/windows/{windowId}/tabs/{tabId}` | Actual project, draft controls, revision and undo/redo state |
| `open_filter_tab` | `POST /api/windows/{windowId}/tabs` | Open a project in a new active tab |
| `select_filter_tab` | `POST /api/windows/{windowId}/tabs/{tabId}/select` | Switch the active tab |
| `replace_filter_tab` | `PUT /api/windows/{windowId}/tabs/{tabId}` | Replace the project, including layout and connections |
| `update_filter_component` | `PATCH /api/windows/{windowId}/tabs/{tabId}/components/{componentId}` | Change component values, label or connection |
| `round_filter_tab` | `POST /api/windows/{windowId}/tabs/{tabId}/round` | Round physical component values in the editor |
| `set_filter_display_precision` | `POST /api/windows/{windowId}/tabs/{tabId}/precision` | Set label precision to 1–15 digits or `"full"` |
| `undo_filter_tab` / `redo_filter_tab` | `POST /api/windows/{windowId}/tabs/{tabId}/undo` or `/redo` | Undo or redo one edit |

`synthesize_filter`, `validate_filter`, `analyze_filter`, and `round_filter` work without an open browser and do not modify live tabs. For browser control, open the local editor. Use `create_filter` for a new filter; to edit an existing filter, call `list_filter_windows`, then `get_filter_tab`. Include the returned `revision` as **`expectedRevision`** for each edit, rounding operation, precision change, undo or redo. Revisions also track ungenerated parameter drafts. A stale revision returns **409**; read the tab again before deciding to retry. Avoid overwriting a pending draft unless intended: project edits reset the draft controls to the resulting project settings. Browser writes complete only after the editor acknowledges them. Project edits create undo steps and mark the project unsaved. Opening or creating a new tab preserves existing tabs and their drafts; the new tab has its own history.

The server does **not** persist projects or write project files. Save through the editor's JSON export or save the `project` object returned by the API. Browser windows disappear from the API when disconnected; reloading the page creates new IDs and loses unsaved tabs, just like standalone use. Keep the editor open while an LLM works on it. A timeout reports an unknown outcome: read the current state before repeating a write.

### Creating a new filter

Open the editor at `http://127.0.0.1:4310/`, then call **`create_filter`** through MCP or **`POST /api/filters`** through REST. The filter is calculated and opened as a new active tab in one call; no existing project or tab ID is required. An empty object `{}` creates the default fifth-order Butterworth low-pass at 1 MHz and 50 Ω. To specify a design:

```sh
curl -sS http://127.0.0.1:4310/api/filters \
  -H 'Content-Type: application/json' \
  -d '{"name":"New 2 MHz band-pass","settings":{"family":"chebyshev","response":"bandpass","order":7,"cutoff":2000000,"bandwidth":500000,"impedance":50,"ripple":0.5},"componentPrecision":"full"}'
```

Use the same JSON object as the arguments to the MCP tool `create_filter`. The optional `tolerance` object works just as in `synthesize_filter` and determines the filter settings and order from a tolerance mask. All synthesis limits apply, including prototype orders up to 20 for Butterworth/Chebyshev and odd orders up to 19 for Cauer. `componentPrecision` controls labels only; newly calculated component values retain their full precision.

When exactly one editor window is connected, `windowId` is selected automatically. If several are connected, call `list_filter_windows` or `GET /api/windows` and add `"windowId":"<chosen window ID>"` to the request. An ambiguous target returns **409**; no connected editor returns **503**, and an unknown explicit ID returns **404**. Browser creation is limited to 100 tabs per window; a full window returns **409** before sending a command.

The result is `{ "windowId": "...", "tab": { "id": "...", "revision": 0, "project": {...}, ... }, "notes": [...] }`. The returned tab is the new tab acknowledged by the editor, marked unsaved. Use `tab.project` for analysis/export and `windowId` plus `tab.id` to read or edit it. Each successful call creates another independent filter, even with identical parameters. After a timeout, list the tabs before retrying to avoid duplicates. Use `synthesize_filter` if only the calculated project is needed without an open editor, and `open_filter_tab` to open an existing project object.

For example, ask Codex or Claude: “Create a new seventh-order Chebyshev band-pass filter at 2 MHz with 500 kHz bandwidth in Filterstudio, keeping the existing filters.” The MCP server's instructions direct clients to `create_filter` for this workflow. Restart or reconnect an already-running MCP client after updating the server so its tool list includes the new action.

### Standalone calculation

Example synthesis request (no authentication headers):

```sh
curl -sS http://127.0.0.1:4310/api/filters/synthesize \
  -H 'Content-Type: application/json' \
  -d '{"name":"1 MHz low-pass","settings":{"family":"butterworth","response":"lowpass","order":5,"cutoff":1000000,"impedance":50},"componentPrecision":"full"}'

curl -sS http://127.0.0.1:4310/api/windows
```

The synthesis response is `{ "project": {...}, "notes": [...] }`. Send that **project object** to `/api/filters/analyze` as `{ "project": {...}, "frequencies": [100000,1000000,2000000] }`, or use `"sweep":{"min":100000,"max":10000000,"points":401}` instead of `frequencies`. Without either option analysis samples the reference frequency once. Sweep requests are limited to 2,001 samples and explicit frequency arrays to 128. Polynomial coefficients use ascending powers of `p = s / (2π fRef)`. Singular or numerically unrepresentable results are `null` with a warning; the dB floor is −160.

Errors have the form `{ "error": { "status": 409, "message": "..." } }`. Common statuses are 400 (invalid input), 404 (window/tab/component missing), 409 (stale revision, another edit in progress, ambiguous target window or full window), 422 (unsupported or incomplete circuit), 503 (browser disconnected or no window connected), and 504 (acknowledgement timeout). HTTP JSON bodies are limited to 1 MB. In MCP these failures are tool results with `isError: true`; malformed MCP arguments may instead be reported by the protocol validator.

### Codex

Start Filterstudio as described above. Register the HTTP MCP server with the Codex CLI:

```sh
codex mcp add filterstudio --url http://127.0.0.1:4310/mcp
codex mcp list
```

Alternatively, add this entry to `~/.codex/config.toml` (merge it with existing configuration):

```toml
[mcp_servers.filterstudio]
url = "http://127.0.0.1:4310/mcp"
```

Codex's CLI and IDE extension use this MCP configuration. Restart the relevant session after changing configuration. No bearer-token environment variable or OAuth login is needed. See the [official Codex MCP documentation](https://developers.openai.com/codex/mcp/).

### Claude Code

Register a local HTTP server for your user:

```sh
claude mcp add --transport http --scope user filterstudio http://127.0.0.1:4310/mcp
claude mcp list
```

Start/restart Claude Code and use `/mcp` to inspect the connection. See the [official Claude Code MCP documentation](https://code.claude.com/docs/en/mcp).

### Claude Desktop (stdio)

Claude Desktop can launch the local stdio bridge. Build Filterstudio and keep `npm start` running. Merge the following into `claude_desktop_config.json`, replacing the example paths with your **absolute** paths:

```json
{
  "mcpServers": {
    "filterstudio": {
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/FilterStudio/dist-server/mcp-stdio.js"]
    }
  }
}
```

Configuration locations:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Find Node's executable with `command -v node` on macOS/Linux or `where node` on Windows. In Windows JSON, escape backslashes, for example `"C:\\Program Files\\nodejs\\node.exe"`. Keep any existing servers in the file and fully restart Claude Desktop. If using a different port, add `"env": { "FILTERSTUDIO_URL": "http://127.0.0.1:4311" }` alongside `command` and `args`.

The bridge uses stdout only for MCP messages and forwards all tool calls to the running HTTP server, so Desktop and HTTP clients see the same browser windows. Launch the **Node entry point directly**, rather than `npm run mcp` in a client configuration, to avoid npm's console banners in the protocol stream. The [official local MCP setup guide](https://modelcontextprotocol.io/docs/develop/connect-local-servers) describes Claude Desktop's configuration workflow.

Claude's web/remote connector feature connects from the cloud and cannot reach your computer's `127.0.0.1`. Use the local Desktop stdio integration or Claude Code for this local server; see [Claude's remote connector documentation](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp). Filterstudio requires no key, though your LLM app retains its own account and model-access requirements.

### VS Code and other MCP clients

For VS Code's built-in MCP support, add `.vscode/mcp.json` to the workspace:

```json
{
  "servers": {
    "filterstudio": {
      "type": "http",
      "url": "http://127.0.0.1:4310/mcp"
    }
  }
}
```

Use VS Code's MCP controls to start the server connection. This `servers` format belongs to VS Code, while Claude Desktop uses `mcpServers`. See the [official VS Code MCP documentation](https://code.visualstudio.com/docs/agent-customization/mcp-servers). Other local MCP clients can use either the Streamable HTTP URL or the same stdio `command`/`args`; select **no authentication**.

Example requests to an LLM app:

- “List my open Filterstudio tabs and analyze the current low-pass at 0.5, 1 and 2 MHz.”
- “Create a fifth-order Chebyshev low-pass at 1 MHz, 50 Ω and 0.5 dB ripple, and open it in a new tab.”
- “Read the tab named ‘Comparison’, change L1 to 4.7 µH and show the effect on S21.”
- “Set that tab's display to full precision. Then explicitly round its component values to three significant digits.”
- “Undo the last change in that filter tab.”

If no windows appear, open the editor on the local server and check for **API/MCP connected** in its header. The published GitHub Pages app is a separate static deployment and is not controlled by the local server. If a client reports connection refused, check `npm start`, the port and the absolute stdio paths. Tool discovery alone does not prove the stdio bridge can reach the HTTP server; call `list_filter_windows` to check it.

## Language and appearance

The interface opens in **English by default**. Use the language selector in the header to switch the entire interface between **English and German**. Labels, help text, error messages, and number formatting follow the selection. Custom project and component names are preserved. A previously saved language choice takes precedence over the default.

The sun/moon button switches between **light and dark mode**, including plots, formulas, and the circuit diagram. On the first visit, the theme follows the system preference. The language and any manually selected theme are stored locally in the browser; save the circuit itself using the JSON download.

## Exploring a filter

1. Choose the filter family, response type (low-pass, high-pass, band-pass, or band-stop), prototype order, reference frequency, and input impedance. Band filters also have a bandwidth setting. Chebyshev and Cauer filters add passband ripple and, for Cauer, stopband attenuation.
2. Generate the structure. It appears as an editable circuit on the canvas.
3. Click components to change their values. Drag additional elements from the library onto the canvas or add them through the library.
4. Connect a right-hand terminal to a left-hand terminal. Select connections or components and press `Delete` or `Backspace` to remove them. The two ports are preserved.
5. Inspect the magnitude and phase of the S-parameters. The axis menu can switch to a range of 0 to −3 dB to reveal passband ripple. Calculations use the components actually connected in the circuit.
6. Open the ABCD matrix, S-matrix, and their rational polynomial expressions. Export LaTeX code for lecture notes or worksheets.

To start over, select **Clear circuit** above the canvas. This removes all components and signal connections while keeping both ports, their reference impedances, and the common ground rail. Project settings are preserved. **Undo** restores the previous circuit; **Redo** clears it again. The component library opens automatically: click an element to connect it between the empty ports, or drag elements onto the canvas and connect them manually. Empty workspaces can also be saved and reopened as JSON projects.

The editor models a **cascade of two-port networks with a common ground**. Each block contains a series impedance or shunt admittance; shunt branches are drawn to ground. There must be exactly one continuous path from port 1 to port 2. Open or disconnected elements are reported as an incomplete circuit. Arbitrary branching networks with bridges or feedback loops are outside the scope of this model.

The diagram shows separate signal and ground terminals at each port. The lower port terminals sit directly on the straight, continuous ground rail connecting both ports and all shunt branches. No additional ground symbol is drawn. The rail follows panning and zooming and is included when fitting the circuit to the viewport.

The visible grid, generated layouts, and component placement use the same spacing. Dropped and moved components snap to it, so their signal terminals can align horizontally with both ports. Near an existing signal row, components also align to that exact height, including off-grid port positions in older JSON projects. Imported layouts are preserved until individual elements are moved. Drop placement accounts for the current zoom and pan.

Available elements include R, L, and C in series or shunt, as well as LC series and parallel resonators. The two component values of an LC block describe its internal circuit; the series/shunt setting determines how the entire block connects to the cascade.

The component inspector provides a unit selector next to each value, ordered from smallest to largest: **fF, pF, nF, µF, mF, F** for capacitors; **pH, nH, µH, mH, H** for inductors; and **µΩ, mΩ, Ω, kΩ, MΩ, GΩ** for resistors. LC resonators have separate selectors for inductance and capacitance. Selecting a different unit converts the displayed number without changing the physical value, response, or undo history. Entering a new number applies the selected unit. Decimal points, decimal commas, and scientific notation are accepted; grouping separators are not used. Calculations and JSON files continue to use farads, henries, and ohms. When opening a component's properties, a suitable initial display unit is chosen automatically.

Use **Rounding** above the circuit to control component precision independently in each filter tab. **Display** selects 1–15 significant digits or **No rounding · full precision** for the circuit labels and component list. Four digits remain the default. This only changes presentation: calculations and exports keep the stored component values. Property inputs and component tooltips always show the full available numeric precision; merely focusing an input or changing its unit does not commit a rounded value. Full precision means the browser's floating-point number representation, not exact symbolic arithmetic.

**Round component values → Apply to circuit** explicitly rounds every resistor, inductor, and capacitor in the current tab, including both values in LC resonators and disconnected components. Its digit count is independent of the display setting. For example, 4.918158 µH becomes 4.92 µH at three significant digits, regardless of the displayed unit. Ports and generator parameters are preserved. Responses, matrices, and exports then use the rounded physical values. **Undo** restores the previous values; generating a circuit again uses the full synthesis precision. Each JSON project saves its display setting as the optional `componentPrecision` field (`"full"` or an integer from 1 to 15); existing files remain compatible.

## Filter synthesis

| Family | Prototype orders | Parameters and meaning |
| --- | --- | --- |
| Butterworth | 1–20 | Maximally flat passband; for low-pass/high-pass filters, the reference frequency is the −3.0103 dB cutoff. |
| Chebyshev Type I | 1–20 | Adjustable passband ripple; for low-pass/high-pass filters, the reference frequency is the passband edge. |
| Cauer / elliptic | Odd orders 3–19 | Passband ripple of 0.1–3 dB; stopband attenuation of 20–80 dB for orders 3/5 and 40–80 dB for orders 7–19; finite transmission zeros provided by LC resonators. |

All three families support **low-pass, high-pass, band-pass, and band-stop** responses. Frequency and impedance scaling produce component values in henries and farads. The orders listed above refer to the low-pass prototype: a low-pass or high-pass filter has order `n`, while a band-pass or band-stop filter has order `2n`. The number of two-port blocks drawn is not necessarily equal to the filter order.

The maximum resulting band-filter order is therefore **40** for Butterworth/Chebyshev and **38** for Cauer. The supported Cauer ladder uses odd prototype orders, so **19 is the closest supported order to 20**. Switching families selects the nearest supported order (ties use the lower order). These limits apply consistently to the editor, tolerance-mask design, project files, REST API and MCP tools. Circuits can contain up to 40 two-port blocks; the editor can zoom out to fit large generated circuits.

For band filters, `f0` is the geometric center frequency, and `B` is the difference between the upper and lower band edges. The edges therefore generally do not lie at `f0 ± B/2`:

```tex
f_0=\sqrt{f_\mathrm{lower}f_\mathrm{upper}},\qquad
B=f_\mathrm{upper}-f_\mathrm{lower},\qquad
f_\mathrm{upper}=\frac{\sqrt{B^2+4f_0^2}+B}{2},\qquad
f_\mathrm{lower}=\frac{f_0^2}{f_\mathrm{upper}}.
```

For Butterworth filters, both band edges correspond to the −3.0103 dB points. For Chebyshev and Cauer filters, they are the edges at the selected passband ripple. A band-pass filter passes frequencies between these edges; a band-stop filter has two passbands, below the lower edge and above the upper edge. Cauer stopband attenuation is reached within the actual stopband, not at these passband edges.

The implementation transforms the impedances and admittances of the LC ladder. A single L or C becomes an LC resonator. An existing Cauer resonator is split into two appropriate LC blocks. These blocks can be selected, modified, and connected in the same editor.

With `p = s/(2πf0)` and `b = B/f0`, the normalized prototype variable `q` is replaced by

```tex
q_\mathrm{LP}=p,\qquad
q_\mathrm{HP}=\frac{1}{p},\qquad
q_\mathrm{BP}=\frac{p^2+1}{bp},\qquad
q_\mathrm{BS}=\frac{bp}{p^2+1}.
```

These analog transformations produce geometrically symmetric band edges; see the primary descriptions of the [low-pass to band-pass](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.lp2bp.html) and [low-pass to band-stop](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.lp2bs.html) transformations.

Band filters require `B/f0 ≥ 0.001` (a relative bandwidth of at least 0.1%). Both band edges must lie between 1 Hz and 1 THz, and the bandwidth must not exceed 1 THz.

Cauer filters are synthesized numerically: an elliptic prototype based on Jacobi functions provides the poles and zeros, then positive LC values are determined by matching the complete complex denominator. Orders up to 7 use polynomial coefficients. Higher orders use factored pole evaluations and continuation from a near-all-pole prototype to avoid cancellation in expanded polynomials. The result is verified at additional passband and stopband frequencies. The elliptic calculations follow [S. J. Orfanidis, Introduction to Signal Processing, Chapter 13](https://eceweb1.rutgers.edu/~orfanidi/intro2sp/2e/orfanidis-isp2e-1up.pdf). The prototype definition matches the [SciPy documentation for `ellipap`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.ellipap.html). LC ladder structures and prototype scaling are described in [T. L. Wu's lecture slides, Chapter 3, pages 12–14](https://www.ntuemc.tw/upload/file/201103081523116f390.pdf). The JavaScript implementation does not require Python or SciPy at runtime. A parameter combination may be rejected if a sufficiently accurate passive realization with positive component values cannot be found in the supported topology. In that case, the app displays an error; it does not substitute another filter family. Stopband attenuation describes the elliptic prototype and, together with order and ripple, determines the transition width.

For even-order Chebyshev filters, the normalized termination resistances may differ. The appropriate output reference impedance is therefore generated with the filter. Changing the terminations later changes the response.

## Designing with a tolerance mask

Frequency inputs support **Hz, kHz, MHz, and GHz** for the cutoff/passband edge, both band edges, and the plot's start/end frequencies. Select the unit beside a field; it is shared with the tolerance controls within that filter tab and retained when switching views or tabs. Existing values are converted automatically (for example, `1 MHz = 1000 kHz = 0.001 GHz`), with no rounding of the stored frequency or change to the filter. Inputs accept decimal points, decimal commas, and scientific notation. Project files, API/MCP requests, and calculations continue to use Hz.

The generator can switch between **Parameters** and **Tolerance mask**. In tolerance mode, sliders specify passband edges `fp`, stopband edges `fs`, maximum passband attenuation `Ap`, and minimum stopband attenuation `As`. Frequency sliders are logarithmic; adjacent fields accept exact values in Hz, kHz, MHz, or GHz. The boundary lines and circular handles in the plot can also be dragged or moved with the arrow keys. Frequency boundaries cannot cross one another.

By default, the plot shows positive insertion loss in dB, `A(f) = −20 log10 |S21(f)|`. The **Attenuation** selector switches between **Logarithmic · dB** and the **linear amplitude loss factor `1/|S21|`**: 0 dB corresponds to a factor of 1, and 20 dB to a factor of 10. Hatched regions are forbidden: the passband must satisfy `A ≤ Ap`, and the stopband must satisfy `A ≥ As`. Transition regions are unconstrained. Mask limits, their handles, labels and comparison curves are converted together; dragging a boundary converts back to the dB specification used by the synthesis controls and project files.

The **Frequency axis** selector switches between linear and logarithmic spacing. Independently, the axis can switch to `Ω = f/fref`, where `fref` is the passband edge for low-pass/high-pass filters and the geometric mean of the passband edges for band filters. Normalized frequency supports both spacings. This axis normalization is distinct from the low-pass prototype mapping shown in the **Polynomials** tab.

- Low-pass: `fp < fs`; high-pass: `fs < fp`.
- Band-pass: `fs1 < fp1 < fp2 < fs2`.
- Band-stop: `fp1 < fs1 < fs2 < fp2`.

Order selection follows the analog conditions for [Butterworth](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.buttord.html), [Chebyshev I](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.cheb1ord.html), and [Cauer](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.ellipord.html) filters. For band filters, both passband edges remain fixed, and the stricter transformed stopband edge determines the required prototype order. This finds a suitable realization for the fixed band transformation; it does not further optimize the passband edges to obtain the globally lowest band-stop order. The actual band-filter order is twice the prototype order.

For Butterworth filters, the natural 3 dB frequency or bandwidth is derived from `Ap`, so the specified passband edges actually occur at `Ap`. Supported ranges are 1 Hz to 1 THz, `Ap = 0.1…3 dB`, `As = 20…80 dB`, Butterworth/Chebyshev prototype orders 1–20, and odd Cauer prototype orders 3–19. For Cauer filters, the smallest available suitable order is selected; orders 7 and above use at least 40 dB if necessary. Specifications that cannot be realized are explained and cannot be generated.

The preview is calculated from the synthesized LC circuit. **Compare current circuit** overlays the response of the existing editor network as a dashed line. **Generate circuit** applies the design to the editor and stores the applied tolerance mask in the project. JSON export/import and undo/redo preserve this mask. Changes that have not yet been generated remain a preview and are not saved as the applied design. This feature runs entirely locally in the browser.

## Plot scales

Both the **Frequency response** and **Tolerance mask** views provide independent horizontal and vertical scale controls. Frequency axes support **Linear** and **Logarithmic** spacing, including the phase plot. S-parameter magnitudes support **Logarithmic · dB** (`20 log10 |Sij|`) and **Linear · |S|** (dimensionless magnitude from 0 to 1). Phase remains in degrees because signed angles do not have a meaningful logarithmic scale. The dB view retains its selectable full-range and passband ranges.

Scale choices are shared between the diagrams within each filter tab and retained when switching views or filter tabs. They are display preferences for the open tab, not changes to the circuit or saved JSON project. The defaults remain logarithmic frequency and dB magnitude/attenuation. Frequency samples, tick marks, markers, cursor readings and draggable tolerance boundaries follow the selected spacing. Exact cutoff/center and band-edge samples are retained in the response plot so ideal notches are not missed. CSV and Touchstone exports use the selected frequency spacing and retain complex S-parameters as real/imaginary values; the vertical display scale does not round or convert exported values. Standalone REST/MCP sweeps keep their existing logarithmic default.

## Calculation model

Components are ideal, linear, time-invariant, and lumped. L and C are lossless; R represents resistive losses. Parasitics, frequency-dependent component models, component tolerance analysis, active filters, and transmission-line effects are not added automatically.

The ABCD (chain) matrix uses the convention

```tex
\begin{bmatrix}V_1\\I_1\end{bmatrix}
= M\begin{bmatrix}V_2\\-I_2\end{bmatrix},
\qquad M=M_1M_2\cdots M_N.
```

Both port currents point into the network, and `N` is the number of two-port blocks. For a series impedance and a shunt admittance,

```tex
M_Z=\begin{bmatrix}1&Z\\0&1\end{bmatrix},
\qquad
M_Y=\begin{bmatrix}1&0\\Y&1\end{bmatrix}.
```

In the **ABCD matrices** view, each section identifies its component type, circuit label, and series/shunt placement before showing its matrix. The explanation includes the actual stored R, L and/or C values, the impedance `Z(s)`, the admittance `Y(s) = 1/Z(s)` for shunt branches, and the substitution `s = 2πf0 p` with numeric SI values. It then shows how the resulting expression enters `B = Z(p)` or `C = Y(p)`, alongside the evaluated section matrix. LC resonators explicitly distinguish their internal series/parallel connection from the placement of the whole block in the ladder.

Component values in these derivations retain the full stored numeric precision regardless of the label-rounding setting. The `≈` sign marks matrix coefficients shortened to seven significant digits for display; calculations still use the original component values. Subscripts `Ri`, `Li` and `Ci` refer to the section-matrix index in signal-path order. **Copy LaTeX**, the LaTeX file export, and API/MCP analysis (`latex.sections`) include the same value substitutions and derivations.

Below the S-parameter plot, a second **Frequency response S₂₁** plot shows transmission from port 1 to port 2. It always displays S21 independently of the trace selection above, with its own magnitude/phase and linear/dB controls. Both plots share the frequency range and linear/log frequency axis. The second plot includes cursor readouts and CSV export of S21's real/imaginary parts, magnitude, dB value, and phase. Undefined values and phase discontinuities leave gaps; the phase at S21 = 0 is undefined, and displayed/exported dB values have a −160 dB floor.

S-parameters use power waves referenced to real, positive port impedances. The conversion also accounts for different input and output reference impedances. For the reciprocal RLC two-port blocks used here, `S12 = S21`; for a lossless LC network, the S-matrix is unitary. These relationships follow [Michael Steer's two-port relationships](https://eng.libretexts.org/Bookshelves/Electrical_Engineering/Electronics/Microwave_and_RF_Design_III_-_Networks_(Steer)/02%3A_Chapter_2/2.7%3A_Scattering_Parameter_Two-Port_Relationships).

The polynomials use the dimensionless variable

```tex
p=\frac{s}{2\pi f_0},\qquad p=j\frac{f}{f_0}.
```

The scattering matrix is displayed compactly as `S(p) = (1/D(p)) [[N₁₁(p), N₁₂(p)], [N₂₁(p), N₂₂(p)]]`. The four numerator polynomials and the common denominator are listed separately, so long expressions do not crowd the matrix. Each entry is `Sᵢⱼ(p) = Nᵢⱼ(p)/D(p)`; reciprocity gives `N₁₂(p) = N₂₁(p)`. The LaTeX export uses the same notation and includes all five polynomial definitions. API/MCP analysis returns the compact matrix in `latex.s`, the definitions in `latex.numerators` (keys `s11`, `s12`, `s21`, `s22`) and `latex.denominator`.

`f0` is the reference frequency set in the project. This normalization reduces scale-related numerical problems for very small or large component values. The polynomials are obtained by algebraically multiplying the individual ABCD matrices using floating-point coefficients; they are not fitted to a plotted curve. Displayed LaTeX coefficients are rounded. The overall polynomials are intended for presentation and LaTeX export. Their coefficients can be numerically ill-conditioned, particularly for narrow-band filters and high orders; direct substitution into the expanded form may then lose substantial accuracy. Simply displaying more decimal places does not resolve this conditioning problem. For numerical verification, use the individual two-port blocks and their component values.

Plots, CSV data, and Touchstone data are therefore calculated from the original cascade of individual RLC two-port blocks. Their impedance and admittance polynomials have low orders. Evaluation scales intermediate values and handles ideal resonances using limits. It continues to use the components actually connected in the circuit and their values.

Common factors may remain in the displayed rational expressions. In particular, Cauer band-stop filters can contain cancellable factors such as `(p² + 1)`: an unreduced numerator or denominator polynomial may therefore have a degree greater than the physical filter order `2n`.

At ideal resonances, individual impedances or ABCD entries may become infinite while the S-parameters have a finite limit. These removable singularities are handled using limits during evaluation. Very large networks and extreme value ratios remain subject to floating-point precision limits.

### Approximation reference in the Polynomials tab

In addition to the S-parameter polynomials, the app shows the approximation function of the selected low-pass prototype: `F_n(Ω) = Ω^n` for Butterworth, the expanded Chebyshev polynomial of the first kind `T_n(Ω)`, or the elliptic rational function `R_n(Ω)` for Cauer. The desired ideal power response is approximated by `G_ref(Ω) = 1 / (1 + ε² F_n(Ω)²)`. The display includes the selected order, ripple factor, and frequency mapping for low-pass, high-pass, band-pass, or band-stop filters. It follows [Julius O. Smith's Butterworth description](https://dsprelated.com/freebooks/filters/Recursive_Digital_Filter_Design.html) and [Wolfram's documentation of the elliptic rational function](https://resources.wolframcloud.com/FunctionRepository/resources/EllipticRationalR/).

The approximation reference follows the settings of the generated or loaded project. Changes in the generator are applied only when **Generate circuit** is selected. If component values, connections, or port impedances differ, the approximation is explicitly labeled as a design reference. The `D(p)` and `N_ij(p)` expressions below it continue to describe the actual connected circuit. All reference formulas can be copied as LaTeX and are included in the LaTeX export.

The tab also shows the **characteristic function of the current circuit** as an expanded rational expression: `Ψ(p) = S11(p)/S21(p) = N11(p)/N21(p)`. The common S-parameter denominator `D(p)` cancels. For a lossless LC circuit, the frequency-axis relationships are `|S21(jx)|² = 1/(1 + |Ψ(jx)|²)` and `A(f) = 10 log10(1 + |Ψ(jf/f0)|²)` in dB. This definition follows the [introduction to the characteristic function at Fontys / LibreTexts](https://eng.libretexts.org/Courses/Fontys_University_of_Applied_Sciences/Telecommunications/04%3A_Filters/4.02%3A_Singly_and_Doubly_Terminated_Networks). For the selected prototype, `|Ψref(jx)|² = ε² F_n²(Ω(x))`; `Ψ` also contains phase information, whereas `F_n` is the real approximation function. Component and termination changes update `Ψ` immediately. The lossless power relationship is explicitly not applied when resistors are present. All these formulas are available as LaTeX and included in the export.

## Projects and exports

Use **+ New filter** in the tab bar to design several filters in one window. Each tab keeps its own circuit, generator drafts, undo/redo history, selection, and plot and canvas views. Rename a tab using the project name above its circuit. **Open** loads a JSON project into a new tab, and exports always use the active tab. Language and appearance apply to all tabs.

Use the arrow keys, Home, and End on the tab bar to switch filters; Delete or the tab's × button closes it. Closing a tab with unsaved changes or an unapplied generator draft asks for confirmation. Closing the last tab starts a fresh filter. Tabs are kept for the current browser session only: download each project as JSON to keep it after closing or reloading the page.

Ready-to-use examples for Butterworth, Chebyshev, and Cauer filters, plus a Chebyshev band-pass and a Cauer band-stop filter, are available in [`public/examples/`](public/examples/) and can be loaded using **Open**.

**Export → Save project** downloads the complete project as JSON, including settings, component values, positions, connections, port impedances, and the frequency range. Import the JSON file to reopen the project. Imported files are checked for structural validity and allowed values. The format remains at version `1`. For band filters, `settings.bandwidth` contains the bandwidth in Hz, and `settings.cutoff` contains the center frequency in Hz. Existing low-pass and high-pass files without `bandwidth` remain valid; for those types, `cutoff` continues to represent the cutoff frequency.

Additional exports include LaTeX for matrix expressions, CSV for the frequency sweep, and Touchstone for exchanging S-parameters. Files are generated and downloaded in the browser. Use JSON when sharing a circuit that should remain editable.

## GitHub and deployment

The project is hosted at [github.com/drlechk/filterstudio](https://github.com/drlechk/filterstudio). The published application is available at **[drlechk.github.io/filterstudio/](https://drlechk.github.io/filterstudio/)**.

The workflow in [`.github/workflows/pages.yml`](.github/workflows/pages.yml) uses Node.js 24 and installs locked dependencies with `npm ci`. It runs all tests, TypeScript checks, and the Vite production build:

- **Pull requests targeting `main`:** run tests and build to validate the change.
- **Pushes to `main`:** automatically publish `dist/` to GitHub Pages after successful checks.
- **Manual runs:** start the workflow again under [Actions → Publish Filterstudio to GitHub Pages](https://github.com/drlechk/filterstudio/actions/workflows/pages.yml). Only the `main` branch is published.

GitHub Pages uses **GitHub Actions** as its source under **Settings → Pages → Build and deployment → Source**. The deployment job uses the `github-pages` environment and the workflow's short-lived GitHub permissions; no additional credentials are required as repository secrets.

For GitHub Pages, the pipeline sets the repository path with `npm run build -- --base=/filterstudio/`. This command also reproduces the published build locally. Without this option, `vite.config.ts` continues to use `base: './'`, allowing a regular build to be deployed on other static hosts. The static application requires neither a backend server nor server-side routes. GitHub Pages publishes only `dist/`; it cannot host the optional Node.js API, Swagger or MCP endpoints. Use a regular `npm run build` followed by `npm start` for the local server at `/`.

The process follows the [Vite guide to static deployment](https://vite.dev/guide/static-deploy.html) and [GitHub's instructions for custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Source code

- `src/lib/synthesis.ts`: normalized filter prototypes, frequency transformations, and component synthesis.
- `src/lib/frequency.ts`: band edges, center frequency, and actual filter order.
- `src/lib/tolerance.ts`: tolerance masks, analog order selection, and design parameters.
- `src/lib/network.ts`: complex arithmetic, rational polynomials, ABCD matrices, and S-parameters.
- `src/lib/project.ts`: project format and import validation.
- `src/components/CircuitEditor.tsx`: graphical two-port cascade editor.
- `src/App.tsx`: studio interface, parameters, and exports.
- `src/lib/use-remote-workspace.ts`: optional browser connection and acknowledged remote commands.
- `server/operations.ts` and `server/schemas.ts`: shared REST/MCP operations and validation.
- `server/app.ts`, `server/openapi.ts`, `server/mcp.ts`: HTTP server, Swagger/OpenAPI and MCP transport.
- `server/mcp-stdio.ts`: local stdio bridge for desktop LLM apps.
- `server/api.test.ts`: REST, real MCP clients and browser-connection integration tests.
- `src/lib/*.test.ts`: filter calculation and project tests.

<!-- acknowledgements:start -->
## Credits

Filterstudio is built with the following open-source projects. Thank you to their authors and maintainers. The same overview is available through **Credits** at the bottom of the editor's left sidebar, or directly at `#acknowledgements`.

### Interface and fonts

| Project | Packages used | Purpose | License identifiers |
| --- | --- | --- | --- |
| [React & React DOM](https://react.dev/) · [Source](https://github.com/react/react) | [`react@19.3.1`](https://www.npmjs.com/package/react/v/19.3.1), [`react-dom@19.3.1`](https://www.npmjs.com/package/react-dom/v/19.3.1) | Components, application state and interface rendering. | MIT |
| [React Flow / xyflow](https://reactflow.dev/) · [Source](https://github.com/xyflow/xyflow) | [`@xyflow/react@12.12.0`](https://www.npmjs.com/package/@xyflow/react/v/12.12.0) | Interactive circuit editor with nodes, connections, zooming and panning. | MIT |
| [KaTeX](https://katex.org/) · [Source](https://github.com/KaTeX/KaTeX) | [`katex@0.19.1`](https://www.npmjs.com/package/katex/v/0.19.1) | Typesetting mathematical formulas and matrices. | MIT |
| [Lucide](https://lucide.dev/) · [Source](https://github.com/lucide-icons/lucide) | [`lucide-react@0.468.0`](https://www.npmjs.com/package/lucide-react/v/0.468.0) | SVG icons for controls and navigation. | ISC |
| [DM Sans / Fontsource](https://fontsource.org/fonts/dm-sans) · [Source](https://github.com/fontsource/font-files/tree/main/fonts/variable/dm-sans) | [`@fontsource-variable/dm-sans@5.3.0`](https://www.npmjs.com/package/@fontsource-variable/dm-sans/v/5.3.0) | Locally bundled variable typeface for text and controls. | OFL-1.1 |
| [Manrope / Fontsource](https://fontsource.org/fonts/manrope) · [Source](https://github.com/fontsource/font-files/tree/main/fonts/variable/manrope) | [`@fontsource-variable/manrope@5.3.0`](https://www.npmjs.com/package/@fontsource-variable/manrope/v/5.3.0) | Locally bundled variable typeface for headings and the wordmark. | OFL-1.1 |

### API and MCP server

| Project | Packages used | Purpose | License identifiers |
| --- | --- | --- | --- |
| [Model Context Protocol TypeScript SDK](https://modelcontextprotocol.io/) · [Source](https://github.com/modelcontextprotocol/typescript-sdk) | [`@modelcontextprotocol/sdk@1.32.2`](https://www.npmjs.com/package/@modelcontextprotocol/sdk/v/1.32.2) | MCP tools and HTTP/stdio connections for LLM apps. | MIT |
| [Express](https://expressjs.com/) · [Source](https://github.com/expressjs/express) | [`express@5.3.0`](https://www.npmjs.com/package/express/v/5.3.0) | Local HTTP server and REST endpoints. | MIT |
| [Zod](https://zod.dev/) · [Source](https://github.com/colinhacks/zod) | [`zod@4.6.7`](https://www.npmjs.com/package/zod/v/4.6.7) | API input validation and shared schemas for OpenAPI and MCP. | MIT |
| [Swagger UI](https://swagger.io/open-source/swagger-ui/) · [Source](https://github.com/swagger-api/swagger-ui) | [`swagger-ui-dist@5.34.1`](https://www.npmjs.com/package/swagger-ui-dist/v/5.34.1) | Interactive documentation of the OpenAPI endpoints. | Apache-2.0 |
| [ws](https://github.com/websockets/ws) · [Source](https://github.com/websockets/ws) | [`ws@8.22.1`](https://www.npmjs.com/package/ws/v/8.22.1) | WebSocket connection between the local server and open filter tabs. | MIT |

### Development and testing

| Project | Packages used | Purpose | License identifiers |
| --- | --- | --- | --- |
| [TypeScript](https://www.typescriptlang.org/) · [Source](https://github.com/microsoft/TypeScript) | [`typescript@5.9.3`](https://www.npmjs.com/package/typescript/v/5.9.3) | Type system and static checking of the source code. | Apache-2.0 |
| [Vite & React plugin](https://vite.dev/) · [Source](https://github.com/vitejs/vite) | [`vite@7.3.7`](https://www.npmjs.com/package/vite/v/7.3.7), [`@vitejs/plugin-react@5.2.0`](https://www.npmjs.com/package/@vitejs/plugin-react/v/5.2.0) | Development server, React refresh and production build of the browser app. | MIT |
| [esbuild](https://esbuild.github.io/) · [Source](https://github.com/evanw/esbuild) | [`esbuild@0.28.2`](https://www.npmjs.com/package/esbuild/v/0.28.2) | Bundling the HTTP server and stdio MCP bridge. | MIT |
| [tsx](https://tsx.hirok.io/) · [Source](https://github.com/privatenumber/tsx) | [`tsx@4.23.15`](https://www.npmjs.com/package/tsx/v/4.23.15) | Running TypeScript in the development server and utility scripts. | MIT |
| [Vitest](https://vitest.dev/) · [Source](https://github.com/vitest-dev/vitest) | [`vitest@5.0.5`](https://www.npmjs.com/package/vitest/v/5.0.5) | Tests for filter calculations, projects and integrations. | MIT |
| [Supertest](https://github.com/forwardemail/supertest) · [Source](https://github.com/forwardemail/supertest) | [`supertest@7.3.1`](https://www.npmjs.com/package/supertest/v/7.3.1) | HTTP integration tests for REST endpoints and Swagger delivery. | MIT |
| [DefinitelyTyped](https://definitelytyped.org/) · [Source](https://github.com/DefinitelyTyped/DefinitelyTyped) | [`@types/express@5.0.6`](https://www.npmjs.com/package/@types/express/v/5.0.6), [`@types/katex@0.16.8`](https://www.npmjs.com/package/@types/katex/v/0.16.8), [`@types/node@24.19.2`](https://www.npmjs.com/package/@types/node/v/24.19.2), [`@types/react@19.3.0`](https://www.npmjs.com/package/@types/react/v/19.3.0), [`@types/react-dom@19.3.0`](https://www.npmjs.com/package/@types/react-dom/v/19.3.0), [`@types/supertest@7.2.1`](https://www.npmjs.com/package/@types/supertest/v/7.2.1), [`@types/swagger-ui-dist@3.30.6`](https://www.npmjs.com/package/@types/swagger-ui-dist/v/3.30.6), [`@types/ws@8.18.2`](https://www.npmjs.com/package/@types/ws/v/8.18.2) | TypeScript definitions for the libraries used here and Node.js. | MIT |

### Reference-data generation

These optional Python libraries generate the checked-in numerical test fixtures. They are not required to build or run Filterstudio or to run its tests.

| Project | Version | Purpose | License identifier |
| --- | --- | --- | --- |
| [SciPy](https://scipy.org/) · [Source](https://github.com/scipy/scipy) | 1.17.1 | Independent elliptic reference filters for checked-in test data; not a runtime dependency. | BSD-3-Clause |
| [NumPy](https://numpy.org/) · [Source](https://github.com/numpy/numpy) | 2.4.6 | Frequency arrays and complex numbers during reference-data generation; not a runtime dependency. | BSD-3-Clause |

### Complete dependency inventory

All **293 package/version combinations** recorded in the lockfile, including transitive, development and platform-specific dependencies, are listed with package links and license identifiers in [THIRD_PARTY_PACKAGES.md](THIRD_PARTY_PACKAGES.md). They can also be searched on the Credits page. This inventory includes build/server tools that are not shipped in the browser bundle. License identifiers come from package metadata in `package-lock.json`; the upstream packages contain the full license texts and notices.

The runtime and package manager are [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/). Mathematical references are credited separately in the filter synthesis and network analysis sections above.

After changing dependencies, run `npm run acknowledgements`. It updates this section, the complete inventory and the frontend data from the shared project catalogue and lockfile. The development server and browser build also run this command automatically. `npm run acknowledgements:check` checks that these files are current and every direct dependency is credited.
<!-- acknowledgements:end -->
