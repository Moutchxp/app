// PAS de `server-only` : ce module est atteint par le CLI `veille:run` (executerVeille → detecterEditions). Comme les autres
// repos de veille (envoiAuto, relanceAuto…), il vit côté serveur ET côté script — le garde F2 interdit qu'un CLI touche un
// module `server-only`. L'accès admin reste protégé par le garde de la route + le proxy fail-closed.
import { query } from '../db/client';
import { DILA_URL_DEFAUT } from '../sitadel/veilleConfig';
import { SOURCES_PROBEES, type DepsDetection, type ResultatDetection } from './detectionSources';
import type { LectureDetection } from '../admin/sourcesFraicheur';

/**
 * FRAÎCHEUR lot 2/3 — I/O de la détection (server-only). Lit/écrit `source_detection`, lit la config de détection sur
 * `config_veille`, et compose la ligne de détection de Sitadel depuis SON PROPRE mécanisme (`veille_run`, jamais re-sondé).
 * TOUT est résilient à l'ordre d'application (142 pas encore appliquée → défauts / rien, jamais un crash de l'écran).
 */

const UA = 'sansvisavis-detection-fraicheur';
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/** Config de détection (interrupteur global + cadence), isolée : 142 pas appliquée → défauts sûrs (actif, 24 h). */
export async function lireDetectionConfig(): Promise<{ active: boolean; intervalleHeures: number }> {
  try {
    const { rows } = await query<{ detection_active: boolean; detection_intervalle_heures: number }>(
      `SELECT detection_active, detection_intervalle_heures FROM config_veille WHERE id = 1`,
    );
    const r = rows[0];
    if (!r) return { active: true, intervalleHeures: 24 };
    return { active: r.detection_active !== false, intervalleHeures: Number(r.detection_intervalle_heures) || 24 };
  } catch {
    return { active: true, intervalleHeures: 24 }; // 142 pas encore appliquée → défauts
  }
}

/** URL DILA effective (base → env → défaut), isolée de la config générale (résilience à l'ordre d'application de la 069). */
async function urlDilaEffective(): Promise<string> {
  try {
    const { rows } = await query<{ dila_url: string }>(`SELECT dila_url FROM config_veille WHERE id = 1`);
    const v = (rows[0]?.dila_url ?? '').trim();
    if (v) return v;
  } catch { /* colonne 069 absente → repli */ }
  return process.env.DILA_URL?.trim() || DILA_URL_DEFAUT;
}

/** État par source (activation + dernière vérification) pour la cadence. Table absente → map vide (tout réputé actif & dû). */
async function lireEtatsSources(): Promise<Map<string, { actif: boolean; verifieLe: Date | null }>> {
  const m = new Map<string, { actif: boolean; verifieLe: Date | null }>();
  try {
    const { rows } = await query<{ source: string; actif: boolean; verifie_le: Date | null }>(
      `SELECT source, actif, verifie_le FROM source_detection`,
    );
    for (const r of rows) m.set(r.source, { actif: r.actif !== false, verifieLe: r.verifie_le ?? null });
  } catch { /* 142 pas encore appliquée → aucune contrainte, tout est dû */ }
  return m;
}

/** Persiste le résultat d'une tentative. Sur ÉCHEC, on PRÉSERVE le dernier succès et l'édition connue (jamais écrasés). */
export async function enregistrerDetection(source: string, r: ResultatDetection, maintenant: Date): Promise<void> {
  try {
    // ⚠️ $2 (verifie_le, timestamptz) est RÉUTILISÉ dans le CASE de dernier_succes_le. Sans cast, le CASE (branches $2/NULL
    // non typées) se résout en TEXT côté PostgreSQL → « inconsistent types deduced for parameter $2 » (42P08) au PARSE → l'INSERT
    // jette et RIEN n'est persisté. On FIXE le type du paramètre par un cast EXPLICITE aux DEUX usages. (Aucun changement de schéma.)
    await query(
      `INSERT INTO source_detection (source, verifie_le, succes, dernier_succes_le, edition_distante, date_distante, motif)
       VALUES ($1, $2::timestamptz, $3, CASE WHEN $3 THEN $2::timestamptz ELSE NULL END, $4, $5, $6)
       ON CONFLICT (source) DO UPDATE SET
         verifie_le = EXCLUDED.verifie_le,
         succes = EXCLUDED.succes,
         dernier_succes_le = CASE WHEN EXCLUDED.succes THEN EXCLUDED.verifie_le ELSE source_detection.dernier_succes_le END,
         edition_distante  = CASE WHEN EXCLUDED.succes THEN EXCLUDED.edition_distante ELSE source_detection.edition_distante END,
         date_distante     = CASE WHEN EXCLUDED.succes THEN EXCLUDED.date_distante ELSE source_detection.date_distante END,
         motif = EXCLUDED.motif`,
      [source, maintenant, r.succes, r.editionDistante, r.dateDistante, r.motif],
    );
  } catch (e) {
    // On DIT ce que PostgreSQL a dit, jamais une hypothèse. Deux situations DISTINCTES : table absente (42P01, migration 142 pas
    // appliquée) vs erreur d'écriture réelle (tout le reste). L'objet `e` porte le code/detail complets dans les deux cas.
    const code = (e as { code?: string })?.code;
    if (code === '42P01') {
      console.error(`[detection] table source_detection absente — migration 142 non appliquée (source ${source})`, e);
    } else {
      console.error(`[detection] échec d'écriture de la détection pour ${source}`, e);
    }
  }
}

