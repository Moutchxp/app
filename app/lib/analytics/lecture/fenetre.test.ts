import { describe, it, expect } from 'vitest';
import { validerFenetre, expressionBucket, filtreFenetre, AMPLITUDE_MAX_JOURS } from './fenetre';

/**
 * M2 — LOT 4. Fenêtre temporelle : validation + regroupement. Le grand livre est au grain JOUR (date,
 * Paris déjà gravé) → arithmétique de calendrier pure, insensible au changement d'heure (DST).
 */

describe('validerFenetre — bornes correctes, refus des entrées invalides', () => {
  it('accepte une fenêtre valide (jour/semaine/mois)', () => {
    for (const grain of ['jour', 'semaine', 'mois']) {
      const r = validerFenetre('2026-01-01', '2026-01-31', grain);
      expect(r.ok).toBe(true);
    }
  });
  it('refuse un format/date invalide (Feb 30, mois 13, texte)', () => {
    expect(validerFenetre('2026-02-30', '2026-03-01', 'jour').ok).toBe(false); // 30 février n'existe pas
    expect(validerFenetre('2026-13-01', '2026-13-02', 'jour').ok).toBe(false);
    expect(validerFenetre('hier', '2026-01-01', 'jour').ok).toBe(false);
    expect(validerFenetre('2026-1-1', '2026-01-31', 'jour').ok).toBe(false); // pas zéro-paddé
  });
  it('refuse debut > fin, grain inconnu, amplitude excessive', () => {
    expect(validerFenetre('2026-02-01', '2026-01-01', 'jour').ok).toBe(false);
    expect(validerFenetre('2026-01-01', '2026-01-31', 'heure').ok).toBe(false); // sous-jour interdit
    const trop = validerFenetre('2020-01-01', '2026-01-01', 'jour'); // > 731 j
    expect(trop.ok).toBe(false);
    if (!trop.ok) expect(trop.erreur).toMatch(new RegExp(String(AMPLITUDE_MAX_JOURS)));
  });
  it('DST : une semaine à cheval sur le changement d’heure (mars) reste valide (dates, pas d’heure)', () => {
    // 2026-03-29 = passage à l'heure d'été en France ; aucune incidence sur des DATES.
    expect(validerFenetre('2026-03-23', '2026-03-29', 'semaine').ok).toBe(true);
  });
});

describe('expressionBucket — regroupement SQL (semaine = lundi ISO)', () => {
  it('jour / semaine / mois produisent le bon date_trunc en texte', () => {
    expect(expressionBucket('jour')).toMatch(/to_char\(jour_paris, 'YYYY-MM-DD'\)/);
    expect(expressionBucket('semaine')).toMatch(/date_trunc\('week', jour_paris\)/);
    expect(expressionBucket('mois')).toMatch(/date_trunc\('month', jour_paris\)/);
  });
});

describe('filtreFenetre — colonne NUE jour_paris (indexable), bornes incluses', () => {
  it('clause sur jour_paris avec params [debut, fin]', () => {
    const f = filtreFenetre({ debut: '2026-01-01', fin: '2026-01-31', grain: 'jour' });
    expect(f.clause).toMatch(/jour_paris >= \$1::date AND jour_paris <= \$2::date/);
    expect(f.clause).not.toMatch(/AT TIME ZONE/); // jamais d'enveloppe sur la colonne
    expect(f.params).toEqual(['2026-01-01', '2026-01-31']);
  });
});
