import 'dotenv/config';
import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { query, withTransaction, closePool } from '../../db/client';
import { lireGrandLivre } from './requete';
import { lireSeuilK } from './kAnonymat';
import { traficParTranche, repartitionCommune, repartitionVerdicts, statistiques } from './metriques';

/**
 * M2 — LOT 4. Tests d'INTÉGRATION (vraie base ; 018+020 appliquées). Prouvent sur données RÉELLES : le
 * k-anonymat à la restitution (commune < k masquée, seuil lu de la config), le regroupement par semaine
 * ISO à cheval sur un changement d'heure, la LECTURE SEULE structurelle, et l'indexabilité de la fenêtre.
 * Fixtures sur jours de test ISOLÉS (2021-07 + 2026-03 DST — distincts des autres itests, pas de collision
 * concurrente sur la base) + communes fictives (95xxx), nettoyées avant/après.
 */
const JOURS_TEST = ['2021-07-05', '2021-07-06', '2026-03-28', '2026-03-29'];
const COMMUNES_TEST = ['95001', '95003', '95011'];

async function nettoyer(): Promise<void> {
  await query(`DELETE FROM analytics_compteur_jour WHERE jour_paris = ANY($1::date[])`, [JOURS_TEST]);
  await query(`DELETE FROM analytics_compteur_jour WHERE commune_insee = ANY($1::text[])`, [COMMUNES_TEST]);
}
/** Insère une ligne de compteur avec un `n` explicite (fixture ; le writer ferait +1, ici on force la valeur). */
async function poser(cols: Record<string, string | number>): Promise<void> {
  const noms = Object.keys(cols);
  const place = noms.map((_, i) => `$${i + 1}`).join(',');
  await query(
    `INSERT INTO analytics_compteur_jour (${noms.join(',')}) VALUES (${place})`,
    noms.map((k) => cols[k]),
  );
}

beforeEach(nettoyer);
afterEach(nettoyer);
afterAll(async () => {
  await closePool().catch(() => {});
});

describe('trafic — visites par tranche (session_fin)', () => {
  it('somme les visites par jour dans la fenêtre', async () => {
    await poser({ jour_paris: '2021-07-05', nom: 'session_fin', etape: 'resultat', source: 'test', n: 5 });
    await poser({ jour_paris: '2021-07-06', nom: 'session_fin', etape: 'photo', source: 'test', n: 3 });
    const r = await traficParTranche({ debut: '2021-07-01', fin: '2021-07-31', grain: 'jour' });
    const parJour = Object.fromEntries(r.map((p) => [p.bucket, p.visites]));
    expect(parJour['2021-07-05']).toBe(5);
    expect(parJour['2021-07-06']).toBe(3);
  });
});

describe('k-anonymat — commune < k masquée, seuil lu de la config (runtime)', () => {
  it('le seuil vient de la config (020) = 11', async () => {
    expect(await lireSeuilK()).toBe(11); // lecture RÉELLE de analytics_config, pas une constante
  });

  it('à k=11 : commune à 11 visible, communes à 10 et 3 masquées (agrégat sûr), rien de déductible', async () => {
    await poser({ jour_paris: '2021-07-05', nom: 'resultat', verdict: 'SANS_VIS_A_VIS', commune_insee: '95011', n: 11 });
    await poser({ jour_paris: '2021-07-05', nom: 'resultat', verdict: 'SANS_VIS_A_VIS', commune_insee: '95001', n: 10 });
    await poser({ jour_paris: '2021-07-05', nom: 'resultat', verdict: 'VIS_A_VIS', commune_insee: '95003', n: 3 });
    const r = await repartitionCommune({ debut: '2021-07-01', fin: '2021-07-31', grain: 'jour' }, 11);
    expect(r.visibles.map((c) => c.commune_insee)).toEqual(['95011']); // seule ≥ 11
    expect(r.masque).toEqual({ nbCellules: 2, total: 13 }); // 10+3 agrégé (≥2, ≥11) → aucune isolable
    // Anti-soustraction : aucune commune masquée n'apparaît individuellement.
    expect(JSON.stringify(r.visibles)).not.toMatch(/95001|95003/);
  });
});

