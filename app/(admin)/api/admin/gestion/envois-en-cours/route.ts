import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { envoisEnCours } from '../../../../../lib/gestion/fileEnvoiRepo';

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
    return Response.json({ etat: 'ok', lignes },
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    // Pas de catch muet : une liste vide se lirait « tout est parti », ce qui serait exactement le mensonge à
    //   ne pas faire sur un écran dont le rôle est de dire ce qui N'EST PAS parti.
    console.error('[gestion/envois-en-cours] lecture impossible', e);
    return Response.json({ etat: 'erreur', lignes: [] },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
