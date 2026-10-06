/**
 * MODULE « GESTION » — LOT RATTACHEMENT-1 : ÉCRIRE ET RELIRE LES RATTACHEMENTS. IMPUR (SQL).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 UNE SEULE SOURCE POUR LE MOTEUR : `examinerMessage` de `rattachement.ts`. La simulation, l'écriture réelle et
 * l'épreuve sur cluster jetable passent toutes les trois par elle. Sans cela, le rapport à blanc annoncerait un
 * classement et l'écriture en ferait un autre — le pire défaut possible, puisque le rapport est justement ce qu'on
 * relit AVANT d'autoriser l'écriture.
 *
 * 🔴 ON TRAVAILLE PAR FIL, PAS PAR MAIL. La règle (b) a besoin de voir tout l'échange avant de conclure : charger
 * les adresses fil par fil, c'est une requête pour une vingtaine de messages au lieu d'une par message. Le curseur
 * de reprise est donc l'identifiant du FIL — 36 175 fils au lieu de 56 805 messages, et une reprise triviale.
 *
 * ═══ 🔴 CE QUE LE RECALCUL NE DOIT JAMAIS DÉFAIRE ═══════════════════════════════════════════════════════════════
 * L'annuaire s'enrichit, le moteur change : la commande sera relancée. Elle doit alors respecter absolument ce
 * qu'un humain a décidé. Trois garde-fous, tenus en SQL et non par convention :
 *   ① un lien dont un humain a touché le statut (`statut_par_libelle` renseigné) n'est jamais modifié ;
 *   ② un lien `rejete` ou `retire` n'est jamais ressuscité — sans quoi la file se remplirait de ce qu'on vient
 *      d'écarter, et le tri serait un travail de Sisyphe ;
 *   ③ un lien posé À LA MAIN (`origine = 'manuel'`) n'est jamais touché, quel que soit son statut.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query, withTransaction, type RequeteTx } from '../db/client';
// 🔴🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — l'annuaire des personnes, pour le cas (e).
import { chargerAnnuaireContenu } from './annuaireContenuRepo';
// 🔴🔴 LOT BULLE-INFO-ET-S12 — « la fenêtre gagne ». La RÈGLE est pure ; la carte des fenêtres vient de
//   `periodeRepo`, qui importe ce fichier-ci — on la charge donc à la demande, comme le fait déjà la relève.
import { faceALaFenetre } from './periodesConversation';
// 🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — le corps à fouiller : le texte, ou le HTML rendu en texte.
import { corpsLisible } from './htmlMail';
import { CORPS_CHERCHABLE_MAX } from './propositionsBien';
// 🔴 LOT NOM-UNIQUE-DES-PIECES — le repli « nom d'usage, sinon nom d'origine », écrit UNE fois.
import { sqlNomAffiche } from './nomUsageSql';
/* 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — les biens ou une adresse est un contact rattache (cas (f)). La lecture
   vit dans le depot de la 304, seul autorise a nommer ses tables : voir l'encadre de `biensDesContacts`. */
import { biensDesContacts } from './partieCategorieRepo';
/* 🔴🔴 LOT CORBEILLE-SANS-STATUT, POINT 2 — la règle du mail inerte, écrite une fois dans le module PUR. */
import { sqlPasInerte } from './mailInerte';
import {
  annuaireDisponible, corbeilleGmailDisponible, interneDisponible, interneDuMessageDisponible,
  rattachementsDisponibles, spamDisponible,
} from './schema';
// 🔴 LOT CLASSER-SUR-CHAQUE-MAIL — la catégorie d'un lot (logement / parking / cave). Module PUR.
import { categorieDuBien } from './categorieBien';
// LOT STATUT-HORS-GESTION — rattacher un bien lève la marque « hors gestion » du mail (réversibilité naturelle).
import { leverHorsGestionApresRattachement } from './horsGestionRepo';
// 🔴🔴 LOT CONTACTS-EXTERNES — une intervention ne survit pas au départ de son bien (voir `changerStatut`).
//   ⚠️ AUCUN CYCLE : `contactExterneRepo` n'importe pas ce fichier-ci.
import { retirerInterventionsSansBien } from './contactExterneRepo';
import { nomBien, nomProprietaire } from './driveArbre';
import type { BienConnu } from './propositionsBien';
import {
  cibleCourte, examinerMessage, memeCible, motifSorteRefusee, sortePermise,
  type Cible, type Candidat, type Issue, type Statut,
} from './rattachement';
import type { AdresseEchange } from './propositionTri';

/** Combien de fils par paquet. Assez pour aller vite, assez peu pour qu'une coupure ne coûte presque rien. */
export const PAQUET_FILS = 300;

/** Qui agit. `id` null = voie de secours (mot de passe partagé) ; le libellé, lui, est TOUJOURS écrit. */
export interface Auteur { id: number | null; libelle: string }

export const AUTEUR_MOTEUR: Auteur = { id: null, libelle: 'moteur de rattachement' };

export interface ComptesPasse {
  filsVus: number;
  messagesVus: number;
  automatiques: number;
  aTrier: number;
  /** Parmi « à trier » : le mail lui-même désignait PLUSIEURS cibles (règle a). Un vrai arbitrage. */
  aTrierParLeMail: number;
  /** Parmi « à trier » : le mail ne disait rien, l'échange oui (règle b). Jamais automatique — voir `rattachement.ts`. */
  aTrierParLEchange: number;
  sansCandidat: number;
  /** Parmi « sans candidat » : aucune adresse de l'échange n'est à l'annuaire. */
  sansCandidatInconnu: number;
  /** Parmi « sans candidat » : des adresses SONT reconnues, mais aucune ne désigne de lot ni de propriétaire. */
  sansCandidatSansCible: number;
  liensEcrits: number;
  candidatsEcrits: number;
  liensRetires: number;
  /** Ce que le recalcul a laissé intact parce qu'un humain y avait touché. Le dire est une information. */
  respectes: number;
}

export const COMPTES_VIDES: ComptesPasse = {
  filsVus: 0, messagesVus: 0, automatiques: 0,
  aTrier: 0, aTrierParLeMail: 0, aTrierParLEchange: 0,
  sansCandidat: 0, sansCandidatInconnu: 0, sansCandidatSansCible: 0,
  liensEcrits: 0, candidatsEcrits: 0, liensRetires: 0, respectes: 0,
};

// ── LES NOMS LISIBLES DES CIBLES ────────────────────────────────────────────────────────────────────────────────

export interface LibellesCibles {
  lots: Map<string, string>;
  proprietaires: Map<string, string>;
}

export const LIBELLES_VIDES: LibellesCibles = { lots: new Map(), proprietaires: new Map() };

/**
 * LES NOMS LISIBLES de tous les lots et propriétaires, lus une fois par passe.
 *
 * ⚠️ IL FAUT LES FIGER DANS CHAQUE LIGNE. Une clé WIPPIMMO ne dit rien à personne ; et si le lot sort de la gestion,
 * une jointure ne rendrait plus rien du tout. On écrit donc le nom à côté de la clé — même raison que
 * `auteur_libelle` dans le journal.
 */
export async function chargerLibelles(): Promise<LibellesCibles> {
  const { rows: lots } = await query<{
    cle: string; prop: string | null; adresse: string | null; cp: string | null; commune: string | null;
    nature: string | null; type_bien: string | null;
  }>(`SELECT lo.wippimmo_id AS cle, pr.wippimmo_id AS prop, lo.adresse, lo.code_postal AS cp, lo.commune,
             lo.nature, lo.type_bien
        FROM gestion_annuaire_lot lo
        LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id`);

  const { rows: props } = await query<{ cle: string; nom_complet: string }>(
    'SELECT wippimmo_id AS cle, nom_complet FROM gestion_annuaire_proprietaire');

  return {
    lots: new Map(lots.map((l) => [l.cle, nomBien({
      wippimmoId: l.cle, proprietaireWippimmoId: l.prop, adresse: l.adresse, codePostal: l.cp,
      commune: l.commune, nature: l.nature, typeBien: l.type_bien,
    })])),
    proprietaires: new Map(props.map((p) => [p.cle, nomProprietaire({ wippimmoId: p.cle, nomComplet: p.nom_complet })])),
  };
}

/**
 * 🔴 LOT AFFECTATION-PAR-BIEN — LE CATALOGUE DES BIENS, lu UNE FOIS PAR PASSE. LECTURE SEULE.
 *
 * C'est lui qui permet de distinguer le cas (b) — un propriétaire qui n'a QU'UN bien, donc un lien automatique —
 * du cas (c) — plusieurs biens, donc des propositions. Mesuré le 28/09/2026 : 365 lots. Le relire à chaque message
 * coûterait 57 000 requêtes pour une information qui ne bouge pas pendant la passe.
 */
export async function chargerCatalogueBiens(): Promise<BienConnu[]> {
  const { rows } = await query<{
    cle: string; adresse: string | null; commune: string | null;
    proprietaire_cle: string | null; proprietaire_nom: string | null;
  }>(
    `SELECT lo.wippimmo_id AS cle, lo.adresse, lo.commune,
            pr.wippimmo_id AS proprietaire_cle, pr.nom_complet AS proprietaire_nom
       FROM gestion_annuaire_lot lo
       LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id`);
  return rows.map((r) => ({
    cle: r.cle, numero: r.cle, adresse: r.adresse, commune: r.commune,
    proprietaireCle: r.proprietaire_cle, proprietaireNom: r.proprietaire_nom,
  }));
}

/** Le nom lisible d'une cible, ou sa forme courte quand l'annuaire ne la connaît pas (encore). PUR. */
export function libelleCible(c: Cible, l: LibellesCibles): string {
  if (c.sorte === 'lot') return l.lots.get(c.cle ?? '') ?? `lot ${c.cle ?? '?'}`;
  if (c.sorte === 'proprietaire') return l.proprietaires.get(c.cle ?? '') ?? `propriétaire ${c.cle ?? '?'}`;
  /* 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 3 — sans cette branche, un locataire se serait lu « carte n° ? » :
     la chaîne retombait sur la carte pour toute sorte non nommée. Le libellé vient de l'historique lui-même
     (`CibleEtendue.libelles`), ce repli ne servant qu'à ne jamais afficher un vide. */
  if (c.sorte === 'locataire') return `locataire ${c.cle ?? '?'}`;
  return `carte n° ${c.id ?? '?'}`;
}

