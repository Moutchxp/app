/**
 * N5-D/E — LECTURE du journal d'extraction (permis_extraction_journal, migrations 104/105) pour l'AFFICHAGE. Lecture SEULE :
 * aucune écriture, ne touche pas le dépôt. On lit, par (corps, champ), ce qui explique l'état de la valeur :
 *  - lignes role='retenue' → la valeur écrite fait foi : CONFIANCE, RÉSERVE, PROVENANCES (pièce, page) ;
 *  - lignes role='ecartee' → la valeur N'A PAS été écrite : le MOTIF (« pourquoi est-ce vide ? »).
 * UNE seule requête pour tout le permis (jamais une requête par champ).
 *
 * N10-T — Quand PLUSIEURS méthodes ont posé une 'retenue' pour le même champ (ex. ordre d'exécution inversé, état hérité), le GAGNANT
 *   est la 'retenue' de PLUS HAUT RANG de précédence (`precedenceMethodes`), pas la première ligne triée par (corps, champ, pièce,
 *   page). C'est ce qui corrige le « mensonge de provenance » : la valeur affichée est étiquetée de la méthode qui a réellement gagné.
 *   Les 'retenue' perdantes (rang inférieur) et les 'ecartee' rejoignent `ecartes` (alternatives visibles), jamais la provenance retenue.
 *
 * Client-safe par le TYPE seulement : la Vue cliente n'importe d'ici que `type` (piège du bundle du 13/08) ; ce module touche la
 * base (db/client) et n'est jamais exécuté côté client.
 */
import { query } from '../db/client';
import { methodeGagnante } from './precedenceMethodes';

export interface ProvenanceRetenue { piece: string | null; page: number | null }
/** N10-B — une ligne ÉCARTÉE porteuse d'une provenance (superstructure au-dessus de la toiture, garde-corps, niveau nommé…) :
 *  sa cote, sa pièce/page (pour un lien cliquable) et son motif. Additif : ne change RIEN aux `provenances` des valeurs retenues.
 *  N10-T — porte aussi la `methode` (quelle source proposait cet écart) et l'`extrait` (le texte lu, ex. une adresse écartée). */
