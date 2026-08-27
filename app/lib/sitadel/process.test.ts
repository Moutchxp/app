import { describe, it, expect } from 'vitest';
import { processDeCanal, dansProcess, horsProcess, partitionnerParProcess, PROCESS_DEFAUT, PROCESS_ORDRE } from './process';

describe('D2 — process (viviers séparés)', () => {
  it('email/formulaire = les deux process ; courrier/inconnu/null = HORS process (3e groupe)', () => {
    expect(processDeCanal('email')).toBe('email');
    expect(processDeCanal('formulaire')).toBe('formulaire');
    // 🔴 courrier (vestige) et inconnu/null ne sont JAMAIS un process.
    expect(processDeCanal('courrier')).toBeNull();
    expect(processDeCanal('inconnu')).toBeNull();
    expect(processDeCanal(null)).toBeNull();
    expect(processDeCanal(undefined)).toBeNull();
  });

  it('dansProcess : appartenance exclusive ; horsProcess = complément', () => {
    expect(dansProcess('email', 'email')).toBe(true);
    expect(dansProcess('email', 'formulaire')).toBe(false);
    expect(dansProcess('formulaire', 'formulaire')).toBe(true);
    // Un permis ne peut pas être dans les deux à la fois.
    expect(dansProcess('email', 'email') && dansProcess('email', 'formulaire')).toBe(false);
    expect(horsProcess('courrier')).toBe(true);
    expect(horsProcess('email')).toBe(false);
  });

  it('partitionnerParProcess : sépare en email / formulaire / hors, sans perte', () => {
    const items = [
      { id: 1, c: 'email' }, { id: 2, c: 'formulaire' }, { id: 3, c: 'courrier' },
      { id: 4, c: 'email' }, { id: 5, c: null }, { id: 6, c: 'inconnu' },
    ];
    const p = partitionnerParProcess(items, (x) => x.c);
    expect(p.email.map((x) => x.id)).toEqual([1, 4]);
    expect(p.formulaire.map((x) => x.id)).toEqual([2]);
    expect(p.hors.map((x) => x.id)).toEqual([3, 5, 6]);
    // Aucune perte : total conservé.
    expect(p.email.length + p.formulaire.length + p.hors.length).toBe(items.length);
  });

  it('défaut = e-mail ; ordre d’affichage e-mail puis téléservice', () => {
    expect(PROCESS_DEFAUT).toBe('email');
    expect(PROCESS_ORDRE).toEqual(['email', 'formulaire']);
  });
});
