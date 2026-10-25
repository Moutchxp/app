import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 🔴 Arno (25/10/2026, 425) — la route de l'annuaire : un PROPRIÉTAIRE ne se crée qu'avec son origine du contact (« Origine inconnue »
 * acceptée) ; un locataire, comme avant ; sans la 425, comme avant. Modifier l'origine passe la case « reporter » telle quelle.
 * Garde et dépôts simulés.
 */
vi.mock('server-only', () => ({}));
vi.mock('../../../../../lib/admin/garde', () => ({ exigerCompteActif: async () => null }));
vi.mock('../../../../../lib/db/client', () => ({ query: vi.fn(async () => ({ rows: [], rowCount: 0 })), withTransaction: vi.fn(), closePool: vi.fn() }));
vi.mock('../../../../../lib/gestion/auteur', () => ({ auteurDeLaRequete: async () => ({ id: 2, libelle: 'Arnaud Jorel' }) }));
vi.mock('../../../../../lib/admin/sessionServeur', () => ({ lireSessionCuration: async () => ({ jti: 'session-1' }) }));
const creerPersonne = vi.fn(async (..._a: unknown[]) => ({ etat: 'ok', data: { id: 99 } }));
vi.mock('../../../../../lib/gestion/annuaireEditionRepo', async (orig) => ({ ...(await orig<object>()), creerPersonne: (...a: unknown[]) => creerPersonne(...a) }));
let disponible = true;
const modifierOrigineProprietaire = vi.fn(async (..._a: unknown[]) => ({ etat: 'ok', data: { mot: 'Internet', reportees: 0 } }));
vi.mock('../../../../../lib/location/origineProprietaireRepo', async (orig) => ({
  ...(await orig<object>()),
  origineProprietaireDisponible: async () => disponible,
  modifierOrigineProprietaire: (...a: unknown[]) => modifierOrigineProprietaire(...a),
}));
const { POST } = await import('./route');
const poster = async (corps: Record<string, unknown>) => (await POST(new Request('http://localhost/api/admin/gestion/annuaire',
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) }))).json() as Promise<{ etat: string; motif?: string }>;
beforeEach(() => { creerPersonne.mockClear(); modifierOrigineProprietaire.mockClear(); disponible = true; });

describe('🔴 créer un propriétaire : l’origine du contact est obligatoire', () => {
  it('sans origine : refusé, rien n’est créé', async () => {
    expect(await poster({ action: 'creer', sujet: 'proprietaire', nom: 'DUPONT', champs: {} })).toMatchObject({ etat: 'refus' });
    expect(creerPersonne).not.toHaveBeenCalled();
  });
  it('« Origine inconnue — à compléter » : acceptée, écrite avec la fiche', async () => {
    expect(await poster({ action: 'creer', sujet: 'proprietaire', nom: 'DUPONT', champs: {}, origine: { origine: 'inconnue' } })).toMatchObject({ etat: 'ok' });
    expect(creerPersonne.mock.calls[0][3]).toMatchObject({ origine: { origine: 'inconnue' } });
  });
  it('un locataire, ou sans la 425 : comme avant', async () => {
    await poster({ action: 'creer', sujet: 'locataire', nom: 'MARTIN', champs: {} });
    disponible = false;
    await poster({ action: 'creer', sujet: 'proprietaire', nom: 'DUPONT', champs: {} });
    expect(creerPersonne.mock.calls.map((c) => c[3])).toEqual([undefined, undefined]);
  });
});

describe('🔴 modifier l’origine d’un propriétaire (fiche) : la case « reporter » telle quelle (décochée par défaut)', () => {
  it('reporter absent = non ; coché = oui', async () => {
    await poster({ action: 'origine-proprietaire', id: 7, origine: { origine: 'internet' } });
    await poster({ action: 'origine-proprietaire', id: 7, origine: { origine: 'internet' }, reporter: true });
    expect(modifierOrigineProprietaire.mock.calls.map((c) => [c[0], c[2]])).toEqual([[7, false], [7, true]]);
  });
});
