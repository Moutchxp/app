'use client';

import { useEffect, useMemo, useState } from 'react';
import { ListeChoix } from './ListeChoix';
import { creneauxProposes, deuxChiffres, heureListeFr, PLAGE_RDV_DEFAUT, type PlageRdv } from '../../../../lib/location/minutesRdv';

/**
 * 🔴🔴 Arno (18-19/11/2026) — l'heure d'un rendez-vous du préavis : une liste des HEURES (« 10h », sur une seule ligne) et une liste des MINUTES
 * (00, 15, 30, 45 par défaut), dans la PLAGE du réglage : au début de 8h00 à 20h00 (20h : 00 seulement), à la fin de 8h15 à 21h00 (21h : 00
 * seulement). Deux ListeChoix (la liste verte de la Location, jamais de liste native) : clavier (flèches, Entrée), cibles de 44 px.
 * Un rendez-vous existant hors plage ou hors minutes (22h00, 09h53) n'est jamais arrondi : la saisie redevient incomplète, l'heure est à choisir
 * dans la plage — sauf les heures de `garder` (l'heure d'origine d'une fenêtre de tâche, l'exception « Dans 2 minutes » des préavis de test),
 * proposées en plus. `valeur` / `onChange` : « HH:MM », ou « » tant que l'heure ou la minute manque.
 */
export function ChoixHeure({ libelle, valeur, onChange, minutes, donnees, desactive, role = 'debut', plage = PLAGE_RDV_DEFAUT, garder = [], etiquetteId }: {
  libelle: string; valeur: string; onChange: (v: string) => void; minutes: readonly number[];
  /** L'attribut de repère de l'ensemble (ex. `data-edls-debut`). */
  donnees: string; desactive?: boolean;
  /** L'heure de DÉBUT ou de FIN (leurs bornes diffèrent). */
  role?: 'debut' | 'fin';
  plage?: PlageRdv;
  garder?: readonly string[];
  /** 🔴 Arno (19/11/2026) — l'étiquette est déjà écrite À CÔTÉ (grille Date / Début / Fin, fenêtre de tâche) : son id ; le choix ne répète pas le libellé. */
  etiquetteId?: string;
}) {
  const nom = libelle.replace(/[\s ]*\*$/, '');
  const cles = garder.join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const creneaux = useMemo(() => creneauxProposes(role, plage, minutes, garder), [role, plage.debutMin, plage.debutMax, plage.finMax, minutes.join(','), cles]);
  const decoupe = (v: string): [string, string] => {
    const h = /^(\d{2}):/.exec(v)?.[1] ?? '';
    const m = /^\d{2}:(\d{2})/.exec(v)?.[1] ?? '';
    const ms = creneaux.get(h);
    if (ms === undefined) return ['', ''];
    return [h, m !== '' && ms.includes(Number(m)) ? m : ''];
  };
  const [h, setH] = useState(() => decoupe(valeur)[0]);
  const [m, setM] = useState(() => decoupe(valeur)[1]);
  // la valeur change de l'extérieur (fin proposée = début + 1 h, reprise d'un rendez-vous) : les deux listes la suivent ; une heure hors plage ou
  // une minute hors réglage : la saisie redevient incomplète (à choisir dans la plage), jamais arrondie
  useEffect(() => {
    const [h2, m2] = decoupe(valeur);
    if (valeur !== '' || (h !== '' && m !== '')) { setH(h2); setM(m2); }
    if (valeur !== '' && (h2 === '' || m2 === '')) onChange('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valeur, creneaux]);
  const changer = (h2: string, m2: string): void => {
    // une minute qui n'existe pas pour la nouvelle heure (20h au début, 21h à la fin : 00 seulement) : à rechoisir
    const m3 = m2 !== '' && (creneaux.get(h2) ?? []).includes(Number(m2)) ? m2 : '';
    setH(h2); setM(m3); onChange(h2 !== '' && m3 !== '' ? `${h2}:${m3}` : '');
  };
  const minutesDeLHeure = h === '' ? [...new Set([...creneaux.values()].flat())].sort((a, b) => a - b) : creneaux.get(h) ?? [];
  const listes = (
      <div className="chh-listes">
        <ListeChoix libelle={`${nom} — heure`} valeur={h} vide="h" desactive={desactive} donnees={{ 'data-heure': '' }}
          options={[...creneaux.keys()].map((x) => ({ id: x, libelle: heureListeFr(x) }))} onChange={(x) => changer(x, m)} />
        <span className="chh-sep" aria-hidden="true">:</span>
        <ListeChoix libelle={`${nom} — minutes`} valeur={m} vide="min" desactive={desactive} donnees={{ 'data-minute': '' }}
          options={minutesDeLHeure.map((x) => ({ id: deuxChiffres(x), libelle: deuxChiffres(x) }))} onChange={(x) => changer(h, x)} />
      </div>
  );
  const valeurVue = h !== '' && m !== '' ? `${h}:${m}` : '';
  if (etiquetteId !== undefined) {
    return (
      <div className="chh" role="group" aria-labelledby={etiquetteId} {...{ [donnees]: '' }} data-choix-heure data-valeur={valeurVue}>
        <style>{CSS_CHOIX_HEURE}</style>
        {listes}
      </div>
    );
  }
  return (
    <fieldset className="chh" {...{ [donnees]: '' }} data-choix-heure data-valeur={valeurVue}>
      <style>{CSS_CHOIX_HEURE}</style>
      <legend className="pvs-libelle">{libelle}</legend>
      {listes}
    </fieldset>
  );
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme ; aucune animation.
   🔴 Arno (19/11/2026) — une heure ne passe JAMAIS sur deux lignes : chaque liste a sa largeur minimale, le texte ne se coupe pas ; c'est la ligne
   Debut / Fin qui passe a la ligne (grilles des formulaires) quand la place manque. */
export const CSS_CHOIX_HEURE = `
.chh{margin:0;padding:0;border:0;min-width:min(100%,10.75rem);display:flex;flex-direction:column;gap:4px}
.chh-listes{display:grid;grid-template-columns:minmax(5.25rem,1fr) auto minmax(4.75rem,1fr);align-items:center;gap:6px;min-width:0}
.chh .lch-champ,.chh .lch-champ>span,.chh .lch-option{white-space:nowrap}
.chh-sep{font-weight:800;color:var(--color-svv-ink)}
`;
