import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { doublonsAilleurs, syndicsDisponibles } from '../../../../../../lib/gestion/syndicRepo';

/**
 * ══ /api/admin/gestion/syndics/doublons?syndic=&prenom=&nom=&emails= — LOT SYNDIC-CONTACTS-ANTI-DOUBLON ═════════════
 *
 * Les contacts des AUTRES syndics qui portent le même e-mail (bloquant à l'écran) ou le même Prénom + NOM
 * (avertissement). Les doublons dans le syndic lui-même se vérifient à l'écran, sur le formulaire, qui fait foi.
 * ⚠️ Les noms et e-mails voyagent dans l'adresse de cette requête de LECTURE : ce sont ceux qu'on est en train de saisir
 * pour un contact professionnel de cabinet, pas des données de client.
 *
 * 🔒 LECTURE SEULE. Droit `gestion`. `private, no-store`. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const u = new URL(request.url).searchParams;
  const n = Number(u.get('syndic'));
  const syndicId = Number.isSafeInteger(n) && n > 0 ? n : null;
  const emails = (u.get('emails') ?? '').split(',').map((x) => x.trim()).filter((x) => x !== '').slice(0, 50);
  try {
    if (!(await syndicsDisponibles())) return Response.json({ etat: 'ok', emails: [], noms: [] }, { headers: ENTETES });
    const r = await doublonsAilleurs(syndicId, (u.get('prenom') ?? '').slice(0, 200), (u.get('nom') ?? '').slice(0, 200), emails);
    return Response.json({ etat: 'ok', ...r }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/syndics/doublons] lecture impossible', e);
    return Response.json({ etat: 'erreur', emails: [], noms: [] }, { status: 503, headers: ENTETES });
  }
}
