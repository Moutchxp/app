import { agosOfficielles, agoQuiCompte, montantFr, origineMontantVingt, verifierMontantVingt, type MontantVingt } from './vingtPourcent';
import { depotDeLaSortie, depotsDesOccupations, montantVingtDisponible, noterMontantVingt } from './montantVingtRepo';
import { lireArrete } from './arreteComptesRepo';
import type { ArreteComptes } from './arreteComptes';
import { query, withTransaction } from '../db/client';
import type { Auteur } from '../gestion/gestes';
import { chargerConfigGestion } from '../gestion/config';
import { SQL_AUJOURDHUI_PARIS } from '../temps/paris';
import { emailDeLAuteur } from './mailPortefeuilleRepo';
import { lireDestinatairesDefaut } from './mailNouvelleLocationRepo';
import { adressesUniques, mailAdhocSortie, type MailAvis } from './mailsPreavisSortie';
import {
  envoyerSerie, logementDe, mailsAvisDisponibles, MOTIF_SANS_457, proprietairesDuMailDisponible, signatureEcran, type DepsAvis, type EnvoiAvis,
} from './mailsPreavisSortieRepo';
import { donneesMailSortie, encartDuBail, enregistrerSortie, lireBail, sortiePrevue } from './sortieLocatairesRepo';
import { verifierSortie } from './sortieLocataires';
import {
  alertesDuCompteRendu, cleLocataire, cleProprietaire, COMPTE_RENDU_MAX, etatRetenue, mailsValidationSortie, MOTIF_RETENUE_IMPOSSIBLE, PARAGRAPHE_RETENUE_LOCATAIRE,
  verifierValidation, type PartieSortie,
} from './validationSortie';
import { metaPieces, MOTIF_SANS_468, piecesPourEnvoi, piecesSortieDisponibles } from './piecesSortieRepo';
import {
  entreesAAjouter, lignesAg, propositionAg, saisieAgPropre, verifierSaisieAg, type PropositionAg, type SaisieAg,
} from './agCopropriete';
import {
  ajouterEntreesAg, coproprietesPourLot, entreesAgDuLot, historiqueAgDisponible, rattacherLotACopropriete, type ContexteAgLot, type CoproprieteAg,
} from './agCoproprieteRepo';
import { blocRetenuePartenaires, texteProprietaire } from './validationSortie';

/**
 * ══ 🔴🔴 « VALIDER L'ÉTAT DES LIEUX DE SORTIE » — LE SERVEUR (spec d'Arno du 11/11/2026, lot 4). IMPUR (base + envoi). ═══════════════════════
 *
 * Règles et textes : `validationSortie.ts`. Ici : les parties du bail et leurs coordonnées (l'encart du logement, comme l'écran), le contrôle
 * de la saisie (`verifierValidation` puis les bornes du bail, `verifierSortie`), l'APERÇU (lecture seule, rien n'est écrit, rien ne part),
 * puis la VALIDATION : 🔴 un compte rendu qui porte les coordonnées d'une autre partie est REFUSÉ avant toute écriture ; sinon la sortie
 * (`enregistrerSortie`, inchangée : le logement devient libre si tous les locataires partent), PUIS les mails — un par destinataire coché,
 * puis la copie interne (gestion@ et la personne qui valide — elle tient lieu du récapitulatif interne de la sortie), et, comme avant,
 * l'information à nos partenaires (bien en gestion, case « Informer nos partenaires » cochée).
 * Chaque mail est journalisé (457) avec son bien, ses locataires et ses propriétaires (467) : il entre dans leurs historiques.
 * Sans la 467 : REFUS, rien n'est enregistré (l'écran de sortie reste disponible).
 */

export const MOTIF_SANS_467 = 'La validation de la sortie avec compte rendu demande la mise à jour de la base (migration 467) : rien n’est enregistré. L’écran de sortie reste disponible.';

export interface DemandeValidation {
  occupationId: number;
  realise: unknown;
  date: unknown;
  sortants: readonly number[];
  compteRendu: unknown;
  /** Les clés des parties cochées (`loc-<occupation>`, `pro-<propriétaire>`). */
  destinataires: readonly string[];
  informerPartenaires: boolean;
  /** 🔴 Arno (24/11/2026) — « pouvoir les sélectionner individuellement » : les adresses des partenaires COCHÉS (seules celles de la liste « Sorties »
   *  des Paramètres Location sont retenues — jamais une adresse venue de la requête) ; absent : tous (comme avant) ; vide : aucun mail partenaire. */
  partenaires?: readonly string[];
  /** 🔴 Arno (11/11/2026, 468) — les pièces jointes (identifiants inscrits par la fenêtre) : les mêmes à chaque mail. */
  pieceIds?: readonly number[];
  /** 🔴 Arno (11/11/2026, 468) — la case « Retenue de 20 % du dépôt de garantie » et son paragraphe (modifiable) pour les locataires. */
  retenue?: boolean;
  paragrapheRetenue?: unknown;
  /** 🔴 Arno (23/11/2026) — le texte des PROPRIÉTAIRES, modifiable dans la fenêtre comme celui des locataires ; absent ou vide : calculé (AGO qui compte). */
  phraseProprietaire?: unknown;
  /** 🔴 Arno (16/11/2026, 475) — case 20 % cochée : les dates d'AG (`{ derniere, derniereConfirmee, prochaine, statut }`), la mention de la
   *  prochaine AG dans la phrase des propriétaires, la copropriété à rattacher ou à créer, « immeuble en copropriété » coché. */
  ag?: unknown;
  mentionAg?: boolean;
  coproprieteChoix?: unknown;
  coproprieteOui?: boolean;
  /** 🔴 Arno (25/11/2026, 22h06) — case 20 % cochée : le MONTANT des 20 % retenus (euros ; prérempli à 20 % du dépôt connu, modifiable ; obligatoire). */
  montantVingt?: unknown;
}

