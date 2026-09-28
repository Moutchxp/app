import { query } from '../db/client';
import { rattachementsDisponibles } from './schema';
import { capsuleDuMessage, type CapsuleStatut } from './statutClassement';
import { libelleExpediteur, type PartenaireInterne } from './partenaires';

/**
 * MODULE « GESTION » — LOT STATUT-PAR-MAIL : LA BOÎTE DE RÉCEPTION, UN MAIL PAR LIGNE. LECTURE SEULE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE N'EST PAS LA LISTE DES ÉCHANGES, ET C'EST TOUT L'OBJET DE CE LOT. Demande d'Arno : la colonne de gauche de
 * l'écran partagé montrait une file de CONVERSATIONS à poser sur un événement ; elle montre désormais les derniers
 * MAILS REÇUS, un par ligne, du plus récent au plus ancien — c'est-à-dire ce qu'on ouvre le matin.
 *
 * La différence n'est pas cosmétique : une conversation de douze messages y occupait UNE ligne, et ses onze autres
 * mails étaient invisibles. Or le classement se fait MAIL PAR MAIL (chacun porte ses propres rattachements) : une
 * liste d'échanges ne pouvait pas dire ce qui restait à classer.
 *
 * 🔴 LE STATUT DE CHAQUE LIGNE EST CELUI DU MAIL : rattaché à un BIEN (logement, propriétaire, locataire), ou non.
 * Jamais l'événement — c'est la confusion que ce lot supprime.
 *
 * ⚠️ UNE SEULE REQUÊTE POUR LA PAGE, rattachements compris : une jointure latérale sur les 30 lignes, jamais une
 * requête par ligne. C'est la règle du module depuis le bandeau « Rattaché à » de la conversation.
 *
 * 🔒 LECTURE SEULE. Aucun `INSERT`, aucun `UPDATE`, aucun `DELETE` : un test statique le vérifie sur ce fichier.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Combien de mails par page. La même que la boîte : on ne fait pas deux réglages pour une seule habitude. */
export const PAGE_RECEPTION = 30;

/**
 * Le curseur : la date du dernier mail rendu, et son identifiant.
 *
 * ⚠️ LA DATE **ET** L'IDENTIFIANT, jamais la date seule. Une boîte alimentée par un logiciel reçoit plusieurs mails
 * à la même seconde : la date seule en perdrait un à chaque page, ou en répéterait un.
 */
export interface CurseurReception {
  recuLe: string;
  messageId: string;
}

/** Le filtre rapide de la colonne. `tous` = aucun filtre, et c'est le défaut. */
export type FiltreReception = 'tous' | 'a_classer' | 'classes';

export interface LigneReception {
  messageId: number;
  filId: number;
  /** Qui a écrit. Le libellé d'un partenaire interne prime sur le nom porté par le mail, comme partout. */
  de: string;
  objet: string | null;
  extrait: string | null;
  recuLe: string;
  aPiece: boolean;
  nbPieces: number;
  /**
   * 🔴 LE STATUT DU MAIL — À classer / Auto / Classé, sur ses rattachements à un BIEN.
   * `null` = migration 257 absente : aucune capsule n'est rendue, plutôt qu'une rouge qui accuserait à tort.
   */
  capsule: CapsuleStatut | null;
  /** Les biens auxquels ce mail est rattaché, pour l'info-bulle. Vide quand il ne l'est à aucun. */
  biens: string[];
}

export interface PageReception {
  lignes: LigneReception[];
  suivant: CurseurReception | null;
  /** Le nombre TOTAL de mails reçus correspondant au filtre. Compté seulement à la première page. */
  total: number | null;
}

/** Longueur de l'extrait affiché sous l'objet. La même que la boîte : une seule habitude de lecture. */
const LONGUEUR_EXTRAIT = 300;

interface LigneDB {
  message_id: string;
  fil_id: string;
  de_adresse: string | null;
  de_nom: string | null;
  objet: string | null;
  extrait: string | null;
  recu_le: string;
  nb_pieces: number;
  /** Rendus par la jointure latérale ; `null` quand la migration 257 est absente. */
  r_biens: string[] | null;
  r_manuel: boolean | null;
}

/**
 * ══ LA JOINTURE DES RATTACHEMENTS, en UNE fois pour la page ═════════════════════════════════════════════════════
 *
 * ⚠️ ON NE COMPTE QUE `confirme`, ET QUE LES SORTES DE BIEN. Une proposition que personne n'a validée laisse le
 * mail « à classer » — c'est exactement ce qu'il est. Un rattachement vers un ÉVÉNEMENT ne compte pas : c'est
 * l'autre question, celle que ce lot sépare.
 *
 * ⚠️ Sans la migration 257, la table n'est NOMMÉE NULLE PART et la requête est mot pour mot celle d'avant.
 */
function jointureRattachements(avec: boolean): string {
  if (!avec) return '';
  return `LEFT JOIN LATERAL (
       SELECT array_agg(coalesce(nullif(btrim(r.cible_libelle), ''), r.cible_cle, r.cible_sorte)
                        ORDER BY r.id) AS biens,
              bool_or(r.origine = 'manuel' OR r.statut_par_libelle IS NOT NULL) AS manuel
         FROM gestion_rattachement r
        WHERE r.message_id = m.id
          AND r.statut = 'confirme'
          AND r.cible_sorte IN ('lot', 'proprietaire', 'locataire')
     ) rb ON true`;
}

