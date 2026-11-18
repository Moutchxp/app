'use client';

import { useEffect, useState } from 'react';
import { ListeChoix } from './ListeChoix';
import { deuxChiffres, minuteDe } from '../../../../lib/location/minutesRdv';

/**
 * 🔴🔴 Arno (18/11/2026) — l'heure d'un rendez-vous du préavis : une liste des HEURES (00 à 23) et une liste des MINUTES, limitée au réglage
 * (00, 15, 30, 45 par défaut). Remplace le sélecteur natif qui proposait toutes les minutes. Deux ListeChoix (la liste verte de la Location,
 * jamais de liste native) : clavier (flèches, Entrée), cibles de 44 px. Un rendez-vous existant à 09h53 : l'heure « 09 » est reprise, la minute reste à choisir — rien n'est arrondi
 * en silence. `valeur` / `onChange` : « HH:MM », ou « » tant que l'heure ou la minute manque.
 */
export function ChoixHeure({ libelle, valeur, onChange, minutes, donnees, desactive }: {
  libelle: string; valeur: string; onChange: (v: string) => void; minutes: readonly number[];
  /** L'attribut de repère de l'ensemble (ex. `data-edls-debut`). */
  donnees: string; desactive?: boolean;
}) {
  const nom = libelle.replace(/[\s\u00a0]*\*$/, '');
  const decoupe = (v: string): [string, string] => {
    const h = /^(\d{2}):/.exec(v)?.[1] ?? '';
    const m = minuteDe(v);
    return [h, m !== null && minutes.includes(m) ? deuxChiffres(m) : ''];
  };
  const [h, setH] = useState(() => decoupe(valeur)[0]);
  const [m, setM] = useState(() => decoupe(valeur)[1]);
  // la valeur change de l'extérieur (fin proposée = début + 1 h, reprise d'un rendez-vous) : les deux listes la suivent
  useEffect(() => {
    const [h2, m2] = decoupe(valeur);
    if (valeur !== '' || (h !== '' && m !== '')) { setH(h2); setM(m2); }
    // une minute hors du réglage (rendez-vous existant à 09h53) : la saisie redevient incomplète — la minute est à choisir, jamais arrondie
    if (valeur !== '' && (h2 === '' || m2 === '')) onChange('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valeur]);
  const changer = (h2: string, m2: string): void => { setH(h2); setM(m2); onChange(h2 !== '' && m2 !== '' ? `${h2}:${m2}` : ''); };
  return (
    <fieldset className="chh" {...{ [donnees]: '' }} data-choix-heure data-valeur={h !== '' && m !== '' ? `${h}:${m}` : ''}>
      <style>{CSS_CHOIX_HEURE}</style>
      <legend className="pvs-libelle">{libelle}</legend>
      <div className="chh-listes">
        <ListeChoix libelle={`${nom} — heure`} valeur={h} vide="h" desactive={desactive} donnees={{ 'data-heure': '' }}
          options={Array.from({ length: 24 }, (_, i) => ({ id: deuxChiffres(i), libelle: `${deuxChiffres(i)} h` }))} onChange={(x) => changer(x, m)} />
        <span className="chh-sep" aria-hidden="true">:</span>
        <ListeChoix libelle={`${nom} — minutes`} valeur={m} vide="min" desactive={desactive} donnees={{ 'data-minute': '' }}
          options={minutes.map((x) => ({ id: deuxChiffres(x), libelle: deuxChiffres(x) }))} onChange={(x) => changer(h, x)} />
      </div>
    </fieldset>
  );
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; aucune animation. */
export const CSS_CHOIX_HEURE = `
.chh{margin:0;padding:0;border:0;min-width:0;display:flex;flex-direction:column;gap:4px}
.chh-listes{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:6px;min-width:0}
.chh-sep{font-weight:800;color:var(--color-svv-ink)}
`;
