/**
 * MODULE « GESTION » — LOT 2 : LECTURE de l'écran à deux côtés. IMPUR (base), mais STRICTEMENT EN LECTURE : ce fichier
 * n'émet que des SELECT. Aucun INSERT, aucun UPDATE, aucun DELETE — les gestes (affecter, classer sans suite) sont le lot 4.
 *
 * 🔴 LA RÈGLE QUI COMMANDE CE FICHIER : « ATTEND UNE RÉPONSE DE NOTRE PART » EST DÉRIVÉ, JAMAIS STOCKÉ.
 * Il se lit : « le DERNIER message NON EXCLU du fil est un message REÇU et probablement HUMAIN ». Aucune colonne ne le
 * porte — elle mentirait dès le message suivant. Le calcul se fait ici, à chaque lecture, et s'appuie sur l'index partiel
 * `gestion_message_attente_idx (fil_id, recu_le DESC) WHERE exclu_le IS NULL` posé par la migration 228 exprès pour lui.
 *
 * L'ORDRE DEMANDÉ À L'ÉCRAN : ce qui attend une réponse depuis LE PLUS LONGTEMPS d'abord. Donc, dans les deux colonnes :
 * ce qui attend passe devant ce qui n'attend pas, puis du plus ANCIEN au plus récent.
 */
import { query } from '../db/client';

/** Une ligne de la FILE (colonne de gauche) : un FIL de discussion, jamais un message isolé. */
export interface LigneFile {
  filId: number;
  objet: string | null;
  interlocuteur: string | null;   // nom affiché du dernier message, à défaut son adresse
  dernierLe: string;              // ISO — date du dernier message non exclu
  nbMessages: number;
  nbPieces: number;
  attend: boolean;                // DÉRIVÉ : le dernier message non exclu est reçu ET probablement humain
}

/** Une CARTE d'événement (colonne de droite). */
export interface CarteEvenement {
  evenementId: number;
  reference: string;
  objet: string;
  demandeur: string | null;       // nom, à défaut adresse — ce que le mail contenait, rien de plus
  adresseLibre: string | null;
  etat: 'a_traiter' | 'en_cours' | 'traite';
  ouvertLe: string;               // ISO
  dernierEchangeLe: string | null; // ISO — dernier message non exclu de ses fils, ou null s'il n'en a aucun
  nbFils: number;
  attend: boolean;                // DÉRIVÉ : au moins un de ses fils attend une réponse
}

export interface EtatEcran {
  file: LigneFile[];
  filsTotal: number;              // total de la file (pour dire honnêtement « N affichés sur M »)
  evenements: CarteEvenement[];
  evenementsTotal: number;
  messagesCaptures: number;       // TOUS les messages capturés, exclus compris — la preuve que la relève a tourné
  messagesExclus: number;         // tenus hors de la file par une règle (jamais supprimés)
  derniereReleveLe: string | null; // fin de la dernière relève réussie, ou null si aucune n'a jamais tourné
}

/** Combien de lignes au plus par colonne. Le total réel est renvoyé à côté → l'écran ne ment jamais sur ce qu'il montre. */
export const PAGE = 50;

/**
 * DERNIER message NON EXCLU de chaque fil. `DISTINCT ON (fil_id) … ORDER BY fil_id, recu_le DESC` se sert exactement de
 * l'index partiel prévu pour ça. Fragment PARTAGÉ par les deux lectures — une seule définition de « le dernier message »,
 * donc aucune divergence possible entre la file et les cartes.
 */
const DERNIER_MESSAGE = `
  SELECT DISTINCT ON (m.fil_id)
         m.fil_id, m.sens, m.automatique, m.recu_le,
         coalesce(nullif(btrim(m.de_nom), ''), m.de_adresse) AS interlocuteur
    FROM gestion_message m
   WHERE m.exclu_le IS NULL
   ORDER BY m.fil_id, m.recu_le DESC, m.id DESC`;

/** Un fil « attend une réponse de notre part » si son dernier message non exclu est REÇU et probablement HUMAIN. */
const ATTEND = `(d.sens = 'recu' AND NOT d.automatique)`;

interface LigneFileDB {
  fil_id: number; objet: string | null; interlocuteur: string | null;
  dernier_le: string; nb_messages: number; nb_pieces: number; attend: boolean;
}

/**
 * LA FILE : les fils À CLASSER qui portent encore au moins un message non exclu.
 *  - « non affectés » : `etat = 'a_classer'` (un fil affecté passe à 'affecte', un fil écarté à la main à 'sans_suite') ;
 *  - « non exclus » : la jointure sur le dernier message non exclu écarte d'elle-même un fil dont TOUS les messages ont
 *    été tenus hors de la file par une règle — sans jamais rien supprimer, et le fil revient si la règle s'éteint.
 */
