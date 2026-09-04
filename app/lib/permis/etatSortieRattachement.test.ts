import { describe, it, expect } from 'vitest';
import { conditionAltitudeSortie, pretPourSortie } from './etatSortieRattachement';

describe('conditionAltitudeSortie — un ensemble VIDE ne se déclare jamais satisfait (LOT 71)', () => {
  it('🔴 AUCUN bâtiment → SANS OBJET (ni vert ni rouge), jamais « satisfaite »', () => {
    const c = conditionAltitudeSortie(0, 0);
    expect(c.etat).toBe('sans_objet');
    expect(c.ton).toBe('neutre');
    expect(c.etat).not.toBe('satisfaite');       // le cœur du lot : 0 corps ne vaut PAS satisfaction
    expect(c.texte).toMatch(/aucun bâtiment déclaré/i);
    expect(c.texte).not.toMatch(/✓/);            // aucun coche verte sur du vide
  });

  it('≥1 bâtiment avec des altitudes manquantes → NON SATISFAITE (rouge), avec le compte', () => {
    const c = conditionAltitudeSortie(3, 2);
    expect(c.etat).toBe('non_satisfaite');
    expect(c.ton).toBe('rouge');
    expect(c.texte).toContain('2 bâtiment(s) sans altitude');
  });

  it('≥1 bâtiment ET tous avec leur altitude → SATISFAITE (vert) — le SEUL cas vérifiable', () => {
    const c = conditionAltitudeSortie(3, 0);
    expect(c.etat).toBe('satisfaite');
    expect(c.ton).toBe('vert');
    expect(c.texte).toMatch(/✓/);
  });
});

describe('pretPourSortie — « sans objet » ne débloque JAMAIS la sortie', () => {
  it('empreinte OK mais altitude SANS OBJET (0 corps) → pas prêt', () => {
    // Garde-fou de non-régression : si un jour l'empreinte cessait de bloquer le vide, l'altitude ne doit pas masquer le trou.
    expect(pretPourSortie(true, conditionAltitudeSortie(0, 0).etat)).toBe(false);
  });
  it('empreinte OK et altitude SATISFAITE → prêt', () => {
    expect(pretPourSortie(true, conditionAltitudeSortie(2, 0).etat)).toBe(true);
  });
  it('empreinte KO même avec altitude satisfaite → pas prêt (double condition intacte)', () => {
    expect(pretPourSortie(false, conditionAltitudeSortie(2, 0).etat)).toBe(false);
  });
  it('altitude NON satisfaite (corps sans altitude) → pas prêt', () => {
    expect(pretPourSortie(true, conditionAltitudeSortie(2, 1).etat)).toBe(false);
  });
});
