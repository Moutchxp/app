import { describe, it, expect } from 'vitest';
import { disparitionsAAlerter, composerAlerteObstacleDisparu, type CandidatObstacleDisparu } from './alerteObstacleDisparu';

const cand = (over: Partial<CandidatObstacleDisparu> = {}): CandidatObstacleDisparu => ({
  certificatId: 14, numero: 'SAVV-2026-000001', adresse: '8 rue Denfert, Asnières', cleabs: 'BATIMENT0000000240276596',
  present: false, couvert: false, dejaAlerte: false, ...over,
});

describe('ALERTE obstacle disparu (pur) — disparitionsAAlerter : « réellement vidé »', () => {
  it('emprise réellement vidée (absent ET non couvert) et jamais alerté → RETENU', () => {
    const r = disparitionsAAlerter([cand()]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ certificatId: 14, numero: 'SAVV-2026-000001', cleabs: 'BATIMENT0000000240276596' });
  });
  it('RE-NUMÉROTATION (absent mais emplacement TOUJOURS couvert) → écarté (ne trompe pas le verdict)', () => {
    expect(disparitionsAAlerter([cand({ present: false, couvert: true })])).toEqual([]);
  });
  it('bâtiment TOUJOURS présent (present=true) → écarté', () => {
    expect(disparitionsAAlerter([cand({ present: true, couvert: true })])).toEqual([]);
    expect(disparitionsAAlerter([cand({ present: true, couvert: false })])).toEqual([]); // filet : présent → jamais alerté
  });
  it('déjà alerté → écarté (anti-doublon)', () => {
    expect(disparitionsAAlerter([cand({ dejaAlerte: true })])).toEqual([]);
  });
  it('tri stable par numéro de certificat', () => {
    const r = disparitionsAAlerter([cand({ certificatId: 2, numero: 'SAVV-2026-000009' }), cand({ certificatId: 1, numero: 'SAVV-2026-000001' })]);
    expect(r.map((x) => x.numero)).toEqual(['SAVV-2026-000001', 'SAVV-2026-000009']);
  });
});

describe('ALERTE obstacle disparu (pur) — composerAlerteObstacleDisparu : « à revérifier », jamais recertifier', () => {
  const d = { certificatId: 14, numero: 'SAVV-2026-000001', adresse: 'Asnières', cleabs: 'BATIMENT0000000240276596' };
  it('liste vide → null', () => {
    expect(composerAlerteObstacleDisparu([])).toBeNull();
  });
  it('un certificat → dit « à revérifier », PAS une recertification, aucun recalcul ; vocabulaire « bâtiment »', () => {
    const m = composerAlerteObstacleDisparu([d])!;
    expect(m.sujet).toMatch(/revérifier/i);
    expect(m.corps).toMatch(/PAS une recertification/);
    expect(m.corps).toMatch(/aucun certificat n’a été recalculé/);
    expect(m.corps).toContain('SAVV-2026-000001');
    expect(m.corps).toContain('BATIMENT0000000240276596');
    expect(m.corps).toMatch(/bâtiment/);
    expect(m.corps).not.toMatch(/\bcorps\b/);
  });
  it('plusieurs → pluriel + une ligne par certificat', () => {
    const m = composerAlerteObstacleDisparu([d, { ...d, certificatId: 15, numero: 'SAVV-2026-000002' }])!;
    expect(m.sujet).toMatch(/2 certificats/);
    expect(m.corps).toContain('SAVV-2026-000001');
    expect(m.corps).toContain('SAVV-2026-000002');
  });
});
