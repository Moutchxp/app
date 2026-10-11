import { query } from '../db/client';
import { MOTIF_RETIRE_PAR_SUIVI, mailsDuFil, suiviDuFil } from './periodeRepo';
import { MOTIF_DETACHE_PAR_INTERNE } from './interneDetache';
import { MOTIF_RATTACHEMENT_ANNULE } from './interneLevee';
import { projeter, type Classement } from './periodesConversation';
import {
  exceptionEstUnGeste, modificationDeLaSortie, modificationDeMarque, modificationsDeLException, photoLue,
  sortieEstUnGeste, type ModificationOneShot, type PhotoFond,
} from './suiviOneShot';
import { photoDuFondEnBase, traceOneShotDisponible } from './traceOneShotRepo';
import type { Auteur } from './gestes';

/**
 * ══ 🔴🔴 LOT PASTILLE-SUIVI-MODIFIE-ONE-SHOT — LES MODIFICATIONS « CE MAIL UNIQUEMENT » D'UN PAQUET DE MAILS ═══════
 *
 * 🔒 LECTURE SEULE : aucun `INSERT`, `UPDATE`, `DELETE`. Les décisions (qu'est-ce qui compte, comment le dire) sont
 * dans `suiviOneShot.ts` (PUR) ; ce fichier ne fait que lire les traces et, faute de photo, recalculer le fond.
 *
 * LES QUATRE TRACES LUES (lot TRACE-ONE-SHOT, migration 342, pour les deux dernières) :
 *   ① l'exception de suivi vivante, posée par une personne ;
 *   ② la sortie du suivi d'un bien faite à la main ;
 *   ③ la marque « Interne » vivante dont la portée est « ce mail uniquement » ;
 *   ④ la marque « Hors gestion » vivante dont la portée est « ce mail uniquement ».
 * Chacune porte, depuis la 342, la PHOTO du suivi de fond prise juste avant le geste ; sans photo (geste antérieur),
 * le fond est recalculé aujourd'hui et la modale le dit.
 *
 * ⚠️ D'ABORD LE FILTRE BON MARCHÉ, ENSUITE LE CALCUL : une page de liste montre cinquante mails, et l'immense majorité
 * ne porte aucune de ces traces. Le fond n'est recalculé que pour les conversations qui en ont besoin, une fois chacune.
 *
 * ⚠️ SILENCIEUX EN CAS D'ÉCHEC : la pastille est un renseignement de plus. Une lecture en faute rend une carte vide.
 */

/**
 * ⚠️ LES SORTIES QUI NE SONT PAS UN GESTE « CE MAIL UNIQUEMENT ». Depuis le lot INVARIANT-HISTORIQUE-INALTERABLE, TOUT
 * retrait d'un lien de bien confirmé devient une sortie du suivi (`changerStatut`) — y compris ceux que la projection
 * d'une fenêtre écrit, ceux de « Interne » (portée non enregistrée) et l'annulation d'un ajout. Ils se reconnaissent à
 * leur motif, fixe.
 */
export const MOTIFS_SORTIE_AUTOMATIQUE: readonly string[] = [
  MOTIF_RETIRE_PAR_SUIVI, MOTIF_DETACHE_PAR_INTERNE, MOTIF_RATTACHEMENT_ANNULE,
];

/**
 * 🔴 LOT TRACE-ONE-SHOT — la photo du suivi de fond, SEULEMENT pour une sortie faite à la main. Appelée par
 * `changerStatut` juste avant d'écrire la sortie ; `null` pour une sortie automatique (aucune lecture n'est faite).
 */
export async function photoSiSortieAlaMain(messageId: number, auteur: Auteur, motif: string | null): Promise<PhotoFond | null> {
  if (!sortieEstUnGeste({ par: auteur.libelle, motif, motifsAutomatiques: MOTIFS_SORTIE_AUTOMATIQUE })) return null;
  if (!(await traceOneShotDisponible())) return null;
  return photoDuFondEnBase(messageId);
}

const ISO = `'YYYY-MM-DD"T"HH24:MI:SS"Z"'`;
const NOM = `nullif(btrim(coalesce(u.prenom, '') || ' ' || coalesce(u.nom, '')), '')`;

