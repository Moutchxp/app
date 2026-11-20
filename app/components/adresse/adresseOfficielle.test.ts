import { describe, expect, it, vi } from 'vitest';
import { adressesDepuisReponse, libelleAdresse, numeroEtIndice, sourceBan, urlRechercheAdresse } from './adresseOfficielle';

/** 🔴🔴 Arno (20/11/2026, lot 7a) — la source unique du navigateur et le format unique. */
const REPONSE = { features: [
  { properties: { id: '92026_7184_00054', label: '54 Avenue Puvis de Chavannes 92400 Courbevoie', name: '54 Avenue Puvis de Chavannes', housenumber: '54',
    postcode: '92400', citycode: '92026', city: 'Courbevoie', score: 0.97, x: 646000.5, y: 6865000.25 }, geometry: { coordinates: [2.25, 48.9] } },
  { properties: { id: '75111_1234_00012_bis', label: '12bis Rue de la Roquette 75011 Paris', name: '12bis Rue de la Roquette', housenumber: '12bis', postcode: '75011', citycode: '75111', city: 'Paris' } },
  { properties: { label: 'Rue de la Roquette 75011 Paris', name: 'Rue de la Roquette', postcode: '75011', city: 'Paris' } },
  { properties: {} },
] };

describe('le format unique', () => {
  it('chaque proposition rend identifiant BAN, libellé, numéro et indice, code postal, INSEE, commune, coordonnées ; une proposition vide est écartée', () => {
    const [a, b, c, ...reste] = adressesDepuisReponse(REPONSE);
    expect(a).toEqual({ banId: '92026_7184_00054', libelle: '54 Avenue Puvis de Chavannes 92400 Courbevoie', voie: '54 Avenue Puvis de Chavannes', numero: '54', indice: null,
      codePostal: '92400', insee: '92026', commune: 'Courbevoie', lat: 48.9, lon: 2.25, x: 646000.5, y: 6865000.25, score: 0.97 });
    expect([b.numero, b.indice, b.banId]).toEqual(['12', 'bis', '75111_1234_00012_bis']);
    expect([c.numero, c.indice, c.banId]).toEqual([null, null, null]);
    expect(reste).toEqual([]);
    expect(adressesDepuisReponse(null)).toEqual([]);
  });
  it('le numéro et son indice', () => {
    expect(numeroEtIndice('4 ter')).toEqual({ numero: '4', indice: 'ter' });
    expect(numeroEtIndice('7B')).toEqual({ numero: '7', indice: 'b' });
  });
  it('à l’écran : la fonction d’affichage unique (la valeur de la BAN n’est pas touchée)', () => {
    const [a] = adressesDepuisReponse(REPONSE);
    expect(libelleAdresse(a)).toBe('54 avenue Puvis de Chavannes, 92400 Courbevoie');
    expect(a.voie).toBe('54 Avenue Puvis de Chavannes');
    expect(libelleAdresse({ voie: '1 Villa Des Lilas 92400 COURBEVOIE', libelle: '1 Villa Des Lilas 92400 COURBEVOIE', codePostal: '', commune: '' })).toBe('1 villa des Lilas, 92400 Courbevoie');
  });
});

describe('la source unique', () => {
  it('l’API Adresse, avec la limite demandée', async () => {
    const appel = vi.fn(async () => ({ ok: true, json: async () => REPONSE }) as unknown as Response);
    const r = await sourceBan({ limite: 5, appel })('54 puvis', new AbortController().signal);
    expect((appel.mock.calls[0] as unknown[])[0]).toBe(urlRechercheAdresse('54 puvis', 5));
    expect(urlRechercheAdresse(' 54 puvis ', 5)).toBe('https://api-adresse.data.gouv.fr/search/?q=54%20puvis&limit=5&autocomplete=1');
    expect(r).toHaveLength(3);
  });
  it('l’API en panne : le repli ; une liste VIDE n’est pas une panne (pas de repli) ; sans repli, l’erreur remonte', async () => {
    const repli = vi.fn(async () => adressesDepuisReponse(REPONSE).slice(0, 1));
    const panne = vi.fn(async () => { throw new Error('réseau'); }) as unknown as typeof fetch;
    expect(await sourceBan({ limite: 7, repli, appel: panne })('x', new AbortController().signal)).toHaveLength(1);
    const vide = vi.fn(async () => ({ ok: true, json: async () => ({ features: [] }) }) as unknown as Response);
    repli.mockClear();
    expect(await sourceBan({ limite: 7, repli, appel: vide })('x', new AbortController().signal)).toEqual([]);
    expect(repli).not.toHaveBeenCalled();
    await expect(sourceBan({ limite: 7, appel: panne })('x', new AbortController().signal)).rejects.toThrow('réseau');
    const erreur = vi.fn(async () => ({ ok: false, status: 502, json: async () => ({}) }) as unknown as Response);
    expect(await sourceBan({ limite: 7, repli, appel: erreur })('x', new AbortController().signal)).toHaveLength(1);
  });
});
