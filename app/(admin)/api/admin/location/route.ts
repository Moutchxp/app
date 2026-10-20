import 'server-only';
import { exigerLocation } from '../../../../lib/location/garde';
import { exigerCompteActif } from '../../../../lib/admin/garde';
import { annulerPreavis, corrigerPreavis, enregistrerEtatDesLieux, enregistrerPreavis, lireChoix, preavisDuBail, preavisEnCours } from '../../../../lib/location/preavisRepo';
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
  apercuArchivage, apercuSortieBiens, biensPourLocataire, biensPourSortie, sortirBiensDuPortefeuille, creerLocataireSurBien, creerLocatairesSurBien, ficheSyndicLocation, reactiverDansPortefeuille, rechercherPortefeuille,
  sortirDuPortefeuille, type CreationLocataire, type SujetPortefeuille,
} from '../../../../lib/location/portefeuilleRepo';
import {
  creerBienComplet, creerProprietaires, enregistrerEnGestion, modifierComplementsBien, proprietairesParIds, rechercherProprietaires, syndicsConnus, type CartesProprietaires,
} from '../../../../lib/location/creationBienRepo';
import type { ContactSaisi } from '../../../../lib/location/contactsLocationRepo';
import { ajouterContactSyndic, syndicsPourAdresse, type NouveauContactSyndic, type SyndicDuBien } from '../../../../lib/location/syndicLocationRepo';
import { cartesDeProprietaires, personnesARattacher } from '../../../../lib/location/rattachementProprietairesRepo';
import { lireAgPourAdresse } from '../../../../lib/location/immeubleAgRepo';
import { detacherAnnexe } from '../../../../lib/location/entretienAnnexeRepo';
import { avecMail } from '../../../../lib/location/mailPortefeuilleRepo';
import { verifierOrigine } from '../../../../lib/location/archivage';
import {
  annulerSortie, bauxDuLocataire, corrigerSortie, encartDuBail, enregistrerSortie, lireBail, notifierSortie, rechercherOccupants,
} from '../../../../lib/location/sortieLocatairesRepo';
import { confiablesEdls, deplacerEdls, planifierEdls, reattribuerEdls } from '../../../../lib/location/edlsRepo';
import { envoyerAuxInvites, envoyerSiAutorise } from '../../../../lib/gestion/acceptationAutorisee';
import { synchroniserApresGeste } from '../../../../lib/gestion/agendaSynchroRepo';
import { ficheDuBienPourBail, refusSansRegroupement } from '../../../../lib/location/regroupementRepo';
import { planifierBail } from '../../../../lib/location/regroupement';
import { conditionsEntreeDisponible } from '../../../../lib/location/conditionsEntreeRepo';
import { calculHonorairesDuBien } from '../../../../lib/location/honorairesProprietaireRepo';

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
 *       valeurs possibles) · `?proprietairesRecherche=texte` · `?proprietairesIds=1,2` · `?syndics=1` · `?personnesLiees=N` (« Qui
 *       rattacher à ce bien ? ») · `?cartesProprietaires=1,2` · `?agPourAdresse=texte` (dernière AG connue de l'immeuble) ·
 *       `?apercuArchivage=N&sujet=proprietaire|bien|locataire` (ce que l'archivage fera) · `?proprietairesArchivage=texte` (recherche
 *       limitée aux propriétaires, adresse de leurs biens comprise) · `?biensPourSortie=N` · `?apercuSortieBiens=N&lots=1,2`.
 * POST `{ action }` : modifier | archiver | restaurer | separer (une personne) · numero-mandat · modifier-bien ·
 *       ajouter-annexe · rattacher-annexe · creer (propriétaire + bien + annexes) · creer-locataire · conditions-location ·
 *       sortir (+ `confirmeOccupation` si une location est en cours ; + `origine` pour un propriétaire, obligatoire) | reactiver (SORTIE DU PORTEFEUILLE : jamais un effacement) · creer-proprietaires (cartes) · creer-bien (avec les contacts du propriétaire) · creer-locataires
 *       (cartes clients + contacts du locataire) · complements-bien
 *       (formulaire complet) · ajouter-contact-syndic (annuaire du syndic de la Gestion) · detacher-annexe (marque, lien gardé) ·
 *       sortir-biens (`proprietaireId`, `lotIds`, `origine` obligatoire, `confirmeOccupation` — tous ses biens ⇒ archivage du propriétaire).
 * SORTIE D'UN OU PLUSIEURS LOCATAIRES (Arno, 19/10/2026) — GET `?occupants=texte` (les seuls occupants en place) · `?bail=N`
 *       (le bail d'une occupation) · `?encartBail=N` (l'encart « Le logement » de l'écran de sortie) · `?bauxLocataire=N` ; POST `sortie-locataires` (`occupationId`, `sortants`, `date` ; + mail de
 *       confirmation, jamais bloquant) · `corriger-sortie-locataires` (`occupationIds`, `date`) · `annuler-sortie-locataires` (`occupationIds`).
 * 🔴 AUCUNE SUPPRESSION n'est atteignable d'ici.
 */
export const runtime = 'nodejs';

/** Le refus d'une validation de sortie par un compte sans la tuile Gestion (décision d'Arno du 18/10/2026). */
const MOTIF_SORTIE_GESTION = 'La sortie est validée par un utilisateur de la Gestion.';

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
    // Sortie d'un ou plusieurs locataires (Arno, 19/10/2026) — LECTURE SEULE.
    if (p('occupants') !== null) {
      return Response.json({ etat: 'ok', data: await rechercherOccupants((p('occupants') ?? '').slice(0, 200)) }, { headers: ENTETES });
    }
    const idBail = identifiant(p('bail'));
    if (idBail !== null) {
      const b = await lireBail(idBail);
      return Response.json(b === null ? { etat: 'inconnu' } : { etat: 'ok', data: b }, { headers: ENTETES });
    }
    // Le bloc « Locataires en préavis » de l'accueil (Arno, 18/10/2026) — LECTURE SEULE.
    if (p('preavisEnCours') !== null) return Response.json({ etat: 'ok', data: await preavisEnCours() }, { headers: ENTETES });
    // Arno (20/10/2026) — le bloc « Conditions d'entrée » : la migration 391 est-elle là ? (sinon l'écran le dit, et crée comme avant)
    if (p('conditionsEntreeDisponible') !== null) return Response.json({ etat: 'ok', data: await conditionsEntreeDisponible() }, { headers: ENTETES });
    // Arno (20/10/2026) — les HONORAIRES PROPRIÉTAIRE du bien loué à la date d'entrée (barème daté, zone, surface) — LECTURE SEULE.
    const idHono = identifiant(p('honorairesProprietaire'));
    if (idHono !== null) {
      const h = await calculHonorairesDuBien(idHono, p('entree'));
      return Response.json(h === null ? { etat: 'inconnu' } : { etat: 'ok', data: h }, { headers: ENTETES });
    }
    // Les lots d'un bien pour le bail d'un nouveau locataire (Arno, 19/10/2026) — LECTURE SEULE : type, étage, n°, état.
    const idLotsBail = identifiant(p('lotsBail'));
    if (idLotsBail !== null) {
      const f = await ficheDuBienPourBail(idLotsBail);
      return Response.json(f === null ? { etat: 'inconnu' } : { etat: 'ok', data: f }, { headers: ENTETES });
    }
    // « Confier à » l'état des lieux de sortie (Arno, 19/10/2026) — LECTURE SEULE : Location ET Gestion ET Workspace.
    if (p('edlsConfiables') !== null) {
      return Response.json({ etat: 'ok', data: await confiablesEdls((await auteurDeLaRequete(request)).id) }, { headers: ENTETES });
    }
    // Le préavis d'un bail (Arno, 18/10/2026) — LECTURE SEULE : durée proposée, locataires, préavis ouverts.
    const idPreavis = identifiant(p('preavisBail'));
    if (idPreavis !== null) {
      const d = await preavisDuBail(idPreavis);
      return Response.json(d === null ? { etat: 'inconnu' } : { etat: 'ok', data: d }, { headers: ENTETES });
    }
    const idEncart = identifiant(p('encartBail'));
    if (idEncart !== null) {
      const e = await encartDuBail(idEncart);
      return Response.json(e === null ? { etat: 'inconnu' } : { etat: 'ok', data: e }, { headers: ENTETES });
    }
    const idBaux = identifiant(p('bauxLocataire'));
    if (idBaux !== null) return Response.json({ etat: 'ok', data: await bauxDuLocataire(idBaux) }, { headers: ENTETES });
    const idLoc = identifiant(p('locataire'));
    if (idLoc !== null) return Response.json(await ficheLocataireLocation(idLoc), { headers: ENTETES });
    const idLot = identifiant(p('lot'));
    if (idLot !== null) return Response.json(await ficheBienLocation(idLot), { headers: ENTETES });
    const idSyndic = identifiant(p('syndic'));
    if (idSyndic !== null) {
      const f = await ficheSyndicLocation(idSyndic);
      return Response.json(f === null ? { etat: 'inconnu' } : { etat: 'ok', data: f }, { headers: ENTETES });
    }
    // « Archiver un propriétaire » (Arno, 18/10/2026) — LECTURE SEULE : ce que l'archivage fera (biens, locations en cours…).
    const idArch = identifiant(p('apercuArchivage'));
    if (idArch !== null) {
      const sujet = p('sujet') === 'locataire' || p('sujet') === 'bien' ? p('sujet') as SujetPortefeuille : 'proprietaire';
      const a = await apercuArchivage(sujet, idArch);
      return Response.json(a === null ? { etat: 'inconnu' } : { etat: 'ok', data: a }, { headers: ENTETES });
    }
    // « Supprimer un des biens d'un propriétaire » (Arno, 18/10/2026) — LECTURE SEULE : ses biens actifs, puis l'aperçu d'une sélection.
    const idBiens = identifiant(p('biensPourSortie'));
    if (idBiens !== null) {
      const b = await biensPourSortie(idBiens);
      return Response.json(b === null ? { etat: 'inconnu' } : { etat: 'ok', data: b }, { headers: ENTETES });
    }
    const idSortie = identifiant(p('apercuSortieBiens'));
    if (idSortie !== null) {
      const lots = (p('lots') ?? '').split(',').map((x) => identifiant(x.trim())).filter((x): x is number => x !== null).slice(0, 200);
      return Response.json(await apercuSortieBiens(idSortie, lots), { headers: ENTETES });
    }
    if (p('proprietairesArchivage') !== null) {
      return Response.json({ etat: 'ok', data: await rechercherPortefeuille((p('proprietairesArchivage') ?? '').slice(0, 200), { proprietairesSeuls: true }) }, { headers: ENTETES });
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
    // « Qui rattacher à ce bien ? » (Arno, 18/10/2026) — LECTURE SEULE.
    const idLiees = identifiant(p('personnesLiees'));
    if (idLiees !== null) {
      const d = await personnesARattacher(idLiees);
      return Response.json(d === null ? { etat: 'inconnu' } : { etat: 'ok', data: d }, { headers: ENTETES });
    }
    if (p('cartesProprietaires') !== null) {
      const ids = (p('cartesProprietaires') ?? '').split(',').map((x) => identifiant(x.trim())).filter((x): x is number => x !== null);
      return Response.json({ etat: 'ok', data: await cartesDeProprietaires(ids) }, { headers: ENTETES });
    }
    if (p('agPourAdresse') !== null) {
      return Response.json({ etat: 'ok', data: await lireAgPourAdresse((p('agPourAdresse') ?? '').slice(0, 300)) }, { headers: ENTETES });
    }
    if (p('syndics') !== null) return Response.json({ etat: 'ok', data: await syndicsConnus() }, { headers: ENTETES });
    // « Syndic déjà connu pour cette adresse » (fonction de la Gestion) — LECTURE SEULE, jamais de rattachement sans clic.
    if (p('syndicPourAdresse') !== null) {
      return Response.json({ etat: 'ok', data: await syndicsPourAdresse({
        libelle: (p('syndicPourAdresse') ?? '').slice(0, 300), codePostal: (p('cp') ?? '').slice(0, 10), commune: (p('commune') ?? '').slice(0, 120),
      }) }, { headers: ENTETES });
    }
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
        return repondre(await enregistrerMandat(id, corps.numeroMandat, auteur, corps.sorte === 'transaction' ? 'transaction' : 'gestion'));
      case 'modifier-bien':
        if (id === null) return incomplet();
        return repondre(await modifierBien(id, (corps.champs ?? {}) as Record<string, unknown>, auteur));
      case 'en-gestion':
        if (id === null) return incomplet();
        return repondre(await enregistrerEnGestion(id, corps.enGestion, auteur));
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
      case 'creer': {
        const r = await creerProprietaireEtBiens({
          proprietaireId: identifiant(corps.proprietaireId),
          proprietaire: (corps.proprietaire ?? {}) as CreationProprietaireBien['proprietaire'],
          logement: (corps.logement ?? {}) as Record<string, unknown>,
          annexes: Array.isArray(corps.annexes) ? (corps.annexes as Record<string, unknown>[]).slice(0, 20) : [],
        }, auteur);
        // Nouveau mandat de gestion : un mail SEULEMENT si un propriétaire est « en gestion = Oui » (Arno, 18/10/2026).
        return repondre(await avecMail(r, r.etat !== 'ok' ? null : {
          sens: 'entree', proprietaireId: r.data.proprietaireId, lotIds: [r.data.logementId], origine: null, exigerEnGestion: true, avecAnnexes: true }, { auteur, tuile: 'Location' }));
      }
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
          numeroMandatTransaction: typeof corps.numeroMandatTransaction === 'string' ? corps.numeroMandatTransaction : null,
        }, auteur));
      case 'detacher-annexe':
        // « Détacher » / « Rattacher » une annexe (Arno, 18/10/2026) : une marque ; le lien parent n'est jamais touché.
        if (id === null) return incomplet();
        return repondre(await detacherAnnexe(id, corps.detacher === true, auteur));
      case 'creer-bien': {
        const r = await creerBienComplet({
          proprietaireIds: Array.isArray(corps.proprietaireIds) ? (corps.proprietaireIds as unknown[]).map(identifiant).filter((x): x is number => x !== null).slice(0, 12) : [],
          logement: (corps.logement ?? {}) as Record<string, unknown>,
          annexes: Array.isArray(corps.annexes) ? (corps.annexes as Record<string, unknown>[]).slice(0, 20) : [],
          contacts: Array.isArray(corps.contacts) ? (corps.contacts as ContactSaisi[]).slice(0, 20) : [],
          syndic: corps.syndic !== null && typeof corps.syndic === 'object' ? corps.syndic as SyndicDuBien : null,
          contactsExistants: Array.isArray(corps.contactsExistants) ? (corps.contactsExistants as unknown[]).map(identifiant).filter((x): x is number => x !== null).slice(0, 40) : [],
          // « Bien en gestion ? » (Arno, 20/10/2026) : envoyé par l'écran, Oui / Non exigé ; absent = « en gestion ».
          enGestion: corps.enGestion,
        }, auteur);
        // Nouveau mandat de gestion : un mail SEULEMENT si un des propriétaires est « en gestion = Oui » (Arno, 18/10/2026).
        return repondre(await avecMail(r, r.etat !== 'ok' ? null : {
          sens: 'entree', proprietaireId: null, lotIds: [r.data.logementId, ...r.data.annexes], origine: null, exigerEnGestion: true }, { auteur, tuile: 'Location' }));
      }
      case 'ajouter-contact-syndic': {
        const syndicId = identifiant(corps.syndicId);
        if (syndicId === null || corps.contact === null || typeof corps.contact !== 'object') return incomplet();
        return repondre(await ajouterContactSyndic(syndicId, corps.contact as NouveauContactSyndic, auteur));
      }
      case 'creer-locataires':
        return repondre(await creerLocatairesSurBien({
          cartes: Array.isArray(corps.cartes) ? (corps.cartes as ContactSaisi[]).slice(0, 12) : [],
          existants: Array.isArray(corps.existants) ? (corps.existants as unknown[]).map(identifiant).filter((x): x is number => x !== null).slice(0, 12) : [],
          contacts: Array.isArray(corps.contacts) ? (corps.contacts as ContactSaisi[]).slice(0, 20) : [],
          lotId: identifiant(corps.lotId), entree: typeof corps.entree === 'string' ? corps.entree : null,
          // Arno (19/10/2026) — les lots loués cochés (logement et/ou annexes).
          ...(Array.isArray(corps.lotIds) ? { lotIds: (corps.lotIds as unknown[]).map(identifiant).filter((x): x is number => x !== null).slice(0, 30) } : {}),
          // Arno (20/10/2026) — bloc 3 « Conditions d'entrée » et l'entretien à prévoir du bien (envoyés seulement s'ils sont posés).
          ...(corps.conditions !== undefined && corps.conditions !== null ? { conditions: corps.conditions } : {}),
          ...(corps.entretien !== null && typeof corps.entretien === 'object'
            ? { entretien: { aPrevoir: (corps.entretien as Record<string, unknown>).aPrevoir, entretiens: (corps.entretien as Record<string, unknown>).entretiens } } : {}),
        }, auteur));
      case 'apercu-lots': {
        // Arno (19/10/2026) — LE RÉCAPITULATIF avant validation : ce que le bail fera des lots (LECTURE SEULE, rien n'est écrit).
        const lot = identifiant(corps.lotId);
        if (lot === null) return incomplet();
        const fiche = await ficheDuBienPourBail(lot);
        if (fiche === null) return repondre({ etat: 'inconnu' });
        const lots = Array.isArray(corps.lotIds) ? (corps.lotIds as unknown[]).map(identifiant).filter((x): x is number => x !== null).slice(0, 30) : [];
        const plan = planifierBail(fiche, lots);
        if (!plan.ok) return repondre({ etat: 'refus', motif: plan.motif });
        const sans = await refusSansRegroupement(plan.plan);
        return repondre(sans !== null ? { etat: 'refus', motif: sans } : { etat: 'ok', data: { recap: plan.plan.recap } });
      }
      case 'sortir':
      case 'reactiver': {
        const quoi = corps.sujet === 'proprietaire' || corps.sujet === 'locataire' || corps.sujet === 'bien' ? corps.sujet as SujetPortefeuille : null;
        if (quoi === null || id === null) return incomplet();
        // Arno (18/10/2026) : un mail de confirmation à chaque sortie / retour d'un propriétaire ou d'un bien (jamais bloquant).
        const ctx = { auteur, tuile: 'Location' as const };
        if (action === 'sortir') {
          const r = await sortirDuPortefeuille(quoi, id, auteur, { confirmeOccupation: corps.confirmeOccupation === true, origine: corps.origine });
          return repondre(await avecMail(r, quoi === 'locataire' || r.etat !== 'ok' ? null : {
            sens: 'sortie', proprietaireId: quoi === 'proprietaire' ? id : null, lotIds: r.data.lots ?? [],
            origine: quoi === 'proprietaire' ? verifierOrigine(corps.origine) : null }, ctx));
        }
        const r = await reactiverDansPortefeuille(quoi, id, auteur);
        return repondre(await avecMail(r, quoi === 'locataire' || r.etat !== 'ok' ? null : {
          sens: 'entree', reactivation: true, proprietaireId: quoi === 'proprietaire' ? id : null, lotIds: r.data.lots ?? [], origine: null }, ctx));
      }
      case 'sortir-biens': {
        const proprietaire = identifiant(corps.proprietaireId);
        if (proprietaire === null) return incomplet();
        const lots = Array.isArray(corps.lotIds) ? (corps.lotIds as unknown[]).map(identifiant).filter((x): x is number => x !== null).slice(0, 200) : [];
        const r = await sortirBiensDuPortefeuille(proprietaire, lots, auteur, { confirmeOccupation: corps.confirmeOccupation === true, origine: corps.origine });
        return repondre(await avecMail(r, r.etat !== 'ok' ? null : {
          sens: 'sortie', proprietaireId: proprietaire, lotIds: r.data.lots ?? [], origine: verifierOrigine(corps.origine) }, { auteur, tuile: 'Location' }));
      }
      case 'sortie-locataires': {
        // 🔴 DÉCISION D'ARNO DU 18/10/2026 : la sortie OFFICIELLE est validée par un utilisateur de la GESTION — droit RELU EN BASE
        //    ici (pas seulement masqué à l'écran). Un compte « Location seule » enregistre, corrige ou annule un PRÉAVIS, pas une sortie.
        if (await exigerCompteActif(request, 'gestion') !== null) {
          return Response.json({ etat: 'refus', motif: MOTIF_SORTIE_GESTION }, { status: 403, headers: ENTETES });
        }
        // Arno (19/10/2026) : la sortie d'abord ; le mail ENSUITE, jamais bloquant — un échec est rendu, jamais un faux « envoyé ».
        const occ = identifiant(corps.occupationId);
        if (occ === null) return incomplet();
        const sortants = Array.isArray(corps.sortants) ? (corps.sortants as unknown[]).map(identifiant).filter((x): x is number => x !== null).slice(0, 20) : [];
        const r = await enregistrerSortie({ occupationId: occ, sortants, date: corps.date }, auteur);
        if (r.etat !== 'ok') return repondre(r);
        const m = await notifierSortie(r.data, auteur);
        return repondre({ etat: 'ok', data: { date: r.data.date, vacant: r.data.vacant, restants: r.data.restants,
          ...((r.data.reintegrations ?? []).length > 0 ? { reintegrations: r.data.reintegrations } : {}) }, mail: { envoye: m.envoye, ignore: false, motif: m.motif } });
      }
      case 'corriger-sortie-locataires':
      case 'annuler-sortie-locataires': {
        const ids = Array.isArray(corps.occupationIds) ? (corps.occupationIds as unknown[]).map(identifiant).filter((x): x is number => x !== null).slice(0, 40) : [];
        if (ids.length === 0) return incomplet();
        return repondre(action === 'corriger-sortie-locataires' ? await corrigerSortie({ occupationIds: ids, date: corps.date }, auteur)
          : await annulerSortie({ occupationIds: ids }, auteur));
      }
      // LE PRÉAVIS (Arno, 18/10/2026) : ouvert aux comptes Location — enregistrer, corriger, annuler (journalisés, rien d'effacé).
      case 'enregistrer-preavis': {
        const occs = Array.isArray(corps.occupationIds) ? (corps.occupationIds as unknown[]).map(identifiant).filter((x): x is number => x !== null).slice(0, 20) : [];
        return repondre(await enregistrerPreavis({ occupationIds: occs, recuLe: corps.recuLe, choix: lireChoix(corps.choix), motif: corps.motif }, auteur));
      }
      case 'corriger-preavis': {
        const pid = identifiant(corps.preavisId);
        if (pid === null) return incomplet();
        return repondre(await corrigerPreavis({ preavisId: pid, recuLe: corps.recuLe, choix: lireChoix(corps.choix), motif: corps.motif }, auteur));
      }
      case 'annuler-preavis': {
        const pid = identifiant(corps.preavisId);
        if (pid === null) return incomplet();
        return repondre(await annulerPreavis({ preavisId: pid }, auteur));
      }
      case 'planifier-edls':
      case 'deplacer-edls':
      case 'reattribuer-edls': {
        /* 🔴 Arno (19/10/2026) — l'état des lieux de sortie PLANIFIÉ : une tâche du module de tâches de la Gestion. Après
           l'écriture, EXACTEMENT ce que font les routes des tâches : le mail de demande (canal existant, droit d'envoi au nom
           de gestion@ relu, mode RECETTE respecté), puis l'agenda Google — un échec de l'un n'annule jamais le geste. */
        const occs = Array.isArray(corps.occupationIds) ? (corps.occupationIds as unknown[]).map(identifiant).filter((x): x is number => x !== null).slice(0, 20) : [];
        const texte = (x: unknown): string => (typeof x === 'string' ? x.trim() : '');
        const confieA = identifiant(corps.confieA);
        const r = action === 'planifier-edls'
          ? await planifierEdls({ occupationIds: occs, jour: texte(corps.jour), debut: texte(corps.debut), fin: texte(corps.fin), confieA, commentaire: typeof corps.commentaire === 'string' ? corps.commentaire : null }, auteur)
          : action === 'deplacer-edls'
            ? await deplacerEdls({ occupationIds: occs, jour: texte(corps.jour), debut: texte(corps.debut), fin: texte(corps.fin), confieA }, auteur)
            : await reattribuerEdls({ occupationIds: occs, confieA }, auteur);
        if (r.etat !== 'ok') return repondre(r);
        let mails: { destinataire: string; etat: string }[] = [];
        if (r.demandes !== undefined) mails = await envoyerAuxInvites(request, r.demandes);
        else {
          const m = await envoyerSiAutorise(request, r.demande);
          if (m !== null) mails = [{ destinataire: r.demande?.destinataireLibelle ?? '', etat: m }];
        }
        const agenda = await synchroniserApresGeste(r.tacheId);
        // Le statut de la demande posée (« en attente », ou « acceptée » d'office quand on se la confie) : la ligne change aussitôt.
        const statut = r.demandes?.[0]?.statut ?? r.demande?.statut ?? null;
        return repondre({ etat: 'ok', data: { ...r.data, statut, mails, agenda: agenda.trim() } });
      }
      case 'etat-des-lieux': {
        // La date d'état des lieux de sortie prévu (accueil, 18/10/2026) : saisie, modifiée ou effacée, journalisée.
        const occs = Array.isArray(corps.occupationIds) ? (corps.occupationIds as unknown[]).map(identifiant).filter((x): x is number => x !== null).slice(0, 20) : [];
        return repondre(await enregistrerEtatDesLieux({ occupationIds: occs, date: corps.date }, auteur));
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
