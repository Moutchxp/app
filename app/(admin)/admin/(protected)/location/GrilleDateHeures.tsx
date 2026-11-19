'use client';

import { useId } from 'react';
import { ChoixHeure } from './ChoixHeure';
import type { PlageRdv } from '../../../../lib/location/minutesRdv';

/**
 * 🔴🔴 Arno (19/11/2026) — DATE ET HEURES D'UN RENDEZ-VOUS DU PRÉAVIS, l'une sous l'autre, symétriques : « Date » puis son champ ; « Début » puis
 * heure : minutes ; « Fin » puis heure : minutes. Une grille à deux colonnes : la colonne des LIBELLÉS est commune (même largeur, alignés à gauche),
 * les champs commencent tous au même endroit, et les listes heure / minutes de Début et de Fin ont les mêmes largeurs et positions. Téléphone
 * (≤ 600 px) : chaque libellé au-dessus de son champ, même alignement, aucun débordement. Pré-visite et état des lieux, fixer et déplacer.
 * Les libellés et les repères (`data-…`) sont ceux de chaque fenêtre, inchangés.
 */
export function GrilleDateHeures({ classe, donneesGrille, libelles, jour, onJour, min, max, debut, onDebut, fin, onFin, minutes, plage, garder, donnees, desactive }: {
  classe: string; donneesGrille?: Record<string, string>;
  libelles: { date: string; debut: string; fin: string };
  jour: string; onJour: (v: string) => void; min?: string; max?: string;
  debut: string; onDebut: (v: string) => void; fin: string; onFin: (v: string) => void;
  minutes: readonly number[]; plage: PlageRdv; garder?: readonly string[];
  donnees: { jour: string; debut: string; fin: string }; desactive?: boolean;
}) {
  const id = useId();
  return (
    <div className={`${classe} gdh`} {...donneesGrille}>
      <style>{CSS_GRILLE_DATE_HEURES}</style>
      <label className="pvs-libelle gdh-libelle" htmlFor={`${id}-j`}>{libelles.date}</label>
      <input id={`${id}-j`} className="gdh-date" type="date" value={jour} min={min} max={max} disabled={desactive} onChange={(e) => onJour(e.target.value)} {...{ [donnees.jour]: '' }} />
      <span className="pvs-libelle gdh-libelle" id={`${id}-d`}>{libelles.debut}</span>
      <ChoixHeure libelle={libelles.debut} etiquetteId={`${id}-d`} valeur={debut} minutes={minutes} plage={plage} role="debut" garder={garder} donnees={donnees.debut} desactive={desactive} onChange={onDebut} />
      <span className="pvs-libelle gdh-libelle" id={`${id}-f`}>{libelles.fin}</span>
      <ChoixHeure libelle={libelles.fin} etiquetteId={`${id}-f`} valeur={fin} minutes={minutes} plage={plage} role="fin" garder={garder} donnees={donnees.fin} desactive={desactive} onChange={onFin} />
    </div>
  );
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme. */
export const CSS_GRILLE_DATE_HEURES = `
.gdh{display:grid;grid-template-columns:max-content minmax(0,1fr);align-items:center;column-gap:12px;row-gap:10px;min-width:0}
.gdh .gdh-libelle{margin:0;white-space:nowrap;text-align:left}
.gdh .gdh-date{box-sizing:border-box;width:100%;max-width:none;min-width:0;height:44px;margin:0}
.gdh .chh{min-width:0;width:100%}
@media (max-width:600px){.gdh{grid-template-columns:minmax(0,1fr);row-gap:4px}.gdh .gdh-libelle{margin-top:6px}}
`;
