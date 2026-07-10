import 'dotenv/config'; // charge .env (DATABASE_URL) avant l'import de maintenance (crée son pool, sans connexion)
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import {
  compacterUnLot,
  compacter,
  gererPartitions,
  purgerCompteur,
  executerMaintenance,
  lireEntier,
  jourParis,
  poolMaintenance,
  type Requete,
} from './maintenance';

afterAll(async () => {
  await poolMaintenance.end().catch(() => {});
});

describe('jourParis', () => {
  it('formate YYYY-MM-DD au fuseau Europe/Paris', () => {
    expect(jourParis(new Date('2025-12-31T23:30:00Z'))).toBe('2026-01-01');
    expect(/^\d{4}-\d{2}-\d{2}$/.test(jourParis())).toBe(true);
  });
});

describe('compacterUnLot — instruction atomique (compter + supprimer)', () => {
  it('émet UNE instruction : CTE lot FOR UPDATE SKIP LOCKED → INSERT session_fin GROUP BY → DELETE USING lot', async () => {
    const q = vi.fn().mockResolvedValue({ rows: [], rowCount: 3 });
    const n = await compacterUnLot(q as unknown as Requete, '2026-07-10', 1000);
    expect(n).toBe(3);
    expect(q).toHaveBeenCalledTimes(1);
    const [sql, params] = q.mock.calls[0];
    expect(/from analytics_session[\s\S]*where jour_paris < \$1[\s\S]*for update skip locked/i.test(sql)).toBe(true);
    expect(/insert into analytics_compteur_jour[\s\S]*'session_fin'[\s\S]*count\(\*\)[\s\S]*group by/i.test(sql)).toBe(true);
    expect(/on conflict on constraint analytics_compteur_jour_dims_uniq[\s\S]*n = analytics_compteur_jour\.n \+ excluded\.n/i.test(sql)).toBe(true);
    expect(/delete from analytics_session s using lot/i.test(sql)).toBe(true);
    expect(params).toEqual(['2026-07-10', 1000]);
  });
});

describe('compacter — boucle jusqu’à épuisement (idempotence : rejeu → 0)', () => {
  it('additionne les lots et s’arrête au 1er lot vide', async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 5 })
      .mockResolvedValueOnce({ rows: [], rowCount: 4 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const total = await compacter(q as unknown as Requete, '2026-07-10', 1000);
    expect(total).toBe(9);
    expect(q).toHaveBeenCalledTimes(3);
  });

  it('un rejeu (déjà tout compacté) traite 0 session', async () => {
    const q = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    expect(await compacter(q as unknown as Requete, '2026-07-10', 1000)).toBe(0);
  });
});

