import { query } from '../db/client';
import { statutCourantParCleabs, actionsAutoStatut, estRecouvertParEmprise, type LigneStatutPolygone, type LigneStatut, type OrigineStatut, type PolygoneRecouvert } from './polygoneStatut';
import { lireSeuilRecouvrementEmprisePct } from './rattachementConfig'; // RATT-5 — seuil de recouvrement lu au runtime (config_veille), jamais en dur

/**
 * RATT-1 (2) — ADAPTATEUR IMPUR du statut décidé d'un polygone existant (préservé/détruit). Table APPEND-ONLY `permis_polygone_statut`
 * (migration 164). 🔴 La source IGN `batiment.etat_de_l_objet` n'est JAMAIS écrite ni effacée ici : on lit son SNAPSHOT au moment de
 * la décision et on l'écrit dans NOTRE table, à côté. Résilient : table absente (164 non appliquée) → lecture vide / écriture refusée
 * avec motif clair. AUCUNE écriture moteur (verdict/altitude/rattachement).
 */
export type ResultatStatut = { ok: true } | { ok: false; motif: string; tableAbsente?: boolean };

/** PostgreSQL 42P01 = undefined_table (migration non appliquée). */
function estTableAbsente(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '42P01';
}
/** PostgreSQL 42703 = undefined_column (migration 165 non appliquée : colonne `origine` absente). */
function estColonneAbsente(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '42703';
}
/** PostgreSQL 23514 = check_violation (migration 167 non appliquée : 'mixte'/'auto_mixte' pas encore admis par le CHECK). */
function estContrainteViolee(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === '23514';
}

/** RATT-6 — statut COURANT (dernière ligne) d'un cleabs dans un dossier ; `null` si aucune ligne ou table absente. Sert au refus serveur
 *  d'une saisie manuelle sur un polygone 'mixte' (fait géométrique non modifiable). Lecture SEULE de NOTRE table de décision. */
async function statutCourantDe(dossierId: number, cleabs: string): Promise<LigneStatut | null> {
  try {
    const { rows } = await query<{ statut: LigneStatut }>(
      `SELECT statut FROM permis_polygone_statut WHERE dossier_id = $1 AND cleabs = $2 ORDER BY decide_le DESC LIMIT 1`, [dossierId, cleabs]);
    return rows[0]?.statut ?? null;
  } catch (e) { if (estTableAbsente(e)) return null; throw e; }
}

/** Toutes les lignes du registre pour un dossier (ordre quelconque ; la logique de « courant » est PURE, cf. polygoneStatut). `[]` si table absente.
 *  RATT-2 — lit `origine` si la colonne existe (migration 165) ; sinon repli SANS elle → `origine = null` (traité comme « non-auto », jamais révoqué). */
export async function lireStatutsPolygones(dossierId: number): Promise<LigneStatutPolygone[]> {
  try {
    const { rows } = await query<{ cleabs: string; statut: LigneStatutPolygone['statut']; etat: string | null; par: string | null; le: string; origine: OrigineStatut | null }>(
      `SELECT cleabs, statut, etat_bdtopo_au_moment AS etat, decide_par AS par, decide_le AS le, origine
         FROM permis_polygone_statut WHERE dossier_id = $1`, [dossierId]);
    return rows.map((r) => ({ cleabs: r.cleabs, statut: r.statut, etatBdtopoAuMoment: r.etat, decidePar: r.par, decideLe: new Date(r.le).toISOString(), origine: r.origine ?? null }));
  } catch (e) {
    if (estTableAbsente(e)) return [];
    if (estColonneAbsente(e)) { // migration 165 non appliquée : on relit sans la colonne, origine = null.
      const { rows } = await query<{ cleabs: string; statut: LigneStatutPolygone['statut']; etat: string | null; par: string | null; le: string }>(
        `SELECT cleabs, statut, etat_bdtopo_au_moment AS etat, decide_par AS par, decide_le AS le
           FROM permis_polygone_statut WHERE dossier_id = $1`, [dossierId]);
      return rows.map((r) => ({ cleabs: r.cleabs, statut: r.statut, etatBdtopoAuMoment: r.etat, decidePar: r.par, decideLe: new Date(r.le).toISOString(), origine: null }));
    }
    throw e;
  }
}

