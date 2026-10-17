import 'server-only';
import { exigerLocation } from '../../../../lib/location/garde';
import { auteurDeLaRequete } from '../../../../lib/gestion/auteur';
import type { RepartitionCoordonnee } from '../../../../lib/gestion/annuaireEdition';
import { archiverPersonne, modifierPersonne, separerPersonne } from '../../../../lib/gestion/annuaireEditionRepo';
import { enregistrerConditions } from '../../../../lib/gestion/honorairesGestionRepo';
import {
  ajouterAnnexe, chercherDoublons, creerProprietaireEtBiens, enregistrerMandat, ficheBienLocation,
  ficheLocataireLocation, ficheProprietaireLocation, listeBiens, listeLocataires, listeProprietaires, modifierBien,
  rattacherAnnexe, type CreationProprietaireBien,
} from '../../../../lib/location/locationRepo';
import {
  biensPourLocataire, creerLocataireSurBien, ficheSyndicLocation, reactiverDansPortefeuille, rechercherPortefeuille,
  sortirDuPortefeuille, type CreationLocataire, type SujetPortefeuille,
} from '../../../../lib/location/portefeuilleRepo';
import {
  creerBienComplet, creerProprietaires, modifierComplementsBien, proprietairesParIds, rechercherProprietaires, syndicsConnus, type CartesProprietaires,
} from '../../../../lib/location/creationBienRepo';

