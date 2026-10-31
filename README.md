# Filterstudio

An interactive analog filter lab in your browser. Students can generate passive filters, modify their components, and explore the relationship between circuits, ABCD matrices, and S-parameters.

The application is entirely static: React and TypeScript are compiled into HTML, CSS, and JavaScript using Vite. Calculations, file imports, and exports run in the browser. No backend, user account, or API key is required. Fonts and libraries are bundled locally, so the application does not depend on external CDN services at runtime. React Flow provides the circuit canvas, and KaTeX renders the formulas.

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

`npm test` checks known filter responses, reciprocity, energy conservation, project validation, and more. `npm run build` checks TypeScript and writes the production website to `dist/`. `npm run preview` serves that build for local inspection. Open the app over HTTP; double-clicking `dist/index.html` is not supported because the app uses JavaScript modules.

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

## Filter synthesis

| Family | Prototype orders | Parameters and meaning |
| --- | --- | --- |
| Butterworth | 1–9 | Maximally flat passband; for low-pass/high-pass filters, the reference frequency is the −3.0103 dB cutoff. |
| Chebyshev Type I | 1–9 | Adjustable passband ripple; for low-pass/high-pass filters, the reference frequency is the passband edge. |
| Cauer / elliptic | 3, 5, 7 | Passband ripple of 0.1–3 dB; stopband attenuation of 20–80 dB for orders 3/5 and 40–80 dB for order 7; finite transmission zeros provided by LC resonators. |

All three families support **low-pass, high-pass, band-pass, and band-stop** responses. Frequency and impedance scaling produce component values in henries and farads. The orders listed above refer to the low-pass prototype: a low-pass or high-pass filter has order `n`, while a band-pass or band-stop filter has order `2n`. The number of two-port blocks drawn is not necessarily equal to the filter order.

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