/**
 * RATT-5 — polygones BD TOPO « recouverts » par l'emprise PROJETÉE (union des emprises tracées du dossier) AVEC leur TAUX de
 * recouvrement (part de la surface du polygone sous l'emprise, en %). Un polygone n'est retenu que si son taux ATTEINT LE SEUIL lu
 * en config (`lireSeuilRecouvrementEmprisePct`, défaut 50 %) : un chevauchement marginal ne vaut plus « détruit » (avant RATT-5, tout
 * `ST_Intersects` non vide comptait). `[]` si aucune emprise ou table absente.
 *
 * 🔴 INDEX PRÉSERVÉ : le filtre grossier reste `b.geom && emp.g` sur la géométrie BRUTE (jamais ST_Force2D autour du prédicat indexé) —
 *   EXPLAIN confirme l'Index Scan GiST `batiment_geom_geom_idx`. ST_Force2D reste dans le prédicat exact (ST_Intersects) et dans les
 *   calculs d'AIRE (Lambert-93, la 3D fausserait l'aire) — jamais retiré. Emprises UNIONnées (couverture totale, jamais par-emprise).
 */
export async function polygonesRecouvertsParEmprise(dossierId: number): Promise<PolygoneRecouvert[]> {
  try {
    const { rows } = await query<{ cleabs: string; taux: number | string }>(
      `WITH emp AS (SELECT ST_Union(ST_Force2D(geom)) AS g FROM permis_emprise_reconstruite WHERE dossier_id = $1 AND geom IS NOT NULL)
       SELECT b.cleabs,
              100 * ST_Area(ST_Intersection(ST_Force2D(b.geom), emp.g)) / NULLIF(ST_Area(ST_Force2D(b.geom)), 0) AS taux
         FROM batiment b, emp
        WHERE emp.g IS NOT NULL AND b.cleabs IS NOT NULL AND b.geom && emp.g AND ST_Intersects(ST_Force2D(b.geom), emp.g)`, [dossierId]);
    const { seuilPct } = await lireSeuilRecouvrementEmprisePct(); // seuil au runtime (config_veille) — jamais codé en dur
    return rows
      .map((r) => ({ cleabs: r.cleabs, tauxPct: Number(r.taux) }))
      .filter((r) => Number.isFinite(r.tauxPct) && estRecouvertParEmprise(r.tauxPct, seuilPct));
  } catch (e) { if (estTableAbsente(e)) return []; throw e; }
}

/**
 * POSER une décision de statut (append-only : une nouvelle LIGNE). `statut` ∈ 'preserve' | 'detruit' | 'mixte' | 'revoque'. On lit le
 * SNAPSHOT de la source IGN (`batiment.etat_de_l_objet`) au moment — jamais réécrit. RATT-2 : `origine` distingue saisie humaine d'un
 * automatisme. RATT-6 :
 *  · GARDE SERVEUR — une SAISIE manuelle sur un polygone dont le statut COURANT est 'mixte' est REFUSÉE (fait géométrique non
 *    modifiable), pas seulement grisée côté UI ;
 *  · RÉSILIENCE migration 167 — si 'mixte'/'auto_mixte' n'est pas encore admis par le CHECK (23514), on REPLIE proprement sur l'ancien
 *    comportement ('detruit'/'auto_recouvrement' = détruit ENTIER), sans crash ni erreur remontée. La ligne existe, l'app tourne.
 */
