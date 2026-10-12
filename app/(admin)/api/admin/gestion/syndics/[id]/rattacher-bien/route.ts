import 'server-only';
import { exigerCompteActif } from '../../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../../lib/gestion/auteur';
import { rattacherBienAuSyndic } from '../../../../../../../lib/gestion/doublonSyndicRepo';
import { syndicsDisponibles } from '../../../../../../../lib/gestion/syndicRepo';

/**
 * POST /api/admin/gestion/syndics/[id]/rattacher-bien — LOT SYNDIC-ANTI-DOUBLON-ET-PROPOSITION-PAR-ADRESSE.
 * Corps : `{ immeuble: { libelle, codePostal, commune }, coproCle?: string, lotId?: number }`.
 * « Sélectionner ce syndic pour ce bien », « Le rattacher à ce bien », « Rattacher » du bandeau d'un bien : le syndic
 * EXISTANT reçoit l'immeuble du bien (comme adresse de la copropriété `coproCle` quand on la connaît), par la porte
 * unique `enregistrerSyndic`. 🔴 ÉCRIT UNIQUEMENT SUR CE CLIC — jamais de rattachement automatique.
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;
const texte = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ erreur: 'Syndic non désigné.' }, { status: 422, headers: ENTETES });
  let corps: Record<string, unknown>;
  try { corps = (await request.json()) as Record<string, unknown>; }
  catch { return Response.json({ erreur: 'Requête invalide.' }, { status: 422, headers: ENTETES }); }
  const im = (typeof corps?.immeuble === 'object' && corps.immeuble !== null ? corps.immeuble : {}) as Record<string, unknown>;
  const immeuble = { libelle: texte(im.libelle, 300), codePostal: texte(im.codePostal, 10), commune: texte(im.commune, 120) };
  if (immeuble.libelle === '') return Response.json({ erreur: 'Immeuble du bien non désigné.' }, { status: 422, headers: ENTETES });
  const coproCle = texte(corps.coproCle, 300);
  const lot = Number(corps.lotId);
  const lotId = Number.isSafeInteger(lot) && lot > 0 ? lot : null;
  try {
    if (!(await syndicsDisponibles())) {
      return Response.json({ erreur: 'Annuaire des syndics non installé (migration 324).' }, { status: 409, headers: ENTETES });
    }
    const issue = await rattacherBienAuSyndic(id, immeuble, coproCle === '' ? null : coproCle, await auteurDeLaRequete(request), lotId);
    if (!issue.ok) return Response.json({ erreur: issue.motif }, { status: 409, headers: ENTETES });
    /* LOT FICHE-SYNDIC-UNIQUE-ET-PARTAGEE — « Syndic X rattaché — N contacts syndic et M habitants / gardien partagés
       avec K autres biens », et les contacts du cabinet à proposer quand la copropriété est nouvelle. */
    return Response.json({ ok: true, id: issue.id, resume: issue.resume }, { headers: ENTETES });
  } catch (e) {
    console.error('[gestion/syndics/%d/rattacher-bien] rattachement impossible', id, e);
    return Response.json({ erreur: 'Rattachement impossible : la base n’a pas répondu.' }, { status: 503, headers: ENTETES });
  }
}
