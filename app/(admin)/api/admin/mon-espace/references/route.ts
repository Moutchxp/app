import { exigerMonEspace } from '../../../../../lib/mon-espace/garde';
import { estAdministrateur, referencesMonEspace } from '../../../../../lib/mon-espace/creationRepo';
import { aujourdhuiParis } from '../../../../../lib/location/suivi/suivi';

/**
 * 🔴 MON ESPACE, LOT 5 — GET /api/admin/mon-espace/references : ce que le formulaire de compromis propose depuis « Mon espace » (négociateurs
 * actifs, MES apporteurs, migrations appliquées). LECTURE SEULE ; droit « Mon espace » (proxy, puis relu en base). Jamais mise en cache.
 */
export const runtime = 'nodejs';
const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerMonEspace(request);
  if ('refus' in garde) return garde.refus;
  if (garde.auteurId === null) return Response.json({ erreur: 'ACCES_REVOQUE' }, { status: 403, headers: ENTETES });
  try {
    const aujourdhui = aujourdhuiParis();
    const administrateur = await estAdministrateur(garde.auteurId);
    const data = await referencesMonEspace(garde.auteurId, administrateur, aujourdhui);
    return Response.json({ etat: 'ok', data: { disponible: true, aujourdhui, titulaireId: garde.auteurId, administrateur, ...data } }, { headers: ENTETES });
  } catch (e) {
    console.error('[mon-espace] références', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible.' }, { status: 500, headers: ENTETES });
  }
}
