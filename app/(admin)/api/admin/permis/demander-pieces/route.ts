import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { lireEtatDemandePieces, executerDemandePieces, depsReellesDemandePieces } from '../../../../../lib/permis/demanderPiecesRepo';
import type { FamillePlan } from '../../../../../lib/permis/planMasse';

/**
 * PART-3a — /api/admin/permis/demander-pieces : demander à la mairie les pièces manquantes, DANS LE FIL de son dernier message.
 * GET ?dossierId=… → état (destinataire, répondable, motif, historique) pour l'écran. POST {dossierId, familles} → ENVOI MANUEL.
 * RÉSERVÉ ADMINISTRATEUR, action explicite. Aucun envoi automatique. Node.
 */
export const runtime = 'nodejs';

const FAMILLES_OK: ReadonlySet<string> = new Set(['masse', 'coupe', 'etage', 'cerfa']);

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const dossierId = Number(new URL(request.url).searchParams.get('dossierId'));
  if (!Number.isInteger(dossierId) || dossierId <= 0) return Response.json({ erreur: 'dossierId invalide' }, { status: 400 });
  try {
    return Response.json(await lireEtatDemandePieces(dossierId));
  } catch (e) {
    console.error('[permis/demander-pieces] GET indisponible', e);
    return Response.json({ erreur: 'état indisponible' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  const body = (await request.json().catch(() => ({}))) as { dossierId?: unknown; familles?: unknown; objet?: unknown; corps?: unknown };
  const dossierId = Number(body.dossierId);
  if (!Number.isInteger(dossierId) || dossierId <= 0) return Response.json({ erreur: 'dossierId invalide' }, { status: 400 });
  const familles = (Array.isArray(body.familles) ? body.familles : []).filter((f): f is FamillePlan => typeof f === 'string' && FAMILLES_OK.has(f));
  if (familles.length === 0) return Response.json({ erreur: 'aucune famille sélectionnée' }, { status: 400 });
  // PART-3c — objet + corps ÉDITÉS par l'admin : envoyés VERBATIM (validation vide/HTML dans l'orchestrateur).
  const objet = typeof body.objet === 'string' ? body.objet : '';
  const corps = typeof body.corps === 'string' ? body.corps : '';
  try {
    const r = await executerDemandePieces(depsReellesDemandePieces(), { dossierId, familles, objet, corps, auteur: 'admin:decision' });
    return r.ok ? Response.json(r) : Response.json({ erreur: r.motif ?? 'envoi impossible' }, { status: 422 });
  } catch (e) {
    console.error('[permis/demander-pieces] POST échec', e);
    return Response.json({ erreur: 'envoi impossible' }, { status: 503 });
  }
}
