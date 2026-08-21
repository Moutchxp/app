import { describe, it, expect } from 'vitest';
import { estEmisParNous, ENTETE_AUTO_EMISSION, VALEUR_AUTO_EMISSION } from './enteteAuto';

/**
 * CORRECTIF boucle d'auto-alerte — le prédicat PUR « émis par nous ». Deux signaux : en-tête d'auto-émission (voyage avec le
 * message), OU expéditeur = une de nos adresses (repli). Doit répondre VRAI même si le corps cite une de nos références.
 */
describe('estEmisParNous', () => {
  const NOUS = ['noreply@sansvisavis.com'];

  it('signal EN-TÊTE : présence de X-SVAV-Auto (insensible à la casse du nom) → vrai, quelle que soit l’adresse', () => {
    expect(estEmisParNous('urba@mairie.fr', { [ENTETE_AUTO_EMISSION]: VALEUR_AUTO_EMISSION }, [])).toBe(true);
    expect(estEmisParNous('urba@mairie.fr', { 'x-svav-auto': VALEUR_AUTO_EMISSION }, [])).toBe(true); // nom d'en-tête en minuscules (mailparser)
  });

  it('signal ADRESSE : expéditeur = une de nos adresses (casse/espaces indifférents) → vrai, même sans en-tête', () => {
    expect(estEmisParNous('NoReply@sansvisavis.com', undefined, NOUS)).toBe(true);
    expect(estEmisParNous('  noreply@sansvisavis.com ', {}, NOUS)).toBe(true);
  });

  it('un vrai message de mairie (autre adresse, pas d’en-tête) → FAUX (on ne l’ignore pas)', () => {
    expect(estEmisParNous('urba@mairie-aubervilliers.fr', { Subject: 'Réponse' }, NOUS)).toBe(false);
    expect(estEmisParNous('urba@mairie-aubervilliers.fr', undefined, [])).toBe(false);
  });

  it('en-tête présent mais VIDE → ne compte pas (garde contre un en-tête vide)', () => {
    expect(estEmisParNous('urba@mairie.fr', { [ENTETE_AUTO_EMISSION]: '   ' }, [])).toBe(false);
  });
});
