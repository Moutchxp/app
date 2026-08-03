import { describe, it, expect } from 'vitest';
import { corpsPatchContact, noteAuChangementCanal, problemeContactUI } from './contactForm';

const base = { code: '75056', email: '', urlFormulaire: '', adressePostale: '', note: '' };

describe('S16 — problemeContactUI refuse un canal incohérent (miroir contrainte DB)', () => {
  it('formulaire SANS URL → refusé', () => {
    expect(problemeContactUI({ ...base, canal: 'formulaire' })).toMatch(/URL de formulaire/);
  });
  it('formulaire AVEC URL valide → accepté (null)', () => {
    expect(problemeContactUI({ ...base, canal: 'formulaire', urlFormulaire: 'https://teleservice.paris.fr' })).toBeNull();
  });
  it('email sans e-mail → refusé ; email valide → accepté', () => {
    expect(problemeContactUI({ ...base, canal: 'email' })).toMatch(/e-mail/);
    expect(problemeContactUI({ ...base, canal: 'email', email: 'urbanisme@ville.fr' })).toBeNull();
  });
});

describe('S15 — corpsPatchContact transmet bien la note', () => {
  it('inclut note (trimé) dans le corps envoyé à PATCH /contact', () => {
    const corps = corpsPatchContact({
      code: '75056', canal: 'email', email: '  daj-cada@paris.fr ', urlFormulaire: '', adressePostale: '',
      note: '  Ancienne adresse courrier : BASU  ',
    });
    expect(corps).toEqual({
      codeInsee: '75056', canal: 'email', email: 'daj-cada@paris.fr', urlFormulaire: '', adressePostale: '',
      note: 'Ancienne adresse courrier : BASU',
    });
  });
});

describe('S15 — noteAuChangementCanal (trace en quittant le courrier)', () => {
  it('quitter courrier → pré-remplit la note avec l’adresse postale (si note vide)', () => {
    expect(noteAuChangementCanal('courrier', 'email', 'BASU, 6 promenade…, 75013 Paris', ''))
      .toBe('Ancienne adresse courrier : BASU, 6 promenade…, 75013 Paris');
  });
  it('ne touche PAS une note déjà saisie (jamais d’écrasement)', () => {
    expect(noteAuChangementCanal('courrier', 'email', 'BASU', 'ma note à moi')).toBe('ma note à moi');
  });
  it('changement entre canaux non-courrier → note inchangée', () => {
    expect(noteAuChangementCanal('email', 'formulaire', '', '')).toBe('');
    expect(noteAuChangementCanal('inconnu', 'email', '', '')).toBe('');
  });
});
