import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴 LOT S (441) — le changement « Commissionné / Non commissionné » : UPDATE et journal ensemble ; un collaborateur refusé ; sans la 441, rien. */
const h = vi.hoisted(() => ({ q: vi.fn(), lotS: vi.fn() }));
vi.mock('../db/client', () => ({ query: (s: string, p: unknown[]) => h.q(s, p) }));
vi.mock('./schemaDroits', () => ({ commissionneDisponible: () => h.lotS() }));
const m = await import('./commissionneCompte');
beforeEach(() => { h.q.mockReset(); h.lotS.mockResolvedValue(true); });

describe('🔴 LOT S — definirCommissionneCompte', () => {
  it('administrateur : une requête qui écrit le choix ET sa ligne de journal (avant / après, auteur) ; rien si inchangé', async () => {
    h.q.mockResolvedValue({ rows: [{ id: '2', role: 'administrateur', change: true }] });
    expect(await m.definirCommissionneCompte(2, true, 7)).toEqual({ ok: true, change: true });
    const [sql, params] = h.q.mock.calls[0];
    const s = String(sql).replace(/\s+/g, ' ');
    expect(s).toContain("'changement_commissionne'");
    expect(s).toContain("avant.role = 'administrateur'");
    expect(params).toEqual([2, true, 7]);
    h.q.mockResolvedValue({ rows: [{ id: '2', role: 'administrateur', change: false }] });
    expect(await m.definirCommissionneCompte(2, true, 7)).toEqual({ ok: true, change: false });
  });
  it('un collaborateur : refusé (toujours commissionné) ; une valeur non booléenne : refusée sans requête ; sans la 441 : refus', async () => {
    h.q.mockResolvedValue({ rows: [{ id: '8', role: 'collaborateur', change: false }] });
    expect(await m.definirCommissionneCompte(8, false, 7)).toMatchObject({ ok: false });
    h.q.mockClear();
    expect(await m.definirCommissionneCompte(8, 'non', 7)).toMatchObject({ ok: false });
    expect(h.q).not.toHaveBeenCalled();
    h.lotS.mockResolvedValue(false);
    expect(await m.definirCommissionneCompte(2, false, 7)).toEqual({ ok: false, motif: m.MOTIF_SANS_441 });
  });
});
