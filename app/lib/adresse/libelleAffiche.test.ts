import { describe, expect, it } from 'vitest';
import { voieAffichee } from './libelleAffiche';

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
