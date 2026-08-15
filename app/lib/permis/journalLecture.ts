/**
 * N5-D/E — LECTURE du journal d'extraction (permis_extraction_journal, migrations 104/105) pour l'AFFICHAGE. Lecture SEULE :
 * aucune écriture, ne touche pas le dépôt. On lit, par (corps, champ), ce qui explique l'état de la valeur :
 *  - lignes role='retenue' → la valeur écrite fait foi : CONFIANCE, RÉSERVE, PROVENANCES (pièce, page) ;
 *  - lignes role='ecartee' → la valeur N'A PAS été écrite : le MOTIF (« pourquoi est-ce vide ? »).
 * UNE seule requête pour tout le permis (jamais une requête par champ).
 *
 * Client-safe par le TYPE seulement : la Vue cliente n'importe d'ici que `type` (piège du bundle du 13/08) ; ce module touche la
 * base (db/client) et n'est jamais exécuté côté client.
 */
import { query } from '../db/client';

export interface ProvenanceRetenue { piece: string | null; page: number | null }
/** Ce que le journal dit d'UN champ : soit une valeur retenue (confiance/réserve/provenances), soit un motif de non-écriture. */
export interface JournalChamp {
  confiance: 'a_verifier' | 'confirmee' | null;
  reserve: string | null;
  provenances: ProvenanceRetenue[];
  motif: string | null;
}
/** Indexé par corps puis par COLONNE SQL du champ (ex. 'altitude_sommet_ngf') — la même clé que `Mesure.colonne`. */
export type JournalParCorps = Record<number, Record<string, JournalChamp>>;

interface LigneJournal { corps_id: number | null; champ: string; role: 'retenue' | 'ecartee'; confiance: 'a_verifier' | 'confirmee' | null; reserve: string | null; motif: string | null; piece: string | null; page: number | null }

/**
 * Journal d'affichage d'un permis, groupé par (corps, champ). Un champ écrit → lignes 'retenue' (confiance/réserve uniformes,
 * provenances accumulées) ; un champ non écrit → ligne 'ecartee' (motif). On garde la première valeur non nulle de chaque attribut.
 */
export async function lireJournalChamps(dossierId: number): Promise<JournalParCorps> {
  const { rows } = await query<LigneJournal>(
    `SELECT corps_id, champ, role, confiance, reserve, motif, piece, page
       FROM permis_extraction_journal
      WHERE dossier_id = $1 AND role IN ('retenue', 'ecartee')
      ORDER BY corps_id, champ, piece, page`,
    [dossierId],
  );
  const out: JournalParCorps = {};
  for (const r of rows) {
    if (r.corps_id === null) continue; // retenue/ecartee attribuées portent un corps ; les lignes sans corps ne s'affichent pas ici
    const parChamp = (out[r.corps_id] ??= {});
    const j = (parChamp[r.champ] ??= { confiance: null, reserve: null, provenances: [], motif: null });
    if (j.confiance === null && r.confiance !== null) j.confiance = r.confiance;
    if (j.reserve === null && r.reserve !== null) j.reserve = r.reserve;
    if (j.motif === null && r.motif !== null) j.motif = r.motif;
    if (r.role === 'retenue' && (r.piece !== null || r.page !== null)) j.provenances.push({ piece: r.piece, page: r.page });
  }
  return out;
}
