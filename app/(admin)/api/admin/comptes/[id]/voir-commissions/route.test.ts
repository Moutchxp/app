import { describe, it, expect, vi, beforeEach } from 'vitest';

/** LOCATION « Outils de suivi » (406) — « Voir les commissions » : RÉSERVÉ AUX ADMINISTRATEURS, seule `valeur` est lue. */
vi.mock('server-only', () => ({}));
const exigerAdministrateur = vi.fn();
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerAdministrateur: (...a: unknown[]) => exigerAdministrateur(...a) }));
const definirVoirCommissions = vi.fn();
vi.mock('../../../../../../lib/admin/voirCommissions', () => ({ definirVoirCommissions: (...a: unknown[]) => definirVoirCommissions(...a) }));
let disponible = true;
vi.mock('../../../../../../lib/admin/schemaDroits', () => ({ droitCommissionsDisponible: async () => disponible }));
const { POST } = await import('./route');

const appeler = (corps: unknown, id = '4') => POST(new Request('http://x', { method: 'POST', body: JSON.stringify(corps) }),
  { params: Promise.resolve({ id }) });

beforeEach(() => {
  disponible = true;
  exigerAdministrateur.mockReset().mockResolvedValue({ auteurId: 2 });
  definirVoirCommissions.mockReset().mockResolvedValue(true);
});

describe('POST /api/admin/comptes/[id]/voir-commissions', () => {
  it('🔴 un non-administrateur est refusé, rien n’est écrit', async () => {
    exigerAdministrateur.mockResolvedValue({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    expect((await appeler({ valeur: true })).status).toBe(403);
    expect(definirVoirCommissions).not.toHaveBeenCalled();
  });
  it('administrateur : la case est écrite avec son auteur ; seul `valeur` est lu', async () => {
    expect((await appeler({ valeur: true, role: 'administrateur' })).status).toBe(200);
    expect(definirVoirCommissions).toHaveBeenCalledWith(4, true, 2);
  });
  it('sans la migration 406 : 409, rien n’est écrit', async () => {
    disponible = false;
    expect((await appeler({ valeur: true })).status).toBe(409);
    expect(definirVoirCommissions).not.toHaveBeenCalled();
  });
  it('valeur non booléenne ⇒ 422 ; id invalide ⇒ 422 ; compte introuvable ⇒ 404', async () => {
    expect((await appeler({ valeur: 'oui' })).status).toBe(422);
    expect((await appeler({ valeur: true }, 'abc')).status).toBe(422);
    definirVoirCommissions.mockResolvedValue(false);
    expect((await appeler({ valeur: false })).status).toBe(404);
  });
});
