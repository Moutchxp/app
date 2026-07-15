import { describe, it, expect, beforeEach, vi } from 'vitest';

// Câblage best-effort : on teste l'orchestration (garde stockage, dépôt, UPDATE, avalement d'erreur) sans base,
// sans stockage réel, sans générateur réel.
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
const { deposer, stockageConfigure } = vi.hoisted(() => ({ deposer: vi.fn(), stockageConfigure: vi.fn() }));
const { genererCarteOrientation } = vi.hoisted(() => ({ genererCarteOrientation: vi.fn() }));

vi.mock('../db/client', () => ({ query }));
vi.mock('../stockage', () => ({ deposer, stockageConfigure }));
vi.mock('./orientationCarte', () => ({ genererCarteOrientation }));

import { publierCarteOrientation } from './publierCarteOrientation';

beforeEach(() => {
  query.mockReset();
  deposer.mockReset();
  stockageConfigure.mockReset();
  genererCarteOrientation.mockReset();
});

describe('publierCarteOrientation — best-effort, ne throw jamais', () => {
  it('stockage non configuré → silencieux : aucune génération, aucun dépôt, aucun UPDATE', async () => {
    stockageConfigure.mockReturnValue(false);
    await publierCarteOrientation('internaute-A', 7, 48.9, 2.26, 90);
    expect(genererCarteOrientation).not.toHaveBeenCalled();
    expect(deposer).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('nominal → génère, dépose (PNG scopé internaute), écrit la clé sur l’acheminement', async () => {
    stockageConfigure.mockReturnValue(true);
    genererCarteOrientation.mockResolvedValue(Buffer.from('png'));
    deposer.mockResolvedValue({ cle: 'internautes/internaute-A/cartes/uuid.png', bucket: 'b', taille: 3, type: 'image/png' });
    query.mockResolvedValue({ rows: [] });

    await publierCarteOrientation('internaute-A', 7, 48.9, 2.26, 90);

    expect(genererCarteOrientation).toHaveBeenCalledWith(48.9, 2.26, 90);
    expect(deposer).toHaveBeenCalledWith(expect.any(Buffer), 'image/png', { internauteId: 'internaute-A' });
    const upd = query.mock.calls.find((c) => /UPDATE certificat_acheminement SET carte_orientation_cle/.test(c[0] as string));
    expect(upd?.[1]).toEqual(['internautes/internaute-A/cartes/uuid.png', 7]);
  });

  it('génération en échec (carte trouée, réseau IGN) → avalé : aucun UPDATE, aucune exception', async () => {
    stockageConfigure.mockReturnValue(true);
    genererCarteOrientation.mockRejectedValue(new Error('WMTS HTTP 503'));
    await expect(publierCarteOrientation('internaute-A', 7, 48.9, 2.26, 90)).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled(); // la clé reste NULL, le certificat existe déjà
  });

  it('dépôt en échec → avalé (aucune exception, aucun UPDATE)', async () => {
    stockageConfigure.mockReturnValue(true);
    genererCarteOrientation.mockResolvedValue(Buffer.from('png'));
    deposer.mockRejectedValue(new Error('stockage indisponible'));
    await expect(publierCarteOrientation('internaute-A', 7, 48.9, 2.26, 90)).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled();
  });
});
