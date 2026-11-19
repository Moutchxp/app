'use client';

import { useId, useState } from 'react';
import { ChoixHeure } from './ChoixHeure';
import { ListeChoix } from './ListeChoix';
import { dureeAffichee, dureeEntre, dureesCompatibles, DUREES_RDV_DEFAUT, finDepuisDebut, libelleDureeAutre, motDureeRdv, type DureesRdv, type PlageRdv } from '../../../../lib/location/minutesRdv';


/**
 * 🔴🔴 Arno (19/11/2026) — DATE ET HEURES D'UN RENDEZ-VOUS DU PRÉAVIS, l'une sous l'autre, symétriques : « Date » (moitié gauche) et « Durée »
 * (moitié droite) ; « Début » puis heure : minutes ; « Fin » puis heure : minutes. La colonne des LIBELLÉS est commune (même largeur, alignés à
 * gauche) ; le champ de la date a la largeur et la position de la liste des heures, le bloc « Durée » celles de la liste des minutes. Téléphone
 * (≤ 600 px) : chaque libellé au-dessus de son champ, la durée sous la date, aucun débordement. Pré-visite et état des lieux, fixer et déplacer.
 *
 * LA DURÉE (Arno, 19/11/2026) : les durées du réglage (15 min, 30 min, 45 min, 1 h ; 30 min d'office — migration 501). Dès que le début est choisi
 * (heure ET minutes), la fin = début + durée, recalculée à chaque changement du début ou de la durée. La fin reste modifiable : la durée affichée
 * devient celle qui correspond, ou « Autre (n min) ». Seules les durées dont la fin respecte la plage (au plus tard 21h00) et les minutes du réglage
 * sont proposées.
 * 🔴🔴 Arno (19/11/2026, correction de 14h30) — à la création ET à la modification, la durée affichée à l'ouverture est la durée d'office du TYPE
 * (pré-visite 30 min, état des lieux 1 h — réglages 503), jamais celle du rendez-vous actuel : « Autre (n min) » n'apparaît que lorsque la fin
 * est changée À LA MAIN et ne tombe sur aucun choix. En « Modifier / déplacer », le début et la fin du rendez-vous actuel restent posés tels quels
 * (rien ne change tant qu'on ne touche à rien : le « seul le collaborateur change » se reconnaît toujours) ; choisir un début recalcule la fin.
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
  // la durée en cours : celle d'office du type, à l'ouverture comme à la création ; un choix dans la liste ou une fin changée à la main la redéfinit
  const [choisie, setChoisie] = useState(durees.defaut);
  // la fin a-t-elle été changée À LA MAIN (liste de la fin) depuis le dernier choix du début ou de la durée ? Seule cette fin-là peut montrer
  // « Autre (n min) » ; jamais à l'ouverture
  const [finManuelle, setFinManuelle] = useState(false);
  // 🔴 Arno (19/11/2026) — la durée d'office de cette sorte fait toujours partie des choix : « Autre (…) » n'apparaît jamais à la création
  const choix = [...new Set([...durees.durees, durees.defaut])].sort((a, b) => a - b);
  const affichee: number | 'personnalisee' = finManuelle ? dureeAffichee(debut, fin, choisie, choix) : choix.includes(choisie) ? choisie : 'personnalisee';
  const compatibles = dureesCompatibles(debut, choix, plage, minutes);
  // « Autre (19 min) » (Arno, 19/11/2026 : remplace « Personnalisée ») : la durée réelle, seulement quand elle ne correspond à aucun choix
  const autre = (finManuelle ? dureeEntre(debut, fin) : null) ?? choisie;
  const options = [
    ...compatibles.map((d) => ({ id: String(d), libelle: motDureeRdv(d) })),
    ...(affichee === 'personnalisee' ? [{ id: 'personnalisee', libelle: libelleDureeAutre(autre) }]
      : compatibles.includes(affichee) ? [] : [{ id: String(affichee), libelle: motDureeRdv(affichee) }]),
  ];
  /** La durée à garder pour ce début : la durée en cours si sa fin respecte la plage et les minutes, sinon la plus longue qui convient. */
  const dureePour = (v: string): number | null => {
    if (dureesCompatibles(v, [choisie], plage, minutes).length === 1) return choisie;
    const c = dureesCompatibles(v, choix, plage, minutes);
    return c.length > 0 ? c[c.length - 1] : null;
  };
  const changerDebut = (v: string): void => {
    onDebut(v);
    if (v === '') return; // le début n'est pas complet : la fin attend
    setFinManuelle(false);
    const d = dureePour(v);
    if (d !== null) setChoisie(d);
    onFin(d === null ? '' : finDepuisDebut(v, d) ?? '');
  };
  const changerDuree = (x: string): void => {
    if (x === 'personnalisee') return;
    const d = Number(x);
    setChoisie(d);
    setFinManuelle(false);
    const f = finDepuisDebut(debut, d);
    if (f !== null) onFin(f); // sans début complet : la fin attend le début
  };
  const changerFin = (v: string): void => {
    onFin(v);
    setFinManuelle(true);
    const e = dureeEntre(debut, v);
    if (e !== null) setChoisie(e); // la durée qui correspond, ou « Autre (n min) »
  };
  // 🔴 Arno (19/11/2026) — à l'ouverture d'un « Modifier / déplacer », la fin actuelle ne correspond pas toujours à début + durée affichée : une
  // phrase discrète, sous « Fin », le dit — et seulement dans ce cas (elle disparaît dès qu'un début, une durée ou une fin est choisi)
  const finCalculee = finDepuisDebut(debut, choisie);
  const horairesConserves = !finManuelle && debut !== '' && fin !== '' && finCalculee !== fin;
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
      <ChoixHeure libelle={libelles.fin} etiquetteId={`${id}-f`} valeur={fin} minutes={minutes} plage={plage} role="fin" garder={garder} donnees={donnees.fin} desactive={desactive} onChange={changerFin} />
      {horairesConserves && <p className="gdh-horaires-conserves" data-horaires-conserves>Horaires actuels conservés : la fin sera recalculée dès que vous choisirez une heure de début.</p>}
      </div>
    </div>
  );
}

