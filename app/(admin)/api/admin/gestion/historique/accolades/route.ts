import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { cibleDepuisTexte } from '../../../../../../lib/gestion/historique';
import { accoladesDuBien } from '../../../../../../lib/gestion/accoladesBienRepo';

/**
 * ══ 🔴🔴 LOT ACCOLADE-PARTOUT — LES ACCOLADES DE L'HISTORIQUE D'UN BIEN ═══════════════════════════════════════════════
 *
 *   · GET ?cible=lot-<clé>&fils=1,2,3   → { etat: 'ok', accolades: AccoladeAffichee[] }
 *
 * 🔒 LECTURE SEULE. Seules les conversations affichées sont lues (bornées à 300).
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const url = new URL(request.url);
  const c = cibleDepuisTexte(url.searchParams.get('cible'));
  if (c === null || c.sorte !== 'lot' || (c.cle ?? '').trim() === '') {
    return Response.json({ etat: 'cible_invalide' }, { status: 400, headers: ENTETES });
  }
  const fils = (url.searchParams.get('fils') ?? '').split(',').map((x) => Number(x.trim()))
    .filter((n) => Number.isSafeInteger(n) && n > 0);
  try {
    return Response.json({ etat: 'ok', accolades: await accoladesDuBien(c.cle as string, fils) }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/historique/accolades] lecture impossible', e);
    return Response.json({ etat: 'erreur' }, { status: 503, headers: ENTETES });
  }
}
