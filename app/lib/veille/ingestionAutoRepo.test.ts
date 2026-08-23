import { describe, it, expect, vi } from 'vitest';
import { lireConfigIngestionAuto, actionnablesAuto, dejaTenteeCetteNuit, basculerIngestionAuto } from './ingestionAutoRepo';

/**
 * FRAÎCHEUR / F6 — I/O de l'ingestion auto. Teste le COMPORTEMENT (repli sûr, garde whitelist), pas la forme du SQL. Requêtes
 * injectées → aucun accès base. Cœur : migration absente → config tout-false ; journal absent (to_regclass) → « déjà tentée » = true.
 */

type Req = <R>(text: string, params?: unknown[]) => Promise<{ rows: R[] }>;

describe('lireConfigIngestionAuto — repli sûr (migration 143 absente)', () => {
  it('requête en échec (colonnes absentes) → tout DÉSACTIVÉ, fenêtre par défaut 3-6', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reqKo = (async () => { throw new Error('column "dila_auto_active" does not exist'); }) as Req;
    const cfg = await lireConfigIngestionAuto(reqKo);
    expect(cfg.actifs).toEqual({ dila: false, prada: false, sitadel: false, cadastre: false });
    expect(cfg.fenetre).toEqual({ debut: 3, fin: 6 });
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('migration appliquée → lit les interrupteurs et la fenêtre', async () => {
    const reqOk = (async () => ({ rows: [{
      dila_auto_active: true, prada_auto_active: false, sitadel_auto_active: false, cadastre_auto_active: true,
      ingestion_auto_fenetre_debut: 2, ingestion_auto_fenetre_fin: 5,
    }] })) as Req;
    const cfg = await lireConfigIngestionAuto(reqOk);
    expect(cfg.actifs).toEqual({ dila: true, prada: false, sitadel: false, cadastre: true });
    expect(cfg.fenetre).toEqual({ debut: 2, fin: 5 });
  });
});

describe('dejaTenteeCetteNuit — repli journal absent', () => {
  it('table absente (to_regclass NULL) → true (bloque : pas de trace possible, pas d’exécution)', async () => {
    const req = (async (text: string) => {
      if (text.includes('to_regclass')) return { rows: [{ t: null }] };
      return { rows: [{ n: 0 }] };
    }) as Req;
    expect(await dejaTenteeCetteNuit('dila', '2026-08-23', req)).toBe(true);
  });
  it('table présente + aucune ligne → false ; + une ligne → true', async () => {
    const avec = (n: number): Req => (async (text: string) => {
      if (text.includes('to_regclass')) return { rows: [{ t: 'ingestion_auto_journal' }] };
      return { rows: [{ n }] };
    }) as Req;
    expect(await dejaTenteeCetteNuit('dila', '2026-08-23', avec(0))).toBe(false);
    expect(await dejaTenteeCetteNuit('dila', '2026-08-23', avec(1))).toBe(true);
  });
});

describe('actionnablesAuto — édition détectée plus récente que la base', () => {
  it('cadastre détecté 2026-09-01 > base 2026-06-01 → actionnable ; dila égal → non', async () => {
    const req = (async (text: string) => {
      if (text.includes('FROM source_detection')) return { rows: [{ source: 'cadastre', d: '2026-09-01' }, { source: 'dila', d: '2026-08-03' }] };
      if (text.includes('FROM dila_millesime')) return { rows: [{ d: '2026-08-03' }] };        // égal → non actionnable
      if (text.includes('FROM cadastre_millesime')) return { rows: [{ d: '2026-06-01' }] };     // plus ancien → actionnable
      if (text.includes('FROM prada_millesime')) return { rows: [{ code: '2026-07' }] };
      if (text.includes('FROM sitadel_millesime')) return { rows: [{ code: '2026-07' }] };
      return { rows: [] };
    }) as Req;
    const set = await actionnablesAuto(req);
    expect(set.has('cadastre')).toBe(true);
    expect(set.has('dila')).toBe(false);
  });
  it('erreur (table source_detection absente) → ensemble VIDE (rien d’actionnable, rien ne partira)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reqKo = (async () => { throw new Error('relation "source_detection" does not exist'); }) as Req;
    expect((await actionnablesAuto(reqKo)).size).toBe(0);
    err.mockRestore();
  });
});

describe('basculerIngestionAuto — garde whitelist', () => {
  it('source NON automatisable (bdtopo_bati) → rejet AVANT toute requête (jamais d’identifiant de colonne arbitraire)', async () => {
    await expect(basculerIngestionAuto('bdtopo_bati', true)).rejects.toThrow(/non automatisable/);
    await expect(basculerIngestionAuto('lidar', true)).rejects.toThrow(/non automatisable/);
  });
});
