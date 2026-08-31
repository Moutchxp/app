/**
 * CASC-1 — MÉMOIRE du marqueur « dossier partiel » (IMPUR : base). Colonnes `partiel_*` sur `demande` (migration 177). ACTIF ⇔
 * partiel_le IS NOT NULL AND partiel_leve_le IS NULL.
 *
 * RÉSILIENCE : tant que 177 n'est pas appliquée, les colonnes n'existent pas → toute lecture renvoie « non suspendu » et toute
 * écriture est un NO-OP propre (code 42703 toléré). AUCUNE exception propagée : COMPORTEMENT ACTUEL PRÉSERVÉ, jamais un plantage.
 */
import { query } from '../db/client';
import { doitLeverAuto, dateButoirPartiel, type EtatPartiel, type OriginePartiel } from './dossierPartiel';

const estColonneAbsente = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { code?: string }).code === '42703';

/**
 * POSE le marqueur « dossier partiel », ou RAFRAÎCHIT les pièces manquantes s'il est DÉJÀ actif. NO-OP si 177 absente.
 *
 * 🔴 PART-F ① — BUTOIR FIXE : `partiel_le` (l'ancre de la PREMIÈRE réclamation, d'où dérive le butoir CADA CASC-2) NE BOUGE PLUS tant
 * que le marqueur est actif. Une 2e réclamation de pièces (nouvelle vague, relance PART-E, re-clic « demander pièces ») rafraîchit
 * SEULEMENT la liste des familles manquantes — jamais `partiel_le` — sinon la mairie repousserait l'échéance indéfiniment en envoyant
 * une pièce de temps en temps, et la saisine n'arriverait jamais. Seul un RÉ-ARMEMENT après une LEVÉE (dossier redevenu complet puis
 * de nouveau incomplet = nouveau cycle) repose une nouvelle ancre. Le CASE fait exactement cela, atomiquement.
 *
 * 🔴 CASC-2 — ANCRE CIVILE (`ancreCivile`, 'YYYY-MM-DD', optionnelle) : quand une relance est DÉCLARÉE hors outil (PART-3e), le butoir
 * CADA doit partir de la date d'envoi RÉELLE affirmée par Arno, pas de l'instant du clic. On ancre cette date civile à **12:00
 * Europe/Paris** — jamais minuit, jamais un `toISOString()` nu. Motif : `dateButoirPartiel` calcule en UTC et l'affichage est en
 * Europe/Paris ; une ancre en début/fin de journée glisse d'un jour selon le sens du décalage (c'est ce qui affichait le 05/10 au lieu
 * du 04/10). Midi est à plus de 2 h de toute frontière de jour dans les deux fuseaux, été comme hiver → le jour affiché = le jour saisi.
 * `AT TIME ZONE 'Europe/Paris'` gère le DST (CET/CEST). Absente (envoi outil / autres appelants) → `COALESCE` retombe sur `now()`,
 * comportement historique INCHANGÉ.
 */
export async function marquerDossierPartiel(demandeId: number, familles: readonly string[], origine: OriginePartiel, ancreCivile?: string | null): Promise<void> {
  try {
    await query(
      `UPDATE demande SET
         partiel_le      = CASE WHEN partiel_le IS NOT NULL AND partiel_leve_le IS NULL THEN partiel_le
                                ELSE COALESCE(($4::date + interval '12 hours') AT TIME ZONE 'Europe/Paris', now()) END,
         partiel_familles = $2,
         partiel_origine = CASE WHEN partiel_le IS NOT NULL AND partiel_leve_le IS NULL THEN partiel_origine ELSE $3 END,
         partiel_leve_le = NULL, partiel_leve_par = NULL, maj_le = now()
        WHERE id = $1`,
      [demandeId, [...familles], origine, ancreCivile ?? null]);
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
      // id::int — `demande.id` est bigint : sans cast, le driver pg renvoie une CHAÎNE, et le Set (clés string) ne matcherait
      //   jamais un `.has(number)` → estDemandeSuspendue toujours false (garde cascade + levée auto silencieusement défaites).
      `SELECT id::int AS id FROM demande WHERE id = ANY($1) AND partiel_le IS NOT NULL AND partiel_leve_le IS NULL`, [[...demandeIds]]);
    return new Set(rows.map((r) => r.id));
  } catch (e) { if (!estColonneAbsente(e)) throw e; return new Set(); }
}

