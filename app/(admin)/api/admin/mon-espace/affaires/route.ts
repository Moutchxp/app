import { exigerMonEspace } from '../../../../../lib/mon-espace/garde';
import { lireMesAffaires } from '../../../../../lib/mon-espace/mesAffairesRepo';
import { aujourdhuiParis } from '../../../../../lib/location/suivi/suivi';

/**
 * 🔴 MON ESPACE, LOT 3 (Arno, 02/11/2026) — GET /api/admin/mon-espace/affaires : « mes affaires », LECTURE SEULE.
 * Gardée deux fois : `proxy.ts` (préfixe /api/admin/mon-espace, droit « mon_espace ») puis `exigerMonEspace` (droit relu en base). Le filtrage
 * est fait ICI, côté serveur : un collaborateur ne reçoit que ses ventes, sans la commission ni le taux d'un autre collègue ; un administrateur
 * reçoit tout. Jamais mise en cache.
 */
export const runtime = 'nodejs';
const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerMonEspace(request);
  if ('refus' in garde) return garde.refus;
  if (garde.auteurId === null) return Response.json({ erreur: 'ACCES_REVOQUE' }, { status: 403, headers: ENTETES });
  try {
    return Response.json({ etat: 'ok', data: await lireMesAffaires(garde.auteurId, aujourdhuiParis()) }, { headers: ENTETES });
  } catch (e) {
    console.error('[mon-espace] lecture', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible.' }, { status: 500, headers: ENTETES });
  }
}
