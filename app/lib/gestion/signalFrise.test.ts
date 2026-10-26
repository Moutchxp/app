import { describe, it, expect, vi } from 'vitest';
import { ecouterFrise, friseConcernee, signalerFrise } from './signalFrise';
import { motSuivieAilleurs } from './frise';

/** LOT MONGA-LIEN-PAR-LE-GESTE — la frise se relit après un geste, sans recharger la page. */
describe('le signal de la frise', () => {
  it('prévient chaque frise abonnée, avec l’événement concerné ; le désabonnement est effectif', () => {
    const a = vi.fn();
    const lacher = ecouterFrise(a);
    signalerFrise(37);
    expect(a).toHaveBeenCalledWith(37);
    lacher();
    signalerFrise(37);
    expect(a).toHaveBeenCalledTimes(1);
  });

  it('un auditeur en faute ne fait pas taire les autres', () => {
    const b = vi.fn();
    const l1 = ecouterFrise(() => { throw new Error('écran en faute'); });
    const l2 = ecouterFrise(b);
    signalerFrise(null);
    expect(b).toHaveBeenCalledWith(null);
    l1(); l2();
  });

  it('une frise se relit pour SON événement, ou quand le signal ne nomme personne', () => {
    expect(friseConcernee(37, 37)).toBe(true);
    expect(friseConcernee(null, 37)).toBe(true);
    expect(friseConcernee(12, 37)).toBe(false);
  });
});

describe('« MNG-… est suivie dans GES-… »', () => {
  it('la phrase d’Arno, mot pour mot', () => {
    expect(motSuivieAilleurs('MNG-25126', 'GES-2026-000012')).toBe('MNG-25126 est suivie dans GES-2026-000012');
  });
});
