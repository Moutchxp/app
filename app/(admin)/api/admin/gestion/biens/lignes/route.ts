import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { query } from '../../../../../../lib/db/client';
import { ligneDuBien } from '../../../../../../lib/gestion/avantApres';

/**
 * ══ 🔴🔴 LOT MODALE-AVANT-APRES-DEUX-COLONNES — UNE LIGNE PAR BIEN : « adresse, CP ville — lot N » ═════════════════════
 *
 *   · GET ?cles=219,24   → { etat: 'ok', lignes: { "219": "25 rue Edith Cavell, 92400 COURBEVOIE — lot 219" } }
 *
 * 🔒 LECTURE SEULE, bornée à 100 clés. Une clé inconnue de l'annuaire n'a pas de ligne : la fenêtre garde alors le
 * libellé enregistré avec le classement.
 */
export const runtime = 'nodejs';
const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const cles = [...new Set((new URL(request.url).searchParams.get('cles') ?? '').split(',')
    .map((x) => x.trim()).filter((x) => x !== '' && x.length <= 40))].slice(0, 100);
  if (cles.length === 0) return Response.json({ etat: 'ok', lignes: {} }, { headers: ENTETES });
  try {
    const { rows } = await query<{ cle: string; adresse: string | null; code_postal: string | null; commune: string | null }>(
      `SELECT wippimmo_id AS cle, adresse, code_postal, commune FROM gestion_annuaire_lot WHERE wippimmo_id = ANY($1::text[])`,
      [cles]);
    return Response.json({
      etat: 'ok',
      lignes: Object.fromEntries(rows.map((r) => [r.cle, ligneDuBien({ cle: r.cle, adresse: r.adresse, codePostal: r.code_postal, commune: r.commune })])),
    }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/biens/lignes] lecture impossible', e);
    return Response.json({ etat: 'erreur', lignes: {} }, { status: 503, headers: ENTETES });
  }
}
