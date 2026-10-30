# Filterstudio

Ein interaktives Labor für analoge Filter im Browser. Studierende können passive Filter erzeugen, ihre Bauelemente verändern und den Zusammenhang zwischen Schaltung, Kettenmatrix und S-Parametern untersuchen.

Die Anwendung ist vollständig statisch: React und TypeScript werden mit Vite in HTML, CSS und JavaScript übersetzt. Berechnung, Dateieinlesen und Exporte laufen im Browser. Ein Backend, Benutzerkonto oder API-Schlüssel ist nicht erforderlich. Auch Schriften und Bibliotheken werden lokal mitgeliefert; im Betrieb werden keine externen CDN-Dienste benötigt. React Flow übernimmt die Schaltungsfläche, KaTeX die Formeldarstellung.

## Lokal starten

Voraussetzung: Node.js 22.12+, 24 oder 26+ und npm (empfohlen: Node.js 24 LTS).

```sh
npm install
npm run dev
```

Die im Terminal ausgegebene lokale URL im Browser öffnen. Bei bereits vorhandenem `package-lock.json` installiert `npm ci` die festgelegten Abhängigkeiten reproduzierbar.

```sh
npm test
npm run build
npm run preview
```

`npm test` prüft unter anderem bekannte Filterantworten, Reziprozität, Energieerhaltung und die Projektvalidierung. `npm run build` prüft TypeScript und schreibt die fertige Website nach `dist/`. `npm run preview` dient zur lokalen Kontrolle dieses Builds. Die App über HTTP öffnen; ein Doppelklick auf `dist/index.html` ist wegen JavaScript-Modulen kein unterstützter Startweg.

## Sprache und Darstellung

In der Kopfzeile lässt sich die gesamte Oberfläche zwischen **Deutsch und Englisch** umschalten. Beschriftungen, Hilfetexte, Fehlermeldungen und Zahlenformate folgen der Auswahl. Eigene Projekt- und Bauteilnamen bleiben erhalten.

Der Schalter mit Sonne beziehungsweise Mond wechselt zwischen **hellem und dunklem Design**, einschließlich Diagrammen, Formeln und Schaltplan. Beim ersten Besuch folgt das Design der Systemeinstellung. Sprache und manuell gewähltes Design werden lokal im Browser gespeichert; die Schaltung wird weiterhin über den JSON-Download gesichert.

## Ein Filter untersuchen

1. Filterfamilie, Tiefpass, Hochpass, Bandpass oder Bandsperre, Prototypgrad, Bezugsfrequenz und Eingangsimpedanz wählen. Bandfilter haben zusätzlich eine Bandbreite. Bei Chebyshev und Cauer kommen Welligkeit beziehungsweise Sperrdämpfung hinzu.
2. Die Struktur erzeugen. Sie erscheint als bearbeitbare Schaltung auf der Zeichenfläche.
3. Bauelemente anklicken und ihre Werte ändern. Weitere Elemente aus der Bibliothek in die Fläche ziehen oder über die Bibliothek hinzufügen.
4. Einen rechten Anschlusspunkt mit einem linken Anschlusspunkt verbinden. Verbindungen oder Bauelemente markieren und mit `Entf` beziehungsweise `Backspace` löschen. Die beiden Tore bleiben erhalten.
5. Den Betrag und die Phase der S-Parameter betrachten. Das Achsenmenü kann auf 0 bis −3 dB umschalten, um die Durchlasswelligkeit sichtbar zu machen. Die Berechnung verwendet die tatsächlich verbundenen Bauelemente.
6. Kettenmatrix, S-Matrix und ihre rationalen Polynome öffnen. LaTeX-Code kann für Skripte oder Aufgabenblätter exportiert werden.

Der Editor bildet eine **Kaskade von Zweitoren mit gemeinsamer Masse** ab. Jeder Block enthält eine Serienimpedanz oder Queradmittanz; Querzweige sind im Schaltbild nach Masse gezeichnet. Es muss genau ein durchgehender Pfad von Tor 1 zu Tor 2 bestehen. Offene oder nicht angeschlossene Elemente werden als unvollständige Schaltung gemeldet. Eine frei verzweigte Mehrknotenschaltung mit Brücken oder Rückkopplungen ist nicht Teil dieses Modells.

