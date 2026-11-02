import { exigerMonEspace } from '../../../../../lib/mon-espace/garde';
import { empreinteMesAffaires } from '../../../../../lib/mon-espace/mesAffairesRepo';
import { empreinteAgence, MOTIF_AGENCE_ADMIN } from '../../../../../lib/mon-espace/agenceRepo';
import { estAgence } from '../../../../../lib/mon-espace/agence';

/**
 * 🔴 MON ESPACE, LOT 7 — GET /api/admin/mon-espace/empreinte : l'empreinte de « mes affaires » (les affaires visibles et leur version, le dernier
 * n° de leur journal). L'écran la demande toutes les 15 s et au retour sur l'onglet, et ne relit ses listes que si elle a changé. LECTURE SEULE ;
 * droit « Mon espace » (401 / 403 : l'écran dit « Reconnectez-vous »). Jamais mise en cache.
 * 🔴 LOT 10 — `?agence=…` : l'empreinte de toute la structure (administrateurs seulement, 403 sinon).
 */
export const runtime = 'nodejs';
const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerMonEspace(request);
  if ('refus' in garde) return garde.refus;
  if (garde.auteurId === null) return Response.json({ erreur: 'ACCES_REVOQUE' }, { status: 403, headers: ENTETES });
  const agence = new URL(request.url).searchParams.get('agence');
  if (agence !== null && !estAgence(agence)) return Response.json({ etat: 'refus', motif: 'Structure inconnue.' }, { status: 400, headers: ENTETES });
  try {
    if (agence !== null) {
      const e = await empreinteAgence(garde.auteurId, agence);
      return e === null ? Response.json({ etat: 'refus', motif: MOTIF_AGENCE_ADMIN }, { status: 403, headers: ENTETES }) : Response.json({ etat: 'ok', data: { empreinte: e } }, { headers: ENTETES });
    }
    return Response.json({ etat: 'ok', data: { empreinte: await empreinteMesAffaires(garde.auteurId) } }, { headers: ENTETES });
  } catch (e) {
    console.error('[mon-espace] empreinte', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible.' }, { status: 500, headers: ENTETES });
  }
}
