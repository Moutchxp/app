import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { genererMiniature, TYPE_MINIATURE } from '../../../../../../../lib/gestion/miniature';
import {
  lireEtatMiniature, memoriserEchecMiniature, memoriserMiniature,
} from '../../../../../../../lib/gestion/piecesRepo';
import { deposerMiniatureGestion, recuperer } from '../../../../../../../lib/stockage';

/**
 * /api/admin/gestion/pieces/[id]/miniature (lot 5-PJ-A) — LA VIGNETTE D'UNE PIÈCE JOINTE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * FABRIQUÉE PARESSEUSEMENT, PUIS CONSERVÉE. Au premier affichage, on lit la pièce, on en tire une vignette, on la
 * dépose sur le stockage objet et on retient sa clé (migration 244). Les fois suivantes, on ne fait que servir le
 * fichier dérivé : aucun décodage, aucune dépense.
 *
 * 🔴 UN ÉCHEC EST MÉMORISÉ, ET NE SE RETENTE PAS. Un PDF mal formé ou une image tronquée sont fréquents dans du vrai
 * courrier. Sans mémoire de l'échec, chaque ouverture du message relancerait le décodage d'un fichier qu'on sait
 * illisible — un défaut connu deviendrait une charge permanente.
 *
 * 🔴 LE DROIT EST LE MÊME QUE POUR LA PIÈCE ELLE-MÊME (`gestion`), relu à CHAQUE requête. Une vignette montre le
 * contenu : elle ne mérite pas un régime plus souple que l'original.
 *
 * 🔴 AUCUNE URL DE STOCKAGE NE SORT D'ICI — même règle que `/api/admin/gestion/pieces/[id]` depuis le lot 4c.
 *
 * CACHE : `private, max-age` est autorisé POUR LA VIGNETTE SEULE, et c'est la seule exception du module. Elle est
 * dérivée, sa clé change si on la refabrique, et c'est ce qui évite de redemander vingt images au moindre défilement.
 * `private` interdit tout cache PARTAGÉ (proxy, tunnel, CDN) : seul le navigateur de la personne connectée la garde.
 * Les réponses d'ERREUR, elles, ne sont JAMAIS mises en cache (incident du 22/09 : un 401 enregistré sous le nom du
 * fichier attendu).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Runtime Node : pilote `pg`, client S3, `sharp` et le rasteriseur PDF en WebAssembly.
 */
export const runtime = 'nodejs';

/** Une vignette est dérivée et immuable tant que sa clé ne change pas : une heure dans le navigateur, nulle part ailleurs. */
const CACHE_VIGNETTE = 'private, max-age=3600';
const SANS_CACHE = 'private, no-store';

type Contexte = { params: Promise<{ id: string }> };

/** Un refus ne porte pas d'image, et ne doit JAMAIS être gardé en cache sous le nom du fichier attendu. */
function refus(message: string, status: number): Response {
  return Response.json({ erreur: message }, { status, headers: { 'Cache-Control': SANS_CACHE } });
}

function sansCache(reponse: Response): Response {
  const entetes = new Headers(reponse.headers);
  entetes.set('Cache-Control', SANS_CACHE);
  return new Response(reponse.body, { status: reponse.status, statusText: reponse.statusText, headers: entetes });
}

function servir(octets: Buffer): Response {
  return new Response(new Uint8Array(octets), {
    headers: {
      'Content-Type': TYPE_MINIATURE,
      'Cache-Control': CACHE_VIGNETTE,
      // Le navigateur ne re-devine pas le type : ce que nous servons est un JPEG que NOUS avons fabriqué.
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function GET(request: Request, ctx: Contexte): Promise<Response> {
  const barrage = await exigerCompteActif(request, 'gestion');
  if (barrage) return sansCache(barrage);

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return refus('Pièce inconnue.', 400);

  try {
    const etat = await lireEtatMiniature(id);
    // Pièce inconnue et pièce jamais déposée donnent le MÊME 404 : la réponse ne renseigne pas sur ce qui existe.
    if (etat === null) return refus('Cette pièce jointe n’est pas disponible.', 404);

    // ── ① DÉJÀ FABRIQUÉE : on sert le fichier dérivé, sans rien décoder ──
    if (etat.etat === 'ok' && etat.cleMiniature !== null) {
      try {
        return servir(await recuperer(etat.cleMiniature));
      } catch {
        // La vignette a disparu du stockage : on ne ment pas, on la refait ci-dessous plutôt que de rendre une erreur.
      }
    }
    // ── ② ÉCHEC DÉJÀ CONSTATÉ : on ne retente pas. L'écran affiche son icône de type. ──
    if (etat.etat === 'echec') return refus('Pas de vignette pour cette pièce.', 404);

    // ── ③ PREMIER AFFICHAGE : on fabrique, on dépose, on retient ──
    const octets = await recuperer(etat.cleStockage);
    const issue = await genererMiniature(octets, etat.typeMime, etat.nomFichier);
    if (!issue.ok) {
      await memoriserEchecMiniature(id, issue.motif);
      return refus('Pas de vignette pour cette pièce.', 404);
    }
    const depot = await deposerMiniatureGestion(issue.octets, id);
    // Un dépôt impossible (stockage non configuré) n'empêche PAS de servir la vignette qu'on vient de fabriquer : on
    //   ne la retiendra simplement pas. Mieux vaut une image affichée et refaite demain qu'une carte vide aujourd'hui.
    if (depot.depose) await memoriserMiniature(id, depot.cle);
    return servir(issue.octets);
  } catch (e) {
    console.error('[gestion/miniature] fabrication impossible', e);
    return refus('Vignette indisponible.', 503);
  }
}
