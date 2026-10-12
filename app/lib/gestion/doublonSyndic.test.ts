import { describe, it, expect } from 'vitest';
import {
  cleAdressePostale, cleNomCabinet, comparableDeLaSaisie, doublonsCouverts, doublonsDuSyndic, memeAdressePostale,
  motDoublonSyndic, motTraceIgnore, rapprocherNoms, saisieComparable, type SyndicComparable,
} from './doublonSyndic';

/**
 * ══ 🔴🔴 LOT SYNDIC-ANTI-DOUBLON-ET-PROPOSITION-PAR-ADRESSE — LA NORMALISATION ET LA COMPARAISON ══════════════════════
 * 🔒 Données de banc (cabinets fictifs, domaine .invalid) : rien n'est lu ni écrit en base.
 */
const ANNUAIRE: SyndicComparable[] = [
  { id: 1, nom: 'Cabinet FONCIA S.A.S.', adresse: '12 bis, av. des Champs-Élysées', codePostal: '75008', ville: 'Paris',
    emails: ['contact@foncia.invalid', 'j.dupont@foncia.invalid'], telephones: ['01 42 00 00 01', '06.12.34.56.78'] },
  { id: 2, nom: 'Citya Immobilier', adresse: '3 rue de la Paix', codePostal: '92400', ville: 'Courbevoie',
    emails: ['citya@citya.invalid'], telephones: ['+33 1 46 00 00 02'] },
];
const vide = (x: Partial<SyndicComparable>): SyndicComparable =>
  ({ id: null, nom: '', adresse: '', codePostal: '', ville: '', emails: [], telephones: [], ...x });

describe('① le nom du cabinet : sans casse, sans accents, sans ponctuation ni mots creux', () => {
  it('« Cabinet FONCIA S.A.S. » = « foncia » = « SARL Foncia »', () => {
    expect(cleNomCabinet('Cabinet FONCIA S.A.S.')).toBe('foncia');
    expect(cleNomCabinet('SARL Foncia')).toBe('foncia');
    expect(cleNomCabinet('  Syndic   Lôgis  ')).toBe('logis');
    expect(rapprocherNoms('Cabinet FONCIA S.A.S.', 'foncia')).toBe('identique');
  });
  it('un nom fait de mots creux garde ses mots (il ne se confond pas avec tout)', () => {
    expect(cleNomCabinet('Cabinet Gestion Immobilière')).toBe('cabinet gestion immobiliere');
    expect(rapprocherNoms('Cabinet Gestion Immobilière', 'Foncia')).toBeNull();
  });
  it('les noms très proches : un mot de plus, une faute de frappe', () => {
    expect(rapprocherNoms('Foncia', 'Foncia Courbevoie')).toBe('proche');
    expect(rapprocherNoms('Citya Immobilier', 'Citia')).toBe('proche');
    /* « Citya Immobilier » se réduit à « citya » : c'est le MÊME nom que « Citya ». */
    expect(rapprocherNoms('Citya Immobilier', 'Citya')).toBe('identique');
    expect(rapprocherNoms('Nexity Lamy', 'Nexity Lami')).toBe('proche');
  });
  it('des noms différents ne se ressemblent pas ; un nom court ne se rapproche pas par faute de frappe', () => {
    expect(rapprocherNoms('Foncia', 'Citya')).toBeNull();
    expect(rapprocherNoms('Loiselet', 'Oralia')).toBeNull();
    expect(rapprocherNoms('ABC', 'ABD')).toBeNull();
    expect(rapprocherNoms('', 'Foncia')).toBeNull();
  });
});

describe('② l’adresse postale : numéro + voie + code postal + ville normalisés', () => {
  const k = cleAdressePostale;
  it('« rue » / « r. », « avenue » / « av. », bis / ter, espaces, accents, tirets', () => {
    expect(k('12 bis, av. des Champs-Élysées', '75008', 'Paris')).toBe('12bis|avenue des champs elysees|75008|paris');
    expect(k('12bis avenue des champs elysees', '75 008', 'PARIS')).toBe(k('12 bis, av. des Champs-Élysées', '75008', 'Paris'));
    expect(k('12 B Av des Champs Elysees', '75008', 'Paris')).toBe(k('12 bis avenue des champs elysees', '75008', 'Paris'));
    expect(k('3 r. de la Paix', '92400', 'Courbevoie')).toBe(k('3 rue de la paix', '92400', 'courbevoie'));
    expect(k('5 bd Haussmann', '75009', 'Paris')).toBe(k('5 boulevard Haussmann', '75009', 'Paris'));
    expect(k('8 pl. St-Sulpice', '75006', 'Paris')).toBe(k('8 place saint sulpice', '75006', 'Paris'));
  });
  it('bis et ter ne se confondent pas ; un autre numéro non plus', () => {
    expect(memeAdressePostale(k('12 bis rue X', '75001', 'Paris'), k('12 ter rue X', '75001', 'Paris'))).toBe(false);
    expect(memeAdressePostale(k('12 rue X', '75001', 'Paris'), k('14 rue X', '75001', 'Paris'))).toBe(false);
  });
  it('le code postal départage ; à défaut, la ville (et « CEDEX » ne compte pas)', () => {
    expect(memeAdressePostale(k('3 rue de la Paix', '92400', 'Courbevoie'), k('3 rue de la Paix', '75002', 'Paris'))).toBe(false);
    expect(memeAdressePostale(k('3 rue de la Paix', '', 'Courbevoie Cedex'), k('3 rue de la Paix', '', 'Courbevoie'))).toBe(true);
    expect(memeAdressePostale(k('3 rue de la Paix', '92400', 'Courbevoie'), k('3 rue de la Paix', '', ''))).toBe(false);
  });
  it('sans voie ni numéro : aucune clé (une adresse vide ne ressemble à rien)', () => {
    expect(k('', '75001', 'Paris')).toBe('');
    expect(memeAdressePostale(k('rue X', '75001', 'Paris'), k('rue X', '75001', 'Paris'))).toBe(false);
  });
});

