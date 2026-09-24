/**
 * MODULE « GESTION » — LOT 5a : LA BOÎTE MAIL. Lecture SEULE (aucun INSERT/UPDATE/DELETE dans ce fichier).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * POURQUOI CE FICHIER EXISTE. La file du poste de tri ne montre que les échanges des 30 derniers jours encore à
 * classer : 442 sur 17 231, soit 2,6 %. Le reste est compté, annoncé — et inatteignable. Or la boîte est faite pour
 * être LUE en entier, comme on lit sa messagerie : tout le courrier, du plus récent au plus ancien, sans condition.
 *
 * 🔴 CE FICHIER NE REMPLACE RIEN. `fileRepo.ts` (le poste de tri) n'est pas touché : sa fenêtre de 30 jours, son
 * compteur d'échanges plus anciens et ses gestes restent exactement ce qu'ils étaient. Les deux lectures cohabitent
 * parce qu'elles répondent à deux questions différentes : « qu'ai-je à traiter ? » et « qu'est-ce qui existe ? ».
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * 🔴 PAGINATION PAR CURSEUR, ET PAS PAR `OFFSET`. Sur 17 231 échanges, `OFFSET 10000` oblige PostgreSQL à produire et
 * jeter dix mille lignes avant de rendre la page — le coût grandit avec la profondeur, et deux pages consécutives
 * peuvent se chevaucher ou sauter une ligne si un message arrive entre les deux. Le curseur `(date, identifiant)` n'a
 * aucun de ces deux défauts : il désigne un POINT dans l'ordre, pas un rang.
 *
 * 🔴 COMMENT LA REQUÊTE RESTE RAPIDE — et pourquoi elle n'est pas écrite comme on l'écrirait spontanément. Trier des
 * échanges par « date du dernier message » demande un `max()` par échange. La forme évidente (`DISTINCT ON (fil_id) …
 * ORDER BY fil_id, recu_le DESC`) calcule ce maximum pour LES 17 231 ÉCHANGES, puis en jette 17 201 : mesuré à 42 ms
 * par page, avec un balayage complet de `gestion_message`. On prend donc le problème à l'envers : on parcourt les
 * MESSAGES du plus récent au plus ancien (index `gestion_message_recu_idx`) et on ne garde que ceux qui sont le
 * DERNIER de leur échange (`NOT EXISTS`, servi par `gestion_message_attente_idx`). L'ordre des messages EST alors
 * l'ordre des échanges, le `LIMIT` arrête le parcours, et rien n'est calculé pour les pages qu'on ne demande pas.
 * MESURÉ sur cluster jetable au volume d'arrivée (56 000 messages, 17 231 échanges, 2 400 affectations) :
 * **0,67 ms par page**, y compris à 300 jours de profondeur, sans un seul balayage séquentiel. Aucun index à créer :
 * les deux qui servent existent depuis la migration 228.
 */
import { query } from '../db/client';
import { libelleExpediteur, type PartenaireInterne } from './partenaires';

/** Combien d'échanges par page. Assez pour remplir un écran de téléphone sans faire attendre. */
export const PAGE_BOITE = 30;

/** Extrait BRUT rapporté du dernier message. Généreux à dessein : l'écran y retire l'historique cité avant d'afficher. */
const LONGUEUR_EXTRAIT = 600;

/**
 * Le curseur : le dernier échange rendu. `null` = première page. Les DEUX champs comptent — la date seule ne suffit
 * pas : deux échanges peuvent porter exactement le même instant, et la pagination en sauterait un ou le rendrait deux
 * fois. L'identifiant tranche, et il est unique.
 */
export interface CurseurBoite {
  /** Date du dernier message de l'échange précédent, en ISO. */
  dernierLe: string;
  /** Identifiant de cet échange. Rendu en CHAÎNE : `pg` rend les `bigint` ainsi, et un identifiant n'est pas un nombre. */
  filId: string;
}

/** Une ligne de la boîte, telle que l'écran l'affiche. */
export interface LigneBoite {
  filId: number;
  /** Objet de l'échange, NON nettoyé ici (l'écran applique `nettoyerObjet`, comme partout ailleurs). */
  objet: string | null;
  /** Le correspondant : jamais nous. Voir `SQL_INTERLOCUTEUR`. */
  interlocuteur: string | null;
  /** Sens du DERNIER message — l'écran dit « Vous : … » quand c'est nous qui avons écrit en dernier. */
  dernierSens: 'recu' | 'envoye';
  dernierLe: string;
  extrait: string | null;
  nbMessages: number;
  /** Messages LISIBLES aujourd'hui (non écartés par une règle). `0` = tout l'échange est du courrier automatique. */
  nbLisibles: number;
  aPiece: boolean;
  /** Référence `GES-…` de la carte si l'échange y est affecté, sinon `null`. */
  reference: string | null;
  /** L'échange a-t-il été classé sans suite ? L'écran le DIT : la boîte montre tout, elle n'efface rien. */
  sansSuite: boolean;
}

