import { describe, expect, it } from 'vitest';
import { decouperAdresse, grouperBiensParAdresse } from './syndicLocation';

describe('🔴 détail du syndic : les biens gérés PAR ADRESSE, triés commune → voie → numéro', () => {
  it('découpe le numéro, son suffixe et la voie', () => {
    expect(decouperAdresse('12bis Rue des Lilas')).toEqual({ numero: 12, suffixe: 'bis', voie: 'rue des lilas' });
    expect(decouperAdresse('Allée Verte')).toEqual({ numero: null, suffixe: '', voie: 'allee verte' });
  });
  it('regroupe par adresse (celle du lot, sinon celle de la copropriété) et trie commune, voie, numéro ; lots par numéro', () => {
    const g = grouperBiensParAdresse([
      { libelle: '15 rue Carle Hebert', codePostal: '92400', commune: 'Courbevoie', lots: [
        { id: 2, numero: '406', adresse: '15 rue Carle Hebert', commune: 'Courbevoie', type: 'Appartement' },
        { id: 1, numero: '373', adresse: '15 rue Carle Hebert', commune: 'Courbevoie' },
        { id: 3, numero: '12', adresse: '17 rue Carle Hebert', commune: 'Courbevoie' }] },
      { libelle: '155 avenue Paul Vaillant Couturier', codePostal: '94250', commune: 'Gentilly', lots: [{ id: 4, numero: '58', adresse: null, commune: null }] },
      { libelle: '2 rue Carle Hebert', codePostal: '92400', commune: 'Courbevoie', lots: [] },
      { libelle: '25 rue Edith Cavell', codePostal: '92400', commune: 'Courbevoie', lots: [{ id: 5, numero: '219', adresse: '25 rue Edith Cavell', commune: 'Courbevoie' }] },
    ]);
    expect(g.map((x) => `${x.commune} · ${x.adresse}`)).toEqual([
      'Courbevoie · 2 rue Carle Hebert', 'Courbevoie · 15 rue Carle Hebert', 'Courbevoie · 17 rue Carle Hebert',
      'Courbevoie · 25 rue Edith Cavell', 'Gentilly · 155 avenue Paul Vaillant Couturier',
    ]);
    expect(g[1].lots.map((l) => l.numero)).toEqual(['373', '406']);
    expect(g[0].lots).toEqual([]);
  });
});

describe('🔴 détail du syndic : les contacts de CETTE adresse en tête', () => {
  it('copropriété et adresses secondaires = même immeuble ; associés d’abord, ordre de l’annuaire gardé', async () => {
    const { clesDeLAdresse, ordonnerContactsSyndic } = await import('./syndicLocation');
    const cles = clesDeLAdresse('15 rue carle hebert', [{ cle: '15 rue carle hebert', adresses: [{ cle: '17 rue carle hebert' }] }, { cle: '25 rue edith cavell' }]);
    expect([...cles].sort()).toEqual(['15 rue carle hebert', '17 rue carle hebert']);
    const l = ordonnerContactsSyndic([
      { nom: 'A', immeubles: ['25 rue edith cavell'] }, { nom: 'B', immeubles: ['17 rue carle hebert'] }, { nom: 'C', immeubles: [] }, { nom: 'D', immeubles: ['15 rue carle hebert'] },
    ], cles);
    expect(l.map((x) => `${x.contact.nom}${x.associe ? '*' : ''}`)).toEqual(['B*', 'D*', 'A', 'C']);
  });
});
