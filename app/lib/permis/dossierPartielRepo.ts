/**
 * CASC-1 — MÉMOIRE du marqueur « dossier partiel » (IMPUR : base). Colonnes `partiel_*` sur `demande` (migration 177). ACTIF ⇔
 * partiel_le IS NOT NULL AND partiel_leve_le IS NULL.
 *
 * RÉSILIENCE : tant que 177 n'est pas appliquée, les colonnes n'existent pas → toute lecture renvoie « non suspendu » et toute
 * écriture est un NO-OP propre (code 42703 toléré). AUCUNE exception propagée : COMPORTEMENT ACTUEL PRÉSERVÉ, jamais un plantage.
 */
import { query } from '../db/client';
import { doitLeverAuto, type EtatPartiel, type OriginePartiel } from './dossierPartiel';

const estColonneAbsente = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { code?: string }).code === '42703';

/** POSE / RÉ-ARME le marqueur (les deux chemins de réclamation). Ré-arme même s'il avait été levé (partiel_leve_le → NULL). NO-OP si 177 absente. */
export async function marquerDossierPartiel(demandeId: number, familles: readonly string[], origine: OriginePartiel): Promise<void> {
  try {
    await query(
      `UPDATE demande SET partiel_le = now(), partiel_familles = $2, partiel_origine = $3, partiel_leve_le = NULL, partiel_leve_par = NULL, maj_le = now()
        WHERE id = $1`,
      [demandeId, [...familles], origine]);
  } catch (e) { if (!estColonneAbsente(e)) throw e; } // 177 absente → pas de marqueur (comportement actuel)
}

/** LÈVE le marqueur actif (auto « complet » ou manuel). Renvoie true si une ligne active a été levée. NO-OP/false si 177 absente. */
export async function leverDossierPartiel(demandeId: number, par: string): Promise<boolean> {
  try {
    const r = await query(
      `UPDATE demande SET partiel_leve_le = now(), partiel_leve_par = $2, maj_le = now()
        WHERE id = $1 AND partiel_le IS NOT NULL AND partiel_leve_le IS NULL`,
      [demandeId, par]);
    return (r.rowCount ?? 0) > 0;
  } catch (e) { if (!estColonneAbsente(e)) throw e; return false; }
}

/** État du marqueur ACTIF d'une demande (pour l'affichage), ou null (non suspendue / 177 absente). */
export async function lireEtatPartiel(demandeId: number): Promise<EtatPartiel | null> {
  try {
    const { rows } = await query<{ le: string; familles: string[] | null; origine: OriginePartiel | null }>(
      `SELECT to_char(partiel_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS le, partiel_familles AS familles, partiel_origine AS origine
         FROM demande WHERE id = $1 AND partiel_le IS NOT NULL AND partiel_leve_le IS NULL`, [demandeId]);
    const r = rows[0];
    if (!r) return null;
    return { le: r.le, familles: r.familles ?? [], origine: r.origine ?? 'outil' };
  } catch (e) { if (!estColonneAbsente(e)) throw e; return null; }
}

/** Sous-ensemble SUSPENDU parmi des demandes (garde de la cascade, en lot). Ensemble VIDE si 177 absente → cascade inchangée. */
export async function lireDemandesSuspendues(demandeIds: readonly number[]): Promise<Set<number>> {
  if (demandeIds.length === 0) return new Set();
  try {
    const { rows } = await query<{ id: number }>(
      `SELECT id FROM demande WHERE id = ANY($1) AND partiel_le IS NOT NULL AND partiel_leve_le IS NULL`, [[...demandeIds]]);
    return new Set(rows.map((r) => r.id));
  } catch (e) { if (!estColonneAbsente(e)) throw e; return new Set(); }
}

/** true si LA demande est suspendue (garde unitaire de la cascade). false si 177 absente. */
export async function estDemandeSuspendue(demandeId: number): Promise<boolean> {
  return (await lireDemandesSuspendues([demandeId])).has(demandeId);
}

/** État du marqueur ACTIF pour un lot de demandes (affichage « En cours »). Map VIDE si 177 absente → aucune suspension montrée. */
export async function lireEtatsPartiel(demandeIds: readonly number[]): Promise<Map<number, EtatPartiel>> {
  const m = new Map<number, EtatPartiel>();
  if (demandeIds.length === 0) return m;
  try {
    const { rows } = await query<{ id: number; le: string; familles: string[] | null; origine: OriginePartiel | null }>(
      `SELECT id, to_char(partiel_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS le, partiel_familles AS familles, partiel_origine AS origine
         FROM demande WHERE id = ANY($1) AND partiel_le IS NOT NULL AND partiel_leve_le IS NULL`, [[...demandeIds]]);
    for (const r of rows) m.set(r.id, { le: r.le, familles: r.familles ?? [], origine: r.origine ?? 'outil' });
    return m;
  } catch (e) { if (!estColonneAbsente(e)) throw e; return m; }
}

/**
 * LEVÉE AUTOMATIQUE évaluée à la (re)mémorisation d'un diagnostic (appelée par `enregistrerCompletude`). À partir d'un dossier
 * recalculé : trouve la demande ACTIVE qui le porte ; si elle est suspendue, lit le diagnostic mémorisé de TOUS ses dossiers actifs
 * et, s'ils sont tous « complet », lève le marqueur (auto:complet). Best-effort, résilient (177/174 absentes → ne fait rien).
 */
export async function evaluerLeveeAutoPartiel(dossierId: number): Promise<void> {
  try {
    const { rows: dem } = await query<{ demande_id: number }>(
      `SELECT demande_id FROM demande_dossier WHERE dossier_id = $1 AND actif LIMIT 1`, [dossierId]);
    const demandeId = dem[0]?.demande_id;
    if (demandeId === undefined) return;                 // dossier sans demande active → rien
    if (!(await estDemandeSuspendue(demandeId))) return; // pas suspendue → rien à lever (et on évite les lectures coûteuses)

    const { rows: dossiers } = await query<{ dossier_id: number }>(
      `SELECT dossier_id FROM demande_dossier WHERE demande_id = $1 AND actif`, [demandeId]);
    const { lireCompletude } = await import('./completudeRepo');   // dynamique : évite tout cycle statique avec completudeRepo
    const { resumeCompletude } = await import('./completudeResume');
    const complets: (boolean | null)[] = [];
    for (const d of dossiers) {
      const c = await lireCompletude(d.dossier_id);
      complets.push(c === null ? null : resumeCompletude(c).statut === 'complet');
    }
    if (doitLeverAuto(complets)) await leverDossierPartiel(demandeId, 'auto:complet');
  } catch (e) { if (!estColonneAbsente(e)) throw e; } // toute colonne absente → NO-OP ; autre erreur → remonte (best-effort côté appelant)
}
