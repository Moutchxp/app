import { describe, it, expect, vi, beforeEach } from 'vitest';

const { exigerAdministrateur, lireJournalConnexions } = vi.hoisted(() => ({ exigerAdministrateur: vi.fn(), lireJournalConnexions: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../../../../../lib/admin/garde', () => ({ exigerAdministrateur }));
vi.mock('../../../../../lib/auth/journalConnexion', () => ({ lireJournalConnexions }));

import { GET } from './route';

const req = () => new Request('http://local/api/admin/audit/connexions');
beforeEach(() => { exigerAdministrateur.mockReset(); lireJournalConnexions.mockReset(); });

describe('GET /api/admin/audit/connexions (point 8)', () => {
  it('administrateur → les 200 dernières lignes', async () => {
    exigerAdministrateur.mockResolvedValue({ auteurId: 1 });
    lireJournalConnexions.mockResolvedValue({ disponible: true, lignes: [{ survenuLe: '2026-10-15T08:00:00.000Z', identifiant: 'a@x.fr', compteId: 1, resultat: 'succes', ipEmpreinte: null }] });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).lignes).toHaveLength(1);
    expect(lireJournalConnexions).toHaveBeenCalledWith(200);
  });

  it('non administrateur → le refus de la garde, sans rien lire', async () => {
    exigerAdministrateur.mockResolvedValue({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    expect((await GET(req())).status).toBe(403);
    expect(lireJournalConnexions).not.toHaveBeenCalled();
  });

  it('base en échec → 503 maîtrisé', async () => {
    exigerAdministrateur.mockResolvedValue({ auteurId: 1 });
    lireJournalConnexions.mockRejectedValue(new Error('down'));
    expect((await GET(req())).status).toBe(503);
  });
});