// ── LE CURSEUR ET LES PAQUETS ───────────────────────────────────────────────────────────────────────────────────

/**
 * LE CURSEUR DE REPRISE : le plus grand identifiant de fil déjà examiné.
 *
 * ⚠️ REPASSER SUR LE DERNIER FIL EST SANS CONSÉQUENCE — tout est idempotent — et c'est préférable à en sauter un.
 */
export async function curseurPasse(): Promise<number> {
  if (!(await rattachementsDisponibles())) return 0;
  const { rows } = await query<{ n: string | null }>(
    `SELECT max(m.fil_id)::text AS n
       FROM gestion_rattachement_examen e JOIN gestion_message m ON m.id = e.message_id`);
  return Number(rows[0]?.n ?? 0);
}

export interface MessageDuPaquet {
  id: number;
  filId: number;
  /**
   * 🔴 LOT AFFECTATION-PAR-BIEN — l'objet et le corps du mail, matière des cas (c) et (d) : « adresse du bien ou
   * n° de lot cité dans l'objet ou le corps ». Sans eux, les mails de comptabilité et de syndic — qui n'ont AUCUNE
   * adresse à l'annuaire mais citent le logement en toutes lettres — resteraient sans aucune proposition.
   */
  objet: string | null;
  corps: string | null;
  /** Les noms des pièces jointes : « Quittance 12 rue Danton.pdf » désigne un bien aussi sûrement qu'un objet. */
  pieces: string[];
  /**
   * 🔴🔴 LOT DOCUMENTS-HORS-BIENS — le SENS et l'EXCLUSION, qui disent si ce mail est un de NOS envois
   * automatiques. Sans eux, le moteur rattacherait au logement du locataire une quittance qui ne concerne que lui.
   */
  sens: string | null;
  exclusionRegleId: number | null;
}

export interface Paquet {
  fils: number[];
  messages: MessageDuPaquet[];
  adresses: Map<number, AdresseEchange[]>;
}

/**
 * LOT ERGO-BOITE-3 — LE SPAM N'EST JAMAIS EXAMINÉ.
 *
 * 🔴 POURQUOI C'EST ICI, ET PAS DANS LE MOTEUR. Le moteur de rattachement est PUR : il rapproche des adresses de
 * l'annuaire, sans savoir d'où vient un message. C'est donc à la LECTURE qu'on écarte le spam — au seul endroit où
 * il est encore reconnaissable. Sans cela, 231 messages indésirables entreraient dans « À rattacher » et le
 * programme chercherait à quel propriétaire rattacher une publicité.
 *
 * ⚠️ Sans la migration 263, la colonne n'est pas nommée : la clause est vide et le comportement est celui d'avant.
 */
/**
 * ⚠️ LOT BOITE-INTERNE-CORBEILLE — ELLE ÉCARTE MAINTENANT DEUX CHOSES, et le nom garde son premier sujet parce
 * qu'il est cité dans `spam.test.ts`. Un mail À LA CORBEILLE de Gmail n'a rien à faire dans « À rattacher » : on
 * vient de le supprimer, chercher à quel logement le rattacher serait du travail créé par un geste de ménage.
 * Sans les migrations 263 / 275, la colonne concernée n'est pas nommée et la clause reste celle d'avant.
 */
/**
 * ══ 🔴🔴 LOT CORBEILLE-SANS-STATUT, POINT 2 — LA FILE IGNORE LES MAILS INERTES ═══════════════════════════════════
 *
 * RÈGLE D'ARNO (06/10/2026) : un mail mis à la corbeille SANS statut « sort de “À classer” et de “À rattacher”
 * […], ses propositions de rattachement ne sont plus montrées ».
 *
 * 🔴 CE QUI MANQUAIT, ET OÙ EXACTEMENT. La PASSE, elle, écartait déjà la corbeille (voir `clauseHorsSpam` juste
 * au-dessus) : un mail jeté n'est ni réexaminé ni proposé. Mais la file « À rattacher » et ses compteurs ne lisent
 * pas les messages — ils lisent `gestion_rattachement_examen`, la table des examens DÉJÀ faits, et celle-ci ne
 * savait rien de la corbeille. Un mail jeté restait donc dans la file, avec ses propositions, et il comptait dans
 * le nombre de la colonne de gauche. Mesuré en base le 06/10/2026 : **43 mails à la corbeille sans statut**, dont
 * **31 portent des propositions**.
 *
 * ⚠️ UN MAIL JETÉ **AVEC** UN STATUT N'EST PAS CONCERNÉ : il n'est pas inerte, et la file le traite comme avant.
 * ⚠️ RIEN N'EST SUPPRIMÉ : l'examen et les propositions restent en base. On cesse de les lire, c'est tout — et
 * c'est ce qui fait que réintégrer suffit à tout ramener.
 */
async function clausePasInerte(alias: string): Promise<string> {
  const [corbeille, rattachements, interne, interneParMail] = await Promise.all([
    corbeilleGmailDisponible(), rattachementsDisponibles(), interneDisponible(), interneDuMessageDisponible(),
  ]);
  return sqlPasInerte(alias, { corbeille, rattachements, interne, interneParMail });
}

async function clauseHorsSpam(alias: string): Promise<string> {
  const [spam, corbeille] = await Promise.all([spamDisponible(), corbeilleGmailDisponible()]);
  return `${spam ? `AND ${alias}.spam_le IS NULL` : ''}${corbeille ? ` AND ${alias}.corbeille_le IS NULL` : ''}`;
}

/** Les messages des `nbFils` fils suivant `depuis`, et toutes les adresses de ces fils. LECTURE SEULE. */
export async function chargerPaquet(depuis: number, nbFils: number): Promise<Paquet> {
  const horsSpam = await clauseHorsSpam('m');
  const { rows: fils } = await query<{ fil_id: string }>(
    `SELECT DISTINCT m.fil_id FROM gestion_message m
      WHERE m.fil_id > $1 ${horsSpam} ORDER BY m.fil_id LIMIT $2`, [depuis, nbFils]);
  return chargerFils(fils.map((f) => Number(f.fil_id)));
}

/**
 * LES MESSAGES ET LES ADRESSES DE FILS NOMMÉS UN PAR UN. LECTURE SEULE.
 *
 * 🔴 C'EST LE POINT D'ENTRÉE DE LA RELÈVE CONTINUE (lot RATTACHEMENT-2). Elle ne connaît pas de curseur : elle sait
 * quels fils viennent d'être touchés, et veut les réexaminer ENTIÈREMENT — pas seulement les messages nouveaux. La
 * raison est la règle b : une réponse qui arrive aujourd'hui peut lever l'ambiguïté d'un mail d'hier resté « proposé ».
 */
export async function chargerFils(ids: readonly number[]): Promise<Paquet> {
  if (ids.length === 0) return { fils: [], messages: [], adresses: new Map() };

  // Un fil peut mêler du courrier ordinaire et un spam (Gmail range par conversation) : on écarte le MESSAGE, pas
  //   le fil — sinon un spam égaré ferait disparaître de la file un échange parfaitement légitime.
  const horsSpam = await clauseHorsSpam('m');
  const { rows: msgs } = await query<{
    id: string; fil_id: string; objet: string | null; corps: string | null; html: string | null;
    pieces: string[] | null; sens: string | null; exclu_par_regle_id: number | null;
  }>(
    // ⚠️ LES PIÈCES EN UNE FOIS, par agrégat : une requête par message coûterait des milliers d'accès sur une passe
    //    complète. Le corps est borné — on y cherche une adresse ou un n° de lot, pas un roman.
    // 🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — le HTML sert de SECOURS quand le texte manque (1 189 messages,
    //    dont les relevés bancaires). Il est borné plus largement : la conversion le réduit beaucoup.
    `SELECT m.id, m.fil_id, m.objet, left(coalesce(m.corps_texte, ''), 4000) AS corps,
            left(coalesce(m.corps_html, ''), 60000) AS html,
            m.sens, m.exclu_par_regle_id,
            (SELECT array_agg(${await sqlNomAffiche('p')}) FROM gestion_piece p WHERE p.message_id = m.id) AS pieces
       FROM gestion_message m
      WHERE m.fil_id = ANY($1::bigint[]) ${horsSpam} ORDER BY m.id`, [ids]);

  const { rows: adr } = await query<{
    fil_id: string; message_id: string; adresse: string; interne: boolean; partie: string | null;
    proprietaire_cle: string | null; locataire_id: string | null; lot_cle: string | null; motif: string | null;
  }>(
    `SELECT m.fil_id, a.message_id, a.adresse, a.interne, a.partie, a.proprietaire_cle, a.locataire_id,
            a.lot_cle, a.motif
       FROM gestion_message_adresse a
       JOIN gestion_message m ON m.id = a.message_id
      WHERE m.fil_id = ANY($1::bigint[])`, [ids]);

  /**
   * ══ 🔴🔴 LOT HISTORIQUE-BIEN-6, POINT 1 — LES CARTES DE CONTACT, POUR LE CAS (f) ═══════════════════════════════
   *
   * DEMANDE D'ARNO : « Vérifie que la passe de rattachement automatique utilise bien ces cartes de contact (côté
   * propriétaire et côté locataire) ; si ce n'est pas le cas, branche-la. »
   *
   * 🔴 ELLE NE L'UTILISAIT PAS, et c'est mesuré : `gestion_contact_carte` n'était lue que par
   * `partieCategorieRepo` — l'écran qui POSE les cartes, et personne d'autre. Le « + » de la fiche d'un bien
   * n'avait donc aucune suite : créer la carte d'un contact ne changeait rien au classement de ses mails
   * suivants. C'est cette lecture-ci qui lui en donne une.
   *
   * ⚠️ UNE SEULE REQUÊTE POUR TOUT LE PAQUET, bornée aux adresses qu'on vient de lire : une requête par adresse
   * coûterait des milliers d'accès sur une passe complète, et c'est la règle de ce module depuis la liste de la
   * boîte.
   *
   * ⚠️ LES CARTES RETIRÉES NE COMPTENT PAS (`retire_le IS NULL`). Une carte retirée est un rattachement défait :
   * la faire encore proposer son bien serait rendre le geste de retrait sans effet.
   *
   * ⚠️ SANS LA TABLE (migration 304 absente), LA CARTE RESTE VIDE et le cas (f) ne joue pas — la passe se
   * comporte alors exactement comme avant ce lot. Une sonde voyage avec sa donnée : règle du module.
   */
  const cartes = await biensDesContacts(adr.map((r) => r.adresse));

  const adresses = new Map<number, AdresseEchange[]>();
  for (const r of adr) {
    const fil = Number(r.fil_id);
    const liste = adresses.get(fil) ?? [];
    liste.push({
      adresse: r.adresse, messageId: Number(r.message_id), interne: r.interne,
      cartesLots: cartes.get(r.adresse.trim().toLowerCase()),
      reconnaissance: {
        partie: r.partie as 'proprietaire' | 'locataire' | null,
        proprietaireCle: r.proprietaire_cle,
        locataireId: r.locataire_id === null ? null : Number(r.locataire_id),
        lotCle: r.lot_cle,
        motif: r.motif ?? '',
      },
    });
    adresses.set(fil, liste);
  }
  return {
    fils: [...ids],
    messages: msgs.map((m) => ({
      id: Number(m.id), filId: Number(m.fil_id), objet: m.objet,
      corps: corpsLisible(m.corps, m.html).slice(0, CORPS_CHERCHABLE_MAX), pieces: m.pieces ?? [],
      sens: m.sens, exclusionRegleId: m.exclu_par_regle_id,
    })),
    adresses,
  };
}

