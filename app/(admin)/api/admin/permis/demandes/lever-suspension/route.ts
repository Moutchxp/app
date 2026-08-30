import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { leverDossierPartiel } from '../../../../../../lib/permis/dossierPartielRepo';

/**
 * CASC-1 — POST /api/admin/permis/demandes/lever-suspension — LEVÉE MANUELLE du marqueur « dossier partiel » d'une demande (recours
 * d'Arno). Corps : `{ demandeId: number }`. Repose la reprise de la relance ordinaire ; AUCUN ENVOI, aucune écriture mairie. Renvoie
 * `{ ok, leve }` (leve=false si le marqueur n'était pas actif, ou migration 177 absente → NO-OP propre). RÉSERVÉ ADMINISTRATEUR. Node.
 */
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const { demandeId } = (await request.json().catch(() => ({}))) as { demandeId?: unknown };
  if (!Number.isInteger(demandeId) || (demandeId as number) <= 0) return Response.json({ erreur: 'demandeId invalide' }, { status: 400 });
  try {
    const par = garde.auteurId === null ? 'admin' : `admin:${garde.auteurId}`;
    const leve = await leverDossierPartiel(demandeId as number, par);
    return Response.json({ ok: true, leve });
  } catch (e) {
    console.error('[permis/demandes/lever-suspension] POST impossible', e);
    return Response.json({ erreur: 'levée impossible' }, { status: 503 });
  }
}
