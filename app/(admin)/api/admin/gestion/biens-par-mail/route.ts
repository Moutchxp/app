import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { comptesBiensParMail, PLAFOND_COMPTE_BIENS } from '../../../../../lib/gestion/compteBiensMailRepo';

/**
 * ══ 🔴🔴 LOT SUIVI-DE-FOND-MODIFIE-ET-COMPTEUR-BIENS — LE NOMBRE DE BIENS RATTACHÉS DES MAILS AFFICHÉS ══════════════════
 *
 *   · GET ?messages=1,2,3   → { etat: 'ok', parMail: { "<id>": n } }
 *
 * 🔒 LECTURE SEULE. ⚠️ BORNÉE À 500 IDENTIFIANTS : une page d'écran, jamais un export.
 */

export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

function idsDepuisTexte(brut: string | null): number[] {
  if (brut === null) return [];
  return [...new Set(brut.split(',').map((s) => Number(s.trim()))
    .filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, PLAFOND_COMPTE_BIENS);
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const ids = idsDepuisTexte(new URL(request.url).searchParams.get('messages'));
  if (ids.length === 0) return Response.json({ etat: 'ok', parMail: {} }, { headers: ENTETES });
  try {
    const comptes = await comptesBiensParMail(ids);
    return Response.json({ etat: 'ok', parMail: Object.fromEntries(comptes) }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/biens-par-mail] lecture impossible', e);
    return Response.json({ etat: 'erreur' }, { status: 503, headers: ENTETES });
  }
}