/**
 * 🔴🔴 (Arno, 25/11/2026, 23h12) — « je n'arrive pas à valider une sortie de locataire ; j'ai bien instruit le champ des 20 % mais j'ai l'impression qu'il
 * n'en tient pas compte ». CAUSE : la route recopiait le corps de la requête champ par champ dans la demande, et deux champs envoyés par la fenêtre n'y
 * avaient jamais été ajoutés — `montantVingt` (887aec04 : le serveur le croyait vide, refus systématique) et `phraseProprietaire` (fc7830e2 : le texte
 * modifié des propriétaires était perdu, le texte calculé partait à sa place). La demande est désormais construite ICI, au même endroit que son type,
 * et une épreuve vérifie que CHAQUE champ du type est transmis. `ids` : la lecture des identifiants de la route (au plus 20). PUR.
 */
export function demandeValidationDuCorps(corps: Record<string, unknown>, occupationId: number, ids: (brut: unknown) => number[]): DemandeValidation {
  return {
    occupationId, realise: corps.realise, date: corps.date, sortants: ids(corps.sortants), compteRendu: corps.compteRendu,
    destinataires: (Array.isArray(corps.destinataires) ? corps.destinataires : []).filter((x): x is string => typeof x === 'string' && /^(loc|pro)-\d{1,16}$/.test(x)).slice(0, 40),
    informerPartenaires: corps.informerPartenaires !== false,
    // 🔴 Arno (24/11/2026) — les partenaires cochés un par un (filtrés ensuite sur la liste « Sorties ») ; absent : tous, comme avant
    ...(Array.isArray(corps.partenaires) ? { partenaires: (corps.partenaires as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 30) } : {}),
    // 🔴 Arno (11/11/2026, 468) — les pièces jointes (identifiants inscrits) et la retenue de 20 %.
    pieceIds: ids(corps.pieceIds), retenue: corps.retenue === true, paragrapheRetenue: corps.paragrapheRetenue,
    // 🔴 (23h12) le texte des propriétaires modifié dans la fenêtre (fc7830e2) : absent ou vide, le serveur le calcule
    phraseProprietaire: corps.phraseProprietaire,
    // 🔴 Arno (16/11/2026, 475) — les dates d'AG, la mention dans la phrase des propriétaires, la copropriété à rattacher ou à créer.
    ag: corps.ag, mentionAg: corps.mentionAg === true, coproprieteChoix: corps.coproprieteChoix, coproprieteOui: corps.coproprieteOui === true,
    // 🔴🔴 (23h12) le montant des 20 % retenus tel que saisi (887aec04) : le serveur le lit et le vérifie lui-même
    montantVingt: corps.montantVingt,
  };
}

/**
 * Le choix de copropriété d'un bien qui n'en a pas : en rattacher une existante, ou rien (« Ne pas rattacher maintenant »). PUR.
 * 🔴🔴 Arno (23/11/2026) — la sortie NE CRÉE PLUS de copropriété par un nom tapé : « Créer une copropriété » ouvre la fiche Copropriété (le parcours
 * de la Gestion, avec ses vérifications), qui l'enregistre à son « Valider ». Un `{ creer }` reçu (écran plus ancien) est ignoré : rien n'est créé.
 */
export type ChoixCopropriete = { sorte: 'rattacher'; id: number } | null;
export function choixCopropriete(brut: unknown): ChoixCopropriete {
  const o = (brut ?? {}) as Record<string, unknown>;
  const id = typeof o.rattacher === 'number' && Number.isSafeInteger(o.rattacher) && o.rattacher > 0 ? o.rattacher : null;
  return id !== null ? { sorte: 'rattacher', id } : null;
}

