import { query } from '../db/client';
import { horsGestionDisponible } from './schema';
import type { Auteur } from './gestes';

/**
 * MODULE « GESTION » — LOT STATUT-HORS-GESTION : CE MAIL NE CONCERNE AUCUN BIEN.
 *
 * ⚠️ PAS DE `import 'server-only'` ICI. Les commandes de ligne (`tsx`) importent les dépôts du module, et
 * `server-only` lève hors du bundle react-server. La frontière client/serveur est tenue par
 * `app/lib/garde/serverOnly.guard.test.ts` et `clientBoundary.guard.test.ts`, qui vérifient qu'aucun composant
 * client ne tire ce fichier — c'est la convention du module (voir `etoileRepo.ts`).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * 🔴 CE QUE CE FICHIER SERT, ET QUI N'EXISTAIT PAS. La règle métier dit qu'un mail de gestion se rattache à un
 * BIEN ; mais une prospection, un mot d'un collègue, un divers n'en concernent AUCUN. Ces mails restaient rouges
 * « À classer » pour toujours — un reproche permanent pour du courrier parfaitement traité, et un compteur qui ne
 * descendait jamais. « Hors gestion » est le statut qui leur manquait.
 *
 * 🔴 JAMAIS AUTOMATIQUE. Aucune fonction de ce fichier n'accepte un auteur anonyme : `marquerHorsGestion` exige un
 * libellé d'auteur non vide et différent d'« automatique », et la base le REFUSE aussi de son côté
 * (`gestion_hors_gestion_humain_chk`). Deux gardes pour la même règle, parce qu'un garde applicatif se contourne au
 * prochain script et une contrainte non.
 *
 * 🔴 RIEN N'EST SUPPRIMÉ. Annuler écrit `retire_le` sur la ligne vivante ; elle reste, datée et signée. Une nouvelle
 * pose crée une NOUVELLE ligne. L'historique d'un mail se lit en entier, dans l'ordre.
 *
 * ⚠️ SANS LA MIGRATION 266, LA TABLE N'EST NOMMÉE NULLE PART : chaque fonction sonde d'abord et rend un résultat
 * vide (ou refuse le geste en le DISANT), plutôt que de faire échouer tout l'écran.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
 */

/** Une marque VIVANTE, telle que l'écran la lit. */
export interface MarqueHorsGestion {
  messageId: number;
  /** `prospection` | `interne` | `autre`, ou `null` quand il n'a pas été précisé — il est facultatif. */
  motif: string | null;
  poseLe: string;
  posePar: string;
}

/** Ce qu'un geste rend. `ok: false` porte TOUJOURS un motif lisible à l'écran — jamais un échec muet. */
export type IssueHorsGestion = { ok: true; nb: number } | { ok: false; motif: string };

/** Le refus que tout le module écrit de la même façon : une seule phrase, au même endroit. */
const SANS_MIGRATION = 'Mise à jour de la base à appliquer (migration 266) : le marquage « hors gestion » n’est pas '
  + 'encore installé.';

/** Les motifs acceptés. Les mêmes mots qu'en base, et `null` reste permis : le motif est facultatif. */
const MOTIFS: readonly string[] = ['prospection', 'interne', 'autre'];

/** Le motif retenu pour un geste. Une valeur inconnue vaut « non précisé » : on n'invente pas une raison. PUR. */
export function motifRetenu(brut: unknown): string | null {
  return typeof brut === 'string' && MOTIFS.includes(brut) ? brut : null;
}

/**
 * 🔴 L'AUTEUR EST-IL UN HUMAIN NOMMÉ ? PUR.
 *
 * Refuse le vide et le mot que le moteur de rattachement signe. C'est la règle ④ : « hors gestion » ne se pose
 * jamais tout seul.
 */
export function auteurHumain(a: { libelle?: string | null } | null | undefined): boolean {
  const l = (a?.libelle ?? '').trim();
  return l !== '' && l.toLowerCase() !== 'automatique';
}

