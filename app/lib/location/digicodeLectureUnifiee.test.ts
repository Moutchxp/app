import { describe, expect, it, vi } from 'vitest';
vi.mock('../db/client', () => ({ query: async () => ({ rows: [] }), withTransaction: async () => null }));
import { versDigicodeLu } from './digicodeImmeubleRepo';
import { lignesDuLot, type LotSource } from './mailNouvelleLocation';
import { lignesEncart } from './sortieLocataires';
import { motChangementAVenir } from '../gestion/digicodes';
import type { DigicodesDuBien } from '../gestion/digicodesRepo';

/** 🔴🔴 Arno (16/11/2026, « Digicodes unifiés », lot 2) — les lecteurs lisent le code EN VIGUEUR, et disent le changement prévu. */
const A = { voie: '12 rue des Lilas', codePostal: '75011', commune: 'PARIS' };
const code = (c: string | null, source: 'unifie' | 'ancien' = 'unifie', o: Record<string, unknown> = {}) =>
  ({ valeur: { digicode: c === null ? false : true, code: c }, source, ligne: null, depuis: null, aArbitrer: [], origines: source === 'ancien' ? ['adresse x'] : [], ...o });
const D = (o: Partial<DigicodesDuBien>): DigicodesDuBien => ({ adresseCle: 'residence les tilleuls', adresse: 'Résidence Les Tilleuls', batiment: null, commun: null, codeBatiment: null, aVenir: [],
  nbBiensAdresse: 3, nbBiensBatiment: 2, ...o });

describe('la valeur lue (même forme qu’avant)', () => {
  it('le code du BÂTIMENT du bien s’il est connu, sinon le code commun (« code général ») ; la mention dit lequel', () => {
    const b = { cle: 'b', libelle: 'B', lie: true };
    expect(versDigicodeLu(D({ batiment: b, commun: code('1111') as never, codeBatiment: code('B22') as never }), A)).toMatchObject({ code: 'B22', portee: 'batiment', batiment: 'B', source: 'immeuble',
      mention: 'Commun aux 2 biens du bâtiment B, 12 rue des Lilas, 75011 PARIS' });
    expect(versDigicodeLu(D({ batiment: b, commun: code('1111') as never }), A)).toMatchObject({ code: '1111', portee: 'general', mention: expect.stringContaining('le bâtiment B n’a pas de code propre') });
    expect(versDigicodeLu(D({}), A)).toMatchObject({ digicode: null, code: null, source: null });
  });
  it('une valeur d’avant propre au BIEN reste dite « ancien code de ce bien » ; le changement prévu et une place à arbitrer sont dans la mention', () => {
    expect(versDigicodeLu(D({ commun: code('9999', 'ancien', { origines: ['bien W5'] }) as never }), A).source).toBe('bien');
    const futur = { batiment: null, valeur: { digicode: true, code: '7777' }, appliqueLe: '2026-11-20T08:00:00.000Z' };
    const lu = versDigicodeLu(D({ commun: code('1111', 'ancien', { aArbitrer: [{}, {}] }) as never, aVenir: [futur] }), A);
    expect(lu.mention).toContain('nouveau code 7777 à partir du 20/11/2026 à 09:00');
    expect(lu.mention).toContain('à arbitrer dans la fiche Copropriété');
    expect([lu.aArbitrer, lu.aVenir]).toEqual([true, [futur]]);
  });
});