describe('gererPartitions — crée les futures, DROP les passées VIDES, jamais _default', () => {
  function faireQ(partitions: { nom: string; bornes: string; purgeable: boolean; aLignes: boolean }[]): {
    q: Requete;
    creations: string[];
    drops: string[];
  } {
    const creations: string[] = [];
    const drops: string[] = [];
    const q: Requete = async (sql, params) => {
      if (/to_char\(date_trunc\('month'/i.test(sql)) {
        const m = (params as number[])[1];
        // to_char produit TOUJOURS des dates zéro-paddées valides (comme en base) : on imite ce contrat.
        const mois = 7 + m; // jourCourant = '2026-07-10' dans ces tests
        const pad = (x: number) => String(x).padStart(2, '0');
        return { rows: [{ suffixe: `2026_${pad(mois)}`, deb: `2026-${pad(mois)}-01`, fin: `2026-${pad(mois + 1)}-01` }], rowCount: 0 };
      }
      if (/create table if not exists/i.test(sql)) {
        creations.push(sql.match(/create table if not exists (\S+)/i)![1]);
        return { rows: [], rowCount: 0 };
      }
      if (/from pg_inherits/i.test(sql)) {
        return { rows: partitions.map((p) => ({ nom: p.nom, bornes: p.bornes })), rowCount: partitions.length };
      }
      if (/purgeable/i.test(sql)) {
        const fin = (params as string[])[0];
        const p = partitions.find((x) => x.bornes.includes(fin));
        return { rows: [{ purgeable: p?.purgeable ?? false }], rowCount: 1 };
      }
      if (/a_lignes/i.test(sql)) {
        const nom = sql.match(/from (\S+) limit 1/i)?.[1];
        const p = partitions.find((x) => x.nom === nom);
        return { rows: [{ a_lignes: p?.aLignes ?? false }], rowCount: 1 };
      }
      if (/drop table if exists (\S+)/i.test(sql)) {
        drops.push(sql.match(/drop table if exists (\S+)/i)![1]);
        return { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    };
    return { q, creations, drops };
  }

  it('crée [mois courant … +moisAvance] partitions (IF NOT EXISTS)', async () => {
    const { q, creations } = faireQ([]);
    const r = await gererPartitions(q, '2026-07-10', 2, 2);
    expect(creations.length).toBe(3); // 0,1,2
    expect(r.creees.length).toBe(3);
    expect(r.conflits).toEqual([]);
  });

  it('DROP une partition PASSÉE, VIDE, hors rétention ; JAMAIS une partition avec des lignes', async () => {
    const { q, drops } = faireQ([
      { nom: 'analytics_session_2026_05', bornes: "FOR VALUES FROM ('2026-05-01') TO ('2026-06-01')", purgeable: true, aLignes: false },
      { nom: 'analytics_session_2026_06', bornes: "FOR VALUES FROM ('2026-06-01') TO ('2026-07-01')", purgeable: true, aLignes: true },
    ]);
    const r = await gererPartitions(q, '2026-07-10', 2, 2);
    expect(drops).toEqual(['analytics_session_2026_05']); // vide → DROP
    expect(drops).not.toContain('analytics_session_2026_06'); // a des lignes → jamais DROP
    expect(r.supprimees).toEqual(['analytics_session_2026_05']);
  });

  it('un CREATE qui échoue en check_violation (23514 = DEFAULT peuplée) est classé conflit, non fatal', async () => {
    const q: Requete = async (sql) => {
      if (/to_char/i.test(sql)) return { rows: [{ suffixe: '2026_07', deb: '2026-07-01', fin: '2026-08-01' }], rowCount: 0 };
      if (/create table if not exists/i.test(sql)) {
        const e = new Error('default partition would be violated') as Error & { code: string };
        e.code = '23514'; // check_violation : la seule erreur classée « conflit »
        throw e;
      }
      if (/from pg_inherits/i.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    };
    const r = await gererPartitions(q, '2026-07-10', 0, 2);
    expect(r.creees).toEqual([]);
    expect(r.conflits).toEqual(['analytics_session_2026_07']); // signalé, pas de crash
  });

  it('un CREATE qui échoue AUTREMENT (ex. droits 42501) est RE-LEVÉ, jamais masqué en « conflit »', async () => {
    const q: Requete = async (sql) => {
      if (/to_char/i.test(sql)) return { rows: [{ suffixe: '2026_07', deb: '2026-07-01', fin: '2026-08-01' }], rowCount: 0 };
      if (/create table if not exists/i.test(sql)) {
        const e = new Error('permission denied for table analytics_session') as Error & { code: string };
        e.code = '42501'; // insufficient_privilege : NE doit PAS être classé conflit
        throw e;
      }
      return { rows: [], rowCount: 0 };
    };
    await expect(gererPartitions(q, '2026-07-10', 0, 2)).rejects.toThrow(/permission denied/);
  });
});

describe('lireEntier — repli ciblé (table absente uniquement)', () => {
  it('table absente (42P01) → repli silencieux sur le défaut', async () => {
    const q: Requete = async () => {
      const e = new Error('relation "analytics_maintenance_config" does not exist') as Error & { code: string };
      e.code = '42P01';
      throw e;
    };
    expect(await lireEntier(q, 'analytics_maintenance_config', 'valeur', 'compaction_taille_lot', 1000)).toBe(1000);
  });

  it('valeur présente → utilisée ; valeur ≤ 0 ou absente → défaut', async () => {
    const q42: Requete = async () => ({ rows: [{ v: 42 }], rowCount: 1 });
    expect(await lireEntier(q42, 't', 'valeur', 'k', 1000)).toBe(42);
    const qVide: Requete = async () => ({ rows: [], rowCount: 0 });
    expect(await lireEntier(qVide, 't', 'valeur', 'absente', 1000)).toBe(1000);
    const qZero: Requete = async () => ({ rows: [{ v: 0 }], rowCount: 1 });
    expect(await lireEntier(qZero, 't', 'valeur', 'k', 1000)).toBe(1000);
  });

  it('erreur AUTRE que 42P01 (ex. timeout) → RE-LEVÉE, jamais avalée en défaut', async () => {
    const q: Requete = async () => {
      const e = new Error('canceling statement due to statement timeout') as Error & { code: string };
      e.code = '57014';
      throw e;
    };
    await expect(lireEntier(q, 't', 'valeur', 'k', 1000)).rejects.toThrow(/timeout/);
  });
});

describe('purgerCompteur — DELETE borné par lots (ctid), jusqu’à épuisement', () => {
  it('DELETE par ctid avec LIMIT et boucle jusqu’à 0', async () => {
    const q = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], rowCount: 5000 })
      .mockResolvedValueOnce({ rows: [], rowCount: 12 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const n = await purgerCompteur(q as unknown as Requete, 'analytics_compteur_jour', '2026-07-10', 400, 5000);
    expect(n).toBe(5012);
    const [sql, params] = q.mock.calls[0];
    expect(/delete from analytics_compteur_jour[\s\S]*ctid in[\s\S]*limit \$3/i.test(sql)).toBe(true);
    expect(params).toEqual(['2026-07-10', 400, 5000]);
  });
});

// ─── Orchestrateur : verrou consultatif + isolation des sous-étapes ───────────
describe('executerMaintenance — verrou consultatif', () => {
  function fakeClient(lockOk: boolean, surCompaction?: () => never) {
    const query = vi.fn(async (sql: string) => {
      if (/pg_try_advisory_lock/i.test(sql)) return { rows: [{ ok: lockOk }], rowCount: 1 };
      if (/pg_advisory_unlock/i.test(sql)) return { rows: [{}], rowCount: 1 };
      if (surCompaction && /for update skip locked/i.test(sql)) surCompaction();
      if (/from pg_inherits/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/to_char/i.test(sql)) return { rows: [{ suffixe: '2026_07', deb: '2026-07-01', fin: '2026-08-01' }], rowCount: 0 };
      // config reads, compaction/purge (rowCount 0 → boucles s'arrêtent), etc.
      return { rows: [{ v: undefined }], rowCount: 0 };
    });
    const release = vi.fn();
    return { query, release, _asClient: { query, release } };
  }

  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('verrou NON acquis (un autre run) → demarre:false, aucune action, connexion libérée, pas d’unlock', async () => {
    const fc = fakeClient(false);
    vi.spyOn(poolMaintenance, 'connect').mockResolvedValue(fc._asClient as never);
    const res = await executerMaintenance();
    expect(res.demarre).toBe(false);
    expect(fc.query).toHaveBeenCalledTimes(1); // seulement le try_advisory_lock
    expect(fc.release).toHaveBeenCalledTimes(1);
    expect(fc.query.mock.calls.some((c) => /pg_advisory_unlock/i.test(c[0] as string))).toBe(false);
  });

  it('verrou acquis → demarre:true, unlock ET release appelés', async () => {
    const fc = fakeClient(true);
    vi.spyOn(poolMaintenance, 'connect').mockResolvedValue(fc._asClient as never);
    const res = await executerMaintenance();
    expect(res.demarre).toBe(true);
    expect(fc.query.mock.calls.some((c) => /pg_advisory_unlock/i.test(c[0] as string))).toBe(true);
    expect(fc.release).toHaveBeenCalledTimes(1);
  });

  it('une erreur de sous-étape (compaction throw) est ISOLÉE : run terminé, erreur listée, unlock/release quand même', async () => {
    const fc = fakeClient(true, () => {
      throw new Error('compaction cassée');
    });
    vi.spyOn(poolMaintenance, 'connect').mockResolvedValue(fc._asClient as never);
    const res = await executerMaintenance();
    expect(res.demarre).toBe(true);
    expect(res.erreurs.some((e) => e.startsWith('compaction:'))).toBe(true);
    expect(fc.query.mock.calls.some((c) => /pg_advisory_unlock/i.test(c[0] as string))).toBe(true);
    expect(fc.release).toHaveBeenCalledTimes(1);
  });
});
