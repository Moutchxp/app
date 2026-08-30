import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * CASC-3 — POST /permis/cascade-partielle. On MOCKE la garde + l'orchestrateur : on teste le COMPORTEMENT de la route (garde admin,
 * validation demandeId/etape, relais du résultat, 422 métier, 503). L'envoi réel vit dans l'orchestrateur (testé par injection).
 */
vi.mock('../../../../../lib/admin/garde', () => ({ exigerAdministrateur: vi.fn() }));
vi.mock('../../../../../lib/veille/cascadePartielleRepo', () => ({ executerRelancePartielle: vi.fn(), depsReellesRelancePartielle: vi.fn(() => ({})) }));

import { POST } from './route';
import { exigerAdministrateur } from '../../../../../lib/admin/garde';
import { executerRelancePartielle } from '../../../../../lib/veille/cascadePartielleRepo';

const garde = exigerAdministrateur as unknown as ReturnType<typeof vi.fn>;
const exec = executerRelancePartielle as unknown as ReturnType<typeof vi.fn>;
const req = (body: unknown) => POST(new Request('http://test/api/admin/permis/cascade-partielle', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  garde.mockResolvedValue({ auteurId: 5 });
  exec.mockResolvedValue({ ok: true, destinataire: 'urba@mairie.fr', messageId: '<out@svav>' });
});

describe('CASC-3 — POST /permis/cascade-partielle', () => {
  it('non-administrateur → refus, aucun envoi', async () => {
    garde.mockResolvedValueOnce({ refus: Response.json({ erreur: 'INTERDIT' }, { status: 403 }) });
    expect((await req({ demandeId: 154, etape: 'relance', rang: 1, objet: 'o', corps: 'c' })).status).toBe(403);
    expect(exec).not.toHaveBeenCalled();
  });

  it('demandeId invalide → 400', async () => {
    expect((await req({ etape: 'relance', objet: 'o', corps: 'c' })).status).toBe(400);
    expect(exec).not.toHaveBeenCalled();
  });

  it('etape invalide → 400', async () => {
    expect((await req({ demandeId: 154, etape: 'saisine', objet: 'o', corps: 'c' })).status).toBe(400);
    expect(exec).not.toHaveBeenCalled();
  });

  it('relance valide → 200, orchestrateur appelé avec etape+rang', async () => {
    const res = await req({ demandeId: 154, etape: 'relance', rang: 2, objet: 'o', corps: 'c' });
    expect(res.status).toBe(200);
    expect(exec.mock.calls[0][1]).toMatchObject({ demandeId: 154, etape: 'relance', rang: 2 });
  });

  it('refus métier (ok:false) → 422', async () => {
    exec.mockResolvedValueOnce({ ok: false, motif: 'aucun message de mairie' });
    expect((await req({ demandeId: 154, etape: 'annonce', objet: 'o', corps: 'c' })).status).toBe(422);
  });

  it('échec interne (throw) → 503', async () => {
    exec.mockRejectedValueOnce(new Error('boom'));
    expect((await req({ demandeId: 154, etape: 'relance', rang: 1, objet: 'o', corps: 'c' })).status).toBe(503);
  });
});
