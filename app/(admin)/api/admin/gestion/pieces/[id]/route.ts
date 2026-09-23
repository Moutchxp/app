import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { lirePieceAServir } from '../../../../../../lib/gestion/carteRepo';
import { recuperer } from '../../../../../../lib/stockage';

/**
 * /api/admin/gestion/pieces/[id] (lot 4c) — LES OCTETS D'UNE PIÈCE JOINTE, servis PAR L'APPLICATION.
 *
 * ⚠️ AUCUNE URL DE STOCKAGE NE SORT D'ICI, et ce n'est pas une préférence d'architecture : c'est la même décision que
 * pour les certificats (22/09/2026), pour les deux mêmes raisons.
 *   1. Une URL signée porte l'ENDPOINT S3 (en développement `localhost:9000`) : injoignable dès qu'on consulte l'écran
 *      ailleurs que depuis le Mac — tunnel, 4G, et demain la production si l'endpoint reste interne.
 *   2. Une URL signée est un LAISSEZ-PASSER TRANSMISSIBLE, valable pendant toute sa durée de vie, vers la pièce jointe
 *      d'un locataire — bail, RIB, constat, certificat médical. Servir par l'application replace le contrôle d'accès à
 *      CHAQUE ouverture : le droit `gestion` est relu en base à chaque requête, et un droit retiré ferme la porte
 *      immédiatement, y compris sur un lien déjà copié.
 *
 * `private, no-store` : aucun cache partagé (proxy, tunnel, CDN) ne conserve ces octets, et rien n'atterrit sur disque
 * — y compris sur les réponses d'ERREUR, qu'un navigateur peut enregistrer SOUS LE NOM DU FICHIER attendu (incident du
 * 22/09 : un 401 rendait un JSON de 29 octets là où l'on attendait un `.png`).
 *
 * `inline` par défaut (on consulte sans rien enregistrer) ; `?telecharger=1` bascule en `attachment` avec le MÊME nom.
 * Runtime Node (driver pg + client S3).
 */
export const runtime = 'nodejs';

const CACHE_PRIVE = 'private, no-store';
/** Type par défaut : un type inconnu ne doit pas être INTERPRÉTÉ par le navigateur (pas d'exécution d'un HTML piégé). */
const TYPE_PAR_DEFAUT = 'application/octet-stream';

type Contexte = { params: Promise<{ id: string }> };

function erreur(message: string, status: number): Response {
  return Response.json({ erreur: message }, { status, headers: { 'Cache-Control': CACHE_PRIVE } });
}

/** Même en-tête de cache sur le refus de la garde, sans toucher ni à son statut ni à son corps. */
function sansCache(reponse: Response): Response {
  const entetes = new Headers(reponse.headers);
  entetes.set('Cache-Control', CACHE_PRIVE);
  return new Response(reponse.body, { status: reponse.status, statusText: reponse.statusText, headers: entetes });
}

/** Anti-injection d'en-tête : guillemets, antislashs et retours de ligne ne franchissent pas un `Content-Disposition`. */
function disposition(nomFichier: string, telechargement: boolean): string {
  const nom = (nomFichier || 'piece-jointe').replace(/[\r\n"\\]/g, '_').trim();
  return `${telechargement ? 'attachment' : 'inline'}; filename="${nom}"`;
}

export async function GET(request: Request, ctx: Contexte): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return sansCache(refus);

  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return erreur('Pièce inconnue.', 400);

  try {
    const piece = await lirePieceAServir(id);
    // Pièce inconnue ET pièce jamais déposée donnent le MÊME 404 : la réponse ne renseigne pas sur ce qui existe.
    if (!piece) return erreur('Cette pièce jointe n’est pas disponible.', 404);

    const octets = await recuperer(piece.cleStockage);
    const telechargement = new URL(request.url).searchParams.get('telecharger') === '1';
    return new Response(new Uint8Array(octets), {
      headers: {
        'Content-Type': piece.typeMime || TYPE_PAR_DEFAUT,
        'Content-Disposition': disposition(piece.nomFichier, telechargement),
        'Cache-Control': CACHE_PRIVE,
        // Le navigateur ne doit pas re-deviner le type : un `.txt` renommé ne devient pas du HTML exécutable.
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    console.error('[gestion/piece] lecture impossible', e);
    return erreur('Pièce jointe indisponible : le stockage n’a pas répondu.', 503);
  }
}
