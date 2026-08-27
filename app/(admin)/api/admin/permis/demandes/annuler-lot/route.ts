import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { validerIdsLot } from '../../../../../../lib/sitadel/demande';
import { annulerLot } from '../../../../../../lib/sitadel/demandeRepo';

/**
 * D1 — POST /api/admin/permis/demandes/annuler-lot — ANNULATION EN MASSE des demandes NON ENVOYÉES (rend les permis au
 * réservoir). Corps : `{ ids: number[], autoriserPrete?: boolean }`. Per-item résilient → renvoie un COMPTE RENDU CHIFFRÉ
 * `{ annulees, permisLiberes, refusees:[{id,reference,statut,raison}] }` (jamais tout-ou-rien). 🔴 AUCUN DELETE, AUCUN ENVOI :
 * passe par le chemin d'annulation existant (`annulerLot` → UPDATE statut='annulee' + demande_dossier.actif=false + journal).
 * `autoriserPrete` (défaut false) : le geste de MASSE n'emporte JAMAIS une 'prete' ; seul le geste dédié le passe à true.
 * 'envoyee'/'close' sont TOUJOURS refusées (verrou serveur). RÉSERVÉ ADMINISTRATEUR (proxy fail-closed + garde). Runtime Node.
 */
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  let idsCtx: number[] | undefined;
  try {
    const corps = (await request.json().catch(() => ({}))) as { ids?: unknown; autoriserPrete?: unknown };
    const v = validerIdsLot(corps.ids);
    if (!v.ok) return Response.json({ erreur: v.erreur }, { status: 400 });
    idsCtx = v.ids;
    const autoriserPrete = corps.autoriserPrete === true;
    const auteur = garde.auteurId === null ? null : String(garde.auteurId);
    const rapport = await annulerLot(v.ids, auteur, autoriserPrete);
    return Response.json(rapport);
  } catch (e) {
    const err = e as { name?: unknown; message?: unknown; stack?: unknown; code?: unknown; detail?: unknown; constraint?: unknown; table?: unknown; column?: unknown };
    console.error('[permis/demandes/annuler-lot] POST annulation impossible (503)', {
      ids: idsCtx,
      name: err?.name, message: err?.message,
      code: err?.code, detail: err?.detail, constraint: err?.constraint, table: err?.table, column: err?.column,
      stack: err?.stack,
    });
    return Response.json({ erreur: 'annulation impossible' }, { status: 503 });
  }
}
