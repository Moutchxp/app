import { describe, it, expect } from 'vitest';
import { choisirEmpriseAcces, type EmpriseChoisissable } from './choixEmpriseAcces';

// Fabrique d'emprise (valeurs par défaut : non validée, datée). On surcharge ce qui compte pour chaque cas.
const e = (o: Partial<EmpriseChoisissable> & { id: number }): EmpriseChoisissable => ({
  validee: false, creeLe: '2026-09-01T10:00:00Z', numero: null, ...o,
});

describe('choisirEmpriseAcces — validée sinon la plus récente (BAT — accès à l’emprise)', () => {
  it('liste vide → null (rien à pointer : l’accès ouvre le tracé vierge)', () => {
    expect(choisirEmpriseAcces([])).toBeNull();
  });

  it('une seule emprise → elle-même (validée ou non)', () => {
    const seule = e({ id: 7, validee: false });
    expect(choisirEmpriseAcces([seule])).toBe(seule);
  });

  it('une validée parmi plusieurs → la validée, même si une NON validée est plus récente', () => {
    const validee = e({ id: 1, validee: true, creeLe: '2026-09-01T10:00:00Z' });
    const recenteNonValidee = e({ id: 2, validee: false, creeLe: '2026-09-09T10:00:00Z' });
    expect(choisirEmpriseAcces([recenteNonValidee, validee])).toBe(validee);
  });

  it('plusieurs validées → la plus récente des validées', () => {
    const ancienne = e({ id: 1, validee: true, creeLe: '2026-09-01T10:00:00Z' });
    const recente = e({ id: 2, validee: true, creeLe: '2026-09-08T10:00:00Z' });
    expect(choisirEmpriseAcces([ancienne, recente])).toBe(recente);
  });

  it('aucune validée → la plus récente par date de création', () => {
    const a = e({ id: 1, creeLe: '2026-09-01T10:00:00Z' });
    const b = e({ id: 2, creeLe: '2026-09-05T10:00:00Z' });
    const c = e({ id: 3, creeLe: '2026-09-03T10:00:00Z' });
    expect(choisirEmpriseAcces([a, b, c])).toBe(b);
  });

  it('date absente (migration non appliquée) → repli sur le numéro stable décroissant', () => {
    const sansDate1 = e({ id: 1, creeLe: null, numero: 4 });
    const sansDate2 = e({ id: 2, creeLe: null, numero: 9 });
    expect(choisirEmpriseAcces([sansDate1, sansDate2])).toBe(sansDate2);
  });

  it('une datée l’emporte sur une non datée (null trié en dernier), à validation égale', () => {
    const datee = e({ id: 1, creeLe: '2026-09-02T10:00:00Z' });
    const sansDate = e({ id: 2, creeLe: null, numero: 99 });
    expect(choisirEmpriseAcces([sansDate, datee])).toBe(datee);
  });

  it('ni date ni numéro → repli déterministe sur l’id le plus grand', () => {
    const a = e({ id: 5, creeLe: null, numero: null });
    const b = e({ id: 12, creeLe: null, numero: null });
    expect(choisirEmpriseAcces([a, b])).toBe(b);
  });

  it('l’ordre d’entrée n’influe pas sur le résultat (déterminisme)', () => {
    const validee = e({ id: 3, validee: true, creeLe: '2026-09-04T10:00:00Z' });
    const autre = e({ id: 8, validee: false, creeLe: '2026-09-10T10:00:00Z' });
    expect(choisirEmpriseAcces([validee, autre])).toBe(validee);
    expect(choisirEmpriseAcces([autre, validee])).toBe(validee);
  });
});
