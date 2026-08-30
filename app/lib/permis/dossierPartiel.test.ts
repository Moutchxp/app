import { describe, it, expect } from 'vitest';
import { doitLeverAuto, libelleSuspension, dateButoirPartiel, libelleDelaiProlonge, type EtatPartiel } from './dossierPartiel';

describe('CASC-2 — dateButoirPartiel (pur, départ = 1re réclamation)', () => {
  it('première réclamation le J → butoir = J + 1 mois + 4 jours', () => {
    // 2026-05-10 + 1 mois = 2026-06-10, + 4 j = 2026-06-14
    expect(dateButoirPartiel(new Date('2026-05-10T09:00:00Z'), 1, 4).toISOString().slice(0, 10)).toBe('2026-06-14');
  });
  it('DEUXIÈME réclamation plus tard n’est PAS l’entrée : recalculée sur la 1re → butoir INCHANGÉ (même partiel_le)', () => {
    const premiere = new Date('2026-05-10T09:00:00Z');
    const b1 = dateButoirPartiel(premiere, 1, 4).toISOString();
    const b2 = dateButoirPartiel(premiere, 1, 4).toISOString(); // partiel_le NE bouge pas (garde anti-repoussage infini)
    expect(b2).toBe(b1);
  });
  it('délai modifié dans les réglages → butoir recalculé', () => {
    expect(dateButoirPartiel(new Date('2026-05-10T00:00:00Z'), 2, 0).toISOString().slice(0, 10)).toBe('2026-07-10');
    expect(dateButoirPartiel(new Date('2026-05-10T00:00:00Z'), 0, 10).toISOString().slice(0, 10)).toBe('2026-05-20');
  });
  it('débordement de fin de mois borné (31 janv. + 1 mois → 28 févr.), puis + 4 j', () => {
    // 2026-01-31 + 1 mois → 2026-02-28 (2026 non bissextile), + 4 j → 2026-03-04
    expect(dateButoirPartiel(new Date('2026-01-31T00:00:00Z'), 1, 4).toISOString().slice(0, 10)).toBe('2026-03-04');
  });
});

describe('CASC-2 — libelleDelaiProlonge (texte porteur)', () => {
  it('affiche « prolongé au JJ/MM/AAAA »', () => {
    expect(libelleDelaiProlonge(new Date('2026-06-14T00:00:00Z'))).toContain('prolongé au 14/06/2026');
  });
});

describe('CASC-1 — doitLeverAuto (levée auto = tous les permis complets, pur)', () => {
  it('tous les dossiers complets → LEVER', () => {
    expect(doitLeverAuto([true, true, true])).toBe(true);
  });
  it('un dossier incomplet → NE PAS lever', () => {
    expect(doitLeverAuto([true, false, true])).toBe(false);
  });
  it('un dossier jamais analysé (null) → NE PAS lever (on ne conclut pas)', () => {
    expect(doitLeverAuto([true, null])).toBe(false);
  });
  it('aucun dossier → NE PAS lever', () => {
    expect(doitLeverAuto([])).toBe(false);
  });
  it('un seul dossier complet → LEVER', () => {
    expect(doitLeverAuto([true])).toBe(true);
  });
});

describe('CASC-1 — libelleSuspension (raison + date, jamais un silence, pur)', () => {
  const etat = (over: Partial<EtatPartiel> = {}): EtatPartiel => ({ le: '2026-08-30T10:00:00Z', familles: ['cerfa', 'etage'], origine: 'outil', ...over });
  it('porte la DATE, l’origine « réclamation envoyée » et les familles', () => {
    const s = libelleSuspension(etat());
    expect(s).toContain('2026-08-30');
    expect(s).toContain('réclamation envoyée');
    expect(s).toContain('cerfa, etage');
    expect(s.toLowerCase()).toContain('suspendue');
  });
  it('origine déclarée → « relance déclarée »', () => {
    expect(libelleSuspension(etat({ origine: 'declaree' }))).toContain('relance déclarée');
  });
  it('sans familles → pas de parenthèse de pièces, mais toujours la raison', () => {
    const s = libelleSuspension(etat({ familles: [] }));
    expect(s).toContain('réclamation envoyée');
    expect(s).not.toContain('pièces :');
  });
});
