/**
 * PART-2 — MÉMOIRE du diagnostic de complétude (IMPUR : base). Le classement PAR CONTENU lit les PDF (coûteux) : on le calcule au
 * moment de l'analyse (« Relancer l'analyse ») et on le MÉMORISE dans `permis_completude` ; l'affichage relit la mémoire et recompose
 * présent/manquant selon les familles attendues VIVES, SANS relire les PDF. Une pièce ajoutée depuis le calcul → diagnostic PÉRIMÉ.
 *
 * RÉSILIENCE : tant que la migration 174 n'est pas appliquée, la table n'existe pas → `enregistrer` est un NO-OP propre et `lire`
 * renvoie null (l'affichage dira « analyse à lancer »). Aucune exception propagée : n'impacte jamais l'extraction ni le rendu.
 */
import { query } from '../db/client';
import { MARQUEUR_FICHE_SYNTHESE } from './gedConstantes';
import { classerPiece, lignesDepuisClassements, famillesAttenduesDepuisConfig, type ClassementPiece, type DiagnosticCompletude } from './diagnosticCompletude';
import type { ResultatLectureGed } from './lectureGed';

/** Calcule le classement PAR CONTENU des pièces déjà lues (ged) et le mémorise. NO-OP résilient si la table est absente (174). */
export async function enregistrerCompletude(dossierId: number, ged: ResultatLectureGed, calculePar: string): Promise<void> {
  const classements: ClassementPiece[] = ged.pieces.map((p) => classerPiece({
    nomFichier: p.nomFichier,
    pagesTexte: p.pages.filter((pg) => pg.aTexte).map((pg) => pg.texte),
  }));
  try {
    await query(
      `INSERT INTO permis_completude (dossier_id, classements, nb_pieces, calcule_le, calcule_par)
         VALUES ($1, $2::jsonb, $3, now(), $4)
       ON CONFLICT (dossier_id) DO UPDATE
         SET classements = EXCLUDED.classements, nb_pieces = EXCLUDED.nb_pieces, calcule_le = EXCLUDED.calcule_le, calcule_par = EXCLUDED.calcule_par`,
      [dossierId, JSON.stringify(classements), ged.pieces.length, calculePar]);
  } catch { /* 174 non appliquée → pas de mémoire ; l'affichage proposera de lancer l'analyse */ }
}

export interface CompletudeLue {
  diagnostic: DiagnosticCompletude;
  calculeLe: string;   // ISO
  perime: boolean;     // une pièce a été ajoutée depuis le calcul → relancer l'analyse
}

/**
 * Lit le diagnostic mémorisé et le RECOMPOSE selon les familles attendues VIVES (config), sans relire les PDF. `null` = aucun
 * diagnostic mémorisé (jamais analysé, ou 174 absente) → l'appelant proposera « Relancer l'analyse ». PÉREMPTION : le nombre de
 * documents GED (hors fiche de synthèse) diffère du nombre mémorisé au calcul.
 */
export async function lireCompletude(dossierId: number): Promise<CompletudeLue | null> {
  try {
    const { rows } = await query<{ classements: ClassementPiece[]; nb_pieces: number; calcule_le: string | Date }>(
      `SELECT classements, nb_pieces, calcule_le FROM permis_completude WHERE dossier_id = $1`, [dossierId]);
    const r = rows[0];
    if (!r) return null;
    const { chargerConfigVeille } = await import('../sitadel/veilleConfig');
    const cfg = await chargerConfigVeille();
    const familles = famillesAttenduesDepuisConfig({
      cerfa: cfg.familleAttendueCerfa, masse: cfg.familleAttendueMasse, coupe: cfg.familleAttendueCoupe, etage: cfg.familleAttendueEtage,
    });
    const diagnostic = lignesDepuisClassements(r.classements ?? [], familles);
    const { rows: c } = await query<{ n: number }>(
      `SELECT count(*)::int AS n FROM dossier_document WHERE dossier_id = $1 AND note IS DISTINCT FROM $2`, [dossierId, MARQUEUR_FICHE_SYNTHESE]);
    const perime = (c[0]?.n ?? 0) !== r.nb_pieces;
    return { diagnostic, calculeLe: r.calcule_le instanceof Date ? r.calcule_le.toISOString() : new Date(r.calcule_le).toISOString(), perime };
  } catch { return null; } // 174 absente / lecture impossible → pas de diagnostic (affichage proposera de lancer l'analyse)
}
