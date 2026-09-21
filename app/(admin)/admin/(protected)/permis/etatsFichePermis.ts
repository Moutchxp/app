/**
 * LOT 1 (parité fiche permis) — SOURCE UNIQUE des états DÉRIVÉS de la fiche d'un permis (titres des familles + gate de clôture).
 *
 * Cette composition VIVAIT en ligne dans `ProjectionVue.renderDetail`. Elle est désormais appelée à DEUX endroits :
 *   · `FichePermisBlocs` (titres des blocs « Caractéristiques du permis » / « Bâtiments et projection » / « Planche cadastrale ») ;
 *   · `ProjectionVue` (le gate « Valider le permis — envoyer en Rattachement » a besoin de `comptesMere` et de `etatProj` DURCI).
 * L'extraire ici garantit qu'aucune des deux ne recalcule différemment (le défaut « mère verte sur sous-section rouge » qu'on corrige
 * partout). PUR (aucune I/O, aucune couleur) : elle ne fait que COMPOSER les modules purs déjà testés (etatFamilleProjection,
 * statutBatimentsProjection). AUCUN changement de règle par rapport à l'ancien in-line — copie fidèle, `ouvert` renommé `dossierId`.
 *
 * `etatPlancheLive` n'influe QUE sur `etatPlanche` : un appelant qui n'en a pas (ProjectionVue, côté clôture) passe `null` et ignore
 * `etatPlanche` — `comptesMere`/`etatMere`/`etatProj` sont identiques dans les deux cas.
 */
import {
  etatCaracteristiquesPermis,
  etatProjectionTitreDepuisComptes,
  etatPlancheTitre,
  type EtatTitreFamille,
  type ComptesCaracteristiquesPermis,
} from '../../../../lib/permis/etatFamilleProjection';
import { statutBatimentsProjection, type FraicheurBatimentsLive } from './statutBatimentsProjection';
import type { LigneProjectionAffichee } from './ProjectionRendu';

/** État LIVE remonté par les blocs ouverts (par dossier ; la garde d'appartenance `=== dossierId` est faite ici). */
export interface EtatsLiveFiche {
  enteteProjection: { ton: 'vert' | 'rouge'; texte: string } | null; // « Bâtiments et projection » ouvert (BlocTraceEmprise)
  comptesLive: ComptesCaracteristiquesPermis | null;                  // « Caractéristiques du permis » ouvert (CaracteristiquesBloc)
  fraicheurBat: FraicheurBatimentsLive | null;                        // durcissement client (à enregistrer / altitude à valider)
  etatPlancheLive: EtatTitreFamille | null;                           // « Planche cadastrale » ouverte (PlancheParcelles)
}

/** États DÉRIVÉS portés par la fiche : comptes de la mère + les trois titres de famille. */
export interface EtatsFiche {
  comptesMere: ComptesCaracteristiquesPermis; // BAT-2d — SOURCE des états ; consommé aussi par la clôture (nbCorpsNonEnregistres)
  etatMere: EtatTitreFamille;                 // titre « Caractéristiques du permis (saisie) »
  etatProj: EtatTitreFamille;                 // titre « Bâtiments et projection (emprise) » (DURCI si le bloc caractéristiques est ouvert)
  etatPlanche: EtatTitreFamille | null;       // titre « Planche cadastrale (parcelles) » ; null → titre nu
}

/** LOT 3-B — les seuls champs de ligne que consomme le calcul des états (SOUS-ENSEMBLE de LigneProjectionAffichee). En Analyse la ligne de file
 *  les porte tous ; en Rattachement on n'en fournit qu'une VUE dérivée des données SERVEUR (comptes du détail), jamais l'état de l'éditeur monté. */
