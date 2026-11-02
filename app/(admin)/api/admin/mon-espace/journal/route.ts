import { exigerMonEspace } from '../../../../../lib/mon-espace/garde';
import { journalMonEspace } from '../../../../../lib/mon-espace/modificationRepo';

/**
 * 🔴 MON ESPACE, LOT 6 — GET /api/admin/mon-espace/journal?id=3 : l'historique des modifications d'une affaire (qui — nom figé —, quand, quoi,
 * avant → après), le journal existant de la tuile (en ajout seul, verrouillé en base), EN LECTURE SEULE ; pour ses négociateurs et les
 * administrateurs (403 sinon) ; un collaborateur n'y lit pas les commissions. Jamais mise en cache.
 */
export const runtime = 'nodejs';
const ENTETES = { 'Cache-Control': 'private, no-store' } as const;
const json = (corps: unknown, status = 200): Response => Response.json(corps, { status, headers: ENTETES });

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerMonEspace(request);
  if ('refus' in garde) return garde.refus;
  if (garde.auteurId === null) return json({ erreur: 'ACCES_REVOQUE' }, 403);
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return json({ etat: 'refus', motif: 'Affaire inconnue.' }, 400);
  try {
    const j = await journalMonEspace(garde.auteurId, id);
    return j === null ? json({ etat: 'refus', motif: 'Cet historique est réservé aux négociateurs de l’affaire et aux administrateurs.' }, 403) : json({ etat: 'ok', data: j });
  } catch (e) {
    console.error('[mon-espace] journal', e);
    return json({ etat: 'erreur', message: 'Lecture impossible.' }, 500);
  }
}