/**
 * LE FILTRE RAPIDE, traduit en SQL. PUR (une chaîne, aucun paramètre lié à poser).
 *
 * ⚠️ SANS LA MIGRATION 257, LE FILTRE NE PEUT RIEN DIRE : on rend alors la liste entière plutôt qu'une liste vide.
 * Une liste vide se lirait « il n'y a rien à classer », ce qui serait faux.
 */
function filtreSql(f: FiltreReception, avecRattachements: boolean): string {
  if (!avecRattachements || f === 'tous') return '';
  return f === 'a_classer' ? 'AND rb.biens IS NULL' : 'AND rb.biens IS NOT NULL';
}

/**
 * UNE PAGE DE LA BOÎTE DE RÉCEPTION, du plus récent au plus ancien. LECTURE SEULE.
 *
 * ⚠️ LES MAILS REÇUS SEULEMENT (`sens = 'recu'`). Nos propres envois ont leur liste — « Envoyés ». Les mêler ici
 * remplirait la colonne de notre propre courrier : 70 % du flux est sortant.
 *
 * ⚠️ ET SANS LE SPAM. Gmail l'a déjà écarté ; le remonter ici le ferait rentrer par la porte de service.
 */
export async function lireMailsRecus(
  curseur: CurseurReception | null,
  o: { filtre?: FiltreReception; limite?: number; partenaires?: readonly PartenaireInterne[] } = {},
): Promise<PageReception> {
  const avec = await rattachementsDisponibles();
  const filtre = o.filtre ?? 'tous';
  const aLire = Math.min(Math.max(1, o.limite ?? PAGE_RECEPTION), 100) + 1;

  const { rows } = await query<LigneDB>(
    `SELECT m.id::text AS message_id, m.fil_id::text AS fil_id, m.de_adresse, m.de_nom, m.objet,
            left(coalesce(m.corps_texte, ''), ${LONGUEUR_EXTRAIT}) AS extrait,
            to_char(m.recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS recu_le,
            (SELECT count(*) FROM gestion_piece p WHERE p.message_id = m.id)::int AS nb_pieces,
            ${avec ? 'rb.biens AS r_biens, rb.manuel AS r_manuel' : 'NULL::text[] AS r_biens, NULL::boolean AS r_manuel'}
       FROM gestion_message m
       ${jointureRattachements(avec)}
      WHERE m.sens = 'recu'
        AND m.spam_le IS NULL
        AND (m.recu_le, m.id) < ($1::timestamptz, $2::bigint)
        ${filtreSql(filtre, avec)}
      ORDER BY m.recu_le DESC, m.id DESC
      LIMIT $3`,
    [curseur?.recuLe ?? 'infinity', curseur?.messageId ?? '9223372036854775807', aLire]);

  const aSuite = rows.length === aLire;
  const gardees = aSuite ? rows.slice(0, aLire - 1) : rows;
  const dernier = gardees[gardees.length - 1];
  const partenaires = o.partenaires ?? [];

  return {
    lignes: gardees.map((r) => {
      const biens = r.r_biens ?? [];
      /**
       * ⚠️ `capsule: null` QUAND ON NE SAIT RIEN (migration 257 absente). On n'affiche alors AUCUNE capsule —
       * plutôt qu'une rouge, qui accuserait tous les mails d'être à classer alors qu'on n'en sait rien.
       */
      const capsule: CapsuleStatut | null = !avec ? null : capsuleDuMessage(
        biens.map(() => ({
          cible: { sorte: 'lot' }, statut: 'confirme', origine: r.r_manuel === true ? 'manuel' : 'automatique',
        })));
      return {
        // ⚠️ `pg` rend les `bigint` en CHAÎNE : sans cette conversion, les clés React et les comparaisons mentiraient.
        messageId: Number(r.message_id),
        filId: Number(r.fil_id),
        de: libelleExpediteur(partenaires, r.de_adresse ?? '', r.de_nom)
          || (r.de_nom ?? '').trim() || (r.de_adresse ?? '').trim() || '(expéditeur inconnu)',
        objet: r.objet,
        extrait: r.extrait && r.extrait.trim() !== '' ? r.extrait : null,
        recuLe: r.recu_le,
        aPiece: r.nb_pieces > 0,
        nbPieces: r.nb_pieces,
        capsule,
        biens,
      };
    }),
    suivant: aSuite && dernier ? { recuLe: dernier.recu_le, messageId: dernier.message_id } : null,
    total: curseur === null ? await compterMailsRecus(filtre, avec) : null,
  };
}

/**
 * COMBIEN DE MAILS REÇUS correspondent au filtre. Compté À PART, et seulement à la première page : c'est la seule
 * requête un peu chère de l'écran, et la redemander à chaque « voir plus » la paierait pour rien.
 */
export async function compterMailsRecus(filtre: FiltreReception, avec: boolean): Promise<number> {
  const { rows } = await query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM gestion_message m
       ${jointureRattachements(avec)}
      WHERE m.sens = 'recu' AND m.spam_le IS NULL ${filtreSql(filtre, avec)}`);
  return rows[0]?.n ?? 0;
}
