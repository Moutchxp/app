import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { comptesBoite } from '../../../../../../lib/gestion/boiteRepo';
import { compterCorbeille } from '../../../../../../lib/gestion/corbeilleRepo';

/**
 * /api/admin/gestion/boite/comptes (lot 5-FUSION) — LES NOMBRES DE LA COLONNE D'ÉTIQUETTES.
 *
 * POURQUOI UNE ROUTE À PART, et pas trois nombres ajoutés à `/api/admin/gestion` : ce compte balaie tous les messages
 * de la boîte pour les regrouper par échange. L'écran partagé n'en a aucun besoin — le payer à chaque ouverture du
 * module ralentirait l'écran d'accueil pour une colonne qu'on n'affiche pas encore. Il n'est demandé qu'en entrant
 * dans la boîte en plein écran.
 *
 * Les trois nombres sortent d'UNE seule lecture (voir `comptesBoite`) : ils ne peuvent donc pas se contredire entre
 * eux. Les deux autres compteurs de la colonne — « À classer » et « Sans suite » — ne sont PAS recalculés ici : ils
 * viennent de `/api/admin/gestion`, c'est-à-dire du poste de tri lui-même. Un second calcul serait une seconde vérité.
 *
 * 🔒 `exigerCompteActif(request, 'gestion')`, `private, no-store`, runtime Node — comme toutes les lectures du module.
 * 🔒 LECTURE SEULE : `boiteRepo` n'émet que des SELECT.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  try {
    // LOT 5-BOITE-3 — la corbeille est comptée À CÔTÉ : elle ne sort pas du même regroupement (c'est une colonne de
    //   `gestion_fil`, pas un état de message). `null` = migration 251 absente ⇒ l'étiquette ne s'affiche pas du tout,
    //   plutôt qu'un zéro qui se lirait « la corbeille est vide ».
    const [comptes, corbeille] = await Promise.all([comptesBoite(), compterCorbeille()]);
    return Response.json({ ...comptes, corbeille }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    // Pas de catch muet : des compteurs à zéro feraient croire à une boîte vide. On dit que la lecture a échoué, et
    //   l'écran affiche alors les étiquettes SANS nombre plutôt qu'avec des nombres faux.
    console.error('[api/admin/gestion/boite/comptes] lecture impossible', e);
    return Response.json({ erreur: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}
