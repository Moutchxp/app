import { describe, expect, it } from 'vitest';
import { planRepriseMandats, texteRapportMandats, type BienLu, type ProprietaireLu } from './repriseMandatsParBien';

/**
 * 🔴🔴 Arno (18/11/2026, « Mandat par bien », lot 3) — le plan de reprise : « pour chaque propriétaire ayant un n° de mandat, ses biens en gestion qui
 * recevraient ce n°, ceux qui en ont déjà un autre, et les n° déjà partagés entre propriétaires différents (conflits à arbitrer). Rien n'est effacé. »
 */
const vide = { numero: null, signeLe: null };
const P = (id: number, mg: string | null, dg: string | null = null, mt: string | null = null): ProprietaireLu => ({ id, nom: `_TEST MANDAT ${id}`, gestion: { numero: mg, signeLe: dg }, transaction: { numero: mt, signeLe: null } });
const B = (lotId: number, proprietaires: number[], statut = 'en_gestion', o: Partial<BienLu> = {}): BienLu => ({ lotId, adresse: `${lotId} rue _TEST MANDAT`, statut, annexeRattachee: false, proprietaires, gestion: vide, transaction: vide, ...o });

describe('🔴 le plan de reprise', () => {
  it('chaque bien EN GESTION du propriétaire reçoit son n° de gestion et sa date ; une annexe rattachée et un bien d’un autre statut, non', () => {
    const p = planRepriseMandats([P(1, 'MG 7', '2025-01-02')], [B(10, [1]), B(11, [1]), B(12, [1], 'location_seule'), B(13, [1], 'en_gestion', { annexeRattachee: true }), B(14, [1], 'ancienne_gestion')]);
    expect(p.affectations).toEqual([
      { lotId: 10, adresse: '10 rue _TEST MANDAT', sorte: 'gestion', numero: 'MG 7', signeLe: '2025-01-02', depuis: [1] },
      { lotId: 11, adresse: '11 rue _TEST MANDAT', sorte: 'gestion', numero: 'MG 7', signeLe: '2025-01-02', depuis: [1] }]);
  });
  it('le mandat de transaction va aux biens en location seule', () => {
    expect(planRepriseMandats([P(1, null, null, 'MT 3')], [B(10, [1]), B(12, [1], 'location_seule')]).affectations.map((a) => [a.lotId, a.sorte, a.numero])).toEqual([[12, 'transaction', 'MT 3']]);
  });
  it('un bien qui porte déjà ce n° : rien ; un AUTRE n° : gardé, signalé', () => {
    const p = planRepriseMandats([P(1, 'MG 7')], [B(10, [1], 'en_gestion', { gestion: { numero: 'mg-7', signeLe: null } }), B(11, [1], 'en_gestion', { gestion: { numero: 'MG 9', signeLe: null } })]);
    expect(p.affectations).toEqual([]);
    expect(p.deja).toEqual([{ lotId: 10, adresse: '10 rue _TEST MANDAT', sorte: 'gestion', numero: 'MG 7' }]);
    expect(p.autres).toEqual([{ lotId: 11, adresse: '11 rue _TEST MANDAT', sorte: 'gestion', sien: 'MG 9', fiche: 'MG 7' }]);
  });
  it('🔴 des copropriétaires aux n° différents : à arbitrer, rien d’écrit', () => {
    const p = planRepriseMandats([P(1, 'MG 7'), P(2, 'MG 8')], [B(10, [1, 2])]);
    expect(p.affectations).toEqual([]);
    expect(p.plusieurs).toEqual([{ lotId: 10, adresse: '10 rue _TEST MANDAT', sorte: 'gestion', numeros: ['MG 7', 'MG 8'] }]);
  });
  it('🔴 un même n° chez des ensembles de propriétaires différents (même M. Martin seul ≠ M. et Mme Martin) : conflit, rien d’écrit pour ce n°', () => {
    const p = planRepriseMandats([P(1, 'MG 7'), P(2, 'MG 7')], [B(10, [1]), B(11, [1, 2]), B(12, [3], 'en_gestion', { gestion: { numero: 'MG 20', signeLe: null } })]);
    expect(p.affectations).toEqual([]);
    expect(p.conflits).toEqual([{ sorte: 'gestion', numero: 'MG 7', biens: [
      { lotId: 10, adresse: '10 rue _TEST MANDAT', proprietaires: [1] }, { lotId: 11, adresse: '11 rue _TEST MANDAT', proprietaires: [1, 2] }] }]);
  });
  it('le n° déjà porté par un bien d’un autre propriétaire compte aussi (jamais réutilisable)', () => {
    const p = planRepriseMandats([P(1, 'MG 7')], [B(10, [1]), B(20, [9], 'ancienne_gestion', { gestion: { numero: 'MG 7', signeLe: null } })]);
    expect(p.affectations).toEqual([]);
    expect(p.conflits.map((c) => c.biens.map((b) => b.lotId))).toEqual([[20, 10]]);
  });
  it('un n° de fiche qu’aucun bien ne reçoit : il reste sur la fiche (dit) ; le rapport à blanc', () => {
    const p = planRepriseMandats([P(1, 'MG 7')], [B(12, [1], 'location_seule')]);
    expect(p.restentSurLaFiche).toEqual([{ proprietaireId: 1, nom: '_TEST MANDAT 1', sorte: 'gestion', numero: 'MG 7' }]);
    const t = texteRapportMandats(p, 'svav_recette', '18/11/2026', false);
    expect(t).toContain('RAPPORT À BLANC');
    expect(t).toContain('AUCUNE ÉCRITURE');
    expect(t).toContain('N° qui restent sur la fiche (aucun bien de ce statut) : 1');
    expect(t).toContain('Rien n’est effacé.');
  });
});
