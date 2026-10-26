/**
 * ══ 🔴🔴 LOT MONGA-LIEN-PAR-LE-GESTE — « LA FRISE DE CET ÉVÉNEMENT A CHANGÉ, RELIS-LA » ═══════════════════════════════
 *
 * Module sans I/O : aucune base, aucun réseau, aucun React, aucun `pg` — importable depuis un `'use client'` (règle du
 * dépôt depuis l'incident du 24/09/2026). Même patron que `signalClassement.ts`.
 *
 * DEMANDE D'ARNO : « après un de ces gestes, la frise de l'événement concerné se recharge à l'écran sans avoir à
 * recharger la page ». Avant ce lot, `FriseAvancement` ne se lisait qu'à son ouverture : rattacher un mail Monga
 * depuis la file ou depuis la fenêtre d'un mail reliait sa référence en base, et la frise ouverte n'en savait rien.
 *
 * 🔴 `evenementId` À `null` = « une frise, je ne sais pas laquelle » : toutes celles qui sont affichées se relisent.
 * C'est le cas d'un geste qui ne connaît pas encore l'événement d'arrivée (une réponse de serveur incomplète).
 */

export type AuditeurFrise = (evenementId: number | null) => void;

const auditeurs = new Set<AuditeurFrise>();

/** S'ABONNER. Rend la fonction de désabonnement — le contrat d'un `useEffect`. */
export function ecouterFrise(a: AuditeurFrise): () => void {
  auditeurs.add(a);
  return () => { auditeurs.delete(a); };
}

/** ANNONCER, une fois l'écriture confirmée par le serveur. Un auditeur en faute ne fait pas taire les autres. */
export function signalerFrise(evenementId: number | null): void {
  for (const a of [...auditeurs]) {
    try { a(evenementId); } catch { /* une frise en faute ne fait pas taire les autres */ }
  }
}

/** Cette frise doit-elle se relire pour ce signal ? PUR. */
export function friseConcernee(signal: number | null, evenementId: number): boolean {
  return signal === null || Number(signal) === Number(evenementId);
}
