/**
 * LOT 95 (B2) — persistance de la LECTURE DE VALEURS au grain page. Deux responsabilités, séparées :
 *   • appliquerLectureValeur : la VALEUR lue → colonne + JOURNAL (tables EXISTANTES, aucune migration requise). Respecte l'invariant 103
 *     (champ VIDE seulement) et la précédence (méthode 'ia' de rang faible ; ici l'écriture n'a lieu QUE si le champ est vide, donc aucun
 *     conflit de rang possible). Journal 'ia' JAMAIS 'confirmee' sur la seule foi du modèle (confiance 'a_verifier' même écrit).
 *   • enregistrerLecturePage / lireLecturesPage : l'ÉTAT DATÉ « page analysée » (migration 195). RÉSILIENT : 42P01/42703 → no-op / vide
 *     (la valeur, elle, s'écrit toujours via les tables existantes ; seul l'audit daté au grain page dégrade).
 *   • annulerLectureValeur : RÉVERSIBILITÉ — vide le champ + retire la ligne 'ia', UNIQUEMENT si l'origine est 'extraite' (jamais une saisie).
 */
import { query } from '../db/client';
import { suffixeOrigine } from './journalExtraction'; // LOT 100 — origine 'manuelle' (bouton « analyse de la page »)
import { ecrireCaracteristiquesGlobales } from './caracteristiquesRepo';
import { deciderEcritureValeurLue, type ActionLecture, type ConfianceLue, type ValeurLue } from './lectureValeursPage';

/** Colonne SQL du seul champ lu par ce lot (niveau DOSSIER). */
const CHAMP_SQL = 'altitude_sommet_ngf';

const MOTIF_DEJA_REMPLI = 'un champ déjà renseigné n’est pas écrasé par la lecture d’image (valeur conservée, visible)';
const MOTIF_SAISIE = 'une valeur saisie à la main occupe déjà le champ (non écrasée)';

/** Format FR d'une altitude (jamais d'arrondi caché : affichage 2 décimales, la valeur écrite reste brute). */
function fmt(n: number): string { return n.toFixed(2).replace('.', ','); }

function resumeLecture(action: ActionLecture, valeur: number, ecrit: boolean): string {
  if (action === 'ecrire') return ecrit
    ? `altitude de sommet ${fmt(valeur)} m NGF lue et écrite (champ vide rempli — à vérifier).`
    : `altitude de sommet ${fmt(valeur)} m NGF lue, mais une valeur saisie occupe déjà le champ — non écrite.`;
  if (action === 'a_verifier') return `altitude de sommet ${fmt(valeur)} m NGF lue mais DOUTEUSE — proposée à vérifier, non écrite.`;
  return `altitude de sommet ${fmt(valeur)} m NGF lue, mais le champ est déjà renseigné — non écrite (jamais écrasée).`;
}

export interface OptionsLecture { pieceId: number; pieceNom: string; page: number; valeurLue: ValeurLue | null; par: string | null }
export interface ResultatApplication {
  action: ActionLecture; champ: string; valeur: number | null; confiance: ConfianceLue | null; ecrit: boolean; resume: string;
}

/**
 * Applique une valeur LUE : décision PURE (rien / déjà rempli / à vérifier / écrire), puis écriture éventuelle du champ VIDE
 * (origine 'extraite', invariant 103) + une ligne de JOURNAL 'ia' (retenue si écrit, candidat si à vérifier, ecartee si déjà rempli).
 * La ligne 'ia' précédente de CE champ (niveau dossier) est purgée avant réécriture (idempotent). Aucune écriture si 'rien' d'exploitable.
 */