// ── L'ÉCRITURE D'UN LIEN ────────────────────────────────────────────────────────────────────────────────────────

/** Les cinq valeurs qui identifient un lien, dans l'ordre où les requêtes les attendent. */
function identite(messageId: number, pieceId: number | null, c: Cible): [number, number, string, string, number] {
  return [messageId, pieceId ?? 0, c.sorte, c.cle ?? '', c.id ?? 0];
}

const OU_IDENTITE = `message_id = $1 AND coalesce(piece_id, 0) = $2
   AND cible_sorte = $3 AND coalesce(cible_cle, '') = $4 AND coalesce(cible_id, 0) = $5`;

/**
 * POSE OU MET À JOUR UN LIEN PROPOSÉ PAR LE MOTEUR. Rend ce qui a été fait.
 *
 * 🔴 L'ORDRE EST DÉLIBÉRÉ : on tente d'abord la MISE À JOUR, restreinte aux lignes que le moteur a posées et
 * qu'aucun humain n'a touchées ; on n'INSÈRE que si elle n'a rien trouvé, et seulement en l'absence de TOUTE ligne
 * pour cette identité. C'est ce qui fait qu'un recalcul ne ressuscite jamais un candidat rejeté (il existe une
 * ligne, donc pas d'insertion) et n'écrase jamais une décision humaine (la mise à jour l'exclut).
 */
async function ecrireLienMoteur(
  q: RequeteTx, messageId: number, c: Cible, statut: 'propose' | 'confirme', cand: Candidat, libelle: string,
): Promise<'ecrit' | 'maj' | 'respecte'> {
  /**
   * 🔴🔴 LOT FICHE-RATTACHEMENT — LE MOTEUR NE PEUT PLUS ÉCRIRE UNE PERSONNE, MÊME SI ON LE LUI DEMANDE.
   *
   * En l'état du code, ce refus est INATTEIGNABLE : `examinerMessage` n'émet que des `cibleLot`. Il est là pour le
   * jour où quelqu'un branchera un autre moteur sur cette fonction — et ce jour-là, il vaudra mieux que le mail ne
   * soit pas rattaché du tout qu'annoncé « rattaché au propriétaire X » dans l'historique d'un client.
   *
   * ⚠️ IL NE LÈVE PAS : une passe de 37 000 liens ne doit pas s'arrêter sur un cas. On le DIT au journal du
   * serveur, qui est l'endroit où l'on regarde quand un chiffre surprend, et on passe au suivant.
   */
  if (!sortePermise(c.sorte)) {
    console.error('[gestion/rattachement] cible refusée par la règle « bien » : message=%d cible=%s',
      messageId, cibleCourte(c));
    return 'respecte';
  }
  const id = identite(messageId, null, c);
  const maj = await q(
    `UPDATE gestion_rattachement
        SET statut = $6, regle = $7, confiance = $8, motif = $9, adresses = $10, cible_libelle = $11
      WHERE ${OU_IDENTITE}
        AND origine = 'automatique' AND statut IN ('propose', 'confirme') AND statut_par_libelle IS NULL`,
    [...id, statut, cand.regle, cand.confiance, cand.motif, cand.adresses.join(' '), libelle]);
  if ((maj.rowCount ?? 0) > 0) return 'maj';

  const ins = await q(
    `INSERT INTO gestion_rattachement
       (message_id, piece_id, cible_sorte, cible_cle, cible_id, cible_libelle,
        origine, regle, confiance, adresses, motif, statut, cree_par_libelle)
     SELECT $1, NULL, $3, nullif($4, ''), nullif($5, 0)::bigint, $11,
            'automatique', $7, $8, $10, $9, $6, 'moteur de rattachement'
      WHERE NOT EXISTS (SELECT 1 FROM gestion_rattachement WHERE ${OU_IDENTITE})`,
    [...id, statut, cand.regle, cand.confiance, cand.motif, cand.adresses.join(' '), libelle]);
  return (ins.rowCount ?? 0) > 0 ? 'ecrit' : 'respecte';
}

/**
 * RETIRE les liens que le moteur avait posés et qu'il ne propose PLUS, ce mail-ci seulement.
 *
 * ⚠️ JAMAIS CEUX QU'UN HUMAIN A TOUCHÉS. Un lien confirmé à la main reste, même si l'annuaire a changé d'avis :
 * la personne avait le mail sous les yeux, le moteur non.
 *
 * 🔴 LA COMPARAISON SE FAIT EN TYPESCRIPT, par `memeCible`, et NON par une expression SQL qui refabriquerait la
 * forme courte d'une cible. Cette forme existe déjà dans le module pur ; l'écrire une seconde fois en SQL créerait
 * deux définitions de « la même cible », qui divergeraient au premier ajout de sorte.
 */
async function retirerLiensPerimes(
  q: RequeteTx, messageId: number, gardees: readonly Cible[],
  /**
   * 🔴 QUI RETIRE, ET POURQUOI — étiquetable pour une passe de CONVERSION. Le défaut est le moteur, et c'est ce
   * qu'on veut pour les passes ordinaires. Mais quand une RÈGLE change — le 28/09/2026, la cible d'un classement
   * est devenue un BIEN et non plus une personne —, 19 538 liens se retirent d'un coup : les signer « moteur de
   * rattachement » les rendrait indiscernables du bruit quotidien, et personne ne saurait, six mois après,
   * pourquoi tous les rattachements « propriétaire » ont disparu le même jour.
   */
  retrait: { auteur: string; motif: string } = {
    auteur: AUTEUR_MOTEUR.libelle, motif: 'le moteur ne propose plus cette cible',
  },
): Promise<number> {
  const { rows } = await q<{ id: string; cible_sorte: string; cible_cle: string | null; cible_id: string | null }>(
    `SELECT id, cible_sorte, cible_cle, cible_id FROM gestion_rattachement
      WHERE message_id = $1 AND piece_id IS NULL
        AND origine = 'automatique' AND statut IN ('propose', 'confirme') AND statut_par_libelle IS NULL`,
    [messageId]);

  const perimes = rows.filter((r) => !gardees.some((g) => memeCible(g, {
    sorte: r.cible_sorte as Cible['sorte'],
    cle: r.cible_cle,
    id: r.cible_id === null ? null : Number(r.cible_id),
  }))).map((r) => Number(r.id));
  if (perimes.length === 0) return 0;

  const maj = await q(
    `UPDATE gestion_rattachement
        SET statut = 'retire', statut_le = now(), statut_par_libelle = $2, statut_motif = $3
      WHERE id = ANY($1::bigint[])`, [perimes, retrait.auteur, retrait.motif]);

  /**
   * 🔴 CELUI-CI SE JOURNALISE, alors que la POSE d'un lien automatique ne se journalise pas. La différence n'est pas
   * une inconséquence :
   *   · une pose est entièrement décrite par sa propre ligne (`cree_le`, la règle, le motif, les adresses) — et
   *     37 708 lignes de journal identiques noieraient celui que les humains relisent ;
   *   · un retrait, lui, fait DISPARAÎTRE de l'écran quelque chose que quelqu'un voyait. « Pourquoi ce mail n'est-il
   *     plus dans ce dossier ? » doit avoir une réponse datée, et c'est le journal qui la porte.
   * Les retraits sont rares — zéro sur une passe stable — donc le journal reste lisible.
   */
  for (const id of perimes) {
    await q(
      `INSERT INTO gestion_journal
         (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_libelle)
       VALUES ('rattachement', $1, 'retirer', NULL, 'retire', $2, $3)`,
      [id, retrait.motif, retrait.auteur]);
  }
  return maj.rowCount ?? 0;
}

/**
 * EXAMINE UN PAQUET DE FILS. En simulation (`appliquer` faux) elle calcule tout et n'écrit RIEN.
 * Rend le dernier identifiant de fil traité, ou `null` quand il n'y a plus rien.
 */
