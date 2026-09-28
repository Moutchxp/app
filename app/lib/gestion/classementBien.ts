import { query } from '../db/client';
import {
  annuaireDisponible, rattachementsDisponibles, miniaturesDisponibles, libelleSourceContactDisponible,
} from './schema';
// LOT AFFECTATION-PAR-BIEN — le moteur des propositions est PUR : il décide, et il s'éprouve sans base.
import { proposerBiens, type AdresseVue } from './propositionsBien';
// LOT FICHE-PROPOSITION — ce qui s'affiche, et sous quel mot : un module PUR, éprouvé sans base ni écran.
import {
  adresseComplete, caracteristiquesDuLot,
  type CaracteristiqueLot, type Coordonnee, type PersonneFiche,
} from './ficheBien';
import { libelleContact } from './annuaire';

/**
 * MODULE « GESTION » — LOT STATUT-PAR-MAIL : CE QU'IL FAUT SAVOIR POUR CLASSER UN MAIL DANS UN BIEN. LECTURE SEULE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE CE FICHIER RÉPOND, et qui manquait à l'écran de classement : « à quels BIENS ce mail peut-il
 * raisonnablement se rattacher, et QUI sont les parties de chacun À LA DATE DU MAIL ? »
 *
 * Trois choses, dans cet ordre :
 *   ① LA RECOMMANDATION — le bien que l'automatisation a trouvé. Il est PRÉSÉLECTIONNÉ et marqué comme tel :
 *      on ne fait pas retaper à la main ce que le moteur a déjà vu juste dans la plupart des cas ;
 *   ② TOUS LES BIENS DU PROPRIÉTAIRE identifié. Demande d'Arno : un bailleur possède souvent plusieurs lots, et un
 *      mail peut parler de deux appartements à la fois (un relevé de charges, un ravalement). Ne proposer que le
 *      bien recommandé obligerait à rouvrir le sélecteur pour chaque lot supplémentaire ;
 *   ③ LES PARTIES À LA DATE DU MAIL, pas celles d'aujourd'hui. Un mail d'août 2025 parle du locataire d'août 2025.
 *      Afficher l'occupant actuel ferait classer le courrier d'un locataire sorti sous le nom de son successeur —
 *      une erreur qu'on ne verrait jamais, et qui se propagerait à chaque relecture du dossier.
 *
 * 🔒 LECTURE SEULE. Aucun `INSERT`, `UPDATE` ni `DELETE` : un test statique le vérifie sur ce fichier. Le geste
 * d'écriture reste celui qui existe — la route des rattachements, avec son journal.
 *
 * ⚠️ NE PAS CONFONDRE AVEC `classementRepo.ts`, qui porte un tout autre sujet : le rangement des PIÈCES JOINTES
 * dans les dossiers du Drive (lot CLASSEMENT-1). Ici, il s'agit du rattachement d'un MAIL à un BIEN. Deux fichiers,
 * deux questions — les mêler donnerait un module qui ne sait plus de quoi il parle.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Une partie d'un bien, à la date du mail.
 *
 * 🔴 LOT FICHE-PROPOSITION — elle porte désormais SES MOYENS DE CONTACT. Classer un mail sans avoir le téléphone
 * du locataire sous les yeux obligeait à rouvrir WIPPIMMO dans un autre onglet pour la moitié des gestes qui
 * suivent (rappeler, transférer, relancer). C'est `PersonneFiche` du module pur `ficheBien.ts`.
 */
export type PartieBien = PersonneFiche;

