/**
 * Point d'entrée UNIQUE et idempotent du moteur de veille Sitadel (chantier S11a). Réutilisable par le CLI planifié
 * (`veille-run.ts`) et, plus tard, par une route HTTP à secret. NE crée AUCUN déclencheur. AUCUN ENVOI ; la seule requête
 * sortante est le téléchargement Sitadel (via la chaîne d'ingestion existante) et la lecture bon marché du millésime.
 *
 * Séquence (cf. étape 4 du chantier) :
 *   1) verrou `pg_try_advisory_lock` dédié — si un run tourne déjà → 'rien_a_faire' immédiat, SANS réseau ni écriture ;
 *   2) (déclencheur 'planifie', sans --forcer) garde `doitSExecuter` (auto_active + intervalle depuis le dernier succès) ;
 *   3) ligne `veille_run` 'en_cours' ;
 *   4) millésime distant par MÉTADONNÉES (bon marché) ; identique à la base et !forcer → 'rien_a_faire', AUCUN téléchargement ;
 *   5) sinon délégation à l'ingestion EXISTANTE (`ingererMillesime`, non réécrite) → compteurs réels ;
 *   6) purge des CSV selon `csv_retention_jours` UNIQUEMENT sur 'succes' (jamais sur 'rien_a_faire' ni 'echec') ;
 *   7) `finally` libère le verrou. Toute erreur est ÉCRITE en base (statut 'echec' + motif) AVANT d'être relancée.
 *
 * Les I/O sont injectables (`DepsVeille`) → concurrence et échec testables sans réseau ni base.
 */
import { readdir, stat } from 'node:fs/promises';
import type { PoolClient } from 'pg';
import { pool, query, withTransaction } from '../db/client';
import { chargerConfigVeille } from './veilleConfig';
import { ingererMillesime, millesimeDistantDido, DOSSIER_LOCAL, type CompteursIngestion } from './ingestionMillesime';
import {
  doitSExecuter, millesimeEstNouveau, fichiersCsvAPurger,
  type Declencheur, type StatutRun, type ConfigAuto, type RunVeille, type FichierCsv,
} from './planification';

/** Clé du verrou consultatif dédié à la veille Sitadel (constante fixe : un seul run à la fois, tous déclencheurs confondus). */
const CLE_VERROU = 776_920_011;

export interface OptionsVeille { declencheur: Declencheur; forcer?: boolean }
export interface ResultatVeille { statut: StatutRun; raison: string; runId: number | null; compteurs?: CompteursIngestion }

interface MajRun {
  statut: StatutRun;
  finiLe?: Date;
  millesimeDetecte?: string | null;
  millesimeIngere?: string | null;
  lignesLues?: number | null;
  dossiersRetenus?: number | null;
  dossiersNouveaux?: number | null;
  message?: string | null;
  erreur?: string | null;
}

/** Toutes les I/O du moteur, injectables pour les tests (concurrence / échec sans réseau ni base). */
export interface DepsVeille {
  maintenant(): Date;
  chargerConfig(): Promise<ConfigAuto & { csvRetentionJours: number }>;
  dernierSucces(): Promise<Date | null>;
  millesimeEnBase(): Promise<string | null>;
  acquerirVerrou(): Promise<boolean>;
  libererVerrou(): Promise<void>;
  insererRun(declencheur: Declencheur, demarreLe: Date): Promise<number>;
  finaliserRun(id: number, maj: MajRun): Promise<void>;
  millesimeDistant(): Promise<string>;
  ingerer(millesime: string): Promise<CompteursIngestion>;
  listerCsv(): Promise<FichierCsv[]>;
  supprimerFichiers(chemins: string[]): Promise<void>;
}

