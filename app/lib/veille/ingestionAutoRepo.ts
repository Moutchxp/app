// PAS de `server-only` : ce module est atteint par le CLI `veille:run` (executerVeille → ingestionAuto). Comme les autres repos
// de veille, il vit côté serveur ET côté script — le garde F2 interdit qu'un CLI touche un module `server-only` (incident 09/08).
import { spawn } from 'node:child_process';
import { statfs } from 'node:fs/promises';
import { query } from '../db/client';
import { importerAnnuaireDila } from '../sitadel/dilaIngest';
import { importerAnnuaireCada } from '../sitadel/pradaIngest';
import { millesimeDistantDido, ingererMillesime } from '../sitadel/ingestionMillesime';
import {
  SOURCES_AUTOMATISABLES, estAutomatisable, validerArgsCadastre,
  type ConfigIngestionAuto, type DepsIngestionAuto, type SourceAuto,
} from './ingestionAuto';

/**
 * FRAÎCHEUR / F6 — I/O de l'ingestion auto (server-only INTERDIT, cf. en-tête). Tout est RÉSILIENT à l'ordre d'application :
 * migration 143 absente → config tout-false + journal réputé absent (to_regclass) → AUCUNE ingestion possible.
 */

type Requete = <R>(text: string, params?: unknown[]) => Promise<{ rows: R[] }>;
const q: Requete = <R>(text: string, params?: unknown[]) => query(text, params) as unknown as Promise<{ rows: R[] }>;

/** Colonne d'interrupteur par source (identifiant FIXE, jamais interpolé depuis une entrée utilisateur au-delà de la whitelist). */
const COLONNE_ACTIF: Record<SourceAuto, string> = {
  dila: 'dila_auto_active', prada: 'prada_auto_active', sitadel: 'sitadel_auto_active', cadastre: 'cadastre_auto_active',
};

const CONFIG_DEFAUT: ConfigIngestionAuto = {
  fenetre: { debut: 3, fin: 6 },
  actifs: { dila: false, prada: false, sitadel: false, cadastre: false },
};

const moisEnDate = (code: string | null | undefined): string | null =>
  code && /^\d{4}-\d{2}$/.test(code) ? `${code}-01` : code && /^\d{4}-\d{2}-\d{2}/.test(code) ? code.slice(0, 10) : null;

/** Config isolée : migration 143 absente (colonnes manquantes) → défauts SÛRS (tout désactivé, fenêtre 3-6). */
export async function lireConfigIngestionAuto(req: Requete = q): Promise<ConfigIngestionAuto> {
  try {
    const { rows } = await req<{
      dila_auto_active: boolean; prada_auto_active: boolean; sitadel_auto_active: boolean; cadastre_auto_active: boolean;
      ingestion_auto_fenetre_debut: number; ingestion_auto_fenetre_fin: number;
    }>(`SELECT dila_auto_active, prada_auto_active, sitadel_auto_active, cadastre_auto_active,
               ingestion_auto_fenetre_debut, ingestion_auto_fenetre_fin FROM config_veille WHERE id = 1`);
    const r = rows[0];
    if (!r) return CONFIG_DEFAUT;
    return {
      fenetre: { debut: Number(r.ingestion_auto_fenetre_debut) || 3, fin: Number(r.ingestion_auto_fenetre_fin) || 6 },
      actifs: {
        dila: r.dila_auto_active === true, prada: r.prada_auto_active === true,
        sitadel: r.sitadel_auto_active === true, cadastre: r.cadastre_auto_active === true,
      },
    };
  } catch (e) {
    console.error('[ingestion-auto] config indisponible → tout désactivé (migration 143 pas appliquée ?)', e);
    return CONFIG_DEFAUT; // REPLI SÛR : tout false → aucune ingestion
  }
}

/** Sources automatisables ayant une mise à jour disponible (édition détectée plus récente que le millésime en base). Lean : lit
 *  source_detection + les millésimes de base, sans dépendre du repo server-only de F1. Table absente / erreur → ensemble VIDE. */
export async function actionnablesAuto(req: Requete = q): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const det = await req<{ source: string; d: string | null }>(
      `SELECT source, to_char(date_distante, 'YYYY-MM-DD') AS d FROM source_detection
        WHERE succes = true AND date_distante IS NOT NULL AND source = ANY($1)`,
      [[...SOURCES_AUTOMATISABLES]],
    );
    if (det.rows.length === 0) return out;
    const base: Record<string, string | null> = {
      dila: (await req<{ d: string | null }>(`SELECT to_char(max(date_fichier), 'YYYY-MM-DD') AS d FROM dila_millesime`)).rows[0]?.d ?? null,
      // `cadastre_millesime.millesime` est TEXT déjà au format « YYYY-MM-DD » → lecture DIRECTE (to_char(text) n'existe pas en SQL).
      cadastre: (await req<{ d: string | null }>(`SELECT max(millesime) AS d FROM cadastre_millesime`)).rows[0]?.d ?? null,
      prada: moisEnDate((await req<{ code: string }>(`SELECT code FROM prada_millesime ORDER BY importe_le DESC NULLS LAST LIMIT 1`)).rows[0]?.code),
      sitadel: moisEnDate((await req<{ code: string }>(`SELECT code FROM sitadel_millesime ORDER BY telecharge_a DESC NULLS LAST LIMIT 1`)).rows[0]?.code),
    };
    for (const r of det.rows) {
      const dist = r.d;
      const b = base[r.source] ?? null;
      if (dist && b && dist > b) out.add(r.source);
    }
  } catch (e) {
    console.error('[ingestion-auto] calcul des sources actionnables impossible → aucune', e);
  }
  return out;
}

