import { describe, it, expect } from 'vitest';
import { dateHeureComplete, dateHeureCourte, FUSEAU_AFFICHAGE } from './ecran';

/**
 * LOT 5-DIRECT — L'HORODATAGE DE RÉCEPTION. Arno voyait « il y a 3 h », ce qui ne dit pas si un mail est arrivé à 9 h
 * ou à 14 h. Deux pièges guettent ce genre de fonction, et les deux sont éprouvés ici :
 *   ① afficher l'heure de la MACHINE plutôt que celle de Paris — le même mail porterait deux heures différentes
 *      selon qu'on le lit sur le Mac ou sur le téléphone ;
 *   ② calculer « hier » en retirant 24 heures — faux deux nuits par an, celles du changement d'heure.
 */

/** Un instant, écrit en UTC comme le rend la base (`INSTANT`, carteRepo). */
const utc = (s: string) => `${s}Z`;

describe('① toujours l’heure de PARIS, jamais celle de la machine', () => {
  it('HEURE D’ÉTÉ (UTC+2) : 12:32 UTC s’affiche 14:32', () => {
    expect(dateHeureCourte(utc('2026-07-15T12:32:00'), new Date(utc('2026-07-15T18:00:00')))).toBe('14:32');
  });

  it('HEURE D’HIVER (UTC+1) : 12:32 UTC s’affiche 13:32', () => {
    expect(dateHeureCourte(utc('2026-01-15T12:32:00'), new Date(utc('2026-01-15T18:00:00')))).toBe('13:32');
  });

  it('le fuseau est nommé, pas deviné', () => {
    expect(FUSEAU_AFFICHAGE).toBe('Europe/Paris');
  });

  it('un mail de 23:30 UTC est déjà DEMAIN à Paris en été — et l’affichage le dit', () => {
    // 2026-07-15 23:30 UTC = 2026-07-16 01:30 à Paris. Vu le 16 à midi, c'est donc « aujourd'hui ».
    expect(dateHeureCourte(utc('2026-07-15T23:30:00'), new Date(utc('2026-07-16T12:00:00')))).toBe('01:30');
  });
});

describe('les quatre formes, comme dans une messagerie', () => {
  const maintenant = new Date(utc('2026-09-24T16:00:00')); // 18:00 à Paris

  it('AUJOURD’HUI → l’heure seule', () => {
    expect(dateHeureCourte(utc('2026-09-24T12:32:00'), maintenant)).toBe('14:32');
  });

  it('HIER → « hier » et l’heure', () => {
    expect(dateHeureCourte(utc('2026-09-23T16:05:00'), maintenant)).toBe('hier 18:05');
  });

  it('CETTE ANNÉE → jour, mois court, heure — sans l’année', () => {
    const r = dateHeureCourte(utc('2026-09-12T07:14:00'), maintenant);
    expect(r).toMatch(/^12 sept\.? 09:14$/);
  });

  it('ANNÉE DIFFÉRENTE → l’année apparaît', () => {
    const r = dateHeureCourte(utc('2025-09-12T07:14:00'), maintenant);
    expect(r).toMatch(/^12 sept\.? 2025 09:14$/);
  });
});

describe('🔴 ② « hier » se calcule sur le CALENDRIER, pas en retirant 24 heures', () => {
  it('la nuit du passage à l’heure d’HIVER (25 h) : la veille reste « hier »', () => {
    // Changement 2026 : nuit du 24 au 25 octobre. Un mail du 24 à 20:00 Paris, lu le 25 à 20:00 Paris.
    // Entre les deux il s'est écoulé 25 heures : un décompte en heures dirait « avant-hier ».
    expect(dateHeureCourte(utc('2026-10-24T18:00:00'), new Date(utc('2026-10-25T19:00:00')))).toBe('hier 20:00');
  });

  it('la nuit du passage à l’heure d’ÉTÉ (23 h) : la veille reste « hier »', () => {
    // Changement 2026 : nuit du 28 au 29 mars.
    expect(dateHeureCourte(utc('2026-03-28T19:00:00'), new Date(utc('2026-03-29T18:00:00')))).toBe('hier 20:00');
  });

  it('un mail de 00:30 lu à 23:30 le MÊME jour reste « aujourd’hui », malgré 23 heures d’écart', () => {
    expect(dateHeureCourte(utc('2026-07-14T22:30:00'), new Date(utc('2026-07-15T21:30:00')))).toBe('00:30');
  });
});

describe('ce qui ne doit jamais inventer une date', () => {
  it('une date absente ou illisible rend « — », jamais l’heure d’aujourd’hui', () => {
    const maintenant = new Date(utc('2026-09-24T16:00:00'));
    for (const v of [null, undefined, '', 'pas une date']) {
      expect(dateHeureCourte(v, maintenant)).toBe('—');
      expect(dateHeureComplete(v)).toBe('—');
    }
  });

  it('la forme complète (infobulle, en-tête) porte le jour, la date et l’heure de Paris', () => {
    const r = dateHeureComplete(utc('2026-09-24T12:32:00'));
    expect(r).toContain('jeudi');
    expect(r).toContain('24 septembre 2026');
    expect(r).toContain('14:32');
  });
});
