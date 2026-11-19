'use client';

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useVerrouDefilement } from '../_composants/verrouDefilement';

/**
 * 🔴🔴 Arno (19/11/2026, règle F) — LA FENÊTRE DE CONFIRMATION : après chaque validation sur un rendez-vous (fixer, modifier / déplacer, valider sans
 * confirmation, annuler une validation), elle dit en une phrase ce qui vient d'être fait, avec un bouton « OK ». Clavier : le focus va sur « OK »,
 * Échap et Entrée ferment ; lecteur d'écran : `role="alertdialog"` avec son titre et sa phrase. Aucune animation (prefers-reduced-motion sans objet).
 * Mobile : pleine largeur moins les marges, bouton de 44 px au moins. Jetons du thème uniquement.
 */
export function ModaleConfirmation({ titre = 'C’est fait', phrase, onOk }: { titre?: string; phrase: string; onOk: () => void }) {
  useVerrouDefilement();
  const id = useId();
  const ok = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    ok.current?.focus();
    const clavier = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.preventDefault(); onOk(); } };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, [onOk]);
  const boite = (
    <div className="mcf-voile" data-modale-confirmation>
      <style>{CSS_MODALE_CONFIRMATION}</style>
      <div className="mcf-boite" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-t`} aria-describedby={`${id}-p`}>
        <h2 id={`${id}-t`} className="mcf-titre"><span aria-hidden="true">✓ </span>{titre}</h2>
        <p id={`${id}-p`} className="mcf-phrase" data-phrase-confirmation>{phrase}</p>
        <button ref={ok} type="button" className="svv-btn svv-btn-primary mcf-ok" onClick={onOk} data-ok-confirmation>OK</button>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? boite : createPortal(boite, document.querySelector('.svv-adm-root') ?? document.body);
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; aucune animation. */
export const CSS_MODALE_CONFIRMATION = `
.mcf-voile{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;background:color-mix(in srgb, var(--color-svv-ink) 45%, transparent)}
.mcf-boite{box-sizing:border-box;width:min(100%,28rem);display:flex;flex-direction:column;gap:12px;padding:20px;border-radius:16px;background:var(--color-svv-surface);color:var(--color-svv-ink);border:2px solid var(--color-svv-green-ink)}
.mcf-titre{margin:0;font-size:1.15rem;font-weight:800;color:var(--color-svv-green-ink)}
.mcf-phrase{margin:0;font-size:1rem;line-height:1.4;overflow-wrap:anywhere}
.mcf-ok{min-height:44px;width:100%;margin:0}
.mcf-ok:focus-visible{outline:2px solid var(--color-svv-ink);outline-offset:2px}
`;
