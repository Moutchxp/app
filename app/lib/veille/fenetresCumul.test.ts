import { describe, it, expect } from 'vitest';
import { FENETRES_CUMUL, bornesFenetres, fenetresContenant, libelleFenetre } from './fenetresCumul';

/**
 * T2 — fenêtres GLISSANTES du cumul du journal des relèves. Helpers PURS : on vérifie l'appartenance d'une relève aux
 * fenêtres (miroir du prédicat SQL `demarre_le >= depuis`), les libellés « fenêtre réelle », et que `total` est sans borne.
 */
const MAINTENANT = new Date('2026-08-09T12:00:00.000Z');
const JOUR = 24 * 3_600_000;

describe('T2 — fenetresCumul', () => {
  it('six fenêtres dans l’ordre attendu, total sans borne', () => {
    expect(FENETRES_CUMUL.map((f) => f.cle)).toEqual(['24h', '7j', '30j', '90j', '365j', 'total']);
    const bornes = bornesFenetres(MAINTENANT);
    expect(bornes).toHaveLength(6);
    expect(bornes.find((b) => b.cle === 'total')?.depuis).toBeNull(); // total = sans borne
    // Les cinq autres bornes sont bien glissantes depuis `maintenant`.
    expect(bornes.find((b) => b.cle === '24h')?.depuis?.toISOString()).toBe(new Date(MAINTENANT.getTime() - JOUR).toISOString());
    expect(bornes.find((b) => b.cle === '30j')?.depuis?.toISOString()).toBe(new Date(MAINTENANT.getTime() - 30 * JOUR).toISOString());
  });

  it('libellés = fenêtre réelle (jamais « ce mois-ci »)', () => {
    expect(libelleFenetre('24h')).toBe('24 dernières heures');
    expect(libelleFenetre('7j')).toBe('7 derniers jours');
    expect(libelleFenetre('30j')).toBe('30 derniers jours');
    expect(libelleFenetre('total')).toBe('depuis le début');
    // aucun libellé calendaire trompeur
    for (const f of FENETRES_CUMUL) expect(f.libelle).not.toMatch(/ce mois|cette semaine|cette année|ce trimestre/i);
  });

  it('une relève d’il y a 40 jours entre dans 90j/365j/total mais pas 24h/7j/30j', () => {
    const il_y_a_40j = new Date(MAINTENANT.getTime() - 40 * JOUR);
    expect(fenetresContenant(il_y_a_40j, MAINTENANT)).toEqual(['90j', '365j', 'total']);
  });

  it('une relève récente entre dans toutes les fenêtres ; une très ancienne, seulement dans total', () => {
    const il_y_a_1h = new Date(MAINTENANT.getTime() - 3_600_000);
    expect(fenetresContenant(il_y_a_1h, MAINTENANT)).toEqual(['24h', '7j', '30j', '90j', '365j', 'total']);
    const il_y_a_400j = new Date(MAINTENANT.getTime() - 400 * JOUR);
    expect(fenetresContenant(il_y_a_400j, MAINTENANT)).toEqual(['total']);
    const il_y_a_200j = new Date(MAINTENANT.getTime() - 200 * JOUR);
    expect(fenetresContenant(il_y_a_200j, MAINTENANT)).toEqual(['365j', 'total']);
  });
});
