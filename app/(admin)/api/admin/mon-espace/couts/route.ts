import { exigerMonEspace } from '../../../../../lib/mon-espace/garde';
import { peutVoirCouts } from '../../../../../lib/mon-espace/compteRepo';
import { lireDonneesGlobal } from '../../../../../lib/transaction/donneesGlobal';
import { aujourdhuiParis } from '../../../../../lib/location/suivi/suivi';
import { MOTIF_COUTS } from '../../../../../lib/mon-espace/couts';

/**
 * 🔴 MON ESPACE « LES COÛTS » (Arno, 03/11/2026, lot C1) — GET /api/admin/mon-espace/couts : les données de « Coûts globaux » (celles du Suivi CA
 * › CA global, `lireDonneesGlobal`, la même lecture), LECTURE SEULE. Gardée trois fois : `proxy.ts` (préfixe /api/admin/mon-espace, droit
 * « mon_espace »), `exigerMonEspace` (droit relu en base), puis `peutVoirCouts` : statut « Associé » (décision C1) ET administrateur (l'onglet suit
 * « Voir », le mode agence, décision C2) — 403 sinon, aucune donnée. Jamais mise en cache.
 */
export const runtime = 'nodejs';
const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerMonEspace(request);
  if ('refus' in garde) return garde.refus;
  if (garde.auteurId === null) return Response.json({ erreur: 'ACCES_REVOQUE' }, { status: 403, headers: ENTETES });
  try {
    if (!(await peutVoirCouts(garde.auteurId))) return Response.json({ etat: 'refus', motif: MOTIF_COUTS }, { status: 403, headers: ENTETES });
    return Response.json({ etat: 'ok', data: await lireDonneesGlobal(aujourdhuiParis(), { compromis: false }) }, { headers: ENTETES });
  } catch (e) {
    console.error('[mon-espace] coûts', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible.' }, { status: 500, headers: ENTETES });
  }
}
