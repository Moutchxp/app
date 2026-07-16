import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mocks des dépendances de la route. On teste l'ORCHESTRATION (ownership par jeton d'émission, statuts → HTTP)
// sans charger NI la base NI le pipeline.
const { verifierJetonEmission } = vi.hoisted(() => ({ verifierJetonEmission: vi.fn() }));
const { emettreCertificat } = vi.hoisted(() => ({ emettreCertificat: vi.fn() }));

vi.mock('../../lib/internaute/jetonRectification', () => ({ verifierJetonEmission }));
vi.mock('../../lib/db/certificatEmission', () => ({ emettreCertificat }));

import { POST } from './route';

const req = (body: unknown) => ({ json: async () => body }) as unknown as Request;

beforeEach(() => {
  verifierJetonEmission.mockReset();
  emettreCertificat.mockReset();
});

describe('POST /api/certificat — jeton d’émission & entrée', () => {
  it('jeton invalide/expiré/mauvais scope → 401, aucune émission', async () => {
    verifierJetonEmission.mockResolvedValue(null); // scope rectify-contact ou jeton pourri → null
    const res = await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(res.status).toBe(401);
    expect(emettreCertificat).not.toHaveBeenCalled();
  });

  it('jeton absent → 401', async () => {
    const res = await POST(req({ projetId: 42 }));
    expect(res.status).toBe(401);
    expect(emettreCertificat).not.toHaveBeenCalled();
  });

  it('projetId invalide → 422, aucune émission', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    const res = await POST(req({ jeton: 'jwt', projetId: 'abc' }));
    expect(res.status).toBe(422);
    expect(emettreCertificat).not.toHaveBeenCalled();
  });

  it('corps JSON illisible → 422', async () => {
    const res = await POST({ json: async () => { throw new Error('bad'); } } as unknown as Request);
    expect(res.status).toBe(422);
  });

  it('projetId en CHAÎNE numérique (bigserial) → accepté, coercé, émis', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    emettreCertificat.mockResolvedValue({ statut: 'emis', numero: 'SAVV-2026-000001', verdict: 'SANS_VIS_A_VIS', reference: 'SVAV-A-B' });
    const res = await POST(req({ jeton: 'jwt', projetId: '42' }));
    expect(res.status).toBe(200);
    expect(emettreCertificat).toHaveBeenCalledWith(42); // signature (projetId), plus d'internauteId
  });
});

describe('POST /api/certificat — OWNERSHIP (sub === projetId) & mapping des statuts', () => {
  it('OWNERSHIP : le sub du jeton (projet 99) ≠ projetId demandé (42) → 403, aucune émission', async () => {
    verifierJetonEmission.mockResolvedValue(99); // jeton pour un AUTRE projet
    const res = await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(res.status).toBe(403);
    expect(emettreCertificat).not.toHaveBeenCalled();
  });

  it('sub === projetId → émission autorisée avec CE projet', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    emettreCertificat.mockResolvedValue({ statut: 'emis', numero: 'SAVV-2026-000002', verdict: 'SANS_VIS_A_VIS', reference: 'SVAV-A-B' });
    await POST(req({ jeton: 'jwt', projetId: 42, internauteId: 'INJECTE-IGNORE' }));
    expect(emettreCertificat).toHaveBeenCalledWith(42); // le corps ne peut rien injecter : ownership vient du jeton
  });

  it('projet absent → 403', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    emettreCertificat.mockResolvedValue({ statut: 'projet_absent' });
    const res = await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(res.status).toBe(403);
  });

  it('refus mode inconnu → 422 (raison mode_inconnu)', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    emettreCertificat.mockResolvedValue({ statut: 'refus_mode_inconnu' });
    const res = await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, raison: 'mode_inconnu' });
  });

  it('refus verdict indéterminé → 422 (raison indetermine)', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    emettreCertificat.mockResolvedValue({ statut: 'refus_indetermine' });
    const res = await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, raison: 'indetermine' });
  });

  it('refus VIS_A_VIS (hors périmètre) → 422 (raison vis_a_vis)', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    emettreCertificat.mockResolvedValue({ statut: 'refus_vis_a_vis' });
    const res = await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, raison: 'vis_a_vis' });
  });

  it('émission nominale → 200, numéro + référence + deja:false', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    emettreCertificat.mockResolvedValue({ statut: 'emis', numero: 'SAVV-2026-000010', verdict: 'SANS_VIS_A_VIS', reference: 'SVAV-K7M2-9QX4' });
    const res = await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, numero: 'SAVV-2026-000010', reference: 'SVAV-K7M2-9QX4', verdict: 'SANS_VIS_A_VIS', deja: false });
  });

  it('IDEMPOTENCE : certificat déjà émis → 200, MÊME numéro + référence, deja:true', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    emettreCertificat.mockResolvedValue({ statut: 'existant', numero: 'SAVV-2026-000010', verdict: 'SANS_VIS_A_VIS', reference: 'SVAV-K7M2-9QX4' });
    const res = await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, numero: 'SAVV-2026-000010', reference: 'SVAV-K7M2-9QX4', deja: true });
  });
});