/** 🔴 Arno (16/11/2026, 475) — ce que la fenêtre propose (case 20 % cochée) : l'historique, la copropriété du bien, celles qui couvrent son adresse. */
export interface AgPourSortie {
  disponible: boolean;
  lotId: number;
  copropriete: CoproprieteAg | null;
  immeuble: string | null;
  coproprieteSaisie: boolean | null;
  suggestions: CoproprieteAg[];
  proposition: PropositionAg;
  adresse: string | null;
  /** 🔴 Arno (23/11/2026) — de quoi PRÉREMPLIR la prochaine AGO par le calcul du suivi des 20 % (b0453dc2) : les AGO officielles de la copropriété
   *  (jamais les projetées enregistrées) et sa date d'arrêté des comptes (512). */
  officielles?: string[];
  arrete?: ArreteComptes | null;
}
export async function agPourSortie(occupationId: number): Promise<AgPourSortie | null> {
  const logement = await logementDe(occupationId);
  if (logement === null) return null;
  const vide: PropositionAg = { derniere: null, prochaine: null };
  if (!(await historiqueAgDisponible())) {
    return { disponible: false, lotId: logement.lotId, copropriete: null, immeuble: null, coproprieteSaisie: logement.copropriete, suggestions: [], proposition: vide, adresse: logement.adresse };
  }
  const h = await entreesAgDuLot(logement.lotId);
  if (h === null) return null;
  const { rows } = await query<{ j: string }>(`SELECT ${SQL_AUJOURDHUI_PARIS}::text AS j`);
  return { disponible: true, lotId: logement.lotId, copropriete: h.contexte.copropriete, immeuble: h.contexte.immeuble?.libelle ?? null,
    coproprieteSaisie: h.contexte.coproprieteSaisie, suggestions: h.contexte.copropriete === null ? await coproprietesPourLot(h.contexte) : [],
    proposition: propositionAg(h.entrees, rows[0].j), adresse: logement.adresse,
    officielles: agosOfficielles(h.entrees), arrete: h.contexte.copropriete === null ? null : (await lireArrete(h.contexte.copropriete.id))?.arrete ?? null };
}

/** Les parties du bail (locataires en place, puis propriétaires), avec LEURS coordonnées. `null` : bail inconnu. */
export async function partiesDuBail(occupationId: number): Promise<PartieSortie[] | null> {
  const e = await encartDuBail(occupationId);
  if (e === null) return null;
  const c = e.coordonnees;
  const locataires: PartieSortie[] = (c?.locataires ?? []).map((l) => ({
    cle: cleLocataire(l.occupationId), famille: 'locataire', nom: l.nom, prenom: l.prenom ?? null, emails: l.emails, telephones: l.telephones, occupationId: l.occupationId,
  }));
  const proprietaires: PartieSortie[] = (c?.proprietaires ?? (e.proprietaire ? [{ id: e.proprietaire.id, nom: e.proprietaire.nom, telephones: c?.proprietaire?.telephones ?? [], emails: c?.proprietaire?.emails ?? [] }] : []))
    .map((p) => ({ cle: cleProprietaire(p.id), famille: 'proprietaire', nom: p.nom, prenom: null, emails: p.emails, telephones: p.telephones, proprietaireId: p.id }));
  return [...locataires, ...proprietaires];
}

/** Un mail prévu, tel que le récapitulatif le montre (texte intégral) — et à qui il est destiné. */
export interface MailPrevuSortie { sorte: string; objet: string; a: string[]; cc: string[]; texte: string; cle: string | null; famille: 'locataire' | 'proprietaire' | 'interne' | 'partenaires';
  /** 🔴 Arno (24/11/2026) — un mail par partenaire : son nom (le libellé de la liste « Sorties »), pour le récapitulatif */
  libelle?: string;
  /** 🔴 Arno (11/11/2026) — les noms des pièces jointes à CE mail. */
  pieces: string[] }

type Preparation = {
  etat: 'ok';
  mails: { mail: MailAvis; prevu: MailPrevuSortie; occupationIds: number[]; proprietaireIds: number[] }[];
  alertes: ReturnType<typeof alertesDuCompteRendu>;
  sansEmail: string[];
  vacant: boolean;
  restants: string[];
  enGestion: boolean;
  lotId: number;
  brute: string;
  date: string;
  sortants: number[];
  retenue: boolean;
  /** 🔴 (25/11/2026, 22h06) le montant des 20 % retenus et le dépôt connu (centimes) qui sert à dire s'il est calculé ou saisi ; `null` : sans retenue */
  montantVingt: { montant: number; depotCentimes: number | null } | null;
  copropriete: boolean | null;
  pieces: { id: number; nom: string; typeMime: string; taille: number }[];
  /** 🔴 (16/11/2026, 475) les AG saisies (case 20 % cochée, historique installé) */
  ag: { saisie: SaisieAg; connue: PropositionAg; contexte: ContexteAgLot; choix: ChoixCopropriete; coproprieteOui: boolean } | null;
};

/**
 * 🔴 Arno (24/11/2026) — les partenaires de la liste « Sorties » que la fenêtre a cochés (comparés sans tenir compte de la casse) ; `coches` absent : tous,
 * comme avant. Une adresse qui n'est pas dans la liste est ignorée : seul le réglage d'Arno décide à qui l'on écrit. PUR.
 */
