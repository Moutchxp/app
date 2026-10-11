import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { famillesDesAdresses } from '../../../../../../lib/gestion/famillesAdressesRepo';

/**
 * ══ /api/admin/gestion/adresses/familles — LA FAMILLE DES ADRESSES DE À / Cc / Cci (LOT FORMULE-CONTACT-PRIME-ET-PUCES-COLOREES)
 *
 *   · GET `?a=adresse[&a=…][&lot=N]` → `{ etat: 'ok', familles: { adresse: { ton, propre, nom, role } | null } }`.
 *     `null` = adresse inconnue de notre système. `lot` = le bien ouvert : sa famille la plus proche l'emporte.
 *
 * 🔒 LECTURE SEULE, droit `gestion` (ce sont des noms et des rôles de clients). `private, no-store`. Bornée à 100
 * adresses. Une panne rend `{ familles: {} }` : les puces restent alors celles d'avant, rien ne bloque l'écriture.
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const url = new URL(request.url);
  const a = url.searchParams.getAll('a').map((x) => x.trim()).filter((x) => x !== '').slice(0, 100);
  const lotBrut = Number(url.searchParams.get('lot') ?? '');
  const lot = Number.isSafeInteger(lotBrut) && lotBrut > 0 ? lotBrut : null;
  try {
    return Response.json({ etat: 'ok', familles: await famillesDesAdresses(a, lot) }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/adresses/familles] lecture impossible', e);
    return Response.json({ etat: 'erreur', familles: {} }, { status: 503, headers: ENTETES });
  }
}
