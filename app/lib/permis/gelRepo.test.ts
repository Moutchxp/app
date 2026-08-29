import { describe, it, expect, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { QueryResult, QueryResultRow } from 'pg';

/**
 * FIG-1 — REGISTRE append-only versionné de l'état figé. `db/client` mocké (routé par fragment SQL) ; aucune base réelle. On éprouve :
 *   · figerVersionGel APPEND une nouvelle version (max+1) et n'émet QUE des INSERT (jamais UPDATE/DELETE) ;
 *   · une 2e capture crée la version 2 (la version 1 n'est jamais réécrite) ;
 *   · résilience : registre absent (to_regclass NULL) → NO-OP propre ;
 *   · versionGelCourante rend { id, version } ou null ; historiqueGel replie sur [] si la table manque (42P01).
 * La garantie d'immuabilité EN BASE (UPDATE/DELETE/TRUNCATE refusés) vit dans le trigger de la migration 169 (bloc de vérification).
 */
type Call = { sql: string; params: unknown[] };
const faussReq = (repond: (sql: string) => { rows?: QueryResultRow[]; rowCount?: number }) => {
  const calls: Call[] = [];
  const q = (async (sql: string, params?: unknown[]) => {
    calls.push({ sql, params: params ?? [] });
    const r = repond(sql);
    return { rows: r.rows ?? [], rowCount: r.rowCount ?? (r.rows?.length ?? 0) } as QueryResult<QueryResultRow>;
  }) as never;
  return { q, calls };
};

const H = vi.hoisted(() => {
  const state = {
    gelPresent: true as boolean,        // to_regclass('public.permis_gel')
    prochaineVersion: 1 as number,      // COALESCE(max(version),0)+1
    nouvelId: 7 as number,              // permis_gel.id renvoyé par le RETURNING
    nbParcelles: 2 as number,
    nbBati: 3 as number,
    courante: null as null | { id: number; version: number },
    historiqueThrows42P01: false as boolean,
    historiqueRows: [] as QueryResultRow[],
  };
  const queryMock = async (sql: string, params?: unknown[]) => {
    void params;
    if (/to_regclass\('public\.permis_gel'\)/i.test(sql)) return { rows: [{ t: state.gelPresent ? 'permis_gel' : null }] };
    if (/COALESCE\(max\(version\), 0\) \+ 1/i.test(sql)) return { rows: [{ prochaine: state.prochaineVersion }] };
    if (/INSERT INTO permis_gel \(/i.test(sql)) return { rows: [{ id: state.nouvelId }], rowCount: 1 };
    if (/INSERT INTO permis_gel_parcelle/i.test(sql)) return { rows: [], rowCount: state.nbParcelles };
    if (/INSERT INTO permis_gel_bati/i.test(sql)) return { rows: [], rowCount: state.nbBati };
    if (/SELECT id, version FROM permis_gel WHERE dossier_id/i.test(sql)) return { rows: state.courante ? [state.courante] : [] };
    if (/FROM permis_gel g WHERE g\.dossier_id/i.test(sql)) {
      if (state.historiqueThrows42P01) throw Object.assign(new Error('undefined table'), { code: '42P01' });
      return { rows: state.historiqueRows };
    }
    return { rows: [], rowCount: 0 };
  };
  return { state, queryMock };
});
vi.mock('../db/client', () => ({
  query: (sql: string, params?: unknown[]) => H.queryMock(sql, params),
  withTransaction: async (fn: (q: unknown) => unknown) => fn((sql: string, params?: unknown[]) => H.queryMock(sql, params)),
}));

import { figerVersionGel, versionGelCourante, historiqueGel } from './gelRepo';
import type { RequeteTx } from '../db/client';

describe('figerVersionGel — APPEND d’une version (jamais un écrasement)', () => {
  it('registre présent, aucune version encore → APPEND la version 1 (en-tête + détails), INSERT uniquement', async () => {
    H.state.gelPresent = true; H.state.prochaineVersion = 1; H.state.nouvelId = 7; H.state.nbParcelles = 2; H.state.nbBati = 3;
    const r = await figerVersionGel(531, 'cerfa:parcelles');
    expect(r).toMatchObject({ enregistre: true, version: 1, gelId: 7, nbParcelles: 2, nbBati: 3 });
  });

  it('une VERSION existe déjà (max=1) → une 2e capture crée la VERSION 2 (la 1 n’est jamais réécrite)', async () => {
    H.state.prochaineVersion = 2; // COALESCE(max(version),0)+1 = 2
    const r = await figerVersionGel(531, 'cerfa:parcelles');
    expect(r.version).toBe(2);
    expect(r.enregistre).toBe(true);
  });

  it('registre ABSENT (migration 169 non appliquée) → NO-OP propre (enregistre=false), aucun crash', async () => {
    H.state.gelPresent = false;
    const r = await figerVersionGel(531, 'cerfa:parcelles');
    expect(r.enregistre).toBe(false);
    expect(r.raison).toMatch(/migration 169/i);
  });
});

describe('versionGelCourante', () => {
  it('null si le registre est absent', async () => {
    const { q } = faussReq((sql) => /to_regclass/i.test(sql) ? { rows: [{ t: null }] } : { rows: [] });
    expect(await versionGelCourante(q as RequeteTx, 531)).toBeNull();
  });
  it('{ id, version } si une version existe', async () => {
    const { q } = faussReq((sql) =>
      /to_regclass/i.test(sql) ? { rows: [{ t: 'permis_gel' }] }
      : /SELECT id, version FROM permis_gel/i.test(sql) ? { rows: [{ id: '9', version: '3' }] }
      : { rows: [] });
    expect(await versionGelCourante(q as RequeteTx, 531)).toEqual({ id: 9, version: 3 });
  });
});

describe('historiqueGel', () => {
  it('replie sur [] si la table manque (42P01)', async () => {
    H.state.historiqueThrows42P01 = true;
    expect(await historiqueGel(531)).toEqual([]);
    H.state.historiqueThrows42P01 = false;
  });
  it('mappe les versions (ordre croissant, comptes de détail)', async () => {
    H.state.historiqueRows = [
      { version: '1', gele_le: new Date('2026-08-23T00:00:00Z'), gele_par: 'migration:169 (backfill v1)',
        empreinte_complete: true, empreinte_surface_m2: '263.3', empreinte_millesime: '2026-06-01',
        bati_capture: true, bati_nb_batiments: 2, nb_parcelles: '1', nb_bati: '2' },
    ];
    const h = await historiqueGel(531);
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ version: 1, empreinteSurfaceM2: 263.3, empreinteMillesime: '2026-06-01', nbParcelles: 1, nbBati: 2 });
    H.state.historiqueRows = [];
  });
});