/** Dépendances RÉELLES de `executerDetection` : métadonnées par HTTP (GET texte / HEAD en-tête), persistance en base. */
export function depsReellesDetection(): DepsDetection {
  return {
    maintenant: () => new Date(),
    config: lireDetectionConfig,
    etats: lireEtatsSources,
    enregistrer: enregistrerDetection,
    lireTexte: async (url) => {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
      return res.text();
    },
    lireEntete: async (url) => {
      const res = await fetch(url, { method: 'HEAD', redirect: 'follow', headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status} (HEAD) sur ${url}`);
      return { lastModified: res.headers.get('last-modified') };
    },
    urlDila: urlDilaEffective,
  };
}

/** Millésime mensuel « YYYY-MM » → date « YYYY-MM-01 » ; sinon la partie date, sinon null. */
function moisEnDate(code: string | null): string | null {
  if (!code) return null;
  if (/^\d{4}-\d{2}$/.test(code)) return `${code}-01`;
  if (/^\d{4}-\d{2}-\d{2}/.test(code)) return code.slice(0, 10);
  return null;
}

/** Ligne de détection de Sitadel composée depuis SON mécanisme (veille_run) — on l'affiche, on ne le re-sonde pas. */
async function lireDetectionSitadel(): Promise<LectureDetection | null> {
  try {
    const dernier = await query<{ statut: string; fini_le: Date | null; millesime_detecte: string | null; erreur: string | null }>(
      `SELECT statut, fini_le, millesime_detecte, erreur FROM veille_run ORDER BY COALESCE(fini_le, demarre_le) DESC LIMIT 1`,
    );
    const d = dernier.rows[0];
    if (!d) return { source: 'sitadel', actif: true, verifieLe: null, succes: null, dernierSuccesLe: null, editionDistante: null, dateDistante: null, motif: null };
    const succes = await query<{ fini_le: Date | null; millesime_detecte: string | null }>(
      `SELECT fini_le, millesime_detecte FROM veille_run WHERE statut <> 'echec' AND millesime_detecte IS NOT NULL ORDER BY fini_le DESC LIMIT 1`,
    );
    const s = succes.rows[0];
    return {
      source: 'sitadel',
      actif: true,
      verifieLe: iso(d.fini_le),
      succes: d.statut !== 'echec',
      dernierSuccesLe: iso(s?.fini_le ?? null),
      editionDistante: s?.millesime_detecte ?? d.millesime_detecte ?? null,
      dateDistante: moisEnDate(s?.millesime_detecte ?? d.millesime_detecte ?? null),
      motif: d.statut === 'echec' ? d.erreur ?? 'dernier passage en échec' : null,
    };
  } catch {
    return null;
  }
}

/** Tous les relevés de détection (source_detection + Sitadel synthétique) pour la tuile. Table absente → seulement Sitadel. */
export async function lireDetections(): Promise<LectureDetection[]> {
  const out: LectureDetection[] = [];
  try {
    const { rows } = await query<{
      source: string; actif: boolean; verifie_le: Date | null; succes: boolean | null;
      dernier_succes_le: Date | null; edition_distante: string | null; date_distante: Date | null; motif: string | null;
    }>(
      `SELECT source, actif, verifie_le, succes, dernier_succes_le, edition_distante, date_distante, motif FROM source_detection`,
    );
    for (const r of rows) {
      out.push({
        source: r.source,
        actif: r.actif !== false,
        verifieLe: iso(r.verifie_le),
        succes: r.succes,
        dernierSuccesLe: iso(r.dernier_succes_le),
        editionDistante: r.edition_distante,
        dateDistante: r.date_distante ? r.date_distante.toISOString().slice(0, 10) : null,
        motif: r.motif,
      });
    }
  } catch { /* 142 pas encore appliquée → pas de relevés (Sitadel reste affiché par son mécanisme) */ }

  const sitadel = await lireDetectionSitadel();
  if (sitadel && !out.some((d) => d.source === 'sitadel')) out.push(sitadel);
  return out;
}

/** Bascule l'activation d'une source détectable (réglage par source). Rejette une source inconnue/non détectable. */
export async function basculerDetectionSource(source: string, actif: boolean): Promise<boolean> {
  if (!(SOURCES_PROBEES as readonly string[]).includes(source)) {
    throw new Error(`source non détectable : ${source}`);
  }
  const { rows } = await query<{ actif: boolean }>(
    `INSERT INTO source_detection (source, actif) VALUES ($1, $2)
     ON CONFLICT (source) DO UPDATE SET actif = EXCLUDED.actif RETURNING actif`,
    [source, actif],
  );
  return rows[0]?.actif ?? actif;
}
