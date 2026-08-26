import { describe, it, expect, vi, beforeEach } from 'vitest';

// db/client mocké : `withTransaction(fn)` exécute la callback avec le `query` mocké ; on inspecte le SQL émis.
const H = vi.hoisted(() => ({ q: vi.fn() }));
vi.mock('../db/client', () => ({
  query: H.q,
  withTransaction: (fn: (q: typeof H.q) => unknown) => fn(H.q),
}));

import { cloreRattachementAcheve } from './rattachementSuiviRepo';

function scenario(etatRow: { id: number; etat: string } | null) {
  H.q.mockReset();
  H.q.mockImplementation(async (sql: string) => {
    if (/SELECT id, etat FROM permis_rattachement/.test(sql)) return { rows: etatRow ? [etatRow] : [] };
    return { rows: [] };
  });
}
const sqlEmis = () => H.q.mock.calls.map((c) => String(c[0]).replace(/\s+/g, ' '));

describe('ÉTAGE 1 — cloreRattachementAcheve : clôture d’un « achevé, à confirmer »', () => {
  beforeEach(() => H.q.mockReset());

  it('dossier « acheve_sans_bati » → OK ; passe à « clos_sans_bati » et trace un événement « cloture » ; AUCUNE altitude', async () => {
    scenario({ id: 42, etat: 'acheve_sans_bati' });
    const r = await cloreRattachementAcheve(11430, 'admin:cloture');
    expect(r).toEqual({ ok: true });
    const sqls = sqlEmis();
    expect(sqls.some((s) => /UPDATE permis_rattachement SET etat = 'clos_sans_bati'/.test(s))).toBe(true);
    expect(sqls.some((s) => /INSERT INTO permis_rattachement_evenement/.test(s) && /'cloture'/.test(s))).toBe(true);
    // Garde : aucune écriture d'altitude.
    expect(sqls.some((s) => /permis_polygone_altitude/.test(s))).toBe(false);
  });

  it('dossier dans un AUTRE état (arbitrage_demande) → refus explicite, aucune écriture', async () => {
    scenario({ id: 7, etat: 'arbitrage_demande' });
    const r = await cloreRattachementAcheve(999, 'admin:cloture');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toMatch(/pas en attente de confirmation/);
    expect(sqlEmis().some((s) => /UPDATE|INSERT/.test(s))).toBe(false); // rien écrit
  });

  it('aucun dossier de rattachement → refus explicite', async () => {
    scenario(null);
    const r = await cloreRattachementAcheve(123, 'admin:cloture');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motif).toMatch(/aucun dossier/);
  });
});
