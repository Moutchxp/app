import 'server-only';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { chargerConfigVeille } from '../../../../../lib/sitadel/veilleConfig';
import { profilValide, validerIdsLot, validerLotsSelection, bornerAncienneteMois } from '../../../../../lib/sitadel/demande';
import { listerDemandes, creerDemandes, changerStatutLot, changerProfilLot, IdentiteIncompleteError, TransitionInterditeError } from '../../../../../lib/sitadel/demandeRepo';

/**
 * /api/admin/permis/demandes (chantier S7 / S7e / V3). GET = liste des demandes (+ alertes d'identité ciblées par profil).
 * POST = CRÉE les demandes des LOTS SÉLECTIONNÉS (V3 : `lots` = [{cle, communeNom?}]), pour un PROFIL (défaut config). Le
 * serveur ré-apparie la sélection sur ses propres lots frais (jamais confiance au client) → compte rendu chiffré. PATCH =
 * ACTION GROUPÉE tout-ou-rien : transition de statut ('prete'|'abandonnee') OU bascule de profil ('entreprise'|'personne').
 * AUCUN ENVOI. RÉSERVÉ ADMINISTRATEUR (proxy fail-closed + garde). Runtime Node.
 */
export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  try {
    return Response.json(await listerDemandes());
  } catch {
    return Response.json({ erreur: 'liste indisponible' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  // Contexte capturé hors du try pour la trace du catch (le refus 400 « sélection invalide » est un `return`).
  let clesCtx: string[] | undefined;
  try {
    const corps = (await request.json().catch(() => ({}))) as { profil?: unknown; lots?: unknown; ancienneteMois?: unknown };
    const profil = corps.profil === undefined ? undefined : profilValide(corps.profil);
    // V3 — le CHOIX est obligatoire : sans lot sélectionné (ou tous invalides), on refuse EXPLICITEMENT (400), jamais « tout créer ».
    const v = validerLotsSelection(corps.lots);
    if (!v.ok) return Response.json({ erreur: v.erreur }, { status: 400 });
    clesCtx = v.lots.map((l) => l.cle);
    const annee = new Date().getFullYear();
    const auteur = garde.auteurId === null ? null : String(garde.auteurId);
    const cfg = await chargerConfigVeille();
    // Q4 — MÊME fenêtre d'ancienneté (bornée serveur) que l'aperçu : la création re-dérive la proposition, elle doit voir la
    // même fenêtre, sinon les lots créés diffèrent des lots affichés. Absent/invalide → maximum (comportement d'avant Q4).
    const ancienneteMois = bornerAncienneteMois(corps.ancienneteMois, cfg.ancienneteMaxDemandeAnnees);
    // Aucun refus MÉTIER ici : un lot invalidé entre-temps n'est PAS une erreur (il est ignoré + listé dans le compte
    // rendu 200, par conception V3). Seule une exception INATTENDUE atteint le catch ci-dessous.
    const res = await creerDemandes(cfg, annee, auteur, profil, v.lots, ancienneteMois);
    return Response.json(res);
  } catch (e) {
    // Trace SERVEUR de l'exception inattendue (jamais de catch muet) : sans elle, un bug (params liés, 22P02…) reste
    // invisible des deux côtés. La réponse HTTP au client reste un 503 générique.
    const err = e as { name?: unknown; message?: unknown; stack?: unknown; code?: unknown; detail?: unknown; constraint?: unknown; table?: unknown; column?: unknown };
    console.error('[permis/demandes] POST création impossible (503)', {
      lots: clesCtx,
      name: err?.name, message: err?.message,
      code: err?.code, detail: err?.detail, constraint: err?.constraint, table: err?.table, column: err?.column,
      stack: err?.stack,
    });
    return Response.json({ erreur: 'création impossible' }, { status: 503 });
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  // Contexte capturé hors du try pour être disponible dans la trace du catch (les refus métier 400/409 sont des
  // `return`, ils n'atteignent jamais ce catch : seules les exceptions INATTENDUES sont journalisées).
  let idsCtx: number[] | undefined;
  let cibleCtx: unknown;
  try {
    const corps = (await request.json()) as { ids?: unknown; statut?: unknown; profil?: unknown };
    // Erreur EXPLICITE si des id étaient fournis mais tous invalides (ex. bigint sérialisé en chaîne) — jamais un succès à 0.
    const v = validerIdsLot(corps.ids);
    if (!v.ok) return Response.json({ erreur: v.erreur }, { status: 400 });
    const ids = v.ids;
    idsCtx = ids;
    cibleCtx = corps.profil ?? corps.statut;
    const auteur = garde.auteurId === null ? null : String(garde.auteurId);

    // Bascule de profil (action groupée « Basculer la sélection en… »).
    if (corps.profil === 'entreprise' || corps.profil === 'personne') {
      try {
        await changerProfilLot(ids, corps.profil, auteur);
      } catch (e) {
        if (e instanceof TransitionInterditeError) return Response.json({ erreur: e.raison }, { status: 409 });
        throw e;
      }
      return Response.json({ ok: true, traites: ids.length });
    }

    // Transition de statut.
    if (corps.statut !== 'prete' && corps.statut !== 'abandonnee') {
      return Response.json({ erreur: 'requête invalide' }, { status: 400 });
    }
    try {
      await changerStatutLot(ids, corps.statut, auteur);
    } catch (e) {
      if (e instanceof IdentiteIncompleteError) return Response.json({ erreur: 'identité du demandeur incomplète', champs: e.champs }, { status: 409 });
      throw e;
    }
    return Response.json({ ok: true, traites: ids.length });
  } catch (e) {
    // Trace SERVEUR de l'exception inattendue (S42) : sans elle, un bug d'une ligne (params liés inversés, 22P02)
    // reste invisible des deux côtés. La réponse HTTP au client est INCHANGÉE (même code 503, même corps).
    const err = e as { name?: unknown; message?: unknown; stack?: unknown; code?: unknown; detail?: unknown; constraint?: unknown; table?: unknown; column?: unknown };
    console.error('[permis/demandes] PATCH action impossible (503)', {
      ids: idsCtx, cible: cibleCtx,
      name: err?.name, message: err?.message,
      code: err?.code, detail: err?.detail, constraint: err?.constraint, table: err?.table, column: err?.column,
      stack: err?.stack,
    });
    return Response.json({ erreur: 'action impossible' }, { status: 503 });
  }
}
