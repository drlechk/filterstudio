import type { Language } from "./preference-storage";

/** Engine messages stay canonical German so open diagnostics can change language. */
const english: Record<string, string> = {
  "Die Schaltung braucht einen Eingang und einen Ausgang.":
    "The circuit needs an input and an output.",
  "Eine Verbindung endet an einem fehlenden Bauelement.":
    "A connection ends at a missing component.",
  "Jeder Anschluss darf genau eine Verbindung haben. Parallelzweige werden als Shunt-Bauelement angelegt.":
    "Each terminal can have one connection. Use shunt components for parallel branches.",
  "Verbindungen müssen vom Eingang zum Ausgang verlaufen.":
    "Connections must run from the input to the output.",
  "Die Schaltung enthält einen geschlossenen Verbindungskreis.":
    "The circuit contains a connection loop.",
  "Schaltung noch offen. Verbinde die Anschlüsse vom Eingang bis zum Ausgang.":
    "The circuit is still open. Connect the terminals from the input to the output.",
  "Es gibt unverbundene Bauelemente. Verbinde oder entferne sie für die Auswertung.":
    "Some components are disconnected. Connect or remove them to analyze the circuit.",
  "Keine gültige Filterstudio-Datei (Version 1).":
    "This is not a valid Filterstudio file (version 1).",
  "Ungültige Filterparameter in der Datei.":
    "The file contains invalid filter parameters.",
  "Ungültiges Toleranzschema in der Datei.":
    "The file contains an invalid tolerance mask.",
  "Ungültige Anzeigegenauigkeit für Bauteilwerte.":
    "The file contains an invalid component display precision.",
  "Cauer benötigt einen ungeraden Grad von 3 bis 19; ab Grad 7 mindestens 40 dB Sperrdämpfung.":
    "Cauer requires an odd order from 3 to 19; orders 7 and above require at least 40 dB of stopband attenuation.",
  "Die Bandbreite muss positiv, endlich und höchstens 1 THz sein.":
    "Bandwidth must be positive, finite, and at most 1 THz.",
  "Beide Bandgrenzen müssen zwischen 1 Hz und 1 THz liegen.":
    "Both band edges must be between 1 Hz and 1 THz.",
  "Die Datei muss 2 bis 42 Schaltungsknoten enthalten.":
    "The file must contain 2 to 42 circuit nodes.",
  "Ungültige oder doppelte Schaltungsknoten.":
    "Circuit nodes are invalid or duplicated.",
  "Ein Tor darf kein Bauelement sein.": "A port cannot be a component.",
  "Unbekanntes Tor.": "Unknown port.",
  "Ungültiger Bauelementwert oder Bauelementtyp.":
    "Invalid component value or component type.",
  "Ungültiger Resonator in der Datei.":
    "The file contains an invalid resonator.",
  "Genau ein Eingang und ein Ausgang sind erforderlich.":
    "Exactly one input and one output are required.",
  "Ungültige Verbindung in der Datei.":
    "The file contains an invalid connection.",
  "Ungültiger Frequenzbereich.": "Invalid frequency range.",
  "Mittenfrequenz und Bandbreite müssen endlich und positiv sein.":
    "Center frequency and bandwidth must be finite and positive.",
  "Diese Cauer-Spezifikation konnte nicht zuverlässig synthetisiert werden. Bitte die Sperrdämpfung erhöhen oder den Grad verringern.":
    "These Cauer specifications could not be synthesized reliably. Increase the stopband attenuation or reduce the order.",
  "Diese Prototyp-Struktur kann nicht als Bandfilter transformiert werden.":
    "This prototype topology cannot be transformed into a band filter.",
  "Der Filtergrad muss zwischen 1 und 20 liegen.":
    "The filter order must be between 1 and 20.",
  "Frequenz und Impedanz müssen positiv sein.":
    "Frequency and impedance must be positive.",
  "Die Welligkeit muss zwischen 0,01 und 3 dB liegen.":
    "Ripple must be between 0.01 and 3 dB.",
  "Für Bandfilter muss eine endliche, positive Bandbreite in Hz angegeben werden.":
    "Band filters require a finite, positive bandwidth in Hz.",
  "Die Cauer-Synthese unterstützt ungerade Grade von 3 bis 19.":
    "Cauer synthesis supports odd orders from 3 to 19.",
  "Die Cauer-Sperrdämpfung muss zwischen 20 und 80 dB liegen.":
    "Cauer stopband attenuation must be between 20 and 80 dB.",
  "Cauer-Leiterstrukturen ab Grad 7 benötigen eine Sperrdämpfung zwischen 40 und 80 dB.":
    "Cauer ladders of order 7 and above require stopband attenuation between 40 and 80 dB.",
  "Die gewählten Frequenz- und Impedanzwerte überschreiten den numerischen Bereich der Bauteilsynthese.":
    "The selected frequency and impedance exceed the numerical range of component synthesis.",
  "Die beiden Bandgrenzen liegen bei −3,0103 dB.":
    "Both band edges are at −3.0103 dB.",
  "Die beiden Bandgrenzen liegen bei −Rp dB; die Sperrdämpfung wird innerhalb des Sperrbereichs erreicht.":
    "Both band edges are at −Rp dB; the specified attenuation is reached in the stopband.",
  "Die Grenzfrequenz bezeichnet den −3,0103-dB-Punkt.":
    "The cutoff frequency is the −3.0103 dB point.",
  "Die Grenzfrequenz bezeichnet die Durchlassbandgrenze bei −Rp dB.":
    "The cutoff frequency is the passband edge at −Rp dB.",
  "Gerader Chebyshev-Grad: Der Ausgangsabschluss wird für die spezifizierte Welligkeit angepasst.":
    "Even Chebyshev order: the output termination is adjusted for the specified ripple.",
  "Die normierte Frequenz muss endlich sein.":
    "The normalized frequency must be finite.",
  "Unbekannte Zweigart.": "Unknown branch type.",
  "Für einen LC-Zweig muss die Resonatorart angegeben sein.":
    "An LC branch requires a resonator type.",
  "Unbekanntes Bauelement.": "Unknown component.",
  "Der Wertebereich ist für eine stabile Polynomrechnung zu groß. Bezugsfrequenz oder Bauteilwerte anpassen.":
    "The value range is too large for stable polynomial arithmetic. Adjust the reference frequency or component values.",
  "Die Frequenz muss endlich und nicht negativ sein.":
    "Frequency must be finite and nonnegative.",
  "Ungültiger Frequenzbereich oder ungültige Anzahl von Stützstellen (2–10001).":
    "Invalid frequency range or number of sample points (2–10001).",
  "Die Schaltung konnte nicht ausgewertet werden.":
    "The circuit could not be analyzed.",
  "Schaltung generiert. Alle Ergebnisse sind aktualisiert.":
    "Circuit generated. All results are up to date.",
  "Synthese nicht möglich.": "Synthesis is not possible.",
  "Bauelement platziert. Verbinde die beiden Anschlüsse mit der Schaltung.":
    "Component placed. Connect both terminals to the circuit.",
  "Projekt als JSON heruntergeladen.": "Project downloaded as JSON.",
  "Die Datei ist größer als 1 MB.": "The file is larger than 1 MB.",
  "Projekt geöffnet.": "Project opened.",
  "Die Datei konnte nicht gelesen werden.": "The file could not be read.",
  "Der gewählte Wertebereich überschreitet die numerische Genauigkeit. Bitte Frequenzbereich oder Bauteilwerte anpassen.":
    "The selected value range exceeds numerical precision. Adjust the frequency range or component values.",
  "Frequenzgang nicht berechenbar.":
    "The frequency response cannot be calculated.",
};

