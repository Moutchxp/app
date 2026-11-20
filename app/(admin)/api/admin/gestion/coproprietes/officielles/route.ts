import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { officiellesDeLaListe } from '../../../../../../lib/adresse/officielleCopro';

/**
 * /api/admin/gestion/coproprietes/officielles — L'ADRESSE OFFICIELLE (BAN) DE CHAQUE LIGNE DE LA LISTE « COPROPRIÉTÉS » (Arno, 20/11/2026, lot 4). Au droit
 * « Gestion », comme la liste. LECTURE SEULE : calculée en direct par le module unique (rien n'est écrit avant le lot 5), mémorisée 10 minutes. Lue À PART
 * de la liste, qui s'affiche sans l'attendre : clé de la ligne → libellé officiel, adresses officielles, « à vérifier ».
 */
export const runtime = 'nodejs';
const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  try {
    return Response.json({ etat: 'ok', data: { lignes: await officiellesDeLaListe() } }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/coproprietes/officielles] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503, headers: ENTETES });
  }
}