export interface PageBoite {
  lignes: LigneBoite[];
  /** Curseur à renvoyer pour la page suivante. `null` = il n'y a plus rien après. */
  suivant: CurseurBoite | null;
  /** Nombre TOTAL d'échanges de la boîte. Calculé à part, et seulement à la première page. */
  total: number | null;
}

/**
 * LE CORRESPONDANT, ET POURQUOI CE N'EST PAS SIMPLEMENT L'EXPÉDITEUR DU DERNIER MESSAGE. 70 % du flux est SORTANT :
 * prendre l'expéditeur du dernier message afficherait « gestion@criterimmo.fr » sur les deux tiers des lignes, ce qui
 * ne renseigne sur rien. On cherche donc le dernier message REÇU de l'échange — la personne d'en face. S'il n'y en a
 * aucun (échange où nous n'avons fait qu'écrire), on retombe sur les DESTINATAIRES du dernier message : là encore,
 * c'est l'autre partie.
 */
const SQL_INTERLOCUTEUR = `
  LEFT JOIN LATERAL (
    SELECT r.de_adresse, r.de_nom
      FROM gestion_message r
     WHERE r.fil_id = p.fil_id AND r.sens = 'recu'
     ORDER BY r.recu_le DESC, r.id DESC
     LIMIT 1
  ) i ON true`;

interface LigneDB {
  fil_id: string;
  objet: string | null;
  interlocuteur: string | null;
  /** Adresse de l'interlocuteur (dernier message REÇU), ou `null` si l'échange ne contient que des envois. */
  interlocuteur_adresse: string | null;
  dernier_sens: string;
  dernier_le: string;
  extrait: string | null;
  nb_messages: number;
  nb_lisibles: number;
  a_piece: boolean;
  reference: string | null;
  sans_suite: boolean;
}

/**
 * LE SQL DE LA PAGE, EXTRAIT pour être EXPLAINABLE TEL QUEL. La règle du dépôt est qu'un plan se contrôle sur la
 * requête RÉELLEMENT ÉMISE, jamais sur une copie simplifiée — une copie dérive au premier changement, et la mesure
 * ment alors sans prévenir. `lireBoiteMail` et le banc d'épreuve appellent donc la MÊME fonction.
 * Paramètres liés : $1 = date du curseur, $2 = identifiant du curseur, $3 = nombre de lignes à lire.
 */
export function sqlPageBoite(inclureAutomatiques: boolean): string {
  // Le filtre s'applique AUX DEUX ÉTAGES du parcours (le message candidat, et le « y a-t-il plus récent ? ») : les
  //   dissocier ferait sortir un échange dont le dernier message est écarté, avec l'avant-dernier comme aperçu.
  const filtreM = inclureAutomatiques ? '' : 'AND m.exclu_le IS NULL';
  const filtreM2 = inclureAutomatiques ? '' : 'AND m2.exclu_le IS NULL';
  return `WITH page AS (
       SELECT m.fil_id, m.id AS message_id, m.recu_le, m.sens, m.de_adresse, m.de_nom, m.destinataires,
              left(coalesce(m.corps_texte, ''), ${LONGUEUR_EXTRAIT}) AS extrait
         FROM gestion_message m
        WHERE (m.recu_le, m.fil_id) < ($1::timestamptz, $2::bigint)
          ${filtreM}
          -- ⚠️ « ce message est le DERNIER de son échange ». C'est CE prédicat qui transforme un parcours de messages
          --    en parcours d'échanges, et qui permet au LIMIT d'arrêter le travail. Servi par l'index (fil_id, recu_le).
          AND NOT EXISTS (
                SELECT 1 FROM gestion_message m2
                 WHERE m2.fil_id = m.fil_id ${filtreM2}
                   AND (m2.recu_le, m2.id) > (m.recu_le, m.id))
        ORDER BY m.recu_le DESC, m.fil_id DESC
        LIMIT $3
     )
     SELECT p.fil_id::text AS fil_id,
            f.objet_initial AS objet,
            coalesce(nullif(btrim(i.de_nom), ''), i.de_adresse, nullif(btrim(p.destinataires), '')) AS interlocuteur,
            i.de_adresse AS interlocuteur_adresse,
            p.sens AS dernier_sens,
            to_char(p.recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS dernier_le,
            p.extrait,
            (SELECT count(*) FROM gestion_message c WHERE c.fil_id = p.fil_id)::int AS nb_messages,
            (SELECT count(*) FROM gestion_message c WHERE c.fil_id = p.fil_id AND c.exclu_le IS NULL)::int AS nb_lisibles,
            EXISTS (SELECT 1 FROM gestion_message pm JOIN gestion_piece pc ON pc.message_id = pm.id
                     WHERE pm.fil_id = p.fil_id) AS a_piece,
            (SELECT e.reference FROM gestion_affectation a JOIN gestion_evenement e ON e.id = a.evenement_id
              WHERE a.fil_id = p.fil_id AND a.actif AND a.message_id IS NULL LIMIT 1) AS reference,
            (f.etat = 'sans_suite') AS sans_suite
       FROM page p JOIN gestion_fil f ON f.id = p.fil_id
       ${SQL_INTERLOCUTEUR}
      ORDER BY p.recu_le DESC, p.fil_id DESC`;
}

