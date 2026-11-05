import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { envoisDuBien } from '../../../../../../lib/location/mailNouvelleLocationRepo';
import { mailsAvisDuBien } from '../../../../../../lib/location/mailsPreavisSortieRepo';

/**
 * ══ LES ENVOIS « NOUVELLE LOCATION » (ADHOC & MONGA) D'UN BIEN, POUR SON HISTORIQUE (Arno, 21/10/2026) ═══════════════════
 *
 *   · GET ?lot=<id>   → { etat: 'ok', envois: EnvoiDuBien[], avis: MailAvisDuBien[] }
 *     Arno (05/11/2026) — `avis` : les mails de préavis et de sortie du bien (accusé aux locataires, information ADHOC), lus
 *     par le bien dans leur journal (457), jamais par une adresse.
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
    const [envois, avis] = await Promise.all([envoisDuBien(Number(brut)), mailsAvisDuBien(Number(brut))]);
    return Response.json({ etat: 'ok', envois, avis }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/historique/envois-location] lecture impossible', e);
    return Response.json({ etat: 'erreur' }, { status: 503, headers: ENTETES });
  }
}
