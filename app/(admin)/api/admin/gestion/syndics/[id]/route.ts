import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../lib/gestion/auteur';
import { enregistrerSyndic, ficheSyndic, supprimerSyndic, syndicsDisponibles } from '../../../../../../lib/gestion/syndicRepo';
import { validerSyndic } from '../../../../../../lib/gestion/syndics';

/**
 * ══ /api/admin/gestion/syndics/[id] — LA FICHE D'UN SYNDIC ══════════════════════════════════════════════════════
 *
 *   · GET   la fiche : le cabinet, ses contacts et leurs coordonnées, ses copropriétés en cours (avec leurs lots)
 *           et l'historique des copropriétés qu'il ne gère plus. 🔒 LECTURE SEULE.
 *   · PUT   la fiche ENTIÈRE, telle que l'écran la montre. Ce qui manque est RETIRÉ (contact, coordonnée) ou FERMÉ
 *           (copropriété) — jamais effacé. Même porte que la création : `enregistrerSyndic`.
 *   · DELETE (lot FICHE-SYNDIC-FINITIONS) « Supprimer ce syndic » : le syndic reçoit `supprime_le`, ses contacts sont
 *           retirés, ses copropriétés fermées ; une ligne au journal (qui, quand). Aucun DELETE en base.
 *
 * 🔒 Droit `gestion` ; l'auteur vient de la SESSION. `private, no-store`. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

function identifiant(brut: string): number | null {
  const n = Number(brut);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const id = identifiant((await params).id);
  if (id === null) return Response.json({ etat: 'erreur', message: 'Syndic non désigné.' }, { status: 422, headers: ENTETES });
  try {
    if (!(await syndicsDisponibles())) {
      return Response.json({ etat: 'erreur', message: 'Annuaire des syndics non installé (migration 324).' },
        { status: 409, headers: ENTETES });
    }
    // LOT SYNDIC-NOTE-PAR-BIEN — `?lot=N` : la fiche lue DEPUIS UN BIEN porte la note de ce couple (lot, syndic).
    const lot = identifiant(new URL(request.url).searchParams.get('lot') ?? '');
    const fiche = await ficheSyndic(id, lot);
    if (fiche === null) return Response.json({ etat: 'erreur', message: 'Ce syndic n’existe pas.' }, { status: 404, headers: ENTETES });
    return Response.json({ etat: 'ok', fiche }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/syndics/%d] lecture impossible', id, e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' },
      { status: 503, headers: ENTETES });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const id = identifiant((await params).id);
  if (id === null) return Response.json({ erreur: 'Syndic non désigné.' }, { status: 422, headers: ENTETES });
  let corps: unknown;
  try { corps = await request.json(); }
  catch { return Response.json({ erreur: 'Requête invalide.' }, { status: 422, headers: ENTETES }); }
  const v = validerSyndic(corps);
  if (!v.ok) return Response.json({ erreur: v.motif }, { status: 422, headers: ENTETES });
  try {
    if (!(await syndicsDisponibles())) {
      return Response.json({ erreur: 'Annuaire des syndics non installé (migration 324).' }, { status: 409, headers: ENTETES });
    }
    const issue = await enregistrerSyndic(id, v.syndic, await auteurDeLaRequete(request));
    // LOT CONTACTS-DOUBLON-EMAIL-TEL-AVERTISSEMENT — des coordonnées déjà utilisées, non confirmées : 409 + les lignes.
    if (!issue.ok && issue.avertissement) return Response.json({ erreur: issue.motif, avertissement: issue.avertissement }, { status: 409, headers: ENTETES });
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 404, headers: ENTETES });
    return Response.json({ ok: true, id: issue.id }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/syndics/%d] enregistrement impossible', id, e);
    return Response.json({ erreur: 'Enregistrement impossible : la base n’a pas répondu.' },
      { status: 503, headers: ENTETES });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const id = identifiant((await params).id);
  if (id === null) return Response.json({ erreur: 'Syndic non désigné.' }, { status: 422, headers: ENTETES });
  try {
    if (!(await syndicsDisponibles())) {
      return Response.json({ erreur: 'Annuaire des syndics non installé (migrations 324-325).' }, { status: 409, headers: ENTETES });
    }
    const issue = await supprimerSyndic(id, await auteurDeLaRequete(request));
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 404, headers: ENTETES });
    return Response.json({ ok: true, coproprietes: issue.coproprietes }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/syndics/%d] suppression impossible', id, e);
    return Response.json({ erreur: 'Suppression impossible : la base n’a pas répondu.' }, { status: 503, headers: ENTETES });
  }
}