export interface ProvenanceEcartee { valeur: number | null; piece: string | null; page: number | null; motif: string | null; methode?: string | null; extrait?: string | null }
/** Ce que le journal dit d'UN champ : soit une valeur retenue (confiance/réserve/provenances), soit un motif de non-écriture. */
export interface JournalChamp {
  confiance: 'a_verifier' | 'confirmee' | null;
  reserve: string | null;
  provenances: ProvenanceRetenue[];
  ecartes?: ProvenanceEcartee[]; // N10-B : lignes écartées AVEC provenance (rendues cliquables) — optionnel (additif ; `lireJournalChamps` le remplit toujours)
  motif: string | null;
  methode?: string | null; // N10-C : d'où vient la ligne (liste fermée 'motifs'|'cerfa'|'ia'|'enonce'|'plan') — test EXACT, jamais un rapprochement sur le texte du motif
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

interface LigneJournal { corps_id: number | null; champ: string; role: 'retenue' | 'ecartee'; confiance: 'a_verifier' | 'confirmee' | null; reserve: string | null; motif: string | null; piece: string | null; page: number | null; valeur: number | null; methode: string | null; extrait: string | null }

/** Construit le JournalChamp d'UN champ à partir de ses lignes (ordre stable préservé par le tri SQL). Applique la précédence N10-T. */
function construireJournalChamp(lignes: readonly LigneJournal[]): JournalChamp {
  const j: JournalChamp = { confiance: null, reserve: null, provenances: [], ecartes: [], motif: null, methode: null, valeurRetenue: null };
  const retenues = lignes.filter((l) => l.role === 'retenue');
  const ecarte = (l: LigneJournal) => { if (l.piece !== null || l.page !== null) j.ecartes!.push({ valeur: l.valeur, piece: l.piece, page: l.page, motif: l.motif, methode: l.methode, extrait: l.extrait }); };

  if (retenues.length > 0) {
    // GAGNANT = 'retenue' de plus haut rang de précédence ; sa méthode fait foi, ses provenances/confiance/réserve seules comptent.
    const gagnante = methodeGagnante(retenues.map((l) => l.methode));
    const estGagnant = (l: LigneJournal) => (l.methode ?? null) === gagnante;
    j.methode = gagnante;
    for (const l of retenues) {
      if (!estGagnant(l)) { ecarte(l); continue; } // 'retenue' d'une méthode de rang inférieur = alternative écartée par précédence
      if (j.confiance === null && l.confiance !== null) j.confiance = l.confiance;
      if (j.reserve === null && l.reserve !== null) j.reserve = l.reserve;
      if ((j.valeurRetenue ?? null) === null && l.valeur !== null) j.valeurRetenue = l.valeur;
      if (l.piece !== null || l.page !== null) j.provenances.push({ piece: l.piece, page: l.page });
    }
    for (const l of lignes) if (l.role === 'ecartee') ecarte(l);
    return j;
  }

  // Aucune 'retenue' : champ VIDE. On expose la méthode et le motif de la première ligne (ex. « Cerfa scan sans champ » = ecartee 'cerfa').
  for (const l of lignes) {
    if (j.confiance === null && l.confiance !== null) j.confiance = l.confiance;
    if (j.reserve === null && l.reserve !== null) j.reserve = l.reserve;
    if (j.motif === null && l.motif !== null) j.motif = l.motif;
    if ((j.methode ?? null) === null && l.methode !== null) j.methode = l.methode;
    if (l.role === 'ecartee') ecarte(l);
  }
  return j;
}

/**
 * Journal d'affichage d'un permis, groupé par (niveau, champ). Un champ écrit → sa valeur GAGNANTE (précédence N10-T) fait foi ;
 * un champ non écrit → ligne 'ecartee' (motif). Une seule requête, tri stable par (corps_id, champ, pièce, page).
 */
export async function lireJournalChamps(dossierId: number): Promise<JournalPermis> {
  const { rows } = await query<LigneJournal>(
    `SELECT corps_id, champ, role, confiance, reserve, motif, piece, page, valeur, methode, extrait
       FROM permis_extraction_journal
      WHERE dossier_id = $1 AND role IN ('retenue', 'ecartee')
      ORDER BY corps_id, champ, piece, page`,
    [dossierId],
  );
  // Groupement par (corps, champ) en préservant l'ordre du tri.
  const groupes = new Map<string, LigneJournal[]>();
  for (const r of rows) { const k = `${r.corps_id ?? 'P'}|${r.champ}`; const g = groupes.get(k); if (g) g.push(r); else groupes.set(k, [r]); }

  const parCorps: JournalParCorps = {};
  const permis: JournalParChamp = {};
  for (const lignes of groupes.values()) {
    const first = lignes[0];
    const cible = first.corps_id === null ? permis : (parCorps[first.corps_id] ??= {});
    cible[first.champ] = construireJournalChamp(lignes);
  }
  return { parCorps, permis };
}

/**
 * N10-T — PROPRIÉTAIRE actuel de chaque champ = méthode de la 'retenue' de plus haut rang déjà en base. Sert de GARDE de précédence
 * aux writers de rang faible (ia, motifs) : ils ne réécrivent pas un champ déjà détenu par une méthode supérieure. `corpsId` null =
 * niveau permis (corps_id NULL). Lecture SEULE, une requête. Rend une méthode (ou absente) par colonne interrogée.
 */
export async function proprietairesRetenue(dossierId: number, corpsId: number | null, champs: readonly string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (champs.length === 0) return out;
  const cond = corpsId === null ? 'corps_id IS NULL' : 'corps_id = $3';
  const params: unknown[] = corpsId === null ? [dossierId, champs] : [dossierId, champs, corpsId];
  const { rows } = await query<{ champ: string; methode: string | null }>(
    `SELECT champ, methode FROM permis_extraction_journal
      WHERE dossier_id = $1 AND ${cond} AND role = 'retenue' AND champ = ANY($2::text[])`, params);
  const parChamp = new Map<string, (string | null)[]>();
  for (const r of rows) { const a = parChamp.get(r.champ); if (a) a.push(r.methode); else parChamp.set(r.champ, [r.methode]); }
  for (const [champ, methodes] of parChamp) out.set(champ, methodeGagnante(methodes));
  return out;
}
