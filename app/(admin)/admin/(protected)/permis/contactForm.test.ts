import { describe, it, expect } from 'vitest';
import { corpsPatchContact, noteAuChangementCanal, problemeContactUI, editionInitiale, CANAUX_ORDONNES, problemeUrlOuverture } from './contactForm';

describe('S19 — editionInitiale porte standard + nature de l’adresse ; problemeUrlOuverture', () => {
  it('editionInitiale : telephoneStandard et emailType repris du dossier', () => {
    const e = editionInitiale({ codeInsee: '78238', communeNom: 'Flins', destCanal: 'email', destEmail: 'accueil@x.fr', destUrlFormulaire: null, destAdressePostale: null, destTelephoneStandard: '01 30 90 40 00', destEmailType: 'accueil' });
    expect(e.telephoneStandard).toBe('01 30 90 40 00');
    expect(e.emailType).toBe('accueil');
    // absents en base → chaînes vides (NULL honnête)
    const v = editionInitiale({ codeInsee: '92050', communeNom: 'Nanterre', destCanal: 'email', destEmail: 'x@y.fr', destUrlFormulaire: null, destAdressePostale: null });
    expect(v.emailType).toBe('');
    expect(v.telephoneStandard).toBe('');
  });
  it('problemeUrlOuverture : vide/invalide → raison ; http(s) → null', () => {
    expect(problemeUrlOuverture('')).toMatch(/aucune URL/);
    expect(problemeUrlOuverture('ftp://x')).toMatch(/invalide/);
    expect(problemeUrlOuverture('https://teleservice.paris.fr')).toBeNull();
  });
});

describe('S17 — ordre des canaux (préférence décroissante) + présélection téléservice', () => {
  it('l’ordre est téléservice → e-mail → courrier → inconnu', () => {
    expect(CANAUX_ORDONNES.map((o) => o.value)).toEqual(['formulaire', 'email', 'courrier', 'inconnu']);
  });

  it('commune AVEC url_formulaire connue → ouvre sur « formulaire », URL pré-remplie, suggestion signalée (même si canal enregistré ≠)', () => {
    const e = editionInitiale({ codeInsee: '75056', communeNom: 'Paris', destCanal: 'inconnu', destEmail: '', destUrlFormulaire: 'https://teleservice.paris.fr', destAdressePostale: '' });
    expect(e.canal).toBe('formulaire');
    expect(e.urlFormulaire).toBe('https://teleservice.paris.fr');
    expect(e.suggestionTeleservice).toBe(true);
  });

  it('S18 — editionInitiale porte téléphone / responsable / date de vérification du protocole', () => {
    const e = editionInitiale({ codeInsee: '75056', communeNom: 'Paris', destCanal: 'formulaire', destEmail: null, destUrlFormulaire: 'https://adsconsult.paris.fr', destAdressePostale: null, destTelephone: '01 42 76 40 40', destResponsableNom: 'Charles Chenel', destProtocoleVerifieLe: '2026-08-03' });
    expect(e.telephone).toBe('01 42 76 40 40');
    expect(e.responsableNom).toBe('Charles Chenel');
    expect(e.protocoleVerifieLe).toBe('2026-08-03');
  });

  it('commune SANS url_formulaire → ouvre sur son canal enregistré, aucune présélection', () => {
    const e = editionInitiale({ codeInsee: '92050', communeNom: 'Nanterre', destCanal: 'email', destEmail: 'x@y.fr', destUrlFormulaire: '', destAdressePostale: '' });
    expect(e.canal).toBe('email');
    expect(e.suggestionTeleservice).toBe(false);
    // commune vraiment inconnue → 'inconnu', jamais 'formulaire' deviné
    const vierge = editionInitiale({ codeInsee: '78475', communeNom: 'Osmoy', destCanal: null, destEmail: null, destUrlFormulaire: null, destAdressePostale: null });
    expect(vierge.canal).toBe('inconnu');
    expect(vierge.suggestionTeleservice).toBe(false);
  });
});

const base = { code: '75056', email: '', urlFormulaire: '', adressePostale: '', note: '', telephone: '', responsableNom: '', telephoneStandard: '', emailType: '' };

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
      note: '  Ancienne adresse courrier : BASU  ', telephone: '  01 42 76 40 40 ', responsableNom: '  Chenel  ',
      telephoneStandard: '  01 42 76 40 00 ', emailType: 'accueil',
    });
    expect(corps).toEqual({
      codeInsee: '75056', canal: 'email', email: 'daj-cada@paris.fr', urlFormulaire: '', adressePostale: '',
      note: 'Ancienne adresse courrier : BASU', telephone: '01 42 76 40 40', responsableNom: 'Chenel',
      telephoneStandard: '01 42 76 40 00', emailType: 'accueil',
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
