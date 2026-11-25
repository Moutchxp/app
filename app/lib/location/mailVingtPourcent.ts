/**
 * ══ 🔴🔴 « ENVOYER UN MAIL » DEPUIS L'ÉCRAN « 20 % À RESTITUER » (Arno, 25/11/2026) — MODULE PUR. ═══════════════════════════════════════════════════
 *
 * Arno : « Règle maintenue : un mail par locataire (jamais deux locataires dans le même mail, jamais l'adresse d'un client visible d'un autre
 * client) » ; décision 2A du 25/11/2026 : un module par locataire, contrôle À L'ÉCRAN et AU SERVEUR (seulement pour les mails partis de cet écran).
 * La règle, ici, est la même pour les deux : un mail qui touche une adresse d'un locataire de la sortie
 *   · ne touche aucun AUTRE locataire de la sortie ;
 *   · et ne part qu'à ce locataire (ses propres adresses, aucune autre).
 * Les mails sans locataire (syndic, propriétaire(s), syndic avec propriétaire(s) en copie — modèles validés par Arno) ne sont pas concernés.
 * ⚠️ AUCUN IMPORT QUI TIRE `pg`.
 */

export const MOTIF_DEUX_LOCATAIRES = 'Un mail par locataire : ce message s’adresse à plusieurs locataires. Écrivez à chacun séparément.';
export const MOTIF_LOCATAIRE_PAS_SEUL = 'Un mail adressé à un locataire part à lui seul : retirez les autres destinataires (aucun client ne voit l’adresse d’un autre).';

const norme = (x: string): string => x.trim().toLowerCase();

/** Le refus (motif) ou `null`. `locataires` : les adresses de CHAQUE locataire de la sortie ; `destinataires` : À + Cc + Cci. PUR. */
export function refusUnLocataireParMail(locataires: readonly (readonly string[])[], destinataires: readonly string[]): string | null {
  const dest = [...new Set(destinataires.map(norme).filter((x) => x !== ''))];
  const touches = locataires.map((ad) => new Set(ad.map(norme).filter((x) => x !== ''))).filter((s) => dest.some((d) => s.has(d)));
  if (touches.length > 1) return MOTIF_DEUX_LOCATAIRES;
  if (touches.length === 1 && dest.some((d) => !touches[0].has(d))) return MOTIF_LOCATAIRE_PAS_SEUL;
  return null;
}

/** La marque qu'un mail est parti de l'écran « 20 % à restituer » (lue STRICTEMENT par le serveur : un entier positif). PUR. */
export function marqueVingtPourcent(x: unknown): { sortieId: number } | null {
  if (x === null || typeof x !== 'object') return null;
  const id = (x as { sortieId?: unknown }).sortieId;
  return typeof id === 'number' && Number.isInteger(id) && id > 0 ? { sortieId: id } : null;
}
