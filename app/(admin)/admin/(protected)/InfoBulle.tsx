'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';

/**
 * Info-bulle « i » accessible — composant PARTAGÉ de l'admin (repris À L'IDENTIQUE de la page
 * Pilotage pour cohérence visuelle stricte). ≥44px de cible tactile, ouverture/fermeture au tap,
 * fermeture clic-hors-zone + Échap, focus clavier, `role="tooltip"`. Purement affichage.
 *
 * Le CSS associé (classes `svv-pil-ib-*` + badge `svv-pil-statut--vive`) est exporté dans
 * INFOBULLE_CSS et DOIT être injecté UNE fois par page (dans un `<style>`).
 */
export function InfoBulle({ libelle, texte, cible, etiquette, contenu, dansLEcran = false }: {
  libelle: string; texte?: string; cible: string;
  /** Le libellé accessible complet du picto (par défaut « Aide : {libelle} »). — tuile Location, 20/10/2026 */
  etiquette?: string;
  /** Un contenu riche (plusieurs lignes) au lieu du texte. */
  contenu?: ReactNode;
  /** La bulle est décalée pour ne JAMAIS sortir de l'écran (téléphone). Absent : placement d'origine, inchangé. */
  dansLEcran?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const conteneur = useRef<HTMLSpanElement>(null);
  const [decalage, setDecalage] = useState(0);
  const bulleId = `svv-ib-${cible}`;

  /**
   * Le maintien dans l'écran (tuile Location, 20/10/2026) : le décalage est calculé AVANT l'ouverture, depuis la place du picto
   * et la largeur la plus grande que la bulle peut prendre (min(280 px, écran − 40 px)), marge de 8 px. La bulle ne déborde
   * donc jamais, même un instant (au téléphone, un débordement d'une image suffit à élargir la page).
   */
  const ouvrirOuFermer = (): void => {
    if (!ouvert && dansLEcran && conteneur.current !== null && typeof document !== 'undefined') {
      const largeur = document.documentElement.clientWidth || window.innerWidth;
      const gauche = conteneur.current.getBoundingClientRect().left;
      const bulleMax = Math.min(280, largeur - 40);
      let dx = Math.min(0, (largeur - 8) - (gauche + bulleMax));
      if (gauche + dx < 8) dx = 8 - gauche;
      setDecalage(dx);
    }
    setOuvert((v) => !v);
  };

  useEffect(() => {
    if (!ouvert) return;
    function surClicHors(e: MouseEvent) {
      if (conteneur.current && !conteneur.current.contains(e.target as Node)) setOuvert(false);
    }
    function surEchap(e: KeyboardEvent) {
      if (e.key === 'Escape') setOuvert(false);
    }
    document.addEventListener('mousedown', surClicHors);
    document.addEventListener('keydown', surEchap);
    return () => {
      document.removeEventListener('mousedown', surClicHors);
      document.removeEventListener('keydown', surEchap);
    };
  }, [ouvert]);

  if (!texte && contenu === undefined) return null;

  return (
    <span className="svv-pil-ib" ref={conteneur}>
      <button
        type="button"
        className="svv-pil-ib-btn"
        aria-label={etiquette ?? `Aide : ${libelle}`}
        aria-expanded={ouvert}
        aria-controls={bulleId}
        onClick={ouvrirOuFermer}
      >
        <span className="svv-pil-ib-pastille" aria-hidden="true">i</span>
      </button>
      {ouvert && (
        <span className="svv-pil-ib-bulle" id={bulleId} role="tooltip"
          style={dansLEcran ? { left: `${decalage}px`, boxSizing: 'border-box' } : undefined}>
          <span className="svv-pil-ib-texte">{contenu ?? texte}</span>
          <button
            type="button"
            className="svv-pil-ib-fermer"
            aria-label="Fermer l’aide"
            onClick={() => setOuvert(false)}
          >
            ×
          </button>
        </span>
      )}
    </span>
  );
}

/** CSS de l'info-bulle + du badge de statut « Vive » — repris À L'IDENTIQUE de Pilotage. Injecter une fois par page. */
export const INFOBULLE_CSS = `
.svv-pil-ib{position:relative;display:inline-flex;flex:0 0 auto}
.svv-pil-ib-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;min-width:44px;min-height:44px;margin:-11px -11px -11px -6px;padding:0;background:none;border:0;cursor:pointer;color:var(--color-svv-muted)}
.svv-pil-ib-pastille{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:999px;border:1px solid currentColor;font-size:.7rem;font-weight:800;font-style:italic;line-height:1;font-family:Georgia,serif}
.svv-pil-ib-btn:hover .svv-pil-ib-pastille,.svv-pil-ib-btn[aria-expanded="true"] .svv-pil-ib-pastille{color:var(--color-svv-red)}
.svv-pil-ib-btn:focus-visible{outline:2px solid var(--color-svv-red);outline-offset:2px;border-radius:999px}
.svv-pil-ib-bulle{position:absolute;top:calc(100% + 4px);left:0;z-index:20;display:flex;gap:.35rem;align-items:flex-start;width:max-content;max-width:min(280px,calc(100vw - 40px));padding:.55rem .65rem;background:var(--color-svv-tip-bg);color:#fff;border-radius:.5rem;box-shadow:0 6px 20px rgba(0,0,0,.22);font-size:.78rem;line-height:1.4;font-weight:400;white-space:normal;word-break:break-word;animation:svv-ib-in .12s ease}
.svv-pil-ib-texte{min-width:0}
.svv-pil-ib-fermer{appearance:none;flex:0 0 auto;background:none;border:0;color:#fff;font-size:1rem;line-height:1;cursor:pointer;min-width:24px;min-height:24px;padding:0;opacity:.85}
.svv-pil-ib-fermer:hover{opacity:1}
.svv-pil-ib-fermer:focus-visible{outline:2px solid #fff;outline-offset:1px;border-radius:.3rem}
.svv-pil-statut{flex:0 0 auto;font-size:.68rem;font-weight:700;border-radius:999px;padding:.12rem .5rem;white-space:nowrap;line-height:1.3}
.svv-pil-statut--vive{background:var(--color-svv-green-soft);color:var(--color-svv-green-ink)}
@keyframes svv-ib-in{from{opacity:0;transform:translateY(-2px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.svv-pil-ib-bulle{animation:none}}
`;
