import { MathView } from "./MathView";
import { usePreferences } from "../lib/preferences";
import type { FilterApproximation } from "../lib/approximation";
import type { FilterSettings } from "../lib/types";

export function ApproximationView({
  approximation,
  settings,
  matchesPrototype,
}: {
  approximation: FilterApproximation | null;
  settings: FilterSettings;
  matchesPrototype: boolean;
}) {
  const { t, number } = usePreferences();
  if (!approximation)
    return (
      <p className="approximation-status is-reference">
        {t(
          "Für diese Einstellungen ist keine verlässliche Approximationsreferenz verfügbar. Die folgenden Polynome beschreiben die tatsächliche Schaltung.",
          "No reliable approximation reference is available for these settings. The following polynomials describe the actual circuit.",
        )}
      </p>
    );
  const { family, order, response } = settings;
  const familyName =
    family === "butterworth"
      ? "Butterworth"
      : family === "chebyshev"
        ? "Chebyshev I"
        : family === "chebyshev2" ? "Chebyshev II"
        : family === "bessel" ? "Bessel / Thomson"
        : family === "legendre" ? "Legendre / Papoulis"
        : family === "linkwitz-riley" ? "Linkwitz–Riley"
        : t("Cauer / elliptisch", "Cauer / elliptic");
  const responseName = {
    lowpass: t("Tiefpass", "low-pass"),
    highpass: t("Hochpass", "high-pass"),
    bandpass: t("Bandpass", "band-pass"),
    bandstop: t("Bandsperre", "band-stop"),
  }[response];
  const description =
    family === "butterworth"
      ? t(
          "Potenzfunktion Ωⁿ: maximal flacher Durchlassbereich.",
          "Power function Ωⁿ: maximally flat passband.",
        )
      : family === "chebyshev"
        ? t(
            "Chebyshev-Polynom erster Art: gleichmäßige Welligkeit im Durchlassbereich.",
            "Chebyshev polynomial of the first kind: equal ripple in the passband.",
          )
        : family === "chebyshev2" ? t(
            "Inverse Chebyshev-Funktion: monotoner Durchlassbereich und Welligkeit im Sperrbereich. |Ω| = 1 bezeichnet die Sperrbandgrenze bei −Rs dB.",
            "Inverse Chebyshev function: monotonic passband and stopband ripple. |Ω| = 1 is the stopband edge at −Rs dB.",
          ) : family === "bessel" ? t(
            "Umgekehrtes Bessel-Polynom: maximal flache Gruppenlaufzeit des Tiefpass-Prototyps. Dargestellt ist Fₙ²; |Ω| = 1 liegt bei −3,0103 dB. Die Frequenztransformation verändert die Gruppenlaufzeit von Hochpass und Bandfiltern.",
            "Reverse Bessel polynomial: maximally flat group delay of the low-pass prototype. Fₙ² is shown; |Ω| = 1 is at −3.0103 dB. The frequency transformation changes the group delay of high-pass and band filters.",
          ) : family === "legendre" ? t(
            "Optimum-L-Polynom nach Papoulis, aus Legendre-Polynomen abgeleitet: monotoner Betragsgang ohne Welligkeit. Dargestellt ist Fₙ² = Lₙ(Ω²); Lₙ(1) = 1 entspricht −3,0103 dB.",
            "Papoulis optimum-L polynomial derived from Legendre polynomials: monotonic magnitude response without ripple. Fₙ² = Lₙ(Ω²) is shown; Lₙ(1) = 1 corresponds to −3.0103 dB.",
          ) : family === "linkwitz-riley" ? t(
            "Quadrierte Butterworth-Übertragungsfunktion der Ordnung n/2. Gerade Grade 2–100; bei |Ω| = 1 liegt jeder Zweig bei −6,0206 dB. Dargestellt ist Fₙ² = 2Ωⁿ + Ω²ⁿ. Bandfilter entstehen durch Transformation dieses Prototyps.",
            "Squared Butterworth transfer function of order n/2. Even orders 2–100; each branch is at −6.0206 dB for |Ω| = 1. Fₙ² = 2Ωⁿ + Ω²ⁿ is shown. Band filters are transformations of this prototype.",
          ) : t(
            `Elliptische rationale Funktion: Welligkeit in Durchlass- und Sperrbereich. Rₙ(1) = 1; normierte Sperrbandgrenze Ωₛ ≈ ${number(approximation.stopbandRatio!, 6)}.`,
            `Elliptic rational function: ripple in the passband and stopband. Rₙ(1) = 1; normalized stopband edge Ωₛ ≈ ${number(approximation.stopbandRatio!, 6)}.`,
          );
  return (
    <section
      className="approximation-section"
      aria-label={t("Approximationsgrundlage", "Approximation basis")}
    >
      <div className="approximation-heading">
        <h3>
          {t("Approximationsgrundlage", "Approximation basis")} · {familyName} ·
          n = {order}
        </h3>
        <p>
          {t(
            `Ziel ist der ideale ${responseName}-Frequenzgang. Die Approximationsfunktion Fₙ bestimmt, wie der endliche Filter diesen Sprung zwischen Durchlassen und Sperren annähert.`,
            `The target is an ideal ${responseName} response. The approximation function Fₙ determines how the finite-order filter approximates the transition between transmission and rejection.`,
          )}
        </p>
      </div>
      <p
        className={`approximation-status ${matchesPrototype ? "" : "is-reference"}`}
        role="status"
      >
        {matchesPrototype
          ? t(
              "Die Schaltung entspricht dem erzeugten Prototyp einschließlich seiner Torimpedanzen.",
              "The circuit matches the generated prototype, including its port impedances.",
            )
          : t(
              "Entwurfsreferenz: Die aktuelle Schaltung oder ihre Torimpedanzen weichen vom erzeugten Prototyp ab. Die Referenzfunktion gilt daher nicht automatisch für die nachfolgenden S-Polynome.",
              "Design reference: the current circuit or its port impedances differ from the generated prototype. The reference function therefore does not automatically apply to the S-polynomials below.",
            )}
      </p>
      <MathView
        title={t(
          "Approximationsfunktion des Prototyps Fₙ(Ω)",
          "Prototype approximation function Fₙ(Ω)",
        )}
        description={description}
        latex={approximation.latex.characteristic}
      />
      <MathView
        title={t("Was wird approximiert?", "What is being approximated?")}
        description={t(
          "Idealer Leistungsfrequenzgang und gewählte Approximation. An der idealen Sprungstelle |Ω| = 1 ist kein Wert vorgegeben.",
          "Ideal power response and the selected approximation. No value is prescribed at the ideal discontinuity |Ω| = 1.",
        )}
        latex={approximation.latex.response}
      />
      <MathView
        title={t(
          `Frequenzabbildung für ${responseName}`,
          `Frequency mapping for the ${responseName}`,
        )}
        description={t(
          "Ω ist die reelle Frequenz des Tiefpassprototyps; q ist dessen komplexe Frequenzvariable. Die Schaltungspolynome darunter verwenden p. Für Bandfilter gilt die Ordnung 2n.",
          "Ω is the real frequency of the low-pass prototype; q is its complex frequency variable. The circuit polynomials below use p. Band filters have order 2n.",
        )}
        latex={approximation.latex.mapping}
      />
      <p className="approximation-explanation">
        {t(
          "Für die Entwurfsreferenz gilt |Ψref(jx)|² = ε² Fₙ²(Ω(x)) mit der oben angegebenen Frequenzabbildung. Ψ(p) und die S-Polynome darunter beschreiben die tatsächlich verbundenen Bauelemente.",
          "For the design reference, |Ψref(jx)|² = ε² Fₙ²(Ω(x)) using the frequency mapping above. Ψ(p) and the S-polynomials below describe the actual connected components.",
        )}
      </p>
    </section>
  );
}
