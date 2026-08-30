/**
 * CASC-1 — logique PURE du marqueur « dossier partiel » (la mairie a répondu PARTIELLEMENT ; Arno a réclamé les pièces manquantes).
 * Aucune I/O. La DONNÉE (date, familles, origine) est portée par la demande ; ici, seules les DÉCISIONS pures.
 */
export type OriginePartiel = 'outil' | 'declaree'; // réclamation ENVOYÉE par l'outil (PART-3a/3c) ou DÉCLARÉE hors outil (PART-3e)

/** Instantané du marqueur ACTIF, pour l'affichage (raison + date, jamais un silence). */
export interface EtatPartiel { le: string; familles: string[]; origine: OriginePartiel }

/**
 * Faut-il LEVER automatiquement le marqueur ? OUI seulement si le diagnostic de complétude est « complet » pour TOUS les permis
 * (dossiers actifs) de la demande. Un dossier jamais analysé (`null`) ou incomplet l'empêche. Une demande sans dossier → NON (rien à
 * conclure). C'est le SEUL critère de levée automatique ; la levée manuelle (Arno) est un geste distinct.
 */
export function doitLeverAuto(completudesParDossier: readonly (boolean | null)[]): boolean {
  return completudesParDossier.length > 0 && completudesParDossier.every((complet) => complet === true);
}

/** Phrase de suspension affichée à l'écran (raison + date + origine) — jamais un silence inexpliqué. */
export function libelleSuspension(etat: EtatPartiel): string {
  const origine = etat.origine === 'outil' ? 'réclamation envoyée' : 'relance déclarée';
  const familles = etat.familles.length > 0 ? ` (pièces : ${etat.familles.join(', ')})` : '';
  return `Relance ordinaire suspendue depuis le ${etat.le.slice(0, 10)} — ${origine}${familles}. La réclamation ciblée reste possible ; le cycle ordinaire reprendra quand le dossier sera complet.`;
}