/** Un bien proposé au classement, avec ses parties à la date du mail. */
export interface BienProposable {
  /** La clé WIPPIMMO du lot. C'est elle qui sert de cible de rattachement (lot RATTACHEMENT-1). */
  cle: string;
  libelle: string;
  adresse: string | null;
  commune: string | null;
  typeBien: string | null;
  /**
   * 🔴 LOT FICHE-PROPOSITION — TOUT CE QUE L'IMPORT WIPPIMMO PORTE POUR CE LOT, et rien d'autre. Les champs vides
   * ne sont pas dans la liste : c'est `caracteristiquesDuLot` (module PUR) qui décide, pas l'écran.
   */
  caracteristiques: CaracteristiqueLot[];
  /** L'adresse COMPLÈTE : voie, code postal, commune. Une adresse sans code postal n'est pas une adresse. */
  adresseComplete: string;
  /** Le propriétaire et le ou les locataires du bien À LA DATE DU MAIL. */
  parties: PartieBien[];
  /**
   * 🔴 VRAI quand l'automatisation coche ce bien d'avance. L'écran le présélectionne et écrit le MOTIF à côté —
   * jamais une coche silencieuse : on doit toujours savoir d'où elle vient.
   */
  recommande: boolean;
  /**
   * 🔴 LOT AFFECTATION-PAR-BIEN — POURQUOI ce bien est proposé, EN CLAIR (« locataire en place à la date du
   * mail », « un des 3 biens de MARTY Jean-François », « n° de lot cité dans le mail »…). Sans lui, on ne peut pas
   * trancher sans rouvrir le code.
   */
  motif: string;
  /** Le cas de la règle : (a) locataire, (b) propriétaire à un seul bien, (c) à plusieurs, (d) cité dans le texte. */
  cas: 'a' | 'b' | 'c' | 'd';
  /** `quasi_certaine` = cas (a) et (b) ; `a_trancher` = cas (c) et (d). */
  certitude: 'quasi_certaine' | 'a_trancher';
  /** Vrai quand ce mail lui est DÉJÀ rattaché de façon confirmée. L'écran le coche et le dit. */
  dejaRattache: boolean;
}

export interface ContexteClassement {
  messageId: number;
  filId: number | null;
  /** La date du mail : c'est elle qui décide QUI étaient les parties. */
  dateMail: string | null;
  /** Combien de mails compte la conversation — pour la portée « toute la conversation ». */
  nbMailsDuFil: number;
  /**
   * Le propriétaire identifié, quand il y en a un. Il n'est JAMAIS une cible de classement (lot
   * AFFECTATION-PAR-BIEN) : il ne sert qu'à titrer la liste de ses biens.
   */
  proprietaire: { cle: string; nom: string } | null;
  /** Ce que le moteur conclut : un bien certain, des biens à trancher, ou rien — avec son motif en clair. */
  examen: { issue: 'automatique' | 'a_trancher' | 'sans_candidat'; motif: string };
  /** Les pièces jointes du mail, pour le classement pièce par pièce (lot AFFECTATION-PAR-BIEN, point 4). */
  pieces: { pieceId: number; nom: string; miniature: boolean }[];
  biens: BienProposable[];
  /** `false` = migration 257 ou annuaire absents : l'écran le dit au lieu de montrer une liste vide. */
  disponible: boolean;
}

/**
 * LES PARTIES D'UN LOT À UNE DATE. LECTURE SEULE.
 *
 * ⚠️ « À LA DATE », ET NON « AUJOURD'HUI ». L'occupation retenue est celle dont la période COUVRE la date du mail :
 * entrée antérieure (ou inconnue) et sortie postérieure (ou toujours en cours). Sans cela, le courrier d'un
 * locataire sorti se classerait sous le nom de son successeur.
 *
 * ⚠️ PLUSIEURS LOCATAIRES SONT POSSIBLES — une colocation, un couple. On les rend TOUS : n'en garder qu'un
 * choisirait arbitrairement lequel des deux existe.
 */
const SQL_PARTIES = `
  SELECT l.id::text AS locataire_id, l.wippimmo_id AS cle, l.nom,
         o.entree::text AS depuis, o.sortie::text AS jusqua
    FROM gestion_annuaire_occupation o
    JOIN gestion_annuaire_locataire l ON l.id = o.locataire_id
   WHERE o.lot_id = $1
     AND (o.entree IS NULL OR o.entree <= $2::date)
     AND (o.sortie IS NULL OR o.sortie >= $2::date)
   ORDER BY o.entree DESC NULLS LAST, o.id DESC`;

interface LotDB {
  id: string; cle: string; adresse: string | null; commune: string | null; type_bien: string | null;
  proprietaire_cle: string | null; proprietaire_nom: string | null; proprietaire_civilite: string | null;
  // LOT FICHE-PROPOSITION — les colonnes que l'import remplit vraiment (voir l'en-tête de `ficheBien.ts`).
  code_postal: string | null; immeuble: string | null; nature: string | null;
  gestion_debut: string | null; gestion_fin: string | null;
  /** L'identifiant interne du propriétaire : c'est par lui qu'on retrouve ses contacts, en UNE requête. */
  proprietaire_id: string | null;
}

