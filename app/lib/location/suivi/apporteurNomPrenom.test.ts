import { describe, expect, it } from 'vitest';
import { libelleApporteur, nomEtPrenom, separationDouteuse, separerNomPrenom, trierApporteurs, type Apporteur } from './suivi';

/**
 * 🔴 Arno (24/10/2026, migration 414) — les apporteurs : « NOM Prénom » (nom de famille d'abord), triés par nom de famille puis
 * prénom ; une structure (agence, Internet) par son nom. La reprise PROPOSE le dernier mot comme nom de famille.
 */
const A = (id: number, nom: string, type: Apporteur['type'] = 'partenaire', p: Partial<Apporteur> = {}): Apporteur => ({ id, nom, type, baremes: [], archive: false, ...p });

describe('🔴 la séparation proposée (reprise) : le dernier mot est le nom de famille', () => {
  it('deux mots, un mot, plusieurs mots', () => {
    expect(separerNomPrenom('Hélène Beketov')).toEqual({ nomFamille: 'Beketov', prenom: 'Hélène' });
    expect(separerNomPrenom('  Jean   Pereira ')).toEqual({ nomFamille: 'Pereira', prenom: 'Jean' });
    expect(separerNomPrenom('Léonardo')).toEqual({ nomFamille: 'Léonardo', prenom: null });
    expect(separerNomPrenom('Marjorie Arthur Immo')).toEqual({ nomFamille: 'Immo', prenom: 'Marjorie Arthur' });
  });
  it('les séparations DOUTEUSES de l’annuaire actuel (base de dev, 24/10/2026) sont repérées, et elles seules', () => {
    const annuaire = ['Brahim Boujra', 'Carlos Monteiro', 'Catherine Tarisse', 'Eric Benant', 'Frédéric Rousseau', 'Gardien 3 rue du Ratrait Abdwahab',
      'Gardien Dacquet', 'Gardienne Dora', 'Georges Bloch', 'Hélène Beketov', 'Jean Pereira', 'Julien Deblois', 'Léonardo', 'Manuel Dias',
      'Marjorie Arthur Immo', 'Marjorie Fernandes', 'Michael Salle de sport Cédric', 'Michel Cohen', 'Mme Beaucourt', 'Mylène Eberlin',
      'Pierre Thevenin', 'Rony Nashawaty', 'Sébastien Palat', 'Stéphane Maillard'];
    expect(annuaire.filter(separationDouteuse)).toEqual(['Gardien 3 rue du Ratrait Abdwahab', 'Gardien Dacquet', 'Gardienne Dora', 'Léonardo',
      'Marjorie Arthur Immo', 'Michael Salle de sport Cédric', 'Mme Beaucourt']);
  });
});

describe('🔴 l’affichage et le tri', () => {
  it('« NOM Prénom » pour une personne ; une structure, ou un nom sans prénom, tel quel', () => {
    expect(libelleApporteur(A(1, 'Hélène Beketov'))).toBe('BEKETOV Hélène');
    expect(libelleApporteur(A(2, 'Kin Immo', 'agence'))).toBe('Kin Immo');
    expect(libelleApporteur(A(3, 'Leboncoin', 'internet'))).toBe('Leboncoin');
    expect(libelleApporteur(A(4, 'Léonardo'))).toBe('Léonardo');
    // corrigé dans la fiche : la séparation enregistrée fait foi ; vide = une structure
    expect(libelleApporteur(A(5, 'Marjorie Arthur Immo', 'partenaire', { nomFamille: 'Arthur', prenom: 'Marjorie' }))).toBe('ARTHUR Marjorie');
    expect(libelleApporteur(A(6, 'Marjorie Arthur Immo', 'partenaire', { nomFamille: '', prenom: null }))).toBe('Marjorie Arthur Immo');
    expect(nomEtPrenom(A(6, 'X Y', 'partenaire', { nomFamille: '', prenom: null }))).toBeNull();
  });
  it('par nom de famille puis prénom (accents et casse ignorés) ; une structure par son nom', () => {
    const l = [A(1, 'Pierre Thevenin'), A(2, 'Kin Immo', 'agence'), A(3, 'Élodie Dias'), A(4, 'Manuel Dias'), A(5, 'Hélène Beketov'), A(6, 'Leboncoin', 'internet')];
    expect(trierApporteurs(l).map(libelleApporteur)).toEqual(['BEKETOV Hélène', 'DIAS Élodie', 'DIAS Manuel', 'Kin Immo', 'Leboncoin', 'THEVENIN Pierre']);
    expect(l[0].nom).toBe('Pierre Thevenin');                       // l'entrée n'est pas modifiée
  });
});
