/**
 * N5-D — LECTURE du journal d'extraction (permis_extraction_journal, migration 104) pour l'AFFICHAGE. Lecture SEULE : aucune
 * écriture, ne touche pas le dépôt. On ne lit QUE les lignes role='retenue' (la valeur qui a été écrite et fait foi côté corps) :
 * pour chaque (corps, champ), la CONFIANCE, la RÉSERVE et les PROVENANCES (pièce, page) — de quoi montrer, à côté de la valeur,
 * à quel point on y croit et d'où elle vient. UNE seule requête pour tout le permis (jamais une requête par champ).
 *
 * Client-safe par le TYPE seulement : la Vue cliente n'importe d'ici que `type` (piège du bundle du 13/08) ; ce module, lui,
 * touche la base (db/client) et n'est jamais exécuté côté client.
 */
import { query } from '../db/client';

export interface ProvenanceRetenue { piece: string | null; page: number | null }
/** Ce que le journal dit d'UNE valeur retenue : confiance, réserve, et où elle a été lue. */
export interface JournalRetenu {
  confiance: 'a_verifier' | 'confirmee' | null;
  reserve: string | null;
  provenances: ProvenanceRetenue[];
}
/** Indexé par corps puis par COLONNE SQL du champ (ex. 'altitude_sommet_ngf') — la même clé que `Mesure.colonne`. */
export type JournalRetenuParCorps = Record<number, Record<string, JournalRetenu>>;

interface LigneRetenue { corps_id: number | null; champ: string; confiance: 'a_verifier' | 'confirmee' | null; reserve: string | null; piece: string | null; page: number | null }

/**
 * Journal des valeurs RETENUES d'un permis, groupé par (corps, champ). Confiance/réserve sont uniformes par champ (posées
 * ensemble à l'écriture) : on garde la première non nulle. Les provenances sont accumulées dans l'ordre (pièce, page).
 */
export async function lireJournalRetenu(dossierId: number): Promise<JournalRetenuParCorps> {
  const { rows } = await query<LigneRetenue>(
    `SELECT corps_id, champ, confiance, reserve, piece, page
       FROM permis_extraction_journal
      WHERE dossier_id = $1 AND role = 'retenue'
      ORDER BY corps_id, champ, piece, page`,
    [dossierId],
  );
  const out: JournalRetenuParCorps = {};
  for (const r of rows) {
    if (r.corps_id === null) continue; // une 'retenue' porte toujours un corps ; garde défensive
    const parChamp = (out[r.corps_id] ??= {});
    const j = (parChamp[r.champ] ??= { confiance: null, reserve: null, provenances: [] });
    if (j.confiance === null && r.confiance !== null) j.confiance = r.confiance;
    if (j.reserve === null && r.reserve !== null) j.reserve = r.reserve;
    if (r.piece !== null || r.page !== null) j.provenances.push({ piece: r.piece, page: r.page });
  }
  return out;
}
