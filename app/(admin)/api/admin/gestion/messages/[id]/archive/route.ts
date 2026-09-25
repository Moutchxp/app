import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { lireEnTeteMessage, lirePiecesDuMessage } from '../../../../../../../lib/gestion/piecesRepo';
import { etatArchive, nomArchive, nomsSansDoublon } from '../../../../../../../lib/gestion/pieces';
import { fluxZip, type SourceZip } from '../../../../../../../lib/gestion/zip';
import { recuperer } from '../../../../../../../lib/stockage';

/**
 * /api/admin/gestion/messages/[id]/archive (lot 5-PJ-A) — TOUTES LES PIÈCES D'UN MESSAGE, EN UN .zip.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * PRODUITE EN FLUX, JAMAIS EN MÉMOIRE. Les pièces sont lues UNE À UNE et poussées dans la réponse au fil de l'eau :
 * une archive de 200 Mo ne fait jamais tenir 200 Mo dans le serveur, seulement la plus grosse pièce. Sans cela, deux
 * personnes cliquant en même temps sur un mail chargé suffiraient à mettre le serveur à genoux.
 *
 * SANS COMPRESSION (méthode « store »). Des JPEG et des PDF sont déjà compressés : les recompresser coûterait du
 * processeur pour ne rien gagner, et ferait tenir chaque pièce deux fois en mémoire.
 *
 * 🔴 LE PLAFOND DIT POURQUOI, il n'échoue pas. Au-delà de `PLAFOND_ARCHIVE_OCTETS`, la réponse est un refus LISIBLE
 * (avec le poids et le plafond), pas un téléchargement qui meurt après une minute d'attente.
 *
 * 🔴 UNE PIÈCE ILLISIBLE N'EMPORTE PAS L'ARCHIVE : elle est écartée, l'archive reste valide, et l'écart est journalisé
 * côté serveur. Une archive tronquée serait déclarée corrompue par l'extracteur, ce qui est bien pire.
 *
 * 🔴 LE DROIT (`gestion`) EST RELU À CHAQUE REQUÊTE, et aucune URL de stockage ne sort d'ici — mêmes règles que pour
 * une pièce seule (lot 4c).
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';

type Contexte = { params: Promise<{ id: string }> };

function refus(message: string, status: number): Response {
  return Response.json({ erreur: message }, { status, headers: { 'Cache-Control': SANS_CACHE } });
}

function sansCache(reponse: Response): Response {
  const entetes = new Headers(reponse.headers);
  entetes.set('Cache-Control', SANS_CACHE);
  return new Response(reponse.body, { status: reponse.status, statusText: reponse.statusText, headers: entetes });
}

/** Anti-injection d'en-tête : guillemets, antislashs et retours de ligne ne franchissent pas un `Content-Disposition`. */
function disposition(nom: string): string {
  const propre = (nom || 'pieces-jointes.zip').replace(/[\r\n"\\]/g, '_').trim();
  // `filename*` porte l'UTF-8 (accents) ; `filename` reste là pour les clients anciens, qui ignorent le premier.
  return `attachment; filename="${propre.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(propre)}`;
}

export async function GET(request: Request, ctx: Contexte): Promise<Response> {
  const barrage = await exigerCompteActif(request, 'gestion');
  if (barrage) return sansCache(barrage);

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return refus('Message inconnu.', 400);

  try {
    const entete = await lireEnTeteMessage(id);
    if (entete === null) return refus('Message inconnu.', 404);

    const pieces = await lirePiecesDuMessage(id);
    // Le même verdict que celui affiché sur le bouton : une seule règle, dans un seul module PUR, des deux côtés.
    const etat = etatArchive(
      pieces.map((p) => ({
        pieceId: p.pieceId, nomFichier: p.nomFichier, typeMime: p.typeMime,
        tailleOctets: p.tailleOctets, disponible: true, motifNonStocke: null,
      })),
    );
    if (!etat.possible) return refus(`Archive impossible : ${etat.motif}.`, 409);

    const noms = nomsSansDoublon(pieces.map((p) => p.nomFichier));
    const sources: SourceZip[] = pieces.map((p, i) => ({
      nom: noms[i],
      lire: async () => new Uint8Array(await recuperer(p.cleStockage)),
    }));

    const flux = fluxZip(sources, {
      surEcart: (nom, motif) => {
        console.error('[gestion/archive] pièce écartée de l’archive', { messageId: id, nom, motif });
      },
    });

    return new Response(flux, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': disposition(nomArchive(entete.recuLe, entete.objet)),
        'Cache-Control': SANS_CACHE,
        'X-Content-Type-Options': 'nosniff',
        // ⚠️ PAS DE `Content-Length`, DÉLIBÉRÉMENT — et c'est un arbitrage, pas un oubli. `tailleArchive` sait prévoir
        //   le poids exact (c'est le cadeau de la méthode « store »), ce qui donnerait une belle barre de progression.
        //   Mais une seule pièce écartée en cours de route — un objet manquant sur le stockage — rendrait l'annonce
        //   fausse, et le navigateur couperait le téléchargement d'une archive pourtant valide. Entre une barre de
        //   progression et une archive qui arrive, le choix est vite fait : transfert en « chunked ».
      },
    });
  } catch (e) {
    console.error('[gestion/archive] archive impossible', e);
    return refus('Archive indisponible : le stockage n’a pas répondu.', 503);
  }
}