describe('🔴 le mail « Nouvelle location » (ADHOC et MONGA) et l’encart du logement : le code en vigueur ET le suivant avec sa date et son heure', () => {
  const suivant = motChangementAVenir({ valeur: { digicode: true, code: 'Z7' }, appliqueLe: '2026-11-20T08:00:00.000Z', batiment: 'B' });
  it('le mot du changement', () => {
    expect(suivant).toBe('nouveau code Z7 (bâtiment B) à partir du 20/11/2026 à 09:00');
    expect(motChangementAVenir({ valeur: { digicode: false, code: null }, appliqueLe: '2026-11-20T08:00:00.000Z' })).toBe('plus de digicode à partir du 20/11/2026 à 09:00');
  });
  it('mail : « Digicode : A1 — nouveau code Z7 (bâtiment B) à partir du 20/11/2026 à 09:00 » ; sans changement prévu : le code seul', () => {
    const vide = Object.fromEntries(['categorie', 'typeLibelle', 'nombrePieces', 'meuble', 'nomAnnexe', 'parkingSituation', 'parkingType', 'voie', 'codePostal', 'commune', 'porte', 'numLotCopro',
      'batiment', 'escalier', 'etage', 'precisionAcces', 'ascenseur', 'surfaceHabitable', 'surfaceCarrez', 'surfaceExterieure', 'surface', 'construction', 'chauffage', 'dpeClasse', 'dpeDate',
      'dpeNonSoumis', 'syndic', 'derniereAg', 'assurancePno', 'pnoAnniversaire', 'annotation', 'commentaire', 'chargesCopro'].map((k) => [k, null]));
    const lot = { ...vide, entretiens: [], id: 1, principal: true, digicode: true, digicodeCode: 'A1', digicodeSuivant: suivant } as unknown as LotSource;
    expect(lignesDuLot(lot).find((l) => l.mot === 'Digicode')?.valeur).toBe(`A1 — ${suivant}`);
    expect(lignesDuLot({ ...lot, digicodeSuivant: null }).find((l) => l.mot === 'Digicode')?.valeur).toBe('A1');
  });
  it('encart du logement (préavis, pré-visite, état des lieux)', () => {
    const vide = Object.fromEntries(['adresse', 'type', 'meuble', 'etage', 'porte', 'numLotCopro', 'numeroLot', 'batiment', 'escalier', 'surfaceCarrez', 'surfaceHabitable', 'surface',
      'surfaceExterieure', 'nombrePieces', 'ascenseur', 'precisionAcces', 'dpeClasse', 'dpeDate', 'dpeNonSoumis', 'chauffage', 'epoqueConstruction', 'proprietaire', 'syndic'].map((k) => [k, null]));
    const e = { ...vide, lotId: 1, lots: [], bail: { entree: null, loyerHc: null, provisions: null, taux: null, base: null }, digicode: true, digicodeCode: 'A1', digicodeSuivant: suivant } as never;
    expect(lignesEncart(e).find((l: { cle: string }) => l.cle === 'digicode')).toMatchObject({ valeur: `A1 — ${suivant}` });
  });
  it('🔴 (Arno, 17/11/2026) encart du logement : UNE ligne « Bâtiment / cage d’escalier », le bâtiment ou, à défaut, l’ancien escalier', () => {
    const vide = Object.fromEntries(['adresse', 'type', 'meuble', 'etage', 'porte', 'numLotCopro', 'numeroLot', 'batiment', 'escalier', 'surfaceCarrez', 'surfaceHabitable', 'surface',
      'surfaceExterieure', 'nombrePieces', 'ascenseur', 'precisionAcces', 'dpeClasse', 'dpeDate', 'dpeNonSoumis', 'chauffage', 'epoqueConstruction', 'proprietaire', 'syndic'].map((k) => [k, null]));
    const base = { ...vide, lotId: 1, lots: [], bail: { entree: null, loyerHc: null, provisions: null, taux: null, base: null }, digicode: null, digicodeCode: null };
    const lignes = (o: Record<string, unknown>) => lignesEncart({ ...base, ...o } as never).filter((l: { cle: string } | null) => l !== null && (l.cle === 'batiment' || l.cle === 'escalier'));
    expect(lignes({ batiment: 'B', escalier: '2' })).toEqual([{ cle: 'batiment', libelle: 'Bâtiment / cage d’escalier', valeur: 'B' }]);
    expect(lignes({ batiment: null, escalier: '2' })).toEqual([{ cle: 'batiment', libelle: 'Bâtiment / cage d’escalier', valeur: '2' }]);
  });
});