export async function oneShotDesMessages(messageIds: readonly number[]): Promise<Map<number, ModificationOneShot[]>> {
  const parMail = new Map<number, ModificationOneShot[]>();
  const ids = [...new Set(messageIds.filter((n) => Number.isSafeInteger(n) && n > 0))];
  if (ids.length === 0) return parMail;
  const ajouter = (m: number, l: ModificationOneShot[]): void => {
    if (l.length > 0) parMail.set(m, [...(parMail.get(m) ?? []), ...l]);
  };

  try {
    const { rows: dispo } = await query<{ e: string | null; s: boolean }>(
      `SELECT to_regclass('public.gestion_message_exception')::text AS e,
              EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'gestion_rattachement' AND column_name = 'sorti_le') AS s`);
    const avecExceptions = dispo[0]?.e !== null && dispo[0]?.e !== undefined;
    const avecSorties = dispo[0]?.s === true;
    const avec342 = await traceOneShotDisponible();

    /* ── LES QUATRE LECTURES BON MARCHÉ ──────────────────────────────────────────────────────────────────────── */
    const exceptions = avecExceptions ? (await query<{ message_id: string; fil_id: string; libelle: string;
      nom: string | null; le: string; photo: unknown }>(
      `SELECT e.message_id::text, m.fil_id::text, e.cree_par_libelle AS libelle, ${NOM} AS nom,
              to_char(e.cree_le AT TIME ZONE 'UTC', ${ISO}) AS le,
              ${avec342 ? 'e.fond_avant' : 'NULL::jsonb'} AS photo
         FROM gestion_message_exception e
         JOIN gestion_message m ON m.id = e.message_id
         LEFT JOIN admin_utilisateur u ON u.id = e.cree_par
        WHERE e.message_id = ANY($1::bigint[]) AND e.retiree_le IS NULL AND m.fil_id IS NOT NULL`, [ids]))
      .rows.filter((r) => exceptionEstUnGeste(r.libelle)) : [];

    /* ⚠️ `DISTINCT ON (mail, bien)` : une sortie marque TOUS les liens du mail vers ce bien (posé à la main ET par le
       moteur, p. ex.). C'est un seul geste — il ne doit compter qu'une fois dans le « ×N ». */
    const sorties = avecSorties ? (await query<{ message_id: string; fil_id: string | null; libelle: string | null;
      cle: string | null; par: string | null; motif: string | null; nom: string | null; le: string | null;
      photo: unknown }>(
      `SELECT DISTINCT ON (r.message_id, r.cible_cle)
              r.message_id::text, m.fil_id::text, r.cible_libelle AS libelle, r.cible_cle AS cle,
              r.sorti_par_libelle AS par, r.sorti_motif AS motif, ${NOM} AS nom,
              to_char(r.sorti_le AT TIME ZONE 'UTC', ${ISO}) AS le,
              ${avec342 ? 'r.sorti_fond_avant' : 'NULL::jsonb'} AS photo
         FROM gestion_rattachement r
         JOIN gestion_message m ON m.id = r.message_id
         LEFT JOIN admin_utilisateur u ON u.id = r.sorti_par
        WHERE r.message_id = ANY($1::bigint[]) AND r.statut = 'sorti' AND r.piece_id IS NULL
        ORDER BY r.message_id, r.cible_cle, r.sorti_le DESC, r.id DESC`, [ids]))
      .rows.filter((r) => sortieEstUnGeste({ par: r.par, motif: r.motif, motifsAutomatiques: MOTIFS_SORTIE_AUTOMATIQUE }))
      : [];

    /* 🔴 LOT TRACE-ONE-SHOT — les marques Interne / Hors gestion « ce mail uniquement », vivantes. Avant la 342, leur
       portée n'est enregistrée nulle part : elles ne sont pas lues (on ne devine pas une portée). */
    type Marque = { message_id: string; fil_id: string | null; par: string; nom: string | null; le: string; photo: unknown };
    const marques = async (table: string): Promise<Marque[]> => (await query<Marque>(
      `SELECT x.message_id::text, m.fil_id::text, x.pose_par_libelle AS par, ${NOM} AS nom,
              to_char(x.pose_le AT TIME ZONE 'UTC', ${ISO}) AS le, x.fond_avant AS photo
         FROM ${table} x
         JOIN gestion_message m ON m.id = x.message_id
         LEFT JOIN admin_utilisateur u ON u.id = x.pose_par
        WHERE x.message_id = ANY($1::bigint[]) AND x.retire_le IS NULL AND x.portee = 'mail'`, [ids])).rows;
    const internes = avec342 ? await marques('gestion_message_interne') : [];
    const horsGestion = avec342 ? await marques('gestion_hors_gestion') : [];

    /* ── LE FOND D'AUJOURD'HUI, seulement où il sert (exception toujours ; les autres faute de photo) ─────────────── */
    const filsAvecBesoin = new Set<number>([
      ...exceptions.map((r) => Number(r.fil_id)),
      ...[...sorties, ...internes, ...horsGestion]
        .filter((r) => r.fil_id !== null && photoLue(r.photo) === null).map((r) => Number(r.fil_id)),
    ]);
    const fonds = new Map<number, { fond: Map<number, Classement>; interne: boolean;
      exceptions: Map<number, Classement> }>();
    if (filsAvecBesoin.size > 0) {
      const { rows: ie } = await query<{ fil_id: string }>(
        `SELECT DISTINCT fil_id::text FROM gestion_fil_interne
          WHERE fil_id = ANY($1::bigint[]) AND retire_le IS NULL`, [[...filsAvecBesoin]]);
      const filsInternes = new Set(ie.map((r) => Number(r.fil_id)));
      for (const fil of filsAvecBesoin) {
        const { periodes, exceptions: ex } = await suiviDuFil(fil);
        const mails = await mailsDuFil(fil);
        fonds.set(fil, {
          /* 🔴 LE FOND = LES FENÊTRES SEULES, l'exception mise de côté : ce que le mail suivrait sans elle. */
          fond: projeter(mails, periodes, []),
          interne: filsInternes.has(fil),
          exceptions: new Map(ex.map((e) => [e.messageId, e.classement])),
        });
      }
    }
    /** Le fond d'un mail : la photo si elle existe, sinon le recalcul d'aujourd'hui. */
    const fondDe = (m: number, fil: string | null, brut: unknown) => {
      const photo = photoLue(brut);
      if (photo !== null) return { classement: photo.fenetre ?? undefined, interneEchange: photo.interneEchange, recalcule: false };
      const f = fil === null ? undefined : fonds.get(Number(fil));
      return { classement: f?.fond.get(m), interneEchange: f?.interne ?? false, recalcule: true };
    };

    for (const r of exceptions) {
      const m = Number(r.message_id);
      const ex = fonds.get(Number(r.fil_id))?.exceptions.get(m);
      if (ex === undefined) continue;
      const f = fondDe(m, r.fil_id, r.photo);
      ajouter(m, modificationsDeLException({
        fond: f.classement, exception: ex, interneDeLEchange: f.interneEchange, fondRecalcule: f.recalcule,
        par: r.nom ?? r.libelle, le: r.le,
      }));
    }
    for (const r of sorties) {
      const m = Number(r.message_id);
      ajouter(m, [modificationDeLaSortie({
        bienLibelle: r.libelle ?? (r.cle === null ? '' : `lot ${r.cle}`),
        motif: r.motif, par: r.nom ?? r.par ?? '', le: r.le, fond: fondDe(m, r.fil_id, r.photo),
      })]);
    }
    for (const [sorte, liste] of [['interne', internes], ['hors_gestion', horsGestion]] as const) {
      for (const r of liste) {
        const m = Number(r.message_id);
        const f = fondDe(m, r.fil_id, r.photo);
        ajouter(m, modificationDeMarque({
          sorte, fond: f.classement, interneEchange: f.interneEchange, fondRecalcule: f.recalcule,
          par: r.nom ?? r.par, le: r.le,
        }));
      }
    }
  } catch (e) {
    console.error('[gestion/one-shot] lecture impossible', e);
    return new Map();
  }
  return parMail;
}