export function partenairesCoches<T extends { adresse: string }>(liste: readonly T[], coches: readonly string[] | undefined): T[] {
  if (coches === undefined) return [...liste];
  const voulus = new Set(coches.map((x) => x.trim().toLowerCase()));
  return liste.filter((x) => voulus.has(x.adresse.trim().toLowerCase()));
}

async function preparer(d: DemandeValidation, auteur: Auteur, deps: DepsAvis): Promise<Preparation | { etat: 'refus'; motif: string; champ?: string } | { etat: 'inconnu' }> {
  if (!(await mailsAvisDisponibles())) return { etat: 'refus', motif: MOTIF_SANS_457 };
  if (!(await proprietairesDuMailDisponible())) return { etat: 'refus', motif: MOTIF_SANS_467 };
  const { rows } = await query<{ j: string }>(`SELECT ${SQL_AUJOURDHUI_PARIS}::text AS j`);
  const jour = rows[0].j;
  const sortants = [...new Set(d.sortants)];
  const v = verifierValidation({ realise: d.realise, date: d.date, sortants, compteRendu: d.compteRendu }, jour);
  if (!v.ok) return { etat: 'refus', motif: v.motif, champ: v.champ };
  const bail = await lireBail(d.occupationId);
  const logement = bail === null ? null : await logementDe(d.occupationId);
  const parties = bail === null ? null : await partiesDuBail(d.occupationId);
  if (bail === null || logement === null || parties === null) return { etat: 'inconnu' };
  const vs = verifierSortie(bail, sortants, d.date, jour);
  if (!vs.ok) return { etat: 'refus', motif: vs.motif, champ: 'date' };
  const date = d.date as string;
  const compteRendu = typeof d.compteRendu === 'string' ? d.compteRendu.trim() : '';
  // 🔴 Arno (11/11/2026) — la retenue de 20 % : impossible hors copropriété (article 22) ; cochée, un paragraphe non vide pour les locataires.
  const retenue = d.retenue === true;
  const paragrapheRetenue = typeof d.paragrapheRetenue === 'string' && d.paragrapheRetenue.trim() !== '' ? d.paragrapheRetenue.trim() : PARAGRAPHE_RETENUE_LOCATAIRE;
  if (retenue && etatRetenue(logement.copropriete) === 'impossible') return { etat: 'refus', motif: MOTIF_RETENUE_IMPOSSIBLE, champ: 'retenue' };
  if (paragrapheRetenue.length > COMPTE_RENDU_MAX) return { etat: 'refus', motif: `Le paragraphe de la retenue dépasse ${COMPTE_RENDU_MAX} caractères.`, champ: 'retenue' };
  // 🔴🔴 Arno (25/11/2026, 22h06) — case cochée : le MONTANT des 20 % (prérempli à 20 % du dépôt connu, modifiable) est OBLIGATOIRE ; son origine
  //    (calculé / saisi) est tranchée ICI, sur le dépôt relu, jamais sur ce que dit l'écran
  let montantVingt: Preparation['montantVingt'] = null;
  if (retenue) {
    // 🔴 (Arno, 25/11/2026, 23h12) la même règle que la fenêtre : toute écriture lisible (« 1 200,50 », « 1200.5 », « 1 200 € ») ; vide, nul, négatif ou
    //    illisible : un refus qui dit lequel
    const v = verifierMontantVingt(d.montantVingt);
    if (!v.ok) return { etat: 'refus', motif: v.motif, champ: 'montantVingt' };
    const m = v.montant;
    const occ = [d.occupationId, ...sortants];
    montantVingt = { montant: m, depotCentimes: depotDeLaSortie(occ, await depotsDesOccupations(occ)) };
  }
  // 🔴 Arno (23/11/2026) — « créer le même bloc de texte pour le texte qui sera envoyé au propriétaire, avec la même possibilité de le modifier » :
  // le texte de la fenêtre part TEL QUEL (même borne que celui des locataires)
  const phraseSaisie = typeof d.phraseProprietaire === 'string' && d.phraseProprietaire.trim() !== '' ? d.phraseProprietaire.trim() : null;
  if (phraseSaisie !== null && phraseSaisie.length > COMPTE_RENDU_MAX) return { etat: 'refus', motif: `Le texte des propriétaires dépasse ${COMPTE_RENDU_MAX} caractères.`, champ: 'retenue' };
  // 🔴 Arno (16/11/2026, 475) — case 20 % cochée : la dernière AG et la prochaine (date ET statut) sont OBLIGATOIRES ; refus avant tout.
  let ag: Preparation['ag'] = null;
  let officiellesAg: string[] = [];
  if (retenue && (await historiqueAgDisponible())) {
    // 🔴 (Arno, 17/11/2026) une date PROJETÉE déjà passée est refusée (une officielle passée reste admise)
    const va = verifierSaisieAg((d.ag ?? {}) as Record<string, unknown>, jour);
    if (!va.ok) return { etat: 'refus', motif: va.motif, champ: 'ag' };
    const h = await entreesAgDuLot(logement.lotId);
    if (h === null) return { etat: 'inconnu' };
    const choix = h.contexte.copropriete === null ? choixCopropriete(d.coproprieteChoix) : null;
    if (choix?.sorte === 'rattacher' && !(await coproprietesPourLot(h.contexte)).some((c) => c.id === choix.id)) {
      return { etat: 'refus', motif: 'Cette copropriété ne couvre pas l’adresse du bien : rechargez la fenêtre.', champ: 'ag' };
    }
    officiellesAg = agosOfficielles(h.entrees);
    ag = { saisie: saisieAgPropre(d.ag, jour) as SaisieAg, connue: propositionAg(h.entrees, jour), contexte: h.contexte, choix,
      coproprieteOui: d.coproprieteOui === true && logement.copropriete === null };
  }
  // 🔴 Arno (23/11/2026) — le propriétaire reçoit la MÊME date que le locataire : l'AGO QUI COMPTE (même calcul que la fenêtre : date de sortie, arrêté,
  // AGO officielles, dernière et prochaine saisies), jamais la simple « Prochaine AGO »
  // 🔴 Arno (24/11/2026) — l'arrêté et l'AGO qui compte sont lus UNE fois : la date du locataire (case « Indiquer l'AGO » cochée) et le bloc des partenaires
  const arreteCopro = ag === null || ag.contexte.copropriete === null ? null : (await lireArrete(ag.contexte.copropriete.id))?.arrete ?? null;
  const agoCalculee = ag === null ? null : agoQuiCompte({ officielles: officiellesAg, derniere: ag.saisie.derniere,
    prochaine: ag.saisie.prochaine, statut: ag.saisie.statut, dateSortie: date, arrete: arreteCopro, jour });
  const agoQc = d.mentionAg === true ? agoCalculee : null;
  // 🔴 Arno (23/11/2026) — le texte des PROPRIÉTAIRES (trois paragraphes ; la MÊME date que le locataire ; « vos locataires » s'ils sont plusieurs)
  const avecDate = ag !== null && d.mentionAg === true && agoQc !== null;
  const phraseProprietaire = phraseSaisie ?? texteProprietaire({ jour: avecDate ? agoQc.date : null, statut: avecDate ? agoQc.statut : null,
    cloture: avecDate ? agoQc.cloture : null, pluriel: sortants.length > 1 });
  if ((d.pieceIds ?? []).length > 0 && !(await piecesSortieDisponibles())) return { etat: 'refus', motif: MOTIF_SANS_468 };
  const pieces = await metaPieces(d.pieceIds ?? [], [d.occupationId, ...sortants]);
  if (pieces.length !== new Set(d.pieceIds ?? []).size) return { etat: 'refus', motif: 'Une pièce jointe est introuvable pour ce préavis : retirez-la puis ajoutez-la de nouveau.', champ: 'pieces' };
  // Seules les parties DU BAIL peuvent être cochées : une clé inconnue est ignorée (jamais une adresse venue de la requête).
  const choisies = parties.filter((p) => d.destinataires.includes(p.cle));
  const prevue = sortiePrevue(bail, sortants, date);
  const qui = await emailDeLAuteur(auteur);
  const config = await chargerConfigGestion();
  const sig = await signatureEcran(deps);
  const internes = adressesUniques([config.adresseGestion, qui.email]);
  const parQui = new Map(parties.map((p) => [p.cle, p]));
  const sortantsP = sortants.map((o) => parQui.get(cleLocataire(o))).filter((p): p is PartieSortie => p !== undefined);
  const m = mailsValidationSortie({ adresse: logement.adresse, date, compteRendu, vacant: prevue.vacant, copropriete: logement.copropriete, destinataires: choisies,
    retenue: { appliquee: retenue, paragrapheLocataire: paragrapheRetenue, ...(phraseProprietaire !== undefined ? { phraseProprietaire } : {}),
      ag: ag === null ? null : { derniere: ag.saisie.derniere, prochaine: ag.saisie.prochaine, statut: ag.saisie.statut as 'officielle' | 'projetee' } }, pieces,
    sortants: sortantsP.length > 0 ? sortantsP : prevue.sortants.map((l) => ({ nom: l.nom, prenom: null })), expediteur: config.adresseGestion, qui, signature: sig.ecran, internes });
  const tousProprios = parties.flatMap((p) => (p.proprietaireId !== undefined ? [p.proprietaireId] : []));
  const prevus: Preparation['mails'] = m.parties.map(({ partie, mail }) => ({
    mail, prevu: { sorte: mail.sorte, objet: mail.objet, a: mail.a, cc: mail.cc, texte: mail.texte, cle: partie.cle, famille: partie.famille, pieces: pieces.map((x) => x.nom) },
    // L'historique de CE destinataire (et du bien) : un locataire par son occupation, un propriétaire par son identifiant.
    occupationIds: partie.occupationId !== undefined ? [partie.occupationId] : [], proprietaireIds: partie.proprietaireId !== undefined ? [partie.proprietaireId] : [],
  }));
  if (m.interne !== null) {
    prevus.push({ mail: m.interne, prevu: { sorte: m.interne.sorte, objet: m.interne.objet, a: m.interne.a, cc: [], texte: m.interne.texte, cle: null, famille: 'interne', pieces: pieces.map((x) => x.nom) },
      occupationIds: prevue.occupationIds, proprietaireIds: tousProprios });
  }
  // Comme avant (« Valider la sortie ») : l'information à nos partenaires, bien en gestion, case cochée — sans copie d'aucun mail de départ.
  // 🔴 Arno (24/11/2026) — « afficher en dessous les différents partenaires possibles à informer et pouvoir les sélectionner individuellement » :
  // UN MAIL PAR PARTENAIRE COCHÉ, un seul destinataire (« À ») par mail ; aucun coché : aucun mail partenaire.
  // 🔴 Arno (24/11/2026) — le bloc « Retenue de 20 % … : OUI / NON » du mail aux partenaires : arrêté, dernière AGO, AGO qui compte (la MÊME que le
  // locataire), restitution (datée si la case « Indiquer l'AGO » est cochée) ; un seul bloc pour la sortie, le même pour chaque partenaire
  const retenue20 = blocRetenuePartenaires({ retenue, coproprieteRattachee: ag === null ? null : ag.contexte.copropriete !== null, arrete: arreteCopro,
    derniere: ag?.saisie.derniere ?? null, ago: agoCalculee === null ? null : { date: agoCalculee.date, statut: agoCalculee.statut }, restitutionDatee: agoQc !== null });
  if (d.informerPartenaires && logement.enGestion) {
    for (const p of partenairesCoches(await lireDestinatairesDefaut('sortie'), d.partenaires)) {
      const adhoc = mailAdhocSortie({ ...donneesMailSortie(prevue, qui, new Date().toISOString()), enGestion: true, expediteur: config.adresseGestion, signature: sig.ecran,
        partenaires: [p.adresse], retenue20 });
      if (adhoc === null) continue;
      prevus.push({ mail: adhoc, prevu: { sorte: adhoc.sorte, objet: adhoc.objet, a: adhoc.a, cc: adhoc.cc, texte: adhoc.texte, cle: null, famille: 'partenaires', pieces: [],
        libelle: p.libelle !== '' ? p.libelle : p.adresse }, occupationIds: prevue.occupationIds, proprietaireIds: [] });
    }
  }
  // 🔴 L'alerte de coordonnées porte aussi sur le paragraphe de la retenue (modifiable) quand il part.
  const texteControle = retenue ? [compteRendu, paragrapheRetenue, ...(phraseSaisie !== null ? [phraseSaisie] : [])].join('\n\n') : compteRendu;
  return { etat: 'ok', mails: prevus, alertes: alertesDuCompteRendu(texteControle, choisies, parties), sansEmail: m.sansEmail, vacant: prevue.vacant,
    restants: prevue.restants, enGestion: logement.enGestion, lotId: logement.lotId, brute: sig.brute, date, sortants, retenue, montantVingt, copropriete: logement.copropriete, pieces, ag };
}

