'use client';

import { useId } from 'react';
import { QUESTION_INVITER_LOCATAIRES, type ChoixLocataires } from '../../../../lib/location/reponsesRdv';

/**
 * 🔴 Arno (18/11/2026, 2e lot) — « Envoyer l'invitation aux locataires : Oui / Non », en fixant ou en déplaçant un rendez-vous de préavis
 * (pré-visite et état des lieux de sortie). OBLIGATOIRE, AUCUNE réponse pré-cochée : tant que rien n'est choisi, le formulaire ne s'envoie pas
 * (le serveur refuse aussi). Deux boutons radio de 44 px au moins, le mot toujours écrit, jetons du thème ; aucune animation.
 */
export function ChoixInviterLocataires({ valeur, onChange, desactive, manque }: {
  valeur: ChoixLocataires | null; onChange: (c: ChoixLocataires) => void; desactive?: boolean;
  /** Le formulaire a été validé sans choix : la question le dit. */
  manque?: boolean;
}) {
  const id = useId();
  return (
    <fieldset className={`cil${manque && valeur === null ? ' cil--manque' : ''}`} data-choix-locataires={valeur ?? 'aucun'} aria-describedby={`${id}-aide`}>
      <style>{CSS_CHOIX_LOCATAIRES}</style>
      <legend className="pvs-libelle">{QUESTION_INVITER_LOCATAIRES}{' *'}</legend>
      <div className="cil-boutons" role="radiogroup" aria-required="true">
        {(['oui', 'non'] as const).map((c) => (
          <button key={c} type="button" role="radio" aria-checked={valeur === c} disabled={desactive}
            className={`cil-bouton${valeur === c ? ' cil-bouton--choisi' : ''}`} onClick={() => onChange(c)} data-inviter-locataires={c}>
            {c === 'oui' ? 'Oui' : 'Non'}
          </button>
        ))}
      </div>
      <p id={`${id}-aide`} className="loc-muet cil-aide" data-choix-locataires-aide>
        {valeur === 'oui' ? 'Chaque locataire recevra l’invitation, avec « J’accepte le rendez-vous » / « Je refuse ».'
          : valeur === 'non' ? 'Aucun mail aux locataires : le rendez-vous est considéré comme confirmé.'
            : 'Choisissez « Oui » ou « Non ».'}
      </p>
    </fieldset>
  );
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; aucune animation (prefers-reduced-motion sans objet). */
export const CSS_CHOIX_LOCATAIRES = `
.cil{margin:0;padding:0;border:0;min-width:0;display:flex;flex-direction:column;gap:6px}
/* 🔴 Arno (18/11/2026) — les deux boutons sur TOUTE la largeur de la colonne (comme les autres champs), même largeur, côte à côte */
.cil-boutons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:100%;box-sizing:border-box}
.cil-bouton{width:100%;box-sizing:border-box;min-height:44px;min-width:0;padding:0 12px;border-radius:12px;border:1px solid var(--color-svv-line-strong);background:var(--color-svv-surface);color:var(--color-svv-ink);font:inherit;font-weight:700;cursor:pointer}
.cil-bouton--choisi{border-color:var(--color-svv-ink);background:var(--color-svv-ink);color:var(--color-svv-surface)}
.cil-bouton:focus-visible{outline:2px solid var(--color-svv-ink);outline-offset:2px}
.cil-aide{margin:0}
.cil--manque .cil-aide{color:var(--color-svv-red);font-weight:700}
`;