/**
 * ══ 🔴 LOT FICHE-PROPOSITION — LES MOYENS DE CONTACT, EN UNE SEULE REQUÊTE ═══════════════════════════════════════
 *
 * ⚠️ UNE REQUÊTE POUR TOUTES LES PERSONNES DE LA FICHE, jamais une par carte. Un mail d'un bailleur à huit lots
 * affiche neuf personnes : neuf requêtes se verraient à l'écran, et c'est la règle du module depuis le bandeau
 * « Rattaché à ».
 *
 * ⚠️ `absent_le IS NULL` : un contact disparu d'un ré-import n'est pas supprimé, il est DATÉ. L'afficher ferait
 * appeler un numéro que WIPPIMMO ne donne plus.
 *
 * ⚠️ L'ORDRE EST CELUI DE L'IMPORT (`rang`) : la première adresse est celle que WIPPIMMO donne en premier, et
 * c'est en général la bonne. Trier par ordre alphabétique remonterait une adresse secondaire en tête.
 */
function sqlContacts(avecLibelle: boolean): string {
  return `
  SELECT sujet, sujet_id::text AS sujet_id, sorte, valeur, rang,
         ${avecLibelle ? 'libelle_source' : "NULL::text AS libelle_source"}
    FROM gestion_annuaire_contact
   WHERE absent_le IS NULL
     AND ((sujet = 'proprietaire' AND sujet_id = ANY($1::bigint[]))
       OR (sujet = 'locataire'    AND sujet_id = ANY($2::bigint[])))
   ORDER BY sorte, rang, id`;
}

/** Les contacts d'une personne, rangés par sorte, chacun avec le libellé de sa colonne d'origine. */
type CarteContacts = Map<string, { emails: Coordonnee[]; telephones: Coordonnee[] }>;

/** La clé d'une personne dans la carte des contacts : sa sorte et son identifiant interne. PUR. */
function cleContact(sujet: string, sujetId: string | number): string { return `${sujet}|${sujetId}`; }

/** Le libellé d'un bien, écrit UNE fois : deux formulations finiraient par se contredire d'un écran à l'autre. */
export function libelleBien(l: { adresse: string | null; commune: string | null; cle: string }): string {
  const lieu = [l.adresse, l.commune].map((x) => (x ?? '').trim()).filter((x) => x !== '').join(', ');
  return lieu === '' ? `Lot ${l.cle}` : `${lieu} — lot ${l.cle}`;
}

/**
 * ══ CE QU'IL FAUT POUR CLASSER CE MAIL. LECTURE SEULE. ═══════════════════════════════════════════════════════════
 *
 * ⚠️ SANS ANNUAIRE OU SANS RATTACHEMENTS, on rend `disponible: false` plutôt qu'une liste vide. Une liste vide se
 * lirait « aucun bien ne correspond », ce qui serait faux : on n'a simplement pas pu chercher.
 */
