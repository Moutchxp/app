import { describe, it, expect } from 'vitest';
import { AUCUN_RATTACHEMENT, mailPrecedent, motAvantSansBien, uneMaterialisationParMail } from './lisereSuivi';

/**
 * 🔴🔴 LOT GESTION-FENETRES-SUIVI (Arno, 16/10/2026) — « jamais deux liserés pour le même mail », et l'« Avant » de la bulle.
 * Le cas du fil 36646 : le geste « Interne — la suite » du 16/10/2026 23:45 a écrit une fenêtre `interne` (23:45:21.388)
 * ET des marques « Interne » pour la suite (23:45:21.384), toutes deux au mail 57704.
 */
describe('une seule matérialisation par mail', () => {
  it('🔴 fil 36646 : fenêtre et marques du même geste → un seul liseré, celui de la fenêtre', () => {
    const r = uneMaterialisationParMail(
      [{ id: 23936, depuisMessageId: 57704, le: '2026-10-16T21:45:21.388Z' }],
      [{ depuisMessageId: 57704, le: '2026-10-16T21:45:21Z' }],
    );
    expect(r.fenetres.map((f) => f.id)).toEqual([23936]);
    expect(r.marques).toEqual([]);
  });
  it('une marque posée PLUS TARD, par un autre geste, l’emporte sur la fenêtre du même mail', () => {
    const r = uneMaterialisationParMail(
      [{ id: 1, depuisMessageId: 10, le: '2026-10-16T20:00:00Z' }],
      [{ depuisMessageId: 10, le: '2026-10-16T21:00:00Z' }],
    );
    expect(r.fenetres).toEqual([]);
    expect(r.marques).toHaveLength(1);
  });
  it('deux fenêtres sur le même mail : la plus récente seule', () => {
    const r = uneMaterialisationParMail(
      [{ id: 1, depuisMessageId: 10, le: '2026-10-16T20:00:00Z' }, { id: 2, depuisMessageId: 10, le: '2026-10-16T22:00:00Z' }],
      [],
    );
    expect(r.fenetres.map((f) => f.id)).toEqual([2]);
  });
  it('des mails différents gardent chacun le leur, dans l’ordre d’origine', () => {
    const r = uneMaterialisationParMail(
      [{ id: 1, depuisMessageId: 10, le: '2026-10-16T20:00:00Z' }, { id: 2, depuisMessageId: 11, le: '2026-10-16T19:00:00Z' }],
      [{ depuisMessageId: 12, le: '2026-10-16T18:00:00Z' }],
    );
    expect(r.fenetres.map((f) => f.id)).toEqual([1, 2]);
    expect(r.marques).toHaveLength(1);
  });
  it('rien en entrée, rien en sortie', () => {
    expect(uneMaterialisationParMail([], [])).toEqual({ fenetres: [], marques: [] });
  });
});

describe('« Avant » : le mail précédent et son rattachement effectif', () => {
  it('le mail précédent dans l’ordre chronologique ; aucun pour le premier ou un inconnu', () => {
    expect(mailPrecedent([1, 2, 3], 3)).toBe(2);
    expect(mailPrecedent([1, 2, 3], 1)).toBeNull();
    expect(mailPrecedent([1, 2, 3], 9)).toBeNull();
  });
  it('sans bien : « Interne » avant « Hors gestion », sinon « Aucun rattachement » (À classer)', () => {
    expect(motAvantSansBien({ interne: true, horsGestion: true })).toBe('Interne');
    expect(motAvantSansBien({ interne: false, horsGestion: true })).toBe('Hors gestion');
    expect(motAvantSansBien({ interne: false, horsGestion: false })).toBe(AUCUN_RATTACHEMENT);
    expect(AUCUN_RATTACHEMENT).toBe('Aucun rattachement');
  });
});
