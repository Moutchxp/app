import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { envoisEnCours, ignorerEchecEnvoi } from '../../../../../lib/gestion/fileEnvoiRepo';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import { envoiIgnoreDisponible } from '../../../../../lib/gestion/schema';

/**
 * /api/admin/gestion/envois-en-cours (lot ENVOI-ARRIERE-PLAN) — CE QUI N'EST PAS (ENCORE) PARTI.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 POURQUOI CETTE ROUTE EXISTE. Un mail mis en file quitte les Brouillons tout de suite et n'apparaîtra dans
 * « Envoyés » qu'une fois capturé par la relève — jusqu'à une minute plus tard. Entre les deux, sans cette route,
 * il n'est nulle part : on croit le clic perdu, et on réécrit le message.
 *
 * 🔴 ET SURTOUT : C'EST ELLE QUI PORTE « NON ENVOYÉ ». Un envoi qui a échoué est remis en brouillon et une alerte
 * part — mais l'alerte se lit dans une boîte mail, pas ici. La capsule rouge est ce qui le DIT à l'écran, à
 * l'endroit où l'on travaille.
 *
 * ⚠️ SANS LA MIGRATION 271, elle rend une liste vide et `disponible: false` : l'écran n'affiche alors rien du tout,
 * ce qui est juste — sans file, il n'y a pas d'envoi en attente.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const brut = new URL(request.url).searchParams.get('fil');
  const filId = brut === null ? null : Number(brut);
  const fil = filId !== null && Number.isInteger(filId) && filId > 0 ? filId : null;

  try {
    const lignes = await envoisEnCours(fil);
    /**
     * 🔴 LOT BANDEAU-ET-BROUILLONS — `ignorable` dit à l'écran s'il peut offrir le lien « Ignorer ». Sans la
     * migration 284, il vaut `false` et le bandeau est EXACTEMENT celui d'avant : un lien qui ne fait rien est
     * pire que pas de lien.
     */
    return Response.json({ etat: 'ok', lignes, ignorable: await envoiIgnoreDisponible() },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    // Pas de catch muet : une liste vide se lirait « tout est parti », ce qui serait exactement le mensonge à
    //   ne pas faire sur un écran dont le rôle est de dire ce qui N'EST PAS parti.
    console.error('[gestion/envois-en-cours] lecture impossible', e);
    return Response.json({ etat: 'erreur', lignes: [] },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}

/**
 * ══ 🔴🔴 IGNORER UN ÉCHEC — LOT BANDEAU-ET-BROUILLONS ═════════════════════════════════════════════════════════
 *
 * Arno : « un lien “Ignorer” qui masque le bandeau durablement pour cet échec, SANS RIEN SUPPRIMER ».
 *
 * 🔒 `PATCH`, ET NON `DELETE` : le verbe dit ce qui se passe. Rien n'est supprimé — la ligne de file garde sa
 * cause, son heure et ses destinataires ; on pose une date de mise en sourdine, et `{ ignorer: false }` la retire.
 *
 * 🔒 LA MÊME GARDE QUE LA LECTURE : le droit `gestion` est relu en base, comme pour toute autre requête. Et l'on
 * enregistre QUI a ignoré : un bandeau qui disparaît sans auteur est une décision sans responsable.
 */
export async function PATCH(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  try {
    const corps = (await request.json().catch(() => null)) as { id?: unknown; ignorer?: unknown } | null;
    const id = Number(corps?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return Response.json({ etat: 'invalide', message: 'Envoi inconnu.' }, { status: 400 });
    }
    // ⚠️ `ignorer` ABSENT VAUT « ignorer » : c'est le geste du lien, et le seul que l'écran envoie sans le dire.
    const ignorer = corps?.ignorer !== false;
    const fait = await ignorerEchecEnvoi(id, ignorer, await auteurDeLaRequete(request));
    return Response.json({ etat: fait ? 'ok' : 'sans_effet' },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[gestion/envois-en-cours] mise en sourdine impossible', e);
    return Response.json({ etat: 'erreur' }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