/** 🔴 (25/11/2026, 22h06) le montant tel qu'il est dit au récapitulatif et à la fenêtre de résultat (montant, calculé ou saisi, dépôt en euros). PUR. */
const montantDit = (m: Preparation['montantVingt']): MontantVingt | null =>
  m === null ? null : { montant: m.montant, origine: origineMontantVingt(m.montant, m.depotCentimes), depot: m.depotCentimes === null ? null : m.depotCentimes / 100 };

export type IssueApercuValidation =
  | { etat: 'ok'; data: { mails: MailPrevuSortie[]; alertes: { cle: string; libelle: string; phrase: string }[]; sansEmail: string[]; vacant: boolean; enGestion: boolean; date: string;
      retenue: boolean; montantVingt?: MontantVingt | null; copropriete: boolean | null; ag?: ResumeAg } }
  | { etat: 'refus'; motif: string; champ?: string } | { etat: 'inconnu' };

/** 🔴 (16/11/2026, 475) Les dates d'AG pour le récapitulatif et la fenêtre de résultat. */
export interface ResumeAg { lignes: [string, string][]; copropriete: string | null; aRattacher: boolean; motif?: string | null }
function resumeAg(ag: NonNullable<Preparation['ag']>, copropriete?: string | null): ResumeAg {
  const nom = copropriete !== undefined ? copropriete : ag.contexte.copropriete?.libelle ?? null;
  return { lignes: lignesAg(ag.saisie), copropriete: nom, aRattacher: nom === null && ag.choix === null };
}