export async function poserStatutPolygone(dossierId: number, cleabs: string, statut: LigneStatut, par: string | null, origine: OrigineStatut = 'saisie'): Promise<ResultatStatut> {
  if (!cleabs || cleabs.trim() === '') return { ok: false, motif: 'polygone invalide' };
  // RATT-6 — refus SERVEUR d'une saisie manuelle sur un 'mixte' (le fait géométrique prime ; l'automatisme, lui, réaligne son propre statut).
  if (origine === 'saisie' && (await statutCourantDe(dossierId, cleabs)) === 'mixte') {
    return { ok: false, motif: 'statut « partiellement détruit » non modifiable : c’est un fait géométrique (déduit du recouvrement), pas une décision' };
  }
  // SNAPSHOT de la source IGN au moment (lecture SEULE de batiment) — la source n'est jamais modifiée.
  const src = await query<{ etat: string | null }>(`SELECT etat_de_l_objet AS etat FROM batiment WHERE cleabs = $1 LIMIT 1`, [cleabs]);
  const etatMoment = src.rows[0]?.etat ?? null;
  const inserer = async (st: LigneStatut, orig: OrigineStatut) =>
    query(`INSERT INTO permis_polygone_statut (dossier_id, cleabs, statut, etat_bdtopo_au_moment, decide_par, origine)
           VALUES ($1, $2, $3, $4, $5, $6)`, [dossierId, cleabs, st, etatMoment, par, orig]);
  try {
    await inserer(statut, origine);
    return { ok: true };
  } catch (e) {
    if (estTableAbsente(e)) return { ok: false, motif: 'statut indisponible (migration 164 non appliquée)', tableAbsente: true };
    if (estColonneAbsente(e)) { // migration 165 non appliquée : on insère SANS origine.
      await query(
        `INSERT INTO permis_polygone_statut (dossier_id, cleabs, statut, etat_bdtopo_au_moment, decide_par)
         VALUES ($1, $2, $3, $4, $5)`, [dossierId, cleabs, statut === 'mixte' ? 'detruit' : statut, etatMoment, par]);
      return { ok: true };
    }
    if (estContrainteViolee(e) && (statut === 'mixte' || origine === 'auto_mixte')) {
      // migration 167 non appliquée : 'mixte'/'auto_mixte' hors CHECK → REPLI sur l'ancien comportement (détruit entier), sans crash.
      console.warn('[polygoneStatut] migration 167 absente : « mixte » replié en « detruit » entier', { dossierId, cleabs });
      await inserer(statut === 'mixte' ? 'detruit' : statut, origine === 'auto_mixte' ? 'auto_recouvrement' : origine);
      return { ok: true };
    }
    throw e;
  }
}

/**
 * RATT-2 — ORCHESTRATION (impure) des écritures AUTOMATIQUES de statut, à appeler APRÈS toute mutation d'emprise (POST : enregistrement /
 * adoption / retouche / suppression), JAMAIS en GET. Best-effort : lit les polygones recouverts + le statut courant, calcule les actions
 * PURES (cf. actionsAutoStatut), puis les insère. Ne relève JAMAIS d'exception au caller (une écriture auto ratée ne doit pas faire échouer
 * l'enregistrement d'emprise) ; résilient aux migrations 164/165 non appliquées. Ne touche NI la source BD TOPO, NI une décision humaine.
 */
export async function appliquerAutoStatut(dossierId: number, par: string | null): Promise<void> {
  try {
    const [recouverts, lignes, { seuilPct }] = await Promise.all([
      polygonesRecouvertsParEmprise(dossierId), lireStatutsPolygones(dossierId), lireSeuilRecouvrementEmprisePct(),
    ]);
    const statuts = statutCourantParCleabs(lignes);
    // RATT-6 — le statut auto est GÉOMÉTRIQUE : 'detruit' (total) ou 'mixte' (partiel) selon le taux vs le seuil ; révocation si plus recouvert.
    for (const a of actionsAutoStatut(recouverts, seuilPct, statuts)) {
      await poserStatutPolygone(dossierId, a.cleabs, a.statut, par, a.origine);
    }
  } catch { /* best-effort : l'automatisme de statut ne doit jamais faire échouer la mutation d'emprise appelante. */ }
}
