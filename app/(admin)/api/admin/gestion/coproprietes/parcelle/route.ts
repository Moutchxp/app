import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { adressesDeLaParcelle } from '../../../../../../lib/gestion/parcelleRepo';
import type { AdresseSaisie } from '../../../../../../lib/gestion/syndics';

/**
 * ══ /api/admin/gestion/coproprietes/parcelle — LOT COPRO-ADRESSES-SUGGEREES-PAR-PARCELLE ═══════════════════════════
 *
 *   · GET ?a=<JSON [{ libelle, codePostal, commune }]> les AUTRES adresses des parcelles cadastrales de ces adresses
 *         (celles d'une copropriété), d'après la BAN et le cadastre LOCAUX — aucun service en ligne. 🔒 LECTURE SEULE.
 *
 * 🔒 Droit `gestion`. `private, no-store`. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  let brut: unknown;
  try { brut = JSON.parse(new URL(request.url).searchParams.get('a') ?? '[]'); }
  catch { return Response.json({ etat: 'erreur', message: 'Adresses illisibles.' }, { status: 422, headers: ENTETES }); }
  const texte = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 200) : '');
  const adresses: AdresseSaisie[] = (Array.isArray(brut) ? brut.slice(0, 30) : [])
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    .map((x) => ({ libelle: texte(x.libelle), codePostal: texte(x.codePostal), commune: texte(x.commune) }));
  try {
    return Response.json({ etat: 'ok', ...(await adressesDeLaParcelle(adresses)) }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/coproprietes/parcelle] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503, headers: ENTETES });
  }
}