describe('③ ④ l’e-mail et le téléphone, du cabinet ET de ses contacts', () => {
  it('l’e-mail sans casse ni espaces ; le téléphone +33 / 0, espaces, points', () => {
    const e = doublonsDuSyndic(vide({ emails: [' J.Dupont@FONCIA.invalid '] }), ANNUAIRE);
    expect(e.map((d) => [d.syndic.id, d.criteres, d.email])).toEqual([[1, ['email'], 'j.dupont@foncia.invalid']]);
    const t = doublonsDuSyndic(vide({ telephones: ['+33 6 12 34 56 78'] }), ANNUAIRE);
    expect(t.map((d) => [d.syndic.id, d.criteres, d.telephone])).toEqual([[1, ['telephone'], '0612345678']]);
    expect(doublonsDuSyndic(vide({ telephones: ['01.46.00.00.02'] }), ANNUAIRE)[0].syndic.id).toBe(2);
  });
  it('un poste trop court ne désigne personne', () => {
    expect(doublonsDuSyndic(vide({ telephones: ['12'] }), ANNUAIRE)).toEqual([]);
  });
});

describe('🔴🔴 PARTIE 1 — un seul critère suffit pour AVERTIR, et l’on dit lequel', () => {
  it('chacun des quatre critères, seul', () => {
    const crit = (x: Partial<SyndicComparable>) => doublonsDuSyndic(vide(x), ANNUAIRE).map((d) => [d.syndic.id, d.criteres]);
    expect(crit({ nom: 'SARL Foncia' })).toEqual([[1, ['nom']]]);
    expect(crit({ nom: 'Fonciaa' })).toEqual([[1, ['nom_proche']]]);
    expect(crit({ nom: 'Autre', adresse: '12 bis avenue des Champs Elysées', codePostal: '75008', ville: 'Paris' })).toEqual([[1, ['adresse']]]);
    expect(crit({ emails: ['citya@citya.invalid'] })).toEqual([[2, ['email']]]);
    expect(crit({ telephones: ['01 42 00 00 01'] })).toEqual([[1, ['telephone']]]);
  });
  it('tous les syndics concernés, les plus nombreux critères d’abord, et le syndic lui-même écarté', () => {
    const d = doublonsDuSyndic(vide({ nom: 'Citya', emails: ['contact@foncia.invalid'], telephones: ['0142000001'] }), ANNUAIRE);
    expect(d.map((x) => [x.syndic.id, x.criteres])).toEqual([[1, ['email', 'telephone']], [2, ['nom']]]);
    expect(doublonsDuSyndic(vide({ id: 1, nom: 'Foncia' }), ANNUAIRE)).toEqual([]);
  });
  it('le mot du bandeau : nom, adresse, critères', () => {
    const [d] = doublonsDuSyndic(vide({ nom: 'Foncia', emails: ['contact@foncia.invalid'] }), ANNUAIRE);
    expect(motDoublonSyndic(d)).toBe('Cabinet FONCIA S.A.S. / Paris — 12 bis, av. des Champs-Élysées, 75008 Paris — même nom, même e-mail (contact@foncia.invalid)');
  });
  it('la saisie en cours : le cabinet ET ses contacts ; rien à comparer tant que rien ne compte', () => {
    const c = comparableDeLaSaisie({ nom: '', adresse: '', codePostal: '', ville: '', email: '', telephones: [''],
      contacts: [{ coordonnees: [{ sorte: 'email', valeur: 'j.dupont@foncia.invalid' }] }] });
    expect(doublonsDuSyndic(c, ANNUAIRE)[0].criteres).toEqual(['email']);
    expect(saisieComparable(vide({}))).toBe(false);
    expect(saisieComparable(vide({ nom: 'X' }))).toBe(true);
  });
  it('« Créer quand même » : l’accusé doit couvrir chaque syndic ET chaque critère trouvés', () => {
    const d = doublonsDuSyndic(vide({ nom: 'Foncia', telephones: ['0142000001'] }), ANNUAIRE);
    expect(doublonsCouverts(d, undefined)).toBe(false);
    expect(doublonsCouverts(d, [{ id: 1, criteres: ['nom'] }])).toBe(false);
    expect(doublonsCouverts(d, [{ id: 1, criteres: ['nom', 'telephone'] }])).toBe(true);
    expect(doublonsCouverts([], undefined)).toBe(true);
    expect(motTraceIgnore(d)).toBe('Syndic créé malgré l’avertissement de doublon : Cabinet FONCIA S.A.S. n° 1 (même nom, même téléphone)');
  });
});
