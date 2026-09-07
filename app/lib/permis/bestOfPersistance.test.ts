import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * PC-1 (perfo) — PERSISTANCE du best-of. On teste : (1) le round-trip sérialiser→désérialiser est l'IDENTITÉ (Map/Set reconstruits à
 * l'identique, aucune perte) ; (2) la lecture/écriture sont RÉSILIENTES (table absente / query KO → null / no-op, jamais une exception
 * qui casserait /emprise). On mocke `query` pour piloter succès et panne SANS base.
 */

const HG = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../db/client', () => ({ query: HG.query }));

import {
  serialiserBestOf,
  deserialiserBestOf,
  lireBestOfPersiste,
  ecrireBestOfPersiste,
  type BestOfValeur,
} from './bestOfPersistance';

const exemple = (): BestOfValeur => ({
  proposees: [{ id: 55, nomFichier: 'PC2.pdf', typeMime: 'application/pdf', famille: 'masse' }],
  autres: [{ id: 57, nomFichier: 'PC4.pdf', typeMime: 'application/pdf' }],
  niveauxParId: new Map([[55, ['RDC', 'R+1']]]),
  confirmations: new Map([[55, { planches: [{ page: 2, echelle: '1:500', tracable: true, famille: 'masse', ambigu: false }] }]]),
  cerfaIds: new Set([13, 42]),
  indisGed: ['texte:57'],
});

beforeEach(() => { HG.query.mockReset(); });

describe('PC-1 — round-trip sérialisation (IDENTITÉ, aucune perte)', () => {
  it('🔴 désérialiser(sérialiser(v)) reconstruit Map/Set/tableaux à l’identique', () => {
    const v = exemple();
    const r = deserialiserBestOf(serialiserBestOf(v));
    expect(r.proposees).toEqual(v.proposees);
    expect(r.autres).toEqual(v.autres);
    expect(r.indisGed).toEqual(v.indisGed);
    expect(r.niveauxParId).toBeInstanceOf(Map);
    expect([...r.niveauxParId]).toEqual([...v.niveauxParId]);
    expect(r.confirmations).toBeInstanceOf(Map);
    expect([...r.confirmations]).toEqual([...v.confirmations]);
    expect(r.cerfaIds).toBeInstanceOf(Set);
    expect([...r.cerfaIds]).toEqual([...v.cerfaIds]);
  });

  it('sérialisation DÉTERMINISTE (même valeur → même JSON, pour comparer une empreinte)', () => {
    expect(JSON.stringify(serialiserBestOf(exemple()))).toBe(JSON.stringify(serialiserBestOf(exemple())));
  });

  it('désérialisation TOLÉRANTE d’une forme partielle (champs absents → vides), jamais une exception', () => {
    const r = deserialiserBestOf({} as unknown as ReturnType<typeof serialiserBestOf>);
    expect(r.proposees).toEqual([]);
    expect(r.autres).toEqual([]);
    expect([...r.niveauxParId]).toEqual([]);
    expect([...r.confirmations]).toEqual([]);
    expect([...r.cerfaIds]).toEqual([]);
    expect(r.indisGed).toEqual([]);
  });
});

describe('PC-1 — lecture persistée (résiliente, empreinte liée)', () => {
  it('🔴 hit (une ligne, empreinte OK) → best-of désérialisé ; la query est bornée par dossier_id ET empreinte', async () => {
    HG.query.mockResolvedValueOnce({ rows: [{ resultat: serialiserBestOf(exemple()) }] });
    const r = await lireBestOfPersiste(11434, 'EMP-1');
    expect(r?.cerfaIds).toBeInstanceOf(Set);
    expect([...(r?.cerfaIds ?? [])]).toEqual([13, 42]);
    const [sql, params] = HG.query.mock.calls[0];
    expect(sql.replace(/\s+/g, ' ')).toContain('WHERE dossier_id = $1 AND empreinte = $2'); // ne sert JAMAIS un autre état de GED
    expect(params).toEqual([11434, 'EMP-1']);
  });

  it('miss (0 ligne = empreinte périmée ou absente) → null → l’appelant calcule', async () => {
    HG.query.mockResolvedValueOnce({ rows: [] });
    expect(await lireBestOfPersiste(11434, 'EMP-2')).toBeNull();
  });

  it('🔴 table absente / query KO → null (repli sur le calcul, jamais un écran cassé)', async () => {
    HG.query.mockRejectedValueOnce(Object.assign(new Error('relation "permis_best_of_precalcul" does not exist'), { code: '42P01' }));
    expect(await lireBestOfPersiste(11434, 'EMP-3')).toBeNull();
  });
});

describe('PC-1 — écriture persistée (best-effort, upsert par dossier)', () => {
  it('🔴 upsert par dossier_id (ON CONFLICT), sérialise le best-of, passe l’empreinte et `par`', async () => {
    HG.query.mockResolvedValueOnce({ rows: [] });
    await ecrireBestOfPersiste(11434, 'EMP-1', exemple(), 'a_la_volee');
    const [sql, params] = HG.query.mock.calls[0];
    const n = sql.replace(/\s+/g, ' ');
    expect(n).toContain('INSERT INTO permis_best_of_precalcul');
    expect(n).toContain('ON CONFLICT (dossier_id) DO UPDATE');
    expect(params[0]).toBe(11434);
    expect(params[1]).toBe('EMP-1');
    expect(params[3]).toBe('a_la_volee');
    // le résultat sérialisé est un JSON re-désérialisable à l'identique
    expect(deserialiserBestOf(JSON.parse(params[2] as string))).toEqual(deserialiserBestOf(serialiserBestOf(exemple())));
  });

  it('🔴 écriture KO (table absente) → no-op silencieux, aucune exception propagée', async () => {
    HG.query.mockRejectedValueOnce(new Error('boom'));
    await expect(ecrireBestOfPersiste(11434, 'EMP-1', exemple(), 'fond')).resolves.toBeUndefined();
  });
});
