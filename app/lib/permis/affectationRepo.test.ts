import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * RATTACHEMENT — écriture INCRÉMENTALE de l'affectation dans la TABLE DE LIAISON permis_corps_polygone (M2). On mocke ../db/client
 * pour prouver le COMPORTEMENT : garde de persistance (sans dossier → refus, aucune écriture) ; 'ajout' AJOUTE un polygone (INSERT
 * SEUL, sans retirer les autres — additif) ; 'retrait' retire CE seul polygone (DELETE ciblé, sans INSERT) ; exclusivité (a)
 * SURFACÉE quand la base lève 23505. La garantie EN BASE elle-même est prouvée par affectationExclusivite.itest.ts (vrai INSERT).
 * SQL par fragments sémantiques (jamais la forme complète).
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
    const res = await affecterPolygone(11430, 1, 'BAT_A', 'ajout', 'admin:affectation');
    expect(res).toEqual({ ok: false, motif: expect.stringContaining('aucun signal de mise à jour') });
    expect((res as { motif: string }).motif).not.toMatch(/rid|null/i); // message métier, jamais technique
    expect(norm(appels[0].sql)).toContain('FROM permis_rattachement WHERE dossier_id = $1');
    expect(appels[0].params).toEqual([11430]);
    expect(aEmis(/FROM permis_corps_batiment WHERE id/i)).toBe(false);
    expect(aEmis(/permis_corps_polygone/i)).toBe(false);
  });

  it('AVEC dossier mais bâtiment INCONNU → refus « corps inconnu » (la garde dossier passe d’abord), aucune écriture', async () => {
    etat.corpsPresent = false;
    const res = await affecterPolygone(11430, 999, 'BAT_A', 'ajout', 'admin:affectation');
    expect(res).toEqual({ ok: false, motif: 'corps inconnu pour ce permis' });
    expect(aEmis(/permis_corps_polygone/i)).toBe(false);
  });
});

describe('RATTACHEMENT — affecterPolygone : écriture INCRÉMENTALE (M2, additive)', () => {
  it('AJOUT → INSERT SEUL (ajoute le polygone), AUCUN DELETE : les autres polygones du bâtiment restent', async () => {
    const res = await affecterPolygone(11430, 1, 'BAT_A', 'ajout', 'admin:affectation');
    expect(res).toEqual({ ok: true });
    const ins = trouve(/INSERT INTO permis_corps_polygone/i)!;
    expect(norm(ins.sql)).toContain('(dossier_id, corps_id, cleabs, maj_le, maj_par)');
    expect(ins.params).toEqual([11430, 1, 'BAT_A', 'admin:affectation']);
    // ADDITIF : pas de DELETE (on ne retire pas les autres polygones du bâtiment).
    expect(aEmis(/DELETE FROM permis_corps_polygone/i)).toBe(false);
    // l'ancienne colonne dépréciée n'est jamais touchée.
    expect(aEmis(/UPDATE permis_corps_batiment SET cleabs_affecte/i)).toBe(false);
  });

  it('RETRAIT → DELETE CIBLÉ (ce seul polygone), AUCUN INSERT', async () => {
    const res = await affecterPolygone(11430, 1, 'BAT_A', 'retrait', 'admin:affectation');
    expect(res).toEqual({ ok: true });
    const del = trouve(/DELETE FROM permis_corps_polygone/i)!;
    expect(norm(del.sql)).toContain('WHERE dossier_id = $1 AND corps_id = $2 AND cleabs = $3'); // ciblé sur CE polygone
    expect(del.params).toEqual([11430, 1, 'BAT_A']);
    expect(aEmis(/INSERT INTO permis_corps_polygone/i)).toBe(false);
  });

  it('exclusivité (a) SURFACÉE : un AJOUT que la base rejette (23505) → refus « déjà affecté à un autre bâtiment »', async () => {
    etat.conflit = true;
    const res = await affecterPolygone(11430, 1, 'BAT_A', 'ajout', 'admin:affectation');
    expect(res).toEqual({ ok: false, motif: expect.stringContaining('déjà affecté à un autre bâtiment') });
  });
});