export async function executerVeille(opts: OptionsVeille, deps: DepsVeille = depsReelles()): Promise<ResultatVeille> {
  const forcer = opts.forcer ?? false;

  // 1) Verrou : un run déjà en cours → sortie immédiate, sans réseau ni écriture.
  if (!(await deps.acquerirVerrou())) {
    return { statut: 'rien_a_faire', raison: 'un run est déjà en cours (verrou pris) — sortie sans action', runId: null };
  }

  let runId: number | null = null;
  try {
    const config = await deps.chargerConfig();

    // 2) Garde d'automatisation pour les runs PLANIFIÉS (les 'manuel'/'api' et --forcer passent outre). Le drapeau de
    //    demande manuelle est prioritaire (cf. doitSExecuter) : s'il est posé, le run devient 'manuel'.
    let declencheur = opts.declencheur;
    if (opts.declencheur === 'planifie' && !forcer) {
      const decision = doitSExecuter(await deps.dernierSucces(), deps.maintenant(), config);
      if (!decision.executer) return { statut: 'rien_a_faire', raison: decision.raison, runId: null };
      declencheur = decision.declencheur; // 'manuel' si demande en attente, sinon 'planifie'
    }

    // 3) Ligne 'en_cours' + REMISE À NULL du drapeau, dans la MÊME transaction (un plantage ne doit pas laisser une
    //    demande manuelle qui se rejoue indéfiniment).
    runId = await deps.insererRun(declencheur, deps.maintenant());

    // 4) Millésime distant (bon marché) vs base. ⚠️ Si l'appel DiDo échoue (réseau/format/champ absent), l'exception
    //    remonte au catch → statut 'echec' : SURTOUT PAS de repli vers l'ingestion complète « au cas où ». Un moteur qui,
    //    en panne réseau, lance le travail lourd (880 Mo + UPSERT) serait dangereux (re-téléchargements en boucle).
    const distant = await deps.millesimeDistant();
    const nouveau = millesimeEstNouveau(await deps.millesimeEnBase(), distant);
    if (!nouveau.nouveau && !forcer) {
      await deps.finaliserRun(runId, { statut: 'rien_a_faire', finiLe: deps.maintenant(), millesimeDetecte: distant, message: nouveau.raison });
      return { statut: 'rien_a_faire', raison: nouveau.raison, runId };
    }

    // 5) Ingestion du millésime DÉTECTÉ (non plus une constante figée) → compteurs réels ; base = distant après succès.
    const c = await deps.ingerer(distant);

    // 6) Purge des CSV — UNIQUEMENT ici (chemin de succès) et JAMAIS le millésime qu'on vient d'ingérer (= le cache
    //    courant, ce qui rend le prochain re-run gratuit). Ne vise que les millésimes ANTÉRIEURS au-delà de la rétention.
    const aPurger = fichiersCsvAPurger(await deps.listerCsv(), deps.maintenant(), config.csvRetentionJours, c.millesime);
    if (aPurger.length > 0) await deps.supprimerFichiers(aPurger);

    const message = `millésime ${c.millesime} ingéré : ${c.lignesLues} lues, ${c.dossiersRetenus} retenus, ${c.dossiersNouveaux} nouveaux`
      + (aPurger.length > 0 ? ` · ${aPurger.length} CSV purgé(s)` : ` · CSV conservés (rétention ${config.csvRetentionJours} j)`);
    await deps.finaliserRun(runId, {
      statut: 'succes', finiLe: deps.maintenant(), millesimeDetecte: distant, millesimeIngere: c.millesime,
      lignesLues: c.lignesLues, dossiersRetenus: c.dossiersRetenus, dossiersNouveaux: c.dossiersNouveaux, message,
    });
    return { statut: 'succes', raison: message, runId, compteurs: c };
  } catch (e) {
    // Trace lisible AVANT de relancer ; les CSV ne sont PAS purgés (on n'atteint pas l'étape 6).
    const motif = e instanceof Error ? e.message : String(e);
    if (runId !== null) await deps.finaliserRun(runId, { statut: 'echec', finiLe: deps.maintenant(), erreur: motif });
    throw e;
  } finally {
    // 7) Le verrou est TOUJOURS libéré, même sur plantage.
    await deps.libererVerrou();
  }
}

