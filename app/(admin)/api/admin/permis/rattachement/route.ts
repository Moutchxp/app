import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { listerSuivi, lireDetailSuivi } from '../../../../../lib/permis/rattachementSuiviRepo';
import { lireAffectation, affecterPolygone } from '../../../../../lib/permis/affectationRepo';

/**
 * /api/admin/permis/rattachement — SUIVI du rattachement des permis à leur parcelle / polygones futurs.
 * GET (sans param) → la LISTE (univers = permis avec empreinte) + compteurs par état.
 * GET ?dossierId=N → le DÉTAIL d'un dossier (verdict/critères/seuils/millésimes + comparatif « trois sources ») + l'AFFECTATION
 *   des polygones BD TOPO aux corps (FUS-3d : schéma SVG, repères, exclusivité).
 * POST { action:'affecter', dossierId, corpsId, cleabs|null } → pose/change/retire l'affectation d'un polygone à un corps (FUS-3d).
 *   AUCUNE validation/refus, AUCUNE injection d'altitude (FUS-3e). RÉSERVÉ ADMINISTRATEUR. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const dossierId = new URL(request.url).searchParams.get('dossierId');
    if (dossierId) {
      const [detail, affectation] = await Promise.all([lireDetailSuivi(Number(dossierId)), lireAffectation(Number(dossierId)).catch(() => null)]);
      if (!detail) return Response.json({ erreur: 'dossier inconnu' }, { status: 404 });
      return Response.json({ detail, affectation });
    }
    return Response.json(await listerSuivi());
  } catch (e) {
    console.error('[permis/rattachement] GET indisponible', e);
    return Response.json({ erreur: 'suivi indisponible' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const body = (await request.json().catch(() => ({}))) as { action?: string; dossierId?: number; corpsId?: number; cleabs?: string | null };
    if (body.action !== 'affecter' || typeof body.dossierId !== 'number' || typeof body.corpsId !== 'number') {
      return Response.json({ erreur: 'requête invalide' }, { status: 400 });
    }
    const res = await affecterPolygone(body.dossierId, body.corpsId, body.cleabs ?? null, 'admin:affectation');
    if (!res.ok) return Response.json({ erreur: res.motif }, { status: 409 });
    // Renvoie l'état d'affectation à jour (l'écran se rafraîchit sans re-fetch séparé).
    return Response.json({ ok: true, affectation: await lireAffectation(body.dossierId) });
  } catch (e) {
    console.error('[permis/rattachement] POST indisponible', e);
    return Response.json({ erreur: 'affectation indisponible' }, { status: 503 });
  }
}
