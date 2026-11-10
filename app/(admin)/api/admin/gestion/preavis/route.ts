import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { preavisEnCours } from '../../../../../lib/location/preavisRepo';
import { avecPrevisites } from '../../../../../lib/location/previsiteRepo';
import { encartDuBail } from '../../../../../lib/location/sortieLocatairesRepo';

/**
 * ══ 🔴🔴 LES PRÉAVIS, LUS CÔTÉ GESTION (Arno, 10/11/2026, option A) ═══════════════════════════════════════════════════════════════
 *
 * Arno : « Les préavis (bloc, bouton « Préavis » avec sa pastille, pleine page) sont visibles par tout compte ayant accès à la Gestion, par
 * une lecture côté Gestion. Les boutons qui écrivent restent réservés au droit « Location ». »
 *
 *   · GET ?preavisEnCours=1 → la MÊME donnée que `/api/admin/location?preavisEnCours=1` (mêmes fonctions : `preavisEnCours`, `avecPrevisites`) ;
 *   · GET ?encartBail=<occupation> → l'encart « Le logement » de la ligne dépliée (même fonction : `encartDuBail`).
 * 🔒 LECTURE SEULE, au droit « Gestion » (relu en base). AUCUNE écriture n'est atteignable d'ici : ni POST, ni PUT, ni DELETE. Les gestes
 * (pré-visite, état des lieux, sortie) passent par `/api/admin/location`, qui exige le droit « Location » (relu en base).
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const p = new URL(request.url).searchParams;
  try {
    if (p.get('preavisEnCours') !== null) return Response.json({ etat: 'ok', data: await avecPrevisites(await preavisEnCours()) }, { headers: ENTETES });
    const brut = p.get('encartBail') ?? '';
    if (/^[1-9]\d{0,15}$/.test(brut) && Number.isSafeInteger(Number(brut))) {
      const e = await encartDuBail(Number(brut));
      return Response.json(e === null ? { etat: 'inconnu' } : { etat: 'ok', data: e }, { headers: ENTETES });
    }
    return Response.json({ etat: 'refus', motif: 'Demande incomplète.' }, { status: 400, headers: ENTETES });
  } catch (e) {
    console.error('[gestion/preavis] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503, headers: ENTETES });
  }
}
