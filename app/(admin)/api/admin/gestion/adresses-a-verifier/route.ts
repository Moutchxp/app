import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import { annulerChoix, choixRecents, compteAVerifier, fileAVerifier, gesteFile } from '../../../../../lib/adresse/fileVerificationRepo';
import { motifExclusiviteAdresse } from '../../../../../lib/gestion/adresseCoproExclusivite';

/**
 * /api/admin/gestion/adresses-a-verifier — LA FILE « ADRESSES À VÉRIFIER » (Arno, 20/11/2026, « Adresse officielle BAN », lot 6). Au droit « Gestion ».
 *   GET            : la file (écritures, biens, motifs, propositions, plages) et les choix récents annulables — LECTURE SEULE ;
 *   GET ?compte=1  : seulement le nombre d'écritures à vérifier (le compteur de l'onglet) ;
 *   POST `{ action: 'geste', geste: 'valider' | 'autre' | 'plusieurs' | 'hors', cle, banId?, banIds?, adresse?, raison? }` : un geste confirmé ;
 *   POST `{ action: 'annuler', operationId }` : « Annuler ce choix ».
 */
export const runtime = 'nodejs';
const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  try {
    if (new URL(request.url).searchParams.get('compte') === '1') return Response.json({ etat: 'ok', data: { compte: await compteAVerifier() } }, { headers: ENTETES });
    const [file, recents] = await Promise.all([fileAVerifier(), choixRecents()]);
    return Response.json({ etat: 'ok', data: { file, recents } }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/adresses-a-verifier] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503, headers: ENTETES });
  }
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  let corps: Record<string, unknown>;
  try { corps = await request.json() as Record<string, unknown>; } catch { return Response.json({ etat: 'refus', motif: 'Demande illisible.' }, { status: 400, headers: ENTETES }); }
  try {
    const auteur = await auteurDeLaRequete(request);
    const r = corps.action === 'annuler' ? await annulerChoix(Number(corps.operationId), auteur)
      : corps.action === 'geste' ? await gesteFile(corps, auteur) : { ok: false as const, motif: 'Action inconnue.' };
    return Response.json(r.ok ? { etat: 'ok', data: r } : { etat: 'refus', motif: r.motif }, { headers: ENTETES });
  } catch (e) {
    // 🔴🔴 (décision d'Arno du 26/11/2026, 520) la base refuse une adresse déjà à une autre copropriété : le message clair, jamais une panne
    const exclusivite = motifExclusiviteAdresse(e);
    if (exclusivite !== null) return Response.json({ etat: 'refus', motif: exclusivite }, { status: 409, headers: ENTETES });
    console.error('[gestion/adresses-a-verifier] écriture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Enregistrement impossible : la base n’a pas répondu. Rien n’est enregistré.' }, { status: 503, headers: ENTETES });
  }
}
