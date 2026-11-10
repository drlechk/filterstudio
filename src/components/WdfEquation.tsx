import { useMemo } from 'react';
import { Formula, MathView } from './MathView';
import { usePreferences } from '../lib/preferences';
import { DEFAULT_COMPONENT_PRECISION } from '../lib/component-rounding';
import { buildWdfEquation, numericWdfEquation } from '../lib/wdf-equation';
import type { WdfModel } from '../lib/wdf';
import type { ComponentPrecision } from '../lib/types';

export function WdfEquation({ model, precision = DEFAULT_COMPONENT_PRECISION }: { model: WdfModel; precision?: ComponentPrecision }) {
  const { t, language } = usePreferences();
  const result = useMemo(() => {
    try { return { equation: buildWdfEquation(model) }; }
    catch { return { equation: null }; }
  }, [model]);
  const numeric = useMemo(() => result.equation ? numericWdfEquation(result.equation, precision, language) : null, [result.equation, precision, language]);
  const equation = result.equation;
  return <section className="wdf-equation" aria-label={t('WDF-Differenzengleichung', 'WDF difference equation')}>
    {equation && numeric ? <>
      <MathView title={t('Symbolische Differenzengleichung · Vout / Vₛ', 'Symbolic difference equation · Vout / Vₛ')}
        description={t('γ₁,S1, γ₁,P2 usw. bezeichnen dieselben unabhängigen Koeffizienten wie im Signalflussgraphen. Vₛ ist die Quellenspannung vor R₁; Vout liegt an R₂. Die Anfangszustände sind null.',
          'γ₁,S1, γ₁,P2, etc. denote the same independent coefficients as in the signal-flow graph. Vₛ is the source voltage before R₁; Vout is measured across R₂. Initial states are zero.')}
        latex={equation.symbolic.latex} formulaGroups={[equation.symbolic.groups[0]]} />
      {equation.symbolic.groups.length > 1 && <details className="wdf-equation-groups" open={equation.order <= 6}>
        <summary>{equation.coefficients ? t('Gemeinsame Koeffizientengruppen κ', 'Shared coefficient groups κ') : t('Koeffizienten aus faktorisierten Polynomen', 'Coefficients from factored polynomials')}</summary>
        {!equation.coefficients && <p>{t('q ist eine Verzögerung um einen Abtastschritt. [qᵏ] liest den Koeffizienten von qᵏ aus. Die Polynomgruppen definieren alle Koeffizienten symbolisch, ohne lange Produkte vollständig auszumultiplizieren.',
          'q delays a signal by one sample. [qᵏ] extracts the coefficient of qᵏ. The polynomial groups define every coefficient symbolically while keeping long products factored.')}</p>}
        <div className="math-formula-groups">{equation.symbolic.groups.slice(1).map((group, i) => <div className="math-formula-group" key={i}>
          {group.map((latex, j) => <Formula key={j} latex={latex} />)}
        </div>)}</div>
      </details>}
      <MathView title={t('Differenzengleichung mit Zahlenwerten', 'Difference equation with numerical values')}
        description={precision === 'full'
          ? t('Volle verfügbare Zahlengenauigkeit. Die Koeffizienten werden aus dem aktuellen WDF berechnet.', 'Full available numerical precision. Coefficients are computed from the current WDF.')
          : t(`Anzeige mit ${precision} signifikanten Stellen gemäß der Bauteil-Rundungseinstellung. Gerundet wird nach der Berechnung der Gleichung.`,
            `Displayed with ${precision} significant digits, following the component rounding setting. Rounding is applied after deriving the equation.`)}
        latex={numeric.latex} formulaGroups={numeric.groups} />
    </> : <p role="status">{t('Die Differenzengleichung überschreitet den darstellbaren Zahlenbereich. Der WDF-Signalflussgraph bleibt verfügbar.',
      'The difference equation exceeds the representable numerical range. The WDF signal-flow graph remains available.')}</p>}
  </section>;
}
