import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { listerCoproprietes } from '../../../../../../lib/gestion/coproprieteRepo';
import { filtrerCoproprietes } from '../../../../../../lib/gestion/copropriete';

/**
 * /api/admin/gestion/coproprietes/liste — LA LISTE « COPROPRIÉTÉS » (Arno, 16/11/2026, chantier « Fiche Copropriété », lot 4). Au droit
 * « Gestion », comme la fiche. LECTURE SEULE. `?q=` : la recherche (nom, adresses, syndic) ; `?max=` : un plafond (le groupe de la recherche).
 */
export const runtime = 'nodejs';
const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const u = new URL(request.url).searchParams;
  try {
    const toutes = filtrerCoproprietes(await listerCoproprietes(), (u.get('q') ?? '').slice(0, 200));
    const max = Number(u.get('max'));
    const lignes = Number.isSafeInteger(max) && max > 0 ? toutes.slice(0, max) : toutes;
    return Response.json({ etat: 'ok', data: { lignes: lignes.map(({ cherchable: _c, ...l }) => l), total: toutes.length } }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/coproprietes/liste] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503, headers: ENTETES });
  }
}