export async function lireFile(limite = PAGE): Promise<{ lignes: LigneFile[]; total: number }> {
  const { rows } = await query<LigneFileDB>(
    `WITH dernier AS (${DERNIER_MESSAGE})
     SELECT f.id::int AS fil_id,
            f.objet_initial AS objet,
            d.interlocuteur,
            to_char(d.recu_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS dernier_le,
            (SELECT count(*) FROM gestion_message m2 WHERE m2.fil_id = f.id AND m2.exclu_le IS NULL)::int AS nb_messages,
            (SELECT count(*) FROM gestion_piece p JOIN gestion_message m3 ON m3.id = p.message_id
              WHERE m3.fil_id = f.id AND m3.exclu_le IS NULL)::int AS nb_pieces,
            ${ATTEND} AS attend
       FROM gestion_fil f
       JOIN dernier d ON d.fil_id = f.id
      WHERE f.etat = 'a_classer'
      ORDER BY ${ATTEND} DESC, d.recu_le ASC, f.id ASC
      LIMIT $1`,
    [limite],
  );
  const { rows: t } = await query<{ n: number }>(
    `WITH dernier AS (${DERNIER_MESSAGE})
     SELECT count(*)::int AS n FROM gestion_fil f JOIN dernier d ON d.fil_id = f.id WHERE f.etat = 'a_classer'`,
  );
  return {
    lignes: rows.map((r) => ({
      filId: r.fil_id, objet: r.objet, interlocuteur: r.interlocuteur, dernierLe: r.dernier_le,
      nbMessages: r.nb_messages, nbPieces: r.nb_pieces, attend: r.attend === true,
    })),
    total: t[0]?.n ?? 0,
  };
}

interface CarteDB {
  evenement_id: number; reference: string; objet: string; demandeur: string | null; adresse_libre: string | null;
  etat: string; ouvert_le: string; dernier_echange_le: string | null; nb_fils: number; attend: boolean;
}

/**
 * LES CARTES : tous les événements, les OUVERTS d'abord (un événement traité n'attend plus rien), puis ceux qui attendent
 * une réponse, puis du plus ancien au plus récent. `attend_depuis` = la plus ANCIENNE attente parmi ses fils : c'est elle
 * qui décide du rang, pas la date d'ouverture de la carte — une carte ouverte hier mais dont le locataire attend depuis
 * trois semaines doit passer devant.
 */
export async function lireEvenements(limite = PAGE): Promise<{ cartes: CarteEvenement[]; total: number }> {
  const { rows } = await query<CarteDB>(
    `WITH dernier AS (${DERNIER_MESSAGE})
     SELECT e.id::int AS evenement_id, e.reference, e.objet,
            coalesce(nullif(btrim(e.demandeur_nom), ''), e.demandeur_email) AS demandeur,
            e.adresse_libre, e.etat,
            to_char(e.ouvert_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ouvert_le,
            to_char(max(d.recu_le) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS dernier_echange_le,
            count(a.fil_id)::int AS nb_fils,
            coalesce(bool_or(${ATTEND}), false) AS attend
       FROM gestion_evenement e
       LEFT JOIN gestion_affectation a ON a.evenement_id = e.id AND a.actif
       LEFT JOIN dernier d ON d.fil_id = a.fil_id
      GROUP BY e.id
      ORDER BY (e.traite_le IS NOT NULL) ASC,
               coalesce(bool_or(${ATTEND}), false) DESC,
               coalesce(min(d.recu_le) FILTER (WHERE ${ATTEND}), e.ouvert_le) ASC,
               e.id ASC
      LIMIT $1`,
    [limite],
  );
  const { rows: t } = await query<{ n: number }>(`SELECT count(*)::int AS n FROM gestion_evenement`);
  return {
    cartes: rows.map((r) => ({
      evenementId: r.evenement_id, reference: r.reference, objet: r.objet, demandeur: r.demandeur,
      adresseLibre: r.adresse_libre,
      etat: (r.etat === 'en_cours' || r.etat === 'traite' ? r.etat : 'a_traiter'),
      ouvertLe: r.ouvert_le, dernierEchangeLe: r.dernier_echange_le, nbFils: r.nb_fils, attend: r.attend === true,
    })),
    total: t[0]?.n ?? 0,
  };
}

/**
 * Repères d'HONNÊTETÉ de l'écran : combien de messages ont été capturés, combien sont tenus hors de la file, et quand la
 * dernière relève a réussi. Sans eux, une page vide est ambiguë — « rien n'est arrivé » et « on n'a jamais relevé » se
 * ressemblent, et c'est exactement la confusion que le journal des passes existe pour lever.
 */
export async function lireReperes(): Promise<{ messagesCaptures: number; messagesExclus: number; derniereReleveLe: string | null }> {
  const { rows } = await query<{ captures: number; exclus: number }>(
    `SELECT count(*)::int AS captures, count(exclu_le)::int AS exclus FROM gestion_message`);
  const { rows: r } = await query<{ le: string | null }>(
    `SELECT to_char(max(termine_le) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS le
       FROM gestion_releve_run WHERE resultat = 'ok'`);
  return {
    messagesCaptures: rows[0]?.captures ?? 0,
    messagesExclus: rows[0]?.exclus ?? 0,
    derniereReleveLe: r[0]?.le ?? null,
  };
}

/** L'état complet de l'écran, en une fois. LECTURE SEULE de bout en bout. */
export async function lireEcran(limite = PAGE): Promise<EtatEcran> {
  const [file, evenements, reperes] = await Promise.all([lireFile(limite), lireEvenements(limite), lireReperes()]);
  return {
    file: file.lignes, filsTotal: file.total,
    evenements: evenements.cartes, evenementsTotal: evenements.total,
    ...reperes,
  };
}