Die Zeichnung zeigt an jedem Tor getrennte Signal- und Masseklemmen. Die unteren Torklemmen liegen direkt auf der geraden, durchgehenden Masseleitung, die beide Tore und alle Querzweige verbindet. Ein zusätzliches Massesymbol wird nicht gezeichnet. Die Leitung folgt dem Verschieben und Zoomen und wird beim Einpassen vollständig berücksichtigt.

Verfügbar sind R, L und C in Serie oder als Querzweig sowie LC-Serien- und Parallelresonatoren. Die beiden Bauteilwerte eines LC-Blocks beschreiben dessen innere Schaltung; die Einstellung Serie/Querzweig bestimmt die Einbindung des gesamten Blocks in die Kaskade.

## Filtersynthese

| Familie | Prototypgrade | Parameter und Bedeutung |
| --- | --- | --- |
| Butterworth | 1–9 | Maximal flacher Durchlassbereich; bei Tief-/Hochpass ist die Bezugsfrequenz die −3,0103-dB-Grenze. |
| Chebyshev Typ I | 1–9 | Einstellbare Durchlasswelligkeit; bei Tief-/Hochpass ist die Bezugsfrequenz die Durchlassbandgrenze. |
| Cauer / elliptisch | 3, 5, 7 | Durchlasswelligkeit 0,1–3 dB; Sperrdämpfung 20–80 dB bei Grad 3/5 und 40–80 dB bei Grad 7; endliche Übertragungsnullstellen durch LC-Resonatoren. |

Alle drei Familien lassen sich als **Tiefpass, Hochpass, Bandpass oder Bandsperre** erzeugen. Die Frequenz- und Impedanzskalierung liefert Bauteilwerte in Henry und Farad. Die oben angegebenen Grade beziehen sich auf den Tiefpassprototyp: Ein Tief- oder Hochpass hat die Ordnung `n`, ein Bandpass oder eine Bandsperre die Ordnung `2n`. Die Anzahl der gezeichneten Zweitorblöcke ist nicht grundsätzlich gleich der Filterordnung.

Bei Bandfiltern bezeichnet `f0` die geometrische Mittenfrequenz; `B` ist die Differenz zwischen oberer und unterer Bandgrenze. Die Grenzen liegen deshalb im Allgemeinen nicht bei `f0 ± B/2`:

```tex
f_0=\sqrt{f_\mathrm{u}f_\mathrm{o}},\qquad
B=f_\mathrm{o}-f_\mathrm{u},\qquad
f_\mathrm{o}=\frac{\sqrt{B^2+4f_0^2}+B}{2},\qquad
f_\mathrm{u}=\frac{f_0^2}{f_\mathrm{o}}.
```

Für Butterworth entsprechen beide Bandgrenzen den −3,0103-dB-Punkten. Bei Chebyshev und Cauer sind es die Grenzen bei der gewählten Durchlasswelligkeit. Beim Bandpass liegt der Durchlassbereich zwischen den Grenzen; bei der Bandsperre liegen die beiden Durchlassbereiche unterhalb der unteren und oberhalb der oberen Grenze. Die Cauer-Sperrdämpfung wird im eigentlichen Sperrbereich erreicht, nicht bereits an diesen Durchlassgrenzen.

Die Umsetzung transformiert die Impedanzen und Admittanzen der LC-Leiter. Aus einem einzelnen L oder C wird ein LC-Resonator. Ein bereits vorhandener Cauer-Resonator wird in zwei passende LC-Blöcke aufgelöst. Diese Blöcke lassen sich im selben Editor auswählen, ändern und verbinden.

Mit `p = s/(2πf0)` und `b = B/f0` wird die normierte Prototypvariable `q` ersetzt durch

```tex
q_\mathrm{TP}=p,\qquad
q_\mathrm{HP}=\frac{1}{p},\qquad
q_\mathrm{BP}=\frac{p^2+1}{bp},\qquad
q_\mathrm{BS}=\frac{bp}{p^2+1}.
```

Diese analogen Transformationen erzeugen geometrisch symmetrische Bandgrenzen; siehe die primären Beschreibungen zu [Tiefpass → Bandpass](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.lp2bp.html) und [Tiefpass → Bandsperre](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.lp2bs.html).