// ── Implémentations RÉELLES (production) ─────────────────────────────────────
function depsReelles(): DepsVeille {
  // Le verrou consultatif est SESSION-scoped : il doit être pris ET rendu sur la MÊME connexion → client dédié tenu
  // pendant tout le run (les autres requêtes passent par le pool).
  let clientVerrou: PoolClient | null = null;
  return {
    maintenant: () => new Date(),
    chargerConfig: async () => {
      const c = await chargerConfigVeille();
      return { autoActive: c.autoActive, autoIntervalleHeures: c.autoIntervalleHeures, csvRetentionJours: c.csvRetentionJours, runDemandeLe: c.runDemandeLe };
    },
    dernierSucces: async () => {
      const { rows } = await query<{ fini_le: Date | null }>(`SELECT max(fini_le) AS fini_le FROM veille_run WHERE statut = 'succes'`);
      return rows[0]?.fini_le ?? null;
    },
    millesimeEnBase: async () => {
      const { rows } = await query<{ code: string }>(`SELECT code FROM sitadel_millesime ORDER BY code DESC LIMIT 1`);
      return rows[0]?.code ?? null;
    },
    acquerirVerrou: async () => {
      clientVerrou = await pool.connect();
      const { rows } = await clientVerrou.query<{ ok: boolean }>('SELECT pg_try_advisory_lock($1) AS ok', [CLE_VERROU]);
      if (!rows[0]?.ok) { clientVerrou.release(); clientVerrou = null; return false; }
      return true;
    },
    libererVerrou: async () => {
      if (clientVerrou === null) return;
      try { await clientVerrou.query('SELECT pg_advisory_unlock($1)', [CLE_VERROU]); }
      finally { clientVerrou.release(); clientVerrou = null; }
    },
    insererRun: async (declencheur, demarreLe) => {
      // Transaction ATOMIQUE : consommer le drapeau (run_demande_le → NULL) ET créer la ligne 'en_cours' ensemble, pour
      // qu'un plantage ne laisse jamais une demande manuelle armée qui se rejouerait indéfiniment.
      return withTransaction(async (q) => {
        await q(`UPDATE config_veille SET run_demande_le = NULL WHERE id = 1`);
        const { rows } = await q<{ id: number }>(
          `INSERT INTO veille_run (declencheur, demarre_le, statut) VALUES ($1, $2, 'en_cours') RETURNING id`,
          [declencheur, demarreLe],
        );
        return rows[0].id;
      });
    },
    finaliserRun: async (id, m) => {
      await query(
        `UPDATE veille_run SET statut = $2, fini_le = $3, millesime_detecte = $4, millesime_ingere = $5,
           lignes_lues = $6, dossiers_retenus = $7, dossiers_nouveaux = $8, message = $9, erreur = $10 WHERE id = $1`,
        [id, m.statut, m.finiLe ?? null, m.millesimeDetecte ?? null, m.millesimeIngere ?? null,
          m.lignesLues ?? null, m.dossiersRetenus ?? null, m.dossiersNouveaux ?? null, m.message ?? null, m.erreur ?? null],
      );
    },
    millesimeDistant: () => millesimeDistantDido(),
    ingerer: (millesime) => ingererMillesime(millesime),
    listerCsv: async () => {
      // Tous les CSV du dossier local, TOUS MILLÉSIMES confondus (nom `X.AAAA-MM.csv`) — la purge distinguera ensuite
      // le millésime courant (protégé) des antérieurs.
      let noms: string[];
      try { noms = await readdir(DOSSIER_LOCAL); } catch { return []; }
      const out: FichierCsv[] = [];
      for (const nom of noms) {
        const m = /\.(\d{4}-\d{2})\.csv$/.exec(nom);
        if (!m) continue;
        const chemin = `${DOSSIER_LOCAL}/${nom}`;
        try { const s = await stat(chemin); out.push({ chemin, mtime: s.mtime, millesime: m[1] }); } catch { /* disparu entre-temps → ignoré */ }
      }
      return out;
    },
    supprimerFichiers: async (chemins) => {
      const { rm } = await import('node:fs/promises');
      for (const chemin of chemins) await rm(chemin, { force: true });
    },
  };
}

