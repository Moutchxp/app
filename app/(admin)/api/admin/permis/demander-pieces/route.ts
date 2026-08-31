import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { lireEtatDemandePieces, executerDemandePieces, depsReellesDemandePieces, declarerRelanceComplement, depsReellesDeclaration, annulerDeclaration } from '../../../../../lib/permis/demanderPiecesRepo';
import type { FamillePlan } from '../../../../../lib/permis/planMasse';

/**
 * PART-3a/3c/3e — /api/admin/permis/demander-pieces : demander à la mairie les pièces manquantes, DANS LE FIL de son dernier message.
 * GET ?dossierId=… → état + historique. POST : action 'envoyer' (défaut, ENVOI MANUEL verbatim) · 'declarer' (constat d'une relance
 * faite hors outil, AUCUN envoi) · 'annuler' (retirer une déclaration). RÉSERVÉ ADMINISTRATEUR. Aucun envoi automatique. Node.
 */
export const runtime = 'nodejs';

const FAMILLES_OK: ReadonlySet<string> = new Set(['masse', 'coupe', 'etage', 'cerfa']);
const familles = (v: unknown): FamillePlan[] => (Array.isArray(v) ? v : []).filter((f): f is FamillePlan => typeof f === 'string' && FAMILLES_OK.has(f));

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
  const body = (await request.json().catch(() => ({}))) as { action?: unknown; dossierId?: unknown; familles?: unknown; objet?: unknown; corps?: unknown; dateRelance?: unknown; journalId?: unknown; compteCommeRelance?: unknown; destinataire?: unknown; destinataireAjoute?: unknown };
  const compteCommeRelance = body.compteCommeRelance === true; // LOT 30 (②) — défaut « ne compte pas » (statu quo)
  // LOT 29 — destinataire CHOISI (facultatif) + drapeau « saisi à la main » (→ enregistrement au carnet commune). Validés dans l'orchestrateur.
  const destinataire = typeof body.destinataire === 'string' ? body.destinataire : undefined;
  const destinataireAjoute = body.destinataireAjoute === true;
  const action = typeof body.action === 'string' ? body.action : 'envoyer';

  // PART-3e — ANNULER une relance déclarée (réversibilité). Garde repo : ne supprime que des déclarations.
  if (action === 'annuler') {
    const journalId = Number(body.journalId);
    if (!Number.isInteger(journalId) || journalId <= 0) return Response.json({ erreur: 'journalId invalide' }, { status: 400 });
    try {
      const ok = await annulerDeclaration(journalId);
      return ok ? Response.json({ ok: true }) : Response.json({ erreur: 'déclaration introuvable (déjà annulée ?) ou non annulable' }, { status: 422 });
    } catch (e) { console.error('[permis/demander-pieces] annuler échec', e); return Response.json({ erreur: 'annulation impossible' }, { status: 503 }); }
  }

  const dossierId = Number(body.dossierId);
  if (!Number.isInteger(dossierId) || dossierId <= 0) return Response.json({ erreur: 'dossierId invalide' }, { status: 400 });
  const fams = familles(body.familles);
  if (fams.length === 0) return Response.json({ erreur: 'aucune famille sélectionnée' }, { status: 400 });

  // PART-3e — DÉCLARER une relance faite hors outil : AUCUN envoi (deps sans `envoyer`), on POSE date + familles.
  if (action === 'declarer') {
    const dateRelance = typeof body.dateRelance === 'string' ? body.dateRelance : '';
    try {
      const r = await declarerRelanceComplement(depsReellesDeclaration(), { dossierId, familles: fams, dateRelance, auteur: 'admin:decision', compteCommeRelance, destinataire, destinataireAjoute });
      return r.ok ? Response.json(r) : Response.json({ erreur: r.motif ?? 'déclaration impossible' }, { status: 422 });
    } catch (e) { console.error('[permis/demander-pieces] declarer échec', e); return Response.json({ erreur: 'déclaration impossible' }, { status: 503 }); }
  }

  // ENVOI (défaut) — PART-3c : objet + corps ÉDITÉS envoyés VERBATIM (validation vide/HTML dans l'orchestrateur).
  const objet = typeof body.objet === 'string' ? body.objet : '';
  const corps = typeof body.corps === 'string' ? body.corps : '';
  try {
    const r = await executerDemandePieces(depsReellesDemandePieces(), { dossierId, familles: fams, objet, corps, auteur: 'admin:decision', compteCommeRelance, destinataire, destinataireAjoute });
    return r.ok ? Response.json(r) : Response.json({ erreur: r.motif ?? 'envoi impossible' }, { status: 422 });
  } catch (e) {
    console.error('[permis/demander-pieces] POST échec', e);
    return Response.json({ erreur: 'envoi impossible' }, { status: 503 });
  }
}
