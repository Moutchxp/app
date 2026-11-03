import { describe, expect, it } from 'vitest';
import { droitRattachement, MOT_RATTACHEMENT_AUTRE, MOT_RATTACHEMENT_DEJA, MOT_REMUNERATION_ADMIN } from './suivi';

/** 🔴 D32 (Arno, 03/11/2026, option B) — le droit de rattacher un apporteur, la même règle dans la Location et dans Mon espace. PUR. */
const libre = { compteId: null, collegues: [] };
const rattache = { compteId: null, collegues: [{ depuis: '2026-01-01', collegueId: 7, collegueLibelle: 'Marc' }] };
const brut = (collegueId: number, sorte = 'rattacher') => ({ sorte, collegueId, depuis: '2026-11-03', remuneration: { remunere: true } });

describe('🔴 D32 — droitRattachement', () => {
  it('administrateur : tout, avec la rémunération (comme avant)', () => {
    expect(droitRattachement({ administrateur: true, compteId: 1, apporteur: rattache, brut: brut(9) })).toEqual({ ok: true, sansRemuneration: false });
  });
  it('collaborateur : se rattacher un « à rattacher » — sans rémunération', () => {
    expect(droitRattachement({ administrateur: false, compteId: 5, apporteur: libre, brut: brut(5) })).toEqual({ ok: true, sansRemuneration: true });
  });
  it('collaborateur : jamais un autre collègue, jamais un apporteur déjà rattaché ni interne, jamais la sorte « rémunération »', () => {
    expect(droitRattachement({ administrateur: false, compteId: 5, apporteur: libre, brut: brut(9) })).toEqual({ ok: false, motif: MOT_RATTACHEMENT_AUTRE });
    expect(droitRattachement({ administrateur: false, compteId: 5, apporteur: rattache, brut: brut(5) })).toEqual({ ok: false, motif: MOT_RATTACHEMENT_DEJA });
    expect(droitRattachement({ administrateur: false, compteId: 5, apporteur: { compteId: 12, collegues: [] }, brut: brut(5) })).toEqual({ ok: false, motif: MOT_RATTACHEMENT_DEJA });
    expect(droitRattachement({ administrateur: false, compteId: 5, apporteur: undefined, brut: brut(5) })).toEqual({ ok: false, motif: MOT_RATTACHEMENT_DEJA });
    expect(droitRattachement({ administrateur: false, compteId: 5, apporteur: libre, brut: brut(5, 'remuneration') })).toEqual({ ok: false, motif: MOT_REMUNERATION_ADMIN });
  });
});