export async function examinerPaquet(
  depuis: number, nbFils: number, libelles: LibellesCibles, c: ComptesPasse, appliquer: boolean,
  /** L'étiquette des retraits de cette passe. Absente = le moteur signe, comme toujours. */
  retrait?: { auteur: string; motif: string },
): Promise<number | null> {
  const paquet = await chargerPaquet(depuis, nbFils);
  if (paquet.fils.length === 0) return null;
  await examinerLePaquet(paquet, libelles, c, appliquer, retrait);
  return paquet.fils[paquet.fils.length - 1];
}

/**
 * EXAMINE DES FILS NOMMÉS UN PAR UN — le chemin de la relève continue (lot RATTACHEMENT-2).
 *
 * 🔴 ELLE RÉEXAMINE LES FILS ENTIERS, pas seulement les messages nouveaux, et c'est le point. Une réponse qui arrive
 * aujourd'hui peut lever l'ambiguïté d'un mail d'hier resté « proposé » par la règle b. Réexaminer un message déjà
 * rattaché ne coûte rien (une mise à jour qui ne change rien) et ne défait rien : les garde-fous d'`ecrireLienMoteur`
 * sont les mêmes pour les deux chemins, parce que c'est la MÊME fonction.
 */
export async function examinerFilsPrecis(
  filIds: readonly number[], libelles: LibellesCibles, c: ComptesPasse, appliquer: boolean,
  retrait?: { auteur: string; motif: string },
): Promise<void> {
  if (filIds.length === 0) return;
  await examinerLePaquet(await chargerFils(filIds), libelles, c, appliquer, retrait);
}

/** LE CORPS COMMUN aux deux chemins. Une seule règle d'écriture, donc pas deux comportements possibles. */
async function examinerLePaquet(
  paquet: Paquet, libelles: LibellesCibles, c: ComptesPasse, appliquer: boolean,
  retrait?: { auteur: string; motif: string },
): Promise<void> {
  // ⚠️ UNE SEULE LECTURE DU CATALOGUE POUR TOUT LE PAQUET : il ne bouge pas pendant la passe.
  const catalogue = await chargerCatalogueBiens();
  /**
   * 🔴🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — L'ANNUAIRE DES PERSONNES, lu lui aussi UNE fois pour tout le paquet.
   * Sans lui, le cas (e) ne joue pas et la passe se comporte exactement comme avant ce lot.
   */
  const contenu = await chargerAnnuaireContenu();
  /**
   * 🔴🔴 LOT BULLE-INFO-ET-S12 — CE QUE LA FENÊTRE DE CHAQUE CONVERSATION DIT DE CHAQUE MAIL.
   *
   * DÉCISION D'ARNO (01/10/2026) : « La fenêtre gagne. Si l'adresse de l'expéditeur désigne un AUTRE bien, ce
   * bien devient une proposition DÉCOCHÉE. » Sans la migration 290, la carte est vide et rien ne change.
   */
  const { classementParMail } = await import('./periodeRepo');
  const fenetres = await classementParMail(paquet.fils);
  /**
   * ══ 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 4 — LA MARQUE « INTERNE » ENTRE DANS LA PASSE ════════════════
   *
   * DEUX LECTURES POUR TOUT LE PAQUET, jamais une par mail : les marques PAR MAIL et celles des ÉCHANGES. Le
   * verdict est rendu par le module PUR `interneDuMail`, qui porte la règle des trois cas d'Arno — et il la porte
   * SEUL : la réécrire ici en ferait une seconde vérité, exactement ce que le point 1 de ce lot vient de défaire.
   *
   * ⚠️ IMPORTS DIFFÉRÉS, comme `periodeRepo` juste au-dessus : les deux dépôts sondent leur migration (281, 297)
   * et un import en tête de fichier ferait tomber les commandes de ligne qui n'en ont pas besoin.
   */
  const { lireInterneDesMessages } = await import('./interneMessageRepo');
  const { lireInterne } = await import('./interneRepo');
  const { interneDuMail } = await import('./interneDuMail');
  const [marquesParMail, marquesDesFils] = await Promise.all([
    lireInterneDesMessages(paquet.messages.map((m) => m.id)),
    lireInterne(paquet.fils),
  ]);
  for (const m of paquet.messages) {
    const marque = marquesParMail.get(m.id);
    const interne = interneDuMail({
      marqueDuMailVivante: marque?.vivante === true,
      marqueDuMailConnue: marque !== undefined,
      marqueDeLEchange: marquesDesFils.has(m.filId),
    });
    const examen = examinerMessage({
      messageId: m.id,
      adressesEchange: paquet.adresses.get(m.filId) ?? [],
      // LOT AFFECTATION-PAR-BIEN — le catalogue et les textes : sans eux, les cas (b), (c) et (d) ne jouent pas.
      biens: catalogue,
      textes: { objet: m.objet, corps: m.corps, pieces: m.pieces },
      contenu,
      // 🔴🔴 LOT DOCUMENTS-HORS-BIENS — le moteur doit pouvoir reconnaître NOS envois automatiques et les refuser.
      sens: m.sens, exclusionRegleId: m.exclusionRegleId,
      /* 🔴🔴 LOT HISTORIQUES-UNE-SEULE-REGLE, POINT 4 — et la décision humaine « interne », qu'il ignorait. */
      interne,
    });

    c.messagesVus += 1;
    if (examen.issue === 'automatique') {
      c.automatiques += 1;
    } else if (examen.issue === 'a_trier') {
      c.aTrier += 1;
      /**
       * LOT AFFECTATION-PAR-BIEN — la règle portée par les candidats dit LE CAS : 'a' = les adresses du mail ont
       * désigné plusieurs biens quasi certains (cas a/b) ; 'c' = les biens d'un propriétaire qui en a plusieurs ;
       * 'd' = un bien cité dans le texte, sans aucune adresse reconnue.
       */
      if (examen.candidats[0]?.regle === 'a') c.aTrierParLeMail += 1; else c.aTrierParLEchange += 1;
    } else {
      c.sansCandidat += 1;
      if (examen.adressesUtiles === 0) c.sansCandidatInconnu += 1; else c.sansCandidatSansCible += 1;
    }

    /**
     * 🔴🔴 LOT PROPOSITIONS-PAR-LE-CONTENU — UN LIEN CERTAIN N'EFFACE PLUS LES PROPOSITIONS DE CONTENU. Elles
     * portent sur une AUTRE personne que celle qui écrit, et restent donc à côté du lien confirmé, en
     * propositions décochées. (Avant ce lot, `candidats` était toujours vide quand `certain` existait.)
     */
    /**
     * 🔴🔴 ET C'EST ICI QUE LA FENÊTRE L'EMPORTE. Un bien CERTAIN d'après l'adresse ne se confirme que si la
     * fenêtre de la conversation le porte aussi ; sinon il se PROPOSE, décoché. La règle est décidée par le
     * module pur (`faceALaFenetre`), qui rend « confirme » dès qu'aucune fenêtre ne couvre le mail — donc pour
     * l'immense majorité du courrier, où rien ne change.
     */
    const aEcrire: { cand: Candidat; statut: 'propose' | 'confirme' }[] =
      examen.certain !== null
        ? [{ cand: examen.certain,
          statut: faceALaFenetre(fenetres.get(m.id), examen.certain.cible.cle ?? '') },
        ...examen.candidats.map((cand) => ({ cand, statut: 'propose' as const }))]
        : examen.candidats.map((cand) => ({ cand, statut: 'propose' as const }));

    if (!appliquer) {
      for (const { statut } of aEcrire) {
        if (statut === 'confirme') c.liensEcrits += 1; else c.candidatsEcrits += 1;
      }
      continue;
    }

    // UNE TRANSACTION PAR MAIL : un mail à moitié rattaché serait pire qu'un mail pas rattaché, et une transaction
    //   par paquet de 300 fils garderait un verrou des minutes durant pendant qu'Arno travaille dans l'écran.
    await withTransaction(async (q) => {
      for (const { cand, statut } of aEcrire) {
        const fait = await ecrireLienMoteur(q, m.id, cand.cible, statut, cand, libelleCible(cand.cible, libelles));
        if (fait === 'respecte') c.respectes += 1;
        else if (statut === 'confirme') c.liensEcrits += 1;
        else c.candidatsEcrits += 1;
      }
      c.liensRetires += await retirerLiensPerimes(q, m.id, aEcrire.map((x) => x.cand.cible), retrait);

      await q(
        `INSERT INTO gestion_rattachement_examen (message_id, issue, candidats, adresses_utiles, motif, examine_le)
         VALUES ($1,$2,$3,$4,$5, now())
         ON CONFLICT (message_id) DO UPDATE SET
           issue = EXCLUDED.issue, candidats = EXCLUDED.candidats,
           adresses_utiles = EXCLUDED.adresses_utiles, motif = EXCLUDED.motif, examine_le = now()`,
        [m.id, examen.issue, examen.candidats.length, examen.adressesUtiles, examen.motif]);
    });
  }

  c.filsVus += paquet.fils.length;
}

// ── LA LECTURE : LE BANDEAU D'UN MAIL ───────────────────────────────────────────────────────────────────────────

