import { describe, expect, it } from 'vitest';
import { mentionEnvoyePar } from './mentionEnvoyePar';
import { htmlMailSortie, texteMailSortie, type DonneesMailSortie } from './sortieLocataires';

/** 🔴 Arno (05/11/2026) — « Mail envoyé par Prénom NOM (adresse) » : ce qui existe sur le compte, rien d'inventé. */
describe('mentionEnvoyePar', () => {
  it('prénom + nom + adresse ; NOM en capitales', () => {
    expect(mentionEnvoyePar({ prenom: 'Lucie', nomFamille: 'Fictive', email: 'lucie@exemple.test' })).toBe('Mail envoyé par Lucie FICTIVE (lucie@exemple.test)');
  });
  it('ce qui manque est omis ; sans nom ni prénom : l’adresse seule ; sans rien : aucune mention', () => {
    expect(mentionEnvoyePar({ prenom: 'Lucie', nomFamille: '  ', email: 'lucie@exemple.test' })).toBe('Mail envoyé par Lucie (lucie@exemple.test)');
    expect(mentionEnvoyePar({ prenom: null, nomFamille: 'Fictive', email: 'lucie@exemple.test' })).toBe('Mail envoyé par FICTIVE (lucie@exemple.test)');
    expect(mentionEnvoyePar({ email: 'lucie@exemple.test' })).toBe('Mail envoyé par lucie@exemple.test');
    expect(mentionEnvoyePar({ prenom: 'Lucie', nomFamille: 'Fictive', email: null })).toBe('Mail envoyé par Lucie FICTIVE');
    expect(mentionEnvoyePar({ prenom: null, nomFamille: null, email: null })).toBeNull();
  });
});

describe('le récapitulatif de sortie porte la mention (texte et HTML)', () => {
  const d: DonneesMailSortie = {
    adresse: '4 rue Fictive, 92800 Puteaux', lotId: 7, type: 'Appartement', etage: '3', porte: 'G', annexes: [], proprietaire: 'DUPONT Jean',
    sortants: [{ nom: 'BERNARD Alice', entree: '2022-09-01', sortie: '2026-11-04' }], vacant: true, restants: [],
    auteur: { nom: 'Lucie Fictive', email: 'lucie@exemple.test', prenom: 'Lucie', nomFamille: 'Fictive' }, quand: '2026-11-04T10:00:00Z',
  };
  it('présente quand le compte est connu', () => {
    expect(texteMailSortie(d)).toContain('\n\nMail envoyé par Lucie FICTIVE (lucie@exemple.test)\nMail automatique');
    expect(htmlMailSortie(d)).toContain('Mail envoyé par Lucie FICTIVE (lucie@exemple.test)');
  });
  it('compte sans nom : l’adresse seule', () => {
    expect(texteMailSortie({ ...d, auteur: { nom: 'lucie@exemple.test', email: 'lucie@exemple.test' } })).toContain('Mail envoyé par lucie@exemple.test');
  });
});