export async function appliquerLectureValeur(dossierId: number, o: OptionsLecture): Promise<ResultatApplication> {
  const { valeurLue } = o;
  const { rows } = await query<{ v: string | number | null }>(
    `SELECT ${CHAMP_SQL} AS v FROM permis_caracteristique WHERE dossier_id = $1`, [dossierId]);
  const dejaRempli = rows[0]?.v != null;
  const action = deciderEcritureValeurLue(valeurLue, dejaRempli);

  if (action === 'rien' || valeurLue === null) {
    return { action: 'rien', champ: CHAMP_SQL, valeur: null, confiance: null, ecrit: false, resume: 'aucune valeur exploitable sur cette page.' };
  }

  // Purge idempotente CIBLÉE : la SEULE ligne 'ia' du champ dossier (corps_id NULL) — jamais 'saisie'/'cerfa'/'motifs'/'plan'/'recap'.
  await query(`DELETE FROM permis_extraction_journal WHERE dossier_id = $1 AND methode = 'ia' AND corps_id IS NULL AND champ = $2`, [dossierId, CHAMP_SQL]);

  let role: 'retenue' | 'candidat' | 'ecartee';
  let motif: string | null = null;
  let ecrit = false;
  if (action === 'ecrire') {
    const r = await ecrireCaracteristiquesGlobales(dossierId, { altitudeSommetNgf: valeurLue.valeur }, 'extraite', o.par ?? 'admin');
    ecrit = r.ecrits.includes('altitudeSommetNgf');
    role = ecrit ? 'retenue' : 'ecartee';                 // course rarissime : une saisie posée entre la lecture et l'écriture → non écrit
    if (!ecrit) motif = MOTIF_SAISIE;
  } else if (action === 'a_verifier') {
    role = 'candidat';                                     // douteux : proposé « à vérifier », jamais écrit dans la colonne
  } else {                                                 // deja_rempli : valeur conservée et VISIBLE dans le journal (jamais écrasée)
    role = 'ecartee'; motif = MOTIF_DEJA_REMPLI;
  }

  // Journal 'ia' — provenance pièce+page, confiance 'a_verifier' TOUJOURS (jamais 'confirmee' sur la seule foi du modèle).
  // LOT 100 — origine 'manuelle' EXPLICITE : ce chemin est le bouton « analyse de la page » (geste humain délibéré), jamais automatique.
  const params = [dossierId, CHAMP_SQL, valeurLue.valeur, role, motif, o.pieceNom, o.page, valeurLue.extrait || null];
  const og = await suffixeOrigine(params.length, 'manuelle');
  await query(
    `INSERT INTO permis_extraction_journal (dossier_id, corps_id, champ, valeur, unite, role, methode, confiance, reserve, motif, piece, page, extrait, extrait_le${og.cols})
     VALUES ($1, NULL, $2, $3, 'ngf', $4, 'ia', 'a_verifier', NULL, $5, $6, $7, $8, now()${og.vals})`,
    [...params, ...og.params]);

  return { action, champ: CHAMP_SQL, valeur: valeurLue.valeur, confiance: valeurLue.confiance, ecrit, resume: resumeLecture(action, valeurLue.valeur, ecrit) };
}

/**
 * RÉVERSIBILITÉ : annule une valeur écrite par CE chemin. Vide le champ (valeur + origine ENSEMBLE) et retire la ligne 'ia', mais
 * SEULEMENT si l'origine actuelle est 'extraite' ET qu'une ligne 'ia' 'retenue' existe pour ce champ — une SAISIE humaine est protégée
 * (jamais annulée par ce geste). `annule:false` = rien à annuler (déjà vide / valeur humaine / autre méthode). PUR côté effets (2 UPDATE/DELETE ciblés).
 */
