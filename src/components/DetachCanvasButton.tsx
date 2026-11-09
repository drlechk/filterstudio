import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ExternalLink, PanelsTopLeft } from 'lucide-react';
import { usePreferences } from '../lib/preferences';

export function DetachCanvasButton({ onOpen }: { onOpen: (destination: 'window' | 'tab') => void }) {
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (e: PointerEvent) => { if (e.target instanceof Node && !container.current?.contains(e.target)) setOpen(false); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div className="detach-canvas-control" ref={container}>
    <button ref={trigger} className="detach-canvas-button" aria-expanded={open} onClick={() => setOpen(value => !value)}
      title={t('Circuit oder WDF in einem eigenen Fenster oder Tab öffnen', 'Open Circuit or WDF in its own window or tab')}>
      <ExternalLink size={14} />{t('Abkoppeln', 'Detach')}<ChevronDown size={12} />
    </button>
    {open && <div className="detach-canvas-menu">
      <button onClick={() => { setOpen(false); onOpen('window'); }}><ExternalLink size={14} />{t('Neues Fenster', 'New window')}</button>
      <button onClick={() => { setOpen(false); onOpen('tab'); }}><PanelsTopLeft size={14} />{t('Neuer Tab', 'New tab')}</button>
    </div>}
  </div>;
}
