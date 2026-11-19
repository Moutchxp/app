'use client';

import { useEffect, useId, useState } from 'react';
import { ChoixHeure } from './ChoixHeure';
import { ListeChoix } from './ListeChoix';
import { dureeAffichee, dureeEntre, dureesCompatibles, DUREES_RDV_DEFAUT, finDepuisDebut, motDureeRdv, type DureesRdv, type PlageRdv } from '../../../../lib/location/minutesRdv';

/** Le libellé de la durée quand la fin, choisie à la main, ne tombe sur aucune durée proposée. */
export const LIBELLE_DUREE_PERSONNALISEE = 'Personnalisée';

/**
 * 🔴🔴 Arno (19/11/2026) — DATE ET HEURES D'UN RENDEZ-VOUS DU PRÉAVIS, l'une sous l'autre, symétriques : « Date » (moitié gauche) et « Durée »
 * (moitié droite) ; « Début » puis heure : minutes ; « Fin » puis heure : minutes. La colonne des LIBELLÉS est commune (même largeur, alignés à
 * gauche) ; le champ de la date a la largeur et la position de la liste des heures, le bloc « Durée » celles de la liste des minutes. Téléphone
 * (≤ 600 px) : chaque libellé au-dessus de son champ, la durée sous la date, aucun débordement. Pré-visite et état des lieux, fixer et déplacer.
 *
 * LA DURÉE (Arno, 19/11/2026) : les durées du réglage (15 min, 30 min, 45 min, 1 h ; 30 min d'office — migration 501). Dès que le début est choisi
 * (heure ET minutes), la fin = début + durée, recalculée à chaque changement du début ou de la durée. La fin reste modifiable : la durée affichée
 * devient celle qui correspond, ou « Personnalisée ». Seules les durées dont la fin respecte la plage (au plus tard 21h00) et les minutes du réglage
 * sont proposées. À l'ouverture d'un « Modifier / déplacer » : la durée du rendez-vous actuel, sa fin inchangée tant qu'on ne touche à rien.
 * Les libellés et les repères (`data-…`) sont ceux de chaque fenêtre, inchangés.
 */