export async function annulerLectureValeur(dossierId: number): Promise<{ ok: boolean; annule: boolean }> {
  const { rows } = await query<{ orig: string | null }>(
    `SELECT ${CHAMP_SQL}_origine AS orig FROM permis_caracteristique WHERE dossier_id = $1`, [dossierId]);
  const orig = rows[0]?.orig ?? null;
  const { rows: j } = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM permis_extraction_journal WHERE dossier_id = $1 AND methode = 'ia' AND corps_id IS NULL AND champ = $2 AND role = 'retenue'`, [dossierId, CHAMP_SQL]);
  const aLigneIa = Number(j[0]?.n ?? 0) > 0;
  if (orig !== 'extraite' || !aLigneIa) return { ok: true, annule: false }; // déjà vide, saisie humaine (protégée), ou aucune écriture 'ia'
  await query(`UPDATE permis_caracteristique SET ${CHAMP_SQL} = NULL, ${CHAMP_SQL}_origine = NULL, maj_le = now() WHERE dossier_id = $1`, [dossierId]);
  await query(`DELETE FROM permis_extraction_journal WHERE dossier_id = $1 AND methode = 'ia' AND corps_id IS NULL AND champ = $2`, [dossierId, CHAMP_SQL]);
  return { ok: true, annule: true };
}

// ── ÉTAT DATÉ par page (migration 195) — RÉSILIENT : table absente → no-op / vide (la valeur, elle, est écrite via les tables existantes) ──
export interface AuditLecturePage {
  envoyee: boolean; motif: string | null; nbValeurs: number; resume: string;
  modele: string; modeleResolu: string | null; tokensIn: number; tokensOut: number; coutUsd: number; par: string | null;
}

/** REMPLACE l'audit daté d'UNE page (rejouable). `true` = persisté ; `false` = migration 195 absente (no-op résilient). */
export async function enregistrerLecturePage(dossierId: number, pieceId: number, page: number, a: AuditLecturePage): Promise<boolean> {
  try {
    await query(
      `INSERT INTO permis_page_lecture (piece_id, page, dossier_id, envoyee, motif_ecart, nb_valeurs, resume, modele, modele_resolu, tokens_in, tokens_out, cout_usd, cree_par)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (piece_id, page) DO UPDATE SET
         dossier_id = excluded.dossier_id, envoyee = excluded.envoyee, motif_ecart = excluded.motif_ecart, nb_valeurs = excluded.nb_valeurs,
         resume = excluded.resume, modele = excluded.modele, modele_resolu = excluded.modele_resolu, tokens_in = excluded.tokens_in,
         tokens_out = excluded.tokens_out, cout_usd = excluded.cout_usd, cree_le = now(), cree_par = excluded.cree_par`,
      [pieceId, page, dossierId, a.envoyee, a.motif, a.nbValeurs, a.resume, a.modele, a.modeleResolu, a.tokensIn, a.tokensOut, a.coutUsd, a.par]);
    return true;
  } catch { return false; } // 42P01/42703 → non persisté (comportement d'avant : « jamais analysée » reste affiché, la valeur est écrite)
}

export interface LecturePageAffiche { page: number; envoyee: boolean; motif: string | null; nbValeurs: number; resume: string | null; coutUsd: number; creeLe: string | null }

/** Audit daté par pièce (clé = pieceId) pour l'affichage « déjà analysée le … ». Map vide si migration 195 absente. */
export async function lireLecturesPage(dossierId: number): Promise<Map<number, LecturePageAffiche[]>> {
  const m = new Map<number, LecturePageAffiche[]>();
  try {
    const { rows } = await query<{ piece_id: number; page: number; envoyee: boolean; motif_ecart: string | null; nb_valeurs: number; resume: string | null; cout_usd: string | number; cree_le: string | Date }>(
      `SELECT piece_id::int AS piece_id, page, envoyee, motif_ecart, nb_valeurs, resume, cout_usd, cree_le FROM permis_page_lecture WHERE dossier_id = $1 ORDER BY piece_id, page`, [dossierId]);
    for (const r of rows) {
      (m.get(r.piece_id) ?? m.set(r.piece_id, []).get(r.piece_id)!).push({
        page: r.page, envoyee: r.envoyee, motif: r.motif_ecart, nbValeurs: r.nb_valeurs, resume: r.resume, coutUsd: Number(r.cout_usd),
        creeLe: r.cree_le instanceof Date ? r.cree_le.toISOString() : (r.cree_le ? new Date(r.cree_le).toISOString() : null),
      });
    }
  } catch { /* 195 absente → aucun audit daté (« jamais analysée par image ») */ }
  return m;
}
