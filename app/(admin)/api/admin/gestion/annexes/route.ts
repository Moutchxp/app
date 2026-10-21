import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { annexesDuLot, evenementsAnnexes } from '../../../../../lib/gestion/annexesBienRepo';

/**
 * ══ LES ANNEXES D'UN BIEN (Arno, 21/10/2026) — LECTURE SEULE, au droit « Gestion » ════════════════════════════════════════════════
 *   · GET ?lot=N            → { etat: 'ok', data: AnnexesDuLot | null } : ses annexes rattachées (les cases), son bien principal, et
 *                             à quoi il peut être rattaché ;
 *   · GET ?lot=N&journal=1  → { etat: 'ok', data: EvenementAnnexe[] } : ses détachements / rattachements (l'Historique).
 * Les GESTES (détacher, rattacher) passent par `/api/admin/gestion/annuaire/location` (`detacher-annexe`, `rattacher-annexe`).
 */
export const runtime = 'nodejs';
const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const url = new URL(request.url);
  const brut = url.searchParams.get('lot') ?? '';
  if (!/^[1-9]\d{0,15}$/.test(brut) || !Number.isSafeInteger(Number(brut))) {
    return Response.json({ etat: 'refus', motif: 'Demande incomplète : le bien manque.' }, { status: 400, headers: ENTETES });
  }
  try {
    const lot = Number(brut);
    const data = url.searchParams.get('journal') === '1' ? await evenementsAnnexes(lot) : await annexesDuLot(lot);
    return Response.json({ etat: 'ok', data }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/annexes] lecture impossible', e);
    return Response.json({ etat: 'erreur' }, { status: 503, headers: ENTETES });
  }
}
