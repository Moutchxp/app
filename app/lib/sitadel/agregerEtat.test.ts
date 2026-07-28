import { describe, it, expect } from 'vitest';
import { agregerEtat, type LigneEtat } from './agregerEtat';

const l = (etat: string | null, dateDoc: string | null = null, dateDaact: string | null = null): LigneEtat => ({ etat, dateDoc, dateDaact });

describe('S12b — agregerEtat : règle déterministe', () => {
  it('{4,4} → annulé ; une seule valeur → NON ambigu', () => {
    const r = agregerEtat([l('4'), l('4')]);
    expect(r.etatDau).toBe('4');
    expect(r.ambigu).toBe(false);
  });

  it('{4,5} → COMMENCÉ (annulé SEULEMENT si toutes les lignes = 4), non exclu, ambigu', () => {
    const r = agregerEtat([l('4'), l('5')]);
    expect(r.etatDau).toBe('5'); // ≠ '4' → proposerLots ne l'exclut pas
    expect(r.ambigu).toBe(true);
  });

  it('{2,6} → ACHEVÉ (le plus avancé), ambigu', () => {
    expect(agregerEtat([l('2'), l('6')])).toMatchObject({ etatDau: '6', ambigu: true });
  });

  it('{2,2} → autorisé, NON ambigu', () => {
    expect(agregerEtat([l('2'), l('2')])).toMatchObject({ etatDau: '2', ambigu: false });
  });

  it('une seule ligne « 4 » parmi des non-annulés ne tue pas le dossier : {2,4,5} → 5', () => {
    expect(agregerEtat([l('2'), l('4'), l('5')]).etatDau).toBe('5');
  });

  it('dates : date_doc = la plus ANCIENNE, date_daact = la plus RÉCENTE (nulls ignorés)', () => {
    const r = agregerEtat([l('5', '2025-06-01', null), l('6', '2025-03-15', '2026-01-10'), l('6', null, '2025-12-01')]);
    expect(r.dateDoc).toBe('2025-03-15');   // min
    expect(r.dateDaact).toBe('2026-01-10'); // max
  });

  it('DÉTERMINISME : l’ordre des lignes n’a AUCUN effet (le test qui prouve la règle)', () => {
    const lignes = [l('2', '2025-06-01', null), l('4', null, null), l('6', '2025-01-01', '2025-12-31'), l('5', '2024-11-01', null)];
    const a = agregerEtat(lignes);
    const b = agregerEtat([...lignes].reverse());
    expect(a).toEqual(b);
    expect(a.etatDau).toBe('6');            // plus avancé non annulé
    expect(a.dateDoc).toBe('2024-11-01');   // min
    expect(a.dateDaact).toBe('2025-12-31'); // max
    expect(a.ambigu).toBe(true);
  });

  it('aucune ligne d’état (null/vide) → null, non ambigu', () => {
    expect(agregerEtat([l(null), l('')])).toMatchObject({ etatDau: null, ambigu: false });
  });
});