/** L'APERÇU, pour le récapitulatif : rien n'est écrit, rien ne part. */
export async function apercuValidationSortie(d: DemandeValidation, auteur: Auteur, deps: DepsAvis = {}): Promise<IssueApercuValidation> {
  const p = await preparer(d, auteur, deps);
  if (p.etat !== 'ok') return p;
  return { etat: 'ok', data: { mails: p.mails.map((x) => x.prevu), alertes: p.alertes.map(({ cle, libelle, phrase }) => ({ cle, libelle, phrase })), sansEmail: p.sansEmail,
    vacant: p.vacant, enGestion: p.enGestion, date: p.date, retenue: p.retenue, montantVingt: montantDit(p.montantVingt), copropriete: p.copropriete, ...(p.ag !== null ? { ag: resumeAg(p.ag) } : {}) } };
}

export type IssueValidation =
  | { etat: 'ok'; data: { date: string; vacant: boolean; restants: string[]; reintegrations?: string[]; envois: (EnvoiAvis & { famille: MailPrevuSortie['famille']; pieces: string[] })[];
      retenue: boolean; montantVingt?: MontantVingt | null; ag?: ResumeAg } }
  | { etat: 'refus'; motif: string; champ?: string } | { etat: 'inconnu' };

/**
 * 🔴 Arno (16/11/2026, 475) — APRÈS la sortie, en UNE transaction : « immeuble en copropriété » (s'il était non renseigné et coché), le
 * rattachement à une copropriété existante ou sa création, puis les dates d'AG dans l'historique (ajout seul) : la dernière AG si elle a été
 * saisie, modifiée ou confirmée ; la prochaine (officielle : sur la copropriété, pour tous ses biens ; projetée : avec la sortie). Sans
 * copropriété : sous la clé de l'immeuble du bien, « à rattacher à une copropriété ». Un échec ne défait pas la sortie : il est DIT.
 */
