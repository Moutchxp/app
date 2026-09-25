import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../../lib/gestion/auteur';
import { depsReellesDepot } from '../../../../../../../lib/gestion/depotDriveReel';
import { deposerPieces, resumerDepot } from '../../../../../../../lib/gestion/depotDrive';
import { jetonPourRequete, messageAcces } from '../../../../../../../lib/gestion/jetonCollaborateur';
import { depotsDriveDisponibles } from '../../../../../../../lib/gestion/schema';

/**
 * POST /api/admin/gestion/pieces/[id]/drive (lot 5-PJ-B) — DÉPOSER UNE PIÈCE dans un dossier du Drive.
 *
 * 🔒 LE DROIT EST CELUI QUI PERMET DÉJÀ DE VOIR LA PIÈCE (`gestion`), relu à chaque requête. Déposer une copie dans
 * le Drive de l'agence n'expose rien de plus que d'ouvrir la pièce : c'est le même contenu, pour les mêmes personnes.
 *
 * 🔒 LE JETON GOOGLE RESTE AU SERVEUR, et aucune URL de stockage ne sort : seul le lien Drive (`webViewLink`) est
 * rendu au navigateur.
 *
 * 🔒 RIEN N'EST EFFACÉ : l'original reste dans l'application (l'effacement sera le lot D).
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';
type Contexte = { params: Promise<{ id: string }> };

function json(corps: unknown, status = 200): Response {
  return Response.json(corps, { status, headers: { 'Cache-Control': SANS_CACHE } });
}
function sansCache(reponse: Response): Response {
  const e = new Headers(reponse.headers);
  e.set('Cache-Control', SANS_CACHE);
  return new Response(reponse.body, { status: reponse.status, statusText: reponse.statusText, headers: e });
}

export async function POST(request: Request, ctx: Contexte): Promise<Response> {
  const barrage = await exigerCompteActif(request, 'gestion');
  if (barrage) return sansCache(barrage);

  const pieceId = Number((await ctx.params).id);
  if (!Number.isInteger(pieceId) || pieceId <= 0) return json({ erreur: 'Pièce inconnue.' }, 400);

  const corps = (await request.json().catch(() => ({}))) as { dossierId?: string };
  const dossierId = (corps.dossierId ?? '').trim();
  if (dossierId === '') return json({ erreur: 'Aucun dossier choisi.' }, 400);

  // La migration AVANT tout : sans mémoire des dépôts, on ne saurait pas empêcher un doublon au clic suivant.
  if (!await depotsDriveDisponibles()) {
    return json({ etat: 'sans_schema', message: 'Bientôt disponible — une mise à jour de la base est nécessaire.' }, 409);
  }
  // LOT 5-PJ-C — le dépôt part avec le jeton DU COLLABORATEUR : c'est Google qui applique ses droits, et le
  //   fichier lui appartient. Un collaborateur non connecté se voit proposer la connexion, jamais une erreur.
  const acces = await jetonPourRequete(request);
  if (acces.etat !== 'ok') {
    // LOT 5-PJ-C2 — aucun geste n'est proposé : soit l'administrateur doit finir la configuration, soit cette
    //   adresse n'a pas d'accès Drive dans l'organisation. Dans les deux cas, un message clair, non technique.
    return json({ etat: acces.acces.etat, message: messageAcces(acces.acces), detail: acces.motif }, 409);
  }

  try {
    const auteur = { ...await auteurDeLaRequete(request), compteGoogle: acces.compteGoogle };
    const issues = await deposerPieces(depsReellesDepot(), acces.jeton, [pieceId], dossierId, auteur);
    return json({ etat: 'ok', resultats: issues, resume: resumerDepot(issues) });
  } catch (e) {
    console.error('[gestion/piece/drive] dépôt impossible', e);
    return json({ etat: 'erreur', message: 'Le dépôt n’a pas abouti.' }, 503);
  }
}
