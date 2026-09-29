import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { comptesBoite } from '../../../../../../lib/gestion/boiteRepo';

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
    /**
     * ⚠️ LOT BOITE-INTERNE-CORBEILLE — LA CORBEILLE SORT DÉSORMAIS DU MÊME REGROUPEMENT QUE LES AUTRES.
     * Elle était comptée À CÔTÉ tant qu'elle vivait sur `gestion_fil` (corbeille interne du lot 5-BOITE-3) ; c'est
     * maintenant un état de MESSAGE, exactement comme le spam, et `comptesBoite` le rend avec les autres. Une
     * seule lecture, donc aucune chance que deux nombres de la même colonne se contredisent.
     * `null` = migration 275 absente ⇒ l'entrée ne s'affiche pas, plutôt qu'un zéro qui se lirait « elle est vide ».
     *
     * LOT LISTE-GMAIL — la sonde de l'étoile voyage avec les comptes : c'est la seule requête que la liste fait
     * déjà au chargement, et la sonde est mémoïsée (elle ne coûte qu'au premier appel du processus).
     */
    const [comptes, etoileDisponible] = await Promise.all([
      comptesBoite(), (await import('../../../../../../lib/gestion/schema')).etoileDisponible(),
    ]);
    return Response.json({ ...comptes, etoileDisponible },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    // Pas de catch muet : des compteurs à zéro feraient croire à une boîte vide. On dit que la lecture a échoué, et
    //   l'écran affiche alors les étiquettes SANS nombre plutôt qu'avec des nombres faux.
    console.error('[api/admin/gestion/boite/comptes] lecture impossible', e);
    return Response.json({ erreur: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}
