import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mocks des dépendances de la route (mêmes spécificateurs que dans route.ts). On ne charge NI la vraie base, NI
// sharp, NI le vrai stockage : on teste l'ORCHESTRATION (ownership par jeton d'ÉMISSION, ordre, réponses).
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
const { verifierJetonEmission } = vi.hoisted(() => ({ verifierJetonEmission: vi.fn() }));
const { deposer, stockageConfigure } = vi.hoisted(() => ({ deposer: vi.fn(), stockageConfigure: vi.fn() }));
const { decoderBase64, estImage, degraderPhoto } = vi.hoisted(() => ({
  decoderBase64: vi.fn(),
  estImage: vi.fn(),
  degraderPhoto: vi.fn(),
}));

vi.mock('../../../lib/db/client', () => ({ query }));
vi.mock('../../../lib/internaute/jetonRectification', () => ({ verifierJetonEmission }));
vi.mock('../../../lib/stockage', () => ({ deposer, stockageConfigure }));
vi.mock('../../../lib/internaute/photoDepot', () => ({
  decoderBase64,
  estImage,
  degraderPhoto,
  MAX_ENTREE_OCTETS: 25 * 1024 * 1024,
}));

import { POST } from './route';

const req = (body: unknown) => ({ json: async () => body }) as unknown as Request;

/** Route `query` par SQL : dérivation de l'internauteId (SELECT) vs UPDATE photo_cle. */
function installerQuery(projetPresent: boolean) {
  query.mockImplementation(async (sql: string) => {
    if (/SELECT internaute_id FROM internaute_projet/.test(sql)) return { rows: projetPresent ? [{ internaute_id: 'internaute-A' }] : [] };
    if (/UPDATE internaute_projet SET photo_cle/.test(sql)) return { rows: [] };
    return { rows: [] };
  });
}

beforeEach(() => {
  query.mockReset();
  verifierJetonEmission.mockReset();
  deposer.mockReset();
  stockageConfigure.mockReset();
  decoderBase64.mockReset();
  estImage.mockReset();
  degraderPhoto.mockReset();
});

describe('POST /api/internaute/photo — ownership par jeton d’émission + orchestration', () => {
  it('jeton invalide/expiré OU de MAUVAIS SCOPE (rectification) → 401, aucune requête base', async () => {
    verifierJetonEmission.mockResolvedValue(null); // scope rectify-contact ou jeton pourri → null
    const res = await POST(req({ jeton: 'jwt', projetId: 42, photo: 'x' }));
    expect(res.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
    expect(deposer).not.toHaveBeenCalled();
  });

  it('projetId invalide → 422 (convention internaute : entrée invalide)', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    const res = await POST(req({ jeton: 'jwt', projetId: 'abc', photo: 'x' }));
    expect(res.status).toBe(422);
    expect(query).not.toHaveBeenCalled();
  });

  it('OWNERSHIP : projetId du corps (42) ≠ sub du jeton (99) → 403, aucune requête base, aucun dépôt', async () => {
    verifierJetonEmission.mockResolvedValue(99); // jeton pour un AUTRE projet
    const res = await POST(req({ jeton: 'jwt', projetId: 42, photo: 'data:...' }));
    expect(res.status).toBe(403);
    expect(query).not.toHaveBeenCalled(); // divergence détectée AVANT toute lecture base
    expect(deposer).not.toHaveBeenCalled();
  });

  it('projet absent (SELECT vide) → 403, aucun dépôt', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    installerQuery(false);
    const res = await POST(req({ jeton: 'jwt', projetId: 42, photo: 'data:...' }));
    expect(res.status).toBe(403);
    expect(deposer).not.toHaveBeenCalled();
    // seule la dérivation d'internauteId a eu lieu, jamais l'UPDATE
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toMatch(/SELECT internaute_id FROM internaute_projet/);
  });

  it('projet présent + contenu non-image → 422 (même classe qu’un corps invalide), pas de dépôt', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    installerQuery(true);
    decoderBase64.mockReturnValue(Buffer.from([1, 2, 3]));
    estImage.mockResolvedValue(false); // contenu non-image
    const res = await POST(req({ jeton: 'jwt', projetId: 42, photo: 'data:...' }));
    expect(res.status).toBe(422);
    expect(deposer).not.toHaveBeenCalled();
  });

  it('stockage non configuré → ok:true, depose:false (silencieux, aucun dépôt)', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    installerQuery(true);
    decoderBase64.mockReturnValue(Buffer.from('img'));
    estImage.mockResolvedValue(true);
    stockageConfigure.mockReturnValue(false);
    const res = await POST(req({ jeton: 'jwt', projetId: 42, photo: 'data:...' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, depose: false });
    expect(deposer).not.toHaveBeenCalled();
  });

  it('chemin nominal : internauteId DÉRIVÉ du projet → dégradation + dépôt scopé + UPDATE photo_cle', async () => {
    verifierJetonEmission.mockResolvedValue(42);
    installerQuery(true);
    decoderBase64.mockReturnValue(Buffer.from('brut'));
    estImage.mockResolvedValue(true);
    stockageConfigure.mockReturnValue(true);
    degraderPhoto.mockResolvedValue(Buffer.from('master-jpeg'));
    deposer.mockResolvedValue({ cle: 'internautes/internaute-A/photos/uuid.jpg', bucket: 'svav-dev', taille: 11, type: 'image/jpeg' });

    const res = await POST(req({ jeton: 'jwt', projetId: 42, photo: 'data:image/jpeg;base64,AAAA' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, depose: true });
    // dépôt du MASTER dégradé, scopé à l'internaute DÉRIVÉ DU PROJET (jamais du corps, jamais d'un id client)
    expect(deposer).toHaveBeenCalledWith(expect.any(Buffer), 'image/jpeg', { internauteId: 'internaute-A' });
    // UPDATE borné à l'id du projet (ownership déjà prouvée par le jeton), avec la clé retournée
    const updateCall = query.mock.calls.find((c) => /UPDATE internaute_projet SET photo_cle/.test(c[0] as string));
    expect(updateCall?.[1]).toEqual(['internautes/internaute-A/photos/uuid.jpg', 42]);
  });
});
