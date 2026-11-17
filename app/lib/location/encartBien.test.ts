import { describe, expect, it } from 'vitest';
import { champsDuGroupe, changementsEncart, contactsSyndicDe, contactsSyndicEnTexte, entretiensEnTexte, libelleValeur, phraseChangement, valeursDepuis, type ValeursEncart } from './encartBien';
import type { ComplementsFiche } from './bienComplet';

/** 🔴 Arno (21/10/2026) — l'encart du bien modifiable sur place : champs par groupe et par famille, mots, changements. PUR. */
const vide: ValeursEncart = valeursDepuis({ etage: null, porte: null, numLotCopro: null, surfaceCarrezM2: null, surfaceExterieureM2: null }, {} as ComplementsFiche);
const toutes = { famille: 'logement' as const, annexe: false, avecIdFiscal: true, avecCharges: true, avecAg: true, avecEntretien: true };
const cles = (g: Parameters<typeof champsDuGroupe>[0], f: Parameters<typeof champsDuGroupe>[1]) => champsDuGroupe(g, f).map((c) => c.cle);

describe('🔴 les valeurs, lues à la source', () => {
  it('tout en texte : vide = « » ; oui / non ; nombres à la virgule ; « Non soumis » ; entretiens seulement si « à prévoir »', () => {
    const v = valeursDepuis({ etage: '3', porte: 'G', numLotCopro: '12', surfaceCarrezM2: 41.8, surfaceExterieureM2: null }, {
      meuble: false, ascenseur: true, digicode: null, surfaceHabitableM2: 44.25, dpeNonSoumis: true, dpeClasse: 'D', dpeDate: '2024-01-02',
      entretienAPrevoir: false, entretiens: [{ sorte: 'chaudiere', nom: null, dateAnniversaire: '2026-11-01' }], syndicId: 7, syndicNom: 'Foncia',
    } as unknown as ComplementsFiche);
    expect([v.etage, v.porte, v.surfaceCarrezM2, v.surfaceExterieureM2, v.surfaceHabitableM2]).toEqual(['3', 'G', '41,8', '', '44,25']);
    expect([v.meuble, v.ascenseur, v.digicode]).toEqual(['non', 'oui', '']);
    expect([v.dpeClasse, v.dpeDate]).toEqual(['non_soumis', '']);
    expect(v.entretiens).toBe('[]');
    expect([v.syndicId, v.syndicNom]).toEqual(['7', 'Foncia']);
    expect(vide.commentaire).toBe('');
  });

  it('les entretiens : deux saisies égales donnent le même texte (nom seulement pour « autre », vide → null)', () => {
    expect(entretiensEnTexte([{ sorte: 'chaudiere', nom: 'x', dateAnniversaire: '' }])).toBe('[{"sorte":"chaudiere","nom":null,"dateAnniversaire":null}]');
    expect(entretiensEnTexte([{ sorte: 'autre', nom: '  VMC ', dateAnniversaire: '2026-05-01' }])).toBe('[{"sorte":"autre","nom":"VMC","dateAnniversaire":"2026-05-01"}]');
  });
});

