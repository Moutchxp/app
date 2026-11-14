import 'server-only';
import { avecPerimetreTest } from './perimetreTest';
import { perimetreDuGeste } from './preavisTestRepo';

/**
 * ══ 🔴🔴 Arno (14/11/2026, 473) — UNE REQUÊTE D'ÉCRITURE DANS LE PÉRIMÈTRE DU PRÉAVIS DE TEST QU'ELLE TOUCHE ═════════════════════════════
 * Lit, dans le corps (copie : la route le relit intacte), les occupations, les biens et la tâche visés ; s'ils sont d'un préavis de test,
 * TOUT le traitement de la requête (mails, tâches, agenda, relances) s'exécute dans son périmètre — les mails ne partent qu'au créateur du
 * test. Un test mêlé à de vrais biens : refus (403), rien n'est fait. Aucun test : la route telle quelle.
 */
const ids = (x: unknown): number[] => {
  const un = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,15}$/.test(v) ? Number(v) : NaN;
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  };
  return (Array.isArray(x) ? x : [x]).map(un).filter((n): n is number => n !== null).slice(0, 200);
};

export async function dansLePerimetreDuTest(request: Request, f: () => Promise<Response>, o: { tacheId?: number | null } = {}): Promise<Response> {
  const corps = (await request.clone().json().catch(() => null)) as Record<string, unknown> | null;
  const c = corps ?? {};
  const p = await perimetreDuGeste({
    occupationIds: [...ids(c.occupationIds), ...ids(c.occupationId)],
    lotIds: [...ids(c.lotIds), ...ids(c.lotId)],
    tacheIds: [...ids(c.tacheId), ...(o.tacheId ? [o.tacheId] : [])],
  });
  if (!p.ok) return Response.json({ etat: 'refus', motif: p.motif, erreur: p.motif }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
  return avecPerimetreTest(p.perimetre, f);
}
