import { describe, it, expect } from 'vitest';
import {
  adressesEnAttente, biensAutomatiques, clesDuContexte, clientsAChoisir, familleDuClient, famillesDesPuces, fusionnerSuggestions,
  motifDuLien, type BienClient,
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
    // LOT PUCE-COHERENTE-AVEC-RATTACHEMENT-TOUTES-FAMILLES — un bien unique NON rattaché : contour, plus trame pleine.
    expect(classesPuce(familleDuClient('un@x.fr', BIENS, new Set()))).toBe(' red-pastille--famille red-pastille--locataire red-pastille--a-choisir');
    const plein = familleDuClient('un@x.fr', BIENS, new Set(['1']));
    expect(classesPuce(plein)).toBe(' red-pastille--famille red-pastille--locataire');
    const aChoisir = familleDuClient('trois@x.fr', BIENS, new Set());
    expect(classesPuce(aChoisir)).toBe(' red-pastille--famille red-pastille--proprietaire red-pastille--a-choisir');
    expect(infobullePuce('trois@x.fr', aChoisir)).toBe('X · Propriétaire — lié à 3 biens, aucun rattaché — choisissez avec « Rattacher » — trois@x.fr');
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

import { ciblesAPoserALEnvoi, marquerOrigines, recalculerCibles, clesDesClientsPresents } from './contexteClients';

describe('🔴🔴 LOT RATTACHEMENT-BIENS-SUIT-LES-ADRESSES — l’origine, le recalcul, le filet de l’envoi', () => {
  const B2 = { ...BIENS, 'seul@x.fr': [b('9', 'proprietaire')], 'loc2@x.fr': [b('1', 'locataire')] };
  const lot = (cle: string, origine?: 'client' | 'manuel' | 'a_determiner', manuelConfirme?: boolean) =>
    ({ sorte: 'lot', cle, ...(origine ? { origine } : {}), ...(manuelConfirme ? { manuelConfirme } : {}) });
  it('marquer : déjà connue ⇒ sa propre origine ; nouvelle ⇒ client / manuel / à déterminer ; événement intact', () => {
    expect(marquerOrigines([lot('2', 'client')], [lot('2'), lot('1'), lot('99'), { sorte: 'evenement', cle: 'E' }],
      ['trois@x.fr', 'un@x.fr'], B2)).toEqual([lot('2', 'client'), lot('1', 'client'), lot('99', 'manuel'), { sorte: 'evenement', cle: 'E' }]);
    expect(marquerOrigines([], [lot('1')], ['un@x.fr', 'pas-lu@x.fr'], B2)).toEqual([lot('1', 'a_determiner')]);
  });
  it('🔴 recalculer : le bien d’un client parti est RETIRÉ ; base et événement restent ; manuel signalé', () => {
    const r = recalculerCibles([lot('2', 'client'), lot('9', 'client'), lot('219'), lot('77', 'manuel')], ['seul@x.fr'], B2);
    expect(r.cibles.map((c) => c.cle)).toEqual(['9', '219', '77']);
    expect(r.retirees.map((c) => c.cle)).toEqual(['2']);
    expect(r.manuelsSansClient.map((c) => c.cle)).toEqual(['77']);
    expect(r.change).toBe(true);
  });
  it('deux clients du même bien : il reste tant qu’il en reste un', () => {
    expect(recalculerCibles([lot('1', 'client')], ['loc2@x.fr'], B2).cibles.map((c) => c.cle)).toEqual(['1']);
    expect(recalculerCibles([lot('1', 'client')], [], B2).cibles).toEqual([]);
  });
  it('une adresse présente pas encore lue : on ATTEND (rien n’est retiré), et « à déterminer » se tranche à la lecture', () => {
    expect(recalculerCibles([lot('2', 'client')], ['pas-lu@x.fr'], B2).cibles.map((c) => c.cle)).toEqual(['2']);
    expect(recalculerCibles([lot('1', 'a_determiner')], ['un@x.fr'], B2).cibles).toEqual([lot('1', 'client')]);
    expect(recalculerCibles([lot('55', 'a_determiner')], ['un@x.fr'], B2).cibles).toEqual([lot('55', 'manuel')]);
    expect(clesDesClientsPresents(['pas-lu@x.fr'], B2)).toBeNull();
  });
  it('🔴 le filet de l’envoi : jamais un bien sans adresse correspondante, sauf ajout manuel CONFIRMÉ ; la base passe', () => {
    const { gardees, ecartees } = ciblesAPoserALEnvoi(
      [lot('2', 'client'), lot('9', 'client'), lot('77', 'manuel'), lot('78', 'manuel', true), lot('55', 'a_determiner'), lot('219')],
      ['seul@x.fr'], B2);
    expect(gardees.map((c) => c.cle)).toEqual(['9', '78', '219']);
    expect(ecartees.map((c) => c.cle)).toEqual(['2', '77', '55']);
  });
});

describe('🔴🔴 LOT PUCE-COHERENTE-AVEC-RATTACHEMENT-TOUTES-FAMILLES — INVARIANT : aucune trame pleine sans bien rattaché', () => {
  const TONS = ['proprietaire', 'locataire', 'ancien_locataire', 'syndic', 'immeuble', 'neutre'] as const;
  const LIENS: BienClient['role'][] = ['proprietaire', 'locataire', 'ancien_locataire', 'rattache', 'syndic_contact', 'syndic', 'immeuble'];
  it('toute famille (ton × propre/rattaché) × tout lien × 1 ou 3 biens : contour sans bien rattaché, trame pleine avec', () => {
    for (const ton of TONS) for (const propre of [true, false]) for (const lien of LIENS) for (const n of [1, 3]) {
      const a = 'a@x.fr';
      const biens = { [a]: Array.from({ length: n }, (_x, i) => b(String(10 + i), lien)) };
      const familles = { [a]: { ton, propre, nom: null, role: 'R' } };
      const vide = famillesDesPuces(familles, [a], biens, new Set());
      expect(classesPuce(vide[a]), `${ton}/${propre}/${lien}/${n}`).toContain('red-pastille--a-choisir');
      const coche = famillesDesPuces(familles, [a], biens, new Set(['10']));
      expect(classesPuce(coche[a]), `${ton}/${propre}/${lien}/${n}`).not.toContain('a-choisir');
      expect(classesPuce(coche[a])).toContain('red-pastille--famille');
    }
  });
  it('biens pas encore lus : neutre (jamais une trame pleine sur la foi de la famille) ; liée à aucun bien : la famille telle quelle', () => {
    const f = { 'a@x.fr': { ton: 'syndic' as const, propre: true, nom: null, role: 'Syndic' } };
    expect(famillesDesPuces(f, ['a@x.fr'], {}, new Set())['a@x.fr']).toBeUndefined();
    expect(classesPuce(famillesDesPuces(f, ['a@x.fr'], { 'a@x.fr': [] }, new Set())['a@x.fr'])).toBe(' red-pastille--famille red-pastille--syndic');
  });
  it('une adresse de la liste d’un bien DU CONTEXTE : sa famille d’emblée', () => {
    const duContexte = { 'g@x.fr': { ton: 'immeuble' as const, propre: true, nom: null, role: 'Gardien' } };
    expect(famillesDesPuces({}, ['g@x.fr'], {}, new Set(), duContexte)['g@x.fr']).toEqual(duContexte['g@x.fr']);
  });
  it('en attente : dès UN bien non rattaché, sauf l’instant de l’ajout d’office ; un refus d’office attend', () => {
    const biens = { 'u@x.fr': [b('1', 'immeuble')], 'm@x.fr': [b('2', 'syndic'), b('3', 'syndic')], 'r@x.fr': [] };
    const adresses = ['u@x.fr', 'm@x.fr', 'r@x.fr'];
    expect(adressesEnAttente(adresses, biens, new Set(), { actif: true, refuses: new Set() }).map((x) => x.adresse)).toEqual(['m@x.fr']);
    expect(adressesEnAttente(adresses, biens, new Set(), { actif: false, refuses: new Set() }).map((x) => x.adresse)).toEqual(['u@x.fr', 'm@x.fr']);
    expect(adressesEnAttente(adresses, biens, new Set(), { actif: true, refuses: new Set(['u@x.fr|1']) }).map((x) => x.adresse)).toEqual(['u@x.fr', 'm@x.fr']);
    expect(adressesEnAttente(adresses, biens, new Set(['3']), { actif: false, refuses: new Set() }).map((x) => x.adresse)).toEqual(['u@x.fr']);
  });
  it('le motif de chaque lien', () => {
    expect(motifDuLien({ role: 'syndic_contact', nom: 'JOREL Arnaud' })).toBe('contact du syndic, suit la copropriété de ce bien — Arnaud JOREL');
    expect(motifDuLien({ role: 'rattache', nom: null })).toBe('e-mail rattaché à une partie de ce bien');
    expect(motifDuLien({ role: 'immeuble', nom: null })).toBe('contact de l’immeuble de ce bien');
  });
});