export type RowEtatsFiche = Pick<LigneProjectionAffichee, 'nbBatiments' | 'nbCorpsSansAltitude' | 'nbBatimentsValide' | 'nbCorpsNonEnregistres' | 'nbCorpsSansAltValidee' | 'nbCorpsSansEmpriseValidee' | 'plancheEtat'>;
/** LOT 3-B — les trois badges de titre SEULS (sans comptesMere) : ce que la fiche affiche. `etatsFichePermis` en renvoie un SUR-ENSEMBLE. */
export type BadgesFiche = Pick<EtatsFiche, 'etatMere' | 'etatProj' | 'etatPlanche'>;

export function etatsFichePermis(dossierId: number, row: RowEtatsFiche | null, live: EtatsLiveFiche): EtatsFiche {
  const { enteteProjection, comptesLive, fraicheurBat, etatPlancheLive } = live;

  // BAT-2d — SOURCE UNIQUE : bloc OUVERT → comptes LIVE (mêmes données que le sous-titre) ; sinon REPLI sur les comptes de la file
  //   (ENR-1 : la base intègre `nbCorpsNonEnregistres`, fait SERVEUR → mère HONNÊTE bloc replié). Garde dossierId : jamais un autre permis.
  const comptesMere: ComptesCaracteristiquesPermis = (comptesLive && comptesLive.dossierId === dossierId)
    ? comptesLive
    : { dossierId, nbCartes: row?.nbBatiments ?? 0, nbSansAltitude: row?.nbCorpsSansAltitude ?? 0, nbBatimentsValide: row?.nbBatimentsValide ?? null, nbCorpsNonEnregistres: row?.nbCorpsNonEnregistres ?? 0 };
  const etatMereBase = etatCaracteristiquesPermis(comptesMere);

  // (C) — durcissement LIVE (bloc « Caractéristiques » ouvert). La base de la MÈRE reçoit `nbCorpsNonEnregistres: 0` pour ne pas DOUBLER
  //   le motif « à enregistrer » (compte serveur + noms du durcissement) : les noms le disent, en plus précis. Repli (fraicheurIci null) → base.
  const fraicheurIci = fraicheurBat && fraicheurBat.dossierId === dossierId ? fraicheurBat : null;
  const etatMere = fraicheurIci
    ? statutBatimentsProjection(etatCaracteristiquesPermis({ ...comptesMere, nbCorpsNonEnregistres: 0 }), { aEnregistrer: fraicheurIci.aEnregistrer, altitudeAValider: fraicheurIci.altitudeAValider })
    : etatMereBase;

  // ③ « Bâtiments et projection » : valeur LIVE (`enteteProjection`) quand le bloc est ouvert, sinon REPLI calqué sur estValidationAcquise
  //   (même règle que l'en-tête live). DURCI par la fraîcheur LIVE — sous-ensemble `altitudeModifiee` seul (la base compte DÉJÀ les altitudes
  //   jamais validées côté serveur → éviter le double-décompte). Bloc caractéristiques replié → fraicheurIci null → base inchangée.
  const etatProjBase = enteteProjection ?? etatProjectionTitreDepuisComptes(row?.nbBatiments ?? 0, row?.nbCorpsSansAltValidee ?? 0, row?.nbCorpsSansEmpriseValidee ?? 0);
  const etatProj = fraicheurIci
    ? statutBatimentsProjection(etatProjBase, { aEnregistrer: fraicheurIci.aEnregistrer, altitudeAValider: fraicheurIci.altitudeModifiee })
    : etatProjBase;

  // PL-ÉTAT — valeur LIVE remontée par la planche ouverte (porte le changement en attente → rouge), sinon REPLI sur l'état SAUVEGARDÉ de la
  //   ligne (row.plancheEtat) ; null (indisponible) → titre nu (jamais un faux « configuration automatique »).
  const etatPlanche: EtatTitreFamille | null = etatPlancheLive
    ?? (row?.plancheEtat ? etatPlancheTitre({ selectionValidee: row.plancheEtat.selectionValidee, changementEnAttente: false, cas: row.plancheEtat.cas }) : null);

  return { comptesMere, etatMere, etatProj, etatPlanche };
}
