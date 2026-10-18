import 'server-only';
import { exigerCompteActif } from '../../../../../../lib/admin/garde';
import { auteurDeLaRequete } from '../../../../../../lib/gestion/auteur';
import { enregistrerConditions } from '../../../../../../lib/gestion/honorairesGestionRepo';
import {
  ajouterAnnexe, enregistrerMandat, ficheBienLocation, ficheLocataireLocation, ficheProprietaireLocation, modifierBien, rattacherAnnexe,
} from '../../../../../../lib/location/locationRepo';
import { apercuArchivage, reactiverDansPortefeuille, sortirDuPortefeuille, type SujetPortefeuille } from '../../../../../../lib/location/portefeuilleRepo';
import { enregistrerEnGestion, modifierComplementsBien, syndicsConnus } from '../../../../../../lib/location/creationBienRepo';
import { detacherAnnexe } from '../../../../../../lib/location/entretienAnnexeRepo';

/**
 * /api/admin/gestion/annuaire/location — CE QUE LA TUILE LOCATION AVAIT AJOUTÉ AUX FICHES, SUR LA FICHE COMMUNE.
 *
 * 🔴 RÈGLE D'ARNO (17/10/2026) : « il ne doit exister QU'UN SEUL type de fiche propriétaire, locataire et bien : celles
 * du module Gestion, PARTAGÉES entre les tuiles Location et Gestion ». Les sections repliables de la fiche commune (N° de
 * mandat, « en gestion », informations complémentaires, annexes en arbre, loyer de départ et taux, sortie du
 * portefeuille) lisent et écrivent ICI — une route de la GESTION, gardée par `perm_gestion` comme toute la fiche, pour
 * qu'un compte « Gestion seule » ne tombe pas sur un refus. Mêmes fonctions du dépôt que la tuile Location.
 *
 * GET `?proprietaire=N` · `?lot=N` · `?locataire=N` · `?syndics=1` (syndics connus, pour le choix du syndic du bien) ·
 *   `?apercuArchivage=N&sujet=proprietaire|bien|locataire` (ce que la sortie fera : biens, locations en cours à clore…).
 * POST `{ action }` : numero-mandat · en-gestion · modifier-bien · complements-bien · ajouter-annexe · rattacher-annexe ·
 *   conditions-location · sortir (+ `confirmeOccupation`) | reactiver (SORTIE DU PORTEFEUILLE : jamais un effacement) · detacher-annexe (Arno, 18/10/2026 :
 *   une marque « louable séparément » ; le lien parent n'est jamais touché). `numero-mandat` prend `sorte: 'transaction'`.
 * 🔴 AUCUNE SUPPRESSION ni aucun envoi de mail n'est atteignable d'ici.
 */
export const runtime = 'nodejs';

const ENTETES = { 'Cache-Control': 'private, no-store' } as const;

function identifiant(brut: unknown): number | null {
  const s = typeof brut === 'number' ? String(brut) : typeof brut === 'string' ? brut : '';
  if (!/^[1-9]\d{0,15}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

export async function GET(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const url = new URL(request.url);
  try {
    const p = identifiant(url.searchParams.get('proprietaire'));
    if (p !== null) return Response.json(await ficheProprietaireLocation(p), { headers: ENTETES });
    const l = identifiant(url.searchParams.get('lot'));
    if (l !== null) return Response.json(await ficheBienLocation(l), { headers: ENTETES });
    const t = identifiant(url.searchParams.get('locataire'));
    if (t !== null) return Response.json(await ficheLocataireLocation(t), { headers: ENTETES });
    const a = identifiant(url.searchParams.get('apercuArchivage'));
    if (a !== null) {
      const s = url.searchParams.get('sujet');
      const ap = await apercuArchivage(s === 'locataire' || s === 'bien' ? s : 'proprietaire', a);
      return Response.json(ap === null ? { etat: 'inconnu' } : { etat: 'ok', data: ap }, { headers: ENTETES });
    }
    if (url.searchParams.get('syndics') !== null) return Response.json({ etat: 'ok', data: await syndicsConnus() }, { headers: ENTETES });
    return Response.json({ etat: 'refus', motif: 'Demande incomplète.' }, { status: 400, headers: ENTETES });
  } catch (e) {
    console.error('[api/admin/gestion/annuaire/location] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const refus = await exigerCompteActif(request, 'gestion');
  if (refus) return refus;
  const auteur = await auteurDeLaRequete(request);
  let corps: Record<string, unknown>;
  try {
    corps = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ etat: 'refus', motif: 'Demande illisible.' }, { status: 400, headers: ENTETES });
  }
  const id = identifiant(corps.id);
  const repondre = (x: unknown): Response => Response.json(x, { headers: ENTETES });
  const incomplet = (): Response => Response.json({ etat: 'refus', motif: 'Demande incomplète.' }, { status: 400, headers: ENTETES });
  try {
    switch (corps.action) {
      case 'numero-mandat':
        if (id === null) return incomplet();
        return repondre(await enregistrerMandat(id, corps.numeroMandat, auteur, corps.sorte === 'transaction' ? 'transaction' : 'gestion'));
      case 'detacher-annexe':
        if (id === null) return incomplet();
        return repondre(await detacherAnnexe(id, corps.detacher === true, auteur));
      case 'en-gestion':
        if (id === null) return incomplet();
        return repondre(await enregistrerEnGestion(id, corps.enGestion, auteur));
      case 'modifier-bien':
        if (id === null) return incomplet();
        return repondre(await modifierBien(id, (corps.champs ?? {}) as Record<string, unknown>, auteur));
      case 'complements-bien':
        if (id === null) return incomplet();
        return repondre(await modifierComplementsBien(id, (corps.champs ?? {}) as Record<string, unknown>, auteur));
      case 'ajouter-annexe':
        if (id === null) return incomplet();
        return repondre(await ajouterAnnexe(id, (corps.champs ?? {}) as Record<string, unknown>, auteur));
      case 'rattacher-annexe': {
        const annexe = identifiant(corps.annexeId);
        if (id === null || annexe === null) return incomplet();
        return repondre(await rattacherAnnexe(id, annexe, auteur));
      }
      case 'conditions-location': {
        const occ = identifiant(corps.occupationId);
        if (occ === null) return incomplet();
        return repondre(await enregistrerConditions(occ, (corps.conditions ?? {}) as Record<string, unknown>, auteur));
      }
      case 'sortir':
      case 'reactiver': {
        const quoi = corps.sujet === 'proprietaire' || corps.sujet === 'locataire' || corps.sujet === 'bien' ? corps.sujet as SujetPortefeuille : null;
        if (quoi === null || id === null) return incomplet();
        return repondre(corps.action === 'sortir' ? await sortirDuPortefeuille(quoi, id, auteur, { confirmeOccupation: corps.confirmeOccupation === true })
          : await reactiverDansPortefeuille(quoi, id, auteur));
      }
      default:
        return incomplet();
    }
  } catch (e) {
    console.error('[api/admin/gestion/annuaire/location] écriture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Enregistrement impossible : la base n’a pas répondu. Rien n’a été modifié.' }, { status: 503 });
  }
}
