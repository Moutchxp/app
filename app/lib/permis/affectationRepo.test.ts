import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * RATTACHEMENT — écriture de l'affectation dans la TABLE DE LIAISON permis_corps_polygone (M1). On mocke ../db/client pour prouver
 * le COMPORTEMENT : garde de persistance (sans dossier → refus, aucune écriture), écriture MONO (retire les liens du bâtiment puis
 * pose le nouveau), désaffectation (retire seulement), et exclusivité (a) SURFACÉE quand la base lève 23505. La garantie EN BASE
 * elle-même est prouvée par affectationExclusivite.itest.ts (vrai INSERT). SQL par fragments sémantiques (jamais la forme complète).
 */
const { appels, etat, queryMock, withTransactionMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  const etat = { dossierPresent: true, corpsPresent: true, conflit: false };
  const queryMock = async (sql: string, params?: unknown[]) => {
    appels.push({ sql, params: params ?? [] });
    if (/FROM permis_rattachement WHERE dossier_id/i.test(sql)) return { rows: etat.dossierPresent ? [{ '?column?': 1 }] : [] };
    if (/FROM permis_corps_batiment WHERE id/i.test(sql)) return { rows: etat.corpsPresent ? [{ '?column?': 1 }] : [] };
    if (/INSERT INTO permis_corps_polygone/i.test(sql) && etat.conflit) { const e = new Error('duplicate') as Error & { code: string }; e.code = '23505'; throw e; }
    return { rows: [] };
  };
  const withTransactionMock = async (fn: (q: typeof queryMock) => unknown) => fn(queryMock);
  return { appels, etat, queryMock, withTransactionMock };
});
vi.mock('../db/client', () => ({ query: queryMock, withTransaction: withTransactionMock, pool: {}, closePool: async () => undefined }));

import { affecterPolygone } from './affectationRepo';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const aEmis = (re: RegExp) => appels.some((a) => re.test(a.sql));
const trouve = (re: RegExp) => appels.find((a) => re.test(a.sql));
beforeEach(() => { appels.length = 0; etat.dossierPresent = true; etat.corpsPresent = true; etat.conflit = false; });

describe('RATTACHEMENT — affecterPolygone : garde de persistance', () => {
  it('AUCUN dossier de rattachement → REFUS avec motif explicite, et AUCUNE écriture (prouvé)', async () => {
    etat.dossierPresent = false;
    const res = await affecterPolygone(11430, 1, 'BAT_A', 'admin:affectation');
    expect(res).toEqual({ ok: false, motif: expect.stringContaining('aucun signal de mise à jour') });
    expect((res as { motif: string }).motif).not.toMatch(/rid|null/i); // message métier, jamais technique
    expect(norm(appels[0].sql)).toContain('FROM permis_rattachement WHERE dossier_id = $1');
    expect(appels[0].params).toEqual([11430]);
    // RIEN d'autre : ni lecture du corps, ni écriture de liaison.
    expect(aEmis(/FROM permis_corps_batiment WHERE id/i)).toBe(false);
    expect(aEmis(/permis_corps_polygone/i)).toBe(false);
  });

  it('AVEC dossier mais corps INCONNU → refus « corps inconnu » (la garde dossier passe d’abord), aucune écriture', async () => {
    etat.corpsPresent = false;
    const res = await affecterPolygone(11430, 999, null, 'admin:affectation');
    expect(res).toEqual({ ok: false, motif: 'corps inconnu pour ce permis' });
    expect(aEmis(/permis_corps_polygone/i)).toBe(false);
  });
});

describe('RATTACHEMENT — affecterPolygone : écriture dans la table de liaison (M1)', () => {
  it('affecter un polygone → MONO : retire d’abord les liens du bâtiment (DELETE) PUIS pose le nouveau (INSERT), ok', async () => {
    const res = await affecterPolygone(11430, 1, 'BAT_A', 'admin:affectation');
    expect(res).toEqual({ ok: true });
    const del = trouve(/DELETE FROM permis_corps_polygone/i)!;
    expect(norm(del.sql)).toContain('WHERE dossier_id = $1 AND corps_id = $2');
    expect(del.params).toEqual([11430, 1]);
    const ins = trouve(/INSERT INTO permis_corps_polygone/i)!;
    expect(norm(ins.sql)).toContain('(dossier_id, corps_id, cleabs, maj_le, maj_par)');
    expect(ins.params).toEqual([11430, 1, 'BAT_A', 'admin:affectation']);
    // ordre : le DELETE précède l'INSERT (remplacement propre)
    expect(appels.findIndex((a) => /DELETE FROM permis_corps_polygone/i.test(a.sql)))
      .toBeLessThan(appels.findIndex((a) => /INSERT INTO permis_corps_polygone/i.test(a.sql)));
    // l'ancienne colonne dépréciée n'est PLUS touchée
    expect(aEmis(/UPDATE permis_corps_batiment SET cleabs_affecte/i)).toBe(false);
  });

  it('DÉSAFFECTER (cleabs = null) → retire seulement (DELETE), AUCUN INSERT, ok', async () => {
    const res = await affecterPolygone(11430, 1, null, 'admin:affectation');
    expect(res).toEqual({ ok: true });
    expect(aEmis(/DELETE FROM permis_corps_polygone/i)).toBe(true);
    expect(aEmis(/INSERT INTO permis_corps_polygone/i)).toBe(false);
  });

  it('exclusivité (a) SURFACÉE : la base lève 23505 → refus « déjà affecté à un autre bâtiment »', async () => {
    etat.conflit = true;
    const res = await affecterPolygone(11430, 1, 'BAT_A', 'admin:affectation');
    expect(res).toEqual({ ok: false, motif: expect.stringContaining('déjà affecté à un autre bâtiment') });
  });
});
