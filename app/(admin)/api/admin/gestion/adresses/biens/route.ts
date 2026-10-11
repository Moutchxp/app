import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { biensDesClients } from '../../../../../../lib/gestion/biensDesClientsRepo';

/**
 * ══ /api/admin/gestion/adresses/biens — LES BIENS DES CLIENTS TAPÉS DANS À / Cc / Cci (LOT NOUVEAU-MESSAGE-CONTEXTE-BIEN-PAR-CLIENT)
 *
 *   · GET `?a=adresse[&a=…]` → `{ etat: 'ok', biens: { adresse: BienClient[] } }` : pour chaque adresse, les biens du
 *     portefeuille où elle est l'e-mail d'un propriétaire ou d'un locataire (actuel ou ancien). `[]` = pas un client.
 *
 * 🔒 LECTURE SEULE, droit `gestion`. `private, no-store`. Bornée à 20 adresses. Une panne rend `{ biens: {} }` : la
 * rédaction continue comme avant, sans contexte retrouvé.
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const a = new URL(request.url).searchParams.getAll('a').map((x) => x.trim()).filter((x) => x !== '').slice(0, 20);
  try {
    return Response.json({ etat: 'ok', biens: await biensDesClients(a) }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/adresses/biens] lecture impossible', e);
    return Response.json({ etat: 'erreur', biens: {} }, { status: 503, headers: ENTETES });
  }
}