Cauer filters are synthesized numerically: an elliptic prototype based on Jacobi functions provides the poles and zeros, then positive LC values are determined by matching all denominator polynomial coefficients. The elliptic calculations follow [S. J. Orfanidis, Introduction to Signal Processing, Chapter 13](https://eceweb1.rutgers.edu/~orfanidi/intro2sp/2e/orfanidis-isp2e-1up.pdf). The prototype definition matches the [SciPy documentation for `ellipap`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.ellipap.html). LC ladder structures and prototype scaling are described in [T. L. Wu's lecture slides, Chapter 3, pages 12–14](https://www.ntuemc.tw/upload/file/201103081523116f390.pdf). The JavaScript implementation does not require Python or SciPy at runtime. A parameter combination may be rejected if a sufficiently accurate passive realization with positive component values cannot be found in the supported topology. In that case, the app displays an error; it does not substitute another filter family. Stopband attenuation describes the elliptic prototype and, together with order and ripple, determines the transition width.

For even-order Chebyshev filters, the normalized termination resistances may differ. The appropriate output reference impedance is therefore generated with the filter. Changing the terminations later changes the response.

## Designing with a tolerance mask

The generator can switch between **Parameters** and **Tolerance mask**. In tolerance mode, sliders specify passband edges `fp`, stopband edges `fs`, maximum passband attenuation `Ap`, and minimum stopband attenuation `As`. Frequency sliders are logarithmic; adjacent fields accept exact values in Hz, kHz, MHz, or GHz. The boundary lines and circular handles in the plot can also be dragged or moved with the arrow keys. Frequency boundaries cannot cross one another.

The plot shows positive insertion loss, `A(f) = −20 log10 |S21(f)|`. Hatched regions are forbidden: the passband must satisfy `A ≤ Ap`, and the stopband must satisfy `A ≥ As`. Transition regions are unconstrained. The frequency axis can switch to `Ω = f/fref`, where `fref` is the passband edge for low-pass/high-pass filters and the geometric mean of the passband edges for band filters. This axis normalization is distinct from the low-pass prototype mapping shown in the **Polynomials** tab.

- Low-pass: `fp < fs`; high-pass: `fs < fp`.
- Band-pass: `fs1 < fp1 < fp2 < fs2`.
- Band-stop: `fp1 < fs1 < fs2 < fp2`.

Order selection follows the analog conditions for [Butterworth](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.buttord.html), [Chebyshev I](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.cheb1ord.html), and [Cauer](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.ellipord.html) filters. For band filters, both passband edges remain fixed, and the stricter transformed stopband edge determines the required prototype order. This finds a suitable realization for the fixed band transformation; it does not further optimize the passband edges to obtain the globally lowest band-stop order. The actual band-filter order is twice the prototype order.

For Butterworth filters, the natural 3 dB frequency or bandwidth is derived from `Ap`, so the specified passband edges actually occur at `Ap`. Supported ranges are 1 Hz to 1 THz, `Ap = 0.1…3 dB`, `As = 20…80 dB`, Butterworth/Chebyshev prototype orders 1–9, and Cauer prototype orders 3, 5, and 7. For Cauer filters, the smallest available suitable order is selected; order 7 uses at least 40 dB if necessary. Specifications that cannot be realized are explained and cannot be generated.

The preview is calculated from the synthesized LC circuit. **Compare current circuit** overlays the response of the existing editor network as a dashed line. **Generate circuit** applies the design to the editor and stores the applied tolerance mask in the project. JSON export/import and undo/redo preserve this mask. Changes that have not yet been generated remain a preview and are not saved as the applied design. This feature runs entirely locally in the browser.

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

S-parameters use power waves referenced to real, positive port impedances. The conversion also accounts for different input and output reference impedances. For the reciprocal RLC two-port blocks used here, `S12 = S21`; for a lossless LC network, the S-matrix is unitary. These relationships follow [Michael Steer's two-port relationships](https://eng.libretexts.org/Bookshelves/Electrical_Engineering/Electronics/Microwave_and_RF_Design_III_-_Networks_(Steer)/02%3A_Chapter_2/2.7%3A_Scattering_Parameter_Two-Port_Relationships).

The polynomials use the dimensionless variable

```tex
p=\frac{s}{2\pi f_0},\qquad p=j\frac{f}{f_0}.
```

`f0` is the reference frequency set in the project. This normalization reduces scale-related numerical problems for very small or large component values. The polynomials are obtained by algebraically multiplying the individual ABCD matrices using floating-point coefficients; they are not fitted to a plotted curve. Displayed LaTeX coefficients are rounded. The overall polynomials are intended for presentation and LaTeX export. Their coefficients can be numerically ill-conditioned, particularly for narrow-band filters and high orders; direct substitution into the expanded form may then lose substantial accuracy. Simply displaying more decimal places does not resolve this conditioning problem. For numerical verification, use the individual two-port blocks and their component values.

Plots, CSV data, and Touchstone data are therefore calculated from the original cascade of individual RLC two-port blocks. Their impedance and admittance polynomials have low orders. Evaluation scales intermediate values and handles ideal resonances using limits. It continues to use the components actually connected in the circuit and their values.

Common factors may remain in the displayed rational expressions. In particular, Cauer band-stop filters can contain cancellable factors such as `(p² + 1)`: an unreduced numerator or denominator polynomial may therefore have a degree greater than the physical filter order `2n`.

At ideal resonances, individual impedances or ABCD entries may become infinite while the S-parameters have a finite limit. These removable singularities are handled using limits during evaluation. Very large networks and extreme value ratios remain subject to floating-point precision limits.

### Approximation reference in the Polynomials tab

In addition to the S-parameter polynomials, the app shows the approximation function of the selected low-pass prototype: `F_n(Ω) = Ω^n` for Butterworth, the expanded Chebyshev polynomial of the first kind `T_n(Ω)`, or the elliptic rational function `R_n(Ω)` for Cauer. The desired ideal power response is approximated by `G_ref(Ω) = 1 / (1 + ε² F_n(Ω)²)`. The display includes the selected order, ripple factor, and frequency mapping for low-pass, high-pass, band-pass, or band-stop filters. It follows [Julius O. Smith's Butterworth description](https://dsprelated.com/freebooks/filters/Recursive_Digital_Filter_Design.html) and [Wolfram's documentation of the elliptic rational function](https://resources.wolframcloud.com/FunctionRepository/resources/EllipticRationalR/).

The approximation reference follows the settings of the generated or loaded project. Changes in the generator are applied only when **Generate circuit** is selected. If component values, connections, or port impedances differ, the approximation is explicitly labeled as a design reference. The `D(p)` and `N_ij(p)` expressions below it continue to describe the actual connected circuit. All reference formulas can be copied as LaTeX and are included in the LaTeX export.

The tab also shows the **characteristic function of the current circuit** as an expanded rational expression: `Ψ(p) = S11(p)/S21(p) = N11(p)/N21(p)`. The common S-parameter denominator `D(p)` cancels. For a lossless LC circuit, the frequency-axis relationships are `|S21(jx)|² = 1/(1 + |Ψ(jx)|²)` and `A(f) = 10 log10(1 + |Ψ(jf/f0)|²)` in dB. This definition follows the [introduction to the characteristic function at Fontys / LibreTexts](https://eng.libretexts.org/Courses/Fontys_University_of_Applied_Sciences/Telecommunications/04%3A_Filters/4.02%3A_Singly_and_Doubly_Terminated_Networks). For the selected prototype, `|Ψref(jx)|² = ε² F_n²(Ω(x))`; `Ψ` also contains phase information, whereas `F_n` is the real approximation function. Component and termination changes update `Ψ` immediately. The lossless power relationship is explicitly not applied when resistors are present. All these formulas are available as LaTeX and included in the export.

## Projects and exports

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

For GitHub Pages, the pipeline sets the repository path with `npm run build -- --base=/filterstudio/`. This command also reproduces the published build locally. Without this option, `vite.config.ts` continues to use `base: './'`, allowing a regular build to be deployed on other static hosts. The application requires neither a backend server nor server-side routes.

The process follows the [Vite guide to static deployment](https://vite.dev/guide/static-deploy.html) and [GitHub's instructions for custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Source code

- `src/lib/synthesis.ts`: normalized filter prototypes, frequency transformations, and component synthesis.
- `src/lib/frequency.ts`: band edges, center frequency, and actual filter order.
- `src/lib/tolerance.ts`: tolerance masks, analog order selection, and design parameters.
- `src/lib/network.ts`: complex arithmetic, rational polynomials, ABCD matrices, and S-parameters.
- `src/lib/project.ts`: project format and import validation.
- `src/components/CircuitEditor.tsx`: graphical two-port cascade editor.
- `src/App.tsx`: studio interface, parameters, and exports.
- `src/lib/*.test.ts`: filter calculation and project tests.
