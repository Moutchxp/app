import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { lireArbitrages, lireAmbiguites, rattacherManuel, ecarterHorsPerimetre, estIdentifiantValide, PradaImportIntrouvableError } from '../../../../../lib/sitadel/pradaAdmin';

/**
 * /api/admin/permis/prada (chantier S14e). GET = arbitrages (PRADA disponible mais contact confirmé conservé) + lignes
 * ambiguës à trancher. POST = action humaine : rattacher une ligne à une commune (rapprochement='manuel') ou l'écarter
 * ('hors_perimetre'). RÉSERVÉ ADMINISTRATEUR (proxy fail-closed + garde). AUCUN envoi. Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const [arbitrages, ambiguites] = await Promise.all([lireArbitrages(), lireAmbiguites()]);
    return Response.json({ arbitrages, ambiguites });
  } catch {
    return Response.json({ erreur: 'lecture PRADA indisponible' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const c = (await request.json()) as { action?: unknown; importId?: unknown; codeInsee?: unknown };
    if (!estIdentifiantValide(c.importId)) return Response.json({ erreur: 'importId invalide' }, { status: 400 });
    const importId = c.importId;
    const auteur = garde.auteurId === null ? null : String(garde.auteurId);

    if (c.action === 'rattacher') {
      const codeInsee = typeof c.codeInsee === 'string' ? c.codeInsee.trim() : '';
      if (!/^\d{5}$/.test(codeInsee)) return Response.json({ erreur: 'code INSEE invalide' }, { status: 400 });
      try {
        await rattacherManuel(importId, codeInsee, auteur);
      } catch (e) {
        if (e instanceof PradaImportIntrouvableError) return Response.json({ erreur: 'ligne introuvable' }, { status: 404 });
        throw e;
      }
      return Response.json({ ok: true });
    }
    if (c.action === 'ecarter') {
      await ecarterHorsPerimetre(importId);
      return Response.json({ ok: true });
    }
    return Response.json({ erreur: 'action invalide' }, { status: 400 });
  } catch {
    return Response.json({ erreur: 'action impossible' }, { status: 503 });
  }
}
