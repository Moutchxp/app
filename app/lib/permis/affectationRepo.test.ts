import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * RATTACHEMENT — GARDE DE PERSISTANCE de l'affectation. On mocke ../db/client pour prouver le COMPORTEMENT : sans dossier de
 * rattachement, `affecterPolygone` REFUSE avec un motif explicite et n'émet AUCUN UPDATE ; avec un dossier, le comportement
 * d'avant est inchangé. Protocole : comportement + SQL par fragments sémantiques (jamais la forme complète).
 */
const { appels, etat, queryMock } = vi.hoisted(() => {
  const appels: { sql: string; params: unknown[] }[] = [];
  // Réponses SÉQUENTIELLES par ordre d'appel : [dossier ratt], [corps], [update].
  const etat = { reponses: [] as { rows: unknown[] }[] };
  const queryMock = async (sql: string, params?: unknown[]) => { appels.push({ sql, params: params ?? [] }); return etat.reponses.shift() ?? { rows: [] }; };
  return { appels, etat, queryMock };
});
vi.mock('../db/client', () => ({ query: queryMock, pool: {}, closePool: async () => undefined }));

import { affecterPolygone } from './affectationRepo';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const aEmis = (re: RegExp) => appels.some((a) => re.test(a.sql));
beforeEach(() => { appels.length = 0; etat.reponses = []; });

describe('RATTACHEMENT — affecterPolygone : garde de persistance', () => {
  it('AUCUN dossier de rattachement → REFUS avec motif explicite, et AUCUN UPDATE (prouvé)', async () => {
    etat.reponses = [{ rows: [] }]; // permis_rattachement : absent
    const res = await affecterPolygone(11430, 1, 'BAT_A', 'admin:affectation');
    expect(res).toEqual({ ok: false, motif: expect.stringContaining('aucun signal de mise à jour') });
    expect((res as { motif: string }).motif).not.toMatch(/rid|null/i); // message métier, jamais technique
    // La 1re requête interroge bien l'existence du dossier de rattachement…
    expect(norm(appels[0].sql)).toContain('FROM permis_rattachement WHERE dossier_id = $1');
    expect(appels[0].params).toEqual([11430]);
    // …et RIEN d'autre : ni lecture du corps, ni UPDATE.
    expect(aEmis(/UPDATE permis_corps_batiment/i)).toBe(false);
    expect(aEmis(/FROM permis_corps_batiment/i)).toBe(false);
  });

  it('AVEC dossier de rattachement + corps connu → comportement INCHANGÉ : UPDATE émis, ok', async () => {
    etat.reponses = [{ rows: [{ '?column?': 1 }] }, { rows: [{ '?column?': 1 }] }, { rows: [] }]; // [dossier présent], [corps présent], [update]
    const res = await affecterPolygone(11430, 1, 'BAT_A', 'admin:affectation');
    expect(res).toEqual({ ok: true });
    const upd = appels.find((a) => /UPDATE permis_corps_batiment/i.test(a.sql))!;
    expect(norm(upd.sql)).toContain('SET cleabs_affecte = $3');
    expect(upd.params).toEqual([1, 11430, 'BAT_A', 'admin:affectation']);
  });

  it('AVEC dossier mais corps INCONNU → refus « corps inconnu » (la garde dossier passe d’abord)', async () => {
    etat.reponses = [{ rows: [{ '?column?': 1 }] }, { rows: [] }]; // [dossier présent], [corps absent]
    const res = await affecterPolygone(11430, 999, null, 'admin:affectation');
    expect(res).toEqual({ ok: false, motif: 'corps inconnu pour ce permis' });
    expect(aEmis(/UPDATE permis_corps_batiment/i)).toBe(false);
  });
});
