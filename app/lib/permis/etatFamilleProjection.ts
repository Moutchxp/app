/**
 * RATT-1 — ÉTAT porté par la LIGNE DE TITRE des familles « Bâtiments et projection (emprise) » et « Caractéristiques du permis » de
 * l'onglet « Analyse et projection », visible SANS déplier (comme le bilan de complétude de `BlocCompletude`). PUR (client-safe,
 * aucune I/O). L'information est portée par le TEXTE ; `ton` n'est qu'un APPUI de couleur, jamais seul porteur (a11y). Aucune teinte
 * nouvelle : 'rouge'/'vert'/'neutre' → couleurs EXISTANTES de l'admin, mappées par l'appelant (var(--color-svv-red) / -green-ink / -muted).
 */
import { etatEnteteProjection } from './projectionBatiments'; // SOURCE UNIQUE : le repli de titre PARTAGE la règle de l'en-tête live (estValidationAcquise)
import type { CasBilanComparatif } from './comparatifParcelles'; // PL-ÉTAT — cas du bilan déclaré ↔ sélectionné (module pur), pour l'état de la ligne « Planche cadastrale »

export type TonTitreFamille = 'rouge' | 'vert' | 'neutre';
export interface EtatTitreFamille { texte: string; ton: TonTitreFamille }

/**
 * « Bâtiments et projection » : la projection du permis est-elle validée ? (`permis_projection` non vide). ROUGE tant qu'elle ne l'est
 * pas (rappel honnête que rien n'a encore été projeté/validé), VERT une fois validée.
 * ⚠️ Ce marqueur `permis_projection` est le JALON DOSSIER (« permis clôturé / envoyé en Rattachement »), PAS l'état de validation PAR
 *   BÂTIMENT. Pour dire si la PROJECTION est faite, utiliser `etatProjectionTitreDepuisComptes` (repli calqué sur estValidationAcquise) :
 *   il partage la MÊME règle que l'en-tête live du bloc (etatEnteteProjection), si bien que la section et la ligne disent une seule vérité.
 */
export function etatProjectionTitre(projectionValidee: boolean): EtatTitreFamille {
  return projectionValidee
    ? { texte: 'projection validée', ton: 'vert' }
    : { texte: 'projection non validée', ton: 'rouge' };
}

/**
 * REPLI du titre « Bâtiments et projection » AVANT ouverture du bloc (état LIVE non encore remonté) : calqué sur `estValidationAcquise`
 * via `etatEnteteProjection` — la MÊME fonction qui produit l'en-tête live. La section (ce repli), la ligne de la file
 * (`estValidationAcquise`) et l'en-tête ouvert (valeur live) partagent donc UNE SEULE règle : validation PAR BÂTIMENT (toutes altitudes
 * de sommet ET emprises validées). 0 bâtiment → ROUGE (jamais validé par vacuité). PUR (client-safe). Le jeton vert « Projection
 * validée » / rouge est byte-identique à l'en-tête (aucune 2e formulation à maintenir).
 */
export function etatProjectionTitreDepuisComptes(nbBatiments: number, nbSansAltitudeValidee: number, nbSansEmpriseValidee: number): EtatTitreFamille {
  return etatEnteteProjection(nbBatiments, nbSansAltitudeValidee, nbSansEmpriseValidee);
}

/**
 * « Caractéristiques du permis » : les altitudes de sommet des bâtiments DÉCLARÉS sont-elles renseignées ?
 * 🔴 CAS À NE PAS MENTIR (Arno) : AUCUN bâtiment déclaré → il n'y a RIEN à renseigner. On n'écrit ni « renseignées » (vert mensonger),
 *   ni « manquantes » (rouge mensonger) : libellé NEUTRE « aucun bâtiment déclaré ». ROUGE si ≥ 1 bâtiment déclaré est sans altitude ;
 *   VERT si tous les bâtiments déclarés ont leur altitude de sommet.
 */
export function etatAltitudesTitre(nbBatimentsDeclares: number, nbSansAltitude: number): EtatTitreFamille {
  if (nbBatimentsDeclares <= 0) return { texte: 'aucun bâtiment déclaré', ton: 'neutre' };
  if (nbSansAltitude > 0) {
    return { texte: `altitude${nbSansAltitude > 1 ? 's' : ''} manquante${nbSansAltitude > 1 ? 's' : ''} (${nbSansAltitude}/${nbBatimentsDeclares})`, ton: 'rouge' };
  }
  return { texte: `altitudes renseignées (${nbBatimentsDeclares} bâtiment${nbBatimentsDeclares > 1 ? 's' : ''})`, ton: 'vert' };
}

/**
 * PL-ÉTAT — « Planche cadastrale (parcelles) » : dire SANS déplier où en est la sélection de parcelles ET signaler tout écart avec les
 * parcelles DÉCLARÉES au permis. PUR (dérivé des états déjà connus, jamais recalculé). Règles (décision Arno) :
 *  · un CHANGEMENT à l'écran non encore appliqué → ROUGE « sélection modifiée — non validée » (il reste une action à faire) ;
 *  · sinon, une SÉLECTION VALIDÉE → VERT, avec la NUANCE : « mêmes parcelles » (correspondance) ou « parcelles différentes » (écart validé,
 *    laissé visible en clair — jamais masqué sous le vert) ;
 *  · sinon (configuration automatique, aucune action en attente) : NEUTRE « configuration automatique » si ça concorde (ou incomparable),
 *    ROUGE « écart avec les parcelles déclarées » sinon. C'est un SIGNALEMENT, jamais un blocage.
 * `cas` = bilan `comparerParcelles`/`bilanComparatif` (déclaré ↔ effectif) ; le détail par nature reste dans le bloc déplié.
 */
export function etatPlancheTitre(p: { selectionValidee: boolean; changementEnAttente: boolean; cas: CasBilanComparatif }): EtatTitreFamille {
  if (p.changementEnAttente) return { texte: 'sélection modifiée — non validée', ton: 'rouge' };
  if (p.selectionValidee) {
    return p.cas === 'correspondance'
      ? { texte: 'validée — mêmes parcelles que le permis', ton: 'vert' }
      : { texte: 'validée — parcelles différentes du permis', ton: 'vert' };
  }
  return (p.cas === 'correspondance' || p.cas === 'impossible')
    ? { texte: 'configuration automatique', ton: 'neutre' }
    : { texte: 'écart avec les parcelles déclarées au permis', ton: 'rouge' };
}
