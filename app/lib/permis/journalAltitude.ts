/**
 * FUS-3f — REGISTRE APPEND-ONLY des altitudes (helpers bas niveau, I/O). Une ligne par CHANGEMENT d'altitude d'un cleabs, à
 * VALEUR DE PREUVE : on n'écrit QUE des INSERT (jamais UPDATE/DELETE — garanti EN BASE par le trigger de la migration 118).
 *
 * 🔴 RÉSILIENCE : tant que la migration 118 n'est pas appliquée, la table n'existe pas. `journalActif()` le DÉTECTE par un simple
 * SELECT to_regclass (qui ne POISONNE PAS la transaction en cours, contrairement à un INSERT sur une table absente) → les actions
 * de rattachement continuent de fonctionner sans registre, et l'écriture n'est tentée QUE si la table existe. Aucun try/catch
 * autour d'un INSERT (qui, lui, avorterait la transaction atomique de validerRattachement).
 *
 * 🔴 PROVENANCE OBLIGATOIRE (pièce de preuve) : une ligne sans provenance ne prouve rien. `sourceMillesime` = étiquette d'édition
 * ou le littéral 'inconnu' — JAMAIS une date supposée ; `sourceDate` ne reçoit qu'une date RÉELLE par objet (date_modification).
 */
import type { RequeteTx } from '../db/client';

export type OrigineJournal = 'lidar' | 'permis';
export type CauseJournal = 'import' | 'injection' | 'retour_arriere' | 'ecrasement_lidar';

export interface LigneJournal {
  cleabs: string;
  altitudeNgf: number | null;              // altitude EFFECTIVE après ce changement ; null = mesure absente (fait, pas vide muet)
  origine: OrigineJournal;
  cause: CauseJournal;
  sourceType: string | null;               // 'bdtopo' | 'lidar_hd' | 'permis' (convention)
  sourceMillesime: string | null;          // étiquette d'édition, ou 'inconnu' EXPLICITE — jamais une date supposée
  sourceDate: Date | string | null;        // date RÉELLE par objet (batiment.date_modification) ; null sinon
  dossierId: number | null;
  altitudePrecedente: number | null;
  originePrecedente: OrigineJournal | null;
  par: string;
  note: string | null;
}

/** La table du registre existe-t-elle ? (migration 118 appliquée). SELECT to_regclass → ne poisonne PAS la transaction. */
export async function journalActif(q: RequeteTx): Promise<boolean> {
  const { rows } = await q<{ t: string | null }>(`SELECT to_regclass('public.permis_altitude_journal') AS t`);
  return rows[0]?.t != null;
}

/** INSERT (le SEUL mode d'écriture autorisé) d'une ligne de registre. À n'appeler qu'après `journalActif() === true`. */
export async function enregistrerLigneJournal(q: RequeteTx, l: LigneJournal): Promise<void> {
  await q(
    `INSERT INTO permis_altitude_journal
       (cleabs, altitude_ngf, origine, cause, source_type, source_millesime, source_date,
        dossier_id, altitude_precedente, origine_precedente, enregistre_par, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [l.cleabs, l.altitudeNgf, l.origine, l.cause, l.sourceType, l.sourceMillesime, l.sourceDate ?? null,
     l.dossierId, l.altitudePrecedente, l.originePrecedente, l.par, l.note],
  );
}

/** Dernière ligne connue d'un cleabs (pour ne pas dupliquer la ligne de départ 'lidar'). null si le registre est vide pour lui. */
export async function derniereLigne(q: RequeteTx, cleabs: string): Promise<{ origine: OrigineJournal; altitudeNgf: number | null } | null> {
  const { rows } = await q<{ origine: OrigineJournal; altitude_ngf: string | number | null }>(
    `SELECT origine, altitude_ngf FROM permis_altitude_journal WHERE cleabs = $1 ORDER BY enregistre_le DESC, id DESC LIMIT 1`, [cleabs]);
  const r = rows[0];
  return r ? { origine: r.origine, altitudeNgf: r.altitude_ngf == null ? null : Number(r.altitude_ngf) } : null;
}

/** date_modification RÉELLE de l'objet BD TOPO (proxy de millésime PAR objet ; seul fait de date disponible), ISO ou null. */
export async function dateModifBatiment(q: RequeteTx, cleabs: string): Promise<string | null> {
  const { rows } = await q<{ d: Date | string | null }>(
    `SELECT date_modification AS d FROM batiment WHERE cleabs = $1 ORDER BY date_modification DESC NULLS LAST LIMIT 1`, [cleabs]);
  const d = rows[0]?.d;
  return d == null ? null : (d instanceof Date ? d.toISOString() : String(d));
}
