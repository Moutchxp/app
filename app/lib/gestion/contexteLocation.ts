/**
 * ══ 🔴🔴 FICHE COMMUNE OUVERTE DEPUIS LA TUILE LOCATION — AUCUN MAIL NE PART (règle d'Arno du 17/10/2026) ═══════════════
 *
 * « Seule différence quand la fiche est ouverte depuis la Location : aucune écriture ni réponse de mail (boutons Écrire /
 * Répondre / Transférer et composition absents). Les mails et l'historique restent consultables en lecture. Ce droit
 * est vérifié côté serveur aussi : une requête d'envoi venant du contexte Location est refusée. Dans la Gestion, rien
 * ne change. » (Arno)
 *
 * UNE REQUÊTE VIENT DE LA LOCATION quand :
 *   · elle porte l'en-tête `x-svav-contexte: location` (posé par la page de fiche de la Location sur ses appels), OU
 *   · son `Referer` est une page `/admin/location…` (le navigateur l'envoie de lui-même sur les appels de la page :
 *     l'application ne pose aucune politique « no-referrer »).
 * Les deux signaux se cumulent : il suffit d'un seul pour refuser. Une page de la Gestion ne porte ni l'un ni l'autre —
 * son comportement ne change donc pas d'un geste. MODULE PUR (aucune base), lu par la garde d'envoi et ses routes.
 */
export const ENTETE_CONTEXTE = 'x-svav-contexte';
export const CONTEXTE_LOCATION = 'location';

export const MOTIF_ENVOI_DEPUIS_LOCATION =
  'Depuis la tuile Location, la fiche est en lecture pour les mails : écrire, répondre ou transférer se fait depuis la Gestion.';

export function requeteDepuisLaLocation(request: Request): boolean {
  if ((request.headers.get(ENTETE_CONTEXTE) ?? '').trim().toLowerCase() === CONTEXTE_LOCATION) return true;
  const referer = request.headers.get('referer');
  if (referer === null || referer === '') return false;
  try {
    const chemin = new URL(referer).pathname;
    return chemin === '/admin/location' || chemin.startsWith('/admin/location/');
  } catch {
    return false;
  }
}

/** 403 : le compte peut avoir le droit d'envoyer, c'est le CONTEXTE (la tuile Location) qui l'interdit. */
export function refusEnvoiDepuisLocation(): Response {
  return Response.json({ erreur: MOTIF_ENVOI_DEPUIS_LOCATION, etat: 'refus', motif: MOTIF_ENVOI_DEPUIS_LOCATION }, { status: 403 });
}
