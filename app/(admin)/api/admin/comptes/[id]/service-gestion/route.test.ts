import { describe, it, expect, vi, beforeEach } from 'vitest';

/** LOT PROFIL-GESTION — la case est RÉSERVÉE AUX ADMINISTRATEURS, et seule `valeur` (booléen) est lue. */
vi.mock('server-only', () => ({}));
const exigerAdministrateur = vi.fn();
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerAdministrateur: (...a: unknown[]) => exigerAdministrateur(...a) }));
const definirServiceGestion = vi.fn();
vi.mock('../../../../../../lib/admin/serviceGestion', () => ({ definirServiceGestion: (...a: unknown[]) => definirServiceGestion(...a) }));
vi.mock('../../../../../../lib/admin/schemaDroits', () => ({ serviceGestionDisponible: async () => true }));
const { POST } = await import('./route');

const appeler = (corps: unknown, id = '4') => POST(new Request('http://x', { method: 'POST', body: JSON.stringify(corps) }),
  { params: Promise.resolve({ id }) });

beforeEach(() => {
  exigerAdministrateur.mockReset().mockResolvedValue({ auteurId: 2 });
  definirServiceGestion.mockReset().mockResolvedValue(true);
});

describe('POST /api/admin/comptes/[id]/service-gestion', () => {
  it('🔴 un non-administrateur est refusé, rien n’est écrit', async () => {
    exigerAdministrateur.mockResolvedValue({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    expect((await appeler({ valeur: true })).status).toBe(403);
    expect(definirServiceGestion).not.toHaveBeenCalled();
  });
  it('administrateur : la case est écrite avec son AUTEUR (historisée)', async () => {
    expect((await appeler({ valeur: true, role: 'administrateur', perm_gestion: true })).status).toBe(200);
    expect(definirServiceGestion).toHaveBeenCalledWith(4, true, 2);                 // seul `valeur` est lu
  });
  it('valeur absente ou non booléenne ⇒ 422 ; id invalide ⇒ 422 ; compte introuvable ⇒ 404', async () => {
    expect((await appeler({ valeur: 'oui' })).status).toBe(422);
    expect((await appeler({})).status).toBe(422);
    expect((await appeler({ valeur: true }, 'abc')).status).toBe(422);
    definirServiceGestion.mockResolvedValue(false);
    expect((await appeler({ valeur: false })).status).toBe(404);
  });
});