/** true si LA demande est suspendue (garde unitaire de la cascade). false si 177 absente. */
export async function estDemandeSuspendue(demandeId: number): Promise<boolean> {
  return (await lireDemandesSuspendues([demandeId])).has(demandeId);
}

/**
 * CASC-2 — DATE BUTOIR prolongée avant saisine CADA, par demande à marqueur ACTIF : partiel_le + délai (mois + jours). Le calcul part
 * de partiel_le (la PREMIÈRE réclamation) via `dateButoirPartiel`. Map VIDE si 177 absente → aucune prolongation → éligibilité ordinaire.
 */
export async function lireButoirsPartiel(delaiMois: number, delaiJours: number): Promise<Map<number, Date>> {
  const m = new Map<number, Date>();
  try {
    const { rows } = await query<{ id: number; partiel_le: Date }>(
      // id::int : bigint → CHAÎNE sinon (cf. lireDemandesSuspendues) → Map clés string → `.get(number)` en miss → butoir CADA ignoré.
      `SELECT id::int AS id, partiel_le FROM demande WHERE partiel_le IS NOT NULL AND partiel_leve_le IS NULL`);
    for (const r of rows) m.set(r.id, dateButoirPartiel(new Date(r.partiel_le), delaiMois, delaiJours));
    return m;
  } catch (e) { if (!estColonneAbsente(e)) throw e; return m; } // 177 absente → aucune prolongation
}

/** CASC-4 — butoir CASC-2 d'UNE demande SI son marqueur « dossier partiel » est actif, sinon null (régime ordinaire / 177 absente). */
export async function butoirPartielActif(demandeId: number, delaiMois: number, delaiJours: number): Promise<Date | null> {
  return (await lireButoirsPartiel(delaiMois, delaiJours)).get(demandeId) ?? null;
}

/** État du marqueur ACTIF pour un lot de demandes (affichage « En cours »). Map VIDE si 177 absente → aucune suspension montrée. */
export async function lireEtatsPartiel(demandeIds: readonly number[]): Promise<Map<number, EtatPartiel>> {
  const m = new Map<number, EtatPartiel>();
  if (demandeIds.length === 0) return m;
  try {
    const { rows } = await query<{ id: number; le: string; familles: string[] | null; origine: OriginePartiel | null }>(
      // id::int : bigint → CHAÎNE sinon → Map clés string, or `chargerDemandesSuivi` fait `suspensions.get(d.id::int)` (nombre) →
      //   suspension null pour TOUT dossier partiel (En cours « En relance » invisible, permis piégé). C'est le défaut de FIX-2b.
      `SELECT id::int AS id, to_char(partiel_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS le, partiel_familles AS familles, partiel_origine AS origine
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
    // demande_id::int — `demande.id` (donc `demande_dossier.demande_id`) est bigint : sans cast, le driver pg renvoie une CHAÎNE, et
    //   estDemandeSuspendue interroge un Set<number> (id::int) → `.has('1794')` MANQUE → « pas suspendue » à tort → la levée auto ne
    //   partait JAMAIS (permis coincé en « En cours »). 4e occurrence de la classe FIX-2b, restée latente faute de test d'intégration.
    const { rows: dem } = await query<{ demande_id: number }>(
      `SELECT demande_id::int AS demande_id FROM demande_dossier WHERE dossier_id = $1 AND actif LIMIT 1`, [dossierId]);
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
