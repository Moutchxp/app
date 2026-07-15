import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mocks des dépendances de la route. On teste l'ORCHESTRATION (IDOR, convention de statut, mapping des statuts
// d'émission → HTTP) sans charger NI la base NI le pipeline.
const { verifierJetonRectification } = vi.hoisted(() => ({ verifierJetonRectification: vi.fn() }));
const { emettreCertificat } = vi.hoisted(() => ({ emettreCertificat: vi.fn() }));

vi.mock('../../lib/internaute/jetonRectification', () => ({ verifierJetonRectification }));
vi.mock('../../lib/db/certificatEmission', () => ({ emettreCertificat }));

import { POST } from './route';

const req = (body: unknown) => ({ json: async () => body }) as unknown as Request;

beforeEach(() => {
  verifierJetonRectification.mockReset();
  emettreCertificat.mockReset();
});

describe('POST /api/certificat — jeton & entrée (convention /api/internaute/*)', () => {
  it('jeton invalide/expiré → 401, aucune émission', async () => {
    verifierJetonRectification.mockResolvedValue(null);
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
    verifierJetonRectification.mockResolvedValue('internaute-A');
    const res = await POST(req({ jeton: 'jwt', projetId: 'abc' }));
    expect(res.status).toBe(422);
    expect(emettreCertificat).not.toHaveBeenCalled();
  });

  it('corps JSON illisible → 422', async () => {
    const res = await POST({ json: async () => { throw new Error('bad'); } } as unknown as Request);
    expect(res.status).toBe(422);
  });

  it('projetId en CHAÎNE numérique (bigserial) → accepté, coercé en number pour l’émission', async () => {
    verifierJetonRectification.mockResolvedValue('internaute-A');
    emettreCertificat.mockResolvedValue({ statut: 'emis', numero: 'SAVV-2026-000001', verdict: 'SANS_VIS_A_VIS' });
    const res = await POST(req({ jeton: 'jwt', projetId: '42' }));
    expect(res.status).toBe(200);
    expect(emettreCertificat).toHaveBeenCalledWith('internaute-A', 42);
  });
});

describe('POST /api/certificat — IDOR & mapping des statuts', () => {
  it('IDOR : l’internauteId passé à l’émission vient du JETON, jamais du corps', async () => {
    verifierJetonRectification.mockResolvedValue('internaute-DU-JETON');
    emettreCertificat.mockResolvedValue({ statut: 'emis', numero: 'SAVV-2026-000002', verdict: 'VIS_A_VIS' });
    // le corps tente d'injecter un autre internaute → doit être IGNORÉ
    await POST(req({ jeton: 'jwt', projetId: 7, internauteId: 'internaute-INJECTE' }));
    expect(emettreCertificat).toHaveBeenCalledWith('internaute-DU-JETON', 7);
  });

  it('projet non possédé (ownership KO) → 403', async () => {
    verifierJetonRectification.mockResolvedValue('internaute-B');
    emettreCertificat.mockResolvedValue({ statut: 'projet_absent' });
    const res = await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(res.status).toBe(403);
  });

  it('refus mode inconnu → 422 (raison mode_inconnu)', async () => {
    verifierJetonRectification.mockResolvedValue('internaute-A');
    emettreCertificat.mockResolvedValue({ statut: 'refus_mode_inconnu' });
    const res = await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, raison: 'mode_inconnu' });
  });

  it('refus verdict indéterminé → 422 (raison indetermine)', async () => {
    verifierJetonRectification.mockResolvedValue('internaute-A');
    emettreCertificat.mockResolvedValue({ statut: 'refus_indetermine' });
    const res = await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, raison: 'indetermine' });
  });

  it('refus VIS_A_VIS (hors périmètre) → 422 (raison vis_a_vis)', async () => {
    verifierJetonRectification.mockResolvedValue('internaute-A');
    emettreCertificat.mockResolvedValue({ statut: 'refus_vis_a_vis' });
    const res = await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, raison: 'vis_a_vis' });
  });

  it('émission nominale → 200, numéro + deja:false', async () => {
    verifierJetonRectification.mockResolvedValue('internaute-A');
    emettreCertificat.mockResolvedValue({ statut: 'emis', numero: 'SAVV-2026-000010', verdict: 'SANS_VIS_A_VIS' });
    const res = await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, numero: 'SAVV-2026-000010', verdict: 'SANS_VIS_A_VIS', deja: false });
  });

  it('IDEMPOTENCE : certificat déjà émis → 200, MÊME numéro, deja:true (pas d’erreur, pas de 2e document)', async () => {
    verifierJetonRectification.mockResolvedValue('internaute-A');
    emettreCertificat.mockResolvedValue({ statut: 'existant', numero: 'SAVV-2026-000010', verdict: 'SANS_VIS_A_VIS' });
    const res = await POST(req({ jeton: 'jwt', projetId: 42 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, numero: 'SAVV-2026-000010', deja: true });
  });
});
