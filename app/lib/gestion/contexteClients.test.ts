import { describe, it, expect } from 'vitest';
import {
  biensAutomatiques, clesDuContexte, clientsAChoisir, familleDuClient, fusionnerSuggestions, type BienClient,
} from './contexteClients';
import { rangerSuggestions } from './suggestionsBien';
import { classesPuce, infobullePuce } from './familleAdresse';

/** LOT NOUVEAU-MESSAGE-CONTEXTE-BIEN-PAR-CLIENT — les règles, PURES. */
const b = (cle: string, role: BienClient['role']): BienClient => ({ lotId: Number(cle), cle, libelle: `lot ${cle}`, categorie: 'logement', role, nom: 'X' });
const BIENS = {
  'un@x.fr': [b('1', 'locataire')],
  'trois@x.fr': [b('2', 'proprietaire'), b('3', 'proprietaire'), b('4', 'proprietaire')],
  'mixte@x.fr': [b('5', 'locataire'), b('6', 'proprietaire')],
  'ancien@x.fr': [b('7', 'ancien_locataire')],
  'rien@x.fr': [],
};

describe('a. bien unique : ajouté d’office, une fois, sauf refus', () => {
  it('le bien du client à bien unique, avec l’adresse qui l’amène ; jamais un bien déjà là ; jamais un refus', () => {
    expect(biensAutomatiques(['UN@x.fr', 'trois@x.fr', 'rien@x.fr', 'ancien@x.fr'], BIENS, new Set(), new Set()).map((x) => [x.bien.cle, x.adresse]))
      .toEqual([['1', 'un@x.fr'], ['7', 'ancien@x.fr']]);
    expect(biensAutomatiques(['un@x.fr'], BIENS, new Set(['1']), new Set())).toEqual([]);
    expect(biensAutomatiques(['un@x.fr'], BIENS, new Set(), new Set(['un@x.fr|1']))).toEqual([]);
  });
  it('les clés du contexte : les cibles « lot » seulement', () => {
    expect([...clesDuContexte([{ sorte: 'lot', cle: '1' }, { sorte: 'evenement', cle: 'E' }, { sorte: 'lot', cle: null }])]).toEqual(['1']);
  });
});

describe('b. plusieurs biens : à choisir', () => {
  it('les clients à plusieurs biens, dans l’ordre des champs, sans doublon', () => {
    expect(clientsAChoisir(['un@x.fr', 'trois@x.fr', 'mixte@x.fr', 'TROIS@x.fr'], BIENS).map((c) => [c.adresse, c.biens.length]))
      .toEqual([['trois@x.fr', 3], ['mixte@x.fr', 2]]);
  });
});

describe('l’aspect de la puce : trame pleine, contour plein (« à choisir »), et la couleur', () => {
  it('🔴 les trois aspects lisibles par la classe ; l’inconnue et le rattaché inchangés', () => {
    const plein = familleDuClient('un@x.fr', BIENS, new Set());
    expect(classesPuce(plein)).toBe(' red-pastille--famille red-pastille--locataire');
    const aChoisir = familleDuClient('trois@x.fr', BIENS, new Set());
    expect(classesPuce(aChoisir)).toBe(' red-pastille--famille red-pastille--proprietaire red-pastille--a-choisir');
    expect(infobullePuce('trois@x.fr', aChoisir)).toBe('X · Propriétaire — lié à 3 biens — choisissez le bien ci-dessous — trois@x.fr');
    expect(classesPuce(familleDuClient('trois@x.fr', BIENS, new Set(['3'])))).toBe(' red-pastille--famille red-pastille--proprietaire');
    expect(classesPuce(null)).toBe(' red-pastille--inconnue');
    expect(classesPuce({ ton: 'locataire', propre: false, nom: null, role: 'Garant' })).toBe(' red-pastille--famille red-pastille--locataire red-pastille--rattache');
    expect(familleDuClient('rien@x.fr', BIENS, new Set())).toBeNull();
    expect(familleDuClient('inconnu@x.fr', BIENS, new Set())).toBeNull();
  });
  it('client sous deux familles : propriétaire tant que rien n’est coché ; la couleur suit le bien coché', () => {
    expect(familleDuClient('mixte@x.fr', BIENS, new Set())?.ton).toBe('proprietaire');
    expect(familleDuClient('mixte@x.fr', BIENS, new Set(['5']))).toMatchObject({ ton: 'locataire', aChoisir: false });
    expect(familleDuClient('mixte@x.fr', BIENS, new Set(['5', '6']))?.ton).toBe('proprietaire');
  });
  it('ancien locataire : violet', () => {
    expect(familleDuClient('ancien@x.fr', BIENS, new Set())?.ton).toBe('ancien_locataire');
  });
});

describe('les suggestions de plusieurs biens, regroupées', () => {
  const liste = (id: string) => rangerSuggestions({
    clients: [{ adresse: `p${id}@x.fr`, nom: null, role: 'Propriétaire', ton: 'proprietaire', propre: true, civilite: null, nomFamille: null },
      { adresse: 'commun@x.fr', nom: null, role: 'Locataire', ton: 'locataire', propre: true, civilite: null, nomFamille: null }],
    immeuble: [{ adresse: `s${id}@x.fr`, nom: null, role: 'Syndic', ton: 'syndic', propre: true, civilite: null, nomFamille: null }],
  });
  it('un bien : ses groupes tels quels, sans intertitre ; aucun bien : rien', () => {
    expect(fusionnerSuggestions([{ libelle: 'A', groupes: liste('1') }])?.[0].lignes.map((l) => [l.adresse, l.bien])).toEqual([['p1@x.fr', undefined], ['commun@x.fr', undefined]]);
    expect(fusionnerSuggestions([])).toBeNull();
  });
  it('🔴 deux biens : ①②③ dans l’ordre, chaque ligne porte son bien, une adresse commune une seule fois (premier bien)', () => {
    const g = fusionnerSuggestions([{ libelle: 'A', groupes: liste('1') }, { libelle: 'B', groupes: liste('2') }]) ?? [];
    expect(g.map((x) => x.cle)).toEqual(['clients', 'immeuble', 'autres']);
    expect(g[0].lignes.map((l) => `${l.bien}:${l.adresse}`)).toEqual(['A:p1@x.fr', 'A:commun@x.fr', 'B:p2@x.fr']);
    expect(g[1].lignes.map((l) => `${l.bien}:${l.adresse}`)).toEqual(['A:s1@x.fr', 'B:s2@x.fr']);
  });
});
