import { describe, it, expect } from 'vitest';
import { expediteurDuMail, roleExpediteur } from './expediteurDuMail';

describe('🔴 le cartouche « Expéditeur : … » (Arno, 11/10/2026)', () => {
  it('le nom de l’en-tête De:, sinon l’adresse', () => {
    expect(expediteurDuMail('Valentin.Talhouarn@gmail.com', 'Valentin TALHOUARN'))
      .toEqual({ adresse: 'valentin.talhouarn@gmail.com', nom: 'Valentin TALHOUARN' });
    expect(expediteurDuMail('a@b.test', null)).toEqual({ adresse: 'a@b.test', nom: 'a@b.test' });
    expect(expediteurDuMail('a@b.test', '  "A@B.test" ')?.nom).toBe('a@b.test');
    expect(expediteurDuMail('', 'X')).toBeNull();
  });
  it('la partie qui porte l’adresse De: ; aucune ⇒ pas de cartouche', () => {
    const e = expediteurDuMail('valentin.talhouarn@gmail.com', 'Valentin TALHOUARN');
    const parties = [
      { role: 'proprietaire', emails: [{ valeur: 'c.jullien@exemple.test' }] },
      { role: 'locataire', emails: [{ valeur: 'marine@exemple.test' }, { valeur: ' Valentin.Talhouarn@gmail.com' }] },
    ];
    expect(roleExpediteur(parties, e)).toBe('locataire');
    expect(roleExpediteur([{ role: 'proprietaire', emails: [{ valeur: 'valentin.talhouarn@gmail.com' }] }], e)).toBe('proprietaire');
    expect(roleExpediteur([{ role: 'locataire' }], e)).toBeNull();
    expect(roleExpediteur(parties, null)).toBeNull();
    expect(roleExpediteur(parties, expediteurDuMail('gestion@sansvisavis.com', 'Gestion'))).toBeNull();
  });
});