/** Les identifiants propres, sans doublon et bornés : une conversation ne porte jamais des milliers de messages. */
const MESSAGES_MAX = 500;
function idsPropres(ids: readonly number[]): number[] {
  return [...new Set(ids.filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, MESSAGES_MAX);
}

/**
 * LES MARQUES VIVANTES de ces mails. LECTURE SEULE.
 *
 * ⚠️ UNE SEULE REQUÊTE POUR TOUTE LA PAGE : c'est la règle du module depuis le bandeau « Rattaché à ». Une requête
 * par ligne coûterait trente accès pour afficher une colonne.
 */
export async function lireHorsGestion(messageIds: readonly number[]): Promise<Map<number, MarqueHorsGestion>> {
  const m = new Map<number, MarqueHorsGestion>();
  const ids = idsPropres(messageIds);
  if (ids.length === 0 || !(await horsGestionDisponible())) return m;

  const { rows } = await query<{ message_id: string; motif: string | null; pose_le: string; pose_par: string }>(
    `SELECT message_id::text, motif,
            to_char(pose_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS pose_le,
            pose_par_libelle AS pose_par
       FROM gestion_hors_gestion
      WHERE message_id = ANY($1::bigint[]) AND retire_le IS NULL`, [ids]);

  // ⚠️ `pg` rend les `bigint` en CHAÎNE : sans cette conversion, la clé de la carte ne retrouverait jamais son mail.
  for (const r of rows) {
    m.set(Number(r.message_id), {
      messageId: Number(r.message_id), motif: r.motif, poseLe: r.pose_le, posePar: r.pose_par,
    });
  }
  return m;
}

/**
 * MARQUER « HORS GESTION » — le geste, posé par un collaborateur, sur un ou plusieurs mails.
 *
 * ⚠️ `ON CONFLICT … DO NOTHING` SUR L'INDEX PARTIEL : marquer deux fois le même mail ne crée pas deux marques
 * vivantes, et ne remonte pas une erreur à l'écran. Le geste est donc REJOUABLE — ce qui compte quand la portée est
 * « toute la conversation » et qu'un mail y était déjà marqué.
 */
export async function marquerHorsGestion(o: {
  messageIds: readonly number[]; motif?: string | null; auteur: Auteur;
}): Promise<IssueHorsGestion> {
  if (!(await horsGestionDisponible())) return { ok: false, motif: SANS_MIGRATION };
  if (!auteurHumain(o.auteur)) {
    return { ok: false, motif: '« Hors gestion » ne se pose qu’à la main : l’auteur du geste doit être identifié.' };
  }
  const ids = idsPropres(o.messageIds);
  if (ids.length === 0) return { ok: false, motif: 'Aucun mail désigné.' };

  const { rows } = await query<{ id: string }>(
    `INSERT INTO gestion_hors_gestion (message_id, motif, pose_par, pose_par_libelle)
     SELECT m.id, $2, $3, $4 FROM gestion_message m WHERE m.id = ANY($1::bigint[])
     ON CONFLICT (message_id) WHERE retire_le IS NULL DO NOTHING
     RETURNING id`,
    [ids, motifRetenu(o.motif), o.auteur.id, o.auteur.libelle]);
  return { ok: true, nb: rows.length };
}

/**
 * ANNULER « HORS GESTION ». Le geste inverse, tout aussi explicite.
 *
 * 🔴 AUCUN `DELETE`. La ligne reste : on y écrit qui a annulé, quand, et pourquoi. C'est ce qui permet de répondre,
 * des mois plus tard, à « pourquoi ce mail est-il revenu dans la file ? ».
 */
export async function annulerHorsGestion(o: {
  messageIds: readonly number[]; auteur: Auteur; motif?: string | null;
}): Promise<IssueHorsGestion> {
  if (!(await horsGestionDisponible())) return { ok: false, motif: SANS_MIGRATION };
  if (!auteurHumain(o.auteur)) {
    return { ok: false, motif: 'L’auteur du geste doit être identifié.' };
  }
  const ids = idsPropres(o.messageIds);
  if (ids.length === 0) return { ok: false, motif: 'Aucun mail désigné.' };

  const { rows } = await query<{ id: string }>(
    `UPDATE gestion_hors_gestion
        SET retire_le = now(), retire_par = $2, retire_par_libelle = $3, retire_motif = $4
      WHERE message_id = ANY($1::bigint[]) AND retire_le IS NULL
      RETURNING id`,
    [ids, o.auteur.id, o.auteur.libelle,
      typeof o.motif === 'string' && o.motif.trim() !== '' ? o.motif.trim().slice(0, 300) : null]);
  return { ok: true, nb: rows.length };
}

/**
 * ══ 🔴 RATTACHER UN BIEN LÈVE LA MARQUE — la réversibilité par le geste naturel ═════════════════════════════════
 *
 * Appelée juste après qu'un rattachement à un BIEN a été posé sur ces mails. Sans elle, la priorité d'affichage
 * suffirait à montrer la bonne capsule (un rattachement l'emporte sur « hors gestion »), mais la marque resterait en
 * base, vivante et invisible : le jour où le rattachement serait retiré, le mail redeviendrait gris sans que
 * personne ne l'ait décidé.
 *
 * ⚠️ JAMAIS POUR UN ÉVÉNEMENT. Poser une carte sur un échange ne dit rien des biens (règle métier ③) : ce serait
 * lever une décision humaine sur la foi d'une information qui ne répond pas à la question.
 *
 * ⚠️ ELLE NE FAIT JAMAIS ÉCHOUER LE RATTACHEMENT. Si elle ne peut pas écrire, le rattachement reste posé et la
 * capsule est de toute façon juste : c'est un rattrapage d'état, pas le geste lui-même.
 */
export async function leverHorsGestionApresRattachement(
  messageIds: readonly number[], auteur: Auteur,
): Promise<number> {
  try {
    if (!(await horsGestionDisponible())) return 0;
    const ids = idsPropres(messageIds);
    if (ids.length === 0) return 0;
    const { rows } = await query<{ id: string }>(
      `UPDATE gestion_hors_gestion
          SET retire_le = now(), retire_par = $2, retire_par_libelle = $3,
              retire_motif = 'levé : un bien a été rattaché à ce mail'
        WHERE message_id = ANY($1::bigint[]) AND retire_le IS NULL
        RETURNING id`,
      [ids, auteur.id ?? null, auteurHumain(auteur) ? auteur.libelle : 'rattachement']);
    return rows.length;
  } catch (e) {
    console.error('[horsGestion] levée après rattachement impossible', e);
    return 0;
  }
}

/**
 * L'HISTORIQUE d'un mail : toutes ses marques, vivantes et annulées, de la plus récente à la plus ancienne.
 * LECTURE SEULE. C'est ce qui rend le journal consultable depuis l'écran.
 */
export async function historiqueHorsGestion(messageId: number): Promise<{
  id: number; motif: string | null; poseLe: string; posePar: string;
  retireLe: string | null; retirePar: string | null; retireMotif: string | null;
}[]> {
  if (!Number.isSafeInteger(messageId) || messageId <= 0 || !(await horsGestionDisponible())) return [];
  const { rows } = await query<{
    id: string; motif: string | null; pose_le: string; pose_par: string;
    retire_le: string | null; retire_par: string | null; retire_motif: string | null;
  }>(
    `SELECT id::text, motif,
            to_char(pose_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS pose_le,
            pose_par_libelle AS pose_par,
            to_char(retire_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS retire_le,
            retire_par_libelle AS retire_par, retire_motif
       FROM gestion_hors_gestion WHERE message_id = $1 ORDER BY id DESC`, [messageId]);
  return rows.map((r) => ({
    id: Number(r.id), motif: r.motif, poseLe: r.pose_le, posePar: r.pose_par,
    retireLe: r.retire_le, retirePar: r.retire_par, retireMotif: r.retire_motif,
  }));
}
