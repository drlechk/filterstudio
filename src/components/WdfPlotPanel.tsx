import { useMemo } from 'react';
import { Activity } from 'lucide-react';
import { DetachCanvasButton } from './DetachCanvasButton';
import { WdfResponse } from './WdfResponse';
import type { PlotScaleProps } from './PlotScaleControls';
import type { Project } from '../lib/types';
import type { NetworkAnalysis } from '../lib/network';
import { buildWdf, defaultWdfSampleRate } from '../lib/wdf';
import { usePreferences } from '../lib/preferences';
import './WdfView.css';

/** The response is separate from the adaptor canvas, including in pop-out windows. */
export function WdfPlotPanel({ id, project, analysis, onDetach, ...controls }: {
  id?: string; project: Project; analysis: NetworkAnalysis | null;
  onDetach?: (destination: 'window' | 'tab') => void;
  plotScales: PlotScaleProps; dbRange: number; onDbRangeChange: (value: number) => void;
}) {
  const { t, translate } = usePreferences();
  const sampleRate = project.wdf?.sampleRate ?? defaultWdfSampleRate(project.settings);
  const error = useMemo(() => {
    try { buildWdf(project, sampleRate, project.wdf?.rootId); return null; }
    catch (error) { return error instanceof Error ? error.message : String(error); }
  }, [project.nodes, project.wires, project.settings, project.z2, sampleRate, project.wdf?.rootId]);
  return <section id={id} className="results-panel wdf-plot-panel" aria-label={t('WDF-Plots', 'WDF plots')}>
    <div className="panel-toolbar">
      <div className="panel-title"><Activity size={15} /><h2>{t('WDF · Frequenzgang', 'WDF · Frequency response')}</h2></div>
      {onDetach && <DetachCanvasButton plots onOpen={onDetach} />}
    </div>
    {error || !analysis ? <div className="wdf-error" role="status"><Activity size={24} />
      <strong>{t('Die analoge Schaltung ist noch nicht bereit.', 'The analog circuit is not ready yet.')}</strong>
      {error && <p>{translate(error)}</p>}
    </div> : <WdfResponse project={project} analysis={analysis} sampleRate={sampleRate} {...controls} />}
  </section>;
}
