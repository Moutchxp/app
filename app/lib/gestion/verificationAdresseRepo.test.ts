import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 🔴🔴 (Arno, 16/11/2026, option C) la vérification d'une adresse ajoutée à une copropriété : base locale, puis service national, sinon refus. */
const h = vi.hoisted(() => ({ locales: [] as string[] }));
vi.mock('./parcelleRepo', () => ({ pointsBan: async () => ({ entrees: [], points: h.locales.map((cle) => ({ cle, x: 0, y: 0 })) }) }));
import { correspondExactement, motifIntrouvable, motifServiceMuet, verifierAdresses } from './verificationAdresseRepo';

const A = { libelle: '3 rue du Château', codePostal: '77300', commune: 'Fontainebleau' };
const reponse = (features: unknown[]) => vi.fn(async (_u: string, _i?: RequestInit) => ({ ok: true, json: async () => ({ features }) }) as unknown as Response);
beforeEach(() => { h.locales = []; });

describe('① la base locale', () => {
  it('trouvée localement : aucun appel au service national', async () => {
    h.locales = ['3 rue du chateau'];
    const appel = reponse([]);
    expect(await verifierAdresses([A], appel as unknown as typeof fetch)).toEqual({ ok: true });
    expect(appel).not.toHaveBeenCalled();
  });
});

describe('② le service national (celui des suggestions), pour une adresse introuvable localement', () => {
  it('🔒 seule l’adresse part ; une réponse EXACTE (voie et code postal) : acceptée', async () => {
    const appel = reponse([{ properties: { label: '3 Rue du Château 77300 Fontainebleau', name: '3 Rue du Château', postcode: '77300', city: 'Fontainebleau' } }]);
    expect(await verifierAdresses([A], appel as unknown as typeof fetch)).toEqual({ ok: true });
    expect(appel.mock.calls[0][0]).toBe('https://api-adresse.data.gouv.fr/search/?q=3%20rue%20du%20Ch%C3%A2teau%2077300%20Fontainebleau&limit=10');
  });
  it('une réponse approchante seulement (autre numéro, autre code postal) : REFUS « introuvable »', async () => {
    const appel = reponse([{ properties: { name: '5 Rue du Château', postcode: '77300', city: 'Fontainebleau' } }, { properties: { name: '3 Rue du Château', postcode: '77000', city: 'Melun' } }]);
    expect(await verifierAdresses([A], appel as unknown as typeof fetch)).toEqual({ ok: false, motif: motifIntrouvable(A) });
    expect(motifIntrouvable(A)).toContain('Rien n’est enregistré');
  });
  it('③ le service ne répond pas (panne, erreur) : REFUS clair, rien n’est enregistré', async () => {
    const panne = vi.fn(async () => { throw new TypeError('fetch failed'); });
    expect(await verifierAdresses([A], panne as unknown as typeof fetch)).toEqual({ ok: false, motif: motifServiceMuet(A) });
    const erreur = vi.fn(async () => ({ ok: false, json: async () => ({}) }) as unknown as Response);
    expect((await verifierAdresses([A], erreur as unknown as typeof fetch)).ok).toBe(false);
    expect(motifServiceMuet(A)).toContain('ne répond pas');
  });
  it('accents et casse ne font pas une autre adresse ; sans code postal, la ville tranche', () => {
    expect(correspondExactement({ libelle: '3 RUE DU CHATEAU', codePostal: '', commune: 'FONTAINEBLEAU' }, { name: '3 Rue du Château', postcode: '77300', city: 'Fontainebleau' })).toBe(true);
    expect(correspondExactement({ libelle: '3 rue du Château', codePostal: '', commune: 'Avon' }, { name: '3 Rue du Château', postcode: '77300', city: 'Fontainebleau' })).toBe(false);
  });
  it('aucune nouvelle adresse : rien à vérifier', async () => {
    const appel = reponse([]);
    expect(await verifierAdresses([], appel as unknown as typeof fetch)).toEqual({ ok: true });
    expect(appel).not.toHaveBeenCalled();
  });
});
