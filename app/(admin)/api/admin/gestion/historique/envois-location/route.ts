import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { envoisDuBien } from '../../../../../../lib/location/mailNouvelleLocationRepo';

/**
 * ══ LES ENVOIS « NOUVELLE LOCATION » (ADHOC & MONGA) D'UN BIEN, POUR SON HISTORIQUE (Arno, 21/10/2026) ═══════════════════
 *
 *   · GET ?lot=<id>   → { etat: 'ok', envois: EnvoiDuBien[] }
 *
 * 🔒 LECTURE SEULE, au droit « Gestion » (l'Historique du bien est un écran de la Gestion).
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const brut = new URL(request.url).searchParams.get('lot') ?? '';
  if (!/^[1-9]\d{0,15}$/.test(brut) || !Number.isSafeInteger(Number(brut))) {
    return Response.json({ etat: 'refus', motif: 'Demande incomplète : le bien manque.' }, { status: 400, headers: ENTETES });
  }
  try {
    return Response.json({ etat: 'ok', envois: await envoisDuBien(Number(brut)) }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/historique/envois-location] lecture impossible', e);
    return Response.json({ etat: 'erreur' }, { status: 503, headers: ENTETES });
  }
}