/** La table de trace existe-t-elle ? (migration 143 appliquée). to_regclass ne poisonne pas la transaction. */
async function journalExiste(req: Requete = q): Promise<boolean> {
  try {
    const { rows } = await req<{ t: string | null }>(`SELECT to_regclass('public.ingestion_auto_journal') AS t`);
    return rows[0]?.t != null;
  } catch {
    return false;
  }
}

/** Déjà tentée cette nuit ? Table absente → TRUE (bloque : sans trace possible, on n'exécute pas — double filet avec config off). */
export async function dejaTenteeCetteNuit(source: string, nuit: string, req: Requete = q): Promise<boolean> {
  if (!(await journalExiste(req))) return true;
  const { rows } = await req<{ n: number }>(
    `SELECT count(*)::int AS n FROM ingestion_auto_journal WHERE source = $1 AND nuit_du = $2`, [source, nuit],
  );
  return (rows[0]?.n ?? 0) > 0;
}

/** Octets libres réels sur le volume du dépôt, ou null si indéterminable (traité comme insuffisant par l'orchestrateur). */
export async function disqueLibre(): Promise<number | null> {
  try {
    const s = await statfs(process.cwd());
    return Number(s.bavail) * Number(s.bsize);
  } catch (e) {
    console.error('[ingestion-auto] statfs impossible → disque réputé insuffisant', e);
    return null;
  }
}

export async function journaliserRefus(source: string, nuit: string, motif: string, detail: string, req: Requete = q): Promise<void> {
  try {
    await req(
      `INSERT INTO ingestion_auto_journal (source, nuit_du, fini_le, resultat, motif, erreur) VALUES ($1, $2, now(), 'refus', $3, $4)`,
      [source, nuit, motif, detail],
    );
  } catch (e) { console.error('[ingestion-auto] journal refus impossible', e); }
}

export async function journaliserDebut(source: string, nuit: string, debut: Date, req: Requete = q): Promise<number | null> {
  try {
    const { rows } = await req<{ id: number }>(
      // Insertion PESSIMISTE ('echec') : un plantage laisse la tentative tracée → pas de reprise en boucle la même nuit.
      `INSERT INTO ingestion_auto_journal (source, nuit_du, demarre_le, resultat, motif) VALUES ($1, $2, $3, 'echec', 'en cours') RETURNING id`,
      [source, nuit, debut],
    );
    return rows[0]?.id ?? null;
  } catch (e) { console.error('[ingestion-auto] journal début impossible', e); return null; }
}

export async function journaliserFin(id: number | null, fin: Date, resultat: 'succes' | 'echec', erreur: string | null, req: Requete = q): Promise<void> {
  if (id === null) return;
  try {
    await req(
      `UPDATE ingestion_auto_journal SET fini_le = $2, resultat = $3, motif = CASE WHEN $3 = 'succes' THEN NULL ELSE motif END, erreur = $4 WHERE id = $1`,
      [id, fin, resultat, erreur],
    );
  } catch (e) { console.error('[ingestion-auto] journal fin impossible', e); }
}

const TIMEOUT_CADASTRE_MS = 30 * 60 * 1000; // 30 min : borne dure ; le processus est tué (SIGKILL) au-delà.
const DEPTS_CADASTRE = '75,78,92,93';

/** SPAWN du CLI cadastre — SEUL endroit de la série F qui lance un processus. Args en TABLEAU (jamais un shell), millésime EXTERNE
 *  validé au motif strict AVANT (refus sinon), timeout borné + kill, code de sortie et stderr journalisés. */