export interface LienAffiche {
  id: number;
  messageId: number;
  /** `null` = le lien vaut pour le mail entier ; renseigné = il ne vaut que pour cette pièce. */
  pieceId: number | null;
  cible: Cible;
  libelle: string;
  /**
   * 🔴 LOT CLASSER-SUR-CHAQUE-MAIL — LA CATÉGORIE DU LOT (logement / parking / cave), lue avec le lien.
   *
   * 🔴 ELLE NE SE DEVINE PAS DU LIBELLÉ. Le libellé est une chaîne composée (« adresse — Nature Type — lot N »)
   * dont la forme a déjà changé deux fois ; la NATURE, elle, est une donnée de l'annuaire. On la joint donc au
   * lot, et le module pur `categorieBien` en tire la catégorie.
   *
   * `null` = on ne sait pas : annuaire absent (migration 253), ou lot disparu de l'import. Le résumé la compte
   * alors comme « logement », la règle par défaut du module — jamais une quatrième catégorie.
   */
  categorie: 'logement' | 'parking' | 'cave' | null;
  /**
   * 🔴 LOT MODALE-RATTACHER-PROPRE — DE QUOI TITRER LE BIEN : « adresse — Nature · Type », sans numéro de lot.
   *
   * 🔴 LE TITRE N'EST PAS CALCULÉ ICI, ET C'EST VOULU. Deux biens de même adresse et même type se départagent
   * par leur bâtiment — une décision qui a besoin de la LISTE entière, que seul l'écran connaît. Le dépôt rend
   * donc les FAITS, l'écran rend le titre (module pur `titreBien`).
   *
   * `null` = annuaire absent (migration 253) ou lot disparu de l'import : l'écran retombe sur `libelle`, le
   * texte figé au moment du rattachement, qui porte encore l'ancien format.
   */
  bien: { adresse: string | null; commune: string | null; nature: string | null; typeBien: string | null;
    immeuble: string | null } | null;
  origine: 'automatique' | 'manuel';
  statut: Statut;
  confiance: string | null;
  regle: string | null;
  motif: string | null;
  adresses: string[];
  /** Vrai quand un humain a touché le statut : le bandeau le dit, pour qu'on ne cherche pas l'erreur du moteur. */
  parUnHumain: boolean;
  /**
   * LOT FIL-LECTURE-2 — QUI ET QUAND. Lus tels quels pour la fenêtre « Modifier » : avant de changer un
   * rattachement, on veut savoir s'il vient du moteur d'il y a six mois ou d'un collègue de ce matin.
   * `creePar` vaut « automatique » pour un lien posé par le moteur — c'est la valeur par défaut de la colonne.
   */
  creeLe: string | null;
  creePar: string | null;
  /** Quand le statut a été touché la dernière fois, et par qui. `null` = jamais touché depuis la pose. */
  statutLe: string | null;
  statutPar: string | null;
}

export type Issue2<T> = { etat: 'ok'; data: T } | { etat: 'sans_schema' };

function ligneVersLien(r: {
  id: string; message_id: string; piece_id: string | null; cible_sorte: string; cible_cle: string | null;
  cible_id: string | null; cible_libelle: string | null; origine: string; statut: string;
  confiance: string | null; regle: string | null; motif: string | null; adresses: string | null;
  cree_le?: string | null; cree_par_libelle?: string | null; statut_le?: string | null;
  statut_par_libelle: string | null;
  /** 🔴 LOT CLASSER-SUR-CHAQUE-MAIL — la nature du lot, jointe à la lecture (voir `CHAMPS_LIEN`). */
  lot_nature?: string | null; lot_type?: string | null;
  /** 🔴 LOT MODALE-RATTACHER-PROPRE — et de quoi TITRER le bien sans son numéro de lot. */
  lot_adresse?: string | null; lot_commune?: string | null; lot_immeuble?: string | null;
}): LienAffiche {
  const cible: Cible = {
    sorte: r.cible_sorte as Cible['sorte'],
    cle: r.cible_cle,
    id: r.cible_id === null ? null : Number(r.cible_id),
  };
  return {
    id: Number(r.id), messageId: Number(r.message_id),
    pieceId: r.piece_id === null ? null : Number(r.piece_id),
    cible, libelle: r.cible_libelle ?? cibleCourte(cible),
    /**
     * ⚠️ SEULS LES LOTS ONT UNE CATÉGORIE. Un événement, un propriétaire ou un locataire n'en ont pas, et leur
     * en donner une ferait compter une personne comme un logement dans le résumé de la case verte.
     *
     * ⚠️ `undefined` (lot sans ligne d'annuaire, ou lecture sans la jointure) ⇒ `null`, jamais « logement »
     * d'office : c'est le module pur qui applique la règle par défaut, à un seul endroit.
     */
    categorie: cible.sorte !== 'lot' || r.lot_nature === undefined
      ? null
      : categorieDuBien({ nature: r.lot_nature, typeBien: r.lot_type ?? null }),
    bien: cible.sorte !== 'lot' || r.lot_nature === undefined ? null : {
      adresse: r.lot_adresse ?? null, commune: r.lot_commune ?? null,
      nature: r.lot_nature ?? null, typeBien: r.lot_type ?? null, immeuble: r.lot_immeuble ?? null,
    },
    origine: r.origine === 'manuel' ? 'manuel' : 'automatique',
    statut: r.statut as Statut,
    confiance: r.confiance, regle: r.regle, motif: r.motif,
    adresses: (r.adresses ?? '').split(' ').filter((a) => a !== ''),
    parUnHumain: r.statut_par_libelle !== null,
    creeLe: r.cree_le ?? null,
    creePar: r.cree_par_libelle ?? null,
    statutLe: r.statut_le ?? null,
    statutPar: r.statut_par_libelle,
  };
}

/**
 * LOT FIL-LECTURE-2 — QUATRE CHAMPS DE PLUS, tous déjà en base : qui a posé le lien et quand, qui a touché son
 * statut et quand. Ils ne servent qu'à la fenêtre « Modifier », qui doit pouvoir dire d'où vient un rattachement
 * avant qu'on le change. Lecture seule, aucune migration : ces colonnes existent depuis la 257.
 */
const CHAMPS_LIEN = `r.id, r.message_id, r.piece_id, r.cible_sorte, r.cible_cle, r.cible_id, r.cible_libelle,
  r.origine, r.statut, r.confiance, r.regle, r.motif, r.adresses, r.statut_par_libelle,
  to_char(r.cree_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS cree_le, r.cree_par_libelle,
  to_char(r.statut_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS statut_le`;

/**
 * ══ 🔴🔴 LOT CLASSER-SUR-CHAQUE-MAIL — LA NATURE DU LOT, JOINTE À LA LECTURE DES LIENS ═══════════════════════════
 *
 * La case verte « Rattaché » n'écrit plus une adresse mais « 1 logement + 1 parking ». Ce compte se fait sur la
 * NATURE du lot — une donnée de l'annuaire —, jamais sur le libellé, qui est une chaîne composée dont la forme a
 * déjà changé deux fois.
 *
 * 🔴 UNE JOINTURE CONDITIONNÉE À LA SONDE, et c'est la règle du module depuis le lot 4a : sans la migration 253,
 * `gestion_annuaire_lot` n'existe pas, et la NOMMER ferait échouer la lecture ENTIÈRE des rattachements — donc le
 * bandeau de chaque mail, pas seulement la nouveauté. Sans elle, on ne joint pas, `lot_nature` reste `undefined`,
 * et la catégorie vaut `null`.
 *
 * ⚠️ `LEFT JOIN`, JAMAIS `JOIN` : un lot disparu de l'import ne doit pas faire disparaître son rattachement de
 * l'écran. On préfère une catégorie inconnue à un lien invisible.
 *
 * ⚠️ LA JOINTURE EST BORNÉE AUX LOTS (`cible_sorte = 'lot'`) : les 19 555 lignes historiques « propriétaire » et
 * « locataire » portent une clé WIPPIMMO de PERSONNE, qui ne doit surtout pas rencontrer un numéro de lot.
 */
function champsLien(avecLot: boolean): string {
  return avecLot
    ? `${CHAMPS_LIEN}, lo.nature AS lot_nature, lo.type_bien AS lot_type,
       lo.adresse AS lot_adresse, lo.commune AS lot_commune, lo.immeuble AS lot_immeuble`
    : CHAMPS_LIEN;
}

function jointureLot(avecLot: boolean): string {
  return avecLot
    ? ` LEFT JOIN gestion_annuaire_lot lo ON r.cible_sorte = 'lot' AND lo.wippimmo_id = r.cible_cle`
    : '';
}

/**
 * LES LIENS VIVANTS DE PLUSIEURS MAILS, pour le bandeau d'une conversation. LECTURE SEULE.
 *
 * ⚠️ UNE SEULE REQUÊTE POUR TOUTE LA CONVERSATION : un échange porte parfois trente messages, et une requête par
 * message se verrait à l'écran.
 */
export async function liensDesMessages(messageIds: readonly number[]): Promise<Issue2<Map<number, LienAffiche[]>>> {
  if (!(await rattachementsDisponibles())) return { etat: 'sans_schema' };
  const m = new Map<number, LienAffiche[]>();
  if (messageIds.length === 0) return { etat: 'ok', data: m };

  const avecLot = await annuaireDisponible();
  const { rows } = await query<Parameters<typeof ligneVersLien>[0]>(
    `SELECT ${champsLien(avecLot)} FROM gestion_rattachement r${jointureLot(avecLot)}
      WHERE r.message_id = ANY($1::bigint[]) AND r.statut IN ('propose', 'confirme')
      ORDER BY r.message_id, r.statut DESC, r.cible_sorte, r.id`, [messageIds]);

  for (const r of rows) {
    const lien = ligneVersLien(r);
    m.set(lien.messageId, [...(m.get(lien.messageId) ?? []), lien]);
  }
  return { etat: 'ok', data: m };
}

/**
 * ══ 🔴 LOT BARRE-STATUT — TOUS LES LIENS D'UN ÉCHANGE, EN UNE REQUÊTE. LECTURE SEULE. ════════════════════════════
 *
 * POURQUOI ELLE EXISTE, alors que `liensDesMessages` est juste au-dessus. Depuis une LIGNE DE LISTE, on ne connaît
 * que l'échange : on n'a pas les identifiants de ses messages, et aller les chercher demanderait de charger toute
 * la conversation — trente requêtes pour afficher une fenêtre de consultation. La question posée par la capsule
 * verte est « à quoi cet ÉCHANGE est-il rattaché ? » : on la pose donc telle quelle, en une fois.
 *
 * ⚠️ LE MÊME PÉRIMÈTRE QUE LA CAPSULE, et ce n'est pas un détail : `propose` ET `confirme`, tous deux vivants. La
 * capsule, elle, ne compte QUE les `confirme` (une proposition que personne n'a validée ne classe rien) — la
 * fenêtre, elle, montre aussi les propositions, parce qu'on l'ouvre justement pour les trancher. Les deux
 * répondent à deux moments différents du même geste.
 *
 * ⚠️ L'ORDRE EST CELUI DE LA LECTURE : le plus récent message d'abord, puis les confirmés avant les proposés.
 */