/**
 * 🔴 CE QUE LA BOÎTE MONTRE PAR DÉFAUT, ET POURQUOI CE N'EST PAS « TOUT ».
 *
 * MESURÉ sur la vraie base : **12 262 échanges sur 17 206 (71 %) ne contiennent QUE des messages écartés** par une
 * règle — presque tous des envois produits par un logiciel. Les verser dans la liste par défaut la remplirait à 71 %
 * de bruit, et le mode « boîte mail » serait illisible le jour de sa livraison.
 *
 * On ne les SUPPRIME pas pour autant, et on ne les cache pas en silence : `inclureAutomatiques` les ramène, l'écran
 * annonce leur nombre en toutes lettres, et l'interrupteur est visible en permanence. C'est le traitement que Gmail
 * réserve aux promotions : tout est là, rien ne noie le reste, et tout est à un geste.
 */
export interface OptionsBoite {
  /** Ramener aussi les échanges dont TOUS les messages sont tenus hors de la file par une règle. */
  inclureAutomatiques?: boolean;
}

/**
 * UNE PAGE DE LA BOÎTE, du message le plus récent au plus ancien.
 *
 * `total` n'est compté qu'à la PREMIÈRE page : c'est la seule requête un peu chère de l'écran, et la redemander à
 * chaque « voir plus » la paierait pour rien — le total ne bouge pas entre deux pages.
 */
export async function lireBoiteMail(
  curseur: CurseurBoite | null,
  partenaires: readonly PartenaireInterne[] = [],
  limite = PAGE_BOITE,
  options: OptionsBoite = {},
): Promise<PageBoite> {
  const tous = options.inclureAutomatiques === true;
  // On demande UNE ligne de plus que la page : sa présence dit « il y a une suite », sans compter quoi que ce soit.
  const aLire = Math.min(Math.max(1, limite), 100) + 1;

  const { rows } = await query<LigneDB>(
    sqlPageBoite(tous),
    // `infinity` plutôt qu'une date arbitraire : il n'existe aucun message après, quelle que soit l'horloge.
    [curseur?.dernierLe ?? 'infinity', curseur?.filId ?? '9223372036854775807', aLire],
  );

  const aSuite = rows.length === aLire;
  const gardees = aSuite ? rows.slice(0, aLire - 1) : rows;
  const dernier = gardees[gardees.length - 1];

  return {
    lignes: gardees.map((r) => ({
      // ⚠️ `pg` rend les `bigint` en CHAÎNE : sans cette conversion, l'écran comparerait des chaînes à des nombres et
      //    les clés React comme les comparaisons d'identifiant mentiraient. Piège connu du dépôt.
      filId: Number(r.fil_id),
      objet: r.objet,
      // Le libellé d'un partenaire interne PRIME sur le nom porté par le mail, ici comme partout dans le module.
      interlocuteur: r.interlocuteur_adresse === null
        ? r.interlocuteur
        : libelleExpediteur(partenaires, r.interlocuteur_adresse, r.interlocuteur) || r.interlocuteur,
      dernierSens: r.dernier_sens === 'envoye' ? 'envoye' : 'recu',
      dernierLe: r.dernier_le,
      extrait: r.extrait && r.extrait.trim() !== '' ? r.extrait : null,
      nbMessages: r.nb_messages,
      nbLisibles: r.nb_lisibles,
      aPiece: r.a_piece === true,
      reference: r.reference,
      sansSuite: r.sans_suite === true,
    })),
    suivant: aSuite && dernier ? { dernierLe: dernier.dernier_le, filId: dernier.fil_id } : null,
    total: curseur === null ? await compterBoite(tous) : null,
  };
}

/**
 * Combien d'échanges la boîte contient au total. Un échange compte dès qu'il porte AU MOINS un message non écarté —
 * même règle que la liste, pour que le compteur et la liste ne racontent jamais deux histoires différentes.
 */
export async function compterBoite(inclureAutomatiques = false): Promise<number> {
  const { rows } = await query<{ n: number }>(
    `SELECT count(DISTINCT fil_id)::int AS n FROM gestion_message${inclureAutomatiques ? '' : ' WHERE exclu_le IS NULL'}`);
  return rows[0]?.n ?? 0;
}

/**
 * Les DEUX comptes de la boîte, pour que l'écran puisse dire ce qu'il montre ET ce qu'il ne montre pas. Un outil qui
 * cache sans le dire ment ; un outil qui annonce ce qu'il tait reste honnête — c'est la règle du module depuis le lot 4b.
 */
export async function comptesBoite(): Promise<{ lisibles: number; automatiques: number }> {
  const { rows } = await query<{ lisibles: number; total: number }>(
    `SELECT count(*) FILTER (WHERE lisibles > 0)::int AS lisibles, count(*)::int AS total
       FROM (SELECT fil_id, count(*) FILTER (WHERE exclu_le IS NULL) AS lisibles
               FROM gestion_message GROUP BY fil_id) x`);
  const l = rows[0]?.lisibles ?? 0;
  return { lisibles: l, automatiques: (rows[0]?.total ?? 0) - l };
}