async function spawnCadastre(req: Requete = q): Promise<{ ok: boolean; erreur: string | null }> {
  const det = await req<{ d: string | null }>(
    `SELECT to_char(date_distante, 'YYYY-MM-DD') AS d FROM source_detection WHERE source = 'cadastre' AND succes = true`,
  );
  const millesime = det.rows[0]?.d ?? '';
  const v = validerArgsCadastre(millesime, DEPTS_CADASTRE);
  if (!v.ok) return { ok: false, erreur: v.erreur }; // donnée externe non conforme → on NE spawn pas

  return new Promise((resolve) => {
    const enfant = spawn('npm', ['run', 'cadastre:ingest', '--', '--dep', DEPTS_CADASTRE, '--millesime', millesime], {
      cwd: process.cwd(), timeout: TIMEOUT_CADASTRE_MS, killSignal: 'SIGKILL', stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    enfant.stderr?.on('data', (d) => { stderr += String(d); });
    enfant.on('error', (e) => resolve({ ok: false, erreur: `spawn cadastre échoué : ${e.message}` }));
    enfant.on('close', (code, signal) => {
      if (signal) return resolve({ ok: false, erreur: `cadastre tué (timeout ${TIMEOUT_CADASTRE_MS} ms, signal ${signal})\n${stderr.slice(-2000)}` });
      resolve(code === 0 ? { ok: true, erreur: null } : { ok: false, erreur: `cadastre code=${code}\n${stderr.slice(-2000)}` });
    });
  });
}

/** LANCE l'ingestion réelle par source. DILA/PRADA/Sitadel via leurs fonctions lib ; Cadastre via spawn du CLI. */
async function executerRunner(source: SourceAuto): Promise<{ ok: boolean; erreur: string | null }> {
  try {
    if (source === 'dila') { await importerAnnuaireDila({}); return { ok: true, erreur: null }; }
    if (source === 'prada') { await importerAnnuaireCada({}); return { ok: true, erreur: null }; }
    if (source === 'sitadel') { const { millesime } = await millesimeDistantDido(); await ingererMillesime(millesime); return { ok: true, erreur: null }; }
    return await spawnCadastre();
  } catch (e) {
    return { ok: false, erreur: e instanceof Error ? e.message : String(e) };
  }
}

/** Dépendances RÉELLES de l'orchestrateur (production). */
export function depsReellesIngestionAuto(): DepsIngestionAuto {
  return {
    maintenant: () => new Date(),
    config: () => lireConfigIngestionAuto(),
    actionnables: () => actionnablesAuto(),
    dejaTentee: (source, nuit) => dejaTenteeCetteNuit(source, nuit),
    disqueLibre,
    journaliserRefus: (source, nuit, motif, detail) => journaliserRefus(source, nuit, motif, detail),
    journaliserDebut: (source, nuit, debut) => journaliserDebut(source, nuit, debut),
    journaliserFin: (id, fin, resultat, erreur) => journaliserFin(id, fin, resultat, erreur),
    executerRunner,
  };
}

// ── Réglages (route admin) + état d'affichage ─────────────────────────────────

/** Bascule l'interrupteur d'une source automatisable. Source hors whitelist → rejet (jamais un identifiant de colonne arbitraire). */
export async function basculerIngestionAuto(source: string, actif: boolean): Promise<boolean> {
  if (!estAutomatisable(source)) throw new Error(`source non automatisable : ${source}`);
  const colonne = COLONNE_ACTIF[source]; // identifiant issu d'un map FIXE (pas de l'entrée)
  const { rows } = await query<{ a: boolean }>(
    `UPDATE config_veille SET ${colonne} = $1 WHERE id = 1 RETURNING ${colonne} AS a`, [actif === true],
  );
  return rows[0]?.a ?? actif;
}

/** Écrit la fenêtre nocturne (heures 0..23). La CHECK en base garantit les bornes ; on valide aussi ici. */
export async function ecrireFenetreNocturne(debut: number, fin: number): Promise<{ debut: number; fin: number }> {
  const borne = (n: number) => Number.isInteger(n) && n >= 0 && n <= 23;
  if (!borne(debut) || !borne(fin)) throw new Error('heures de fenêtre invalides (attendu 0..23)');
  await query(`UPDATE config_veille SET ingestion_auto_fenetre_debut = $1, ingestion_auto_fenetre_fin = $2 WHERE id = 1`, [debut, fin]);
  return { debut, fin };
}

/** Dernier journal par source (avec sa nuit) — pour l'écran. Table absente → map vide. */
export async function dernierJournalParSource(req: Requete = q): Promise<Record<string, { resultat: string; motif: string | null; finiLe: string | null; nuit: string }>> {
  const out: Record<string, { resultat: string; motif: string | null; finiLe: string | null; nuit: string }> = {};
  if (!(await journalExiste(req))) return out;
  try {
    const { rows } = await req<{ source: string; resultat: string; motif: string | null; fini_le: Date | null; nuit_du: Date | string }>(
      `SELECT DISTINCT ON (source) source, resultat, motif, fini_le, nuit_du
         FROM ingestion_auto_journal ORDER BY source, demarre_le DESC`,
    );
    for (const r of rows) {
      out[r.source] = {
        resultat: r.resultat, motif: r.motif,
        finiLe: r.fini_le ? r.fini_le.toISOString() : null,
        nuit: typeof r.nuit_du === 'string' ? r.nuit_du : r.nuit_du.toISOString().slice(0, 10),
      };
    }
  } catch (e) { console.error('[ingestion-auto] lecture du journal impossible', e); }
  return out;
}
