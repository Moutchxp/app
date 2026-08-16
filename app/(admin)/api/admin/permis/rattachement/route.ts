import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { listerSuivi, lireDetailSuivi } from '../../../../../lib/permis/rattachementSuiviRepo';

/**
 * FUS-3b — /api/admin/permis/rattachement — SUIVI du rattachement des permis à leur parcelle / polygones futurs.
 * GET (sans param) → la LISTE (univers des permis suivis = ceux avec une empreinte) + compteurs par état.
 * GET ?dossierId=N → le DÉTAIL d'un dossier (verdict/critères/seuils/millésimes + tableau comparatif « trois sources »).
 * LECTURE SEULE : aucun POST (validation/refus/injection = FUS-3c). RÉSERVÉ ADMINISTRATEUR. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const dossierId = new URL(request.url).searchParams.get('dossierId');
    if (dossierId) {
      const detail = await lireDetailSuivi(Number(dossierId));
      if (!detail) return Response.json({ erreur: 'dossier inconnu' }, { status: 404 });
      return Response.json({ detail });
    }
    return Response.json(await listerSuivi());
  } catch (e) {
    console.error('[permis/rattachement] GET indisponible', e);
    return Response.json({ erreur: 'suivi indisponible' }, { status: 503 });
  }
}
