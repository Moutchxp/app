import { describe, expect, it } from 'vitest';
import { adresseAffichee, communeAffichee, voieAffichee } from './libelleAffiche';

/** 🔴 Arno (20/11/2026) — le libellé officiel à l'écran : type de voie et petits mots en minuscule, sauf en tête ; noms propres intacts. 10 libellés réels de la BAN. */
describe('le libellé officiel à l’écran', () => {
  it.each([
    ['54 Avenue Puvis De Chavannes', '54 avenue Puvis de Chavannes'],
    ['80 Rue De Normandie', '80 rue de Normandie'],
    ['6 Boulevard Saint-Denis', '6 boulevard Saint-Denis'],
    ['12 Place De L\'Arche', '12 place de l\'Arche'],
    ['3 Rue Jean-Baptiste Charcot', '3 rue Jean-Baptiste Charcot'],
    ['92 Quai Du Maréchal Joffre', '92 quai du Maréchal Joffre'],
    ['12 ter Rue De La Montagne', '12 ter rue de la Montagne'],
    ['0 Chemin de l’Ïle aux Chênes', '0 chemin de l’Ïle aux Chênes'],
    ['1 Rond-Point Jean Monnet', '1 rond-point Jean Monnet'],
    ['10 Rue Du Port', '10 rue du Port'],
  ])('« %s » → « %s »', (ban, ecran) => { expect(voieAffichee(ban)).toBe(ecran); });
  it('en tête, rien ne change (« Rue de la Paix » sans numéro) ; un nom composé garde ses majuscules, ses petits mots non (« Saint-Germain-Des-Prés »)', () => {
    expect(voieAffichee('Rue De La Paix')).toBe('Rue de la Paix');
    expect(voieAffichee('5 Rue Saint-Germain-Des-Prés')).toBe('5 rue Saint-Germain-des-Prés');
    expect(voieAffichee('7 Rue D\'Alsace')).toBe('7 rue d\'Alsace');
  });
});

describe('un indice écrit autrement (« ba » dans la BAN)', () => {
  it('le type de voie après l’indice passe en minuscule ; « 4 Rue du Port » reste intact au-delà du type', () => {
    expect(voieAffichee('4 ba Avenue de Choisy')).toBe('4 ba avenue de Choisy');
    expect(voieAffichee('4 Rue Du Port')).toBe('4 rue du Port');
  });
});

/** 🔴 Arno (20/11/2026, relecture du lot 6) — chaque mot qui n'est ni le type de voie ni un petit mot REÇOIT sa majuscule, même écrit en minuscule. */
describe('chaque autre mot reçoit sa majuscule initiale', () => {
  it.each([
    ['18 rue pierre et marie curie', '18 rue Pierre et Marie Curie'],
    ['1 Villa Des Lilas', '1 villa des Lilas'],
    ['3 rue camille deschanel', '3 rue Camille Deschanel'],
    ['57 rue jean-jacques rousseau', '57 rue Jean-Jacques Rousseau'],
    ['2 square henri régnault', '2 square Henri Régnault'],
    ['10 avenue du général de gaulle', '10 avenue du Général de Gaulle'],
    ['5 RUE DE LA PAIX', '5 rue de la Paix'],
    ['14 boulevard louis XIV', '14 boulevard Louis XIV'],
    ['8 rue des lilas d\'espagne', '8 rue des Lilas d\'Espagne'],
    ['4 bis allée saint-germain-des-prés', '4 bis allée Saint-Germain-des-Prés'],
    ['rue camille deschanel', 'Rue Camille Deschanel'],
  ])('« %s » → « %s »', (source, ecran) => { expect(voieAffichee(source)).toBe(ecran); });
});

describe('la commune en casse normale, jamais en capitales', () => {
  it.each([
    ['COURBEVOIE', 'Courbevoie'],
    ['LA GARENNE COLOMBES', 'La Garenne Colombes'],
    ['ASNIÈRES-SUR-SEINE', 'Asnières-sur-Seine'],
    ['Le Pré-Saint-Gervais', 'Le Pré-Saint-Gervais'],
    ['Paris 16e Arrondissement', 'Paris 16e Arrondissement'],
    ['FONTENAY-AUX-ROSES', 'Fontenay-aux-Roses'],
    ['L\'HAŸ-LES-ROSES', 'L\'Haÿ-les-Roses'],
    ['PARIS 19E ARRONDISSEMENT', 'Paris 19e Arrondissement'],
    ['PARIS 1ER ARRONDISSEMENT', 'Paris 1er Arrondissement'],
  ])('« %s » → « %s »', (source, ecran) => { expect(communeAffichee(source)).toBe(ecran); });
  it('une adresse complète (« voie, code postal commune ») : la voie et la commune, chacune par sa règle ; vide reste vide', () => {
    expect(adresseAffichee('1 Villa Des Lilas, 92400 COURBEVOIE')).toBe('1 villa des Lilas, 92400 Courbevoie');
    expect(adresseAffichee('18 rue pierre et marie curie, 92800 Puteaux')).toBe('18 rue Pierre et Marie Curie, 92800 Puteaux');
    expect(adresseAffichee('12 rue Baudin')).toBe('12 rue Baudin');
    expect(communeAffichee(null)).toBe('');
  });
});
