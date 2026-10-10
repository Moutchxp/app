import 'server-only';
import { exigerCompteActif } from '../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import { enregistrerSyndic, listerSyndics, syndicsDisponibles } from '../../../../../lib/gestion/syndicRepo';
import { syndicsQuiRepondent, validerSyndic } from '../../../../../lib/gestion/syndics';

/**
 * ══ /api/admin/gestion/syndics — LOT ANNUAIRE-SYNDICS-ET-ENTETE-BIEN : LA LISTE, ET LA CRÉATION ══════════════════
 *
 *   · GET  ?q=…   la liste des syndics (nom, nb de copropriétés, nb de biens), filtrée par nom / e-mail / domaine.
 *                 🔒 LECTURE SEULE. `disponible: false` tant que la migration 324 n'est pas appliquée.
 *   · POST {…}    crée un syndic, ses contacts et ses copropriétés — par la SEULE porte d'écriture du module
 *                 (`enregistrerSyndic`). La saisie est re-validée ici (`validerSyndic`), jamais crue sur parole.
 *
 * 🔒 Droit `gestion` aux deux verbes ; l'auteur vient de la SESSION. `private, no-store`. Runtime Node (driver pg).
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  try {
    if (!(await syndicsDisponibles())) {
      return Response.json({ etat: 'ok', disponible: false, syndics: [] }, { headers: ENTETES });
    }
    const q = new URL(request.url).searchParams.get('q') ?? '';
    const syndics = syndicsQuiRepondent(q, await listerSyndics());
    return Response.json({ etat: 'ok', disponible: true, syndics }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/syndics] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' },
      { status: 503, headers: ENTETES });
  }
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  let corps: unknown;
  try { corps = await request.json(); }
  catch { return Response.json({ erreur: 'Requête invalide.' }, { status: 422, headers: ENTETES }); }
  const v = validerSyndic(corps);
  if (!v.ok) return Response.json({ erreur: v.motif }, { status: 422, headers: ENTETES });
  try {
    if (!(await syndicsDisponibles())) {
      return Response.json({ erreur: 'L’annuaire des syndics n’est pas encore installé (migration 324).' },
        { status: 409, headers: ENTETES });
    }
    const issue = await enregistrerSyndic(null, v.syndic, await auteurDeLaRequete(request));
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409, headers: ENTETES });
    return Response.json({ ok: true, id: issue.id }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/syndics] création impossible', e);
    return Response.json({ erreur: 'Enregistrement impossible : la base n’a pas répondu.' },
      { status: 503, headers: ENTETES });
  }
}
