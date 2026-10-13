import { describe, it, expect } from 'vitest';
import {
  civilitesDesSuggestions, filtrerSuggestions, rangerSuggestions, roleAffiche, sansAccents, type SuggestionAdresse,
} from './suggestionsBien';

/**
 * ══ 🔴🔴 LOT MAIL-DEPUIS-BIEN-RATTACHEMENT-ET-SUGGESTIONS — LES ADRESSES PROPOSÉES (PUR) ══════════════════════════════
 * Les trois groupes dans l'ordre, une adresse une seule fois, le filtre sans accents ni casse, les adresses déjà
 * ajoutées exclues.
 */
const l = (adresse: string, o: Partial<SuggestionAdresse> = {}): SuggestionAdresse => ({
  adresse, nom: null, role: 'r', ton: 'neutre', propre: true, civilite: null, nomFamille: null, ...o,
});

describe('les trois groupes', () => {
  it('toujours dans l’ordre CLIENTS, IMMEUBLE, AUTRES, avec leurs intertitres — même vides', () => {
    const g = rangerSuggestions({ autres: [l('z@x.fr')], clients: [l('a@x.fr')] });
    expect(g.map((x) => [x.cle, x.titre])).toEqual([
      ['clients', 'Clients de l’agence'], ['immeuble', 'Immeuble'], ['autres', 'Autres adresses liées au bien']]);
    expect(g[1].lignes).toEqual([]);
  });
  it('une adresse n’apparaît qu’une fois : la première place gagne (un client n’est jamais redit en « autre »)', () => {
    const g = rangerSuggestions({
      clients: [l('A@x.fr', { ton: 'proprietaire' })], immeuble: [l('a@x.fr', { ton: 'syndic' }), l('g@x.fr')],
      autres: [l('g@x.fr'), l('n@x.fr')],
    });
    expect(g.map((x) => x.lignes.map((y) => y.adresse))).toEqual([['a@x.fr'], ['g@x.fr'], ['n@x.fr']]);
    expect(g[0].lignes[0].ton).toBe('proprietaire');
  });
  it('l’ordre À L’INTÉRIEUR d’un groupe est celui reçu (propriétaires, puis locataires : la lecture le fixe)', () => {
    const g = rangerSuggestions({ clients: [l('p@x.fr', { ton: 'proprietaire' }), l('l@x.fr', { ton: 'locataire' })] });
    expect(g[0].lignes.map((x) => x.ton)).toEqual(['proprietaire', 'locataire']);
  });
});

describe('le filtre de la frappe', () => {
  const G = rangerSuggestions({
    clients: [l('jean.dupont@x.fr', { nom: 'DUPONT Jean', ton: 'proprietaire' }), l('lea@x.fr', { nom: 'Léa Hélène', ton: 'locataire' })],
    immeuble: [l('gardien@x.fr', { nom: 'Rose', role: 'Gardien', ton: 'immeuble' })],
    autres: [l('autre@y.fr')],
  });
  it('sans rien taper : tout', () => {
    expect(filtrerSuggestions(G, '', []).map((g) => g.lignes.length)).toEqual([2, 1, 1]);
  });
  it('sur le nom OU l’adresse, sans tenir compte des accents ni de la casse', () => {
    expect(filtrerSuggestions(G, 'HELENE', []).flatMap((g) => g.lignes.map((x) => x.adresse))).toEqual(['lea@x.fr']);
    expect(filtrerSuggestions(G, 'dupont@', []).flatMap((g) => g.lignes.map((x) => x.adresse))).toEqual(['jean.dupont@x.fr']);
    expect(filtrerSuggestions(G, 'léa', []).flatMap((g) => g.lignes.map((x) => x.adresse))).toEqual(['lea@x.fr']);
    expect(filtrerSuggestions(G, 'gardien', []).flatMap((g) => g.lignes.map((x) => x.adresse))).toEqual(['gardien@x.fr']);
  });
  it('un groupe vidé par le filtre disparaît (pas d’intertitre au-dessus de rien)', () => {
    expect(filtrerSuggestions(G, 'autre@', []).map((g) => g.cle)).toEqual(['autres']);
    expect(filtrerSuggestions(G, 'introuvable', [])).toEqual([]);
  });
  it('une adresse déjà présente dans À, Cc ou Cci n’est plus proposée (casse comprise)', () => {
    const r = filtrerSuggestions(G, '', ['Jean.Dupont@x.fr', 'gardien@x.fr']);
    expect(r.flatMap((g) => g.lignes.map((x) => x.adresse))).toEqual(['lea@x.fr', 'autre@y.fr']);
  });
  /* 🔴 LOT DEUX-ECARTS-SUGGESTIONS (écart 748023a5) — le nom du cabinet, visible et cherchable. */
  it('taper le nom du cabinet propose ses contacts ET son e-mail général', () => {
    const S = rangerSuggestions({
      immeuble: [
        l('resp@cab.fr', { nom: 'Arnaud JOREL', role: 'Syndic — Responsable de copropriété', cabinet: 'TEST ARNAUD', ton: 'syndic' }),
        l('compta@cab.fr', { nom: 'Mathis BERCIER', role: 'Syndic — Service comptabilité', cabinet: 'TEST ARNAUD', ton: 'syndic' }),
        l('contact@cab.fr', { nom: 'TEST ARNAUD', role: 'Syndic — TEST ARNAUD', ton: 'syndic' }),
        l('gardien@x.fr', { nom: 'Rose', role: 'Gardien', ton: 'immeuble' }),
      ],
      autres: [l('autre@y.fr')],
    });
    expect(filtrerSuggestions(S, 'test arn', []).flatMap((g) => g.lignes.map((x) => x.adresse)))
      .toEqual(['resp@cab.fr', 'compta@cab.fr', 'contact@cab.fr']);
    expect(filtrerSuggestions(S, 'rose', []).flatMap((g) => g.lignes.map((x) => x.adresse))).toEqual(['gardien@x.fr']);
  });
  it('roleAffiche : « rôle · cabinet » pour un contact de syndic, le rôle seul sinon (rien d’autre ne change)', () => {
    expect(roleAffiche({ role: 'Syndic — Responsable de copropriété', cabinet: 'TEST ARNAUD' }))
      .toBe('Syndic — Responsable de copropriété · TEST ARNAUD');
    expect(roleAffiche({ role: 'Syndic — TEST ARNAUD' })).toBe('Syndic — TEST ARNAUD');
    expect(roleAffiche({ role: 'Gardien', cabinet: '  ' })).toBe('Gardien');
    expect(roleAffiche({ role: 'Propriétaire' })).toBe('Propriétaire');
  });
  it('sansAccents', () => {
    expect(sansAccents('  Léa   HÉLÈNE ')).toBe('lea helene');
  });
});

describe('les civilités pour la formule d’appel', () => {
  it('les contacts nommés seulement : ni l’e-mail général du syndic, ni les « autres adresses »', () => {
    const G = rangerSuggestions({
      clients: [l('p@x.fr', { ton: 'proprietaire', civilite: 'M.', nomFamille: 'DUPONT' })],
      immeuble: [l('s@x.fr', { ton: 'syndic', nom: 'Cabinet' }), l('c@x.fr', { ton: 'syndic', civilite: 'Mme', nomFamille: 'Durand' })],
      autres: [l('a@x.fr')],
    });
    expect(civilitesDesSuggestions(G)).toEqual({
      'p@x.fr': { civilite: 'M.', nom: 'DUPONT' }, 'c@x.fr': { civilite: 'Mme', nom: 'Durand' } });
  });
});