/** Dernier run journalisé (pour l'option `--statut` du CLI et l'écran d'admin). `null` si aucun run. */
export async function dernierRun(): Promise<RunVeille | null> {
  const { rows } = await query<{
    declencheur: string; statut: string; demarre_le: string | null; fini_le: string | null;
    millesime_detecte: string | null; millesime_ingere: string | null; lignes_lues: number | null;
    dossiers_retenus: number | null; dossiers_nouveaux: number | null; message: string | null; erreur: string | null;
  }>(
    `SELECT declencheur, statut, demarre_le::text AS demarre_le, fini_le::text AS fini_le,
            millesime_detecte, millesime_ingere, lignes_lues, dossiers_retenus, dossiers_nouveaux, message, erreur
     FROM veille_run ORDER BY demarre_le DESC LIMIT 1`,
  );
  const r = rows[0];
  if (!r) return null;
  return {
    declencheur: r.declencheur, statut: r.statut, demarreLe: r.demarre_le, finiLe: r.fini_le,
    millesimeDetecte: r.millesime_detecte, millesimeIngere: r.millesime_ingere, lignesLues: r.lignes_lues,
    dossiersRetenus: r.dossiers_retenus, dossiersNouveaux: r.dossiers_nouveaux, message: r.message, erreur: r.erreur,
  };
}

/** Les `limite` derniers runs (récent → ancien), pour l'historique de l'écran d'administration. */
export async function historiqueRuns(limite: number): Promise<RunVeille[]> {
  const n = Math.max(1, Math.min(200, Math.trunc(limite)));
  const { rows } = await query<{
    declencheur: string; statut: string; demarre_le: string | null; fini_le: string | null;
    millesime_detecte: string | null; millesime_ingere: string | null; lignes_lues: number | null;
    dossiers_retenus: number | null; dossiers_nouveaux: number | null; message: string | null; erreur: string | null;
  }>(
    `SELECT declencheur, statut, demarre_le::text AS demarre_le, fini_le::text AS fini_le,
            millesime_detecte, millesime_ingere, lignes_lues, dossiers_retenus, dossiers_nouveaux, message, erreur
     FROM veille_run ORDER BY demarre_le DESC LIMIT $1`, [n],
  );
  return rows.map((r) => ({
    declencheur: r.declencheur, statut: r.statut, demarreLe: r.demarre_le, finiLe: r.fini_le,
    millesimeDetecte: r.millesime_detecte, millesimeIngere: r.millesime_ingere, lignesLues: r.lignes_lues,
    dossiersRetenus: r.dossiers_retenus, dossiersNouveaux: r.dossiers_nouveaux, message: r.message, erreur: r.erreur,
  }));
}

/** Date (fini_le) du dernier run RÉUSSI — pour calculer le prochain passage. `null` si aucun succès. */
export async function dernierSuccesLe(): Promise<Date | null> {
  const { rows } = await query<{ fini_le: Date | null }>(`SELECT max(fini_le) AS fini_le FROM veille_run WHERE statut = 'succes'`);
  return rows[0]?.fini_le ?? null;
}

/** Date (demarre_le) du dernier passage QUEL QUE SOIT le statut — pour détecter un ordonnanceur absent. `null` si aucun. */
export async function dernierPassageLe(): Promise<Date | null> {
  const { rows } = await query<{ d: Date | null }>(`SELECT max(demarre_le) AS d FROM veille_run`);
  return rows[0]?.d ?? null;
}