Für Bandfilter gilt `B/f0 ≥ 0,001` (mindestens 0,1 % relative Bandbreite). Beide Bandgrenzen müssen zwischen 1 Hz und 1 THz liegen; die Bandbreite ist höchstens 1 THz.

Cauer-Filter werden numerisch synthetisiert: Ein elliptischer Prototyp aus Jacobi-Funktionen liefert Pole und Nullstellen; anschließend werden positive LC-Werte durch Abgleich der vollständigen Nennerpolynom-Koeffizienten bestimmt. Die elliptische Rechnung folgt [S. J. Orfanidis, Introduction to Signal Processing, Kapitel 13](https://eceweb1.rutgers.edu/~orfanidi/intro2sp/2e/orfanidis-isp2e-1up.pdf). Die Prototypdefinition entspricht der [SciPy-Dokumentation zu `ellipap`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.ellipap.html). Die LC-Leiterstrukturen und Prototypskalierung sind in den [Vorlesungsfolien von T. L. Wu, Kapitel 3, Seiten 12–14](https://www.ntuemc.tw/upload/file/201103081523116f390.pdf) erläutert. Die JavaScript-Implementierung benötigt zur Laufzeit kein Python oder SciPy. Eine Kombination kann zurückgewiesen werden, wenn sich keine ausreichend genaue passive Realisierung mit positiven Bauteilwerten in der unterstützten Topologie bestimmen lässt. In diesem Fall zeigt die Anwendung eine Fehlermeldung; sie ersetzt den Filter nicht durch eine andere Familie. Die Sperrdämpfung beschreibt den elliptischen Prototyp und legt zusammen mit Grad und Welligkeit die Übergangsbreite fest.

Bei geraden Chebyshev-Graden können die normierten Abschlusswiderstände verschieden sein. Deshalb wird die passende Ausgangsbezugsimpedanz mit dem Filter erzeugt. Eine spätere Änderung der Abschlüsse verändert die Antwort.

## Entwurf mit Toleranzschema

Im Generator lässt sich zwischen **Parameter** und **Toleranzschema** wechseln. Im Toleranzmodus werden Durchlassgrenzen `fp`, Sperrgrenzen `fs`, maximale Durchlassdämpfung `Ap` und minimale Sperrdämpfung `As` durch Schieberegler vorgegeben. Frequenzschieber sind logarithmisch; daneben lassen sich exakte Zahlen in Hz, kHz, MHz oder GHz eingeben. Die Grenzlinien und Kreise im Diagramm sind ebenfalls verschiebbar und per Pfeiltasten bedienbar. Frequenzgrenzen können einander nicht überholen.

Das Diagramm zeigt die positive Einfügedämpfung `A(f) = −20 log10 |S21(f)|`. Schraffierte Bereiche sind unzulässig: Im Durchlassbereich muss `A ≤ Ap`, im Sperrbereich `A ≥ As` gelten. Übergangsbereiche bleiben frei. Die Frequenzachse kann auf `Ω = f/fref` umgeschaltet werden; `fref` ist die Durchlassgrenze bei Tief-/Hochpass und das geometrische Mittel der Durchlassgrenzen bei Bandfiltern. Diese Achsennormierung ist von der Tiefpass-Prototypabbildung im Reiter **Polynome** zu unterscheiden.

- Tiefpass: `fp < fs`; Hochpass: `fs < fp`.
- Bandpass: `fs1 < fp1 < fp2 < fs2`.
- Bandsperre: `fp1 < fs1 < fs2 < fp2`.

Die Ordnungswahl folgt den analogen Bedingungen von [Butterworth](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.buttord.html), [Chebyshev I](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.cheb1ord.html) und [Cauer](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.ellipord.html). Bei Bandfiltern bleiben beide Durchlassgrenzen fest; die strengere transformierte Sperrgrenze bestimmt den nötigen Prototypgrad. Damit wird eine passende Realisierung für diese festgelegte Bandtransformation bestimmt; eine zusätzliche Optimierung der Durchlassgrenzen für den global kleinsten Bandsperrgrad erfolgt nicht. Der tatsächliche Bandfiltergrad ist doppelt so groß wie der Prototypgrad.

Bei Butterworth wird die natürliche 3-dB-Frequenz beziehungsweise 3-dB-Bandbreite aus `Ap` abgeleitet, sodass die vorgegebenen Durchlassgrenzen tatsächlich bei `Ap` liegen. Unterstützt sind Frequenzen von 1 Hz bis 1 THz, `Ap = 0,1…3 dB`, `As = 20…80 dB`, Butterworth-/Chebyshev-Prototypgrade 1–9 und Cauer-Prototypgrade 3, 5, 7. Für Cauer wird der kleinste verfügbare passende Grad gewählt; Grad 7 verwendet nötigenfalls mindestens 40 dB. Nicht realisierbare Vorgaben werden erklärt und können nicht generiert werden.

Die Vorschau wird aus der synthetisierten LC-Schaltung berechnet. **Aktuelle Schaltung vergleichen** blendet zusätzlich den Verlauf des vorhandenen Editor-Netzwerks gestrichelt ein. **Schaltung generieren** übernimmt den Entwurf in den Editor und speichert das angewendete Toleranzschema im Projekt. JSON-Export und -Import sowie Rückgängig/Wiederholen erhalten dieses Schema. Noch nicht generierte Änderungen bleiben eine Vorschau und werden nicht als angewendeter Entwurf gespeichert. Die Funktion arbeitet vollständig lokal im Browser.

## Berechnungsmodell

Es gelten ideale, lineare und zeitinvariante konzentrierte Bauelemente. L und C sind verlustlos; R beschreibt ohmsche Verluste. Parasitäre Elemente, frequenzabhängige Bauteilmodelle, Toleranzanalysen, aktive Filter und Leitungseffekte werden nicht automatisch ergänzt.

Die Kettenmatrix verwendet die Konvention

```tex
\begin{bmatrix}V_1\\I_1\end{bmatrix}
= M\begin{bmatrix}V_2\\-I_2\end{bmatrix},
\qquad M=M_1M_2\cdots M_N.
```

Dabei zeigen beide Torströme in das Netzwerk; `N` ist die Anzahl der Zweitorblöcke. Für eine Serienimpedanz und eine Queradmittanz gelten

```tex
M_Z=\begin{bmatrix}1&Z\\0&1\end{bmatrix},
\qquad
M_Y=\begin{bmatrix}1&0\\Y&1\end{bmatrix}.
```

Die S-Parameter sind Leistungswellen bezüglich reeller, positiver Torimpedanzen. Die Umrechnung berücksichtigt auch unterschiedliche Eingangs- und Ausgangsreferenzen. Für die hier verwendeten reziproken RLC-Zweitorbausteine gilt `S12 = S21`; bei einem verlustlosen LC-Netzwerk ist die S-Matrix unitär. Grundlage sind die [Zweitor-Beziehungen bei Michael Steer](https://eng.libretexts.org/Bookshelves/Electrical_Engineering/Electronics/Microwave_and_RF_Design_III_-_Networks_(Steer)/02%3A_Chapter_2/2.7%3A_Scattering_Parameter_Two-Port_Relationships).

Die Polynome verwenden die dimensionslose Variable

```tex
p=\frac{s}{2\pi f_0},\qquad p=j\frac{f}{f_0}.
```

`f0` ist die im Projekt eingestellte Bezugsfrequenz. Diese Normierung reduziert Größenordnungsprobleme bei sehr kleinen oder großen Bauteilwerten. Die Polynome entstehen durch algebraische Multiplikation der einzelnen Kettenmatrizen mit Gleitkommakoeffizienten; es handelt sich nicht um eine Anpassung an eine gezeichnete Kurve. Angezeigte LaTeX-Koeffizienten sind gerundet. Die Gesamtpolynome dienen der Darstellung und dem LaTeX-Export. Besonders bei schmalen Bandfiltern und hohen Graden können ihre Koeffizienten numerisch schlecht konditioniert sein; direktes Einsetzen in die ausgeschriebene Form kann dann erheblich an Genauigkeit verlieren. Mehr ausgegebene Dezimalstellen allein beseitigen diese schlechte Konditionierung nicht. Für eine numerische Nachrechnung sind deshalb die einzelnen Zweitorblöcke und ihre Bauteilwerte maßgeblich.

Diagramme, CSV- und Touchstone-Daten werden deshalb aus der ursprünglichen Kaskade der einzelnen RLC-Zweitorblöcke berechnet. Deren Impedanz- und Admittanzpolynome haben einen niedrigen Grad. Die Auswertung skaliert die Zwischenwerte und behandelt ideale Resonanzen über Grenzwerte. Sie verwendet weiterhin die tatsächlich verbundenen Bauelemente und deren Werte.

Gemeinsame Faktoren können in den angezeigten rationalen Ausdrücken verbleiben. Insbesondere bei Cauer-Bandsperren können kürzbare Faktoren wie `(p² + 1)` auftreten: Der Grad eines ungekürzten Zähler- oder Nennerpolynoms kann deshalb größer als die physikalische Filterordnung `2n` sein.

An idealen Resonanzen können einzelne Impedanzen oder ABCD-Einträge unendlich werden, während die S-Parameter einen endlichen Grenzwert besitzen. Solche hebbaren Singularitäten werden bei der Auswertung über Grenzwerte behandelt. Sehr große Netze und extreme Wertverhältnisse bleiben durch die Gleitkommagenauigkeit begrenzt.

### Approximationsgrundlage im Reiter „Polynome“

Zusätzlich zu den S-Polynomen zeigt die App die Approximationsfunktion des gewählten Tiefpassprototyps: `F_n(Ω) = Ω^n` für Butterworth, das ausgeschriebene Chebyshev-Polynom erster Art `T_n(Ω)` oder die elliptische rationale Funktion `R_n(Ω)` für Cauer. Der gewünschte ideale Leistungsfrequenzgang wird durch `G_ref(Ω) = 1 / (1 + ε² F_n(Ω)²)` angenähert. Die Anzeige enthält den gewählten Grad, den Welligkeitsfaktor und die Frequenzabbildung für Tiefpass, Hochpass, Bandpass oder Bandsperre. Grundlage sind die [Butterworth-Darstellung von Julius O. Smith](https://dsprelated.com/freebooks/filters/Recursive_Digital_Filter_Design.html) und die [Dokumentation der elliptischen rationalen Funktion bei Wolfram](https://resources.wolframcloud.com/FunctionRepository/resources/EllipticRationalR/).

Die Approximationsgrundlage folgt den Einstellungen des erzeugten beziehungsweise geladenen Projekts. Änderungen im Generator werden erst durch **Schaltung generieren** übernommen. Bei abweichenden Bauteilwerten, Verbindungen oder Torimpedanzen wird die Approximation ausdrücklich als Entwurfsreferenz gekennzeichnet. Die darunter angezeigten `D(p)` und `N_ij(p)` beschreiben weiterhin die tatsächlich verbundene Schaltung. Alle Referenzformeln lassen sich als LaTeX kopieren und sind im LaTeX-Export enthalten.

Der Reiter zeigt außerdem die **charakteristische Funktion der aktuellen Schaltung** als ausgeschriebenen rationalen Ausdruck: `Ψ(p) = S11(p)/S21(p) = N11(p)/N21(p)`. Der gemeinsame S-Nenner `D(p)` kürzt sich. Für eine verlustlose LC-Schaltung gilt auf der Frequenzachse `|S21(jx)|² = 1/(1 + |Ψ(jx)|²)` und `A(f) = 10 log10(1 + |Ψ(jf/f0)|²)` in dB. Diese Definition folgt der [Einführung der charakteristischen Funktion bei Fontys / LibreTexts](https://eng.libretexts.org/Courses/Fontys_University_of_Applied_Sciences/Telecommunications/04%3A_Filters/4.02%3A_Singly_and_Doubly_Terminated_Networks). Für den gewählten Prototyp ist `|Ψref(jx)|² = ε² F_n²(Ω(x))`; `Ψ` enthält dabei auch die Phase, während `F_n` die reelle Approximationsfunktion ist. Bauteil- und Abschlussänderungen aktualisieren `Ψ` unmittelbar. Bei Widerständen wird die verlustlose Leistungsbeziehung ausdrücklich nicht angewendet. Alle neuen Formeln sind als LaTeX verfügbar und werden mitexportiert.

## Projekte und Exporte

Fertige Beispieldateien für Butterworth, Chebyshev und Cauer sowie ein Chebyshev-Bandpass und eine Cauer-Bandsperre liegen unter [`public/examples/`](public/examples/) und können über **Öffnen** geladen werden.

**JSON herunterladen** speichert das vollständige Projekt einschließlich Einstellungen, Bauteilwerten, Positionen, Verbindungen, Torimpedanzen und Frequenzbereich. Über den JSON-Import lässt sich dieses Projekt wieder öffnen. Importierte Dateien werden strukturell und auf zulässige Werte geprüft. Das Format besitzt weiterhin die Versionsnummer `1`. Bei Bandfiltern enthält `settings.bandwidth` die Bandbreite in Hz und `settings.cutoff` die Mittenfrequenz in Hz. Bestehende Tief- und Hochpassdateien ohne `bandwidth` bleiben gültig; bei diesen Typen ist `cutoff` weiterhin die Grenzfrequenz.

Zusätzlich stehen LaTeX für die Matrixdarstellung, CSV für den Frequenzsweep und Touchstone für den Austausch der S-Parameter zur Verfügung. Die Dateien werden im Browser erzeugt und heruntergeladen. Eine JSON-Datei ist das maßgebliche Format, wenn eine bearbeitbare Schaltung weitergegeben werden soll.

## GitHub und Veröffentlichung

Das Projekt liegt unter [github.com/drlechk/filterstudio](https://github.com/drlechk/filterstudio). Die veröffentlichte Anwendung ist unter **[drlechk.github.io/filterstudio/](https://drlechk.github.io/filterstudio/)** erreichbar.

Der Workflow unter [`.github/workflows/pages.yml`](.github/workflows/pages.yml) verwendet Node.js 24 und installiert die festgeschriebenen Abhängigkeiten mit `npm ci`. Er führt alle Tests, die TypeScript-Prüfung und den Vite-Produktionsbuild aus:

- **Pull Requests auf `main`:** Tests und Build zur Prüfung der Änderung.
- **Push auf `main`:** Nach erfolgreichen Prüfungen wird `dist/` automatisch auf GitHub Pages veröffentlicht.
- **Manueller Start:** Unter [Actions → Publish Filterstudio to GitHub Pages](https://github.com/drlechk/filterstudio/actions/workflows/pages.yml) lässt sich der Workflow erneut ausführen. Veröffentlicht wird ausschließlich der Branch `main`.

GitHub Pages verwendet unter **Settings → Pages → Build and deployment → Source** die Quelle **GitHub Actions**. Der Deployment-Job nutzt die Umgebung `github-pages` und die kurzlebigen GitHub-Berechtigungen des Workflows; zusätzliche Zugangsdaten als Repository-Secrets sind nicht erforderlich.

Für GitHub Pages setzt die Pipeline mit `npm run build -- --base=/filterstudio/` den Repository-Pfad. Dieser Befehl reproduziert den veröffentlichten Build auch lokal. Ohne diese Option verwendet `vite.config.ts` weiterhin `base: './'`, sodass ein normaler Build auch auf anderen statischen Hosts eingesetzt werden kann. Die Anwendung benötigt weder einen Server noch serverseitige Routen.

Der Ablauf folgt der [Vite-Anleitung für statische Builds](https://vite.dev/guide/static-deploy.html) und den [GitHub-Anweisungen für eigene Pages-Workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Quellcode

- `src/lib/synthesis.ts`: normierte Filterprototypen, Frequenztransformationen und Bauteilsynthese.
- `src/lib/frequency.ts`: Bandgrenzen, Mittenfrequenz und tatsächliche Filterordnung.
- `src/lib/tolerance.ts`: Toleranzschema, analoge Ordnungswahl und Entwurfsparameter.
- `src/lib/network.ts`: komplexe Rechnung, rationale Polynome, ABCD- und S-Parameter.
- `src/lib/project.ts`: Projektformat und Importvalidierung.
- `src/components/CircuitEditor.tsx`: grafischer Zweitor-Kaskadeneditor.
- `src/App.tsx`: Studiooberfläche, Parameter und Exporte.
- `src/lib/*.test.ts`: fachliche und projektbezogene Tests.
