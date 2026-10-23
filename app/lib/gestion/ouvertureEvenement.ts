/**
 * ══ 🔴🔴 LA DATE D'OUVERTURE D'UN ÉVÉNEMENT = LA DATE (ET L'HEURE) DE SA CRÉATION (Arno, 23/10/2026, option A) ══════════════════
 *
 * « Un événement a pour date d'ouverture la date (et l'heure) de sa CRÉATION. Elle n'est plus saisie ni modifiable. Une date à
 * venir (passage d'un intervenant, rendez-vous) se note avec la carte “RDV intervention” de la frise. » — et accord explicite
 * d'Arno pour rendre non modifiable le champ « Date d'ouverture ».
 *
 * CE QUI L'A DÉCIDÉ : GES-2026-000010 avait son ouverture déplacée au 02/11/2026 (la date d'intervention prévue), et sa clôture
 * ne pouvait plus fermer la période sans être datée dans le futur.
 *
 * 🔴 LE VERROU EST UNIQUE, ET IL EST SQL : `sqlJamaisDansLeFutur` borne à `now()` toute date qui OUVRE (l'ouverture d'un
 * événement, une carte Ouverture, une Réouverture), qu'elle vienne de l'écran, de l'API, d'un script ou d'un mail entrant. Un
 * garde (`ouvertureEvenement.test.ts`) refuse tout écrivain d'ouverture qui ne le porte pas. Module PUR : aucun import.
 */

export const MOT_OUVERTURE_NON_MODIFIABLE =
  'La date d’ouverture est celle de la création de l’événement : elle ne se modifie plus. '
  + 'Pour une date à venir, ajoutez une carte « RDV intervention ».';

/** L'aide sous la date de la carte Ouverture. Le lien qui la suit ouvre l'ajout d'une carte RDV intervention. */
export const AIDE_DATE_A_VENIR = 'Pour une date à venir, ajoutez une carte RDV intervention.';
export const MOT_LIEN_RDV = 'Ajouter une carte RDV intervention';

/** Ce qu'affiche le formulaire de création à la place de l'ancien champ. */
export const MOT_OUVERTURE_A_LA_CREATION = 'Ouverture : à la création de l’événement (date et heure posées automatiquement).';

/** La même chose, en court, dans la case de la date (formulaire de création). */
export const MOT_OUVERTURE_CREATION_COURT = 'à la création (automatique)';

/** Une date qui ouvre n'est JAMAIS dans le futur : `LEAST(expr, now())`. Aucun accent dans le SQL émis. */
export function sqlJamaisDansLeFutur(expr: string): string {
  return `LEAST(${expr}, now())`;
}

/** Le jour civil de Paris (`AAAA-MM-JJ`) d'un instant — celui de la création, pour juger une date de clôture saisie. */
export function jourParis(maintenant: Date = new Date()): string {
  return maintenant.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
}
