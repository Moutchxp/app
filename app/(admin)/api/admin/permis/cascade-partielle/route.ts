import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { executerRelancePartielle, depsReellesRelancePartielle } from '../../../../../lib/veille/cascadePartielleRepo';

/**
 * CASC-3 — POST /api/admin/permis/cascade-partielle : ENVOI MANUEL d'une relance/annonce de cascade partielle, DANS LE FIL, VERBATIM
 * (objet + corps relus/modifiés par Arno). Aucun envoi automatique, aucun branchement ordonnanceur — geste explicite comme PART-3c.
 * Corps { demandeId, etape:'relance'|'annonce', rang?, objet, corps }. RÉSERVÉ ADMINISTRATEUR. Node.
 */
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const b = (await request.json().catch(() => ({}))) as { demandeId?: unknown; etape?: unknown; rang?: unknown; objet?: unknown; corps?: unknown };
  const demandeId = Number(b.demandeId);
  if (!Number.isInteger(demandeId) || demandeId <= 0) return Response.json({ erreur: 'demandeId invalide' }, { status: 400 });
  if (b.etape !== 'relance' && b.etape !== 'annonce') return Response.json({ erreur: 'etape invalide' }, { status: 400 });
  const rang = b.etape === 'relance' && Number.isInteger(b.rang) ? (b.rang as number) : null;
  const objet = typeof b.objet === 'string' ? b.objet : '';
  const corps = typeof b.corps === 'string' ? b.corps : '';
  try {
    const auteur = garde.auteurId === null ? 'admin' : `admin:${garde.auteurId}`;
    const r = await executerRelancePartielle(depsReellesRelancePartielle(), { demandeId, etape: b.etape, rang, objet, corps, auteur });
    return r.ok ? Response.json(r) : Response.json({ erreur: r.motif ?? 'envoi impossible' }, { status: 422 });
  } catch (e) {
    console.error('[permis/cascade-partielle] POST impossible', e);
    return Response.json({ erreur: 'envoi impossible' }, { status: 503 });
  }
}
