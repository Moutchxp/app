import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * LOT A — POST /api/admin/permis/depot-presume. On MOCKE signalerDepotPresume (+ garde). COMPORTEMENT HTTP : garde 403,
 * validations 400, issue métier transmise en 200 (y compris 'verrou_commune' — pas une erreur), inattendu → 503 journalisé.
 */
vi.mock('../../../../../lib/admin/garde', () => ({ exigerAdministrateur: vi.fn() }));
vi.mock('../../../../../lib/veille/depotPresume', () => ({ signalerDepotPresume: vi.fn() }));

import { POST } from './route';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { signalerDepotPresume } from '../../../../../lib/veille/depotPresume';

const garde = exigerAdministrateur as unknown as ReturnType<typeof vi.fn>;
const signaler = signalerDepotPresume as unknown as ReturnType<typeof vi.fn>;
const post = (body: unknown) => POST(new Request('http://test/api/admin/permis/depot-presume', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));

beforeEach(() => { vi.clearAllMocks(); garde.mockResolvedValue({ auteurId: 5 }); });

describe('LOT A — POST depot-presume', () => {
  it('non-administrateur → 403, aucun signal', async () => {
    garde.mockResolvedValueOnce({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    expect((await post({ demandeId: 233, bouton: 'texte' })).status).toBe(403);
    expect(signaler).not.toHaveBeenCalled();
  });

  it('demandeId invalide → 400 ; bouton invalide → 400 (aucun appel repo)', async () => {
    expect((await post({ demandeId: 'x', bouton: 'texte' })).status).toBe(400);
    expect((await post({ demandeId: 233, bouton: 'autre' })).status).toBe(400);
    expect((await post({ demandeId: 233 })).status).toBe(400);
    expect(signaler).not.toHaveBeenCalled();
  });

  it('valide → 200, (demandeId, bouton) transmis, issue renvoyée', async () => {
    signaler.mockResolvedValueOnce('enregistre');
    const res = await post({ demandeId: 233, bouton: 'texte' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ issue: 'enregistre' });
    expect(signaler).toHaveBeenCalledWith(233, 'texte');
  });

  it('verrou commune (autre demande en vol) → 200 avec issue « verrou_commune » (fait métier, jamais une erreur)', async () => {
    signaler.mockResolvedValueOnce('verrou_commune');
    const res = await post({ demandeId: 999, bouton: 'ref' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ issue: 'verrou_commune' });
  });

  it('exception INATTENDUE → 503 APRÈS journalisation (jamais de catch muet)', async () => {
    signaler.mockRejectedValueOnce(Object.assign(new Error('relation manquante'), { code: '42P01' }));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await post({ demandeId: 233, bouton: 'texte' });
    expect(res.status).toBe(503);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
