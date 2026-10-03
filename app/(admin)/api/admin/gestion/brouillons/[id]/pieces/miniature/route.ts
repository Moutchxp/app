import 'server-only';
import { exigerCompteActif } from '../../../../../../../../lib/admin/garde';
import { genererMiniature, TYPE_MINIATURE } from '../../../../../../../../lib/gestion/miniature';
import { octetsDUnePieceDeBrouillon } from '../../../../../../../../lib/gestion/brouillonPieceOctets';

/**
 * /api/admin/gestion/brouillons/[id]/pieces/miniature?piece=N — LA VIGNETTE D'UNE PIÈCE DE BROUILLON.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * LOT EDITEUR-SIGNATURE-SOMBRE-ET-MINIATURES, POINT 2. Arno : « le transfert avec pièces cochées est parfait, mais
 * les pièces apparaissent en lignes de texte. Je veux le format MINIATURE, comme dans la lecture des mails, pour
 * vérifier ce que j'envoie. »
 *
 * 🔴 POURQUOI UNE ROUTE DE PLUS, ALORS QU'IL EN EXISTE UNE POUR LES PIÈCES REÇUES. Parce qu'une pièce de brouillon
 * n'est pas toujours une pièce reçue : un fichier pris sur le Mac ou dans le Drive n'a AUCUNE ligne dans
 * `gestion_piece`, donc aucun identifiant que `/pieces/[id]/miniature` saurait lire. Faire dépendre l'aperçu de
 * l'origine de la pièce aurait donné une grille à deux vitesses — des vignettes pour un transfert, des étiquettes
 * pour un message neuf — c'est-à-dire exactement ce qu'Arno demande de corriger.
 *
 * ⚠️ FABRIQUÉE À LA DEMANDE, ET NON CONSERVÉE — et c'est un choix, pas un oubli. La route des pièces reçues dépose
 * sa vignette sur le stockage objet et retient sa clé (migration 244) parce qu'un message se rouvre pendant des
 * années. Un BROUILLON vit quelques minutes et porte deux ou trois pièces : lui bâtir un magasin de vignettes
 * demanderait une colonne, une migration et un ménage, pour une image qu'on regarde une fois. Le navigateur, lui,
 * la garde une heure (`private, max-age`), ce qui suffit à ne pas la refabriquer à chaque frappe.
 *
 * 🔒 LE DROIT EST CELUI DU MODULE (`gestion`), relu à CHAQUE requête : une vignette montre le contenu, elle ne
 * mérite pas un régime plus souple que la pièce.
 *
 * 🔒 AUCUNE URL DE STOCKAGE NE SORT D'ICI, et la pièce est cherchée PAR SON BROUILLON : un identifiant de pièce
 * forgé ne peut pas aller lire la pièce d'un autre brouillon, parce que la requête les joint tous les deux.
 *
 * 🔴 UN REFUS NE PORTE PAS D'IMAGE ET N'EST JAMAIS MIS EN CACHE — incident du 22/09 : un 401 enregistré sous le nom
 * du fichier attendu, puis resservi à la place de la vignette.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Runtime Node : pilote `pg`, client S3, `sharp` et le rasteriseur PDF en WebAssembly.
 */
export const runtime = 'nodejs';

/** Dérivée et stable tant que la pièce ne change pas : une heure dans le navigateur, nulle part ailleurs. */
const CACHE_VIGNETTE = 'private, max-age=3600';
const SANS_CACHE = 'private, no-store';

type Contexte = { params: Promise<{ id: string }> };

function refus(message: string, status: number): Response {
  return Response.json({ erreur: message }, { status, headers: { 'Cache-Control': SANS_CACHE } });
}

export async function GET(request: Request, ctx: Contexte): Promise<Response> {
  const garde = await exigerCompteActif(request, 'gestion');
  if (garde) return garde;

  const brouillonId = Number((await ctx.params).id);
  const pieceId = Number(new URL(request.url).searchParams.get('piece') ?? '');
  if (!Number.isSafeInteger(brouillonId) || brouillonId <= 0) return refus('Brouillon inconnu.', 400);
  if (!Number.isSafeInteger(pieceId) || pieceId <= 0) return refus('Pièce inconnue.', 400);

  try {
    const lu = await octetsDUnePieceDeBrouillon(brouillonId, pieceId);
    /**
     * ⚠️ « PAS D'OCTETS » N'EST PAS UNE PANNE : une pièce dont le contenu est introuvable existe bel et bien, et
     * l'écran doit la MONTRER avec son état plutôt que de laisser une image cassée. On rend donc un 404 propre,
     * que la vignette traduit en étiquette de type — c'est la règle d'Arno : « jamais une vignette cassée ».
     */
    if (!lu.ok) return refus(lu.motif, 404);
    const v = await genererMiniature(lu.octets, lu.typeMime, lu.nomFichier);
    if (!v.ok) return refus(v.motif, 404);
    return new Response(new Uint8Array(v.octets), {
      status: 200,
      headers: { 'Content-Type': TYPE_MINIATURE, 'Cache-Control': CACHE_VIGNETTE },
    });
  } catch (e) {
    console.error('[gestion/brouillon/piece/miniature] échec', { brouillonId, pieceId, e });
    return refus('La vignette n’a pas pu être fabriquée.', 503);
  }
}
