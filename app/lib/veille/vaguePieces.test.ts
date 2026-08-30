import { describe, it, expect } from 'vitest';
import { calmeEcoule, vagueCloseeDiagnostic, vagueCloseeEnvoi } from './vaguePieces';

const T = (iso: string) => new Date(iso);

describe('PART-C — calmeEcoule (calme sur la date d’envoi du dernier mail)', () => {
  it('délai NON écoulé → false ; écoulé (≥) → true (borne inclusive)', () => {
    const maintenant = T('2026-08-30T10:10:00Z');
    expect(calmeEcoule(T('2026-08-30T10:05:00Z'), maintenant, 10)).toBe(false); // 5 min < 10
    expect(calmeEcoule(T('2026-08-30T10:00:00Z'), maintenant, 10)).toBe(true);  // 10 min = 10 (inclusif)
    expect(calmeEcoule(T('2026-08-30T09:00:00Z'), maintenant, 10)).toBe(true);  // 70 min > 10
  });
  it('aucun mail (null) → true (rien à attendre)', () => {
    expect(calmeEcoule(null, T('2026-08-30T10:10:00Z'), 10)).toBe(true);
  });
  it('calme ≤ 0 → true (immédiat, calme désactivé)', () => {
    expect(calmeEcoule(T('2026-08-30T10:09:59Z'), T('2026-08-30T10:10:00Z'), 0)).toBe(true);
  });
});

describe('PART-C — vagueCloseeDiagnostic (manuel immédiat ; auto soumis au calme)', () => {
  const maintenant = T('2026-08-30T10:10:00Z');
  const dernierMailLe = T('2026-08-30T10:08:00Z'); // 2 min → calme NON écoulé (10)
  it('MANUEL → toujours true, même vague en cours (résultat immédiat pour Arno)', () => {
    expect(vagueCloseeDiagnostic({ mode: 'manuel', dernierMailLe, maintenant, calmeMinutes: 10 })).toBe(true);
  });
  it('AUTO → false tant que le calme n’est pas écoulé, true ensuite', () => {
    expect(vagueCloseeDiagnostic({ mode: 'auto', dernierMailLe, maintenant, calmeMinutes: 10 })).toBe(false);
    expect(vagueCloseeDiagnostic({ mode: 'auto', dernierMailLe: T('2026-08-30T09:00:00Z'), maintenant, calmeMinutes: 10 })).toBe(true);
  });
});

describe('PART-C — vagueCloseeEnvoi (garde envoi auto : TOUJOURS soumis au calme, indépendant du mode)', () => {
  const maintenant = T('2026-08-30T10:10:00Z');
  it('même juste après une relève manuelle, l’envoi auto attend le calme (garde anti « réclamer une pièce qui arrive »)', () => {
    expect(vagueCloseeEnvoi({ dernierMailLe: T('2026-08-30T10:08:00Z'), maintenant, calmeMinutes: 10 })).toBe(false); // 2 min
    expect(vagueCloseeEnvoi({ dernierMailLe: T('2026-08-30T09:50:00Z'), maintenant, calmeMinutes: 10 })).toBe(true);  // 20 min
  });
});