async function enregistrerAgDeLaSortie(ag: NonNullable<Preparation['ag']>, sortieId: number | null, auteur: Auteur): Promise<ResumeAg> {
  if (sortieId === null) return { ...resumeAg(ag), motif: 'Sortie enregistrée, mais les dates d’AG n’ont pas pu être rangées (sortie validée non inscrite, migration 468).' };
  try {
    return await withTransaction(async (q) => {
      const c = ag.contexte;
      if (ag.coproprieteOui) {
        await q('UPDATE gestion_annuaire_lot SET copropriete = true WHERE id = $1 AND copropriete IS NULL', [c.lotId]);
        await q(`INSERT INTO gestion_journal (entite, entite_id, action, commentaire, auteur_id, auteur_libelle) VALUES ('annuaire_lot', $1, 'location_copropriete_oui', $2, $3, $4)`,
          [c.lotId, 'immeuble en copropriété : oui (coché dans « Valider la sortie »)', auteur.id, auteur.libelle]);
      }
      let copro = c.copropriete;
      if (copro === null && ag.choix !== null) {
        // 🔴 Arno (23/11/2026) — plus de création par nom ici (la fonction de création par nom d'agCoproprieteRepo n'est plus appelée) : la fiche Copropriété la crée
        const r = await rattacherLotACopropriete(q, c, ag.choix.id, auteur);
        if (!r.ok) throw new RefusAg(r.motif);
        copro = r.copropriete;
      }
      // 🔴🔴 Arno (23/11/2026) — « plus aucune date n'est écrite sur la sortie ; une date officielle va sur la copropriété (même table, même journal), une
      // date projetée n'est jamais enregistrée, seulement calculée à l'affichage. » Sans copropriété (« Ne pas rattacher maintenant ») : RIEN n'est
      // enregistré (les dates n'ont servi qu'à la phrase du mail au locataire) ; avec : les seules dates OFFICIELLES, sur la copropriété.
      if (copro !== null) {
        const officielles = entreesAAjouter(ag.saisie, ag.connue).filter((e) => e.statut === 'officielle');
        if (officielles.length > 0) await ajouterEntreesAg(q, { coproprieteId: copro.id, cle: c.immeuble?.cle ?? null, lotId: c.lotId, sortieId }, officielles, 'sortie', auteur);
      }
      return { lignes: lignesAg(ag.saisie), copropriete: copro?.libelle ?? null, aRattacher: copro === null, motif: null };
    });
  } catch (e) {
    const motif = e instanceof RefusAg ? e.message : 'la base n’a pas répondu';
    console.error('[location] AG de la sortie non enregistrées', e instanceof Error ? e.message : e);
    return { ...resumeAg(ag, null), aRattacher: ag.contexte.copropriete === null, motif: `Sortie enregistrée, mais les dates d’AG n’ont pas été enregistrées : ${motif}. Renseignez-les sur la fiche du bien.` };
  }
}
class RefusAg extends Error {}