describe('🔴 les champs de chaque groupe, selon la famille (règles de « Nouveau bien »)', () => {
  it('Caractéristiques : logement / local / parking', () => {
    expect(cles('caracteristiques', toutes)).toEqual(['typeLogement', 'meuble', 'nombrePieces', 'etage', 'surfaceHabitableM2', 'surfaceCarrezM2',
      'surfaceExterieureM2', 'epoqueConstruction', 'chauffage']);
    expect(cles('caracteristiques', { ...toutes, famille: 'local' })).toEqual(['typeLocal', 'nombrePieces', 'etage', 'surfaceHabitableM2', 'surfaceCarrezM2',
      'surfaceExterieureM2', 'epoqueConstruction', 'chauffage']);
    expect(cles('caracteristiques', { ...toutes, famille: 'parking' })).toEqual(['parkingSituation', 'parkingType', 'etage', 'porte', 'surfaceM2']);
    expect(champsDuGroupe('caracteristiques', { ...toutes, famille: 'local' }).find((c) => c.cle === 'nombrePieces')?.mot).toBe('Bureaux / pièces');
  });

  it('Situation : le N° de porte n’y est pas pour un parking (il est sa « N° de place ») ; le digicode et son code', () => {
    expect(cles('situation', toutes)).toEqual(['batiment', 'escalier', 'porte', 'precisionAcces', 'ascenseur', 'digicode', 'digicodeCode']);
    expect(cles('situation', { ...toutes, famille: 'parking' })).not.toContain('porte');
  });

  it('Copropriété : ID fiscal et charges hors annexe et selon ce que la fiche montre ; AG si applicable', () => {
    expect(cles('copropriete', toutes)).toEqual(['numLotCopro', 'idFiscal', 'syndicId', 'syndicContacts', 'chargesCopro', 'derniereAg']);
    expect(cles('copropriete', { ...toutes, annexe: true })).toEqual(['numLotCopro', 'syndicId', 'syndicContacts', 'derniereAg']);
    expect(cles('copropriete', { ...toutes, avecIdFiscal: false, avecCharges: false, avecAg: false })).toEqual(['numLotCopro', 'syndicId', 'syndicContacts']);
  });

  it('DPE et entretiens ; Commentaire', () => {
    expect(cles('dpe', toutes)).toEqual(['dpeClasse', 'dpeDate', 'entretienAPrevoir', 'entretiens']);
    expect(cles('dpe', { ...toutes, avecEntretien: false })).toEqual(['dpeClasse', 'dpeDate']);
    expect(cles('commentaire', toutes)).toEqual(['commentaire']);
  });
});

describe('🔴 « Champ : ancienne valeur → nouvelle valeur »', () => {
  const champs = champsDuGroupe('caracteristiques', toutes);
  const avant: ValeursEncart = { ...vide, typeLogement: 'appartement', meuble: 'non', surfaceCarrezM2: '41,8', etage: '3' };

  it('rien de changé → vide ; les blancs de bord et « . » / « , » d’un nombre ne comptent pas', () => {
    expect(changementsEncart(champs, avant, { ...avant })).toEqual([]);
    expect(changementsEncart(champs, avant, { ...avant, surfaceCarrezM2: ' 41.8 ', etage: '3 ' })).toEqual([]);
  });

  it('les changements en mots, dans l’ordre des champs', () => {
    const c = changementsEncart(champs, avant, { ...avant, typeLogement: 'studio', meuble: 'oui', surfaceCarrezM2: '', etage: '4' });
    expect(c.map(phraseChangement)).toEqual(['Type de logement : Appartement → Studio', 'Meublé : non → oui', 'Étage : 3 → 4',
      'Surface Carrez / Boutin : 41,8 m² → non renseigné']);
  });

  it('les mots : syndic par son nom, DPE non soumis, dates en jj/mm/aaaa, charges, entretiens', () => {
    const copro = champsDuGroupe('copropriete', toutes); const dpe = champsDuGroupe('dpe', toutes);
    const ch = (l: typeof copro, k: string) => l.find((x) => x.cle === k)!;
    expect(libelleValeur(ch(copro, 'syndicId'), { ...vide, syndicId: '7', syndicNom: 'Foncia' })).toBe('Foncia');
    expect(libelleValeur(ch(copro, 'syndicId'), vide)).toBe('non renseigné');
    expect(libelleValeur(ch(copro, 'chargesCopro'), { ...vide, chargesCopro: 'agence' })).toBe('payées par l’agence');
    expect(libelleValeur(ch(copro, 'derniereAg'), { ...vide, derniereAg: '2026-06-15' })).toBe('15/06/2026');
    expect(libelleValeur(ch(dpe, 'dpeClasse'), { ...vide, dpeClasse: 'non_soumis' })).toBe('Non soumis');
    expect(libelleValeur(ch(dpe, 'entretiens'), { ...vide, entretiens: '[]' })).toBe('aucun');
    expect(libelleValeur(ch(dpe, 'entretiens'), { ...vide, entretiens: entretiensEnTexte([{ sorte: 'chaudiere', dateAnniversaire: '2026-11-01' }, { sorte: 'autre', nom: 'VMC' }]) }))
      .toBe('Chaudière (01/11/2026) · VMC');
  });
});

