import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (21/10/2026, 403) — la route de l'annuaire n'écarte la LOCATION SEULE que pour la vue de la GESTION :
 *   · `vue=gestion`, hors de la Location → `horsLocationSeule: true` (fiche propriétaire et recherche de personnes) ;
 *   · la même demande DEPUIS la Location (en-tête de contexte) → rien d'écarté ;
 *   · sans `vue=gestion` (sélecteurs de rattachement des mails…) → rien d'écarté : un bien reste proposé pour ses mails.
 * Garde et dépôt simulés.
 */
vi.mock('server-only', () => ({}));
vi.mock('../../../../../lib/admin/garde', () => ({ exigerCompteActif: async () => null }));
vi.mock('../../../../../lib/db/client', () => ({ query: vi.fn(async () => ({ rows: [], rowCount: 0 })), withTransaction: vi.fn(), closePool: vi.fn() }));
const ficheProprietaire = vi.fn(async (..._a: unknown[]) => ({ etat: 'ok', data: {} }));
const rechercherPersonnes = vi.fn(async (..._a: unknown[]) => ({ etat: 'ok', data: { personnes: [], tronque: false } }));
vi.mock('../../../../../lib/gestion/annuaireRepo', async (orig) => ({
  ...(await orig<object>()),
  ficheProprietaire: (...a: unknown[]) => ficheProprietaire(...a),
  rechercherPersonnes: (...a: unknown[]) => rechercherPersonnes(...a),
  dernierImport: async () => null,
}));
const { GET } = await import('./route');
const demande = (q: string, location = false) => new Request(`http://localhost/api/admin/gestion/annuaire?${q}`,
  { headers: location ? { 'x-svav-contexte': 'location' } : {} });
beforeEach(() => { ficheProprietaire.mockClear(); rechercherPersonnes.mockClear(); });

describe('🔴 vue de la Gestion : la location seule écartée, et seulement là', () => {
  it('fiche propriétaire', async () => {
    await GET(demande('proprietaire=49&vue=gestion'));
    await GET(demande('proprietaire=49&vue=gestion', true));
    await GET(demande('proprietaire=49'));
    expect(ficheProprietaire.mock.calls.map((c) => c[1])).toEqual([{ horsLocationSeule: true }, { horsLocationSeule: false }, { horsLocationSeule: false }]);
  });

  it('recherche de personnes (barre de l’annuaire vs sélecteurs de mails)', async () => {
    await GET(demande('q=dupont&vue=gestion'));
    await GET(demande('q=dupont'));
    await GET(demande('q=dupont&vue=gestion', true));
    expect(rechercherPersonnes.mock.calls.map((c) => (c[1] as { horsLocationSeule: boolean }).horsLocationSeule)).toEqual([true, false, false]);
  });
});