export function GrilleDateHeures({ classe, donneesGrille, libelles, jour, onJour, min, max, debut, onDebut, fin, onFin, minutes, plage, garder, donnees, desactive,
  durees = DUREES_RDV_DEFAUT }: {
  classe: string; donneesGrille?: Record<string, string>;
  libelles: { date: string; debut: string; fin: string };
  jour: string; onJour: (v: string) => void; min?: string; max?: string;
  debut: string; onDebut: (v: string) => void; fin: string; onFin: (v: string) => void;
  minutes: readonly number[]; plage: PlageRdv; garder?: readonly string[];
  donnees: { jour: string; debut: string; fin: string }; desactive?: boolean;
  /** Les durées proposées et celle d'office (réglage 501). */
  durees?: DureesRdv;
}) {
  const id = useId();
  // la durée en cours : celle du créneau actuel (« Modifier / déplacer »), sinon celle d'office ; une fin changée à la main (ou posée par
  // « Dans 2 minutes ») la redéfinit
  const [choisie, setChoisie] = useState(() => dureeEntre(debut, fin) ?? durees.defaut);
  useEffect(() => {
    const e = dureeEntre(debut, fin);
    if (e !== null) setChoisie(e);
  }, [debut, fin]);
  const affichee = dureeAffichee(debut, fin, choisie, durees.durees);
  const compatibles = dureesCompatibles(debut, durees.durees, plage, minutes);
  const options = [
    ...compatibles.map((d) => ({ id: String(d), libelle: motDureeRdv(d) })),
    ...(affichee === 'personnalisee' ? [{ id: 'personnalisee', libelle: LIBELLE_DUREE_PERSONNALISEE }]
      : compatibles.includes(affichee) ? [] : [{ id: String(affichee), libelle: motDureeRdv(affichee) }]),
  ];
  /** La durée à garder pour ce début : la durée en cours si sa fin respecte la plage et les minutes, sinon la plus longue qui convient. */
  const dureePour = (v: string): number | null => {
    if (dureesCompatibles(v, [choisie], plage, minutes).length === 1) return choisie;
    const c = dureesCompatibles(v, durees.durees, plage, minutes);
    return c.length > 0 ? c[c.length - 1] : null;
  };
  const changerDebut = (v: string): void => {
    onDebut(v);
    if (v === '') return; // le début n'est pas complet : la fin attend
    const d = dureePour(v);
    if (d !== null) setChoisie(d);
    onFin(d === null ? '' : finDepuisDebut(v, d) ?? '');
  };
  const changerDuree = (x: string): void => {
    if (x === 'personnalisee') return;
    const d = Number(x);
    setChoisie(d);
    const f = finDepuisDebut(debut, d);
    if (f !== null) onFin(f); // sans début complet : la fin attend le début
  };
  return (
    <div className={`${classe} gdh-cadre`} {...donneesGrille}>
      <style>{CSS_GRILLE_DATE_HEURES}</style>
      <div className="gdh">
      <label className="pvs-libelle gdh-libelle" htmlFor={`${id}-j`}>{libelles.date}</label>
      <input id={`${id}-j`} className="gdh-date" type="date" value={jour} min={min} max={max} disabled={desactive} onChange={(e) => onJour(e.target.value)} {...{ [donnees.jour]: '' }} />
      <div className="gdh-duree" role="group" aria-labelledby={`${id}-du`} data-duree-rdv data-duree={affichee}>
        <span className="pvs-libelle gdh-libelle" id={`${id}-du`}>{'Durée *'}</span>
        <ListeChoix libelle="Durée" valeur={affichee === 'personnalisee' ? 'personnalisee' : String(affichee)} vide={null} desactive={desactive}
          donnees={{ 'data-duree-choix': '' }} options={options} onChange={changerDuree} />
      </div>
      <span className="pvs-libelle gdh-libelle" id={`${id}-d`}>{libelles.debut}</span>
      <ChoixHeure libelle={libelles.debut} etiquetteId={`${id}-d`} valeur={debut} minutes={minutes} plage={plage} role="debut" garder={garder} donnees={donnees.debut} desactive={desactive} onChange={changerDebut} />
      <span className="pvs-libelle gdh-libelle" id={`${id}-f`}>{libelles.fin}</span>
      <ChoixHeure libelle={libelles.fin} etiquetteId={`${id}-f`} valeur={fin} minutes={minutes} plage={plage} role="fin" garder={garder} donnees={donnees.fin} desactive={desactive} onChange={onFin} />
      </div>
    </div>
  );
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme.
   Quatre colonnes : libelle | heure (et la date) | « : » | minutes (et le bloc Duree) ; les listes de ChoixHeure s'y posent en sous-grille, d'ou les
   memes largeurs et positions d'une ligne a l'autre. Grille etroite (moins de 28rem : le formulaire de l'etat des lieux, en colonne) : la Duree
   passe sur sa propre ligne sous la Date, son libelle dans la colonne des libelles. Telephone : chaque libelle au-dessus de son champ. */
export const CSS_GRILLE_DATE_HEURES = `
.gdh-cadre{container-type:inline-size;min-width:0}
.gdh{display:grid;grid-template-columns:max-content minmax(0,1fr) auto minmax(0,1fr);align-items:center;column-gap:6px;row-gap:10px;min-width:0}
.gdh > .gdh-libelle{grid-column:1;margin:0 6px 0 0;white-space:nowrap;text-align:left}
.gdh .gdh-libelle{margin-top:0;margin-bottom:0;white-space:nowrap;text-align:left}
.gdh .gdh-date{grid-column:2;box-sizing:border-box;width:100%;max-width:none;min-width:0;height:44px;margin:0}
.gdh .gdh-duree{grid-column:4;display:grid;grid-template-columns:max-content minmax(0,1fr);align-items:center;column-gap:12px;min-width:0}
.gdh .chh{grid-column:2 / span 3;display:grid;grid-template-columns:subgrid;min-width:0;width:100%}
.gdh .chh-listes{grid-column:1 / -1;grid-template-columns:subgrid}
@container (max-width:28rem){
  .gdh .gdh-duree{grid-column:1 / -1;grid-template-columns:subgrid;column-gap:6px}
  .gdh .gdh-duree > .gdh-libelle{grid-column:1;margin-right:6px}
  .gdh .gdh-duree > .lch{grid-column:2 / -1;min-width:0}
  .gdh .gdh-date{grid-column:2 / -1}
}
@media (max-width:600px){
  .gdh{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);row-gap:4px}
  .gdh > .gdh-libelle,.gdh .gdh-date,.gdh .gdh-duree,.gdh .chh{grid-column:1 / -1}
  .gdh > .gdh-libelle{margin:6px 0 0}
  .gdh .gdh-duree{grid-template-columns:minmax(0,1fr);row-gap:4px;margin-top:6px}
  .gdh .gdh-duree > .gdh-libelle,.gdh .gdh-duree > .lch{grid-column:1 / -1;margin-right:0}
}
`;
