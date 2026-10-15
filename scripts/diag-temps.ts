/**
 * ══ DIAGNOSTIC DE DURÉE D'UNE ANALYSE (lot « CAS INDÉTERMINÉ PÉRIMÉ + ANALYSE DE PLUS DE 60 s », 15/10/2026) ═══════════
 *
 *   npm run diag:temps                                   → le cas mesuré à 60 s sur le serveur (ancien point fixe du cas
 *                                                          INDÉTERMINÉ : lat 48.90977883617502, lon 2.274351016683915,
 *                                                          azimut 0, étage 0)
 *   npm run diag:temps -- --lat=… --lon=… --azimut=… --etage=… [--dernier-etage]
 *                                                        → un autre point
 *   options : --top=N (défaut 10) · --sans-explain (ne rejoue pas les requêtes lentes) · --json=fichier (détail complet)
 *
 * Rejoue `analyserAdresse` par le MÊME chemin que la production (`construireEntree`, puis `analyser` avec le profil lu dans
 * config_scoring — ce que fait `analyserAdresse`, ligne à ligne), SANS délai maximal, et chronomètre :
 *   · le total, `construireEntree` et `analyser` ;
 *   · chaque requête SQL : durée d'exécution, nombre de lignes, longueur du couloir (paramètre de l'axe), étape qui l'a émise ;
 *   · pour les N plus lentes, les tuiles LiDAR lues (MNS / MNT), comptées en rejouant la requête en EXPLAIN (ANALYZE, BUFFERS)
 *     — le plan complet va dans le fichier --json.
 * Sortie : le rapport lisible (temps par étape + les N requêtes les plus lentes + le total). Aucune correction : on mesure.
 *
 * ⚠️ Les requêtes passent UNE PAR UNE sur un seul client (celles que le moteur lance en parallèle sont mises en file) : chaque
 * durée est celle de la requête seule. Le total peut donc dépasser celui de la production, jamais l'inverse sur le SQL.
 *
 * 🔒 AUCUNE ÉCRITURE EN BASE, PAR CONSTRUCTION (même méthode que `diag:golden`) :
 *   · toutes les requêtes du moteur passent par `query()` (`db/client.ts`), qui appelle `pool.query` ; on remplace cette
 *     méthode par un client DÉDIÉ ouvert en `BEGIN TRANSACTION READ ONLY` — PostgreSQL y REFUSE toute écriture ;
 *   · la transaction se termine par ROLLBACK, quoi qu'il arrive ; `withTransaction` n'est jamais utilisé.
 * « Sans délai maximal » : `statement_timeout` est mis à 0 POUR CETTE TRANSACTION SEULE (`SET LOCAL`), rien d'autre ne change.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { QueryResult } from 'pg';
import { pool, closePool } from '../app/lib/db/client';
import { construireEntree } from '../app/lib/db/pipeline';
import { chargerProfilDegagement } from '../app/lib/db/profilConfig';
import { analyser } from '../app/lib/svv/analyse';
import { sqlNormalise } from '../app/lib/diag/diagGolden';
import { mntSousLePoint } from '../app/lib/db/couvertureLidar';
import { motifSansResultat } from '../app/lib/tunnel/motifSansResultat';
import {
  etapeDepuisPile, libelleArret, lireArguments, longueurCouloir, plusLentes, rendreRapport, tuilesLues, type MesureRequete,
} from '../app/lib/diag/diagTemps';

const RACINE = path.resolve(__dirname, '..');

/** La première fonction du dépôt (hors ce script et `db/client.ts`) dans la pile : « app/lib/db/obstacles.ts:echantillonnerGrille ». */
function appelant(pile: string): string {
  for (const ligne of pile.split('\n').slice(1)) {
    const m = /at (?:async )?(?:(\S+) \()?(.+?):\d+:\d+\)?$/.exec(ligne.trim());
    if (!m) continue;
    const fichier = m[2].replace(/^file:\/\//, '');
    if (!fichier.startsWith(RACINE) || fichier.includes('node_modules')) continue;
    const rel = path.relative(RACINE, fichier);
    if (rel === 'scripts/diag-temps.ts' || rel === 'app/lib/db/client.ts') continue;
    return `${rel}:${m[1] ?? '(anonyme)'}`;
  }
  return '(inconnu)';
}

const maintenant = (): number => Number(process.hrtime.bigint()) / 1e6;

async function main(): Promise<void> {
  const cas = lireArguments(process.argv.slice(2));
  Error.stackTraceLimit = 60; // pile assez profonde pour remonter jusqu'à construireEntree
  const c = await pool.connect();
  const original = pool.query;
  const journal: MesureRequete[] = [];
  const plans: Record<number, unknown> = {};
  const sqlBrut = new Map<number, string>(); // texte EXACT émis (le journal le garde sur une ligne, et ses commentaires `--` avaleraient la suite)
  let rapport = '';
  try {
    await c.query('BEGIN TRANSACTION READ ONLY');
    await c.query('SET LOCAL statement_timeout = 0');
    const machine = `${os.hostname()} · ${(await c.query('SELECT version() AS v')).rows[0].v}`;

    let file: Promise<unknown> = Promise.resolve();
    (pool as unknown as { query: unknown }).query = async (texte: string | { text: string }, params?: unknown[]): Promise<QueryResult> => {
      const pile = new Error().stack ?? '';
      const sql = typeof texte === 'string' ? texte : texte.text;
      const entree: MesureRequete = {
        n: journal.length + 1, etape: etapeDepuisPile(pile, journal.at(-1)?.etape ?? null), appelant: appelant(pile), sql: sqlNormalise(sql),
        params: params ?? [], dureeMs: 0, nbLignes: null, couloirM: longueurCouloir(sql, params ?? []), tuiles: null, erreur: null,
      };
      journal.push(entree);
      sqlBrut.set(entree.n, sql);
      const execution = file.then(async () => {
        const t0 = maintenant();
        try {
          return await c.query(texte as string, params as never);
        } catch (e) {
          entree.erreur = e instanceof Error ? e.message : String(e);
          throw e;
        } finally {
          entree.dureeMs = maintenant() - t0;
        }
      });
      file = execution.catch(() => undefined); // une requête en échec ne bloque pas la suivante (l'erreur remonte à son appelant)
      const r = await execution;
      entree.nbLignes = r.rowCount;
      return r;
    };

    // analyserAdresse, ligne à ligne : construireEntree, puis le profil lu (config_scoring), puis analyser (PUR).
    const t0 = maintenant();
    const { validation, entree } = await construireEntree({
      point: { ...cas.point }, azimutPrincipalDeg: cas.azimutPrincipalDeg, etage: cas.etage, dernierEtage: cas.dernierEtage,
    });
    const t1 = maintenant();
    let analyserMs: number | null = null;
    let resultat = null;
    if (entree) {
      const profil = await chargerProfilDegagement();
      const t2 = maintenant();
      resultat = analyser(entree, profil);
      analyserMs = maintenant() - t2;
    }
    const totalMs = maintenant() - t0;
    (pool as unknown as { query: unknown }).query = original;

    // Arrêt sans analyse : POURQUOI (même règle que la route /api/analyse), hors chronométrage, même transaction.
    let arret: string | null = null;
    if (!entree) {
      let mnt: boolean | null = null;
      if (validation.valide && validation.altitudeTerrainOrigineM == null && validation.pointSnappeL93) {
        mnt = await mntSousLePoint(validation.pointSnappeL93, (t, p) => c.query(t, p as never));
      }
      arret = libelleArret(motifSansResultat(validation, mnt), validation.raison);
    }

    // Tuiles lues : les requêtes du classement sont REJOUÉES en EXPLAIN (ANALYZE, BUFFERS) dans la même transaction en lecture seule.
    if (cas.explain) {
      for (const q of plusLentes(journal, cas.top)) {
        if (q.erreur) continue;
        try {
          const { rows } = await c.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sqlBrut.get(q.n)}`, q.params as never);
          plans[q.n] = rows[0]['QUERY PLAN'];
          q.tuiles = tuilesLues(plans[q.n]);
        } catch (e) {
          q.erreur = `EXPLAIN impossible : ${e instanceof Error ? e.message : String(e)}`;
        }
      }
    }

    rapport = rendreRapport({
      cas, machine, totalMs, construireEntreeMs: t1 - t0, analyserMs,
      verdict: resultat?.verdict.verdict ?? null, distanceM: resultat?.verdict.distanceM ?? null,
      validationValide: validation.valide, arret, journal,
    });
    if (cas.json) {
      await fs.writeFile(cas.json, `${JSON.stringify({ cas, machine, totalMs, journal, plans }, null, 2)}\n`);
      rapport += `\nDétail complet (journal + plans) : ${cas.json}\n`;
    }
  } finally {
    (pool as unknown as { query: unknown }).query = original;
    try { await c.query('ROLLBACK'); } finally { c.release(); }
    await closePool();
  }
  process.stdout.write(rapport);
}

main().catch((e) => {
  console.error('[diag-temps] échec :', e instanceof Error ? e.stack : e);
  process.exitCode = 1;
});
