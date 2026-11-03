import type { Section } from "../lib/types";
import type { SectionMatrixDerivation } from "../lib/section-matrix";
import { formatComponentLabel } from "../lib/component-units";
import { usePreferences } from "../lib/preferences";
import { MathView } from "./MathView";

export function SectionMatrixView({ section, index, derivation }: { section: Section; index: number; derivation: SectionMatrixDerivation }) {
  const { t, language } = usePreferences();
  const kind = section.kind === "R" ? t("Widerstand", "Resistor")
    : section.kind === "L" ? t("Induktivität", "Inductor")
    : section.kind === "C" ? t("Kapazität", "Capacitor")
    : section.resonator === "series" ? t("LC-Serienkreis", "Series LC resonator") : t("LC-Parallelkreis", "Parallel LC resonator");
  const values = section.kind === "LC"
    ? `L = ${formatComponentLabel(section.value, "L", language, "full")}, C = ${formatComponentLabel(section.value2!, "C", language, "full")}`
    : `${section.kind} = ${formatComponentLabel(section.value, section.kind, language, "full")}`;
  const internal = section.kind === "LC"
    ? section.resonator === "series" ? t("L und C sind intern in Serie geschaltet. ", "L and C are connected internally in series. ")
      : t("L und C sind intern parallel geschaltet. ", "L and C are connected internally in parallel. ")
    : "";
  const placement = section.connection === "series"
    ? t("Die Impedanz des gesamten Serienzweigs wird als B = Z(p) eingesetzt; A = D = 1, C = 0.", "The complete series-branch impedance is inserted as B = Z(p); A = D = 1, C = 0.")
    : t("Die Admittanz des gesamten Querzweigs wird als C = Y(p) = 1/Z(p) eingesetzt; A = D = 1, B = 0.", "The complete shunt-branch admittance is inserted as C = Y(p) = 1/Z(p); A = D = 1, B = 0.");
  return <MathView
    title={`${t("Teilkettenmatrix", "Section matrix")} ${index} · ${section.label ?? section.id} · ${kind} · ${section.connection === "series" ? t("Serienzweig", "Series branch") : t("Querzweig", "Shunt branch")}`}
    description={`${t("Eingesetzt:", "Values used:")} ${values}. ${internal}${placement}`}
    latex={derivation.latex}
    formulaGroups={derivation.groups}
  />;
}
