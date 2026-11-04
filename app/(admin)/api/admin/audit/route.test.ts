import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../lib/admin/garde', () => ({ exigerModuleD37: vi.fn() }));
vi.mock('../../../../lib/audit/lecture', () => ({ audit: vi.fn() }));

import * as route from './route';
import { exigerModuleD37 } from '../../../../lib/admin/garde';
import { audit } from '../../../../lib/audit/lecture';

const garde = exigerModuleD37 as unknown as ReturnType<typeof vi.fn>;
const auditFn = audit as unknown as ReturnType<typeof vi.fn>;
const req = (qs: string) => new Request(`http://test/api/admin/audit${qs}`);
const OK = '?debut=2026-01-01&fin=2026-01-31&grain=jour';

beforeEach(() => vi.clearAllMocks());

describe('GET /api/admin/audit — la case « Audit » (D37, relue en base par exigerModuleD37)', () => {
  it('non-administrateur (refus du garde) → 403 renvoyé tel quel, AUCUNE lecture', async () => {
    garde.mockResolvedValueOnce({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    const res = await route.GET(req(OK));
    expect(res.status).toBe(403);
    expect(auditFn).not.toHaveBeenCalled();
  });

  it('administrateur + fenêtre valide → 200 et audit appelé', async () => {
    garde.mockResolvedValueOnce({ auteurId: 5 });
    auditFn.mockResolvedValueOnce({ serie: [], totaux: { succes: 0, echecs: 0 }, pics: [], seuilPic: 20 });
    const res = await route.GET(req(OK));
    expect(res.status).toBe(200);
    expect(auditFn).toHaveBeenCalledWith({ debut: '2026-01-01', fin: '2026-01-31', grain: 'jour' });
    expect(garde.mock.calls.at(-1)?.[1]).toBe('audit'); // 🔴 D37 — la case « Audit »
  });

  it('fenêtre invalide → 400, sans lecture', async () => {
    garde.mockResolvedValue({ auteurId: 5 });
    for (const qs of ['?debut=hier&fin=2026-01-31&grain=jour', '?debut=2026-01-01&fin=2026-01-02&grain=heure']) {
      const res = await route.GET(req(qs));
      expect(res.status).toBe(400);
    }
    expect(auditFn).not.toHaveBeenCalled();
  });

  it('lecture en échec → 503 maîtrisé, jamais de fuite de détail', async () => {
    garde.mockResolvedValueOnce({ auteurId: 5 });
    auditFn.mockRejectedValueOnce(new Error('DB down'));
    const res = await route.GET(req(OK));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ erreur: 'audit indisponible' });
  });

  it('LECTURE SEULE — seule GET exportée (aucune méthode mutante)', () => {
    expect(typeof route.GET).toBe('function');
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect((route as Record<string, unknown>)[m]).toBeUndefined();
    }
  });
});
