'use client';

import { useEffect, useId, useRef, useState } from 'react';

/**
 * ══ « RESTE À RENSEIGNER » DANS LA BARRE DU BAS — UNE SEULE LIGNE, LA LISTE DANS UNE BULLE ═══════════════════════════
 * Arno (26/10/2026), vu en production sur un PC Windows : la liste complète, écrite en entier dans la colonne étroite à
 * gauche des boutons, faisait grandir la barre jusqu'à la moitié de l'écran.
 *   · La ligne reste à la hauteur des boutons : « Reste à renseigner (N) : … », coupée par « … », jamais sur deux lignes.
 *   · N et la ligne viennent de la MÊME liste (`manques`) que la bulle : un seul calcul.
 *   · La liste complète s'ouvre dans une bulle AU-DESSUS de la barre (superposée, elle ne pousse rien) : au survol de la
 *     souris, au toucher, au focus clavier ; elle se referme en touchant ailleurs ou avec Échap.
 * Le contenu de la liste est celui d'avant ; seul son affichage change. Liste vide : rien n'est rendu (l'écran garde son
 * message habituel).
 */
export function LigneManques({ manques, attributs }: {
  manques: readonly string[];
  /** Attributs du paragraphe (repères d'épreuve, rôle), pour garder ceux de la ligne d'avant. */
  attributs?: Record<string, string | undefined>;
}) {
  const id = useId();
  const zone = useRef<HTMLDivElement>(null);
  const appui = useRef(false);
  const [survol, setSurvol] = useState(false);
  const [focusClavier, setFocusClavier] = useState(false);
  const [epingle, setEpingle] = useState(false);
  const ouvert = survol || focusClavier || epingle;

  // Toucher (ou cliquer) ailleurs referme la bulle épinglée.
  useEffect(() => {
    if (!epingle) return;
    const ailleurs = (e: PointerEvent) => {
      if (zone.current !== null && e.target instanceof Node && !zone.current.contains(e.target)) setEpingle(false);
    };
    document.addEventListener('pointerdown', ailleurs);
    return () => document.removeEventListener('pointerdown', ailleurs);
  }, [epingle]);

  if (manques.length === 0) return null;
  const ligne = `Reste à renseigner (${manques.length}) : ${manques.join(' · ')}.`;
  const fermer = () => { setSurvol(false); setFocusClavier(false); setEpingle(false); };

  return (
    <div className="loc-manques-zone" ref={zone} data-manques-zone
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') setSurvol(true); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setSurvol(false); }}
      onKeyDown={(e) => { if (e.key === 'Escape' && ouvert) { e.stopPropagation(); fermer(); } }}>
      <p className="loc-manques loc-manques--ligne" role="status" {...attributs}>
        <button type="button" className="loc-manques-declencheur" aria-expanded={ouvert} aria-controls={id} data-manques-declencheur
          onClick={() => setEpingle((x) => !x)}
          // Un focus sans appui du doigt ou de la souris juste avant est un focus CLAVIER (Tab) : il ouvre la bulle.
          onPointerDown={() => { appui.current = true; }}
          onFocus={() => { setFocusClavier(!appui.current); appui.current = false; }}
          onBlur={() => { setFocusClavier(false); appui.current = false; }}>
          {ligne}
        </button>
      </p>
      <div id={id} className="loc-manques-bulle" role="tooltip" data-manques-bulle data-ouvert={ouvert ? '' : undefined}>
        <p className="loc-manques-bulle-titre">Reste à renseigner ({manques.length}) :</p>
        <ul>{manques.map((m, i) => <li key={i}>{m}</li>)}</ul>
      </div>
    </div>
  );
}

/** La feuille de la ligne et de sa bulle (jetons --color-svv-* seulement : clair, sombre et système). */
export const CSS_LIGNE_MANQUES = `
.loc-collant .loc-manques-zone{flex:1 1 16rem;min-width:0;position:relative;align-self:center}
.loc-collant .loc-manques-zone .loc-manques.loc-manques--ligne{display:block;min-width:0}
.loc-manques-declencheur{display:block;width:100%;min-height:44px;margin:0;padding:0 4px;border:0;border-radius:10px;background:transparent;color:inherit;font:inherit;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:help}
.loc-manques-declencheur:focus-visible{outline:2px solid var(--color-svv-ink);outline-offset:2px}
.loc-manques-bulle{display:none;position:absolute;left:0;bottom:calc(100% + 10px);z-index:20;width:max-content;max-width:min(36rem,calc(100vw - 32px));max-height:min(60vh,28rem);overflow-y:auto;padding:14px 18px;border:1px solid var(--color-svv-line-strong);border-radius:16px;background:var(--color-svv-surface-raised);color:var(--color-svv-ink);font-size:.95rem;line-height:1.45;box-shadow:0 10px 28px color-mix(in srgb,var(--color-svv-ink) 22%,transparent);text-align:left}
.loc-manques-bulle[data-ouvert]{display:block}
.loc-manques-bulle-titre{margin:0 0 6px;font-weight:700}
.loc-manques-bulle ul{margin:0;padding-left:1.2em}
.loc-manques-bulle li + li{margin-top:4px}
@media (max-width:760px){
  .loc-collant .loc-manques-zone{flex-basis:100%}
  .loc-manques-bulle{max-width:100%}
}
`;
