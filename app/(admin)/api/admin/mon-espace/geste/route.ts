import { exigerMonEspace } from '../../../../../lib/mon-espace/garde';
import { gesteDepuisMonEspace, type GesteMonEspace } from '../../../../../lib/mon-espace/gestesRepo';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import { lireAnnulation, lireDateActe } from '../../../../../lib/transaction/saisie';

/**
 * 🔴 MON ESPACE, LOT 7 — POST /api/admin/mon-espace/geste { geste, id, version, dateActe | annulation } : « Acte signé », « Annuler le compromis »,
 * « Revenir en compromis » depuis « Mon espace ». Les fonctions de la tuile (journal, inter-cabinet, garde de version) ; un négociateur de
 * l'affaire ou un administrateur (403 sinon) ; 409 si un collègue a enregistré entre-temps. Droit « Mon espace » ; un observateur est refusé
 * par le proxy.
 */
export const runtime = 'nodejs';
const ENTETES = { 'Cache-Control': 'private, no-store' } as const;
const json = (corps: unknown, status = 200): Response => Response.json(corps, { status, headers: ENTETES });

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerMonEspace(request);
  if ('refus' in garde) return garde.refus;
  if (garde.auteurId === null) return json({ erreur: 'ACCES_REVOQUE' }, 403);
  let corps: Record<string, unknown>;
  try { corps = (await request.json()) as Record<string, unknown>; } catch { return json({ etat: 'refus', motif: 'Requête illisible.' }, 400); }
  const id = Number(corps.id);
  if (!Number.isInteger(id) || id <= 0) return json({ etat: 'refus', motif: 'Affaire inconnue.' }, 400);
  const version = typeof corps.version === 'number' && Number.isInteger(corps.version) && corps.version >= 0 ? corps.version : null;
  let g: GesteMonEspace;
  if (corps.geste === 'acte-signe') {
    const d = lireDateActe(corps.dateActe);
    if (!d.ok) return json({ etat: 'refus', motif: d.motif }, 422);
    g = { geste: 'acte-signe', dateActe: d.valeur };
  } else if (corps.geste === 'compromis-annuler') {
    const a = lireAnnulation(corps.annulation);
    if (!a.ok) return json({ etat: 'refus', motif: a.motif }, 422);
    g = { geste: 'compromis-annuler', annulation: a.valeur };
  } else if (corps.geste === 'retour-compromis') g = { geste: 'retour-compromis' };
  else return json({ etat: 'refus', motif: 'Geste inconnu.' }, 400);
  try {
    const r = await gesteDepuisMonEspace(garde.auteurId, id, g, version, await auteurDeLaRequete(request));
    return r.ok ? json({ etat: 'ok', data: null }) : json({ etat: 'refus', motif: r.motif, ...(r.statut === 409 ? { conflit: true } : {}) }, r.statut);
  } catch (e) {
    console.error('[mon-espace] geste', e);
    return json({ etat: 'erreur', message: 'Enregistrement impossible.' }, 500);
  }
}
