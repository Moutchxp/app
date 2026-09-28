import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { contexteClassement, mailsSansClassementManuel } from '../../../../../lib/gestion/classementBien';

/**
 * /api/admin/gestion/classement — LOT STATUT-PAR-MAIL : DE QUOI CLASSER UN MAIL DANS UN BIEN.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔒 LECTURE SEULE, ET UN SEUL VERBE. Cette route ne fait que RÉPONDRE à « à quels biens ce mail peut-il se
 * rattacher, et qui sont leurs parties à sa date ? ». Le geste d'ÉCRITURE reste celui qui existe déjà —
 * `POST /api/admin/gestion/rattachements` — avec son journal, son auteur et sa réversibilité. Ouvrir un second
 * chemin d'écriture ici aurait donné deux façons de poser un rattachement, donc un jour deux comportements.
 *
 * LES QUESTIONS :
 *   · `?message=N`            les biens proposables pour ce mail, la recommandation, les parties à SA date
 *   · `?fil=N&portee=1`       les mails de la conversation qui n'ont AUCUN classement manuel (portée « toute la
 *                             conversation ») — c'est la liste que l'écran annonce avant de valider
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
export const runtime = 'nodejs';

const SANS_CACHE = 'private, no-store';

/** Un identifiant lu dans une adresse. Refuse `0` et le non-numérique : inutile d'interroger pour rien. PUR. */
export function identifiant(brut: string | null): number | null {
  const s = (brut ?? '').trim();
  if (!/^[1-9]\d{0,15}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;

  const url = new URL(request.url);
  const message = identifiant(url.searchParams.get('message'));
  const fil = identifiant(url.searchParams.get('fil'));

  try {
    if (fil !== null && url.searchParams.get('portee') === '1') {
      return Response.json(
        { etat: 'ok', mails: await mailsSansClassementManuel(fil) },
        { headers: { 'Cache-Control': SANS_CACHE } });
    }
    if (message === null) {
      return Response.json({ etat: 'erreur', message: 'Mail non désigné.' },
        { status: 400, headers: { 'Cache-Control': SANS_CACHE } });
    }
    return Response.json({ etat: 'ok', contexte: await contexteClassement(message) },
      { headers: { 'Cache-Control': SANS_CACHE } });
  } catch (e) {
    // Pas de catch muet : une liste vide se lirait « aucun bien ne correspond », ce qui serait faux.
    console.error('[api/admin/gestion/classement] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' },
      { status: 503, headers: { 'Cache-Control': SANS_CACHE } });
  }
}