export async function liensDuFil(filId: number): Promise<Issue2<LienAffiche[]>> {
  if (!(await rattachementsDisponibles())) return { etat: 'sans_schema' };
  const avecLot = await annuaireDisponible();
  const { rows } = await query<Parameters<typeof ligneVersLien>[0]>(
    `SELECT ${champsLien(avecLot)} FROM gestion_rattachement r${jointureLot(avecLot)}
      WHERE r.statut IN ('propose', 'confirme')
        AND r.message_id IN (SELECT m.id FROM gestion_message m WHERE m.fil_id = $1::bigint)
      ORDER BY r.message_id DESC, r.statut DESC, r.cible_sorte, r.id`, [filId]);
  return { etat: 'ok', data: rows.map(ligneVersLien) };
}

/**
 * LES LIENS D'UNE PIÈCE : ceux de son mail (hérités) ET les siens. LECTURE SEULE.
 *
 * 🔴 L'HÉRITAGE EST LA RÈGLE, pas une commodité d'affichage : c'est ce qui fait qu'un mail rattaché suffit, et qu'on
 * n'a pas à répéter le geste sur chacune de ses cinq pièces jointes.
 */
export async function liensDeLaPiece(pieceId: number): Promise<Issue2<LienAffiche[]>> {
  if (!(await rattachementsDisponibles())) return { etat: 'sans_schema' };
  const avecLot = await annuaireDisponible();
  const { rows } = await query<Parameters<typeof ligneVersLien>[0]>(
    `SELECT ${champsLien(avecLot)} FROM gestion_rattachement r${jointureLot(avecLot)}
      WHERE r.statut IN ('propose', 'confirme')
        AND (r.piece_id = $1
             OR (r.piece_id IS NULL
                 AND r.message_id = (SELECT message_id FROM gestion_piece WHERE id = $1)))
      ORDER BY r.piece_id NULLS FIRST, r.statut DESC, r.cible_sorte, r.id`, [pieceId]);
  return { etat: 'ok', data: rows.map(ligneVersLien) };
}

// ── LA LECTURE : LA FILE « À TRIER » ────────────────────────────────────────────────────────────────────────────

export interface LigneFile {
  messageId: number;
  filId: number;
  objet: string | null;
  de: string;
  deNom: string | null;
  recuLe: string;
  sens: string;
  nbPieces: number;
  issue: Issue;
  motif: string | null;
  candidats: LienAffiche[];
}

export interface PageFile {
  lignes: LigneFile[];
  /** Le total par issue — il dit l'ampleur du travail, ce qu'une page seule ne dit pas. */
  totaux: { aTrier: number; sansCandidat: number; automatiques: number; nonExamines: number };
  tronque: boolean;
}

export const TAILLE_PAGE_FILE = 25;

/**
 * LA FILE DE TRI : les mails dont aucun rattachement n'est certain.
 *
 * 🔴 ELLE CONTIENT LES DEUX SORTES, et c'est voulu : `a_trier` (des candidats à départager) ET `sans_candidat`
 * (rien à proposer). Un mail sans candidat qu'aucun écran ne montre est un mail perdu — or c'est souvent celui d'un
 * nouvel interlocuteur, donc celui qu'il faut justement rattacher à la main.
 *
 * ⚠️ LES MAILS PAS ENCORE EXAMINÉS N'Y SONT PAS, et leur nombre est dit à part. Les confondre avec « rien à
 * proposer » ferait croire à un travail de tri là où il n'y a qu'une commande à relancer.
 */
export async function fileATrier(o: {
  page?: number; taille?: number; issue?: Issue | 'toutes';
} = {}): Promise<Issue2<PageFile>> {
  if (!(await rattachementsDisponibles())) return { etat: 'sans_schema' };

  const taille = Math.min(Math.max(o.taille ?? TAILLE_PAGE_FILE, 1), 100);
  const page = Math.max(o.page ?? 0, 0);
  const issue = o.issue ?? 'toutes';
  const issues = issue === 'toutes' ? ['a_trier', 'sans_candidat'] : [issue];

  /* 🔴🔴 LOT CORBEILLE-SANS-STATUT, POINT 2 — les quatre totaux ignorent les mails INERTES, comme la liste
     elle-même : un compteur qui annonce un nombre que la liste ne montre pas est toujours celui qu'on croit. */
  const pasInerte = await clausePasInerte('m');
  const { rows: tot } = await query<Record<string, string>>(
    `SELECT (SELECT count(*) FROM gestion_rattachement_examen e JOIN gestion_message m ON m.id = e.message_id
              WHERE e.issue = 'a_trier' ${pasInerte})::text AS a_trier,
            (SELECT count(*) FROM gestion_rattachement_examen e JOIN gestion_message m ON m.id = e.message_id
              WHERE e.issue = 'sans_candidat' ${pasInerte})::text AS sans,
            (SELECT count(*) FROM gestion_rattachement_examen e JOIN gestion_message m ON m.id = e.message_id
              WHERE e.issue = 'automatique' ${pasInerte})::text AS auto,
            (SELECT count(*) FROM gestion_message m
              WHERE NOT EXISTS (SELECT 1 FROM gestion_rattachement_examen e WHERE e.message_id = m.id)
                ${pasInerte})::text
              AS non_examines`);

  // UNE ligne de plus que la page : sa présence, et elle seule, dit qu'il y en a d'autres.
  const { rows } = await query<{
    message_id: string; fil_id: string; objet: string | null; de: string; de_nom: string | null;
    recu_le: string; sens: string; nb_pieces: string; issue: string; motif: string | null;
  }>(
    // 🔴 L'OBJET DU MAIL, PAS CELUI DU FIL. `gestion_fil` ne porte que `objet_initial` — celui du PREMIER message
    //   de l'échange. Dans une file où l'on trie mail par mail, montrer le titre du premier message à côté du
    //   trentième serait trompeur : c'est le mail qu'on rattache, c'est son objet qu'il faut lire.
    `SELECT e.message_id, m.fil_id, m.objet, m.de_adresse AS de, m.de_nom, m.recu_le::text, m.sens,
            (SELECT count(*) FROM gestion_piece p WHERE p.message_id = m.id)::text AS nb_pieces,
            e.issue, e.motif
       FROM gestion_rattachement_examen e
       JOIN gestion_message m ON m.id = e.message_id
      WHERE e.issue = ANY($1::text[]) ${pasInerte}
      ORDER BY m.recu_le DESC, e.message_id DESC
      LIMIT $2 OFFSET $3`, [issues, taille + 1, page * taille]);

  const tronque = rows.length > taille;
  const gardees = tronque ? rows.slice(0, taille) : rows;
  const ids = gardees.map((r) => Number(r.message_id));

  const liens = await liensDesMessages(ids);
  const parMessage: Map<number, LienAffiche[]> = liens.etat === 'ok' ? liens.data : new Map();

  return {
    etat: 'ok',
    data: {
      lignes: gardees.map((r) => ({
        messageId: Number(r.message_id), filId: Number(r.fil_id), objet: r.objet, de: r.de, deNom: r.de_nom,
        recuLe: r.recu_le, sens: r.sens, nbPieces: Number(r.nb_pieces),
        issue: r.issue as Issue, motif: r.motif,
        candidats: (parMessage.get(Number(r.message_id)) ?? []).filter((l) => l.statut === 'propose'),
      })),
      totaux: {
        aTrier: Number(tot[0].a_trier), sansCandidat: Number(tot[0].sans),
        automatiques: Number(tot[0].auto), nonExamines: Number(tot[0].non_examines),
      },
      tronque,
    },
  };
}

// ── LES GESTES ──────────────────────────────────────────────────────────────────────────────────────────────────

export type IssueGeste = { ok: true; id: number } | { ok: false; motif: string };

/** Écrit une ligne de journal. Append-only garanti EN BASE par un trigger : personne ne la corrige après coup. */
async function journaliser(
  q: RequeteTx, lienId: number, action: string, auteur: Auteur, commentaire: string,
  avant: string | null = null, apres: string | null = null,
): Promise<void> {
  await q(
    `INSERT INTO gestion_journal
       (entite, entite_id, action, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_libelle)
     VALUES ('rattachement', $1, $2, $3, $4, $5, $6, $7)`,
    [lienId, action, avant, apres, commentaire, auteur.id, auteur.libelle]);
}

/**
 * RATTACHE À LA MAIN. Le lien naît `confirme` : quelqu'un l'a décidé, il n'y a rien à confirmer.
 *
 * ⚠️ SI LE LIEN EXISTE DÉJÀ, VIVANT, ON NE FAIT RIEN et on le dit. Deux clics sur le même bouton ne doivent pas
 * créer deux lignes ; l'index unique partiel l'interdit de toute façon, mais un message clair vaut mieux qu'une
 * erreur de contrainte.
 *
 * 🔴 UN LIEN RETIRÉ OU REJETÉ PEUT ÊTRE REMIS : l'index unique est PARTIEL, donc la nouvelle ligne passe, et
 * l'ancienne garde sa date de retrait. L'historique dit alors les deux faits, dans l'ordre.
 */
