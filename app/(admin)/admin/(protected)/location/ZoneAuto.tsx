'use client';

import { useLayoutEffect, useRef } from 'react';

/**
 * Une zone de texte de 2 lignes par défaut qui S'AGRANDIT avec le texte (Arno, 18/10/2026 : « Annotation » d'une annexe).
 * La hauteur suit `scrollHeight` à chaque frappe ; jamais de barre de défilement interne, jamais de poignée à tirer.
 */
export function ZoneAuto({ valeur, onChange, etiquette, placeholder, maxLength = 2000 }: {
  valeur: string; onChange: (v: string) => void; etiquette: string; placeholder?: string; maxLength?: number;
}) {
  const zone = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const z = zone.current;
    if (z === null) return;
    z.style.height = 'auto';
    if (z.scrollHeight > 0) z.style.height = `${z.scrollHeight + 4}px`;
  }, [valeur]);
  return (
    <label className="loc-champ loc-pleine" data-annotation>{etiquette}
      <textarea ref={zone} className="loc-zone-auto" rows={2} value={valeur} maxLength={maxLength} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} /></label>
  );
}

export const CSS_ZONE_AUTO = `
.loc-zone-auto{display:block;width:100%;box-sizing:border-box;border:1px solid var(--color-svv-line-strong);border-radius:12px;background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-weight:400}
.loc-ample .loc-champ textarea.loc-zone-auto,.loc-zone-auto{min-height:0;resize:none;overflow:hidden;line-height:1.45;padding:12px 16px}
.loc-zone-auto:focus{outline:none;border-color:var(--color-svv-ink)}
.loc-carte-annexe .loc-pleine{grid-column:1/-1}
`;
