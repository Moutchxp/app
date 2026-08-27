import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { chargerConfigVeille } from '../../../../../../lib/sitadel/veilleConfig';
import { chargerVivier } from '../../../../../../lib/sitadel/demandeRepo';
import { rechercherDansVivier } from '../../../../../../lib/sitadel/rechercheVivier';

/**
 * D3 — GET /api/admin/permis/demandes/vivier-recherche?q=…&process=email|formulaire — RECHERCHE dans le VIVIER (permis encore
 * demandables) par n° de permis (num_dau) OU par ville, SCOPÉE au process. Renvoie les correspondances du process actif (capées),
 * leur total, et le nombre de correspondances dans l'AUTRE process (mention non silencieuse « N résultats dans X — basculer »).
 *
 * 🔑 Scoping = filtre d'AFFICHAGE en aval (dans `rechercherDansVivier`, pur) ; aucun WHERE `dest_canal` ajouté à une requête de
 * surveillance. Le vivier réutilise la MÊME éligibilité que le stock/la proposition. LECTURE SEULE. RÉSERVÉ ADMINISTRATEUR. Node.
 */
export const runtime = 'nodejs';

const CAP = 50; // résultats renvoyés au plus (le total réel est indiqué pour signaler une troncature)

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const p = url.searchParams.get('process');
  const process = p === 'email' || p === 'formulaire' ? p : null;
  if (process === null) return Response.json({ erreur: 'process invalide (email|formulaire)' }, { status: 422 });
  if (q === '') return Response.json({ resultats: [], total: 0, autreProcess: 0, tronque: false });
  try {
    const cfg = await chargerConfigVeille();
    const { vivier, tronque } = await chargerVivier(cfg);
    const r = rechercherDansVivier(vivier, q, process, CAP);
    // `tronque` = plafond de chargement du vivier atteint OU plus de CAP correspondances (dans les deux cas l'affichage est incomplet).
    return Response.json({ ...r, tronque: tronque || r.total > CAP });
  } catch {
    return Response.json({ erreur: 'recherche indisponible' }, { status: 503 });
  }
}
