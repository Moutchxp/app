import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { lireMailsRecus, PAGE_RECEPTION, type FiltreReception } from '../../../../../lib/gestion/receptionRepo';
import { lirePartenairesInternes } from '../../../../../lib/gestion/partenaires';

/**
 * /api/admin/gestion/reception — LOT STATUT-PAR-MAIL : LA BOÎTE DE RÉCEPTION, UN MAIL PAR LIGNE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE N'EST PAS LA LISTE DES ÉCHANGES. La colonne de gauche de l'écran partagé montrait une file de CONVERSATIONS
 * à poser sur un événement ; elle montre désormais les derniers MAILS REÇUS, un par ligne. Une conversation de douze
 * messages y occupait UNE ligne, et ses onze autres mails étaient invisibles — or le classement se fait mail par
 * mail. Une liste d'échanges ne pouvait donc pas dire ce qui restait à classer.
 *
 * 🔒 MÊME DROIT QUE LA TUILE GESTION (`gestion`), relu en base à CHAQUE appel. `private, no-store` : ces réponses
 * portent des objets de mails et des noms de biens, elles ne se mettent en cache nulle part.
 *
 * 🔒 LECTURE SEULE : un seul verbe exporté, `GET`.
 *
 * LES QUESTIONS :
 *   · `?filtre=tous|a_classer|classes`  le filtre rapide de la colonne (défaut : `tous`)
 *   · `?avant=<ISO>&apres=<id>`         le curseur de pagination, rendu par la page précédente
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';

/** Un filtre lu dans une adresse. Toute valeur inconnue vaut « tous » : une liste abîmée doit montrer TOUT. */
export function lireFiltre(brut: string | null): FiltreReception {
  return brut === 'a_classer' || brut === 'classes' ? brut : 'tous';
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const url = new URL(request.url);
  const avant = (url.searchParams.get('avant') ?? '').trim();
  const apres = (url.searchParams.get('apres') ?? '').trim();
  /**
   * ⚠️ LE CURSEUR N'EST PRIS QU'EN ENTIER. Une date sans identifiant (ou l'inverse) perdrait un mail à chaque page
   * quand deux arrivent dans la même seconde — ce qui est la règle, pas l'exception, dans une boîte alimentée par
   * un logiciel. Un curseur incomplet vaut donc « pas de curseur » : on repart de la première page.
   */
  const curseur = avant !== '' && /^[1-9]\d{0,18}$/.test(apres) ? { recuLe: avant, messageId: apres } : null;

  try {
    const page = await lireMailsRecus(curseur, {
      filtre: lireFiltre(url.searchParams.get('filtre')),
      limite: PAGE_RECEPTION,
      // Le libellé d'un partenaire interne prime sur le nom porté par le mail, ici comme partout dans le module.
      partenaires: await lirePartenairesInternes().catch(() => []),
    });
    return Response.json({ etat: 'ok', ...page }, { headers: { 'Cache-Control': SANS_CACHE } });
  } catch (e) {
    // Pas de catch muet : une liste vide se lirait « aucun mail reçu », ce qui serait un mensonge.
    console.error('[api/admin/gestion/reception] lecture impossible', e);
    return Response.json(
      { etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' },
      { status: 503, headers: { 'Cache-Control': SANS_CACHE } });
  }
}
