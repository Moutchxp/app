import 'server-only';
import { exigerCompteActif } from '../../../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../../../lib/gestion/auteur';
import { verifierConflit } from '../../../../../../../../lib/gestion/syndicRepo';

/**
 * ══ /api/admin/gestion/coproprietes/conflits/[id]/verifier — LOT COPRO-PARCELLE-ALERTE-UNIQUE-ET-CONFLIT-SYNDICS ════
 *
 *   · POST « Vérifié, pas d'erreur » : le conflit de parcelle est marqué vérifié (qui, quand — historisé, jamais
 *          effacé) ; la pastille des deux cartes disparaît. Accord d'Arno pour ce masquage, qu'il déclenche lui-même.
 *
 * 🔒 Droit `gestion` ; l'auteur vient de la SESSION. `private, no-store`. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ erreur: 'Conflit non désigné.' }, { status: 422, headers: ENTETES });
  try {
    const r = await verifierConflit(id, await auteurDeLaRequete(request));
    if (!r.ok) return Response.json({ erreur: r.motif }, { status: 404, headers: ENTETES });
    return Response.json({ ok: true }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/coproprietes/conflits/%d/verifier] impossible', id, e);
    return Response.json({ erreur: 'Enregistrement impossible : la base n’a pas répondu.' }, { status: 503, headers: ENTETES });
  }
}