const quantities: Record<string, string> = {
  Bauteilwert: "Component value",
  Kapazität: "Capacitance",
  Bezugsfrequenz: "Reference frequency",
  Eingangsimpedanz: "Input impedance",
  Ausgangsimpedanz: "Output impedance",
  Startfrequenz: "Start frequency",
  Endfrequenz: "End frequency",
};

export function translateMessage(message: string, language: Language): string {
  if (language === "de") return message;
  if (english[message]) return english[message];
  let match = message.match(/^(.+) muss eine endliche, positive Zahl sein\.$/);
  if (match && quantities[match[1]])
    return `${quantities[match[1]]} must be a finite, positive number.`;
  match = message.match(
    /^Die Bandbreite muss mindestens ([\d.,eE+−-]+) % der Mittenfrequenz betragen\.$/,
  );
  if (match)
    return `Bandwidth must be at least ${match[1].replace(",", ".")}% of the center frequency.`;
  match = message.match(
    /^Bandfilter benötigen eine Bandbreite von mindestens ([\d.,eE+−-]+) % der Mittenfrequenz\.$/,
  );
  if (match)
    return `Band filters require a bandwidth of at least ${match[1].replace(",", ".")}% of the center frequency.`;
  match = message.match(
    /^Elliptische LC-Synthese mit endlichen Übertragungsnullstellen\. Sperrbandgrenzen: (.+) Hz und (.+) Hz\.$/,
  );
  if (match)
    return `Elliptic LC synthesis with finite transmission zeros. Stopband edges: ${match[1]} Hz and ${match[2]} Hz.`;
  match = message.match(
    /^Elliptische LC-Synthese mit endlichen Übertragungsnullstellen\. Sperrbandgrenze: (.+) Hz\.$/,
  );
  if (match)
    return `Elliptic LC synthesis with finite transmission zeros. Stopband edge: ${match[1]} Hz.`;
  match = message.match(
    /^Tiefpass-Prototypgrad (\d+); resultierender Bandfiltergrad (\d+)\. Mittenfrequenz f₀ = √\(f₁f₂\), Bandbreite B = f₂ − f₁\.$/,
  );
  if (match)
    return `Low-pass prototype order ${match[1]}; resulting band-filter order ${match[2]}. Center frequency f₀ = √(f₁f₂), bandwidth B = f₂ − f₁.`;
  // Preserve unknown browser/parser diagnostics rather than replacing useful detail.
  return message;
}
