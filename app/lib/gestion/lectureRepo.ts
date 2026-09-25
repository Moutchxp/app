/**
 * ⚠️⚠️ CE MODULE N'EST PLUS BRANCHÉ À L'ÉCRAN — LOT 5-BOITE-2, 25/09/2026. ⚠️⚠️
 *
 * Arno a tranché : il n'y a qu'UN SEUL lu/non lu, celui de GMAIL, commun à toute l'équipe (voir `lectureGmail.ts`).
 * L'état personnel décrit ci-dessous a donc cessé d'alimenter le gras, le compteur et le menu.
 *
 * IL EST CONSERVÉ, ET RIEN N'EST SUPPRIMÉ : ni ce fichier, ni la table `gestion_message_lu`, ni la migration 250.
 * D'abord parce que retirer une fonctionnalité livrée se demande, et que ça n'a pas été demandé ; ensuite parce que
 * l'option « état personnel » reste la seule qui permette à deux personnes de se répartir le courrier sans que l'une
 * éteigne le gras de l'autre — si l'usage montre que le partage commun gêne, tout est là pour y revenir.
 * La table est vide (0 ligne mesurée) et ne coûte rien.
 *
 * ── ce qui suit décrit le module tel qu'il a été livré le matin du 25/09 ─────────────────────────────────────────
 *
 * MODULE « GESTION » — LOT 5-BOITE : LU / NON LU, PAR COLLABORATEUR ET PAR MESSAGE.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * CE QUE CE N'EST PAS. Ce n'est pas « à traiter / traité par X », qui existe déjà et ne bouge pas : celui-là dit où en
 * est le TRAVAIL, il est commun à l'équipe, et il se décide. Le lu/non lu dit seulement « moi, je l'ai ouvert » — il
 * est personnel, il n'engage personne, et il ne se discute pas.
 *
 * 🔴 LA RÈGLE, EN UNE PHRASE, ET ELLE EST ÉCRITE UNE SEULE FOIS (`PREDICAT_NON_LU`) :
 *     non lu  =  message REÇU  ET  ( une ligne explicite existe ? elle fait foi : recu_le >= mise en service )
 * Les deux moitiés comptent. La ligne explicite permet de remettre en non lu un message même ancien ; le repère de
 * mise en service évite 16 800 messages en gras le jour de la livraison, SANS écrire une seule ligne par message.
 *
 * 🔴 UN MESSAGE ENVOYÉ N'EST JAMAIS « NON LU ». Nous l'avons écrit : le proposer en gras n'aurait aucun sens, et
 * c'est `sens = 'recu'` qui le tient, au même endroit que tout le reste.
 *
 * 🔒 LA BOÎTE GMAIL N'EST PAS TOUCHÉE : aucun drapeau `\Seen` n'est posé ni lu. Ce lu/non lu est le NÔTRE, pour NOS
 * collaborateurs, et il vit dans NOTRE base.
 *
 * 🔴 TOUT PASSE PAR LA SONDE DE SCHÉMA, HORS TRANSACTION (migration 250 livrée non appliquée) : sans la table, ces
 * fonctions rendent « rien n'est non lu » et n'émettent aucune requête. L'écran est alors EXACTEMENT celui d'avant.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */
import { query } from '../db/client';
import { lectureDisponible } from './schema';

/**
 * LE PRÉDICAT « CE MESSAGE EST NON LU POUR $1 », écrit UNE fois et réemployé par les trois lectures. Deux copies
 * finiraient par diverger, et c'est alors le compteur et la liste qui se contrediraient devant l'utilisateur.
 *
 * `$1` = identifiant du collaborateur. `mm` = l'alias du message dans la requête appelante.
 *
 * ⚠️ LA FORME EN « OU » PLUTÔT QU'UN `COALESCE`, et ce n'est pas un détail de style : `COALESCE(( … sous-requête … ),
 * mm.recu_le >= service)` empêche PostgreSQL d'employer l'index sur `recu_le`, parce que la condition de date n'est
 * plus un prédicat mais un argument de fonction. Écrite en deux branches, la première reste une comparaison de date
 * indexable — et c'est elle qui porte tout le volume.
 */
const PREDICAT_NON_LU = (service: string): string => `
  mm.sens = 'recu'
  AND (
        (mm.recu_le >= ${service}
          AND NOT EXISTS (SELECT 1 FROM gestion_message_lu l
                           WHERE l.message_id = mm.id AND l.utilisateur_id = $1 AND l.lu))
        OR EXISTS (SELECT 1 FROM gestion_message_lu l2
                    WHERE l2.message_id = mm.id AND l2.utilisateur_id = $1 AND NOT l2.lu)
      )`;

