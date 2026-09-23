import { describe, it, expect, vi, beforeEach } from 'vitest';

const gardeMock = vi.fn();
vi.mock('../../../../../lib/admin/garde', () => ({ exigerCompteActif: (...a: unknown[]) => gardeMock(...a) }));
const rechercheMock = vi.fn();
vi.mock('../../../../../lib/gestion/recherche', async (importOriginal) => {
  const vrai = await importOriginal<typeof import('../../../../../lib/gestion/recherche')>();
  return { MAX_RESULTATS: vrai.MAX_RESULTATS, chercherEvenements: (...a: unknown[]) => rechercheMock(...a) };
});

import { GET } from './route';

/** LOT 4d-B1 — la recherche d'événement : une seule route pour les trois gestes qui désignent une carte. */
const requete = (q?: string) => new Request(`http://local/api/admin/gestion/evenements${q === undefined ? '' : `?q=${encodeURIComponent(q)}`}`);

beforeEach(() => {
  gardeMock.mockReset(); gardeMock.mockResolvedValue(null);
  rechercheMock.mockReset(); rechercheMock.mockResolvedValue([]);
});

describe('chercher un événement', () => {
  it('exige le droit « gestion » : les résultats portent des noms de locataires', async () => {
    await GET(requete('fuite'));
    expect(gardeMock.mock.calls[0][1]).toBe('gestion');
  });

  it('refus → aucune recherche', async () => {
    gardeMock.mockResolvedValue(new Response(null, { status: 403 }));
    expect((await GET(requete('fuite'))).status).toBe(403);
    expect(rechercheMock).not.toHaveBeenCalled();
  });

  it('transmet la saisie telle quelle', async () => {
    await GET(requete('Régularisation Dubé'));
    expect(rechercheMock.mock.calls[0][0]).toBe('Régularisation Dubé');
  });

  it('sans paramètre → recherche vide, qui rend la LISTE (le champ n’est pas une impasse)', async () => {
    await GET(requete());
    expect(rechercheMock.mock.calls[0][0]).toBe('');
  });

  it('rend les résultats et le maximum, sans cache partagé', async () => {
    rechercheMock.mockResolvedValue([{ id: 1, reference: 'GES-2026-000001', objet: 'Fuite', demandeur: 'Mme M.', adresseLibre: null, etat: 'a_traiter', nbFils: 2 }]);
    const res = await GET(requete('fuite'));
    const corps = await res.json() as { evenements: unknown[]; max: number };
    expect(corps.evenements).toHaveLength(1);
    expect(corps.max).toBeGreaterThan(0); // l'écran peut dire « affinez » quand la liste est pleine
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('panne → 503, jamais une liste vide qui ferait croire qu’aucune carte ne correspond', async () => {
    rechercheMock.mockRejectedValue(new Error('base indisponible'));
    const res = await GET(requete('fuite'));
    expect(res.status).toBe(503);
    expect((await res.json() as { evenements?: unknown }).evenements).toBeUndefined();
  });
});