export async function contexteClassement(messageId: number): Promise<ContexteClassement> {
  const vide: ContexteClassement = {
    messageId, filId: null, dateMail: null, nbMailsDuFil: 0, proprietaire: null, biens: [],
    examen: { issue: 'sans_candidat', motif: 'annuaire ou rattachements non installés' }, pieces: [],
    disponible: false,
  };
  if (!(await annuaireDisponible()) || !(await rattachementsDisponibles())) return vide;

  // ── ① LE MAIL : sa date (qui décide des parties), son échange, son objet et son corps (cas c et d) ───────────
  const { rows: msg } = await query<{
    fil_id: string | null; recu_le: string; nb: number; objet: string | null; corps: string | null;
  }>(
    `SELECT m.fil_id::text AS fil_id,
            to_char(m.recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS recu_le,
            (SELECT count(*) FROM gestion_message c WHERE c.fil_id = m.fil_id)::int AS nb,
            m.objet, left(coalesce(m.corps_texte, ''), 4000) AS corps
       FROM gestion_message m WHERE m.id = $1`, [messageId]);
  const m = msg[0];
  if (m === undefined) return vide;
  const dateMail = m.recu_le;
  const filId = m.fil_id === null ? null : Number(m.fil_id);

  // ── LES PIÈCES JOINTES : leur nom nourrit la reconnaissance (cas c et d) ET le classement pièce par pièce ────
  const { rows: pieces } = await query<{ id: string; nom_fichier: string; miniature: boolean }>(
    `SELECT p.id::text, p.nom_fichier,
            ${(await miniaturesDisponibles()) ? 'p.miniature_cle IS NOT NULL' : 'false'} AS miniature
       FROM gestion_piece p WHERE p.message_id = $1 ORDER BY p.id`, [messageId]);

  /**
   * ── ② LES ADRESSES, celles du mail ET celles de l'échange ────────────────────────────────────────────────────
   * 🔴 C'est `gestion_message_adresse` qui porte déjà, pour chaque adresse, ce que l'annuaire en dit À LA DATE DU
   * MAIL : interne ou non, partie (locataire / propriétaire), lot occupé, propriétaire. On ne recalcule rien ici.
   */
  const { rows: adr } = await query<{
    adresse: string; interne: boolean; partie: string | null; lot_cle: string | null;
    proprietaire_cle: string | null; du_mail: boolean;
  }>(
    `SELECT a.adresse, a.interne, a.partie, a.lot_cle, a.proprietaire_cle,
            (a.message_id = $1) AS du_mail
       FROM gestion_message_adresse a
       JOIN gestion_message mm ON mm.id = a.message_id
      WHERE a.message_id = $1 OR ($2::bigint IS NOT NULL AND mm.fil_id = $2::bigint)`,
    [messageId, filId]);

  const adresses: AdresseVue[] = adr.map((a) => ({
    adresse: a.adresse,
    interne: a.interne,
    partie: a.partie === 'locataire' || a.partie === 'proprietaire' ? a.partie : null,
    lotCle: a.lot_cle,
    proprietaireCle: a.proprietaire_cle,
    duMail: a.du_mail,
  }));

  /**
   * ── ③ LE CATALOGUE DES BIENS ────────────────────────────────────────────────────────────────────────────────
   * ⚠️ TOUS LES LOTS, ET C'EST DÉLIBÉRÉ : le cas (d) cherche une adresse ou un n° de lot dans le TEXTE du mail,
   * sans qu'aucune adresse électronique n'ait rien donné — il n'y a donc aucun moyen de restreindre la liste
   * d'avance. Mesuré le 28/09/2026 : 365 lots en gestion. Les charger tous coûte une requête de 365 lignes ;
   * deviner lesquels charger coûterait des propositions manquantes, qui, elles, ne font aucun bruit.
   */
  const { rows: lots } = await query<LotDB>(
    `SELECT lo.id::text, lo.wippimmo_id AS cle, lo.adresse, lo.commune, lo.type_bien,
            lo.code_postal, lo.immeuble, lo.nature,
            lo.gestion_debut::text AS gestion_debut, lo.gestion_fin::text AS gestion_fin,
            lo.proprietaire_id::text AS proprietaire_id,
            pr.wippimmo_id AS proprietaire_cle, pr.nom_complet AS proprietaire_nom, pr.civilite AS proprietaire_civilite
       FROM gestion_annuaire_lot lo
       LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id
      ORDER BY lo.commune NULLS LAST, lo.adresse NULLS LAST, lo.wippimmo_id`);
  const parCle = new Map(lots.map((l) => [l.cle, l]));

  // ── ④ LE MOTEUR, PUR : c'est lui qui décide, et il s'éprouve sans base ────────────────────────────────────────
  const examen = proposerBiens({
    adresses,
    textes: { objet: m.objet, corps: m.corps, pieces: pieces.map((p) => p.nom_fichier) },
    biens: lots.map((l) => ({
      cle: l.cle, numero: l.cle, adresse: l.adresse, commune: l.commune,
      proprietaireCle: l.proprietaire_cle, proprietaireNom: l.proprietaire_nom,
    })),
  });

  /**
   * ── ⑤ CE QUI EST DÉJÀ POSÉ SUR CE MAIL ──────────────────────────────────────────────────────────────────────
   * 🔴 LES PROPOSITIONS ANCIENNES DE TYPE PROPRIÉTAIRE SONT LUES, ET RENDUES SOUS FORME DE BIENS — sans rien
   * réécrire en base tant que personne n'a validé (demande d'Arno, point 3). Une ligne « propriétaire » en base
   * n'est pas fausse : elle est seulement écrite dans un vocabulaire qu'on n'emploie plus.
   */
  const { rows: liens } = await query<{ cible_sorte: string; cible_cle: string | null; statut: string }>(
    `SELECT cible_sorte, cible_cle, statut FROM gestion_rattachement
      WHERE message_id = $1 AND statut IN ('propose', 'confirme')`, [messageId]);
  const clesConfirmees = new Set(
    liens.filter((l) => l.cible_sorte === 'lot' && l.statut === 'confirme').map((l) => l.cible_cle ?? ''));
  const lotsDesLiens = new Set(liens.filter((l) => l.cible_sorte === 'lot').map((l) => l.cible_cle ?? ''));
  const propriosDesLiens = new Set(
    liens.filter((l) => l.cible_sorte === 'proprietaire').map((l) => l.cible_cle ?? ''));

  /** Les biens à montrer : ceux que le moteur propose, PLUS ceux qu'un lien ancien désigne (directement ou via son propriétaire). */
  const aMontrer = new Map<string, { motif: string; cas: 'a' | 'b' | 'c' | 'd'; certitude: 'quasi_certaine' | 'a_trancher'; preCoche: boolean }>();
  for (const p of examen.propositions) {
    aMontrer.set(p.cle, { motif: p.motif, cas: p.cas, certitude: p.certitude, preCoche: p.preCoche });
  }
  for (const cle of lotsDesLiens) {
    if (cle !== '' && !aMontrer.has(cle)) {
      aMontrer.set(cle, {
        motif: 'rattachement déjà posé sur ce mail', cas: 'a', certitude: 'quasi_certaine',
        preCoche: clesConfirmees.has(cle),
      });
    }
  }
  for (const cleProprio of propriosDesLiens) {
    for (const l of lots) {
      if (l.proprietaire_cle !== cleProprio || aMontrer.has(l.cle)) continue;
      const nom = l.proprietaire_nom ?? cleProprio;
      aMontrer.set(l.cle, {
        motif: `ancienne proposition « propriétaire ${nom} » — voici ses biens`,
        cas: 'c', certitude: 'a_trancher', preCoche: false,
      });
    }
  }

  /**
   * ── ⑥ LES PARTIES DE CHAQUE BIEN, À LA DATE DU MAIL, ET LEURS MOYENS DE CONTACT ─────────────────────────────
   * DEUX TEMPS, ET C'EST VOULU : on lit d'abord les occupations de chaque bien retenu (ils sont peu nombreux),
   * puis TOUS les contacts en UNE requête. L'inverse — un aller-retour par personne — se verrait à l'écran.
   */
  const occupations = new Map<string, { locataireId: string; cle: string; nom: string;
    depuis: string | null; jusqua: string | null }[]>();
  for (const cle of aMontrer.keys()) {
    const l = parCle.get(cle);
    if (l === undefined) continue;
    const { rows: loc } = await query<{
      locataire_id: string; cle: string; nom: string; depuis: string | null; jusqua: string | null;
    }>(SQL_PARTIES, [l.id, dateMail]);
    occupations.set(cle, loc.map((x) => ({
      locataireId: x.locataire_id, cle: x.cle, nom: x.nom, depuis: x.depuis, jusqua: x.jusqua,
    })));
  }

  const idsProprios = [...new Set([...aMontrer.keys()]
    .map((c) => parCle.get(c)?.proprietaire_id ?? null)
    .filter((x): x is string => x !== null))];
  const idsLocataires = [...new Set([...occupations.values()].flat().map((x) => x.locataireId))];

  const contacts: CarteContacts = new Map();
  if (idsProprios.length > 0 || idsLocataires.length > 0) {
    // LOT CONTACTS-ET-EVENEMENT — la 267 est-elle là ? Sinon la colonne n'est nommée nulle part (repli générique).
    const avecLibelle = await libelleSourceContactDisponible();
    const { rows: cts } = await query<{
      sujet: string; sujet_id: string; sorte: string; valeur: string; rang: number; libelle_source: string | null;
    }>(sqlContacts(avecLibelle), [idsProprios, idsLocataires]);
    for (const c of cts) {
      const k = cleContact(c.sujet, c.sujet_id);
      const e = contacts.get(k) ?? { emails: [], telephones: [] };
      // 🔴 LE LIBELLÉ N'EST JAMAIS VIDE : `libelleContact` retombe sur la sorte numérotée par le rang.
      const coord: Coordonnee = {
        valeur: c.valeur,
        libelle: libelleContact({ sorte: c.sorte, rang: c.rang, libelleSource: c.libelle_source }),
      };
      if (c.sorte === 'email') e.emails.push(coord);
      else if (c.sorte === 'telephone') e.telephones.push(coord);
      contacts.set(k, e);
    }
  }
  const contactsDe = (sujet: string, id: string | null): { emails: Coordonnee[]; telephones: Coordonnee[] } =>
    (id === null ? undefined : contacts.get(cleContact(sujet, id))) ?? { emails: [], telephones: [] };

  const biens: BienProposable[] = [];
  for (const [cle, info] of aMontrer) {
    const l = parCle.get(cle);
    if (l === undefined) continue;
    const parties: PartieBien[] = [];
    if (l.proprietaire_cle !== null) {
      const c = contactsDe('proprietaire', l.proprietaire_id);
      parties.push({
        role: 'proprietaire', cle: l.proprietaire_cle, nom: l.proprietaire_nom ?? '(sans nom)',
        civilite: l.proprietaire_civilite, emails: c.emails, telephones: c.telephones,
      });
    }
    for (const x of occupations.get(cle) ?? []) {
      const c = contactsDe('locataire', x.locataireId);
      parties.push({
        role: 'locataire', cle: x.cle, nom: x.nom, depuis: x.depuis, jusqua: x.jusqua,
        emails: c.emails, telephones: c.telephones,
      });
    }
    const fiche = {
      cle: l.cle, adresse: l.adresse, codePostal: l.code_postal, commune: l.commune,
      immeuble: l.immeuble, nature: l.nature, typeBien: l.type_bien,
      gestionDebut: l.gestion_debut, gestionFin: l.gestion_fin,
    };
    biens.push({
      cle: l.cle,
      libelle: libelleBien({ adresse: l.adresse, commune: l.commune, cle: l.cle }),
      adresse: l.adresse, commune: l.commune, typeBien: l.type_bien,
      adresseComplete: adresseComplete(fiche),
      caracteristiques: caracteristiquesDuLot(fiche),
      parties,
      recommande: info.preCoche,
      motif: info.motif,
      cas: info.cas,
      certitude: info.certitude,
      dejaRattache: clesConfirmees.has(l.cle),
    });
  }

  /** Le propriétaire qui TITRE la liste — jamais une cible. Celui des biens proposés, s'ils n'en ont qu'un. */
  const propsVus = [...new Set(biens.map((b) => b.parties.find((p) => p.role === 'proprietaire')?.cle ?? '')
    .filter((x) => x !== ''))];
  const proprio = propsVus.length === 1
    ? biens.find((b) => b.parties.some((p) => p.role === 'proprietaire' && p.cle === propsVus[0]))
      ?.parties.find((p) => p.role === 'proprietaire') ?? null
    : null;

  return {
    messageId,
    filId,
    dateMail,
    nbMailsDuFil: m.nb,
    proprietaire: proprio === null ? null : { cle: proprio.cle, nom: proprio.nom },
    examen: { issue: examen.issue, motif: examen.motif },
    pieces: pieces.map((p) => ({ pieceId: Number(p.id), nom: p.nom_fichier, miniature: p.miniature === true })),
    /**
     * ⚠️ LE PLUS SÛR EN TÊTE : quasi certain, puis pré-coché, puis l'ordre alphabétique. Un bien trouvé par son
     * locataire ne doit pas être à chercher au milieu des huit lots du bailleur.
     */
    biens: biens.sort((a, b) =>
      Number(b.certitude === 'quasi_certaine') - Number(a.certitude === 'quasi_certaine')
      || Number(b.recommande) - Number(a.recommande)
      || a.libelle.localeCompare(b.libelle, 'fr')),
    disponible: true,
  };
}

/**
 * LES MAILS D'UNE CONVERSATION QUI N'ONT AUCUN RATTACHEMENT MANUEL. LECTURE SEULE.
 *
 * 🔴 C'EST LA PORTÉE « TOUTE LA CONVERSATION », et elle ne PIÉTINE JAMAIS un geste humain : un mail que quelqu'un
 * a classé à la main garde son classement. Appliquer le nouveau partout écraserait, sans le dire, une décision
 * prise en connaissance de cause — exactement ce qu'un classement en masse ne doit pas faire.
 */
export async function mailsSansClassementManuel(filId: number): Promise<number[]> {
  if (!(await rattachementsDisponibles())) return [];
  const { rows } = await query<{ id: string }>(
    `SELECT m.id::text FROM gestion_message m
      WHERE m.fil_id = $1::bigint
        AND NOT EXISTS (
          SELECT 1 FROM gestion_rattachement r
           WHERE r.message_id = m.id AND r.statut = 'confirme'
             AND (r.origine = 'manuel' OR r.statut_par_libelle IS NOT NULL)
             AND r.cible_sorte IN ('lot', 'proprietaire', 'locataire'))
      ORDER BY m.recu_le, m.id`, [filId]);
  return rows.map((r) => Number(r.id));
}
