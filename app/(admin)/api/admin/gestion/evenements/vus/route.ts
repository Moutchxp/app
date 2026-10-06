import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { auteurDeLaRequete, cleCollaborateur } from '../../../../../../lib/gestion/auteur';
import { marquerEvenementsVus } from '../../../../../../lib/gestion/evenementVuRepo';

/**
 * ══ 🔴🔴 LOT VIGNETTE-EVENEMENT, POINT 3 — « J'AI VU CES ÉVÉNEMENTS » ════════════════════════════════════════════
 *
 * DEMANDE D'ARNO (06/10/2026) : « L'effet reste PAR COLLABORATEUR jusqu'à ce que CE collaborateur clique sur la
 * vignette, OU ouvre la fiche du bien concerné (par n'importe quel chemin), OU ouvre la vue de l'événement. Il ne
 * s'éteint pas chez un autre collaborateur. Il se rallume à la prochaine mise à jour Monga. »
 *
 * 🔴 UNE SEULE PORTE POUR LES TROIS CHEMINS, ET ELLE PREND UNE LISTE. Deux routes — une pour un événement, une
 * pour une fiche — auraient fini par écrire deux dates différentes, et l'effet se serait éteint ici sans
 * s'éteindre là. Un clic sur une vignette envoie un identifiant ; une fiche de bien envoie les siens.
 *
 * 🔴 ELLE N'ÉTEINT RIEN CHEZ PERSONNE D'AUTRE, par construction : la ligne écrite porte la clé de CE
 * collaborateur, et la table a pour clé primaire le couple (événement, collaborateur).
 *
 * 🔴 UN **POST**, ET NON UN EFFET DE BORD SUR UNE LECTURE. Marquer vu est une écriture : la cacher dans le GET de
 * la fiche l'aurait déclenchée à chaque rafraîchissement automatique, y compris sur un onglet laissé ouvert et
 * que personne ne regarde — c'est-à-dire exactement le cas où l'effet doit rester allumé.
 *
 * ⚠️ ELLE NE REND JAMAIS D'ERREUR POUR UN ÉVÉNEMENT DÉJÀ VU, ni quand la migration 316 manque : marquer vu est un
 * geste de confort, et une bannière d'erreur en travers de l'écran parce qu'on vient de cliquer une vignette
 * ferait bien plus de mal que l'effet qui reste allumé.
 *
 * 🔒 `exigerCompteActif`. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const corps = (await request.json().catch(() => ({}))) as { ids?: unknown };
  /* ⚠️ UNE LISTE BORNÉE : 200 au plus. Une fiche n'en porte jamais autant, et un appel fabriqué n'a pas à
     pouvoir demander une écriture de masse. */
  const bruts = Array.isArray(corps.ids) ? corps.ids.slice(0, 200) : [];
  const ids = bruts.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return Response.json({ etat: 'ok', marques: 0 });
  try {
    const auteur = await auteurDeLaRequete(request);
    const marques = await marquerEvenementsVus(ids, cleCollaborateur(auteur));
    return Response.json({ etat: 'ok', marques });
  } catch (e) {
    console.error('[gestion/evenements/vus] marquage impossible', e);
    return Response.json({ erreur: 'Marquage impossible : erreur interne du serveur.' }, { status: 503 });
  }
}
