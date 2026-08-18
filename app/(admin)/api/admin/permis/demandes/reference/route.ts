import 'server-only';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { ajouterReferenceExterne, supprimerReferenceExterne, ReferenceDejaEnregistreeError } from '../../../../../../lib/sitadel/demandeRepo';
import { retenterRattachementParReference } from '../../../../../../lib/veille/demandeReponseRepo'; // FUS-4 ② : re-rattachement différé

/**
 * /api/admin/permis/demandes/reference (chantier P1 / FUS-4). POST = enregistre une RÉFÉRENCE interne de la MAIRIE sur une
 * demande, y compris APRÈS COUP (demande déjà déposée : l'accusé arrive parfois plus tard — cas réel de la demande 119).
 * DELETE (FUS-4) = retire une référence (correction de saisie / accusé mal capté). Ni l'un ni l'autre n'écrit demande.statut
 * ou envoye_le → aucun envoi n'est jamais défait. Doublon POST (unique demande_id, reference) → 409 métier nommé ; inattendu
 * → 503 journalisé. UN SEUL chemin d'écriture des références (le panneau de détail ET le tableau « En cours » s'y branchent).
 * RÉSERVÉ ADMINISTRATEUR (proxy fail-closed + garde). Runtime Node.
 */
export const runtime = 'nodejs';

const SOURCES = new Set(['accuse_reception', 'saisie_manuelle', 'autre']);

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  let demandeCtx: unknown;
  try {
    const c = (await request.json().catch(() => ({}))) as { demandeId?: unknown; reference?: unknown; dossierId?: unknown; source?: unknown };
    demandeCtx = c.demandeId;
    if (!Number.isInteger(c.demandeId)) return Response.json({ erreur: 'demandeId invalide' }, { status: 400 });
    const reference = typeof c.reference === 'string' ? c.reference.trim() : '';
    if (reference === '') return Response.json({ erreur: 'référence vide' }, { status: 400 }); // ici la référence est REQUISE (ajout explicite)
    const dossierId = Number.isInteger(c.dossierId) ? (c.dossierId as number) : null;
    const source = typeof c.source === 'string' && SOURCES.has(c.source) ? c.source : 'saisie_manuelle';
    try {
      await ajouterReferenceExterne(c.demandeId as number, reference, { dossierId, source });
    } catch (e) {
      if (e instanceof ReferenceDejaEnregistreeError) return Response.json({ erreur: e.message }, { status: 409 });
      throw e;
    }
    // FUS-4 ② — l'ajout est COMMITTÉ (transaction propre). On re-tente le rattachement des messages non rattachés citant cette
    //   référence, dans un try/catch ISOLÉ : un échec ici ne remet JAMAIS en cause l'ajout — on log et on répond quand même {ok:true}.
    let rattaches = 0;
    try {
      const auteur = garde.auteurId === null ? 'admin' : String(garde.auteurId);
      rattaches = await retenterRattachementParReference(c.demandeId as number, reference, auteur);
    } catch (e) {
      console.error('[permis/demandes/reference] re-rattachement différé en échec (ajout PRÉSERVÉ)', { demandeId: demandeCtx, message: (e as { message?: unknown })?.message });
    }
    return Response.json({ ok: true, rattaches });
  } catch (e) {
    const err = e as { name?: unknown; message?: unknown; stack?: unknown; code?: unknown; detail?: unknown; constraint?: unknown; table?: unknown; column?: unknown };
    console.error('[permis/demandes/reference] POST ajout impossible (503)', {
      demandeId: demandeCtx,
      name: err?.name, message: err?.message,
      code: err?.code, detail: err?.detail, constraint: err?.constraint, table: err?.table, column: err?.column,
      stack: err?.stack,
    });
    return Response.json({ erreur: 'action impossible' }, { status: 503 });
  }
}

/**
 * FUS-4 — DELETE : retire UNE référence mairie d'une demande. 🔴 Ne touche NI demande.statut NI envoye_le → n'annule jamais un
 * envoi validé (le « accusé reçu » est dérivé, l'affichage revient seul). Idempotent : { supprime:false } si elle n'existait pas.
 */
export async function DELETE(request: Request): Promise<Response> {
  const garde = await exigerAdministrateur(request);
  if ('refus' in garde) return garde.refus;
  let demandeCtx: unknown;
  try {
    const c = (await request.json().catch(() => ({}))) as { demandeId?: unknown; reference?: unknown };
    demandeCtx = c.demandeId;
    if (!Number.isInteger(c.demandeId)) return Response.json({ erreur: 'demandeId invalide' }, { status: 400 });
    const reference = typeof c.reference === 'string' ? c.reference.trim() : '';
    if (reference === '') return Response.json({ erreur: 'référence vide' }, { status: 400 });
    const supprime = await supprimerReferenceExterne(c.demandeId as number, reference);
    return Response.json({ ok: true, supprime });
  } catch (e) {
    const err = e as { name?: unknown; message?: unknown; code?: unknown; detail?: unknown; constraint?: unknown };
    console.error('[permis/demandes/reference] DELETE impossible (503)', {
      demandeId: demandeCtx, name: err?.name, message: err?.message, code: err?.code, detail: err?.detail, constraint: err?.constraint,
    });
    return Response.json({ erreur: 'action impossible' }, { status: 503 });
  }
}
