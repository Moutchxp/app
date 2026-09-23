import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { chercherEvenements, MAX_RESULTATS } from '../../../../../lib/gestion/recherche';

/**
 * /api/admin/gestion/evenements (lot 4d) — CHERCHER UN ÉVÉNEMENT.
 *
 * Sert les TROIS gestes qui doivent désigner une carte : affecter depuis la file, déplacer un échange, déplacer un
 * mail. Une seule route, donc un seul comportement.
 *
 * Saisie vide → les événements les plus récemment ouverts : le champ est aussi une LISTE, on ne force pas à taper.
 *
 * 🔒 `exigerCompteActif` : les résultats portent des noms de locataires et des adresses. `private, no-store`.
 * Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const q = new URL(request.url).searchParams.get('q') ?? '';
  try {
    const evenements = await chercherEvenements(q, MAX_RESULTATS);
    return Response.json({ evenements, max: MAX_RESULTATS }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    console.error('[gestion/evenements] recherche impossible', e);
    return Response.json({ erreur: 'Recherche impossible : erreur interne du serveur.' }, { status: 503 });
  }
}
