import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * EspacePage (Commit C) — PROUVE (c) : sans session valide, l'espace REDIRIGE vers la connexion et NE CHARGE AUCUNE
 * donnée (pas de fuite). Avec session, il charge les données de l'internaute de SESSION, sans redirection. On mocke la
 * garde de page, les accès données et `redirect` (qui, comme dans Next, interrompt le rendu en levant).
 */
const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
const { internauteConnecteDepuisCookies } = vi.hoisted(() => ({ internauteConnecteDepuisCookies: vi.fn() }));
const { listerAnalyses, listerCertificats } = vi.hoisted(() => ({ listerAnalyses: vi.fn(), listerCertificats: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('../lib/internaute/gardeEspace', () => ({ internauteConnecteDepuisCookies }));
vi.mock('../lib/internaute/espace', () => ({ listerAnalyses, listerCertificats }));

import EspacePage from './page';

describe('EspacePage — garde serveur (Commit C)', () => {
  beforeEach(() => {
    redirect.mockClear();
    internauteConnecteDepuisCookies.mockReset();
    listerAnalyses.mockReset();
    listerCertificats.mockReset();
  });

  it('(c) sans session valide → redirige vers /espace/connexion, AUCUNE donnée chargée', async () => {
    internauteConnecteDepuisCookies.mockResolvedValue(null);
    await expect(EspacePage()).rejects.toThrow('REDIRECT:/espace/connexion');
    expect(redirect).toHaveBeenCalledWith('/espace/connexion');
    expect(listerAnalyses).not.toHaveBeenCalled(); // pas de fuite : rien n'est lu avant la garde
    expect(listerCertificats).not.toHaveBeenCalled();
  });

  it('session valide → charge les données de l’internaute de SESSION, aucune redirection', async () => {
    internauteConnecteDepuisCookies.mockResolvedValue('A');
    listerAnalyses.mockResolvedValue([]);
    listerCertificats.mockResolvedValue([]);
    const el = await EspacePage();
    expect(redirect).not.toHaveBeenCalled();
    expect(listerAnalyses).toHaveBeenCalledWith('A');
    expect(listerCertificats).toHaveBeenCalledWith('A');
    expect(el).toBeTruthy(); // un élément React est renvoyé (le rendu DOM n'est pas requis pour prouver la garde)
  });
});