/**
 * LA VALIDATION. 🔴 Coordonnées d'un tiers dans le compte rendu : REFUS, rien n'est écrit. Puis la sortie ; puis chaque mail (un par
 * destinataire, chacun journalisé pour SON historique), la copie interne ; un mail en échec ne défait rien et est rendu tel quel.
 */
export async function validerSortieEdls(d: DemandeValidation, auteur: Auteur, deps: DepsAvis & { lireOctets?: (cle: string) => Promise<Buffer> } = {}): Promise<IssueValidation> {
  const p = await preparer(d, auteur, deps);
  if (p.etat !== 'ok') return p;
  if (p.alertes.length > 0) {
    return { etat: 'refus', motif: `${p.alertes.map((a) => `Mail à ${a.libelle} — ${a.phrase}`).join(' ')} Corrigez le compte rendu : rien n’est enregistré ni envoyé.`, champ: 'compteRendu' };
  }
  // 🔴 Arno (11/11/2026, 468) — les pièces : relues du stockage et VÉRIFIÉES avant toute écriture ; une pièce illisible : rien n'est fait.
  const lues = await piecesPourEnvoi(p.pieces.map((x) => x.id), [d.occupationId, ...p.sortants], deps.lireOctets);
  if (!lues.ok) return { etat: 'refus', motif: lues.motif, champ: 'pieces' };
  const r = await enregistrerSortie({ occupationId: d.occupationId, sortants: p.sortants, date: p.date }, auteur);
  if (r.etat !== 'ok') return r.etat === 'refus' ? { etat: 'refus', motif: r.motif } : { etat: 'inconnu' };
  // La sortie validée et la RETENUE (oui/non, avec l'heure du choix) — sans la 468, la sortie reste écrite comme avant.
  let sortieId: number | null = null;
  if (await piecesSortieDisponibles()) {
    sortieId = await query<{ id: string }>(
      `INSERT INTO gestion_location_sortie_validee (lot_id, occupation_ids, date_sortie, retenue_20, piece_ids, auteur_id, auteur_libelle) VALUES ($1, $2::bigint[], $3, $4, $5::bigint[], $6, $7) RETURNING id::text`,
      [p.lotId, r.data.occupationIds, p.date, p.retenue, lues.pieces.map((x) => x.id), auteur.id, auteur.libelle],
    ).then((x) => Number(x.rows[0].id)).catch((e: unknown) => { console.error('[location] sortie validée non inscrite', (e as Error)?.message); return null; });
  }
  // 🔴🔴 Arno (25/11/2026, 22h06) — le MONTANT des 20 % suit la sortie dès sa validation (ajout seul, 516) ; sans la 516 : calculé à la lecture si le dépôt est connu
  if (p.montantVingt !== null && sortieId !== null && await montantVingtDisponible()) {
    await noterMontantVingt({ sortieId, montant: p.montantVingt.montant, depotCentimes: p.montantVingt.depotCentimes }, auteur)
      .catch((e: unknown) => console.error('[location] montant des 20 % non inscrit', (e as Error)?.message));
  }
  const ag = p.ag === null ? null : await enregistrerAgDeLaSortie(p.ag, sortieId, auteur);
  const envois: (EnvoiAvis & { famille: MailPrevuSortie['famille']; pieces: string[] })[] = [];
  for (const x of p.mails) {
    const avecOctets = x.mail.pieces ? { ...x.mail, pieces: lues.pieces } : x.mail;
    const [e] = await envoyerSerie([avecOctets], p.brute, { lotId: p.lotId, occupationIds: x.occupationIds, auteur, proprietaireIds: x.proprietaireIds }, deps);
    envois.push({ ...e, famille: x.prevu.famille, pieces: x.prevu.pieces });
  }
  // Le compte rendu de l'état des lieux, au journal du bien (auditable, même sans mail).
  const cr = typeof d.compteRendu === 'string' ? d.compteRendu.trim() : '';
  await query(
    `INSERT INTO gestion_journal (entite, entite_id, action, valeur_apres, commentaire, auteur_id, auteur_libelle) VALUES ('annuaire_lot', $1, 'location_edls_realise', $2, $3, $4, $5)`,
    [p.lotId, p.date, `état des lieux de sortie réalisé le ${p.date} — ${cr === '' ? 'aucun compte rendu saisi' : `compte rendu : ${cr}`}`
      + (p.montantVingt !== null ? ` — retenue de 20 % du dépôt de garantie : ${montantFr(p.montantVingt.montant)}` : ''), auteur.id, auteur.libelle],
  ).catch((e: unknown) => console.error('[location] journal de l’état des lieux réalisé impossible', (e as Error)?.message));
  return { etat: 'ok', data: { date: r.data.date, vacant: r.data.vacant, restants: r.data.restants,
    ...((r.data.reintegrations ?? []).length > 0 ? { reintegrations: r.data.reintegrations } : {}), envois, retenue: p.retenue, montantVingt: montantDit(p.montantVingt), ...(ag !== null ? { ag } : {}) } };
}
