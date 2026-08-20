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
/** N10-B — une ligne ÉCARTÉE porteuse d'une provenance (superstructure au-dessus de la toiture, garde-corps, niveau nommé…) :
 *  sa cote, sa pièce/page (pour un lien cliquable) et son motif. Additif : ne change RIEN aux `provenances` des valeurs retenues. */
export interface ProvenanceEcartee { valeur: number | null; piece: string | null; page: number | null; motif: string | null }
/** Ce que le journal dit d'UN champ : soit une valeur retenue (confiance/réserve/provenances), soit un motif de non-écriture. */
export interface JournalChamp {
  confiance: 'a_verifier' | 'confirmee' | null;
  reserve: string | null;
  provenances: ProvenanceRetenue[];
  ecartes?: ProvenanceEcartee[]; // N10-B : lignes écartées AVEC provenance (rendues cliquables) — optionnel (additif ; `lireJournalChamps` le remplit toujours)
  motif: string | null;
  methode?: string | null; // N10-C : d'où vient la ligne (liste fermée 'motifs'|'cerfa'|'ia'|'enonce') — test EXACT, jamais un rapprochement sur le texte du motif
  valeurRetenue?: number | null; // N10-D : la valeur AUTOMATIQUE retenue (ligne 'retenue') — reste consultable même après qu'une saisie a écrasé la colonne
}
/** Indexé par COLONNE SQL du champ (ex. 'altitude_sommet_ngf') — la même clé que `Mesure.colonne`. */
export type JournalParChamp = Record<string, JournalChamp>;
/** Indexé par corps puis par colonne. */
export type JournalParCorps = Record<number, JournalParChamp>;
/**
 * Journal d'affichage d'un permis, séparé par NIVEAU : `parCorps` (lignes attribuées à un corps) et `permis` (lignes de niveau
 * PERMIS, corps_id NULL — ex. les champs Cerfa de N7-D). ⚠️ N7-E : sans ce niveau `permis`, la confiance/réserve/motif des 4
 * champs Cerfa (corps_id NULL) seraient perdus à la lecture.
 */
export interface JournalPermis { parCorps: JournalParCorps; permis: JournalParChamp }

interface LigneJournal { corps_id: number | null; champ: string; role: 'retenue' | 'ecartee'; confiance: 'a_verifier' | 'confirmee' | null; reserve: string | null; motif: string | null; piece: string | null; page: number | null; valeur: number | null; methode: string | null }

/**
 * Journal d'affichage d'un permis, groupé par (niveau, champ). Un champ écrit → lignes 'retenue' (confiance/réserve uniformes,
 * provenances accumulées) ; un champ non écrit → ligne 'ecartee' (motif). On garde la première valeur non nulle de chaque attribut.
 */
export async function lireJournalChamps(dossierId: number): Promise<JournalPermis> {
  const { rows } = await query<LigneJournal>(
    `SELECT corps_id, champ, role, confiance, reserve, motif, piece, page, valeur, methode
       FROM permis_extraction_journal
      WHERE dossier_id = $1 AND role IN ('retenue', 'ecartee')
      ORDER BY corps_id, champ, piece, page`,
    [dossierId],
  );
  const parCorps: JournalParCorps = {};
  const permis: JournalParChamp = {};
  for (const r of rows) {
    const cible = r.corps_id === null ? permis : (parCorps[r.corps_id] ??= {});
    const j = (cible[r.champ] ??= { confiance: null, reserve: null, provenances: [], ecartes: [], motif: null, methode: null, valeurRetenue: null });
    if (j.confiance === null && r.confiance !== null) j.confiance = r.confiance;
    if (j.reserve === null && r.reserve !== null) j.reserve = r.reserve;
    if (j.motif === null && r.motif !== null) j.motif = r.motif;
    if ((j.methode ?? null) === null && r.methode !== null) j.methode = r.methode; // N10-C : d'où vient la ligne (pour détecter « Cerfa = scan sans champs »)
    if ((j.valeurRetenue ?? null) === null && r.role === 'retenue' && r.valeur !== null) j.valeurRetenue = r.valeur; // N10-D : valeur automatique (retenue)
    if (r.role === 'retenue' && (r.piece !== null || r.page !== null)) j.provenances.push({ piece: r.piece, page: r.page });
    // N10-B — les écartés AVEC provenance (superstructures, garde-corps, niveaux nommés) : rendus cliquables au même titre que les retenues.
    if (r.role === 'ecartee' && (r.piece !== null || r.page !== null)) (j.ecartes ??= []).push({ valeur: r.valeur, piece: r.piece, page: r.page, motif: r.motif });
  }
  return { parCorps, permis };
}
