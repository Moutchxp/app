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
import { rattachementsDisponibles } from './schema';
import { nomBien, nomProprietaire } from './driveArbre';
import {
  cibleCourte, examinerMessage, memeCible, type Cible, type Candidat, type Issue, type Statut,
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

/** Le nom lisible d'une cible, ou sa forme courte quand l'annuaire ne la connaît pas (encore). PUR. */
export function libelleCible(c: Cible, l: LibellesCibles): string {
  if (c.sorte === 'lot') return l.lots.get(c.cle ?? '') ?? `lot ${c.cle ?? '?'}`;
  if (c.sorte === 'proprietaire') return l.proprietaires.get(c.cle ?? '') ?? `propriétaire ${c.cle ?? '?'}`;
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

export interface MessageDuPaquet { id: number; filId: number }

/** Les messages des `nbFils` fils suivant `depuis`, et toutes les adresses de ces fils. LECTURE SEULE. */
export async function chargerPaquet(depuis: number, nbFils: number): Promise<{
  fils: number[];
  messages: MessageDuPaquet[];
  adresses: Map<number, AdresseEchange[]>;
}> {
  const { rows: fils } = await query<{ fil_id: string }>(
    'SELECT DISTINCT fil_id FROM gestion_message WHERE fil_id > $1 ORDER BY fil_id LIMIT $2', [depuis, nbFils]);
  const ids = fils.map((f) => Number(f.fil_id));
  if (ids.length === 0) return { fils: [], messages: [], adresses: new Map() };

  const { rows: msgs } = await query<{ id: string; fil_id: string }>(
    'SELECT id, fil_id FROM gestion_message WHERE fil_id = ANY($1::bigint[]) ORDER BY id', [ids]);

  const { rows: adr } = await query<{
    fil_id: string; message_id: string; adresse: string; interne: boolean; partie: string | null;
    proprietaire_cle: string | null; locataire_id: string | null; lot_cle: string | null; motif: string | null;
  }>(
    `SELECT m.fil_id, a.message_id, a.adresse, a.interne, a.partie, a.proprietaire_cle, a.locataire_id,
            a.lot_cle, a.motif
       FROM gestion_message_adresse a
       JOIN gestion_message m ON m.id = a.message_id
      WHERE m.fil_id = ANY($1::bigint[])`, [ids]);

  const adresses = new Map<number, AdresseEchange[]>();
  for (const r of adr) {
    const fil = Number(r.fil_id);
    const liste = adresses.get(fil) ?? [];
    liste.push({
      adresse: r.adresse, messageId: Number(r.message_id), interne: r.interne,
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
  return { fils: ids, messages: msgs.map((m) => ({ id: Number(m.id), filId: Number(m.fil_id) })), adresses };
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
        SET statut = 'retire', statut_le = now(), statut_par_libelle = $2,
            statut_motif = 'le moteur ne propose plus cette cible'
      WHERE id = ANY($1::bigint[])`, [perimes, AUTEUR_MOTEUR.libelle]);

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
      [id, 'le moteur ne propose plus cette cible', AUTEUR_MOTEUR.libelle]);
  }
  return maj.rowCount ?? 0;
}

/**
 * EXAMINE UN PAQUET DE FILS. En simulation (`appliquer` faux) elle calcule tout et n'écrit RIEN.
 * Rend le dernier identifiant de fil traité, ou `null` quand il n'y a plus rien.
 */
export async function examinerPaquet(
  depuis: number, nbFils: number, libelles: LibellesCibles, c: ComptesPasse, appliquer: boolean,
): Promise<number | null> {
  const paquet = await chargerPaquet(depuis, nbFils);
  if (paquet.fils.length === 0) return null;

  for (const m of paquet.messages) {
    const examen = examinerMessage({
      messageId: m.id,
      adressesEchange: paquet.adresses.get(m.filId) ?? [],
    });

    c.messagesVus += 1;
    if (examen.issue === 'automatique') {
      c.automatiques += 1;
    } else if (examen.issue === 'a_trier') {
      c.aTrier += 1;
      // La règle qui a conclu se lit sur les candidats : 'a' = le mail lui-même, 'b' = tout l'échange.
      if (examen.candidats[0]?.regle === 'a') c.aTrierParLeMail += 1; else c.aTrierParLEchange += 1;
    } else {
      c.sansCandidat += 1;
      if (examen.adressesUtiles === 0) c.sansCandidatInconnu += 1; else c.sansCandidatSansCible += 1;
    }

    const aEcrire: { cand: Candidat; statut: 'propose' | 'confirme' }[] =
      examen.certain !== null
        ? [{ cand: examen.certain, statut: 'confirme' }]
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
      c.liensRetires += await retirerLiensPerimes(q, m.id, aEcrire.map((x) => x.cand.cible));

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
  return paquet.fils[paquet.fils.length - 1];
}

// ── LA LECTURE : LE BANDEAU D'UN MAIL ───────────────────────────────────────────────────────────────────────────

export interface LienAffiche {
  id: number;
  messageId: number;
  /** `null` = le lien vaut pour le mail entier ; renseigné = il ne vaut que pour cette pièce. */
  pieceId: number | null;
  cible: Cible;
  libelle: string;
  origine: 'automatique' | 'manuel';
  statut: Statut;
  confiance: string | null;
  regle: string | null;
  motif: string | null;
  adresses: string[];
  /** Vrai quand un humain a touché le statut : le bandeau le dit, pour qu'on ne cherche pas l'erreur du moteur. */
  parUnHumain: boolean;
}

export type Issue2<T> = { etat: 'ok'; data: T } | { etat: 'sans_schema' };

function ligneVersLien(r: {
  id: string; message_id: string; piece_id: string | null; cible_sorte: string; cible_cle: string | null;
  cible_id: string | null; cible_libelle: string | null; origine: string; statut: string;
  confiance: string | null; regle: string | null; motif: string | null; adresses: string | null;
  statut_par_libelle: string | null;
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
    origine: r.origine === 'manuel' ? 'manuel' : 'automatique',
    statut: r.statut as Statut,
    confiance: r.confiance, regle: r.regle, motif: r.motif,
    adresses: (r.adresses ?? '').split(' ').filter((a) => a !== ''),
    parUnHumain: r.statut_par_libelle !== null,
  };
}

const CHAMPS_LIEN = `id, message_id, piece_id, cible_sorte, cible_cle, cible_id, cible_libelle,
  origine, statut, confiance, regle, motif, adresses, statut_par_libelle`;

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

  const { rows } = await query<Parameters<typeof ligneVersLien>[0]>(
    `SELECT ${CHAMPS_LIEN} FROM gestion_rattachement
      WHERE message_id = ANY($1::bigint[]) AND statut IN ('propose', 'confirme')
      ORDER BY message_id, statut DESC, cible_sorte, id`, [messageIds]);

  for (const r of rows) {
    const lien = ligneVersLien(r);
    m.set(lien.messageId, [...(m.get(lien.messageId) ?? []), lien]);
  }
  return { etat: 'ok', data: m };
}

/**
 * LES LIENS D'UNE PIÈCE : ceux de son mail (hérités) ET les siens. LECTURE SEULE.
 *
 * 🔴 L'HÉRITAGE EST LA RÈGLE, pas une commodité d'affichage : c'est ce qui fait qu'un mail rattaché suffit, et qu'on
 * n'a pas à répéter le geste sur chacune de ses cinq pièces jointes.
 */
export async function liensDeLaPiece(pieceId: number): Promise<Issue2<LienAffiche[]>> {
  if (!(await rattachementsDisponibles())) return { etat: 'sans_schema' };
  const { rows } = await query<Parameters<typeof ligneVersLien>[0]>(
    `SELECT ${CHAMPS_LIEN} FROM gestion_rattachement
      WHERE statut IN ('propose', 'confirme')
        AND (piece_id = $1
             OR (piece_id IS NULL
                 AND message_id = (SELECT message_id FROM gestion_piece WHERE id = $1)))
      ORDER BY piece_id NULLS FIRST, statut DESC, cible_sorte, id`, [pieceId]);
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

  const { rows: tot } = await query<Record<string, string>>(
    `SELECT (SELECT count(*) FROM gestion_rattachement_examen WHERE issue = 'a_trier')::text AS a_trier,
            (SELECT count(*) FROM gestion_rattachement_examen WHERE issue = 'sans_candidat')::text AS sans,
            (SELECT count(*) FROM gestion_rattachement_examen WHERE issue = 'automatique')::text AS auto,
            (SELECT count(*) FROM gestion_message m
              WHERE NOT EXISTS (SELECT 1 FROM gestion_rattachement_examen e WHERE e.message_id = m.id))::text
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
      WHERE e.issue = ANY($1::text[])
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
}): Promise<IssueGeste> {
  if (!(await rattachementsDisponibles())) {
    return { ok: false, motif: 'Mise à jour de la base à appliquer (migration 257).' };
  }
  const libelles = await chargerLibellesDe(o.cible);
  const pieceId = o.pieceId ?? null;
  const id = identite(o.messageId, pieceId, o.cible);

  return withTransaction(async (q) => {
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

    const { rows } = await q<{ id: string }>(
      `INSERT INTO gestion_rattachement
         (message_id, piece_id, cible_sorte, cible_cle, cible_id, cible_libelle,
          origine, statut, motif, cree_par, cree_par_libelle)
       VALUES ($1, nullif($2, 0)::bigint, $3, nullif($4, ''), nullif($5, 0)::bigint, $6,
               'manuel', 'confirme', $7, $8, $9)
       RETURNING id`,
      [...id, libelles, o.motif ?? 'rattaché à la main', o.auteur.id, o.auteur.libelle]);
    await journaliser(q, Number(rows[0].id), 'rattacher', o.auteur,
      `rattachement posé à la main : ${cibleCourte(o.cible)}${pieceId === null ? '' : ` (pièce ${pieceId})`}`,
      null, 'confirme');
    return { ok: true, id: Number(rows[0].id) };
  });
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
  return withTransaction(async (q) => {
    const { rows } = await q<{ statut: string; cible_sorte: string; cible_cle: string | null; cible_id: string | null }>(
      'SELECT statut, cible_sorte, cible_cle, cible_id FROM gestion_rattachement WHERE id = $1 FOR UPDATE',
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
    return { ok: true, id: o.lienId };
  });
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
  const { rows } = await query<Record<string, string>>(
    `SELECT (SELECT count(*) FROM gestion_message)::text AS messages,
            (SELECT count(*) FROM gestion_rattachement_examen)::text AS examines,
            (SELECT count(*) FROM gestion_rattachement_examen WHERE issue = 'automatique')::text AS autos,
            (SELECT count(*) FROM gestion_rattachement_examen WHERE issue = 'a_trier')::text AS a_trier,
            (SELECT count(*) FROM gestion_rattachement_examen WHERE issue = 'sans_candidat')::text AS sans,
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
