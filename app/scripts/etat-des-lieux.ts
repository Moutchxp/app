/**
 * LOT 104 — CLI « ÉTAT DES LIEUX SEUL » : pose la référence de comparaison (empreinte des parcelles d'origine + photo du bâti présent)
 * sur les dossiers qui n'en ont AUCUN. AUCUNE vision, AUCUNE GED, AUCUNE ré-écriture des parcelles (≠ completer.ts, lourd et payant).
 *
 * 🔴 GARDE ANTI-ÉCRASEMENT : ne traite QUE les dossiers sans état des lieux (pas d'empreinte, pas de snapshot, pas de correction) →
 *    ne réécrit JAMAIS une photo existante (les 5 pourvus + 468 corrigé au LOT 101 sont protégés). Reprise idempotente par exclusion.
 * ⚠️ AUCUN rapport avec `veille:run` (envoi réel). Après coup : lancer `VACUUM ANALYZE permis_parcelle, permis_empreinte;` (non fait ici).
 *
 * Lancer :  npm run permis:etat-des-lieux -- [--dept 75[,92,…]] [--lot 500] [--dry-run]
 */
import '../lib/chargerEnv';
import { query, closePool } from '../lib/db/client';
import { figerEmpreinte, figerBatiSnapshot } from '../lib/permis/parcellesRepo';
import { rattraperEtatDesLieux, type DepsRattrapage } from '../lib/permis/etatDesLieuxRattrapage';
import { parserDepts } from './rapprocher-parcelles';

const MAJ_PAR = 'cli:etat-des-lieux';

const deps: DepsRattrapage = {
  // ÉLIGIBLES : ≥1 parcelle d'origine sans snapshot dont l'IDU résout au cadastre, du/des dept(s) visé(s), et SANS aucun état des lieux
  //   (ni empreinte, ni snapshot, ni correction) → garde anti-écrasement en SQL.
  selectionner: async (depts, limite) => {
    const { rows } = await query<{ dossier_id: number }>(
      `SELECT pp.dossier_id
         FROM permis_parcelle pp JOIN sitadel_dossier d ON d.id = pp.dossier_id
        WHERE pp.role = 'origine' AND pp.geom_snapshot IS NULL AND pp.idu IS NOT NULL
          AND EXISTS (SELECT 1 FROM parcelle c WHERE c.id = pp.idu)
          AND ($1::text[] IS NULL OR left(d.code_insee, 2) = ANY($1::text[]))
          AND NOT EXISTS (SELECT 1 FROM permis_empreinte e WHERE e.dossier_id = pp.dossier_id)
          AND NOT EXISTS (SELECT 1 FROM permis_parcelle p2 WHERE p2.dossier_id = pp.dossier_id AND (p2.geom_snapshot IS NOT NULL OR p2.correction IS NOT NULL))
        GROUP BY pp.dossier_id ORDER BY pp.dossier_id LIMIT $2`,
      [depts, limite]);
    return rows.map((r) => Number(r.dossier_id));
  },
  aEtatDesLieux: async (dossierId) => {
    const { rows } = await query<{ a: boolean }>(
      `SELECT (EXISTS (SELECT 1 FROM permis_empreinte e WHERE e.dossier_id = $1 AND e.geom IS NOT NULL)
            OR EXISTS (SELECT 1 FROM permis_parcelle p WHERE p.dossier_id = $1 AND (p.geom_snapshot IS NOT NULL OR p.correction IS NOT NULL))) AS a`,
      [dossierId]);
    return rows[0]?.a === true;
  },
  figer: async (dossierId, majPar) => {
    const e = await figerEmpreinte(dossierId, majPar);
    const b = await figerBatiSnapshot(dossierId, majPar).catch(() => ({ nbBatiments: null as number | null }));
    return { complete: e.complete, nbBatiments: b.nbBatiments };
  },
};

async function main(): Promise<void> {
  const depts = parserDepts(process.argv);
  const dryRun = process.argv.includes('--dry-run');
  const iLot = process.argv.indexOf('--lot');
  const lot = iLot >= 0 && /^\d+$/.test(process.argv[iLot + 1] ?? '') ? Math.max(1, Number(process.argv[iLot + 1])) : 500;

  console.log(`\n══════ ÉTAT DES LIEUX DATÉ${dryRun ? '  (DRY-RUN, aucune écriture)' : ''} ══════`);
  console.log(`Départements : ${depts ? depts.join(', ') : 'TOUS'} · lot : ${lot}`);
  const t0 = Date.now();
  // DRY-RUN : un seul lot suffit (rien n'avance) → on élargit le lot pour COMPTER TOUS les éligibles en une passe.
  const lotEffectif = dryRun ? 10_000_000 : lot;
  const r = await rattraperEtatDesLieux(deps, { depts, lot: lotEffectif, majPar: MAJ_PAR, dryRun, log: (s) => console.log(s) });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(`\nRÉSUMÉ (${dt}s) :`);
  console.log(`  candidats vus        : ${r.candidats}`);
  console.log(`  état des lieux posé  : ${r.traites}  (dont terrain nu, 0 bâtiment : ${r.terrainNu})`);
  for (const [motif, n] of Object.entries(r.ecartes)) console.log(`  écarté (${motif})    : ${n}`);
  console.log(`  erreurs              : ${r.erreurs}`);
  if (!dryRun) console.log(`\n→ Recommandé : VACUUM ANALYZE permis_parcelle, permis_empreinte, permis_bati_snapshot; (non lancé par ce script)`);
}

// N'exécuter que si lancé directement (jamais si un test importe ce module).
import { pathToFileURL } from 'node:url';
if (!!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((e) => { console.error('[permis:etat-des-lieux] échec', e); process.exitCode = 1; }).finally(() => closePool());
}
