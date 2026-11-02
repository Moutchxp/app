import { exigerMonEspace } from '../../../../../lib/mon-espace/garde';
import { creerCompromisMonEspace } from '../../../../../lib/mon-espace/creationRepo';
import { modifierDepuisMonEspace } from '../../../../../lib/mon-espace/modificationRepo';
import { auteurDeLaRequete } from '../../../../../lib/gestion/auteur';
import { aujourdhuiParis } from '../../../../../lib/location/suivi/suivi';
import { lireDossier } from '../../../../../lib/transaction/saisie';
import { estDoublonMandat } from '../../../../../lib/transaction/mandatRepo';
import { MOTIF_DOUBLON_MANDAT } from '../../../../../lib/transaction/mandat';

/**
 * 🔴 MON ESPACE, LOT 5 — POST /api/admin/mon-espace/compromis { dossier } : CRÉER un compromis depuis « Mon espace ». La saisie est lue par
 * `lireDossier` et enregistrée par `enregistrerDossier` — les fonctions de la tuile Suivi CA, telles quelles ; « Mon espace » exige en plus une
 * création de compromis, le n° de mandat, et (collaborateur) d'être soi-même sur un côté (`refusCreation`). Un n° déjà pris dans la structure :
 * 422 avec le résumé de la vente. Droit « Mon espace » (proxy, puis relu en base) ; un observateur est refusé par le proxy.
 * 🔴 LOT 6 — `id` présent : MODIFIER l'affaire (négociateur présent, ou administrateur ; 403 sinon), ou la REJOINDRE (`rejoindre: { numero }`,
 * un côté libre) ; `version` : la garde de version (409 si un collègue a enregistré entre-temps). Même fonction d'écriture que la tuile.
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
  const id = corps.id == null ? null : Number(corps.id);
  if (id !== null && (!Number.isInteger(id) || id <= 0)) return json({ etat: 'refus', motif: 'Affaire inconnue.' }, 400);
  const d = lireDossier(corps.dossier);
  if (!d.ok) return json({ etat: 'refus', motif: d.motif }, 422);
  const version = typeof corps.version === 'number' && Number.isInteger(corps.version) && corps.version >= 0 ? corps.version : null;
  const brut = corps.rejoindre as { numero?: unknown } | null | undefined;
  const rejoindre = brut != null && typeof brut.numero === 'string' ? { numero: brut.numero } : null;
  try {
    const auteur = await auteurDeLaRequete(request);
    const r = id === null
      ? await creerCompromisMonEspace(garde.auteurId, d.valeur, aujourdhuiParis(), auteur)
      : await modifierDepuisMonEspace(garde.auteurId, id, d.valeur, { version, rejoindre }, aujourdhuiParis(), auteur);
    return r.ok ? json({ etat: 'ok', data: r.id }) : json({ etat: 'refus', motif: r.motif, ...(r.statut === 409 ? { conflit: true } : {}) }, r.statut);
  } catch (e) {
    if (estDoublonMandat(e)) return json({ etat: 'refus', motif: MOTIF_DOUBLON_MANDAT }, 422);
    console.error('[mon-espace] création', e);
    return json({ etat: 'erreur', message: 'Enregistrement impossible.' }, 500);
  }
}
