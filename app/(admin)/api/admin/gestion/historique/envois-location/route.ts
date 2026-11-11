import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { envoisDuBien } from '../../../../../../lib/location/mailNouvelleLocationRepo';
import { mailsAvisDuBien, mailsAvisDuLocataire, mailsAvisDuProprietaire } from '../../../../../../lib/location/mailsPreavisSortieRepo';

/**
 * ══ LES ENVOIS « NOUVELLE LOCATION » (ADHOC & MONGA) D'UN BIEN, POUR SON HISTORIQUE (Arno, 21/10/2026) ═══════════════════
 *
 *   · GET ?lot=<id>   → { etat: 'ok', envois: EnvoiDuBien[], avis: MailAvisDuBien[] }
 *     Arno (05/11/2026) — `avis` : les mails de préavis et de sortie du bien (accusé aux locataires, information ADHOC), lus
 *     par le bien dans leur journal (457), jamais par une adresse.
 *   · GET ?locataire=<clé de la fiche> → { etat: 'ok', envois: [], avis: MailAvisDuBien[] }
 *     🔴 Arno (10/11/2026, pré-visite, règle 7) — les mails Location (préavis, pré-visite, sortie) qui concernent CE locataire, lus par ses
 *     occupations dans le même journal (457).
 *   · GET ?proprietaire=<clé de la fiche> → { etat: 'ok', envois: [], avis: MailAvisDuBien[] }
 *     🔴 Arno (11/11/2026, lot 4) — les mails Location qui concernent CE propriétaire, lus par `proprietaire_ids` (467).
 *
 * 🔒 LECTURE SEULE, au droit « Gestion » (l'Historique du bien est un écran de la Gestion).
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const locataire = (new URL(request.url).searchParams.get('locataire') ?? '').trim();
  if (locataire !== '') {
    if (locataire.length > 200) return Response.json({ etat: 'refus', motif: 'Demande incomplète : le locataire manque.' }, { status: 400, headers: ENTETES });
    try {
      return Response.json({ etat: 'ok', envois: [], avis: await mailsAvisDuLocataire(locataire) }, { headers: ENTETES });
    } catch (e) {
      console.error('[gestion/historique/envois-location] lecture impossible (locataire)', e);
      return Response.json({ etat: 'erreur' }, { status: 503, headers: ENTETES });
    }
  }
  const proprietaire = (new URL(request.url).searchParams.get('proprietaire') ?? '').trim();
  if (proprietaire !== '') {
    if (proprietaire.length > 200) return Response.json({ etat: 'refus', motif: 'Demande incomplète : le propriétaire manque.' }, { status: 400, headers: ENTETES });
    try {
      return Response.json({ etat: 'ok', envois: [], avis: await mailsAvisDuProprietaire(proprietaire) }, { headers: ENTETES });
    } catch (e) {
      console.error('[gestion/historique/envois-location] lecture impossible (propriétaire)', e);
      return Response.json({ etat: 'erreur' }, { status: 503, headers: ENTETES });
    }
  }
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
