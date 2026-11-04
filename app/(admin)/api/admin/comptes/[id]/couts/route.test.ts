import { describe, it, expect, vi, beforeEach } from 'vitest';

/** 🔴 D37 (Arno, 04/11/2026, 454) — POST /api/admin/comptes/[id]/couts : la case « Les coûts », administrateur seulement, journalisée. */
const { exigerAdministrateur, definirDroitCouts, droitsD37Disponibles } = vi.hoisted(() => ({ exigerAdministrateur: vi.fn(), definirDroitCouts: vi.fn(), droitsD37Disponibles: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerAdministrateur }));
vi.mock('../../../../../../lib/admin/droitCouts', () => ({ definirDroitCouts }));
vi.mock('../../../../../../lib/admin/schemaDroits', () => ({ droitsD37Disponibles }));
import { POST } from './route';

const appel = (corps: unknown, id = '7') => POST(new Request('http://local/api/admin/comptes/7/couts', { method: 'POST', body: JSON.stringify(corps) }), { params: Promise.resolve({ id }) });
beforeEach(() => { exigerAdministrateur.mockReset(); definirDroitCouts.mockReset(); droitsD37Disponibles.mockReset().mockResolvedValue(true); exigerAdministrateur.mockResolvedValue({ auteurId: 2 }); });

describe('🔴 D37 — POST /api/admin/comptes/[id]/couts', () => {
  it('administrateur : la case est écrite (le compte, la valeur, l’auteur) → 200', async () => {
    definirDroitCouts.mockResolvedValue(true);
    const r = await appel({ valeur: false });
    expect(r.status).toBe(200);
    expect(definirDroitCouts).toHaveBeenCalledWith(7, false, 2);
  });
  it('non-administrateur : le refus de la garde, rien n’est écrit', async () => {
    exigerAdministrateur.mockResolvedValue({ refus: new Response(null, { status: 403 }) });
    expect((await appel({ valeur: true })).status).toBe(403);
    expect(definirDroitCouts).not.toHaveBeenCalled();
  });
  it('valeur absente ou identifiant invalide → 422 ; sans la migration 454 → 409 ; compte introuvable → 404', async () => {
    expect((await appel({ valeur: 'oui' })).status).toBe(422);
    expect((await appel({ valeur: true }, 'x')).status).toBe(422);
    droitsD37Disponibles.mockResolvedValue(false);
    expect((await appel({ valeur: true })).status).toBe(409);
    droitsD37Disponibles.mockResolvedValue(true); definirDroitCouts.mockResolvedValue(false);
    expect((await appel({ valeur: true })).status).toBe(404);
  });
});