describe('🔴 les contacts du syndic désignés ou créés pour ce bien (comme « Nouveau bien »)', () => {
  const ch = champsDuGroupe('copropriete', toutes).find((c) => c.cle === 'syndicContacts')!;
  it('rien → « » (égal à la lecture) ; illisible → rien ; le texte et sa lecture font l’aller-retour', () => {
    expect(contactsSyndicEnTexte({ contactsIds: [], nouveauxContacts: [] })).toBe('');
    expect(contactsSyndicDe('{oups')).toEqual({ contactsIds: [], nouveauxContacts: [] });
    const t = contactsSyndicEnTexte({ contactsIds: [4, 9], nouveauxContacts: [{ prenom: 'Léa', nom: 'Durand', email: 'l@x.test' }] });
    expect(contactsSyndicDe(t)).toEqual({ contactsIds: [4, 9], nouveauxContacts: [{ prenom: 'Léa', nom: 'Durand', email: 'l@x.test' }] });
  });
  it('en mots : « aucun ajout » ; « 2 contacts désignés, Léa Durand (nouveau) »', () => {
    expect(libelleValeur(ch, vide)).toBe('aucun ajout');
    expect(libelleValeur(ch, { ...vide, syndicContacts: contactsSyndicEnTexte({ contactsIds: [4, 9], nouveauxContacts: [{ prenom: 'Léa', nom: 'Durand' }] }) }))
      .toBe('2 contacts désignés, Léa Durand (nouveau)');
    expect(libelleValeur(ch, { ...vide, syndicContacts: contactsSyndicEnTexte({ contactsIds: [4], nouveauxContacts: [] }) })).toBe('1 contact désigné');
  });
});

describe('🔴🔴 (« Digicodes unifiés », lot 4, accord d’Arno — liste d, point 5) avec la 478 : le digicode de l’encart en AFFICHAGE SEUL', () => {
  const f = { famille: 'logement' as const, annexe: false, avecIdFiscal: false, avecCharges: false, avecAg: false, avecEntretien: false };
  it('« Digicode » et « Code du digicode » ne se saisissent plus dans l’encart (le composant unique les porte) ; le reste de « Situation » est inchangé', () => {
    expect(cles('situation', f)).toEqual(['batiment', 'escalier', 'porte', 'precisionAcces', 'ascenseur', 'digicode', 'digicodeCode']);
    // 🔴 (Arno, 17/11/2026) avec la 478 : une seule ligne « Bâtiment / cage d’escalier » (l'escalier n'est plus saisi)
    expect(cles('situation', { ...f, digicodesUnifies: true })).toEqual(['batiment', 'porte', 'precisionAcces', 'ascenseur']);
  });
  it('🔴 (Arno, 17/11/2026) le récapitulatif des modifications : « Bâtiment / cage d’escalier », le bâtiment ou, à défaut, l’ancien escalier', () => {
    const ch = champsDuGroupe('situation', { ...f, digicodesUnifies: true }).find((c) => c.cle === 'batiment')!;
    expect(ch.mot).toBe('Bâtiment / cage d’escalier');
    const v = (o: Record<string, string>) => o as unknown as ValeursEncart;
    expect(changementsEncart([ch], v({ batiment: '', escalier: '2' }), v({ batiment: 'B', escalier: '2' }))).toEqual([{ cle: 'batiment', champ: 'Bâtiment / cage d’escalier', avant: '2', apres: 'B' }]);
  });
});
