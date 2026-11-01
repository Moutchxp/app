'use client';

import { useState } from 'react';
import { parametre } from './commun';

/**
 * ══ 🔴 LOT LG2 / LO12 (Arno) — « AVEC SALAIRES | SANS SALAIRES », PARTAGÉ : FUSION Location & Gestion, Suivi CA › Location, Gestion ═══════════════
 * Le même choix sur les trois pages : l'adresse (&salaires=avec|sans) l'emporte, sinon le choix retenu dans le navigateur, sinon « Avec ». Le sélecteur
 * est posé sous le titre d'une tuile cliquable : un clic dedans n'ouvre pas la fenêtre de la tuile. « Avec » : les salaires chargés saisis sont
 * déduits ; « Sans » : ils ne sont pas comptés (montrés en gris, « non comptés »).
 */
export const CLE_SALAIRES = 'trx-fusion-salaires';

export function useChoixSalaires(): [boolean, (avec: boolean) => void] {
  const [salaires, setEtat] = useState<boolean>(() => {
    const x = parametre('salaires'); if (x === 'avec' || x === 'sans') return x === 'avec';
    try { return window.localStorage.getItem(CLE_SALAIRES) !== 'sans'; } catch { return true; }
  });
  const choisir = (avec: boolean): void => { setEtat(avec); try { window.localStorage.setItem(CLE_SALAIRES, avec ? 'avec' : 'sans'); } catch { /* préférence seulement */ } };
  return [salaires, choisir];
}

export function SelecteurSalaires({ salaires, onChange }: { salaires: boolean; onChange: (avec: boolean) => void }) {
  return (
    <span className="trx-unites trx-salaires" role="group" aria-label="Les salaires chargés" data-salaires-choix={salaires ? 'avec' : 'sans'}>
      <style>{CSS_SELECTEUR_SALAIRES}</style>
      {([true, false] as const).map((x) => <button key={String(x)} type="button" className="trx-unite" aria-pressed={salaires === x} data-salaires={x ? 'avec' : 'sans'}
        onClick={(e) => { e.stopPropagation(); onChange(x); }} onKeyDown={(e) => e.stopPropagation()}>{x ? 'Avec salaires' : 'Sans salaires'}</button>)}
    </span>
  );
}
/** Une tuile qui porte le sélecteur : elle s'ouvre au clic (Entrée / Espace), sauf un clic dans le sélecteur. */
export const horsSelecteur = (e: { target: EventTarget }): boolean => !(e.target as HTMLElement).closest?.('[data-salaires-choix]');

/** AUCUN ACCENT GRAVE DANS CE LITTERAL. */
export const CSS_SELECTEUR_SALAIRES = `
.trx-salaires{display:flex;width:max-content;max-width:100%;margin:6px auto 0;border-radius:8px}
.trx-salaires .trx-unite{min-height:32px;min-width:0;padding:2px 10px;font-size:.78rem;line-height:1.15;white-space:normal}
`;
