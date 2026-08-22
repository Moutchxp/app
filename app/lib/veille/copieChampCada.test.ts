import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * CADA lot A — trace des copies champ-par-champ. On mocke ../db/client pour vérifier le COMPORTEMENT (paramètres liés) + le SQL
 * par FRAGMENTS sémantiques (whitespace-normalisé), jamais la forme complète. Prouve : upsert (une ligne vivante), mapping de
 * l'historique, réinitialisation.
 */
const { appels, etat, queryMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const etat = { rows: [] as unknown[], rowCount: 0 };
  const queryMock = async (sql: string, params?: unknown[]) => { appels.push({ sql, params: params ?? [] }); return { rows: etat.rows, rowCount: etat.rowCount }; };
  return { appels, etat, queryMock };
});
vi.mock('../db/client', () => ({ query: queryMock, pool: {}, closePool: async () => undefined }));

import { tracerCopieChamp, historiqueCopiesChamps, reinitialiserCopiesChamps } from './copieChampCada';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const trouver = (re: RegExp) => appels.find((a) => re.test(a.sql));
beforeEach(() => { appels.length = 0; etat.rows = []; etat.rowCount = 0; });

describe('CADA lot A — tracerCopieChamp : UPSERT (une seule ligne vivante par (saisine, champ))', () => {
  it('écrit un INSERT … ON CONFLICT (saisine_id, champ_cle) DO UPDATE (copie_le rafraîchi), params liés', async () => {
    await tracerCopieChamp(7, 'documents', 3);
    const ins = trouver(/INSERT INTO saisine_champ_copie/i)!;
    const s = norm(ins.sql);
    expect(s).toContain('ON CONFLICT (saisine_id, champ_cle) DO UPDATE');
    expect(s).toContain('copie_le = now()');
    expect(s).toContain('admin_id = EXCLUDED.admin_id');
    expect(ins.params).toEqual([7, 'documents', 3]);
  });

  it('recopier le même champ → même chemin d’UPSERT (l’unique index tranche : jamais empilé), admin null accepté', async () => {
    await tracerCopieChamp(7, 'documents', 3);
    await tracerCopieChamp(7, 'documents', null); // 2e copie du MÊME champ (voie de secours)
    const inserts = appels.filter((a) => /INSERT INTO saisine_champ_copie/i.test(a.sql));
    expect(inserts).toHaveLength(2);
    for (const i of inserts) expect(norm(i.sql)).toContain('ON CONFLICT (saisine_id, champ_cle) DO UPDATE'); // pas d'append : upsert
    expect(inserts[1].params).toEqual([7, 'documents', null]);
  });
});

describe('CADA lot A — historiqueCopiesChamps : mapping', () => {
  it('mappe nombre / dernière copie / compte / déposée', async () => {
    etat.rows = [{ nb: 3, derniere_le: '2026-08-25T19:30:00Z', admin_label: 'Arnaud JOREL', deposee: true }];
    const h = await historiqueCopiesChamps(7);
    expect(h).toEqual({ nbChamps: 3, derniereLe: '2026-08-25T19:30:00Z', dernierAdmin: 'Arnaud JOREL', deposee: true });
    const s = norm(trouver(/FROM saisine_champ_copie/i)!.sql);
    expect(s).toContain("dr.statut = 'envoyee'"); // « déposée » dérivé du statut de la saisine
  });
  it('aucune trace → 0 champ, pas de date, non déposée', async () => {
    etat.rows = [{ nb: 0, derniere_le: null, admin_label: null, deposee: null }];
    expect(await historiqueCopiesChamps(7)).toEqual({ nbChamps: 0, derniereLe: null, dernierAdmin: null, deposee: false });
  });
});

describe('CADA lot A — reinitialiserCopiesChamps : efface les traces de CETTE saisine', () => {
  it('DELETE ciblé sur la saisine, renvoie le nombre effacé', async () => {
    etat.rowCount = 5;
    const n = await reinitialiserCopiesChamps(7);
    expect(n).toBe(5);
    const del = trouver(/DELETE FROM saisine_champ_copie/i)!;
    expect(norm(del.sql)).toContain('WHERE saisine_id = $1');
    expect(del.params).toEqual([7]);
  });
});
