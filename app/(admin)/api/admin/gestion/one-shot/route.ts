import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { oneShotDesMessages } from '../../../../../lib/gestion/suiviOneShotRepo';

/**
 * ══ 🔴🔴 LOT PASTILLE-SUIVI-MODIFIE-ONE-SHOT — LES MODIFICATIONS « CE MAIL UNIQUEMENT » DES MAILS AFFICHÉS ═══════
 *
 *   · GET ?messages=1,2,3   → { etat: 'ok', parMail: { "<id>": ModificationOneShot[] } }
 *
 * 🔒 LECTURE SEULE. Aucun verbe d'écriture : la modale de la pastille n'offre aucune action (demande d'Arno).
 *
 * ⚠️ BORNÉ À 500 IDENTIFIANTS : c'est une page d'écran, jamais un export. Au-delà, le reste est ignoré.
 * ⚠️ SEULS LES MAILS QUI PORTENT UNE MODIFICATION SONT RENDUS : l'absence d'une clé veut dire « aucune pastille ».
 */

export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;
const PLAFOND = 500;

function idsDepuisTexte(brut: string | null): number[] {
  if (brut === null) return [];
  return [...new Set(brut.split(',').map((s) => Number(s.trim()))
    .filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, PLAFOND);
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const ids = idsDepuisTexte(new URL(request.url).searchParams.get('messages'));
  if (ids.length === 0) return Response.json({ etat: 'ok', parMail: {} }, { headers: ENTETES });
  try {
    const carte = await oneShotDesMessages(ids);
    return Response.json({ etat: 'ok', parMail: Object.fromEntries(carte) }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/one-shot] lecture impossible', e);
    return Response.json({ etat: 'erreur' }, { status: 503, headers: ENTETES });
  }
}
