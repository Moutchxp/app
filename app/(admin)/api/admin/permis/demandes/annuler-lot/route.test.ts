import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * D1 — POST /api/admin/permis/demandes/annuler-lot. On MOCKE annulerLot (+ garde) : ce fichier teste le COMPORTEMENT de la
 * route (garde admin, validation des ids, transmission de `autoriserPrete`, passe-plat du compte rendu). La logique
 * d'annulation est testée dans demandeRepoAnnulation.test.ts / demandeAnnulation.test.ts.
 */
vi.mock('../../../../../../lib/admin/garde', () => ({ exigerAdministrateur: vi.fn() }));
vi.mock('../../../../../../lib/sitadel/demandeRepo', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, annulerLot: vi.fn() };
});

import { POST } from './route';
import { exigerAdministrateur } from '../../../../../../lib/admin/garde';
import { annulerLot } from '../../../../../../lib/sitadel/demandeRepo';

const garde = exigerAdministrateur as unknown as ReturnType<typeof vi.fn>;
const annuler = annulerLot as unknown as ReturnType<typeof vi.fn>;
const post = (body: unknown) => POST(new Request('http://test/api/admin/permis/demandes/annuler-lot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  garde.mockResolvedValue({ auteurId: 5 });
  annuler.mockResolvedValue({ annulees: 2, permisLiberes: 7, refusees: [] });
});

describe('D1 — POST annuler-lot', () => {
  it('non-administrateur → 403, aucune annulation', async () => {
    garde.mockResolvedValueOnce({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    const res = await post({ ids: [1, 2] });
    expect(res.status).toBe(403);
    expect(annuler).not.toHaveBeenCalled();
  });

  it('ids invalides → 400, aucune annulation', async () => {
    const res = await post({ ids: [] });
    expect(res.status).toBe(400);
    expect(annuler).not.toHaveBeenCalled();
  });

  // 🔴 PART 3 — le geste de MASSE ne passe JAMAIS autoriserPrete=true par défaut → une prête n'est jamais emportée.
  it('sans autoriserPrete → annulerLot reçoit autoriserPrete=false (masse : jamais une prête)', async () => {
    await post({ ids: [1, 2, 3] });
    const args = annuler.mock.calls[0];
    expect(args[0]).toEqual([1, 2, 3]); // ids validés
    expect(args[1]).toBe('5');          // auteur
    expect(args[2]).toBe(false);        // autoriserPrete par défaut
  });

  it('autoriserPrete:true transmis (geste dédié à une prête)', async () => {
    await post({ ids: [42], autoriserPrete: true });
    expect(annuler.mock.calls[0][2]).toBe(true);
  });

  it('valeur non booléenne d’autoriserPrete → traitée comme false (jamais une prête par accident)', async () => {
    await post({ ids: [42], autoriserPrete: 'oui' });
    expect(annuler.mock.calls[0][2]).toBe(false);
  });

  it('compte rendu chiffré repassé tel quel au client', async () => {
    annuler.mockResolvedValueOnce({ annulees: 3, permisLiberes: 9, refusees: [{ id: 4, reference: 'SVAV-4', statut: 'envoyee', raison: 'demande déjà envoyée ou close — jamais annulable' }] });
    const body = await (await post({ ids: [1, 2, 3, 4] })).json();
    expect(body).toMatchObject({ annulees: 3, permisLiberes: 9 });
    expect(body.refusees).toHaveLength(1);
    expect(body.refusees[0].raison).toContain('jamais annulable');
  });

  it('exception inattendue → 503', async () => {
    annuler.mockRejectedValueOnce(new Error('db down'));
    expect((await post({ ids: [1] })).status).toBe(503);
  });
});