/**
 * /api/admin/location — LA PORTE DE LA TUILE LOCATION (correction d'Arno du 17/10/2026).
 *
 * 🔒 DROIT « Location » : `proxy.ts` refuse déjà sans lui ; `exigerLocation` le RELIT en base à chaque appel. Un
 * collaborateur qui n'a que la Location n'a pas besoin du droit Gestion : les écrans de la Location lisent et écrivent
 * les DONNÉES communes (personnes, biens, annexes, locations) par cette route-ci, avec les MÊMES fonctions du dépôt que
 * la Gestion — une modification d'un côté se voit de l'autre. Le courrier de la Gestion, lui, n'est jamais servi ici.
 *
 * GET : `?q=` recherche de l'accueil (personnes et syndics par nom / téléphone / e-mail ; biens du portefeuille par leur
 *       adresse) · `?liste=proprietaires|locataires|biens&page=&filtre=&anciens=1` · `?proprietaire=N` · `?locataire=N` ·
 *       `?lot=N` · `?syndic=N` · `?biensPourLocataire=texte` · `?telephone=&email=` (dédoublonnage à la saisie ; plusieurs
 *       valeurs possibles) · `?proprietairesRecherche=texte` · `?proprietairesIds=1,2` · `?syndics=1`.
 * POST `{ action }` : modifier | archiver | restaurer | separer (une personne) · numero-mandat · modifier-bien ·
 *       ajouter-annexe · rattacher-annexe · creer (propriétaire + bien + annexes) · creer-locataire · conditions-location ·
 *       sortir | reactiver (SORTIE DU PORTEFEUILLE : jamais un effacement) · creer-proprietaires (cartes) · creer-bien · complements-bien
 *       (formulaire complet).
 * 🔴 AUCUNE SUPPRESSION n'est atteignable d'ici.
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
  const garde = await exigerLocation(request);
  if ('refus' in garde) return garde.refus;
  const url = new URL(request.url);
  const p = (k: string): string | null => url.searchParams.get(k);
  try {
    const idProp = identifiant(p('proprietaire'));
    if (idProp !== null) return Response.json(await ficheProprietaireLocation(idProp), { headers: ENTETES });
    const idLoc = identifiant(p('locataire'));
    if (idLoc !== null) return Response.json(await ficheLocataireLocation(idLoc), { headers: ENTETES });
    const idLot = identifiant(p('lot'));
    if (idLot !== null) return Response.json(await ficheBienLocation(idLot), { headers: ENTETES });
    const idSyndic = identifiant(p('syndic'));
    if (idSyndic !== null) {
      const f = await ficheSyndicLocation(idSyndic);
      return Response.json(f === null ? { etat: 'inconnu' } : { etat: 'ok', data: f }, { headers: ENTETES });
    }
    if (p('biensPourLocataire') !== null) {
      return Response.json({ etat: 'ok', data: await biensPourLocataire((p('biensPourLocataire') ?? '').slice(0, 100)) }, { headers: ENTETES });
    }
    if (p('proprietairesRecherche') !== null) {
      return Response.json({ etat: 'ok', data: await rechercherProprietaires((p('proprietairesRecherche') ?? '').slice(0, 200)) }, { headers: ENTETES });
    }
    if (p('proprietairesIds') !== null) {
      const ids = (p('proprietairesIds') ?? '').split(',').map((x) => identifiant(x.trim())).filter((x): x is number => x !== null);
      return Response.json({ etat: 'ok', data: await proprietairesParIds(ids) }, { headers: ENTETES });
    }
    if (p('syndics') !== null) return Response.json({ etat: 'ok', data: await syndicsConnus() }, { headers: ENTETES });
    if (p('telephone') !== null || p('email') !== null) {
      // Plusieurs valeurs possibles (une carte peut porter deux téléphones) ; bornées.
      const doublons = await chercherDoublons([
        ...url.searchParams.getAll('telephone').slice(0, 10).map((v) => ({ sorte: 'telephone' as const, valeur: v.slice(0, 60) })),
        ...url.searchParams.getAll('email').slice(0, 10).map((v) => ({ sorte: 'email' as const, valeur: v.slice(0, 200) })),
      ]);
      return Response.json({ etat: 'ok', data: doublons }, { headers: ENTETES });
    }
    const liste = p('liste');
    if (liste === 'proprietaires' || liste === 'locataires' || liste === 'biens') {
      const page = Math.max(0, Math.min(1000, Number(p('page') ?? '0') || 0));
      const filtre = (p('filtre') ?? '').slice(0, 100);
      const anciens = p('anciens') === '1';
      const data = liste === 'proprietaires' ? await listeProprietaires(page, filtre, anciens)
        : liste === 'locataires' ? await listeLocataires(page, filtre, anciens) : await listeBiens(page, filtre, anciens);
      return Response.json({ etat: 'ok', data }, { headers: ENTETES });
    }
    return Response.json({ etat: 'ok', data: await rechercherPortefeuille((p('q') ?? '').slice(0, 200)) }, { headers: ENTETES });
  } catch (e) {
    console.error('[api/admin/location] lecture impossible', e);
    return Response.json({ etat: 'erreur', message: 'Lecture impossible : la base n’a pas répondu.' }, { status: 503 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const garde = await exigerLocation(request);
  if ('refus' in garde) return garde.refus;
  const auteur = await auteurDeLaRequete(request);
  let corps: Record<string, unknown>;
  try {
    corps = await request.json() as Record<string, unknown>;
  } catch {
    return Response.json({ etat: 'refus', motif: 'Demande illisible.' }, { status: 400, headers: ENTETES });
  }
  const action = typeof corps.action === 'string' ? corps.action : '';
  const sujet = corps.sujet === 'proprietaire' || corps.sujet === 'locataire' ? corps.sujet : null;
  const id = identifiant(corps.id);
  const repondre = (x: unknown): Response => Response.json(x, { headers: ENTETES });
  const incomplet = (): Response => Response.json({ etat: 'refus', motif: 'Demande incomplète.' }, { status: 400, headers: ENTETES });
  try {
    switch (action) {
      case 'modifier':
        if (sujet === null || id === null) return incomplet();
        return repondre(await modifierPersonne(sujet, id, (corps.champs ?? {}) as Parameters<typeof modifierPersonne>[2], auteur));
      case 'archiver':
      case 'restaurer':
        if (sujet === null || id === null) return incomplet();
        return repondre(await archiverPersonne(sujet, id, action === 'archiver', auteur));
      case 'separer': {
        if (sujet === null || id === null) return incomplet();
        const repartition = Array.isArray(corps.repartition) ? corps.repartition as RepartitionCoordonnee[] : [];
        return repondre(await separerPersonne(sujet, id, {
          premier: typeof corps.premier === 'string' ? corps.premier : '',
          second: typeof corps.second === 'string' ? corps.second : '', repartition,
        }, auteur));
      }
      case 'numero-mandat':
        if (id === null) return incomplet();
        return repondre(await enregistrerMandat(id, corps.numeroMandat, auteur));
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
      case 'creer':
        return repondre(await creerProprietaireEtBiens({
          proprietaireId: identifiant(corps.proprietaireId),
          proprietaire: (corps.proprietaire ?? {}) as CreationProprietaireBien['proprietaire'],
          logement: (corps.logement ?? {}) as Record<string, unknown>,
          annexes: Array.isArray(corps.annexes) ? (corps.annexes as Record<string, unknown>[]).slice(0, 20) : [],
        }, auteur));
      case 'creer-locataire':
        return repondre(await creerLocataireSurBien({
          locataireId: identifiant(corps.locataireId), lotId: identifiant(corps.lotId),
          locataire: (corps.locataire ?? {}) as CreationLocataire['locataire'],
          entree: typeof corps.entree === 'string' ? corps.entree : null,
        }, auteur));
      case 'creer-proprietaires':
        return repondre(await creerProprietaires({
          cartes: Array.isArray(corps.cartes) ? (corps.cartes as CartesProprietaires['cartes']).slice(0, 12) : [],
          existants: Array.isArray(corps.existants) ? (corps.existants as unknown[]).map(identifiant).filter((x): x is number => x !== null).slice(0, 12) : [],
          numeroMandat: typeof corps.numeroMandat === 'string' ? corps.numeroMandat : null,
          enGestion: typeof corps.enGestion === 'boolean' ? corps.enGestion : null,
        }, auteur));
      case 'creer-bien':
        return repondre(await creerBienComplet({
          proprietaireIds: Array.isArray(corps.proprietaireIds) ? (corps.proprietaireIds as unknown[]).map(identifiant).filter((x): x is number => x !== null).slice(0, 12) : [],
          logement: (corps.logement ?? {}) as Record<string, unknown>,
          annexes: Array.isArray(corps.annexes) ? (corps.annexes as Record<string, unknown>[]).slice(0, 20) : [],
        }, auteur));
      case 'sortir':
      case 'reactiver': {
        const quoi = corps.sujet === 'proprietaire' || corps.sujet === 'locataire' || corps.sujet === 'bien' ? corps.sujet as SujetPortefeuille : null;
        if (quoi === null || id === null) return incomplet();
        return repondre(action === 'sortir' ? await sortirDuPortefeuille(quoi, id, auteur) : await reactiverDansPortefeuille(quoi, id, auteur));
      }
      case 'conditions-location': {
        const occ = identifiant(corps.occupationId);
        if (occ === null) return incomplet();
        return repondre(await enregistrerConditions(occ, (corps.conditions ?? {}) as Record<string, unknown>, auteur));
      }
      default:
        return incomplet();
    }
  } catch (e) {
    console.error('[api/admin/location] écriture impossible', e);
    return Response.json(
      { etat: 'erreur', message: 'Enregistrement impossible : la base n’a pas répondu. Rien n’a été modifié.' }, { status: 503 });
  }
}