/* AUCUN ACCENT GRAVE DANS CE LITTERAL. Jetons du theme.
   Quatre colonnes : libelle | heure (et la date) | « : » | minutes (et le bloc Duree) ; les listes de ChoixHeure s'y posent en sous-grille, d'ou les
   memes largeurs et positions d'une ligne a l'autre. Grille etroite (moins de 28rem : le formulaire de l'etat des lieux, en colonne) : la Duree
   passe sur sa propre ligne sous la Date, son libelle dans la colonne des libelles. Telephone : chaque libelle au-dessus de son champ.
   🔴 Arno (19/11/2026, 15h04) — les listes « h » et « min » ne sont JAMAIS plus etroites que leur contenu (« 10h », « min », « 00 », fermees comme
   ouvertes : le menu ouvert prend la largeur du champ) : colonnes de 5.25rem et 4.75rem au moins. Une colonne trop etroite pour le libelle A COTE
   (moins de 22rem : la case de la frise, a 1440 et 1280 px comme au telephone) : le libelle AU-DESSUS, heure et minutes cote a cote sur toute la
   largeur — la regle du telephone. */
export const CSS_GRILLE_DATE_HEURES = `
.gdh-cadre{container-type:inline-size;min-width:0}
.gdh{display:grid;grid-template-columns:max-content minmax(5.25rem,1fr) auto minmax(4.75rem,1fr);align-items:center;column-gap:6px;row-gap:10px;min-width:0}
.gdh > .gdh-libelle{grid-column:1;margin:0 6px 0 0;white-space:nowrap;text-align:left}
.gdh .gdh-libelle{margin-top:0;margin-bottom:0;white-space:nowrap;text-align:left}
.gdh .gdh-date{grid-column:2;box-sizing:border-box;width:100%;max-width:none;min-width:0;height:44px;margin:0}
.gdh .gdh-duree{grid-column:4;display:grid;grid-template-columns:max-content minmax(0,1fr);align-items:center;column-gap:12px;min-width:0}
.gdh .chh{grid-column:2 / span 3;display:grid;grid-template-columns:subgrid;min-width:0;width:100%}
.gdh .chh-listes{grid-column:1 / -1;grid-template-columns:subgrid}
.gdh .gdh-horaires-conserves{grid-column:2 / -1;margin:-4px 0 0;font-size:.85rem;line-height:1.35;color:var(--color-svv-muted)}
@container (max-width:28rem){
  .gdh .gdh-duree{grid-column:1 / -1;grid-template-columns:subgrid;column-gap:6px}
  .gdh .gdh-duree > .gdh-libelle{grid-column:1;margin-right:6px}
  .gdh .gdh-duree > .lch{grid-column:2 / -1;min-width:0}
  .gdh .gdh-date{grid-column:2 / -1}
}
@container (max-width:22rem){
  .gdh{grid-template-columns:minmax(5.25rem,1fr) auto minmax(4.75rem,1fr);row-gap:4px}
  .gdh > .gdh-libelle,.gdh .gdh-date,.gdh .gdh-duree,.gdh .chh{grid-column:1 / -1}
  .gdh .gdh-horaires-conserves{grid-column:1 / -1}
  .gdh > .gdh-libelle{margin:6px 0 0}
  .gdh .gdh-duree{grid-template-columns:minmax(0,1fr);row-gap:4px;margin-top:6px}
  .gdh .gdh-duree > .gdh-libelle,.gdh .gdh-duree > .lch{grid-column:1 / -1;margin-right:0}
}
@media (max-width:600px){
  .gdh{grid-template-columns:minmax(5.25rem,1fr) auto minmax(4.75rem,1fr);row-gap:4px}
  .gdh > .gdh-libelle,.gdh .gdh-date,.gdh .gdh-duree,.gdh .chh{grid-column:1 / -1}
  .gdh .gdh-horaires-conserves{grid-column:1 / -1}
  .gdh > .gdh-libelle{margin:6px 0 0}
  .gdh .gdh-duree{grid-template-columns:minmax(0,1fr);row-gap:4px;margin-top:6px}
  .gdh .gdh-duree > .gdh-libelle,.gdh .gdh-duree > .lch{grid-column:1 / -1;margin-right:0}
}
`;