describe('tranche — semaine ISO à cheval sur le changement d’heure (DST)', () => {
  it('28 et 29 mars 2026 (chgt heure) tombent dans la MÊME semaine ISO (lundi 23 mars)', async () => {
    await poser({ jour_paris: '2026-03-28', nom: 'session_fin', etape: 'resultat', source: 'test', n: 4 });
    await poser({ jour_paris: '2026-03-29', nom: 'session_fin', etape: 'resultat', source: 'test', n: 6 });
    const r = await traficParTranche({ debut: '2026-03-01', fin: '2026-03-31', grain: 'semaine' });
    const semaine = r.find((p) => p.bucket === '2026-03-23'); // lundi ISO de la semaine 13
    expect(semaine?.visites).toBe(10); // 4 + 6 regroupés, DST sans effet (dates)
  });
});

describe('verdicts — 3 buckets sur resultat', () => {
  it('ratio sur les analyses réalisées', async () => {
    await poser({ jour_paris: '2021-07-05', nom: 'resultat', verdict: 'SANS_VIS_A_VIS', commune_insee: '95011', n: 7 });
    await poser({ jour_paris: '2021-07-05', nom: 'resultat', verdict: 'VIS_A_VIS', commune_insee: '95001', n: 2 });
    const r = await repartitionVerdicts({ debut: '2021-07-01', fin: '2021-07-31', grain: 'jour' });
    expect(r).toEqual({ sans_vis_a_vis: 7, vis_a_vis: 2, indetermine: 0, total: 9 });
  });
});

describe('lecture SEULE structurelle', () => {
  it('une écriture via la couche de lecture LÈVE (transaction READ ONLY)', async () => {
    await expect(
      lireGrandLivre(`INSERT INTO analytics_compteur_jour (jour_paris, nom, n) VALUES ('2021-07-05','resultat',1)`),
    ).rejects.toThrow(/read-only|read only/i);
  });
});

describe('indexabilité — la fenêtre sur un an utilise l’index (nom, jour_paris)', () => {
  it('EXPLAIN d’une requête d’un an choisit un Index Scan (pas un Seq Scan) quand l’index est préférable', async () => {
    // Sur une table quasi vide le planificateur choisit à raison un Seq Scan ; on force enable_seqscan=off
    // (dans une transaction, pour que SET LOCAL prenne effet) pour PROUVER que la requête EST indexable :
    // l'index (nom, jour_paris) couvre le prédicat de fenêtre.
    const plan = await withTransaction(async (q) => {
      await q('SET LOCAL enable_seqscan = off');
      const r = await q<{ 'QUERY PLAN': string }>(
        `EXPLAIN (FORMAT TEXT)
         SELECT to_char(jour_paris,'YYYY-MM-DD') AS bucket, SUM(n)::bigint
           FROM analytics_compteur_jour
          WHERE nom = 'session_fin' AND jour_paris >= '2025-01-01'::date AND jour_paris <= '2026-01-01'::date
          GROUP BY bucket`,
      );
      return r.rows.map((x) => x['QUERY PLAN']).join('\n');
    });
    expect(plan).toMatch(/Index/); // Index Scan / Index Only Scan / Bitmap Index Scan sur (nom, jour_paris)
  });
});

describe('statistiques (orchestrateur) — payload complet, k réel', () => {
  it('assemble toutes les métriques avec le k de la config', async () => {
    await poser({ jour_paris: '2021-07-05', nom: 'session_fin', etape: 'resultat', source: 'test', n: 12 });
    await poser({ jour_paris: '2021-07-05', nom: 'resultat', verdict: 'SANS_VIS_A_VIS', commune_insee: '95011', n: 12 });
    const s = await statistiques({ debut: '2021-07-01', fin: '2021-07-31', grain: 'jour' });
    expect(s.k).toBe(11);
    expect(s.communes.visibles.map((c) => c.commune_insee)).toEqual(['95011']);
    expect(s.verdicts.sans_vis_a_vis).toBe(12);
  });
});