// ── GARDE append-only (défense SECONDAIRE ; la vraie garantie est le trigger en base, migration 169) ──────────────────────
describe('GARDE append-only du registre de gel — aucun chemin d’écriture destructif dans le dépôt', () => {
  const TABLES = ['permis_gel', 'permis_gel_parcelle', 'permis_gel_bati'];
  const interdits = TABLES.flatMap((t) => [
    new RegExp('UPDATE\\s+' + t + '\\b', 'i'),
    new RegExp('DELETE\\s+FROM\\s+' + t + '\\b', 'i'),
    new RegExp('TRUNCATE\\s+' + t + '\\b', 'i'),
  ]);
  const fichiersTs = (dir: string): string[] => {
    const out: string[] = [];
    for (const e of readdirSync(dir)) {
      if (e === 'node_modules' || e === '.next' || e === 'dist') continue;
      const p = join(dir, e);
      if (statSync(p).isDirectory()) out.push(...fichiersTs(p));
      else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) out.push(p);
    }
    return out;
  };
  it('aucun UPDATE/DELETE/TRUNCATE sur les tables de gel dans le code applicatif (.ts hors tests)', () => {
    const coupables: string[] = [];
    for (const f of fichiersTs(join(process.cwd(), 'app'))) {
      const src = readFileSync(f, 'utf8');
      if (interdits.some((re) => re.test(src))) coupables.push(f);
    }
    expect(coupables, `écriture destructive sur une table de gel détectée (append-only) : ${coupables.join(', ')}`).toEqual([]);
  });
});
