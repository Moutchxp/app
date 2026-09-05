import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { parcellesVoisines, bornerRayon, type PlancheParcelles, type CentreMode } from '../../../../../lib/permis/plancheParcellesRepo';

/**
 * PL-A/PL-B — /api/admin/permis/planche (GET, LECTURE SEULE) : la PLANCHE CADASTRALE d'un permis — parcelles retenues (colorées par
 * origine) + voisines dans un rayon, centrées sur l'empreinte / une parcelle / l'adresse géocodée. RÉSERVÉ ADMINISTRATEUR. AUCUNE
 * écriture (le clic ajouter/retirer et la validation sont les lots séparés PL-C). Résilient : une lecture qui échoue renvoie une
 * planche vide + motif, jamais un 500 muet ni un cadre vide déguisé en donnée.
 *   GET ?dossierId=468[&rayon=50][&centre=empreinte|parcelle|adresse][&idu=75119000DI0649]  →  { planche }
 */
export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const url = new URL(request.url);
  const dossierId = Number(url.searchParams.get('dossierId'));
  if (!Number.isInteger(dossierId) || dossierId <= 0) return Response.json({ erreur: 'dossierId invalide' }, { status: 400 });
  const rayonBrut = url.searchParams.get('rayon');
  const rayon = bornerRayon(rayonBrut !== null && rayonBrut.trim() !== '' ? Number(rayonBrut) : undefined);
  const modeBrut = (url.searchParams.get('centre') ?? 'empreinte').trim();
  const mode: CentreMode = modeBrut === 'parcelle' || modeBrut === 'adresse' ? modeBrut : 'empreinte';
  const idu = url.searchParams.get('idu');
  try {
    const planche = await parcellesVoisines(dossierId, rayon, { mode, idu });
    return Response.json({ planche });
  } catch (e) {
    console.error('[permis/planche] GET indisponible', e instanceof Error ? e.message : String(e));
    // Planche vide + motif explicite (jamais un 500 qui ferait disparaître le bloc sans explication).
    const vide: PlancheParcelles = {
      schema: { largeur: 360, hauteur: 300, empreintePath: null, polygones: [], motif: 'planche indisponible', transform: null },
      meta: [], rayonM: rayon, nbRetenues: 0, nbVoisines: 0, motif: 'planche indisponible (lecture des parcelles impossible)',
      centre: { mode: 'empreinte', idu: null, point: null }, centreAvertissement: null, marqueurAdresse: null, parcellesChoix: [],
    };
    return Response.json({ planche: vide });
  }
}
