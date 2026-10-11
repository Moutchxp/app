import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { cibleDepuisTexte } from '../../../../../../lib/gestion/historique';
import { auteurDeLaRequete } from '../../../../../../lib/gestion/auteur';
import {
  mailsSortisDuSuivi, restaurerDansLeSuivi, sortirDuSuivi,
} from '../../../../../../lib/gestion/sortieSuiviRepo';

/**
 * ══ /api/admin/gestion/historique/sortis — « SORTIR DU SUIVI » ET « RESTAURER » (LOT INVARIANT-HISTORIQUE-INALTERABLE)
 *
 *   · GET  `?cible=lot-219` → `{ etat: 'ok', mails }` : les mails sortis du suivi de ce bien (ligne repliée en bas de
 *          l'historique). LECTURE SEULE.
 *   · POST `{ action: 'sortir' | 'restaurer', messageId, cible: 'lot-219', motif? }` : marque ou démarque les liens
 *          du mail vers ce bien. Rien n'est effacé ; tout est historisé (journal, date, auteur).
 *
 * 🔒 Droit `gestion` ; l'auteur vient de la SESSION. `private, no-store`.
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

function lotDe(brut: unknown): string | null {
  const c = cibleDepuisTexte(typeof brut === 'string' ? brut : null);
  return c !== null && c.sorte === 'lot' && (c.cle ?? '').trim() !== '' ? (c.cle as string) : null;
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const lot = lotDe(new URL(request.url).searchParams.get('cible'));
  if (lot === null) return Response.json({ etat: 'cible_invalide' }, { status: 400, headers: ENTETES });
  try {
    return Response.json({ etat: 'ok', mails: await mailsSortisDuSuivi(lot) }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/historique/sortis] lecture impossible', e);
    return Response.json({ etat: 'erreur' }, { status: 503, headers: ENTETES });
  }
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  let corps: Record<string, unknown>;
  try { corps = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ ok: false, erreur: 'Requête invalide.' }, { status: 422, headers: ENTETES }); }
  const lot = lotDe(corps.cible);
  const messageId = Number(corps.messageId);
  const action = corps.action;
  if (lot === null || !Number.isSafeInteger(messageId) || messageId <= 0 || (action !== 'sortir' && action !== 'restaurer')) {
    return Response.json({ ok: false, erreur: 'Mail, bien ou geste non désigné.' }, { status: 422, headers: ENTETES });
  }
  const auteur = await auteurDeLaRequete(request);
  try {
    const issue = action === 'sortir'
      ? await sortirDuSuivi({ messageId, lotCle: lot, auteur,
        motif: typeof corps.motif === 'string' && corps.motif.trim() !== '' ? corps.motif.trim().slice(0, 300) : null })
      : await restaurerDansLeSuivi({ messageId, lotCle: lot, auteur });
    if (!issue.ok) return Response.json({ ok: false, erreur: issue.motif }, { status: 409, headers: ENTETES });
    return Response.json({ ok: true, liens: issue.liens }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/historique/sortis] geste impossible', e);
    return Response.json({ ok: false, erreur: 'Le geste n’a pas pu être enregistré : la base n’a pas répondu.' },
      { status: 503, headers: ENTETES });
  }
}
