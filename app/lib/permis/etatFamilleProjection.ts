/**
 * RATT-1 — ÉTAT porté par la LIGNE DE TITRE des familles « Bâtiments et projection (emprise) » et « Caractéristiques du permis » de
 * l'onglet « Analyse et projection », visible SANS déplier (comme le bilan de complétude de `BlocCompletude`). PUR (client-safe,
 * aucune I/O). L'information est portée par le TEXTE ; `ton` n'est qu'un APPUI de couleur, jamais seul porteur (a11y). Aucune teinte
 * nouvelle : 'rouge'/'vert'/'neutre' → couleurs EXISTANTES de l'admin, mappées par l'appelant (var(--color-svv-red) / -green-ink / -muted).
 */
import { etatEnteteProjection } from './projectionBatiments'; // SOURCE UNIQUE : le repli de titre PARTAGE la règle de l'en-tête live (estValidationAcquise)

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