export async function rattacher(o: {
  messageId: number; pieceId?: number | null; cible: Cible; auteur: Auteur; motif?: string | null;
  /**
   * ══ 🔴🔴 LOT MONGA-1, POINT 2 — « STATUT AUTO », PAR CETTE PORTE-CI ════════════════════════════════════════
   *
   * DEMANDE D'ARNO : le classement d'un mail MonGa dont la référence est reliée se fait « statut “Auto”, PAR LA
   * PORTE D'ÉCRITURE EXISTANTE ». Cette porte-là écrivait `origine = 'manuel'` en dur, parce qu'elle n'avait
   * jamais servi qu'à un clic. Un paramètre FACULTATIF, dont le défaut est exactement l'ancien comportement :
   * aucun des sept écrans qui rattachent ne change de conduite, et l'écran dit déjà « posé automatiquement »
   * pour cette valeur (`RattachementsDuFil`, `ModifierRattachement`) — il n'y avait rien à inventer côté
   * affichage.
   *
   * 🔴 ÉCRIRE UNE SECONDE PORTE AURAIT COÛTÉ TOUT LE RESTE. Cette fonction porte, outre l'écriture, la levée de
   * « hors gestion », la levée de « interne », le respect de l'index unique partiel, le journal, et la
   * confirmation d'un candidat déjà posé au lieu d'un doublon. Une porte parallèle aurait recopié ces six
   * comportements — et en aurait oublié un.
   */
  origine?: 'manuel' | 'automatique';
}): Promise<IssueGeste> {
  if (!(await rattachementsDisponibles())) {
    return { ok: false, motif: 'Mise à jour de la base à appliquer (migration 257).' };
  }
  /**
   * 🔴🔴 LOT FICHE-RATTACHEMENT — MÊME LE GESTE MANUEL NE RATTACHE PLUS UNE PERSONNE.
   *
   * ⚠️ CE REFUS RETIRE BIEN QUELQUE CHOSE QU'ON POUVAIT FAIRE HIER, et c'est demandé noir sur blanc : « aucune voie
   * ne peut plus créer un lien propriétaire ou locataire direct ». Le geste utile n'est pas perdu — il est
   * DÉPLACÉ : on rattache le bien, et le propriétaire en découle. Le motif le dit à l'écran.
   *
   * ⚠️ LES LIENS DÉJÀ POSÉS À LA MAIN NE SONT PAS TOUCHÉS. Ce refus vaut pour l'écriture NOUVELLE ; ce qui existe
   * reste lisible, modifiable et réversible comme avant.
   */
  if (!sortePermise(o.cible.sorte)) {
    return { ok: false, motif: motifSorteRefusee(o.cible.sorte) };
  }
  const libelles = await chargerLibellesDe(o.cible);
  const pieceId = o.pieceId ?? null;
  const id = identite(o.messageId, pieceId, o.cible);

  /**
   * 🔴 LOT STATUT-HORS-GESTION — RATTACHER UN BIEN LÈVE LA MARQUE « HORS GESTION » DE CE MAIL.
   *
   * C'est la réversibilité par le geste naturel, demandée par Arno : on ne devrait pas avoir à annuler d'abord pour
   * pouvoir classer ensuite. La priorité d'affichage suffirait à montrer la bonne capsule, mais la marque resterait
   * vivante et invisible — et le jour où le rattachement serait retiré, le mail redeviendrait gris sans que
   * personne ne l'ait décidé.
   *
   * ⚠️ JAMAIS POUR UN ÉVÉNEMENT (règle métier ③ : l'événement est facultatif et ne dit rien des biens). Poser une
   * carte lèverait sinon une décision humaine sur la foi d'une information qui ne répond pas à la question.
   *
   * ⚠️ APRÈS LA TRANSACTION, ET SANS LA FAIRE ÉCHOUER : c'est un rattrapage d'état, pas le geste lui-même. La
   * fonction appelée avale ses propres erreurs et sonde la migration 266 avant de nommer sa table.
   */
  /**
   * ══ 🔴🔴 LOT PHOTOS-ET-INTERNE-INVERSE, POINT 2 — ET LA MARQUE « INTERNE » DE CE MAIL PART AUSSI ═════════════
   *
   * DÉCISION D'ARNO (04/10/2026) : « Quand un HUMAIN rattache un bien à un mail marqué Interne, la marque Interne
   * est levée pour ce mail, selon la même fenêtre choisie. »
   *
   * 🔴🔴 C'EST ICI, ET NULLE PART AILLEURS, PARCE QUE C'EST LA SEULE PORTE. Les SEPT écrans qui rattachent un
   * bien passent tous par `rattacher` (bloc « Classer ce mail », « Visualiser / Modifier », la fenêtre de
   * classement complète, la file « À trier », les propositions, l'historique d'un bien, « Modifier »), et la
   * PROJECTION des fenêtres aussi (`periodeRepo`). Un câblage écran par écran en aurait oublié un, et c'est
   * l'oublié qui aurait continué de créer « Interne avec un bien ».
   *
   * 🔴 LA FENÊTRE SUIT TOUTE SEULE : cette fonction est appelée UNE FOIS PAR MAIL COUVERT. « Toute la
   * conversation » boucle sur ses mails, donc chacun perd sa marque — et aucune ligne d'ici ne parle de fenêtre.
   *
   * ⚠️ LA CONFIRMATION, ELLE, EST À L'ÉCRAN, et elle ne peut pas être ici : une fonction de dépôt ne demande rien
   * à personne. Les deux écrans où l'on rattache un bien à un mail déjà marqué interne la posent (bloc « Classer
   * ce mail » et « Visualiser / Modifier »), avec l'« Annuler » qui suit. Les autres portes — la file « À trier »,
   * les propositions — lèvent la marque sans la demander : elles n'ont pas de place pour une question, et laisser
   * l'état interdit y naître serait pire.
   *
   * ⚠️ JAMAIS POUR UN ÉVÉNEMENT, et jamais pour un auteur non humain : la fonction appelée refuse « automatique »
   * en première ligne, et la passe automatique ne propose de toute façon aucun bien sur un mail interne
   * (`mailInterneSansBien.test.ts`).
   */
  const auteurAutomatique = (o.origine ?? 'manuel') === 'automatique';
  const leverLaMarque = async (): Promise<void> => {
    if (o.cible.sorte === 'evenement') return;
    await leverHorsGestionApresRattachement([o.messageId], o.auteur);
    const { leverInterneApresRattachementHumain } = await import('./interneRepo');
    await leverInterneApresRattachementHumain({ messageIds: [o.messageId], auteur: o.auteur });
  };

  const issue = await withTransaction<IssueGeste>(async (q) => {
    const { rows: deja } = await q<{ id: string }>(
      `SELECT id FROM gestion_rattachement WHERE ${OU_IDENTITE} AND statut IN ('propose', 'confirme')`, id);
    if (deja.length > 0) {
      // Un candidat déjà là : on le CONFIRME plutôt que d'en créer un second. C'est ce que la personne demande.
      const { rows } = await q<{ id: string; statut: string }>(
        `UPDATE gestion_rattachement
            SET statut = 'confirme', statut_le = now(), statut_par = $2, statut_par_libelle = $3,
                statut_motif = $4
          WHERE id = $1 RETURNING id, statut`,
        [Number(deja[0].id), o.auteur.id, o.auteur.libelle, o.motif ?? null]);
      await journaliser(q, Number(rows[0].id), 'confirmer', o.auteur,
        `rattachement confirmé : ${cibleCourte(o.cible)}`, 'propose', 'confirme');
      return { ok: true, id: Number(rows[0].id) };
    }

    /**
     * ══ 🔴🔴 LOT MONGA-1, POINT 2 — POURQUOI UN LIEN « AUTO » **SIGNE SON STATUT** ═══════════════════════════
     *
     * 🔴 LE PIÈGE, TROUVÉ AVANT D'ÉCRIRE UNE LIGNE. `retirerLiensPerimes` (plus haut dans ce fichier) retire
     * TOUT lien `origine = 'automatique'` dont `statut_par_libelle IS NULL` et que le moteur ne propose plus.
     * Un classement Monga écrit naïvement en « automatique » aurait donc été EFFACÉ à la relève suivante, en
     * silence : le moteur ne propose pas le lot d'un mail Monga (76 lots à la même adresse, aucune certitude),
     * et ce lien n'aurait pas figuré parmi ses `gardees`.
     *
     * 🔴 LA PROTECTION EXISTE DÉJÀ, ET C'EST CELLE-LÀ : `statut_par_libelle` non nul signifie « quelqu'un s'est
     * prononcé sur ce statut », et le moteur n'y touche jamais. Le classement Monga s'y inscrit, parce que c'est
     * la vérité : ce statut n'est pas le défaut du moteur, il est la conséquence d'un lien que **Arno** a posé.
     * L'écran le dit déjà (« posé automatiquement », et le nom de qui a touché le statut).
     *
     * ⚠️ POUR `origine = 'manuel'` — le défaut, donc les sept écrans existants — LES QUATRE COLONNES RESTENT
     * NULLES, exactement comme avant ce lot : `CASE` sans `ELSE` rend `NULL`. Rien ne change pour un clic.
     */
    const auto = (o.origine ?? 'manuel') === 'automatique';
    const { rows } = await q<{ id: string }>(
      `INSERT INTO gestion_rattachement
         (message_id, piece_id, cible_sorte, cible_cle, cible_id, cible_libelle,
          origine, statut, motif, cree_par, cree_par_libelle,
          statut_le, statut_par, statut_par_libelle, statut_motif)
       VALUES ($1, nullif($2, 0)::bigint, $3, nullif($4, ''), nullif($5, 0)::bigint, $6,
               $10, 'confirme', $7, $8, $9,
               CASE WHEN $10 = 'automatique' THEN now() END,
               CASE WHEN $10 = 'automatique' THEN $8::bigint END,
               CASE WHEN $10 = 'automatique' THEN $9::text END,
               CASE WHEN $10 = 'automatique' THEN $7::text END)
       RETURNING id`,
      [...id, libelles, o.motif ?? 'rattaché à la main', o.auteur.id, o.auteur.libelle,
        auto ? 'automatique' : 'manuel']);
    await journaliser(q, Number(rows[0].id), 'rattacher', o.auteur,
      `rattachement posé ${auto ? 'automatiquement' : 'à la main'} : ${cibleCourte(o.cible)}`
      + `${pieceId === null ? '' : ` (pièce ${pieceId})`}`,
      null, 'confirme');
    return { ok: true, id: Number(rows[0].id) };
  });

  /**
   * 🔴🔴 LOT MONGA-1, POINT 2 — UNE AUTOMATISATION NE LÈVE AUCUNE MARQUE HUMAINE.
   *
   * « Hors gestion » et « interne » sont des décisions prises par quelqu'un qui a LU le mail. Les lever parce
   * qu'une règle a rangé le courrier reviendrait à défaire un jugement humain sans que personne l'ait demandé —
   * et le lot MONGA-1 décide l'inverse : un mail marqué « interne » n'est même pas classé automatiquement
   * (`RefusClassementMonga`). Le défaut (`'manuel'`) garde mot pour mot la conduite d'avant ce lot.
   */
  if (issue.ok && !auteurAutomatique) await leverLaMarque();
  return issue;
}

