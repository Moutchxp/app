import { exigerMonEspace } from '../../../../../lib/mon-espace/garde';
import { creerApporteurMonEspace, lireMesApporteurs, modifierFicheMonEspace, utiliserApporteur } from '../../../../../lib/mon-espace/apporteursRepo';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';

/**
 * 🔴 MON ESPACE, LOT 9 — /api/admin/mon-espace/apporteurs : « Mes apporteurs ».
 *   GET  : ceux que je vois (rattachés à moi, sur mes ventes, que j'utilise ; administrateur : tous), avec leurs chiffres sur mes ventes ;
 *   POST { action: 'creer', apporteur } : JAMAIS un doublon (409 avec les fiches existantes), puis la création de la Location ;
 *   POST { action: 'utiliser', apporteurId } : « L'utiliser » (migration 450) ;
 *   POST { action: 'fiche', apporteurId, fiche, version } : modifier la fiche (collègue de rattachement ou administrateur ; 403 sinon ; 409 conflit).
 * Droit « Mon espace » (proxy, puis relu en base). Jamais mise en cache.
 */
export const runtime = 'nodejs';
const ENTETES = { 'Cache-Control': 'private, no-store' } as const;
const json = (corps: unknown, status = 200): Response => Response.json(corps, { status, headers: ENTETES });

export async function GET(request: Request): Promise<Response> {
  const garde = await exigerMonEspace(request);
  if ('refus' in garde) return garde.refus;
  if (garde.auteurId === null) return json({ erreur: 'ACCES_REVOQUE' }, 403);
  try {
    return json({ etat: 'ok', data: await lireMesApporteurs(garde.auteurId) });
  } catch (e) {
    console.error('[mon-espace] apporteurs', e);
    return json({ etat: 'erreur', message: 'Lecture impossible.' }, 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerMonEspace(request);
  if ('refus' in garde) return garde.refus;
  if (garde.auteurId === null) return json({ erreur: 'ACCES_REVOQUE' }, 403);
  let corps: Record<string, unknown>;
  try { corps = (await request.json()) as Record<string, unknown>; } catch { return json({ etat: 'refus', motif: 'Requête illisible.' }, 400); }
  const id = Number(corps.apporteurId);
  try {
    const auteur = await auteurDeLaRequete(request);
    if (corps.action === 'creer') {
      const r = await creerApporteurMonEspace(garde.auteurId, (corps.apporteur ?? {}) as Record<string, unknown>, auteur);
      return r.ok ? json({ etat: 'ok', data: { id: r.id } }) : json({ etat: 'refus', motif: r.motif, ...(r.doublons ? { doublons: r.doublons } : {}) }, r.statut);
    }
    if (!Number.isInteger(id) || id <= 0) return json({ etat: 'refus', motif: 'Apporteur inconnu.' }, 400);
    if (corps.action === 'utiliser') {
      const r = await utiliserApporteur(garde.auteurId, id, auteur);
      return r.ok ? json({ etat: 'ok', data: null }) : json({ etat: 'refus', motif: r.motif }, r.statut);
    }
    if (corps.action === 'fiche') {
      const r = await modifierFicheMonEspace(garde.auteurId, id, corps.fiche, typeof corps.version === 'string' ? corps.version : null, auteur);
      return r.ok ? json({ etat: 'ok', data: r.data }) : json({ etat: r.statut === 409 ? 'conflit' : 'refus', motif: r.motif }, r.statut);
    }
    return json({ etat: 'refus', motif: 'Action inconnue.' }, 400);
  } catch (e) {
    console.error('[mon-espace] apporteurs (écriture)', e);
    return json({ etat: 'erreur', message: 'Enregistrement impossible.' }, 500);
  }
}
