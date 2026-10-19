import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import {
  chercherFiches, deciderRapprochement, lireRapprochement, validerTousLesSurs,
} from '../../../../../lib/gestion/rapprochementDossiersRepo';
import { GESTES, planDuLotSuivant, type Geste } from '../../../../../lib/gestion/rapprochementDossiers';
import { deciderRapprochementBien, lireRapprochementBiens } from '../../../../../lib/gestion/rapprochementBiensRepo';
import { GESTES_BIEN, type GesteBien } from '../../../../../lib/gestion/racinesProprietaires';

/**
 * /api/admin/gestion/rapprochement-dossiers — écran « Rapprochement des dossiers clients » (Arno, 19/10/2026).
 * RÉSERVÉ À L'ADMINISTRATEUR (rôle relu en base à chaque appel).
 *
 * GET : les propositions du dernier calcul, leur décision qui fait foi, et le plan du lot suivant (rien n'est exécuté).
 * GET ?q=… : la recherche d'une fiche propriétaire pour « Corriger ».
 * POST { action: 'decider', propositionId, geste, proprietaireId? } | { action: 'valider-surs' }
 *    | { action: 'decider-bien', propositionId, geste, dossierId? } (section « Biens », migration 388, Arno 19/10/2026).
 * 🔴 Aucune décision n'écrit dans le Drive ni dans l'annuaire : elle est seulement enregistrée (migrations 387 et 388).
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    const q = new URL(request.url).searchParams.get('q');
    if (q !== null) return Response.json({ etat: 'ok', data: await chercherFiches(q.slice(0, 120)) }, { headers: ENTETES });
    const lu = await lireRapprochement();
    if (lu.etat !== 'ok') return Response.json({ etat: lu.etat }, { headers: ENTETES });
    const biens = await lireRapprochementBiens();
    return Response.json({ etat: 'ok', data: { calcul: lu.calcul, lignes: lu.lignes, plan: planDuLotSuivant(lu.lignes), biens } }, { headers: ENTETES });
  } catch {
    return Response.json({ etat: 'erreur' }, { status: 500, headers: ENTETES });
  }
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  let corps: Record<string, unknown>;
  try {
    corps = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, motif: 'Requête illisible.' }, { status: 400, headers: ENTETES });
  }
  const auteur = await auteurDeLaRequete(request);
  try {
    if (corps.action === 'decider') {
      const geste = corps.geste as Geste;
      if (!GESTES.includes(geste)) return Response.json({ ok: false, motif: 'Geste inconnu.' }, { status: 400, headers: ENTETES });
      const fiche = corps.proprietaireId === undefined || corps.proprietaireId === null ? null : Number(corps.proprietaireId);
      const r = await deciderRapprochement(Number(corps.propositionId), geste, fiche, auteur);
      return Response.json(r, { status: r.ok ? 200 : 409, headers: ENTETES });
    }
    if (corps.action === 'decider-bien') {
      const geste = corps.geste as GesteBien;
      if (!GESTES_BIEN.includes(geste)) return Response.json({ ok: false, motif: 'Geste inconnu.' }, { status: 400, headers: ENTETES });
      const dossier = typeof corps.dossierId === 'string' && corps.dossierId !== '' ? corps.dossierId : null;
      const r = await deciderRapprochementBien(Number(corps.propositionId), geste, dossier, auteur);
      return Response.json(r, { status: r.ok ? 200 : 409, headers: ENTETES });
    }
    if (corps.action === 'valider-surs') {
      const r = await validerTousLesSurs(auteur);
      return Response.json(r, { status: r.ok ? 200 : 409, headers: ENTETES });
    }
    return Response.json({ ok: false, motif: 'Action inconnue.' }, { status: 400, headers: ENTETES });
  } catch {
    return Response.json({ ok: false, motif: 'Erreur du serveur.' }, { status: 500, headers: ENTETES });
  }
}
