import { describe, it, expect } from 'vitest';
import { joursDepuis, dossiersAAlerter, composerAlerteAttenteBati, type CandidatAttenteBati } from './alerteAttenteBati';

const j = (iso: string) => new Date(iso);
const cand = (over: Partial<CandidatAttenteBati> = {}): CandidatAttenteBati => ({
  dossierId: 11430, numDau: 'PC09201234V0001', communeNom: 'Asnières', detecteLe: j('2025-08-01T00:00:00Z'), dejaAlerte: false, ...over,
});

describe('ATT-BATI (pur) — joursDepuis', () => {
  it('compte les jours pleins écoulés, jamais négatif', () => {
    expect(joursDepuis(j('2026-01-01T00:00:00Z'), j('2026-01-11T00:00:00Z'))).toBe(10);
    expect(joursDepuis(j('2026-01-01T00:00:00Z'), j('2026-01-01T12:00:00Z'))).toBe(0); // < 1 jour
    expect(joursDepuis(j('2026-01-10T00:00:00Z'), j('2026-01-01T00:00:00Z'))).toBe(0); // futur → 0, jamais négatif
  });
});

describe('ATT-BATI (pur) — dossiersAAlerter : seuil + anti-doublon + tri', () => {
  const maintenant = j('2026-08-26T00:00:00Z');
  it('SOUS le seuil → aucun dossier', () => {
    const c = cand({ detecteLe: j('2026-08-25T00:00:00Z') }); // 1 jour
    expect(dossiersAAlerter([c], 365, maintenant)).toEqual([]);
  });
  it('AU-DELÀ du seuil et jamais alerté → retenu, avec son ancienneté', () => {
    const c = cand({ detecteLe: j('2025-01-01T00:00:00Z') }); // > 365 j
    const r = dossiersAAlerter([c], 365, maintenant);
    expect(r).toHaveLength(1);
    expect(r[0].dossierId).toBe(11430);
    expect(r[0].joursAttente).toBeGreaterThanOrEqual(365);
  });
  it('au-delà du seuil MAIS déjà alerté → écarté (un seul rappel par dossier)', () => {
    const c = cand({ detecteLe: j('2025-01-01T00:00:00Z'), dejaAlerte: true });
    expect(dossiersAAlerter([c], 365, maintenant)).toEqual([]);
  });
  it('exactement au seuil (jours == seuil) → retenu (≥, pas >)', () => {
    const c = cand({ detecteLe: j('2025-08-26T00:00:00Z') }); // 365 j pile
    expect(dossiersAAlerter([c], 365, maintenant)).toHaveLength(1);
  });
  it('tri par ancienneté DÉCROISSANTE (le plus vieux d’abord)', () => {
    const vieux = cand({ dossierId: 1, detecteLe: j('2024-01-01T00:00:00Z') });
    const recent = cand({ dossierId: 2, detecteLe: j('2025-01-01T00:00:00Z') });
    const r = dossiersAAlerter([recent, vieux], 365, maintenant);
    expect(r.map((x) => x.dossierId)).toEqual([1, 2]);
  });
});

describe('ATT-BATI (pur) — composerAlerteAttenteBati : un RAPPEL, jamais une détection', () => {
  const d1 = { dossierId: 11430, numDau: 'PC09201234V0001', communeNom: 'Asnières', joursAttente: 400 };
  it('liste vide → null (rien à envoyer)', () => {
    expect(composerAlerteAttenteBati([], 365)).toBeNull();
  });
  it('un dossier → sujet+corps disant franchement RAPPEL, PAS détection, aucune action ; ancienneté indiquée', () => {
    const m = composerAlerteAttenteBati([d1], 365)!;
    expect(m.sujet).toMatch(/[Rr]appel/);
    expect(m.corps).toMatch(/RAPPEL/);
    expect(m.corps).toMatch(/PAS une détection/);
    expect(m.corps).toMatch(/aucune action/);
    expect(m.corps).toContain('PC09201234V0001');
    expect(m.corps).toContain('Asnières');
    expect(m.corps).toMatch(/depuis 400 jours/);
    // vocabulaire « bâtiment », jamais « corps ».
    expect(m.corps).toMatch(/bâtiment/);
    expect(m.corps).not.toMatch(/\bcorps\b/);
  });
  it('plusieurs dossiers → pluriel + une ligne par dossier', () => {
    const d2 = { dossierId: 11434, numDau: 'PC07501111V0002', communeNom: null, joursAttente: 370 };
    const m = composerAlerteAttenteBati([d1, d2], 365)!;
    expect(m.sujet).toMatch(/2 permis/);
    expect(m.corps).toContain('PC09201234V0001');
    expect(m.corps).toContain('PC07501111V0002');
  });
  it('num_dau absent → repli « permis #<id> » (jamais une ligne vide)', () => {
    const m = composerAlerteAttenteBati([{ dossierId: 999, numDau: null, communeNom: null, joursAttente: 500 }], 365)!;
    expect(m.corps).toContain('permis #999');
  });
});