/** Le libellé d'UNE cible, sans charger tout l'annuaire : le geste manuel n'en touche qu'une. */
async function chargerLibellesDe(c: Cible): Promise<string> {
  if (c.sorte === 'evenement') {
    const { rows } = await query<{ reference: string; objet: string }>(
      'SELECT reference, objet FROM gestion_evenement WHERE id = $1', [c.id ?? 0]);
    return rows.length === 0 ? `carte n° ${c.id ?? '?'}` : `${rows[0].reference} — ${rows[0].objet}`;
  }
  if (c.sorte === 'lot') {
    const { rows } = await query<{
      prop: string | null; adresse: string | null; cp: string | null; commune: string | null;
      nature: string | null; type_bien: string | null;
    }>(`SELECT pr.wippimmo_id AS prop, lo.adresse, lo.code_postal AS cp, lo.commune, lo.nature, lo.type_bien
          FROM gestion_annuaire_lot lo
          LEFT JOIN gestion_annuaire_proprietaire pr ON pr.id = lo.proprietaire_id
         WHERE lo.wippimmo_id = $1`, [c.cle ?? '']);
    if (rows.length === 0) return `lot ${c.cle ?? '?'}`;
    const l = rows[0];
    return nomBien({
      wippimmoId: c.cle ?? '', proprietaireWippimmoId: l.prop, adresse: l.adresse, codePostal: l.cp,
      commune: l.commune, nature: l.nature, typeBien: l.type_bien,
    });
  }
  const { rows } = await query<{ nom_complet: string }>(
    'SELECT nom_complet FROM gestion_annuaire_proprietaire WHERE wippimmo_id = $1', [c.cle ?? '']);
  return rows.length === 0
    ? `propriétaire ${c.cle ?? '?'}`
    : nomProprietaire({ wippimmoId: c.cle ?? '', nomComplet: rows[0].nom_complet });
}

/**
 * CHANGE LE STATUT D'UN LIEN : confirmer, rejeter, retirer, remettre. UN SEUL chemin pour les quatre gestes.
 *
 * 🔴 RIEN N'EST SUPPRIMÉ, JAMAIS. Le lien reste, avec sa nouvelle date et le nom de qui a décidé. C'est ce qui
 * permet de répondre, des mois après, à « pourquoi ce mail n'est plus dans ce dossier ? ».
 *
 * 🔴 LA LECTURE SE FAIT `FOR UPDATE`, AVANT L'ÉCRITURE. Un refus rendu après un UPDATE serait quand même écrit :
 * `withTransaction` valide au retour normal (piège mesuré, consigné dans les conventions du dépôt).
 */
export async function changerStatut(o: {
  lienId: number; statut: Statut; auteur: Auteur; motif?: string | null;
}): Promise<IssueGeste> {
  if (!(await rattachementsDisponibles())) {
    return { ok: false, motif: 'Mise à jour de la base à appliquer (migration 257).' };
  }
  /**
   * ══ 🔴🔴 LOT CONTACTS-EXTERNES — CE QU'IL FAUT RETENIR POUR LA CASCADE, ET RIEN DE PLUS ═══════════════════
   *
   * Une intervention (un mail qui concerne AUSSI une personne du dossier) ne survit pas au départ de son bien :
   * la migration 293 refuse de la CRÉER sans bien vivant, mais elle ne peut pas refuser qu'on retire le bien
   * ensuite — ce refus-là casserait « Valider — aucun bien », cette fenêtre, la file à trier et la projection
   * des périodes. L'encadré de la migration le dit en toutes lettres.
   *
   * 🔴 DONC LA CASCADE EST ICI, APRÈS LA TRANSACTION, et elle ne regarde que ce cas précis : un lien « lot » qui
   * cesse d'être vivant. Tout le reste de cette fonction est INCHANGÉ, à la ligne près.
   */
  let cascade: { messageId: number } | null = null;

  const issue = await withTransaction<IssueGeste>(async (q) => {
    const { rows } = await q<{
      statut: string; cible_sorte: string; cible_cle: string | null; cible_id: string | null;
      message_id: string;
    }>(
      `SELECT statut, cible_sorte, cible_cle, cible_id, message_id::text
         FROM gestion_rattachement WHERE id = $1 FOR UPDATE`,
      [o.lienId]);
    if (rows.length === 0) return { ok: false, motif: 'Ce rattachement n’existe pas.' };
    const avant = rows[0].statut as Statut;
    if (avant === o.statut) return { ok: false, motif: `Ce rattachement est déjà « ${o.statut} ».` };

    await q(
      `UPDATE gestion_rattachement
          SET statut = $2, statut_le = now(), statut_par = $3, statut_par_libelle = $4, statut_motif = $5
        WHERE id = $1`,
      [o.lienId, o.statut, o.auteur.id, o.auteur.libelle, o.motif ?? null]);

    const cible = cibleCourte({
      sorte: rows[0].cible_sorte as Cible['sorte'], cle: rows[0].cible_cle,
      id: rows[0].cible_id === null ? null : Number(rows[0].cible_id),
    });
    await journaliser(q, o.lienId, ACTION_DU_STATUT[o.statut], o.auteur,
      `${ACTION_DU_STATUT[o.statut]} : ${cible}`, avant, o.statut);
    // 🔴 ON NOTE, ON N'AGIT PAS ENCORE : la cascade lit la table que cette transaction est en train d'écrire.
    if (rows[0].cible_sorte === 'lot' && (o.statut === 'retire' || o.statut === 'rejete')) {
      cascade = { messageId: Number(rows[0].message_id) };
    }
    return { ok: true, id: o.lienId };
  });

  /**
   * ⚠️ APRÈS LA TRANSACTION, ET SANS LA FAIRE ÉCHOUER : c'est un rattrapage d'état, pas le geste lui-même. La
   * fonction appelée avale ses propres erreurs et sonde la migration 293 avant de nommer sa colonne — exactement
   * la discipline de `leverHorsGestionApresRattachement`, juste au-dessus.
   */
  if (issue.ok && cascade !== null) {
    await retirerInterventionsSansBien([(cascade as { messageId: number }).messageId], o.auteur);
  }
  return issue;
}

/** Le mot du journal pour chaque statut d'arrivée. Écrit en français : le journal se relit sans le code. */
const ACTION_DU_STATUT: Record<Statut, string> = {
  confirme: 'confirmer', rejete: 'rejeter', retire: 'retirer', propose: 'remettre en proposition',
};

/** Les chiffres de l'état des rattachements, pour les rapports. LECTURE SEULE. */
export async function chiffresRattachement(): Promise<Issue2<{
  messages: number; examines: number; automatiques: number; aTrier: number; sansCandidat: number;
  liensVivants: number; liensManuels: number; liensRetires: number; liensRejetes: number;
  messagesRattaches: number; lotsTouches: number; proprietairesTouches: number;
}>> {
  if (!(await rattachementsDisponibles())) return { etat: 'sans_schema' };
  /* 🔴🔴 LOT CORBEILLE-SANS-STATUT, POINT 2 — `aTrier` et `sansCandidat` nourrissent le compteur « À rattacher »
     de la colonne de gauche : ils doivent ignorer les mails inertes, exactement comme la file. Les autres nombres
     de cette lecture décrivent l'ÉTAT DE LA BASE (combien de liens, combien d'examens) et ne bougent pas. */
  const pasInerte = await clausePasInerte('m');
  const { rows } = await query<Record<string, string>>(
    `SELECT (SELECT count(*) FROM gestion_message)::text AS messages,
            (SELECT count(*) FROM gestion_rattachement_examen)::text AS examines,
            (SELECT count(*) FROM gestion_rattachement_examen WHERE issue = 'automatique')::text AS autos,
            (SELECT count(*) FROM gestion_rattachement_examen e JOIN gestion_message m ON m.id = e.message_id
              WHERE e.issue = 'a_trier' ${pasInerte})::text AS a_trier,
            (SELECT count(*) FROM gestion_rattachement_examen e JOIN gestion_message m ON m.id = e.message_id
              WHERE e.issue = 'sans_candidat' ${pasInerte})::text AS sans,
            (SELECT count(*) FROM gestion_rattachement WHERE statut = 'confirme')::text AS vivants,
            (SELECT count(*) FROM gestion_rattachement WHERE origine = 'manuel')::text AS manuels,
            (SELECT count(*) FROM gestion_rattachement WHERE statut = 'retire')::text AS retires,
            (SELECT count(*) FROM gestion_rattachement WHERE statut = 'rejete')::text AS rejetes,
            (SELECT count(DISTINCT message_id) FROM gestion_rattachement WHERE statut = 'confirme')::text AS rattaches,
            (SELECT count(DISTINCT cible_cle) FROM gestion_rattachement
              WHERE statut = 'confirme' AND cible_sorte = 'lot')::text AS lots,
            (SELECT count(DISTINCT cible_cle) FROM gestion_rattachement
              WHERE statut = 'confirme' AND cible_sorte = 'proprietaire')::text AS proprios`);
  const r = rows[0];
  return {
    etat: 'ok',
    data: {
      messages: Number(r.messages), examines: Number(r.examines), automatiques: Number(r.autos),
      aTrier: Number(r.a_trier), sansCandidat: Number(r.sans), liensVivants: Number(r.vivants),
      liensManuels: Number(r.manuels), liensRetires: Number(r.retires), liensRejetes: Number(r.rejetes),
      messagesRattaches: Number(r.rattaches), lotsTouches: Number(r.lots),
      proprietairesTouches: Number(r.proprios),
    },
  };
}
