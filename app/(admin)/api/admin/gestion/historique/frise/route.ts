import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { cibleDepuisTexte, lireFiltres } from '../../../../../../lib/gestion/historique';
import { etendreCible, mailsDeLaFrise } from '../../../../../../lib/gestion/historiqueRepo';

/**
 * /api/admin/gestion/historique/frise — LOT HISTORIQUE-BIEN-17, POINT 2 : LES MAILS DE LA FRISE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEMANDE D'ARNO : une frise chronologique pleine largeur, « un trait vertical fin par MAIL REÇU », « un bloc
 * par MOIS avec dedans le TOTAL des mails du mois », et l'on défile « jusqu'au PREMIER mail du bien ».
 *
 * ═══ 🔴 POURQUOI UNE ROUTE À PART ═══════════════════════════════════════════════════════════════════════════════
 *
 * Le listing s'arrête à 100 mails ; le bien 421 en porte 326. Une frise bâtie sur la page n'aurait montré ni les
 * traits ni les totaux des deux tiers du courrier — et « jusqu'au premier mail du bien » aurait été faux de trois
 * ans. C'est exactement le raisonnement de la route sœur `/historique/pieces`, et le même précédent : le résumé
 * des pièces montrait 106 pièces sur 344 tant qu'il lisait la page.
 *
 * 🔴 ELLE LIT LES **MÊMES** FILTRES, par la MÊME fonction (`lireFiltres`), et le dépôt leur applique les MÊMES
 * conditions que le listing — c'est la demande d'Arno : « la frise suit les PARTIES cochées (mêmes mails que le
 * listing, même calcul, un seul code) ».
 *
 * 🔴 ET ELLE NE REND QUE QUATRE CHAMPS PAR MAIL : date, sens, expéditeur, objet. Ni extrait, ni pièces, ni
 * destinataires, ni événements, ni statut — on n'en dessine que des traits et des totaux.
 *
 * ⚠️ `page` ET `taille` SONT IGNORÉS : on veut la sélection ENTIÈRE. Le dépôt borne à 5 000 mails (quinze fois le
 * pire cas mesuré) et DIT quand il tronque, plutôt que de dessiner une frise qui commence au hasard.
 *
 * ⚠️ POURQUOI PAS UN CHAMP DE PLUS SUR `/historique` : cette réponse est demandée à chaque PAGE du fil (« Voir la
 * suite ») ; la frise, elle, ne change pas quand on tourne une page. Même raisonnement que `/pieces`.
 *
 * 🔒 MÊME DROIT QUE LA TUILE GESTION, relu en base à chaque appel. `private, no-store` : la réponse porte des
 * objets de courrier et des noms de personnes.
 *
 * 🔒 LECTURE SEULE : `mailsDeLaFrise` n'émet qu'un SELECT, et cette route n'appelle rien d'autre.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const url = new URL(request.url);
  const cible = cibleDepuisTexte(url.searchParams.get('cible'));
  if (cible === null) {
    return Response.json({ etat: 'cible_invalide' }, { status: 400, headers: ENTETES });
  }
  const filtres = lireFiltres(url.searchParams);

  try {
    const etendue = await etendreCible(cible, filtres);
    /* ⚠️ LES ÉTATS « sans_schema » ET « inconnue » SONT RENDUS TELS QUELS, EN 200 : aucun n'est une panne, et
       l'écran les connaît déjà — c'est le comportement des routes sœurs. */
    if (etendue.etat !== 'ok') return Response.json(etendue, { headers: ENTETES });

    const { mails, tronque } = await mailsDeLaFrise(etendue.data, filtres);
    return Response.json({ etat: 'ok', data: { mails, tronque } }, { headers: ENTETES });
  } catch (e) {
    /* Pas de catch muet : une liste vide dessinerait une frise plate, ce qui se lirait « ce bien n'a aucun
       courrier » — exactement le contraire de ce qui s'est passé. */
    console.error('[api/admin/gestion/historique/frise] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' },
      { status: 503, headers: ENTETES });
  }
}
