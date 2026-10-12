import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { expediteurSyndicalDesBiens } from '../../../../../lib/gestion/partiesSyndicRepo';

/**
 * /api/admin/gestion/expediteur-syndic?message=<id>&biens=<cle,cle…> — LOT PARTIES-SYNDIC-ET-IMMEUBLE.
 *
 * Le cartouche EXPÉDITEUR des fenêtres de rattachement : quand l'adresse De: du mail n'est ni celle d'un
 * propriétaire ni celle d'un locataire, elle peut être celle du syndic de la copropriété du bien, d'un de ses
 * contacts, ou d'une personne du carnet de l'immeuble. Cette route le dit, bien par bien, à la date du mail.
 *
 * 🔒 LECTURE SEULE. Même droit que la tuile Gestion. `private, no-store` : la réponse porte des noms de personnes.
 * Le mail est désigné par son identifiant, jamais par une adresse dans l'URL.
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;
const PLAFOND_BIENS = 200;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const url = new URL(request.url);
  const message = Number(url.searchParams.get('message'));
  const biens = [...new Set((url.searchParams.get('biens') ?? '').split(',').map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9_-]{1,40}$/.test(s)))].slice(0, PLAFOND_BIENS);
  if (!Number.isSafeInteger(message) || message <= 0 || biens.length === 0) {
    return Response.json({ etat: 'ok', parBien: {} }, { headers: ENTETES });
  }
  try {
    return Response.json({ etat: 'ok', parBien: await expediteurSyndicalDesBiens(message, biens) }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/expediteur-syndic] lecture impossible (message=%d)', message, e);
    return Response.json({ etat: 'erreur' }, { status: 503, headers: ENTETES });
  }
}