/** L'instant de mise en service, lu en configuration. Absent (migration non appliquée) ⇒ personne n'est en gras. */
async function miseEnService(): Promise<string | null> {
  try {
    const { rows } = await query<{ le: string | null }>(
      `SELECT to_char(lecture_service_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS le
         FROM gestion_config WHERE id = 1`);
    return rows[0]?.le ?? null;
  } catch {
    return null; // la colonne n'existe pas encore : on se tait plutôt que de faire échouer l'écran
  }
}

/**
 * QUELS ÉCHANGES, PARMI CEUX-CI, PORTENT AU MOINS UN MESSAGE REÇU NON LU PAR CETTE PERSONNE ?
 *
 * 🔴 ON INTERROGE LA PAGE, PAS LA BOÎTE. La liste affiche trente échanges : poser la question pour ces trente-là
 * coûte une requête bornée, là où porter le calcul dans la requête de page obligerait à en changer les paramètres
 * liés et le plan — pour la même réponse. La requête de page reste donc exactement celle qui a été mesurée.
 */
export async function filsNonLus(filIds: readonly number[], utilisateurId: number | null): Promise<Set<number>> {
  if (utilisateurId === null || filIds.length === 0) return new Set();
  if (!await lectureDisponible()) return new Set();
  const service = await miseEnService();
  if (service === null) return new Set();
  const { rows } = await query<{ fil_id: string }>(
    `SELECT DISTINCT mm.fil_id::text AS fil_id
       FROM gestion_message mm
      WHERE mm.fil_id = ANY($2::bigint[])
        AND mm.exclu_le IS NULL
        AND ${PREDICAT_NON_LU('$3::timestamptz')}`,
    [utilisateurId, filIds, service],
  );
  return new Set(rows.map((r) => Number(r.fil_id)));
}

/**
 * COMBIEN D'ÉCHANGES DE LA RÉCEPTION portent au moins un message reçu non lu par cette personne.
 *
 * Même règle que la liste, à la lettre — y compris « au moins un message lisible » : un compteur qui compterait des
 * échanges que la liste ne montre pas serait un compteur qu'on apprend à ne plus croire.
 */
export async function compterFilsNonLus(utilisateurId: number | null): Promise<number | null> {
  if (utilisateurId === null) return null;
  if (!await lectureDisponible()) return null;
  const service = await miseEnService();
  if (service === null) return null;
  const { rows } = await query<{ n: number }>(
    `SELECT count(DISTINCT mm.fil_id)::int AS n
       FROM gestion_message mm
      WHERE mm.exclu_le IS NULL
        AND ${PREDICAT_NON_LU('$2::timestamptz')}`,
    [utilisateurId, service],
  );
  return rows[0]?.n ?? 0;
}

/** Ce qu'une écriture rapporte. `sans_schema` = la migration 250 n'est pas là ; l'écran ne propose alors pas le geste. */
export type IssueLecture = { etat: 'ok'; messages: number } | { etat: 'sans_schema' } | { etat: 'sans_compte' };

/**
 * MARQUE tous les messages REÇUS d'un échange comme lus (ou non lus) POUR UNE PERSONNE.
 *
 * 🔴 IDEMPOTENT PAR CONSTRUCTION : `ON CONFLICT … DO UPDATE`. Ouvrir deux fois le même échange, ou cliquer deux fois
 * sur « Marquer comme lu », ne produit ni doublon ni erreur — et c'est indispensable, puisque l'ouverture d'une
 * conversation déclenche le geste toute seule, à chaque affichage.
 *
 * 🔴 SEULS LES MESSAGES REÇUS sont touchés. Un message que nous avons envoyé n'a pas d'état de lecture : lui en
 * écrire un remplirait la table de lignes qui ne servent à rien et ne changent rien à l'écran.
 */
export async function marquerFil(filId: number, utilisateurId: number | null, lu: boolean): Promise<IssueLecture> {
  if (utilisateurId === null) return { etat: 'sans_compte' };
  if (!await lectureDisponible()) return { etat: 'sans_schema' };
  const { rowCount } = await query(
    `INSERT INTO gestion_message_lu (message_id, utilisateur_id, lu)
     SELECT m.id, $2::bigint, $3::boolean
       FROM gestion_message m
      WHERE m.fil_id = $1::bigint AND m.sens = 'recu'
     ON CONFLICT (message_id, utilisateur_id)
       DO UPDATE SET lu = EXCLUDED.lu, maj_le = now()`,
    [filId, utilisateurId, lu],
  );
  return { etat: 'ok', messages: rowCount ?? 0 };
}
