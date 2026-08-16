/**
 * FUS-3f — EXPORT à la demande du REGISTRE d'altitudes, à valeur de preuve, par POLYGONE (cleabs) ou par PARCELLE (idu).
 * Le lien parcelle → polygones passe par l'EMPREINTE du permis : parcelle (idu) → permis_parcelle → permis_empreinte.geom →
 * polygones BD TOPO intersectants (cleabs). Deux sorties depuis la même donnée : une STRUCTURE JSON (archivable, réexploitable)
 * et un RENDU TEXTE lisible type attestation (`rendreTextePiece`, PUR → testable sans base). Lecture SEULE ; n'écrit rien, ne
 * touche NI le moteur de verdict SVAV NI le golden.
 */
import { query } from '../db/client';
import { journalActif } from './journalAltitude';

export interface LigneHistorique {
  enregistreLe: string;                    // ISO
  origine: 'lidar' | 'permis';
  cause: 'import' | 'injection' | 'retour_arriere' | 'ecrasement_lidar';
  altitudeNgf: number | null;
  sourceType: string | null;
  sourceMillesime: string | null;
  sourceDate: string | null;               // ISO ou null
  dossierId: number | null;
  note: string | null;
}

export interface PolygoneExport {
  cleabs: string;
  altitudeCourante: number | null;         // permis_polygone_altitude (état courant), null si aucune ligne
  origineCourante: 'lidar' | 'permis' | null;
  historique: LigneHistorique[];           // registre append-only, ordre chronologique
}

export interface PieceExport {
  cle: { type: 'polygone' | 'parcelle'; valeur: string };
  genereLe: string | null;                 // horodatage d'édition de la pièce (posé par l'appelant/CLI), ou null
  polygones: PolygoneExport[];
  avertissement?: string;                  // ex. registre non disponible (migration 118 non appliquée)
}

/** Historique + état courant d'UN cleabs. */
async function polygone(cleabs: string): Promise<PolygoneExport> {
  const { rows: cur } = await query<{ alt: string | number | null; origine: 'lidar' | 'permis' | null }>(
    `SELECT altitude_ngf AS alt, altitude_origine AS origine FROM permis_polygone_altitude WHERE cleabs = $1`, [cleabs]);
  const { rows: hist } = await query<{
    enregistre_le: Date | string; origine: 'lidar' | 'permis'; cause: LigneHistorique['cause'];
    altitude_ngf: string | number | null; source_type: string | null; source_millesime: string | null;
    source_date: Date | string | null; dossier_id: number | null; note: string | null;
  }>(
    `SELECT enregistre_le, origine, cause, altitude_ngf, source_type, source_millesime, source_date, dossier_id, note
       FROM permis_altitude_journal WHERE cleabs = $1 ORDER BY enregistre_le ASC, id ASC`, [cleabs]);
  const iso = (d: Date | string | null): string | null => d == null ? null : (d instanceof Date ? d.toISOString() : String(d));
  return {
    cleabs,
    altitudeCourante: cur[0]?.alt == null ? null : Number(cur[0].alt),
    origineCourante: cur[0]?.origine ?? null,
    historique: hist.map((h) => ({
      enregistreLe: iso(h.enregistre_le) as string, origine: h.origine, cause: h.cause,
      altitudeNgf: h.altitude_ngf == null ? null : Number(h.altitude_ngf),
      sourceType: h.source_type, sourceMillesime: h.source_millesime, sourceDate: iso(h.source_date),
      dossierId: h.dossier_id, note: h.note,
    })),
  };
}

/** Pièce pour UN polygone (cleabs). */
export async function exporterParPolygone(cleabs: string, genereLe: string | null = null): Promise<PieceExport> {
  const base: PieceExport = { cle: { type: 'polygone', valeur: cleabs }, genereLe, polygones: [] };
  if (!(await journalActif(query))) return { ...base, avertissement: 'registre indisponible (migration 118 non appliquée)', polygones: [] };
  return { ...base, polygones: [await polygone(cleabs)] };
}

/** Pièce pour UNE parcelle (idu) : tous les polygones BD TOPO intersectant l'empreinte du/des permis rattaché(s) à cet idu. */
export async function exporterParParcelle(idu: string, genereLe: string | null = null): Promise<PieceExport> {
  const base: PieceExport = { cle: { type: 'parcelle', valeur: idu }, genereLe, polygones: [] };
  if (!(await journalActif(query))) return { ...base, avertissement: 'registre indisponible (migration 118 non appliquée)' };
  const { rows } = await query<{ cleabs: string }>(
    `SELECT DISTINCT b.cleabs
       FROM batiment b
       JOIN permis_parcelle p  ON p.idu = $1
       JOIN permis_empreinte e ON e.dossier_id = p.dossier_id AND e.geom IS NOT NULL
      WHERE b.cleabs IS NOT NULL AND ST_Intersects(ST_Force2D(b.geom), e.geom)
      ORDER BY b.cleabs`, [idu]);
  const polygones: PolygoneExport[] = [];
  for (const r of rows) polygones.push(await polygone(r.cleabs));
  return { ...base, polygones };
}

// ── Rendu texte PUR (attestation lisible, archivable) ────────────────────────
const fmtAlt = (a: number | null): string => a == null ? 'aucune mesure' : `${a} NGF`;
const fmtOrigine = (o: string | null): string => o === 'lidar' ? 'LiDAR' : o === 'permis' ? 'permis' : '—';
const fmtCause: Record<LigneHistorique['cause'], string> = {
  import: 'import BD TOPO', injection: 'injection permis', retour_arriere: 'retour LiDAR', ecrasement_lidar: 'écrasement par mesure LiDAR',
};

/** Rend une pièce lisible (une ligne par changement, avec provenance + date). PUR : mêmes entrées → même texte. */
export function rendreTextePiece(p: PieceExport): string {
  const L: string[] = [];
  L.push('— PIÈCE : REGISTRE DES ALTITUDES (Sans Vis-à-Vis®) —');
  L.push(`Clé : ${p.cle.type} ${p.cle.valeur}`);
  if (p.genereLe) L.push(`Éditée le : ${p.genereLe}`);
  if (p.avertissement) L.push(`⚠️ ${p.avertissement}`);
  L.push('');
  if (p.polygones.length === 0) {
    L.push('Aucun polygone rattaché à cette clé.');
    return L.join('\n');
  }
  for (const poly of p.polygones) {
    L.push(`Polygone ${poly.cleabs}`);
    L.push(`  État courant : ${fmtAlt(poly.altitudeCourante)} (origine ${fmtOrigine(poly.origineCourante)})`);
    if (poly.historique.length === 0) {
      L.push('  Historique : aucun enregistrement.');
    } else {
      L.push('  Historique (chronologique) :');
      for (const h of poly.historique) {
        const prov = `${h.sourceType ?? '?'} · millésime ${h.sourceMillesime ?? 'inconnu'}${h.sourceDate ? ` · date objet ${h.sourceDate}` : ''}`;
        L.push(`   ${h.enregistreLe}  ${fmtOrigine(h.origine).padEnd(6)} ${fmtAlt(h.altitudeNgf).padEnd(16)} [${fmtCause[h.cause]}]  (${prov})`);
      }
    }
    L.push('');
  }
  return L.join('\n').trimEnd();
}
